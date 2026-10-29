#!/usr/bin/env node
/**
 * 구매 목록과 로컬 팩 색인·실물을 읽기 전용으로 대조한다.
 * 비공개 구매/다운로드 URL은 입력 단계에서 거부하며, 원본 에셋을 복사하지 않는다.
 * --out 보고서만 명시적으로 쓰고 --dry-run에서는 이 파일도 쓰지 않는다.
 */
import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readdirSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "node scripts/audit-itch-purchased-library.mjs --library-root <dir> --purchases <공용 URL JSON> [--out <report.json>] [--dry-run] [--hash-duplicates]";
const MODEL_EXTENSIONS = new Set(["glb", "gltf", "fbx", "obj", "blend", "dae"]);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const normalizedName = (value) => value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/gu, "");

export function normalizeItchProjectUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("구매 항목에는 유효한 공용 itch.io 프로젝트 URL이 필요합니다."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash
    || !/^[a-z0-9][a-z0-9-]*\.itch\.io$/u.test(url.hostname)
    || !/^\/[a-z0-9][a-z0-9-]*\/?$/u.test(url.pathname)
    || /^\/(download|private|my-purchases|dashboard|api)(\/|$)/u.test(url.pathname)) {
    throw new Error("공용 프로젝트 URL만 허용합니다. 구매·다운로드 주소, 토큰, 쿼리, 계정 정보는 저장하지 마세요.");
  }
  return `${url.origin}${url.pathname.replace(/\/$/u, "")}`;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error("JSON 입력을 읽을 수 없습니다. 경로·읽기 권한·JSON 문법을 확인한 뒤 같은 명령을 다시 실행하세요."); }
}

function safeChild(root, value) {
  if (typeof value !== "string" || !value || isAbsolute(value) || value.includes("\\")
    || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("로컬 색인 경로는 라이브러리 내부의 안전한 상대 경로여야 합니다.");
  }
  let current = root;
  for (const part of value.split("/")) {
    current = resolve(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("심볼릭 링크 경로는 조사하지 않습니다. 정본 폴더를 지정하세요.");
  }
  return current;
}

function validatePurchases(input) {
  const source = Array.isArray(input) ? input : input?.purchases;
  if (!Array.isArray(source) || source.length === 0) throw new Error("purchases 배열에 공용 상품 목록을 넣으세요.");
  const urls = new Set();
  return source.map((entry) => {
    if (!entry || typeof entry.title !== "string" || !entry.title.trim() || entry.title.length > 240
      || [...entry.title].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127)) throw new Error("구매 항목의 상품명이 비어 있거나 올바르지 않습니다.");
    const url = normalizeItchProjectUrl(entry.url ?? entry.sourceUrl);
    if (urls.has(url)) throw new Error("구매 목록에 중복된 공용 프로젝트 URL이 있습니다. 중복을 제거한 뒤 다시 실행하세요.");
    urls.add(url);
    for (const key of ["catalogId", "localSlug"]) {
      if (entry[key] !== undefined && (typeof entry[key] !== "string" || !/^[a-z0-9][a-z0-9-]*$/u.test(entry[key]))) {
        throw new Error("catalogId와 localSlug는 소문자 영문·숫자·하이픈 식별자여야 합니다.");
      }
    }
    if (entry.localSlugs !== undefined && (!Array.isArray(entry.localSlugs) || entry.localSlugs.length === 0
      || entry.localSlugs.some((slug) => typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/u.test(slug))
      || new Set(entry.localSlugs).size !== entry.localSlugs.length || entry.localSlug || entry.catalogId)) {
      throw new Error("localSlugs는 중복 없는 팩 slug 배열이어야 하며 단일 매핑 필드와 함께 쓰지 않습니다.");
    }
    return { title: entry.title.trim(), url, ...(entry.catalogId ? { catalogId: entry.catalogId } : {}), ...(entry.localSlug ? { localSlug: entry.localSlug } : {}), ...(entry.localSlugs ? { localSlugs: [...entry.localSlugs].sort(compare) } : {}) };
  });
}

