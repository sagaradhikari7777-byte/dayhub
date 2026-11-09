import { z } from "zod";
import { buildBracket, findMatch, shuffle } from "./bracket";
import { normalizeTag } from "./coc";
import { sameSeason } from "./cwl";
import { newCwlEvent, newEvent, newTeamsEvent } from "./storage";
import { drawTeams, findTeamFixture, leagueView, type Strength } from "./teams";
import type { Hub, Player, Tournament } from "./types";

// Pure state changes. Each throws ActionError with a message for the user.

export class ActionError extends Error {}

const attack = z.object({
  stars: z.number().int().min(0).max(3),
  destruction: z.number().min(0).max(100),
  seconds: z.number().int().min(0).max(300).nullable(),
});
const game = z.object({ a: attack, b: attack });

const eventId = z.string().min(1).max(40);
const teamAttack = z.object({
  player: z.string().max(20),
  stars: z.number().int().min(0).max(3),
  destruction: z.number().min(0).max(100),
  seconds: z.number().int().min(0).max(300).nullable(),
});

export const adminAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hubSettings"),
    clanTag: z.string().max(20).optional(),
    rules: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
    requireVerification: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("createEvent"),
    name: z.string().trim().min(1).max(60),
  }),
  z.object({
    type: z.literal("createTeamsEvent"),
    name: z.string().trim().min(1).max(60),
  }),
  z.object({
    type: z.literal("teamsSettings"),
    eventId,
    leaders: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(40),
          tag: z.string().max(20).nullable(),
        }),
      )
      .length(4)
      .optional(),
    teamNames: z.array(z.string().trim().min(1).max(30)).length(4).optional(),
    minTownHall: z.number().int().min(1).max(30).optional(),
  }),
  z.object({
    type: z.literal("drawTeams"),
    eventId,
    // Filled in by the server with fresh levels from the game.
    strengths: z
      .record(
        z.string(),
        z.object({ heroes: z.number(), equipment: z.number() }),
      )
      .optional(),
  }),
  z.object({ type: z.literal("undoTeamDraw"), eventId }),
  z.object({
    type: z.literal("saveTeamMatch"),
    eventId,
    matchId: z.string(),
    attacks: z.array(z.array(teamAttack).max(10)).length(2),
    mode: z.enum(["normal", "hard"]).default("normal"),
    note: z.string().trim().max(200),
  }),
  z.object({ type: z.literal("clearTeamMatch"), eventId, matchId: z.string() }),
  z.object({
    type: z.literal("createCwlEvent"),
    season: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  }),
  z.object({ type: z.literal("deleteEvent"), eventId }),
  z.object({
    type: z.literal("settings"),
    eventId,
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(500).optional(),
    startsAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    prize: z.string().trim().max(80).optional(),
    rules: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
    format: z.union([z.literal(1), z.literal(3), z.literal(5)]).optional(),
    registrationOpen: z.boolean().optional(),
    maxPlayers: z.number().int().min(2).max(256).optional(),
  }),
  z.object({ type: z.literal("removePlayer"), eventId, tag: z.string() }),
  z.object({
    type: z.literal("createBracket"),
    eventId,
    shuffle: z.boolean(),
  }),
  z.object({ type: z.literal("deleteBracket"), eventId }),
  z.object({
    type: z.literal("saveResult"),
    eventId,
    matchId: z.string(),
    games: z.array(game).max(9),
    walkover: z.enum(["a", "b"]).nullable(),
    mode: z.enum(["normal", "hard"]).default("normal"),
    note: z.string().trim().max(200),
  }),
  z.object({ type: z.literal("clearResult"), eventId, matchId: z.string() }),
  z.object({ type: z.literal("reset"), eventId }),
]);
export type AdminAction = z.infer<typeof adminAction>;

export function addPlayer(t: Tournament, player: Player, byAdmin: boolean) {
  if (t.kind === "cwl")
    throw new ActionError(
      "No sign-up needed for CWL. The lineup comes from the game.",
    );
  if (!byAdmin && !t.registrationOpen)
    throw new ActionError("Registration is closed");
  if (t.bracket) throw new ActionError("The bracket has already been drawn");
  if (t.teams) {
    if (t.teams.draw)
      throw new ActionError("The teams have already been drawn");
    if (t.teams.leaders.some((l) => l.tag === player.tag))
      throw new ActionError(
        `${player.name} is a team leader. Leaders captain a team and don't register.`,
      );
    if ((player.townHallLevel ?? 0) < t.teams.minTownHall)
      throw new ActionError(
        `This event is Town Hall ${t.teams.minTownHall}+ only. ${player.name} is TH${player.townHallLevel ?? "?"}.`,
      );
  }
  if (t.players.some((p) => p.tag === player.tag))
    throw new ActionError(`${player.name} is already registered`);
  if (t.players.length >= t.maxPlayers)
    throw new ActionError(
      `The event is full (${t.maxPlayers} players, first come first served)`,
    );
  t.players.push(player);
  return t;
}

