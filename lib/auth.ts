import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "./session-secret";
function sign(id: string) {
  return createHmac("sha256", sessionSecret()).update(id).digest("hex");
}
export async function owner() {
  const jar = await cookies(),
    value = jar.get("dayhub_session")?.value;
  if (value) {
    const [id, sig] = value.split(".");
    if (
      id &&
      sig &&
      /^[a-f0-9]{64}$/.test(sig) &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(sign(id)))
    )
      return id;
  }
  const id = randomUUID();
  jar.set("dayhub_session", `${id}.${sign(id)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return id;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    const expectedHost =
      request.headers.get("host") || new URL(request.url).host;
    const parsed = new URL(origin);
    if (
      parsed.host !== expectedHost ||
      !["http:", "https:"].includes(parsed.protocol)
    )
      throw new Error("Invalid request origin");
  }
}
