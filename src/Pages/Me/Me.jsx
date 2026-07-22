import React, { useEffect, useState } from "react";
import styles from "./Me.module.scss";
import { FaUser, FaUserPlus } from "react-icons/fa";
import { TbCopy } from "react-icons/tb";
import bg from "../../assets/images/Group 756.png";
import { BiChevronRight, BiDislike, BiLike } from "react-icons/bi";
import { RiCoupon2Line } from "react-icons/ri";
import { IoCard } from "react-icons/io5";
import { HiUser } from "react-icons/hi";
import { GrNotification } from "react-icons/gr";
import { FaUserLock } from "react-icons/fa6";
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
    else {
      localStorage.removeItem("token");
      window.location.reload();
    }
  }, []);

  const handleDeleteAccount = () => {
    if (!canDelete || deleting) return;

    setDeleting(true);

    api
      .delete("/api/auth/me")
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
        <button
          type="button"
          className={styles.profile_top_delete}
          onClick={() => setConfirmationOpen(true)}
          disabled={deleting}
        >
          <LuTrash2 />
          Удалить аккаунт
        </button>
      </div>
      <div className={styles.profile_info}>
        <div className={styles.profile_info_left}>
          <div className={styles.profile_info_item}>
            <h1 className="h1">7</h1>
            <p className="p">Сделок за 30 дней</p>
          </div>
          <div className={styles.profile_info_item}>
            <h1 className="h1">12</h1>
            <p className="p">Всего завершено</p>
          </div>
          <div className={styles.profile_info_secondDiv}>
            <button>Buy</button>
            <span></span>
            <button>Sell</button>
          </div>
        </div>{" "}
        <div className={styles.profile_info_left}>
          <div className={styles.profile_info_item}>
            <h1 className="h1">63%</h1>
            <p className="p">Успешность за 30 дней</p>
          </div>
          <div className={styles.profile_info_item}>
            <h1 className="h1">100%</h1>
            <p className="p">Положительный рейтинг</p>
          </div>
          <div className={styles.profile_info_secondDiv}>
            <button>
              <BiLike />
            </button>
            <span></span>
            <button>
              <BiDislike />
            </button>
          </div>
        </div>
      </div>
      <div className={styles.profile_section}>
        <div className={styles.profile_section_item}>
          <section className="p">
            <RiCoupon2Line />
            P2P купоны
          </section>
          <section className="span">
            <p>
              <BiChevronRight />
            </p>
          </section>
        </div>
        <div className={styles.profile_section_item}>
          <section className="p">
            <IoCard />
            Способы оплаты
          </section>
          <section className="span">
            <p>5</p>
            <p>
              <BiChevronRight />
            </p>
          </section>
        </div>
      </div>{" "}
      <div className={styles.profile_section_item}>
        <section className="p">
          <HiUser />
          Статус продавца
        </section>
        <section>
          <p className="span">Подать заявку </p>
          <p className="span">
            <BiChevronRight />
          </p>
        </section>
      </div>
      <div className={styles.profile_section}>
        <div className={styles.profile_section_item}>
          <section className="p">
            <BiLike />
            Оставить отзыв
          </section>
          <section>
            <p className="span">100%</p>
            <p className="span">
              <BiChevronRight />
            </p>
          </section>
        </div>
        <div className={styles.profile_section_item}>
          <section className="p">
            <GrNotification />
            Уведомления
          </section>
          <section className="span">
            <p>5</p>
            <p>
              <BiChevronRight />
            </p>
          </section>
        </div>
      </div>{" "}
      <div className={styles.profile_section}>
        <div className={styles.profile_section_item}>
          <section className="p">
            <FaUserPlus />
            Подписки
          </section>
          <section>
            <p className="span"></p>
            <p className="span">
              <BiChevronRight />
            </p>
          </section>
        </div>
        <div className={styles.profile_section_item}>
          <section className="p">
            <FaUserLock />
            Черный список
          </section>
          <section className="span">
            <p>5</p>
            <p>
              <BiChevronRight />
            </p>
          </section>
        </div>
      </div>
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
            <button
              type="button"
              className="red-button"
              onClick={handleDeleteAccount}
              disabled={!canDelete || deleting}
            >
              {deleting ? "Удаляем..." : "Удалить аккаунт"}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setConfirmationOpen(false);
                setConfirmationText("");
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
