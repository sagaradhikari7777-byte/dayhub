"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Crown, Swords, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  compareSides,
  leagueView,
  playerStrengthRows,
  strengthOf,
  type LeagueView,
  type PlayedMatch,
  type TeamAttack,
} from "@/lib/teams";
import type { BattleMode, Tournament } from "@/lib/types";
import type { EventActions } from "./app";
import { formatTime, parseTime } from "./api";
import { TownHall } from "./register";

export type TeamsTab = "teams" | "matches" | "table";

export function TeamsView(props: EventActions & { tab: TeamsTab }) {
  const { event, tab } = props;
  const view = useMemo(() => leagueView(event), [event]);
  if (!view) return <BeforeDraw event={event} />;
  return (
    <div className="stack">
      <ChampionBanner event={event} view={view} />
      {tab === "matches" ? (
        <Matches {...props} view={view} />
      ) : tab === "table" ? (
        <Table event={event} view={view} />
      ) : (
        <Teams event={event} view={view} />
      )}
    </div>
  );
}

const letter = (i: number) => String.fromCharCode(65 + i);

function BeforeDraw({ event }: { event: Tournament }) {
  const info = event.teams!;
  const fill = Math.min(100, (event.players.length / event.maxPlayers) * 100);
  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row-between">
          <h2 className="display">Registration</h2>
          <strong className="gold-text">
            {event.players.length} / {event.maxPlayers}
          </strong>
        </div>
        <div className="meter">
          <span style={{ width: `${fill}%` }} />
        </div>
        <p className="muted small">
          TH{info.minTownHall} only, first come first served. Once{" "}
          {event.maxPlayers} players are in, the teams are drawn at random and
          balanced by hero and equipment levels.
        </p>
      </section>
      <div className="team-grid">
        {info.teamNames.map((name, i) => (
          <section key={name} className="panel team-card">
            <TeamHead name={name} index={i} leader={info.leaders[i]?.name} />
            <p className="muted small">
              5 players, drawn when registration is full.
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}

function TeamHead({
  name,
  index,
  leader,
  strength,
}: {
  name: string;
  index: number;
  leader?: string;
  strength?: number;
}) {
  return (
    <div className="team-head">
      <span className={`team-badge t${index}`}>{letter(index)}</span>
      <div className="row-main">
        <strong className="display">{name}</strong>
        {leader && (
          <span className="muted small">
            <Crown size={12} /> Leader: {leader}
          </span>
        )}
      </div>
      {strength !== undefined && (
        <span className="team-strength" title="Total hero + equipment levels">
          <strong>{strength}</strong>
          <span className="muted small">strength</span>
        </span>
      )}
    </div>
  );
}

function Teams({ event, view }: { event: Tournament; view: LeagueView }) {
  const info = event.teams!;
  return (
    <>
      <div className="team-grid">
        {info.teamNames.map((name, i) => {
          const rows = playerStrengthRows(event, i);
          const total = rows.reduce((n, r) => n + strengthOf(r.strength), 0);
          return (
            <section
              key={name}
              className={`panel team-card${view.champion === i ? " champion-team" : ""}`}
            >
              <TeamHead
                name={name}
                index={i}
                leader={info.leaders[i]?.name}
                strength={total}
              />
              <ul className="list">
                {rows.map((r) => (
                  <li key={r.tag} className="member">
                    <TownHall level={r.player?.townHallLevel ?? null} />
                    <div className="row-main">
                      <strong>{r.player?.name ?? r.tag}</strong>
                      <span className="muted small">
                        Heroes {r.strength?.heroes ?? "?"} · Equipment{" "}
                        {r.strength?.equipment ?? "?"}
                      </span>
                    </div>
                    <span className="muted small">
                      {strengthOf(r.strength)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="muted small">
        Strength = total hero levels + levels of the equipment each player has
        equipped, taken from the game when the teams were drawn (
        {new Date(info.draw!.createdAt).toLocaleDateString()}).
      </p>
    </>
  );
}

function ChampionBanner({
  event,
  view,
}: {
  event: Tournament;
  view: LeagueView;
}) {
  if (view.champion === null) return null;
  const info = event.teams!;
  return (
    <section className="panel star-race">
      <span className="eyebrow">Champions</span>
      <div className="star-leader">
        <span className="crown">
          <Crown size={24} />
        </span>
        <div className="row-main">
          <strong className="display">{info.teamNames[view.champion]}</strong>
          <span className="muted small">
            Leader {info.leaders[view.champion]?.name} receives
            {event.prize ? ` the prize (${event.prize})` : " the prize"} and
            shares it as they decide.
          </span>
        </div>
      </div>
    </section>
  );
}

function Table({ event, view }: { event: Tournament; view: LeagueView }) {
  const names = event.teams!.teamNames;
  return (
    <section className="stack">
      <h2 className="display">Group table</h2>
      <div className="panel leaderboard">
        <div className="lb-row team-row lb-head muted small">
          <span>#</span>
          <span>Team</span>
          <span title="Played">P</span>
          <span title="Won-drawn-lost">W-D-L</span>
          <span className="lb-wide" title="Stars for - against">
            ★
          </span>
          <span title="Points">Pts</span>
        </div>
        {view.table.map((r, i) => (
          <div
            key={r.team}
            className={`lb-row team-row${i < 2 && view.groupDone ? " ours" : ""}`}
          >
            <span className="lb-rank">{i + 1}</span>
            <span className="lb-player">
              <span className={`team-badge sm t${r.team}`}>
                {letter(r.team)}
              </span>
              <span className="row-main">
                <strong>{names[r.team]}</strong>
                <span className="muted small">
                  {i < 2 && view.groupDone
                    ? "Into the final"
                    : `${r.destruction}% total`}
                </span>
              </span>
            </span>
            <span>{r.played}</span>
            <span>
              {r.won}-{r.drawn}-{r.lost}
            </span>
            <span className="lb-wide">
              {r.starsFor}-{r.starsAgainst}
            </span>
            <span className="gold-text">{r.points}</span>
          </div>
        ))}
      </div>
      <p className="muted small">
        Win 3 points, draw 1. Ties on points go to star difference, then stars,
        then destruction. The top two play the final.
      </p>
      {view.finalTotals && view.finalists && (
        <section className="panel">
          <h3 className="display sub-title">Final, both wars together</h3>
          <div className="war-score">
            {[0, 1].map((side) => (
              <div key={side} className={`war-side ${side ? "start" : "end"}`}>
                <div className="row-main">
                  <strong className="war-name">
                    {names[view.finalists![side]]}
                  </strong>
                  <span className="war-stars display">
                    {view.finalTotals![side].stars}★
                  </span>
                  <span className="muted small">
                    {view.finalTotals![side].destruction}% total
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function Matches(props: EventActions & { view: LeagueView }) {
  const { event, view } = props;
  const [openId, setOpenId] = useState<string | null>(null);
  const all = [...view.group, ...view.final];
  const open = all.find((m) => m.id === openId) ?? null;
  const names = event.teams!.teamNames;
  return (
    <>
      <section className="stack">
        <h2 className="display">Group stage</h2>
        {view.group.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            names={names}
            onOpen={() => setOpenId(m.id)}
          />
        ))}
      </section>
      <section className="stack">
        <h2 className="display">Final</h2>
        {!view.finalists ? (
          <p className="panel muted">
            The top two teams after the group stage meet here, over two wars.
          </p>
        ) : (
          view.final.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              names={names}
              onOpen={() => setOpenId(m.id)}
            />
          ))
        )}
      </section>
      <Dialog.Root
        open={Boolean(open)}
        onOpenChange={(o) => !o && setOpenId(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="sheet" aria-describedby={undefined}>
            {open && (
              <MatchSheet
                {...props}
                match={open}
                close={() => setOpenId(null)}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function MatchCard({
  match: m,
  names,
  onOpen,
}: {
  match: PlayedMatch;
  names: string[];
  onOpen: () => void;
}) {
  const [x, y] = m.teams ?? [null, null];
  const status = m.stale
    ? "Re-enter result"
    : !m.score
      ? "Not played"
      : m.winner === null
        ? "Draw"
        : `${names[m.winner]} won`;
  return (
    <button
      className={`panel team-match${m.score ? " played" : ""}`}
      onClick={onOpen}
    >
      <div className="row-between">
        <span className="muted small">
          {m.stage === "final" ? m.label : m.id.replace("g", "Match ")}
        </span>
        <span className="row-gap">
          {m.result?.mode === "hard" && !m.stale && (
            <span className="pill hard">Hard Mode</span>
          )}
          <span
            className={`pill${m.score ? (m.winner === null ? "" : " win") : ""}`}
          >
            {status}
          </span>
        </span>
      </div>
      <div className="war-score">
        <Side match={m} names={names} team={x} side={0} />
        <span className="vs">
          <Swords size={18} />
        </span>
        <Side match={m} names={names} team={y} side={1} />
      </div>
    </button>
  );
}

function Side({
  match: m,
  names,
  team,
  side,
}: {
  match: PlayedMatch;
  names: string[];
  team: number | null;
  side: 0 | 1;
}) {
  return (
    <div className={`war-side ${side ? "start" : "end"}`}>
      {team !== null && (
        <span className={`team-badge sm t${team}`}>{letter(team)}</span>
      )}
      <div className="row-main">
        <strong
          className={`war-name${m.winner !== null && m.winner === team ? " gold-text" : ""}`}
        >
          {team === null ? "TBD" : names[team]}
        </strong>
        {m.score && (
          <>
            <span className="war-stars display">{m.score[side].stars}★</span>
            <span className="muted small">{m.score[side].destruction}%</span>
          </>
        )}
      </div>
    </div>
  );
}

function MatchSheet({
  event,
  state,
  players,
  admin,
  notify,
  match: m,
  close,
}: EventActions & { match: PlayedMatch; close: () => void }) {
  const [editing, setEditing] = useState(false);
  const names = event.teams!.teamNames;
  const name = (tag: string) => players.get(tag)?.name ?? tag;
  const isAdmin = Boolean(state.admin);
  const ready = Boolean(m.teams);
  return (
    <>
      <div className="sheet-head">
        <div>
          <span className="muted small">
            {m.stage === "final"
              ? m.label
              : `Group stage · ${m.id.replace("g", "Match ")}`}
            {m.result?.mode === "hard" && !m.stale ? " · Hard Mode" : ""}
          </span>
          <Dialog.Title>
            {m.teams ? `${names[m.teams[0]]} vs ${names[m.teams[1]]}` : m.label}
          </Dialog.Title>
        </div>
        <Dialog.Close className="icon-btn" aria-label="Close">
          <X size={18} />
        </Dialog.Close>
      </div>
      {editing && m.teams ? (
        <TeamMatchEditor
          event={event}
          match={m}
          name={name}
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            if (
              await admin({ type: "saveTeamMatch", matchId: m.id, ...body })
            ) {
              notify("Result saved");
              setEditing(false);
            }
          }}
          onClear={async () => {
            if (await admin({ type: "clearTeamMatch", matchId: m.id })) {
              notify("Result cleared");
              setEditing(false);
            }
          }}
        />
      ) : (
        <>
          {m.stale && (
            <p className="notice error small">
              The finalists changed after this result was entered. Enter it
              again.
            </p>
          )}
          {!m.score && !m.stale && (
            <p className="muted">
              {ready
                ? "Not played yet."
                : "Waiting for the group stage to finish."}
            </p>
          )}
          {m.score && m.teams && m.result && (
            <>
              <div className="series">
                <div className={m.winner === m.teams[0] ? "win" : ""}>
                  <span>{names[m.teams[0]]}</span>
                  <strong>{m.score[0].stars}</strong>
                </div>
                <span className="muted">–</span>
                <div className={m.winner === m.teams[1] ? "win" : ""}>
                  <strong>{m.score[1].stars}</strong>
                  <span>{names[m.teams[1]]}</span>
                </div>
              </div>
              <p className="summary">
                {m.winner === null ? (
                  "A draw: level on stars, destruction and time."
                ) : (
                  <>
                    <strong>{names[m.winner]}</strong> won · {leadText(m)}
                  </>
                )}
              </p>
              <div className="war-detail">
                {[0, 1].map((side) => {
                  const team = m.teams![side];
                  const attacks = orderedAttacks(m, side);
                  const roster = event.teams!.draw!.teams[team];
                  return (
                    <div key={side}>
                      <h4 className="table-title">{names[team]}</h4>
                      <div className="attack-list">
                        {roster.map((tag) => {
                          const a = attacks.find((x) => x.player === tag);
                          return (
                            <div
                              key={tag}
                              className={`attack-line${a ? "" : " none"}`}
                            >
                              <span className="row-main">
                                <strong>{name(tag)}</strong>
                                {!a && (
                                  <span className="error-text small">
                                    Missed attack
                                  </span>
                                )}
                              </span>
                              {a && (
                                <span className="attack-result">
                                  <span className="stars-text">
                                    {"★".repeat(a.stars)}
                                    <span className="dim">
                                      {"★".repeat(3 - a.stars)}
                                    </span>
                                  </span>
                                  <span className="muted small">
                                    {a.destruction}%
                                    {a.seconds !== null
                                      ? ` · ${formatTime(a.seconds)}`
                                      : ""}
                                  </span>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="muted small">
                        {m.score![side].stars}★ · {m.score![side].destruction}%
                        · {m.score![side].attacks}/{roster.length} attacks
                      </p>
                    </div>
                  );
                })}
              </div>
              {m.result.note && (
                <p className="muted small">“{m.result.note}”</p>
              )}
              <p className="muted small">
                Entered by {m.result.updatedBy} ·{" "}
                {new Date(m.result.updatedAt).toLocaleString()}
              </p>
            </>
          )}
          {!isAdmin && ready && (
            <p className="muted small">
              Organisers enter results after signing in under{" "}
              <a className="link" href="#admin">
                Admin
              </a>
              .
            </p>
          )}
          <div className="actions">
            {isAdmin && ready && (
              <button className="btn primary" onClick={() => setEditing(true)}>
                {m.result && !m.stale ? "Edit result" : "Enter result"}
              </button>
            )}
            <button className="btn" onClick={close}>
              Close
            </button>
          </div>
        </>
      )}
    </>
  );
}

function leadText(m: PlayedMatch) {
  const [a, b] = m.score!;
  const first = m.winner === m.teams![0];
  const [w, l] = first ? [a, b] : [b, a];
  const parts: string[] = [];
  if (w.stars !== l.stars)
    parts.push(
      `+${w.stars - l.stars} star${w.stars - l.stars === 1 ? "" : "s"}`,
    );
  const pct = Math.round((w.destruction - l.destruction) * 10) / 10;
  if (pct) parts.push(`${pct > 0 ? "+" : ""}${pct}% destruction`);
  if (!parts.length && w.seconds !== null && l.seconds !== null)
    parts.push(`${formatTime(l.seconds - w.seconds)} faster`);
  return parts.join(" · ");
}

// Attacks for the given side of the fixture, whichever way they were saved.
function orderedAttacks(m: PlayedMatch, side: number): TeamAttack[] {
  const r = m.result!;
  const flipped = r.teams[0] !== m.teams![0];
  return r.attacks[flipped ? 1 - side : side];
}

type Draft = { stars: number; destruction: string; time: string };

function TeamMatchEditor({
  event,
  match: m,
  name,
  onSave,
  onCancel,
  onClear,
}: {
  event: Tournament;
  match: PlayedMatch;
  name: (tag: string) => string;
  onSave: (body: {
    attacks: TeamAttack[][];
    mode: BattleMode;
    note: string;
  }) => Promise<void>;
  onCancel: () => void;
  onClear: () => Promise<void>;
}) {
  const names = event.teams!.teamNames;
  const rosters = m.teams!.map((t) => event.teams!.draw!.teams[t]);
  const saved = m.stale ? null : m.result;
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const out: Record<string, Draft> = {};
    rosters.forEach((roster, side) => {
      const prev = saved ? orderedAttacks(m, side) : [];
      for (const tag of roster) {
        const a = prev.find((x) => x.player === tag);
        out[tag] = a
          ? {
              stars: a.stars,
              destruction: String(a.destruction),
              time: formatTime(a.seconds),
            }
          : { stars: 0, destruction: "", time: "" };
      }
    });
    return out;
  });
  const [mode, setMode] = useState<BattleMode>(saved?.mode ?? "normal");
  const [note, setNote] = useState(saved?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (tag: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [tag]: { ...d[tag], ...patch } }));

  // A blank destruction means the player didn't attack.
  const build = (): TeamAttack[][] | string => {
    const sides: TeamAttack[][] = [];
    for (const roster of rosters) {
      const side: TeamAttack[] = [];
      for (const tag of roster) {
        const d = drafts[tag];
        if (d.destruction.trim() === "") continue;
        const destruction = Number(d.destruction.replace(",", "."));
        if (!(destruction >= 0 && destruction <= 100))
          return `${name(tag)}: destruction must be 0–100%`;
        const seconds = parseTime(d.time);
        if (seconds === undefined)
          return `${name(tag)}: time must look like 2:15`;
        if (d.stars === 3 && destruction !== 100)
          return `${name(tag)}: 3 stars means 100%`;
        side.push({
          player: tag,
          stars: d.stars,
          destruction: Math.round(destruction * 10) / 10,
          seconds,
        });
      }
      sides.push(side);
    }
    return sides;
  };
  const built = build();
  const preview = typeof built === "string" ? null : built;
  const totals = preview?.map((side) => ({
    stars: side.reduce((n, a) => n + a.stars, 0),
    destruction:
      Math.round(
        (side.reduce((n, a) => n + a.destruction, 0) / rosters[0].length) * 10,
      ) / 10,
  }));

  return (
    <div className="editor stack">
      <div className="field">
        <span>Battle mode</span>
        <div className="segmented">
          <button
            className={mode === "normal" ? "active" : ""}
            onClick={() => setMode("normal")}
          >
            Normal
          </button>
          <button
            className={mode === "hard" ? "active" : ""}
            onClick={() => setMode("hard")}
          >
            Hard Mode
          </button>
        </div>
      </div>
      <p className="muted small">
        Enter each player&apos;s attack. Leave the % empty if they didn&apos;t
        attack (counts as 0).
      </p>
      {rosters.map((roster, side) => (
        <fieldset key={side} className="game">
          <legend>
            {names[m.teams![side]]}
            {totals && (
              <span className="muted small">
                {" "}
                · {totals[side].stars}★ · {totals[side].destruction}%
              </span>
            )}
          </legend>
          {roster.map((tag) => (
            <div className="attack-row" key={tag}>
              <span className="attack-name">{name(tag)}</span>
              <div className="star-pick" role="radiogroup" aria-label="Stars">
                {[0, 1, 2, 3].map((n) => (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={drafts[tag].stars === n}
                    className={drafts[tag].stars === n ? "active" : ""}
                    onClick={() =>
                      set(tag, {
                        stars: n,
                        ...(n === 3 ? { destruction: "100" } : {}),
                      })
                    }
                  >
                    {n}★
                  </button>
                ))}
              </div>
              <input
                className="input pct"
                inputMode="decimal"
                placeholder="%"
                aria-label={`${name(tag)} destruction percent`}
                value={drafts[tag].destruction}
                onChange={(e) => set(tag, { destruction: e.target.value })}
              />
              <input
                className="input time"
                placeholder="time"
                aria-label={`${name(tag)} attack time (optional)`}
                value={drafts[tag].time}
                onChange={(e) => set(tag, { time: e.target.value })}
              />
            </div>
          ))}
        </fieldset>
      ))}
      <label className="field">
        <span>Note (optional)</span>
        <input
          className="input"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {totals && (
        <p className="summary">
          {(() => {
            const c = compareSides(
              { ...totals[0], seconds: null, attacks: 0 },
              { ...totals[1], seconds: null, attacks: 0 },
            );
            return c === 0 ? (
              <span className="muted">
                Level so far (time decides if entered).
              </span>
            ) : (
              <>
                <strong>{names[m.teams![c > 0 ? 0 : 1]]}</strong> win
              </>
            );
          })()}
        </p>
      )}
      {error && <p className="error-text small">{error}</p>}
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            const result = build();
            if (typeof result === "string") return setError(result);
            setBusy(true);
            setError(null);
            await onSave({ attacks: result, mode, note });
            setBusy(false);
          }}
        >
          {busy ? "Saving…" : "Save result"}
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        {saved && (
          <button
            className="btn danger"
            onClick={() => confirm("Clear this result?") && onClear()}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
