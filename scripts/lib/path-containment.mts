import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface PathContainmentOptions {
  /**
   * true 이면 문자열 판정을 통과한 뒤, 두 경로가 모두 존재할 때 심볼릭 링크를 실제 경로(realpath)로 풀어 한 번 더 판정한다.
   * `dist/link` 가 `dist` 바깥 파일을 가리키는 링크이면 문자열로는 안쪽이지만 읽으면 바깥 파일이 나온다. 파일을 읽거나 내보내기
   * 전에 쓰는 호출부는 이 옵션을 켠다. 기본값은 false(문자열 판정만, 파일 시스템을 읽지 않는다).
   */
  readonly resolveSymlinks?: boolean;
}

function isLexicallyInside(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return (
    relation !== ""
    && relation !== ".."
    && !relation.startsWith(`..${sep}`)
    && !isAbsolute(relation)
  );
}

/** 존재하면 실제 경로, 없으면 null. 그 밖의 오류(권한·순환 링크 등)는 호출자가 닫힘으로 처리하도록 던진다. */
function realPathIfExists(path: string): string | null {
  try {
    return realpathSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
}

function isSymbolicLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * `candidate` 가 `root` 디렉터리 안쪽에 있는지 경로 구분자 경계까지 포함해 판정한다. root 자신은 안쪽으로 보지 않는다.
 *
 * `candidate.startsWith(root)` 같은 문자열 접두사 비교는 `/repo/dist` 와 `/repo/dist-evil` 을 구분하지
 * 못하고, 정규화되지 않은 `/repo/dist/../secret` 도 통과시킨다. 둘 다 resolve 로 정규화한 뒤
 * 상대 경로가 root 밖으로 나가는지로 판정한다.
 *
 * 기본 판정은 문자열 기반이라 심볼릭 링크는 따라가지 않는다. `resolveSymlinks` 를 켜면 존재하는 경로에 한해 realpath 로
 * 한 번 더 확인하고(링크가 root 바깥을 가리키면 바깥), 확인하지 못하는 오류는 바깥으로 본다. 한계: 존재하지 않는 경로는 문자열
 * 판정만 하므로 상위 디렉터리의 링크를 거쳐 나중에 만들어질 파일까지는 막지 못한다(읽기 전용 호출부를 전제로 한다).
 * 대상이 끊어진 심볼릭 링크이면 나중에 바깥 파일로 채워질 수 있으므로 바깥으로 본다.
 */
export function isPathInsideDirectory(
  root: string,
  candidate: string,
  options: PathContainmentOptions = {},
): boolean {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  if (!isLexicallyInside(resolvedRoot, resolvedCandidate)) return false;
  if (!options.resolveSymlinks) return true;

  try {
    const realCandidate = realPathIfExists(resolvedCandidate);
    if (realCandidate === null) return !isSymbolicLink(resolvedCandidate);
    const realRoot = realPathIfExists(resolvedRoot);
    return realRoot === null ? false : isLexicallyInside(realRoot, realCandidate);
  } catch {
    return false;
  }
}
