import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import {
  NotVerifiedError,
  registration,
  resolvePlayer,
} from "@/lib/registration";
import { publicState } from "@/lib/state";
import { readHub, updateHub } from "@/lib/storage";
import { addPlayer, findEvent } from "@/lib/tournament";

// Per-device limits against spam and token guessing. Kept in memory, so each
// server instance counts separately; that's enough to stop casual abuse.
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 20; // registrations tried per window
const MAX_FAILED = 5; // wrong or missing tokens per window
const seen = new Map<
  string,
  { at: number; attempts: number; failed: number }
>();

function limiter(ip: string) {
  const now = Date.now();
  let entry = seen.get(ip);
  if (!entry || now - entry.at > WINDOW_MS) {
    entry = { at: now, attempts: 0, failed: 0 };
    seen.set(ip, entry);
    if (seen.size > 5000) seen.delete(seen.keys().next().value!);
  }
  return entry;
}

export async function POST(request: Request) {
  const parsed = registration.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid registration" },
      { status: 400 },
    );
  const admin = await currentAdmin();
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const limit = admin ? null : limiter(ip);
  if (limit && (limit.attempts >= MAX_ATTEMPTS || limit.failed >= MAX_FAILED))
    return NextResponse.json(
      { error: "Too many attempts from this device. Try again in 15 minutes." },
      { status: 429 },
    );
  if (limit) limit.attempts++;
  try {
    const { requireVerification } = await readHub();
    const player = await resolvePlayer(
      parsed.data,
      Boolean(admin) || !requireVerification,
    );
    const hub = await updateHub((h) => {
      addPlayer(findEvent(h, parsed.data.eventId), player, Boolean(admin));
      return h;
    });
    return NextResponse.json({ ...(await publicState(hub)), player });
  } catch (error) {
    if (limit && error instanceof NotVerifiedError) limit.failed++;
    return errorResponse(error);
  }
}
