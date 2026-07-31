import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const app = read('src/App.jsx');
const main = read('src/main.jsx');
const shell = read('src/layout/AppShell.jsx');
const tokens = read('src/design-system/tokens.js');
const foundation = read('src/design-system/foundation.css');
const components = read('src/design-system/components.jsx');

assert(!app.includes('fonts.googleapis.com'), 'UI must not depend on remote Google Fonts');
assert(main.includes('@fontsource-variable/inter'), 'Inter Variable must be loaded locally');
assert(main.includes('@fontsource-variable/roboto-flex'), 'Roboto Flex must be loaded locally');
assert(main.includes('./design-system/foundation.css'), 'Design System foundation must load globally');

assert(shell.includes('data-hd-shell'), 'AppShell must expose its shared shell boundary');
assert(shell.includes('data-hd-theme'), 'AppShell must expose the active theme');
assert((app.match(/<AppShell/g) || []).length >= 3, 'Staff, customer and authentication roots must use AppShell');
assert(app.includes('hd-shell--staff'), 'Staff shell must use semantic presentation');
assert(app.includes('hd-shell--customer'), 'Customer shell must use semantic presentation');
assert(app.includes('hd-shell--auth'), 'Authentication shell must use semantic presentation');

for (const token of ['colors', 'spacing', 'typography', 'radius', 'elevation', 'motion', 'breakpoints']) {
  assert(tokens.includes(token), `Missing Design System token group: ${token}`);
}

for (const selector of [
  '[data-hd-theme="dark"]',
  '@media (prefers-reduced-motion: reduce)',
  'env(safe-area-inset-top',
  '--hd-space-4',
  '--hd-shadow-md',
  '.hd-ds-card',
  '.hd-ds-button',
  '.hd-ds-field',
  '.hd-ds-dialog',
  '.hd-ds-state',
]) {
  assert(foundation.includes(selector), `Missing foundation rule: ${selector}`);
}

for (const component of ['HDCard', 'HDButton', 'HDField', 'HDDialog', 'HDStatusState']) {
  assert(components.includes(`function ${component}`), `Missing shared primitive: ${component}`);
}

console.log('PASS Design System foundation: AppShell, tokens, fonts, themes, safe area, motion and primitives.');
