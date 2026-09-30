import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { resolveKeyboardViewport, resolveStableViewport } from '../src/utils/keyboardViewport.js';

test('native keyboard geometry does not depend on the active pointer being coarse', () => {
  const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const installer = tree.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'installResponsiveViewportVars');
  const properties = new Map();
  const classes = new Map();
  const events = new Map();
  const frames = [];
  const classList = { toggle(name, enabled) { classes.set(name, enabled); } };
  const window = {
    innerWidth: 390, innerHeight: 844, navigator: {},
    visualViewport: { height: 844, width: 390, offsetTop: 0, addEventListener() {} },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    matchMedia(query) { return { matches: query.includes('768') }; },
    addEventListener(name, callback) { events.set(name, callback); },
  };
  const document = {
    documentElement: { style: { setProperty(key, value) { properties.set(key, value); } }, dataset: {}, classList },
    body: { classList }, activeElement: { tagName: 'INPUT', getAttribute: () => 'text' },
  };
  const bindings = {
    window, document, navigator: { maxTouchPoints: 5, userAgent: 'Android' }, globalThis: {},
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
    registerPlugin: () => ({ getInsets: () => Promise.resolve({}) }), resolveStableViewport, resolveKeyboardViewport,
  };
  new Function(...Object.keys(bindings), `${source.slice(installer.start, installer.end)}; installResponsiveViewportVars();`)(...Object.values(bindings));
  window.innerHeight = window.visualViewport.height = 504;
  events.get('resize')();
  frames.splice(0).forEach(callback => callback());
  assert.equal(properties.get('--hd-viewport-height'), '844px');
  assert.equal(properties.get('--hd-modal-viewport-height'), '504px');
  assert.equal(properties.get('--hd-keyboard-height'), '340px');
  assert.equal(classes.get('hd-keyboard-open'), true);
});

test('a focus event queued before rotation cannot leave modal height at the previous orientation', () => {
  const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const installer = tree.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'installResponsiveViewportVars');
  const properties = new Map();
  const events = new Map();
  const frames = [];
  const classList = { toggle() {} };
  const window = {
    innerWidth: 844, innerHeight: 390, navigator: {},
    visualViewport: { height: 390, width: 844, offsetTop: 0, addEventListener() {} },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    matchMedia(query) { return { matches: query.includes('coarse') || (query.includes('768') && this.innerWidth <= 768) }; },
    addEventListener(name, callback) { events.set(name, callback); },
  };
  const document = {
    documentElement: { style: { setProperty(key, value) { properties.set(key, value); } }, dataset: {}, classList },
    body: { classList }, activeElement: null,
  };
  const bindings = {
    window, document, navigator: { maxTouchPoints: 1, userAgent: 'Android' }, globalThis: {},
    Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false }, registerPlugin: () => ({}),
    resolveStableViewport, resolveKeyboardViewport,
  };
  new Function(...Object.keys(bindings), `${source.slice(installer.start, installer.end)}; installResponsiveViewportVars();`)(...Object.values(bindings));
  const flush = () => frames.splice(0).forEach(callback => callback());
  // Browsers can report the new width before the final portrait height.
  window.innerWidth = 390;
  window.visualViewport.width = 390;
  events.get('resize')();
  flush();
  events.get('focusout')();
  window.innerHeight = window.visualViewport.height = 844;
  events.get('resize')();
  flush();
  assert.equal(properties.get('--hd-viewport-height'), '844px');
  assert.equal(properties.get('--hd-modal-viewport-height'), '844px');
});

test('touch viewport follows rotation even with a focused field and restores after IME dismissal', () => {
  assert.deepEqual(resolveStableViewport({ height: 411, width: 891, stableHeight: 891, stableWidth: 411, touch: true }), { height: 411, width: 891 });
  assert.deepEqual(resolveStableViewport({ height: 555, width: 411, stableHeight: 891, stableWidth: 411, touch: true }), { height: 891, width: 411 });
  assert.deepEqual(resolveStableViewport({ height: 891, width: 411, stableHeight: 555, stableWidth: 411, touch: true }), { height: 891, width: 411 });
});

const base = { stableHeight: 794, layoutHeight: 794, visualHeight: 794, focusedEditable: true, smallTouchScreen: true };
test('one-pixel native viewport rounding cannot replace the keyboard baseline', () => {
  const rounding = resolveStableViewport({ height: 556, width: 412, stableHeight: 891, stableWidth: 411, touch: true });
  assert.deepEqual(rounding, { height: 891, width: 412 });
  const restoredWidth = resolveStableViewport({ height: 555, width: 411, stableHeight: rounding.height, stableWidth: rounding.width, touch: true });
  assert.equal(restoredWidth.height, 891);
});
test('modal geometry never transitions behind the real IME viewport', () => {
  const css = readFileSync(new URL('../src/design-system/foundation.css', import.meta.url), 'utf8');
  for (const selector of ['.hd-modal-layer', '.hd-modal-surface']) {
    const rule = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    assert.ok(rule.includes('transition-property: opacity !important;'));
  }
});
test('Android resize mode keeps save actions inside the resized visual area', () => {
  assert.deepEqual(resolveKeyboardViewport({ ...base, layoutHeight: 394, visualHeight: 394 }), { keyboardHeight: 400, keyboardVisible: true, modalHeight: 394, modalTop: 0 });
});
test('overlay and panned keyboards use the visible height and top', () => {
  assert.deepEqual(resolveKeyboardViewport({ ...base, visualHeight: 394, visualTop: 90 }), { keyboardHeight: 310, keyboardVisible: true, modalHeight: 394, modalTop: 90 });
});
test('dismiss restores the modal after the visible viewport restores, not before', () => {
  assert.equal(resolveKeyboardViewport({ ...base, layoutHeight: 394, visualHeight: 394, focusedEditable: false }).modalHeight, 394);
  assert.equal(resolveKeyboardViewport({ ...base, focusedEditable: false }).modalHeight, 794);
});
test('desktop resize and browser toolbars do not pretend to be a keyboard', () => {
  assert.equal(resolveKeyboardViewport({ ...base, layoutHeight: 600, visualHeight: 600, smallTouchScreen: false }).keyboardVisible, false);
  assert.equal(resolveKeyboardViewport({ ...base, visualHeight: 740 }).keyboardVisible, false);
});
