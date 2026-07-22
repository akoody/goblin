import { NavLink } from "react-router-dom";
import { FiCreditCard, FiFileText, FiMessageSquare, FiUser } from "react-icons/fi";
import styles from "./P2PMobileNav.module.scss";

const items = [
  { to: "/p2p/orders", label: "P2P", icon: <FiCreditCard /> },
  { to: "/p2p/my-deals", label: "Orders", icon: <FiFileText /> },
  { to: "/p2p/my-offers", label: "Ads", icon: <FiMessageSquare /> },
  { to: "/p2p/profile", label: "Profile", icon: <FiUser /> },
];

export const P2PMobileNav = () => {
  return (
    <nav className={styles.mobileNav} aria-label="P2P mobile navigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => (isActive ? styles.mobileNav_active : "")}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};
