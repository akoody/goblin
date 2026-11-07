import { useEffect, useState } from 'react';
import api from '../../api';
import styles from './ProfileStats.module.scss';

export function ProfileStats() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(''); setData(null);
    Promise.all([api.get('/api/auth/me', { signal: controller.signal }), api.get('/api/auth/me/stats', { signal: controller.signal })])
      .then(([user, stats]) => setData({ user: user.data, stats: stats.data }))
      .catch(() => { if (!controller.signal.aborted) setError('Не удалось загрузить статистику'); });
    return () => controller.abort();
  }, [refresh]);
  return <section className={styles.stats}>
    <header><h2>Статистика P2P</h2><button type="button" onClick={() => setRefresh(v => v + 1)}>Обновить</button></header>
    {error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Загрузка…</p>}
    {data && <><p>{data.user.fullName || data.user.username} · {data.user.email}</p>
      <dl>{[['Всего сделок', 'total'], ['Завершено', 'completed'], ['Отменено', 'cancelled'], ['За последние 30 дней', 'recent']].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{data.stats[key] ?? '—'}</dd></div>)}
        <div><dt>Успешных среди завершённых и отменённых</dt><dd>{data.stats.completed + data.stats.cancelled > 0 ? `${data.stats.successRate}%` : 'Пока нет завершённых сделок'}</dd></div>
      </dl><p className={styles.note}>Активные сделки не влияют на процент успешных. Балансы и замороженные средства показаны в разделе «Активы».</p></>}
  </section>;
}
