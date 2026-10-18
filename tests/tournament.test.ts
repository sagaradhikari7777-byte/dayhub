import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyTournament } from "../lib/storage";
import { ActionError, addPlayer, applyAdminAction } from "../lib/tournament";
import type { Player } from "../lib/types";

const player = (n: number): Player => ({
  tag: `#P${n}`,
  name: `Player ${n}`,
  townHallLevel: 15,
  clanName: null,
  clanTag: null,
  registeredAt: "",
  source: "manual",
});

const withPlayers = (n: number) => {
  const t = emptyTournament();
  for (let i = 0; i < n; i++) addPlayer(t, player(i), false);
  return t;
};

test("registration rejects duplicates, closed and full tournaments", () => {
  const t = withPlayers(2);
  assert.throws(() => addPlayer(t, player(0), false), ActionError);
  t.maxPlayers = 2;
  assert.throws(() => addPlayer(t, player(3), false), /full/);
  t.maxPlayers = 10;
  t.registrationOpen = false;
  assert.throws(() => addPlayer(t, player(3), false), /closed/);
  addPlayer(t, player(3), true);
  assert.equal(t.players.length, 3);
});

test("drawing the bracket closes registration and keeps everyone", () => {
  const t = applyAdminAction(
    withPlayers(30),
    { type: "createBracket", shuffle: true },
    "admin",
  );
  assert.equal(t.registrationOpen, false);
  assert.equal(t.bracket!.order.length, 30);
  assert.deepEqual(
    [...t.bracket!.order].sort(),
    t.players.map((p) => p.tag).sort(),
  );
  assert.throws(() => addPlayer(t, player(99), true), /drawn/);
});

test("results record the players and the admin", () => {
  let t = applyAdminAction(
    withPlayers(4),
    { type: "createBracket", shuffle: false },
    "admin",
  );
  const attack = (stars: number, destruction: number) => ({
    stars,
    destruction,
    seconds: null,
  });
  t = applyAdminAction(
    t,
    {
      type: "saveResult",
      matchId: "r0m0",
      games: [{ a: attack(3, 100), b: attack(2, 70) }],
      walkover: null,
      note: "",
    },
    "Sagar",
  );
  assert.equal(t.results.r0m0.a, "#P0");
  assert.equal(t.results.r0m0.updatedBy, "Sagar");
  assert.throws(
    () =>
      applyAdminAction(
        t,
        {
          type: "saveResult",
          matchId: "r1m0",
          games: [],
          walkover: "a",
          note: "",
        },
        "Sagar",
      ),
    /Both players/,
  );
  assert.throws(
    () => applyAdminAction(t, { type: "settings", format: 5 }, "Sagar"),
    /Clear/,
  );
});

test("the home clan defaults to #U0Y0R2GC and admins can change it", () => {
  const t = emptyTournament();
  assert.equal(t.clanTag, "#U0Y0R2GC");
  applyAdminAction(t, { type: "settings", clanTag: "2pp" }, "admin");
  assert.equal(t.clanTag, "#2PP");
  assert.throws(
    () => applyAdminAction(t, { type: "settings", clanTag: "nope!" }, "admin"),
    /clan tag/,
  );
});
