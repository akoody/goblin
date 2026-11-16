// Админка, раздел «Отчёт по деньгам»: каждая комиссия, пришедшая в казну, и каждое списание из неё с источником и
// пользователем; итоги по видам и валютам; сверка остатка казны с журналами; выгрузка того же отбора в CSV.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api";
import styles from "./IncomeReport.module.scss";

const trim = value => String(value ?? "0").replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
const when = value => new Date(value).toLocaleString("ru-RU");
const empty = { kind: "", direction: "", currency: "", from: "", to: "", q: "" };
const params = (filter, page) => Object.fromEntries(Object.entries({ ...filter, page }).filter(([, value]) => value !== "" && value !== undefined));

/** Куда ведёт источник строки: сделка, сделка гаранта; остальное (депозит, задание сети, выплата) показываем номером. */
function Source({ row }) {
  const id = row.sourceId;
  if (!id) return <span>-</span>;
  if (row.sourceType === "P2P_DEAL") return <Link to={`/deal/${encodeURIComponent(id)}`}>P2P сделка #{id}</Link>;
  if (row.sourceType === "COMMERCE_DEAL") return <Link to={`/manage/commerce/deals/${encodeURIComponent(id)}`}>Сделка гаранта {id.slice(0, 8)}</Link>;
  // реферальная выплата: ведём к операции, с комиссии которой она начислена
  if (row.sourceType === "REFERRAL") {
    const [kind, sourceId] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
    if (kind === "P2P") return <Link to={`/deal/${encodeURIComponent(sourceId)}`}>С комиссии P2P сделки #{sourceId}</Link>;
    if (kind === "ESCROW") return <Link to={`/manage/commerce/deals/${encodeURIComponent(sourceId)}`}>С комиссии гаранта {sourceId.slice(0, 8)}</Link>;
    if (kind === "DEPOSIT") return <span>С комиссии депозита {sourceId}</span>;
    return <span>С комиссии: {id}</span>;
  }
  const names = { DEPOSIT: "Депозит", PUMP_LAUNCH: "Запуск", NATIVE_JOB: "Задание сети", COLLECTION_JOB: "Сбор SOL", TREASURY_PAYOUT: "Выплата", REFERRAL: "Источник" };
  return <span>{names[row.sourceType] || row.sourceType} {id}</span>;
}

