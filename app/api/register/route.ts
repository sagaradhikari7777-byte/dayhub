import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { registration, resolvePlayer } from "@/lib/registration";
import { publicState } from "@/lib/state";
import { updateHub } from "@/lib/storage";
import { addPlayer, findEvent } from "@/lib/tournament";

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
    const hub = await updateHub((h) => {
      addPlayer(findEvent(h, parsed.data.eventId), player, Boolean(admin));
      return h;
    });
    return NextResponse.json({ ...(await publicState(hub)), player });
  } catch (error) {
    return errorResponse(error);
  }
}
