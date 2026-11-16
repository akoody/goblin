// Админка, раздел «P2P сделки: список, фильтры, создание сделки от имени админа». Состояние и загрузка в хуке useP2pDealsAdmin: он вызывается в Admin, поэтому данные
// и черновики не теряются при переключении вкладок. Разметка в P2pDealsSection.
import { useEffect, useMemo, useState } from "react";
import { P2pFeePolicy } from "../P2PFeePolicy";
import { FiFilter, FiSearch, FiRefreshCw } from "react-icons/fi";
import { Link } from "react-router-dom";
import { enqueueSnackbar } from "notistack";
import api from "../../../api";
import { getApiErrorMessage } from "../../../utils/notifications";
import styles from "../Admin.module.scss";
import { formatDate } from "../adminFormat";

const dealEndpoints = ["/deal/admin/all", "/admin/deals", "/deal/all"];

const dealStatusLabels = {
  all: "Все",
  active: "Активные",
  completed: "Завершенные",
  cancelled: "Отмененные",
};

const emptyP2pDealDraft = {
  orderId: "",
  counterpartyUserId: "",
  cryptoAmount: "",
  paymentMethod: "",
};

const getDealStatusGroup = (status) => {
  if (status === "COMPLETED") {
    return "completed";
  }

  if (status === "CANCELLED") {
    return "cancelled";
  }

  return "active";
};

const getDealUserName = (user) => {
  return user?.username || user?.email || user?.fullName || `ID ${user?.id || "-"}`;
};

