// Админка маркета и гаранта: платежи, выводы, споры.
import { useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import api from "../../api";
import styles from "./Commerce.module.scss";
import { Shell, State } from "./CommerceUi";
import { date, labels, money, prefix, useData, useMutation } from "./commerceApi";

export function CommerceAdmin() {
  const request = useData("/admin"),
    mutation = useMutation(),
    [notes, setNotes] = useState({});
  const review = (p, status) =>
    mutation.run(async () => {
      if (
        !window.confirm(
          status === "APPROVED"
            ? "Подтверждаете, что платёж реально получен / вывод выполнен?"
            : "Отклонить заявку?",
        )
      )
        return;
      await api.post(prefix + `/admin/payments/${p.id}`, {
        status,
        note: notes[p.id],
      });
      request.reload();
    });
  return (
    <Shell
      title="Администрирование маркета и гаранта"
      description="Проверка рублёвых платежей и разрешение споров."
    >
      <Link to="/admin">← Основная админка</Link>
      <Link to="/admin?section=guarantor">Все сделки гаранта →</Link>
      <State request={request} />
      <section className={styles.panel}>
        <h2>Объявления маркета</h2>
        {request.data?.listings?.map((l) => (
          <article className={styles.listItem} key={l.id}>
            <strong>
              {l.title} · {money(l.price)}
            </strong>
            <p>
              {l.seller_name} ·{" "}
              {l.status === "ACTIVE"
                ? "Опубликовано"
                : l.status === "BLOCKED"
                  ? "Заблокировано"
                  : "Приостановлено"}
            </p>
            <p>{l.description}</p>
            <button
              disabled={mutation.busy}
              onClick={() =>
                mutation.run(async () => {
                  await api.patch(prefix + `/admin/listings/${l.id}`, {
                    status: l.status === "BLOCKED" ? "PAUSED" : "BLOCKED",
                  });
                  request.reload();
                })
              }
            >
              {l.status === "BLOCKED"
                ? "Снять блокировку (оставить на паузе)"
                : "Заблокировать объявление"}
            </button>
          </article>
        ))}
        {!request.data?.listings?.length && <p>Объявлений пока нет.</p>}
      </section>
      <section className={styles.panel}>
        <h2>Рублёвые платежи</h2>
        <p>
          Подтверждайте пополнение только по фактическому поступлению денег.
          Вывод подтверждайте после фактической выплаты.
        </p>
        {request.data?.payments.map((p) => (
          <article className={styles.listItem} key={p.id}>
            <strong>
              {p.username}: {p.kind === "TOP_UP" ? "пополнение" : "вывод"}{" "}
              {money(p.amount)}
            </strong>
            <p>
              {labels[p.status]} · {date(p.created_at)}
            </p>
            <p className={styles.terms}>{p.details}</p>
            {p.status === "PENDING" ? (
              <>
                <label>
                  Подтверждение / причина
                  <input
                    value={notes[p.id] || ""}
                    onChange={(e) =>
                      setNotes({ ...notes, [p.id]: e.target.value })
                    }
                    maxLength={1000}
                  />
                </label>
                <div className={styles.inline}>
                  <button
                    disabled={
                      mutation.busy || (notes[p.id] || "").trim().length < 5
                    }
                    onClick={() => review(p, "APPROVED")}
                  >
                    Подтвердить
                  </button>
                  <button
                    disabled={
                      mutation.busy || (notes[p.id] || "").trim().length < 5
                    }
                    onClick={() => review(p, "REJECTED")}
                  >
                    Отклонить
                  </button>
                </div>
              </>
            ) : (
              <p>{p.review_note}</p>
            )}
          </article>
        ))}
        {!request.data?.payments.length && <p>Заявок пока нет.</p>}
      </section>
      <section className={styles.panel}>
        <h2>Сделки и споры</h2>
        <div className={styles.rows}>
          {request.data?.deals.map((d) => (
            <Link
              className={styles.row}
              key={d.id}
              to={`/manage/commerce/deals/${d.id}`}
            >
              <div>
                <strong>{d.title}</strong>
                <small>
                  {d.buyer_name || "-"} → {d.seller_name || "-"}
                </small>
              </div>
              <div>
                <strong>{money(d.amount, d.currency)}</strong>
                <small>{labels[d.status]}</small>
              </div>
              <FiArrowRight />
            </Link>
          ))}
        </div>
      </section>
    </Shell>
  );
}
