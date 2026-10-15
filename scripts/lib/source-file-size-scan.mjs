/**
 * 소스 파일 크기 래칫 — 대상 파일 수집과 측정.
 *
 * 대상: git 이 추적하거나(스테이징 전 신규 파일 포함) 무시되지 않은 .ts/.tsx/.mts/.mjs/.cjs 중
 * 테스트(*.test.*, *.spec.*), 생성물(*.generated.*, generated/), 선언 파일(.d.ts), 벤더/픽스처를 뺀 소스.
 *
 * 줄 수 규칙(오탐 방지를 위해 한 가지로 고정): 개행(LF) 문자 수이며, 마지막 줄이 개행 없이 끝나면 1을 더한다.
 * CRLF 파일도 같은 값이 된다. 파일을 한 번 읽는 순수 계산이라 편집기 표시와 `wc -l` 에 가장 가깝다.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const SOURCE_FILE_SIZE_LIMIT = 800;

const TARGET_EXTENSION = /\.(?:ts|tsx|mts|mjs|cjs)$/u;
const EXCLUDED_FILE_NAMES = Object.freeze([
  /\.(?:test|spec)\.[cm]?[jt]sx?$/u,
  /\.generated\.[cm]?[jt]sx?$/u,
  /\.d\.[cm]?ts$/u,
]);
const EXCLUDED_DIRECTORIES = Object.freeze(new Set([
  "node_modules", "generated", "vendor", "vendored", "third_party", "third-party", "fixtures", "__fixtures__",
]));
const TS_NOCHECK_MARKER = Buffer.from("@ts-nocheck");
const LEADING_REGION_BYTES = 8192;
const LINE_DIRECTIVE = /^\/\/+\s*@ts-nocheck\b/u;
const BLOCK_DIRECTIVE = /(?:^|\n)[ \t]*(?:\/\*+|\*)?[ \t]*@ts-nocheck\b/u;

/** 저장소 상대 POSIX 경로가 측정 대상 소스인지. */
export function isTargetSourceFile(file) {
  if (!TARGET_EXTENSION.test(file)) return false;
  if (EXCLUDED_FILE_NAMES.some((pattern) => pattern.test(file))) return false;
  return !file.split("/").slice(0, -1).some((segment) => EXCLUDED_DIRECTORIES.has(segment));
}

/** 개행 기준 줄 수. 빈 파일은 0줄. */
export function countLines(buffer) {
  let lines = 0;
  for (let index = buffer.indexOf(10); index !== -1; index = buffer.indexOf(10, index + 1)) lines += 1;
  if (buffer.length > 0 && buffer[buffer.length - 1] !== 10) lines += 1;
  return lines;
}

/** 파일 선두의 주석 영역(첫 코드 토큰 이전)에 `@ts-nocheck` 지시문이 있는지. 본문 속 언급은 세지 않는다. */
export function hasTsNoCheckDirective(text) {
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  if (text.startsWith("#!", index)) {
    const newline = text.indexOf("\n", index);
    index = newline === -1 ? text.length : newline + 1;
  }
  while (index < text.length) {
    if (/\s/u.test(text[index])) {
      index += 1;
    } else if (text.startsWith("//", index)) {
      const end = text.indexOf("\n", index);
      const line = text.slice(index, end === -1 ? text.length : end);
      if (LINE_DIRECTIVE.test(line)) return true;
      index = end === -1 ? text.length : end + 1;
    } else if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      const block = text.slice(index, end === -1 ? text.length : end + 2);
      if (BLOCK_DIRECTIVE.test(block)) return true;
      index = end === -1 ? text.length : end + 2;
    } else {
      return false;
    }
  }
  return false;
}

/** git 이 아는 후보 경로. 스테이징 여부와 무관하게 현재 작업트리 기준이다. */
export function listCandidateFiles(root) {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ls-files 실패(저장소 루트가 맞는지 확인하세요): ${result.stderr.trim()}`);
  return [...new Set(result.stdout.split("\0").filter(Boolean))].filter(isTargetSourceFile).sort();
}

/** 파일을 읽어 { file, lines, tsNoCheck } 를 만든다. 삭제됐거나 sparse-checkout 으로 없는 파일은 건너뛴다. */
export function measureSourceFiles(root, files) {
  const measurements = [];
  for (const file of files) {
    let buffer;
    try {
      buffer = fs.readFileSync(path.join(root, file));
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR" || error.code === "ELOOP") continue;
      throw error;
    }
    const tsNoCheck = buffer.indexOf(TS_NOCHECK_MARKER) !== -1
      && hasTsNoCheckDirective(buffer.toString("utf8", 0, Math.min(buffer.length, LEADING_REGION_BYTES)));
    measurements.push({ file, lines: countLines(buffer), tsNoCheck });
  }
  return measurements;
}
