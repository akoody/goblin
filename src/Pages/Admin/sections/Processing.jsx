// Админка, раздел «Платёжный процессинг: сделки, реквизиты, транзакции». Состояние и загрузка в хуке useProcessingAdmin: он вызывается в Admin, поэтому данные
// и черновики не теряются при переключении вкладок. Разметка в ProcessingSection.
import { useEffect, useRef, useState } from "react";
import { FiSearch, FiRefreshCw } from "react-icons/fi";
import { enqueueSnackbar } from "notistack";
import api from "../../../api";
import { getApiErrorMessage } from "../../../utils/notifications";
import styles from "../Admin.module.scss";
import { formatDate } from "../adminFormat";

const emptyProcessingDealDraft = {
  title: "",
  userId: "",
  direction: "IN",
  fiatCurrency: "RUB",
  targetAmount: "",
  minTransactionAmount: "",
  maxTransactionAmount: "",
  comment: "",
};

const emptyProcessingRequisiteDraft = {
  label: "",
  methodCode: "manual",
  holderName: "",
  bankName: "",
  accountNumber: "",
  cardNumber: "",
  phone: "",
  iban: "",
  limitAmount: "",
  minTransactionAmount: "",
  maxTransactionAmount: "",
  priority: 100,
};

const emptyProcessingTransactionDraft = {
  requisiteId: "",
  amount: "",
  status: "PENDING",
  externalId: "",
  payerName: "",
  payerAccount: "",
  comment: "",
};

const processingCurrencySymbols = {
  USD: "$",
  EUR: "€",
  RUB: "₽",
};

const formatFiatAmount = (value, currency = "RUB") =>
  `${processingCurrencySymbols[currency] || currency} ${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0))}`;

const getPercent = (value, limit) => {
  const numericLimit = Number(limit || 0);
  if (numericLimit <= 0) return 0;
  return Math.min(100, Math.max(0, (Number(value || 0) / numericLimit) * 100));
};

const processingStatusLabels = {
  ACTIVE: "Активна",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
  PAUSED: "Пауза",
};

const processingTransactionStatusLabels = {
  PENDING: "Ожидает",
  CONFIRMED: "Подтверждена",
  FAILED: "Ошибка",
  CANCELLED: "Отменена",
};

