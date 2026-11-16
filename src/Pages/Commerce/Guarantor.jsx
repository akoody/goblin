// Гарант: создание безопасной сделки.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import styles from "./Commerce.module.scss";
import { DealRows, LoginNotice, Shell, State } from "./CommerceUi";
import { money, prefix, useData, useMutation } from "./commerceApi";

export function Guarantor() {
  const token = Boolean(localStorage.getItem("token")),
    me = useData("/me", token),
    feePolicy = useData("/escrow/policy"),
    mutation = useMutation(),
    navigate = useNavigate();
  const [key] = useState(() => crypto.randomUUID());
  const submit = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    mutation.run(async () => {
      const { data } = await api.post(prefix + "/escrow", {
        ...body,
        requestKey: key,
      });
      navigate(`/commerce/deals/${data.id}`);
    });
  };
  return (
    <Shell
      title="Гарант"
      description="Договоритесь об условиях, пригласите вторую сторону и защитите оплату резервом USDT."
    >
      <section className={styles.steps}>
        <div>
          <b>1. Условия</b>
          <p>Создайте сделку и передайте ссылку контрагенту.</p>
        </div>
        <div>
          <b>2. Резерв</b>
          <p>После присоединения продавца покупатель резервирует USDT.</p>
        </div>
        <div>
          <b>3. Передача</b>
          <p>
            Покупатель подтверждает получение - продавец получает оплату. Споры
            решает администратор.
          </p>
        </div>
      </section>
      <aside className={styles.feeNotice} aria-live="polite">
        <strong>Комиссия гаранта - {feePolicy.data ? `${feePolicy.data.feePercent}%` : "…"}</strong>
        <p>Минимальная сумма: {feePolicy.data ? money(feePolicy.data.minimumAmount, "USDT") : "…"}. Комиссия удерживается из выплаты продавцу только после успешного завершения сделки. При возврате или отмене комиссия не взимается. Условия фиксируются при создании сделки.</p>
      </aside>
      {!token ? (
        <LoginNotice />
      ) : (
        <>
          <State request={me} />
          <div className={styles.columns}>
            <form className={styles.panel} onSubmit={submit}>
              <h2>Новая сделка</h2>
              <label>
                Ваша роль
                <select name="role">
                  <option value="BUYER">Покупатель</option>
                  <option value="SELLER">Продавец</option>
                </select>
              </label>
              <label>
                Название
                <input name="title" minLength={2} maxLength={120} required />
              </label>
              <label>
                Условия сделки
                <textarea
                  name="terms"
                  minLength={5}
                  maxLength={2000}
                  required
                  placeholder="Предмет сделки, срок и критерии выполнения"
                />
              </label>
              <label>
                Сумма, USDT
                <input
                  name="amount"
                  type="number"
                  step="0.000001"
                  min={feePolicy.data?.minimumAmount || "5"}
                  max="1000000"
                  required
                />
              </label>
              <p>
                Свободно: {money(me.data?.availableUsdt, "USDT")} · В гаранте:{" "}
                {money(me.data?.held.usdt, "USDT")}
              </p>
              <button className={styles.primary} disabled={mutation.busy}>
                Создать сделку
              </button>
            </form>
            <section className={styles.panel}>
              <h2>Мои сделки гаранта</h2>
              <DealRows
                deals={me.data?.deals.filter((d) => d.kind === "ESCROW")}
              />
            </section>
          </div>
        </>
      )}
    </Shell>
  );
}
