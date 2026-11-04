import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
test('production report gate retains refresh layout, preserves drafts and clears private scopes',{timeout:30000},()=>{
 const output='test-results/report-continuity-gate-'+process.pid;
 execFileSync(process.execPath,['tests/visual/customer-ledger-gate.visual.mjs'],{stdio:'pipe',env:{...process.env,HD_LEDGER_GATE_OUTPUT:output}});
 const result=JSON.parse(fs.readFileSync(output+'/result.json'));assert.equal(result.checks.length,9);assert.deepEqual(result.errors,[]);
});
