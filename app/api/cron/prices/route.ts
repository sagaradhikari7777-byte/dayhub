import { NextResponse } from "next/server";
import { owners } from "@/lib/db";
import { dispatchPush } from "@/lib/push";
import { checkTrackedProducts } from "@/lib/price-tracking";
import { authorizedScheduler } from "@/lib/scheduler-auth";
export const maxDuration = 60;
export async function GET(req: Request) {
  if (!(await authorizedScheduler(req)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await checkTrackedProducts();
  for (const id of await owners()) await dispatchPush(id);
  return NextResponse.json(result);
}
