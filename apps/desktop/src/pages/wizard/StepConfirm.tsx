type StepConfirmProps = {
  selectedSourceId: string;
  selectedPath: string;
  error?: string | null;
};

function describeSource(sourceId: string) {
  switch (sourceId) {
    case "emlx":
      return "Apple Mail (macOS)";
    default:
      return sourceId;
  }
}

export default function StepConfirm({ selectedSourceId, selectedPath, error }: StepConfirmProps) {
  return (
    <div className="wizard-confirm">
      <div className="confirm-summary">
        <h2>Ready to ingest your mailbox</h2>
        <dl>
          <div>
            <dt>Source</dt>
            <dd>{describeSource(selectedSourceId)}</dd>
          </div>
          <div>
            <dt>Folder</dt>
            <dd>{selectedPath}</dd>
          </div>
        </dl>
      </div>
      <p className="wizard-text">
        MailLens will scan the selected folder, extract metadata, and store it in a local database. Your email contents
        never leave this device.
      </p>
      <p className="wizard-muted">
        When you start, MailLens will create or update the local database and begin processing emails.
      </p>
      {error ? <p className="wizard-error">{error}</p> : null}
    </div>
  );
}
