#!/usr/bin/env node
/** 구매 PNG 원본을 변환 없이 content address로 준비한다. --check와 --write를 명시한다. */
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECIPE = join(REPO, "config/studio-plasticine-materials-source.json");
const CATALOG = join(REPO, "apps/web/src/domains/creator/bg3d/studio-bg3d-plasticine-materials.generated.json");
const PREFIX = "/assets/virtual-studio/purchased-materials-v1/plasticine";
const SHA256 = /^[a-f0-9]{64}$/u;

function parts(value) {
  assert.ok(typeof value === "string" && value && !isAbsolute(value)
    && !/[\\%?#:]/u.test(value)
    && !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127), "원본·출력의 상대 경로를 확인하세요.");
  const result = value.split("/");
  assert.ok(result.every((part) => part && part !== "." && part !== ".."), "상위 경로·빈 경로는 허용하지 않습니다.");
  return result;
}

async function directory(path, create) {
  let current = parse(path).root;
  for (const part of path.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    let state;
    try { state = await lstat(current); }
    catch (error) {
      if (error.code !== "ENOENT" || !create) throw new Error("원본·출력 디렉터리가 없습니다. source-root와 준비 순서를 확인하세요.", { cause: error });
      await mkdir(current);
      state = await lstat(current);
    }
    assert.ok(state.isDirectory() && !state.isSymbolicLink(), "원본·출력 디렉터리의 심볼릭 링크를 제거하세요.");
  }
  assert.equal(await realpath(path), path, "원본·출력의 실제 디렉터리 경로를 지정하세요.");
}

async function confinedSource(root, name) {
  let path = root;
  const names = parts(name);
  for (const [index, part] of names.entries()) {
    path = join(path, part);
    const state = await lstat(path);
    assert.ok(!state.isSymbolicLink() && (index === names.length - 1 ? state.isFile() : state.isDirectory()),
      "원본의 일반 파일·팩 내부 경로를 확인하세요. 심볼릭 링크는 허용하지 않습니다.");
  }
  return path;
}

function sameFile(a, b) {
  return ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every((key) => a[key] === b[key]);
}

async function digestFile(path, expected, destination) {
  const state = await lstat(path);
  assert.ok(state.isFile() && !state.isSymbolicLink() && state.size === expected.bytes, "원본·출력 파일 크기가 등록 기록과 다릅니다.");
  const source = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    assert.ok(sameFile(state, await source.stat()), "읽기 전에 파일이 바뀌었습니다. 다른 쓰기 작업을 중지하세요.");
    const hash = createHash("sha256"); let bytes = 0;
    for await (const chunk of source.createReadStream({ autoClose: false, highWaterMark: 1024 * 1024 })) {
      bytes += chunk.length;
      assert.ok(bytes <= expected.bytes, "검사 중 파일 크기가 바뀌었습니다.");
      hash.update(chunk);
      if (destination) {
        let offset = 0;
        while (offset < chunk.length) {
          const result = await destination.write(chunk, offset, chunk.length - offset, null);
          assert.ok(result.bytesWritten > 0, "출력을 기록하지 못했습니다. 디스크 여유를 확인하세요.");
          offset += result.bytesWritten;
        }
      }
    }
    assert.equal(bytes, expected.bytes, "실제 바이트 수가 등록 기록과 다릅니다.");
    assert.equal(hash.digest("hex"), expected.sha256, "원본·출력 SHA-256이 다릅니다. 원본을 다시 확인하세요.");
    assert.ok(sameFile(state, await source.stat()) && sameFile(state, await lstat(path)), "검사 중 원본·출력 파일이 바뀌었습니다.");
  } finally { await source.close(); }
}

