const API_BASE = "http://127.0.0.1:8000";

type HttpMethod = "GET" | "POST";

export interface ApiError extends Error {
  status?: number;
  detail?: unknown;
}

export interface ProgressSnapshot {
  kind?: string;
  total: number;
  done: number;
  status: "idle" | "running" | "done" | "cancelled" | "error";
  note?: string;
  error?: string;
  running?: boolean;
}

export interface StatsSummary {
  total: number;
  flagged: number;
  unread: number;
  junk: number;
  unique_senders: number;
  latest_ts?: number | null;
}

export interface EmailSummary {
  id: string | number;
  date_ts: number | null;
  from_email: string | null;
  subject: string | null;
  snippet?: string | null;
}

interface RequestOptions extends RequestInit {
  method?: HttpMethod;
}

export interface SenderInsightStats {
  unique_senders: number;
  total_emails: number;
  latest_ts?: number | null;
}

export interface SenderInsightSender {
  from_email: string | null;
  total_emails: number;
  latest_ts: number | null;
}

export interface SenderInsight {
  stats: SenderInsightStats;
  senders: SenderInsightSender[];
  emails: EmailSummary[];
}

async function request<T>(endpoint: string, init: RequestOptions = {}): Promise<T> {
  const { headers, ...rest } = init;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "content-type": init.body ? "application/json" : undefined,
      ...headers,
    },
    ...rest,
  });

  if (!response.ok) {
    const error: ApiError = new Error(`Request failed: ${response.status}`);
    error.status = response.status;
    try {
      error.detail = await response.json();
    } catch {
      error.detail = await response.text();
    }
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function initDB(): Promise<void> {
  await request("/db/init", { method: "POST" });
}

export async function startIngest(path: string): Promise<void> {
  await request("/ingest/start", {
    method: "POST",
    body: JSON.stringify({ source: "emlx", path }),
  });
}

export async function cancelIngest(): Promise<void> {
  await request("/cancel", { method: "POST" });
}

export async function getProgress(): Promise<ProgressSnapshot> {
  return request<ProgressSnapshot>("/progress", { method: "GET" });
}

export async function getStats(): Promise<StatsSummary> {
  return request<StatsSummary>("/stats", { method: "GET" });
}

export async function getEmails(limit = 10): Promise<EmailSummary[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  return request<EmailSummary[]>(`/emails?${query.toString()}`, { method: "GET" });
}

export async function getFirstTimeSenderInsights(limit = 50): Promise<SenderInsight> {
  const query = new URLSearchParams({ limit: String(limit) });
  return request<SenderInsight>(`/insights/senders/first-time?${query.toString()}`, { method: "GET" });
}

export async function getDormantSenderInsights(
  limit = 50,
  inactiveDays = 365,
): Promise<SenderInsight> {
  const query = new URLSearchParams({
    limit: String(limit),
    inactive_days: String(inactiveDays),
  });
  return request<SenderInsight>(`/insights/senders/dormant?${query.toString()}`, {
    method: "GET",
  });
}

export async function getSenderInsightsForAddresses(
  addresses: string[],
  limit = 50,
): Promise<SenderInsight> {
  const query = new URLSearchParams({ limit: String(limit) });
  for (const address of addresses) {
    query.append("address", address);
  }
  return request<SenderInsight>(`/insights/senders/by-address?${query.toString()}`, { method: "GET" });
}

export async function getTopSenderInsights(limit = 50): Promise<SenderInsight> {
  const query = new URLSearchParams({ limit: String(limit) });
  return request<SenderInsight>(`/insights/senders/top?${query.toString()}`, { method: "GET" });
}
