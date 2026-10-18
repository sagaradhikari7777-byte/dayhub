import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyHub, migrateLegacy, newEvent } from "../lib/storage";
import {
  ActionError,
  addPlayer,
  applyAdminAction,
  type AdminAction,
} from "../lib/tournament";
import type { Hub, Player } from "../lib/types";

const player = (n: number): Player => ({
  tag: `#P${n}`,
  name: `Player ${n}`,
  townHallLevel: 15,
  clanName: null,
  clanTag: null,
  registeredAt: "",
  source: "manual",
});

// A hub whose only event has n players. Returns the hub and a getter for the
// event, since actions replace the event object.
const withPlayers = (n: number) => {
  const hub = emptyHub();
  for (let i = 0; i < n; i++) addPlayer(hub.events[0], player(i), false);
  return hub;
};
const act = (hub: Hub, action: object, admin = "admin") =>
  applyAdminAction(
    hub,
    { eventId: hub.events[0].id, ...action } as AdminAction,
    admin,
  );

test("registration rejects duplicates, closed and full tournaments", () => {
  const t = withPlayers(2).events[0];
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
  const t = act(withPlayers(30), { type: "createBracket", shuffle: true })
    .events[0];
  assert.equal(t.registrationOpen, false);
  assert.equal(t.bracket!.order.length, 30);
  assert.deepEqual(
    [...t.bracket!.order].sort(),
    t.players.map((p) => p.tag).sort(),
  );
  assert.throws(() => addPlayer(t, player(99), true), /drawn/);
});

test("results record the players and the admin", () => {
  let hub = act(withPlayers(4), { type: "createBracket", shuffle: false });
  const attack = (stars: number, destruction: number) => ({
    stars,
    destruction,
    seconds: null,
  });
  hub = act(
    hub,
    {
      type: "saveResult",
      matchId: "r0m0",
      games: [{ a: attack(3, 100), b: attack(2, 70) }],
      walkover: null,
      note: "",
    },
    "Sagar",
  );
  const t = hub.events[0];
  assert.equal(t.results.r0m0.a, "#P0");
  assert.equal(t.results.r0m0.updatedBy, "Sagar");
  assert.throws(
    () =>
      act(hub, {
        type: "saveResult",
        matchId: "r1m0",
        games: [],
        walkover: "a",
        note: "",
      }),
    /Both players/,
  );
  assert.throws(() => act(hub, { type: "settings", format: 5 }), /Clear/);
});

test("the home clan defaults to #U0Y0R2GC and admins can change it", () => {
  const hub = emptyHub();
  assert.equal(hub.clanTag, "#U0Y0R2GC");
  applyAdminAction(hub, { type: "hubSettings", clanTag: "2pp" }, "admin");
  assert.equal(hub.clanTag, "#2PP");
  assert.throws(
    () => applyAdminAction(hub, { type: "hubSettings", clanTag: "nope!" }, "a"),
    /clan tag/,
  );
});

test("events are independent", () => {
  const hub = withPlayers(3);
  applyAdminAction(hub, { type: "createEvent", name: "King of the Hill" }, "a");
  const [first, second] = hub.events;
  assert.equal(second.name, "King of the Hill");
  assert.equal(second.players.length, 0);
  addPlayer(second, player(0), false);
  act(hub, { type: "createBracket", shuffle: false });
  assert.ok(hub.events[0].bracket);
  assert.equal(hub.events[1].bracket, null);
  applyAdminAction(hub, { type: "deleteEvent", eventId: first.id }, "a");
  assert.deepEqual(
    hub.events.map((e) => e.name),
    ["King of the Hill"],
  );
  assert.throws(
    () =>
      applyAdminAction(
        hub,
        { type: "removePlayer", eventId: first.id, tag: "#P0" },
        "a",
      ),
    /no longer exists/,
  );
});

test("the old single tournament becomes the first event", () => {
  const hub = migrateLegacy(
    JSON.stringify({
      revision: 7,
      name: "Season 1",
      format: 5,
      registrationOpen: false,
      maxPlayers: 32,
      clanTag: "#2PP",
      players: [player(1)],
      bracket: null,
      results: {},
    }),
  );
  assert.equal(hub.revision, 0);
  assert.equal(hub.clanTag, "#2PP");
  assert.equal(hub.events.length, 1);
  const [event] = hub.events;
  assert.equal(event.name, "Season 1");
  assert.equal(event.format, 5);
  assert.equal(event.players.length, 1);
  assert.ok(newEvent("x").id !== event.id);
});
