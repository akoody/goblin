import React, { useEffect, useState } from "react";
import logo from '../../assets/images/Гоблин 2.svg';
import styles from "./Login.module.scss";
import { Input } from "../../Components/Input/Input";
import { CiLock } from "react-icons/ci";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { enqueueSnackbar } from "notistack";
import { MdEmail } from "react-icons/md";
import { FaShieldAlt } from "react-icons/fa";
import { FiArrowRight, FiCheckCircle, FiLoader } from "react-icons/fi";
import api from "../../api";
import { getApiErrorMessage } from "../../utils/notifications";

export const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const accountDeletedMessage = sessionStorage.getItem("accountDeletedMessage");

    if (accountDeletedMessage) {
      sessionStorage.removeItem("accountDeletedMessage");
      enqueueSnackbar(accountDeletedMessage, {
        variant: "success",
        autoHideDuration: 5000,
      });
    }

    if (new URLSearchParams(window.location.search).get("reason") === "session-expired") {
      enqueueSnackbar("Сессия завершилась. Войдите снова.", { variant: "info" });
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (localStorage.getItem("token")) navigate("/me", { replace: true });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    let deviceModel = "";
    try {
      if (navigator.userAgentData?.getHighEntropyValues) {
        const hints = await Promise.race([
          navigator.userAgentData.getHighEntropyValues(["model"]),
          new Promise((resolve) => window.setTimeout(() => resolve({}), 500)),
        ]);
        deviceModel = hints.model || "";
      }
    } catch { /* Device hints are optional; sign-in must still work. */ }
    api
      .post("/auth/login", { username, password, deviceModel })
      .then((response) => {
        const token = response.data.access_token;
        localStorage.setItem("token", token);
        const redirectTo = location.state?.from?.pathname || "/me";
        navigate(redirectTo, { replace: true });
      })
      .catch((error) => {
        console.error(error);
        enqueueSnackbar(getApiErrorMessage(error, "Ошибка входа"), {
          variant: "error",
          autoHideDuration: 4200,
        });
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className={styles.login}>
      <section className={styles.loginHero}>
        <div className={styles.loginBrand}>
          <span>
            <img src={logo} alt="Гоблин" width="48" height="48"/>
          </span>
          Goblin P2P
        </div>
        <h1>Рабочий кабинет для P2P и кошелька</h1>
        <p>
          Управляйте балансом, сделками и поддержкой из единого сервиса.
        </p>
        <div className={styles.loginBenefits}>
          <div>
            <FiCheckCircle />
            Защищенный вход
          </div>
          <div>
            <FiCheckCircle />
            Быстрые P2P-сделки
          </div>
          <div>
            <FiCheckCircle />
            Контроль кошельков
          </div>
        </div>
      </section>

      <section className={styles.loginContainer}>
        <div className={styles.loginTitleBlock}>
          <p>С возвращением</p>
          <h1 className="header-30">Вход</h1>
          <span>Введите данные аккаунта, чтобы продолжить работу.</span>
        </div>
        <form
          onSubmit={handleSubmit}
          onInvalidCapture={() => setValidationAttempted(true)}
          className={`${styles.loginForm} ${validationAttempted ? styles.loginFormInvalid : ""}`}
        >
          <Input
            onChange={(value) => setUsername(value)}
            value={username}
            name="username"
            autoComplete="username"
            placeholder={
              <p>
                <MdEmail /> Имя пользователя
              </p>
            }
          />
          <Input
            onChange={(value) => setPassword(value)}
            value={password}
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder={
              <p>
                <CiLock /> Пароль
              </p>
            }
          />
          <Link to="/reset-pass" className="link">
            Забыли пароль?
          </Link>
          <button type="submit" className="green-button" disabled={loading}>
            {loading ? <><FiLoader className={styles.spinner} aria-hidden="true" /> Входим...</> : "Войти"}
            {!loading && <FiArrowRight />}
          </button>
          <Link to="/signin" className="link">
            Нет аккаунта? <u>Зарегистрироваться</u>
          </Link>
          <Link to="/">Посмотреть сайт без регистрации</Link>
        </form>
      </section>
    </div>
  );
};
