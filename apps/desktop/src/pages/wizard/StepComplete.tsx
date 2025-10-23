import { useEffect, useState } from "react";
import StatCard from "../../components/StatCard";
import { EmailSummary, StatsSummary, getEmails, getStats } from "../../lib/api";

type StepCompleteProps = {
  stats: StatsSummary | null;
  emails: EmailSummary[];
  onLoaded: (stats: StatsSummary, emails: EmailSummary[]) => void;
};

export default function StepComplete({ stats, emails, onLoaded }: StepCompleteProps) {
  const [loading, setLoading] = useState(!stats);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (stats) {
      setLoading(false);
      return;
    }

    async function hydrate() {
      setLoading(true);
      setError(null);
      try {
        const [fetchedStats, fetchedEmails] = await Promise.all([getStats(), getEmails(10)]);
        if (!cancelled) {
          onLoaded(fetchedStats, fetchedEmails);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Failed to load completion data", err);
          setError("Unable to load stats. You can still finish and view the dashboard.");
          setLoading(false);
        }
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [stats, onLoaded]);

  return (
    <div className="wizard-complete">
      <h2>Ingestion complete!</h2>
      <p className="wizard-text">
        Your mailbox has been processed. Review the summary below or jump straight into the dashboard to explore your
        data.
      </p>
      {loading ? <p className="wizard-muted">Loading statistics…</p> : null}
      {error ? <p className="wizard-error">{error}</p> : null}
      {stats ? (
        <div className="stats-grid">
          <StatCard label="Total emails" value={stats.total} />
          <StatCard label="Flagged" value={stats.flagged} />
          <StatCard label="Unread" value={stats.unread} />
          <StatCard label="Junk" value={stats.junk} />
          <StatCard label="Unique senders" value={stats.unique_senders} />
        </div>
      ) : null}
      {emails.length > 0 ? (
        <div className="email-list">
          <h3>Latest emails</h3>
          <ul>
            {emails.map((email) => (
              <li key={email.id}>
                <p className="email-subject">{email.subject || "(No subject)"}</p>
                <p className="email-meta">
                  <span>{email.from_email || "Unknown sender"}</span>
                  {email.date_ts ? (
                    <span>{new Date(email.date_ts * 1000).toLocaleString()}</span>
                  ) : null}
                </p>
                {email.snippet ? <p className="email-snippet">{email.snippet}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="wizard-muted">Continue to open the dashboard and explore your dataset.</p>
    </div>
  );
}
