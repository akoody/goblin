import React, { useState } from "react";
import receive from "./money-recive.svg";
import send from "./money-send.svg";
import { FiChevronRight, FiRefreshCw } from "react-icons/fi";
import tinkoff from "./assets/Tinkoff_logo.svg";
import sber from "./assets/Sber_logo.svg";
import card from "./assets/Credit_card.svg";
import cash from "./assets/Cash.svg";
import { AiOutlineSend } from "react-icons/ai";
import { SlClock } from "react-icons/sl";
import { CgArrowsExchangeAlt } from "react-icons/cg";
import { NumericFormat } from "react-number-format";
import SberLogo from "../../Profile/assets/Sber_logo.svg";
import TinkoffLogo from "../../Profile/assets/Tinkoff_logo.svg";
import Cashlogo from "../../Profile/assets/Cash.svg";
import CardLogo from "../../Profile/assets/Credit_card.svg";
import styles from "./Exchange.module.scss";

export const Exchange = () => {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [dealState, setDealState] = React.useState("start");
  const [type, setType] = React.useState("buy");
  const [creatingDeal, setCreatingDeal] = useState(null);
  const [isMyDealsOpen, setisMyDealsOpen] = useState(null);

  const data = [
    {
      id: 1,
      name: "Геннадий Орлов Александров",
      price: "102 RUB",
      amount: "1 USDT",
      available: "10 USDT",
    },
    {
      id: 2,
      name: "Геннадий Орлов Александров",
      price: "102 RUB",
      amount: "1 USDT",
      available: "10 USDT",
    },
    {
      id: 3,
      name: "Геннадий Орлов Александров",
      price: "102 RUB",
      amount: "1 USDT",
      available: "10 USDT",
    },
  ];

  const paymentMethods = [
    {
      name: "Тинькофф",
      type: "card",
      brand: "Tinkoff",
      logo: <img src={TinkoffLogo} alt="Tinkoff Logo" />,
    },
    {
      name: "Сбербанк",
      brand: "SberBank",
      type: "card",
      logo: <img src={SberLogo} alt="Sberbank Logo" />,
    },
    {
      name: "Онлайн перевод",
      type: "online",
      logo: <img src={CardLogo} alt="Card Logo" />,
    },
    {
      name: "Наличные",
      type: "cash",
      logo: <img src={Cashlogo} alt="Cash Logo" />,
    },
  ];

  return (
    <div className={styles.exchange}>
      <section className={styles.exchange_header}>
        <div>
          <h1 className="h1 title">P2P обмен</h1>
        </div>
      </section>
      <div className={styles.exchange_toolbar}>
        <div className={styles.exchange_tabs}>
          <p>
            P2P обзор
          </p>
          <p>
            Мои сделки
          </p>
          <p
            onClick={() => setisMyDealsOpen("all")}
          >
            Мои объявления
          </p>
        </div>
        <div className={styles.exchange_filters}>
          <div className={styles.exchange_filterGroup}>
            <button
              className={`${styles.exchange_sideButton} ${type === "buy" ? styles.exchange_sideButton_activeBuy : ""}`}
              onClick={() => setType("buy")}
            >
              <img src={receive} alt="" /> Купить
            </button>
            <button
              className={`${styles.exchange_sideButton} ${type === "sell" ? styles.exchange_sideButton_activeSell : ""}`}
              onClick={() => setType("sell")}
            >
              <img src={send} alt="" /> Продать
            </button>
            <select
              name=""
              id=""
            >
              <option value="USDT">USDT</option>
            </select>
            <div className={styles.exchange_amountInput}>
              <input
                type="text"
                placeholder="Сумма"
              />
              <p>RUB</p>{" "}
            </div>
          </div>
          <select
            name=""
            id=""
          >
            <option value="USDT">USDT</option>
          </select>
          <div className={styles.exchange_apply}>
            <button>
              Применить
            </button>
            <FiRefreshCw />
          </div>
        </div>
      </div>
      <div className={styles.exchange_table}>
        <div className={styles.exchange_tableHead}>
          <p className="text-[16px]">Продавец</p>
          <p className="text-[16px]">Цена</p>
          <p className="text-[16px]">Сумма | доступно</p>
          <p>Статистика</p>
          <p>Оплата</p>
        </div>
        <div
          className={`${styles.exchange_divider} ${
            type == "buy" ? styles.exchange_divider_buy : styles.exchange_divider_sell
          }`}
        ></div>
        <div className={styles.exchange_rows}>
          {data.map((item) => (
            <Row
              setIsModalOpen={setIsModalOpen}
              key={item.id}
              item={item}
              type={type}
            />
          ))}{" "}
        </div>
      </div>
      {isModalOpen && dealState == "start" && (
        <Modal
          setIsOpen={() => {
            setIsModalOpen(false);
            setDealState("start");
          }}
          className="flex flex-col gap-[24px] w-[550px]"
        >
          <h2 className="text-[22px] font-[500] mb-[10px]">
            Реквизиты для оплаты
          </h2>
          <div className="flex gap-[16px]">
            <div className="flex flex-col justify-between gap-[16px]">
              <div className="flex items-center gap-[8px]">
                <img src={sber} alt="" />
                <p className="text-[16px]">Сбербанк</p>
              </div>
              <div className="flex flex-col gap-[4px]">
                <div className="flex gap-[12px]">
                  <p className="text-[12px] text-[#21A038] w-[100px]">ФИО</p>
                  <p className="text-[12px] font-[400]">
                    Геннадий Орлов Александров
                  </p>
                </div>{" "}
                <div className="flex gap-[12px]">
                  <p className="text-[12px] text-[#21A038] w-[100px]">
                    Номер карты
                  </p>
                  <p className="text-[12px] font-[400]">4276 0000 0000 0000</p>
                </div>
              </div>
              <div className="flex gap-[24px] items-center">
                <div className="flex flex-col gap-[4px]">
                  <p className="text-[14px]">Сумма</p>
                  <p className="text-[14px] font-[400]">102 RUB</p>
                </div>
                <FiChevronRight />
                <div className="flex flex-col gap-[4px]">
                  <p className="text-[14px]">Курс</p>
                  <p className="text-[14px] font-[400]">102</p>
                </div>
              </div>
              <div className="rounded-[4px] w-full h-[100px] bg-[#F7F7F7] p-[8px]">
                <p className="text-[12px] text-[#C8C8C8]">
                  описание от продаца
                </p>
              </div>
              <div className="flex gap-[12px] items-center">
                <button
                  className="red-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
                  onClick={() => setIsModalOpen(false)}
                >
                  Отмена
                </button>
                <button
                  className="green-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
                  onClick={() => setDealState("wait")}
                >
                  Оплатил
                </button>
              </div>
            </div>
            <div className="flex flex-col justify-end w-full h-stretch bg-[#F7F7F7] p-[8px] rounded-[4px]">
              <div className="flex gap-[4px] items-center">
                <input
                  type="text"
                  placeholder="Написать"
                  className="rounded-[4px] p-[4px] w-full bg-[#fff] border-none"
                />
                <button className="bg-[transparent] flex items-center justify-center border-none text-[#86C239] text-[18px]">
                  <AiOutlineSend />
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {isModalOpen && dealState == "wait" && (
        <Modal className="flex flex-col gap-[24px] w-[550px]">
          <h2 className="text-[22px] font-[500] mb-[10px]">
            Реквизиты для оплаты
          </h2>
          <div className="flex gap-[16px]">
            <div className="flex flex-col justify-between gap-[16px]">
              <div className="flex items-center gap-[8px]">
                <img src={sber} alt="" />
                <p className="text-[16px]">Сбербанк</p>
              </div>
              <div className="flex flex-col gap-[4px]">
                <div className="flex gap-[12px]">
                  <p className="text-[12px] text-[#21A038] w-[100px]">ФИО</p>
                  <p className="text-[12px] font-[400]">
                    Геннадий Орлов Александров
                  </p>
                </div>{" "}
                <div className="flex gap-[12px]">
                  <p className="text-[12px] text-[#21A038] w-[100px]">
                    Номер карты
                  </p>
                  <p className="text-[12px] font-[400]">4276 0000 0000 0000</p>
                </div>
              </div>
              <div className="flex gap-[24px] items-center">
                <div className="flex flex-col gap-[4px]">
                  <p className="text-[14px]">Сумма</p>
                  <p className="text-[14px] font-[400]">102 RUB</p>
                </div>
                <FiChevronRight />
                <div className="flex flex-col gap-[4px]">
                  <p className="text-[14px]">Курс</p>
                  <p className="text-[14px] font-[400]">102</p>
                </div>
              </div>

              <div className="flex flex-col gap-[8px]">
                <div className="flex items-center gap-[8px] text-[#86C239] text-[14px]">
                  <SlClock />
                  <p>Время ожидания подтверждения</p>
                </div>
                <div className="flex items-center gap-[8px]">
                  <p className="w-[140px] text-[10px]">Имя</p>
                  <p className="rounded-[4px] bg-[#F7F7F7] w-full h-[16px]"></p>
                </div>{" "}
                <div className="flex items-center gap-[8px]">
                  <p className="w-[140px] text-[10px]">№ сделки</p>
                  <p className="rounded-[4px] bg-[#F7F7F7] w-full h-[16px]"></p>
                </div>{" "}
                <div className="flex items-center gap-[8px]">
                  <p className="w-[140px] text-[10px]">Сумма</p>
                  <p className="rounded-[4px] bg-[#F7F7F7] w-full h-[16px]"></p>
                </div>{" "}
                <div className="flex items-center gap-[8px]">
                  <p className="w-[140px] text-[10px]">Cпособ оплаты</p>
                  <p className="rounded-[4px] bg-[#F7F7F7] w-full h-[16px]"></p>
                </div>
              </div>
              <p className="text-[8px] text-[#CD3434]">
                НЕ ОТМЕНЯЙТЕ ОРДЕР ЕСЛИ ВЫ ОПЛАТИЛИ, ДАЖЕ ЕСЛИ ВАС ОБ ЭТОМ
                ПРОСЯТ!
              </p>
              <div className="flex gap-[12px] items-center">
                <button
                  className="red-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
                  onClick={() => {
                    const confirmation = window.confirm(
                      "Вы уверены, что хотите отменить сделку? Если вы уже оплатили, то отмена может привести к блокировке вашего аккаунта."
                    );
                    if (!confirmation) return;

                    setDealState("cancel");
                  }}
                >
                  Отмена
                </button>
                <button
                  className="green-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
                  onClick={() => setDealState("help")}
                >
                  Помощь
                </button>
              </div>
            </div>
            <div className="flex flex-col justify-end w-full h-stretch bg-[#F7F7F7] p-[8px] rounded-[4px]">
              <div className="flex gap-[4px] items-center">
                <input
                  type="text"
                  placeholder="Написать"
                  className="rounded-[4px] p-[4px] w-full bg-[#fff] border-none"
                />
                <button className="bg-[transparent] flex items-center justify-center border-none text-[#86C239] text-[18px]">
                  <AiOutlineSend />
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}{" "}
      {isModalOpen && dealState == "cancel" && (
        <Modal className="flex flex-col gap-[24px] w-[550px]">
          <h2 className="text-[22px] font-[500] mb-[10px]">
            Реквизиты для оплаты
          </h2>
          <div className="flex gap-[16px]">
            <div className="flex flex-col justify-between gap-[16px]">
              <div className="flex items-center gap-[8px]">
                <img src={sber} alt="" />
                <p className="text-[16px]">Сбербанк</p>
              </div>
              <div className="flex flex-col gap-[4px]">
                <div className="flex gap-[12px]">
                  <p className="text-[12px] text-[#21A038] w-[100px]">ФИО</p>
                  <p className="text-[12px] font-[400]">
                    Геннадий Орлов Александров
                  </p>
                </div>{" "}
                <div className="flex gap-[12px]">
                  <p className="text-[12px] text-[#21A038] w-[100px]">
                    Номер карты
                  </p>
                  <p className="text-[12px] font-[400]">4276 0000 0000 0000</p>
                </div>
              </div>
              <div className="flex gap-[24px] items-center">
                <div className="flex flex-col gap-[4px]">
                  <p className="text-[14px]">Сумма</p>
                  <p className="text-[14px] font-[400]">102 RUB</p>
                </div>
                <FiChevronRight />
                <div className="flex flex-col gap-[4px]">
                  <p className="text-[14px]">Курс</p>
                  <p className="text-[14px] font-[400]">102</p>
                </div>
              </div>

              <div className="flex flex-col gap-[8px]">
                <div className="flex items-center gap-[8px] text-[#E11E12] text-[14px] mb-[50px]">
                  <CgArrowsExchangeAlt className="text-[18px]" />
                  <p>Сделка отменена</p>
                </div>
              </div>

              <div className="flex gap-[12px] items-center">
                <button
                  className="red-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
                  onClick={() => {
                    setIsModalOpen(false);
                    setDealState("start");
                  }}
                >
                  Закрыть
                </button>
              </div>
            </div>
            <div className="flex flex-col justify-end w-full h-stretch bg-[#F7F7F7] p-[8px] rounded-[4px]">
              <div className="flex gap-[4px] items-center">
                <input
                  type="text"
                  placeholder="Написать"
                  className="rounded-[4px] p-[4px] w-full bg-[#fff] border-none"
                />
                <button className="bg-[transparent] flex items-center justify-center border-none text-[#86C239] text-[18px]">
                  <AiOutlineSend />
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {isModalOpen && dealState == "help" && (
        <Modal
          setIsOpen={() => {
            setIsModalOpen(false);
            setDealState("start");
          }}
          className="flex flex-col gap-[24px] w-[550px]"
        >
          <h2 className="text-[22px] font-[500] mb-[10px]">
            Реквизиты для оплаты
          </h2>
          <div className="flex gap-[16px]">
            <div className="flex flex-col justify-between gap-[16px]">
              <div className="flex items-center gap-[8px]">
                <img src={sber} alt="" />
                <p className="text-[16px]">Сбербанк</p>
              </div>
              <div className="flex flex-col gap-[4px]">
                <div className="flex gap-[12px]">
                  <p className="text-[12px] text-[#21A038] w-[100px]">ФИО</p>
                  <p className="text-[12px] font-[400]">
                    Геннадий Орлов Александров
                  </p>
                </div>{" "}
                <div className="flex gap-[12px]">
                  <p className="text-[12px] text-[#21A038] w-[100px]">
                    Номер карты
                  </p>
                  <p className="text-[12px] font-[400]">4276 0000 0000 0000</p>
                </div>
              </div>
              <div className="flex gap-[24px] items-center">
                <div className="flex flex-col gap-[4px]">
                  <p className="text-[14px]">Сумма</p>
                  <p className="text-[14px] font-[400]">102 RUB</p>
                </div>
                <FiChevronRight />
                <div className="flex flex-col gap-[4px]">
                  <p className="text-[14px]">Курс</p>
                  <p className="text-[14px] font-[400]">102</p>
                </div>
              </div>

              <div className="flex flex-col gap-[4px]">
                <p className="text-[12px]">Уведомление</p>
                <div className="rounded-[4px] w-full h-[100px] bg-[#F7F7F7] p-[8px]">
                  <p className="text-[10px] text-[#C8C8C8]">
                    сапорт скоро отпишет в чат. его сообщения будут в середине
                    чата и выделены{" "}
                    <span className="text-[#3695DA]">синим</span> цветом, а имя{" "}
                    <span className="text-[#FFC120]">золотым</span>
                  </p>
                </div>
              </div>
              <p className="text-[8px] text-[#FF3131]">
                ! дождитесь решения поддержки
              </p>
              <div className="flex gap-[12px] items-center">
                <button
                  className="red-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
                  onClick={() => {
                    const confirmation = window.confirm(
                      "Вы уверены, что хотите отменить сделку? Если вы уже оплатили, то отмена может привести к блокировке вашего аккаунта."
                    );
                    if (!confirmation) return;

                    setDealState("cancel");
                  }}
                >
                  Отмена
                </button>
                <p className="text-[8px]">
                  Eсли ваша проблема решена, то отмените вызов поддержки
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-end w-full h-stretch bg-[#F7F7F7] p-[8px] rounded-[4px]">
              <div className="flex gap-[4px] items-center">
                <input
                  type="text"
                  placeholder="Написать"
                  className="rounded-[4px] p-[4px] w-full bg-[#fff] border-none"
                />
                <button className="bg-[transparent] flex items-center justify-center border-none text-[#86C239] text-[18px]">
                  <AiOutlineSend />
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {isMyDealsOpen && isMyDealsOpen == "all" && (
        <Modal className="w-[500px] flex flex-col gap-[20px]">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px]">Мои объявления</h2>
            <button
              className="text-[#FF6868]"
              onClick={() => setisMyDealsOpen(null)}
            >
              <span className="p-[1px] border-solid border-[1px] border-[#FF6868] rounded-[50%] w-[15px] h-[15px] inline-flex items-center justify-center">
                &times;
              </span>{" "}
              Закрыть
            </button>
          </div>
          <p className="text-[18px]">P2P</p>
          <button
            className="green-gradient px-[55px] py-[12px] w-fit text-[#fff] text-[18px]"
            onClick={() => setisMyDealsOpen("add")}
          >
            Добавить
          </button>
        </Modal>
      )}
      {isMyDealsOpen && isMyDealsOpen == "add" && (
        <Modal className="w-[500px] flex flex-col gap-[20px]">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px]">Выберите действие</h2>
            <button
              className="text-[#FF6868]"
              onClick={() => setisMyDealsOpen(null)}
            >
              <span className="p-[1px] border-solid border-[1px] border-[#FF6868] rounded-[50%] w-[15px] h-[15px] inline-flex items-center justify-center">
                &times;
              </span>{" "}
              Закрыть
            </button>
          </div>
          <div className="flex flex-col gap-[10px] bg-[#F7F7F7] px-[13px] py-[7px] rounded-[4px] w-full">
            <div
              className="flex items-center justify-between text-[#F54545] cursor-pointer"
              onClick={() => setCreatingDeal({ type: "sell" })}
            >
              <p className="text-[14px]">Купить</p>
              <FiChevronRight
                style={{
                  transform:
                    creatingDeal?.type == "sell" ? "rotate(90deg)" : "",
                }}
              />
            </div>
            {creatingDeal?.type == "sell" && (
              <div className="flex flex-col gap-[8px]">
                <div className="flex items-center justify-between">
                  <p className="text-[16px] text-[#4CA11F]">USDT</p>
                  <NumericFormat
                    type="text"
                    className="p-[4px] rounded-[4px] bg-[#fff] border-none w-[200px]"
                    placeholder="введите количество"
                    onValueChange={(values) =>
                      setCreatingDeal((prev) => ({
                        ...prev,
                        usdt: values.floatValue,
                      }))
                    }
                  />
                </div>{" "}
                <div className="flex items-center justify-between">
                  <p className="text-[16px] text-[#E9A907]">BTC</p>
                  <NumericFormat
                    type="text"
                    className="p-[4px] rounded-[4px] bg-[#fff] border-none w-[200px]"
                    placeholder="введите количество"
                    onValueChange={(values) =>
                      setCreatingDeal((prev) => ({
                        ...prev,
                        btc: values.floatValue,
                      }))
                    }
                  />
                </div>{" "}
                <div className="flex items-center justify-between">
                  <p className="text-[16px] text-[#4AA9DF]">ETH</p>
                  <NumericFormat
                    type="text"
                    className="p-[4px] rounded-[4px] bg-[#fff] border-none w-[200px]"
                    placeholder="введите количество"
                    onValueChange={(values) =>
                      setCreatingDeal((prev) => ({
                        ...prev,
                        eth: values.floatValue,
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>{" "}
          <div className="flex flex-col gap-[20px] bg-[#F7F7F7] px-[13px] py-[7px] rounded-[4px] w-full">
            <div
              className="flex items-center justify-between text-[#86C239] cursor-pointer"
              onClick={() => setCreatingDeal({ type: "buy" })}
            >
              <p className="text-[14px]">Продать</p>
              <FiChevronRight
                style={{
                  transform: creatingDeal?.type == "buy" ? "rotate(90deg)" : "",
                }}
              />
            </div>
            {creatingDeal?.type == "buy" && (
              <div className="flex flex-col gap-[8px]">
                <p className="text-[14px]">Доступно:</p>
                <div className="flex items-center justify-between">
                  <p className="text-[16px] text-[#4CA11F]">1000 USDT</p>
                  <NumericFormat
                    type="text"
                    className="p-[4px] rounded-[4px] bg-[#fff] border-none w-[200px]"
                    placeholder="введите количество"
                    onValueChange={(values) =>
                      setCreatingDeal((prev) => ({
                        ...prev,
                        usdt: values.floatValue,
                      }))
                    }
                  />
                </div>{" "}
                <div className="flex items-center justify-between">
                  <p className="text-[16px] text-[#E9A907]">1 BTC</p>
                  <NumericFormat
                    type="text"
                    className="p-[4px] rounded-[4px] bg-[#fff] border-none w-[200px]"
                    placeholder="введите количество"
                    onValueChange={(values) =>
                      setCreatingDeal((prev) => ({
                        ...prev,
                        btc: values.floatValue,
                      }))
                    }
                  />
                </div>{" "}
                <div className="flex items-center justify-between">
                  <p className="text-[16px] text-[#4AA9DF]">0.324 ETH</p>
                  <NumericFormat
                    type="text"
                    className="p-[4px] rounded-[4px] bg-[#fff] border-none w-[200px]"
                    placeholder="введите количество"
                    onValueChange={(values) =>
                      setCreatingDeal((prev) => ({
                        ...prev,
                        eth: values.floatValue,
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-[12px] items-center">
            <button
              className="red-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
              onClick={() => setisMyDealsOpen(null)}
            >
              Отмена
            </button>
            <button
              className="green-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
              onClick={() => setisMyDealsOpen("payment")}
            >
              Продолжить
            </button>
          </div>
        </Modal>
      )}{" "}
      {isMyDealsOpen && isMyDealsOpen == "payment" && (
        <Modal className="w-[500px] flex flex-col gap-[20px]">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px]">Способы оплаты</h2>
            <button
              className="text-[#FF6868]"
              onClick={() => setisMyDealsOpen(null)}
            >
              <span className="p-[1px] border-solid border-[1px] border-[#FF6868] rounded-[50%] w-[15px] h-[15px] inline-flex items-center justify-center">
                &times;
              </span>{" "}
              Закрыть
            </button>
          </div>
          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center gap-[8px] bg-[#F7F7F7] p-[12px] rounded-[4px]">
              <img src={TinkoffLogo} className="w-[25px]" alt="" />
              <p className="text-[16px]">Тинькофф</p>
              <div className="flex flex-col gap-[3px] text-[12px] ml-auto">
                <span>СВЕТЛАНА ОЛЕГОВНА БУМ</span>
                <span>4040 4004 4004 4494</span>
              </div>
            </div>{" "}
            <div className="flex items-center gap-[8px] bg-[#F7F7F7] p-[12px] rounded-[4px]">
              <img src={SberLogo} className="w-[25px]" alt="" />
              <p className="text-[16px]">СберБанк</p>
              <div className="flex flex-col gap-[3px] text-[12px] ml-auto">
                <span>СВЕТЛАНА ОЛЕГОВНА БУМ</span>
                <span>4040 4004 4004 4494</span>
              </div>
            </div>{" "}
            <div className="flex items-center gap-[8px] bg-[#F7F7F7] p-[12px] rounded-[4px]">
              <img src={CardLogo} className="w-[25px]" alt="" />
              <p className="text-[16px]">Онлайн перевод</p>
              <div className="flex flex-col gap-[3px] text-[12px] ml-auto">
                <span>СВЕТЛАНА ОЛЕГОВНА БУМ</span>
                <span>4040 4004 4004 4494</span>
              </div>
            </div>
          </div>
          <div className="flex gap-[12px] items-center">
            <button
              className="red-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
              onClick={() => setisMyDealsOpen(null)}
            >
              Отмена
            </button>
            <button
              className="green-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
              onClick={() => setisMyDealsOpen("description")}
            >
              Продолжить
            </button>
          </div>
        </Modal>
      )}
      {isMyDealsOpen && isMyDealsOpen == "description" && (
        <Modal className="w-[500px] flex flex-col gap-[20px]">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px]">Описание сделки</h2>
            <button
              className="text-[#FF6868]"
              onClick={() => setisMyDealsOpen(null)}
            >
              <span className="p-[1px] border-solid border-[1px] border-[#FF6868] rounded-[50%] w-[15px] h-[15px] inline-flex items-center justify-center">
                &times;
              </span>{" "}
              Закрыть
            </button>
          </div>
          <div className="flex flex-col gap-[4px]">
            <div className="flex items-center gap-[4px] justify-between">
              <p>Время сделки</p>
              <NumericFormat
                type="text"
                suffix=" мин"
                className="w-[200px] bg-[#F7F7F7] rounded-[4px] p-[6px]"
                onValueChange={(values) =>
                  setCreatingDeal((prev) => ({
                    ...prev,
                    time: values.floatValue,
                  }))
                }
              />
            </div>{" "}
            <div className="flex items-center gap-[4px] justify-between">
              <p>Курс</p>
              <NumericFormat
                type="text"
                className="w-[200px] bg-[#F7F7F7] rounded-[4px] p-[6px]"
                onValueChange={(values) =>
                  setCreatingDeal((prev) => ({
                    ...prev,
                    rate: values.floatValue,
                  }))
                }
              />
            </div>
          </div>
          <div className="flex flex-col gap-[4px]">
            <p>Добавить описание</p>
            <textarea
              name=""
              className="resize-y w-full bg-[#F7F7F7] border-none rounded-[4px] h-[200px] p-[10px]"
            ></textarea>
          </div>
          <div className="flex gap-[12px] items-center">
            <button
              className="red-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
              onClick={() => setisMyDealsOpen(null)}
            >
              Отмена
            </button>
            <button
              className="green-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
              onClick={() => setisMyDealsOpen("greeting")}
            >
              Продолжить
            </button>
          </div>
        </Modal>
      )}
      {isMyDealsOpen && isMyDealsOpen == "greeting" && (
        <Modal className="w-[500px] flex flex-col gap-[20px]">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px]">Приветствие</h2>
            <button
              className="text-[#FF6868]"
              onClick={() => setisMyDealsOpen(null)}
            >
              <span className="p-[1px] border-solid border-[1px] border-[#FF6868] rounded-[50%] w-[15px] h-[15px] inline-flex items-center justify-center">
                &times;
              </span>{" "}
              Закрыть
            </button>
          </div>
          <div className="grid grid-cols-[1fr_2fr] gap-[10px]">
            <div className="flex flex-col gap-[10px]">
              <span className="w-full p-[4px] rounded-[4px] bg-[#F7F7F7]">
                {creatingDeal?.time} мин
              </span>{" "}
              <span className="w-full p-[4px] rounded-[4px] bg-[#F7F7F7]">
                {creatingDeal?.rate}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_1fr] gap-[10px]">
              <div className="flex items-center gap-[4px] text-[10px]">
                <img src={TinkoffLogo} className="w-[20px]" alt="" />
                Тинькофф
              </div>{" "}
              <div className="flex items-center gap-[4px] text-[10px]">
                <img src={SberLogo} className="w-[20px]" alt="" />
                Сбербанк
              </div>
              <div className="flex items-center gap-[4px] text-[10px]">
                <img src={CardLogo} className="w-[20px]" alt="" />
                Онлайн перевод
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-[4px]">
            <p>Напишите приветственное сообщение</p>
            <textarea
              name=""
              className="resize-y w-full bg-[#F7F7F7] border-none rounded-[4px] h-[200px]"
            ></textarea>
          </div>
          <div className="flex gap-[12px] items-center">
            <button
              className="red-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
              onClick={() => setisMyDealsOpen(null)}
            >
              Отмена
            </button>
            <button
              className="green-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400]"
              onClick={() => setisMyDealsOpen("success")}
            >
              Сохранить
            </button>
          </div>
        </Modal>
      )}
      {isMyDealsOpen && isMyDealsOpen == "success" && (
        <Modal className="w-[400px] flex flex-col gap-[20px] items-center">
          <div className="flex items-center w-full justify-between">
            <h2 className="text-[20px] text-[#4CA11F]">Успешно!</h2>

            <button
              className="text-[#FF6868]"
              onClick={() => setisMyDealsOpen(null)}
            >
              <span className="p-[1px] border-solid border-[1px] border-[#FF6868] rounded-[50%] w-[15px] h-[15px] inline-flex items-center justify-center">
                &times;
              </span>{" "}
              Закрыть
            </button>
          </div>
          <p>Ваше объявление добавлено и активно!</p>
          <p>Отключить его можете в разделе "Мои обновления"</p>
          <button
            className="red-gradient px-[30px] py-[10px] text-[10px] text-[#fff] rounded-[4px] font-[400] mr-auto"
            onClick={() => setisMyDealsOpen(null)}
          >
            Закрыть
          </button>
        </Modal>
      )}
    </div>
  );
};

const Row = ({ setIsModalOpen, item, type }) => {
  return (
    <div className={styles.exchange_row}>
      <div className={styles.exchange_merchant}>
        <p>Changecryptohere</p>
        <span>обменник</span>
      </div>{" "}
      <div className={styles.exchange_price}>
        <p>102</p>
        <span>RUB</span>
      </div>{" "}
      <div className={styles.exchange_limits}>
        <div>
          <p>Доступно</p>
          <p>
            13000 <span>USDT</span>
          </p>
        </div>{" "}
        <div>
          <p>Лимиты</p>
          <p>
            1000-100000 <span>RUB</span>
          </p>
        </div>
      </div>{" "}
      <div className={styles.exchange_stats}>
        <p>120 сделок</p>
        <p>98% успешных</p>
      </div>{" "}
      <div className={styles.exchange_methods}>
        <img src={tinkoff} alt="" />
        <img src={sber} alt="" />
        <img src={card} alt="" />
        <img src={cash} alt="" />
      </div>
      {type == "buy" ? (
        <button
          className={styles.exchange_buyButton}
          onClick={() => setIsModalOpen(true)}
        >
          Купить USDT
        </button>
      ) : (
        <button
          className={styles.exchange_sellButton}
          onClick={() => setIsModalOpen(true)}
        >
          Продать USDT
        </button>
      )}
    </div>
  );
};

const Modal = ({ children, className, setIsOpen }) => {
  return (
    <div
      className={styles.exchange_modalOverlay}
    >
      <button
        className={styles.exchange_modalBackdrop}
        onClick={() => setIsOpen(false)}
      ></button>
      <div
        className={`${styles.exchange_modal} ${className}`}
      >
        {children}
      </div>
    </div>
  );
};
