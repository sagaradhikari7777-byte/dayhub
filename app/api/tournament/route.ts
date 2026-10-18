import { NextResponse } from "next/server";
import { errorResponse, noStore } from "@/lib/http";
import { publicState } from "@/lib/state";
import { readHub } from "@/lib/storage";

export async function GET() {
  try {
    return NextResponse.json(await publicState(await readHub()), noStore);
  } catch (error) {
    return errorResponse(error);
  }
}
