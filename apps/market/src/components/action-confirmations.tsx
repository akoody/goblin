'use client';
import {useEffect} from 'react';

export function ActionConfirmations() {
  useEffect(() => {
    const confirm = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const label = event.submitter?.textContent || form.querySelector('button[type="submit"],button:not([type])')?.textContent || '';
      const logout = /выйти/i.test(label);
      const save = /^\/market\/admin(?:\/|$)/.test(window.location.pathname) && /сохранить/i.test(label);
      if ((logout || save) && !window.confirm(logout ? 'Выйти из аккаунта?' : 'Сохранить изменения?')) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    document.addEventListener('submit', confirm, true);
    return () => document.removeEventListener('submit', confirm, true);
  }, []);
  return null;
}
