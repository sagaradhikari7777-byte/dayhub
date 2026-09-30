import {
  createPublicKey,
  verify,
  timingSafeEqual,
  type JsonWebKey,
} from "node:crypto";
const issuer = "https://token.actions.githubusercontent.com";
export const schedulerRepository = "sagaradhikari7777-byte/dayhub";
export const schedulerAudience =
  "https://dayhub-wine.vercel.app/api/cron/prices";
export function schedulerConfigured() {
  return true;
}
type SigningKey = JsonWebKey & { kid?: string; alg?: string; use?: string };
let cached: { until: number; keys: SigningKey[] } | undefined;
export function verifySchedulerToken(
  token: string,
  keys: SigningKey[],
  now = Date.now(),
): boolean {
  try {
    if (token.length > 16000) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const claim = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (header.alg !== "RS256" || typeof header.kid !== "string") return false;
    const key = keys.find(
      (k) =>
        k.kid === header.kid &&
        k.kty === "RSA" &&
        (!k.alg || k.alg === "RS256") &&
        (!k.use || k.use === "sig"),
    );
    if (
      !key ||
      !verify(
        "RSA-SHA256",
        Buffer.from(`${parts[0]}.${parts[1]}`),
        createPublicKey({ key, format: "jwk" }),
        Buffer.from(parts[2], "base64url"),
      )
    )
      return false;
    const seconds = Math.floor(now / 1000);
    return (
      claim.iss === issuer &&
      claim.aud === schedulerAudience &&
      claim.repository === schedulerRepository &&
      claim.repository_owner_id === "329097412" &&
      claim.ref === "refs/heads/main" &&
      claim.workflow_ref ===
        `${schedulerRepository}/.github/workflows/price-check.yml@refs/heads/main` &&
      ["schedule", "workflow_dispatch", "push"].includes(claim.event_name) &&
      typeof claim.exp === "number" &&
      claim.exp > seconds &&
      typeof claim.nbf === "number" &&
      claim.nbf <= seconds + 30 &&
      typeof claim.iat === "number" &&
      claim.iat <= seconds + 30 &&
      claim.iat >= seconds - 600
    );
  } catch {
    return false;
  }
}
export async function authorizedScheduler(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") || "";
  if (process.env.CRON_SECRET) {
    const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`),
      actual = Buffer.from(auth);
    if (expected.length === actual.length && timingSafeEqual(expected, actual))
      return true;
  }
  if (
    !auth.startsWith("Bearer ") ||
    auth.length > 16010 ||
    auth.split(".").length !== 3
  )
    return false;
  try {
    if (!cached || cached.until < Date.now()) {
      const response = await fetch(`${issuer}/.well-known/jwks`, {
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!response.ok) return false;
      const text = await response.text();
      if (text.length > 100000) return false;
      const data = JSON.parse(text);
      if (!Array.isArray(data.keys)) return false;
      cached = { keys: data.keys, until: Date.now() + 300000 };
    }
    return verifySchedulerToken(auth.slice(7), cached.keys);
  } catch {
    return false;
  }
}