function hashFile(path) {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes;
    while ((bytes = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
  } finally { closeSync(fd); }
  return hash.digest("hex");
}

export function auditItchPurchasedLibrary({ libraryRoot, purchases, hashDuplicates = false }) {
  const root = resolve(libraryRoot);
  if (!existsSync(root) || lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) {
    throw new Error("라이브러리 루트는 심볼릭 링크가 아닌 실제 디렉터리여야 합니다.");
  }
  const catalog = readJson(safeChild(root, "_catalog/packs.json"));
  if (!Array.isArray(catalog?.packs) || catalog.packs.length === 0) throw new Error("_catalog/packs.json의 packs 배열이 없거나 비어 있습니다.");
  const products = validatePurchases(purchases);
  const problems = [];
  const packs = [];
  const seenPaths = new Set();
  const seenSlugs = new Set();
  const filesBySize = new Map();
  const totals = { packs: 0, files: 0, bytes: 0, formats: {} };
  for (const entry of [...catalog.packs].sort((a, b) => compare(String(a.path), String(b.path)))) {
    const path = safeChild(root, entry.path);
    if (typeof entry.slug !== "string" || !entry.slug || typeof entry.title !== "string" || !entry.title) throw new Error("로컬 팩 색인에 slug 또는 title이 없습니다.");
    if (seenPaths.has(entry.path) || seenSlugs.has(entry.slug)) throw new Error("로컬 색인에 중복된 팩 경로 또는 slug가 있습니다.");
    seenPaths.add(entry.path); seenSlugs.add(entry.slug);
    const pack = { slug: entry.slug, title: entry.title, path: entry.path, catalogId: entry.catalogId ?? null, ...(entry.sourceUrl ? { sourceUrl: normalizeItchProjectUrl(entry.sourceUrl) } : {}), files: 0, bytes: 0, formats: {}, modelFormats: {}, licenseFiles: [] };
    function walk(directory) {
      for (const child of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
        const childPath = resolve(directory, child.name);
        const rel = relative(root, childPath).split(sep).join("/");
        const stat = lstatSync(childPath);
        if (stat.isSymbolicLink()) { problems.push({ code: "symlink-rejected", path: rel }); continue; }
        if (stat.isDirectory()) { walk(childPath); continue; }
        if (!stat.isFile()) { problems.push({ code: "non-file-rejected", path: rel }); continue; }
        const extension = extname(child.name).toLowerCase().slice(1) || "no-extension";
        pack.files += 1; pack.bytes += stat.size;
        pack.formats[extension] = (pack.formats[extension] ?? 0) + 1;
        if (MODEL_EXTENSIONS.has(extension)) pack.modelFormats[extension] = (pack.modelFormats[extension] ?? 0) + 1;
        if (/(license|eula|copyright|terms)/iu.test(child.name)) pack.licenseFiles.push(rel);
        if (hashDuplicates && stat.size > 0) {
          const list = filesBySize.get(stat.size) ?? [];
          list.push({ path: childPath, relativePath: rel }); filesBySize.set(stat.size, list);
        }
      }
    }
    if (!existsSync(path) || !lstatSync(path).isDirectory()) problems.push({ code: "pack-missing", path: entry.path });
    else walk(path);
    for (const key of ["files", "bytes"]) {
      if (!Number.isSafeInteger(entry[key]) || entry[key] < 0) throw new Error("로컬 색인의 files·bytes는 0 이상의 안전한 정수여야 합니다.");
      if (pack[key] !== entry[key]) problems.push({ code: `catalog-${key}-mismatch`, path: entry.path, expected: entry[key], actual: pack[key] });
    }
    if (entry.models) {
      for (const format of new Set([...Object.keys(entry.models), ...Object.keys(pack.modelFormats)])) {
        if ((entry.models[format] ?? 0) !== (pack.modelFormats[format] ?? 0)) problems.push({ code: "catalog-model-format-mismatch", path: entry.path, format, expected: entry.models[format] ?? 0, actual: pack.modelFormats[format] ?? 0 });
      }
    }
    packs.push(pack); totals.packs += 1; totals.files += pack.files; totals.bytes += pack.bytes;
    for (const [format, count] of Object.entries(pack.formats)) totals.formats[format] = (totals.formats[format] ?? 0) + count;
  }
  for (const category of readdirSync(root, { withFileTypes: true }).filter((entry) => /^\d{2}-/u.test(entry.name))) {
    const categoryPath = safeChild(root, category.name);
    if (!category.isDirectory()) continue;
    for (const child of readdirSync(categoryPath, { withFileTypes: true })) {
      const path = `${category.name}/${child.name}`;
      if (child.isSymbolicLink()) problems.push({ code: "symlink-rejected", path });
      else if (child.isDirectory() && !seenPaths.has(path)) problems.push({ code: "uncatalogued-pack", path });
    }
  }
  for (const key of ["packs", "files", "bytes"]) {
    if (catalog.totals?.[key] !== undefined && catalog.totals[key] !== totals[key]) problems.push({ code: `catalog-total-${key}-mismatch`, expected: catalog.totals[key], actual: totals[key] });
  }
  const matched = [];
  const purchaseOnly = [];
  const matchedSlugs = new Set();
  for (const product of products) {
    const explicit = Boolean(product.localSlugs || product.localSlug || product.catalogId);
    const candidates = packs.filter((pack) => product.localSlugs ? product.localSlugs.includes(pack.slug) : product.localSlug || product.catalogId
      ? (!product.localSlug || product.localSlug === pack.slug) && (!product.catalogId || product.catalogId === pack.catalogId)
      : product.url === pack.sourceUrl || [pack.title, pack.slug].some((name) => normalizedName(name) === normalizedName(product.title)));
    const expectedCount = product.localSlugs?.length ?? 1;
    const duplicateInferredMatch = !explicit && candidates.some((pack) => matchedSlugs.has(pack.slug));
    if (candidates.length !== expectedCount || duplicateInferredMatch) {
      purchaseOnly.push({ ...product, reason: candidates.length > expectedCount ? "ambiguous-local-match" : duplicateInferredMatch ? "duplicate-local-match" : "local-match-unconfirmed" });
      if (candidates.length > expectedCount || duplicateInferredMatch) problems.push({ code: "purchase-local-match-ambiguous", url: product.url });
      continue;
    }
    for (const pack of candidates) matchedSlugs.add(pack.slug);
    matched.push({ ...product, ...(candidates.length === 1 ? { localSlug: candidates[0].slug, path: candidates[0].path } : { localSlugs: candidates.map((pack) => pack.slug), paths: candidates.map((pack) => pack.path) }), received: candidates.every((pack) => pack.files > 0), files: candidates.reduce((sum, pack) => sum + pack.files, 0), bytes: candidates.reduce((sum, pack) => sum + pack.bytes, 0) });
  }
  const duplicateGroups = [];
  if (hashDuplicates) {
    for (const [bytes, files] of filesBySize) {
      if (files.length < 2) continue;
      const byHash = new Map();
      for (const file of files) { const hash = hashFile(file.path); const list = byHash.get(hash) ?? []; list.push(file.relativePath); byHash.set(hash, list); }
      for (const [sha256, paths] of byHash) if (paths.length > 1) duplicateGroups.push({ sha256, bytes, copies: paths.length, paths });
    }
    duplicateGroups.sort((a, b) => compare(a.sha256, b.sha256));
  }
  return {
    schema: "toonstudio.itch-purchased-library-audit.v1",
    capturedOn: !Array.isArray(purchases) && /^\d{4}-\d{2}-\d{2}$/u.test(purchases?.capturedOn ?? "") ? purchases.capturedOn : null,
    totals: { ...totals, purchases: products.length, matched: matched.length, received: matched.filter((entry) => entry.received).length, purchaseOnly: purchaseOnly.length, localOnly: packs.filter((pack) => !matchedSlugs.has(pack.slug)).length },
    matching: "catalogId/localSlug/localSlugs가 있으면 명시 매핑(묶음·무료판 포함), 없으면 공용 URL 또는 제목·slug의 구두점 제외 완전 일치만 사용한다. 미일치는 미수신 확정이 아니라 연결 확인 대기다.",
    duplicateFiles: { checked: hashDuplicates, groups: duplicateGroups.length, extraCopies: duplicateGroups.reduce((sum, group) => sum + group.copies - 1, 0), redundantBytes: duplicateGroups.reduce((sum, group) => sum + group.bytes * (group.copies - 1), 0), entries: duplicateGroups },
    problems, matched, purchaseOnly, localOnly: packs.filter((pack) => !matchedSlugs.has(pack.slug)), packs,
  };
}

export function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--hash-duplicates") options.hashDuplicates = true;
    else if (["--library-root", "--purchases", "--out"].includes(arg)) {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`필수 옵션 값이 없습니다. ${USAGE}`);
      options[arg.slice(2)] = resolve(argv[++i]);
    } else throw new Error(`알 수 없는 옵션입니다. ${USAGE}`);
  }
  if (!options["library-root"] || !options.purchases) throw new Error(`필수 입력이 없습니다. ${USAGE}`);
  const report = auditItchPurchasedLibrary({ libraryRoot: options["library-root"], purchases: readJson(options.purchases), hashDuplicates: options.hashDuplicates });
  if (options.out && !options.dryRun) {
    if (existsSync(options.out) && lstatSync(options.out).isSymbolicLink()) throw new Error("보고서 출력 경로의 심볼릭 링크는 허용하지 않습니다.");
    if (!existsSync(dirname(options.out))) throw new Error("보고서 출력 폴더가 없습니다. 폴더를 만든 뒤 같은 명령을 다시 실행하세요.");
    const rel = relative(realpathSync(options["library-root"]), resolve(realpathSync(dirname(options.out)), options.out.split(sep).at(-1)));
    if (rel === "" || (!rel.startsWith(`..${sep}`) && !isAbsolute(rel))) throw new Error("조사 대상 라이브러리 안에는 보고서를 쓰지 않습니다. --out을 라이브러리 밖으로 지정하세요.");
    writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  }
  console.log(`로컬 ${report.totals.packs}팩 · ${report.totals.files}파일 · ${report.totals.bytes}바이트 / 구매 ${report.totals.purchases}품목 · 연결 ${report.totals.matched} · 연결 확인 대기 ${report.totals.purchaseOnly} · 문제 ${report.problems.length}${options.dryRun ? " (dry-run: 쓰기 없음)" : ""}`);
  return report.problems.length > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) {
    const cause = error instanceof Error && "code" in error ? `파일 시스템 오류(${error.code})입니다. 경로·권한을 확인하세요.` : error instanceof Error ? error.message : "입력을 확인하세요.";
    console.error(`조사를 완료하지 못했습니다. ${cause}`); process.exitCode = 2;
  }
}
