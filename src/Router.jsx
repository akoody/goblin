import { lazy, Suspense } from "react";
import { Login } from "./Pages/Login/Login";
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
import { Admin } from "./Pages/Admin/Admin";
import { Processing } from "./Pages/Processing/Processing";
import { NftGifts } from "./Pages/NftGifts/NftGifts";
import { Loader } from "./Components/Loader/Loader";
const Trade = lazy(() => import("./Pages/Trade/Trade").then((module) => ({ default: module.Trade })));

export const Router = () => {
  return (
    <Routes>
      <Route element={<PublicOnlyGuard />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signin" element={<Signin />} />
      </Route>
      <Route element={<AuthGuard />}>
        <Route path="/" element={<Home />} />
        <Route path="/me" element={<Profile />} />
        <Route path="/order/:id" element={<Order />} />
        <Route path="/deal/:id" element={<Deal />} />
        <Route path="/p2p/my-deals" element={<MyDeals />} />
        <Route path="/p2p/orders" element={<Orders />} />
        <Route path="/chat/:id" element={<Deal />} />
        <Route path="/p2p/profile" element={<Me />} />
        <Route path="/p2p/create-order" element={<CreateOrder />} />
        <Route path="/p2p/exchange" element={<Navigate to="/p2p/orders" replace />} />
        <Route path="/p2p/my-offers" element={<MyOffers />} />
        <Route path="/help" element={<SupportChatPage />} />
        <Route path="/trade" element={<Suspense fallback={<Loader />}><Trade /></Suspense>} />
        <Route path="/processing" element={<Processing />} />
        <Route path="/nft-gifts" element={<NftGifts />} />
      </Route>
      <Route element={<AdminGuard />}>
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to={"/login"} />} />
    </Routes>
  );
};
