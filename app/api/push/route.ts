import { NextResponse } from "next/server";
import { z } from "zod";
import { owner, sameOrigin } from "@/lib/auth";
import { allEntries } from "@/lib/db";
import { saveSubscription, removeSubscription } from "@/lib/push";
import { getPushConfig } from "@/lib/push-config";
const endpoint = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].some((h) => u.hostname === h || u.hostname.endsWith("." + h))
    );
  });
const schema = z.object({
  endpoint,
  keys: z.object({
    p256dh: z.string().min(20).max(200),
    auth: z.string().min(10).max(100),
  }),
});
export async function GET() {
  try {
    const config = await getPushConfig();
    return NextResponse.json(
      {
        available: Boolean(config),
        publicKey: config?.publicKey || null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        available: false,
        publicKey: null,
        error: "Notification setup is temporarily unavailable. Try again.",
      },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (!(await getPushConfig()))
      return NextResponse.json(
        { error: "Background push is not configured on this server yet." },
        { status: 503 },
      );
    const result = schema.safeParse(await req.json());
    if (!result.success)
      return NextResponse.json(
        { error: "This browser subscription is not supported." },
        { status: 400 },
      );
    const id = await owner();
    await allEntries(id);
    await saveSubscription(id, result.data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Push could not be enabled. In-app alerts still work." },
      { status: 503 },
    );
  }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const body = await req.json();
    const result = endpoint.safeParse(body.endpoint);
    if (!result.success)
      return NextResponse.json(
        { error: "Invalid subscription" },
        { status: 400 },
      );
    await removeSubscription(await owner(), result.data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not disable push. Please try again." },
      { status: 503 },
    );
  }
}
