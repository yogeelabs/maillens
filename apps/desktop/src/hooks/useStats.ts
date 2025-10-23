import { useEffect, useState } from "react";
import { StatsSummary, getStats } from "../lib/api";

export function useStats(trigger: boolean) {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!trigger) return;
    let cancelled = false;
    async function fetchStats() {
      try {
        const result = await getStats();
        if (!cancelled) {
          setStats(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err);
        }
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [trigger]);

  return { stats, error };
}
