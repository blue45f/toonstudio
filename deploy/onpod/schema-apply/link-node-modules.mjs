// Builds node_modules directories inside the scratch repo that mirror the (read-only) worktree install.
// Dependencies resolve to the worktree's pnpm store via absolute symlinks; workspace links (@toonstudio/*)
// are re-created as relative links so they resolve to the scratch copies of packages/ at the pinned commit.
import { lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
const [worktree, scratch] = process.argv.slice(2);
const dirs = ["", "apps/api", "packages/contracts", "packages/core", "packages/studio-format-gateway", "packages/studio-project-model"];
const isWorkspaceLink = (target) => /(^|\/)packages\//u.test(target);
let links = 0, workspace = 0;
function mirror(srcDir, dstDir, depth) {
  mkdirSync(dstDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    if (name === ".bin" || name === ".pnpm" || name === ".cache" || name === ".modules.yaml" || name.startsWith(".vite")) continue;
    const src = join(srcDir, name), dst = join(dstDir, name);
    const st = lstatSync(src);
    if (st.isSymbolicLink()) {
      const target = readlinkSync(src);
      if (isWorkspaceLink(target)) { symlinkSync(target, dst); workspace += 1; }
      else { symlinkSync(resolve(srcDir, name), dst); links += 1; }
    } else if (st.isDirectory() && name.startsWith("@") && depth === 0) {
      mirror(src, dst, 1);
    } else { symlinkSync(src, dst); links += 1; }
  }
}
for (const rel of dirs) {
  const src = join(worktree, rel, "node_modules");
  if (!existsSync(src)) continue;
  const dst = join(scratch, rel, "node_modules");
  rmSync(dst, { recursive: true, force: true });
  mirror(src, dst, 0);
}
console.log(JSON.stringify({ links, workspace }));
