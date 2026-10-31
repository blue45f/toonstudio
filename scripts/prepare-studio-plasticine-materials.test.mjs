import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildPlasticineMaterialCatalog, preparePlasticineMaterialFiles } from "./prepare-studio-plasticine-materials.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const prefix = "/assets/virtual-studio/purchased-materials-v1/plasticine";
const sha = (body) => createHash("sha256").update(body).digest("hex");
const row = (source, body) => ({ source, bytes: body.length, sha256: sha(body), url: `${prefix}/maps/${sha(body)}.png` });

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "toon-plasticine-")));
  (t.onTestFinished ?? t.after.bind(t))(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, "source"), outputRoot = join(root, "output");
  await mkdir(sourceRoot);
  return { root, sourceRoot, outputRoot };
}

test("원본 바이트를 보존하며 동일 SHA의 논리 맵은 물리 파일 하나로 준비한다", async (t) => {
  const f = await fixture(t), body = Buffer.from("감사한 원본 바이트");
  await writeFile(join(f.sourceRoot, "a.png"), body);
  await writeFile(join(f.sourceRoot, "b.png"), body);
  const sourceFiles = [row("a.png", body), row("b.png", body)];
  const prepared = await preparePlasticineMaterialFiles({ ...f, sourceFiles, write: true });
  assert.deepEqual(prepared, { logicalFiles: 2, uniqueFiles: 1, logicalBytes: body.length * 2,
    uniqueBytes: body.length, copied: 1, existing: 0 });
  assert.deepEqual(await readFile(join(f.outputRoot, "maps", `${sha(body)}.png`)), body);
  assert.deepEqual(await readFile(join(f.sourceRoot, "a.png")), body);
  const checked = await preparePlasticineMaterialFiles({ ...f, sourceFiles });
  assert.equal(checked.copied, 0); assert.equal(checked.existing, 1);
});

test("원본이 변조되면 이름이 content address인 정상 출력으로 게시하지 않는다", async (t) => {
  const f = await fixture(t), original = Buffer.from("original"), altered = Buffer.from("modified");
  await writeFile(join(f.sourceRoot, "a.png"), altered);
  await assert.rejects(preparePlasticineMaterialFiles({ ...f, sourceFiles: [row("a.png", original)], write: true }), /SHA-256/);
  await assert.rejects(readFile(join(f.outputRoot, "maps", `${sha(original)}.png`)), { code: "ENOENT" });
});

test("기존 출력의 다른 바이트를 덮어쓰거나 정상으로 표시하지 않는다", async (t) => {
  const f = await fixture(t), body = Buffer.from("original");
  await writeFile(join(f.sourceRoot, "a.png"), body);
  await mkdir(join(f.outputRoot, "maps"), { recursive: true });
  const path = join(f.outputRoot, "maps", `${sha(body)}.png`);
  await writeFile(path, Buffer.from("modified"));
  await assert.rejects(preparePlasticineMaterialFiles({ ...f, sourceFiles: [row("a.png", body)], write: true }), /SHA-256/);
  assert.equal((await readFile(path)).toString(), "modified");
});

test("심볼릭 링크인 원본과 출력 디렉터리를 통해 팩 밖 파일에 접근하지 않는다", async (t) => {
  const f = await fixture(t), body = Buffer.from("original");
  await writeFile(join(f.root, "outside.png"), body);
  await symlink(join(f.root, "outside.png"), join(f.sourceRoot, "link.png"));
  await assert.rejects(preparePlasticineMaterialFiles({ ...f, sourceFiles: [row("link.png", body)], write: true }), /심볼릭 링크/);
  await writeFile(join(f.sourceRoot, "a.png"), body);
  await mkdir(f.outputRoot);
  await symlink(f.root, join(f.outputRoot, "maps"));
  await assert.rejects(preparePlasticineMaterialFiles({ ...f, sourceFiles: [row("a.png", body)], write: true }), /심볼릭 링크/);
  await assert.rejects(readFile(join(f.root, `${sha(body)}.png`)), { code: "ENOENT" });
});

test("상위 경로·임의 URL·원본 내부 출력은 쓰기 전에 거부한다", async (t) => {
  const f = await fixture(t), body = Buffer.from("original"), descriptor = row("../outside.png", body);
  await assert.rejects(preparePlasticineMaterialFiles({ ...f, sourceFiles: [descriptor], write: true }), /상위 경로/);
  await assert.rejects(preparePlasticineMaterialFiles({ ...f, sourceFiles: [{ ...descriptor, url: "/elsewhere/a.png" }], write: true }), /content address/);
  await assert.rejects(preparePlasticineMaterialFiles({ ...f, outputRoot: join(f.sourceRoot, "copies"), sourceFiles: [], write: true }), /원본 디렉터리 밖/);
});

test("check 모드는 준비되지 않은 출력을 만들지 않는다", async (t) => {
  const f = await fixture(t), body = Buffer.from("original");
  await writeFile(join(f.sourceRoot, "a.png"), body);
  await assert.rejects(preparePlasticineMaterialFiles({ ...f, sourceFiles: [row("a.png", body)] }), /디렉터리가 없습니다/);
  await assert.rejects(readFile(join(f.outputRoot, "maps", `${sha(body)}.png`)), { code: "ENOENT" });
});

test("실제 source recipe에서 11재질·19원본·65논리 맵을 재생성하고 구매 출처를 보존한다", async () => {
  const recipe = JSON.parse(await readFile(new URL("../config/studio-plasticine-materials-source.json", import.meta.url), "utf8"));
  const expected = JSON.parse(await readFile(new URL("../apps/web/src/domains/creator/bg3d/studio-bg3d-plasticine-materials.generated.json", import.meta.url), "utf8"));
  const catalog = buildPlasticineMaterialCatalog(recipe);
  assert.deepEqual(catalog, expected);
  assert.equal(catalog.materials.length, 11);
  assert.equal(catalog.materials.flatMap((material) => material.variants).length, 19);
  assert.equal(catalog.assets.length, 59);
  assert.equal(catalog.license.kind, "purchased-project-use");
  assert.equal(catalog.provider, "EmacEArt");
  assert.equal(catalog.materials[8].variants.length, 1);
  assert.equal(catalog.materials[8].variants[0].sourceVariant, "godot-2k");
  const corrupted = structuredClone(recipe); corrupted.sourceFiles[0].width = 8192;
  assert.throws(() => buildPlasticineMaterialCatalog(corrupted), /해상도/);
});
