import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apiTime,
  normalizeGroup,
  normalizeWar,
  ourWars,
  placement,
  playerRecords,
  sameSeason,
  seasonFinal,
  type CwlSnapshot,
  type CwlWar,
  standings,
  starLeader,
  warWinner,
} from "../lib/cwl";
import { emptyHub } from "../lib/storage";
import { addPlayer, applyAdminAction } from "../lib/tournament";
import { fakeCwl, OUR_TAG } from "./fixtures/cwl";

function snapshot() {
  const { group, wars } = fakeCwl();
  const normalized = new Map(
    [...wars].map(([tag, raw]) => [tag, normalizeWar(tag, raw, OUR_TAG)]),
  );
  return normalizeGroup(group, normalized);
}

test("API times become ISO strings", () => {
  assert.equal(apiTime("20261019T205448.000Z"), "2026-10-19T20:54:48Z");
  assert.equal(apiTime(undefined), null);
});

test("our clan is always on the clan side, with members kept", () => {
  const s = snapshot();
  const ours = ourWars(s, OUR_TAG);
  assert.equal(ours.length, 7);
  assert.equal(ours[6], null); // round 7 not scheduled
  for (const w of ours.slice(0, 6)) {
    assert.equal(w!.clan.tag, OUR_TAG);
    assert.equal(w!.clan.members!.length, 15);
    assert.equal(w!.opponent.members!.length, 15);
  }
  // Wars between other clans keep only totals.
  const other = s.rounds[0].find((w) => w.clan.tag !== OUR_TAG)!;
  assert.equal(other.clan.members, null);
});

test("standings add 10 stars per win and rank all 8 clans", () => {
  const s = snapshot();
  const table = standings(s);
  assert.equal(table.length, 8);
  const games = table.reduce((n, r) => n + r.wins + r.losses + r.ties, 0);
  assert.equal(games, 4 * 4 * 2); // 4 ended rounds, 4 wars, 2 sides
  for (const row of table) {
    const own = s.rounds
      .flat()
      .filter((w) => w.state !== "preparation")
      .flatMap((w) => [w.clan, w.opponent])
      .filter((side) => side.tag === row.clan.tag)
      .reduce((t, side) => t + side.stars, 0);
    assert.equal(row.stars, own + 10 * row.wins);
  }
  for (let i = 1; i < table.length; i++)
    assert.ok(table[i - 1].stars >= table[i].stars);
  assert.ok(placement(s, OUR_TAG)! >= 1);
});

test("player records count attacks, misses and stars conceded", () => {
  const s = snapshot();
  const rows = playerRecords(s, OUR_TAG);
  assert.equal(rows.length, 15);
  const wars = ourWars(s, OUR_TAG).filter(
    (w) => w && w.state !== "preparation",
  );
  const attacks = wars.reduce(
    (n, w) => n + w!.clan.members!.filter((m) => m.attack).length,
    0,
  );
  assert.equal(
    rows.reduce((n, r) => n + r.attacks, 0),
    attacks,
  );
  const ended = wars.filter((w) => w!.state === "warEnded").length;
  for (const r of rows) {
    assert.equal(r.wars, wars.length);
    assert.ok(r.missed <= ended);
    assert.ok(r.attacks + r.missed <= r.wars);
  }
});

test("a war is won on stars, then destruction", () => {
  const war = snapshot().rounds[0][0];
  const w = {
    ...war,
    clan: { ...war.clan, stars: 30 },
    opponent: { ...war.opponent, stars: 30 },
  };
  w.clan.destruction = 90;
  w.opponent.destruction = 85;
  assert.equal(warWinner(w), w.clan.tag);
});

test("the star leader has the most stars", () => {
  const s = snapshot();
  const rows = playerRecords(s, OUR_TAG);
  const leader = starLeader(s, OUR_TAG)!;
  assert.equal(leader.tag, rows[0].tag);
  assert.ok(rows.every((r) => r.stars <= leader.stars));
});

test("nobody signs up for CWL", () => {
  const hub = emptyHub();
  applyAdminAction(hub, { type: "createCwlEvent", season: "2026-12" }, "a");
  const e = hub.events.at(-1)!;
  assert.equal(e.registrationOpen, false);
  assert.throws(
    () =>
      addPlayer(
        e,
        {
          tag: "#P1",
          name: "P",
          townHallLevel: 16,
          clanName: null,
          clanTag: null,
          registeredAt: "",
          source: "manual",
        },
        true,
      ),
    /No sign-up/,
  );
});

