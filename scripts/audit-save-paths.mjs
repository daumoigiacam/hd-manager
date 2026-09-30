import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from '@babel/parser';
import { canSaveLocallyFirst } from '../src/utils/localFirstSave.js';

const root = process.cwd();
const operations = new Set([
  'saveDataDocument', 'setDoc', 'updateDoc', 'deleteDoc', 'runTransaction',
  'writeBatch', 'httpsCallable', 'uploadBytes', 'uploadBytesResumable',
]);
const rows = [];
async function scan(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await scan(file); continue; }
    if (!/\.(?:jsx?|tsx?)$/.test(entry.name)) continue;
    const source = parse(await fs.readFile(file, 'utf8'), { sourceType: 'unambiguous', plugins: ['jsx', 'typescript'] });
    function visit(node, owner = '(module)') {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'FunctionDeclaration' && node.id) owner = node.id.name;
      if (node.type === 'VariableDeclarator'
        && ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.init?.type)) owner = node.id.name || owner;
      if (node.type === 'CallExpression') {
        const operation = node.callee.name;
        if (operations.has(operation)) {
          let collection = '';
          const first = node.arguments[0];
          if (operation === 'saveDataDocument' && first?.type === 'StringLiteral') collection = first.value;
          if (first?.type === 'CallExpression' && first.callee.name === 'doc') {
            const argument = first.arguments[first.arguments.length - 2];
            if (argument?.type === 'StringLiteral') collection = argument.value;
          }
          rows.push({ file: path.relative(root, file).replaceAll('\\', '/'),
            line: node.loc.start.line,
            owner, operation, collection,
            policy: operation === 'saveDataDocument' && canSaveLocallyFirst(collection, {})
              ? 'local-first eligible; payload and caller confirmation gates still apply'
              : 'requires individual review / remote confirmation',
          });
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(child => visit(child, owner));
        else if (value?.type) visit(value, owner);
      }
    }
    visit(source);
  }
}
await scan(path.join(root, 'src'));
const output = path.join(root, 'test-results', 'save-path-inventory.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({
  scope: 'Static write entry points in src; not proof of runtime coverage or every visible Save button.',
  entries: rows,
}, null, 2));
console.log(JSON.stringify({ output, total: rows.length,
  eligible: rows.filter(row => row.policy.startsWith('local-first')).length,
  byOperation: Object.fromEntries([...operations].map(operation => [operation, rows.filter(row => row.operation === operation).length])),
}, null, 2));
