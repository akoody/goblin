import { lazy, Suspense, useEffect } from "react";
import { Login } from "./Pages/Login/Login";
import { ResetPassword } from "./Pages/ResetPassword/ResetPassword";
import { Navigate, Route, Routes } from "react-router-dom";
import { Signin } from "./Pages/Signin/Signin";
import { Profile } from "./Pages/Profile/Profile";
import { AdminGuard, AuthGuard, PublicOnlyGuard } from "./Components/Auth/Auth-guard";
import { MyDeals } from "./Pages/P2P/MyDeals/MyDeals";
import { Order } from "./Pages/P2P/Order/Order";
import { Orders } from "./Pages/P2P/Orders/Orders";
import { Me } from "./Pages/Me/Me";
import { CreateOrder } from "./Pages/P2P/CreateOrder/CreateOrder";
import { Deal } from "./Pages/P2P/Deal/Deal";
import { Home } from "./Pages/Home/Home";
import { MyOffers } from "./Pages/P2P/MyOffers/MyOffers";
import SupportChatPage from "./Pages/P2P/Chat/SupportChatPage";
import { StaffPanel } from './Pages/Admin/StaffPanel';
import { Processing } from "./Pages/Processing/Processing";
import { NftGifts } from "./Pages/NftGifts/NftGifts";
import { Loader } from "./Components/Loader/Loader";
import { FeatureGate } from "./Components/FeatureGate/FeatureGate";
import { Download } from "./Pages/Download/Download";
import {News,About} from './Pages/Content/Content';
import {Bonuses} from './Pages/Content/Bonuses';
import {Swap} from './Pages/Content/Swap';
import {CreateCoin} from './Pages/Content/CreateCoin';
import {TronSwap} from './Pages/Content/TronSwap';
import {SwapLayout} from './Pages/Content/SwapLayout';
const Trade = lazy(() => import("./Pages/Trade/Trade").then((module) => ({ default: module.Trade })));
const commercePage = (name) => lazy(() => import('./Pages/Commerce/Commerce').then(module => ({default:module[name]})));
const Market=commercePage('Market'), MarketSell=commercePage('MarketSell'), MarketOrders=commercePage('MarketOrders'), MarketWallet=commercePage('MarketWallet'), Guarantor=commercePage('Guarantor'), CommerceDeal=commercePage('CommerceDeal'), CommerceAdmin=commercePage('CommerceAdmin');
const loadingPage = (page) => <Suspense fallback={<Loader />}>{page}</Suspense>;
function OriginalMarket(){useEffect(()=>{window.location.replace(window.location.pathname+window.location.search);},[]);return <Loader/>;}

export const Router = () => {
  return (
    <Routes>
      <Route path="/download" element={<Download />} />
      <Route path="/news" element={<News/>}/>
      <Route path="/about" element={<About/>}/>
      <Route path="/" element={<Home />} />
      <Route path="/market/*" element={<OriginalMarket />} />
      <Route path="/guarantor" element={<FeatureGate feature="guarantor" title="Гарант">{loadingPage(<Guarantor />)}</FeatureGate>} />
      <Route path="/trade" element={<Suspense fallback={<Loader />}><Trade /></Suspense>} />
      <Route path="/p2p/orders" element={<FeatureGate feature="p2p" title="P2P"><Orders /></FeatureGate>} />
      <Route path="/p2p/exchange" element={<Navigate to="/p2p/orders" replace />} />
      <Route element={<PublicOnlyGuard />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signin" element={<Signin />} />
        <Route path="/reset-pass" element={<ResetPassword />} />
      </Route>
      <Route element={<AuthGuard />}>
        <Route path="/swap" element={<SwapLayout/>}>
          <Route index element={<Swap/>}/>
          <Route path="tron" element={<TronSwap/>}/>
          <Route path="create" element={<CreateCoin/>}/>
        </Route>
        <Route path="/create-coin" element={<Navigate to="/swap/create" replace/>}/>
        <Route path="/bonuses" element={<Bonuses/>}/>
        <Route path="/admin" element={<StaffPanel/>}/>
        <Route path="/commerce/deals/:id" element={loadingPage(<CommerceDeal />)} />
        <Route path="/me" element={<Profile />} />
        <Route path="/order/:id" element={<FeatureGate feature="p2p" title="P2P"><Order /></FeatureGate>} />
        <Route path="/deal/:id" element={<FeatureGate feature="p2p" title="P2P"><Deal /></FeatureGate>} />
        <Route path="/p2p/my-deals" element={<FeatureGate feature="p2p" title="P2P"><MyDeals /></FeatureGate>} />
        <Route path="/chat/:id" element={<FeatureGate feature="p2p" title="P2P"><Deal /></FeatureGate>} />
        <Route path="/p2p/profile" element={<Me />} />
        <Route path="/p2p/create-order" element={<FeatureGate feature="p2p" title="P2P"><CreateOrder /></FeatureGate>} />
        <Route path="/p2p/my-offers" element={<FeatureGate feature="p2p" title="P2P"><MyOffers /></FeatureGate>} />
        <Route path="/help" element={<SupportChatPage />} />
        <Route path="/processing" element={<FeatureGate feature="processing" title="Процессинг"><Processing /></FeatureGate>} />
        <Route path="/nft-gifts" element={<FeatureGate feature="nft" title="NFT Market"><NftGifts /></FeatureGate>} />
      </Route>
      <Route element={<AdminGuard />}>
        <Route path="/manage/commerce" element={loadingPage(<CommerceAdmin />)} />
        <Route path="/manage/commerce/deals/:id" element={loadingPage(<CommerceDeal admin />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
