export type Format = 1 | 3 | 5;

export type Player = {
  tag: string;
  name: string;
  townHallLevel: number | null;
  clanName: string | null;
  clanTag: string | null;
  registeredAt: string;
  source: "api" | "manual";
};

// One attack each way. Stars, then destruction, then time decides the game.
export type Attack = {
  stars: number;
  destruction: number;
  seconds: number | null;
};
export type Game = { a: Attack; b: Attack };

export type MatchResult = {
  // Players at the time the result was saved. A result whose players no longer
  // match the slot (an earlier result changed) is ignored until re-entered.
  a: string;
  b: string;
  games: Game[];
  walkover: "a" | "b" | null;
  note: string;
  updatedBy: string;
  updatedAt: string;
};

export type Tournament = {
  revision: number;
  name: string;
  format: Format;
  registrationOpen: boolean;
  maxPlayers: number;
  players: Player[];
  bracket: { order: string[]; createdAt: string } | null;
  results: Record<string, MatchResult>;
  updatedAt: string;
};

export type MatchStatus = "waiting" | "ready" | "live" | "done" | "bye";

export type Score = {
  aWins: number;
  bWins: number;
  aStars: number;
  bStars: number;
  aDestruction: number;
  bDestruction: number;
  games: number;
};

export type Match = {
  id: string;
  round: number;
  index: number;
  a: string | null;
  b: string | null;
  // Feeder match ids, null for round one or a structural bye.
  aFrom: string | null;
  bFrom: string | null;
  bye: boolean;
  result: MatchResult | null;
  stale: boolean;
  score: Score;
  winner: string | null;
  status: MatchStatus;
};

export type PublicState = {
  tournament: Tournament;
  admin: string | null;
  apiConfigured: boolean;
  storage: "upstash" | "file";
};
