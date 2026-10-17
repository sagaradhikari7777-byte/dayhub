import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { publicState } from "@/lib/state";
import { updateTournament } from "@/lib/storage";
import { adminAction, applyAdminAction } from "@/lib/tournament";

export async function POST(request: Request) {
  const admin = await currentAdmin();
  if (!admin)
    return NextResponse.json(
      { error: "Admin sign-in required" },
      { status: 401 },
    );
  const parsed = adminAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const tournament = await updateTournament((t) =>
      applyAdminAction(t, parsed.data, admin),
    );
    return NextResponse.json(await publicState(tournament));
  } catch (error) {
    return errorResponse(error);
  }
}
