import { buildBracket, compareGame } from "./bracket";
import type { Attack, Match, Player, Tournament } from "./types";

// Numbers per player, built from saved results. Walkovers count as match wins
// and losses but add no games or attacks.
export type PlayerStats = {
  tag: string;
  name: string;
  townHallLevel: number | null;
  events: number;
  titles: number;
  finals: number;
  matchesWon: number;
  matchesLost: number;
  gamesWon: number;
  gamesLost: number;
  attacks: number;
  stars: number;
  threeStars: number;
  destruction: number; // average over attacks
  fastestThree: number | null; // seconds
};

export type EventSummary = {
  event: Tournament;
  rounds: Match[][];
  champion: Player | null;
  runnerUp: Player | null;
  final: Match | null;
  matchesPlayed: number;
  matchesTotal: number;
  attacks: number;
  threeStarRate: number | null;
};

type Totals = Omit<PlayerStats, "destruction"> & { destructionSum: number };

export function summarize(event: Tournament): EventSummary {
  const rounds = event.bracket
    ? buildBracket(event.bracket.order, event.results, event.format)
    : [];
  const final = rounds.at(-1)?.[0] ?? null;
  const find = (tag: string | null) =>
    event.players.find((p) => p.tag === tag) ?? null;
  const champion = final?.winner ? find(final.winner) : null;
  const runnerUp =
    final?.winner && champion
      ? find(final.a === final.winner ? final.b : final.a)
      : null;
  const matches = rounds.flat().filter((m) => !m.bye);
  let attacks = 0,
    threes = 0;
  for (const m of matches)
    if (!m.stale)
      for (const g of m.result?.games ?? [])
        for (const a of [g.a, g.b]) {
          attacks++;
          if (a.stars === 3) threes++;
        }
  return {
    event,
    rounds,
    champion,
    runnerUp,
    final,
    matchesPlayed: matches.filter((m) => m.status === "done").length,
    matchesTotal: matches.length,
    attacks,
    threeStarRate: attacks ? threes / attacks : null,
  };
}

export function playerStats(events: Tournament[]): PlayerStats[] {
  const totals = new Map<string, Totals>();
  const get = (p: Player) => {
    let t = totals.get(p.tag);
    if (!t) {
      t = {
        tag: p.tag,
        name: p.name,
        townHallLevel: p.townHallLevel,
        events: 0,
        titles: 0,
        finals: 0,
        matchesWon: 0,
        matchesLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        attacks: 0,
        stars: 0,
        threeStars: 0,
        destructionSum: 0,
        fastestThree: null,
      };
      totals.set(p.tag, t);
    }
    // The newest registration has the most recent name and town hall.
    t.name = p.name;
    t.townHallLevel = p.townHallLevel ?? t.townHallLevel;
    return t;
  };
  const attack = (t: Totals, a: Attack) => {
    t.attacks++;
    t.stars += a.stars;
    t.destructionSum += a.destruction;
    if (a.stars === 3) {
      t.threeStars++;
      if (a.seconds !== null && (t.fastestThree ?? Infinity) > a.seconds)
        t.fastestThree = a.seconds;
    }
  };

  for (const event of events) {
    const byTag = new Map(event.players.map((p) => [p.tag, get(p)]));
    for (const t of byTag.values()) t.events++;
    const { rounds } = summarize(event);
    rounds.forEach((round, r) => {
      for (const m of round) {
        if (m.bye || m.stale || !m.a || !m.b) continue;
        const a = byTag.get(m.a),
          b = byTag.get(m.b);
        if (!a || !b) continue;
        if (r === rounds.length - 1 && m.winner) {
          a.finals++;
          b.finals++;
          (m.winner === m.a ? a : b).titles++;
        }
        if (m.winner) {
          (m.winner === m.a ? a : b).matchesWon++;
          (m.winner === m.a ? b : a).matchesLost++;
        }
        for (const g of m.result?.games ?? []) {
          attack(a, g.a);
          attack(b, g.b);
          const c = compareGame(g);
          if (c > 0) (a.gamesWon++, b.gamesLost++);
          if (c < 0) (b.gamesWon++, a.gamesLost++);
        }
      }
    });
  }

  return [...totals.values()]
    .map(({ destructionSum, ...t }) => ({
      ...t,
      destruction: t.attacks
        ? Math.round((destructionSum / t.attacks) * 10) / 10
        : 0,
    }))
    .sort(
      (x, y) =>
        y.titles - x.titles ||
        y.matchesWon - x.matchesWon ||
        y.stars - x.stars ||
        y.destruction - x.destruction ||
        x.name.localeCompare(y.name),
    );
}

// Best performers in a set of stats, for highlight cards. Players need at
// least one attack to count.
export function highlights(stats: PlayerStats[]) {
  const active = stats.filter((s) => s.attacks > 0);
  const top = (score: (s: PlayerStats) => number) =>
    active.length
      ? active.reduce((best, s) => (score(s) > score(best) ? s : best))
      : null;
  const fastest = active
    .filter((s) => s.fastestThree !== null)
    .sort((a, b) => a.fastestThree! - b.fastestThree!)[0];
  return {
    mostStars: top((s) => s.stars),
    mostThrees: top((s) => s.threeStars),
    bestDestruction: top((s) => s.destruction),
    fastestThree: fastest ?? null,
  };
}
