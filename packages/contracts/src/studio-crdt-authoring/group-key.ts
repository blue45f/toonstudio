/** 페이지와 그룹의 원래 식별자를 구분하는 공통 키다. */
export function studioCrdtProjectionGroupKey(pageId: string, id: string): string {
  if (!pageId || !id || id === "page-root") throw new Error("레이어 그룹 식별자가 올바르지 않습니다.");
  return `${pageId.length}:${pageId}${id.length}:${id}`;
}
