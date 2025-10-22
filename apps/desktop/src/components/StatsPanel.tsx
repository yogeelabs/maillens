// components/StatsPanel.tsx
export default function StatsPanel({ stats }: { stats:any }) {
  if (!stats) return null;
  return (
    <div className="p-6 grid grid-cols-2 gap-4 text-center">
      {Object.entries(stats).map(([k,v])=>(
        <div key={k} className="p-3 bg-gray-100 rounded">
          <p className="text-xs uppercase text-gray-500">{k}</p>
          <p className="text-lg font-semibold">{v}</p>
        </div>
      ))}
    </div>
  );
}