export function useP2pDealsAdmin({  } = {}) {
  const [deals, setDeals] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsError, setDealsError] = useState("");
  const [dealStatusFilter, setDealStatusFilter] = useState("all");
  const [dealSearchValue, setDealSearchValue] = useState("");
  const [p2pDealDraft, setP2pDealDraft] = useState(emptyP2pDealDraft);
  const [p2pDealSaving, setP2pDealSaving] = useState(false);
  const loadDeals = async () => {
    setDealsLoading(true);
    setDealsError("");

    for (const endpoint of dealEndpoints) {
      try {
        const response = await api.get(endpoint);
        const nextDeals = Array.isArray(response.data)
          ? response.data
          : response.data?.items || response.data?.deals || [];

        setDeals(nextDeals);
        setDealsLoading(false);
        return;
      } catch (error) {
        if (error.response?.status === 401) {
          localStorage.removeItem("token");
          window.location.reload();
          return;
        }

        if (error.response?.status !== 404) {
          setDealsError("Не удалось загрузить P2P сделки.");
          setDealsLoading(false);
          return;
        }
      }
    }

    try {
      const response = await api.get("/deal/my-deals");
      setDeals(Array.isArray(response.data) ? response.data : []);
      setDealsError("Backend пока не отдает общий список сделок. Показаны доступные сделки текущего аккаунта.");
    } catch (error) {
      setDeals([]);
      setDealsError("Backend пока не отдает общий список P2P сделок.");
    } finally {
      setDealsLoading(false);
    }
  };
  const handleCreateP2pDeal = (event) => {
    event.preventDefault();
    if (p2pDealSaving) return;
    const payload = {
      orderId: Number(p2pDealDraft.orderId),
      counterpartyUserId: Number(p2pDealDraft.counterpartyUserId),
      cryptoAmount: Number(p2pDealDraft.cryptoAmount),
      paymentMethod: p2pDealDraft.paymentMethod,
    };
    if (!Number.isInteger(payload.orderId) || !Number.isInteger(payload.counterpartyUserId) || payload.cryptoAmount <= 0) {
      enqueueSnackbar("Укажите ID ордера, ID контрагента и сумму USDT", { variant: "warning" });
      return;
    }
    setP2pDealSaving(true);
    api.post("/admin/deals", payload)
      .then(() => {
        setP2pDealDraft(emptyP2pDealDraft);
        loadDeals();
        enqueueSnackbar("P2P-сделка создана и USDT помещены в эскроу", { variant: "success" });
      })
      .catch((error) => enqueueSnackbar(getApiErrorMessage(error, "Не удалось создать P2P-сделку"), { variant: "error" }))
      .finally(() => setP2pDealSaving(false));
  };
  const activeDealsCount = deals.filter(
    (deal) => getDealStatusGroup(deal.status) === "active"
  ).length;
  const filteredDeals = useMemo(() => {
    const normalizedSearch = dealSearchValue.trim().toLowerCase();

    return deals.filter((deal) => {
      const statusGroup = getDealStatusGroup(deal.status);
      const matchesStatus =
        dealStatusFilter === "all" || dealStatusFilter === statusGroup;
      const matchesSearch =
        !normalizedSearch ||
        [
          deal.id,
          deal.status,
          deal.order?.id,
          deal.order?.type,
          deal.order?.amount,
          deal.order?.price,
          getDealUserName(deal.buyer),
          getDealUserName(deal.seller),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [dealSearchValue, dealStatusFilter, deals]);

  useEffect(() => {
    loadDeals();
  }, []);

  return { activeDealsCount, dealSearchValue, dealStatusFilter, deals, dealsError, dealsLoading, filteredDeals, handleCreateP2pDeal, loadDeals, p2pDealDraft, p2pDealSaving, setDealSearchValue, setDealStatusFilter, setDeals, setDealsError, setDealsLoading, setP2pDealDraft, setP2pDealSaving };
}

export function P2pDealsSection({ dealSearchValue, dealStatusFilter, deals, dealsError, dealsLoading, filteredDeals, handleCreateP2pDeal, loadDeals, p2pDealDraft, p2pDealSaving, paymentDefinitions, setDealSearchValue, setDealStatusFilter, setP2pDealDraft }) {
  return (
 (
        <section className={styles.admin_deals}>
          <div className={styles.admin_dealsTop}>
            <div>
              <h2>Все P2P сделки</h2>
              <p>{filteredDeals.length} из {deals.length}</p>
            </div>
            <button type="button" onClick={loadDeals} disabled={dealsLoading}>
              <FiRefreshCw />
              {dealsLoading ? "Обновляем" : "Обновить"}
            </button>
          </div>

          <P2pFeePolicy />

          <form className={styles.admin_p2pDealForm} onSubmit={handleCreateP2pDeal}>
            <div>
              <h3>Создать P2P-сделку</h3>
              <p>Сумма продавца резервируется целиком. Комиссия по действующему тарифу удержится только при успешном завершении; при отмене резерв вернётся полностью.</p>
            </div>
            <label><span>ID ордера</span><input inputMode="numeric" value={p2pDealDraft.orderId} onChange={(event) => setP2pDealDraft((current) => ({ ...current, orderId: event.target.value }))} /></label>
            <label><span>ID контрагента</span><input inputMode="numeric" value={p2pDealDraft.counterpartyUserId} onChange={(event) => setP2pDealDraft((current) => ({ ...current, counterpartyUserId: event.target.value }))} /></label>
            <label><span>Сумма USDT</span><input type="number" min="0" step="0.000001" value={p2pDealDraft.cryptoAmount} onChange={(event) => setP2pDealDraft((current) => ({ ...current, cryptoAmount: event.target.value }))} /></label>
            <label><span>Способ оплаты</span><select value={p2pDealDraft.paymentMethod} onChange={(event) => setP2pDealDraft((current) => ({ ...current, paymentMethod: event.target.value }))}><option value="">Первый из ордера</option>{paymentDefinitions.filter((method) => method.active).map((method) => <option key={method.code} value={method.code}>{method.name}</option>)}</select></label>
            <button type="submit" disabled={p2pDealSaving}>{p2pDealSaving ? "Создаем..." : "Создать сделку"}</button>
          </form>

          <div className={styles.admin_dealsToolbar}>
            <label className={styles.admin_search}>
              <FiSearch />
              <input
                value={dealSearchValue}
                placeholder="ID сделки, ордер, участник, статус"
                onChange={(event) => setDealSearchValue(event.target.value)}
              />
            </label>
            <div className={styles.admin_filters} aria-label="Фильтр P2P сделок">
              <FiFilter />
              {Object.entries(dealStatusLabels).map(([status, label]) => (
                <button
                  key={status}
                  type="button"
                  className={
                    dealStatusFilter === status ? styles.admin_filterActive : ""
                  }
                  onClick={() => setDealStatusFilter(status)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {dealsError && <div className={styles.admin_warning}>{dealsError}</div>}

          <div className={styles.admin_dealsTable}>
            <div className={styles.admin_dealsHead}>
              <span>Сделка</span>
              <span>Ордер</span>
              <span>Участники</span>
              <span>Сумма</span>
              <span>Цена</span>
              <span>Статус</span>
              <span>Создана</span>
            </div>

            {dealsLoading && (
              <div className={styles.admin_dealsEmpty}>Загружаем сделки...</div>
            )}

            {!dealsLoading && filteredDeals.length === 0 && (
              <div className={styles.admin_dealsEmpty}>Сделки не найдены</div>
            )}

            {!dealsLoading &&
              filteredDeals.map((deal) => (
                <Link
                  key={deal.id}
                  to={`/deal/${deal.id}`}
                  className={styles.admin_dealRow}
                >
                  <span>#{deal.id}</span>
                  <span>#{deal.order?.id || "-"}</span>
                  <span>
                    <strong>{getDealUserName(deal.buyer)}</strong>
                    <small>{getDealUserName(deal.seller)}</small>
                  </span>
                  <span>{deal.crypto_amount || deal.order?.amount || "-"} USDT</span>
                  <span>{deal.price || deal.order?.price || "-"} RUB</span>
                  <span className={styles[`admin_dealStatus_${getDealStatusGroup(deal.status)}`]}>
                    {deal.status || "-"}
                  </span>
                  <span>{formatDate(deal.createdAt || deal.order?.createdAt)}</span>
                </Link>
              ))}
          </div>
        </section>
      )
  );
}
