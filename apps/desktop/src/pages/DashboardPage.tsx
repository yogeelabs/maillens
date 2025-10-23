import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardShell, { type FilterNode } from "../components/DashboardShell";
import StatCard from "../components/StatCard";
import { EmailSummary, StatsSummary, getEmails, getStats } from "../lib/api";
import { type AppMeta, type AppSource, useAppState } from "../store/appState";

const numberFormatter = new Intl.NumberFormat("en-US");
const SUMMARY_NODE_ID = "dashboard-summary";

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "–";
  }
  return numberFormatter.format(value);
}

function formatBadge(value: number | null | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return formatNumber(value);
}

function friendlySourceLabel(path: string): string {
  if (!path) return "Source";
  const parts = path.split(/[/\\]/).filter(Boolean);
  if (parts.length === 0) {
    return path;
  }
  return parts[parts.length - 1];
}

function formatTimestamp(ts: number | null | undefined) {
  if (!ts) return "Unknown";
  const date = new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts);
  return date.toLocaleString();
}

function buildFilters(
  stats: StatsSummary | null,
  meta: AppMeta,
  activeSource: AppSource | null,
): FilterNode[] {
  const totalSources = meta.sources.length;
  const latestIngestTs = meta.sources.reduce<number>(
    (latest, source) => Math.max(latest, Number(source.last_ingest_ts ?? 0)),
    0,
  );

  const sourceNodes: FilterNode[] = totalSources
    ? meta.sources.map(source => ({
        id: `source-${source.id}`,
        label: friendlySourceLabel(source.path),
        badge: formatNumber(source.total_emails),
        description: `Last ingest ${formatTimestamp(source.last_ingest_ts)}`,
        stats: [
          { label: "Messages", value: formatNumber(source.total_emails) },
          { label: "Last ingest", value: formatTimestamp(source.last_ingest_ts) },
        ],
        highlights: [
          `Type: ${source.type.toUpperCase()}`,
          activeSource?.id === source.id
            ? "Primary source powering current insights."
            : "Available as a secondary source.",
        ],
        actions: [
          activeSource?.id === source.id ? "Re-ingest this source" : "Set as active source",
        ],
      }))
    : [
        {
          id: "source-empty",
          label: "No sources connected",
          description: "Run the setup wizard to add your first mailbox.",
          highlights: ["Connect MailLens to Apple Mail for local ingest."],
          actions: ["Launch setup wizard"],
        },
      ];

  const summaryNode: FilterNode = {
    id: SUMMARY_NODE_ID,
    label: "Dashboard",
    description: "Current workspace summary across active sources.",
    stats: stats
      ? [
          { label: "Total emails", value: formatNumber(stats.total) },
          { label: "Unread", value: formatNumber(stats.unread) },
          { label: "Flagged", value: formatNumber(stats.flagged) },
        ]
      : undefined,
    highlights: [
      activeSource
        ? `Primary source: ${friendlySourceLabel(activeSource.path)}`
        : "No primary source selected yet.",
      stats?.latest_ts
        ? `Latest ingest captured ${formatTimestamp(stats.latest_ts)}.`
        : "Run an ingest to populate recent activity.",
      "Use the sidebar to explore saved views and team playbooks.",
    ],
    actions: ["Re-run ingest", "Review flagged threads", "Share summary"],
  };

  const overviewNode: FilterNode = {
    id: "overview",
    label: "Inbox overview",
    badge: stats ? formatNumber(stats.total) : undefined,
    description: activeSource
      ? `Unified metrics with ${friendlySourceLabel(activeSource.path)} as the primary source.`
      : "Connect a source to unlock cross-mailbox metrics.",
    stats: stats
      ? [
          { label: "Total emails", value: formatNumber(stats.total) },
          { label: "Unread", value: formatNumber(stats.unread) },
          { label: "Flagged", value: formatNumber(stats.flagged) },
          { label: "Junk", value: formatNumber(stats.junk) },
          { label: "Unique senders", value: formatNumber(stats.unique_senders) },
        ]
      : undefined,
    highlights: [
      activeSource ? `Active source: ${friendlySourceLabel(activeSource.path)}` : "No active source selected.",
      stats?.latest_ts
        ? `Latest message captured ${formatTimestamp(stats.latest_ts)}`
        : "Run an ingest to populate recency insights.",
      "Blends signals across mailboxes to elevate the next best action.",
    ],
    actions: [
      "Re-run ingest to refresh metrics",
      "Share highlights with your team",
      "Flag conversations needing follow-up",
    ],
    children: [
      {
        id: "overview-unread",
        label: "Unread backlog",
        badge: stats ? formatBadge(stats.unread) : undefined,
        description: "Threads awaiting a reply across sources.",
      },
      {
        id: "overview-flagged",
        label: "Flagged follow-ups",
        badge: stats ? formatBadge(stats.flagged) : undefined,
        description: "Messages marked during ingest for review.",
      },
    ],
  };

  const healthNode: FilterNode = {
    id: "system-health",
    label: "Source health",
    badge: formatBadge(totalSources),
    description: totalSources
      ? "Monitor ingest freshness for each mailbox."
      : "Add a source to monitor ingest freshness.",
    highlights: totalSources
      ? [
          `${totalSources === 1 ? "1 mailbox connected" : `${totalSources} mailboxes connected`}.`,
          activeSource
            ? `Primary source: ${friendlySourceLabel(activeSource.path)}`
            : "Select a primary source to anchor insights.",
        ]
      : ["No sources connected.", "Launch the wizard to connect MailLens to Apple Mail."],
    actions: totalSources
      ? ["Re-run ingest for stale sources", "Promote a secondary source"]
      : ["Add a mailbox from the wizard"],
    children: sourceNodes,
  };

  const recentNode: FilterNode = {
    id: "system-recency",
    label: "Recent activity",
    description: "Latest ingest runs and cross-source signals.",
    highlights:
      latestIngestTs > 0
        ? [
            `Most recent ingest completed ${formatTimestamp(latestIngestTs)}.`,
            `Unique senders tracked: ${formatNumber(stats?.unique_senders ?? 0)}.`,
          ]
        : [
            "No ingest runs recorded yet.",
            "Trigger your first ingest to populate workspace insights.",
          ],
    actions: ["Schedule nightly ingest", "Share daily digest"],
    children: [
      {
        id: "system-recency-queue",
        label: "Refresh queue",
        description: "Sources currently queued for re-ingest.",
      },
      {
        id: "system-recency-digest",
        label: "Daily digest",
        description: "Summaries generated after each ingest completes.",
      },
    ],
  };

  const teamNode: FilterNode = {
    id: "team-playbooks",
    label: "Team playbooks",
    badge: "4",
    description: "Shared workflows curated by your go-to-market team.",
    children: [
      {
        id: "playbook-renewals",
        label: "Renewal watch",
        badge: "6",
        description: "Contracts closing within the next 45 days.",
        highlights: [
          "Combines sentiment with ingest notes to highlight risk levels.",
          "Links to tasks surfaced by the MailLens worker.",
        ],
        actions: ["Assign owners for each renewal", "Send weekly status update"],
        children: [
          {
            id: "playbook-renewals-healthy",
            label: "Healthy accounts",
            description: "Strong adoption signals and timely replies.",
          },
          {
            id: "playbook-renewals-risk",
            label: "At risk",
            description: "Stalled replies or negative sentiment detected.",
          },
        ],
      },
      {
        id: "playbook-escalations",
        label: "Escalation desk",
        badge: "3",
        description: "Threads involving leadership or urgent blockers.",
        highlights: [
          "Aggregates flagged emails from all sources in one queue.",
          "Provides ready-to-send status updates for executives.",
        ],
        actions: ["Draft escalation summary", "Loop in engineering owner"],
      },
    ],
  };

  const personalNode: FilterNode = {
    id: "personal",
    label: "My saved views",
    badge: "2",
    description: "Personal shortcuts pinned for quick catch-up.",
    children: [
      {
        id: "personal-today",
        label: "Today at a glance",
        badge: stats ? formatBadge(stats.unread + stats.flagged) : undefined,
        description: "Combines unread and flagged mail requiring action today.",
        highlights: [
          "Pairs with the wizard progress tracker after each ingest.",
          "Summarises the latest notes generated by MailLens.",
        ],
        actions: ["Complete outstanding replies", "Review AI drafted responses"],
      },
      {
        id: "personal-followup",
        label: "Follow-up drafts",
        description: "Messages where you saved AI-generated drafts.",
        actions: ["Review and send outstanding drafts"],
      },
    ],
  };

  return [
    summaryNode,
    {
      id: "system-views",
      label: "System views",
      description: "Baseline views curated by MailLens to keep teams aligned.",
      children: [overviewNode, healthNode, recentNode],
    },
    teamNode,
    personalNode,
  ];
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
      return meta.sources.find(source => source.id === meta.active_source) ?? null;
    }
    return meta.sources[0] ?? null;
  }, [meta]);

  const filters = useMemo(() => buildFilters(stats, meta, activeSource), [stats, meta, activeSource]);

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
    <DashboardShell filters={filters}>
      {(selected) => (
        <div className="dashboard">
          {(() => {
            const summarySelected = selected?.id === SUMMARY_NODE_ID;
            const headerTitle = summarySelected ? "Inbox overview" : selected?.label ?? "Dashboard";
            return (
              <header className="dashboard-header">
                <div>
                  <p className="dashboard-kicker">MailLens</p>
                  <h1>{headerTitle}</h1>
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
                      Last ingest: {formatTimestamp(activeSource.last_ingest_ts)} · {formatNumber(activeSource.total_emails)} messages indexed
                    </p>
                  ) : null}
                  {!summarySelected && selected ? (
                    <p className="dashboard-meta">Selected view: {selected.label}</p>
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
            );
          })()}

          {error ? <p className="dashboard-error">{error}</p> : null}

          <section className="stats-grid">
            {stats ? (
              <>
                <StatCard label="Total emails" value={formatNumber(stats.total)} />
                <StatCard label="Unread" value={formatNumber(stats.unread)} />
                <StatCard label="Flagged" value={formatNumber(stats.flagged)} />
                <StatCard label="Junk" value={formatNumber(stats.junk)} />
                <StatCard label="Unique senders" value={formatNumber(stats.unique_senders)} />
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
                  {emails.map(email => (
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
                <p className="wizard-muted">
                  No sources connected yet. Run the wizard to add your first mailbox.
                </p>
              ) : (
                <ul className="dashboard-source-list">
                  {meta.sources.map(source => (
                    <li key={source.id} className={source.id === meta.active_source ? "is-active" : ""}>
                      <div>
                        <p className="source-label">{source.type.toUpperCase()}</p>
                        <p className="source-path">{source.path}</p>
                      </div>
                      <div className="source-meta">
                        <span>{formatNumber(source.total_emails)} messages</span>
                        <span>Last ingest {formatTimestamp(source.last_ingest_ts)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </DashboardShell>
  );
}
