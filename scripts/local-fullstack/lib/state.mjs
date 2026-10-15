/**
 * 스택 디렉터리 준비와 상태 파일(state.json).
 *
 * 상태 파일에는 PID·포트·시각·스키마 지문만 둔다. 비밀값은 저장하지 않는다.
 */

import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { isProcessAlive } from "./processes.mjs";

const MARKER_TEXT = "ToonStudio 로컬 풀스택 하네스(scripts/local-fullstack)가 관리하는 디렉터리입니다.\n";

export function ensureStackDirectories(paths) {
  mkdirSync(paths.root, { recursive: true, mode: 0o700 });
  for (const directory of [paths.logs, paths.tools, paths.postgresRoot, paths.postgresTemporary, paths.browser]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  if (!existsSync(paths.marker)) writeFileSync(paths.marker, MARKER_TEXT, { mode: 0o600 });
}

export function hasStackMarker(paths) {
  return existsSync(paths.marker);
}

export function readState(paths) {
  try {
    const parsed = JSON.parse(readFileSync(paths.state, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** 최상위 키를 병합한다. 값이 null 이면 해당 키를 지운다. */
export function patchState(paths, patch) {
  const next = { version: 1, ...readState(paths) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  const temporary = `${paths.state}.tmp-${process.pid}-${randomBytes(3).toString("hex")}`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, paths.state);
  return next;
}

/**
 * 동시에 두 개의 up/reset 이 같은 스택을 건드리지 않게 하는 간단한 잠금(디렉터리 생성은 원자적).
 * 잠금을 쥔 프로세스가 죽었으면(PID 없음) 이어받는다.
 */
export async function withStackLock(paths, work, { timeoutMs = 15_000 } = {}) {
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(paths.lock, { mode: 0o700 });
      writeFileSync(`${paths.lock}/pid`, String(process.pid), { mode: 0o600 });
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let ownerPid = 0;
      try {
        ownerPid = Number(readFileSync(`${paths.lock}/pid`, "utf8"));
      } catch {
        // pid 파일을 아직 쓰기 전이면 잠시 기다린다.
      }
      if (ownerPid > 0 && !isProcessAlive(ownerPid)) {
        rmSync(paths.lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(
          `다른 하네스 명령이 같은 스택을 사용 중입니다(잠금: ${paths.lock}). 끝난 뒤 다시 실행하거나, 실행 중인 명령이 없다면 이 디렉터리를 지우세요.`,
          { cause: error },
        );
      }
      await delay(200);
    }
  }
  const release = () => rmSync(paths.lock, { recursive: true, force: true });
  const onSignal = (signal) => {
    release();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    return await work();
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    release();
  }
}

/** 로그 파일을 0600 으로 열어 append 한다(descriptor 반환). */
export function openLog(paths, name, banner) {
  const path = `${paths.logs}/${name}.log`;
  const descriptor = openSync(path, "a", 0o600);
  if (banner) {
    writeFileSync(descriptor, `\n--- ${new Date().toISOString()} ${banner} ---\n`);
  }
  return { descriptor, path, close: () => closeSync(descriptor) };
}
