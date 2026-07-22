import { useCallback, useEffect, useMemo, useState } from "react";
import { enqueueSnackbar } from "notistack";
import { FiActivity, FiRefreshCw, FiShield, FiX } from "react-icons/fi";
import { RiBtcLine } from "react-icons/ri";
import { PiCurrencyEth } from "react-icons/pi";
import api from "../../api";
import styles from "./Trade.module.scss";

const PAIRS = {
  "BTC-USDT": { base: "BTC", icon: <RiBtcLine />, precision: 6 },
  "ETH-USDT": { base: "ETH", icon: <PiCurrencyEth />, precision: 5 },
};
const ACTIVE_STATUSES = new Set(["OPEN", "PARTIALLY_FILLED"]);

const number = (value) => Number(value || 0);
const format = (value, digits = 2) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(number(value));
const compact = (value) =>
  new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 2 }).format(number(value));
const dateTime = (value) => value ? new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—";

const PriceChart = ({ candles = [], positive }) => {
  const path = useMemo(() => {
    if (candles.length < 2) return "";
    const closes = candles.map((item) => number(item.close));
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    return closes.map((price, index) => {
      const x = (index / (closes.length - 1)) * 1000;
      const y = 250 - ((price - min) / range) * 210;
      return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
  }, [candles]);
  const area = path ? `${path} L1000,280 L0,280 Z` : "";

  return (
    <div className={styles.chart}>
      <svg viewBox="0 0 1000 280" preserveAspectRatio="none" role="img" aria-label="График цены за 48 часов">
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={positive ? "#4ca11f" : "#d84a32"} stopOpacity=".28" />
            <stop offset="1" stopColor={positive ? "#4ca11f" : "#d84a32"} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[55, 110, 165, 220].map((y) => <line key={y} x1="0" y1={y} x2="1000" y2={y} />)}
        {area && <path d={area} fill="url(#chartFill)" />}
        {path && <path d={path} className={positive ? styles.chart_up : styles.chart_down} />}
      </svg>
      {!path && <div className={styles.empty}>График загружается…</div>}
    </div>
  );
};

export const Trade = () => {
  const [market, setMarket] = useState("SPOT");
  const [symbol, setSymbol] = useState("BTC-USDT");
  const [snapshot, setSnapshot] = useState(null);
  const [state, setState] = useState({ book: { asks: [], bids: [] }, orders: [], fills: [], wallets: [], positions: [], funding: {} });
  const [side, setSide] = useState("BUY");
  const [orderType, setOrderType] = useState("LIMIT");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [leverage, setLeverage] = useState(5);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const pair = PAIRS[symbol];

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [marketResponse, stateResponse] = await Promise.all([
        api.get(`/exchange/market/${symbol}`),
        api.get("/exchange/state", { params: { market, symbol } }),
      ]);
      setSnapshot(marketResponse.data);
      setState(stateResponse.data);
      setPrice((current) => current || String(Number(marketResponse.data.price).toFixed(2)));
    } catch (error) {
      if (!quiet) enqueueSnackbar(error.response?.data?.message || "Не удалось загрузить рынок", { variant: "error" });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [market, symbol]);

  useEffect(() => {
    document.title = `${pair.base}/USDT — Торговля Goblin`;
    setPrice(""); setQuantity("");
    load();
    const timer = window.setInterval(() => load(true), 7000);
    return () => window.clearInterval(timer);
  }, [load, pair.base]);

  const wallet = (currency) => state.wallets.find((item) => item.currency === currency) || {};
  const available = side === "BUY" || market === "FUTURES" ? number(wallet("USDT").available) : number(wallet(pair.base).available);
  const orderPrice = orderType === "MARKET" ? number(snapshot?.price) : number(price);
  const total = number(quantity) * orderPrice;
  const required = market === "FUTURES" ? total / leverage : side === "BUY" ? total : number(quantity);
  const positive = number(snapshot?.change24h) >= 0;

  const submit = async (event) => {
    event.preventDefault();
    if (!number(quantity) || (orderType === "LIMIT" && !number(price))) {
      enqueueSnackbar("Укажите корректную цену и количество", { variant: "warning" }); return;
    }
    setSubmitting(true);
    try {
      const response = await api.post("/exchange/orders", {
        market, symbol, side, type: orderType, price, quantity, leverage,
      });
      const fills = response.data.fills?.length || 0;
      enqueueSnackbar(fills ? `Ордер исполнен: ${fills} сделок` : "Лимитный ордер размещён в стакане", { variant: "success" });
      setQuantity("");
      await load(true);
    } catch (error) {
      enqueueSnackbar(error.response?.data?.message || "Ордер не удалось разместить", { variant: "error" });
    } finally { setSubmitting(false); }
  };

  const cancel = async (id) => {
    try {
      await api.delete(`/exchange/orders/${id}`);
      enqueueSnackbar("Ордер отменён, средства разблокированы", { variant: "success" });
      await load(true);
    } catch (error) { enqueueSnackbar(error.response?.data?.message || "Не удалось отменить ордер", { variant: "error" }); }
  };

  const closePosition = async (id) => {
    try {
      await api.post(`/exchange/positions/${id}/close`);
      enqueueSnackbar("Позиция закрыта по доступной рыночной ликвидности", { variant: "success" });
      await load(true);
    } catch (error) { enqueueSnackbar(error.response?.data?.message || "Не удалось закрыть позицию", { variant: "error" }); }
  };

  const setPercent = (percent) => {
    if (!orderPrice) return;
    const maxQuantity = market === "FUTURES"
      ? (available * leverage) / orderPrice
      : side === "BUY" ? available / orderPrice : available;
    setQuantity(String((maxQuantity * percent).toFixed(pair.precision)));
  };

  const openOrders = state.orders.filter((order) => ACTIVE_STATUSES.has(order.status));
  return (
    <main className={styles.trade}>
      <section className={styles.topbar}>
        <div className={styles.markets}>
          {["SPOT", "FUTURES"].map((item) => (
            <button key={item} className={market === item ? styles.active : ""} onClick={() => setMarket(item)}>
              {item === "SPOT" ? "Спот" : "Фьючерсы"}
            </button>
          ))}
        </div>
        <div className={styles.pairs}>
          {Object.entries(PAIRS).map(([key, value]) => (
            <button key={key} className={symbol === key ? styles.activePair : ""} onClick={() => setSymbol(key)}>
              <span>{value.icon}</span>{value.base}/USDT
            </button>
          ))}
        </div>
        <button className={styles.refresh} onClick={() => load()} aria-label="Обновить рынок"><FiRefreshCw /></button>
      </section>

      <section className={styles.ticker}>
        <div className={styles.asset}><span>{pair.icon}</span><div><strong>{pair.base}/USDT</strong><small>{market === "SPOT" ? "Спотовый рынок" : "Бессрочный контракт"}</small></div></div>
        <div><small>Последняя цена</small><strong className={positive ? styles.green : styles.red}>{format(snapshot?.price, 2)} USDT</strong></div>
        <div><small>24ч изменение</small><strong className={positive ? styles.green : styles.red}>{positive ? "+" : ""}{format(snapshot?.change24h, 2)}%</strong></div>
        <div><small>Максимум 24ч</small><strong>{format(snapshot?.high24h, 2)}</strong></div>
        <div><small>Минимум 24ч</small><strong>{format(snapshot?.low24h, 2)}</strong></div>
        <div><small>Объём 24ч</small><strong>{compact(snapshot?.volume24h)} USDT</strong></div>
        <div className={styles.source}><FiActivity /> {market === "FUTURES" ? `Funding ${format(number(state.funding?.lastRate) * 100, 4)}%` : `${snapshot?.source || "—"}${snapshot?.stale ? " · задержка" : " · live"}`}</div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.chartPanel}>
          <div className={styles.panelTitle}><div><small>График</small><h2>{pair.base}/USDT · 1ч</h2></div><span>48 часов</span></div>
          <PriceChart candles={snapshot?.candles} positive={positive} />
        </div>

        <div className={styles.bookPanel}>
          <div className={styles.panelTitle}><div><small>Рынок</small><h2>Стакан</h2></div><span>{pair.base}</span></div>
          <div className={styles.bookHead}><span>Цена USDT</span><span>Количество</span></div>
          <div className={styles.bookRows}>
            {[...(state.book.asks || [])].reverse().slice(-8).map((row) => <div key={`a-${row.price}`} className={styles.ask}><span>{format(row.price, 2)}</span><b>{format(row.quantity, pair.precision)}</b></div>)}
            <div className={styles.mid}><strong>{format(snapshot?.price, 2)}</strong><span>≈ ${format(snapshot?.price, 2)}</span></div>
            {(state.book.bids || []).slice(0, 8).map((row) => <div key={`b-${row.price}`} className={styles.bid}><span>{format(row.price, 2)}</span><b>{format(row.quantity, pair.precision)}</b></div>)}
          </div>
          {!state.book.asks?.length && !state.book.bids?.length && <p className={styles.bookEmpty}>Стакан пуст. Первый лимитный ордер создаст ликвидность.</p>}
        </div>

        <form className={styles.orderPanel} onSubmit={submit}>
          <div className={styles.sideTabs}>
            <button type="button" className={side === "BUY" ? styles.buyActive : ""} onClick={() => setSide("BUY")}>{market === "FUTURES" ? "Лонг" : "Купить"}</button>
            <button type="button" className={side === "SELL" ? styles.sellActive : ""} onClick={() => setSide("SELL")}>{market === "FUTURES" ? "Шорт" : "Продать"}</button>
          </div>
          <div className={styles.typeTabs}>{["LIMIT", "MARKET"].map((item) => <button type="button" key={item} className={orderType === item ? styles.typeActive : ""} onClick={() => setOrderType(item)}>{item === "LIMIT" ? "Лимит" : "Рынок"}</button>)}</div>
          <div className={styles.balanceLine}><span>Доступно</span><strong>{format(available, market === "FUTURES" || side === "BUY" ? 2 : 8)} {market === "FUTURES" || side === "BUY" ? "USDT" : pair.base}</strong></div>
          {orderType === "LIMIT" && <label><span>Цена</span><div><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0.00" /><b>USDT</b></div></label>}
          <label><span>Количество</span><div><input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="0.00" /><b>{pair.base}</b></div></label>
          <div className={styles.percent}>{[.25,.5,.75,1].map((item) => <button type="button" key={item} onClick={() => setPercent(item)}>{item * 100}%</button>)}</div>
          {market === "FUTURES" && <label><span>Кредитное плечо <b>{leverage}×</b></span><input className={styles.range} type="range" min="1" max="20" value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} /></label>}
          <div className={styles.summary}><span>{market === "FUTURES" ? "Начальная маржа" : "Итого"}</span><strong>{format(required, 2)} {market === "SPOT" && side === "SELL" ? pair.base : "USDT"}</strong></div>
          <button className={side === "BUY" ? styles.buyButton : styles.sellButton} disabled={submitting || loading}>{submitting ? "Отправляем…" : `${side === "BUY" ? market === "FUTURES" ? "Открыть лонг" : "Купить" : market === "FUTURES" ? "Открыть шорт" : "Продать"} ${pair.base}`}</button>
          <p className={styles.risk}><FiShield /> Рыночный ордер исполняется полностью или отменяется. Self-trade запрещён.</p>
        </form>
      </section>

      <section className={styles.activity}>
        <div className={styles.activityHeader}><div><small>Торговля</small><h2>{market === "FUTURES" ? "Позиции и ордера" : "Мои ордера"}</h2></div><span>{openOrders.length} активных</span></div>
        {market === "FUTURES" && state.positions.some((p) => p.status === "OPEN") && <div className={styles.positions}>
          {state.positions.filter((p) => p.status === "OPEN").map((position) => {
            const mark = number(snapshot?.price); const entry = number(position.entry_price);
            const pnl = (position.side === "LONG" ? mark - entry : entry - mark) * number(position.quantity);
            return <article key={position.id}><div><span className={position.side === "LONG" ? styles.long : styles.short}>{position.side === "LONG" ? "Лонг" : "Шорт"} {position.leverage}×</span><strong>{format(position.quantity, pair.precision)} {pair.base}</strong></div><div><small>Вход / Mark</small><b>{format(entry, 2)} / {format(mark, 2)}</b></div><div><small>Нереализованный PnL</small><b className={pnl >= 0 ? styles.green : styles.red}>{pnl >= 0 ? "+" : ""}{format(pnl, 2)} USDT</b></div><div><small>Ликвидация</small><b>{format(position.liquidation_price, 2)}</b></div><button onClick={() => closePosition(position.id)}>Закрыть по рынку</button></article>;
          })}
        </div>}
        <div className={styles.tableWrap}><table><thead><tr><th>Дата</th><th>Пара</th><th>Сторона</th><th>Тип</th><th>Цена</th><th>Исполнено</th><th>Статус</th><th></th></tr></thead><tbody>
          {state.orders.map((order) => <tr key={order.id}><td>{dateTime(order.created_at)}</td><td>{order.symbol.replace("-", "/")}</td><td className={order.side === "BUY" ? styles.green : styles.red}>{order.side === "BUY" ? "Покупка" : "Продажа"}</td><td>{order.order_type === "LIMIT" ? "Лимит" : "Рынок"}</td><td>{format(order.price, 2)}</td><td>{format(order.filled_quantity, pair.precision)} / {format(order.quantity, pair.precision)}</td><td><span className={styles.status}>{order.status}</span></td><td>{ACTIVE_STATUSES.has(order.status) && <button className={styles.cancel} onClick={() => cancel(order.id)} aria-label="Отменить ордер"><FiX /></button>}</td></tr>)}
          {!state.orders.length && <tr><td colSpan="8"><div className={styles.empty}>Здесь появятся ваши торговые ордера</div></td></tr>}
        </tbody></table></div>
      </section>
    </main>
  );
};
