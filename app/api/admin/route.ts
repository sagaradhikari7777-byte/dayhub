import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { publicState } from "@/lib/state";
import { updateHub } from "@/lib/storage";
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
    const hub = await updateHub((h) => applyAdminAction(h, parsed.data, admin));
    return NextResponse.json(await publicState(hub));
  } catch (error) {
    return errorResponse(error);
  }
}
