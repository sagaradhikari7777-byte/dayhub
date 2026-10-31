// Team league: leaders captain teams of randomly drawn players, every team
// plays every other once, and the top two play a final over two wars.
import type { BattleMode, Player, Tournament } from "./types";

export type Leader = { name: string; tag: string | null };

export type Strength = { heroes: number; equipment: number };

export type TeamAttack = {
  player: string; // tag
  stars: number;
  destruction: number;
  seconds: number | null;
};

export type TeamMatchResult = {
  // Team indexes when saved; a result whose teams no longer match the
  // fixture (the finalists changed) is ignored until re-entered.
  teams: [number, number];
  attacks: [TeamAttack[], TeamAttack[]];
  mode: BattleMode;
  note: string;
  updatedBy: string;
  updatedAt: string;
};

export type TeamsInfo = {
  leaders: Leader[];
  teamNames: string[];
  minTownHall: number;
  draw: {
    teams: string[][]; // player tags per team
    strengths: Record<string, Strength>;
    createdAt: string;
  } | null;
  results: Record<string, TeamMatchResult>;
};

export const DEFAULT_LEADERS: Leader[] = [
  { name: "Mr.Fox", tag: "#LR0JUUVJP" },
  { name: "༺Obito Đ Kamui༻", tag: "#2VPJP8LJV" },
  { name: "PaiN~Legend!", tag: "#20Q9UPLRY" },
  { name: "Nadeem_!", tag: "#P29LR2JVV" },
];

export const DEFAULT_TEAM_NAMES = [
  "Voldemort A",
  "Voldemort B",
  "Voldemort C",
  "Voldemort D",
];

export const DEFAULT_TEAM_RULES = [
  "Town Hall 18 only. Registration is first come, first served and closes at 20 players.",
  "The four leaders captain Voldemort A, B, C and D. Leaders don't register; the 20 players are drawn randomly into teams of 5, balanced by hero and equipment levels.",
  "Group stage: every team plays every other team once (6 matches). A win is 3 points, a draw 1.",
  "In each match every player makes one attack. The team with more stars wins; ties go to the higher destruction, then the faster total time.",
  "Missed attacks count as 0 stars and 0%.",
  "The top two teams play the final over two wars. Most stars across both wins; ties go to destruction, then a deciding war.",
  "The winning team's leader receives the prize and distributes it as they see fit.",
  "Admin decisions are final.",
];

export function newTeamsInfo(): TeamsInfo {
  return {
    leaders: DEFAULT_LEADERS,
    teamNames: DEFAULT_TEAM_NAMES,
    minTownHall: 18,
    draw: null,
    results: {},
  };
}

export const strengthOf = (s: Strength | undefined) =>
  s ? s.heroes + s.equipment : 0;

// Random but balanced: rank players by strength, split them into tiers of
// one player per team, and deal each tier to the teams in a random order.
// Of many such deals, pick randomly among the most even ones.
export function drawTeams(
  tags: string[],
  strengths: Record<string, Strength>,
  teamCount: number,
  random = Math.random,
): string[][] {
  if (tags.length < teamCount * 2 || tags.length % teamCount)
    throw new Error(
      `Need a multiple of ${teamCount} players (at least ${teamCount * 2})`,
    );
  const ranked = [...tags].sort(
    (a, b) =>
      strengthOf(strengths[b]) - strengthOf(strengths[a]) || random() - 0.5,
  );
  const deals: { teams: string[][]; spread: number }[] = [];
  for (let attempt = 0; attempt < 400; attempt++) {
    const teams: string[][] = Array.from({ length: teamCount }, () => []);
    for (let i = 0; i < ranked.length; i += teamCount) {
      const order = shuffled(teamCount, random);
      ranked
        .slice(i, i + teamCount)
        .forEach((tag, j) => teams[order[j]].push(tag));
    }
    const totals = teams.map((t) =>
      t.reduce((n, tag) => n + strengthOf(strengths[tag]), 0),
    );
    deals.push({ teams, spread: Math.max(...totals) - Math.min(...totals) });
  }
  deals.sort((a, b) => a.spread - b.spread);
  const best = deals.slice(0, 15);
  return best[Math.floor(random() * best.length)].teams;
}

