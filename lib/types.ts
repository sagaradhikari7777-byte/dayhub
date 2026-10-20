export type Format = 1 | 3 | 5;

export type Player = {
  tag: string;
  name: string;
  townHallLevel: number | null;
  clanName: string | null;
  clanTag: string | null;
  registeredAt: string;
  source: "api" | "manual";
  // True when they proved ownership with their in-game API token.
  verified?: boolean;
};

// One attack each way. Stars, then destruction, then time decides the game.
export type Attack = {
  stars: number;
  destruction: number;
  seconds: number | null;
};
export type Game = { a: Attack; b: Attack };

// Matches can be played in the game's Hard Mode.
export type BattleMode = "normal" | "hard";

export type MatchResult = {
  // Players at the time the result was saved. A result whose players no longer
  // match the slot (an earlier result changed) is ignored until re-entered.
  a: string;
  b: string;
  games: Game[];
  walkover: "a" | "b" | null;
  // Missing on results saved before modes existed: treat as normal.
  mode?: BattleMode;
  note: string;
  updatedBy: string;
  updatedAt: string;
};

import type { CwlInfo } from "./cwl";

// One event, e.g. "King of the Hill". A knockout event has its own players
// and bracket; a CWL event tracks a Clan War League season from the API.
export type Tournament = {
  id: string;
  kind: "knockout" | "cwl";
  name: string;
  description: string;
  // ISO date (yyyy-mm-dd) or null when not scheduled yet.
  startsAt: string | null;
  prize: string;
  format: Format;
  registrationOpen: boolean;
  maxPlayers: number;
  players: Player[];
  bracket: { order: string[]; createdAt: string } | null;
  results: Record<string, MatchResult>;
  rules: string[];
  cwl: CwlInfo | null;
  createdAt: string;
};

export type Hub = {
  revision: number;
  // The clan whose roster the Register page opens on.
  clanTag: string;
  rules: string[];
  // Players must prove they own the account (in-game API token) to register.
  requireVerification: boolean;
  events: Tournament[];
  // Last time the API was asked whether a CWL season is running.
  cwlCheckedAt: string | null;
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
  hub: Hub;
  admin: string | null;
  apiConfigured: boolean;
  storage: "upstash" | "file";
};
