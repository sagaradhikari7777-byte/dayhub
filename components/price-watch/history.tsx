"use client";
import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Entry } from "@/types";
import { money, priceFacts } from "@/lib/model";
import { useStore } from "@/lib/store";
export default function PriceHistoryChart({ entry: e }: { entry: Entry }) {
  const [range, setRange] = useState("ALL");
  const { settings } = useStore();
  const days: Record<string, number> = {
    "7D": 7,
    "30D": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
    ALL: Infinity,
  };
  const h = e.history || [];
  const selected = h.filter(
    (p) =>
      Date.now() - new Date(p.recorded_at).getTime() <= days[range] * 86400000,
  );
  const data = (selected.length ? selected : h.slice(-1)).map((p) => ({
    ...p,
    date: new Date(p.recorded_at).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
    }),
  }));
  const f = priceFacts(e);
  return (
    <>
      <div className="section-title">
        <h2>Price history</h2>
        <span className="muted">{h.length} records</span>
      </div>
      <div className="segmented">
        {Object.keys(days).map((r) => (
          <button
            key={r}
            className={range === r ? "active" : ""}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>
      <div
        className="chart"
        role="img"
        aria-label={`Price history. Lowest ${money(f.low, settings.currency)}, highest ${money(f.high, settings.currency)}, current ${money(e.price, settings.currency)}`}
      >
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart
            data={data}
            margin={{ top: 20, right: 15, bottom: 5, left: -20 }}
          >
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#75e6d1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#75e6d1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              stroke="#8492a9"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={["auto", "auto"]}
              stroke="#8492a9"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--panel-solid)",
                border: "1px solid var(--border)",
                borderRadius: 14,
              }}
              formatter={(v) => [money(Number(v), settings.currency), "Price"]}
            />
            <Area
              type="stepAfter"
              dataKey="price"
              stroke="#61ccb8"
              strokeWidth={3}
              fill="url(#priceGradient)"
              dot={{ r: 4, fill: "#75e6d1" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="metric-grid">
        {[
          ["Lowest ever", f.low],
          ["Highest", f.high],
          ["Average", f.average],
          ["Current", e.price || 0],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{money(Number(value), settings.currency)}</strong>
          </div>
        ))}
      </div>
      <details className="history-table">
        <summary>View recorded prices</summary>
        {data.map((p) => (
          <div className="mini-row" key={p.id}>
            <span>{new Date(p.recorded_at).toLocaleString()}</span>
            <strong>{money(p.price, settings.currency)}</strong>
          </div>
        ))}
      </details>
    </>
  );
}