test("admins can create a CWL event ahead of the season", () => {
  const hub = emptyHub();
  applyAdminAction(hub, { type: "createCwlEvent", season: "2026-11" }, "a");
  const e = hub.events.at(-1)!;
  assert.equal(e.kind, "cwl");
  assert.equal(e.id, "cwl-2026-11");
  assert.equal(e.name, "CWL · November 2026");
  assert.ok(e.rules.length > 0);
  assert.throws(
    () =>
      applyAdminAction(hub, { type: "createCwlEvent", season: "2026-11" }, "a"),
    /already/,
  );
  assert.throws(
    () =>
      applyAdminAction(
        hub,
        { type: "createBracket", eventId: e.id, shuffle: false },
        "a",
      ),
    /CWL/,
  );
  applyAdminAction(
    hub,
    { type: "settings", eventId: e.id, rules: ["Only rule"] },
    "a",
  );
  assert.deepEqual(hub.events.at(-1)!.rules, ["Only rule"]);
});

test("CWL wars flag Hard Mode from the API", () => {
  const { wars } = fakeCwl();
  const [tag, raw] = [...wars][0];
  assert.equal(normalizeWar(tag, raw, OUR_TAG).hardMode, false);
  assert.equal(
    normalizeWar(tag, { ...raw, battleModifier: "hardMode" }, OUR_TAG).hardMode,
    true,
  );
});

// One 4v4 war where everyone 3-stars; defense and speed must separate them.
function tieSnapshot(): CwlSnapshot {
  const ours = [
    // tag, attack seconds, stars the enemy took off this base
    ["#A", 120, 3],
    ["#B", 90, 2],
    ["#C", 100, 2],
    ["#D", 100, 2],
  ] as const;
  const member = (
    tag: string,
    pos: number,
    attack: CwlWar["clan"]["members"] extends (infer M)[] | null
      ? M extends { attack: infer A }
        ? A
        : never
      : never,
  ) => ({
    tag,
    name: tag,
    townHallLevel: 18,
    mapPosition: pos,
    attack,
  });
  const war: CwlWar = {
    warTag: "#W",
    state: "warEnded",
    teamSize: 4,
    startTime: null,
    endTime: null,
    clan: {
      tag: OUR_TAG,
      name: "Us",
      badge: null,
      stars: 12,
      destruction: 100,
      attacks: 4,
      members: ours.map(([tag, secs], i) =>
        member(tag, i + 1, {
          attackerTag: tag,
          defenderTag: `#E${i}`,
          stars: 3,
          destruction: 100,
          duration: secs,
          order: i + 1,
        }),
      ),
    },
    opponent: {
      tag: "#THEM",
      name: "Them",
      badge: null,
      stars: 9,
      destruction: 90,
      attacks: 4,
      members: ours.map(([tag, , conceded], i) =>
        member(`#E${i}`, i + 1, {
          attackerTag: `#E${i}`,
          defenderTag: tag,
          stars: conceded,
          destruction: conceded === 3 ? 100 : 80,
          duration: 150,
          order: i + 5,
        }),
      ),
    },
  };
  return {
    season: "2026-11-01",
    state: "inWar",
    clans: [],
    rounds: [[war]],
  };
}

test("ties on stars go to defense, then the fastest 3-star", () => {
  const rows = playerRecords(tieSnapshot(), OUR_TAG);
  // All on 3 stars. B, C, D gave up 2; A gave up 3. B was fastest.
  assert.deepEqual(
    rows.map((r) => r.tag),
    ["#B", "#C", "#D", "#A"],
  );
  assert.deepEqual(
    rows.map((r) => r.rank),
    [1, 2, 2, 4], // C and D are level on all three rules: shared place
  );
  assert.deepEqual(
    rows.map((r) => r.decidedBy),
    [null, "speed", null, "defense"],
  );
  assert.equal(rows[0].fastestThree, 90);
  assert.equal(rows[3].starsConceded, 3);
});

test("more stars always beats a better defense", () => {
  const s = tieSnapshot();
  s.rounds[0][0].clan.members![1].attack!.stars = 2; // B drops to 2 stars
  const rows = playerRecords(s, OUR_TAG);
  assert.equal(rows.at(-1)!.tag, "#B");
  assert.equal(rows.at(-1)!.decidedBy, "stars");
});

test("a season is final once every war has ended", () => {
  const s = tieSnapshot();
  assert.equal(seasonFinal(s), true);
  s.rounds.push([]); // a round not scheduled yet
  assert.equal(seasonFinal(s), false);
  s.rounds[1] = [{ ...s.rounds[0][0], state: "inWar" }];
  assert.equal(seasonFinal(s), false);
  assert.equal(seasonFinal({ ...s, state: "ended" }), true);
  assert.equal(seasonFinal(snapshot()), false);
});

test("a season with or without a day is the same season", () => {
  assert.ok(sameSeason("2026-11-01", "2026-11"));
  assert.ok(!sameSeason("2026-12", "2026-11"));
});
