import React from "react";
import { Router } from "./Router";
import { Header } from "./Components/Header/Header";
import { SnackbarProvider } from "notistack";
import { useLocation } from "react-router-dom";

const Layout = ({ children }) => {
  const location = useLocation();
  const isAuthPage =
    location.pathname === "/login" || location.pathname === "/signin";

  return (
    <div className={isAuthPage ? "app app_auth" : "app"}>
      {!isAuthPage && <Header />}
      {children}
    </div>
  );
};

export const App = () => {
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
