import { useMemo, useState } from 'react';
import { chartIndex, chartPoints } from './chartPoints';
import styles from './Trade.module.scss';
const format = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 }).format(Number(value));
export function PriceChart({ candles = [], positive, onSelectPrice }) {
  const points = useMemo(() => chartPoints(candles), [candles]);
  const [index, setIndex] = useState(null);
  const current = points[index] || null;
  const path = points.map((point, i) => `${i ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const choose = event => { const rect = event.currentTarget.getBoundingClientRect(); return chartIndex(event.clientX, rect.left, rect.width, points.length); };
  const keyDown = event => {
    if (!points.length) return;
    const old = Math.min(index ?? points.length - 1, points.length - 1);
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) event.preventDefault();
    if (event.key === 'ArrowLeft') setIndex(Math.max(0, old - 1));
    if (event.key === 'ArrowRight') setIndex(Math.min(points.length - 1, old + 1));
    if (event.key === 'Home') setIndex(0);
    if (event.key === 'End') setIndex(points.length - 1);
    if (['Enter', ' '].includes(event.key)) onSelectPrice(points[old].price);
  };
  return <>
    <div className={`${styles.chart} ${points.length ? styles.interactiveChart : ''}`}
      role={points.length ? 'button' : undefined} tabIndex={points.length ? 0 : undefined}
      aria-label='График цены за 48 часов. Нажмите на точку, чтобы подставить цену в лимитный ордер. С клавиатуры: стрелки и Enter.'
      onPointerMove={event => setIndex(choose(event))} onPointerLeave={() => setIndex(null)}
      onFocus={() => setIndex(points.length ? points.length - 1 : null)} onKeyDown={keyDown}
      onClick={event => { const selected = choose(event); if (selected != null && points[selected]) { setIndex(selected); onSelectPrice(points[selected].price); } }}>
      <svg viewBox='0 0 1000 280' preserveAspectRatio='none' aria-hidden='true'>
        {[55,110,165,220].map(y => <line key={y} x1='0' y1={y} x2='1000' y2={y} />)}
        {path && <path d={`${path} L1000,280 L0,280 Z`} fill={positive ? '#337747' : '#b83b32'} fillOpacity='.08' />}
        {path && <path d={path} className={positive ? styles.chart_up : styles.chart_down} />}
        {current && <><line className={styles.crosshair} x1={current.x} y1='0' x2={current.x} y2='280' /><circle cx={current.x} cy={current.y} r='4' fill={positive ? '#28633b' : '#b83b32'} /></>}
      </svg>
      {current && <div className={styles.chartTooltip} style={{left:`${current.x / 10}%`,transform:current.x > 500 ? 'translateX(-100%)' : undefined}}>
        <strong>{format(current.price)} USDT</strong><span>{current.time ? new Date(current.time).toLocaleString('ru-RU') : 'Цена точки графика'}</span>
      </div>}
      {!points.length && <div className={styles.empty}>Нет данных графика</div>}
    </div>
    {points.length > 0 && <p className={styles.bookHint}>Нажмите на точку графика, чтобы подставить её цену в лимитный ордер. Это не отправляет заявку.</p>}
  </>;
}
