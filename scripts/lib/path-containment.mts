import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * `candidate` 가 `root` 디렉터리 안쪽에 있는지 경로 구분자 경계까지 포함해 판정한다. root 자신은 안쪽으로 보지 않는다.
 *
 * `candidate.startsWith(root)` 같은 문자열 접두사 비교는 `/repo/dist` 와 `/repo/dist-evil` 을 구분하지
 * 못하고, 정규화되지 않은 `/repo/dist/../secret` 도 통과시킨다. 둘 다 resolve 로 정규화한 뒤
 * 상대 경로가 root 밖으로 나가는지로 판정한다.
 */
export function isPathInsideDirectory(root: string, candidate: string): boolean {
  const relation = relative(resolve(root), resolve(candidate));
  return (
    relation !== ""
    && relation !== ".."
    && !relation.startsWith(`..${sep}`)
    && !isAbsolute(relation)
  );
}
