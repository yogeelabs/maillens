import { Navigate, RouteObject, useRoutes } from "react-router-dom";
import WelcomePage from "./pages/WelcomePage";
import WizardPage from "./pages/WizardPage";
import DashboardPage from "./pages/DashboardPage";
import { useAppState } from "./store/appState";

function InitialRedirect() {
  const { meta } = useAppState();
  const target = meta.first_run_complete ? "/dashboard" : "/welcome";
  return <Navigate to={target} replace />;
}

const routes: RouteObject[] = [
  { path: "/", element: <InitialRedirect /> },
  { path: "/welcome", element: <WelcomePage /> },
  { path: "/wizard/:stepId?", element: <WizardPage /> },
  { path: "/dashboard", element: <DashboardPage /> },
  { path: "*", element: <Navigate to="/welcome" replace /> },
];

export default function AppRouter() {
  return useRoutes(routes);
}
