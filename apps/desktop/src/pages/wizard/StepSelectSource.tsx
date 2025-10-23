type StepSelectSourceProps = {
  selectedSourceId: string | null;
  onSelect: (id: string) => void;
};

const SOURCE_OPTIONS = [
  {
    id: "emlx",
    title: "Apple Mail (macOS)",
    description: "Ingest local Apple Mail mailboxes stored on this device.",
    available: true,
    badge: "Available",
  },
  {
    id: "gmail",
    title: "Gmail",
    description: "Connect to Gmail via OAuth (coming soon).",
    available: false,
    badge: "Coming soon",
  },
  {
    id: "mbox",
    title: "Generic mbox Archive",
    description: "Import an exported mbox file (coming soon).",
    available: false,
    badge: "Coming soon",
  },
];

export default function StepSelectSource({ selectedSourceId, onSelect }: StepSelectSourceProps) {
  return (
    <div className="wizard-card-grid">
      {SOURCE_OPTIONS.map((option) => {
        const isActive = selectedSourceId === option.id;
        return (
          <button
            key={option.id}
            type="button"
            className={`wizard-card ${isActive ? "is-active" : ""} ${!option.available ? "is-disabled" : ""}`}
            onClick={() => option.available && onSelect(option.id)}
            disabled={!option.available}
          >
            <div className="wizard-card-header">
              <span className={`badge ${option.available ? "badge-success" : "badge-muted"}`}>{option.badge}</span>
            </div>
            <div className="wizard-card-body">
              <h3>{option.title}</h3>
              <p>{option.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
