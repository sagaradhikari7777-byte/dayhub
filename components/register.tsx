"use client";

import { ArrowLeft, Check, Search, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ClanSummary, MemberSummary } from "@/lib/coc";
import type { PublicState } from "@/lib/types";
import type { Actions } from "./app";
import { request } from "./api";

export function Register({ state, players, setState, notify }: Actions) {
  const t = state.tournament;
  const isAdmin = Boolean(state.admin);
  const open = !t.bracket && (t.registrationOpen || isAdmin);
  const full = t.players.length >= t.maxPlayers;

  const register = async (body: object) => {
    try {
      const result = await request<PublicState & { player: { name: string } }>(
        "/api/register",
        { body },
      );
      setState(result);
      notify(`${result.player.name} is registered`);
      return true;
    } catch (error) {
      notify((error as Error).message, "error");
      return false;
    }
  };

  if (!state.apiConfigured)
    return open ? (
      <ManualForm register={register} />
    ) : (
      <Closed bracket={Boolean(t.bracket)} />
    );

  return (
    <div className="stack">
      {!open && <Closed bracket={Boolean(t.bracket)} />}
      {open && !t.registrationOpen && (
        <p className="card notice small">
          Registration is closed to the public. You can still add players as an
          admin.
        </p>
      )}
      {open && full && (
        <p className="card notice error small">
          The tournament is full ({t.maxPlayers} players).
        </p>
      )}
      <ClanRoster
        clanTag={t.clanTag}
        registered={players}
        register={open && !full ? register : null}
      />
      {open && !full && (
        <details className="card other-ways">
          <summary>Not in this clan? Register another way</summary>
          <div className="stack form-gap">
            <TagForm register={register} />
            <ClanFinder registered={players} register={register} />
          </div>
        </details>
      )}
    </div>
  );
}

function Closed({ bracket }: { bracket: boolean }) {
  return (
    <section className="card notice">
      <h2>Registration is closed</h2>
      <p className="muted">
        {bracket
          ? "The bracket has been drawn. Check the Bracket tab for matches."
          : "The organisers have closed registration for now."}
      </p>
    </section>
  );
}

type Show = "all" | "registered" | "open";

// The home clan's live roster. Everyone sees who has registered; the Register
// buttons only appear while registration is open.
function ClanRoster({
  clanTag,
  registered,
  register,
}: {
  clanTag: string;
  registered: Map<string, unknown>;
  register: RegisterFn | null;
}) {
  const [data, setData] = useState<{
    clan: ClanSummary;
    members: MemberSummary[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(
        await request(`/api/coc/members?tag=${encodeURIComponent(clanTag)}`),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, [clanTag]);
  useEffect(() => {
    load();
  }, [load]);

  if (error)
    return (
      <section className="card notice error">
        <p>Couldn’t load the clan: {error}</p>
        <button className="btn sm" onClick={load}>
          Try again
        </button>
      </section>
    );
  if (!data)
    return (
      <section className="card">
        <p className="muted">Loading clan…</p>
      </section>
    );

  const { clan, members } = data;
  const signedUp = members.filter((m) => registered.has(m.tag)).length;
  const query = filter.trim().toLowerCase();
  const shown = members.filter(
    (m) =>
      (m.name.toLowerCase().includes(query) ||
        m.tag.toLowerCase().includes(query)) &&
      (show === "all" || (show === "registered") === registered.has(m.tag)),
  );

  return (
    <section className="card">
      <div className="clan-head">
        {clan.badge && <img src={clan.badge} alt="" width={56} height={56} />}
        <div className="row-main">
          <h2>{clan.name}</h2>
          <p className="muted small">
            {clan.tag}
            {clan.level ? ` · Level ${clan.level}` : ""}
            {clan.location ? ` · ${clan.location}` : ""}
          </p>
        </div>
      </div>
      {clan.description && (
        <p className="clan-desc small">{clan.description}</p>
      )}
      <div className="clan-facts">
        <div>
          <strong>{members.length}</strong>
          <span className="muted small">members</span>
        </div>
        <div>
          <strong>{signedUp}</strong>
          <span className="muted small">registered</span>
        </div>
        {clan.warWins !== null && (
          <div>
            <strong>{clan.warWins}</strong>
            <span className="muted small">war wins</span>
          </div>
        )}
        {clan.warLeague && clan.warLeague !== "Unranked" && (
          <div>
            <strong className="league">{clan.warLeague}</strong>
            <span className="muted small">war league</span>
          </div>
        )}
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={signedUp}
        aria-valuemax={members.length}
        aria-label="Members registered"
      >
        <span
          style={{
            width: `${members.length ? (signedUp / members.length) * 100 : 0}%`,
          }}
        />
      </div>

      <p className="muted small roster-hint">
        {register
          ? "Find your account and tap Register."
          : "Members of the clan and who has registered."}
      </p>
      <div className="roster-tools">
        <input
          className="input"
          placeholder="Search name or tag"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
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
          const done = registered.has(m.tag);
          return (
            <li key={m.tag} className="row">
              <TownHall level={m.townHallLevel} />
              <div className="row-main">
                <strong>{m.name}</strong>
                <span className="muted small">
                  {m.tag} · {roleLabel(m.role)}
                </span>
              </div>
              {done ? (
                <span className="chip ok">
                  <Check size={14} /> Registered
                </span>
              ) : register ? (
                <button
                  className="btn primary sm"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (!confirm(`Register ${m.name} (${m.tag})?`)) return;
                    setBusy(m.tag);
                    await register({ tag: m.tag });
                    setBusy(null);
                  }}
                >
                  {busy === m.tag ? "…" : "Register"}
                </button>
              ) : null}
            </li>
          );
        })}
        {!shown.length && (
          <li className="muted small row">No members match.</li>
        )}
      </ul>
    </section>
  );
}

