"use client";

import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { roundSizes } from "@/lib/bracket";
import type { Actions } from "./app";
import { TownHall } from "./register";

export function Players({ state, admin }: Actions) {
  const t = state.tournament;
  const isAdmin = Boolean(state.admin);
  const [filter, setFilter] = useState("");

  const byTownHall = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of t.players) {
      const key = p.townHallLevel ? `TH${p.townHallLevel}` : "?";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts]
      .map(([level, players]) => ({ level, players }))
      .sort((a, b) => sortKey(a.level) - sortKey(b.level));
  }, [t.players]);

  const byClan = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of t.players) {
      const key = p.clanName ?? "No clan";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [t.players]);

  const sizes = roundSizes(t.players.length);
  const shown = t.players.filter((p) =>
    `${p.name} ${p.tag} ${p.clanName ?? ""}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="stack">
      <section className="stats">
        <div className="card stat">
          <span className="muted small">Registered</span>
          <strong>
            {t.players.length}
            <span className="muted"> / {t.maxPlayers}</span>
          </strong>
        </div>
        <div className="card stat">
          <span className="muted small">First-round matches</span>
          <strong>{sizes[0] ?? 0}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Rounds</span>
          <strong>{sizes.length}</strong>
        </div>
      </section>

      {t.players.length > 0 && (
        <section className="card">
          <h2>Players by Town Hall</h2>
          <div className="chart th-chart">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byTownHall} margin={{ left: -24, right: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="level" tickLine={false} axisLine={false} />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fillOpacity: 0.08 }}
                  contentStyle={{
                    background: "var(--panel-solid)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    color: "var(--text)",
                  }}
                />
                <Bar dataKey="players" radius={[6, 6, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {byClan.length > 1 && (
            <ul className="clan-split">
              {byClan.map(([clan, count]) => (
                <li key={clan}>
                  <span>{clan}</span>
                  <span className="bar">
                    <span
                      style={{ width: `${(count / t.players.length) * 100}%` }}
                    />
                  </span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card">
        <div className="section-head">
          <h2>Registered players</h2>
          {t.players.length > 6 && (
            <input
              className="input sm"
              placeholder="Search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
        </div>
        {!t.players.length && (
          <p className="muted">Nobody has registered yet.</p>
        )}
        <ol className="list">
          {shown.map((p) => (
            <li key={p.tag} className="row">
              <TownHall level={p.townHallLevel} />
              <div className="row-main">
                <strong>{p.name}</strong>
                <span className="muted small">
                  {p.tag}
                  {p.clanName ? ` · ${p.clanName}` : ""}
                </span>
              </div>
              {isAdmin && !t.bracket && (
                <button
                  className="icon-btn"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => {
                    if (confirm(`Remove ${p.name} from the tournament?`))
                      admin({ type: "removePlayer", tag: p.tag });
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const sortKey = (level: string) => (level === "?" ? 0 : Number(level.slice(2)));
