import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {assertPricingLossStandards} from '../src/utils/pricingLossValidation.js';
import {createDraftRevision} from '../src/utils/draftRevision.js';
import {buildPricingProductMarginRows, normalizePricingMarginByProduct} from '../src/utils/pricingProductMargins.js';
import {createCommandFocusGuard} from '../src/layout/commandFocus.js';

const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const tree = parse(source, {sourceType: 'module', plugins: ['jsx']});
const shared = fs.readFileSync(new URL('../src/features/customers/productCRMShared.jsx', import.meta.url), 'utf8');
const sharedTree = parse(shared, {sourceType: 'module', plugins: ['jsx']});
const view = tree.program.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'SimplePricingEngineView');
assert.ok(view);
const text = node => source.slice(node.start, node.end);
const variables = new Map(view.body.body.filter(node => node.type === 'VariableDeclaration')
  .flatMap(node => node.declarations.filter(item => item.id.name).map(item => [item.id.name, node])));
const declaration = name => {
  assert.ok(variables.has(name), `Actual pricing declaration ${name}`);
  return text(variables.get(name));
};
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'comments', 'extra'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value?.type) walk(value, visit);
  }
}
function helper(name) {
  for (const [code, ast] of [[source, tree], [shared, sharedTree]]) {
    for (const statement of ast.program.body) {
      const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
      const entry = node?.type === 'VariableDeclaration' && node.declarations.find(item => item.id.name === name);
      if (entry) return `const ${name} = ${code.slice(entry.init.start, entry.init.end)};`;
    }
  }
  assert.fail(`Missing canonical helper ${name}`);
}
const helpers = Function('normalizePricingMarginByProduct', `
  ${[
    'parseLooseQuantityValue', 'parseLooseMoneyValue', 'viNumberFormatter', 'formatCurrency', 'formatPricingVnd', 'LOOKUP_NORMALIZATION_MAX_LENGTH',
    'LOOKUP_NORMALIZATION_CACHE_LIMIT', 'lookupNormalizationCache', 'normalizeLookupText',
    'PRICING_LOSS_GROUP_PRESETS', 'PRICING_CUT_PART_GROUP_PRESETS',
    'createPricingMarginByGroupDefaults', 'createPricingCutPartGroupDefaults',
    'createPricingLossStageGroupDefaults', 'createDefaultPricingRuleDraft',
    'normalizePricingLossStageDrafts', 'normalizePricingLossStageGroups',
    'normalizePricingCutPartDrafts', 'normalizePricingCutPartGroups',
    'normalizePricingProductFormulaChildren', 'normalizePricingProductFormulas',
    'normalizePricingMarginByGroup', 'normalizeTodayInputPriceOverrides', 'normalizePricingRuleDraft',
    'applyPricingInputWeightToLossStages', 'pricingLossStageDraftsToRules', 'pricingCutPartDraftsToRules',
    'PRICING_TODAY_PRICE_COLUMNS',
  ].map(helper).join('\n')}
  return {normalizePricingRuleDraft, normalizePricingLossStageGroups, normalizePricingCutPartGroups,
    normalizeTodayInputPriceOverrides, normalizePricingProductFormulas,
    applyPricingInputWeightToLossStages, pricingLossStageDraftsToRules, pricingCutPartDraftsToRules,
    parseLooseQuantityValue, parseLooseMoneyValue, formatPricingVnd, PRICING_TODAY_PRICE_COLUMNS};
`)(normalizePricingMarginByProduct);

