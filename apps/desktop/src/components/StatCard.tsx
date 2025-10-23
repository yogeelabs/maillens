type StatCardProps = {
  label: string;
  value: number | string;
  description?: string;
};

export default function StatCard({ label, value, description }: StatCardProps) {
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {description ? <p className="stat-description">{description}</p> : null}
    </div>
  );
}
