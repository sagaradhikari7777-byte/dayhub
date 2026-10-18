"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Gift,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import type { ClanSummary, MemberSummary } from "@/lib/coc";
import { formatDate, upcomingEvents } from "@/lib/events";
import type { Hub, PublicState, Tournament } from "@/lib/types";
import type { Actions } from "./app";
import { request } from "./api";
import { roleLabel, useClan } from "./clan";

// Someone about to be registered: from the roster, a clan search, their tag,
// or (without the API) typed in by hand.
type Pending = { tag: string; label: string; body: object };

// Events this person can join right now. Admins can also add to events whose
// registration is closed, as long as the bracket isn't drawn.
function eligibleEvents(hub: Hub, isAdmin: boolean) {
  return upcomingEvents(hub).filter(
    (e) =>
      e.kind !== "cwl" &&
      !e.bracket &&
      (e.registrationOpen || isAdmin) &&
      e.players.length < e.maxPlayers,
  );
}

export function Register({
  state,
  setState,
  notify,
  go,
  eventId,
}: Actions & { eventId: string | null }) {
  const hub = state.hub;
  const isAdmin = Boolean(state.admin);
  const eligible = eligibleEvents(hub, isAdmin);
  const focus = eventId ? hub.events.find((e) => e.id === eventId) : null;
  const [pending, setPending] = useState<Pending | null>(null);

  const eventsOf = (tag: string) =>
    upcomingEvents(hub).filter((e) => e.players.some((p) => p.tag === tag));
  const canJoin = (tag: string) =>
    eligible.some((e) => !e.players.some((p) => p.tag === tag));

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="display">Register</h1>
        <p className="muted">
          {eligible.length
            ? "Find your account, tap Register and pick your event."
            : "No event is taking sign-ups right now. You can still see who has registered."}
        </p>
      </div>
      {focus && (
        <div className="panel focus-banner">
          <span className="muted small">Registering for</span>
          <strong>{focus.name}</strong>
          <a className="link small" href="#register">
            Any event
          </a>
        </div>
      )}

      {state.apiConfigured ? (
        <>
          <ClanRoster
            clanTag={hub.clanTag}
            eventsOf={eventsOf}
            canJoin={eligible.length ? canJoin : null}
            onPick={(m) =>
              setPending({ tag: m.tag, label: m.name, body: { tag: m.tag } })
            }
          />
          {eligible.length > 0 && (
            <details className="panel other-ways">
              <summary>Not in this clan? Register another way</summary>
              <div className="stack">
                <TagForm
                  onPick={(tag) =>
                    setPending({ tag, label: tag, body: { tag } })
                  }
                />
                <ClanFinder
                  eventsOf={eventsOf}
                  onPick={(m) =>
                    setPending({
                      tag: m.tag,
                      label: m.name,
                      body: { tag: m.tag },
                    })
                  }
                />
              </div>
            </details>
          )}
        </>
      ) : eligible.length ? (
        <ManualForm onPick={setPending} />
      ) : null}

      <EventChooser
        pending={pending}
        events={eligible}
        preferred={focus?.id ?? null}
        close={() => setPending(null)}
        submit={async (event) => {
          try {
            const result = await request<
              PublicState & { player: { name: string } }
            >("/api/register", {
              body: { ...pending!.body, eventId: event.id },
            });
            setState(result);
            setPending(null);
            notify(`${result.player.name} is in ${event.name}!`);
            if (focus) go(`#event/${event.id}/players`);
          } catch (error) {
            notify((error as Error).message, "error");
          }
        }}
      />
    </div>
  );
}

