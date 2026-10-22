#!/usr/bin/env node
/**
 * plan-creator-bundle-deploy.mjs
 *
 * Creator Bundle bundle-v2 R2 배포 계획기·실행기.
 *
 * bg3d 테마 팩 패널이 읽는 theme-packs.json의 배치 가능 에셋은
 * `/assets/studio/bundle-v2/<sha256>.glb` URL로 서빙돼야 하지만, GLB 실물은 레포에
 * 없고 인제스션 v2 산출 트리(~/workspace/bundle-ingest/output-v2 등)에만 있다.
 * 이 스크립트는 그 트리와 theme-packs.json을 전수 대조(실재·바이트·sha256·
 * GLB 헤더·외부 리소스 uri)해 R2 객체 목록(배포 매니페스트)을 산출하고,
 * 소유자가 자격증명을 가진 기기에서 --production으로 업로드한다.
 *
 * 경로 규칙 (로더 studio-bg3d-bundle-theme-packs.ts의 studioBg3dBundleAssetUrl과 동일):
 *   - R2 키: `assets/studio/bundle-v2/<sha256 hex>.glb` — 원본 폴더·파일명이 들어가지 않는
 *     내용 주소 키다. 같은 바이트는 한 객체로 합치고, 내용이 바뀌면 키가 바뀌므로
 *     immutable 1년 캐시가 항상 안전하다.
 *   - 공개 경로: `/` + 키
 *   - 마지막 객체는 배포 인덱스(manifest.json)다. 패널이 이 파일의
 *     files/bytes 합계와 테마 팩 데이터를 대조해 배포 완료를 판정하므로,
 *     인덱스가 올라가 있으면 배포가 끝난 것으로 본다 (업로드 순서 고정).
 *   - 불투명 키는 URL 추측·열거를 어렵게 하는 핫링크 억제책일 뿐 법적 허락이 아니다.
 *     theme-packs.json이 sha256을 공개하므로 키는 공개 데이터에서 계산된다.
 *
 * 게이트 (fail-closed):
 *   - 권리 원장(config/creator-bundle-pack-rights.json)에서 allow이고 증빙 자격을 갖춘 배치 가능 팩(group "pack")의
 *     에셋만 계획에 넣는다. hold·원장에 없는 팩·묶음/제목/제작사가 어긋난 팩의 에셋은 실물 파일을 읽지도 않고 제외한다.
 *   - theme-packs.json의 팩별 권리 블록이 원장 투영(packRightsProjection)과 다르거나 없으면(원장 이전 스냅샷·
 *     grant 변경 뒤 미재생성) 그 팩도 제외한다(rights-drift). 클라이언트가 읽는 권리 표기가 원장보다 넓어질 수 없다.
 *   - 에셋 경로는 에셋 루트 상대 경로여야 하고 소속 팩의 ingestPackIds 폴더 아래여야 한다(로더와 같은 규칙).
 *     다른 팩 폴더나 루트 밖 파일은 허용된 팩의 이름으로 올라갈 수 없다.
 *   - 제외 에셋이 생기면(stale) 경고하고, --production은 거부한다.
 *     생성기(generate-creator-bundle-theme-packs.mjs)를 다시 실행해야 인덱스 합계가 맞는다.
 *   - 이 도구는 R2 객체를 지우지 않는다. 이미 올라간 팩의 권리를 철회(allow → hold)하면 해당 sha256 객체는
 *     소유자가 직접 삭제해야 한다(인덱스를 내려도 Worker는 GLB 키를 직접 서빙한다).
 *   - 런타임 검증기(studio-bg3d-glb-validation.ts)가 external-resource-uri로
 *     거부하는 GLB(buffers/images의 uri 속성 보유)가 theme-packs에 배치 가능으로
 *     남아 있으면 계획을 만들지 않고 실패한다. 생성기를 먼저 고쳐 재생성할 것.
 *
 * 사용법 (레포 루트에서 실행):
 *   node scripts/plan-creator-bundle-deploy.mjs --asset-root <output-v2 트리> [--dry-run]
 *   node scripts/plan-creator-bundle-deploy.mjs --asset-root <트리> --write
 *   node scripts/plan-creator-bundle-deploy.mjs --asset-root <트리> --production
 *   공통 옵션: [--theme-packs <경로>] [--pack-rights <권리 원장 경로>] [--out <매니페스트 경로>]
 * 기본은 --dry-run(목록 산출·검증만, 쓰기 없음)이다. --production은
 * wrangler 로그인이 된 기기에서만 실행한다 (이 스크립트 자체는 자격증명을
 * 읽거나 출력하지 않는다).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  DEFAULT_PACK_RIGHTS_PATH,
  evaluateServeDecision,
  loadPackRightsLedger,
  packRightsProjection,
  validatePackRightsLedger,
} from "./lib/creator-bundle-pack-rights.mjs";

export const BUNDLE_V2_BUCKET = "toonspectrum-public-assets";
export const BUNDLE_V2_KEY_PREFIX = "assets/studio/bundle-v2/";
export const BUNDLE_V2_INDEX_KEY = `${BUNDLE_V2_KEY_PREFIX}manifest.json`;
export const BUNDLE_V2_INDEX_SCHEMA = "toonstudio.bundle-v2-deploy-index.v1";
export const BUNDLE_V2_MANIFEST_SCHEMA = "toonstudio.bundle-v2-deploy-manifest.v1";
/** deploy/cloudflare-static/src/large-static-assets.ts의 값과 동기 유지. */
export const BUNDLE_V2_GLB_CACHE_CONTROL = "public, max-age=31536000, immutable, s-maxage=0";
export const BUNDLE_V2_INDEX_CACHE_CONTROL = "public, max-age=300, s-maxage=0";
const GLB_CONTENT_TYPE = "model/gltf-binary";
const INDEX_CONTENT_TYPE = "application/json";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_THEME_PACKS = join(
  REPO_ROOT,
  "apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json",
);
const DEFAULT_OUT = join(REPO_ROOT, "deploy/cloudflare-static/bundle-v2-deploy-manifest.json");

