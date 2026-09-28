import { NextResponse, after } from "next/server";
import { dispatchPush } from "@/lib/push";
import { allEntries, mutate, ConflictError, resetOwner } from "@/lib/db";
import { owner, sameOrigin } from "@/lib/auth";
import { mutationSchema } from "@/lib/validation";
import { usesRedis } from "@/lib/db/redis";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(
      {
        entries: await allEntries(await owner()),
        storage: usesRedis()
          ? "cloud-upstash"
          : process.env.DATABASE_URL
            ? "cloud"
            : "local-server",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "DayHub cannot connect to its database. Your saved device data is still available.",
      },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (Number(req.headers.get("content-length") || 0) > 2_000_000)
      return NextResponse.json(
        { error: "This update is too large." },
        { status: 413 },
      );
    const result = mutationSchema.safeParse(await req.json());
    if (!result.success)
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Please check the form." },
        { status: 400 },
      );
    const id = await owner();
    await mutate(id, result.data);
    after(async () => {
      try {
        await dispatchPush(id);
      } catch {}
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (process.env.NODE_ENV === "development")
      console.error(
        "DayHub mutation:",
        e instanceof Error ? e.message : "Unknown error",
      );
    return NextResponse.json(
      {
        error:
          e instanceof ConflictError
            ? e.message
            : "We could not save to the server. Your change will remain queued.",
      },
      { status: e instanceof ConflictError ? 409 : 503 },
    );
  }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const body = await req.json();
    if (body.confirm !== "RESET")
      return NextResponse.json(
        { error: "Confirmation is required" },
        { status: 400 },
      );
    await resetOwner(await owner());
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Reset failed. Your data has been retained." },
      { status: 503 },
    );
  }
}
