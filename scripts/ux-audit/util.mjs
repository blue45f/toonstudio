/** 감사 도구 공용 보조 함수. 시계·난수에 의존하는 것은 시간 초과 처리뿐이다. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 약속이 ms 안에 끝나지 않으면 한글 메시지로 거부한다. 타이머는 항상 정리한다. */
export async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 시간 초과(${ms}ms)`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** 오류에서 비밀값이 섞일 수 있는 긴 호출 로그를 떼고 첫 줄 요약만 남긴다. */
export function firstLine(error, limit = 240) {
  const text = error instanceof Error ? error.message : String(error);
  const line = text.split("\n").find((entry) => entry.trim()) ?? text;
  return line.trim().slice(0, limit);
}

/**
 * 가용 메모리가 부족하면(다른 작업이 큰 명령을 돌리는 중) 풀릴 때까지 기다린다. Linux 의 /proc/meminfo 만 읽으며 없으면 바로 돌아간다.
 * 측정 도중 메모리 부족으로 브라우저·스택이 강제 종료되는 것을 막으려는 보호 장치이고, 점수에는 영향이 없다.
 * @returns {Promise<number>} 기다린 밀리초
 */
export async function waitForMemory({ minimumMb = 1500, maxWaitMs = 600_000, intervalMs = 10_000, onWait = () => undefined } = {}) {
  const available = () => {
    try {
      const match = readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+) kB/mu);
      return match ? Math.floor(Number(match[1]) / 1024) : Number.POSITIVE_INFINITY;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };
  const startedAt = Date.now();
  let notified = false;
  while (available() < minimumMb && Date.now() - startedAt < maxWaitMs) {
    if (!notified) {
      notified = true;
      onWait(available());
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return Date.now() - startedAt;
}

/** 2자리 반올림(점수·시간 표기). */
export const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

/** UTC 시각을 폴더 이름용 문자열로. 예: 20261016T053012Z */
export function utcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

/**
 * 개발 서버가 public 에서 404 를 준 파일이 "git 은 추적하지만 sparse 체크아웃으로 내려받지 않은 파일"인지 판정한다.
 * 그런 404 는 측정 환경의 한계이지 화면 결함이 아니므로 점수에서 뺀다(개수는 보고서에 남긴다).
 * @param {string} repositoryRoot
 */
export function createSparseMissingChecker(repositoryRoot) {
  const cache = new Map();
  return (pathname) => {
    if (cache.has(pathname)) return cache.get(pathname);
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      decoded = pathname;
    }
    const relative = `apps/web/public${decoded}`;
    let missing = false;
    if (!decoded.includes("..") && decoded !== "/" && !existsSync(join(repositoryRoot, relative))) {
      const tracked = spawnSync("git", ["-C", repositoryRoot, "ls-files", "--", relative], { encoding: "utf8" });
      missing = tracked.status === 0 && tracked.stdout.trim() === relative;
    }
    cache.set(pathname, missing);
    return missing;
  };
}
