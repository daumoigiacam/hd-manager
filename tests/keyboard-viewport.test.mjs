import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveKeyboardViewport } from '../src/utils/keyboardViewport.js';

const base = { stableHeight: 794, layoutHeight: 794, visualHeight: 794, focusedEditable: true, smallTouchScreen: true };
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