const SHA256_HEX = /^[a-f0-9]{64}$/u;

/** 에셋 sha256(소문자 hex) → R2 키. 원본 경로는 키에 들어가지 않는다. */
export function bundleV2ObjectKey(sha256) {
  if (typeof sha256 !== "string" || !SHA256_HEX.test(sha256)) {
    throw new TypeError(`bundle-v2 키는 소문자 sha256 hex로만 만든다: ${String(sha256)}`);
  }
  return `${BUNDLE_V2_KEY_PREFIX}${sha256}.glb`;
}

/** 에셋 sha256 → 공개 URL 경로 (로더의 studioBg3dBundleAssetUrl과 같은 값). */
export function bundleV2PublicPath(sha256) {
  return `/${bundleV2ObjectKey(sha256)}`;
}

/** GLB JSON 청크에서 런타임 검증기가 거부하는 외부 리소스 uri 보유 여부를 판정한다. */
export function glbHasExternalResourceUri(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) return null;
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a) return null;
  let json;
  try {
    json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
  } catch {
    return null;
  }
  const resources = [...(Array.isArray(json.buffers) ? json.buffers : []),
    ...(Array.isArray(json.images) ? json.images : [])];
  return resources.some((resource) => resource !== null && typeof resource === "object"
    && Object.hasOwn(resource, "uri"));
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * 배포 인덱스 본문 (패널 가용성 판정과 소유자 확인이 읽는 작은 JSON).
 * files·bytes는 패널이 theme-packs의 placeableAssets·에셋 바이트 합과 대조하는 값이라
 * 에셋 단위(논리) 합계다. objects·objectBytes는 실제로 올라가는 고유 객체 합계다.
 */
