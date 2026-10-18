import { z } from "zod";
import { buildBracket, findMatch, shuffle } from "./bracket";
import { normalizeTag } from "./coc";
import type { Player, Tournament } from "./types";

// Pure state changes. Each throws ActionError with a message for the user.

export class ActionError extends Error {}

const attack = z.object({
  stars: z.number().int().min(0).max(3),
  destruction: z.number().min(0).max(100),
  seconds: z.number().int().min(0).max(300).nullable(),
});
const game = z.object({ a: attack, b: attack });

export const adminAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("settings"),
    name: z.string().trim().min(1).max(60).optional(),
    format: z.union([z.literal(1), z.literal(3), z.literal(5)]).optional(),
    registrationOpen: z.boolean().optional(),
    maxPlayers: z.number().int().min(2).max(256).optional(),
    clanTag: z.string().max(20).optional(),
  }),
  z.object({ type: z.literal("removePlayer"), tag: z.string() }),
  z.object({ type: z.literal("createBracket"), shuffle: z.boolean() }),
  z.object({ type: z.literal("deleteBracket") }),
  z.object({
    type: z.literal("saveResult"),
    matchId: z.string(),
    games: z.array(game).max(9),
    walkover: z.enum(["a", "b"]).nullable(),
    note: z.string().trim().max(200),
  }),
  z.object({ type: z.literal("clearResult"), matchId: z.string() }),
  z.object({ type: z.literal("reset") }),
]);
export type AdminAction = z.infer<typeof adminAction>;

export function addPlayer(t: Tournament, player: Player, byAdmin: boolean) {
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

export function applyAdminAction(
  t: Tournament,
  action: AdminAction,
  admin: string,
  random = Math.random,
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
      if (action.clanTag !== undefined) {
        const tag = normalizeTag(action.clanTag);
        if (!tag) throw new ActionError("That isn't a valid clan tag");
        t.clanTag = tag;
      }
      if (action.name !== undefined) t.name = action.name;
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
