import { useEffect, useMemo, useState } from "react";
import { enqueueSnackbar } from "notistack";
import {
  FiCheck,
  FiBarChart2,
  FiDollarSign,
  FiGift,
  FiGrid,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiShoppingBag,
  FiTag,
  FiX,
} from "react-icons/fi";
import api from "../../api";
import { getApiErrorMessage } from "../../utils/notifications";
import bg from "../../assets/images/Group 756.png";
import styles from "./NftGifts.module.scss";

const rarityLabels = {
  COMMON: "Обычный",
  UNCOMMON: "Необычный",
  RARE: "Редкий",
  EPIC: "Эпический",
  LEGENDARY: "Легендарный",
};

const formatUsdt = (value) =>
  new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(value || 0)
  );

const GiftVisual = ({ item, compact = false }) => (
  <div
    className={`${styles.nft_visual} ${compact ? styles.nft_visual_compact : ""}`}
    style={{ "--gift-accent": item.accentColor || "#4ca11f" }}
    aria-hidden="true"
  >
    <span className={styles.nft_visual_glow} />
    <b>{item.icon}</b>
    <small>№ {item.serialNumber}</small>
  </div>
);

const GiftCard = ({ item, children, storage = false }) => (
  <article className={styles.nft_card}>
    <GiftVisual item={item} />
    <div className={styles.nft_cardBody}>
      <div className={styles.nft_cardTopline}>
        <span>{item.collectionName}</span>
        <em className={`${styles.nft_rarity} ${styles[`nft_rarity_${String(item.rarity || "COMMON").toLowerCase()}`]}`}>
          {rarityLabels[item.rarity] || item.rarity}
        </em>
      </div>
      <h2>{item.name}</h2>
      <p>{item.description}</p>
      {storage && item.status === "LISTED" && <div className={styles.nft_listingState}><FiTag /> На продаже</div>}
      {children}
    </div>
  </article>
);

