import type { Format, Game, Match, MatchResult, Score } from "./types";

export const matchId = (round: number, index: number) => `r${round}m${index}`;

export function winsNeeded(format: Format) {
  return Math.ceil(format / 2);
}

// Positive when side A wins the game, negative for B, zero for an exact tie.
export function compareGame(game: Game) {
  const { a, b } = game;
  if (a.stars !== b.stars) return a.stars - b.stars;
  if (a.destruction !== b.destruction) return a.destruction - b.destruction;
  if (a.seconds !== null && b.seconds !== null && a.seconds !== b.seconds)
    return b.seconds - a.seconds;
  return 0;
}

export function score(games: Game[]): Score {
  const s: Score = {
    aWins: 0,
    bWins: 0,
    aStars: 0,
    bStars: 0,
    aDestruction: 0,
    bDestruction: 0,
    games: games.length,
  };
  for (const game of games) {
    const c = compareGame(game);
    if (c > 0) s.aWins++;
    else if (c < 0) s.bWins++;
    s.aStars += game.a.stars;
    s.bStars += game.b.stars;
    s.aDestruction += game.a.destruction;
    s.bDestruction += game.b.destruction;
  }
  if (games.length) {
    s.aDestruction = round1(s.aDestruction / games.length);
    s.bDestruction = round1(s.bDestruction / games.length);
  }
  return s;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function seriesWinner(
  result: Pick<MatchResult, "games" | "walkover">,
  format: Format,
): "a" | "b" | null {
  if (result.walkover) return result.walkover;
  const s = score(result.games);
  const need = winsNeeded(format);
  if (s.aWins >= need && s.aWins > s.bWins) return "a";
  if (s.bWins >= need && s.bWins > s.aWins) return "b";
  return null;
}

// Number of matches in each round, counting byes. Every round pairs the
// previous round's winners. 30 players: 15, 8, 4, 2, 1.
export function roundSizes(players: number) {
  const sizes: number[] = [];
  let entrants = players;
  while (entrants > 1) {
    const matches = Math.ceil(entrants / 2);
    sizes.push(matches);
    entrants = matches;
  }
  return sizes;
}

export function roundName(round: number, total: number) {
  const fromEnd = total - round;
  if (fromEnd === 1) return "Final";
  if (fromEnd === 2) return "Semi-finals";
  if (fromEnd === 3) return "Quarter-finals";
  return `Round ${round + 1}`;
}

// Each round pairs the entrants in order. With an odd count one entrant gets a
// bye, alternating between the last and the first entrant so nobody gets byes
// in back-to-back rounds.
type Entrant = { tag: string | null; from: string | null };

export function buildBracket(
  order: string[],
  results: Record<string, MatchResult>,
  format: Format,
): Match[][] {
  const rounds: Match[][] = [];
  let entrants: Entrant[] = order.map((tag) => ({ tag, from: null }));
  let byeAtEnd = true;
  for (let r = 0; entrants.length > 1; r++) {
    const pairs: [Entrant, Entrant | null][] = [];
    let list = entrants;
    let byeFirst: Entrant | null = null;
    let byeLast: Entrant | null = null;
    if (list.length % 2) {
      if (byeAtEnd) byeLast = list.at(-1)!;
      else byeFirst = list[0];
      list = byeAtEnd ? list.slice(0, -1) : list.slice(1);
      byeAtEnd = !byeAtEnd;
    }
    if (byeFirst) pairs.push([byeFirst, null]);
    for (let i = 0; i < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
    if (byeLast) pairs.push([byeLast, null]);
    const matches = pairs.map(([a, b], i) =>
      resolve({
        id: matchId(r, i),
        round: r,
        index: i,
        a: a.tag,
        b: b?.tag ?? null,
        aFrom: a.from,
        bFrom: b?.from ?? null,
        bye: b === null,
      }),
    );
    rounds.push(matches);
    entrants = matches.map((m) => ({ tag: m.winner, from: m.id }));
  }
  return rounds;

  function resolve(
    m: Pick<
      Match,
      "id" | "round" | "index" | "a" | "b" | "aFrom" | "bFrom" | "bye"
    >,
  ): Match {
    const empty = score([]);
    if (m.bye)
      return {
        ...m,
        result: null,
        stale: false,
        score: empty,
        winner: m.a,
        status: "bye",
      };
    if (!m.a || !m.b)
      return {
        ...m,
        result: null,
        stale: false,
        score: empty,
        winner: null,
        status: "waiting",
      };
    const saved = results[m.id] ?? null;
    if (saved && (saved.a !== m.a || saved.b !== m.b))
      return {
        ...m,
        result: saved,
        stale: true,
        score: empty,
        winner: null,
        status: "ready",
      };
    if (!saved)
      return {
        ...m,
        result: null,
        stale: false,
        score: empty,
        winner: null,
        status: "ready",
      };
    const side = seriesWinner(saved, format);
    return {
      ...m,
      result: saved,
      stale: false,
      score: score(saved.games),
      winner: side === "a" ? m.a : side === "b" ? m.b : null,
      status: side ? "done" : saved.games.length ? "live" : "ready",
    };
  }
}

export function champion(rounds: Match[][]) {
  const final = rounds.at(-1)?.[0];
  return final?.winner ?? null;
}

export function findMatch(rounds: Match[][], id: string) {
  for (const round of rounds) for (const m of round) if (m.id === id) return m;
  return null;
}

export function shuffle<T>(items: T[], random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
