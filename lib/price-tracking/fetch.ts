import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
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
export async function safeFetch(url: string, redirects = 0): Promise<string> {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    u.hostname === "localhost" ||
    isIP(u.hostname.replace(/[\[\]]/g, ""))
  )
    throw new Error("Please use a public HTTPS store URL.");
  const addresses = await lookup(u.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("This address is not a public store.");
  const ip = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.get(
      u,
      {
        headers: {
          "User-Agent": "DayHub/1.0 (personal product price checker)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
        },
        lookup: ((
          _h: unknown,
          _o: unknown,
          cb: (e: null, a: string, f: number) => void,
        ) => cb(null, ip.address, ip.family)) as never,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirects >= 3)
            return reject(new Error("Too many store redirects."));
          safeFetch(new URL(res.headers.location, u).href, redirects + 1).then(
            resolve,
            reject,
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new Error(
              "This store could not be checked. You can enter its price manually.",
            ),
          );
          return;
        }
        if (!/text\/html|xhtml/.test(res.headers["content-type"] || "")) {
          res.resume();
          reject(new Error("The link is not a product page."));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (c) => {
          size += c.length;
          if (size > 2_000_000) {
            req.destroy();
            reject(new Error("This page is too large to analyse."));
          } else chunks.push(c);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      },
    );
    req.setTimeout(9000, () =>
      req.destroy(new Error("Store request timed out.")),
    );
    req.on("error", reject);
  });
}
