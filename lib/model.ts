import { Entry, Kind, PricePoint, Settings, defaults } from "@/types";
export const uid = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
export function day(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
export function offset(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return day(d);
}
export const money = (n: number = 0, currency = "AUD") =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
export function createEntry(kind: Kind, data: Partial<Entry> = {}): Entry {
  const now = new Date().toISOString();
  return {
    id: uid(),
    kind,
    title: "",
    version: 0,
    created_at: now,
    updated_at: now,
    ...data,
  };
}
export function nextDate(date: string, recurrence: string, customDays = 1) {
  const d = new Date(date + "T12:00:00");
  const original = d.getDate();
  if (["monthly", "quarterly", "yearly"].includes(recurrence)) {
    d.setDate(1);
    d.setMonth(
      d.getMonth() +
        ({ monthly: 1, quarterly: 3, yearly: 12 }[recurrence] || 1),
    );
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(original, last));
  } else
    d.setDate(
      d.getDate() +
        ({ daily: 1, weekly: 7, fortnightly: 14 }[recurrence] || customDays),
    );
  return day(d);
}
export function occurs(e: Entry, date: string) {
  if (!e.date) return false;
  if (e.date === date) return true;
  if (
    e.kind !== "events" ||
    !e.recurrence ||
    e.recurrence === "none" ||
    e.date > date
  )
    return false;
  let next = e.date;
  for (let i = 0; i < 10000 && next < date; i++)
    next = nextDate(next, e.recurrence, e.customDays);
  return next === date;
}
export const billStatus = (e: Entry) =>
  e.paid
    ? "Paid"
    : e.date && e.date < day()
      ? "Overdue"
      : e.date === day()
        ? "Due today"
        : "Upcoming";
export function priceFacts(e: Entry) {
  const h = e.history || [];
  const prices = h.map((p) => p.price);
  const previous =
    [...h].reverse().find((p) => p.price !== (e.price || 0))?.price ??
    e.price ??
    0;
  const current = e.price || 0;
  const changedAt = [...h]
    .reverse()
    .find((p, i, a) => a[i + 1] && p.price !== a[i + 1].price)?.recorded_at;
  return {
    changedAt,
    previous,
    drop: previous - current,
    percent: previous ? Math.round(((previous - current) / previous) * 100) : 0,
    low: prices.length ? Math.min(...prices) : current,
    high: prices.length ? Math.max(...prices) : current,
    average: prices.length
      ? prices.reduce((a, b) => a + b, 0) / prices.length
      : current,
    target: !!e.targetPrice && current <= e.targetPrice,
    newLow: h.length > 1 && current < Math.min(...prices.slice(0, -1)),
  };
}
export function alertReason(before: Entry, after: Entry): string | null {
  const old = before.price ?? 0,
    now = after.price ?? 0,
    h = before.history || [];
  const target =
    !!after.targetPrice && now <= after.targetPrice && old > after.targetPrice;
  const low = h.length > 0 && now < Math.min(...h.map((p) => p.price));
  const restock =
    before.availability === "Out of stock" && after.availability === "In stock";
  const choice = after.alert || "Any price drop";
  if (target) return "Target reached";
  if (choice === "Back in stock" && restock) return "Back in stock";
  if (choice === "New lowest price" && low) return "New lowest price";
  if (choice === "Any price drop" && now < old) return "Price drop";
  if (choice === "10% price drop" && now <= old * 0.9 && now < old)
    return "10% price drop";
  if (choice === "20% price drop" && now <= old * 0.8 && now < old)
    return "20% price drop";
  return null;
}
export function briefing(entries: Entry[], s: Settings) {
  const today = day(),
    parts: string[] = [];
  const events = entries
    .filter((e) => e.kind === "events" && occurs(e, today))
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  if (events[0])
    parts.push(
      `${events[0].title}${events[0].time ? " at " + formatTime(events[0].time, s) : ""}`,
    );
  const bills = entries.filter(
    (e) => e.kind === "bills" && !e.paid && e.date && e.date <= today,
  );
  if (bills.length)
    parts.push(
      `${bills.length} bill${bills.length > 1 ? "s" : ""} to pay (${money(
        bills.reduce((a, e) => a + (e.amount || 0), 0),
        s.currency,
      )})`,
    );
  const deliveries = entries.filter(
    (e) =>
      e.kind === "deliveries" && e.date === today && e.status !== "Delivered",
  );
  if (deliveries.length) parts.push(`${deliveries.length} delivery expected`);
  const drops = entries.filter(
    (e) =>
      e.kind === "products" &&
      e.status !== "Purchased" &&
      e.status !== "Stopped" &&
      priceFacts(e).drop > 0 &&
      day(new Date(priceFacts(e).changedAt || 0)) === today,
  );
  if (drops.length)
    parts.push(
      `${drops.length} price drop${drops.length > 1 ? "s" : ""} to explore`,
    );
  return parts.length
    ? `On your radar: ${parts.join(", ")}.`
    : "A little room to breathe. Your day looks clear — add something you want to make time for.";
}
export function formatTime(t: string, s: Settings = defaults) {
  if (!t) return "Anytime";
  const [h, m] = t.split(":").map(Number);
  return s.timeFormat === "24"
    ? t
    : `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
export function relativeDate(date?: string, s?: Settings) {
  if (!date) return "No date";
  if (date === day()) return "Today";
  if (date === offset(1)) return "Tomorrow";
  if (date < day()) return "Overdue";
  if (s?.dateFormat === "MM/DD/YYYY")
    return `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`;
  if (s?.dateFormat === "DD/MM/YYYY")
    return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  return new Date(date + "T12:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}
export function point(e: Entry): PricePoint {
  return {
    id: uid(),
    price: e.price || 0,
    availability: e.availability || "Unknown",
    retailer: e.retailer || "",
    recorded_at: new Date().toISOString(),
  };
}