/** PNG 해상도·포맷을 바꾸지 않고 이미 감사한 원문 SHA와 동일한 파일만 준비한다. */
export async function preparePlasticineMaterialFiles({ sourceRoot, outputRoot, sourceFiles, write = false }) {
  const source = resolve(sourceRoot), output = resolve(outputRoot);
  const nested = relative(source, output);
  assert.ok(nested && (nested.startsWith(`..${sep}`) || nested === ".." || isAbsolute(nested)),
    "출력은 구매 원본 디렉터리 밖으로 지정하세요.");
  await directory(source, false);
  let copied = 0; let existing = 0; let logicalBytes = 0;
  const targets = new Map();
  for (const item of sourceFiles) {
    assert.ok(SHA256.test(item.sha256) && Number.isSafeInteger(item.bytes) && item.bytes > 0, "원본 해시·크기를 확인하세요.");
    assert.equal(item.url, `${PREFIX}/maps/${item.sha256}.png`, "출력 URL은 등록한 content address여야 합니다.");
    const targetRelative = item.url.slice(PREFIX.length + 1);
    parts(targetRelative);
    const file = await confinedSource(source, item.source);
    const target = join(output, targetRelative);
    const prior = targets.get(target);
    if (prior) {
      assert.equal(prior, item.bytes, "같은 SHA의 파일 크기가 다릅니다.");
      await digestFile(file, item);
      logicalBytes += item.bytes;
      continue;
    }
    let present = false;
    try {
      const state = await lstat(target);
      assert.ok(state.isFile() && !state.isSymbolicLink(), "기존 출력이 일반 파일이 아닙니다. 별도 경로를 사용하세요.");
      present = true;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (present || !write) {
      await digestFile(file, item);
      await directory(dirname(target), false);
      await digestFile(target, item);
      existing += 1;
    } else {
      await directory(dirname(target), true);
      const temporary = `${target}.tmp-${randomUUID()}`;
      const destination = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try {
        await digestFile(file, item, destination);
        await destination.close();
        // 새 임시 출력에만 hard link를 사용해 동시 생성된 기존 파일의 덮어쓰기를 원자적으로 거부한다.
        await link(temporary, target);
        copied += 1;
      } finally {
        await destination.close().catch((error) => { if (error.code !== "EBADF") throw error; });
        await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
      }
    }
    targets.set(target, item.bytes); logicalBytes += item.bytes;
  }
  return { logicalFiles: sourceFiles.length, uniqueFiles: targets.size, logicalBytes,
    uniqueBytes: [...targets.values()].reduce((sum, value) => sum + value, 0), copied, existing };
}

export function buildPlasticineMaterialCatalog(recipe) {
  assert.equal(recipe.schema, "toonstudio.purchased-material-source.v1", "구매 재질 source recipe 형식을 확인하세요.");
  assert.equal(recipe.assetBaseUrl, PREFIX, "구매 재질 URL 기준을 확인하세요.");
  assert.equal(recipe.expectedLogicalFiles, 65, "감사한 원본 65개가 필요합니다.");
  assert.equal(recipe.sourceFiles.length, 65, "감사한 원본 65개가 필요합니다.");
  assert.equal(recipe.sourceFiles.reduce((sum, row) => sum + row.bytes, 0), recipe.expectedLogicalBytes, "감사한 총 바이트 수가 다릅니다.");
  const assets = new Map();
  assert.equal(new Set(recipe.sourceFiles.map((row) => row.source)).size, 65, "원본 경로가 중복됐습니다.");
  for (const row of recipe.sourceFiles) {
    parts(row.source);
    assert.ok(SHA256.test(row.sha256) && Number.isSafeInteger(row.bytes) && row.bytes > 0
      && row.url === `${PREFIX}/maps/${row.sha256}.png`, "원본 URL·해시·크기를 확인하세요.");
    const descriptor = { url: row.url, sha256: row.sha256, bytes: row.bytes };
    if (assets.has(row.url)) assert.deepEqual(assets.get(row.url), descriptor, "동일한 원본 해시의 크기가 다릅니다.");
    assets.set(row.url, descriptor);
  }
  const materials = [];
  for (let number = 1; number <= 11; number += 1) {
    const id = String(number).padStart(2, "0"), variants = [];
    for (const [sourceVariant, resolution] of [["native-8k", 8192], ["godot-2k", 2048]]) {
      const rows = recipe.sourceFiles.filter((row) => row.materialId === id && row.sourceVariant === sourceVariant);
      if (!rows.length && sourceVariant === "native-8k" && number > 8) continue;
      const expected = sourceVariant === "native-8k" ? ["BaseColor", "Metallic", "Normal", "Roughness"] : ["BaseColor", "Normal", "Roughness"];
      assert.deepEqual(rows.map((row) => row.channel).sort(), expected, "원본 채널 구성·해상도를 확인하세요.");
      assert.ok(rows.every((row) => row.width === resolution && row.height === resolution), "원본 해상도 표기가 다릅니다.");
      const map = (channel) => { const row = rows.find((item) => item.channel === channel); return row ? assets.get(row.url) : null; };
      variants.push({ id: `emaceart-plasticine-${id}-${sourceVariant}`, sourceVariant, resolution,
        maps: { baseColor: map("BaseColor"), normal: map("Normal"), roughness: map("Roughness"), metalness: map("Metallic") } });
    }
    const preview = variants.find((variant) => variant.sourceVariant === "godot-2k");
    materials.push({ id: `emaceart-plasticine-${id}`, labelKo: `플라스티신 ${id}`, labelEn: `Plasticine ${id}`,
      previewUrl: preview.maps.baseColor.url, defaultVariantId: variants[0].id, variants });
  }
  return { schema: "toonstudio.purchased-surface-materials.v1", packId: recipe.packId, provider: recipe.provider,
    license: recipe.license, originalPngVerification: recipe.originalPngVerification,
    assets: [...assets.values()].sort((a, b) => a.url < b.url ? -1 : a.url > b.url ? 1 : 0), materials };
}

async function main(argv) {
  const options = new Map(); let mode;
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (["--check", "--write", "--generate-catalog"].includes(key)) {
      assert.ok(!mode, "check·write·generate-catalog 중 하나만 지정하세요."); mode = key; continue;
    }
    assert.ok(["--source-root", "--output-root"].includes(key) && argv[i + 1] && !options.has(key), "명령의 옵션·값을 확인하세요.");
    options.set(key, argv[++i]);
  }
  assert.ok(mode, "--check 또는 --write를 명시하세요. 카탈로그 재생성은 --generate-catalog입니다.");
  const recipe = JSON.parse(await readFile(RECIPE, "utf8"));
  const catalog = `${JSON.stringify(buildPlasticineMaterialCatalog(recipe), null, 2)}\n`;
  if (mode === "--generate-catalog") {
    assert.equal(options.size, 0, "카탈로그 재생성에는 원본·출력 옵션을 지정하지 않습니다.");
    await writeFile(CATALOG, catalog);
    console.log(JSON.stringify({ mode: "generate-catalog", materials: 11, variants: 19 })); return;
  }
  assert.equal(await readFile(CATALOG, "utf8"), catalog, "카탈로그가 source recipe와 다릅니다. --generate-catalog로 재생성하세요.");
  assert.ok(options.get("--source-root"), "구매 팩의 실제 디렉터리를 --source-root로 지정하세요.");
  const summary = await preparePlasticineMaterialFiles({ sourceRoot: options.get("--source-root"),
    outputRoot: options.get("--output-root") ?? join(REPO, "apps/web/public", PREFIX),
    sourceFiles: recipe.sourceFiles, write: mode === "--write" });
  console.log(JSON.stringify({ mode: mode.slice(2), materials: 11, variants: 19, ...summary, originalBytesTransformed: false }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof assert.AssertionError ? error.message : "구매 재질 준비에 실패했습니다. 원본 경로·권한·디스크 여유를 확인하세요.");
  process.exitCode = 1;
});
