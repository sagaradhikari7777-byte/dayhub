import { z } from "zod";
import { cocConfigured, CocError, normalizeTag, player } from "./coc";
import { ActionError } from "./tournament";
import type { Player } from "./types";

export const registration = z.object({
  tag: z.string().max(20),
  eventId: z.string().min(1).max(40),
  // Only used when the Clash of Clans API isn't configured.
  name: z.string().trim().min(1).max(30).optional(),
  townHallLevel: z.number().int().min(1).max(30).nullable().optional(),
});

// With the API configured, names and town hall levels always come from the
// game, so nobody can register under a made-up name.
export async function resolvePlayer(
  input: z.infer<typeof registration>,
): Promise<Player> {
  const tag = normalizeTag(input.tag);
  if (!tag) throw new ActionError("That isn't a valid player tag");
  const registeredAt = new Date().toISOString();
  if (cocConfigured()) {
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
