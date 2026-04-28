import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const distDir = path.join(root, "dist");

const targets = [
  "index.html",
  "style.css",
  "game.js",
  "manifest.json",
  "config",
  "ambient",
  "img",
  "music",
  "vendor",
  path.join("etc", "lista_palavras.txt")
];

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const target of targets) {
  const sourcePath = path.join(root, target);
  const destinationPath = path.join(distDir, target);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await cp(sourcePath, destinationPath, { recursive: true });
}

console.log(`Built static assets in ${path.relative(root, distDir)}.`);
