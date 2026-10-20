import { z } from "zod";
import {
  cocConfigured,
  CocError,
  normalizeTag,
  player,
  verifyPlayerToken,
} from "./coc";
import { ActionError } from "./tournament";
import type { Player } from "./types";

export const registration = z.object({
  tag: z.string().max(20),
  eventId: z.string().min(1).max(40),
  // The one-time API token from the player's game settings.
  token: z.string().trim().max(40).optional(),
  // Only used when the Clash of Clans API isn't configured.
  name: z.string().trim().min(1).max(30).optional(),
  townHallLevel: z.number().int().min(1).max(30).nullable().optional(),
});

// With the API configured, names and town hall levels always come from the
// game, so nobody can register under a made-up name.
export class NotVerifiedError extends ActionError {}

export async function resolvePlayer(
  input: z.infer<typeof registration>,
  // Admins adding someone, or the check switched off.
  skipVerification: boolean,
): Promise<Player> {
  const tag = normalizeTag(input.tag);
  if (!tag) throw new ActionError("That isn't a valid player tag");
  const registeredAt = new Date().toISOString();
  if (cocConfigured()) {
    let verified = false;
    if (!skipVerification || input.token) {
      if (!input.token)
        throw new NotVerifiedError(
          "Enter the API token from your game settings to prove it's your account",
        );
      try {
        verified = await verifyPlayerToken(tag, input.token);
      } catch (error) {
        if (error instanceof CocError && error.status === 404)
          throw new ActionError(`No player found with tag ${tag}`);
        throw error;
      }
      if (!verified && !skipVerification)
        throw new NotVerifiedError(
          "That API token doesn't match this account. Tokens change after use, so copy a fresh one from the game and try again.",
        );
    }
    try {
      const p = await player(tag);
      return {
        tag: p.tag,
        name: p.name,
        townHallLevel: p.townHallLevel,
        clanName: p.clanName,
        clanTag: p.clanTag,
        registeredAt,
        source: "api",
        verified,
      };
    } catch (error) {
      if (error instanceof CocError && error.status === 404)
        throw new ActionError(`No player found with tag ${tag}`);
      throw error;
    }
  }
  if (!input.name) throw new ActionError("Enter the player's name");
  return {
    tag,
    name: input.name,
    townHallLevel: input.townHallLevel ?? null,
    clanName: null,
    clanTag: null,
    registeredAt,
    source: "manual",
  };
}
