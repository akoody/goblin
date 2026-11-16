// Сводка под вкладками админки: видна на любой вкладке.
import { FiAlertCircle, FiCheckCircle, FiClock, FiCreditCard, FiList, FiMessageCircle } from "react-icons/fi";
import styles from "./Admin.module.scss";

export function AdminStats({ tickets, waitingCount, onlineCount, highPriorityCount, paymentDefinitions, activeDealsCount }) {
  return (
    <section className={styles.admin_stats}>
      <div>
        <span>
          <FiMessageCircle />
        </span>
        <p>Всего тикетов</p>
        <strong>{tickets.length}</strong>
      </div>
      <div>
        <span>
          <FiClock />
        </span>
        <p>Ожидают ответа</p>
        <strong>{waitingCount}</strong>
      </div>
      <div>
        <span>
          <FiCheckCircle />
        </span>
        <p>В работе</p>
        <strong>{onlineCount}</strong>
      </div>
      <div>
        <span>
          <FiAlertCircle />
        </span>
        <p>Высокий приоритет</p>
        <strong>{highPriorityCount}</strong>
      </div>
      <div>
        <span>
          <FiCreditCard />
        </span>
        <p>Способы оплаты</p>
        <strong>{paymentDefinitions.length}</strong>
      </div>
      <div>
        <span>
          <FiList />
        </span>
        <p>Активные P2P</p>
        <strong>{activeDealsCount}</strong>
      </div>
    </section>
  );
}
