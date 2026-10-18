import { after, NextResponse } from "next/server";
import { cwlCheckDue, syncCwl } from "@/lib/cwl-sync";
import { errorResponse, noStore } from "@/lib/http";
import { publicState } from "@/lib/state";
import { readHub } from "@/lib/storage";

export async function GET() {
  try {
    const hub = await readHub();
    // Keep CWL data current without a scheduler: visits trigger the check.
    if (cwlCheckDue(hub))
      after(() => syncCwl().catch((e) => console.error("CWL sync", e)));
    return NextResponse.json(await publicState(hub), noStore);
  } catch (error) {
    return errorResponse(error);
  }
}