export function useProcessingAdmin({ activeSection } = {}) {
  const [processingDeals, setProcessingDeals] = useState([]);
  const [processingSummary, setProcessingSummary] = useState({});
  const [processingTotal, setProcessingTotal] = useState(0);
  const [processingLoading, setProcessingLoading] = useState(false);
  const [processingSearch, setProcessingSearch] = useState("");
  const [processingStatus, setProcessingStatus] = useState("");
  const [processingCurrency, setProcessingCurrency] = useState("");
  const [processingPage, setProcessingPage] = useState(0);
  const [selectedProcessingId, setSelectedProcessingId] = useState(null);
  const [processingDetail, setProcessingDetail] = useState(null);
  const [processingDetailLoading, setProcessingDetailLoading] = useState(false);
  const [processingDealDraft, setProcessingDealDraft] = useState(emptyProcessingDealDraft);
  const [processingRequisiteDraft, setProcessingRequisiteDraft] = useState(emptyProcessingRequisiteDraft);
  const [processingTransactionDraft, setProcessingTransactionDraft] = useState(emptyProcessingTransactionDraft);
  const [processingSaving, setProcessingSaving] = useState(false);
  const processingRequestRef = useRef(0);
  const loadProcessing = (silent = false) => {
    const requestId = processingRequestRef.current + 1;
    processingRequestRef.current = requestId;
    if (!silent) setProcessingLoading(true);

    api
      .get("/admin/processing", {
        params: {
          status: processingStatus || undefined,
          currency: processingCurrency || undefined,
          search: processingSearch.trim() || undefined,
          limit: 50,
          offset: processingPage * 50,
        },
      })
      .then((response) => {
        if (processingRequestRef.current !== requestId) return;
        const payload = response.data || {};
        const items = Array.isArray(payload.items) ? payload.items : [];
        setProcessingDeals(items);
        setProcessingTotal(Number(payload.total || 0));
        setProcessingSummary(payload.summary || {});
        setSelectedProcessingId((current) => current || items[0]?.id || null);
      })
      .catch((error) => {
        if (!silent && processingRequestRef.current === requestId) {
          enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить процессинг"), {
            variant: "error",
          });
        }
      })
      .finally(() => {
        if (processingRequestRef.current === requestId) setProcessingLoading(false);
      });
  };
  const loadProcessingDetail = (dealId = selectedProcessingId, silent = false) => {
    if (!dealId) {
      setProcessingDetail(null);
      return;
    }

    if (!silent) setProcessingDetailLoading(true);
    api
      .get(`/admin/processing/${dealId}`)
      .then((response) => setProcessingDetail(response.data || null))
      .catch((error) => {
        setProcessingDetail(null);
        if (!silent) {
          enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить процессинговую сделку"), {
            variant: "error",
          });
        }
      })
      .finally(() => setProcessingDetailLoading(false));
  };
  useEffect(() => {
    if (activeSection !== "processing") return undefined;
    const timer = window.setTimeout(() => loadProcessing(), 300);
    return () => window.clearTimeout(timer);
  }, [activeSection, processingStatus, processingCurrency, processingSearch, processingPage]);
  useEffect(() => {
    if (activeSection !== "processing") return;
    loadProcessingDetail(selectedProcessingId);
  }, [activeSection, selectedProcessingId]);
  const handleCreateProcessingDeal = (event) => {
    event.preventDefault();
    if (processingSaving) return;

    const rawUserId = String(processingDealDraft.userId || "").trim();
    const payload = {
      ...processingDealDraft,
      title: processingDealDraft.title.trim(),
      userId: rawUserId ? Number(rawUserId) : null,
      targetAmount: Number(processingDealDraft.targetAmount || 0),
      minTransactionAmount: Number(processingDealDraft.minTransactionAmount || 0),
      maxTransactionAmount: Number(processingDealDraft.maxTransactionAmount || 0),
    };

    if (!payload.title || payload.targetAmount <= 0) {
      enqueueSnackbar("Укажите название и общий лимит сделки", { variant: "warning" });
      return;
    }

    if (rawUserId && (!Number.isInteger(payload.userId) || payload.userId <= 0)) {
      enqueueSnackbar("User ID должен быть числом. Оставьте поле пустым, если сделка для всех пользователей.", {
        variant: "warning",
      });
      return;
    }

    if (payload.maxTransactionAmount > 0 && payload.minTransactionAmount > payload.maxTransactionAmount) {
      enqueueSnackbar("Мин. транзакция не может быть больше макс. транзакции", { variant: "warning" });
      return;
    }

    if (payload.maxTransactionAmount > 0 && payload.maxTransactionAmount > payload.targetAmount) {
      enqueueSnackbar("Макс. транзакция не может быть больше общего лимита сделки", { variant: "warning" });
      return;
    }

    setProcessingSaving(true);
    api
      .post("/admin/processing", payload)
      .then((response) => {
        setProcessingDealDraft(emptyProcessingDealDraft);
        setSelectedProcessingId(response.data?.id || null);
        loadProcessing(true);
        enqueueSnackbar("Процессинговая сделка создана", { variant: "success" });
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось создать процессинговую сделку"), {
          variant: "error",
        });
      })
      .finally(() => setProcessingSaving(false));
  };
  const handleCreateProcessingRequisite = (event) => {
    event.preventDefault();
    if (!selectedProcessingId || processingSaving) return;

    const payload = {
      ...processingRequisiteDraft,
      limitAmount: Number(processingRequisiteDraft.limitAmount || 0),
      minTransactionAmount: Number(processingRequisiteDraft.minTransactionAmount || 0),
      maxTransactionAmount: Number(processingRequisiteDraft.maxTransactionAmount || 0),
      priority: Number(processingRequisiteDraft.priority || 100),
    };

    if (!payload.label.trim() || payload.limitAmount <= 0) {
      enqueueSnackbar("Укажите название реквизита и лимит", { variant: "warning" });
      return;
    }

    setProcessingSaving(true);
    api
      .post(`/admin/processing/${selectedProcessingId}/requisites`, payload)
      .then(() => {
        setProcessingRequisiteDraft(emptyProcessingRequisiteDraft);
        loadProcessingDetail(selectedProcessingId, true);
        loadProcessing(true);
        enqueueSnackbar("Реквизит добавлен", { variant: "success" });
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось добавить реквизит"), {
          variant: "error",
        });
      })
      .finally(() => setProcessingSaving(false));
  };
  const handleCreateProcessingTransaction = (event) => {
    event.preventDefault();
    if (!selectedProcessingId || processingSaving) return;

    const payload = {
      ...processingTransactionDraft,
      requisiteId: processingTransactionDraft.requisiteId ? Number(processingTransactionDraft.requisiteId) : null,
      amount: Number(processingTransactionDraft.amount || 0),
    };

    if (payload.amount <= 0) {
      enqueueSnackbar("Укажите сумму транзакции", { variant: "warning" });
      return;
    }

    setProcessingSaving(true);
    api
      .post(`/admin/processing/${selectedProcessingId}/transactions`, payload)
      .then(() => {
        setProcessingTransactionDraft(emptyProcessingTransactionDraft);
        loadProcessingDetail(selectedProcessingId, true);
        loadProcessing(true);
        enqueueSnackbar("Транзакция добавлена", { variant: "success" });
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось добавить транзакцию"), {
          variant: "error",
        });
      })
      .finally(() => setProcessingSaving(false));
  };
  const handleUpdateProcessingDealStatus = (dealId, status) => {
    api
      .patch(`/admin/processing/${dealId}`, { status })
      .then(() => {
        loadProcessing(true);
        loadProcessingDetail(dealId, true);
        enqueueSnackbar("Статус сделки обновлен", { variant: "success" });
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось обновить статус сделки"), {
          variant: "error",
        });
      });
  };
  const handleUpdateProcessingTransactionStatus = (transactionId, status) => {
    api
      .patch(`/admin/processing/transactions/${transactionId}`, { status })
      .then(() => {
        loadProcessing(true);
        loadProcessingDetail(selectedProcessingId, true);
        enqueueSnackbar("Статус транзакции обновлен", { variant: "success" });
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось обновить транзакцию"), {
          variant: "error",
        });
      });
  };

  return { handleCreateProcessingDeal, handleCreateProcessingRequisite, handleCreateProcessingTransaction, handleUpdateProcessingDealStatus, handleUpdateProcessingTransactionStatus, loadProcessing, loadProcessingDetail, processingCurrency, processingDealDraft, processingDeals, processingDetail, processingDetailLoading, processingLoading, processingPage, processingRequestRef, processingRequisiteDraft, processingSaving, processingSearch, processingStatus, processingSummary, processingTotal, processingTransactionDraft, selectedProcessingId, setProcessingCurrency, setProcessingDealDraft, setProcessingDeals, setProcessingDetail, setProcessingDetailLoading, setProcessingLoading, setProcessingPage, setProcessingRequisiteDraft, setProcessingSaving, setProcessingSearch, setProcessingStatus, setProcessingSummary, setProcessingTotal, setProcessingTransactionDraft, setSelectedProcessingId };
}

