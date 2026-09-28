import { NextResponse } from "next/server";
import { z } from "zod";
import { owner, sameOrigin } from "@/lib/auth";
import { allEntries } from "@/lib/db";
import {
  discoveryConfigured,
  discoverStores,
} from "@/lib/price-tracking/discovery";
import { ProductLookupError } from "@/lib/price-tracking/errors";
export const maxDuration = 40;
export async function GET() {
  return NextResponse.json(
    { configured: discoveryConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = z
      .object({ productId: z.string().uuid() })
      .safeParse(await req.json());
    if (!body.success)
      return NextResponse.json(
        { error: "Choose a tracked product to compare." },
        { status: 400 },
      );
    const entries = await allEntries(await owner());
    const product = entries.find(
      (e) => e.kind === "products" && e.id === body.data.productId,
    );
    if (!product)
      return NextResponse.json(
        { error: "This product is not in your account." },
        { status: 404 },
      );
    const currency =
      entries.find((e) => e.kind === "settings")?.profile?.currency || "AUD";
    if (currency !== "AUD")
      return NextResponse.json(
        {
          error:
            "Automatic store discovery currently supports Australian prices in AUD.",
        },
        { status: 422 },
      );
    return NextResponse.json(await discoverStores(product.title.slice(0, 200)));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ProductLookupError
            ? error.message
            : "Store search is temporarily unavailable.",
        code:
          error instanceof ProductLookupError
            ? error.code
            : "discovery_unavailable",
      },
      { status: 503 },
    );
  }
}
