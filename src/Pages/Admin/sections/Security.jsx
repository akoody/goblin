// Админка, раздел «Безопасность: журнал входов по IP и устройствам». Состояние и загрузка в хуке useSecurityAdmin: он вызывается в Admin, поэтому данные
// и черновики не теряются при переключении вкладок. Разметка в SecuritySection.
import { useEffect, useRef, useState } from "react";
import { FiSearch } from "react-icons/fi";
import { enqueueSnackbar } from "notistack";
import api from "../../../api";
import styles from "../Admin.module.scss";

export function useSecurityAdmin({  } = {}) {
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

  return { loadLoginIps, loginIpQuery, loginIpQueryRef, loginIpRequest, loginIps, loginIpsError, loginIpsLoading, reviewLoginIp, setLoginIpQuery, setLoginIps, setLoginIpsError, setLoginIpsLoading };
}

export function SecuritySection({ loginIpQuery, loginIps, loginIpsError, loginIpsLoading, reviewLoginIp, setLoginIpQuery }) {
  return (
 <section className={styles.loginSecurity}>
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
            <td>{entry.username} · #{entry.user_id}</td><td>{entry.ip}</td><td title={entry.user_agent}>{entry.device}</td><td>{entry.os}</td><td>{entry.browser}</td><td>{entry.previous_ip || "-"}</td>
            <td>{new Date(entry.first_seen_at).toLocaleString("ru-RU")}</td><td>{new Date(entry.last_seen_at).toLocaleString("ru-RU")}</td><td>{entry.login_count}</td>
            <td>{entry.is_new_ip && !entry.reviewed_at ? <button type="button" onClick={() => reviewLoginIp(entry.id)}>Новый IP · Просмотрено</button> : entry.is_new_ip ? "Просмотрено" : "Первый IP"}</td>
          </tr>)}{!loginIps.rows.length && !loginIpsError && !loginIpsLoading && <tr><td colSpan="10">{loginIpQuery.trim()?'По вашему запросу входов не найдено.':'История появится после следующих входов пользователей.'}</td></tr>}</tbody>
        </table></div>
      </section>
  );
}
