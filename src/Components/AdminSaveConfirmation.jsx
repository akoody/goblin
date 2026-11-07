// Capture saves before their handlers run. Form submissions include keyboard Enter.
// Financial actions keep their existing, more specific confirmation dialogs.
export const confirmSaveClick = event => {
  const button = event.target.closest?.('button');
  if (!button || button.disabled || !/сохранить/i.test(button.textContent)) return;
  if (button.form && button.type === 'submit') return;
  if (!window.confirm('Сохранить изменения?')) {
    event.preventDefault();
    event.stopPropagation();
  }
};

export const confirmSaveSubmit = event => {
  const button = event.nativeEvent.submitter;
  const label = button?.textContent || event.target.querySelector('button[type="submit"],button:not([type])')?.textContent;
  if (/сохранить/i.test(label || '') && !window.confirm('Сохранить изменения?')) {
    event.preventDefault();
    event.stopPropagation();
  }
};
