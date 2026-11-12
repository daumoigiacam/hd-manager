const normalizeScanText = (value = '') => `${value || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const buildScanKeys = (value = '') => {
  const normalized = normalizeScanText(value);
  if (!normalized) return [];
  return [normalized, normalized.replace(/\s+/g, '')];
};

const addCandidate = (candidates, value = '') => {
  const text = `${value || ''}`.trim();
  if (!text || candidates.some(candidate => candidate === text)) return;
  candidates.push(text);
};

const addJsonPayloadCandidates = (candidates, value = '') => {
  const text = `${value || ''}`.trim();
  if (!text.startsWith('{') && !text.startsWith('[')) return;
  try {
    const parsed = JSON.parse(text);
    const visit = (node, depth = 0) => {
      if (!node || depth > 2) return;
      if (typeof node === 'string' || typeof node === 'number') {
        addCandidate(candidates, node);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(item => visit(item, depth + 1));
        return;
      }
      ['code', 'sku', 'barcode', 'productCode', 'productBarcode', 'id'].forEach(key => {
        if (node[key] !== undefined && node[key] !== null) addCandidate(candidates, node[key]);
      });
    };
    visit(parsed);
  } catch {
    // A barcode payload can look like JSON without being valid JSON; keep raw matching.
  }
};

export const extractWarehouseProductScanCandidates = (rawValue = '') => {
  const raw = `${rawValue || ''}`.trim();
  if (!raw) return [];
  const candidates = [];
  addCandidate(candidates, raw);
  addJsonPayloadCandidates(candidates, raw);

  raw.split(/[\r\n|;]+/).forEach(value => addCandidate(candidates, value));
  try {
    const url = new URL(raw);
    addCandidate(candidates, decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || ''));
    url.searchParams.forEach((value, key) => {
      if (['code', 'sku', 'barcode', 'productcode', 'productbarcode', 'id'].includes(normalizeScanText(key).replace(/\s+/g, ''))) {
        addCandidate(candidates, value);
      }
    });
  } catch {
    // Raw product codes are not URLs; no additional URL candidates are needed.
  }
  return candidates;
};

export const getWarehouseProductScanCandidates = (product = {}) => [
  product?.barcode,
  product?.sku,
  product?.code,
  product?.productCode,
  product?.productBarcode,
  product?.productSku,
  product?.productShortName,
  product?.shortName,
  product?.abbreviation,
  product?.alias,
  product?.id
].map(value => `${value || ''}`.trim()).filter(Boolean);

export const buildWarehouseProductScanLookup = (products = []) => {
  const lookup = new Map();
  (Array.isArray(products) ? products : [])
    .filter(product => product && !product.isArchived)
    .forEach(product => {
      getWarehouseProductScanCandidates(product).forEach(candidate => {
        buildScanKeys(candidate).forEach(key => {
          if (!lookup.has(key)) lookup.set(key, product);
        });
      });
    });
  return lookup;
};

export const resolveWarehouseProductScan = (lookup = new Map(), rawValue = '') => {
  const candidates = extractWarehouseProductScanCandidates(rawValue);
  for (const candidate of candidates) {
    for (const key of buildScanKeys(candidate)) {
      const product = lookup.get(key);
      if (product) return { product, code: candidate, candidates };
    }
  }
  return { product: null, code: candidates[0] || '', candidates };
};

export const getWarehouseScanResultText = (result = null) => {
  if (!result) return '';
  if (typeof result.getText === 'function') return `${result.getText() || ''}`.trim();
  return `${result.rawValue || result.text || result || ''}`.trim();
};
