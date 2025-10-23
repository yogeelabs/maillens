type ProgressBarProps = {
  value: number;
  max?: number;
  label?: string;
};

export default function ProgressBar({ value, max = 100, label }: ProgressBarProps) {
  const safeMax = max <= 0 ? 100 : max;
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100));

  return (
    <div className="progress">
      {label ? <span className="progress-label">{label}</span> : null}
      <div className="progress-track">
        <div className="progress-value" style={{ width: `${percent}%` }} aria-hidden />
      </div>
      <span className="progress-meta">{percent.toFixed(0)}%</span>
    </div>
  );
}
