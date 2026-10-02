const fs = require('node:fs');
const path = require('node:path');
const { reconcileInventory } = require('../functions/inventoryReconciliation');

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Usage: node scripts/reconcile-inventory.cjs <staging-export.json> <report.json>');
if (path.resolve(source) === path.resolve(destination)) throw new Error('Report must not overwrite source evidence.');
const result = reconcileInventory(JSON.parse(fs.readFileSync(source, 'utf8')));
fs.writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, issues: result.issues.length, report: path.resolve(destination) }));
process.exitCode = result.status === 'PASS' ? 0 : 2;
