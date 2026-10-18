"use client";

import { Crown, Flame, Medal, Star, Target, Timer, Trophy } from "lucide-react";
import { useMemo } from "react";
import { formatDate } from "@/lib/events";
import {
  highlights,
  playerStats,
  summarize,
  type EventSummary,
  type PlayerStats,
} from "@/lib/stats";
import type { Tournament } from "@/lib/types";
import type { Actions } from "./app";
import { formatTime } from "./api";
import { TownHall } from "./register";

export function StatsPage({ state }: Actions) {
  const events = state.hub.events;
  const summaries = useMemo(() => events.map(summarize), [events]);
  const stats = useMemo(() => playerStats(events), [events]);
  const winners = summaries.filter((s) => s.champion);
  const played = stats.filter((s) => s.attacks > 0 || s.matchesWon > 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="display">Statistics</h1>
        <p className="muted">
          Champions, records and the all-time leaderboard across every event.
        </p>
      </div>

      <section className="section">
        <div className="section-title">
          <h2 className="display">
            <Trophy size={22} /> Hall of champions
          </h2>
        </div>
        {winners.length ? (
          <div className="event-grid">
            {winners.map((s) => (
              <ChampionCard key={s.event.id} summary={s} />
            ))}
          </div>
        ) : (
          <div className="panel empty">
            <Crown size={28} />
            <p>No champions yet. Winners appear here when a final is played.</p>
          </div>
        )}
      </section>

      {played.length > 0 && (
        <>
          <Highlights stats={played} title="All-time records" />
          <Leaderboard stats={played} title="All-time leaderboard" />
        </>
      )}

      <section className="section">
        <div className="section-title">
          <h2 className="display">Every event</h2>
        </div>
        <div className="panel event-rows">
          {summaries.map((s) => (
            <a
              key={s.event.id}
              className="event-row"
              href={`#event/${s.event.id}/stats`}
            >
              <div className="row-main">
                <strong>{s.event.name}</strong>
                <span className="muted small">
                  {[
                    formatDate(s.event.startsAt),
                    `${s.event.players.length} players`,
                    s.matchesTotal
                      ? `${s.matchesPlayed}/${s.matchesTotal} matches played`
                      : "Not drawn yet",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {s.champion ? (
                <span className="chip gold">
                  <Crown size={12} /> {s.champion.name}
                </span>
              ) : (
                <span className="muted small">→</span>
              )}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChampionCard({ summary: s }: { summary: EventSummary }) {
  const final = s.final;
  const score =
    final && final.winner
      ? final.result?.walkover
        ? "by walkover"
        : final.winner === final.a
          ? `${final.score.aWins}–${final.score.bWins}`
          : `${final.score.bWins}–${final.score.aWins}`
      : null;
  return (
    <a className="champion-card" href={`#event/${s.event.id}/stats`}>
      <div className="champion-card-top">
        <span className="eyebrow">{s.event.name}</span>
        {s.event.prize && <span className="chip gold">{s.event.prize}</span>}
      </div>
      <div className="champion-name">
        <span className="crown">
          <Crown size={22} />
        </span>
        <div className="row-main">
          <strong className="display">{s.champion!.name}</strong>
          <span className="muted small">
            beat {s.runnerUp?.name ?? "?"} {score} in the final
          </span>
        </div>
      </div>
      <span className="muted small">
        {[
          formatDate(s.event.startsAt),
          `${s.event.players.length} players`,
          s.threeStarRate !== null &&
            `${Math.round(s.threeStarRate * 100)}% three-star rate`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </a>
  );
}

export function EventStats({ event }: { event: Tournament }) {
  const summary = useMemo(() => summarize(event), [event]);
  const stats = useMemo(() => playerStats([event]), [event]);
  const played = stats.filter((s) => s.attacks > 0 || s.matchesWon > 0);

  if (!event.bracket)
    return (
      <section className="panel notice">
        <h2>No stats yet</h2>
        <p className="muted">
          Stats appear once the bracket is drawn and results come in.
        </p>
      </section>
    );

  return (
    <div className="stack">
      {summary.champion && <ChampionCard summary={summary} />}
      <div className="stat-tiles">
        <Tile
          label="Matches played"
          value={`${summary.matchesPlayed}/${summary.matchesTotal}`}
        />
        <Tile label="Attacks" value={summary.attacks} />
        <Tile
          label="3-star rate"
          value={
            summary.threeStarRate === null
              ? "–"
              : `${Math.round(summary.threeStarRate * 100)}%`
          }
        />
      </div>
      {played.length > 0 ? (
        <>
          <Highlights stats={played} title="Event records" />
          <Leaderboard stats={played} title="Event leaderboard" />
        </>
      ) : (
        <p className="muted">No results entered yet.</p>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel stat-tile">
      <strong>{value}</strong>
      <span className="muted small">{label}</span>
    </div>
  );
}

function Highlights({ stats, title }: { stats: PlayerStats[]; title: string }) {
  const h = highlights(stats);
  const cards = [
    {
      icon: Star,
      label: "Most stars",
      who: h.mostStars,
      value: h.mostStars && `${h.mostStars.stars}★`,
    },
    {
      icon: Flame,
      label: "Most 3-stars",
      who: h.mostThrees,
      value: h.mostThrees && `${h.mostThrees.threeStars}`,
    },
    {
      icon: Target,
      label: "Best avg destruction",
      who: h.bestDestruction,
      value: h.bestDestruction && `${h.bestDestruction.destruction}%`,
    },
    {
      icon: Timer,
      label: "Fastest 3-star",
      who: h.fastestThree,
      value: h.fastestThree && formatTime(h.fastestThree.fastestThree),
    },
  ].filter((c) => c.who);
  if (!cards.length) return null;
  return (
    <section className="section">
      <div className="section-title">
        <h2 className="display">
          <Medal size={22} /> {title}
        </h2>
      </div>
      <div className="highlights">
        {cards.map(({ icon: Icon, label, who, value }) => (
          <div key={label} className="panel highlight">
            <span className="highlight-icon">
              <Icon size={18} />
            </span>
            <span className="muted small">{label}</span>
            <strong className="display">{value}</strong>
            <span className="highlight-who">{who!.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Leaderboard({
  stats,
  title,
}: {
  stats: PlayerStats[];
  title: string;
}) {
  return (
    <section className="section">
      <div className="section-title">
        <h2 className="display">{title}</h2>
      </div>
      <div className="panel leaderboard">
        <div className="lb-row lb-head muted small">
          <span>#</span>
          <span>Player</span>
          <span title="Titles">
            <Crown size={13} />
          </span>
          <span title="Matches won–lost">W–L</span>
          <span title="Total stars">★</span>
          <span className="lb-wide" title="Three-star attacks">
            3★
          </span>
          <span className="lb-wide" title="Average destruction">
            Avg %
          </span>
        </div>
        {stats.map((s, i) => (
          <div key={s.tag} className={`lb-row${i < 3 ? ` top-${i + 1}` : ""}`}>
            <span className="lb-rank">{i + 1}</span>
            <span className="lb-player">
              <TownHall level={s.townHallLevel} />
              <span className="row-main">
                <strong>{s.name}</strong>
                <span className="muted small">
                  {[
                    s.events > 1 && `${s.events} events`,
                    `${s.destruction}% avg`,
                    `${s.threeStars}× 3★`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </span>
            <span className={s.titles ? "gold-text" : "muted"}>{s.titles}</span>
            <span>
              {s.matchesWon}–{s.matchesLost}
            </span>
            <span>{s.stars}</span>
            <span className="lb-wide">{s.threeStars}</span>
            <span className="lb-wide">{s.destruction}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}