// Compile actual JSX input/button nodes as well as handlers. State writes stay
// queued until render(); Input -> Save -> Blur must work without a render.
const blurInputs = new Map();
const numericInputs = new Map();
let overrideChange;
let saveButton;
walk(view, node => {
  if (node.type !== 'JSXElement') return;
  const opening = node.openingElement;
  const attributes = new Map(opening.attributes.filter(item => item.type === 'JSXAttribute').map(item => [item.name.name, item.value]));
  if (opening.name.name === 'button' && attributes.get('onClick')?.expression?.name === 'handleSavePricingRules'
    && text(node).includes('Lưu định mức hao hụt')) saveButton = text(node);
  if (opening.name.name !== 'input') return;
  const key = attributes.get('key');
  const prefix = key?.expression?.type === 'TemplateLiteral' && key.expression.quasis[0].value.raw;
  if (['loss-input-', 'loss-weight-', 'cut-ratio-', 'cut-loss-', 'cut-factor-'].includes(prefix)) {
    assert.ok(attributes.has('defaultValue'), 'Keep uncontrolled cells');
    assert.equal(attributes.has('value'), false);
    assert.equal(attributes.has('onChange'), false, 'Keep committing these cells on blur');
    assert.ok(attributes.has('onInput'), 'Native input tracks the latest ref without publishing state');
    numericInputs.set(prefix, text(node));
    blurInputs.set(prefix, text(attributes.get('onBlur').expression));
  }
  if (attributes.get('placeholder')?.value === 'Giá mới/kg') overrideChange = text(attributes.get('onChange').expression);
});
assert.equal(blurInputs.size, 5);
assert.ok(overrideChange);
assert.ok(saveButton);
const coreStart = variables.get('pricingDraftRevisionRef').start;
const coreEnd = variables.get('latestWarehouseInputsByGroup').start;
const builderStart = variables.get('pricingSaveContextRef').start;
const builderEnd = variables.get('pricingSnapshot').start;
const handlerNames = [
  'syncPricingDraftFromSavedRules', 'updateCutPartDraft', 'commitCutPartCellDraft',
  'updateLossStageDraft', 'updateLossWeightDraft', 'commitLossCellDraft',
  'updateGroupMarginDraft', 'buildSeedProductMargins', 'updateProductMarginDraft',
  'updateTodayInputPriceOverride', 'setTodayPriceGroupHidden', 'setTodayPriceProductHidden',
  'handleSavePricingRules',
];
const harnessCode = `return function render(savedRules) {
  ${source.slice(coreStart, coreEnd)}
  ${source.slice(builderStart, builderEnd)}
  ${handlerNames.map(declaration).join('\n')}
  return {${handlerNames.join(',')}, setRulesDraft, setActiveLossGroupKey, parsedRules,
    rulesDraftRef, lossStageGroupsDraftRef, cutPartGroupsDraftRef,
    pricingDraftRevisionRef, pricingSaveInFlightRef,
    numericInput: (kind, index) => {
      const row = lossStageGroupsDraft[activeLossGroupKey]?.[index] || {};
      const part = cutPartGroupsDraft[activeLossGroupKey]?.[index] || {};
      const inputWeightValue = row.inputWeight ?? '', lossWeightValue = row.lossWeight ?? '';
      return {${[...numericInputs].map(([kind, jsx]) => `${JSON.stringify(kind)}: (${jsx})`).join(',')}}[kind];
    },
    saveButton: (${saveButton}),
    lossBlur: index => (${blurInputs.get('loss-weight-')}),
    ratioBlur: index => (${blurInputs.get('cut-ratio-')}),
    cutLossBlur: index => (${blurInputs.get('cut-loss-')}),
    factorBlur: index => (${blurInputs.get('cut-factor-')}),
    overrideChange: ${overrideChange}};
};`;
const compiledHarness = transformSync(`function makeHandlers() {${harnessCode}}`, {
  loader: 'jsx', jsx: 'automatic', format: 'cjs',
}).code;

const summaryElements = new Map();
walk(view, node => {
  if (node.type !== 'JSXElement') return;
  const tag = node.openingElement.name.name, jsx = text(node);
  if (tag === 'p' && jsx.includes('summary?.estimatedProfit')) summaryElements.set('profit', jsx);
  if (tag === 'p' && jsx.includes('summary?.totalRevenue')) summaryElements.set('revenue', jsx);
  if (tag === 'span' && jsx.includes('childSummary?.estimatedCost')) summaryElements.set('cost', jsx);
});
assert.equal(summaryElements.size, 3, 'Render the three actual formula labels in SimplePricingEngineView');
const summaryCode = transformSync(`function renderSummary(summary, childSummary, pricingFormulaReady, formulaPendingLabel) {
  return {${[...summaryElements].map(([name, jsx]) => `${name}: (${jsx})`).join(',')}};
}`, {loader: 'jsx', jsx: 'automatic', format: 'cjs'}).code;
const renderSummary = Function('require', 'formatPricingVnd', `${summaryCode};return renderSummary;`)(
  createRequire(import.meta.url), helpers.formatPricingVnd,
);
const presentationText = node => renderToStaticMarkup(node).replace(/<[^>]*>/g, '').trim();

