import { useState } from "react";
import { DepositCompliance } from './DepositCompliance';
import { Helpers } from './Helpers';
import { ContentAdmin } from '../Content/Content';
import { Bonuses } from '../Content/Bonuses';
import { TransactionHistory } from '../../Components/TransactionHistory/TransactionHistory';
import { ScrollableNav } from '../../Components/ScrollableNav/ScrollableNav';
import { confirmSaveClick, confirmSaveSubmit } from '../../Components/AdminSaveConfirmation';
import { WalletHelp } from './WalletHelp';
import { TreasuryCollection } from './TreasuryCollection';
import { TreasuryPayouts } from './TreasuryPayouts';
import { NativeChains } from './NativeChains';
import { PumpAdmin } from '../Content/CreateCoin';
import { PushBroadcast } from './PushBroadcast';
import { Referrals } from './Referrals';
import { GuarantorDeals } from './GuarantorDeals';
import { IncomeReport } from './IncomeReport';
import { FiActivity, FiCreditCard, FiDollarSign, FiList, FiMessageCircle, FiShield, FiUsers } from "react-icons/fi";
import { Link } from "react-router-dom";
import styles from "./Admin.module.scss";
import { AdminStats } from './AdminStats';
import { useSecurityAdmin, SecuritySection } from './sections/Security';
import { useSupportAdmin, SupportSection } from './sections/Support';
import { useP2pDealsAdmin, P2pDealsSection } from './sections/P2pDeals';
import { usePaymentMethodsAdmin, PaymentMethodsSection } from './sections/PaymentMethods';
import { useUsersAdmin, UsersSection } from './sections/Users';
import { usePlatformFeaturesAdmin, PlatformFeaturesSection } from './sections/PlatformFeatures';
import { useTradingAdmin, TradingSection } from './sections/Trading';
import { useProcessingAdmin, ProcessingSection } from './sections/Processing';

function TreasuryDetails({title,children}){const [open,setOpen]=useState(false);return <details onToggle={event=>setOpen(event.currentTarget.open)}><summary>{title}</summary>{open&&children}</details>;}

