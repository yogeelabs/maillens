import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir, join } from "@tauri-apps/api/path";

type StepConfigureSourceProps = {
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  onClearPath: () => void;
};

const DEFAULT_MAIL_RELATIVE = ["Library", "Mail"];

export default function StepConfigureSource({
  selectedPath,
  onSelectPath,
  onClearPath,
}: StepConfigureSourceProps) {
  const [defaultDir, setDefaultDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function resolveDefault() {
      try {
        const home = await homeDir();
        const resolved = await DEFAULT_MAIL_RELATIVE.reduce(
          async (accPromise, segment) => join(await accPromise, segment),
          Promise.resolve(home),
        );
        if (!cancelled) setDefaultDir(resolved);
      } catch {
        if (!cancelled) setDefaultDir(null);
      }
    }
    resolveDefault();
    return () => {
      cancelled = true;
    };
  }, []);

  async function pickDirectory() {
    setError(null);
    try {
      const result = await open({
        directory: true,
        multiple: false,
        defaultPath: defaultDir ?? undefined,
      });

      if (typeof result === "string" && result) {
        onSelectPath(result);
        return;
      }

      if (Array.isArray(result) && result.length > 0) {
        onSelectPath(result[0] as string);
        return;
      }

      if (result === null) {
        return;
      }
    } catch (err) {
      // Fallback for browser dev environment
      if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
        try {
          const handle = await (window as any).showDirectoryPicker();
          if (handle?.name) {
            onSelectPath(handle.name);
            return;
          }
        } catch {
          // user cancelled
          return;
        }
      }
      console.warn("Directory selection failed", err);
      setError("Could not access folder picker. Please try again.");
    }
  }

  return (
    <div className="wizard-configure">
      <p className="wizard-text">
        MailLens processes Apple Mail data directly from your local mailbox. Choose the root mail folder (usually located
        at <code>~/Library/Mail</code>).
      </p>
      <button className="btn btn-primary" type="button" onClick={pickDirectory}>
        Choose Mail Folder
      </button>
      {selectedPath ? (
        <div className="wizard-selected-path">
          <p className="path-label">Selected folder</p>
          <p className="path-value">{selectedPath}</p>
          <div className="path-actions">
            <button className="btn btn-secondary" type="button" onClick={pickDirectory}>
              Change
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClearPath}>
              Clear
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="wizard-error">{error}</p> : null}
    </div>
  );
}