test('actual formula JSX renders missing-cost labels instead of revenue-as-profit while retaining revenue and numeric summaries', () => {
  const summary = Object.freeze({inputCostPerKg: 0, totalRevenue: 290000, estimatedProfit: 290000});
  const child = Object.freeze({estimatedCost: 0});
  const before = structuredClone({summary, child});
  const nodes = renderSummary(summary, child, true, 'Đang tính…');
  assert.equal(presentationText(nodes.profit), 'Chưa có giá vốn');
  assert.equal(presentationText(nodes.cost), 'Vốn ước: Chưa có giá vốn');
  assert.equal(presentationText(nodes.revenue), helpers.formatPricingVnd(290000));
  assert.deepEqual({summary, child}, before, 'Presentation must not change the frozen calculator results');
});

test('actual formula JSX retains numeric costs and profit when input cost exists, including legitimate zero sales and losses', () => {
  for (const [revenue, profit, cost] of [[290000, 50000, 240000], [0, 0, 0], [290000, -10000, 300000]]) {
    const nodes = renderSummary({inputCostPerKg: 40000, totalRevenue: revenue, estimatedProfit: profit}, {estimatedCost: cost}, true, 'Đang tính…');
    assert.equal(presentationText(nodes.profit), helpers.formatPricingVnd(profit));
    assert.equal(presentationText(nodes.cost), `Vốn ước: ${helpers.formatPricingVnd(cost)}`);
    assert.equal(presentationText(nodes.revenue), helpers.formatPricingVnd(revenue));
  }
});

test('actual formula JSX keeps pending and failed-calculation labels ahead of missing-cost presentation', () => {
  for (const label of ['Đang tính…', 'Chưa tính được']) {
    const nodes = renderSummary({inputCostPerKg: 0, totalRevenue: 290000, estimatedProfit: 290000}, {estimatedCost: 0}, false, label);
    assert.equal(presentationText(nodes.profit), label);
    assert.equal(presentationText(nodes.cost), `Vốn ước: ${label}`);
    assert.equal(presentationText(nodes.revenue), label);
  }
});

