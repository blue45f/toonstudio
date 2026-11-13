import { trimTrailingSlashes } from "@/shared/lib/trim-trailing-slashes";

/**
 * 브랜드 연출은 사이트 홈에서만 재생한다.
 * 검색·읽기·학습·자료·편집 등 목적이 있는 직접 주소는 내용을 즉시 보여 준다.
 * 전용 표면이 소유한 진입·로딩 처리는 각 표면에 남긴다.
 */
export function shouldShowEntryIntro(pathname: string, _search = ""): boolean {
  const normalized = trimTrailingSlashes(pathname.toLowerCase()) || "/";
  return normalized === "/";
}
