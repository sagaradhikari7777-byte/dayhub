import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { registration, resolvePlayer } from "@/lib/registration";
import { publicState } from "@/lib/state";
import { updateTournament } from "@/lib/storage";
import { addPlayer } from "@/lib/tournament";

export async function POST(request: Request) {
  const parsed = registration.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid registration" },
      { status: 400 },
    );
  try {
    const admin = await currentAdmin();
    const player = await resolvePlayer(parsed.data);
    const tournament = await updateTournament((t) =>
      addPlayer(t, player, Boolean(admin)),
    );
    return NextResponse.json({ ...(await publicState(tournament)), player });
  } catch (error) {
    return errorResponse(error);
  }
}
