import {useMemo, useState} from 'react';
import {aggregateBook, priceSteps} from './orderBookMath.mjs';
import styles from './Trade.module.scss';
import {assetDecimal as format} from '../Profile/walletAmounts.mjs';

export function OrderBook({snapshot, base, onSelectPrice, selectedPrice}) {
  const [step, setStep] = useState('0');
  const [levels, setLevels] = useState(8);
  const [volume, setVolume] = useState('base');
  const steps = priceSteps(snapshot?.price);
  const grouping = steps.includes(step) ? step : '0';
  const asks = useMemo(() => aggregateBook(snapshot?.depth?.asks, 'asks', grouping, levels), [snapshot?.depth?.asks, grouping, levels]);
  const bids = useMemo(() => aggregateBook(snapshot?.depth?.bids, 'bids', grouping, levels), [snapshot?.depth?.bids, grouping, levels]);
  const cumulative = row => volume === 'base' ? row.total : row.totalQuote;
  const maxVolume = Math.max(...asks.map(row => Number(cumulative(row))), ...bids.map(row => Number(cumulative(row))), 0);
  function rows(entries, side) {
    return entries.map(row => <button type="button" key={`${side}-${row.price}`} className={`${styles.bookRow} ${styles[side]}`} onClick={() => onSelectPrice(row.price)} aria-label={`Выбрать цену ${side === 'ask' ? 'продажи' : 'покупки'} ${row.price} USDT`} aria-pressed={Number(selectedPrice) === Number(row.price)}>
      <span className={styles.depthFill} aria-hidden="true" style={{width: `${maxVolume ? Number(cumulative(row)) / maxVolume * 100 : 0}%`}}/>
      <span>{format(row.price)}</span><b>{format(row.quantity)}</b><span>{format(cumulative(row))}</span>
    </button>);
  }
  return <div className={styles.bookPanel}>
    <div className={styles.panelTitle}><div><small>{snapshot?.source || 'Биржа'} · публичные заявки</small><h2>Стакан биржи</h2></div><span>{base}</span></div>
    <div className={styles.bookFilters}>
      <label>Шаг цены<select aria-label="Шаг цены" value={grouping} onChange={e => setStep(e.target.value)}>{steps.map(value => <option key={value} value={value}>{value === '0' ? 'Без шага' : format(value)}</option>)}</select></label>
      <label>Уровней<select aria-label="Уровней" value={levels} onChange={e => setLevels(Number(e.target.value))}>{[8, 16, 32, 50].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Суммарно в<select aria-label="Суммарно в" value={volume} onChange={e => setVolume(e.target.value)}><option value="base">{base}</option><option value="quote">USDT</option></select></label>
    </div>
    <div className={styles.depthHead}><span>Цена USDT</span><span>Кол-во {base}</span><span>Сумма {volume === 'base' ? base : 'USDT'}</span></div>
    <div className={styles.depthRows}>
      {rows([...asks].reverse(), 'ask')}
      <div className={styles.mid}><strong>{format(snapshot?.price || 0)}</strong><span>USDT</span></div>
      {rows(bids, 'bid')}
    </div>
    <p className={styles.bookHint}>Сумма — накопленный объём от лучшей цены. Нажмите строку, чтобы подставить цену в лимитный ордер.</p>
    {!asks.length && !bids.length && <p className={styles.bookEmpty}>Стакан биржи сейчас недоступен. Попробуйте обновить страницу.</p>}
    <p className={styles.bookNote}>Глубина ограничена полученным снимком: до 50 исходных уровней на сторону. Публичные заявки показаны справочно; исполнение ордеров в Goblin может отличаться.</p>
  </div>;
}
