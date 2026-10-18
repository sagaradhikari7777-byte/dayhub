// Clan War League data, saved into the CWL event as it comes in so it stays
// available after Supercell's API stops serving the season.

export type CwlAttack = {
  attackerTag: string;
  defenderTag: string;
  stars: number;
  destruction: number;
  duration: number | null;
  order: number;
};

export type CwlMember = {
  tag: string;
  name: string;
  townHallLevel: number | null;
  mapPosition: number;
  attack: CwlAttack | null;
};

export type CwlSide = {
  tag: string;
  name: string;
  badge: string | null;
  stars: number;
  destruction: number;
  attacks: number;
  // Only kept for wars our clan plays in.
  members: CwlMember[] | null;
};

export type CwlWar = {
  warTag: string;
  state: "preparation" | "inWar" | "warEnded";
  teamSize: number;
  startTime: string | null;
  endTime: string | null;
  clan: CwlSide;
  opponent: CwlSide;
};

export type CwlClan = {
  tag: string;
  name: string;
  level: number | null;
  badge: string | null;
  roster: { tag: string; name: string; townHallLevel: number | null }[];
};

export type CwlSnapshot = {
  season: string; // yyyy-mm
  state: "preparation" | "inWar" | "ended";
  clans: CwlClan[];
  // rounds[r] lists that round's wars; an empty list means not scheduled yet.
  rounds: CwlWar[][];
};

export type CwlInfo = {
  season: string;
  snapshot: CwlSnapshot | null;
  syncedAt: string | null;
};

// --- Raw API shapes (only the fields used) ---

type RawBadges = { small?: string; medium?: string; large?: string };
type RawAttack = {
  attackerTag: string;
  defenderTag: string;
  stars: number;
  destructionPercentage: number;
  duration?: number;
  order: number;
};
type RawWarMember = {
  tag: string;
  name: string;
  townhallLevel?: number;
  mapPosition: number;
  attacks?: RawAttack[];
};
type RawWarClan = {
  tag: string;
  name: string;
  badgeUrls?: RawBadges;
  attacks?: number;
  stars?: number;
  destructionPercentage?: number;
  members?: RawWarMember[];
};
export type RawWar = {
  state: string;
  teamSize?: number;
  startTime?: string;
  endTime?: string;
  clan: RawWarClan;
  opponent: RawWarClan;
};
export type RawLeagueGroup = {
  state: string;
  season: string;
  clans: {
    tag: string;
    name: string;
    clanLevel?: number;
    badgeUrls?: RawBadges;
    members?: { tag: string; name: string; townHallLevel?: number }[];
  }[];
  rounds: { warTags: string[] }[];
};

// Supercell times look like 20261019T205448.000Z.
export function apiTime(value: string | undefined) {
  if (!value) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

function side(raw: RawWarClan, keepMembers: boolean): CwlSide {
  return {
    tag: raw.tag,
    name: raw.name,
    badge: raw.badgeUrls?.small ?? null,
    stars: raw.stars ?? 0,
    destruction: Math.round((raw.destructionPercentage ?? 0) * 10) / 10,
    attacks: raw.attacks ?? 0,
    members: keepMembers
      ? (raw.members ?? [])
          .map((m) => {
            const a = m.attacks?.[0];
            return {
              tag: m.tag,
              name: m.name,
              townHallLevel: m.townhallLevel ?? null,
              mapPosition: m.mapPosition,
              attack: a
                ? {
                    attackerTag: a.attackerTag,
                    defenderTag: a.defenderTag,
                    stars: a.stars,
                    destruction: a.destructionPercentage,
                    duration: a.duration ?? null,
                    order: a.order,
                  }
                : null,
            };
          })
          .sort((x, y) => x.mapPosition - y.mapPosition)
      : null,
  };
}

// Our clan always ends up on the `clan` side.
export function normalizeWar(
  warTag: string,
  raw: RawWar,
  ourTag: string,
): CwlWar {
  const ours = raw.opponent.tag === ourTag;
  const involved = ours || raw.clan.tag === ourTag;
  const [a, b] = ours ? [raw.opponent, raw.clan] : [raw.clan, raw.opponent];
  return {
    warTag,
    state:
      raw.state === "warEnded" || raw.state === "inWar"
        ? raw.state
        : "preparation",
    teamSize: raw.teamSize ?? 15,
    startTime: apiTime(raw.startTime),
    endTime: apiTime(raw.endTime),
    clan: side(a, involved),
    opponent: side(b, involved),
  };
}

export function normalizeGroup(
  raw: RawLeagueGroup,
  wars: Map<string, CwlWar>,
): CwlSnapshot {
  return {
    season: raw.season,
    state:
      raw.state === "ended"
        ? "ended"
        : raw.state === "inWar"
          ? "inWar"
          : "preparation",
    clans: raw.clans.map((c) => ({
      tag: c.tag,
      name: c.name,
      level: c.clanLevel ?? null,
      badge: c.badgeUrls?.small ?? null,
      roster: (c.members ?? []).map((m) => ({
        tag: m.tag,
        name: m.name,
        townHallLevel: m.townHallLevel ?? null,
      })),
    })),
    rounds: raw.rounds.map((r) =>
      r.warTags.flatMap((t) => {
        const war = wars.get(t);
        return war ? [war] : [];
      }),
    ),
  };
}

export function seasonLabel(season: string) {
  const [y, m] = season.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en", {
    month: "long",
    year: "numeric",
  });
}

