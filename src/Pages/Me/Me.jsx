import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Me.module.scss";
import { FaUser } from "react-icons/fa";
import { TbCopy } from "react-icons/tb";
import bg from "../../assets/images/Group 756.png";
import { BiChevronRight } from "react-icons/bi";
import { IoCard } from "react-icons/io5";
import { Loader } from "../../Components/Loader/Loader";
import api from "../../api";
import { LuTrash2 } from "react-icons/lu";
import { enqueueSnackbar } from "notistack";

export const Me = () => {
  const [user, setUser] = useState({});
  const [loading, setLoading] = useState({});
  const [deleting, setDeleting] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [confirmationPassword, setConfirmationPassword] = useState("");
  const [stats, setStats] = useState(null);
  const [paymentMethodCount, setPaymentMethodCount] = useState(null);
  const token = localStorage.getItem("token");
  const canDelete = confirmationText.trim().toUpperCase() === "УДАЛИТЬ";

  useEffect(() => {
    if (token)
      api
        .get(`/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => {
          setUser(response.data);
        })
        .catch((err) => {
          if (err.response?.status == 401) {
            localStorage.removeItem("token");
            window.location.reload();
          }
        })
        .finally(() => setLoading(false));

    if (token) {
      api.get("/api/auth/me/stats").then((response) => setStats(response.data)).catch(() => {});
      api.get("/payment-methods").then((response) => {
        setPaymentMethodCount(Array.isArray(response.data) ? response.data.length : 0);
      }).catch(() => {});
    }
    else {
      localStorage.removeItem("token");
      window.location.reload();
    }
  }, []);

  const handleDeleteAccount = () => {
    if (!canDelete || !confirmationPassword || deleting) return;

    setDeleting(true);

    api
      .delete("/api/auth/me", { data: { password: confirmationPassword } })
      .then(() => {
        localStorage.clear();
        sessionStorage.setItem("accountDeletedMessage", "Аккаунт полностью удален");
        window.location.href = "/login";
      })
      .catch((err) => {
        const status = err.response?.status;
        const serverMessage = err.response?.data?.message;
        const unsupportedMessage =
          status === 404 || status === 405
            ? "Удаление аккаунта пока не подключено на сервере. Обновите backend и попробуйте еще раз."
            : "Не удалось удалить аккаунт";

        enqueueSnackbar(serverMessage || unsupportedMessage, { variant: "error" });
      })
      .finally(() => setDeleting(false));
  };

  return (
    <div className={styles.profile}>
      {loading && <Loader />}
      <img src={bg} className="background" alt="" />
      <div className={styles.profile_top}>
        <section>
          <FaUser />
        </section>
        <div className={styles.profile_top_info}>
          <h1 className="h1">
            {user.email}
            <button
              onClick={() => {
                navigator.clipboard.writeText(user.email);
              }}
            >
              <TbCopy />
            </button>
          </h1>
          {/* <div>
            <p>
              <FiCheckCircle
                style={{ color: "#376C11", borderColor: "#376C11" }}
              />
              Email
            </p>{" "}
            <p>
              <FiAlertCircle
                style={{ color: "#BE1600", borderColor: "#BE1600" }}
              />
              SMS
            </p>{" "}
            <p>
              <FiCheckCircle
                style={{ color: "#376C11", borderColor: "#376C11" }}
              />
              Identity Verification
            </p>{" "}
            <p>
              <FiAlertCircle
                style={{ color: "#BE1600", borderColor: "#BE1600" }}
              />
              Deposit
            </p>
          </div> */}
        </div>
      </div>
      <div className={styles.profile_info}>
        <div className={styles.profile_info_left}>
          <div className={styles.profile_info_item}>
            <h1 className="h1">{stats ? stats.recent : "—"}</h1>
            <p className="p">Сделок за 30 дней</p>
          </div>
          <div className={styles.profile_info_item}>
            <h1 className="h1">{stats ? stats.completed : "—"}</h1>
            <p className="p">Всего завершено</p>
          </div>
        </div>{" "}
        <div className={styles.profile_info_left}>
          <div className={styles.profile_info_item}>
            <h1 className="h1">{stats ? `${stats.successRate}%` : "—"}</h1>
            <p className="p">Успешность завершённых сделок</p>
          </div>
          <div className={styles.profile_info_item}>
            <h1 className="h1">{stats ? stats.cancelled : "—"}</h1>
            <p className="p">Отменено сделок</p>
          </div>
        </div>
      </div>
      <div className={styles.profile_section}>
        <Link className={styles.profile_section_item} to="/me?section=payment-methods">
          <section className="p">
            <IoCard />
            Способы оплаты
          </section>
          <section className="span">
            <p>{paymentMethodCount ?? "—"}</p>
            <p>
              <BiChevronRight />
            </p>
          </section>
        </Link>
      </div>{" "}
      <section className={styles.profile_danger_zone}>
        <div>
          <strong>Опасная зона</strong>
          <p>Удаление отключит аккаунт и финансовые операции. Действие требует пароля.</p>
        </div>
        <button
          type="button"
          className={styles.profile_top_delete}
          onClick={() => setConfirmationOpen(true)}
          disabled={deleting}
        >
          <LuTrash2 /> Удалить аккаунт
        </button>
      </section>
      {confirmationOpen && (
        <div className={styles.modal}>
          <div className={styles.modal_content}>
            <h1>Удалить аккаунт?</h1>
            <p>
              Аккаунт будет отключен, активная сессия завершится. История
              операций, сделок, тикетов и транзакций останется доступна
              администраторам.
            </p>
            <label className={styles.modal_confirm}>
              <span>Введите УДАЛИТЬ для подтверждения</span>
              <input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                autoFocus
              />
            </label>
            <label className={styles.modal_confirm}>
              <span>Текущий пароль</span>
              <input
                type="password"
                autoComplete="current-password"
                value={confirmationPassword}
                onChange={(event) => setConfirmationPassword(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="red-button"
              onClick={handleDeleteAccount}
              disabled={!canDelete || !confirmationPassword || deleting}
            >
              {deleting ? "Удаляем..." : "Удалить аккаунт"}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setConfirmationOpen(false);
                setConfirmationText("");
                setConfirmationPassword("");
              }}
              disabled={deleting}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
