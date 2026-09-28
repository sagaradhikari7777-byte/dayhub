"use client";
import { useStore } from "@/lib/store";
import { day, money } from "@/lib/model";
export function ExpenseSummary({ expanded = false }: { expanded?: boolean }) {
  const { entries, settings } = useStore();
  const today = day(),
    month = today.slice(0, 7),
    start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const week = day(start);
  const expenses = entries.filter((e) => e.kind === "expenses"),
    sum = (predicate: (d: string) => boolean) =>
      expenses
        .filter((e) => predicate(e.date || ""))
        .reduce((s, e) => s + (e.amount || 0), 0);
  const monthly = expenses.filter(
    (e) => e.date?.startsWith(month) && e.date <= today,
  );
  const groups = monthly.reduce<Record<string, number>>(
    (g, e) => ({
      ...g,
      [e.category || "Other"]:
        (g[e.category || "Other"] || 0) + (e.amount || 0),
    }),
    {},
  );
  const total = sum((d) => d.startsWith(month) && d <= today);
  return (
    <>
      <div className="spending-stats">
        <div>
          <small>Today</small>
          <strong>
            {money(
              sum((d) => d === today),
              settings.currency,
            )}
          </strong>
        </div>
        <div>
          <small>This week</small>
          <strong>
            {money(
              sum((d) => d >= week && d <= today),
              settings.currency,
            )}
          </strong>
        </div>
        <div>
          <small>This month</small>
          <strong>{money(total, settings.currency)}</strong>
        </div>
      </div>
      <div className="spend-bar" aria-label="Monthly category breakdown">
        {Object.entries(groups)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v], i) => (
            <span
              className={`bar-${i % 5}`}
              key={k}
              style={{ width: `${total ? (v / total) * 100 : 0}%` }}
              title={`${k}: ${money(v, settings.currency)}`}
            />
          ))}
      </div>
      <div className="category-legend">
        {Object.entries(groups)
          .sort((a, b) => b[1] - a[1])
          .slice(0, expanded ? 50 : 3)
          .map(([k, v], i) => (
            <span key={k}>
              <i className={`bar-${i % 5}`} />
              {k}
              <b>{money(v, settings.currency)}</b>
            </span>
          ))}
      </div>
      {!expenses.length && (
        <p className="muted">Your first expense starts the picture.</p>
      )}
    </>
  );
}
