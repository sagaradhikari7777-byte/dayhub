import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();
async function collect(dir) {
  const files = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const f of files) {
    const path = join(dir, f.name);
    if (f.isDirectory()) out.push(...(await collect(path)));
    else if (/\.(js|css|woff2)$/.test(f.name))
      out.push("/" + path.replace(/^\.next\//, "_next/"));
  }
  return out;
}
const files = await collect(".next/static");
const source = await readFile("scripts/sw-template.js", "utf8");
await writeFile(
  "public/sw.js",
  source
    .replace("__BUILD_ID__", buildId)
    .replace("/*PRECACHE*/", JSON.stringify(files)),
);
console.log(`PWA shell prepared: ${files.length} static assets`);
