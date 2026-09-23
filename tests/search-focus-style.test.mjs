import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const foundation = read('src/design-system/foundation.css');
const components = read('src/design-system/components.jsx');
const appShell = read('src/layout/AppShell.jsx');
const searchFocusStyles = foundation.split('/* Search controls keep their resting surface without adding a second focus frame. */')[1] || '';
const searchInputFocusRule = searchFocusStyles.match(/:where\([\s\S]*?\):is\(:focus, :focus-visible\)\s*\{([^}]*)\}/)?.[1] || '';
const searchContainerFocusRule = searchFocusStyles.match(/:where\(label, div\):has\(> input\[data-hd-search-input="true"\]\):focus-within,[\s\S]*?\{([^}]*)\}/)?.[1] || '';

const inputTags = [...app.matchAll(/<input\b(?:(?!\/>)[\s\S])*?\/>/g)].map((match) => match[0]);
const searchInputs = inputTags.filter((tag) => (
  /type="search"/.test(tag)
  || /(?:placeholder|aria-label)=[^>]*?(?:Tìm|tìm|Tim |Tra cứu|tra cứu)/.test(tag)
));
const unmarkedSearchInputs = searchInputs.filter((tag) => !/data-hd-search-input="true"/.test(tag));

assert(searchInputs.length >= 30, `Expected the complete app search inventory, found only ${searchInputs.length} controls.`);
assert.deepEqual(unmarkedSearchInputs, [], 'Every searchable input must opt into the shared no-extra-focus-frame behavior.');
assert.match(components, /HDSearchInput[\s\S]*data-hd-search-input="true"/, 'The shared search primitive must mark future search inputs automatically.');

for (const requiredRule of [
  'input[data-hd-search-input="true"]',
  'input[type="search"]',
  'input[role="searchbox"]',
  'outline: none !important',
  'box-shadow: none !important',
  'transition: none !important',
  '--tw-ring-offset-shadow: 0 0 #0000 !important',
  '--tw-ring-shadow: 0 0 #0000 !important',
  ':has(> input[data-hd-search-input="true"]):focus-within',
]) {
  assert(foundation.includes(requiredRule), `Missing shared search focus rule: ${requiredRule}`);
}
assert.match(searchInputFocusRule, /border-color:\s*transparent\s*!important/, 'focused search inputs must not gain an extra border');
assert.match(searchContainerFocusRule, /border-color:\s*transparent\s*!important/, 'focused search surfaces must not gain an extra border');
assert.match(appShell, /onPointerDownCapture=\{event => \{[\s\S]*?hdInputFocusMode = 'pointer'/, 'pointer interaction must keep search focus styling quiet');
assert.match(appShell, /onKeyDownCapture=\{event => \{[\s\S]*?event\.key === 'Tab'[\s\S]*?hdInputFocusMode = 'keyboard'/, 'keyboard navigation must enable a visible focus indicator');
assert.match(foundation, /data-hd-input-focus-mode="keyboard"[\s\S]*?outline: 2px solid var\(--hd-color-focus\) !important/, 'keyboard-focused search surfaces must use the accessible focus token');

console.log(`PASS Search focus style: ${searchInputs.length} search inputs stay quiet for pointer focus and visibly focused for keyboard navigation.`);
