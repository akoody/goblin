import { FaAndroid, FaApple, FaDownload, FaShieldAlt } from "react-icons/fa";
import { FiCheckCircle, FiSmartphone } from "react-icons/fi";
import goblin from "../../assets/images/Гоблин 2.svg";
import styles from "./Download.module.scss";

const apkVersion = "1.1.1";
const apkUrl = `/downloads/cryptogoblin-android-v${apkVersion}.apk`;

export const Download = () => (
  <main className={styles.download}>
    <section className={styles.download_card}>
      <img src={goblin} alt="Гоблин" className={styles.download_logo} />
      <span className={styles.download_badge}>Официальное приложение</span>
      <h1>Гоблин для Android</h1>
      <p className={styles.download_lead}>
        Быстрый доступ к кошельку, P2P и сделкам с домашнего экрана телефона.
      </p>

      <a className={styles.download_button} href={apkUrl} download>
        <FaDownload />
        Скачать APK для Android
      </a>
      <p className={styles.download_meta}>Версия {apkVersion} · Android 6.0 и новее</p>

      <div className={styles.download_notice}>
        <FaShieldAlt />
        <p>Скачивайте приложение только с cryptogoblin.ru. APK подписан официальным ключом CryptoGoblin.</p>
      </div>

      <section className={styles.download_steps} aria-label="Как установить приложение">
        <h2><FaAndroid /> Как установить</h2>
        <ol>
          <li><FiCheckCircle /> Нажмите «Скачать APK» и дождитесь загрузки.</li>
          <li><FiCheckCircle /> Откройте файл в уведомлении или папке «Загрузки».</li>
          <li><FiCheckCircle /> Android может запросить разрешение на установку APK из браузера. Если Xiaomi предложит проверить приложение, нажмите «Проверить».</li>
        </ol>
      </section>

      <section className={styles.download_ios}>
        <FaApple />
        <div>
          <h2>iPhone и iPad</h2>
          <p>Откройте сайт в Safari, нажмите «Поделиться» → «На экран Домой». Сайт появится как приложение.</p>
        </div>
      </section>

      <a className={styles.download_back} href="/login">
        <FiSmartphone /> Перейти к сайту
      </a>
    </section>
  </main>
);
