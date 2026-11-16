// Админка, раздел «Торговый терминал: сделки, ордера, позиции, график рынка». Состояние и загрузка в хуке useTradingAdmin: он вызывается в Admin, поэтому данные
// и черновики не теряются при переключении вкладок. Разметка в TradingSection.
import { useEffect, useMemo, useRef, useState } from "react";
import { FiSearch, FiRefreshCw } from "react-icons/fi";
import { enqueueSnackbar } from "notistack";
import api from "../../../api";
import { getApiErrorMessage } from "../../../utils/notifications";
import styles from "../Admin.module.scss";
import { formatDate, formatTradingAmount } from "../adminFormat";

const AdminMarketChart = ({ candles = [] }) => {
  const path = useMemo(() => {
    if (candles.length < 2) return "";
    const prices = candles.map((candle) => Number(candle.close || 0));
    const min = Math.min(...prices);
    const range = Math.max(...prices) - min || 1;
    return prices.map((price, index) => {
      const x = (index / (prices.length - 1)) * 640;
      const y = 158 - ((price - min) / range) * 132;
      return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
  }, [candles]);

  return (
    <div className={styles.admin_exchangeChart}>
      <h4>График {candles.length ? "· 48 часов" : ""}</h4>
      {path ? <svg viewBox="0 0 640 180" preserveAspectRatio="none" role="img" aria-label="График биржевой цены за 48 часов">
        {[40, 80, 120, 160].map((y) => <line key={y} x1="0" y1={y} x2="640" y2={y} />)}
        <path d={path} />
      </svg> : <p>График временно недоступен</p>}
    </div>
  );
};

const tradingStatusLabels = {
  OPEN: "Открыт",
  PARTIALLY_FILLED: "Частично исполнен",
  FILLED: "Исполнен",
  CANCELLED: "Отменён",
  CLOSED: "Закрыт",
};

const tradingViewLabels = {
  fills: "Исполнения",
  orders: "Ордера",
  positions: "Фьючерсные позиции",
  funding: "Funding",
};

export function useTradingAdmin({ activeSection } = {}) {
  const [tradingView, setTradingView] = useState("fills");
  const [tradingMarket, setTradingMarket] = useState("");
  const [tradingSymbol, setTradingSymbol] = useState("");
  const [tradingStatus, setTradingStatus] = useState("");
  const [tradingSearch, setTradingSearch] = useState("");
  const [tradingPage, setTradingPage] = useState(0);
  const [tradingData, setTradingData] = useState({ items: [], total: 0, summary: {} });
  const [tradingLoading, setTradingLoading] = useState(false);
  const [marketPair, setMarketPair] = useState("BTC-USDT");
  const [marketSnapshot, setMarketSnapshot] = useState(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const tradingRequestRef = useRef(0);
  const loadTrading = (silent = false) => {
    const requestId = tradingRequestRef.current + 1;
    tradingRequestRef.current = requestId;
    if (!silent) setTradingLoading(true);
    api
      .get("/admin/trading", {
        params: {
          view: tradingView,
          market: tradingMarket || undefined,
          symbol: tradingSymbol || undefined,
          status: tradingStatus || undefined,
          search: tradingSearch.trim() || undefined,
          limit: 50,
          offset: tradingPage * 50,
        },
      })
      .then((response) => {
        if (tradingRequestRef.current === requestId) {
          setTradingData(response.data || { items: [], total: 0, summary: {} });
        }
      })
      .catch((error) => {
        if (!silent && tradingRequestRef.current === requestId) {
          enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить историю трейдинга"), {
            variant: "error",
          });
        }
      })
      .finally(() => {
        if (tradingRequestRef.current === requestId) setTradingLoading(false);
      });
  };
  const loadExchangeMarket = (silent = false) => {
    if (!silent) setMarketLoading(true);
    api.get(`/exchange/market/${marketPair}`)
      .then((response) => setMarketSnapshot(response.data || null))
      .catch((error) => {
        if (!silent) enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить биржевой стакан"), { variant: "error" });
      })
      .finally(() => setMarketLoading(false));
  };
  useEffect(() => {
    if (activeSection !== "trading") return undefined;
    const timer = window.setTimeout(() => loadTrading(), 300);
    return () => window.clearTimeout(timer);
  }, [activeSection, tradingView, tradingMarket, tradingSymbol, tradingStatus, tradingSearch, tradingPage]);
  useEffect(() => {
    if (activeSection !== "trading") return undefined;
    loadExchangeMarket();
    const timer = window.setInterval(() => loadExchangeMarket(true), 7000);
    return () => window.clearInterval(timer);
  }, [activeSection, marketPair]);

  return { loadExchangeMarket, loadTrading, marketLoading, marketPair, marketSnapshot, setMarketLoading, setMarketPair, setMarketSnapshot, setTradingData, setTradingLoading, setTradingMarket, setTradingPage, setTradingSearch, setTradingStatus, setTradingSymbol, setTradingView, tradingData, tradingLoading, tradingMarket, tradingPage, tradingRequestRef, tradingSearch, tradingStatus, tradingSymbol, tradingView };
}

export function TradingSection({ loadExchangeMarket, loadTrading, marketLoading, marketPair, marketSnapshot, setMarketPair, setTradingMarket, setTradingPage, setTradingSearch, setTradingStatus, setTradingSymbol, setTradingView, tradingData, tradingLoading, tradingMarket, tradingPage, tradingSearch, tradingStatus, tradingSymbol, tradingView }) {
  return (
 (
        <section className={styles.admin_trading}>
          <div className={styles.admin_dealsTop}>
            <div>
              <h2>Мониторинг трейдинга</h2>
              <p>Spot-сделки, торговые ордера, фьючерсы и funding пользователей</p>
            </div>
            <button type="button" onClick={() => { loadTrading(); loadExchangeMarket(); }} disabled={tradingLoading}>
              <FiRefreshCw />
              {tradingLoading ? "Обновляем" : "Обновить"}
            </button>
          </div>

          <div className={styles.admin_tradingStats}>
            <article><span>Исполнений</span><strong>{tradingData.summary?.totalFills || 0}</strong></article>
            <article><span>Spot-объём</span><strong>{formatTradingAmount(tradingData.summary?.spotVolume, 2)} USDT</strong></article>
            <article><span>Futures-объём</span><strong>{formatTradingAmount(tradingData.summary?.futuresVolume, 2)} USDT</strong></article>
            <article><span>Активные ордера</span><strong>{tradingData.summary?.openOrders || 0}</strong></article>
            <article><span>Открытые позиции</span><strong>{tradingData.summary?.openPositions || 0}</strong></article>
            <article><span>Реализованный PnL</span><strong className={Number(tradingData.summary?.realizedPnl || 0) >= 0 ? styles.admin_positive : styles.admin_negative}>{formatTradingAmount(tradingData.summary?.realizedPnl, 2)} USDT</strong></article>
          </div>

          <section className={styles.admin_exchangeDepth} aria-label="Биржевой стакан">
            <div className={styles.admin_exchangeDepthHeader}>
              <div><h3>Стакан биржи</h3><span>{marketSnapshot?.source || "Публичный рынок"} · заявки покупки и продажи</span></div>
              <label>
                <span className={styles.admin_srOnly}>Торговая пара стакана</span>
                <select value={marketPair} onChange={(event) => setMarketPair(event.target.value)}>
                  <option value="BTC-USDT">BTC/USDT</option><option value="ETH-USDT">ETH/USDT</option>
                </select>
              </label>
            </div>
            {marketLoading && !marketSnapshot ? <p className={styles.admin_exchangeDepthEmpty}>Загружаем стакан…</p> : (
              <div className={styles.admin_exchangeDepthGrid}>
                <AdminMarketChart candles={marketSnapshot?.candles || []} />
                {[{ key: "asks", title: "Продажа", className: styles.admin_negative }, { key: "bids", title: "Покупка", className: styles.admin_positive }].map((side) => (
                  <div key={side.key}>
                    <h4 className={side.className}>{side.title}</h4>
                    <div className={styles.admin_exchangeDepthLabels}><span>Цена USDT</span><span>Количество</span></div>
                    {(marketSnapshot?.depth?.[side.key] || []).slice(0, 6).map((row) => (
                      <div className={styles.admin_exchangeDepthRow} key={`${side.key}-${row.price}`}><span>{formatTradingAmount(row.price, 2)}</span><b>{formatTradingAmount(row.quantity, 8)} {marketPair.split("-")[0]}</b></div>
                    ))}
                    {!marketSnapshot?.depth?.[side.key]?.length && <p className={styles.admin_exchangeDepthEmpty}>Данные временно недоступны</p>}
                  </div>
                ))}
              </div>
            )}
            <p className={styles.admin_exchangeDepthNote}>Это публичные заявки {marketSnapshot?.source || "биржи"} для справки; исполнение ордеров Goblin происходит отдельно.</p>
          </section>

          <div className={styles.admin_tradingViews}>
            {Object.entries(tradingViewLabels).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={tradingView === value ? styles.admin_filterActive : ""}
                onClick={() => { setTradingView(value); setTradingPage(0); setTradingStatus(""); }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={styles.admin_tradingToolbar}>
            <label className={styles.admin_search}>
              <FiSearch />
              <input
                value={tradingSearch}
                placeholder="Email, логин или ID"
                onChange={(event) => { setTradingSearch(event.target.value); setTradingPage(0); }}
              />
            </label>
            {(tradingView === "fills" || tradingView === "orders") && (
              <select value={tradingMarket} onChange={(event) => { setTradingMarket(event.target.value); setTradingPage(0); }}>
                <option value="">Все рынки</option>
                <option value="SPOT">Спот</option>
                <option value="FUTURES">Фьючерсы</option>
              </select>
            )}
            <select value={tradingSymbol} onChange={(event) => { setTradingSymbol(event.target.value); setTradingPage(0); }}>
              <option value="">Все пары</option>
              <option value="BTC-USDT">BTC/USDT</option>
              <option value="ETH-USDT">ETH/USDT</option>
            </select>
            {(tradingView === "orders" || tradingView === "positions") && (
              <select value={tradingStatus} onChange={(event) => { setTradingStatus(event.target.value); setTradingPage(0); }}>
                <option value="">Все статусы</option>
                {tradingView === "orders" ? (
                  <>
                    <option value="OPEN">Открытые</option>
                    <option value="PARTIALLY_FILLED">Частично исполненные</option>
                    <option value="FILLED">Исполненные</option>
                    <option value="CANCELLED">Отменённые</option>
                  </>
                ) : (
                  <>
                    <option value="OPEN">Открытые</option>
                    <option value="CLOSED">Закрытые</option>
                  </>
                )}
              </select>
            )}
          </div>

          <div className={styles.admin_tradingTable}>
            {tradingView === "fills" && (
              <>
                <div className={`${styles.admin_tradingHead} ${styles.admin_tradingFillsGrid}`}><span>ID / дата</span><span>Рынок</span><span>Покупатель</span><span>Продавец</span><span>Цена</span><span>Количество</span><span>Объём</span></div>
                {!tradingLoading && tradingData.items.map((fill) => (
                  <div key={fill.id} className={`${styles.admin_tradingRow} ${styles.admin_tradingFillsGrid}`}>
                    <span><strong>#{fill.id}</strong><small>{formatDate(fill.created_at)}</small></span>
                    <span><b>{fill.market}</b><small>{String(fill.symbol).replace("-", "/")}</small></span>
                    <span><strong>{fill.buyer_email}</strong><small>ID {fill.buyer_id} · ордер #{fill.taker_side === "BUY" ? fill.taker_order_id : fill.maker_order_id}</small></span>
                    <span><strong>{fill.seller_email}</strong><small>ID {fill.seller_id} · ордер #{fill.taker_side === "SELL" ? fill.taker_order_id : fill.maker_order_id}</small></span>
                    <span>{formatTradingAmount(fill.price, 2)} USDT</span>
                    <span>{formatTradingAmount(fill.quantity)} {String(fill.symbol).split("-")[0]}</span>
                    <span>{formatTradingAmount(fill.quote_amount, 2)} USDT</span>
                  </div>
                ))}
              </>
            )}

            {tradingView === "orders" && (
              <>
                <div className={`${styles.admin_tradingHead} ${styles.admin_tradingOrdersGrid}`}><span>Ордер</span><span>Пользователь</span><span>Рынок</span><span>Сторона / тип</span><span>Цена</span><span>Исполнено</span><span>Статус</span></div>
                {!tradingLoading && tradingData.items.map((order) => (
                  <div key={order.id} className={`${styles.admin_tradingRow} ${styles.admin_tradingOrdersGrid}`}>
                    <span><strong>#{order.id}</strong><small>{formatDate(order.created_at)}</small></span>
                    <span><strong>{order.user_email}</strong><small>ID {order.user_id}</small></span>
                    <span><b>{order.market}</b><small>{String(order.symbol).replace("-", "/")}{order.leverage ? ` · ${order.leverage}×` : ""}</small></span>
                    <span className={order.side === "BUY" ? styles.admin_positive : styles.admin_negative}>{order.side === "BUY" ? "Покупка" : "Продажа"}<small>{order.order_type}{order.reduce_only ? " · Reduce only" : ""}</small></span>
                    <span>{formatTradingAmount(order.price, 2)} USDT<small>средняя {formatTradingAmount(order.average_price, 2)}</small></span>
                    <span>{formatTradingAmount(order.filled_quantity)} / {formatTradingAmount(order.quantity)}</span>
                    <span><em className={styles.admin_tradingStatus}>{tradingStatusLabels[order.status] || order.status}</em><small>резерв {formatTradingAmount(order.reserved_amount)} {order.reserved_currency}</small></span>
                  </div>
                ))}
              </>
            )}

            {tradingView === "positions" && (
              <>
                <div className={`${styles.admin_tradingHead} ${styles.admin_tradingPositionsGrid}`}><span>Позиция</span><span>Пользователь</span><span>Контракт</span><span>Сторона</span><span>Вход</span><span>Маржа / ликвидация</span><span>PnL / статус</span></div>
                {!tradingLoading && tradingData.items.map((position) => (
                  <div key={position.id} className={`${styles.admin_tradingRow} ${styles.admin_tradingPositionsGrid}`}>
                    <span><strong>#{position.id}</strong><small>{formatDate(position.created_at)}</small></span>
                    <span><strong>{position.user_email}</strong><small>ID {position.user_id}</small></span>
                    <span><b>{String(position.symbol).replace("-", "/")}</b><small>{position.leverage}× · {formatTradingAmount(position.quantity)} {String(position.symbol).split("-")[0]}</small></span>
                    <span className={position.side === "LONG" ? styles.admin_positive : styles.admin_negative}>{position.side}</span>
                    <span>{formatTradingAmount(position.entry_price, 2)} USDT</span>
                    <span>{formatTradingAmount(position.margin, 2)} USDT<small>ликв. {formatTradingAmount(position.liquidation_price, 2)}</small></span>
                    <span className={Number(position.realized_pnl || 0) >= 0 ? styles.admin_positive : styles.admin_negative}>{formatTradingAmount(position.realized_pnl, 2)} USDT<small>{tradingStatusLabels[position.status] || position.status}{position.closed_at ? ` · ${formatDate(position.closed_at)}` : ""}</small></span>
                  </div>
                ))}
              </>
            )}

            {tradingView === "funding" && (
              <>
                <div className={`${styles.admin_tradingHead} ${styles.admin_tradingFundingGrid}`}><span>Платёж</span><span>Пользователь</span><span>Позиция</span><span>Контракт</span><span>Ставка</span><span>Сумма</span><span>Дата</span></div>
                {!tradingLoading && tradingData.items.map((payment) => (
                  <div key={payment.id} className={`${styles.admin_tradingRow} ${styles.admin_tradingFundingGrid}`}>
                    <span><strong>#{payment.id}</strong></span>
                    <span><strong>{payment.user_email}</strong><small>ID {payment.user_id}</small></span>
                    <span>#{payment.position_id}<small>{payment.position_side} · {payment.position_leverage}×</small></span>
                    <span>{String(payment.symbol).replace("-", "/")}</span>
                    <span>{formatTradingAmount(Number(payment.rate) * 100, 5)}%</span>
                    <span className={Number(payment.amount || 0) >= 0 ? styles.admin_positive : styles.admin_negative}>{Number(payment.amount || 0) > 0 ? "+" : ""}{formatTradingAmount(payment.amount, 8)} USDT</span>
                    <span>{formatDate(payment.created_at)}</span>
                  </div>
                ))}
              </>
            )}

            {tradingLoading && <div className={styles.admin_dealsEmpty}>Загружаем торговую историю...</div>}
            {!tradingLoading && tradingData.items.length === 0 && <div className={styles.admin_dealsEmpty}>Записи не найдены</div>}
          </div>

          <div className={styles.admin_pagination}>
            <span>Показано {tradingData.items.length} из {tradingData.total || 0}</span>
            <div>
              <button type="button" disabled={tradingPage === 0 || tradingLoading} onClick={() => setTradingPage((page) => Math.max(page - 1, 0))}>Назад</button>
              <b>Страница {tradingPage + 1}</b>
              <button type="button" disabled={(tradingPage + 1) * 50 >= tradingData.total || tradingLoading} onClick={() => setTradingPage((page) => page + 1)}>Далее</button>
            </div>
          </div>
        </section>
      )
  );
}
