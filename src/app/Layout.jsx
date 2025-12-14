import { Outlet } from "react-router-dom";
import NavBar from "../components/NavBar";

export default function Layout() {
  return (
    <div className="layout-container">
      <NavBar />
      <main className="main-container">
        <Outlet />
      </main>
    </div>
  );
}