export function findEvent(hub: Hub, id: string) {
  const event = hub.events.find((e) => e.id === id);
  if (!event) throw new ActionError("That event no longer exists");
  return event;
}

export function applyAdminAction(
  hub: Hub,
  action: AdminAction,
  admin: string,
  random = Math.random,
): Hub {
  switch (action.type) {
    case "hubSettings":
      if (action.clanTag !== undefined) {
        const tag = normalizeTag(action.clanTag);
        if (!tag) throw new ActionError("That isn't a valid clan tag");
        hub.clanTag = tag;
      }
      if (action.rules !== undefined) hub.rules = action.rules;
      if (action.requireVerification !== undefined)
        hub.requireVerification = action.requireVerification;
      return hub;
    case "createEvent":
      if (hub.events.length >= 20)
        throw new ActionError("Delete an old event first");
      hub.events.push(newEvent(action.name));
      return hub;
    case "createTeamsEvent":
      if (hub.events.length >= 20)
        throw new ActionError("Delete an old event first");
      hub.events.push(newTeamsEvent(action.name));
      return hub;
    case "createCwlEvent":
      if (
        hub.events.some((e) => e.cwl && sameSeason(e.cwl.season, action.season))
      )
        throw new ActionError("That CWL season already has an event");
      hub.events.push(newCwlEvent(action.season));
      return hub;
    case "deleteEvent":
      findEvent(hub, action.eventId);
      hub.events = hub.events.filter((e) => e.id !== action.eventId);
      return hub;
    default: {
      const event = findEvent(hub, action.eventId);
      const updated = applyEventAction(event, action, admin, random);
      hub.events = hub.events.map((e) => (e.id === event.id ? updated : e));
      return hub;
    }
  }
}

type EventAction = Exclude<
  AdminAction,
  {
    type:
      | "hubSettings"
      | "createEvent"
      | "createTeamsEvent"
      | "createCwlEvent"
      | "deleteEvent";
  }
>;

function applyEventAction(
  t: Tournament,
  action: EventAction,
  admin: string,
  random: () => number,
): Tournament {
  switch (action.type) {
    case "settings": {
      if (action.format !== undefined && action.format !== t.format) {
        if (Object.keys(t.results).length)
          throw new ActionError(
            "Clear the entered results before changing the match format",
          );
        t.format = action.format;
      }
      if (action.maxPlayers !== undefined) {
        if (action.maxPlayers < t.players.length)
          throw new ActionError(
            `${t.players.length} players are already registered`,
          );
        t.maxPlayers = action.maxPlayers;
      }
      if (action.name !== undefined) t.name = action.name;
      if (action.description !== undefined) t.description = action.description;
      if (action.startsAt !== undefined) t.startsAt = action.startsAt;
      if (action.prize !== undefined) t.prize = action.prize;
      if (action.rules !== undefined) t.rules = action.rules;
      if (action.registrationOpen !== undefined)
        t.registrationOpen = action.registrationOpen;
      return t;
    }
    case "removePlayer":
      if (t.bracket)
        throw new ActionError("Delete the bracket before removing players");
      t.players = t.players.filter((p) => p.tag !== action.tag);
      return t;
    case "createBracket": {
      if (t.kind === "cwl")
        throw new ActionError("CWL events don't have a bracket");
      if (t.bracket) throw new ActionError("The bracket already exists");
      if (t.players.length < 2)
        throw new ActionError("At least 2 players are needed");
      const tags = t.players.map((p) => p.tag);
      t.bracket = {
        order: action.shuffle ? shuffle(tags, random) : tags,
        createdAt: new Date().toISOString(),
      };
      t.results = {};
      t.registrationOpen = false;
      return t;
    }
    case "deleteBracket":
      t.bracket = null;
      t.results = {};
      return t;
    case "saveResult": {
      if (!t.bracket) throw new ActionError("There is no bracket yet");
      const rounds = buildBracket(t.bracket.order, t.results, t.format);
      const match = findMatch(rounds, action.matchId);
      if (!match) throw new ActionError("Match not found");
      if (match.bye || !match.a || !match.b)
        throw new ActionError("Both players must be known first");
      if (!action.walkover && !action.games.length)
        throw new ActionError("Enter at least one game or a walkover");
      t.results[match.id] = {
        a: match.a,
        b: match.b,
        games: action.walkover ? [] : action.games,
        walkover: action.walkover,
        mode: action.mode,
        note: action.note,
        updatedBy: admin,
        updatedAt: new Date().toISOString(),
      };
      return t;
    }
    case "clearResult":
      delete t.results[action.matchId];
      return t;
    case "reset":
      return {
        ...t,
        players: [],
        bracket: null,
        results: {},
        registrationOpen: true,
        teams: t.teams ? { ...t.teams, draw: null, results: {} } : null,
      };
    default:
      return applyTeamsAction(t, action, admin, random);
  }
}