export function ProcessingSection({ handleCreateProcessingDeal, handleCreateProcessingRequisite, handleCreateProcessingTransaction, handleUpdateProcessingDealStatus, handleUpdateProcessingTransactionStatus, loadProcessing, processingCurrency, processingDealDraft, processingDeals, processingDetail, processingDetailLoading, processingLoading, processingPage, processingRequisiteDraft, processingSaving, processingSearch, processingStatus, processingSummary, processingTotal, processingTransactionDraft, selectedProcessingId, setProcessingCurrency, setProcessingDealDraft, setProcessingPage, setProcessingRequisiteDraft, setProcessingSearch, setProcessingStatus, setProcessingTransactionDraft, setSelectedProcessingId }) {
  return (
 (
        <section className={styles.admin_processing}>
          <div className={styles.admin_dealsTop}>
            <div>
              <h2>Процессинг</h2>
              <p>Одна сделка, несколько реквизитов и много транзакций до лимитов $ € ₽</p>
            </div>
            <button type="button" onClick={() => loadProcessing()} disabled={processingLoading}>
              <FiRefreshCw />
              {processingLoading ? "Обновляем" : "Обновить"}
            </button>
          </div>

          <div className={styles.admin_tradingStats}>
            <article><span>Всего сделок</span><strong>{processingSummary.totalDeals || 0}</strong></article>
            <article><span>Активные</span><strong>{processingSummary.activeDeals || 0}</strong></article>
            <article><span>Завершены</span><strong>{processingSummary.completedDeals || 0}</strong></article>
            <article><span>Общий лимит</span><strong>{formatFiatAmount(processingSummary.targetAmount, processingCurrency || "RUB")}</strong></article>
            <article><span>Обработано</span><strong>{formatFiatAmount(processingSummary.processedAmount, processingCurrency || "RUB")}</strong></article>
          </div>

          <div className={styles.admin_processingGrid}>
            <div className={styles.admin_processingList}>
              <div className={styles.admin_tradingToolbar}>
                <label className={styles.admin_search}>
                  <FiSearch />
                  <input
                    value={processingSearch}
                    placeholder="ID, название, пользователь"
                    onChange={(event) => { setProcessingSearch(event.target.value); setProcessingPage(0); }}
                  />
                </label>
                <select value={processingStatus} onChange={(event) => { setProcessingStatus(event.target.value); setProcessingPage(0); }}>
                  <option value="">Все статусы</option>
                  {Object.entries(processingStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <select value={processingCurrency} onChange={(event) => { setProcessingCurrency(event.target.value); setProcessingPage(0); }}>
                  <option value="">Все валюты</option>
                  <option value="RUB">₽ RUB</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                </select>
              </div>

              <div className={styles.admin_processingDeals}>
                {processingLoading && <div className={styles.admin_dealsEmpty}>Загружаем процессинг...</div>}
                {!processingLoading && processingDeals.length === 0 && <div className={styles.admin_dealsEmpty}>Сделки не найдены</div>}
                {!processingLoading && processingDeals.map((deal) => {
                  const progress = getPercent(deal.processedAmount, deal.targetAmount);
                  return (
                    <button
                      key={deal.id}
                      type="button"
                      className={`${styles.admin_processingDealCard} ${selectedProcessingId === deal.id ? styles.admin_processingDealCardActive : ""}`}
                      onClick={() => setSelectedProcessingId(deal.id)}
                    >
                      <div>
                        <strong>#{deal.id} · {deal.title}</strong>
                        <span>{deal.userEmail || deal.userUsername || "Без пользователя"} · {processingStatusLabels[deal.status] || deal.status}</span>
                      </div>
                      <div className={styles.admin_processingProgress}>
                        <span style={{ width: `${progress}%` }} />
                      </div>
                      <footer>
                        <b>{formatFiatAmount(deal.processedAmount, deal.fiatCurrency)} / {formatFiatAmount(deal.targetAmount, deal.fiatCurrency)}</b>
                        <small>{deal.requisitesCount} рекв. · {deal.transactionsCount} транз.</small>
                      </footer>
                    </button>
                  );
                })}
              </div>

              <div className={styles.admin_pagination}>
                <span>Показано {processingDeals.length} из {processingTotal}</span>
                <div>
                  <button type="button" disabled={processingPage === 0 || processingLoading} onClick={() => setProcessingPage((page) => Math.max(page - 1, 0))}>Назад</button>
                  <b>Страница {processingPage + 1}</b>
                  <button type="button" disabled={(processingPage + 1) * 50 >= processingTotal || processingLoading} onClick={() => setProcessingPage((page) => page + 1)}>Далее</button>
                </div>
              </div>

              <form className={styles.admin_processingForm} onSubmit={handleCreateProcessingDeal}>
                <div className={styles.admin_processingFormHeader}>
                  <div>
                    <h3>Новая процессинговая сделка</h3>
                    <p>Оставьте User ID пустым, чтобы сделка была видна всем пользователям.</p>
                  </div>
                  <button type="submit" disabled={processingSaving}>{processingSaving ? "Сохраняем..." : "Создать сделку"}</button>
                </div>
                <label>
                  <span>Название</span>
                  <input value={processingDealDraft.title} placeholder="Например: RUB входящие до 1 000 000" onChange={(event) => setProcessingDealDraft((current) => ({ ...current, title: event.target.value }))} />
                </label>
                <div>
                  <label>
                    <span>User ID</span>
                    <input inputMode="numeric" value={processingDealDraft.userId} placeholder="пусто = всем, например 12" onChange={(event) => setProcessingDealDraft((current) => ({ ...current, userId: event.target.value }))} />
                  </label>
                  <label>
                    <span>Валюта</span>
                    <select value={processingDealDraft.fiatCurrency} onChange={(event) => setProcessingDealDraft((current) => ({ ...current, fiatCurrency: event.target.value }))}>
                      <option value="RUB">₽ RUB</option>
                      <option value="USD">$ USD</option>
                      <option value="EUR">€ EUR</option>
                    </select>
                  </label>
                </div>
                <div>
                  <label>
                    <span>Общий лимит</span>
                    <input type="number" min="0" step="0.01" value={processingDealDraft.targetAmount} placeholder="1000000" onChange={(event) => setProcessingDealDraft((current) => ({ ...current, targetAmount: event.target.value }))} />
                  </label>
                  <label>
                    <span>Мин. транзакция</span>
                    <input type="number" min="0" step="0.01" value={processingDealDraft.minTransactionAmount} placeholder="1000" onChange={(event) => setProcessingDealDraft((current) => ({ ...current, minTransactionAmount: event.target.value }))} />
                  </label>
                  <label>
                    <span>Макс. транзакция</span>
                    <input type="number" min="0" step="0.01" value={processingDealDraft.maxTransactionAmount} placeholder="100000" onChange={(event) => setProcessingDealDraft((current) => ({ ...current, maxTransactionAmount: event.target.value }))} />
                  </label>
                </div>
                <label>
                  <span>Комментарий</span>
                  <input value={processingDealDraft.comment} placeholder="Внутренняя заметка" onChange={(event) => setProcessingDealDraft((current) => ({ ...current, comment: event.target.value }))} />
                </label>
                <div className={styles.admin_processingHint}>
                  Пример: общий лимит 1 000 000, мин. транзакция 1 000, макс. транзакция 100 000.
                </div>
              </form>
            </div>

            <div className={styles.admin_processingDetail}>
              {processingDetailLoading && <div className={styles.admin_dealsEmpty}>Загружаем сделку...</div>}
              {!processingDetailLoading && !processingDetail && <div className={styles.admin_dealsEmpty}>Выберите процессинговую сделку</div>}

              {!processingDetailLoading && processingDetail && (
                <>
                  <div className={styles.admin_processingDetailTop}>
                    <div>
                      <h3>#{processingDetail.deal.id} · {processingDetail.deal.title}</h3>
                      <p>{formatFiatAmount(processingDetail.deal.processedAmount, processingDetail.deal.fiatCurrency)} из {formatFiatAmount(processingDetail.deal.targetAmount, processingDetail.deal.fiatCurrency)}</p>
                    </div>
                    <select value={processingDetail.deal.status} onChange={(event) => handleUpdateProcessingDealStatus(processingDetail.deal.id, event.target.value)}>
                      {Object.entries(processingStatusLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.admin_processingProgress}>
                    <span style={{ width: `${getPercent(processingDetail.deal.processedAmount, processingDetail.deal.targetAmount)}%` }} />
                  </div>

                  <div className={styles.admin_processingColumns}>
                    <form className={styles.admin_processingForm} onSubmit={handleCreateProcessingRequisite}>
                      <h3>Добавить реквизит</h3>
                      <label><span>Название</span><input value={processingRequisiteDraft.label} placeholder="Сбер карта 1" onChange={(event) => setProcessingRequisiteDraft((current) => ({ ...current, label: event.target.value }))} /></label>
                      <div>
                        <label><span>Метод</span><input value={processingRequisiteDraft.methodCode} placeholder="sber / sepa / card" onChange={(event) => setProcessingRequisiteDraft((current) => ({ ...current, methodCode: event.target.value }))} /></label>
                        <label><span>Лимит</span><input type="number" min="0" step="0.01" value={processingRequisiteDraft.limitAmount} onChange={(event) => setProcessingRequisiteDraft((current) => ({ ...current, limitAmount: event.target.value }))} /></label>
                      </div>
                      <div>
                        <label><span>Держатель</span><input value={processingRequisiteDraft.holderName} onChange={(event) => setProcessingRequisiteDraft((current) => ({ ...current, holderName: event.target.value }))} /></label>
                        <label><span>Банк</span><input value={processingRequisiteDraft.bankName} onChange={(event) => setProcessingRequisiteDraft((current) => ({ ...current, bankName: event.target.value }))} /></label>
                      </div>
                      <div>
                        <label><span>Карта</span><input value={processingRequisiteDraft.cardNumber} onChange={(event) => setProcessingRequisiteDraft((current) => ({ ...current, cardNumber: event.target.value }))} /></label>
                        <label><span>IBAN</span><input value={processingRequisiteDraft.iban} onChange={(event) => setProcessingRequisiteDraft((current) => ({ ...current, iban: event.target.value }))} /></label>
                      </div>
                      <div>
                        <label><span>Мин.</span><input type="number" min="0" step="0.01" value={processingRequisiteDraft.minTransactionAmount} onChange={(event) => setProcessingRequisiteDraft((current) => ({ ...current, minTransactionAmount: event.target.value }))} /></label>
                        <label><span>Макс.</span><input type="number" min="0" step="0.01" value={processingRequisiteDraft.maxTransactionAmount} onChange={(event) => setProcessingRequisiteDraft((current) => ({ ...current, maxTransactionAmount: event.target.value }))} /></label>
                      </div>
                      <button type="submit" disabled={processingSaving}>Добавить реквизит</button>
                    </form>

                    <form className={styles.admin_processingForm} onSubmit={handleCreateProcessingTransaction}>
                      <h3>Добавить транзакцию</h3>
                      <label>
                        <span>Реквизит</span>
                        <select value={processingTransactionDraft.requisiteId} onChange={(event) => setProcessingTransactionDraft((current) => ({ ...current, requisiteId: event.target.value }))}>
                          <option value="">Без привязки</option>
                          {processingDetail.requisites.map((requisite) => (
                            <option key={requisite.id} value={requisite.id}>{requisite.label}</option>
                          ))}
                        </select>
                      </label>
                      <div>
                        <label><span>Сумма</span><input type="number" min="0" step="0.01" value={processingTransactionDraft.amount} onChange={(event) => setProcessingTransactionDraft((current) => ({ ...current, amount: event.target.value }))} /></label>
                        <label>
                          <span>Статус</span>
                          <select value={processingTransactionDraft.status} onChange={(event) => setProcessingTransactionDraft((current) => ({ ...current, status: event.target.value }))}>
                            {Object.entries(processingTransactionStatusLabels).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div>
                        <label><span>External ID</span><input value={processingTransactionDraft.externalId} onChange={(event) => setProcessingTransactionDraft((current) => ({ ...current, externalId: event.target.value }))} /></label>
                        <label><span>Плательщик</span><input value={processingTransactionDraft.payerName} onChange={(event) => setProcessingTransactionDraft((current) => ({ ...current, payerName: event.target.value }))} /></label>
                      </div>
                      <label><span>Комментарий</span><input value={processingTransactionDraft.comment} onChange={(event) => setProcessingTransactionDraft((current) => ({ ...current, comment: event.target.value }))} /></label>
                      <button type="submit" disabled={processingSaving}>Добавить транзакцию</button>
                    </form>
                  </div>

                  <div className={styles.admin_processingBlocks}>
                    <section>
                      <h3>Реквизиты</h3>
                      {processingDetail.requisites.length === 0 && <div className={styles.admin_dealsEmpty}>Реквизитов пока нет</div>}
                      {processingDetail.requisites.map((requisite) => (
                        <article key={requisite.id} className={styles.admin_processingRequisite}>
                          <div>
                            <strong>{requisite.label}</strong>
                            <span>{requisite.method_code} · {requisite.status}</span>
                          </div>
                          <p>{[requisite.bank_name, requisite.holder_name, requisite.card_number, requisite.iban, requisite.phone].filter(Boolean).join(" · ")}</p>
                          <div className={styles.admin_processingProgress}>
                            <span style={{ width: `${getPercent(requisite.used_amount, requisite.limit_amount)}%` }} />
                          </div>
                          <footer>
                            <b>{formatFiatAmount(requisite.used_amount, requisite.fiat_currency)} / {formatFiatAmount(requisite.limit_amount, requisite.fiat_currency)}</b>
                            <small>{formatFiatAmount(requisite.min_transaction_amount, requisite.fiat_currency)}-{formatFiatAmount(requisite.max_transaction_amount, requisite.fiat_currency)}</small>
                          </footer>
                        </article>
                      ))}
                    </section>

                    <section>
                      <h3>Транзакции сделки</h3>
                      {processingDetail.transactions.length === 0 && <div className={styles.admin_dealsEmpty}>Транзакций пока нет</div>}
                      {processingDetail.transactions.map((transaction) => (
                        <article key={transaction.id} className={styles.admin_processingTransaction}>
                          <div>
                            <strong>#{transaction.id} · {formatFiatAmount(transaction.amount, transaction.fiat_currency)}</strong>
                            <select value={transaction.status} onChange={(event) => handleUpdateProcessingTransactionStatus(transaction.id, event.target.value)}>
                              {Object.entries(processingTransactionStatusLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </div>
                          <p>{transaction.requisite_label || "Без реквизита"} · {transaction.payer_name || "Плательщик не указан"}</p>
                          <small>{transaction.external_id || "без external id"} · {formatDate(transaction.created_at)}</small>
                        </article>
                      ))}
                    </section>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )
  );
}
