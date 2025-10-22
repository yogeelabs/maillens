// pages/IngestPage.tsx
import { useState } from "react";
import SourceSelector from "../components/SourceSelector";
import ProgressPanel from "../components/ProgressPanel";
import StatsPanel from "../components/StatsPanel";
import { useProgress } from "../hooks/useProgress";
import { useStats } from "../hooks/useStats";

export default function IngestPage() {
  const [started, setStarted] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const progress = useProgress();
  const stats = useStats(progress.status === "done");

  async function startIngest(p: string) {
    setPath(p);
    setStarted(true);
    await fetch("http://127.0.0.1:8000/ingest/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "emlx", path: p })
    });
  }

  if (!started) return <SourceSelector onStart={startIngest} />;
  if (progress.status !== "done") return <ProgressPanel />;
  return <StatsPanel stats={stats} />;
}