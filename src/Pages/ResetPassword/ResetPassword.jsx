import React, { useState } from "react";
import styles from "../Login/Login.module.scss";
import { CiLock, CiUser } from "react-icons/ci";
import { FaShieldAlt } from "react-icons/fa";
import { FiArrowLeft, FiArrowRight, FiCheckCircle } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { enqueueSnackbar } from "notistack";
import { Input } from "../../Components/Input/Input";
import { getApiErrorMessage } from "../../utils/notifications";
import api from "../../api";

export const ResetPassword = () => {
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState("request");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRequest = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/password-reset/request", { identifier });
      setStep("confirm");
      enqueueSnackbar("Если аккаунт найден, код отправлен на почту.", { variant: "success", autoHideDuration: 4500 });
    } catch (error) {
      enqueueSnackbar(getApiErrorMessage(error, "Не удалось отправить код"), { variant: "error", autoHideDuration: 4500 });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (event) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      enqueueSnackbar("Пароли не совпадают", { variant: "error", autoHideDuration: 2500 });
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/password-reset/confirm", { identifier, code, password });
      enqueueSnackbar("Пароль изменён. Войдите с новым паролем.", { variant: "success", autoHideDuration: 3500 });
      navigate("/login", { replace: true });
    } catch (error) {
      enqueueSnackbar(getApiErrorMessage(error, "Не удалось изменить пароль"), { variant: "error", autoHideDuration: 4500 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.login}>
      <section className={styles.loginHero}>
        <div className={styles.loginBrand}>
          <span><FaShieldAlt /></span>
          CryptoGoblin
        </div>
        <h1>Верните доступ к аккаунту</h1>
        <p>Мы отправим одноразовый код на почту, указанную при регистрации.</p>
        <div className={styles.loginBenefits}>
          <div><FiCheckCircle /> Код действует 15 минут</div>
          <div><FiCheckCircle /> До 5 попыток ввода</div>
          <div><FiCheckCircle /> Защищенное восстановление</div>
        </div>
      </section>

      <section className={styles.loginContainer}>
        <div className={styles.loginTitleBlock}>
          <p>{step === "request" ? "Восстановление" : "Проверка кода"}</p>
          <h1 className="header-30">{step === "request" ? "Забыли пароль?" : "Введите код"}</h1>
          <span>{step === "request" ? "Укажите email или имя пользователя." : "Введите код из письма и задайте новый пароль."}</span>
        </div>

        {step === "request" ? (
          <form onSubmit={handleRequest} className={styles.loginForm}>
            <Input value={identifier} name="identifier" onChange={setIdentifier} placeholder={<p><CiUser /> Email или имя пользователя</p>} />
            <button type="submit" className="green-button" disabled={loading}>
              {loading ? "Отправляем..." : "Получить код"}{!loading && <FiArrowRight />}
            </button>
            <Link to="/login" className="link"><FiArrowLeft /> Вернуться ко входу</Link>
          </form>
        ) : (
          <form onSubmit={handleConfirm} className={styles.loginForm}>
            <Input value={code} name="code" onChange={setCode} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder={<p><CiLock /> Код из письма</p>} />
            <Input value={password} name="password" type="password" minLength={8} onChange={setPassword} placeholder={<p><CiLock /> Новый пароль</p>} />
            <Input value={confirmPassword} name="confirmPassword" type="password" minLength={8} onChange={setConfirmPassword} placeholder={<p><CiLock /> Повторите пароль</p>} />
            <button type="submit" className="green-button" disabled={loading}>
              {loading ? "Сохраняем..." : "Сменить пароль"}{!loading && <FiArrowRight />}
            </button>
            <button type="button" className="link" onClick={() => setStep("request")}>Отправить код снова</button>
          </form>
        )}
      </section>
    </div>
  );
};