type TeamsAction = Extract<
  EventAction,
  {
    type:
      | "teamsSettings"
      | "drawTeams"
      | "undoTeamDraw"
      | "saveTeamMatch"
      | "clearTeamMatch";
  }
>;

function applyTeamsAction(
  t: Tournament,
  action: TeamsAction,
  admin: string,
  random: () => number,
): Tournament {
  const info = t.teams;
  if (!info) throw new ActionError("This isn't a team event");
  switch (action.type) {
    case "teamsSettings":
      if (action.leaders) {
        const tags = action.leaders.map((l) => l.tag).filter(Boolean);
        if (new Set(tags).size !== tags.length)
          throw new ActionError("Each team needs a different leader");
        const playing = t.players.find((p) => tags.includes(p.tag));
        if (playing)
          throw new ActionError(
            `${playing.name} is registered as a player. Remove them from the players list before making them a leader.`,
          );
        info.leaders = action.leaders;
      }
      if (action.teamNames) info.teamNames = action.teamNames;
      if (action.minTownHall !== undefined) {
        if (info.draw)
          throw new ActionError("Undo the draw before changing the TH limit");
        info.minTownHall = action.minTownHall;
      }
      return t;
    case "drawTeams": {
      if (info.draw) throw new ActionError("The teams are already drawn");
      const teamCount = info.teamNames.length;
      const n = t.players.length;
      if (n < teamCount * 2 || n % teamCount)
        throw new ActionError(
          `${n} players registered. The draw needs a multiple of ${teamCount} (e.g. ${t.maxPlayers}).`,
        );
      // Fresh levels from the game when the server could get them, else the
      // levels saved at registration.
      const strengths: Record<string, Strength> = {};
      for (const p of t.players)
        strengths[p.tag] = action.strengths?.[p.tag] ??
          p.strength ?? { heroes: 0, equipment: 0 };
      info.draw = {
        teams: drawTeams(
          t.players.map((p) => p.tag),
          strengths,
          teamCount,
          random,
        ),
        strengths,
        createdAt: new Date().toISOString(),
      };
      info.results = {};
      t.registrationOpen = false;
      return t;
    }
    case "undoTeamDraw":
      if (Object.keys(info.results).length)
        throw new ActionError("Clear the entered results before redrawing");
      info.draw = null;
      return t;
    case "saveTeamMatch": {
      const view = leagueView(t);
      if (!view) throw new ActionError("Draw the teams first");
      const fixture = findTeamFixture(view, action.matchId);
      if (!fixture?.teams)
        throw new ActionError("This match's teams aren't known yet");
      const [x, y] = fixture.teams;
      const rosters = [info.draw!.teams[x], info.draw!.teams[y]];
      action.attacks.forEach((side, i) => {
        const seen = new Set<string>();
        for (const a of side) {
          if (!rosters[i].includes(a.player))
            throw new ActionError("An attacker isn't on that team");
          if (seen.has(a.player))
            throw new ActionError("Each player attacks once per war");
          seen.add(a.player);
        }
      });
      if (!action.attacks[0].length && !action.attacks[1].length)
        throw new ActionError("Enter at least one attack");
      info.results[action.matchId] = {
        teams: [x, y],
        attacks: [action.attacks[0], action.attacks[1]],
        mode: action.mode,
        note: action.note,
        updatedBy: admin,
        updatedAt: new Date().toISOString(),
      };
      return t;
    }
    case "clearTeamMatch":
      delete info.results[action.matchId];
      return t;
  }
}
