interface BrushTaskLocation {
  readonly pathname: string;
  readonly search?: string | URLSearchParams;
}

/** 작업 페이지 선택만 바뀌면 미저장 브러시 편집 인스턴스를 유지한다. 다른 문맥은 분리한다. */
export function studioBrushTaskLifecycleKey({ pathname, search }: BrushTaskLocation): string | null {
  const canonical = /^\/studio\/assets\/brushes\/(?:new|[^/]+\/edit)\/?$/u.test(pathname);
  const scoped = /^\/studio\/(?:work|remix)\/[^/]+\/brush-lab\/?$/u.test(pathname);
  if (!canonical && !scoped) return null;
  const params = new URLSearchParams(search);
  params.delete("brushTask");
  const identity = params.toString();
  return identity ? `${pathname}?${identity}` : pathname;
}
