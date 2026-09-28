import { NextResponse } from "next/server";
import { lookupProduct } from "@/lib/price-tracking";
import { owner, sameOrigin } from "@/lib/auth";
import { ProductLookupError } from "@/lib/price-tracking/errors";
const limits = new Map<string, number>();
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const id = await owner();
    const now = Date.now();
    if (now - (limits.get(id) || 0) < 3000)
      return NextResponse.json(
        { error: "Please wait a few seconds before checking again." },
        { status: 429 },
      );
    limits.set(id, now);
    const body = await req.json();
    if (typeof body.url !== "string" || body.url.length > 2048)
      return NextResponse.json(
        { error: "Enter a valid product URL." },
        { status: 400 },
      );
    return NextResponse.json(await lookupProduct(body.url));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ProductLookupError
            ? error.message
            : "This store could not be analysed automatically. You can still add it with a manual price.",
        code:
          error instanceof ProductLookupError
            ? error.code
            : "lookup_unavailable",
      },
      { status: 422 },
    );
  }
}
