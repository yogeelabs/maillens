import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatCard from "../components/StatCard";
import { EmailSummary, StatsSummary, getEmails, getStats } from "../lib/api";
import { useAppState } from "../store/appState";

function formatTimestamp(ts: number | null | undefined) {
  if (!ts) return "Unknown";
  const date = new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts);
  return date.toLocaleString();
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { meta } = useAppState();
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeSource = useMemo(() => {
    if (meta.active_source) {
      return meta.sources.find((source) => source.id === meta.active_source) ?? null;
    }
    return meta.sources[0] ?? null;
  }, [meta]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setLoading(true);
      try {
        const [fetchedStats, fetchedEmails] = await Promise.all([getStats(), getEmails(10)]);
        if (!cancelled) {
          setStats(fetchedStats);
          setEmails(fetchedEmails);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Dashboard data load failed", err);
          setError("Unable to load latest data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleReingest() {
    navigate("/wizard?mode=reingest");
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-kicker">MailLens</p>
          <h1>Inbox overview</h1>
          <p className="dashboard-subtitle">
            {activeSource ? (
              <>
                Active source: <code>{activeSource.path}</code>
              </>
            ) : (
              "No sources ingested yet"
            )}
          </p>
          {activeSource ? (
            <p className="dashboard-meta">
              Last ingest: {formatTimestamp(activeSource.last_ingest_ts)} · {activeSource.total_emails} messages indexed
            </p>
          ) : null}
        </div>
        <div className="dashboard-actions">
          <button className="btn btn-primary" type="button" onClick={handleReingest}>
            Re-ingest data
          </button>
          <button className="btn btn-secondary" type="button" disabled>
            Add new source
          </button>
        </div>
      </header>

      {error ? <p className="dashboard-error">{error}</p> : null}

      <section className="stats-grid">
        {stats ? (
          <>
            <StatCard label="Total emails" value={stats.total} />
            <StatCard label="Unread" value={stats.unread} />
            <StatCard label="Flagged" value={stats.flagged} />
            <StatCard label="Junk" value={stats.junk} />
            <StatCard label="Unique senders" value={stats.unique_senders} />
          </>
        ) : (
          <div className="dashboard-placeholder">{loading ? "Loading summary…" : "No data yet."}</div>
        )}
      </section>

      <section className="dashboard-panels">
        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h2>Recent emails</h2>
            <button className="btn btn-ghost" type="button" onClick={handleReingest}>
              Re-run ingest
            </button>
          </div>
          {loading ? (
            <p className="wizard-muted">Fetching latest emails…</p>
          ) : emails.length === 0 ? (
            <p className="wizard-muted">No emails found. Try ingesting a mailbox.</p>
          ) : (
            <ul className="dashboard-email-list">
              {emails.map((email) => (
                <li key={email.id}>
                  <p className="email-subject">{email.subject || "(No subject)"}</p>
                  <p className="email-meta">
                    <span>{email.from_email || "Unknown sender"}</span>
                    {email.date_ts ? <span>{formatTimestamp(email.date_ts)}</span> : null}
                  </p>
                  {email.snippet ? <p className="email-snippet">{email.snippet}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h2>Sources</h2>
          </div>
          {meta.sources.length === 0 ? (
            <p className="wizard-muted">No sources connected yet. Run the wizard to add your first mailbox.</p>
          ) : (
            <ul className="dashboard-source-list">
              {meta.sources.map((source) => (
                <li key={source.id} className={source.id === meta.active_source ? "is-active" : ""}>
                  <div>
                    <p className="source-label">{source.type.toUpperCase()}</p>
                    <p className="source-path">{source.path}</p>
                  </div>
                  <div className="source-meta">
                    <span>{source.total_emails} messages</span>
                    <span>Last ingest {formatTimestamp(source.last_ingest_ts)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
