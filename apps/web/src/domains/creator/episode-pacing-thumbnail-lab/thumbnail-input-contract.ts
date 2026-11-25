import type { OklchColor, ThumbnailBadgeKind, ThumbnailCandidateInput } from "./episode-pacing-thumbnail-engine";

export function requireFinitePacing(values: readonly number[]): void {
  if (values.some((value) => !Number.isFinite(value))) throw new RangeError("예제 수치는 유한한 수여야 합니다.");
}

export function assertOklchColor(color: OklchColor): void {
  requireFinitePacing([color.l, color.c, color.h]);
  if (color.l < 0 || color.l > 1 || color.c < 0 || color.c > 0.37 || Math.abs(color.h) > 36000) throw new RangeError("색상 입력이 예제 범위를 벗어났습니다.");
}

export function assertThumbnailInputs(candidate: ThumbnailCandidateInput, badges: readonly ThumbnailBadgeKind[]): void {
  requireFinitePacing([candidate.sourceWidthPx, candidate.sourceHeightPx, candidate.sourceTitleFontPx, candidate.focalX, candidate.focalY, candidate.zoom, candidate.eyeLineRatioInFace, ...Object.values(candidate.faceBox), ...Object.values(candidate.titleBox)]);
  if (candidate.sourceWidthPx <= 0 || candidate.sourceWidthPx > 65536 || candidate.sourceHeightPx <= 0 || candidate.sourceHeightPx > 65536 || candidate.sourceTitleFontPx < 0 || candidate.sourceTitleFontPx > 8192) throw new RangeError("이미지·타이틀 크기가 예제 범위를 벗어났습니다.");
  if (candidate.titleText.length > 4096) throw new RangeError("제목 상한은 4096자입니다.");
  if (badges.length > 3 || new Set(badges).size !== badges.length) throw new RangeError("배지는 3개 이하이며 중복 없이 고유해야 합니다.");
  for (const color of [candidate.backdropOklch, candidate.titleOklch, candidate.subjectOklch]) assertOklchColor(color);
}

/** 외부 결과를 Markdown 숫자로 내보내기 전에 유한성과 자원 상한을 확인한다. */
export function assertDiagnosticSnapshot(value: unknown): void {
  let count = 0;
  const active = new WeakSet<object>();
  function visit(item: unknown, depth: number): void {
    count += 1;
    if (count > 100000 || depth > 20) throw new RangeError("진단 결과 크기·깊이 상한을 넘었습니다.");
    if (typeof item === "number") requireFinitePacing([item]);
    if (typeof item === "string" && item.length > 131072) throw new RangeError("진단 문구 상한을 넘었습니다.");
    if (!item || typeof item !== "object") return;
    if (active.has(item)) throw new RangeError("순환 진단 결과는 내보낼 수 없습니다.");
    active.add(item);
    const values = Array.isArray(item) ? item : Object.values(item);
    if (values.length > 4096) throw new RangeError("진단 목록 상한을 넘었습니다.");
    for (const child of values) visit(child, depth + 1);
    active.delete(item);
  }
  visit(value, 0);
}