function shuffled(n: number, random: () => number) {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// --- Fixtures and results ---

export type TeamFixture = {
  id: string;
  stage: "group" | "final";
  label: string;
  teams: [number, number] | null; // null until the finalists are known
};

const GROUP_PAIRS: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

export type SideScore = {
  stars: number;
  destruction: number; // war-style: total destruction / team size
  seconds: number | null; // total, when every attack has a time
  attacks: number;
};

export function sideScore(attacks: TeamAttack[], teamSize: number): SideScore {
  const timed = attacks.every((a) => a.seconds !== null);
  return {
    stars: attacks.reduce((n, a) => n + a.stars, 0),
    destruction:
      Math.round(
        (attacks.reduce((n, a) => n + a.destruction, 0) /
          Math.max(teamSize, 1)) *
          10,
      ) / 10,
    seconds:
      timed && attacks.length
        ? attacks.reduce((n, a) => n + (a.seconds ?? 0), 0)
        : null,
    attacks: attacks.length,
  };
}

// Positive when the first side wins, negative for the second, 0 for a draw.
export function compareSides(x: SideScore, y: SideScore) {
  if (x.stars !== y.stars) return x.stars - y.stars;
  if (x.destruction !== y.destruction) return x.destruction - y.destruction;
  if (x.seconds !== null && y.seconds !== null && x.seconds !== y.seconds)
    return y.seconds - x.seconds;
  return 0;
}

export type PlayedMatch = TeamFixture & {
  result: TeamMatchResult | null;
  stale: boolean;
  score: [SideScore, SideScore] | null;
  winner: number | null; // team index; null for a draw or not played
};

export type Standing = {
  team: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  starsFor: number;
  starsAgainst: number;
  destruction: number;
};

export type LeagueView = {
  teamSize: number;
  group: PlayedMatch[];
  table: Standing[];
  groupDone: boolean;
  finalists: [number, number] | null;
  final: PlayedMatch[];
  finalTotals: [SideScore, SideScore] | null;
  champion: number | null;
};

function play(
  fixture: TeamFixture,
  info: TeamsInfo,
  teamSize: number,
): PlayedMatch {
  const saved = info.results[fixture.id] ?? null;
  if (!fixture.teams || !saved)
    return {
      ...fixture,
      result: null,
      stale: false,
      score: null,
      winner: null,
    };
  const [x, y] = fixture.teams;
  // Stored the other way round: swap sides.
  const flipped = saved.teams[0] === y && saved.teams[1] === x;
  if (!flipped && (saved.teams[0] !== x || saved.teams[1] !== y))
    return {
      ...fixture,
      result: saved,
      stale: true,
      score: null,
      winner: null,
    };
  const [ax, ay] = flipped
    ? [saved.attacks[1], saved.attacks[0]]
    : saved.attacks;
  const score: [SideScore, SideScore] = [
    sideScore(ax, teamSize),
    sideScore(ay, teamSize),
  ];
  const c = compareSides(score[0], score[1]);
  return {
    ...fixture,
    result: saved,
    stale: false,
    score,
    winner: c > 0 ? x : c < 0 ? y : null,
  };
}

export function leagueView(event: Tournament): LeagueView | null {
  const info = event.teams;
  if (!info?.draw) return null;
  const names = info.teamNames;
  const teamSize = info.draw.teams[0]?.length ?? 5;
  const group = GROUP_PAIRS.map(([x, y], i) =>
    play(
      {
        id: `g${i + 1}`,
        stage: "group",
        label: `${names[x]} vs ${names[y]}`,
        teams: [x, y],
      },
      info,
      teamSize,
    ),
  );

  const table: Standing[] = names.map((_, team) => ({
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    points: 0,
    starsFor: 0,
    starsAgainst: 0,
    destruction: 0,
  }));
  for (const m of group) {
    if (!m.score || !m.teams) continue;
    m.teams.forEach((team, side) => {
      const row = table[team];
      const mine = m.score![side],
        theirs = m.score![1 - side];
      row.played++;
      row.starsFor += mine.stars;
      row.starsAgainst += theirs.stars;
      row.destruction =
        Math.round((row.destruction + mine.destruction) * 10) / 10;
      if (m.winner === team) {
        row.won++;
        row.points += 3;
      } else if (m.winner === null) {
        row.drawn++;
        row.points += 1;
      } else row.lost++;
    });
  }
  table.sort(
    (a, b) =>
      b.points - a.points ||
      b.starsFor - b.starsAgainst - (a.starsFor - a.starsAgainst) ||
      b.starsFor - a.starsFor ||
      b.destruction - a.destruction,
  );

  const groupDone = group.every((m) => m.score);
  const finalists: [number, number] | null = groupDone
    ? [table[0].team, table[1].team]
    : null;
  const finalFixture = (id: string, label: string) =>
    play(
      {
        id,
        stage: "final",
        label,
        teams: finalists,
      },
      info,
      teamSize,
    );
  const final = [
    finalFixture("f1", "Final · War 1"),
    finalFixture("f2", "Final · War 2"),
  ];
  let finalTotals: [SideScore, SideScore] | null = null;
  let champion: number | null = null;
  const sum = (legs: PlayedMatch[], side: 0 | 1): SideScore =>
    legs.reduce(
      (t, m) => {
        const s = m.score![side];
        return {
          stars: t.stars + s.stars,
          destruction: Math.round((t.destruction + s.destruction) * 10) / 10,
          seconds:
            t.seconds !== null && s.seconds !== null
              ? t.seconds + s.seconds
              : null,
          attacks: t.attacks + s.attacks,
        };
      },
      { stars: 0, destruction: 0, seconds: 0, attacks: 0 } as SideScore,
    );
  if (finalists && final.every((m) => m.score)) {
    finalTotals = [sum(final, 0), sum(final, 1)];
    const c = compareSides(finalTotals[0], finalTotals[1]);
    if (c !== 0) champion = c > 0 ? finalists[0] : finalists[1];
    else {
      // Level after two wars: a deciding war.
      const decider = finalFixture("f3", "Final · Decider");
      final.push(decider);
      if (decider.winner !== null) champion = decider.winner;
    }
  }
  return {
    teamSize,
    group,
    table,
    groupDone,
    finalists,
    final,
    finalTotals,
    champion,
  };
}

export function findTeamFixture(view: LeagueView, id: string) {
  return [...view.group, ...view.final].find((m) => m.id === id) ?? null;
}

export function teamOf(info: TeamsInfo, tag: string) {
  return info.draw?.teams.findIndex((t) => t.includes(tag)) ?? -1;
}

export function playerStrengthRows(event: Tournament, team: number) {
  const info = event.teams!;
  const byTag = new Map<string, Player>(event.players.map((p) => [p.tag, p]));
  return (info.draw?.teams[team] ?? []).map((tag) => ({
    tag,
    player: byTag.get(tag) ?? null,
    strength: info.draw!.strengths[tag],
  }));
}
