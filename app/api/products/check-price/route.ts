import { NextResponse } from "next/server";
import { checkTrackedProducts } from "@/lib/price-tracking";
import { owner, sameOrigin } from "@/lib/auth";
import { z } from "zod";
export const maxDuration = 60;
export async function GET() {
  return NextResponse.json(
    { scheduled: Boolean(process.env.CRON_SECRET) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const raw = await req.text();
    const options = z
      .object({
        productId: z.string().uuid().optional(),
        groupId: z.string().uuid().optional(),
      })
      .safeParse(raw ? JSON.parse(raw) : {});
    if (!options.success)
      return NextResponse.json(
        { error: "Choose a valid tracked product." },
        { status: 400 },
      );
    return NextResponse.json(
      await checkTrackedProducts(await owner(), {
        ...options.data,
        manual: true,
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "Price checking is temporarily unavailable." },
      { status: 503 },
    );
  }
}
