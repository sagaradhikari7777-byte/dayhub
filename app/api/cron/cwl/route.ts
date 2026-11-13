import { NextResponse, type NextRequest } from "next/server";
import { seasonFinal } from "@/lib/cwl";
import { syncCwl } from "@/lib/cwl-sync";
import { errorResponse, noStore } from "@/lib/http";

// Scheduled CWL check (see vercel.json), so a new season is picked up and a
// finished one is closed even when nobody opens the site. It runs the same
// check a visit does, no more often than a visit could.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const hub = await syncCwl();
    return NextResponse.json(
      {
        checkedAt: hub.cwlCheckedAt,
        seasons: hub.events
          .filter((e) => e.kind === "cwl" && e.cwl)
          .map((e) => ({
            season: e.cwl!.season,
            syncedAt: e.cwl!.syncedAt,
            final: e.cwl!.snapshot ? seasonFinal(e.cwl!.snapshot) : false,
          })),
      },
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
