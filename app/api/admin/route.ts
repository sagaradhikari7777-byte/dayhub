import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { cocConfigured, player } from "@/lib/coc";
import { errorResponse } from "@/lib/http";
import { publicState } from "@/lib/state";
import { readHub, updateHub } from "@/lib/storage";
import type { Strength } from "@/lib/teams";
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
  const action = parsed.data;
  try {
    // Team draws balance on current hero and equipment levels, fetched here
    // rather than trusted from the request.
    if (action.type === "drawTeams")
      action.strengths = await freshStrengths(action.eventId);
    const hub = await updateHub((h) => applyAdminAction(h, action, admin));
    return NextResponse.json(await publicState(hub));
  } catch (error) {
    return errorResponse(error);
  }
}

async function freshStrengths(eventId: string) {
  const strengths: Record<string, Strength> = {};
  if (!cocConfigured()) return strengths;
  const event = (await readHub()).events.find((e) => e.id === eventId);
  const tags = event?.players.map((p) => p.tag) ?? [];
  for (let i = 0; i < tags.length; i += 5)
    await Promise.all(
      tags.slice(i, i + 5).map(async (tag) => {
        try {
          strengths[tag] = (await player(tag)).strength;
        } catch {
          // Falls back to the levels saved at registration.
        }
      }),
    );
  return strengths;
}