// Админ-панель: вкладки и разделы. Каждый раздел живёт в sections/: хук с состоянием и загрузкой плюс разметка.
// Хуки вызываются здесь все сразу, как и раньше: данные грузятся при открытии панели, а черновики и фильтры
// переживают переключение вкладок.
export const Admin = () => {
  const [activeSection, setActiveSection] = useState(() => new URLSearchParams(window.location.search).get('section') === 'guarantor' ? 'guarantor' : 'support');
  const security = useSecurityAdmin();
  const support = useSupportAdmin();
  const p2pDeals = useP2pDealsAdmin();
  const payments = usePaymentMethodsAdmin();
  const users = useUsersAdmin();
  const features = usePlatformFeaturesAdmin();
  const trading = useTradingAdmin({ activeSection });
  const processing = useProcessingAdmin({ activeSection });

  return (
    <main className={styles.admin} onClickCapture={confirmSaveClick} onSubmitCapture={confirmSaveSubmit}>
      <section className={styles.admin_header}>
        <div>
          <span>
            <FiShield />
            Админ-панель
          </span>
          <h1>{{income:'Отчёт по деньгам',support:'Поддержка клиентов',security:'Безопасность аккаунтов',deals:'P2P сделки',payments:'Способы оплаты',transactions:'Транзакции',processing:'Процессинг',trading:'Торговля',users:'Пользователи',features:'Доступность разделов',treasury:'Кошелёк и AML',referrals:'Реферальные приглашения',guarantor:'Сделки гаранта'}[activeSection] || 'Админ-панель'}</h1>
          <Link to="/manage/commerce">Маркет и гарант: платежи и споры →</Link>
        </div>
      </section>

      <ScrollableNav className={styles.admin_tabs} label="Разделы админ-панели">


        <button type="button" onClick={()=>setActiveSection('pump')}>Создание мемкоинов</button>
        <button type="button" onClick={()=>setActiveSection('bonuses')}>Бонусы</button>
        <button type="button" onClick={()=>setActiveSection('content')}>Новости и о проекте</button>
        <button type="button" onClick={()=>setActiveSection('broadcast')}>Рассылка</button>
        <button type="button" className={activeSection==='helpers'?styles.admin_tabActive:''} onClick={()=>setActiveSection('helpers')}><FiUsers/>Хелперы</button>
        <button type="button" className={activeSection === "security" ? styles.admin_tabActive : ""} onClick={() => setActiveSection("security")}>
          <FiShield /> Безопасность{security.loginIps.unread > 0 ? ` (${security.loginIps.unread})` : ""}
        </button>
        <button
          type="button"
          className={activeSection === "support" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("support")}
        >
          <FiMessageCircle />
          Поддержка
        </button>
        <button
          type="button"
          className={activeSection === "deals" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("deals")}
        >
          <FiList />
          P2P сделки
        </button>
        <button
          type="button"
          className={activeSection === "payments" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("payments")}
        >
          <FiCreditCard />
          Способы оплаты
        </button>
        <button
          type="button"
          className={activeSection === "transactions" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("transactions")}
        >
          <FiList />
          Транзакции
        </button>
        <button
          type="button"
          className={activeSection === "processing" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("processing")}
        >
          <FiDollarSign />
          Процессинг
        </button>
        <button
          type="button"
          className={activeSection === "trading" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("trading")}
        >
          <FiActivity />
          Трейдинг
        </button>
        <button
          type="button"
          className={activeSection === "users" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("users")}
        >
          <FiUsers />
          Пользователи
        </button>
        <button
          type="button"
          className={activeSection === "features" ? styles.admin_tabActive : ""}
          onClick={() => setActiveSection("features")}
        >
          <FiActivity />
          Доступность
        </button>
        <button type="button" className={activeSection==='treasury'?styles.admin_tabActive:''} onClick={()=>setActiveSection('treasury')}><FiDollarSign/>Кошелёк и AML</button>
        <button type="button" className={activeSection==='income'?styles.admin_tabActive:''} onClick={()=>setActiveSection('income')}><FiDollarSign/>Отчёт по деньгам</button>
        <button type="button" className={activeSection==='referrals'?styles.admin_tabActive:''} onClick={()=>setActiveSection('referrals')}><FiUsers/>Приглашения</button>
        <button type="button" className={activeSection==='guarantor'?styles.admin_tabActive:''} onClick={()=>setActiveSection('guarantor')}><FiShield/>Гарант</button>
      </ScrollableNav>
      {activeSection==='income'&&<IncomeReport/>}
      {activeSection==='treasury'&&<><TreasuryPayouts/><TreasuryDetails title="Сбор комиссий с адресов пользователей"><TreasuryCollection/><NativeChains/></TreasuryDetails><TreasuryDetails title="Комиссии пополнений, доходы и AML"><DepositCompliance/></TreasuryDetails><TreasuryDetails title="Как устроены кошелёк и AML"><WalletHelp/></TreasuryDetails></>}
      {activeSection==='helpers'&&<Helpers/>}
      {activeSection==='content'&&<ContentAdmin/>}
      {activeSection==='bonuses'&&<Bonuses admin/>}

      {activeSection==='pump'&&<PumpAdmin/>}
      {activeSection==='broadcast'&&<PushBroadcast/>}

      {activeSection==='referrals'&&<Referrals/>}
      {activeSection==='guarantor'&&<GuarantorDeals/>}


      {activeSection === "security" && <SecuritySection {...security} />}

      <AdminStats tickets={support.tickets} waitingCount={support.waitingCount} onlineCount={support.onlineCount} highPriorityCount={support.highPriorityCount} paymentDefinitions={payments.paymentDefinitions} activeDealsCount={p2pDeals.activeDealsCount} />

      {activeSection === "support" && <SupportSection {...support} />}

      {activeSection === "deals" && <P2pDealsSection {...p2pDeals} paymentDefinitions={payments.paymentDefinitions} />}

      {activeSection === "features" && <PlatformFeaturesSection {...features} />}

      {activeSection === "payments" && <PaymentMethodsSection {...payments} />}

      {activeSection === "transactions" && <TransactionHistory admin title="Транзакции биржи"/>}

      {activeSection === "processing" && <ProcessingSection {...processing} />}

      {activeSection === "trading" && <TradingSection {...trading} />}

      {activeSection === "users" && <UsersSection {...users} />}
    </main>
  );
};

export default Admin;
