import { useEffect, useState } from "react";
import { FiClock } from "react-icons/fi";
import api from "../../api";
import styles from "./FeatureGate.module.scss";

export const FeatureGate = ({ feature, title, children }) => {
  const [enabled, setEnabled] = useState(null);

  useEffect(() => {
    let active = true;
    const refresh=()=>api.get("/api/features")
      .then((response) => {
        if (active) setEnabled(response.data?.[feature] !== false);
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    refresh();
    const timer=window.setInterval(refresh,15000);
    window.addEventListener('focus',refresh);
    return () => { active = false;window.clearInterval(timer);window.removeEventListener('focus',refresh); };
  }, [feature]);

  if (enabled === null) return null;
  if (enabled) return children;

  return (
    <main className={styles.featureGate}>
      <section>
        <FiClock />
        <h1>{title} временно недоступен</h1>
        <p>Мы проводим обновление. Уже открытые операции сохранены; попробуйте зайти позже.</p>
      </section>
    </main>
  );
};
