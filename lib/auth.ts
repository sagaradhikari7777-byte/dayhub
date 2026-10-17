import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Admins come from ADMINS="Sagar:password1,Friend:password2".
// In development with no ADMINS set, the login is "admin".

const COOKIE = "clancup_admin";
const MAX_AGE = 60 * 60 * 24 * 30;

type Admin = { name: string; password: string };

function admins(): Admin[] {
  const raw = process.env.ADMINS?.trim();
  if (!raw)
    return process.env.NODE_ENV === "production"
      ? []
      : [{ name: "Admin", password: "admin" }];
  return raw
    .split(",")
    .map((entry) => {
      const at = entry.indexOf(":");
      return {
        name: entry.slice(0, at).trim(),
        password: entry.slice(at + 1).trim(),
      };
    })
    .filter((a) => a.name && a.password);
}

function secret() {
  return (
    process.env.SESSION_SECRET ||
    createHash("sha256")
      .update("clancup-session:" + JSON.stringify(admins()))
      .digest("hex")
  );
}

const digest = (value: string) => createHash("sha256").update(value).digest();

export function checkPassword(password: string) {
  const given = digest(password);
  let match: string | null = null;
  for (const admin of admins())
    if (timingSafeEqual(given, digest(admin.password))) match ??= admin.name;
  return match;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export async function startSession(name: string) {
  const payload = Buffer.from(
    JSON.stringify({ name, exp: Date.now() + MAX_AGE * 1000 }),
  ).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentAdmin(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;
  try {
    const { name, exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as { name: string; exp: number };
    // Removing someone from ADMINS revokes their session.
    if (exp < Date.now() || !admins().some((a) => a.name === name)) return null;
    return name;
  } catch {
    return null;
  }
}
