import { currentAdmin } from "./auth";
import { cocConfigured } from "./coc";
import { storageKind } from "./storage";
import type { Hub, PublicState } from "./types";

export async function publicState(hub: Hub): Promise<PublicState> {
  return {
    hub,
    admin: await currentAdmin(),
    apiConfigured: cocConfigured(),
    storage: storageKind(),
  };
}
