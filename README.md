<div align="center">
  <img src="docs/cover.png" alt="Интерфейс Goblin" width="100%" />

  <h1>Goblin</h1>

  <p><strong>Криптокошелёк, P2P-платформа и торговый терминал в одном интерфейсе.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/React-19-20232a?style=flat-square&logo=react&logoColor=61dafb" alt="React 19" />
    <img src="https://img.shields.io/badge/Node.js-Express-20232a?style=flat-square&logo=nodedotjs&logoColor=5fa04e" alt="Node.js и Express" />
    <img src="https://img.shields.io/badge/MySQL-database-20232a?style=flat-square&logo=mysql&logoColor=4479a1" alt="MySQL" />
    <img src="https://img.shields.io/badge/Socket.IO-realtime-20232a?style=flat-square&logo=socketdotio&logoColor=white" alt="Socket.IO" />
  </p>
</div>

## О проекте

Goblin — авторский full-stack проект финансовой платформы с адаптивным интерфейсом. В одном продукте объединены управление криптоактивами, P2P-сделки, спотовая и фьючерсная торговля, платёжный процессинг и маркетплейс цифровых подарков.

Проект опубликован как портфолио-кейс: репозиторий предназначен для знакомства с интерфейсом, архитектурой и реализацией продукта.

## Возможности

- кошелёк и портфель активов USDT, BTC и ETH;
- P2P-рынок с объявлениями, ордерами и историей сделок;
- чат участников сделки и отдельный канал поддержки в реальном времени;
- торговый терминал для SPOT и FUTURES с лимитными и рыночными ордерами;
- стакан, график цены, открытые ордера, позиции и история исполнений;
- платёжный процессинг с реквизитами и контролем транзакций;
- NFT-подарки: маркетплейс, личное хранилище и история продаж;
- профиль, платёжные методы, реферальная система и админ-панель;
- адаптивная компоновка для desktop и mobile.

## Интерфейс

<table>
  <tr>
    <td width="70%" valign="top">
      <img src="docs/screenshots/home-desktop.png" alt="Главный экран Goblin на desktop" />
    </td>
    <td width="30%" valign="top">
      <img src="docs/screenshots/home-mobile.png" alt="Главный экран Goblin на mobile" />
    </td>
  </tr>
</table>

## Технологии

| Слой | Технологии |
| --- | --- |
| Frontend | React 19, React Router, Vite, SCSS Modules, Tailwind CSS |
| Backend | Node.js, Express, Socket.IO |
| Данные | MySQL, SQL-миграции, `decimal.js` |
| Авторизация | JWT, `bcryptjs`, role-based access |
| Web3 | `ethers`, `bitcoinjs-lib` |
| Интеграции | Binance и Bybit market data |

## Архитектура

```text
src/                  React-интерфейс и клиентская логика
├── Components/       переиспользуемые компоненты
├── Pages/            продуктовые разделы
├── data/             локальные данные интерфейса
└── utils/            общие утилиты

backend/
├── src/routes/       HTTP API
├── src/services/     бизнес-логика и торговый движок
├── src/models/       слой доступа к данным
├── src/middleware/   авторизация и доступ
├── sql/              схема и миграции MySQL
└── test/             серверные тесты
```

## Статус

Проект находится в активной разработке. Представленная версия демонстрирует продуктовый дизайн, основные пользовательские сценарии и full-stack архитектуру.

---

<div align="center">
  <sub>Авторский проект. Исходный код опубликован для просмотра.</sub>
</div>
