import { createHmac } from "node:crypto";

export function sessionSecret(env: NodeJS.ProcessEnv = process.env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  // Domain-separated derivation keeps zero-extra-secret Upstash setup secure.
  // Prefer SESSION_SECRET when token rotation should not invalidate sessions.
  if (token)
    return createHmac("sha256", token)
      .update("dayhub/session-signing/v1")
      .digest("hex");
  if (env.VERCEL) throw new Error("Session configuration is missing");
  return "dayhub-local-development-only-secret";
}
