import { useCallback, useEffect, useRef, useState } from "react";
import { enqueueSnackbar } from "notistack";
import { FiActivity, FiRefreshCw, FiShield, FiX } from "react-icons/fi";
import { RiBtcLine } from "react-icons/ri";
import { PiCurrencyEth } from "react-icons/pi";
import api from "../../api";
import styles from "./Trade.module.scss";
import { useLocation, useNavigate } from "react-router-dom";
import { PriceChart } from './PriceChart';
import { OrderBook } from './OrderBook';

const PAIRS = {
  "BTC-USDT": { base: "BTC", icon: <RiBtcLine />, precision: 6 },
  "ETH-USDT": { base: "ETH", icon: <PiCurrencyEth />, precision: 5 },
  ...Object.fromEntries(['SOL','DOGE','SHIB','PEPE','BONK','WIF','FLOKI'].map(base=>[`${base}-USDT`,{base,icon:<FiActivity/>,precision:8}])),
};
const ACTIVE_STATUSES = new Set(["OPEN", "PARTIALLY_FILLED"]);

const number = (value) => Number(value || 0);
const format = (value, digits = number(value)!==0&&Math.abs(number(value))<1 ? 10 : 2) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(number(value));
const compact = (value) =>
  new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 2 }).format(number(value));
const dateTime = (value) => value ? new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—";

