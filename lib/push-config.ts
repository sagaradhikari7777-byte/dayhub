import webpush from "web-push";
import { redisCommand, redisConfigured, type RedisCommand } from "./db/redis";

type PushConfig = { publicKey: string; privateKey: string; subject: string };
const key = "dayhub:v1:{dayhub-v1}:server:push-vapid:v1";
export async function storedPushConfig(
  command: RedisCommand,
): Promise<PushConfig> {
  let raw = await command(["GET", key]);
  if (typeof raw !== "string") {
    const generated = {
      ...webpush.generateVAPIDKeys(),
      subject: "https://dayhub-wine.vercel.app",
    };
    // One stable keypair across cold starts and concurrent first requests.
    await command(["SET", key, JSON.stringify(generated), "NX"]);
    raw = await command(["GET", key]);
  }
  if (typeof raw !== "string") throw new Error("Push setup is unavailable");
  const config = JSON.parse(raw) as PushConfig;
  if (!config.publicKey || !config.privateKey || !config.subject)
    throw new Error("Push setup is unavailable");
  return config;
}
export async function getPushConfig(): Promise<PushConfig | null> {
  if (
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  )
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
      subject: process.env.VAPID_SUBJECT,
    };
  // Keys stay inside the existing private, server-only database. No private
  // key is returned by the public subscription endpoint or stored in Git.
  if (redisConfigured()) return storedPushConfig(redisCommand);
  return null;
}