function fixture({lastLoss = 0.9, save = async () => ({queued: false}), productMargins = true, cutParts,
  latestInputs = {duck: {totalKg: 200, quantity: 200, quantityUnit: 'Con'}}} = {}) {
  const losses = [0, 0.12, 0.22, 0.27, 0.82, 0.94, 0.9, 0.93, lastLoss];
  const normalizedSavedRules = helpers.normalizePricingRuleDraft({
    lossStageGroups: {duck: losses.map((loss, index) => ({
      name: index === 8 ? 'Lông vịt' : `Công đoạn ${index + 1}`, inputWeight: 3, outputWeight: 3 - loss, lossWeight: loss,
    }))},
    cutPartGroups: {duck: cutParts || [{partName: 'Cánh', ratioPercent: 12, lossPercent: 1, valueFactor: 1.18}]},
    marginByProduct: productMargins ? {duckProduct: {targetMargin: 20}} : {},
  });
  const slots = [], pending = new Map(), writes = [], statuses = [], busy = [];
  let cursor = 0;
  const env = {
    ...helpers, createDraftRevision, assertPricingLossStandards,
    buildPricingProductMarginRows, normalizePricingMarginByProduct, normalizedSavedRules,
    EMPTY_PRICING_DRAFT_ROWS: [],
    latestWarehouseInputsByGroup: latestInputs,
    autoLossInputStats: {averageKg: latestInputs.duck ? 1 : 0},
    canManageLossStandards: true, canManageCuttingStandards: true, Save: () => null, isSavingPricing: false,
    pricingGroupRows: [{key: 'duck', label: 'Vịt'}],
    activePricingProducts: [{id: 'duckProduct', name: 'Vịt', groupKey: 'duck'}],
    getPricingProductGroupKey: product => product.groupKey, getPricingProductGroupLabel: () => 'Vịt',
    todayPriceOverrideGroupKey: 'duck',
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => pending.set(index, next)];
    },
    useRef: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = {current: initial};
      return slots[index];
    },
    useCallback: callback => callback, useMemo: callback => callback(),
    pricingActivityReady: true, canEditRules: true,
    canModifyTodayPriceGroups: true, canModifyTodayPriceProducts: true,
    setIsSavingPricing: value => busy.push(value), setStatusText: value => statuses.push(value),
    getFriendlyFirebaseErrorMessage: error => error.message,
    onSavePricingRules: async payload => {writes.push(structuredClone(payload)); return save(payload);},
  };
  const renderHandlers = Function('require', ...Object.keys(env), `${compiledHarness};return makeHandlers();`)(createRequire(import.meta.url), ...Object.values(env));
  const f = {writes, statuses, busy, get queuedStateUpdates() {return pending.size;}, render(savedRules = normalizedSavedRules) {
    for (const [index, next] of pending) slots[index] = typeof next === 'function' ? next(slots[index]) : next;
    pending.clear(); cursor = 0;
    f.view = renderHandlers(savedRules);
    return f.view;
  }};
  f.render();
  return f;
}
const blur = (handler, value) => handler({target: {value}});
const last = list => list[list.length - 1];

test('actual document focus guard keeps the final cell focused until after React Save: persist the current six-row factor', async () => {
  const f = fixture({cutParts: helpers.normalizePricingCutPartGroups().duck});
  const inputNode = f.view.numericInput('cut-factor-', 5);
  const document = {activeElement: null};
  const input = {tagName: 'INPUT', value: '0.97', blur() {
    document.activeElement = null;
    inputNode.props.onBlur({target: input});
  }};
  document.activeElement = input;
  inputNode.props.onInput({target: input});
  assert.equal(f.queuedStateUpdates, 0, 'Typing does not publish state or trigger previews');
  const scope = {ownerDocument: document, contains: node => node === input};
  const button = {disabled: false, closest: () => scope, hasAttribute: () => false};
  const event = {button: 0, target: {closest: () => button}, preventDefault() {this.prevented = true;}};
  const guard = createCommandFocusGuard(document);
  guard.pointerdown(event);
  assert.equal(event.prevented, true, 'The real global guard prevents native pointerdown blur');
  assert.equal(document.activeElement, input);
  assert.equal(f.view.parsedRules.cutParts[5].partName, 'Lòng mề vịt');
  assert.equal(f.view.parsedRules.cutParts[5].valueFactor, 0.9);
  const saving = f.view.saveButton.props.onClick();
  assert.equal(document.activeElement, input, 'Save reads refs without forcing blur');
  guard.click(event); // Actual document bubbling occurs after the React handler.
  await saving;
  assert.equal(f.writes[0].cutPartGroups.duck[5].valueFactor, 0.97);
  assert.equal(f.writes[0].cutParts[5].valueFactor, 0.97);
  assert.equal(f.view.pricingDraftRevisionRef.current.isDirty(), false, 'Unchanged late blur must not create a phantom edit');
});

