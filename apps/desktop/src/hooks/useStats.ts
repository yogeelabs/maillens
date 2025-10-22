// hooks/useStats.ts
import { useEffect, useState } from "react";
export function useStats(trigger:boolean) {
  const [stats,setStats]=useState<any>(null);
  useEffect(()=>{
    if (!trigger) return;
    fetch("http://127.0.0.1:8000/stats")
      .then(r=>r.json())
      .then(setStats)
      .catch(()=>{});
  },[trigger]);
  return stats;
}