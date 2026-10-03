import { measureQuantity } from './productMeasures.js';
import { PRODUCT_PRICING_UNIT_OPTIONS } from '../services/productPricingUnits.js';

const isPrimitive = value => value === null || !['object', 'function', 'symbol'].includes(typeof value);
const encode = value => {
  if (value === undefined) return 'u;';
  if (value === null) return 'l;';
  if (typeof value === 'string') return `s${value.length}:${value}`;
  if (typeof value === 'number') return `n${Object.is(value, -0) ? '-0' : String(value)};`;
  if (typeof value === 'boolean') return value ? 'b1;' : 'b0;';
  return `i${value};`;
};

// Length-prefixed primitive fields form an exact key, not a lossy JSON/hash key.
// Metadata, record IDs, dates, and archives do not affect an item's measurement.
function captureStockFields(record) {
  const parts = [];
  const itemsById = new Map();
  let cacheable = true;
  const append = value => {
    if (isPrimitive(value)) parts.push(encode(value));
    else cacheable = false;
  };
  const captureMeasures = source => {
    let measures;
    try { measures = [...(source || [])]; } catch { cacheable = false; return []; }
    parts.push(`m${measures.length}:`);
    return measures.map(measure => {
      if (measure == null) { cacheable = false; return measure; }
      append(measure.unit);
      append(measure.quantity);
      return { unit: measure.unit, quantity: measure.quantity };
    });
  };
  (record.items || [record]).forEach(item => {
    const id = item.productId;
    if (Number.isNaN(id)) return;
    parts.push('item:');
    append(id);
    const weight = item.totalKg ?? item.weightKg ?? item.kg ?? item.actualWeightKg ?? item.weight;
    const quantity = item.quantity ?? item.totalQuantity ?? item.qty ?? item.pieceCount ?? item.quantityCount;
    const unit = item.quantityUnit || item.unit || 'Con';
    append(weight);
    append(quantity);
    append(unit);
    const measuredItem = { productId: id, totalKg: weight, quantity, quantityUnit: unit,
      measures: captureMeasures(item.measures), extraMeasures: captureMeasures(item.extraMeasures) };
    let items = itemsById.get(id);
    if (!items) { items = []; itemsById.set(id, items); }
    items.push({ original: item, snapshot: measuredItem });
  });
  if (cacheable) itemsById.forEach(items => items.forEach(item => { item.original = null; }));
  return { key: cacheable ? parts.join('') : null, itemsById, totalsById: new Map() };
}

/**
 * One calculator per consumer/tenant lifetime. Each build snapshots plain stock
 * fields, so cloned wrappers and in-place edits are detected without normalization.
 * Nonprimitive/coercible stock values and IDs bypass caching. Inputs must be stored
 * data, without getters/proxies or side-effectful coercion. Unchanged immutable
 * inputs are supported too; no record-identity preservation is required.
 * Rebuilds return fresh balances; only internal measurement numbers are cached.
 * Excluded records retain prior measurements only while present in the inputs;
 * removals and unused catalog units discard those entries on the next build.
 * Unit-choice array edits invalidate the cache. Call clear() on tenant replacement
 * or other external measurement-rule changes. The pure index remains unchanged.
 * immutableRecords (default false) skips recapturing retained record identities.
 * Opt in only when published movement arrays, records (including date/archive),
 * and nested stock graphs stay immutable. Replace the array on insert/remove/
 * reorder and replace the record plus array on any edit, or clear() first.
 * Identical movement arrays/cutoff and catalog ID/unit sets reuse ordered totals;
 * fresh balances still read current opening stock. Product objects/arrays need
 * not be immutable. Nonprimitive/coercible stock fields bypass both shortcuts.
 */
