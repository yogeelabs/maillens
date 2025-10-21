import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [msg, setMsg] = useState("Loading...");
  useEffect(() => {
    fetch("http://127.0.0.1:8000/")
      .then(r => r.json())
      .then(d => setMsg(d.message))
      .catch(() => setMsg("Worker not running"));
  }, []);
  return (
    <div className="p-8 text-center">
      <h1 className="text-3xl font-bold">MailLens</h1>
      <p>{msg}</p>
    </div>
  );
}

export default App;
