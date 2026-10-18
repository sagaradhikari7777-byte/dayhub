"use client";

import { LogOut, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { roundSizes } from "@/lib/bracket";
import type { Format } from "@/lib/types";
import type { Actions } from "./app";
import { request } from "./api";

export function Admin(actions: Actions) {
  const { state, notify } = actions;
  const reload = async () => actions.setState(await request("/api/tournament"));

  if (!state.admin) return <Login onDone={reload} />;

  return (
    <div className="stack">
      <section className="card section-head">
        <p>
          Signed in as <strong>{state.admin}</strong>
        </p>
        <button
          className="btn sm"
          onClick={async () => {
            await request("/api/admin/session", { method: "DELETE" });
            await reload();
            notify("Signed out");
          }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </section>
      <Settings {...actions} />
      <BracketControls {...actions} />
      <section className="card">
        <h2>Setup status</h2>
        <ul className="plain small">
          <li>
            Clash of Clans API:{" "}
            {state.apiConfigured ? (
              <span className="ok-text">connected</span>
            ) : (
              <span className="error-text">
                not configured, so players register manually
              </span>
            )}
          </li>
          <li>
            Storage:{" "}
            {state.storage === "upstash"
              ? "Upstash Redis"
              : "local file (dev only)"}
          </li>
        </ul>
      </section>
      <section className="card danger-zone">
        <h2>Start over</h2>
        <p className="muted small">
          Removes every player, the bracket and all results. Settings stay.
        </p>
        <button
          className="btn danger"
          onClick={async () => {
            if (
              prompt("Type RESET to delete all players and results") ===
                "RESET" &&
              (await actions.admin({ type: "reset" }))
            )
              notify("Tournament reset");
          }}
        >
          Reset tournament
        </button>
      </section>
    </div>
  );
}

function Login({ onDone }: { onDone: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="card narrow">
      <h2>Admin sign-in</h2>
      <p className="muted small">For organisers who enter match results.</p>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await request("/api/admin/session", { body: { password } });
            await onDone();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="error-text small">{error}</p>}
        <button className="btn primary" disabled={busy || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}

function Settings({ state, admin, notify }: Actions) {
  const t = state.tournament;
  const [name, setName] = useState(t.name);
  const [max, setMax] = useState(String(t.maxPlayers));
  useEffect(() => setName(t.name), [t.name]);
  useEffect(() => setMax(String(t.maxPlayers)), [t.maxPlayers]);
  const [clan, setClan] = useState(t.clanTag);
  useEffect(() => setClan(t.clanTag), [t.clanTag]);
  const hasResults = Object.keys(t.results).length > 0;

  return (
    <section className="card stack">
      <h2>Tournament settings</h2>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await admin({
              type: "settings",
              name,
              maxPlayers: Number(max),
              clanTag: clan,
            })
          )
            notify("Settings saved");
        }}
      >
        <label className="field grow">
          <span>Name</span>
          <input
            className="input"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Clan tag</span>
          <input
            className="input num"
            value={clan}
            autoCapitalize="characters"
            autoCorrect="off"
            onChange={(e) => setClan(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Max players</span>
          <input
            className="input num"
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </label>
        <button className="btn">Save</button>
      </form>
      <div className="field">
        <span>Match format</span>
        <div className="segmented">
          {([1, 3, 5] as Format[]).map((f) => (
            <button
              key={f}
              className={t.format === f ? "active" : ""}
              disabled={hasResults && t.format !== f}
              onClick={() => admin({ type: "settings", format: f })}
            >
              {f === 1 ? "Single game" : `Best of ${f}`}
            </button>
          ))}
        </div>
        {hasResults && (
          <span className="muted small">Locked while results are entered.</span>
        )}
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={t.registrationOpen}
          disabled={Boolean(t.bracket)}
          onChange={(e) =>
            admin({ type: "settings", registrationOpen: e.target.checked })
          }
        />
        <span>Registration open to players</span>
      </label>
    </section>
  );
}

function BracketControls({ state, admin, notify }: Actions) {
  const t = state.tournament;
  const sizes = roundSizes(t.players.length);
  if (t.bracket)
    return (
      <section className="card stack">
        <h2>Bracket</h2>
        <p className="muted small">
          Drawn {new Date(t.bracket.createdAt).toLocaleString()} with{" "}
          {t.bracket.order.length} players. Open a match on the Bracket tab to
          enter its result.
        </p>
        <button
          className="btn danger"
          onClick={async () => {
            if (
              confirm(
                "Delete the bracket and every result? Players stay registered.",
              ) &&
              (await admin({ type: "deleteBracket" }))
            )
              notify("Bracket deleted");
          }}
        >
          Delete bracket
        </button>
      </section>
    );
  return (
    <section className="card stack">
      <h2>Draw the bracket</h2>
      <p className="muted small">
        {t.players.length < 2
          ? "At least 2 players are needed."
          : `${t.players.length} players → ${sizes.join(" → ")} matches per round. ${
              t.players.length % 2 ? "One player gets a bye in round 1. " : ""
            }Drawing closes registration.`}
      </p>
      <div className="actions">
        <button
          className="btn primary"
          disabled={t.players.length < 2}
          onClick={async () => {
            if (
              confirm("Draw a random bracket now?") &&
              (await admin({ type: "createBracket", shuffle: true }))
            )
              notify("Bracket drawn");
          }}
        >
          <Shuffle size={16} /> Random draw
        </button>
        <button
          className="btn"
          disabled={t.players.length < 2}
          onClick={async () => {
            if (
              confirm("Pair players in registration order (1 v 2, 3 v 4…)?") &&
              (await admin({ type: "createBracket", shuffle: false }))
            )
              notify("Bracket drawn");
          }}
        >
          Registration order
        </button>
      </div>
    </section>
  );
}
