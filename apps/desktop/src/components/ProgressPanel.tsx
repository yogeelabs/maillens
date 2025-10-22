// components/ProgressPanel.tsx
import { useProgress } from "../hooks/useProgress";

export default function ProgressPanel() {
  const p = useProgress();
  const pct = p.total ? (p.done / p.total) * 100 : 0;

  return (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold mb-3">Ingesting Emails…</h2>
      <div className="w-full bg-gray-200 rounded h-3 overflow-hidden">
        <div
          className="bg-green-500 h-3 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-sm">{p.done}/{p.total} ({pct.toFixed(1)}%)</p>
      <p className="text-xs opacity-70">{p.note}</p>
    </div>
  );
}