export function IncomeReport() {
  const [draft, setDraft] = useState(empty);
  const [filter, setFilter] = useState(empty);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setLoading(true); setError("");
    api.get("/admin/income-report", { params: params(filter, page) })
      .then(response => { if (request.current === id) setData(response.data); })
      .catch(e => { if (request.current === id) setError(e.response?.data?.message || "Не удалось загрузить отчёт"); })
      .finally(() => { if (request.current === id) setLoading(false); });
  }, [filter, page]);

  const apply = event => { event.preventDefault(); setPage(1); setFilter({ ...draft, q: draft.q.trim() }); };
  const reset = () => { setDraft(empty); setPage(1); setFilter(empty); };
  const download = async () => {
    setDownloading(true); setError("");
    try {
      const response = await api.get("/admin/income-report.csv", { params: params(filter), responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url; link.download = `goblin-income-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch { setError("Не удалось выгрузить CSV"); }
    finally { setDownloading(false); }
  };
  const pages = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 50)));
  const field = name => event => setDraft(old => ({ ...old, [name]: event.target.value }));

  return (
    <section className={styles.report}>
      <h2>Отчёт по деньгам платформы</h2>
      <p>Каждая комиссия, пришедшая в казну, и каждое списание из неё: откуда, с какого пользователя, по какой сделке. Сверка ниже сравнивает остаток казны с суммой журналов.</p>

      <form className={styles.filters} onSubmit={apply}>
        <label>Операция
          <select value={draft.kind} onChange={field("kind")}>
            <option value="">Все</option>
            {(data?.kinds || []).map(kind => <option key={kind.kind} value={kind.kind}>{kind.label}</option>)}
          </select>
        </label>
        <label>Направление
          <select value={draft.direction} onChange={field("direction")}>
            <option value="">Приход и расход</option><option value="IN">Приход в казну</option><option value="OUT">Расход из казны</option>
          </select>
        </label>
        <label>Валюта<input value={draft.currency} onChange={field("currency")} placeholder="USDT" maxLength={8} /></label>
        <label>С<input type="date" value={draft.from} onChange={field("from")} /></label>
        <label>По<input type="date" value={draft.to} onChange={field("to")} /></label>
        <label className={styles.search}>Поиск
          <input type="search" value={draft.q} onChange={field("q")} placeholder="#id или имя пользователя, id сделки, хэш" maxLength={100} aria-label="Поиск по отчёту" />
        </label>
        <div className={styles.actions}>
          <button type="submit">Показать</button>
          <button type="button" onClick={reset}>Сбросить</button>
          <button type="button" onClick={download} disabled={downloading}>{downloading ? "Готовлю CSV…" : "Скачать CSV"}</button>
        </div>
      </form>
      {error && <p role="alert" className={styles.error}>{error}</p>}

      <h3>Сверка казны</h3>
      <div className={styles.table}><table>
        <thead><tr><th>Валюта</th><th>Пришло</th><th>Ушло</th><th>По журналам</th><th>В казне</th><th>Разница</th></tr></thead>
        <tbody>{(data?.reconciliation || []).map(row => (
          <tr key={row.currency} className={row.matches ? "" : styles.mismatch}>
            <td>{row.currency}</td><td>{trim(row.income)}</td><td>{trim(row.expense)}</td><td>{trim(row.ledgerNet)}</td><td>{trim(row.treasuryBalance)}</td>
            <td>{row.matches ? "сходится" : `${trim(row.difference)}: движение вне журналов`}</td>
          </tr>))}
        </tbody>
      </table></div>

      <h3>Итоги по отбору</h3>
      <div className={styles.table}><table>
        <thead><tr><th>Операция</th><th>Направление</th><th>Валюта</th><th>Сумма</th><th>Записей</th></tr></thead>
        <tbody>{(data?.totals || []).map(row => (
          <tr key={`${row.kind}-${row.currency}`}><td>{row.label}</td><td>{row.direction === "IN" ? "приход" : "расход"}</td><td>{row.currency}</td><td>{trim(row.total)}</td><td>{row.count}</td></tr>))}
          {data && !data.totals.length && <tr><td colSpan={5}>Нет операций по отбору</td></tr>}
        </tbody>
      </table></div>

      <h3>Операции</h3>
      <div className={styles.table}><table>
        <thead><tr><th>Дата</th><th>Операция</th><th>Сумма</th><th>До и после комиссии</th><th>Пользователь</th><th>Источник</th><th>Детали</th></tr></thead>
        <tbody>{(data?.rows || []).map(row => (
          <tr key={row.id}>
            <td>{when(row.at)}</td>
            <td>{row.label}<small>{row.direction === "IN" ? "приход в казну" : "расход из казны"}</small></td>
            <td className={row.direction === "IN" ? styles.in : styles.out}>{row.direction === "IN" ? "+" : "−"}{trim(row.amount)} {row.currency}{row.percent !== null && <small>{trim(row.percent)}%</small>}</td>
            <td>{row.gross !== null ? <>{trim(row.gross)}{row.net !== null && <> → {trim(row.net)}</>}</> : "-"}</td>
            <td>{row.userId ? `${row.username || "без имени"} · #${row.userId}` : "-"}</td>
            <td><Source row={row} /></td>
            <td>{row.details || "-"}</td>
          </tr>))}
          {data && !data.rows.length && <tr><td colSpan={7}>Нет операций по отбору</td></tr>}
        </tbody>
      </table></div>
      <div className={styles.pages}>
        <button type="button" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Назад</button>
        <span role="status">{loading ? "Загрузка…" : `Страница ${page} из ${pages} · Всего: ${data?.total ?? 0}`}</span>
        <button type="button" disabled={loading || page >= pages} onClick={() => setPage(page + 1)}>Далее</button>
      </div>
    </section>
  );
}