export const Trade = () => {
  const isLoggedIn = Boolean(localStorage.getItem("token"));
  const navigate = useNavigate();
  const location = useLocation();
  const login = () => navigate("/login", { state: { from: location } });
  const [market, setMarket] = useState("SPOT");
  const [symbol, setSymbol] = useState("BTC-USDT");
  const [snapshot, setSnapshot] = useState(null);
  const [state, setState] = useState({ book: { asks: [], bids: [] }, orders: [], fills: [], wallets: [], positions: [], funding: {} });
  const [side, setSide] = useState("BUY");
  const [orderType, setOrderType] = useState("LIMIT");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [selectedPrice, setSelectedPrice] = useState('');
  const [leverage, setLeverage] = useState(5);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const orderPanelRef = useRef(null);
  const pair = PAIRS[symbol];

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [marketResponse, stateResponse] = await Promise.all([
        api.get(`/exchange/market/${symbol}`),
        isLoggedIn ? api.get("/exchange/state", { params: { market, symbol } }) : Promise.resolve(null),
      ]);
      setSnapshot(marketResponse.data);
      if (stateResponse) setState(stateResponse.data);
      setPrice((current) => current || String(Number(marketResponse.data.price).toFixed(2)));
    } catch (error) {
      if (!quiet) enqueueSnackbar(error.response?.data?.message || "Не удалось загрузить рынок", { variant: "error" });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [market, symbol, isLoggedIn]);

  useEffect(() => {
    document.title = `${pair.base}/USDT — Торговля Goblin`;
    setPrice(""); setQuantity(""); setSelectedPrice('');
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
    if (!isLoggedIn) { login(); return; }
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

  const selectBookPrice = (bookPrice) => {
    if (!Number.isFinite(Number(bookPrice)) || Number(bookPrice) <= 0) return;
    setPrice(String(bookPrice));
    setSelectedPrice(String(bookPrice));
    setOrderType("LIMIT");
    if (window.matchMedia("(max-width: 800px)").matches) {
      window.requestAnimationFrame(() => orderPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
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
          <label>Торговая пара <select value={symbol} onChange={e=>setSymbol(e.target.value)}>{Object.entries(PAIRS).map(([key,value])=><option key={key} value={key}>{value.base}/USDT</option>)}</select></label>
        </div>
        <button className={styles.refresh} onClick={() => load()} aria-label="Обновить рынок"><FiRefreshCw /></button>
      </section>

      <section className={styles.ticker}>
        <div className={styles.asset}><span>{pair.icon}</span><div><strong>{pair.base}/USDT</strong><small>{market === "SPOT" ? "Спотовый рынок" : "Бессрочный контракт"}</small></div></div>
        <div><small>Последняя цена</small><strong className={positive ? styles.green : styles.red}>{format(snapshot?.price)} USDT</strong></div>
        <div><small>24ч изменение</small><strong className={positive ? styles.green : styles.red}>{positive ? "+" : ""}{format(snapshot?.change24h, 2)}%</strong></div>
        <div><small>Максимум 24ч</small><strong>{format(snapshot?.high24h, 2)}</strong></div>
        <div><small>Минимум 24ч</small><strong>{format(snapshot?.low24h, 2)}</strong></div>
        <div><small>Объём 24ч</small><strong>{compact(snapshot?.volume24h)} USDT</strong></div>
        <div className={styles.source}><FiActivity /> {market === "FUTURES" ? `Funding ${format(number(state.funding?.lastRate) * 100, 4)}%` : `${snapshot?.source || "—"}${snapshot?.stale ? " · задержка" : " · live"}`}</div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.chartPanel}>
          <div className={styles.panelTitle}><div><small>График</small><h2>{pair.base}/USDT · 1ч</h2></div><span>48 часов</span></div>
          <PriceChart key={`${market}-${symbol}`} candles={snapshot?.candles} positive={positive} onSelectPrice={selectBookPrice} />
        </div>

        <OrderBook key={`${market}-${symbol}`} snapshot={snapshot} base={pair.base} onSelectPrice={selectBookPrice} selectedPrice={orderType === "LIMIT" ? price : null} />

        <form ref={orderPanelRef} className={styles.orderPanel} onSubmit={submit}>
          <div className={styles.sideTabs}>
            <button type="button" className={side === "BUY" ? styles.buyActive : ""} onClick={() => setSide("BUY")}>{market === "FUTURES" ? "Лонг" : "Купить"}</button>
            <button type="button" className={side === "SELL" ? styles.sellActive : ""} onClick={() => setSide("SELL")}>{market === "FUTURES" ? "Шорт" : "Продать"}</button>
          </div>
          <div className={styles.typeTabs}>{["LIMIT", "MARKET"].map((item) => <button type="button" key={item} className={orderType === item ? styles.typeActive : ""} onClick={() => setOrderType(item)}>{item === "LIMIT" ? "Лимит" : "Рынок"}</button>)}</div>
          <div className={styles.balanceLine}><span>Доступно</span><strong>{isLoggedIn ? `${format(available, market === "FUTURES" || side === "BUY" ? 2 : 8)} ${market === "FUTURES" || side === "BUY" ? "USDT" : pair.base}` : "Войдите в аккаунт"}</strong></div>
          {orderType === "LIMIT" && <label><span>Цена</span><div><input aria-label="Цена ордера" value={price} onChange={(e) => { setPrice(e.target.value); setSelectedPrice(''); }} inputMode="decimal" placeholder="0.00" /><b>USDT</b></div></label>}
          {selectedPrice && orderType === 'LIMIT' && <p className={styles.priceSelected} role='status'>Цена {format(selectedPrice,8)} USDT подставлена в ордер</p>}
          <label><span>Количество</span><div><input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="0.00" /><b>{pair.base}</b></div></label>
          <div className={styles.percent}>{[.25,.5,.75,1].map((item) => <button type="button" key={item} onClick={() => setPercent(item)}>{item * 100}%</button>)}</div>
          {market === "FUTURES" && <label><span>Кредитное плечо <b>{leverage}×</b></span><input className={styles.range} type="range" min="1" max="20" value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} /></label>}
          <div className={styles.summary}><span>{market === "FUTURES" ? "Начальная маржа" : "Итого"}</span><strong>{format(required, 2)} {market === "SPOT" && side === "SELL" ? pair.base : "USDT"}</strong></div>
          <button className={side === "BUY" ? styles.buyButton : styles.sellButton} disabled={submitting || (isLoggedIn && loading)}>{!isLoggedIn ? "Войти для торговли" : submitting ? "Отправляем…" : `${side === "BUY" ? market === "FUTURES" ? "Открыть лонг" : "Купить" : market === "FUTURES" ? "Открыть шорт" : "Продать"} ${pair.base}`}</button>
          <p className={styles.risk}><FiShield /> Рыночный ордер исполняется полностью или отменяется. Self-trade запрещён.</p>
        </form>
      </section>

      <section className={styles.activity}>
        <div className={styles.activityHeader}><div><small>Торговля</small><h2>{market === "FUTURES" ? "Позиции и ордера" : "Мои ордера"}</h2></div><span>{openOrders.length} активных</span></div>
        {market === "FUTURES" && state.positions.some((p) => p.status === "OPEN") && <div className={styles.positions}>
          {state.positions.filter((p) => p.status === "OPEN").map((position) => {
            const mark = number(snapshot?.price); const entry = number(position.entry_price);
            const pnl = (position.side === "LONG" ? mark - entry : entry - mark) * number(position.quantity);
            return <article key={position.id}><div><span className={position.side === "LONG" ? styles.long : styles.short}>{position.side === "LONG" ? "Лонг" : "Шорт"} {position.leverage}×</span><strong>{format(position.quantity, pair.precision)} {pair.base}</strong></div><div><small>Вход / Mark</small><b>{format(entry)} / {format(mark)}</b></div><div><small>Нереализованный PnL</small><b className={pnl >= 0 ? styles.green : styles.red}>{pnl >= 0 ? "+" : ""}{format(pnl, 2)} USDT</b></div><div><small>Ликвидация</small><b>{format(position.liquidation_price)}</b></div><button onClick={() => closePosition(position.id)}>Закрыть по рынку</button></article>;
          })}
        </div>}
        {state.orders.length > 0 ? <div className={styles.tableWrap}><table><thead><tr><th>Дата</th><th>Пара</th><th>Сторона</th><th>Тип</th><th>Цена</th><th>Исполнено</th><th>Статус</th><th></th></tr></thead><tbody>
          {state.orders.map((order) => <tr key={order.id}><td>{dateTime(order.created_at)}</td><td>{order.symbol.replace("-", "/")}</td><td className={order.side === "BUY" ? styles.green : styles.red}>{order.side === "BUY" ? "Покупка" : "Продажа"}</td><td>{order.order_type === "LIMIT" ? "Лимит" : "Рынок"}</td><td>{format(order.price)}</td><td>{format(order.filled_quantity, pair.precision)} / {format(order.quantity, pair.precision)}</td><td><span className={styles.status}>{order.status}</span></td><td>{ACTIVE_STATUSES.has(order.status) && <button className={styles.cancel} onClick={() => cancel(order.id)} aria-label="Отменить ордер"><FiX /></button>}</td></tr>)}
        </tbody></table></div> : <div className={styles.empty}>{isLoggedIn ? "Здесь появятся ваши торговые ордера" : "Войдите в аккаунт, чтобы увидеть свои ордера"}</div>}
      </section>
    </main>
  );
};