type RegisterFn = (body: object) => Promise<boolean>;

function ClanFinder({
  registered,
  register,
}: {
  registered: Map<string, unknown>;
  register: RegisterFn;
}) {
  const [query, setQuery] = useState("");
  const [clans, setClans] = useState<ClanSummary[] | null>(null);
  const [clan, setClan] = useState<ClanSummary | null>(null);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 3) {
      setError("Type at least 3 characters of the clan name, or its #tag");
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const openClan = async (c: ClanSummary) => {
    setBusy(c.tag);
    setError(null);
    try {
      const data = await request<{ members: MemberSummary[] }>(
        `/api/coc/members?tag=${encodeURIComponent(c.tag)}`,
      );
      setClan(c);
      setFilter("");
      setMembers(data.members);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const join = async (m: MemberSummary) => {
    setBusy(m.tag);
    await register({ tag: m.tag });
    setBusy(null);
  };

  if (clan) {
    const shown = members.filter((m) =>
      m.name.toLowerCase().includes(filter.trim().toLowerCase()),
    );
    return (
      <section className="card">
        <button className="link-btn" onClick={() => setClan(null)}>
          <ArrowLeft size={16} /> Back to clans
        </button>
        <div className="clan-head">
          {clan.badge && <img src={clan.badge} alt="" width={44} height={44} />}
          <div>
            <h2>{clan.name}</h2>
            <p className="muted small">
              {clan.tag} · {members.length} members
            </p>
          </div>
        </div>
        <p className="muted small">Find your name and tap Register.</p>
        <input
          className="input"
          placeholder="Filter members"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <ul className="list">
          {shown.map((m) => {
            const done = registered.has(m.tag);
            return (
              <li key={m.tag} className="row">
                <TownHall level={m.townHallLevel} />
                <div className="row-main">
                  <strong>{m.name}</strong>
                  <span className="muted small">
                    {m.tag} · {roleLabel(m.role)}
                  </span>
                </div>
                {done ? (
                  <span className="chip ok">
                    <Check size={14} /> Registered
                  </span>
                ) : (
                  <button
                    className="btn primary sm"
                    disabled={busy !== null}
                    onClick={() => join(m)}
                  >
                    {busy === m.tag ? "…" : "Register"}
                  </button>
                )}
              </li>
            );
          })}
          {!shown.length && <li className="muted small">No members match.</li>}
        </ul>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Search another clan</h2>
      <p className="muted small">
        Search by clan name or paste the clan tag (for example #2PP).
      </p>
      <form className="inline-form" onSubmit={search}>
        <input
          className="input"
          placeholder="Clan name or #tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="search"
        />
        <button className="btn primary" disabled={busy !== null}>
          <Search size={16} /> {busy === "search" ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p className="error-text small">{error}</p>}
      {clans && !clans.length && (
        <p className="muted small">No clans found. Try the clan tag instead.</p>
      )}
      {clans && clans.length > 0 && (
        <ul className="list">
          {clans.map((c) => (
            <li key={c.tag}>
              <button
                className="row row-btn"
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
                    {c.level ? ` · level ${c.level}` : ""}
                    {c.location ? ` · ${c.location}` : ""}
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
    </section>
  );
}

function TagForm({ register }: { register: RegisterFn }) {
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <h2>Register with your player tag</h2>
      <p className="muted small">
        Find it in game under your profile, below your name.
      </p>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          if (await register({ tag })) setTag("");
          setBusy(false);
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
        <button className="btn" disabled={busy || !tag.trim()}>
          <UserPlus size={16} /> Register
        </button>
      </form>
    </section>
  );
}

function ManualForm({ register }: { register: RegisterFn }) {
  const [form, setForm] = useState({ name: "", tag: "", th: "" });
  const [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <h2>Register for the tournament</h2>
      <p className="muted small">
        Clan lookup turns on once the Clash of Clans API key is set up. Until
        then, enter your details.
      </p>
      <form
        className="stack form-gap"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const th = Number(form.th);
          const ok = await register({
            name: form.name,
            tag: form.tag,
            townHallLevel: form.th && th >= 1 && th <= 30 ? th : null,
          });
          if (ok) setForm({ name: "", tag: "", th: "" });
          setBusy(false);
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
        <button className="btn primary" disabled={busy}>
          <UserPlus size={16} /> Register
        </button>
      </form>
    </section>
  );
}

export function TownHall({ level }: { level: number | null }) {
  return (
    <span className="th" title={level ? `Town Hall ${level}` : "Town Hall"}>
      {level ? `TH${level}` : "TH?"}
    </span>
  );
}

function roleLabel(role: string | null) {
  switch (role) {
    case "leader":
      return "Leader";
    case "coLeader":
      return "Co-leader";
    case "admin":
      return "Elder";
    default:
      return "Member";
  }
}
