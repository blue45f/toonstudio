#!/usr/bin/env node
/**
 * plan-creator-bundle-deploy.mjs
 *
 * Creator Bundle bundle-v2 R2 배포 계획기·실행기.
 *
 * bg3d 테마 팩 패널이 읽는 theme-packs.json의 배치 가능 에셋은
 * `/assets/studio/bundle-v2/<path>` URL로 서빙돼야 하지만, GLB 실물은 레포에
 * 없고 인제스션 v2 산출 트리(~/workspace/bundle-ingest/output-v2 등)에만 있다.
 * 이 스크립트는 그 트리와 theme-packs.json을 전수 대조(실재·바이트·sha256·
 * GLB 헤더·외부 리소스 uri)해 R2 객체 목록(배포 매니페스트)을 산출하고,
 * 소유자가 자격증명을 가진 기기에서 --production으로 업로드한다.
 *
 * 경로 규칙 (로더 studio-bg3d-bundle-theme-packs.ts와 동일):
 *   - R2 키: `assets/studio/bundle-v2/` + theme-packs 에셋 path (디코드된 원문)
 *   - 공개 경로: `/` + 키를 조각마다 encodeURIComponent 한 값
 *   - 마지막 객체는 배포 인덱스(manifest.json)다. 패널이 이 파일의
 *     files/bytes 합계와 테마 팩 데이터를 대조해 배포 완료를 판정하므로,
 *     인덱스가 올라가 있으면 배포가 끝난 것으로 본다 (업로드 순서 고정).
 *
 * 게이트: 런타임 검증기(studio-bg3d-glb-validation.ts)가 external-resource-uri로
 * 거부하는 GLB(buffers/images의 uri 속성 보유)가 theme-packs에 배치 가능으로
 * 남아 있으면 계획을 만들지 않고 실패한다. 생성기
 * (generate-creator-bundle-theme-packs.mjs)를 먼저 고쳐 재생성할 것.
 *
 * 사용법 (레포 루트에서 실행):
 *   node scripts/plan-creator-bundle-deploy.mjs --asset-root <output-v2 트리> [--dry-run]
 *   node scripts/plan-creator-bundle-deploy.mjs --asset-root <트리> --write
 *   node scripts/plan-creator-bundle-deploy.mjs --asset-root <트리> --production
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

/** 에셋 상대 경로 → R2 키 (디코드된 원문 그대로). */
export function bundleV2ObjectKey(assetPath) {
  return BUNDLE_V2_KEY_PREFIX + assetPath;
}

/** 에셋 상대 경로 → 공개 URL 경로 (로더의 studioBg3dBundleAssetUrl과 같은 인코딩). */
export function bundleV2PublicPath(assetPath) {
  return `/${BUNDLE_V2_KEY_PREFIX}`
    + assetPath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
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

/** 배포 인덱스 본문 (패널 가용성 판정과 소유자 확인이 읽는 작은 JSON). */
export function buildBundleV2DeployIndex(themePacks, glbBytes) {
  return {
    schema: BUNDLE_V2_INDEX_SCHEMA,
    version: 1,
    files: themePacks.assets.length,
    bytes: glbBytes,
    packs: themePacks.packs.length,
    sourceManifestGeneratedAt: themePacks.sourceManifest?.generatedAt ?? null,
  };
}

/**
 * theme-packs + 실물 트리를 대조해 배포 계획을 만든다.
 * 반환: { plan, errors } — errors가 비어 있지 않으면 plan은 null이다.
 * readFile은 테스트 주입용이다.
 */
export function createBundleV2DeployPlan({ themePacks, assetRoot, readFile = readFileSync }) {
  const errors = [];
  if (themePacks?.schema !== "toonstudio.bg3d-bundle-theme-packs.v1"
    || !Array.isArray(themePacks.assets) || !Array.isArray(themePacks.packs)) {
    return { plan: null, errors: ["theme-packs.json 형식이 올바르지 않습니다."] };
  }
  if (themePacks.assetRoot !== "/assets/studio/bundle-v2/") {
    errors.push(`theme-packs assetRoot가 /assets/studio/bundle-v2/가 아닙니다: ${themePacks.assetRoot}`);
  }
  if (themePacks.inServiceOnly !== true || themePacks.downloadable !== false) {
    errors.push("theme-packs가 서비스 내 사용 전용(inServiceOnly/downloadable)으로 선언되지 않았습니다.");
  }
  const objects = [];
  let glbBytes = 0;
  for (const asset of themePacks.assets) {
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
    glbBytes += buffer.length;
    objects.push({
      key: bundleV2ObjectKey(asset.path),
      source: asset.path,
      publicPath: bundleV2PublicPath(asset.path),
      bytes: buffer.length,
      sha256: asset.sha256,
      contentType: GLB_CONTENT_TYPE,
      cacheControl: BUNDLE_V2_GLB_CACHE_CONTROL,
    });
  }
  if (errors.length > 0) return { plan: null, errors };
  const index = buildBundleV2DeployIndex(themePacks, glbBytes);
  const indexBody = `${JSON.stringify(index)}\n`;
  objects.push({
    key: BUNDLE_V2_INDEX_KEY,
    source: null,
    inlineBody: indexBody,
    publicPath: `/${BUNDLE_V2_INDEX_KEY}`,
    bytes: Buffer.byteLength(indexBody),
    sha256: sha256Hex(Buffer.from(indexBody)),
    contentType: INDEX_CONTENT_TYPE,
    cacheControl: BUNDLE_V2_INDEX_CACHE_CONTROL,
  });
  const plan = {
    schema: BUNDLE_V2_MANIFEST_SCHEMA,
    version: 1,
    bucket: BUNDLE_V2_BUCKET,
    assetRoot: themePacks.assetRoot,
    sourceThemePacksTotals: themePacks.totals ?? null,
    totals: {
      objects: objects.length,
      glbObjects: themePacks.assets.length,
      totalBytes: objects.reduce((sum, object) => sum + object.bytes, 0),
      glbBytes,
    },
    objects,
  };
  return { plan, errors };
}

function parseArgs(argv) {
  const options = {
    themePacksPath: DEFAULT_THEME_PACKS,
    assetRoot: null,
    outPath: DEFAULT_OUT,
    mode: "dry-run",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.mode = "dry-run";
    else if (arg === "--write") options.mode = "write";
    else if (arg === "--production") options.mode = "production";
    else if (arg === "--theme-packs") options.themePacksPath = resolve(argv[++i]);
    else if (arg === "--asset-root") options.assetRoot = resolve(argv[++i]);
    else if (arg === "--out") options.outPath = resolve(argv[++i]);
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
  const { plan, errors } = createBundleV2DeployPlan({ themePacks, assetRoot: options.assetRoot });
  if (!plan) {
    console.error(`배포 계획을 만들 수 없습니다 (${errors.length}건):`);
    for (const error of errors.slice(0, 20)) console.error(`  - ${error}`);
    if (errors.length > 20) console.error(`  … 외 ${errors.length - 20}건`);
    process.exit(1);
  }
  console.log(`R2 버킷: ${plan.bucket}`);
  console.log(`객체: ${plan.totals.objects}개 (GLB ${plan.totals.glbObjects}개 + 배포 인덱스 1개)`);
  console.log(`총량: ${plan.totals.totalBytes} bytes (GLB ${plan.totals.glbBytes} bytes)`);
  console.log(`키 규칙: ${BUNDLE_V2_KEY_PREFIX}<theme-packs 에셋 path>, 인덱스는 마지막 객체 ${BUNDLE_V2_INDEX_KEY}`);
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
