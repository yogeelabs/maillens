import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardShell, { type FilterNode, type FilterNodeInsight } from "../components/DashboardShell";
import StatCard from "../components/StatCard";
import {
  EmailSummary,
  SenderInsight,
  StatsSummary,
  getEmails,
  getFirstTimeSenderInsights,
  getDormantSenderInsights,
  getSenderInsightsForAddresses,
  getTopSenderInsights,
  getStats,
} from "../lib/api";
import { type AppMeta, type AppSource, useAppState } from "../store/appState";

const numberFormatter = new Intl.NumberFormat("en-US");
const SUMMARY_NODE_ID = "dashboard-summary";
const FIRST_TIME_SENDER_NODE_ID = "sender-attributes-frequency-first-time";
const DEFAULT_DORMANT_INACTIVE_DAYS = 365;

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
  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const createAddressNodes = (prefix: string, addresses: string[]): FilterNode[] =>
    addresses.map(address => ({
      id: `${prefix}-${slugify(address)}`,
      label: address,
      insight: {
        kind: "address-group",
        addresses: [address],
      },
    }));

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

  const roleBasedGroups: Record<string, string[]> = {
    "Support & Customer Service": [
      "support@",
      "help@",
      "service@",
      "assist@",
      "helpdesk@",
      "care@",
      "customercare@",
      "customer.service@",
      "customerservice@",
      "clientservice@",
      "csr@",
      "itsupport@",
      "techsupport@",
    ],
    "Sales & Marketing": [
      "sales@",
      "marketing@",
      "offers@",
      "promo@",
      "promotion@",
      "deals@",
      "discount@",
      "advertise@",
      "newsletter@",
      "subscribe@",
      "crm@",
      "announcement@",
      "announcements@",
      "notifications@",
      "updates@",
      "campaign@",
    ],
    "Administration & HR": [
      "admin@",
      "administrator@",
      "office@",
      "team@",
      "staff@",
      "management@",
      "hr@",
      "recruit@",
      "recruitment@",
      "careers@",
      "jobs@",
      "hiring@",
      "talent@",
      "joinus@",
    ],
    "Technical & IT": [
      "tech@",
      "it@",
      "sysadmin@",
      "webmaster@",
      "developer@",
      "developers@",
      "devops@",
      "root@",
      "cloud@",
      "api@",
    ],
    "Finance & Accounts": [
      "billing@",
      "accounts@",
      "accounting@",
      "account@",
      "finance@",
      "payments@",
      "invoices@",
      "invoice@",
      "receipts@",
      "statement@",
      "transactions@",
      "payroll@",
    ],
    "Legal & Compliance": [
      "legal@",
      "privacy@",
      "compliance@",
      "security@",
      "dpo@",
      "abuse@",
      "dmca@",
      "fraud@",
      "violation@",
      "alert@",
    ],
    "Operations & Logistics": [
      "orders@",
      "order@",
      "shipping@",
      "warehouse@",
      "logistics@",
      "fulfillment@",
      "supply@",
      "delivery@",
      "dispatch@",
    ],
    "Media & PR": [
      "press@",
      "media@",
      "pr@",
      "news@",
      "editor@",
      "publicrelations@",
      "outreach@",
    ],
    "Education & Training": [
      "admissions@",
      "training@",
      "learning@",
      "education@",
      "academy@",
      "course@",
      "institute@",
    ],
    "Events & Community": [
      "events@",
      "event@",
      "conference@",
      "seminar@",
      "webinar@",
      "community@",
      "meetup@",
      "network@",
      "rsvp@",
      "society@",
      "association@",
      "contact@",
    ],
    "Generic Inquiries": [
      "info@",
      "hello@",
      "hi@",
      "feedback@",
      "query@",
      "question@",
      "ask@",
      "contactus@",
      "enquiry@",
      "inquiry@",
    ],
  };
  const roleBasedGroupsEntries = Object.entries(roleBasedGroups);
  const roleBasedAddresses = roleBasedGroupsEntries.reduce<string[]>(
    (all, [, addresses]) => all.concat(addresses),
    [],
  );

  const genericSenderGroups: Record<string, string[]> = {
    "No-reply Variants": [
      "noreply@",
      "no-reply@",
      "do-not-reply@",
      "donotreply@",
      "dontreply@",
      "no_reply@",
      "no.reply@",
      "noresponse@",
      "do-not-respond@",
      "do_not_reply@",
      "noreplymail@",
      "noreplyservice@",
    ],
    "System & Daemon": [
      "mailer-daemon@",
      "postmaster@",
      "bounce@",
      "autoresponder@",
      "autoresponse@",
      "robot@",
      "bot@",
      "automated@",
      "system@",
      "daemon@",
      "auto@",
      "automailer@",
    ],
    "Notifications & Alerts": [
      "notifications@",
      "notification@",
      "notify@",
      "alerts@",
      "alert@",
      "updates@",
      "status@",
      "reminder@",
      "message@",
      "warning@",
    ],
    "Transactional Senders": [
      "transactions@",
      "transaction@",
      "orders@",
      "order@",
      "receipts@",
      "receipt@",
      "invoice@",
      "booking@",
      "bookings@",
      "registration@",
      "confirm@",
      "confirmation@",
      "passwordreset@",
      "verification@",
      "accountupdate@",
    ],
    "News & Campaigns": [
      "news@",
      "newsletter@",
      "digest@",
      "campaign@",
      "announce@",
      "announcement@",
      "announcements@",
      "press@",
    ],
    "Bulk & Marketing Engines": [
      "email@",
      "mail@",
      "mailer@",
      "marketing@",
      "promo@",
      "offers@",
      "blast@",
      "ads@",
      "ad@",
      "crm@",
      "list@",
    ],
  };
  const genericGroupsEntries = Object.entries(genericSenderGroups);
  const genericAddresses = genericGroupsEntries.reduce<string[]>(
    (all, [, addresses]) => all.concat(addresses),
    [],
  );

  const senderAttributesNode: FilterNode = {
    id: "sender-attributes",
    label: "Sender attributes",
    description: "Group views by sender frequency and shared role-based mailboxes.",
    children: [
      {
        id: "sender-attributes-top",
        label: "Top senders",
        description: "Senders with the highest message volume in this workspace.",
        insight: {
          kind: "top",
        },
      },
      {
        id: "sender-attributes-frequency",
        label: "Frequency",
        description: "Segment senders by how often they appear in your ingest.",
        children: [
          {
            id: FIRST_TIME_SENDER_NODE_ID,
            label: "First-time senders",
            description: "Senders whose first message appeared in this workspace.",
            insight: {
              kind: "first-time",
            },
          },
          {
            id: "sender-attributes-frequency-dormant",
            label: "Dormant senders",
            description: "Senders who have gone quiet for a year or more.",
            insight: {
              kind: "dormant",
              inactiveDays: DEFAULT_DORMANT_INACTIVE_DAYS,
            },
          },
        ],
      },
      {
        id: "sender-attributes-role-based",
        label: "Role-based address",
        description: "Identify shared inboxes and functional aliases.",
        insight: {
          kind: "address-group",
          addresses: roleBasedAddresses,
        },
        children: roleBasedGroupsEntries.map(([category, addresses]) => ({
          id: `sender-role-${slugify(category)}`,
          label: category,
          insight: {
            kind: "address-group",
            addresses,
          },
          children: createAddressNodes(`sender-role-${slugify(category)}`, addresses),
        })),
      },
      {
        id: "sender-attributes-generic",
        label: "Generic sender",
        description: "Track broadly automated or transactional senders.",
        insight: {
          kind: "address-group",
          addresses: genericAddresses,
        },
        children: genericGroupsEntries.map(([category, addresses]) => ({
          id: `sender-generic-${slugify(category)}`,
          label: category,
          insight: {
            kind: "address-group",
            addresses,
          },
          children: createAddressNodes(`sender-generic-${slugify(category)}`, addresses),
        })),
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
    senderAttributesNode,
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

type SenderInsightViewProps = {
  insight: FilterNodeInsight;
  limit?: number;
};

const EMPTY_INSIGHT: SenderInsight = {
  stats: {
    unique_senders: 0,
    total_emails: 0,
    latest_ts: null,
  },
  senders: [],
  emails: [],
};

function SenderInsightView({ insight, limit = 50 }: SenderInsightViewProps) {
  const [data, setData] = useState<SenderInsight>(EMPTY_INSIGHT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"stats" | "emails">("stats");
  const [reloadKey, setReloadKey] = useState(0);

  const trimmedAddresses = useMemo(() => {
    if (insight.kind !== "address-group") {
      return [];
    }
    return insight.addresses
      .map(address => address.trim())
      .filter(address => address.length > 0);
  }, [insight]);

  const inactiveDays =
    insight.kind === "dormant"
      ? insight.inactiveDays ?? DEFAULT_DORMANT_INACTIVE_DAYS
      : DEFAULT_DORMANT_INACTIVE_DAYS;

  const addressesKey = useMemo(
    () =>
      trimmedAddresses
        .map(address => address.toLowerCase())
        .sort()
        .join("|"),
    [trimmedAddresses],
  );

  const insightKey = useMemo(() => {
    switch (insight.kind) {
      case "top":
        return `top-${limit}`;
      case "first-time":
        return "first-time";
      case "dormant":
        return `dormant-${inactiveDays}`;
      case "address-group":
        return `address-${addressesKey}`;
      default:
        return "unknown";
    }
  }, [insight.kind, addressesKey, inactiveDays, limit]);

  useEffect(() => {
    setActiveTab("stats");
    setReloadKey(0);
  }, [insightKey]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const cleanedAddresses =
        insight.kind === "address-group" ? trimmedAddresses : [];

      setLoading(true);
      setError(null);
      try {
        let insightData: SenderInsight;
        if (insight.kind === "top") {
          insightData = await getTopSenderInsights(limit);
        } else if (insight.kind === "first-time") {
          insightData = await getFirstTimeSenderInsights(limit);
        } else if (insight.kind === "dormant") {
          insightData = await getDormantSenderInsights(limit, inactiveDays);
        } else if (insight.kind === "address-group") {
          if (cleanedAddresses.length === 0) {
            insightData = EMPTY_INSIGHT;
          } else {
            insightData = await getSenderInsightsForAddresses(cleanedAddresses, limit);
          }
        } else {
          insightData = EMPTY_INSIGHT;
        }
        if (!cancelled) {
          setData(insightData);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Sender insight load failed", err);
          setError("Unable to load sender insights. Ensure the MailLens worker is running.");
          setData(EMPTY_INSIGHT);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [insight.kind, insightKey, limit, trimmedAddresses, inactiveDays, reloadKey]);

  const matchingPrefixes =
    insight.kind === "address-group" && trimmedAddresses.length
      ? trimmedAddresses.join(", ")
      : "";

  const hasEmails = data.emails.length > 0;
  const hasSenders = data.senders.length > 0;
  const supportsEmails = insight.kind !== "top";
  const statsConfig = (() => {
    switch (insight.kind) {
      case "top":
        return {
          sendersLabel: "Top senders",
          emailsLabel: "Total emails",
        };
      case "first-time":
        return {
          sendersLabel: "First-time senders",
          emailsLabel: "Emails received",
        };
      case "dormant":
        return {
          sendersLabel: "Dormant senders",
          emailsLabel: "Historical emails",
        };
      default:
        return {
          sendersLabel: "Matching senders",
          emailsLabel: "Emails received",
        };
    }
  })();

  const panelTitles = (() => {
    switch (insight.kind) {
      case "top":
        return {
          stats: "Top senders",
          emails: "",
        };
      case "first-time":
        return {
          stats: "First-time senders",
          emails: "Emails from first-time senders",
        };
      case "dormant":
        return {
          stats: "Dormant senders",
          emails: "Historical emails from dormant senders",
        };
      case "address-group":
      default:
        return {
          stats: "Sender breakdown",
          emails: "Recent matching emails",
        };
    }
  })();

  const helperNote = (() => {
    switch (insight.kind) {
      case "top":
        return "Sorted by message volume. Showing the top 50 senders.";
      case "first-time":
        return "Senders whose first message appeared in this workspace.";
      case "dormant":
        return `Senders with no activity in the last ${inactiveDays} days.`;
      case "address-group":
        return matchingPrefixes ? `Matching prefixes: ${matchingPrefixes}` : "";
      default:
        return "";
    }
  })();

  const emptySendersMessage =
    insight.kind === "first-time"
      ? "No first-time senders found yet."
      : insight.kind === "dormant"
        ? "No dormant senders detected."
        : insight.kind === "top"
          ? "No senders found yet."
          : "No matching senders found.";

  const emptyEmailsMessage =
    insight.kind === "first-time"
      ? "No emails from first-time senders found."
      : insight.kind === "dormant"
        ? "No historical emails for dormant senders."
        : insight.kind === "top"
          ? "Email list unavailable for top senders view."
          : "No emails matched this sender group.";

  const tabButtonClass = (tab: "stats" | "emails") =>
    `btn ${activeTab === tab ? "btn-secondary" : "btn-ghost"}`;

  if (loading) {
    return (
      <>
        <div
          className="dashboard-tablist"
          style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}
        >
          <button type="button" className="btn btn-secondary" disabled>
            Stats
          </button>
          {supportsEmails ? (
            <button type="button" className="btn btn-ghost" disabled>
              Emails
            </button>
          ) : null}
        </div>
        <section className="dashboard-panels">
          <div className="dashboard-panel">
            <div className="dashboard-panel-header">
              <h2>Loading sender insight…</h2>
            </div>
            <p className="wizard-muted">
              Fetching data from the MailLens worker. This may take a moment for large mailboxes.
            </p>
          </div>
        </section>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div
          className="dashboard-tablist"
          style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}
        >
          <button type="button" className="btn btn-secondary" disabled>
            Stats
          </button>
          {supportsEmails ? (
            <button type="button" className="btn btn-ghost" disabled>
              Emails
            </button>
          ) : null}
        </div>
        <section className="dashboard-panels">
          <div className="dashboard-panel">
            <div className="dashboard-panel-header">
              <h2>Insights unavailable</h2>
            </div>
            <p className="dashboard-error">{error}</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setReloadKey(prev => prev + 1)}
            >
              Retry
            </button>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div
        className="dashboard-tablist"
        role="tablist"
        aria-label="Sender insight views"
        style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}
      >
        <button
          type="button"
          className={tabButtonClass("stats")}
          role="tab"
          aria-selected={activeTab === "stats"}
          onClick={() => setActiveTab("stats")}
        >
          Stats
        </button>
        {supportsEmails ? (
          <button
            type="button"
            className={tabButtonClass("emails")}
            role="tab"
            aria-selected={activeTab === "emails"}
            onClick={() => setActiveTab("emails")}
          >
            Emails
          </button>
        ) : null}
      </div>
      {activeTab === "stats" || !supportsEmails ? (
        <>
          <section className="stats-grid">
            {data.stats.total_emails > 0 || data.stats.unique_senders > 0 ? (
              <>
                <StatCard label={statsConfig.sendersLabel} value={formatNumber(data.stats.unique_senders)} />
                <StatCard label={statsConfig.emailsLabel} value={formatNumber(data.stats.total_emails)} />
                <StatCard label="Latest activity" value={formatTimestamp(data.stats.latest_ts)} />
              </>
            ) : (
              <div className="dashboard-placeholder">No matching sender data yet.</div>
            )}
          </section>
          <section className="dashboard-panels">
            <div className="dashboard-panel">
              <div className="dashboard-panel-header">
                <h2>{panelTitles.stats}</h2>
              </div>
              {helperNote ? (
                <p className="wizard-muted">{helperNote}</p>
              ) : null}
              {hasSenders ? (
                <ul className="dashboard-email-list">
                  {data.senders.map((sender, index) => (
                    <li
                      key={
                        sender.from_email
                          ? `sender-${sender.from_email}`
                          : `sender-${index}`
                      }
                    >
                      <p className="email-subject">{sender.from_email || "Unknown sender"}</p>
                      <p className="email-meta">
                        <span>Latest: {formatTimestamp(sender.latest_ts)}</span>
                        <span>Total emails: {formatNumber(sender.total_emails)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="wizard-muted">{emptySendersMessage}</p>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="dashboard-panels">
          <div className="dashboard-panel">
            <div className="dashboard-panel-header">
              <h2>{panelTitles.emails}</h2>
            </div>
            {helperNote ? (
              <p className="wizard-muted">{helperNote}</p>
            ) : null}
            {hasEmails ? (
              <ul className="dashboard-email-list">
                {data.emails.map(email => (
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
            ) : (
              <p className="wizard-muted">{emptyEmailsMessage}</p>
            )}
          </div>
        </section>
      )}
    </>
  );
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
      {(selected) => {
        const selectedInsight = selected?.insight;
        return (
          <div className="dashboard">
            {selectedInsight ? (
              <SenderInsightView insight={selectedInsight} />
            ) : (
              <>
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
              </>
            )}
          </div>
        );
      }}
    </DashboardShell>
  );
}
