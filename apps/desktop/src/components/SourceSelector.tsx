// components/SourceSelector.tsx
import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { join, homeDir } from "@tauri-apps/api/path";

const DEFAULT_MAIL_RELATIVE = ["Library", "Mail"];

export default function SourceSelector({ onStart }: { onStart:(path:string)=>void }) {
  const [path, setPath] = useState<string | null>(null);
  const [defaultDir, setDefaultDir] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function resolveDefault() {
      try {
        const home = await homeDir();
        const full = await DEFAULT_MAIL_RELATIVE.reduce(
          async (accPromise, segment) => join(await accPromise, segment),
          Promise.resolve(home)
        );
        if (!cancelled) setDefaultDir(full);
      } catch (err) {
        console.warn("Failed to resolve default mail directory", err);
      }
    }
    resolveDefault();
    return () => {
      cancelled = true;
    };
  }, []);

  async function pickFolder() {
    try {
      const dir = await open({
        directory: true,
        multiple: false,
        defaultPath: defaultDir,
      });
      if (typeof dir === "string" && dir) {
        setPath(dir);
        return;
      }
      if (Array.isArray(dir) && dir.length > 0) {
        setPath(dir[0] ?? null);
        return;
      }
      if (dir === null) {
        console.info("Directory selection was cancelled.");
      }
    } catch (err) {
      // likely not running inside Tauri; fall back to browser APIs
      if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
        try {
          const handle = await (window as any).showDirectoryPicker();
          if (handle?.name) {
            const pathLike = handle.name;
            setPath(pathLike);
            return;
          }
        } catch (_ignored) {
          /* user cancelled */
        }
      }
      console.warn("Unable to open directory picker", err);
    }
  }

  return (
    <div className="p-8 space-y-4 text-center">
      <h1 className="text-2xl font-semibold">Select Mail Source</h1>
      <button className="btn" onClick={pickFolder}>📂 Choose Folder</button>
      {path && (
        <div className="mt-4">
          <p className="text-sm opacity-80">{path}</p>
          <button
            className="btn-primary mt-2"
            onClick={() => onStart(path)}
          >
            Start Ingestion
          </button>
        </div>
      )}
    </div>
  );
}
