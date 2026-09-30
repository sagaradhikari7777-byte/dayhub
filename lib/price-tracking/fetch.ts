import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { LookupAddress } from "node:dns";
import { ProductLookupError, storeResponseError } from "./errors";

// Node's connection family selection requests an array with `all: true`.
// Both callback shapes must retain the address already checked for SSRF.
export function pinnedLookup(address: LookupAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [address]);
    else callback(null, address.address, address.family);
  };
}
function publicAddress(ip: string) {
  if (isIP(ip) === 6)
    return !/^(::|fc|fd|fe80|ff|2001:db8)/i.test(ip) && !ip.includes(":ffff:");
  const n = ip.split(".").map(Number);
  return (
    n.length === 4 &&
    !(
      [0, 10, 127].includes(n[0]) ||
      n[0] >= 224 ||
      (n[0] === 169 && n[1] === 254) ||
      (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
      (n[0] === 192 && [0, 168].includes(n[1])) ||
      (n[0] === 100 && n[1] >= 64 && n[1] <= 127) ||
      (n[0] === 198 && [18, 19, 51].includes(n[1])) ||
      (n[0] === 203 && n[1] === 0)
    )
  );
}
export async function safeFetchDocument(
  url: string,
  redirects = 0,
  deadline = Date.now() + 25000,
): Promise<{ html: string; url: string }> {
  if (Date.now() >= deadline)
    throw new ProductLookupError(
      "store_timeout",
      "This store took too long to respond. Try again later.",
    );
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    u.hostname === "localhost" ||
    isIP(u.hostname.replace(/[\[\]]/g, ""))
  )
    throw new ProductLookupError(
      "invalid_store_url",
      "Please use a public HTTPS store URL.",
    );
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(u.hostname, { all: true });
  } catch {
    throw new ProductLookupError(
      "store_dns_failed",
      "The store link could not be resolved. Try again or copy the full product-page link.",
    );
  }
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new ProductLookupError(
      "store_address_rejected",
      "This store link does not resolve to a public address. Please use the full product-page link.",
    );
  // Prefer IPv4: some serverless regions resolve IPv6 but cannot route it.
  const ip = addresses.find((a) => a.family === 4) || addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.get(
      u,
      {
        headers: {
          "User-Agent": "DayHub/1.0 (personal product price checker)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
        },
        lookup: pinnedLookup(ip),
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirects >= 6)
            return reject(
              new ProductLookupError(
                "store_redirect_limit",
                "This store link redirects too many times. Please use the full product-page link.",
              ),
            );
          let next: URL;
          try {
            next = new URL(res.headers.location, u);
          } catch {
            return reject(
              new ProductLookupError(
                "invalid_store_redirect",
                "This store returned an invalid product link.",
              ),
            );
          }
          // Amazon's share service may return a legacy HTTP destination.
          // Upgrade known Amazon hosts; never send a plaintext store request.
          if (
            next.protocol === "http:" &&
            [
              "amazon.com.au",
              "www.amazon.com.au",
              "amzn.asia",
              "amzn.to",
            ].includes(next.hostname)
          )
            next.protocol = "https:";
          safeFetchDocument(next.href, redirects + 1, deadline).then(
            resolve,
            reject,
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(storeResponseError(res.statusCode || 0));
          return;
        }
        if (!/text\/html|xhtml/.test(res.headers["content-type"] || "")) {
          res.resume();
          reject(
            new ProductLookupError(
              "store_content_unreadable",
              "The store did not return a readable product page. Please use the full product-page link.",
            ),
          );
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (c) => {
          size += c.length;
          if (size > 6_000_000) {
            req.destroy();
            reject(new Error("This page is too large to analyse."));
          } else chunks.push(c);
        });
        res.on("end", () =>
          resolve({
            html: Buffer.concat(chunks).toString("utf8"),
            url: u.href,
          }),
        );
        res.on("error", reject);
      },
    );
    const timer = setTimeout(
      () =>
        req.destroy(
          new ProductLookupError(
            "store_timeout",
            "This store took too long to respond. Try again later or enter the price manually.",
          ),
        ),
      Math.max(1, Math.min(9000, deadline - Date.now())),
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error instanceof ProductLookupError) return reject(error);
      const code = ["ENOTFOUND", "EAI_AGAIN"].includes(error.code || "")
        ? "store_dns_failed"
        : "store_connection_failed";
      reject(
        new ProductLookupError(
          code,
          code === "store_dns_failed"
            ? "The store link could not be resolved. Try again or copy the full product-page link."
            : "The store connection could not be completed. Try again or copy the full product-page link.",
        ),
      );
    });
  });
}
export async function safeFetch(url: string): Promise<string> {
  return (await safeFetchDocument(url)).html;
}
