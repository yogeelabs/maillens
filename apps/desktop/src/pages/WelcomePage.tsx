import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState } from "../store/appState";

export default function WelcomePage() {
  const { meta } = useAppState();
  const navigate = useNavigate();

  useEffect(() => {
    if (meta.first_run_complete) {
      navigate("/dashboard", { replace: true });
    }
  }, [meta.first_run_complete, navigate]);

  function handleGetStarted() {
    navigate("/wizard?mode=onboarding", { replace: false });
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <span className="welcome-badge">Private by design</span>
        <h1>See your inbox through a new lens.</h1>
        <p>
          MailLens ingests your Apple Mail data locally, giving you insights without sending anything to the cloud.
          Set up takes just a few minutes.
        </p>
        <button className="btn btn-primary" type="button" onClick={handleGetStarted}>
          Get started
        </button>
        <p className="welcome-meta">No accounts, no uploads. Your data stays on this device.</p>
      </div>
    </div>
  );
}
