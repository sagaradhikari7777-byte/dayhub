import { NextResponse } from "next/server";
import { findClans } from "@/lib/coc";
import { errorResponse, noStore } from "@/lib/http";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 50) ?? "";
  try {
    return NextResponse.json({ clans: await findClans(q) }, noStore);
  } catch (error) {
    return errorResponse(error);
  }
}