export function buildBundleV2DeployIndex(themePacks, included) {
  return {
    schema: BUNDLE_V2_INDEX_SCHEMA,
    version: 1,
    files: included.assets,
    bytes: included.assetBytes,
    packs: included.packs,
    objects: included.objects,
    objectBytes: included.objectBytes,
    keyScheme: "sha256",
    sourceManifestGeneratedAt: themePacks.sourceManifest?.generatedAt ?? null,
  };
}

/**
 * theme-packs 팩 하나의 서빙 판정. 원장이 allow여도 theme-packs의 권리 블록이 원장 투영과 다르면
 * (없거나 grant가 바뀐 낡은 데이터) rights-drift로 닫는다.
 */
function decidePack(ledger, pack) {
  const decision = evaluateServeDecision(ledger, pack, { group: "pack" });
  if (decision.serve && !isDeepStrictEqual(pack?.rights, packRightsProjection(decision.entry))) {
    return { ...decision, serve: false, reason: "rights-drift" };
  }
  return decision;
}

/**
 * 에셋 경로 점검(문제 문장 또는 null). 로더(relativeServingPath · ingestPackIds 접두사)와 같은 규칙이다.
 * 심볼릭 링크는 따라가지 않는다 — 내용은 sha256·크기·GLB 헤더로 고정된다.
 */
function assetPathProblem(path, pack) {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024) return "경로가 비었거나 너무 깁니다";
  if (path.startsWith("/") || path.includes("\\") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(path)
    || path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    return "에셋 루트 상대 경로가 아닙니다";
  }
  const ingestPackIds = Array.isArray(pack?.ingestPackIds) ? pack.ingestPackIds : [];
  if (!ingestPackIds.some((id) => typeof id === "string" && id.length > 0 && path.startsWith(`${id}/`))) {
    return "소속 팩의 ingestPackIds 폴더 아래가 아닙니다";
  }
  return null;
}

/**
 * theme-packs + 실물 트리 + 권리 원장을 대조해 배포 계획을 만든다.
 * 반환: { plan, errors } — errors가 비어 있지 않으면 plan은 null이다.
 * 권리 원장에서 서빙이 허용되지 않은 팩의 에셋은 실물을 읽지 않고 plan.excludedByRights로만 기록한다.
 * ledger가 없거나 검증에 실패하면 어떤 객체도 만들지 않는다 (fail-closed).
 * readFile은 테스트 주입용이다.
 */