test('all five actual numeric input nodes save the latest native input before blur without scheduling a preview render', async () => {
  const f = fixture({latestInputs: {}, cutParts: helpers.normalizePricingCutPartGroups().duck});
  const rows = f.view.lossStageGroupsDraftRef.current, parts = f.view.cutPartGroupsDraftRef.current;
  const initialRevision = f.view.pricingDraftRevisionRef.current.capture();
  const edits = [
    ['loss-input-', 8, '4'], ['loss-weight-', 8, '0,95'],
    ['cut-ratio-', 5, '8,5'], ['cut-loss-', 5, '2,5'], ['cut-factor-', 5, '1,01'],
  ];
  for (const [kind, index, value] of edits) f.view.numericInput(kind, index).props.onInput({target: {value}});
  assert.equal(f.queuedStateUpdates, 0);
  assert.equal(f.view.pricingDraftRevisionRef.current.capture(), initialRevision + edits.length);
  assert.equal(rows.duck[8].inputWeight, 3, 'Source draft objects remain immutable');
  assert.equal(parts.duck[5].valueFactor, 0.9);
  f.render().syncPricingDraftFromSavedRules();
  assert.equal(f.view.cutPartGroupsDraftRef.current.duck[5].valueFactor, '1,01', 'Unblurred input survives an old saved snapshot');
  await f.view.saveButton.props.onClick();
  assert.equal(f.writes[0].lossStages[8].inputWeight, 4);
  assert.equal(f.writes[0].lossStages[8].lossWeight, 0.95);
  assert.equal(f.writes[0].lossStages[8].outputWeight, 3.05);
  assert.deepEqual(f.writes[0].cutParts[5], {partName: 'Lòng mề vịt', ratioPercent: 8.5, lossPercent: 2.5, valueFactor: 1.01});
  const submittedRevision = f.view.pricingDraftRevisionRef.current.capture();
  for (const [kind, index, value] of edits) f.view.numericInput(kind, index).props.onBlur({target: {value}});
  assert.equal(f.view.pricingDraftRevisionRef.current.capture(), submittedRevision, 'Late blur publishes state without inventing another edit');
  assert.ok(f.queuedStateUpdates > 0, 'Blur still owns the state/preview commit');
});

test('auto input plus raw loss onInput uses current kg, and invalid newest input is rejected before blur', async () => {
  for (const loss of ['0,95', '2', '-0,1', 'Infinity']) {
    const f = fixture();
    f.view.numericInput('loss-weight-', 8).props.onInput({target: {value: loss}});
    assert.equal(f.queuedStateUpdates, 0);
    assert.equal(f.view.lossStageGroupsDraftRef.current.duck[8].lossWeight, loss);
    await f.view.saveButton.props.onClick();
    if (loss === '0,95') {
      assert.equal(f.writes[0].lossStages[8].inputWeight, 1);
      assert.equal(f.writes[0].lossStages[8].outputWeight, 0.05);
    } else {
      assert.equal(f.writes.length, 0);
      assert.match(last(f.statuses), /Lông vịt/);
      assert.equal(f.view.pricingDraftRevisionRef.current.isDirty(), true);
    }
  }
  const automatic = fixture();
  automatic.view.numericInput('loss-input-', 8).props.onInput({target: {value: '5'}});
  assert.equal(automatic.view.pricingDraftRevisionRef.current.isDirty(), false, 'Derived read-only input cannot be changed');
});

test('all quick-save paths preserve unblurred last-cell native input', async () => {
  for (const handler of ['handleSavePricingRules', 'setTodayPriceGroupHidden', 'setTodayPriceProductHidden']) {
    const f = fixture({cutParts: helpers.normalizePricingCutPartGroups().duck});
    f.view.numericInput('cut-factor-', 5).props.onInput({target: {value: '0.99'}});
    f.view.numericInput('loss-weight-', 8).props.onInput({target: {value: '0.95'}});
    await f.view[handler]('duck', true);
    assert.equal(f.writes[0].cutPartGroups.duck[5].valueFactor, 0.99);
    assert.equal(f.writes[0].lossStageGroups.duck[8].lossWeight, 0.95);
  }
});

