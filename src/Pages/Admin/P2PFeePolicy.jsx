import { useEffect, useState } from 'react';
import { enqueueSnackbar } from 'notistack';
import api from '../../api';
import styles from './Admin.module.scss';

export function P2pFeePolicy() {
  const [policy, setPolicy] = useState(null);
  const [feePercent, setFeePercent] = useState('5');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/admin/p2p-fee-policy');
      setPolicy(data);
      setFeePercent(String(data.feePercent));
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Не удалось загрузить комиссию P2P');
    }
  };

  useEffect(() => { load(); }, []);

  const save = async event => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.patch('/admin/p2p-fee-policy', { feePercent });
      await load();
      enqueueSnackbar('Комиссия сохранена для новых P2P-сделок', { variant: 'success' });
    } catch (requestError) {
      enqueueSnackbar(requestError.response?.data?.message || 'Не удалось сохранить комиссию', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return <section className={styles.loginSecurity} aria-label="Комиссия P2P">
    <h2>Комиссия P2P</h2>
    {error && <p role="alert">{error}</p>}
    <form onSubmit={save} className={styles.depositSettings}>
      <label>Комиссия, %<input aria-label="Комиссия P2P, %" type="number" min="0" max="100" step="0.01" required value={feePercent} onChange={event => setFeePercent(event.target.value)} /></label>
      <button type="submit" disabled={saving || !policy}>{saving ? 'Сохраняем…' : 'Сохранить комиссию'}</button>
    </form>
    <p>Текущая ставка: {policy ? `${policy.feePercent}%` : 'загружаем…'}. При успешном завершении комиссия удерживается из зарезервированной суммы продавца: покупатель получает сумму за вычетом комиссии, а комиссия поступает в общий кошелёк администраторов. При отмене комиссия не списывается. Новая ставка применяется только к сделкам, созданным после сохранения.</p>
  </section>;
}
