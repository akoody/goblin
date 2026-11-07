import React, { useEffect, useState } from "react";
import { restoreMarketSession } from './session';
import { Router } from "./Router";
import { Header } from "./Components/Header/Header";
import { SnackbarProvider } from "notistack";
import { useLocation } from "react-router-dom";
import { captureReferral } from './utils/referralAttribution';

const Layout = ({ children }) => {
  const location = useLocation();
  useEffect(() => { captureReferral(location.search); }, [location.search]);
  const isAuthPage =
    location.pathname === "/login" || location.pathname === "/signin" || location.pathname === "/download";

  return (
    <div className={isAuthPage ? "app app_auth" : "app"}>
      {!isAuthPage && <Header />}
      {children}
    </div>
  );
};

export const App = () => {
  const [ready,setReady]=useState(()=>Boolean(localStorage.getItem('token')));
  useEffect(()=>{restoreMarketSession().finally(()=>setReady(true));},[]);
  if(!ready)return null;
  return (
    <SnackbarProvider
      autoHideDuration={4200}
      maxSnack={4}
      preventDuplicate
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
    >
      <Layout>
        <Router />
      </Layout>
    </SnackbarProvider>
  );
};