test('manual Gà input before blur recalculates the saved output from its existing loss with three-decimal rounding', async () => {
  for (const [value, expected] of [['2.5', 2.25], ['2,5004', 2.25], ['2,5006', 2.251]]) {
    const f = fixture({latestInputs: {}});
    f.view.setActiveLossGroupKey('chicken');
    f.render();
    assert.equal(f.view.lossStageGroupsDraftRef.current.chicken[1].inputWeight, 2);
    assert.equal(f.view.lossStageGroupsDraftRef.current.chicken[1].lossWeight, 0.25);
    const node = f.view.numericInput('loss-input-', 1);
    node.props.onInput({target: {value}});
    assert.equal(f.queuedStateUpdates, 0);
    assert.equal(f.view.lossStageGroupsDraftRef.current.chicken[1].outputWeight, expected);
    await f.view.saveButton.props.onClick();
    assert.equal(f.writes[0].lossStages[1].inputWeight, helpers.parseLooseQuantityValue(value));
    assert.equal(f.writes[0].lossStages[1].outputWeight, expected);
    assert.equal(f.writes[0].lossStageGroups.chicken[1].outputWeight, expected);
    const revision = f.view.pricingDraftRevisionRef.current.capture();
    node.props.onBlur({target: {value}});
    assert.equal(f.view.pricingDraftRevisionRef.current.capture(), revision);
    assert.equal(f.view.lossStageGroupsDraftRef.current.chicken[1].outputWeight, expected);
  }
});

test('actual last loss blur then immediate Save persists .96 rather than stale 2.88', async () => {
  const f = fixture({lastLoss: 2.88});
  const staleView = f.view;
  blur(staleView.lossBlur(8), '0,96');
  assert.equal(staleView.parsedRules.lossStages[8].lossWeight, 2.88, 'No intervening render');
  await staleView.handleSavePricingRules();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].lossStages[8].lossWeight, 0.96);
  assert.equal(f.writes[0].lossStageGroups.duck[8].lossWeight, 0.96);
  assert.equal(f.writes[0].lossStages[8].inputWeight, 1);
  assert.equal(f.writes[0].lossStages[8].outputWeight, 0.04);
  assert.equal(staleView.pricingDraftRevisionRef.current.isDirty(), false);
  assert.deepEqual(f.busy, [true, false]);
});

test('actual cut-part blurs and rules edits merge synchronously before immediate Save', async () => {
  const f = fixture();
  blur(f.view.ratioBlur(0), '17,5');
  blur(f.view.cutLossBlur(0), '2,5');
  blur(f.view.factorBlur(0), '1,4');
  f.view.updateGroupMarginDraft('duck', 'targetMargin', '27,5');
  f.view.updateProductMarginDraft('duckProduct', 'targetMargin', '29,5');
  f.view.setRulesDraft(prev => ({...prev, productFormulas: [{id: 'formula', rootProductId: 'root', children: [{productId: 'root'}]}]}));
  await f.view.handleSavePricingRules();
  const [saved] = f.writes;
  const expected = {partName: 'Cánh', ratioPercent: 17.5, lossPercent: 2.5, valueFactor: 1.4};
  assert.deepEqual(saved.cutParts[0], expected);
  assert.deepEqual(saved.cutPartGroups.duck[0], expected);
  assert.equal(saved.marginByGroup.duck.targetMargin, 27.5);
  assert.equal(saved.marginByProduct.duckProduct.targetMargin, 29.5);
  assert.equal(saved.productFormulas[0].children[0].productId, 'root', 'Do not invent a root/child restriction');
});

test('fresh group margins also seed product margins without reading old rendered rows', async () => {
  const f = fixture({productMargins: false});
  f.view.updateGroupMarginDraft('duck', 'targetMargin', '27,5');
  f.view.updateGroupMarginDraft('duck', 'minMargin', '11');
  await f.view.handleSavePricingRules();
  assert.equal(f.writes[0].marginByProduct.duckProduct.targetMargin, 27.5);
  assert.equal(f.writes[0].marginByProduct.duckProduct.minMargin, 11);
});

test('newest invalid loss is rejected before write and retained through saved-snapshot synchronization', async () => {
  for (const value of ['2', '-0,1', 'Infinity', 'not a number']) {
    const f = fixture();
    blur(f.view.lossBlur(0), value);
    await f.view.handleSavePricingRules();
    assert.equal(f.writes.length, 0, value);
    assert.match(last(f.statuses), /Công đoạn 1/, 'Error identifies the newly edited row');
    assert.equal(f.view.pricingSaveInFlightRef.current, false);
    assert.equal(f.view.pricingDraftRevisionRef.current.isDirty(), true);
    f.render().syncPricingDraftFromSavedRules();
    assert.equal(f.view.lossStageGroupsDraftRef.current.duck[0].lossWeight, value);
  }
});

