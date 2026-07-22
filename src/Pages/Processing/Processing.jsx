import { useEffect, useMemo, useState } from "react";
import { enqueueSnackbar } from "notistack";
import {
  FiCheckCircle,
  FiClock,
  FiCopy,
  FiCreditCard,
  FiRefreshCw,
  FiSearch,
  FiSend,
} from "react-icons/fi";
import api from "../../api";
import { getApiErrorMessage } from "../../utils/notifications";
import bg from "../../assets/images/Group 756.png";
import styles from "./Processing.module.scss";

const statusLabels = {
  ACTIVE: "Активна",
  COMPLETED: "Завершена",
  PAUSED: "Пауза",
  PENDING: "Ожидает",
  CONFIRMED: "Подтверждена",
  FAILED: "Ошибка",
  CANCELLED: "Отменена",
};

const currencySymbols = {
  USD: "$",
  EUR: "€",
  RUB: "₽",
};

const emptyTransactionDraft = {
  requisiteId: "",
  amount: "",
  externalId: "",
  payerName: "",
  payerAccount: "",
  comment: "",
};

const formatMoney = (value, currency = "RUB") =>
  `${currencySymbols[currency] || currency} ${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0))}`;

const formatDate = (value) => (value ? new Date(value).toLocaleString("ru-RU") : "-");

const getPercent = (value, limit) => {
  const numericLimit = Number(limit || 0);
  if (numericLimit <= 0) return 0;
  return Math.min(100, Math.max(0, (Number(value || 0) / numericLimit) * 100));
};

const getRequisiteText = (requisite) =>
  [
    requisite.bankName,
    requisite.holderName,
    requisite.cardNumber,
    requisite.accountNumber,
    requisite.iban,
    requisite.phone,
  ]
    .filter(Boolean)
    .join(" · ");

