export function resolveKeyboardViewport({ layoutHeight, visualHeight = layoutHeight, visualTop = 0, stableHeight = layoutHeight, focusedEditable, smallTouchScreen }) {
  const height = Math.max(0, layoutHeight || 0);
  const visible = Math.max(0, visualHeight || height);
  const baseline = Math.max(0, stableHeight || height);
  // Android can resize BOTH viewports. Comparing only innerHeight and visualViewport misses its keyboard.
  const keyboardHeight = Math.max(0, Math.round(height - visible - visualTop), Math.round(baseline - height));
  return {
    keyboardHeight,
    keyboardVisible: Boolean(focusedEditable && smallTouchScreen && keyboardHeight > 110),
    // Also stay within the visible area during the blur/keyboard-dismiss animation.
    modalHeight: Math.round(Math.min(baseline, height, visible)),
    modalTop: Math.round(Math.max(0, visualTop)),
  };
}
