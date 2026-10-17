import type { PublicState } from "@/lib/types";

export async function request<T = PublicState>(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(url, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers:
      init?.body === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

export function formatTime(seconds: number | null) {
  if (seconds === null) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Accepts "2:15", "135" or "".
export function parseTime(text: string): number | null | undefined {
  const value = text.trim();
  if (!value) return null;
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(value);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d{1,3}$/.test(value)) return Number(value);
  return undefined;
}
