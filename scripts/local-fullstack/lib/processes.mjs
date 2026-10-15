/**
 * 백그라운드 프로세스(API·웹·PostgreSQL) 기동·종료·헬스 대기.
 *
 * - spawn 은 항상 인자 배열을 사용한다(셸 문자열 결합 금지).
 * - 자식은 detached 로 띄워 CLI 가 끝나도 살아 있고, 종료는 프로세스 그룹 단위로 한다.
 * - PID 재사용으로 엉뚱한 프로세스를 죽이지 않도록 명령줄에 기대 문자열이 있는지 확인한다(Linux /proc).
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch (error) {
    return error?.code === "EPERM";
  }
  return !isZombieProcess(pid);
}

/**
 * 이미 종료됐지만 부모(init 포함)가 아직 거두지 않은 좀비는 "죽은" 것으로 본다(Linux /proc).
 * 컨테이너의 PID 1 이 느리게 거두는 환경에서 종료 확인이 헛돌지 않게 한다.
 */
function isZombieProcess(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state === "Z" || state === "X";
  } catch {
    return false;
  }
}

/** 프로세스 명령줄(없으면 null). Linux 는 /proc, 그 밖에는 ps. */
export function readProcessCommandLine(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ").trim();
  } catch {
    // /proc 이 없는 플랫폼은 ps 로 확인한다.
  }
  const result = spawnSync("ps", ["-o", "command=", "-p", String(pid)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

/** pid 가 살아 있고 명령줄에 needle 이 포함되면 true. */
export function processMatches(pid, needle) {
  if (!isProcessAlive(pid)) return false;
  const commandLine = readProcessCommandLine(pid);
  return commandLine === null ? true : commandLine.includes(needle);
}

export async function isPortFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

/**
 * 로그 파일로 stdout/stderr 를 보내는 detached 자식을 띄운다.
 * @returns {{ pid: number }}
 */
export function spawnDetached({ command, args, cwd, env, logDescriptor }) {
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", logDescriptor, logDescriptor],
  });
  child.on("error", () => {
    // 기동 실패는 호출자의 헬스 대기에서 로그와 함께 보고한다.
  });
  child.unref();
  if (!child.pid) throw new Error(`${command} 프로세스를 시작하지 못했습니다.`);
  return { pid: child.pid };
}

/**
 * SIGTERM → (유예 후) SIGKILL. group 이면 프로세스 그룹 전체에 먼저 보내고, 그룹이 없으면 단일 PID 로 보낸다.
 * @returns {Promise<"not-running" | "stopped" | "killed" | "mismatch" | "survived">}
 */
export async function terminateProcess(
  pid,
  { needle, group = true, signal = "SIGTERM", graceMs = 10_000, forceSignal = "SIGKILL" } = {},
) {
  if (!isProcessAlive(pid)) return "not-running";
  if (needle && !processMatches(pid, needle)) return "mismatch";
  const send = (name) => {
    for (const target of group ? [-pid, pid] : [pid]) {
      try {
        process.kill(target, name);
        return;
      } catch (error) {
        if (error?.code !== "ESRCH" && error?.code !== "EPERM") return;
      }
    }
  };
  send(signal);
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return "stopped";
    await delay(150);
  }
  send(forceSignal);
  const killDeadline = Date.now() + 5_000;
  while (Date.now() < killDeadline) {
    if (!isProcessAlive(pid)) return "killed";
    await delay(100);
  }
  return isProcessAlive(pid) ? "survived" : "killed";
}

export async function waitFor(check, { timeoutMs, intervalMs = 500, describe = "조건" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastDetail = "";
  for (;;) {
    const outcome = await check();
    if (outcome === true || (outcome && outcome.ok === true)) return { ok: true, detail: outcome?.detail ?? "" };
    // fatal 이면 더 기다려도 소용없으므로 즉시 실패로 돌려준다.
    if (outcome && outcome.fatal === true) return { ok: false, detail: String(outcome.detail ?? `${describe} 실패`) };
    lastDetail = outcome && typeof outcome === "object" ? String(outcome.detail ?? "") : lastDetail;
    if (Date.now() >= deadline) {
      return { ok: false, detail: `${describe} 대기 시간 초과(${Math.round(timeoutMs / 1000)}초)${lastDetail ? `: ${lastDetail}` : ""}` };
    }
    await delay(intervalMs);
  }
}

/** 단발 HTTP 요청(리디렉션 따르지 않음, 타임아웃 포함). 실패는 null. */
export async function httpProbe(url, { timeoutMs = 5_000, method = "GET", headers } = {}) {
  try {
    const response = await fetch(url, {
      method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // JSON 이 아니면 text 만 사용한다.
    }
    return { status: response.status, json, text };
  } catch {
    return null;
  }
}