export function createBundleV2DeployPlan({ themePacks, assetRoot, ledger, readFile = readFileSync }) {
  const errors = [];
  if (themePacks?.schema !== "toonstudio.bg3d-bundle-theme-packs.v1"
    || !Array.isArray(themePacks.assets) || !Array.isArray(themePacks.packs)) {
    return { plan: null, errors: ["theme-packs.json 형식이 올바르지 않습니다."] };
  }
  if (!ledger) {
    return { plan: null, errors: ["권리 원장이 없어 배포 계획을 만들 수 없습니다 (fail-closed)."] };
  }
  const ledgerProblems = validatePackRightsLedger(ledger);
  if (ledgerProblems.length > 0) {
    return {
      plan: null,
      errors: [`권리 원장이 올바르지 않습니다 (${ledgerProblems.length}건): ${ledgerProblems.slice(0, 5).join(" / ")}`],
    };
  }
  if (themePacks.assetRoot !== "/assets/studio/bundle-v2/") {
    errors.push(`theme-packs assetRoot가 /assets/studio/bundle-v2/가 아닙니다: ${themePacks.assetRoot}`);
  }
  if (themePacks.inServiceOnly !== true || themePacks.downloadable !== false) {
    errors.push("theme-packs가 서비스 내 사용 전용(inServiceOnly/downloadable)으로 선언되지 않았습니다.");
  }
  const decisions = themePacks.packs.map((pack) => decidePack(ledger, pack));
  const excluded = new Map();
  const objectsBySha = new Map();
  let includedAssets = 0;
  let assetBytes = 0;
  for (const asset of themePacks.assets) {
    const decision = Number.isSafeInteger(asset.pack) ? decisions[asset.pack] : undefined;
    if (!decision) {
      errors.push(`에셋의 팩 참조가 올바르지 않습니다: ${asset.id}`);
      continue;
    }
    if (!decision.serve) {
      const pack = themePacks.packs[asset.pack];
      const record = excluded.get(asset.pack)
        ?? { title: pack.title, catalogIds: pack.catalogIds ?? [], reason: decision.reason, assets: 0, bytes: 0 };
      record.assets += 1;
      record.bytes += Number.isSafeInteger(asset.bytes) ? asset.bytes : 0;
      excluded.set(asset.pack, record);
      continue;
    }
    if (typeof asset.sha256 !== "string" || !SHA256_HEX.test(asset.sha256)) {
      errors.push(`에셋 sha256이 올바르지 않습니다: ${asset.id}`);
      continue;
    }
    const pathProblem = assetPathProblem(asset.path, themePacks.packs[asset.pack]);
    if (pathProblem) {
      errors.push(`에셋 경로가 올바르지 않습니다 (${asset.id}): ${pathProblem}`);
      continue;
    }
    const abs = join(assetRoot, asset.path);
    if (!existsSync(abs)) {
      errors.push(`실물 파일이 없습니다: ${asset.path}`);
      continue;
    }
    const buffer = readFile(abs);
    if (buffer.length !== asset.bytes) {
      errors.push(`크기 불일치: ${asset.id} theme-packs=${asset.bytes} disk=${buffer.length}`);
      continue;
    }
    if (sha256Hex(buffer) !== asset.sha256) {
      errors.push(`해시 불일치: ${asset.id}`);
      continue;
    }
    const external = glbHasExternalResourceUri(buffer);
    if (external === null) {
      errors.push(`GLB로 읽을 수 없습니다: ${asset.id}`);
      continue;
    }
    if (external) {
      errors.push(`외부 리소스 uri를 참조해 런타임 검증기가 거부하는 GLB입니다: ${asset.id}`);
      continue;
    }
    includedAssets += 1;
    assetBytes += buffer.length;
    const existing = objectsBySha.get(asset.sha256);
    if (existing) {
      // 같은 바이트는 한 객체로 합친다. 해시가 같으면 크기도 같아야 한다.
      existing.assetIds.push(asset.id);
      continue;
    }
    objectsBySha.set(asset.sha256, {
      key: bundleV2ObjectKey(asset.sha256),
      source: asset.path,
      publicPath: bundleV2PublicPath(asset.sha256),
      bytes: buffer.length,
      sha256: asset.sha256,
      contentType: GLB_CONTENT_TYPE,
      cacheControl: BUNDLE_V2_GLB_CACHE_CONTROL,
      assetIds: [asset.id],
    });
  }
  if (errors.length > 0) return { plan: null, errors };
  const glbObjects = [...objectsBySha.values()];
  const objectBytes = glbObjects.reduce((sum, object) => sum + object.bytes, 0);
  const servedPackCount = decisions.filter((decision) => decision.serve).length;
  const index = buildBundleV2DeployIndex(themePacks, {
    assets: includedAssets,
    assetBytes,
    packs: servedPackCount,
    objects: glbObjects.length,
    objectBytes,
  });
  const indexBody = `${JSON.stringify(index)}\n`;
  const objects = [
    ...glbObjects,
    {
      key: BUNDLE_V2_INDEX_KEY,
      source: null,
      inlineBody: indexBody,
      publicPath: `/${BUNDLE_V2_INDEX_KEY}`,
      bytes: Buffer.byteLength(indexBody),
      sha256: sha256Hex(Buffer.from(indexBody)),
      contentType: INDEX_CONTENT_TYPE,
      cacheControl: BUNDLE_V2_INDEX_CACHE_CONTROL,
    },
  ];
  const excludedByRights = [...excluded.values()];
  const plan = {
    schema: BUNDLE_V2_MANIFEST_SCHEMA,
    version: 1,
    bucket: BUNDLE_V2_BUCKET,
    assetRoot: themePacks.assetRoot,
    keyScheme: "sha256",
    sourceThemePacksTotals: themePacks.totals ?? null,
    totals: {
      objects: objects.length,
      glbObjects: glbObjects.length,
      glbAssets: includedAssets,
      totalBytes: objects.reduce((sum, object) => sum + object.bytes, 0),
      glbBytes: objectBytes,
      assetBytes,
      excludedAssets: excludedByRights.reduce((sum, record) => sum + record.assets, 0),
    },
    excludedByRights,
    objects,
  };
  return { plan, errors };
}

