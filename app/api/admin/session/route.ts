import { NextResponse } from "next/server";
import { checkPassword, endSession, startSession } from "@/lib/auth";

const failures = new Map<string, { count: number; until: number }>();

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const blocked = failures.get(ip);
  if (blocked && blocked.count >= 5 && blocked.until > Date.now())
    return NextResponse.json(
      { error: "Too many attempts, wait a few minutes" },
      { status: 429 },
    );
  const body = (await request.json().catch(() => null)) as {
    password?: unknown;
  } | null;
  const name =
    typeof body?.password === "string" && body.password.length <= 200
      ? checkPassword(body.password)
      : null;
  if (!name) {
    const count =
      (blocked && blocked.until > Date.now() ? blocked.count : 0) + 1;
    failures.set(ip, { count, until: Date.now() + 5 * 60_000 });
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  failures.delete(ip);
  await startSession(name);
  return NextResponse.json({ admin: name });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ admin: null });
}
