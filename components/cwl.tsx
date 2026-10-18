"use client";

import { Clock, ScrollText, Shield, Swords } from "lucide-react";
import { useMemo } from "react";
import {
  ourWars,
  placement,
  playerRecords,
  standings,
  warWinner,
  type CwlMember,
  type CwlSnapshot,
  type CwlWar,
} from "@/lib/cwl";
import type { Tournament } from "@/lib/types";
import { formatTime } from "./api";
import { TownHall } from "./register";

export type CwlTab = "overview" | "rounds" | "players" | "rules";

export function CwlView({
  event,
  clanTag,
  tab,
}: {
  event: Tournament;
  clanTag: string;
  tab: CwlTab;
}) {
  const snapshot = event.cwl?.snapshot ?? null;
  if (tab === "rules") return <EventRules rules={event.rules} />;
  if (!snapshot)
    return (
      <div className="stack">
        <section className="panel notice">
          <h2>Waiting for CWL to start</h2>
          <p className="muted">
            When the season starts, the league table, every war and every attack
            appear here automatically.
          </p>
        </section>
        <SignUps event={event} />
      </div>
    );
  if (tab === "rounds") return <Rounds snapshot={snapshot} clanTag={clanTag} />;
  if (tab === "players")
    return <CwlPlayers snapshot={snapshot} clanTag={clanTag} />;
  return (
    <Overview
      snapshot={snapshot}
      clanTag={clanTag}
      syncedAt={event.cwl?.syncedAt ?? null}
    />
  );
}

