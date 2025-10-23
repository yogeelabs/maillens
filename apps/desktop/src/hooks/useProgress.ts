import { useEffect, useState } from "react";
import { ProgressSnapshot, getProgress } from "../lib/api";

const emptyProgress: ProgressSnapshot = {
  total: 0,
  done: 0,
  status: "idle",
  note: "",
  running: false,
};

export function useProgress(active = true, intervalMs = 1000) {
  const [progress, setProgress] = useState<ProgressSnapshot>(emptyProgress);

  useEffect(() => {
    if (!active) {
      setProgress(emptyProgress);
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;

    async function poll() {
      try {
        const snapshot = await getProgress();
        if (cancelled) return;
        setProgress(snapshot);
      } catch (err) {
        if (!cancelled) {
          console.warn("Progress polling failed", err);
        }
      }
    }

    poll();
    timerId = window.setInterval(poll, intervalMs);

    return () => {
      cancelled = true;
      if (timerId !== null) {
        clearInterval(timerId);
      }
    };
  }, [active, intervalMs]);

  return progress;
}
