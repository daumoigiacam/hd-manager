import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';

const source = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const declarations = new Map();
const scopedDeclarations = new Map();
function walk(node, owner = '') {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration') owner = node.id?.name || owner;
  if (node.type === 'VariableDeclarator' && node.id?.name && node.init) {
    if (!declarations.has(node.id.name)) declarations.set(node.id.name, node.init);
    scopedDeclarations.set(`${owner}.${node.id.name}`, node.init);
  }
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, owner));
    else if (value?.type) walk(value, owner);
  }
}
walk(tree);

// Execute only the requested pure/helper function, never App or a Firebase client.
export function appFunction(name, bindings = {}, { memoCallback = false, scope = '' } = {}) {
  let node = scope ? scopedDeclarations.get(`${scope}.${name}`) : declarations.get(name);
  if (memoCallback) node = node?.arguments?.[0];
  if (!node) throw new Error(`Missing source function: ${name}`);
  const cacheNames = name === 'normalizeLookupText'
    ? ['LOOKUP_NORMALIZATION_CACHE_LIMIT', 'LOOKUP_NORMALIZATION_MAX_LENGTH', 'lookupNormalizationCache']
    : name === 'parseEntityTimestampValue'
      ? ['ENTITY_TIMESTAMP_CACHE_LIMIT', 'ENTITY_TIMESTAMP_CACHE_MAX_LENGTH', 'entityTimestampStringCache'] : [];
  const cacheBindings = {};
  if (name === 'buildWarehouseDispatchShortageSummary' && !Object.hasOwn(bindings, 'warehouseShortageKeyCache')) {
    cacheBindings.warehouseShortageKeyCache = new WeakMap();
  }
  for (const dependency of cacheNames) {
    if (Object.hasOwn(bindings, dependency)) continue;
    const initializer = declarations.get(dependency);
    if (initializer?.type === 'NumericLiteral') cacheBindings[dependency] = initializer.value;
    else if (initializer?.type === 'NewExpression' && initializer.callee.name === 'Map' && initializer.arguments.length === 0) {
      cacheBindings[dependency] = new Map();
    } else throw new Error(`Unexpected primitive cache binding: ${dependency}`);
  }
  const environment = { ...cacheBindings, ...bindings };
  return new Function(...Object.keys(environment), `return (${source.slice(node.start, node.end)});`)(...Object.values(environment));
}

export function appObject(name) {
  const node = declarations.get(name);
  if (!node) throw new Error(`Missing source object: ${name}`);
  return node;
}
