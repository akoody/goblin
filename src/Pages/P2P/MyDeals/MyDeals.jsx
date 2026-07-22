import React, { useEffect, useState } from "react";
import styles from "./MyDeals.module.scss";
import bg from "../../../assets/images/Group 756.png";
import { TbCopy } from "react-icons/tb";
import { BsChatLeftDots } from "react-icons/bs";
import { enqueueSnackbar } from "notistack";
import { Link } from "react-router-dom";
import api from "../../../api";
import { jwtDecode } from "jwt-decode";
import { getApiErrorMessage } from "../../../utils/notifications";
import { formatDateTime, formatMoney, getDealStatusLabel } from "../p2pUtils";
import { P2PMobileNav } from "../P2PMobileNav";

export const MyDeals = () => {
  const [page, setPage] = useState("active");
  const [allDeals, setAllDeals] = useState([]);
  const [filteredDeals, setFilteredDeals] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setCurrentUser(jwtDecode(token));
    }
  }, []);

  useEffect(() => {
    api.get("/deal/my-deals")
      .then((res) => {
        setAllDeals(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        enqueueSnackbar(getApiErrorMessage(err, "Ошибка загрузки сделок"), {
          variant: "error",
          autoHideDuration: 4200,
        });
        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          window.location.reload();
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (page === "all") {
      setFilteredDeals(allDeals);
    } else { // active
      setFilteredDeals(allDeals.filter(deal => deal.status !== "COMPLETED" && deal.status !== "CANCELLED"));
    }
  }, [page, allDeals]);

  return (
    <div className={styles.myOrders}>
      <img src={bg} className="background" alt="" />
      <section className={styles.myOrders_top}>
        <div>
          <h1 className="h1 title">Мои сделки</h1>
          <p>Активные и завершенные P2P-сделки в одном рабочем списке.</p>
        </div>
      </section>
      <div className={styles.myOrders_content}>
        <div className={styles.myOrders_content_top}>
          <section className={styles.myOrders_content_top_section}>
            <button
              type="button"
              onClick={() => setPage("active")}
              className={
                page === "active"
                  ? styles.myOrders_content_top_section_active
                  : ""
              }
            >
              Активные
            </button>
            <button
              type="button"
              onClick={() => setPage("all")}
              className={
                page === "all" ? styles.myOrders_content_top_section_active : ""
              }
            >
              Все
            </button>
          </section>
        </div>
        <div className={styles.myOrders_content_main}>
          {loading && (
            <div className={styles.myOrders_content_empty}>
              <p className="p">Загружаем сделки...</p>
            </div>
          )}

          {!loading && filteredDeals.length === 0 && (
            <div className={styles.myOrders_content_empty}>
              <p className="p">Сделок пока нет</p>
            </div>
          )}

          {!loading && filteredDeals?.map((item) => {
            const myRole = item.buyer.id === currentUser?.userId ? 'BUYER' : 'SELLER';
            const cryptoAmount = Number(item.crypto_amount || item.order.amount);
            const dealPrice = Number(item.price || item.order.price);
            return (
              <Link
                to={`/deal/${item.id}`}
                key={item.id}
                className={styles.myOrders_content_item}
              >
                <div className={styles.myOrders_content_item_top}>
                  <section>
                    <p className="p">
                      <span
                        style={{
                          color:
                            myRole === "SELLER" ? "#BE1600" : "#4e865a",
                        }}
                      >
                        {myRole === 'SELLER' ? 'SELL' : 'BUY'}
                      </span>{" "}
                      USDT
                    </p>
                    <span className="span">
                      {formatDateTime(item.order.createdAt)}
                    </span>
                  </section>
                  <div>
                    <section
                      className={styles.myOrders_content_item_top_section}
                    >
                      <p>Открыть</p>
                      <span>{getDealStatusLabel(item.status)}</span>
                    </section>
                  </div>
                </div>
                <section className={styles.myOrders_content_item_section}>
                  <span className="span">Количество</span>
                  <p className="p" style={{ fontWeight: "600" }}>
                    {formatMoney(cryptoAmount, "USDT")}
                  </p>
                </section>
                <section className={styles.myOrders_content_item_section}>
                  <span className="span">Цена</span>
                  <p className="p">{formatMoney(dealPrice)}</p>
                </section>
                <section className={styles.myOrders_content_item_section}>
                  <span className="span">Сумма</span>
                  <p className="p">{formatMoney(item.fiat_amount || cryptoAmount * dealPrice)}</p>
                </section>
                <section className={styles.myOrders_content_item_section}>
                  <span className="span">Ордер</span>
                  <p className="p">
                    {item.order.id}
                    <TbCopy
                      style={{ color: "#2A2E2B71", cursor: "pointer" }}
                      onClick={(e) => {
                        e.preventDefault();
                        enqueueSnackbar("Скопировано", {
                          variant: "success",
                          autoHideDuration: 2000,
                        });
                        navigator.clipboard.writeText(item.order.id);
                      }}
                    />
                  </p>
                </section>
                <section className={styles.myOrders_content_item_section}>
                  <span className="span">Профиль {">"}</span>
                  <p className="p">
                    <BsChatLeftDots />
                  </p>
                </section>
              </Link>
            );
          })}
        </div>
      </div>
      <P2PMobileNav />
    </div>
  );
};
