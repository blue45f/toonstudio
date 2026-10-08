import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * 근거 경로 검사용 도우미(테스트 전용).
 *
 * CI 의 부분 체크아웃(sparse-checkout) 실행은 `tests/benchmarks/results/`·`apps/web/public/vrm/`·`apps/web/public/assets/` 같은
 * 큰 폴더를 작업 트리에 내려받지 않는다. 그런 곳에서 `existsSync` 만으로 근거 경로를 검사하면 저장소에 있는 파일도 "없다"고 나온다.
 * 이 함수는 작업 트리에 있거나, 작업 트리에는 없어도 git 이 추적하는 경로면 "저장소에 있다"고 본다.
 * 오타·삭제된 파일·추적되지 않는 파일은 어느 환경에서든 계속 걸러낸다.
 */

let trackedCache: ReadonlySet<string> | null | undefined;

/** git 인덱스가 아는 모든 경로(작업 트리에 내려받지 않은 것 포함). git 을 쓸 수 없으면 null. */
function trackedPaths(): ReadonlySet<string> | null {
  if (trackedCache !== undefined) return trackedCache;
  try {
    const output = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
    trackedCache = new Set(output.split("\0").filter(Boolean));
  } catch {
    trackedCache = null;
  }
  return trackedCache;
}

/** 저장소 루트 기준 상대 경로(파일 또는 폴더)가 저장소에 있는지. `경로#심볼` 은 호출 쪽에서 `#` 앞만 넘긴다. */
export function repoPathExists(path: string): boolean {
  if (existsSync(path)) return true;
  const tracked = trackedPaths();
  if (!tracked) return false;
  const normalized = path.replace(/\/+$/u, "");
  if (tracked.has(normalized)) return true;
  const prefix = `${normalized}/`;
  for (const entry of tracked) if (entry.startsWith(prefix)) return true;
  return false;
}