// --- Views ---

export function warWinner(war: CwlWar): string | null {
  if (war.state === "preparation") return null;
  const { clan: a, opponent: b } = war;
  if (a.stars !== b.stars) return a.stars > b.stars ? a.tag : b.tag;
  if (a.destruction !== b.destruction)
    return a.destruction > b.destruction ? a.tag : b.tag;
  return null;
}

export type Standing = {
  clan: CwlClan;
  wins: number;
  losses: number;
  ties: number;
  stars: number; // includes the 10-star bonus per war won
  destruction: number; // sum of destruction %, the in-game tiebreaker
};

// League table as the game ranks it: stars (with +10 per win), then total
// destruction. Wars still in progress count with their current score.
export function standings(s: CwlSnapshot): Standing[] {
  const table = new Map<string, Standing>(
    s.clans.map((clan) => [
      clan.tag,
      { clan, wins: 0, losses: 0, ties: 0, stars: 0, destruction: 0 },
    ]),
  );
  for (const war of s.rounds.flat()) {
    if (war.state === "preparation") continue;
    const winner = war.state === "warEnded" ? warWinner(war) : null;
    for (const [me, them] of [
      [war.clan, war.opponent],
      [war.opponent, war.clan],
    ]) {
      const row = table.get(me.tag);
      if (!row) continue;
      row.stars += me.stars;
      row.destruction += me.destruction * war.teamSize;
      if (war.state !== "warEnded") continue;
      if (winner === me.tag) {
        row.wins++;
        row.stars += 10;
      } else if (winner === them.tag) row.losses++;
      else row.ties++;
    }
  }
  return [...table.values()].sort(
    (a, b) => b.stars - a.stars || b.destruction - a.destruction,
  );
}

export function ourWars(s: CwlSnapshot, ourTag: string) {
  return s.rounds.map(
    (round) => round.find((w) => w.clan.tag === ourTag) ?? null,
  );
}

export type CwlPlayer = {
  tag: string;
  name: string;
  townHallLevel: number | null;
  wars: number; // rounds in the lineup
  attacks: number;
  missed: number; // ended wars in the lineup without an attack
  stars: number;
  threeStars: number;
  destruction: number; // average per attack
  starsConceded: number;
};

export function playerRecords(s: CwlSnapshot, ourTag: string): CwlPlayer[] {
  const rows = new Map<string, CwlPlayer & { destructionSum: number }>();
  for (const war of ourWars(s, ourTag)) {
    if (!war || war.state === "preparation") continue;
    const conceded = new Map<string, number>();
    for (const m of war.opponent.members ?? [])
      if (m.attack)
        conceded.set(
          m.attack.defenderTag,
          Math.max(conceded.get(m.attack.defenderTag) ?? 0, m.attack.stars),
        );
    for (const m of war.clan.members ?? []) {
      let row = rows.get(m.tag);
      if (!row) {
        row = {
          tag: m.tag,
          name: m.name,
          townHallLevel: m.townHallLevel,
          wars: 0,
          attacks: 0,
          missed: 0,
          stars: 0,
          threeStars: 0,
          destruction: 0,
          destructionSum: 0,
          starsConceded: 0,
        };
        rows.set(m.tag, row);
      }
      row.name = m.name;
      row.townHallLevel = m.townHallLevel ?? row.townHallLevel;
      row.wars++;
      row.starsConceded += conceded.get(m.tag) ?? 0;
      if (m.attack) {
        row.attacks++;
        row.stars += m.attack.stars;
        row.destructionSum += m.attack.destruction;
        if (m.attack.stars === 3) row.threeStars++;
      } else if (war.state === "warEnded") row.missed++;
    }
  }
  return [...rows.values()]
    .map(({ destructionSum, ...r }) => ({
      ...r,
      destruction: r.attacks
        ? Math.round((destructionSum / r.attacks) * 10) / 10
        : 0,
    }))
    .sort(
      (a, b) =>
        b.stars - a.stars ||
        b.destruction - a.destruction ||
        a.missed - b.missed ||
        a.name.localeCompare(b.name),
    );
}

export function placement(s: CwlSnapshot, ourTag: string) {
  const index = standings(s).findIndex((r) => r.clan.tag === ourTag);
  return index < 0 ? null : index + 1;
}

export const DEFAULT_CWL_RULES = [
  "Sign up for this CWL event before the season starts. Only signed-up players get a spot in the lineup.",
  "Use your attack every war day you're in the lineup. A missed attack can cost your spot next season.",
  "Attack your mirror (the same map number) unless an admin tells you otherwise.",
  "Go for 3 stars. If that's unlikely, make sure of 2 stars.",
  "Don't have all your heroes upgrading during CWL week.",
  "Bonus medals go to players with the most stars and no missed attacks.",
  "Admins set the lineup each day. Their decisions are final.",
];
