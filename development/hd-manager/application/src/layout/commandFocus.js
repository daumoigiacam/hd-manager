export function preserveCommandInputFocus(event, document) {
  if (event.button !== 0) return;
  const button = event.target?.closest?.('button');
  if (!button || button.disabled) return;
  const scope = button.closest('[role="dialog"], form, main');
  const focused = document.activeElement;
  if (scope?.contains(focused)
    && (focused?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused?.tagName))) {
    // Blurring on pointerdown can move the command before pointerup, losing the tap.
    event.preventDefault();
    // IME opening can also resize the viewport during a press. Keep its release on this command.
    if (Number.isInteger(event.pointerId)) button.setPointerCapture?.(event.pointerId);
    return focused;
  }
}

export function createCommandFocusGuard(document) {
  let focusedInput = null;
  let command = null;
  return {
    pointerdown(event) {
      focusedInput = preserveCommandInputFocus(event, document) || null;
      command = event.target?.closest?.('button') || null;
    },
    click(event) {
      const previousInput = focusedInput;
      focusedInput = null;
      if (previousInput && previousInput === document.activeElement && command
        && event.target?.closest?.('button') === command
        && !command.hasAttribute?.('data-hd-keep-input-focus')) {
        // Document bubbling runs after the actual React command, not before its click.
        previousInput.blur();
      }
      command = null;
    },
  };
}

export function createCommandClickGuard() {
  let previousCommand = null;
  return event => {
    const command = event.target?.closest?.('button, input[type="submit"]') || null;
    // The first submit can finish and clear its draft before the second click arrives.
    if (event.detail > 1 && previousCommand && (!previousCommand.isConnected
      || (command === previousCommand && command.type === 'submit'))) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    previousCommand = command;
  };
}
