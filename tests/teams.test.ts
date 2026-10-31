import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyHub, newTeamsEvent } from "../lib/storage";
import {
  drawTeams,
  leagueView,
  strengthOf,
  type Strength,
  type TeamAttack,
} from "../lib/teams";
import { addPlayer, applyAdminAction } from "../lib/tournament";
import type { Hub, Player } from "../lib/types";

const player = (n: number, th = 18): Player => ({
  tag: `#P${n}`,
  name: `Player ${n}`,
  townHallLevel: th,
  clanName: null,
  clanTag: null,
  registeredAt: "",
  source: "api",
  // Strengths spread from 600 to 790 so balance matters.
  strength: { heroes: 400 + n * 6, equipment: 200 + n * 4 },
});

function league(players = 20) {
  const hub = emptyHub();
  applyAdminAction(hub, { type: "createTeamsEvent", name: "Team League" }, "a");
  const event = hub.events.at(-1)!;
  for (let i = 0; i < players; i++) addPlayer(event, player(i), false);
  return hub;
}
const ev = (hub: Hub) => hub.events.at(-1)!;
const act = (hub: Hub, action: object) =>
  applyAdminAction(
    hub,
    { eventId: ev(hub).id, ...action } as Parameters<
      typeof applyAdminAction
    >[1],
    "Sagar",
  );

test("registration: TH18 only, leaders don't register, 20 max", () => {
  const hub = league(19);
  const e = ev(hub);
  assert.throws(() => addPlayer(e, player(50, 17), false), /Town Hall 18/);
  const leader = { ...player(51), tag: "#LR0JUUVJP", name: "Mr.Fox" };
  assert.throws(() => addPlayer(e, leader, false), /team leader/);
  addPlayer(e, player(19), false);
  assert.throws(() => addPlayer(e, player(20), false), /full/);
});

test("the draw is random but balanced", () => {
  const tags = Array.from({ length: 20 }, (_, i) => `#P${i}`);
  const strengths: Record<string, Strength> = {};
  tags.forEach(
    (t, i) => (strengths[t] = { heroes: 400 + i * 6, equipment: 200 + i * 4 }),
  );
  const total = (team: string[]) =>
    team.reduce((n, t) => n + strengthOf(strengths[t]), 0);
  const draws = new Set<string>();
  let seed = 1;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 30; i++) {
    const teams = drawTeams(tags, strengths, 4, random);
    assert.equal(teams.length, 4);
    assert.ok(teams.every((t) => t.length === 5));
    assert.deepEqual(teams.flat().sort(), [...tags].sort());
    const totals = teams.map(total);
    // Strongest and weakest team within 1% of the average team.
    assert.ok(
      Math.max(...totals) - Math.min(...totals) <=
        0.01 * (totals.reduce((a, b) => a + b) / 4),
    );
    draws.add(JSON.stringify(teams.map((t) => [...t].sort()).sort()));
  }
  assert.ok(draws.size > 5, "different draws each time");
});

test("drawing needs the event full and closes registration", () => {
  assert.throws(() => act(league(18), { type: "drawTeams" }), /multiple of 4/);
  const hub = act(league(20), { type: "drawTeams" });
  assert.equal(ev(hub).registrationOpen, false);
  assert.equal(ev(hub).teams!.draw!.teams.length, 4);
  assert.throws(
    () => addPlayer(ev(hub), player(30), true),
    /already been drawn/,
  );
});

// Every player of team `side` gets the given stars and destruction.
function result(
  hub: Hub,
  team: number,
  stars: number,
  destruction = 80,
): TeamAttack[] {
  return ev(hub).teams!.draw!.teams[team].map((tag) => ({
    player: tag,
    stars,
    destruction: stars === 3 ? 100 : destruction,
    seconds: 150,
  }));
}

