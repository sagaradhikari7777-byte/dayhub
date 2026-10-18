import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { syncCwl } from "@/lib/cwl-sync";
import { errorResponse } from "@/lib/http";
import { publicState } from "@/lib/state";

// Admin "Sync now": checks the API immediately.
export async function POST() {
  if (!(await currentAdmin()))
    return NextResponse.json(
      { error: "Admin sign-in required" },
      { status: 401 },
    );
  try {
    return NextResponse.json(await publicState(await syncCwl(true)));
  } catch (error) {
    return errorResponse(error);
  }
}
