import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const STATIC_GEN_CACHE_SCHEMA_VERSION = 1;

/**
 * 파일 바이트의 SHA-256 16진수 다이제스트를 계산한다. 파일이 없으면 null을 반환한다.
 * @param {string} filePath
 * @returns {string | null}
 */
export function computeFileSha256(filePath) {
  if (!existsSync(filePath)) return null;
  const stat = statSync(filePath);
  if (!stat.isFile()) return null;
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/**
 * KST(UTC+9) 기준 YYYY-MM-DD 날짜 문자열을 로케일 구현과 무관하게 결정적으로 계산한다.
 * @param {Date} [now]
 * @returns {string}
 */
export function getKstDateString(now = new Date()) {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 10);
}

/**
 * 디렉터리 하위 파일을 상대 경로 사전순으로 수집한다.
 * @param {string} baseDir
 * @param {(relativePath: string) => boolean} [predicate]
 * @returns {string[]}
 */
export function listFilesSorted(baseDir, predicate = () => true) {
  if (!existsSync(baseDir)) return [];
  const results = [];
  const visit = (currentDir, prefix) => {
    const entries = readdirSync(currentDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(abs, rel);
      } else if (entry.isFile() && predicate(rel)) {
        results.push(rel);
      }
    }
  };
  visit(baseDir, "");
  return results;
}

/**
 * 입력 파일 목록과 추가 스칼라 값을 합쳐 결정적인 SHA-256 입력 해시를 만든다.
 * @param {{
 *   rootDir: string,
 *   files: Array<string | { path: string, label?: string, optional?: boolean }>,
 *   extraValues?: Record<string, unknown>,
 * }} params
 * @returns {{ digest: string, fileCount: number }}
 */
export function computeInputsDigest({ rootDir, files, extraValues = {} }) {
  const normalized = files
    .map((entry) => {
      if (typeof entry === "string") {
        const abs = path.isAbsolute(entry) ? entry : path.resolve(rootDir, entry);
        const label = path.relative(rootDir, abs).replaceAll("\\", "/");
        return { abs, label, optional: false };
      }
      const abs = path.isAbsolute(entry.path) ? entry.path : path.resolve(rootDir, entry.path);
      const label = (entry.label ?? path.relative(rootDir, abs)).replaceAll("\\", "/");
      return { abs, label, optional: Boolean(entry.optional) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "en"));

  const hash = createHash("sha256");
  hash.update(`schema:${STATIC_GEN_CACHE_SCHEMA_VERSION}\n`);

  for (const item of normalized) {
    const fileHash = computeFileSha256(item.abs);
    if (fileHash === null && !item.optional) {
      throw new Error(`캐시 입력 파일을 찾을 수 없습니다: ${item.label}`);
    }
    hash.update(`file:${item.label}:${fileHash ?? "MISSING"}\n`);
  }

  for (const key of Object.keys(extraValues).sort((a, b) => a.localeCompare(b, "en"))) {
    hash.update(`extra:${key}:${JSON.stringify(extraValues[key])}\n`);
  }

  return {
    digest: hash.digest("hex"),
    fileCount: normalized.length,
  };
}

/**
 * 캐시 스탬프 JSON을 읽는다. 없거나 손상됐거나 스키마가 다르면 null을 반환한다.
 * @param {string} stampPath
 * @returns {{
 *   version: number,
 *   generator: string,
 *   inputsHash: string,
 *   outputs: Record<string, string>,
 *   updatedAt: string,
 * } | null}
 */
export function readCacheStamp(stampPath) {
  if (!existsSync(stampPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(stampPath, "utf8"));
    if (
      !parsed
      || typeof parsed !== "object"
      || parsed.version !== STATIC_GEN_CACHE_SCHEMA_VERSION
      || typeof parsed.generator !== "string"
      || typeof parsed.inputsHash !== "string"
      || !/^[0-9a-f]{64}$/u.test(parsed.inputsHash)
      || !parsed.outputs
      || typeof parsed.outputs !== "object"
      || Array.isArray(parsed.outputs)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 지정한 산출물 파일들의 SHA-256 맵을 계산해 캐시 스탬프를 기록한다.
 * @param {string} stampPath
 * @param {{
 *   generator: string,
 *   inputsHash: string,
 *   rootDir: string,
 *   hashedFiles: string[],
 * }} params
 */
export function writeCacheStamp(stampPath, { generator, inputsHash, rootDir, hashedFiles }) {
  const outputs = {};
  for (const file of [...hashedFiles].sort((a, b) => a.localeCompare(b, "en"))) {
    const abs = path.isAbsolute(file) ? file : path.resolve(rootDir, file);
    const key = path.isAbsolute(file) ? path.relative(rootDir, abs).replaceAll("\\", "/") : file.replaceAll("\\", "/");
    const digest = computeFileSha256(abs);
    if (!digest) {
      throw new Error(`캐시 스탬프에 기록할 산출물이 없습니다: ${key}`);
    }
    outputs[key] = digest;
  }
  mkdirSync(path.dirname(stampPath), { recursive: true });
  const payload = {
    version: STATIC_GEN_CACHE_SCHEMA_VERSION,
    generator,
    inputsHash,
    outputs,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(stampPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

/**
 * 입력 해시 일치 여부와 필수·해시 검증 산출물 파일 무결성을 검증한다.
 * @param {{
 *   rootDir: string,
 *   generator: string,
 *   stamp: ReturnType<typeof readCacheStamp>,
 *   expectedInputsHash: string,
 *   requiredFiles?: string[],
 *   hashedFiles?: string[],
 * }} params
 * @returns {{ hit: boolean, reason: string }}
 */
export function verifyCachedOutputs({
  rootDir,
  generator,
  stamp,
  expectedInputsHash,
  requiredFiles = [],
  hashedFiles = [],
}) {
  if (!stamp) return { hit: false, reason: "stamp-missing" };
  if (stamp.generator !== generator) return { hit: false, reason: "generator-mismatch" };
  if (stamp.inputsHash !== expectedInputsHash) return { hit: false, reason: "inputs-changed" };

  for (const file of requiredFiles) {
    const abs = path.isAbsolute(file) ? file : path.resolve(rootDir, file);
    if (!existsSync(abs)) {
      return { hit: false, reason: `missing-output:${file}` };
    }
    const stat = statSync(abs);
    if (!stat.isFile() || stat.size === 0) {
      return { hit: false, reason: `empty-output:${file}` };
    }
  }

  for (const file of hashedFiles) {
    const abs = path.isAbsolute(file) ? file : path.resolve(rootDir, file);
    const key = path.isAbsolute(file) ? path.relative(rootDir, abs).replaceAll("\\", "/") : file.replaceAll("\\", "/");
    const recorded = stamp.outputs[key];
    if (typeof recorded !== "string" || !/^[0-9a-f]{64}$/u.test(recorded)) {
      return { hit: false, reason: `unrecorded-output:${key}` };
    }
    const actual = computeFileSha256(abs);
    if (actual !== recorded) {
      return { hit: false, reason: `output-hash-mismatch:${key}` };
    }
  }

  return { hit: true, reason: "cache-hit" };
}
