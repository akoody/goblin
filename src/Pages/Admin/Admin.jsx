import { useEffect, useMemo, useRef, useState } from "react";
import { DepositCompliance } from './DepositCompliance';
import { Helpers } from './Helpers';
import {UserBalances} from './UserBalances';
import {ContentAdmin} from '../Content/Content';
import {Bonuses} from '../Content/Bonuses';
import {TransactionHistory} from '../../Components/TransactionHistory/TransactionHistory';
import {ScrollableNav} from '../../Components/ScrollableNav/ScrollableNav';
import {confirmSaveClick,confirmSaveSubmit} from '../../Components/AdminSaveConfirmation';
import {WalletHelp} from './WalletHelp';
import {TreasuryCollection} from './TreasuryCollection';
import {NativeChains} from './NativeChains';
import {PumpAdmin} from '../Content/CreateCoin';

import { Referrals } from './Referrals';
import { GuarantorDeals } from './GuarantorDeals';
import { P2pFeePolicy } from './P2PFeePolicy';
import {
  FiAlertCircle,
  FiActivity,
  FiBell,
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiDollarSign,
  FiFilter,
  FiList,
  FiMessageCircle,
  FiSearch,
  FiSend,
  FiShield,
  FiRefreshCw,
  FiTrash2,
  FiUser,
  FiUsers,
} from "react-icons/fi";
import { Link } from "react-router-dom";
import { enqueueSnackbar } from "notistack";
import api from "../../api";
import { getApiErrorMessage } from "../../utils/notifications";
import styles from "./Admin.module.scss";

const statusLabels = {
  all: "Все",
  open: "Открытые",
  pending: "Ожидают клиента",
  closed: "Закрытые",
};

const priorityLabels = {
  high: "Высокий",
  normal: "Обычный",
  low: "Низкий",
};

const ticketCategoryLabels = {
  general: "Общий вопрос",
  payment: "Платежи",
  p2p: "P2P сделка",
  account: "Аккаунт",
  security: "Безопасность",
  other: "Другое",
};

const dealStatusLabels = {
  all: "Все",
  active: "Активные",
  completed: "Завершенные",
  cancelled: "Отмененные",
};

const userStatusLabels = {
  active: "Активен",
  blocked: "Заблокирован",
  deleted: "Удален пользователем",
};

const dealEndpoints = ["/deal/admin/all", "/admin/deals", "/deal/all"];

const getCurrentTime = () => {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
};

const getTicketClientName = (ticket) =>
  ticket.user?.username || ticket.user?.email || `Клиент #${ticket.userId || "-"}`;

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

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ru-RU");
};

const formatTradingAmount = (value, digits = 8) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(Number(value || 0));
const walletPrecisions = { BTC: 8, ETH: 18, USDT: 6, TRX: 6, SOL: 9 };
const formatWalletBalance = (value, currency) => formatTradingAmount(value, walletPrecisions[currency] || 8);

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

const tradingViewLabels = {
  fills: "Исполнения",
  orders: "Ордера",
  positions: "Фьючерсные позиции",
  funding: "Funding",
};

const tradingStatusLabels = {
  OPEN: "Открыт",
  PARTIALLY_FILLED: "Частично исполнен",
  FILLED: "Исполнен",
  CANCELLED: "Отменён",
  CLOSED: "Закрыт",
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

const emptyP2pDealDraft = {
  orderId: "",
  counterpartyUserId: "",
  cryptoAmount: "",
  paymentMethod: "",
};

const emptyPaymentDefinition = {
  code: "",
  name: "",
  shortName: "",
  group: "banks",
  tone: "#21a038",
  speed: "обычно 1-10 мин.",
  description: "",
  fields: [
    {
      key: "fullName",
      label: "Фамилия Имя",
      required: true,
      minLength: 2,
      maxLength: 120,
      pattern: "",
      placeholder: "Иван Иванов",
    },
    {
      key: "iban",
      label: "IBAN",
      required: true,
      minLength: 24,
      maxLength: 24,
      pattern: "^ES[0-9A-Z]{22}$",
      placeholder: "ES03636...",
    },
    {
      key: "comment",
      label: "Комментарий",
      required: false,
      minLength: "",
      maxLength: 200,
      pattern: "",
      placeholder: "",
    },
  ],
  active: true,
};

const parseFieldsText = (value) =>
  String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes("|")) {
        const [key, label, required, minLength, maxLength, pattern, placeholder] = line
          .split("|")
          .map((part) => part.trim());

        return {
          key,
          label: label || key,
          required: required !== "optional",
          minLength: minLength ? Number(minLength) : undefined,
          maxLength: maxLength ? Number(maxLength) : undefined,
          pattern: pattern || undefined,
          placeholder: placeholder || undefined,
        };
      }

      const [key, label, required] = line.split(":").map((part) => part.trim());

      return {
        key,
        label: label || key,
        required: required !== "optional",
      };
    })
    .filter((field) => field.key);

const normalizePaymentFields = (fields) =>
  (Array.isArray(fields) ? fields : parseFieldsText(fields))
    .map((field) => ({
      key: String(field.key || "").trim(),
      label: String(field.label || field.key || "").trim(),
      required: field.required !== false,
      minLength: field.minLength === "" || field.minLength === undefined ? "" : Number(field.minLength),
      maxLength: field.maxLength === "" || field.maxLength === undefined ? "" : Number(field.maxLength),
      pattern: String(field.pattern || "").trim(),
      placeholder: String(field.placeholder || "").trim(),
    }));

const emptyPaymentField = () => ({
  key: "",
  label: "",
  required: true,
  minLength: "",
  maxLength: "",
  pattern: "",
  placeholder: "",
});

