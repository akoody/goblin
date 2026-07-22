import React, { useState } from "react";
import styles from "../Login/Login.module.scss";
import { Input } from "../../Components/Input/Input";
import { CiLock, CiUser } from "react-icons/ci";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { enqueueSnackbar } from "notistack";
import { FaShieldAlt } from "react-icons/fa";
import { FiArrowRight, FiCheckCircle } from "react-icons/fi";
import api from "../../api";
import { getApiErrorMessage } from "../../utils/notifications";

export const Signin = () => {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  React.useEffect(() => {
    const code = searchParams.get("ref");
    if (code) {
      setReferralCode(code.toUpperCase());
    }
  }, [searchParams]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      enqueueSnackbar("Пароли не совпадают", {
        variant: "error",
        autoHideDuration: 2000,
      });
      return;
    }

    setLoading(true);
    api
      .post("/auth/register", {
        username,
        password,
        email,
        referralCode: referralCode.trim() || undefined,
      })
      .then(() => {
        enqueueSnackbar("Регистрация прошла успешно!", {
          variant: "success",
          autoHideDuration: 2000,
        });
        navigate("/login");
      })
      .catch((error) => {
        console.error(error);
        enqueueSnackbar(getApiErrorMessage(error, "Ошибка регистрации"), {
          variant: "error",
          autoHideDuration: 4500,
        });
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className={styles.login}>
      <section className={styles.loginHero}>
        <div className={styles.loginBrand}>
          <span>
            <FaShieldAlt />
          </span>
          Goblin P2P
        </div>
        <h1>Создайте аккаунт для торговли и кошелька</h1>
        <p>
          После регистрации вы сможете добавлять способы оплаты, создавать
          ордера и вести сделки в едином кабинете.
        </p>
        <div className={styles.loginBenefits}>
          <div>
            <FiCheckCircle />
            Быстрый старт
          </div>
          <div>
            <FiCheckCircle />
            P2P-профиль
          </div>
          <div>
            <FiCheckCircle />
            Кошелек и история
          </div>
        </div>
      </section>

      <section className={styles.loginContainer}>
        <div className={styles.loginTitleBlock}>
          <p>Новый аккаунт</p>
          <h1 className="header-30">Регистрация</h1>
          <span>Заполните данные, чтобы получить доступ к кабинету.</span>
        </div>
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <Input
            value={email}
            name="email"
            onChange={(value) => setEmail(value)}
            placeholder={
              <p>
                <CiUser /> Почта
              </p>
            }
          />
          <Input
            value={username}
            name="username"
            onChange={(value) => setUsername(value)}
            placeholder={
              <p>
                <CiUser /> Имя пользователя
              </p>
            }
          />
          <Input
            onChange={(value) => setPassword(value)}
            value={password}
            name="password"
            type="password"
            placeholder={
              <p>
                <CiLock /> Пароль
              </p>
            }
          />
          <Input
            onChange={(value) => setConfirmPassword(value)}
            value={confirmPassword}
            type="password"
            placeholder={
              <p>
                <CiLock /> Пароль (повторите)
              </p>
            }
          />
          <Input
            value={referralCode}
            name="referralCode"
            required={false}
            onChange={(value) => setReferralCode(value.toUpperCase())}
            placeholder={
              <p>
                <CiUser /> Реферальный код (необязательно)
              </p>
            }
          />
          <button type="submit" className="green-button" disabled={loading}>
            {loading ? "Создаем..." : "Зарегистрироваться"}
            {!loading && <FiArrowRight />}
          </button>
          <Link to="/login" className="link">
            Уже есть аккаунт? <u>Войти</u>
          </Link>
        </form>
      </section>
    </div>
  );
};