test('group and product quick saves use fresh loss, cut-part and rules refs', async () => {
  for (const handler of ['setTodayPriceGroupHidden', 'setTodayPriceProductHidden']) {
    const f = fixture();
    blur(f.view.lossBlur(8), '0.96');
    blur(f.view.factorBlur(0), '1.6');
    f.view.overrideChange({target: {value: '49000'}});
    await f.view[handler]('duck', true);
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].lossStages[8].lossWeight, 0.96);
    assert.equal(f.writes[0].cutParts[0].valueFactor, 1.6);
    assert.equal(f.writes[0].todayInputPriceOverrides.duck.pricePerKg, 49000);
    const field = handler === 'setTodayPriceGroupHidden' ? 'hiddenTodayPriceGroupKeys' : 'hiddenTodayPriceProductKeys';
    assert.deepEqual(f.writes[0][field], ['duck']);
    assert.equal(f.view.pricingDraftRevisionRef.current.isDirty(), false);
  }
});

test('manual today-price Save uses the same fresh snapshot after a loss blur', async () => {
  const f = fixture();
  blur(f.view.lossBlur(8), '0.96');
  f.view.overrideChange({target: {value: '51000'}});
  await f.view.handleSavePricingRules();
  assert.equal(f.writes[0].lossStages[8].lossWeight, 0.96);
  assert.equal(f.writes[0].todayInputPriceOverrides.duck.pricePerKg, 51000);
});

test('every quick-save catches validation and network failure, preserves drafts and permits retry', async () => {
  for (const handler of ['handleSavePricingRules', 'setTodayPriceGroupHidden', 'setTodayPriceProductHidden']) {
    let fail = true;
    const f = fixture({save: async () => {if (fail) throw new Error('offline');}});
    blur(f.view.lossBlur(8), '2');
    await assert.doesNotReject(f.view[handler]('duck', true));
    assert.equal(f.writes.length, 0);
    assert.match(last(f.statuses), /Lông vịt/);
    blur(f.view.lossBlur(8), '0.96');
    await f.view[handler]('duck', true);
    assert.match(last(f.statuses), /offline/);
    assert.equal(f.view.pricingDraftRevisionRef.current.isDirty(), true);
    assert.equal(f.view.pricingSaveInFlightRef.current, false);
    f.render().syncPricingDraftFromSavedRules();
    assert.equal(f.view.lossStageGroupsDraftRef.current.duck[8].lossWeight, '0.96');
    fail = false;
    await f.view[handler]('duck', true);
    assert.equal(f.writes.length, 2);
    assert.equal(f.writes[1].lossStages[8].lossWeight, 0.96);
    assert.equal(f.view.pricingDraftRevisionRef.current.isDirty(), false);
  }
});

test('all save entry points share a synchronous guard and preserve edits made during an awaited save', async () => {
  for (const first of ['handleSavePricingRules', 'setTodayPriceGroupHidden', 'setTodayPriceProductHidden']) {
    let finish;
    const f = fixture({save: () => new Promise(resolve => {finish = resolve;})});
    blur(f.view.lossBlur(8), '0.96');
    const saving = f.view[first]('duck', true);
    assert.equal(f.writes.length, 1);
    blur(f.view.factorBlur(0), '1.7');
    for (const duplicate of ['handleSavePricingRules', 'setTodayPriceGroupHidden', 'setTodayPriceProductHidden']) {
      await f.view[duplicate]('duck', true);
    }
    assert.equal(f.writes.length, 1, 'No overlapping whole-config writes');
    finish({queued: false}); await saving;
    assert.equal(f.view.pricingDraftRevisionRef.current.isDirty(), true);
    f.render(f.writes[0]).syncPricingDraftFromSavedRules();
    assert.equal(f.view.cutPartGroupsDraftRef.current.duck[0].valueFactor, '1.7');
    assert.equal(f.view.pricingSaveInFlightRef.current, false);
  }
});
