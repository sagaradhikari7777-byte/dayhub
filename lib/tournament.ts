import { z } from "zod";
import { buildBracket, findMatch, shuffle } from "./bracket";
import { normalizeTag } from "./coc";
import { newCwlEvent, newEvent } from "./storage";
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

export const adminAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hubSettings"),
    clanTag: z.string().max(20).optional(),
    rules: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  }),
  z.object({
    type: z.literal("createEvent"),
    name: z.string().trim().min(1).max(60),
  }),
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
  if (t.players.some((p) => p.tag === player.tag))
    throw new ActionError(`${player.name} is already registered`);
  if (t.players.length >= t.maxPlayers)
    throw new ActionError("The tournament is full");
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
      return hub;
    case "createEvent":
      if (hub.events.length >= 20)
        throw new ActionError("Delete an old event first");
      hub.events.push(newEvent(action.name));
      return hub;
    case "createCwlEvent":
      if (hub.events.some((e) => e.cwl?.season === action.season))
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
  { type: "hubSettings" | "createEvent" | "createCwlEvent" | "deleteEvent" }
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
      };
  }
}