export function createIncrementalProductStockIndex({
  measureQuantity: measure = measureQuantity,
  immutableRecords = false,
} = {}) {
  if (typeof measure !== 'function') throw new TypeError('Stock measurement must be a function.');

  let recordCache = new Map();
  let previousTotals = new Map();
  let recordCaptures = new WeakMap();
  let previousInputs = null;
  let unitChoices = Array.from(PRODUCT_PRICING_UNIT_OPTIONS);

  const orderedTotal = (contributions, previous) => {
    if (previous && previous.contributions.length === contributions.length
      && contributions.every((entry, index) => entry.record === previous.contributions[index].record
        && Object.is(entry.value, previous.contributions[index].value))) return previous;
    // Preserve item subtotals, then record order. Subtraction deltas can change
    // floating point results even when only one record has been replaced.
    return { contributions, total: contributions.reduce((sum, entry) => sum + entry.value, 0) };
  };

  const buildBalances = (products, totalsById) => {
    const index = new Map();
    products.forEach(product => {
      const unit = product.stockUnit || product.inventoryUnit || product.unit;
      const totals = Number.isNaN(product.id) ? null : totalsById.get(product.id)?.get(unit);
      const incoming = totals?.incoming.total ?? 0;
      const outgoing = totals?.outgoing.total ?? 0;
      const opening = Number(product.stockQuantity ?? product.openingStock ?? product.inventoryQuantity ?? product.stock) || 0;
      index.set(product, { incoming, outgoing, remaining: opening + incoming - outgoing });
    });
    return index;
  };

  function build(products = [], imports = [], dispatches = [], untilDate = '') {
    const choices = Array.from(PRODUCT_PRICING_UNIT_OPTIONS);
    if (unitChoices.length !== choices.length || !unitChoices.every((unit, i) => Object.is(unit, choices[i]))) clear();
    const allowCache = choices.every(isPrimitive);
    const nextRecordCache = new Map();
    const nextRecordCaptures = new WeakMap();
    const byId = new Map();
    let reusableInputs = immutableRecords === true && allowCache && isPrimitive(untilDate)
      && Array.isArray(imports) && Array.isArray(dispatches);
    products.forEach(product => {
      const unit = product.stockUnit || product.inventoryUnit || product.unit;
      if (!isPrimitive(product.id) || !isPrimitive(unit)) reusableInputs = false;
      if (Number.isNaN(product.id)) return;
      let units = byId.get(product.id);
      if (!units) {
        units = new Map();
        byId.set(product.id, units);
      }
      if (!units.has(unit)) units.set(unit, { incoming: [], outgoing: [] });
    });

    if (reusableInputs && previousInputs?.imports === imports && previousInputs.dispatches === dispatches
      && Object.is(previousInputs.untilDate, untilDate) && byId.size === previousTotals.size
      && Array.from(byId).every(([id, units]) => {
        const previous = previousTotals.get(id);
        return previous?.size === units.size && Array.from(units.keys()).every(unit => previous.has(unit));
      })) return buildBalances(products, previousTotals);

    const collect = (records, field) => records.forEach(record => {
      if (!isPrimitive(record.date) || !isPrimitive(record.isArchived)) reusableInputs = false;
      const eligible = !record.isArchived && (!untilDate || `${record.date || ''}` <= untilDate);
      let captured;
      // Excluded malformed records must stay ignored, just as in the pure path.
      try { captured = (immutableRecords === true && recordCaptures.get(record)) || captureStockFields(record); } catch (error) {
        reusableInputs = false;
        if (eligible) throw error;
        return;
      }
      const key = allowCache ? captured.key : null;
      if (key === null) reusableInputs = false;
      if (immutableRecords === true && key !== null && record && typeof record === 'object') {
        nextRecordCaptures.set(record, captured);
      }
      const cached = key === null ? null : nextRecordCache.get(key) || recordCache.get(key);
      if (!eligible && !cached) return;
      const entry = cached || captured;
      if (key !== null) nextRecordCache.set(key, entry);
      entry.itemsById.forEach((items, id) => {
        const units = byId.get(id);
        if (!units) {
          entry.totalsById.delete(id);
          return;
        }
        let totals = entry.totalsById.get(id);
        if (!totals) {
          totals = new Map();
          entry.totalsById.set(id, totals);
        }
        // Retain only current catalog units, not every unit seen historically.
        totals.forEach((_, unit) => { if (!units.has(unit)) totals.delete(unit); });
        if (!eligible) return;
        units.forEach((contributions, unit) => {
          const cacheUnit = key !== null && isPrimitive(unit);
          if (!cacheUnit || !totals.has(unit)) {
            totals.set(unit, items.reduce((sum, item) => sum + measure(captured.key === null ? item.original : item.snapshot, unit), 0));
          }
          contributions[field].push({ record: key === null ? null : entry, value: totals.get(unit) });
        });
      });
    });
    collect(imports, 'incoming');
    collect(dispatches, 'outgoing');

    const nextTotals = new Map();
    byId.forEach((units, id) => {
      const totals = new Map();
      units.forEach((contributions, unit) => {
        const previous = previousTotals.get(id)?.get(unit);
        totals.set(unit, {
          incoming: orderedTotal(contributions.incoming, previous?.incoming),
          outgoing: orderedTotal(contributions.outgoing, previous?.outgoing),
        });
      });
      nextTotals.set(id, totals);
    });

    const index = buildBalances(products, nextTotals);
    recordCache = nextRecordCache;
    previousTotals = nextTotals;
    recordCaptures = nextRecordCaptures;
    previousInputs = reusableInputs ? { imports, dispatches, untilDate } : null;
    unitChoices = choices;
    return index;
  }

  function clear() {
    recordCache = new Map();
    previousTotals = new Map();
    recordCaptures = new WeakMap();
    previousInputs = null;
    unitChoices = Array.from(PRODUCT_PRICING_UNIT_OPTIONS);
  }

  return { build, clear };
}
