import { NextResponse } from "next/server";
import { owners } from "@/lib/db";
import { dispatchPush } from "@/lib/push";
import { checkTrackedProducts } from "@/lib/price-tracking";
export const maxDuration = 60;
export async function GET(req: Request) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await checkTrackedProducts();
  for (const id of await owners()) await dispatchPush(id);
  return NextResponse.json(result);
}
