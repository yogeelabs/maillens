import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import AppRouter from "./router";
import { useAppState } from "./store/appState";

function App() {
  const { meta } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const firstRun = !meta.first_run_complete;
    const path = location.pathname;
    if (firstRun) {
      const allowedFirstRun = path === "/welcome" || path.startsWith("/wizard");
      if (!allowedFirstRun) {
        navigate("/welcome", { replace: true });
      }
      return;
    }
    if (path === "/" || path === "/welcome") {
      navigate("/dashboard", { replace: true });
    }
  }, [meta.first_run_complete, location.pathname, navigate]);

  const isDashboardRoute = location.pathname.startsWith("/dashboard");

  return (
    <div className={`app-shell${isDashboardRoute ? " app-shell--dashboard" : ""}`}>
      <AppRouter />
    </div>
  );
}

export default App;
