import { readApplicationSource, readApplicationSourceRoot } from '../../scripts/helpers/application-source.cjs';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import { createWarehouseDispatch, updateWarehouseDispatch, deleteWarehouseDispatch } from '../../src/features/warehouse/warehouseDispatchUseCases.js';
import {createSourcePhaseDiagnostics} from '../../src/services/sourcePhaseDiagnostics.js';
import {buildCommissionCalculation,assertCommissionCalculationReady} from '../../development/hd-manager/application/src/utils/commissionRevenue.js';

const source = readApplicationSource();
export const applicationSource = source;
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
const importedSources = new Map();
function importedDeclaration(name) {
  const declaration = tree.program.body.find(node => node.type === 'ImportDeclaration'
    && node.source.value.startsWith('.') && node.specifiers.some(spec => spec.local.name === name));
  if (!declaration) {
    // A dependency may live in the same actual CRM module as an imported
    // function, without itself being imported directly by App.
    if(name!=='normalizeLookupText'&&![...importedSources.values()].some(module=>module.entries.has(name)))importedDeclaration('normalizeLookupText');
    if (/^(?:LOOKUP_NORMALIZATION_|lookupNormalizationCache)/.test(name) && ![...importedSources.values()].some(module=>module.entries.has(name))) importedDeclaration('normalizeLookupText');
    if (/^(?:parseVietnameseDateTimeString|ENTITY_TIMESTAMP_|entityTimestampStringCache)/.test(name)
      && ![...importedSources.values()].some(module=>module.entries.has(name))) importedDeclaration('parseEntityTimestampValue');
    const matches = [...importedSources.values()].filter(module => module.entries.has(name));
    if (matches.length === 1) return {node:matches[0].entries.get(name),source:matches[0].text,declarations:matches[0].entries};
    if (matches.length > 1) throw new Error(`Ambiguous source dependency: ${name}`);
    return null;
  }
  const specifier = declaration.specifiers.find(spec => spec.local.name === name);
  if (specifier.type !== 'ImportSpecifier') return null;
  const file = path.resolve(readApplicationSourceRoot(), 'src', declaration.source.value);
  if (!importedSources.has(file)) {
    const text = fs.readFileSync(file, 'utf8'), entries = new Map();
    const moduleTree = parse(text, {sourceType:'module',plugins:['jsx']});
    for (const row of moduleTree.program.body) {
      const node = row.type === 'ExportNamedDeclaration' ? row.declaration : row;
      if (node?.type === 'VariableDeclaration') for (const item of node.declarations) if (item.id.name) entries.set(item.id.name, item.init);
      if (node?.type === 'FunctionDeclaration') entries.set(node.id.name, node);
    }
    importedSources.set(file, {text, entries});
  }
  const module = importedSources.get(file), node = module.entries.get(specifier.imported.name);
  return node ? {node, source:module.text, declarations:module.entries} : null;
}

// Execute only the requested pure/helper function, never App or a Firebase client.
export function appFunction(name, bindings = {}, { memoCallback = false, scope = '' } = {}) {
  if (scope === 'App' && tree.program.body.some(node=>node.type==='FunctionDeclaration'&&node.id?.name==='ApplicationView')) scope='ApplicationView';
  let node = scope ? scopedDeclarations.get(`${scope}.${name}`) : declarations.get(name);
  const imported = !node && !scope ? importedDeclaration(name) : null;
  if (imported) node = imported.node;
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
    const initializer = (imported?.declarations || declarations).get(dependency);
    if (initializer?.type === 'NumericLiteral') cacheBindings[dependency] = initializer.value;
    else if (initializer?.type === 'NewExpression' && initializer.callee.name === 'Map' && initializer.arguments.length === 0) {
      cacheBindings[dependency] = new Map();
    } else throw new Error(`Unexpected primitive cache binding: ${dependency}`);
  }
  const environment = { createWarehouseDispatch, updateWarehouseDispatch, deleteWarehouseDispatch,
    buildCommissionCalculation, assertCommissionCalculationReady,
    sourcePhaseDiagnostics:createSourcePhaseDiagnostics(),yieldPublicationWork:()=>new Promise(resolve=>setTimeout(resolve,0)),
    ...cacheBindings, ...bindings };
  return new Function(...Object.keys(environment), `return (${(imported?.source || source).slice(node.start, node.end)});`)(...Object.values(environment));
}

export function appObject(name) {
  const node = declarations.get(name) || importedDeclaration(name)?.node;
  if (!node) throw new Error(`Missing source object: ${name}`);
  return node;
}

export function appExpression(name) {
  const node=declarations.get(name);
  if(node)return source.slice(node.start,node.end);
  const imported=importedDeclaration(name);
  if(!imported)throw new Error(`Missing source expression: ${name}`);
  return imported.source.slice(imported.node.start,imported.node.end);
}
