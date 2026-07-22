import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import api from "../../api";
import { isAdminEmail } from "../../utils/adminAccess";
import { Loader } from "../Loader/Loader";

export const AuthGuard = () => {
  const token = localStorage.getItem("token");
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};

export const PublicOnlyGuard = () => {
  const token = localStorage.getItem("token");

  if (token) {
    return <Navigate to="/me" replace />;
  }

  return <Outlet />;
};

export const AdminGuard = () => {
  const token = localStorage.getItem("token");
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }

    let isMounted = true;

    api
      .get("/api/auth/me")
      .then((response) => {
        if (isMounted) {
          setIsAllowed(isAdminEmail(response.data?.email));
        }
      })
      .catch((error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem("token");
        }

        if (isMounted) {
          setIsAllowed(false);
        }
      })
      .finally(() => {
        if (isMounted) {
          setChecking(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (checking) {
    return <Loader />;
  }

  if (!isAllowed) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};
