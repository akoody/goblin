// Реферальная программа пользователя.
import React from "react";
import { assetDecimal } from './walletAmounts.mjs';
import styles from "./Profile.module.scss";
import api from "../../api";
import { enqueueSnackbar } from "notistack";

export const Referral = () => {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const origin = window.location.origin;
  const referralLink = data?.code ? `${origin}/signin?ref=${data.code}` : "";

  const loadReferral = () => {
    setLoading(true);
    api
      .get("/referrals/me")
      .then((response) => setData(response.data))
      .catch((err) => {
        enqueueSnackbar(err.response?.data?.message || "Не удалось загрузить реферальную систему", {
          variant: "error",
        });
      })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => {
    loadReferral();
  }, []);

  const copyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      enqueueSnackbar("Реферальная ссылка скопирована", { variant: "success" });
    } catch {
      enqueueSnackbar("Не удалось скопировать автоматически. Выделите ссылку и скопируйте её вручную.", {variant:'warning'});
    }
  };

  return (
    <div className={styles.profile_referral}>
      <div className={styles.profile_referral_link}>
        <h2>Пригласительная ссылка</h2>
        <p>{loading ? "Загружаем..." : referralLink || "Ссылка пока недоступна"}</p>
        <button className="green-button" onClick={copyLink} disabled={!referralLink}>
          COPY
        </button>
      </div>
      <div className={styles.profile_info_lines}>
        <div>
          <p>Начислено по валютам</p>
          {data?.rewardBalances?.length?data.rewardBalances.map(r=><span key={r.currency}>{assetDecimal(r.amount)} {r.currency}</span>):<span>{loading?'Загрузка…':'Начислений пока нет'}</span>}
        </div>{" "}
        <div>
          <p>ВАШ % ОТ КОМИССИЙ</p>
          <span>{loading?'…':`${data?.ratePercent??'-'}%`}</span>
          <p>{data?.customRatePercent==null?'Общая ставка':'Индивидуальная ставка'}</p>
        </div>{" "}
        <div>
          <p>КОЛИЧЕСТВО ПОДКЛЮЧЕННЫХ АККАУНТОВ</p>
          <span>{data?.invitedCount || 0}</span>
        </div>{" "}
      </div>
      {data&&<p>Ставка - доля от комиссии биржи по операциям ваших приглашённых, не от суммы их сделки или пополнения. Изменения ставки не пересчитывают прежние начисления.</p>}
      {data?.accrualEnabled===false&&<p>Автоматическое начисление и перевод вознаграждений пока не подключены.</p>}
      {data?.accrualEnabled===true&&<p>Вознаграждения автоматически поступают на основной баланс в валюте комиссии. Это внутреннее зачисление; внешний вывод зависит от доступности средств в сети.</p>}
      <div className={styles.profile_referral_link}>
        <h2>Ваш код</h2>
        <p>{data?.code || "-"}</p>
      </div>
      <div className={styles.profile_referral_link}>
        <h2>Приглашенные пользователи</h2>
        {data?.invitedUsers?.length ? (
          data.invitedUsers.map((user) => (
            <p key={user.id}>
              {user.username || user.email} ·{" "}
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString("ru-RU") : "-"}
            </p>
          ))
        ) : (
          <p>Пока нет приглашенных пользователей</p>
        )}
      </div>
    </div>
  );
};
