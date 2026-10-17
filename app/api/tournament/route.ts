import { NextResponse } from "next/server";
import { errorResponse, noStore } from "@/lib/http";
import { publicState } from "@/lib/state";
import { readTournament } from "@/lib/storage";

export async function GET() {
  try {
    return NextResponse.json(
      await publicState(await readTournament()),
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
