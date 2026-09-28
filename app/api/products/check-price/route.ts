import { NextResponse } from "next/server";
import { checkTrackedProducts } from "@/lib/price-tracking";
import { owner, sameOrigin } from "@/lib/auth";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    return NextResponse.json(await checkTrackedProducts(await owner()));
  } catch {
    return NextResponse.json(
      { error: "Price checking is temporarily unavailable." },
      { status: 503 },
    );
  }
}
