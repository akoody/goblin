import react from "react";
import styles from "./Loader.module.scss";

export const Loader = () => {
  return (
    <div className={styles.loader}>
      <div className={styles.loader_balls}>
        <div></div>
        <div></div>
        <div></div>
      </div>
      <p>Загрузка...</p>
    </div>
  );
};