/**
 * 실행 모드별 계획 판정(부수효과 없음). dry-run은 항상 통과한다.
 * - 쓰기 모드(--write/--production)는 배포할 GLB가 없는 계획을 거부한다.
 * - --production은 theme-packs가 원장보다 오래된(제외 에셋이 생긴) 계획도 거부한다.
 *   stale인 채 올리면 배포 인덱스 합계가 theme-packs와 어긋나 패널이 열리지 않는다.
 */
export function assessPlanForMode(plan, mode) {
  const stale = plan.excludedByRights.length > 0;
  let refusal = null;
  if (mode !== "dry-run" && plan.totals.glbObjects === 0) {
    refusal = "배포할 GLB가 없습니다 (원장에서 서빙이 허용된 팩의 에셋이 없음). 증빙을 갖춘 팩을 allow로 바꾸고 생성기를 다시 실행하세요.";
  } else if (mode === "production" && stale) {
    refusal = "--production 거부: theme-packs.json이 권리 원장과 어긋나 있습니다. 생성기를 다시 실행한 뒤 재시도하세요.";
  }
  return { stale, refusal };
}

function parseArgs(argv) {
  const options = {
    themePacksPath: DEFAULT_THEME_PACKS,
    assetRoot: null,
    outPath: DEFAULT_OUT,
    packRightsPath: DEFAULT_PACK_RIGHTS_PATH,
    mode: "dry-run",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // `pnpm run <script> -- --asset-root …` 형태는 맨 `--`를 그대로 넘기므로 건너뛴다 (문서의 실행 예시 형태).
    if (arg === "--") continue;
    if (arg === "--dry-run") options.mode = "dry-run";
    else if (arg === "--write") options.mode = "write";
    else if (arg === "--production") options.mode = "production";
    else if (arg === "--theme-packs") options.themePacksPath = resolve(argv[++i]);
    else if (arg === "--asset-root") options.assetRoot = resolve(argv[++i]);
    else if (arg === "--out") options.outPath = resolve(argv[++i]);
    else if (arg === "--pack-rights") options.packRightsPath = resolve(argv[++i]);
    else {
      console.error(`알 수 없는 옵션입니다: ${arg}`);
      process.exit(2);
    }
  }
  return options;
}

