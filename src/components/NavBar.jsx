import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../store/authContext";

export default function NavBar() {
  const nav = useNavigate();
  const location = useLocation();
  const { isAuthed, logout } = useAuth();

  const onLogout = () => {
    logout();
    nav("/", { replace: true });
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="navbar">
      <Link to="/" className="nav-logo">
        Alleria
      </Link>

      <div className="nav-menu">
        {isAuthed ? (
          <>
            <Link to="/scan" className={isActive('/scan') ? 'active' : ''}>
              Scan
            </Link>
            <Link to="/history" className={isActive('/history') ? 'active' : ''}>
              History
            </Link>
            <Link to="/profile" className={isActive('/profile') ? 'active' : ''}>
              Profile
            </Link>
            <button onClick={onLogout} className="btn btn-primary btn-sm">
              Logout
            </button>
          </>
        ) : (
          <div className="flex-gap">
            <Link to="/login" className={isActive('/login') ? 'active' : ''}>
              Login
            </Link>
            <Link to="/register" className="btn btn-primary btn-sm">
              Register
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}