function EventChooser({
  pending,
  events,
  preferred,
  close,
  submit,
}: {
  pending: Pending | null;
  events: Tournament[];
  preferred: string | null;
  close: () => void;
  submit: (event: Tournament) => Promise<void>;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const joined = (e: Tournament) =>
    Boolean(pending && e.players.some((p) => p.tag === pending.tag));
  const available = events.filter((e) => !joined(e));
  // Preselect the event the person came from, or the only one available.
  const selected =
    available.find((e) => e.id === choice) ??
    available.find((e) => e.id === preferred) ??
    (available.length === 1 ? available[0] : null);

  return (
    <Dialog.Root
      open={Boolean(pending)}
      onOpenChange={(o) => {
        if (!o) {
          close();
          setChoice(null);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="sheet" aria-describedby={undefined}>
          <div className="sheet-head">
            <div>
              <span className="eyebrow">Register</span>
              <Dialog.Title className="display">{pending?.label}</Dialog.Title>
            </div>
            <Dialog.Close className="icon-btn" aria-label="Close">
              <X size={18} />
            </Dialog.Close>
          </div>
          <p className="muted small">
            {events.length > 1
              ? "Which event do you want to play in?"
              : "Confirm your registration."}
          </p>
          <div className="choices" role="radiogroup">
            {events.map((e) => {
              const done = joined(e);
              const date = formatDate(e.startsAt);
              return (
                <button
                  key={e.id}
                  role="radio"
                  aria-checked={selected?.id === e.id}
                  disabled={done}
                  className={`choice${selected?.id === e.id ? " selected" : ""}`}
                  onClick={() => setChoice(e.id)}
                >
                  <span className="choice-radio">
                    {done || selected?.id === e.id ? <Check size={14} /> : null}
                  </span>
                  <span className="choice-body">
                    <strong>{e.name}</strong>
                    <span className="event-meta small">
                      {date && (
                        <span>
                          <CalendarDays size={13} /> {date}
                        </span>
                      )}
                      {e.prize && (
                        <span>
                          <Gift size={13} /> {e.prize}
                        </span>
                      )}
                      <span>
                        <Users size={13} /> {e.players.length}/{e.maxPlayers}
                      </span>
                      <span>Best of {e.format}</span>
                    </span>
                  </span>
                  {done && <span className="chip ok">Registered</span>}
                </button>
              );
            })}
          </div>
          <button
            className="btn primary lg"
            disabled={!selected || busy}
            onClick={async () => {
              if (!selected) return;
              setBusy(true);
              await submit(selected);
              setBusy(false);
              setChoice(null);
            }}
          >
            {busy
              ? "Registering…"
              : selected
                ? `Join ${selected.name}`
                : available.length
                  ? "Choose an event"
                  : "Already registered for every open event"}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type Show = "all" | "registered" | "open";

// The home clan's live roster. Everyone sees who has registered for what.
function ClanRoster({
  clanTag,
  eventsOf,
  canJoin,
  onPick,
}: {
  clanTag: string;
  eventsOf: (tag: string) => Tournament[];
  canJoin: ((tag: string) => boolean) | null;
  onPick: (m: MemberSummary) => void;
}) {
  const { data, error, reload } = useClan(clanTag);
  const [filter, setFilter] = useState("");
  const [show, setShow] = useState<Show>("all");

  if (error)
    return (
      <section className="panel notice error">
        <p>Couldn’t load the clan: {error}</p>
        <button className="btn sm" onClick={reload}>
          Try again
        </button>
      </section>
    );
  if (!data)
    return (
      <div className="loading">
        <span className="spinner" /> Loading clan…
      </div>
    );

  const { clan, members } = data;
  const signedUp = members.filter((m) => eventsOf(m.tag).length).length;
  const query = filter.trim().toLowerCase();
  const shown = members.filter(
    (m) =>
      (m.name.toLowerCase().includes(query) ||
        m.tag.toLowerCase().includes(query)) &&
      (show === "all" ||
        (show === "registered") === eventsOf(m.tag).length > 0),
  );

  return (
    <section className="panel roster">
      <div className="clan-head">
        {clan.badge && <img src={clan.badge} alt="" width={52} height={52} />}
        <div className="row-main">
          <h2 className="display">{clan.name}</h2>
          <p className="muted small">
            {clan.tag}
            {clan.level ? ` · Level ${clan.level}` : ""}
            {clan.location ? ` · ${clan.location}` : ""}
          </p>
        </div>
        <div className="clan-count">
          <strong>
            {signedUp}
            <span>/{members.length}</span>
          </strong>
          <span className="muted small">registered</span>
        </div>
      </div>
      <div className="meter">
        <span
          style={{
            width: `${members.length ? (signedUp / members.length) * 100 : 0}%`,
          }}
        />
      </div>

      <div className="roster-tools">
        <label className="search">
          <Search size={16} />
          <input
            placeholder="Search name or tag"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <div className="segmented">
          {(
            [
              ["all", "All"],
              ["registered", "Registered"],
              ["open", "Not yet"],
            ] as [Show, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              className={show === id ? "active" : ""}
              onClick={() => setShow(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="list">
        {shown.map((m) => {
          const joined = eventsOf(m.tag);
          return (
            <li key={m.tag} className="member">
              <TownHall level={m.townHallLevel} />
              <div className="row-main">
                <strong>{m.name}</strong>
                <span className="muted small">
                  {roleLabel(m.role)} · {m.tag}
                </span>
                {joined.length > 0 && (
                  <span className="joined">
                    {joined.map((e) => (
                      <span key={e.id} className="chip ok">
                        <Check size={12} /> {e.name}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              {canJoin?.(m.tag) && (
                <button className="btn primary sm" onClick={() => onPick(m)}>
                  {joined.length ? "+ Event" : "Register"}
                </button>
              )}
            </li>
          );
        })}
        {!shown.length && (
          <li className="muted small member">No members match.</li>
        )}
      </ul>
    </section>
  );
}

function ClanFinder({
  eventsOf,
  onPick,
}: {
  eventsOf: (tag: string) => Tournament[];
  onPick: (m: MemberSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [clans, setClans] = useState<ClanSummary[] | null>(null);
  const [clan, setClan] = useState<ClanSummary | null>(null);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openClan = async (c: ClanSummary) => {
    setBusy(c.tag);
    setError(null);
    try {
      const data = await request<{ members: MemberSummary[] }>(
        `/api/coc/members?tag=${encodeURIComponent(c.tag)}`,
      );
      setClan(c);
      setMembers(data.members);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (clan)
    return (
      <div>
        <button className="link" onClick={() => setClan(null)}>
          <ArrowLeft size={14} /> Back to search
        </button>
        <h3 className="sub-title">{clan.name}</h3>
        <ul className="list">
          {members.map((m) => (
            <li key={m.tag} className="member">
              <TownHall level={m.townHallLevel} />
              <div className="row-main">
                <strong>{m.name}</strong>
                <span className="muted small">{m.tag}</span>
              </div>
              <button className="btn primary sm" onClick={() => onPick(m)}>
                {eventsOf(m.tag).length ? "+ Event" : "Register"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div>
      <h3 className="sub-title">Search another clan</h3>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (query.trim().length < 3) {
            setError("Type at least 3 characters, or the clan #tag");
            return;
          }
          setBusy("search");
          setError(null);
          try {
            const { clans } = await request<{ clans: ClanSummary[] }>(
              `/api/coc/clans?q=${encodeURIComponent(query)}`,
            );
            setClans(clans);
            if (clans.length === 1) await openClan(clans[0]);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(null);
          }
        }}
      >
        <input
          className="input"
          placeholder="Clan name or #tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="search"
        />
        <button className="btn" disabled={busy !== null}>
          <Search size={16} /> {busy === "search" ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p className="error-text small">{error}</p>}
      {clans && !clans.length && (
        <p className="muted small">No clans found. Try the clan tag.</p>
      )}
      {clans && clans.length > 0 && (
        <ul className="list">
          {clans.map((c) => (
            <li key={c.tag}>
              <button
                className="member member-btn"
                onClick={() => openClan(c)}
                disabled={busy !== null}
              >
                {c.badge ? (
                  <img src={c.badge} alt="" width={36} height={36} />
                ) : (
                  <span className="th">?</span>
                )}
                <div className="row-main">
                  <strong>{c.name}</strong>
                  <span className="muted small">
                    {c.tag} · {c.members ?? "?"} members
                  </span>
                </div>
                <span className="muted small">
                  {busy === c.tag ? "Loading…" : "View"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TagForm({ onPick }: { onPick: (tag: string) => void }) {
  const [tag, setTag] = useState("");
  return (
    <div>
      <h3 className="sub-title">Register with your player tag</h3>
      <p className="muted small">
        Find it in game on your profile, under your name.
      </p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          onPick(tag.trim());
          setTag("");
        }}
      >
        <input
          className="input"
          placeholder="#PLAYERTAG"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
        />
        <button className="btn" disabled={!tag.trim()}>
          <UserPlus size={16} /> Continue
        </button>
      </form>
    </div>
  );
}

function ManualForm({ onPick }: { onPick: (p: Pending) => void }) {
  const [form, setForm] = useState({ name: "", tag: "", th: "" });
  return (
    <section className="panel">
      <h2 className="display">Your details</h2>
      <p className="muted small">
        Clan lookup turns on once the Clash of Clans API key is set up.
      </p>
      <form
        className="stack form-gap"
        onSubmit={(e) => {
          e.preventDefault();
          const th = Number(form.th);
          onPick({
            tag: form.tag,
            label: form.name,
            body: {
              name: form.name,
              tag: form.tag,
              townHallLevel: form.th && th >= 1 && th <= 30 ? th : null,
            },
          });
        }}
      >
        <label className="field">
          <span>In-game name</span>
          <input
            className="input"
            value={form.name}
            maxLength={30}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Player tag</span>
          <input
            className="input"
            placeholder="#PLAYERTAG"
            value={form.tag}
            onChange={(e) => setForm({ ...form, tag: e.target.value })}
            autoCapitalize="characters"
            required
          />
        </label>
        <label className="field">
          <span>Town Hall level (optional)</span>
          <input
            className="input"
            inputMode="numeric"
            value={form.th}
            onChange={(e) => setForm({ ...form, th: e.target.value })}
          />
        </label>
        <button className="btn primary">
          <UserPlus size={16} /> Continue
        </button>
      </form>
    </section>
  );
}

export function TownHall({ level }: { level: number | null }) {
  return (
    <span className="th" title={level ? `Town Hall ${level}` : "Town Hall"}>
      <small>TH</small>
      {level ?? "?"}
    </span>
  );
}