export function EventRules({ rules }: { rules: string[] }) {
  if (!rules.length)
    return (
      <section className="panel notice">
        <p className="muted">No rules have been set for this event yet.</p>
      </section>
    );
  return (
    <section className="stack">
      <h2 className="display">
        <ScrollText size={22} /> Event rules
      </h2>
      <ol className="rules panel">
        {rules.map((rule, i) => (
          <li key={i}>
            <span className="rule-num">{i + 1}</span>
            <p>{rule}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SignUps({ event }: { event: Tournament }) {
  if (!event.players.length) return null;
  return (
    <section className="panel">
      <h2 className="display">Signed up · {event.players.length}</h2>
      <ul className="list">
        {event.players.map((p) => (
          <li key={p.tag} className="member">
            <TownHall level={p.townHallLevel} />
            <div className="row-main">
              <strong>{p.name}</strong>
              <span className="muted small">{p.tag}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function stateLine(s: CwlSnapshot, clanTag: string) {
  if (s.state === "ended") return "Season ended";
  const wars = ourWars(s, clanTag);
  const live = wars.findIndex((w) => w?.state === "inWar");
  if (live >= 0) return `Battle day · Round ${live + 1} of 7`;
  const prep = wars.findIndex((w) => w?.state === "preparation");
  if (prep >= 0) return `Preparation day · Round ${prep + 1} of 7`;
  return "Preparation";
}

function ago(iso: string | null) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString();
}

function countdown(iso: string | null, verb: string) {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${verb} in ${h ? `${h}h ` : ""}${m}m`;
}

function Overview({
  snapshot: s,
  clanTag,
  syncedAt,
}: {
  snapshot: CwlSnapshot;
  clanTag: string;
  syncedAt: string | null;
}) {
  const table = useMemo(() => standings(s), [s]);
  const place = placement(s, clanTag);
  const us = table.find((r) => r.clan.tag === clanTag);
  return (
    <div className="stack">
      <div className="panel cwl-status">
        <span className="pill live">
          <span className="dot" />
          {stateLine(s, clanTag)}
        </span>
        <span className="muted small">
          <Clock size={13} /> Updated {ago(syncedAt)}
        </span>
      </div>
      {us && (
        <div className="stat-tiles four">
          <div className="panel stat-tile">
            <strong>
              #{place}
              <span className="muted"> / {table.length}</span>
            </strong>
            <span className="muted small">League position</span>
          </div>
          <div className="panel stat-tile">
            <strong>
              {us.wins}–{us.losses}
              {us.ties ? `–${us.ties}` : ""}
            </strong>
            <span className="muted small">Won–lost</span>
          </div>
          <div className="panel stat-tile">
            <strong>{us.stars}★</strong>
            <span className="muted small">Stars (incl. win bonus)</span>
          </div>
          <div className="panel stat-tile">
            <strong>{Math.round(us.destruction)}%</strong>
            <span className="muted small">Total destruction</span>
          </div>
        </div>
      )}
      <section className="stack">
        <h2 className="display">League table</h2>
        <div className="panel leaderboard">
          <div className="lb-row cwl-row lb-head muted small">
            <span>#</span>
            <span>Clan</span>
            <span>W–L</span>
            <span>★</span>
            <span className="lb-wide">Dest. %</span>
          </div>
          {table.map((r, i) => (
            <div
              key={r.clan.tag}
              className={`lb-row cwl-row${r.clan.tag === clanTag ? " ours" : ""}`}
            >
              <span className="lb-rank">{i + 1}</span>
              <span className="lb-player">
                <ClanBadge src={r.clan.badge} />
                <span className="row-main">
                  <strong>{r.clan.name}</strong>
                  <span className="muted small">
                    {r.clan.level ? `Level ${r.clan.level}` : r.clan.tag}
                  </span>
                </span>
              </span>
              <span>
                {r.wins}–{r.losses}
              </span>
              <span className="gold-text">{r.stars}</span>
              <span className="lb-wide">{Math.round(r.destruction)}%</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          Ranked like the game: stars (with 10 bonus stars per war won), then
          total destruction.
        </p>
      </section>
    </div>
  );
}

function ClanBadge({ src }: { src: string | null }) {
  return src ? (
    <img className="clan-badge" src={src} alt="" width={34} height={34} />
  ) : (
    <span className="clan-badge placeholder">
      <Shield size={16} />
    </span>
  );
}

function Rounds({
  snapshot: s,
  clanTag,
}: {
  snapshot: CwlSnapshot;
  clanTag: string;
}) {
  const ours = ourWars(s, clanTag);
  return (
    <div className="stack">
      {s.rounds.map((round, r) => (
        <RoundCard
          key={r}
          index={r}
          war={ours[r]}
          others={round.filter((w) => w !== ours[r])}
          defaultOpen={ours[r]?.state === "inWar"}
        />
      ))}
    </div>
  );
}

function RoundCard({
  index,
  war,
  others,
  defaultOpen,
}: {
  index: number;
  war: CwlWar | null;
  others: CwlWar[];
  defaultOpen: boolean;
}) {
  if (!war)
    return (
      <section className="panel round-card pending">
        <div className="row-between">
          <h3 className="display">Round {index + 1}</h3>
          <span className="pill">Not scheduled yet</span>
        </div>
      </section>
    );
  const winner = warWinner(war);
  const result =
    war.state === "warEnded"
      ? winner === war.clan.tag
        ? "win"
        : winner === war.opponent.tag
          ? "loss"
          : "tie"
      : null;
  const timing =
    war.state === "preparation"
      ? countdown(war.startTime, "Starts")
      : war.state === "inWar"
        ? countdown(war.endTime, "Ends")
        : null;
  return (
    <details
      className={`panel round-card ${result ?? war.state}`}
      open={defaultOpen}
    >
      <summary>
        <div className="row-between">
          <h3 className="display">Round {index + 1}</h3>
          <span
            className={`pill ${result ?? (war.state === "inWar" ? "live" : "")}`}
          >
            {result === "win"
              ? "Victory"
              : result === "loss"
                ? "Defeat"
                : result === "tie"
                  ? "Tie"
                  : war.state === "inWar"
                    ? "Battle day"
                    : "Preparation"}
          </span>
        </div>
        <div className="war-score">
          <WarSide side={war.clan} teamSize={war.teamSize} align="end" />
          <span className="vs">
            <Swords size={18} />
          </span>
          <WarSide side={war.opponent} teamSize={war.teamSize} align="start" />
        </div>
        {timing && <p className="muted small center-text">{timing}</p>}
      </summary>
      {war.state !== "preparation" && (
        <div className="stack war-detail">
          <AttackTable
            title="Our attacks"
            attackers={war.clan.members ?? []}
            defenders={war.opponent.members ?? []}
            ended={war.state === "warEnded"}
          />
          <AttackTable
            title="Their attacks"
            attackers={war.opponent.members ?? []}
            defenders={war.clan.members ?? []}
            ended={war.state === "warEnded"}
          />
        </div>
      )}
      {others.length > 0 && (
        <div className="other-wars">
          <span className="muted small">Other wars this round</span>
          {others.map((w) => (
            <div key={w.warTag} className="other-war small">
              <span className={warWinner(w) === w.clan.tag ? "gold-text" : ""}>
                {w.clan.name}
              </span>
              <strong>
                {w.clan.stars}–{w.opponent.stars}
              </strong>
              <span
                className={warWinner(w) === w.opponent.tag ? "gold-text" : ""}
              >
                {w.opponent.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function WarSide({
  side,
  teamSize,
  align,
}: {
  side: CwlWar["clan"];
  teamSize: number;
  align: "start" | "end";
}) {
  return (
    <div className={`war-side ${align}`}>
      <ClanBadge src={side.badge} />
      <div className="row-main">
        <strong className="war-name">{side.name}</strong>
        <span className="war-stars display">{side.stars}★</span>
        <span className="muted small">
          {side.destruction}% · {side.attacks}/{teamSize} attacks
        </span>
      </div>
    </div>
  );
}

function AttackTable({
  title,
  attackers,
  defenders,
  ended,
}: {
  title: string;
  attackers: CwlMember[];
  defenders: CwlMember[];
  ended: boolean;
}) {
  const byTag = new Map(defenders.map((d) => [d.tag, d]));
  return (
    <div>
      <h4 className="table-title">{title}</h4>
      <div className="attack-list">
        {attackers.map((m) => {
          const a = m.attack;
          const target = a ? byTag.get(a.defenderTag) : null;
          return (
            <div key={m.tag} className={`attack-line${a ? "" : " none"}`}>
              <span className="pos">{m.mapPosition}</span>
              <span className="row-main">
                <strong>{m.name}</strong>
                <span className="muted small">
                  {a
                    ? `→ #${target?.mapPosition ?? "?"} ${target?.name ?? ""}`
                    : ended
                      ? "Missed attack"
                      : "Not attacked yet"}
                </span>
              </span>
              {a ? (
                <span className="attack-result">
                  <span className="stars-text">
                    {"★".repeat(a.stars)}
                    <span className="dim">{"★".repeat(3 - a.stars)}</span>
                  </span>
                  <span className="muted small">
                    {a.destruction}%
                    {a.duration !== null ? ` · ${formatTime(a.duration)}` : ""}
                  </span>
                </span>
              ) : (
                <span className={ended ? "error-text small" : "muted small"}>
                  {ended ? "✕" : "…"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CwlPlayers({
  snapshot: s,
  clanTag,
}: {
  snapshot: CwlSnapshot;
  clanTag: string;
}) {
  const rows = useMemo(() => playerRecords(s, clanTag), [s, clanTag]);
  const roster = s.clans.find((c) => c.tag === clanTag)?.roster.length ?? 0;
  if (!rows.length)
    return (
      <section className="panel notice">
        <p className="muted">
          Player records appear once the first battle day starts. {roster}{" "}
          players are on the CWL roster.
        </p>
      </section>
    );
  return (
    <section className="stack">
      <h2 className="display">Player records</h2>
      <div className="panel leaderboard">
        <div className="lb-row cwl-player lb-head muted small">
          <span>#</span>
          <span>Player</span>
          <span title="Stars">★</span>
          <span title="Attacks used / wars in lineup">Hits</span>
          <span className="lb-wide" title="Three-star attacks">
            3★
          </span>
          <span className="lb-wide" title="Average destruction">
            Avg %
          </span>
          <span className="lb-wide" title="Stars given up on defense">
            Def
          </span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.tag}
            className={`lb-row cwl-player${i < 3 ? ` top-${i + 1}` : ""}`}
          >
            <span className="lb-rank">{i + 1}</span>
            <span className="lb-player">
              <TownHall level={r.townHallLevel} />
              <span className="row-main">
                <strong>{r.name}</strong>
                <span className={r.missed ? "error-text small" : "muted small"}>
                  {r.missed
                    ? `${r.missed} missed`
                    : `${r.threeStars}× 3★ · ${r.destruction}%`}
                </span>
              </span>
            </span>
            <span className="gold-text">{r.stars}</span>
            <span>
              {r.attacks}/{r.wars}
            </span>
            <span className="lb-wide">{r.threeStars}</span>
            <span className="lb-wide">{r.destruction}%</span>
            <span className="lb-wide">{r.starsConceded}</span>
          </div>
        ))}
      </div>
      <p className="muted small">
        Hits = attacks used out of wars in the lineup. Def = stars given up when
        defending.
      </p>
    </section>
  );
}
