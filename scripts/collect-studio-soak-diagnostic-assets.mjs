import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/u;
const MAX_ASSET_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_FILES_PER_FAMILY = 4;
const PREFIXES = ["studio-legacy-editor-adapter", "studio-konva-runtime", "react-runtime",
  "StudioShellFloatingLayoutHost", "StudioEdgeQuickSlidersAndHoldEyedropper"];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

/** 입력 검사가 끝난 뒤 실제 빌드의 작은 JS만 보존한다. 런타임 응답·성능 증거로 대체하지 않는다. */
export function collectStudioSoakDiagnosticAssets({ distDirectory, evidenceDirectory, expectedSourceCommit }) {
  requireValue(SHA.test(expectedSourceCommit ?? ""), "진단 번들에는 정확한 source SHA가 필요합니다.");
  const dist = realpathSync(distDirectory);
  const report = JSON.parse(readFileSync(join(evidenceDirectory, "report.json"), "utf8"));
  requireValue(report.cpuDiagnostic?.diagnosticOnly === true && report.cpuDiagnostic?.requested === true,
    "명시적인 CPU 진단 실행의 보고서만 번들을 보존할 수 있습니다.");
  requireValue(report.sourceCommit === expectedSourceCommit && report.sourceDirty === false
    && report.build?.verified === true && report.build.gitSha === expectedSourceCommit,
  "진단 보고서와 검증한 빌드의 source SHA가 다릅니다.");
  const metadataBytes = readFileSync(join(dist, ".vite/build-meta.json"));
  const indexBytes = readFileSync(join(dist, "index.html"));
  const metadata = JSON.parse(metadataBytes.toString("utf8"));
  requireValue(typeof report.sessionId === "string" && report.sessionId.trim().length > 0
    && typeof metadata.buildId === "string" && metadata.buildId.trim().length > 0
    && report.build.buildId === metadata.buildId, "진단 세션과 실제 빌드 식별자가 필요합니다.");
  requireValue(metadata.gitSha === expectedSourceCommit
    && digest(metadataBytes) === report.build.metadataSha256 && digest(indexBytes) === report.build.indexSha256,
  "입력 검사 이후 빌드 출처 파일이 바뀌었습니다.");
  const assetsDirectory = join(dist, "assets");
  requireValue(realpathSync(assetsDirectory) === assetsDirectory, "진단 assets 경로는 실제 빌드 안에 있어야 합니다.");
  const names = readdirSync(assetsDirectory).sort();
  const selected = PREFIXES.flatMap((prefix, index) => {
    const matches = names.filter((name) => name.startsWith(prefix + "-") && /^[A-Za-z0-9_-]+\.js$/u.test(name));
    requireValue(index >= 3 || matches.length > 0, `필수 진단 번들이 누락되었습니다: ${prefix}`);
    // 수동 runtime 청크와 같은 이름의 facade도 각 원본 URL과 함께 보존한다.
    requireValue(matches.length <= MAX_FILES_PER_FAMILY,
      `진단 번들 이름군의 파일 수가 ${MAX_FILES_PER_FAMILY}개를 넘었습니다: ${prefix}`);
    return matches;
  });
  let totalBytes = 0;
  const identities = new Set();
  // 먼저 모든 경계와 바이트를 검증해 일부 파일만 정상 증거처럼 남기지 않는다.
  const files = selected.map((name) => {
    const path = join(assetsDirectory, name), stat = lstatSync(path);
    requireValue(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= MAX_ASSET_BYTES,
      `진단 번들은 16MiB 이내의 일반 JS 파일이어야 합니다: ${name}`);
    // 이름만 바꾼 하드링크도 같은 실파일을 중복 보존한 증거가 되지 않게 한다.
    const identity = `${stat.dev}:${stat.ino}`;
    requireValue(!identities.has(identity), `동일한 진단 파일을 중복으로 보존할 수 없습니다: ${name}`);
    identities.add(identity);
    totalBytes += stat.size;
    requireValue(totalBytes <= MAX_TOTAL_BYTES, "진단 번들의 합계가 32MiB를 넘었습니다.");
    return { file: name, bytes: stat.size, sha256: digest(readFileSync(path)) };
  });
  const output = join(evidenceDirectory, "diagnostic-assets");
  // 기존 manifest·다른 빌드 파일·출력 symlink와 새 증거를 섞지 않는다.
  mkdirSync(output);
  for (const file of files) {
    const destination = join(output, file.file);
    copyFileSync(join(assetsDirectory, file.file), destination);
    requireValue(digest(readFileSync(destination)) === file.sha256, `진단 번들 복사 중 내용이 바뀌었습니다: ${file.file}`);
  }
  const manifest = { schemaVersion: 1, diagnosticOnly: true, sourceCommit: expectedSourceCommit,
    sessionId: report.sessionId, buildId: report.build.buildId, metadataSha256: digest(metadataBytes),
    indexSha256: digest(indexBytes), source: "verified-production-dist-files", totalBytes, files,
    limitation: "native Trace의 번들 위치를 읽기 위한 빌드 원본이다. HTTP 응답 캡처나 성능 수락 증거가 아니다." };
  writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

const canonicalPath = (value) => {
  try {
    return realpathSync(value);
  } catch {
    return resolve(value);
  }
};

if (process.argv[1] && canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url))) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  try {
    const evidenceDirectory = process.env.TOONSPECTRUM_SOAK_OUT;
    requireValue(typeof evidenceDirectory === "string" && evidenceDirectory.trim(), "진단 증거 디렉터리가 필요합니다.");
    const manifest = collectStudioSoakDiagnosticAssets({ distDirectory: join(root, "dist"),
      evidenceDirectory: resolve(root, evidenceDirectory), expectedSourceCommit: process.env.GITHUB_SHA });
    console.log(`진단 JS ${manifest.files.length}개 · ${manifest.totalBytes}바이트 · ${manifest.sourceCommit}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
