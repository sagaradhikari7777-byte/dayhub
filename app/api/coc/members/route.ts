import { NextResponse } from "next/server";
import { clanMembers, normalizeTag } from "@/lib/coc";
import { errorResponse, noStore } from "@/lib/http";

export async function GET(request: Request) {
  const tag = normalizeTag(new URL(request.url).searchParams.get("tag") ?? "");
  if (!tag)
    return NextResponse.json({ error: "Invalid clan tag" }, { status: 400 });
  try {
    return NextResponse.json(await clanMembers(tag), noStore);
  } catch (error) {
    return errorResponse(error);
  }
}
