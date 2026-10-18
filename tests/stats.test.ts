import assert from "node:assert/strict";
import { test } from "node:test";
import { highlights, playerStats, summarize } from "../lib/stats";
import { newEvent } from "../lib/storage";
import type { Game, MatchResult, Player } from "../lib/types";

const player = (n: number): Player => ({
  tag: `#P${n}`,
  name: `Player ${n}`,
  townHallLevel: 16,
  clanName: null,
  clanTag: null,
  registeredAt: "",
  source: "manual",
});
const g = (
  a: [number, number, number?],
  b: [number, number, number?],
): Game => ({
  a: { stars: a[0], destruction: a[1], seconds: a[2] ?? null },
  b: { stars: b[0], destruction: b[1], seconds: b[2] ?? null },
});
const result = (a: string, b: string, games: Game[]): MatchResult => ({
  a,
  b,
  games,
  walkover: null,
  note: "",
  updatedBy: "t",
  updatedAt: "",
});

// 4 players, single game: P0 beats P1, P2 beats P3, P0 beats P2 in the final.
function finishedEvent() {
  const e = newEvent("Cup");
  e.format = 1;
  e.players = [0, 1, 2, 3].map(player);
  e.bracket = { order: ["#P0", "#P1", "#P2", "#P3"], createdAt: "" };
  e.results = {
    r0m0: result("#P0", "#P1", [g([3, 100, 120], [2, 80])]),
    r0m1: result("#P2", "#P3", [g([2, 90], [1, 60])]),
    r1m0: result("#P0", "#P2", [g([3, 100, 95], [3, 100, 130])]),
  };
  return e;
}

test("summary names the champion and runner-up", () => {
  const s = summarize(finishedEvent());
  assert.equal(s.champion?.name, "Player 0");
  assert.equal(s.runnerUp?.name, "Player 2");
  assert.equal(s.matchesPlayed, 3);
  assert.equal(s.attacks, 6);
  assert.equal(s.threeStarRate, 3 / 6);
});

test("player stats add up across events", () => {
  const second = finishedEvent();
  const stats = playerStats([finishedEvent(), second]);
  const p0 = stats[0];
  assert.equal(p0.tag, "#P0");
  assert.equal(p0.titles, 2);
  assert.equal(p0.finals, 2);
  assert.equal(p0.events, 2);
  assert.equal(p0.matchesWon, 4);
  assert.equal(p0.matchesLost, 0);
  assert.equal(p0.stars, 12);
  assert.equal(p0.threeStars, 4);
  assert.equal(p0.destruction, 100);
  assert.equal(p0.fastestThree, 95);
  const p2 = stats.find((s) => s.tag === "#P2")!;
  assert.equal(p2.finals, 2);
  assert.equal(p2.titles, 0);
  assert.equal(p2.matchesWon, 2);
  assert.equal(p2.matchesLost, 2);
  const h = highlights(stats);
  assert.equal(h.mostStars?.tag, "#P0");
  assert.equal(h.fastestThree?.tag, "#P0");
});

test("events without a bracket count entries only", () => {
  const e = newEvent("Open");
  e.players = [player(1)];
  const [s] = playerStats([e]);
  assert.equal(s.events, 1);
  assert.equal(s.attacks, 0);
  assert.equal(highlights([s]).mostStars, null);
});
