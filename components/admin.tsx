"use client";

import { LogOut, Plus, RefreshCw, Shuffle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { roundSizes } from "@/lib/bracket";
import { StatusPill } from "./events";
import type { Format, Tournament } from "@/lib/types";
import type { Actions } from "./app";
import { request } from "./api";

export function Admin(actions: Actions) {
  const { state, notify } = actions;
  const events = state.hub.events;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = events.find((e) => e.id === selectedId) ?? events[0] ?? null;
  const reload = async () => actions.setState(await request("/api/tournament"));

  if (!state.admin) return <Login onDone={reload} />;

  // Event-level actions carry the selected event's id.
  const eventAdmin = (body: object) =>
    actions.admin({ ...body, eventId: selected!.id });

  return (
    <div className="page">
      <div className="page-head row-between">
        <div>
          <h1 className="display">Admin</h1>
          <p className="muted">
            Signed in as <strong>{state.admin}</strong>
          </p>
        </div>
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
      </div>

      <section className="panel stack">
        <div className="row-between">
          <h2 className="display">Events</h2>
          <NewEvent
            onCreate={async (body, label) => {
              if (await actions.admin(body)) {
                notify(`${label} created`);
                return true;
              }
              return false;
            }}
          />
        </div>
        {events.length ? (
          <div className="event-tabs" role="tablist">
            {events.map((e) => (
              <button
                key={e.id}
                role="tab"
                aria-selected={selected?.id === e.id}
                className={selected?.id === e.id ? "active" : ""}
                onClick={() => setSelectedId(e.id)}
              >
                {e.name}
                <span className="muted small">{e.players.length} players</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">No events yet. Create one to open sign-ups.</p>
        )}
      </section>

      {selected && (
        <>
          <EventSettings
            key={selected.id}
            event={selected}
            admin={eventAdmin}
            notify={notify}
          />
          {selected.kind === "cwl" ? (
            <CwlSync event={selected} {...actions} />
          ) : (
            <BracketControls
              event={selected}
              admin={eventAdmin}
              notify={notify}
            />
          )}
          <section className="panel danger-zone stack">
            <h2 className="display">Danger zone</h2>
            <div className="actions">
              <button
                className="btn danger"
                onClick={async () => {
                  if (
                    prompt(
                      `Type RESET to remove every player and result from ${selected.name}`,
                    ) === "RESET" &&
                    (await eventAdmin({ type: "reset" }))
                  )
                    notify(`${selected.name} reset`);
                }}
              >
                Reset players &amp; results
              </button>
              <button
                className="btn danger"
                onClick={async () => {
                  if (
                    prompt(
                      `Type DELETE to delete ${selected.name} for good`,
                    ) === "DELETE" &&
                    (await actions.admin({
                      type: "deleteEvent",
                      eventId: selected.id,
                    }))
                  ) {
                    setSelectedId(null);
                    notify("Event deleted");
                  }
                }}
              >
                <Trash2 size={16} /> Delete event
              </button>
            </div>
          </section>
        </>
      )}

      <ClanAndRules {...actions} />

      <section className="panel">
        <h2 className="display">Setup status</h2>
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
    </div>
  );
}

function Login({ onDone }: { onDone: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="page narrow">
      <section className="panel stack">
        <div>
          <h1 className="display">Admin sign-in</h1>
          <p className="muted small">For organisers who run events.</p>
        </div>
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
    </div>
  );
}

function NewEvent({
  onCreate,
}: {
  onCreate: (body: object, label: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"knockout" | "cwl">("knockout");
  const [name, setName] = useState("");
  const [season, setSeason] = useState(nextSeason);
  if (!open)
    return (
      <button className="btn primary sm" onClick={() => setOpen(true)}>
        <Plus size={16} /> New event
      </button>
    );
  return (
    <form
      className="new-event panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok =
          kind === "cwl"
            ? await onCreate({ type: "createCwlEvent", season }, "CWL event")
            : await onCreate({ type: "createEvent", name }, name);
        if (ok) {
          setName("");
          setOpen(false);
        }
      }}
    >
      <div className="segmented">
        <button
          type="button"
          className={kind === "knockout" ? "active" : ""}
          onClick={() => setKind("knockout")}
        >
          Knockout
        </button>
        <button
          type="button"
          className={kind === "cwl" ? "active" : ""}
          onClick={() => setKind("cwl")}
        >
          CWL
        </button>
      </div>
      {kind === "knockout" ? (
        <input
          className="input"
          placeholder="Event name"
          autoFocus
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      ) : (
        <label className="field">
          <span>
            CWL season. No sign-up needed: this is created automatically when
            CWL starts. Create it early only to set the prize and rules.
          </span>
          <input
            className="input"
            type="month"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          />
        </label>
      )}
      <div className="actions">
        <button
          className="btn primary sm"
          disabled={kind === "knockout" ? !name.trim() : !season}
        >
          Create
        </button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// CWL starts at the beginning of each month, so default to the next one.
function nextSeason() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type EventAdmin = (body: object) => Promise<boolean>;
type Notify = Actions["notify"];

function EventSettings({
  event: t,
  admin,
  notify,
}: {
  event: Tournament;
  admin: EventAdmin;
  notify: Notify;
}) {
  const initial = () => ({
    name: t.name,
    description: t.description,
    startsAt: t.startsAt ?? "",
    prize: t.prize,
    maxPlayers: String(t.maxPlayers),
    rules: t.rules.join("\n"),
  });
  const [form, setForm] = useState(initial);
  // While you're editing, background refreshes must not overwrite the form.
  // Otherwise pick up changes saved elsewhere, e.g. by the other admin.
  const [dirty, setDirty] = useState(false);
  useEffect(
    () => {
      if (!dirty) setForm(initial());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dirty,
      t.name,
      t.description,
      t.startsAt,
      t.prize,
      t.maxPlayers,
      t.rules.join("\n"),
    ],
  );
  const hasResults = Object.keys(t.results).length > 0;
  const set = (patch: Partial<ReturnType<typeof initial>>) => {
    setDirty(true);
    setForm({ ...form, ...patch });
  };

  return (
    <section className="panel stack">
      <div className="row-between">
        <h2 className="display">{t.name}</h2>
        <StatusPill event={t} />
      </div>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await admin({
              type: "settings",
              name: form.name,
              description: form.description,
              startsAt: form.startsAt || null,
              prize: form.prize,
              maxPlayers: Number(form.maxPlayers),
              rules: form.rules
                .split("\n")
                .map((r) => r.trim())
                .filter(Boolean),
            })
          ) {
            setDirty(false);
            notify("Event saved");
          }
        }}
      >
        <label className="field span-2">
          <span>Name</span>
          <input
            className="input"
            value={form.name}
            maxLength={60}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label className="field span-2">
          <span>Description</span>
          <textarea
            className="input"
            rows={2}
            maxLength={500}
            placeholder="e.g. 1v1 knockout, TH16+ only"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Start date</span>
          <input
            className="input"
            type="date"
            value={form.startsAt}
            onChange={(e) => set({ startsAt: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Prize</span>
          <input
            className="input"
            placeholder="e.g. 4000 RS / $40"
            maxLength={80}
            value={form.prize}
            onChange={(e) => set({ prize: e.target.value })}
          />
        </label>
        {t.kind === "knockout" && (
          <label className="field">
            <span>Max players</span>
            <input
              className="input"
              inputMode="numeric"
              value={form.maxPlayers}
              onChange={(e) => set({ maxPlayers: e.target.value })}
            />
          </label>
        )}
        <label className="field span-2">
          <span>
            Event rules (one per line, shown on the event's Rules tab)
          </span>
          <textarea
            className="input"
            rows={6}
            value={form.rules}
            onChange={(e) => set({ rules: e.target.value })}
          />
        </label>
        <div className="field form-submit span-2">
          <button className="btn primary">Save event</button>
        </div>
      </form>
      {t.kind === "knockout" && (
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
            <span className="muted small">
              Locked while results are entered.
            </span>
          )}
        </div>
      )}
      {t.kind === "knockout" && (
        <label className="toggle">
          <input
            type="checkbox"
            checked={t.registrationOpen}
            disabled={Boolean(t.bracket)}
            onChange={(e) =>
              admin({ type: "settings", registrationOpen: e.target.checked })
            }
          />
          <span className="toggle-track" aria-hidden />
          <span>Registration open to players</span>
        </label>
      )}
    </section>
  );
}

function BracketControls({
  event: t,
  admin,
  notify,
}: {
  event: Tournament;
  admin: EventAdmin;
  notify: Notify;
}) {
  const sizes = roundSizes(t.players.length);
  if (t.bracket)
    return (
      <section className="panel stack">
        <h2 className="display">Bracket</h2>
        <p className="muted small">
          Drawn {new Date(t.bracket.createdAt).toLocaleString()} with{" "}
          {t.bracket.order.length} players. Open a match on the{" "}
          <a className="link" href={`#event/${t.id}`}>
            event page
          </a>{" "}
          to enter its result.
        </p>
        <div className="actions">
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
        </div>
      </section>
    );
  return (
    <section className="panel stack">
      <h2 className="display">Draw the bracket</h2>
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
              confirm(`Draw a random bracket for ${t.name} now?`) &&
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

function ClanAndRules({ state, admin, notify }: Actions) {
  const hub = state.hub;
  const savedRules = hub.rules.join("\n");
  const [clanTag, setClanTag] = useState(hub.clanTag);
  const [rules, setRules] = useState(savedRules);
  // Same as the event form: don't overwrite what's being typed.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (dirty) return;
    setClanTag(hub.clanTag);
    setRules(savedRules);
  }, [dirty, hub.clanTag, savedRules]);
  return (
    <section className="panel stack">
      <h2 className="display">Clan &amp; rules</h2>
      <label className="toggle">
        <input
          type="checkbox"
          checked={hub.requireVerification}
          onChange={(e) =>
            admin({
              type: "hubSettings",
              requireVerification: e.target.checked,
            })
          }
        />
        <span className="toggle-track" aria-hidden />
        <span>
          Players must prove they own their account (in-game API token) to
          register
        </span>
      </label>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await admin({
              type: "hubSettings",
              clanTag,
              rules: rules
                .split("\n")
                .map((r) => r.trim())
                .filter(Boolean),
            })
          ) {
            setDirty(false);
            notify("Saved");
          }
        }}
      >
        <label className="field">
          <span>Clan tag (the roster players register from)</span>
          <input
            className="input"
            value={clanTag}
            autoCapitalize="characters"
            autoCorrect="off"
            onChange={(e) => {
              setDirty(true);
              setClanTag(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>General clan rules (one per line, shown on the home page)</span>
          <textarea
            className="input"
            rows={8}
            value={rules}
            onChange={(e) => {
              setDirty(true);
              setRules(e.target.value);
            }}
          />
        </label>
        <div>
          <button className="btn primary">Save clan &amp; rules</button>
        </div>
      </form>
    </section>
  );
}

function CwlSync({
  event,
  state,
  setState,
  notify,
}: Actions & { event: Tournament }) {
  const [busy, setBusy] = useState(false);
  const snapshot = event.cwl?.snapshot;
  return (
    <section className="panel stack">
      <h2 className="display">CWL data</h2>
      <p className="muted small">
        {snapshot
          ? `Season ${event.cwl!.season}: ${snapshot.clans.length} clans, ${
              snapshot.rounds.filter((r) => r.length).length
            } rounds loaded. Last updated ${
              event.cwl!.syncedAt
                ? new Date(event.cwl!.syncedAt).toLocaleString()
                : "never"
            }.`
          : `Waiting for season ${event.cwl?.season}. The app checks the game every 20 minutes and fills this event in when CWL starts.`}{" "}
        {!state.apiConfigured && "The Clash of Clans API key isn't set up."}
      </p>
      <div className="actions">
        <button
          className="btn"
          disabled={busy || !state.apiConfigured}
          onClick={async () => {
            setBusy(true);
            try {
              setState(await request("/api/cwl", { body: {} }));
              notify("CWL data checked");
            } catch (e) {
              notify((e as Error).message, "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <RefreshCw size={16} /> {busy ? "Checking…" : "Sync now"}
        </button>
      </div>
    </section>
  );
}