function uploadObject(plan, object, assetRoot, tempDir) {
  let filePath;
  if (object.inlineBody !== undefined) {
    filePath = join(tempDir, "bundle-v2-manifest.json");
    writeFileSync(filePath, object.inlineBody);
  } else {
    filePath = join(assetRoot, object.source);
  }
  const result = spawnSync("pnpm", [
    "exec", "wrangler", "r2", "object", "put",
    `${plan.bucket}/${object.key}`,
    "--file", filePath,
    "--content-type", object.contentType,
    "--content-disposition", "inline",
    "--cache-control", object.cacheControl,
    "--remote", "--force",
  ], { cwd: REPO_ROOT, stdio: "inherit", env: process.env });
  return result.status === 0;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.assetRoot) {
    console.error("사용법: node scripts/plan-creator-bundle-deploy.mjs --asset-root <인제스션 v2 산출 트리> [--dry-run|--write|--production]");
    console.error("--asset-root에는 manifest-v2.json이 있는 output-v2 트리(예: ~/workspace/bundle-ingest/output-v2)를 지정합니다.");
    process.exit(2);
  }
  if (!existsSync(options.assetRoot) || !statSync(options.assetRoot).isDirectory()) {
    console.error(`에셋 루트가 디렉터리가 아닙니다: ${options.assetRoot}`);
    process.exit(2);
  }
  const themePacks = JSON.parse(readFileSync(options.themePacksPath, "utf8"));
  let ledger;
  try {
    ledger = loadPackRightsLedger(options.packRightsPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  const { plan, errors } = createBundleV2DeployPlan({ themePacks, assetRoot: options.assetRoot, ledger });
  if (!plan) {
    console.error(`배포 계획을 만들 수 없습니다 (${errors.length}건):`);
    for (const error of errors.slice(0, 20)) console.error(`  - ${error}`);
    if (errors.length > 20) console.error(`  … 외 ${errors.length - 20}건`);
    process.exit(1);
  }
  console.log(`R2 버킷: ${plan.bucket}`);
  console.log(`객체: ${plan.totals.objects}개 (GLB ${plan.totals.glbObjects}개 + 배포 인덱스 1개), 에셋 ${plan.totals.glbAssets}개`);
  console.log(`총량: ${plan.totals.totalBytes} bytes (GLB ${plan.totals.glbBytes} bytes)`);
  console.log(`키 규칙: ${BUNDLE_V2_KEY_PREFIX}<sha256>.glb (원본 폴더·파일명 미포함), 인덱스는 마지막 객체 ${BUNDLE_V2_INDEX_KEY}`);
  for (const object of plan.objects.filter((candidate) => candidate.source !== null).slice(0, 3)) {
    console.log(`  예: ${object.key}`);
  }
  const { stale, refusal } = assessPlanForMode(plan, options.mode);
  if (stale) {
    console.log(`권리 게이트: hold·미등록 팩의 에셋 ${plan.totals.excludedAssets}개를 계획에서 제외했습니다 (원장 ${options.packRightsPath}).`);
    for (const record of plan.excludedByRights) {
      console.log(`  제외: ${record.title} — 에셋 ${record.assets}개 (${record.reason})`);
    }
    console.log("경고: theme-packs.json이 원장보다 오래됐습니다. 생성기(generate-creator-bundle-theme-packs.mjs)를 다시 실행해야 배포 인덱스 합계가 theme-packs와 맞습니다.");
    console.log("참고: 이 도구는 R2 객체를 지우지 않습니다. 이미 올라간 팩의 권리를 철회했다면 해당 sha256 객체는 소유자가 직접 삭제해야 합니다.");
  }
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }
  if (options.mode === "dry-run") {
    console.log("dry-run: 매니페스트를 쓰지 않고 업로드도 하지 않았습니다. --write로 매니페스트를, --production으로 업로드를 실행합니다.");
    return;
  }
  writeFileSync(options.outPath, `${JSON.stringify(plan, null, 1)}\n`);
  console.log(`매니페스트 기록: ${options.outPath}`);
  if (options.mode === "write") return;
  // --production: GLB를 먼저 올리고 배포 인덱스를 마지막에 올린다.
  // 인덱스가 존재하면 패널이 배포 완료로 판정하므로 순서를 바꾸지 않는다.
  // 객체 put은 덮어쓰기라 중단 후 재실행해도 안전하다.
  const tempDir = mkdtempSync(join(tmpdir(), "bundle-v2-deploy-"));
  try {
    let done = 0;
    for (const object of plan.objects) {
      if (!uploadObject(plan, object, options.assetRoot, tempDir)) {
        console.error(`업로드 실패: ${object.key} (${done}/${plan.totals.objects} 완료). 원인을 고친 뒤 같은 명령을 재실행하면 이어서 올릴 수 있습니다.`);
        process.exit(1);
      }
      done += 1;
      if (done % 200 === 0 || done === plan.totals.objects) {
        console.log(`업로드 ${done}/${plan.totals.objects}`);
      }
    }
    console.log("업로드 완료. 배포 인덱스가 마지막으로 올라갔으므로 패널이 배포 완료로 판정합니다.");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) main();
