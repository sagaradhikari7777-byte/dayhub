import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBracket,
  champion,
  compareGame,
  roundSizes,
  seriesWinner,
} from "../lib/bracket";
import type { Game, MatchResult } from "../lib/types";

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
  updatedBy: "test",
  updatedAt: "",
});

test("round sizes halve each round with byes for odd counts", () => {
  assert.deepEqual(roundSizes(30), [15, 8, 4, 2, 1]);
  assert.deepEqual(roundSizes(32), [16, 8, 4, 2, 1]);
  assert.deepEqual(roundSizes(7), [4, 2, 1]);
  assert.deepEqual(roundSizes(2), [1]);
  assert.deepEqual(roundSizes(1), []);
});

test("game winner: stars, then destruction, then faster time", () => {
  assert.ok(compareGame(g([3, 100], [2, 99])) > 0);
  assert.ok(compareGame(g([2, 80], [2, 91])) < 0);
  assert.ok(compareGame(g([3, 100, 150], [3, 100, 120])) < 0);
  assert.equal(compareGame(g([3, 100], [3, 100, 120])), 0);
});

test("series needs a majority of the format", () => {
  const win = g([3, 100], [1, 50]);
  const loss = g([1, 50], [3, 100]);
  assert.equal(seriesWinner({ games: [win], walkover: null }, 3), null);
  assert.equal(
    seriesWinner({ games: [win, loss, win], walkover: null }, 3),
    "a",
  );
  assert.equal(seriesWinner({ games: [win], walkover: null }, 1), "a");
  assert.equal(seriesWinner({ games: [], walkover: "b" }, 5), "b");
});

test("winners advance and byes pass through", () => {
  const order = ["#A", "#B", "#C", "#D", "#E"];
  let rounds = buildBracket(order, {}, 1);
  assert.equal(rounds[0].length, 3);
  assert.equal(rounds[0][2].status, "bye");
  // E had the round-one bye, so round two's bye goes to the first entrant.
  assert.equal(rounds[1][0].bye, true);
  assert.equal(rounds[1][0].aFrom, "r0m0");
  assert.equal(rounds[1][1].b, "#E");
  assert.equal(rounds[1][1].status, "waiting");

  const win = [g([3, 100], [0, 20])];
  rounds = buildBracket(
    order,
    { r0m0: result("#A", "#B", win), r0m1: result("#C", "#D", win) },
    1,
  );
  assert.equal(rounds[1][0].winner, "#A");
  assert.equal(rounds[1][1].a, "#C");
  assert.equal(rounds[1][1].b, "#E");
  assert.equal(rounds[1][1].status, "ready");
  assert.equal(rounds[2][0].a, "#A");
});

test("a changed earlier result makes later results stale", () => {
  const order = ["#A", "#B", "#C", "#D"];
  const aWins = [g([3, 100], [0, 20])];
  const bWins = [g([0, 20], [3, 100])];
  const results = {
    r0m0: result("#A", "#B", aWins),
    r0m1: result("#C", "#D", aWins),
    r1m0: result("#A", "#C", aWins),
  };
  let rounds = buildBracket(order, results, 1);
  assert.equal(champion(rounds), "#A");
  rounds = buildBracket(
    order,
    { ...results, r0m0: result("#A", "#B", bWins) },
    1,
  );
  assert.equal(rounds[1][0].a, "#B");
  assert.equal(rounds[1][0].stale, true);
  assert.equal(champion(rounds), null);
});

test("nobody gets byes in consecutive rounds", () => {
  for (let n = 2; n <= 70; n++) {
    const order = Array.from({ length: n }, (_, i) => `#P${i}`);
    const rounds = buildBracket(order, {}, 1);
    assert.equal(rounds.at(-1)!.length, 1, `final for ${n}`);
    for (let r = 1; r < rounds.length; r++)
      for (const m of rounds[r])
        if (m.bye) {
          const feeder = rounds[r - 1].find((f) => f.id === m.aFrom)!;
          assert.equal(feeder.bye, false, `double bye for ${n} in round ${r}`);
        }
  }
  assert.deepEqual(
    buildBracket(
      Array.from({ length: 30 }, (_, i) => `#P${i}`),
      {},
      1,
    ).map((r) => r.length),
    roundSizes(30),
  );
});

test("score totals stars and averages destruction", () => {
  const rounds = buildBracket(
    ["#A", "#B"],
    { r0m0: result("#A", "#B", [g([3, 100], [2, 80]), g([2, 90], [2, 95])]) },
    3,
  );
  const m = rounds[0][0];
  assert.equal(m.status, "live");
  assert.deepEqual(
    [m.score.aWins, m.score.bWins, m.score.aStars, m.score.bStars],
    [1, 1, 5, 4],
  );
  assert.equal(m.score.aDestruction, 95);
  assert.equal(m.score.bDestruction, 87.5);
});
