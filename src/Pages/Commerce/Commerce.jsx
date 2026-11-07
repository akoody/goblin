import { useCallback, useEffect, useRef, useState } from "react";
import {ChatProfile} from '../../Components/Chat/ChatProfile';
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { enqueueSnackbar } from "notistack";
import {
  FiShoppingBag,
  FiShield,
  FiArrowRight,
  FiSearch,
  FiCopy,
} from "react-icons/fi";
import api from "../../api";
import styles from "./Commerce.module.scss";

const prefix = "/api/commerce";
const money = (value, currency = "RUB") =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: currency === "RUB" ? 2 : 6 }).format(Number(value || 0))} ${currency === "RUB" ? "₽" : "USDT"}`;
const date = (value) => new Date(value).toLocaleString("ru-RU");
const labels = {
  WAITING: "Ожидает участника",
  READY: "Ожидает резервирования",
  FUNDED: "Средства зарезервированы",
  DELIVERED: "Передано — ожидает приёмки",
  DISPUTED: "Открыт спор",
  COMPLETED: "Завершена",
  REFUNDED: "Возврат",
  CANCELLED: "Отменена",
  PENDING: "На проверке",
  APPROVED: "Подтверждена",
  REJECTED: "Отклонена",
};
const operations = {
  RESERVE: "Резерв сделки",
  PAYOUT: "Продажа",
  GUARANTEE_FEE: "Комиссия гаранта",
  REFUND: "Возврат",
  TOP_UP: "Пополнение",
  WITHDRAW_RESERVE: "Резерв вывода",
  WITHDRAW_RETURN: "Возврат вывода",
  WITHDRAW_APPROVED: "Вывод подтверждён",
};
const actions = {
  create: "Создание",
  join: "Участник присоединился",
  fund: "Средства зарезервированы",
  deliver: "Продавец передал заказ",
  complete: "Покупатель подтвердил получение",
  dispute: "Открыт спор",
  refund: "Возврат покупателю",
  cancel: "Отмена",
  "resolve-pay": "Администратор выплатил продавцу",
  "resolve-refund": "Администратор вернул покупателю",
  "admin-cancel": "Администратор отменил сделку",
};

function useData(path, enabled = true) {
  const requestId = useRef(0);
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(enabled);
  const reload = useCallback(async () => {
    if (!enabled) return;
    const currentRequest = ++requestId.current;
    try {
      const response = await api.get(prefix + path);
      if (currentRequest !== requestId.current) return;
      setData(response.data);
      setError("");
    } catch (e) {
      if (currentRequest !== requestId.current) return;
      setError(e.response?.data?.message || "Не удалось загрузить данные");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [path, enabled]);
  useEffect(() => {
    setData(null);
    setLoading(enabled);
    reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload, enabled]);
  return { data, error, loading, reload };
}
function useMutation() {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const run = async (work) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      return await work();
    } catch (e) {
      enqueueSnackbar(
        e.response?.data?.message || "Не удалось выполнить операцию",
        { variant: "error" },
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return { busy, run };
}
function State({ request }) {
  if (request.error)
    return (
      <p role="alert" className={styles.error}>
        {request.error} <button onClick={request.reload}>Повторить</button>
      </p>
    );
  if (request.loading) return <p role="status">Загрузка…</p>;
  return null;
}
function Shell({ title, description, children }) {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Маркет и гарант">
        <NavLink to="/market" end>
          <FiShoppingBag /> Маркет
        </NavLink>
        <NavLink to="/market/sell">Продать</NavLink>
        <NavLink to="/market/orders">Мои покупки и продажи</NavLink>
        <NavLink to="/market/wallet">Баланс ₽</NavLink>
        <NavLink to="/guarantor">
          <FiShield /> Гарант
        </NavLink>
      </nav>
      <header className={styles.heading}>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </main>
  );
}
function LoginNotice() {
  return (
    <div className={styles.panel}>
      Для этой операции нужен аккаунт CryptoGoblin.{" "}
      <Link to="/login">
        Войти <FiArrowRight />
      </Link>
    </div>
  );
}
function DealRows({ deals = [] }) {
  return (
    <div className={styles.rows}>
      {deals.map((d) => (
        <Link className={styles.row} key={d.id} to={`/commerce/deals/${d.id}`}>
          <div>
            <strong>{d.title}</strong>
            <small>
              {d.kind === "MARKET" ? "Маркет" : "Гарант"} · {date(d.created_at)}
            </small>
          </div>
          <div>
            <strong>{money(d.amount, d.currency)}</strong>
            <small>{labels[d.status]}</small>
          </div>
          <FiArrowRight />
        </Link>
      ))}
      {!deals.length && (
        <p className={styles.empty}>Здесь появятся ваши сделки.</p>
      )}
    </div>
  );
}
export function Market() {
  const [category, setCategory] = useState(""),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0);
  const categories = useData("/catalog"),
    listings = useData(
      `/listings?category=${encodeURIComponent(category)}&search=${encodeURIComponent(search)}&offset=${offset}`,
    );
  const navigate = useNavigate(),
    mutation = useMutation();
  const [purchaseKeys] = useState(() => new Map());
  const buy = (l) =>
    mutation.run(async () => {
      if (!localStorage.getItem("token")) {
        navigate("/login", { state: { from: { pathname: "/market" } } });
        return;
      }
      if (
        !window.confirm(
          `Купить «${l.title}» за ${money(l.price)}? Сумма будет зарезервирована до подтверждения получения.`,
        )
      )
        return;
      if (!purchaseKeys.has(l.id)) purchaseKeys.set(l.id, crypto.randomUUID());
      const { data } = await api.post(prefix + "/purchase", {
        listingId: l.id,
        requestKey: purchaseKeys.get(l.id),
      });
      navigate(`/commerce/deals/${data.id}`);
    });
  return (
    <Shell
      title="Маркет"
      description="Игры, подписки и цифровые услуги. Покупки в рублях, передача в чате и защита сделки."
    >
      <div className={styles.toolbar}>
        <label>
          <FiSearch />
          <input
            aria-label="Поиск товаров"
            placeholder="Найти товар или услугу"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <select
          aria-label="Категория"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">Все категории</option>
          {categories.data?.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <Link className={styles.primary} to="/market/sell">
          Разместить объявление
        </Link>
      </div>
      <State request={categories} />
      <State request={listings} />
      {!listings.loading && (
        <div className={styles.grid}>
          {listings.data?.map((l) => (
            <article className={styles.card} key={l.id}>
              <small>
                {categories.data?.find((c) => c.slug === l.category)?.name} ·{" "}
                {l.section}
              </small>
              <h2>{l.title}</h2>
              <p className={styles.description}>{l.description}</p>
              <span className={styles.muted}>Продавец: {l.seller_name}</span>
              <footer>
                <strong>{money(l.price)}</strong>
                <button
                  className={styles.primary}
                  disabled={mutation.busy}
                  onClick={() => buy(l)}
                >
                  Купить
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
      {!listings.loading && !listings.error && !listings.data?.length && (
        <div className={styles.panel}>
          <h2>Пока нет объявлений</h2>
          <p>Выберите другую категорию или разместите первое предложение.</p>
        </div>
      )}
      <div className={styles.inline}>
        {offset > 0 && (
          <button onClick={() => setOffset(Math.max(0, offset - 60))}>
            Назад
          </button>
        )}
        {listings.data?.length === 60 && (
          <button onClick={() => setOffset(offset + 60)}>
            Следующие предложения
          </button>
        )}
      </div>
    </Shell>
  );
}
export function MarketSell() {
  const categories = useData("/catalog"),
    own = useData("/me", Boolean(localStorage.getItem("token"))),
    mutation = useMutation();
  const [category, setCategory] = useState(""),
    [done, setDone] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const form = e.currentTarget;
    mutation.run(async () => {
      await api.post(prefix + "/listings", body);
      form.reset();
      setCategory("");
      setDone(true);
      own.reload();
    });
  };
  return (
    <Shell
      title="Продать в маркете"
      description="Разместите своё предложение. Средства покупателя защищены до завершения заказа."
    >
      {!localStorage.getItem("token") ? (
        <LoginNotice />
      ) : (
        <div className={styles.columns}>
          <form className={styles.panel} onSubmit={submit}>
            <h2>Новое объявление</h2>
            <State request={categories} />
            <label>
              Категория
              <select
                name="category"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Выберите категорию</option>
                {categories.data?.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Раздел
              <select key={category} name="section" required>
                <option value="">Выберите раздел</option>
                {categories.data
                  ?.find((c) => c.slug === category)
                  ?.sections.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </select>
            </label>
            <label>
              Название
              <input name="title" required minLength={3} maxLength={120} />
            </label>
            <label>
              Описание
              <textarea
                name="description"
                required
                minLength={10}
                maxLength={5000}
              />
            </label>
            <label>
              Условия передачи
              <textarea
                name="deliveryNote"
                required
                minLength={3}
                maxLength={2000}
                placeholder="Что и когда получит покупатель"
              />
            </label>
            <label>
              Цена, ₽
              <input
                name="price"
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                required
              />
            </label>
            <button className={styles.primary} disabled={mutation.busy}>
              Опубликовать
            </button>
            {done && (
              <p role="status">
                Объявление опубликовано в <Link to="/market">маркете</Link>.
              </p>
            )}
          </form>
          <section className={styles.panel}>
            <h2>Мои объявления</h2>
            <State request={own} />
            {own.data?.listings.map((l) => (
              <article className={styles.listItem} key={l.id}>
                <strong>{l.title}</strong>
                <p>
                  {money(l.price)} ·{" "}
                  {l.status === "ACTIVE"
                    ? "Опубликовано"
                    : l.status === "BLOCKED"
                      ? "Заблокировано администратором"
                      : "Приостановлено"}
                </p>
                <button
                  disabled={mutation.busy || l.status === "BLOCKED"}
                  onClick={() =>
                    mutation.run(async () => {
                      await api.patch(prefix + `/listings/${l.id}`, {
                        status: l.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                      });
                      own.reload();
                    })
                  }
                >
                  {l.status === "ACTIVE"
                    ? "Приостановить"
                    : l.status === "BLOCKED"
                      ? "Заблокировано"
                      : "Возобновить"}
                </button>
              </article>
            ))}
            {own.data && !own.data.listings.length && (
              <p>У вас пока нет объявлений.</p>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
export function MarketOrders() {
  const me = useData("/me");
  return (
    <Shell
      title="Мои покупки и продажи"
      description="Заказы маркета, переписка и подтверждение получения."
    >
      <State request={me} />
      <DealRows deals={me.data?.deals.filter((d) => d.kind === "MARKET")} />
    </Shell>
  );
}
export function MarketWallet() {
  const me = useData("/me"),
    mutation = useMutation(),
    [requestKey, setRequestKey] = useState(() => crypto.randomUUID()),
    [done, setDone] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const form = e.currentTarget;
    mutation.run(async () => {
      await api.post(prefix + "/payments", { ...body, requestKey });
      setRequestKey(crypto.randomUUID());
      form.reset();
      setDone(true);
      me.reload();
    });
  };
  return (
    <Shell
      title="Рублёвый баланс"
      description="Баланс маркета отдельный: он не конвертируется автоматически в криптовалюту."
    >
      <State request={me} />
      <div className={styles.columns}>
        <section className={styles.panel}>
          <h2>{money(me.data?.rubBalance)}</h2>
          <p>Доступно для покупок</p>
          <p>В сделках: {money(me.data?.held.rub)}</p>
          <h3>История операций</h3>
          {me.data?.history
            .filter((h) => h.currency === "RUB")
            .map((h, i) => (
              <div className={styles.listItem} key={i}>
                <strong>
                  {operations[h.operation] || h.operation}: {money(h.amount)}
                </strong>
                <small>{date(h.created_at)}</small>
              </div>
            ))}
          {!me.data?.history.some((h) => h.currency === "RUB") && (
            <p>Операций пока нет.</p>
          )}
        </section>
        <form className={styles.panel} onSubmit={submit}>
          <h2>Заявка на пополнение / вывод</h2>
          <p>
            Пополнение зачисляется только после проверки фактического платежа
            администратором. Для реквизитов оплаты обратитесь в{" "}
            <Link to="/help">поддержку</Link>. При заявке на вывод сумма
            резервируется сразу.
          </p>
          <label>
            Операция
            <select name="kind">
              <option value="TOP_UP">Пополнение</option>
              <option value="WITHDRAWAL">Вывод</option>
            </select>
          </label>
          <label>
            Сумма, ₽
            <input
              type="number"
              name="amount"
              min="0.01"
              max="1000000"
              step="0.01"
              required
            />
          </label>
          <label>
            Данные платежа или реквизиты вывода
            <textarea
              name="details"
              minLength={5}
              maxLength={1000}
              required
              placeholder="Дата, номер платежа, банк. Не указывайте пароль или CVV."
            />
          </label>
          <button className={styles.primary} disabled={mutation.busy}>
            Отправить заявку
          </button>
          {done && <p role="status">Заявка передана администратору.</p>}
        </form>
      </div>
      <section className={styles.panel}>
        <h2>Заявки</h2>
        {me.data?.payments.map((p) => (
          <div className={styles.listItem} key={p.id}>
            <strong>
              {p.kind === "TOP_UP" ? "Пополнение" : "Вывод"} · {money(p.amount)}
            </strong>
            <p>
              {labels[p.status]} · {date(p.created_at)}
            </p>
            <p>{p.review_note}</p>
          </div>
        ))}
      </section>
    </Shell>
  );
}
export function Guarantor() {
  const token = Boolean(localStorage.getItem("token")),
    me = useData("/me", token),
    feePolicy = useData("/escrow/policy"),
    mutation = useMutation(),
    navigate = useNavigate();
  const [key] = useState(() => crypto.randomUUID());
  const submit = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    mutation.run(async () => {
      const { data } = await api.post(prefix + "/escrow", {
        ...body,
        requestKey: key,
      });
      navigate(`/commerce/deals/${data.id}`);
    });
  };
  return (
    <Shell
      title="Гарант"
      description="Договоритесь об условиях, пригласите вторую сторону и защитите оплату резервом USDT."
    >
      <section className={styles.steps}>
        <div>
          <b>1. Условия</b>
          <p>Создайте сделку и передайте ссылку контрагенту.</p>
        </div>
        <div>
          <b>2. Резерв</b>
          <p>После присоединения продавца покупатель резервирует USDT.</p>
        </div>
        <div>
          <b>3. Передача</b>
          <p>
            Покупатель подтверждает получение — продавец получает оплату. Споры
            решает администратор.
          </p>
        </div>
      </section>
      <aside className={styles.feeNotice} aria-live="polite">
        <strong>Комиссия гаранта — {feePolicy.data ? `${feePolicy.data.feePercent}%` : "…"}</strong>
        <p>Минимальная сумма: {feePolicy.data ? money(feePolicy.data.minimumAmount, "USDT") : "…"}. Комиссия удерживается из выплаты продавцу только после успешного завершения сделки. При возврате или отмене комиссия не взимается. Условия фиксируются при создании сделки.</p>
      </aside>
      {!token ? (
        <LoginNotice />
      ) : (
        <>
          <State request={me} />
          <div className={styles.columns}>
            <form className={styles.panel} onSubmit={submit}>
              <h2>Новая сделка</h2>
              <label>
                Ваша роль
                <select name="role">
                  <option value="BUYER">Покупатель</option>
                  <option value="SELLER">Продавец</option>
                </select>
              </label>
              <label>
                Название
                <input name="title" minLength={2} maxLength={120} required />
              </label>
              <label>
                Условия сделки
                <textarea
                  name="terms"
                  minLength={5}
                  maxLength={2000}
                  required
                  placeholder="Предмет сделки, срок и критерии выполнения"
                />
              </label>
              <label>
                Сумма, USDT
                <input
                  name="amount"
                  type="number"
                  step="0.000001"
                  min={feePolicy.data?.minimumAmount || "5"}
                  max="1000000"
                  required
                />
              </label>
              <p>
                Свободно: {money(me.data?.availableUsdt, "USDT")} · В гаранте:{" "}
                {money(me.data?.held.usdt, "USDT")}
              </p>
              <button className={styles.primary} disabled={mutation.busy}>
                Создать сделку
              </button>
            </form>
            <section className={styles.panel}>
              <h2>Мои сделки гаранта</h2>
              <DealRows
                deals={me.data?.deals.filter((d) => d.kind === "ESCROW")}
              />
            </section>
          </div>
        </>
      )}
    </Shell>
  );
}
export function CommerceDeal({ admin = false }) {
  const { id } = useParams(),
    request = useData(`/deals/${id}`),
    me = useData("/me"),
    mutation = useMutation();
  const [message, setMessage] = useState(""),
    [note, setNote] = useState(""),
    [copied, setCopied] = useState(false);
  const readMessageAttempts = useRef(new Set());
  const messagesRef = useRef(null);
  const followingMessages = useRef(true);
  const [newMessages, setNewMessages] = useState(false);
  const lastMessageId = request.data?.messages?.at(-1)?.id;
  const toLatest = () => {
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    followingMessages.current = true;
    setNewMessages(false);
  };
  useEffect(() => {
    followingMessages.current = true;
    setNewMessages(false);
  }, [id]);
  useEffect(() => {
    if (!lastMessageId) return;
    if (followingMessages.current) toLatest();
    else setNewMessages(true);
  }, [lastMessageId]);
  useEffect(() => {
    const timer = window.setInterval(request.reload, 7000);
    return () => window.clearInterval(timer);
  }, [request.reload]);
  useEffect(() => {
    if (!admin || !request.data?.deal) return;
    const latestMessageId = Number(request.data.messages?.at(-1)?.id || 0);
    if (!latestMessageId) return;
    const readKey = `${id}:${latestMessageId}`;
    if (readMessageAttempts.current.has(readKey)) return;
    readMessageAttempts.current.add(readKey);
    api.post(prefix + `/admin/deals/${id}/read`).catch(() => {
      enqueueSnackbar("Не удалось обновить отметку о прочтении чата", {
        variant: "error",
      });
    });
  }, [admin, id, request.data]);
  const d = request.data?.deal,
    user = me.data?.user?.id;
  const buyer = d && String(d.buyer_id) === String(user),
    seller = d && String(d.seller_id) === String(user);
  const act = (action) =>
    mutation.run(async () => {
      const confirmations = {
        fund: "Зарезервировать USDT на сделке?",
        complete: "Подтвердить получение и перевести USDT продавцу?",
        refund: "Вернуть зарезервированные USDT покупателю?",
        "resolve-pay": "Перевести зарезервированные USDT продавцу?",
        "resolve-refund": "Вернуть зарезервированные USDT покупателю?",
        "admin-cancel": "Отменить сделку без движения средств?",
      };
      if (confirmations[action] && !window.confirm(confirmations[action]))
        return;
      await api.post(prefix + `${admin ? "/admin" : ""}/deals/${id}/action`, {
        action,
        note,
      });
      setNote("");
      await request.reload();
      me.reload();
    });
  const send = (e) => {
    e.preventDefault();
    mutation.run(async () => {
      await api.post(prefix + `/deals/${id}/messages`, { text: message });
      setMessage("");
      followingMessages.current = true;
      request.reload();
    });
  };
  return (
    <Shell
      title={d?.title || "Сделка"}
      description="Условия, защищённая оплата и переписка участников."
    >
      <State request={request} />
      <State request={me} />
      {d && (
        <div className={styles.columns}>
          <section className={styles.panel}>
            <div className={styles.inline}>
              <h2>{money(d.amount, d.currency)}</h2>
              <span className={styles.status}>{labels[d.status]}</span>
            </div>
            <p>
              Покупатель: {d.buyer_name || "Ожидается"}
              <br />
              Продавец: {d.seller_name || "Ожидается"}
            </p>
            {d.kind === "ESCROW" && (
              <p className={styles.dealFee}>
                Комиссия гаранта: {Number(d.guarantor_fee_percent || 0)}% из выплаты продавцу при успешном завершении.
              </p>
            )}
            <h3>Условия</h3>
            <p className={styles.terms}>{d.terms}</p>
            <a className={styles.chatLink} href="#deal-chat">Перейти к чату ↓</a>
            {d.status === "WAITING" && (
              <>
                <p>
                  Передайте ссылку только вашему контрагенту: первый
                  присоединившийся займёт свободное место.
                </p>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${window.location.origin}/commerce/deals/${id}`,
                      );
                      setCopied(true);
                    } catch {
                      enqueueSnackbar("Скопируйте ссылку из адресной строки", {
                        variant: "info",
                      });
                    }
                  }}
                >
                  <FiCopy />{" "}
                  {copied ? "Ссылка скопирована" : "Скопировать приглашение"}
                </button>
              </>
            )}
            {request.data.canJoin ? (
              <button
                className={styles.primary}
                disabled={mutation.busy}
                onClick={() =>
                  mutation.run(async () => {
                    await api.post(prefix + `/deals/${id}/join`);
                    request.reload();
                  })
                }
              >
                Принимаю условия — присоединиться
              </button>
            ) : (
              <>
                {buyer && d.status === "READY" && (
                  <>
                    <p>
                      Резервирование списывает {money(d.amount, d.currency)} с
                      доступного баланса. Средства защищены до завершения
                      сделки.
                    </p>
                    <button
                      className={styles.primary}
                      disabled={mutation.busy}
                      onClick={() => act("fund")}
                    >
                      Принять условия и зарезервировать USDT
                    </button>
                  </>
                )}
                {seller && d.status === "FUNDED" && (
                  <button
                    className={styles.primary}
                    disabled={mutation.busy}
                    onClick={() => act("deliver")}
                  >
                    Заказ передан покупателю
                  </button>
                )}
                {buyer && d.status === "DELIVERED" && (
                  <>
                    <p>
                      Подтверждайте только после проверки: оплата будет
                      переведена продавцу.
                    </p>
                    <button
                      className={styles.primary}
                      disabled={mutation.busy}
                      onClick={() => act("complete")}
                    >
                      Подтвердить получение и оплатить
                    </button>
                  </>
                )}
                {(buyer || seller) &&
                  ["WAITING", "READY"].includes(d.status) && (
                    <button
                      disabled={mutation.busy}
                      onClick={() => act("cancel")}
                    >
                      Отменить сделку
                    </button>
                  )}
                {(buyer || seller) &&
                  ["FUNDED", "DELIVERED"].includes(d.status) && (
                    <>
                      <label>
                        Причина спора
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          maxLength={2000}
                        />
                      </label>
                      <button
                        disabled={mutation.busy || note.trim().length < 5}
                        onClick={() => act("dispute")}
                      >
                        Открыть спор
                      </button>
                      {seller && (
                        <button
                          disabled={mutation.busy}
                          onClick={() => act("refund")}
                        >
                          Вернуть деньги покупателю
                        </button>
                      )}
                    </>
                  )}
                {d.status === "DISPUTED" && (
                  <p>
                    Средства остаются в резерве. Администратор проверит условия
                    и переписку.
                  </p>
                )}
                {admin && ["WAITING", "READY", "FUNDED", "DELIVERED", "DISPUTED"].includes(d.status) && (
                  <>
                    <label>
                      Причина решения администратора
                      <textarea
                        aria-label="Причина решения администратора"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={2000}
                      />
                    </label>
                    {d.funded_at && ["FUNDED", "DELIVERED", "DISPUTED"].includes(d.status) ? (
                      <>
                        <button className={styles.primary} disabled={mutation.busy || note.trim().length < 5} onClick={() => act("resolve-pay")}>
                          Выплатить {money(d.amount, d.currency)} продавцу
                        </button>
                        <button disabled={mutation.busy || note.trim().length < 5} onClick={() => act("resolve-refund")}>
                          Вернуть {money(d.amount, d.currency)} покупателю
                        </button>
                      </>
                    ) : ["WAITING", "READY"].includes(d.status) ? (
                      <button disabled={mutation.busy || note.trim().length < 5} onClick={() => act("admin-cancel")}>
                        Отменить сделку без перевода средств
                      </button>
                    ) : (
                      <p>Для перевода требуется активный резерв средств.</p>
                    )}
                  </>
                )}
              </>
            )}
            <details>
              <summary>История сделки</summary>
              {request.data.events.map((ev, i) => (
                <p key={i}>
                  <small>{date(ev.created_at)}</small>
                  <br />
                  {actions[ev.action] || ev.action}
                  {ev.note && `: ${ev.note}`}
                </p>
              ))}
            </details>
          </section>
          <section id="deal-chat" className={`${styles.panel} ${styles.chatPanel}`}>
            <h2>Чат сделки</h2>
            <p className={styles.chatNote}>Обновляется автоматически. Обсуждайте условия и передачу заказа здесь.</p>
            {!request.data.canJoin && (
              <>
                <div ref={messagesRef} className={styles.messages} role="log" aria-label="Сообщения сделки" onScroll={e => {
                  const list = e.currentTarget;
                  followingMessages.current = list.scrollHeight - list.scrollTop - list.clientHeight < 70;
                  if (followingMessages.current) setNewMessages(false);
                }}>
                  {request.data.messages.map((m) => (
                    <article className={`${styles.message} ${String(m.sender_id) === String(user) ? styles.ownMessage : ''}`} key={m.id}>
                      <ChatProfile profile={m.sender||{username:m.sender_name}}/>
                      <small>{date(m.created_at)}</small>
                      <p>{m.text}</p>
                    </article>
                  ))}
                  {!request.data.messages.length && (
                    <p>Передача и обсуждение заказа происходят здесь.</p>
                  )}
                </div>
                {newMessages && <button type="button" onClick={toLatest}>Новые сообщения ↓</button>}
                {!["COMPLETED", "REFUNDED", "CANCELLED"].includes(d.status) && (
                  <form onSubmit={send} className={styles.messageForm}>
                    <label>
                      Сообщение
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={2000}
                        rows={3}
                        placeholder="Напишите сообщение…"
                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (message.trim() && !mutation.busy) e.currentTarget.form.requestSubmit(); } }}
                        required
                      />
                    </label>
                    <button
                      className={styles.primary}
                      disabled={mutation.busy || !message.trim()}
                    >
                      {mutation.busy ? 'Отправка…' : 'Отправить'}
                    </button>
                    <span className={styles.chatNote}>{message.length}/2000 · Ctrl/⌘ + Enter — отправить</span>
                  </form>
                )}
              </>
            )}
            {request.data.canJoin && (
              <p>Чат появится после принятия условий.</p>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
export function CommerceAdmin() {
  const request = useData("/admin"),
    mutation = useMutation(),
    [notes, setNotes] = useState({});
  const review = (p, status) =>
    mutation.run(async () => {
      if (
        !window.confirm(
          status === "APPROVED"
            ? "Подтверждаете, что платёж реально получен / вывод выполнен?"
            : "Отклонить заявку?",
        )
      )
        return;
      await api.post(prefix + `/admin/payments/${p.id}`, {
        status,
        note: notes[p.id],
      });
      request.reload();
    });
  return (
    <Shell
      title="Администрирование маркета и гаранта"
      description="Проверка рублёвых платежей и разрешение споров."
    >
      <Link to="/admin">← Основная админка</Link>
      <Link to="/admin?section=guarantor">Все сделки гаранта →</Link>
      <State request={request} />
      <section className={styles.panel}>
        <h2>Объявления маркета</h2>
        {request.data?.listings?.map((l) => (
          <article className={styles.listItem} key={l.id}>
            <strong>
              {l.title} · {money(l.price)}
            </strong>
            <p>
              {l.seller_name} ·{" "}
              {l.status === "ACTIVE"
                ? "Опубликовано"
                : l.status === "BLOCKED"
                  ? "Заблокировано"
                  : "Приостановлено"}
            </p>
            <p>{l.description}</p>
            <button
              disabled={mutation.busy}
              onClick={() =>
                mutation.run(async () => {
                  await api.patch(prefix + `/admin/listings/${l.id}`, {
                    status: l.status === "BLOCKED" ? "PAUSED" : "BLOCKED",
                  });
                  request.reload();
                })
              }
            >
              {l.status === "BLOCKED"
                ? "Снять блокировку (оставить на паузе)"
                : "Заблокировать объявление"}
            </button>
          </article>
        ))}
        {!request.data?.listings?.length && <p>Объявлений пока нет.</p>}
      </section>
      <section className={styles.panel}>
        <h2>Рублёвые платежи</h2>
        <p>
          Подтверждайте пополнение только по фактическому поступлению денег.
          Вывод подтверждайте после фактической выплаты.
        </p>
        {request.data?.payments.map((p) => (
          <article className={styles.listItem} key={p.id}>
            <strong>
              {p.username}: {p.kind === "TOP_UP" ? "пополнение" : "вывод"}{" "}
              {money(p.amount)}
            </strong>
            <p>
              {labels[p.status]} · {date(p.created_at)}
            </p>
            <p className={styles.terms}>{p.details}</p>
            {p.status === "PENDING" ? (
              <>
                <label>
                  Подтверждение / причина
                  <input
                    value={notes[p.id] || ""}
                    onChange={(e) =>
                      setNotes({ ...notes, [p.id]: e.target.value })
                    }
                    maxLength={1000}
                  />
                </label>
                <div className={styles.inline}>
                  <button
                    disabled={
                      mutation.busy || (notes[p.id] || "").trim().length < 5
                    }
                    onClick={() => review(p, "APPROVED")}
                  >
                    Подтвердить
                  </button>
                  <button
                    disabled={
                      mutation.busy || (notes[p.id] || "").trim().length < 5
                    }
                    onClick={() => review(p, "REJECTED")}
                  >
                    Отклонить
                  </button>
                </div>
              </>
            ) : (
              <p>{p.review_note}</p>
            )}
          </article>
        ))}
        {!request.data?.payments.length && <p>Заявок пока нет.</p>}
      </section>
      <section className={styles.panel}>
        <h2>Сделки и споры</h2>
        <div className={styles.rows}>
          {request.data?.deals.map((d) => (
            <Link
              className={styles.row}
              key={d.id}
              to={`/manage/commerce/deals/${d.id}`}
            >
              <div>
                <strong>{d.title}</strong>
                <small>
                  {d.buyer_name || "—"} → {d.seller_name || "—"}
                </small>
              </div>
              <div>
                <strong>{money(d.amount, d.currency)}</strong>
                <small>{labels[d.status]}</small>
              </div>
              <FiArrowRight />
            </Link>
          ))}
        </div>
      </section>
    </Shell>
  );
}
