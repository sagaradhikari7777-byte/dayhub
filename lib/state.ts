import { currentAdmin } from "./auth";
import { cocConfigured } from "./coc";
import { storageKind } from "./storage";
import type { PublicState, Tournament } from "./types";

export async function publicState(
  tournament: Tournament,
): Promise<PublicState> {
  return {
    tournament,
    admin: await currentAdmin(),
    apiConfigured: cocConfigured(),
    storage: storageKind(),
  };
}
