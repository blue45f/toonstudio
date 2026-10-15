/**
 * .env.infrastructure.local(로컬 전용 비밀 파일) 읽기·병합·쓰기.
 *
 * 원칙(루트 AGENTS.md §9):
 * - 파일은 umask 077 로 만들고 chmod 600 을 확인한다. git 에서 무시되는지 확인하지 못하면 쓰지 않는다.
 * - 이 하네스의 TOONSTUDIO_LOCAL_* 키만 추가·갱신하고, 다른 줄(주석·다른 서비스 키)은 바이트 그대로 보존한다.
 * - 값은 어떤 함수도 로그로 출력하지 않는다. 반환값에는 키 이름과 길이만 노출한다.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

const ASSIGNMENT_PATTERN = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/u;
const SAFE_VALUE_PATTERN = /^[A-Za-z0-9_@%+=:,./-]*$/u;

export const MANAGED_BLOCK_HEADER =
  "# --- ToonStudio 로컬 풀스택 하네스(scripts/local-fullstack): 로컬 전용 값, 커밋·공유 금지 ---";

/** 오른쪽 값 해석: 따옴표 제거, 따옴표 없는 값의 ` #` 주석 제거. */
export function parseEnvValue(rawRight) {
  const trimmed = rawRight.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    let result = "";
    for (let index = 1; index < trimmed.length; index += 1) {
      const character = trimmed[index];
      if (character === "\\" && quote === '"' && index + 1 < trimmed.length) {
        const escaped = trimmed[index + 1];
        result += escaped === "n" ? "\n" : escaped;
        index += 1;
        continue;
      }
      if (character === quote) return result;
      result += character;
    }
    return result;
  }
  const commentIndex = trimmed.search(/\s#/u);
  return (commentIndex >= 0 ? trimmed.slice(0, commentIndex) : trimmed).trim();
}

/** 요청한 키만 읽는다(마지막 대입이 우선, dotenv 의미와 같다). */
export function readEnvValues(text, keys) {
  const wanted = new Set(keys);
  const values = {};
  for (const line of text.split(/\r?\n/u)) {
    const match = ASSIGNMENT_PATTERN.exec(line);
    if (!match || !wanted.has(match[2])) continue;
    values[match[2]] = parseEnvValue(match[3]);
  }
  return values;
}

export function formatEnvAssignment(key, value) {
  const text = String(value);
  if (/[\r\n\0]/u.test(text)) {
    throw new Error(`${key}: 줄바꿈·NUL 이 포함된 값은 저장할 수 없습니다.`);
  }
  if (SAFE_VALUE_PATTERN.test(text)) return `${key}=${text}`;
  return `${key}="${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/**
 * updates 의 키만 갱신한다. 이미 있는 키는 마지막 대입 줄을 제자리 교체하고(앞의 `export ` 보존),
 * 없는 키는 관리 블록 아래에 추가한다. 그 밖의 줄은 그대로 둔다.
 * @returns {{ text: string, added: string[], replaced: string[] }}
 */
export function applyEnvUpdates(text, updates, { header = MANAGED_BLOCK_HEADER } = {}) {
  const lines = text === "" ? [] : text.split("\n");
  const added = [];
  const replaced = [];
  const lastIndex = new Map();
  lines.forEach((line, index) => {
    const match = ASSIGNMENT_PATTERN.exec(line.replace(/\r$/u, ""));
    if (match) lastIndex.set(match[2], index);
  });
  const appended = [];
  for (const [key, value] of Object.entries(updates)) {
    const assignment = formatEnvAssignment(key, value);
    const index = lastIndex.get(key);
    if (index === undefined) {
      appended.push(assignment);
      added.push(key);
      continue;
    }
    const match = ASSIGNMENT_PATTERN.exec(lines[index].replace(/\r$/u, ""));
    const prefix = match?.[1]?.includes("export") ? match[1] : "";
    const carriage = lines[index].endsWith("\r") ? "\r" : "";
    const next = `${prefix}${assignment}${carriage}`;
    if (lines[index] !== next) {
      lines[index] = next;
      replaced.push(key);
    }
  }
  if (appended.length > 0) {
    if (lines.length > 0 && lines.at(-1) === "") lines.pop();
    if (lines.length > 0) lines.push("");
    if (!lines.includes(header)) lines.push(header);
    lines.push(...appended, "");
  }
  return { text: lines.join("\n"), added, replaced };
}

export function readEnvFileText(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

/** 임시 파일(0600)에 쓰고 rename 으로 교체한다. 심볼릭 링크는 실제 대상 파일을 교체한다. */
export function writeEnvFileAtomic(filePath, text) {
  const target = existsSync(filePath) ? realpathSync(filePath) : filePath;
  const directory = dirname(target);
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `${basename(target)}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeSync(descriptor, text);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
    chmodSync(target, 0o600);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // 이미 옮겨졌거나 없으면 무시한다.
    }
    throw error;
  }
}

/** 권한 상태(값 없음). 600 이 아니면 호출자가 교정하거나 거부한다. */
export function inspectEnvFile(filePath) {
  if (!existsSync(filePath)) return { exists: false, mode: null, private: true };
  const mode = statSync(filePath).mode & 0o777;
  return { exists: true, mode: mode.toString(8).padStart(3, "0"), private: (mode & 0o077) === 0 };
}

/**
 * 비밀 파일이 git 에서 무시되는지 확인한다.
 * - 무시됨 → "ignored"
 * - git 저장소가 아님/git 없음 → 그 상태를 반환(외부 임시 경로 등)
 * - 저장소 안인데 무시되지 않음 → 예외(커밋 사고 방지)
 */
export function assertGitIgnored(filePath, { runCommand = spawnSync } = {}) {
  const result = runCommand("git", ["check-ignore", "-q", "--", basename(filePath)], {
    cwd: dirname(filePath),
    stdio: "ignore",
  });
  if (result.error) return { status: "git-unavailable" };
  if (result.status === 0) return { status: "ignored" };
  if (result.status === 1) {
    throw new Error(
      `${filePath} 가 git 에서 무시되지 않습니다. 비밀 파일을 만들기 전에 .gitignore 규칙을 확인하세요(중단).`,
    );
  }
  return { status: "not-a-repository" };
}