test("round robin, table and a two-war final", () => {
  let hub = act(league(20), { type: "drawTeams" });
  const view0 = leagueView(ev(hub))!;
  assert.deepEqual(
    view0.group.map((m) => m.label),
    [
      "Voldemort A vs Voldemort B",
      "Voldemort A vs Voldemort C",
      "Voldemort A vs Voldemort D",
      "Voldemort B vs Voldemort C",
      "Voldemort B vs Voldemort D",
      "Voldemort C vs Voldemort D",
    ],
  );
  assert.equal(view0.finalists, null);
  // Team strength order A > B > C > D in results: higher team wins.
  const stars = [3, 2, 1, 1];
  for (const m of view0.group) {
    const [x, y] = m.teams!;
    hub = act(hub, {
      type: "saveTeamMatch",
      matchId: m.id,
      attacks: [result(hub, x, stars[x], 70), result(hub, y, stars[y], 60)],
      mode: "normal",
      note: "",
    });
  }
  const view = leagueView(ev(hub))!;
  assert.deepEqual(
    view.table.map((r) => r.team),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    view.table.map((r) => r.points),
    [9, 6, 3, 0], // C beat D on destruction
  );
  assert.deepEqual(view.finalists, [0, 1]);
  // Final: B wins war 1 by 1 star, A wins war 2 by 3 stars -> A champions.
  hub = act(hub, {
    type: "saveTeamMatch",
    matchId: "f1",
    attacks: [
      result(hub, 0, 2),
      [...result(hub, 1, 2).slice(1), { ...result(hub, 1, 3)[0] }],
    ],
    mode: "hard",
    note: "",
  });
  assert.equal(leagueView(ev(hub))!.champion, null);
  hub = act(hub, {
    type: "saveTeamMatch",
    matchId: "f2",
    attacks: [result(hub, 0, 3), result(hub, 1, 2)],
    mode: "normal",
    note: "",
  });
  const done = leagueView(ev(hub))!;
  assert.equal(done.champion, 0);
  assert.equal(done.finalTotals![0].stars, 25);
});

test("a level final needs a deciding war", () => {
  let hub = act(league(20), { type: "drawTeams" });
  for (const m of leagueView(ev(hub))!.group) {
    const [x, y] = m.teams!;
    hub = act(hub, {
      type: "saveTeamMatch",
      matchId: m.id,
      attacks: [
        result(hub, x, x === 0 ? 3 : 2),
        result(hub, y, y === 0 ? 3 : 1),
      ],
      mode: "normal",
      note: "",
    });
  }
  const [f, s] = leagueView(ev(hub))!.finalists!;
  for (const id of ["f1", "f2"])
    hub = act(hub, {
      type: "saveTeamMatch",
      matchId: id,
      attacks: [result(hub, f, 2), result(hub, s, 2)],
      mode: "normal",
      note: "",
    });
  let view = leagueView(ev(hub))!;
  assert.equal(view.champion, null);
  assert.deepEqual(
    view.final.map((m) => m.id),
    ["f1", "f2", "f3"],
  );
  hub = act(hub, {
    type: "saveTeamMatch",
    matchId: "f3",
    attacks: [result(hub, f, 2), result(hub, s, 3)],
    mode: "normal",
    note: "",
  });
  view = leagueView(ev(hub))!;
  assert.equal(view.champion, s);
});

test("only a team's own players can be entered as its attackers", () => {
  const hub = act(league(20), { type: "drawTeams" });
  const m = leagueView(ev(hub))!.group[0];
  assert.throws(
    () =>
      act(hub, {
        type: "saveTeamMatch",
        matchId: m.id,
        attacks: [result(hub, 2, 3), result(hub, 1, 3)],
        mode: "normal",
        note: "",
      }),
    /isn't on that team/,
  );
});

test("events created with the team type start with the four leaders", () => {
  const e = newTeamsEvent("x");
  assert.deepEqual(
    e.teams!.leaders.map((l) => l.name),
    ["Mr.Fox", "༺Obito Đ Kamui༻", "PaiN~Legend!", "Nadeem_!"],
  );
  assert.equal(e.maxPlayers, 20);
  assert.equal(e.teams!.minTownHall, 18);
});

test("leaders must be different people and not registered players", () => {
  const hub = league(2);
  const e = ev(hub);
  const leaders = e.teams!.leaders;
  assert.throws(
    () =>
      act(hub, {
        type: "teamsSettings",
        leaders: [leaders[0], leaders[0], leaders[2], leaders[3]],
      }),
    /different leader/,
  );
  assert.throws(
    () =>
      act(hub, {
        type: "teamsSettings",
        leaders: [{ name: "Player 1", tag: "#P1" }, ...leaders.slice(1)],
      }),
    /registered as a player/,
  );
  act(hub, {
    type: "teamsSettings",
    leaders: [
      leaders[0],
      { name: "༺Monkey Đ PaiN༻", tag: "#YVJC9P922" },
      leaders[2],
      leaders[3],
    ],
  });
  assert.equal(ev(hub).teams!.leaders[1].tag, "#YVJC9P922");
  const monkey = { ...player(40), tag: "#YVJC9P922", name: "༺Monkey Đ PaiN༻" };
  assert.throws(() => addPlayer(ev(hub), monkey, false), /team leader/);
});