export const Processing = () => {
  const [deals, setDeals] = useState([]);
  const [selectedDealId, setSelectedDealId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [transactionDraft, setTransactionDraft] = useState(emptyTransactionDraft);
  const [saving, setSaving] = useState(false);

  const selectedDeal = detail?.deal || deals.find((deal) => deal.id === selectedDealId) || null;
  const activeDealsCount = deals.filter((deal) => deal.status === "ACTIVE").length;
  const totalTarget = useMemo(
    () => deals.reduce((sum, deal) => sum + Number(deal.targetAmount || 0), 0),
    [deals]
  );
  const totalProcessed = useMemo(
    () => deals.reduce((sum, deal) => sum + Number(deal.processedAmount || 0), 0),
    [deals]
  );

  const loadDeals = (silent = false) => {
    if (!silent) setLoading(true);

    api
      .get("/processing", { params: { search: search.trim() || undefined } })
      .then((response) => {
        const items = Array.isArray(response.data?.items) ? response.data.items : [];
        setDeals(items);
        setSelectedDealId((current) => current || items[0]?.id || null);
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить процессинг"), {
          variant: "error",
        });
      })
      .finally(() => setLoading(false));
  };

  const loadDetail = (dealId = selectedDealId, silent = false) => {
    if (!dealId) {
      setDetail(null);
      return;
    }

    if (!silent) setDetailLoading(true);
    api
      .get(`/processing/${dealId}`)
      .then((response) => setDetail(response.data || null))
      .catch((error) => {
        setDetail(null);
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить сделку процессинга"), {
          variant: "error",
        });
      })
      .finally(() => setDetailLoading(false));
  };

  useEffect(() => {
    document.title = "Процессинг - Goblin";
    loadDeals();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadDeals(true), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadDetail(selectedDealId);
    setTransactionDraft(emptyTransactionDraft);
  }, [selectedDealId]);

  const copyText = async (value) => {
    if (!value || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    enqueueSnackbar("Скопировано", { variant: "success" });
  };

  const handleSubmitTransaction = (event) => {
    event.preventDefault();
    if (!selectedDealId || saving) return;

    const payload = {
      ...transactionDraft,
      requisiteId: Number(transactionDraft.requisiteId || 0),
      amount: Number(transactionDraft.amount || 0),
      status: "PENDING",
    };

    if (!payload.requisiteId || payload.amount <= 0) {
      enqueueSnackbar("Выберите реквизит и укажите сумму", { variant: "warning" });
      return;
    }

    setSaving(true);
    api
      .post(`/processing/${selectedDealId}/transactions`, payload)
      .then(() => {
        setTransactionDraft(emptyTransactionDraft);
        loadDeals(true);
        loadDetail(selectedDealId, true);
        enqueueSnackbar("Транзакция отправлена на проверку", { variant: "success" });
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось отправить транзакцию"), {
          variant: "error",
        });
      })
      .finally(() => setSaving(false));
  };

  return (
    <main className={styles.processing}>
      <img src={bg} className="background" alt="" />

      <section className={styles.processing_top}>
        <div>
          <h1 className="h1 title">Процессинг</h1>
          <p>Сделки с несколькими реквизитами и множеством транзакций до общего лимита в $ € ₽.</p>
        </div>
        <button type="button" onClick={() => { loadDeals(); loadDetail(selectedDealId, true); }} disabled={loading}>
          <FiRefreshCw />
          {loading ? "Обновляем" : "Обновить"}
        </button>
      </section>

      <section className={styles.processing_stats}>
        <article>
          <FiCreditCard />
          <span>Доступно</span>
          <strong>{deals.length}</strong>
        </article>
        <article>
          <FiClock />
          <span>Активные</span>
          <strong>{activeDealsCount}</strong>
        </article>
        <article>
          <FiCheckCircle />
          <span>Обработано</span>
          <strong>{formatMoney(totalProcessed, selectedDeal?.fiatCurrency || "RUB")}</strong>
        </article>
        <article>
          <FiSend />
          <span>Общий лимит</span>
          <strong>{formatMoney(totalTarget, selectedDeal?.fiatCurrency || "RUB")}</strong>
        </article>
      </section>

      <section className={styles.processing_grid}>
        <aside className={styles.processing_list}>
          <label className={styles.processing_search}>
            <FiSearch />
            <input
              value={search}
              placeholder="Найти по ID или названию"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className={styles.processing_deals}>
            {loading && <div className={styles.processing_empty}>Загружаем сделки...</div>}
            {!loading && deals.length === 0 && <div className={styles.processing_empty}>Доступных сделок пока нет</div>}
            {!loading && deals.map((deal) => {
              const progress = getPercent(deal.processedAmount, deal.targetAmount);
              return (
                <button
                  key={deal.id}
                  type="button"
                  className={`${styles.processing_deal} ${selectedDealId === deal.id ? styles.processing_deal_active : ""}`}
                  onClick={() => setSelectedDealId(deal.id)}
                >
                  <div>
                    <strong>#{deal.id} · {deal.title}</strong>
                    <span>{statusLabels[deal.status] || deal.status} · {deal.requisitesCount} рекв.</span>
                  </div>
                  <div className={styles.processing_progress}>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <footer>
                    <b>{formatMoney(deal.processedAmount, deal.fiatCurrency)}</b>
                    <small>из {formatMoney(deal.targetAmount, deal.fiatCurrency)}</small>
                  </footer>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={styles.processing_detail}>
          {detailLoading && <div className={styles.processing_empty}>Загружаем детали...</div>}
          {!detailLoading && !detail && <div className={styles.processing_empty}>Выберите сделку слева</div>}

          {!detailLoading && detail && (
            <>
              <div className={styles.processing_detailTop}>
                <div>
                  <span>{statusLabels[detail.deal.status] || detail.deal.status}</span>
                  <h2>#{detail.deal.id} · {detail.deal.title}</h2>
                  <p>{formatMoney(detail.deal.processedAmount, detail.deal.fiatCurrency)} из {formatMoney(detail.deal.targetAmount, detail.deal.fiatCurrency)}</p>
                </div>
              </div>

              <div className={styles.processing_progress}>
                <span style={{ width: `${getPercent(detail.deal.processedAmount, detail.deal.targetAmount)}%` }} />
              </div>

              <div className={styles.processing_columns}>
                <div className={styles.processing_card}>
                  <h3>Реквизиты</h3>
                  {detail.requisites.length === 0 && <div className={styles.processing_empty}>Активных реквизитов нет</div>}
                  {detail.requisites.map((requisite) => (
                    <article key={requisite.id} className={styles.processing_requisite}>
                      <div>
                        <strong>{requisite.label}</strong>
                        <button type="button" onClick={() => copyText(getRequisiteText(requisite))}>
                          <FiCopy />
                        </button>
                      </div>
                      <p>{getRequisiteText(requisite) || "Реквизиты уточняются"}</p>
                      <div className={styles.processing_progress}>
                        <span style={{ width: `${getPercent(requisite.usedAmount, requisite.limitAmount)}%` }} />
                      </div>
                      <footer>
                        <span>{formatMoney(requisite.usedAmount, requisite.fiatCurrency)} / {formatMoney(requisite.limitAmount, requisite.fiatCurrency)}</span>
                        <small>лимит транзакции: {formatMoney(requisite.minTransactionAmount, requisite.fiatCurrency)}–{formatMoney(requisite.maxTransactionAmount, requisite.fiatCurrency)}</small>
                      </footer>
                    </article>
                  ))}
                </div>

                <form className={styles.processing_card} onSubmit={handleSubmitTransaction}>
                  <h3>Отправить транзакцию</h3>
                  <label>
                    <span>Реквизит</span>
                    <select
                      value={transactionDraft.requisiteId}
                      disabled={detail.deal.status !== "ACTIVE"}
                      onChange={(event) => setTransactionDraft((current) => ({ ...current, requisiteId: event.target.value }))}
                    >
                      <option value="">Выберите реквизит</option>
                      {detail.requisites.map((requisite) => (
                        <option key={requisite.id} value={requisite.id}>{requisite.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Сумма</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={transactionDraft.amount}
                      disabled={detail.deal.status !== "ACTIVE"}
                      placeholder="0.00"
                      onChange={(event) => setTransactionDraft((current) => ({ ...current, amount: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>ID платежа / комментарий банка</span>
                    <input
                      value={transactionDraft.externalId}
                      disabled={detail.deal.status !== "ACTIVE"}
                      placeholder="опционально"
                      onChange={(event) => setTransactionDraft((current) => ({ ...current, externalId: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Плательщик</span>
                    <input
                      value={transactionDraft.payerName}
                      disabled={detail.deal.status !== "ACTIVE"}
                      placeholder="ФИО отправителя"
                      onChange={(event) => setTransactionDraft((current) => ({ ...current, payerName: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Заметка</span>
                    <input
                      value={transactionDraft.comment}
                      disabled={detail.deal.status !== "ACTIVE"}
                      placeholder="Внутренний комментарий"
                      onChange={(event) => setTransactionDraft((current) => ({ ...current, comment: event.target.value }))}
                    />
                  </label>
                  <button type="submit" disabled={saving || detail.deal.status !== "ACTIVE"}>
                    {saving ? "Отправляем..." : "Отправить на проверку"}
                  </button>
                </form>
              </div>

              <div className={styles.processing_card}>
                <h3>Мои транзакции по сделке</h3>
                {detail.transactions.length === 0 && <div className={styles.processing_empty}>Транзакций пока нет</div>}
                <div className={styles.processing_transactions}>
                  {detail.transactions.map((transaction) => (
                    <article key={transaction.id}>
                      <div>
                        <strong>#{transaction.id} · {formatMoney(transaction.amount, transaction.fiatCurrency)}</strong>
                        <span className={styles[`processing_status_${transaction.status}`]}>{statusLabels[transaction.status] || transaction.status}</span>
                      </div>
                      <p>{transaction.requisiteLabel || "Без реквизита"} · {transaction.externalId || "без external id"}</p>
                      <small>{formatDate(transaction.createdAt)}</small>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
};

export default Processing;
