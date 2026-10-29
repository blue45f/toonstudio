/** 컷 자식의 실제 렌더 클립이다. 작업 귀속이나 편집 권한을 추정하는 용도로 사용하지 않는다. */
export interface StudioFrameClip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 다각형이면 문서 좌표, 없으면 위 사각형이다. winding 규칙으로 닫는다. */
  readonly points?: readonly number[];
}

export interface StudioFrameGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 프레임 로컬 좌표다. 프레임 배경과 자식 모두 같은 경로를 쓴다. */
  readonly points?: readonly number[];
}

/** 명시 참조는 해당 ID만 읽는다. 없거나 중복이면 다른 컷으로 자동 재연결하지 않는다. */
export function explicitStudioFrameClipTarget<T extends StudioFrameGeometry & { readonly id: string; readonly hidden?: boolean }>(
  frameClipId: string | undefined, frames: readonly T[],
): T | null | undefined {
  if (frameClipId === undefined) return undefined;
  const matches = frames.filter((frame) => frame.id === frameClipId && !frame.hidden);
  return matches.length === 1 ? matches[0] ?? null : null;
}

export function isValidStudioFrameClip(clip: StudioFrameClip): boolean {
  return [clip.x, clip.y, clip.width, clip.height, clip.x + clip.width, clip.y + clip.height].every(Number.isFinite)
    && clip.width > 0 && clip.height > 0
    && (clip.points === undefined || (clip.points.length >= 6 && clip.points.length <= 8192
      && clip.points.length % 2 === 0 && clip.points.every(Number.isFinite)));
}

export function studioFrameClip(frame: StudioFrameGeometry): StudioFrameClip {
  const clip: StudioFrameClip = {
    x: frame.x, y: frame.y, width: frame.width, height: frame.height,
    ...(frame.points?.length ? { points: frame.points.map((value, index) => value + (index % 2 ? frame.y : frame.x)) } : {}),
  };
  if (!isValidStudioFrameClip(clip)) throw new Error("유효하지 않은 컷 클립입니다.");
  return clip;
}

export function studioFrameClipBounds(clip: StudioFrameClip): Omit<StudioFrameClip, "points"> {
  if (!isValidStudioFrameClip(clip)) throw new Error("유효하지 않은 컷 클립입니다.");
  if (!clip.points) return { x: clip.x, y: clip.y, width: clip.width, height: clip.height };
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let index = 0; index < clip.points.length; index += 2) {
    const x = clip.points[index], y = clip.points[index + 1];
    if (x === undefined || y === undefined) throw new Error("컷 좌표 쌍이 누락됐습니다.");
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  const bounds = { x: left, y: top, width: right - left, height: bottom - top };
  if (!Object.values(bounds).every(Number.isFinite)) throw new Error("컷 클립 경계가 유효하지 않습니다.");
  return bounds;
}

/** 같은 픽셀을 유지하며 합성 캐시의 할당 영역만 실제 클립 교집합으로 제한한다. */
export function studioFrameClipCacheBounds(bounds: Omit<StudioFrameClip, "points">,
  clip: StudioFrameClip): Omit<StudioFrameClip, "points"> {
  const panel = studioFrameClipBounds(clip);
  // 경계의 antialias 픽셀을 보존한다. 원본 이미지·획의 해상도와 좌표는 바꾸지 않는다.
  const x = Math.max(bounds.x, Math.floor(panel.x) - 1), y = Math.max(bounds.y, Math.floor(panel.y) - 1);
  const right = Math.min(bounds.x + bounds.width, Math.ceil(panel.x + panel.width) + 1);
  const bottom = Math.min(bounds.y + bounds.height, Math.ceil(panel.y + panel.height) + 1);
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

export interface StudioFrameClipPath {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  rect(x: number, y: number, width: number, height: number): void;
  closePath(): void;
}

/** 호출자가 beginPath·clip 및 좌표 변환의 수명을 소유한다. */
export function traceStudioFrameClip(path: StudioFrameClipPath, clip: StudioFrameClip): void {
  if (!isValidStudioFrameClip(clip)) throw new Error("유효하지 않은 컷 클립입니다.");
  if (!clip.points) { path.rect(clip.x, clip.y, clip.width, clip.height); return; }
  for (let index = 0; index < clip.points.length; index += 2) {
    const x = clip.points[index], y = clip.points[index + 1];
    if (x === undefined || y === undefined) throw new Error("컷 좌표 쌍이 누락됐습니다.");
    if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
  }
  path.closePath();
}
