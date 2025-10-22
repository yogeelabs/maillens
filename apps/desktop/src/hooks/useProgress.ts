// hooks/useProgress.ts
import { useEffect, useState } from "react";
export function useProgress() {
  const [progress, setProgress] = useState({ done:0, total:0, status:"idle", note:"" });

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/progress");
        const data = await res.json();
        setProgress(data);
      } catch (_) {}
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return progress;
}