export const Admin = () => {
  const [activeSection, setActiveSection] = useState(() => new URLSearchParams(window.location.search).get('section') === 'guarantor' ? 'guarantor' : 'support');
  const [loginIps, setLoginIps] = useState({ rows: [], unread: 0 });
  const [loginIpsError, setLoginIpsError] = useState("");
  const [loginIpQuery,setLoginIpQuery]=useState('');
  const [loginIpsLoading,setLoginIpsLoading]=useState(false);
  const loginIpQueryRef=useRef('');
  const loginIpRequest=useRef(0);
  const loadLoginIps = async () => {
    const query=loginIpQueryRef.current,request=++loginIpRequest.current;
    setLoginIpsLoading(true);
    try {
      const { data } = await api.get("/admin/login-ips",{params:{q:query}});
      if(request!==loginIpRequest.current||query!==loginIpQueryRef.current)return;
      setLoginIps(data);
      setLoginIpsError("");
    } catch {
      if(request!==loginIpRequest.current||query!==loginIpQueryRef.current)return;
      setLoginIpsError("Не удалось загрузить историю входов");
    } finally {
      if(request===loginIpRequest.current)setLoginIpsLoading(false);
    }
  };
  useEffect(() => {
    loadLoginIps();
    const timer = window.setInterval(loadLoginIps, 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(()=>{
    loginIpQueryRef.current=loginIpQuery;
    const timer=window.setTimeout(loadLoginIps,300);
    return ()=>window.clearTimeout(timer);
  },[loginIpQuery]);
  const reviewLoginIp = async (id) => {
    try {
      await api.patch(`/admin/login-ips/${id}/review`);
      await loadLoginIps();
    } catch {
      enqueueSnackbar("Не удалось отметить уведомление", { variant: "error" });
    }
  };
  const [tickets, setTickets] = useState([]);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchValue, setSearchValue] = useState("");
  const [replyText, setReplyText] = useState("");
  const [newTicketDraft, setNewTicketDraft] = useState({
    email: "",
    subject: "",
    category: "general",
    priority: "normal",
    text: "",
  });
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [deals, setDeals] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsError, setDealsError] = useState("");
  const [dealStatusFilter, setDealStatusFilter] = useState("all");
  const [dealSearchValue, setDealSearchValue] = useState("");
  const [paymentDefinitions, setPaymentDefinitions] = useState([]);
  const [paymentDefinitionsLoading, setPaymentDefinitionsLoading] = useState(false);
  const [paymentDefinitionDraft, setPaymentDefinitionDraft] = useState(emptyPaymentDefinition);
  const [editingPaymentCode, setEditingPaymentCode] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const pendingUserControls = useRef(new Set());
  const [savingUserControls, setSavingUserControls] = useState([]);
  const [adminUserSearch, setAdminUserSearch] = useState("");

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
  const [platformFeatures, setPlatformFeatures] = useState({ p2p: true, processing: true, nft: true, market:true,guarantor:true });
  const [platformFeaturesLoading, setPlatformFeaturesLoading] = useState(false);
  const [platformFeatureSaving,setPlatformFeatureSaving]=useState(null);
  const [p2pDealDraft, setP2pDealDraft] = useState(emptyP2pDealDraft);
  const [p2pDealSaving, setP2pDealSaving] = useState(false);
  const [registrations, setRegistrations] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const messagesRef = useRef(null);
  const tradingRequestRef = useRef(0);
  const processingRequestRef = useRef(0);

  const loadTickets = (silent = false) => {
    if (!silent) {
      setTicketsLoading(true);
    }

    api
      .get("/support/tickets")
      .then((response) => {
        const nextTickets = Array.isArray(response.data) ? response.data : [];
        setTickets(nextTickets);
        setSelectedTicketId((current) => current || nextTickets[0]?.id || null);
      })
      .catch((error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem("token");
          window.location.reload();
          return;
        }

        if (!silent) {
          enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить тикеты"), {
            variant: "error",
          });
        }
      })
      .finally(() => setTicketsLoading(false));
  };

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

  const loadPaymentDefinitions = (silent = false) => {
    if (!silent) {
      setPaymentDefinitionsLoading(true);
    }

    api
      .get("/payment-methods/definitions?includeInactive=1")
      .then((response) => {
        setPaymentDefinitions(Array.isArray(response.data) ? response.data : []);
      })
      .catch((error) => {
        if (!silent) {
          enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить способы оплаты"), {
            variant: "error",
          });
        }
      })
      .finally(() => setPaymentDefinitionsLoading(false));
  };

  const loadAdminUsers = (silent = false) => {
    if (!silent) {
      setAdminUsersLoading(true);
    }

    api
      .get("/admin/users", { params: { search: adminUserSearch } })
      .then((response) => setAdminUsers(Array.isArray(response.data) ? response.data : []))
      .catch((error) => {
        if (!silent) {
          enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить пользователей"), {
            variant: "error",
          });
        }
      })
      .finally(() => setAdminUsersLoading(false));
  };



  const loadRegistrations = () => {
    api
      .get("/admin/registrations")
      .then((response) => setRegistrations(Array.isArray(response.data) ? response.data : []))
      .catch(() => setRegistrations([]));
  };

  const loadPlatformFeatures = (silent = false) => {
    if (!silent) setPlatformFeaturesLoading(true);
    api.get("/admin/features")
      .then((response) => setPlatformFeatures(response.data || {}))
      .catch((error) => {
        if (!silent) enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить доступность разделов"), { variant: "error" });
      })
      .finally(() => setPlatformFeaturesLoading(false));
  };

  const handlePlatformFeatureChange = (feature, enabled) => {
    if(platformFeatureSaving)return;
    setPlatformFeatureSaving(feature);
    api.patch(`/admin/features/${feature}`, { enabled })
      .then((response) => {
        setPlatformFeatures(response.data || {});
        enqueueSnackbar(enabled ? "Раздел включен" : "Раздел переведен на обновление", { variant: "success" });
      })
      .catch((error) => enqueueSnackbar(getApiErrorMessage(error, "Не удалось обновить раздел"), { variant: "error" }))
      .finally(()=>setPlatformFeatureSaving(null));
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
    loadTickets();
    loadDeals();
    loadPaymentDefinitions();
    loadAdminUsers(true);

    loadRegistrations();
    loadPlatformFeatures(true);
  }, []);

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

  useEffect(() => {
    if (activeSection !== "processing") return undefined;
    const timer = window.setTimeout(() => loadProcessing(), 300);
    return () => window.clearTimeout(timer);
  }, [activeSection, processingStatus, processingCurrency, processingSearch, processingPage]);

  useEffect(() => {
    if (activeSection !== "processing") return;
    loadProcessingDetail(selectedProcessingId);
  }, [activeSection, selectedProcessingId]);

  const loadTicketMessages = (ticketId = selectedTicketId, silent = false) => {
    if (!ticketId) {
      setTicketMessages([]);
      return;
    }

    if (!silent) {
      setMessagesLoading(true);
    }

    api
      .get(`/support/tickets/${ticketId}/messages`)
      .then((response) => setTicketMessages(Array.isArray(response.data) ? response.data : []))
      .catch((error) => {
        setTicketMessages([]);
        if (!silent) {
          enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить сообщения тикета"), {
            variant: "error",
          });
        }
      })
      .finally(() => setMessagesLoading(false));
  };

  useEffect(() => {
    if (!selectedTicketId) {
      setTicketMessages([]);
      return;
    }

    loadTicketMessages(selectedTicketId);
  }, [selectedTicketId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadTickets(true);
      if (selectedTicketId) {
        loadTicketMessages(selectedTicketId, true);
      }
    }, 8000);

    return () => window.clearInterval(interval);
  }, [selectedTicketId]);

  useEffect(() => {
    const node = messagesRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [ticketMessages, selectedTicketId]);

  const filteredTickets = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const matchesStatus =
        statusFilter === "all" || ticket.status === statusFilter;
      const matchesSearch =
        !normalizedSearch ||
        [
          getTicketClientName(ticket),
          ticket.user?.email,
          ticket.id,
          ticket.subject,
          ticket.lastMessage,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [searchValue, statusFilter, tickets]);

  const selectedTicket = useMemo(() => {
    return tickets.find((ticket) => ticket.id === selectedTicketId) || null;
  }, [selectedTicketId, tickets]);

  const waitingCount = tickets.filter((ticket) => ticket.status === "open").length;
  const onlineCount = tickets.filter((ticket) => ticket.status === "pending").length;
  const highPriorityCount = tickets.filter(
    (ticket) => ticket.priority === "high"
  ).length;
  const activeDealsCount = deals.filter(
    (deal) => getDealStatusGroup(deal.status) === "active"
  ).length;
  const activePaymentDefinitionCount = paymentDefinitions.filter((method) => method.active).length;

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



  const handleSendReply = () => {
    const trimmedReply = replyText.trim();

    if (!selectedTicket || !trimmedReply || replySending) {
      return;
    }

    setReplySending(true);
    api
      .post(`/support/tickets/${selectedTicket.id}/messages`, { text: trimmedReply })
      .then((response) => {
        setTicketMessages((current) => [...current, response.data]);
        setReplyText("");
        loadTickets(true);
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось отправить ответ"), {
          variant: "error",
        });
      })
      .finally(() => setReplySending(false));
  };

  const handleCloseTicket = () => {
    if (!selectedTicket) {
      return;
    }

    api
      .patch(`/support/tickets/${selectedTicket.id}`, { status: "closed" })
      .then((response) => {
        setTickets((current) =>
          current.map((ticket) => (ticket.id === selectedTicket.id ? response.data : ticket))
        );
        enqueueSnackbar("Тикет закрыт", { variant: "success" });
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось закрыть тикет"), {
          variant: "error",
        });
      });
  };

  const handleCreateSupportTicket = (event) => {
    event.preventDefault();

    const payload = {
      email: newTicketDraft.email.trim(),
      subject: newTicketDraft.subject.trim(),
      category: newTicketDraft.category,
      priority: newTicketDraft.priority,
      text: newTicketDraft.text.trim(),
    };

    if (!payload.email || !payload.subject || !payload.text || creatingTicket) {
      enqueueSnackbar("Укажите email пользователя, тему и первое сообщение", {
        variant: "warning",
      });
      return;
    }

    setCreatingTicket(true);
    api
      .post("/admin/support/tickets", payload)
      .then((response) => {
        const createdTicket = response.data;
        setTickets((current) => [
          createdTicket,
          ...current.filter((ticket) => ticket.id !== createdTicket.id),
        ]);
        setSelectedTicketId(createdTicket.id);
        setNewTicketDraft({
          email: "",
          subject: "",
          category: "general",
          priority: "normal",
          text: "",
        });
        loadTickets(true);
        loadTicketMessages(createdTicket.id, true);
        enqueueSnackbar("Тикет создан и отправлен пользователю", {
          variant: "success",
        });
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось создать тикет"), {
          variant: "error",
        });
      })
      .finally(() => setCreatingTicket(false));
  };

  const handlePaymentDraftChange = (field, value) => {
    setPaymentDefinitionDraft((current) => ({ ...current, [field]: value }));
  };

  const handleEditPaymentDefinition = (method) => {
    setEditingPaymentCode(method.code);
    setPaymentDefinitionDraft({
      code: method.code,
      name: method.name,
      shortName: method.shortName,
      group: method.group,
      tone: method.tone,
      speed: method.speed,
      description: method.description || "",
      fields: normalizePaymentFields(method.fields),
      active: method.active,
    });
  };

  const handleResetPaymentDefinition = () => {
    setEditingPaymentCode(null);
    setPaymentDefinitionDraft(emptyPaymentDefinition);
  };

  const handleSavePaymentDefinition = (event) => {
    event.preventDefault();

    const fields = normalizePaymentFields(paymentDefinitionDraft.fields);

    if (!paymentDefinitionDraft.name.trim() || fields.length === 0) {
      enqueueSnackbar("Укажите название и хотя бы одно поле реквизитов", { variant: "error" });
      return;
    }

    for (const field of fields) {
      if (!field.key || !field.label) {
        enqueueSnackbar("У каждого поля должен быть ключ и название", { variant: "error" });
        return;
      }

      if (field.minLength !== "" && (!Number.isFinite(field.minLength) || field.minLength < 0)) {
        enqueueSnackbar(`${field.label}: минимум должен быть числом от 0`, { variant: "error" });
        return;
      }

      if (field.maxLength !== "" && (!Number.isFinite(field.maxLength) || field.maxLength < 0)) {
        enqueueSnackbar(`${field.label}: максимум должен быть числом от 0`, { variant: "error" });
        return;
      }

      if (field.minLength !== "" && field.maxLength !== "" && field.minLength > field.maxLength) {
        enqueueSnackbar(`${field.label}: минимум не может быть больше максимума`, { variant: "error" });
        return;
      }

      if (field.pattern) {
        try {
          new RegExp(field.pattern);
        } catch {
          enqueueSnackbar(`${field.label}: некорректный regex`, { variant: "error" });
          return;
        }
      }
    }

    const payload = {
      code: paymentDefinitionDraft.code,
      name: paymentDefinitionDraft.name,
      shortName: paymentDefinitionDraft.shortName || paymentDefinitionDraft.name,
      group: paymentDefinitionDraft.group,
      tone: paymentDefinitionDraft.tone,
      speed: paymentDefinitionDraft.speed,
      description: paymentDefinitionDraft.description,
      fields,
      active: paymentDefinitionDraft.active,
    };
    const request = editingPaymentCode
      ? api.patch(`/payment-methods/definitions/${editingPaymentCode}`, payload)
      : api.post("/payment-methods/definitions", payload);

    request
      .then(() => {
        enqueueSnackbar(editingPaymentCode ? "Способ оплаты обновлен" : "Способ оплаты добавлен", {
          variant: "success",
        });
        handleResetPaymentDefinition();
        loadPaymentDefinitions(true);
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось сохранить способ оплаты"), {
          variant: "error",
        });
      });
  };

  const handleTogglePaymentDefinition = (method) => {
    api
      .patch(`/payment-methods/definitions/${method.code}`, {
        ...method,
        active: !method.active,
      })
      .then(() => {
        enqueueSnackbar(!method.active ? "Способ оплаты включен" : "Способ оплаты выключен", {
          variant: "success",
        });
        loadPaymentDefinitions(true);
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось изменить статус способа оплаты"), {
          variant: "error",
        });
      });
  };

  const handlePaymentFieldChange = (index, fieldName, value) => {
    setPaymentDefinitionDraft((current) => ({
      ...current,
      fields: normalizePaymentFields(current.fields).map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, [fieldName]: value } : field
      ),
    }));
  };

  const handleAddPaymentField = () => {
    setPaymentDefinitionDraft((current) => ({
      ...current,
      fields: [...normalizePaymentFields(current.fields), emptyPaymentField()],
    }));
  };

  const handleRemovePaymentField = (index) => {
    setPaymentDefinitionDraft((current) => ({
      ...current,
      fields: normalizePaymentFields(current.fields).filter((_, fieldIndex) => fieldIndex !== index),
    }));
  };

  const handleDeletePaymentDefinition = (method) => {
    const confirmed = window.confirm(`Удалить способ оплаты "${method.name}"?`);
    if (!confirmed) return;

    api
      .delete(`/payment-methods/definitions/${method.code}`)
      .then(() => {
        enqueueSnackbar("Способ оплаты удален", { variant: "success" });
        if (editingPaymentCode === method.code) {
          handleResetPaymentDefinition();
        }
        loadPaymentDefinitions(true);
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось удалить способ оплаты"), {
          variant: "error",
        });
      });
  };

  const handleUpdateUserControls = (user, patch) => {
    if (pendingUserControls.current.has(user.id)) return;
    if (!window.confirm(`Изменить доступ для ${user.email}?`)) return;
    pendingUserControls.current.add(user.id);
    setSavingUserControls([...pendingUserControls.current]);
    const payload = patch;

    api
      .patch(`/admin/users/${user.id}/controls`, payload)
      .then((response) => {
        setAdminUsers((current) =>
          current.map((item) => (item.id === user.id ? response.data : item))
        );
        enqueueSnackbar("Настройки аккаунта обновлены", { variant: "success" });
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось обновить аккаунт"), {
          variant: "error",
        });
      })
      .finally(() => {
        pendingUserControls.current.delete(user.id);
        setSavingUserControls([...pendingUserControls.current]);
      });
  };

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

  return (
    <main className={styles.admin} onClickCapture={confirmSaveClick} onSubmitCapture={confirmSaveSubmit}>
      <section className={styles.admin_header}>
        <div>
          <span>
            <FiShield />
            Админ-панель
          </span>
          <h1>{{support:'Поддержка клиентов',security:'Безопасность аккаунтов',deals:'P2P сделки',payments:'Способы оплаты',transactions:'Транзакции',processing:'Процессинг',trading:'Торговля',users:'Пользователи',features:'Доступность разделов',treasury:'Кошелёк и AML',referrals:'Реферальные приглашения',guarantor:'Сделки гаранта'}[activeSection] || 'Админ-панель'}</h1>
          <Link to="/manage/commerce">Маркет и гарант: платежи и споры →</Link>
        </div>
      </section>

      <ScrollableNav className={styles.admin_tabs} label="Разделы админ-панели">


        <button type="button" onClick={()=>setActiveSection('pump')}>Создание мемкоинов</button>
        <button type="button" onClick={()=>setActiveSection('bonuses')}>Бонусы</button>
        <button type="button" onClick={()=>setActiveSection('content')}>Новости и о проекте</button>
        <button type="button" className={activeSection==='helpers'?styles.admin_tabActive:''} onClick={()=>setActiveSection('helpers')}><FiUsers/>Хелперы</button>
        <button type="button" className={activeSection === "security" ? styles.admin_tabActive : ""} onClick={() => setActiveSection("security")}>
          <FiShield /> Безопасность{loginIps.unread > 0 ? ` (${loginIps.unread})` : ""}
        </button>
        <button
          type="button"
          className={activeSection === "support" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("support")}
        >
          <FiMessageCircle />
          Поддержка
        </button>
        <button
          type="button"
          className={activeSection === "deals" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("deals")}
        >
          <FiList />
          P2P сделки
        </button>
        <button
          type="button"
          className={activeSection === "payments" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("payments")}
        >
          <FiCreditCard />
          Способы оплаты
        </button>
        <button
          type="button"
          className={activeSection === "transactions" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("transactions")}
        >
          <FiList />
          Транзакции
        </button>
        <button
          type="button"
          className={activeSection === "processing" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("processing")}
        >
          <FiDollarSign />
          Процессинг
        </button>
        <button
          type="button"
          className={activeSection === "trading" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("trading")}
        >
          <FiActivity />
          Трейдинг
        </button>
        <button
          type="button"
          className={activeSection === "users" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("users")}
        >
          <FiUsers />
          Пользователи
        </button>
        <button
          type="button"
          className={activeSection === "features" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("features")}
        >
          <FiActivity />
          Доступность
        </button>
        <button type="button" className={activeSection==='treasury'?styles.admin_tabActive:''} onClick={()=>setActiveSection('treasury')}><FiDollarSign/>Кошелёк и AML</button>
        <button type="button" className={activeSection==='referrals'?styles.admin_tabActive:''} onClick={()=>setActiveSection('referrals')}><FiUsers/>Приглашения</button>
        <button type="button" className={activeSection==='guarantor'?styles.admin_tabActive:''} onClick={()=>setActiveSection('guarantor')}><FiShield/>Гарант</button>
      </ScrollableNav>
      {activeSection==='treasury'&&<><WalletHelp/><TreasuryCollection/><NativeChains/><DepositCompliance/></>}
      {activeSection==='helpers'&&<Helpers/>}
      {activeSection==='content'&&<ContentAdmin/>}
      {activeSection==='bonuses'&&<Bonuses admin/>}

      {activeSection==='pump'&&<PumpAdmin/>}

      {activeSection==='referrals'&&<Referrals/>}
      {activeSection==='guarantor'&&<GuarantorDeals/>}

      {activeSection === "security" && <section className={styles.loginSecurity}>
        <h2>IP-адреса входов</h2>
        <p>Показаны последние 200 подходящих адресов. Поиск работает по всей истории. Новый IP после первого входа требует просмотра администратором.</p>
        <p>Устройство указано для последнего входа с этого IP. Данные передаёт браузер; точная модель доступна не всегда.</p>
        <label className={styles.admin_search}>
          <FiSearch aria-hidden="true"/>
          <input type="search" aria-label="Поиск по истории входов" maxLength={160} value={loginIpQuery} onChange={event=>setLoginIpQuery(event.target.value)} placeholder="Имя, email, ID аккаунта или IP" />
        </label>
        <p role="status" aria-live="polite">{loginIpsLoading?'Ищем…':`Найдено: ${loginIps.total??loginIps.rows.length} · Показано: ${loginIps.rows.length}`}</p>
        {loginIpsError && <p role="alert">{loginIpsError}</p>}
        <div className={styles.loginSecurityTable}><table>
          <thead><tr><th>Аккаунт</th><th>IP</th><th>Устройство</th><th>ОС</th><th>Браузер</th><th>Предыдущий IP</th><th>Первый вход</th><th>Последний вход</th><th>Входов</th><th>Статус</th></tr></thead>
          <tbody>{loginIps.rows.map((entry) => <tr key={entry.id}>
            <td>{entry.username} · #{entry.user_id}</td><td>{entry.ip}</td><td title={entry.user_agent}>{entry.device}</td><td>{entry.os}</td><td>{entry.browser}</td><td>{entry.previous_ip || "—"}</td>
            <td>{new Date(entry.first_seen_at).toLocaleString("ru-RU")}</td><td>{new Date(entry.last_seen_at).toLocaleString("ru-RU")}</td><td>{entry.login_count}</td>
            <td>{entry.is_new_ip && !entry.reviewed_at ? <button type="button" onClick={() => reviewLoginIp(entry.id)}>Новый IP · Просмотрено</button> : entry.is_new_ip ? "Просмотрено" : "Первый IP"}</td>
          </tr>)}{!loginIps.rows.length && !loginIpsError && !loginIpsLoading && <tr><td colSpan="10">{loginIpQuery.trim()?'По вашему запросу входов не найдено.':'История появится после следующих входов пользователей.'}</td></tr>}</tbody>
        </table></div>
      </section>}

      <section className={styles.admin_stats}>
        <div>
          <span>
            <FiMessageCircle />
          </span>
          <p>Всего тикетов</p>
          <strong>{tickets.length}</strong>
        </div>
        <div>
          <span>
            <FiClock />
          </span>
          <p>Ожидают ответа</p>
          <strong>{waitingCount}</strong>
        </div>
        <div>
          <span>
            <FiCheckCircle />
          </span>
          <p>В работе</p>
          <strong>{onlineCount}</strong>
        </div>
        <div>
          <span>
            <FiAlertCircle />
          </span>
          <p>Высокий приоритет</p>
          <strong>{highPriorityCount}</strong>
        </div>
        <div>
          <span>
            <FiCreditCard />
          </span>
          <p>Способы оплаты</p>
          <strong>{paymentDefinitions.length}</strong>
        </div>
        <div>
          <span>
            <FiList />
          </span>
          <p>Активные P2P</p>
          <strong>{activeDealsCount}</strong>
        </div>
      </section>

      {activeSection === "support" && (
      <section className={styles.admin_workspace}>
        <aside className={styles.admin_queue}>
          <div className={styles.admin_queueTop}>
            <div>
              <h2>Очередь</h2>
              <p>{filteredTickets.length} обращений</p>
            </div>
          </div>

          <label className={styles.admin_search}>
            <FiSearch />
            <input
              value={searchValue}
              placeholder="Клиент, тикет или сделка"
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </label>

          <div className={styles.admin_filters} aria-label="Фильтр тикетов">
            <FiFilter />
            {Object.entries(statusLabels).map(([status, label]) => (
              <button
                key={status}
                type="button"
                className={statusFilter === status ? styles.admin_filterActive : ""}
                onClick={() => setStatusFilter(status)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={styles.admin_ticketList}>
            {ticketsLoading && (
              <div className={styles.admin_empty}>Загружаем обращения...</div>
            )}

            {filteredTickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                className={`${styles.admin_ticketCard} ${
                  selectedTicketId === ticket.id ? styles.admin_ticketCardActive : ""
                }`}
                onClick={() => setSelectedTicketId(ticket.id)}
              >
                <div>
                  <strong>{getTicketClientName(ticket)}</strong>
                  <span>{ticketCategoryLabels[ticket.category] || ticket.category || "Обращение"} / #{ticket.id}</span>
                </div>
                <p>{ticket.lastMessage || ticket.subject}</p>
                {ticket.unread > 0 && (
                  <b className={styles.admin_unread}>{ticket.unread}</b>
                )}
                <footer>
                  <span className={styles[`admin_priority_${ticket.priority}`]}>
                    {priorityLabels[ticket.priority] || ticket.priority}
                  </span>
                  <span className={styles.admin_category}>
                    {ticketCategoryLabels[ticket.category] || ticket.category || "Без категории"}
                  </span>
                  <small>{formatDate(ticket.updatedAt || ticket.createdAt)}</small>
                </footer>
              </button>
            ))}
          </div>
        </aside>

        <div className={styles.admin_dialog}>
          {!selectedTicket && (
            <div className={styles.admin_empty}>Выберите обращение из очереди</div>
          )}

          {selectedTicket && (
            <>
              <div className={styles.admin_dialogHeader}>
                <div>
                  <h2>{getTicketClientName(selectedTicket)}</h2>
                  <p>
                    Тикет #{selectedTicket.id} / {ticketCategoryLabels[selectedTicket.category] || selectedTicket.category || "Без категории"} / {selectedTicket.subject}
                  </p>
                </div>
                <div>
                  <button type="button" onClick={handleCloseTicket}>
                    Закрыть тикет
                  </button>
                </div>
              </div>

              <div className={styles.admin_messages} ref={messagesRef}>
                {messagesLoading && (
                  <div className={styles.admin_empty}>Загружаем сообщения...</div>
                )}

                {!messagesLoading && ticketMessages.length === 0 && (
                  <div className={styles.admin_empty}>Сообщений пока нет</div>
                )}

                {!messagesLoading && ticketMessages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.sender?.role === "operator"
                        ? styles.admin_messageOperator
                        : styles.admin_messageClient
                    }
                  >
                    <p>{message.text}</p>
                    <span>{formatDate(message.createdAt)}</span>
                  </div>
                ))}
              </div>

              <div className={styles.admin_composer}>
                <input
                  value={replyText}
                  placeholder={selectedTicket.status === "closed" ? "Тикет закрыт" : "Ответить клиенту"}
                  disabled={selectedTicket.status === "closed" || replySending}
                  onChange={(event) => setReplyText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleSendReply();
                    }
                  }}
                />
                <button type="button" disabled={selectedTicket.status === "closed" || replySending} onClick={handleSendReply}>
                  <FiSend />
                </button>
              </div>
            </>
          )}
        </div>

        <aside className={styles.admin_details}>
          <form className={styles.admin_createTicket} onSubmit={handleCreateSupportTicket}>
            <div className={styles.admin_createTicketTitle}>
              <span>
                <FiMessageCircle />
              </span>
              <div>
                <h2>Написать пользователю</h2>
                <p>Создаст новый тикет и первое сообщение от поддержки.</p>
              </div>
            </div>

            <label>
              <span>Email пользователя</span>
              <input
                type="email"
                value={newTicketDraft.email}
                placeholder="user@example.com"
                autoComplete="off"
                onChange={(event) =>
                  setNewTicketDraft((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>

            <label>
              <span>Тема</span>
              <input
                value={newTicketDraft.subject}
                placeholder="Например: Уточнение по P2P сделке"
                maxLength={180}
                onChange={(event) =>
                  setNewTicketDraft((current) => ({ ...current, subject: event.target.value }))
                }
              />
            </label>

            <div className={styles.admin_createTicketRow}>
              <label>
                <span>Категория</span>
                <select
                  value={newTicketDraft.category}
                  onChange={(event) =>
                    setNewTicketDraft((current) => ({ ...current, category: event.target.value }))
                  }
                >
                  {Object.entries(ticketCategoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Приоритет</span>
                <select
                  value={newTicketDraft.priority}
                  onChange={(event) =>
                    setNewTicketDraft((current) => ({ ...current, priority: event.target.value }))
                  }
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span>Сообщение</span>
              <textarea
                value={newTicketDraft.text}
                placeholder="Текст, который увидит пользователь в поддержке"
                maxLength={4000}
                onChange={(event) =>
                  setNewTicketDraft((current) => ({ ...current, text: event.target.value }))
                }
              />
            </label>

            <button type="submit" disabled={creatingTicket}>
              {creatingTicket ? "Создаем..." : "Создать тикет"}
            </button>
          </form>

          <h2>Контекст</h2>

          {selectedTicket && (
            <>
              <div className={styles.admin_client}>
                <span>
                  <FiUser />
                </span>
                <div>
                  <strong>{getTicketClientName(selectedTicket)}</strong>
                  <p>{selectedTicket.user?.email}</p>
                </div>
              </div>

              <dl className={styles.admin_meta}>
                <div>
                  <dt>Тикет</dt>
                  <dd>#{selectedTicket.id}</dd>
                </div>
                <div>
                  <dt>Категория</dt>
                  <dd>{ticketCategoryLabels[selectedTicket.category] || selectedTicket.category || "-"}</dd>
                </div>
                <div>
                  <dt>Статус</dt>
                  <dd>{selectedTicket.status}</dd>
                </div>
                <div>
                  <dt>Дата</dt>
                  <dd>{formatDate(selectedTicket.createdAt)}</dd>
                </div>
              </dl>

              <div className={styles.admin_note}>
                Перед закрытием тикета проверьте статус сделки и последний ответ клиента.
              </div>
            </>
          )}
        </aside>
      </section>
      )}

      {activeSection === "deals" && (
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
      )}

      {activeSection === "features" && (
        <section className={styles.admin_deals}>
          <div className={styles.admin_dealsTop}>
            <div><h2>Доступность разделов</h2><p>Выключенный раздел покажет пользователям страницу обновления и заблокирует его API.</p></div>
            <button type="button" onClick={() => loadPlatformFeatures()} disabled={platformFeaturesLoading}><FiRefreshCw /> Обновить</button>
          </div>
          <div className={styles.admin_featureGrid}>
            {[['p2p', 'P2P рынок'], ['processing', 'Процессинг'], ['nft', 'NFT Market'],['market','Маркет'],['guarantor','Гарант']].map(([feature, label]) => (
              <article key={feature}>
                <div><strong>{label}</strong><span>{platformFeatures[feature] === false ? "На обновлении" : "Доступен"}</span></div>
                <button type="button" disabled={platformFeaturesLoading||Boolean(platformFeatureSaving)} aria-label={`${platformFeatures[feature]===false?'Включить':'Отключить'} ${label}`} className={platformFeatures[feature] === false ? styles.admin_featureOff : ""} onClick={() => handlePlatformFeatureChange(feature, platformFeatures[feature] === false)}>{platformFeatureSaving===feature?'Сохраняем…':platformFeatures[feature] === false ? "Включить" : "Отключить"}</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeSection === "payments" && (
        <section className={styles.admin_payments}>
          <div className={styles.admin_paymentsTop}>
            <div>
              <h2>Справочник способов оплаты</h2>
              <p>{activePaymentDefinitionCount} активных из {paymentDefinitions.length}</p>
            </div>
            <button type="button" onClick={() => loadPaymentDefinitions()} disabled={paymentDefinitionsLoading}>
              <FiRefreshCw />
              {paymentDefinitionsLoading ? "Обновляем" : "Обновить"}
            </button>
          </div>

          <div className={styles.admin_paymentsGrid}>
            <form className={styles.admin_paymentForm} onSubmit={handleSavePaymentDefinition}>
              <h3>{editingPaymentCode ? "Редактирование" : "Новый способ"}</h3>
              <label>
                <span>Код</span>
                <input
                  value={paymentDefinitionDraft.code}
                  disabled={Boolean(editingPaymentCode)}
                  placeholder="sber, sepa, santander"
                  onChange={(event) => handlePaymentDraftChange("code", event.target.value)}
                />
              </label>
              <div>
                <label>
                  <span>Название</span>
                  <input
                    value={paymentDefinitionDraft.name}
                    placeholder="СберБанк"
                    onChange={(event) => handlePaymentDraftChange("name", event.target.value)}
                  />
                </label>
                <label>
                  <span>Коротко</span>
                  <input
                    value={paymentDefinitionDraft.shortName}
                    placeholder="Сбер"
                    onChange={(event) => handlePaymentDraftChange("shortName", event.target.value)}
                  />
                </label>
              </div>
              <div>
                <label>
                  <span>Группа</span>
                  <select
                    value={paymentDefinitionDraft.group}
                    onChange={(event) => handlePaymentDraftChange("group", event.target.value)}
                  >
                    <option value="fast">Быстрые переводы</option>
                    <option value="banks">Банки</option>
                    <option value="wallets">Кошельки</option>
                    <option value="cash">Наличные и другое</option>
                    <option value="other">Другое</option>
                  </select>
                </label>
                <label>
                  <span>Цвет</span>
                  <input
                    value={paymentDefinitionDraft.tone}
                    placeholder="#21a038"
                    onChange={(event) => handlePaymentDraftChange("tone", event.target.value)}
                  />
                </label>
              </div>
              <label>
                <span>Скорость</span>
                <input
                  value={paymentDefinitionDraft.speed}
                  placeholder="обычно 1-10 мин."
                  onChange={(event) => handlePaymentDraftChange("speed", event.target.value)}
                />
              </label>
              <label>
                <span>Описание</span>
                <input
                  value={paymentDefinitionDraft.description}
                  placeholder="Перевод по реквизитам продавца"
                  onChange={(event) => handlePaymentDraftChange("description", event.target.value)}
                />
              </label>
              <div className={styles.admin_paymentFields}>
                <div className={styles.admin_paymentFieldsTop}>
                  <span>Поля реквизитов</span>
                  <button type="button" onClick={handleAddPaymentField}>
                    Добавить поле
                  </button>
                </div>
                <small>
                  Для SEPA Spain используйте IBAN: обязательное поле, 24 символа, regex ^ES[0-9A-Z]&#123;22&#125;$, пример ES03636...
                </small>

                {normalizePaymentFields(paymentDefinitionDraft.fields).map((field, index) => (
                  <article key={`${field.key || "field"}-${index}`} className={styles.admin_paymentFieldCard}>
                    <div>
                      <label>
                        <span>Ключ</span>
                        <input
                          value={field.key}
                          placeholder="iban"
                          onChange={(event) => handlePaymentFieldChange(index, "key", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Название</span>
                        <input
                          value={field.label}
                          placeholder="IBAN"
                          onChange={(event) => handlePaymentFieldChange(index, "label", event.target.value)}
                        />
                      </label>
                    </div>
                    <div>
                      <label>
                        <span>Мин. символов</span>
                        <input
                          type="number"
                          min="0"
                          value={field.minLength}
                          placeholder="24"
                          onChange={(event) => handlePaymentFieldChange(index, "minLength", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Макс. символов</span>
                        <input
                          type="number"
                          min="0"
                          value={field.maxLength}
                          placeholder="24"
                          onChange={(event) => handlePaymentFieldChange(index, "maxLength", event.target.value)}
                        />
                      </label>
                    </div>
                    <label>
                      <span>Regex формата</span>
                      <input
                        value={field.pattern}
                        placeholder="^ES[0-9A-Z]{22}$"
                        onChange={(event) => handlePaymentFieldChange(index, "pattern", event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Пример / placeholder</span>
                      <input
                        value={field.placeholder}
                        placeholder="ES03636..."
                        onChange={(event) => handlePaymentFieldChange(index, "placeholder", event.target.value)}
                      />
                    </label>
                    <footer>
                      <label className={styles.admin_paymentSwitch}>
                        <input
                          type="checkbox"
                          checked={field.required !== false}
                          onChange={(event) => handlePaymentFieldChange(index, "required", event.target.checked)}
                        />
                        <span>Обязательное</span>
                      </label>
                      <button type="button" onClick={() => handleRemovePaymentField(index)}>
                        <FiTrash2 />
                        Удалить поле
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
              <label className={styles.admin_paymentSwitch}>
                <input
                  type="checkbox"
                  checked={paymentDefinitionDraft.active}
                  onChange={(event) => handlePaymentDraftChange("active", event.target.checked)}
                />
                <span>Доступен пользователям</span>
              </label>
              <div className={styles.admin_paymentFormActions}>
                <button type="submit">{editingPaymentCode ? "Сохранить" : "Добавить"}</button>
                <button type="button" onClick={handleResetPaymentDefinition}>Сбросить</button>
              </div>
            </form>

            <div className={styles.admin_paymentList}>
              {paymentDefinitionsLoading && (
                <div className={styles.admin_dealsEmpty}>Загружаем способы оплаты...</div>
              )}

              {!paymentDefinitionsLoading && paymentDefinitions.map((method) => (
                <article key={method.code} className={!method.active ? styles.admin_paymentCardMuted : styles.admin_paymentCard}>
                  <div>
                    <span style={{ "--method-tone": method.tone }}>{method.shortName}</span>
                    <div>
                      <strong>{method.name}</strong>
                      <p>{method.description || method.speed}</p>
                    </div>
                    <b>{method.active ? "Активен" : "Выключен"}</b>
                  </div>
                  <ul>
                    {(method.fields || []).map((field) => (
                      <li key={field.key}>
                        <span>{field.label}</span>
                        {field.required !== false && <em>обяз.</em>}
                        {(field.minLength || field.maxLength) && (
                          <small>
                            {field.minLength || 0}-{field.maxLength || "∞"} симв.
                          </small>
                        )}
                        {field.pattern && <small>regex</small>}
                      </li>
                    ))}
                  </ul>
                  <footer>
                    <button type="button" onClick={() => handleEditPaymentDefinition(method)}>
                      Изменить
                    </button>
                    <button type="button" onClick={() => handleTogglePaymentDefinition(method)}>
                      {method.active ? "Выключить" : "Включить"}
                    </button>
                    <button type="button" onClick={() => handleDeletePaymentDefinition(method)}>
                      <FiTrash2 />
                      Удалить
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeSection === "transactions" && <TransactionHistory admin title="Транзакции биржи"/>}

      {activeSection === "processing" && (
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
                            <small>{formatFiatAmount(requisite.min_transaction_amount, requisite.fiat_currency)}–{formatFiatAmount(requisite.max_transaction_amount, requisite.fiat_currency)}</small>
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
      )}

      {activeSection === "trading" && (
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
      )}

      {activeSection === "users" && (
        <section className={styles.admin_users}>
          <div className={styles.admin_usersSide}>
            <div className={styles.admin_usersNotice}>
              <span>
                <FiBell />
              </span>
              <div>
                <h2>Новые регистрации</h2>
                <p>{registrations.length} последних аккаунтов</p>
              </div>
            </div>
            <div className={styles.admin_registrationList}>
              {registrations.map((user) => (
                <article key={user.id}>
                  <strong>{user.email}</strong>
                  <span>{user.username || `ID ${user.id}`}</span>
                  <small>{formatDate(user.createdAt)}</small>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.admin_usersMain}>
            <div className={styles.admin_dealsTop}>
              <div>
                <h2>Аккаунты</h2>
                <p>{adminUsers.length} пользователей</p>
              </div>
              <button type="button" onClick={() => loadAdminUsers()} disabled={adminUsersLoading}>
                <FiRefreshCw />
                {adminUsersLoading ? "Обновляем" : "Обновить"}
              </button>
            </div>
            <label className={styles.admin_search}>
              <FiSearch />
              <input
                value={adminUserSearch}
                placeholder="Email, логин или ID"
                onChange={(event) => setAdminUserSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    loadAdminUsers();
                  }
                }}
              />
            </label>

            <div className={styles.admin_userList}>
              {adminUsersLoading && <div className={styles.admin_dealsEmpty}>Загружаем пользователей...</div>}
              {!adminUsersLoading && adminUsers.map((user) => (
                <article key={user.id} className={styles.admin_userCard}>
                  <div>
                    <strong>{user.email}</strong>
                    <span>ID {user.id} / {user.username || "без логина"}</span>
                    <small>{formatDate(user.createdAt)}</small>
                  </div>
                  <div className={styles.admin_userMeta}>
                    <span>{userStatusLabels[user.status] || user.status || "Активен"}</span>
                    <span>{Object.keys(user.walletBalances || {}).length} валют</span>
                    <span>${Number(user.totalBalanceUsd || 0).toFixed(2)}</span>
                    <span className={styles.admin_walletBreakdown}>
                      {Object.entries(user.walletBalances || {}).map(([currency, amount]) => `${currency}: ${formatWalletBalance(amount, currency)}`).join(" · ")}
                    </span>
                  </div>
                  <div className={styles.admin_userControls}>
                    <UserBalances userId={user.id}/>
                    {[
                      ["depositsEnabled", "Ввод"],
                      ["withdrawalsEnabled", "Вывод"],
                      ["internalTransfersEnabled", "Внутренние переводы"],
                      ["p2pEnabled", "P2P"],
                      ["nftEnabled", "NFT-маркет"],
                      ["guarantorEnabled", "Гарант"],
                      ["tradingEnabled", "Торговля"],
                      ["marketAccountsEnabled", "Маркет: аккаунты"],
                      ["marketServicesEnabled", "Маркет: услуги"],
                    ].map(([key, label]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          disabled={user.status === "deleted" || savingUserControls.includes(user.id)}
                          checked={Boolean(user[key])}
                          onChange={(event) =>
                            handleUpdateUserControls(user, { [key]: event.target.checked })
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                    <button
                      type="button"
                      disabled={user.status === "deleted" || savingUserControls.includes(user.id)}
                      onClick={() =>
                        handleUpdateUserControls(user, {
                          status: user.status === "blocked" ? "active" : "blocked",
                        })
                      }
                    >
                      {user.status === "deleted"
                        ? "Удален"
                        : user.status === "blocked"
                          ? "Разблокировать"
                          : "Заблокировать"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
};

export default Admin;