export const NftGifts = () => {
  const [view, setView] = useState("market");
  const [marketItems, setMarketItems] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [availableUsdt, setAvailableUsdt] = useState("0.00");
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [priceDrafts, setPriceDrafts] = useState({});
  const [selectedGift, setSelectedGift] = useState(null);
  const [giftHistory, setGiftHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadMarketplace = (term = search, silent = false) => {
    if (!silent) setLoading(true);
    return api
      .get("/nft/marketplace", { params: { search: term.trim() || undefined } })
      .then((response) => setMarketItems(Array.isArray(response.data?.items) ? response.data.items : []))
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить NFT-подарки"), { variant: "error" });
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  const loadInventory = () =>
    api
      .get("/nft/inventory")
      .then((response) => {
        setInventoryItems(Array.isArray(response.data?.items) ? response.data.items : []);
        setAvailableUsdt(response.data?.availableUsdt || "0.00");
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить хранилище"), { variant: "error" });
      });

  const refreshAll = () => Promise.all([loadMarketplace(search), loadInventory()]);

  useEffect(() => {
    document.title = "NFT-подарки - Goblin";
    refreshAll();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadMarketplace(search, true), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filteredMarketItems = useMemo(
    () => marketItems.filter((item) => rarity === "ALL" || item.rarity === rarity),
    [marketItems, rarity]
  );
  const listedItemsCount = inventoryItems.filter((item) => item.status === "LISTED").length;

  const handleBuy = async (item) => {
    if (busyId || !window.confirm(`Купить ${item.name} №${item.serialNumber} за ${formatUsdt(item.price)} USDT?`)) return;
    setBusyId(item.id);
    try {
      await api.post(`/nft/marketplace/${item.id}/buy`);
      enqueueSnackbar("NFT-подарок добавлен в ваше хранилище", { variant: "success" });
      await refreshAll();
    } catch (error) {
      enqueueSnackbar(getApiErrorMessage(error, "Не удалось купить подарок"), { variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const openAnalytics = (item) => {
    setSelectedGift(item);
    setGiftHistory(null);
    setHistoryLoading(true);
    api
      .get(`/nft/gifts/${item.giftId}/history`)
      .then((response) => setGiftHistory(response.data || null))
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить историю продаж"), { variant: "error" });
      })
      .finally(() => setHistoryLoading(false));
  };

  const handleList = async (item) => {
    const price = Number(priceDrafts[item.id] || 0);
    if (!Number.isFinite(price) || price <= 0) {
      enqueueSnackbar("Укажите цену продажи в USDT", { variant: "warning" });
      return;
    }
    setBusyId(item.id);
    try {
      await api.post(`/nft/inventory/${item.id}/list`, { price });
      enqueueSnackbar("Подарок выставлен на продажу", { variant: "success" });
      await refreshAll();
    } catch (error) {
      enqueueSnackbar(getApiErrorMessage(error, "Не удалось выставить подарок"), { variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const handleUnlist = async (item) => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await api.delete(`/nft/inventory/${item.id}/listing`);
      enqueueSnackbar("Подарок снят с продажи", { variant: "success" });
      await refreshAll();
    } catch (error) {
      enqueueSnackbar(getApiErrorMessage(error, "Не удалось снять объявление"), { variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const chartPoints = useMemo(() => {
    const entries = giftHistory?.chart || [];
    if (entries.length < 2) return "";
    const prices = entries.map((entry) => Number(entry.price));
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const range = high - low || Math.max(high * 0.12, 1);
    return entries
      .map((entry, index) => {
        const x = 8 + (index / (entries.length - 1)) * 284;
        const y = 112 - ((Number(entry.price) - low) / range) * 92;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [giftHistory]);

  const chartPrices = useMemo(() => (giftHistory?.chart || []).map((entry) => Number(entry.price)), [giftHistory]);
  const chartMin = chartPrices.length ? Math.min(...chartPrices) : 0;
  const chartMax = chartPrices.length ? Math.max(...chartPrices) : 0;

  return (
    <main className={styles.nft}>
      <img src={bg} className="background" alt="" />

      <section className={styles.nft_hero}>
        <div>
          <span className={styles.nft_eyebrow}><FiGift /> Telegram Gifts</span>
          <h1>Магазин NFT-подарков</h1>
          <p>Покупайте лимитированные подарки за USDT, храните их в аккаунте и выставляйте на перепродажу.</p>
        </div>
        <div className={styles.nft_balance}>
          <span>Доступно для покупки</span>
          <strong>{formatUsdt(availableUsdt)} <small>USDT</small></strong>
          <a href="/me">Пополнить кошелёк</a>
        </div>
      </section>

      <section className={styles.nft_stats}>
        <article><FiShoppingBag /><span>На витрине</span><strong>{marketItems.length}</strong></article>
        <article><FiPackage /><span>В хранилище</span><strong>{inventoryItems.length}</strong></article>
        <article><FiTag /><span>На продаже</span><strong>{listedItemsCount}</strong></article>
        <article><FiDollarSign /><span>Комиссия продажи</span><strong>2.5%</strong></article>
      </section>

      <section className={styles.nft_controls}>
        <div className={styles.nft_tabs} role="tablist" aria-label="NFT-подарки">
          <button type="button" role="tab" aria-selected={view === "market"} className={view === "market" ? styles.nft_tabActive : ""} onClick={() => setView("market")}>
            <FiGrid /> Маркет
          </button>
          <button type="button" role="tab" aria-selected={view === "storage"} className={view === "storage" ? styles.nft_tabActive : ""} onClick={() => setView("storage")}>
            <FiPackage /> Моё хранилище <b>{inventoryItems.length}</b>
          </button>
        </div>
        <button type="button" className={styles.nft_refresh} onClick={() => refreshAll()} disabled={loading || Boolean(busyId)}>
          <FiRefreshCw /> Обновить
        </button>
      </section>

      {view === "market" && (
        <section className={styles.nft_market}>
          <div className={styles.nft_filters}>
            <label className={styles.nft_search}>
              <FiSearch />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, коллекция или номер" />
            </label>
            <div className={styles.nft_rarityFilters}>
              {["ALL", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"].map((value) => (
                <button key={value} type="button" className={rarity === value ? styles.nft_filterActive : ""} onClick={() => setRarity(value)}>
                  {value === "ALL" ? "Все" : rarityLabels[value]}
                </button>
              ))}
            </div>
          </div>

          {loading && <div className={styles.nft_empty}>Загружаем витрину...</div>}
          {!loading && filteredMarketItems.length === 0 && <div className={styles.nft_empty}>По этим условиям подарков не найдено</div>}
          {!loading && filteredMarketItems.length > 0 && (
            <div className={styles.nft_grid}>
              {filteredMarketItems.map((item) => (
                <GiftCard key={item.id} item={item}>
                  <footer className={styles.nft_cardFooter}>
                    <div><span>Цена</span><strong>{formatUsdt(item.price)} <small>USDT</small></strong></div>
                    <div className={styles.nft_cardActions}>
                      <button type="button" className={styles.nft_chartButton} onClick={() => openAnalytics(item)}><FiBarChart2 /> График</button>
                      <button type="button" onClick={() => handleBuy(item)} disabled={busyId === item.id}>
                        <FiShoppingBag /> {busyId === item.id ? "Покупаем..." : "Купить"}
                      </button>
                    </div>
                  </footer>
                </GiftCard>
              ))}
            </div>
          )}
        </section>
      )}

      {view === "storage" && (
        <section className={styles.nft_storage}>
          <header><div><span>Ваши активы</span><h2>Хранилище подарков</h2></div><p>После продажи на баланс поступит цена минус 2.5% комиссии.</p></header>
          {inventoryItems.length === 0 && <div className={styles.nft_empty}>Здесь появятся купленные вами NFT-подарки</div>}
          {inventoryItems.length > 0 && (
            <div className={styles.nft_grid}>
              {inventoryItems.map((item) => (
                <GiftCard key={item.id} item={item} storage>
                  {item.status === "OWNED" ? (
                    <div className={styles.nft_listForm}>
                      <label><span>Цена продажи</span><div><input type="number" min="0.01" step="0.01" inputMode="decimal" value={priceDrafts[item.id] || ""} placeholder={item.acquiredPrice || "0.00"} onChange={(event) => setPriceDrafts((current) => ({ ...current, [item.id]: event.target.value }))} /><b>USDT</b></div></label>
                      <button type="button" onClick={() => handleList(item)} disabled={busyId === item.id}><FiTag /> {busyId === item.id ? "Выставляем..." : "Продать"}</button>
                    </div>
                  ) : (
                    <footer className={styles.nft_cardFooter}>
                      <div><span>Ваша цена</span><strong>{formatUsdt(item.price)} <small>USDT</small></strong></div>
                      <button type="button" className={styles.nft_secondaryButton} onClick={() => handleUnlist(item)} disabled={busyId === item.id}><FiX /> {busyId === item.id ? "Снимаем..." : "Снять"}</button>
                    </footer>
                  )}
                </GiftCard>
              ))}
            </div>
          )}
        </section>
      )}

      {selectedGift && (
        <div className={styles.nft_modalBackdrop} role="presentation" onMouseDown={() => setSelectedGift(null)}>
          <section className={styles.nft_analytics} role="dialog" aria-modal="true" aria-label={`Аналитика ${selectedGift.name}`} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div className={styles.nft_analyticsTitle}>
                <GiftVisual item={{ ...selectedGift, serialNumber: selectedGift.serialNumber || "—" }} compact />
                <div><span>Статистика коллекции</span><h2>{selectedGift.name}</h2><p>{selectedGift.collectionName}</p></div>
              </div>
              <button type="button" aria-label="Закрыть аналитику" onClick={() => setSelectedGift(null)}><FiX /></button>
            </header>

            {historyLoading && <div className={styles.nft_analyticsEmpty}>Загружаем историю продаж...</div>}
            {!historyLoading && giftHistory && (
              <div className={styles.nft_analyticsGrid}>
                <section className={styles.nft_chartPanel}>
                  <div className={styles.nft_chartHeader}>
                    <div><span>Цена последних продаж</span><h3>{giftHistory.chart.length ? `${formatUsdt(giftHistory.chart[giftHistory.chart.length - 1].price)} USDT` : "Нет продаж"}</h3></div>
                    <b>{giftHistory.summary.salesCount} сделок</b>
                  </div>
                  {giftHistory.chart.length < 2 ? (
                    <div className={styles.nft_chartEmpty}>История появится после первых двух покупок этого подарка.</div>
                  ) : (
                    <div className={styles.nft_chart}>
                      <span className={styles.nft_chartMax}>{formatUsdt(chartMax)}</span>
                      <span className={styles.nft_chartMin}>{formatUsdt(chartMin)}</span>
                      <svg viewBox="0 0 300 122" preserveAspectRatio="none" aria-label="График цен продаж">
                        <defs><linearGradient id="nftChartArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#4ca11f" stopOpacity=".28" /><stop offset="100%" stopColor="#4ca11f" stopOpacity="0" /></linearGradient></defs>
                        <path d={`M ${chartPoints.split(" ")[0]} L ${chartPoints} L 292,120 L 8,120 Z`} fill="url(#nftChartArea)" />
                        <polyline points={chartPoints} fill="none" stroke="#3f9820" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                    </div>
                  )}
                  <div className={styles.nft_chartStats}>
                    <span>Мин. <b>{giftHistory.summary.floorPrice ? `${formatUsdt(giftHistory.summary.floorPrice)} USDT` : "—"}</b></span>
                    <span>Средняя <b>{giftHistory.summary.averagePrice ? `${formatUsdt(giftHistory.summary.averagePrice)} USDT` : "—"}</b></span>
                    <span>Макс. <b>{giftHistory.summary.ceilingPrice ? `${formatUsdt(giftHistory.summary.ceilingPrice)} USDT` : "—"}</b></span>
                  </div>
                </section>

                <aside className={styles.nft_salesPanel}>
                  <div className={styles.nft_salesPanelHeader}><div><span>Лента сделок</span><h3>Последние покупки</h3></div><b>{giftHistory.summary.listingsCount} в продаже</b></div>
                  {giftHistory.sales.length === 0 && <div className={styles.nft_salesEmpty}>Продаж пока не было.</div>}
                  {giftHistory.sales.map((sale) => (
                    <article key={sale.id} className={styles.nft_saleRow}>
                      <GiftVisual item={{ ...selectedGift, serialNumber: sale.serialNumber }} compact />
                      <div><strong>№ {sale.serialNumber} · {formatUsdt(sale.price)} USDT</strong><span>{sale.saleType === "PRIMARY" ? "Покупка с витрины" : "Перепродажа"} · {new Date(sale.createdAt).toLocaleDateString("ru-RU")}</span></div>
                      <em>{sale.buyer}</em>
                    </article>
                  ))}
                </aside>
              </div>
            )}
          </section>
        </div>
      )}

      <p className={styles.nft_notice}><FiCheck /> Подарки учитываются и передаются внутри Goblin. Вывод в Telegram или в блокчейн в эту версию не входит.</p>
    </main>
  );
};
