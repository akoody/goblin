// Админка, раздел «Пользователи: поиск, ограничения, регистрации, балансы». Состояние и загрузка в хуке useUsersAdmin: он вызывается в Admin, поэтому данные
// и черновики не теряются при переключении вкладок. Разметка в UsersSection.
import { useEffect, useRef, useState } from "react";
import { UserBalances } from "../UserBalances";
import { FiBell, FiSearch, FiRefreshCw } from "react-icons/fi";
import { enqueueSnackbar } from "notistack";
import api from "../../../api";
import { getApiErrorMessage } from "../../../utils/notifications";
import styles from "../Admin.module.scss";
import { formatDate, formatTradingAmount } from "../adminFormat";

const walletPrecisions = { BTC: 8, ETH: 18, USDT: 6, TRX: 6, SOL: 9 };

const formatWalletBalance = (value, currency) => formatTradingAmount(value, walletPrecisions[currency] || 8);

const userStatusLabels = {
  active: "Активен",
  blocked: "Заблокирован",
  deleted: "Удален пользователем",
};

export function useUsersAdmin({  } = {}) {
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const pendingUserControls = useRef(new Set());
  const [savingUserControls, setSavingUserControls] = useState([]);
  const [adminUserSearch, setAdminUserSearch] = useState("");
  const [registrations, setRegistrations] = useState([]);
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

  useEffect(() => {
    loadAdminUsers(true);
    loadRegistrations();
  }, []);

  return { adminUserSearch, adminUsers, adminUsersLoading, handleUpdateUserControls, loadAdminUsers, loadRegistrations, pendingUserControls, registrations, savingUserControls, setAdminUserSearch, setAdminUsers, setAdminUsersLoading, setRegistrations, setSavingUserControls };
}

export function UsersSection({ adminUserSearch, adminUsers, adminUsersLoading, handleUpdateUserControls, loadAdminUsers, registrations, savingUserControls, setAdminUserSearch }) {
  return (
 (
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
      )
  );
}
