import { useEffect } from "react";
import ProgressBar from "../../components/ProgressBar";
import { ProgressSnapshot } from "../../lib/api";
import { useProgress } from "../../hooks/useProgress";

type StepProgressProps = {
  onProgress: (snapshot: ProgressSnapshot) => void;
  onComplete: () => void;
  onError: (message: string) => void;
};

export default function StepProgress({ onProgress, onComplete, onError }: StepProgressProps) {
  const progress = useProgress(true, 1000);

  useEffect(() => {
    onProgress(progress);
    if (progress.status === "done") {
      onComplete();
    }
    if (progress.status === "error" && progress.error) {
      onError(progress.error);
    }
    if (progress.status === "cancelled") {
      onError("Ingestion cancelled");
    }
  }, [progress, onProgress, onComplete, onError]);

  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : progress.running ? 5 : 0;

  return (
    <div className="wizard-progress">
      <h2>Ingesting mailbox…</h2>
      <ProgressBar value={pct} />
      <p className="wizard-text">
        {progress.note || (progress.running ? "Parsing messages…" : "Preparing to ingest…")}
      </p>
      <p className="wizard-muted">
        Processed {progress.done} of {progress.total || "—"} messages
      </p>
    </div>
  );
}
