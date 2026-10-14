/**
 * 비교 검수(Compare Review) 순수 모델.
 *
 * FLAGSHIP 설계("비교 검수")의 상태 계산을 React 바깥 순수 함수로 소유한다.
 * process-compare-model.ts의 원칙(상태 계산은 모델에서, 뷰어는 표시만)을 그대로 따르며,
 * 세 가지를 확장한다:
 *  1) 비교 소스를 내부 리비전 전용에서 4종 유니온(버전/외부/회차 페이지/레퍼런스)으로 개방
 *  2) 배율·이동 동기화(공유 뷰포트 + 소스별 정렬 오프셋), 오버레이 모드, 양쪽 반전
 *  3) 비교 이미지 위 핀(compare-image 앵커) → StudioCommentsDocument 파생·승인 게이트 집계
 *
 * 좌표는 전부 이미지 정규화 좌표(0..1)다. 해상도·배율이 바뀌어도 핀·오프셋이 유지된다.
 */

import type { StudioCommentsDocument, StudioCommentThread } from "../studio-comments";
import {
  resolvePinStatusFromThread,
  stripManuscriptPinUrgentPrefix,
  type ManuscriptPinStatus,
} from "./manuscript-pin-feedback-model";
import type { ProcessCompareItem } from "./process-compare-model";

// ── 소스 ────────────────────────────────────────────────────────────────

/** 비교 페인이 바라볼 수 있는 소스. revision은 기존 ProcessCompareItem과 동일. */
export type CompareSourceRef =
  | { readonly kind: "revision"; readonly processId: string; readonly revisionId: string }
  | { readonly kind: "external"; readonly assetId: string }
  | { readonly kind: "page"; readonly projectId: string; readonly episodeId: string; readonly pageId: string }
  | { readonly kind: "reference"; readonly boardId: string; readonly itemId: string };

export type CompareSourceKind = CompareSourceRef["kind"];

/** 소스 풀(비교 바구니)의 한 항목. 풀은 회차 단위로 저장된다. */
export interface ComparePoolItem {
  readonly id: string;
  readonly source: CompareSourceRef;
  readonly label: string;
  /** 렌더된 이미지 URL. 없으면 플레이스홀더 아트를 사용한다(기존 관습). */
  readonly imageUrl: string | null;
  readonly addedBy: string;
  readonly addedAt: string;
  /** 외부 이미지의 출처·권리 메모. external 소스에서만 쓴다. */
  readonly rightsNote?: string;
}

/** 소스 참조의 안정 키. 오프셋·핀 연결·풀 중복 판정의 기준이 된다. */
export function compareSourceKey(source: CompareSourceRef): string {
  switch (source.kind) {
    case "revision": return `revision:${source.processId}:${source.revisionId}`;
    case "external": return `external:${source.assetId}`;
    case "page": return `page:${source.projectId}:${source.episodeId}:${source.pageId}`;
    case "reference": return `reference:${source.boardId}:${source.itemId}`;
  }
}

/** 풀 항목 id의 기준도 소스 키와 같게 둔다(한 소스는 풀에 한 번만). */
export function comparePoolItemId(source: CompareSourceRef): string {
  return compareSourceKey(source);
}

// ── 풀 항목 생성 ────────────────────────────────────────────────────────

/** 기존 공정 비교 항목(ProcessCompareItem)을 풀의 revision 소스로 편입한다. */
export function poolItemFromProcessCompareItem(
  item: ProcessCompareItem,
  addedBy: string,
  addedAt: string,
): ComparePoolItem {
  const source: CompareSourceRef = { kind: "revision", processId: item.processId, revisionId: item.revisionId };
  return {
    id: comparePoolItemId(source),
    source,
    label: `${item.processLabel} ${item.revisionLabel}`,
    imageUrl: item.imageUrl,
    addedBy,
    addedAt,
  };
}

/** 파일/URL로 가져온 외부 이미지. assetId는 호출 측이 발급한 에셋 식별자다. */
export function poolItemFromExternal(input: {
  readonly assetId: string;
  readonly label: string;
  readonly imageUrl: string | null;
  readonly addedBy: string;
  readonly addedAt: string;
  readonly rightsNote?: string;
}): ComparePoolItem {
  const source: CompareSourceRef = { kind: "external", assetId: input.assetId };
  return {
    id: comparePoolItemId(source),
    source,
    label: input.label,
    imageUrl: input.imageUrl,
    addedBy: input.addedBy,
    addedAt: input.addedAt,
    ...(input.rightsNote ? { rightsNote: input.rightsNote } : {}),
  };
}

/** 지난 회차(또는 다른 작품) 페이지. 연재 톤·캐릭터 일관성 검수의 주 소스다. */
export function poolItemFromPage(input: {
  readonly projectId: string;
  readonly episodeId: string;
  readonly pageId: string;
  readonly label: string;
  readonly imageUrl: string | null;
  readonly addedBy: string;
  readonly addedAt: string;
}): ComparePoolItem {
  const source: CompareSourceRef = {
    kind: "page",
    projectId: input.projectId,
    episodeId: input.episodeId,
    pageId: input.pageId,
  };
  return {
    id: comparePoolItemId(source),
    source,
    label: input.label,
    imageUrl: input.imageUrl,
    addedBy: input.addedBy,
    addedAt: input.addedAt,
  };
}

/** 회차 팀 레퍼런스 보드의 이미지 한 장. */
export function poolItemFromReference(input: {
  readonly boardId: string;
  readonly itemId: string;
  readonly label: string;
  readonly imageUrl: string | null;
  readonly addedBy: string;
  readonly addedAt: string;
}): ComparePoolItem {
  const source: CompareSourceRef = { kind: "reference", boardId: input.boardId, itemId: input.itemId };
  return {
    id: comparePoolItemId(source),
    source,
    label: input.label,
    imageUrl: input.imageUrl,
    addedBy: input.addedBy,
    addedAt: input.addedAt,
  };
}

// ── 비교 모드 · 세션 ────────────────────────────────────────────────────

/** 기존 3종(panes/slider/blink)에 오버레이를 더한 비교 방식. */
export type CompareReviewMode = "panes" | "slider" | "blink" | "overlay";

export const COMPARE_REVIEW_MODES: readonly CompareReviewMode[] = ["panes", "slider", "blink", "overlay"] as const;

/** 페인 최소·최대 개수. 비교는 최소 2장부터 의미가 있다. */
export const COMPARE_PANES_MIN = 2;
export const COMPARE_PANES_MAX = 4;

export interface CompareOffset {
  readonly dx: number;
  readonly dy: number;
}

export const COMPARE_OFFSET_ZERO: CompareOffset = { dx: 0, dy: 0 };

/** 정렬 오프셋의 허용 범위(정규화 좌표). 여백 차이 보정용이라 화면의 1/4까지만 허용한다. */
export const COMPARE_OFFSET_LIMIT = 0.25;

export function clampCompareOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(COMPARE_OFFSET_LIMIT, Math.max(-COMPARE_OFFSET_LIMIT, value));
}

/** 회차 단위로 저장되는 비교 구성 전체. */
export interface CompareSession {
  readonly version: 1;
  readonly episodeId: string;
  readonly pool: readonly ComparePoolItem[];
  /** 순서가 곧 페인 순서. 최대 4개. */
  readonly panes: readonly CompareSourceRef[];
  readonly mode: CompareReviewMode;
  /** 배율·이동 잠금. 켜지면 전 페인이 공유 뷰포트를 따른다. */
  readonly syncView: boolean;
  /** 소스 키 → 정렬 오프셋(정규화 좌표). 기준점 차이를 한 번 맞추는 용도. */
  readonly offsets: Readonly<Record<string, CompareOffset>>;
  /** 양쪽 동시 좌우 반전(구도·밸런스 검수). */
  readonly flipBoth: boolean;
  /** 양쪽 동시 상하 반전(고급). */
  readonly flipVertical: boolean;
  /** 픽셀 차이 영역 표시. */
  readonly diffOn: boolean;
  /** 오버레이 모드에서 위 레이어(두 번째 페인)의 불투명도 0..1. */
  readonly overlayOpacity: number;
}

export function createEmptyCompareSession(episodeId: string): CompareSession {
  return {
    version: 1,
    episodeId,
    pool: [],
    panes: [],
    mode: "panes",
    syncView: true,
    offsets: {},
    flipBoth: false,
    flipVertical: false,
    diffOn: false,
    overlayOpacity: 0.5,
  };
}

// ── 세션 리듀서 (전부 순수 함수) ────────────────────────────────────────

/** 풀에 항목을 더한다. 같은 소스가 이미 있으면 기존 항목을 유지한다(중복 방지). */
export function addComparePoolItem(session: CompareSession, item: ComparePoolItem): CompareSession {
  const key = compareSourceKey(item.source);
  if (session.pool.some((candidate) => compareSourceKey(candidate.source) === key)) return session;
  return { ...session, pool: [...session.pool, item] };
}

export function addComparePoolItems(session: CompareSession, items: readonly ComparePoolItem[]): CompareSession {
  return items.reduce((current, item) => addComparePoolItem(current, item), session);
}

/**
 * 풀에서 항목을 뺀다. 페인에 배치돼 있으면 페인에서도 빠지고,
 * 그 소스의 정렬 오프셋도 함께 정리한다. 핀(댓글 문서)은 건드리지 않는다 —
 * 핀이 남은 풀 밖 이미지는 핀 목록에서 "풀에서 빠진 소스"로 표시된다.
 */
export function removeComparePoolItem(session: CompareSession, itemId: string): CompareSession {
  const target = session.pool.find((item) => item.id === itemId);
  if (!target) return session;
  const key = compareSourceKey(target.source);
  const offsets = { ...session.offsets };
  delete offsets[key];
  return {
    ...session,
    pool: session.pool.filter((item) => item.id !== itemId),
    panes: session.panes.filter((pane) => compareSourceKey(pane) !== key),
    offsets,
  };
}

/** 페인에 소스가 배치돼 있는지. */
export function isComparePaneAssigned(session: CompareSession, source: CompareSourceRef): boolean {
  const key = compareSourceKey(source);
  return session.panes.some((pane) => compareSourceKey(pane) === key);
}

/**
 * 풀 항목을 페인에 배치/해제한다.
 * - 이미 배치돼 있으면 해제한다.
 * - 배치 시 최대 4개를 지키고, 가득 차 있으면 가장 오래된(첫) 페인을 밀어낸다.
 */
export function toggleComparePaneSource(session: CompareSession, source: CompareSourceRef): CompareSession {
  const key = compareSourceKey(source);
  if (session.panes.some((pane) => compareSourceKey(pane) === key)) {
    return { ...session, panes: session.panes.filter((pane) => compareSourceKey(pane) !== key) };
  }
  const next = [...session.panes, source];
  while (next.length > COMPARE_PANES_MAX) next.shift();
  return { ...session, panes: next };
}

/** 특정 페인 슬롯의 소스를 교체한다(페인 헤더의 선택기용). index가 범위를 벗어나면 무시한다. */
export function setComparePaneSource(session: CompareSession, index: number, source: CompareSourceRef): CompareSession {
  if (index < 0 || index >= session.panes.length) return session;
  const key = compareSourceKey(source);
  // 같은 소스가 다른 페인에 이미 있으면 두 페인을 맞바꾼다(중복 배치 방지).
  const otherIndex = session.panes.findIndex((pane, i) => i !== index && compareSourceKey(pane) === key);
  const panes = [...session.panes];
  if (otherIndex >= 0) {
    panes[otherIndex] = panes[index];
  }
  panes[index] = source;
  return { ...session, panes };
}

/** 페인 수를 n개로 맞춘다. 줄이면 뒤에서 자르고, 늘리면 풀의 미배치 항목으로 채운다. */
export function resizeComparePanes(session: CompareSession, count: number): CompareSession {
  const target = Math.min(COMPARE_PANES_MAX, Math.max(0, Math.floor(count)));
  if (target === session.panes.length) return session;
  if (target < session.panes.length) return { ...session, panes: session.panes.slice(0, target) };
  const assigned = new Set(session.panes.map(compareSourceKey));
  const panes = [...session.panes];
  for (const item of session.pool) {
    if (panes.length >= target) break;
    const key = compareSourceKey(item.source);
    if (assigned.has(key)) continue;
    assigned.add(key);
    panes.push(item.source);
  }
  return { ...session, panes };
}

/**
 * 기본 페인 구성: 풀에서 공정(리비전 소스)별로 가장 최근 항목을 앞에서부터 2개.
 * revision이 아닌 소스만 있으면 풀 순서대로 2개를 고른다.
 */
export function defaultComparePanes(pool: readonly ComparePoolItem[]): CompareSourceRef[] {
  const latestByProcess = new Map<string, ComparePoolItem>();
  for (const item of pool) {
    if (item.source.kind === "revision") latestByProcess.set(item.source.processId, item);
  }
  const picked: ComparePoolItem[] = [...latestByProcess.values()];
  for (const item of pool) {
    if (picked.length >= COMPARE_PANES_MIN) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked.slice(0, COMPARE_PANES_MIN).map((item) => item.source);
}

export function setCompareMode(session: CompareSession, mode: CompareReviewMode): CompareSession {
  return session.mode === mode ? session : { ...session, mode };
}

export function setCompareSyncView(session: CompareSession, syncView: boolean): CompareSession {
  return session.syncView === syncView ? session : { ...session, syncView };
}

export function setCompareFlipBoth(session: CompareSession, flipBoth: boolean): CompareSession {
  return session.flipBoth === flipBoth ? session : { ...session, flipBoth };
}

export function setCompareFlipVertical(session: CompareSession, flipVertical: boolean): CompareSession {
  return session.flipVertical === flipVertical ? session : { ...session, flipVertical };
}

export function setCompareDiffOn(session: CompareSession, diffOn: boolean): CompareSession {
  return session.diffOn === diffOn ? session : { ...session, diffOn };
}

export function clampCompareOpacity(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export function setCompareOverlayOpacity(session: CompareSession, opacity: number): CompareSession {
  return { ...session, overlayOpacity: clampCompareOpacity(opacity) };
}

/** 한 소스의 정렬 오프셋을 절대값으로 지정한다. 0이면 항목 자체를 지운다(저장 크기 절약). */
export function setCompareOffset(session: CompareSession, source: CompareSourceRef, offset: CompareOffset): CompareSession {
  const key = compareSourceKey(source);
  const next: Record<string, CompareOffset> = { ...session.offsets };
  const clamped = { dx: clampCompareOffset(offset.dx), dy: clampCompareOffset(offset.dy) };
  if (clamped.dx === 0 && clamped.dy === 0) delete next[key];
  else next[key] = clamped;
  return { ...session, offsets: next };
}

/** 정렬 오프셋 미세 조정(고급 패널의 방향 버튼·슬라이더 공용). */
export function nudgeCompareOffset(
  session: CompareSession,
  source: CompareSourceRef,
  delta: CompareOffset,
): CompareSession {
  const key = compareSourceKey(source);
  const current = session.offsets[key] ?? COMPARE_OFFSET_ZERO;
  return setCompareOffset(session, source, { dx: current.dx + delta.dx, dy: current.dy + delta.dy });
}

/** 페인에 배치된 소스들의 오프셋이 전부 0인지 — 차이 표시가 의미를 갖는 조건이다. */
export function comparePanesAligned(session: CompareSession): boolean {
  return session.panes.every((pane) => {
    const offset = session.offsets[compareSourceKey(pane)];
    return !offset || (offset.dx === 0 && offset.dy === 0);
  });
}

// ── 세션 직렬화 (회차 단위 로컬 저장 → 서버 계약 이관 전 1단계) ──────────

export function serializeCompareSession(session: CompareSession): string {
  return JSON.stringify(session);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCompareSourceRef(value: unknown): CompareSourceRef | null {
  if (!isRecord(value)) return null;
  const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
  switch (value.kind) {
    case "revision":
      return str(value.processId) && str(value.revisionId)
        ? { kind: "revision", processId: value.processId, revisionId: value.revisionId }
        : null;
    case "external":
      return str(value.assetId) ? { kind: "external", assetId: value.assetId } : null;
    case "page":
      return str(value.projectId) && str(value.episodeId) && str(value.pageId)
        ? { kind: "page", projectId: value.projectId, episodeId: value.episodeId, pageId: value.pageId }
        : null;
    case "reference":
      return str(value.boardId) && str(value.itemId)
        ? { kind: "reference", boardId: value.boardId, itemId: value.itemId }
        : null;
    default:
      return null;
  }
}

function parseComparePoolItem(value: unknown): ComparePoolItem | null {
  if (!isRecord(value)) return null;
  const source = parseCompareSourceRef(value.source);
  if (!source) return null;
  if (typeof value.label !== "string" || typeof value.addedBy !== "string" || typeof value.addedAt !== "string") return null;
  return {
    id: comparePoolItemId(source),
    source,
    label: value.label,
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : null,
    addedBy: value.addedBy,
    addedAt: value.addedAt,
    ...(typeof value.rightsNote === "string" ? { rightsNote: value.rightsNote } : {}),
  };
}

/**
 * 저장된 세션을 방어적으로 복원한다. 형식이 깨졌거나 회차가 다르면 빈 세션을 돌려준다 —
 * 비교 구성이 깨졌다고 검수실 전체가 죽으면 안 된다.
 */
export function parseCompareSession(raw: string | null, episodeId: string): CompareSession {
  const empty = createEmptyCompareSession(episodeId);
  if (!raw) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!isRecord(parsed) || parsed.version !== 1 || parsed.episodeId !== episodeId) return empty;
  const pool = Array.isArray(parsed.pool)
    ? parsed.pool.map(parseComparePoolItem).filter((item): item is ComparePoolItem => item !== null)
    : [];
  const poolKeys = new Set(pool.map((item) => compareSourceKey(item.source)));
  const panes = Array.isArray(parsed.panes)
    ? parsed.panes
        .map(parseCompareSourceRef)
        .filter((source): source is CompareSourceRef => source !== null && poolKeys.has(compareSourceKey(source)))
        .slice(0, COMPARE_PANES_MAX)
    : [];
  const offsets: Record<string, CompareOffset> = {};
  if (isRecord(parsed.offsets)) {
    for (const [key, value] of Object.entries(parsed.offsets)) {
      if (!poolKeys.has(key) || !isRecord(value)) continue;
      const dx = clampCompareOffset(typeof value.dx === "number" ? value.dx : 0);
      const dy = clampCompareOffset(typeof value.dy === "number" ? value.dy : 0);
      if (dx !== 0 || dy !== 0) offsets[key] = { dx, dy };
    }
  }
  const mode = COMPARE_REVIEW_MODES.includes(parsed.mode as CompareReviewMode)
    ? (parsed.mode as CompareReviewMode)
    : "panes";
  return {
    version: 1,
    episodeId,
    pool,
    panes,
    mode,
    syncView: parsed.syncView !== false,
    offsets,
    flipBoth: parsed.flipBoth === true,
    flipVertical: parsed.flipVertical === true,
    diffOn: parsed.diffOn === true,
    overlayOpacity: clampCompareOpacity(typeof parsed.overlayOpacity === "number" ? parsed.overlayOpacity : 0.5),
  };
}

// ── 공유 뷰포트 (확대·이동 동기화) ──────────────────────────────────────

export const COMPARE_SCALE_MIN = 0.25;
export const COMPARE_SCALE_MAX = 8;

export function clampCompareScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(COMPARE_SCALE_MAX, Math.max(COMPARE_SCALE_MIN, value));
}

/** 이동(pan)의 허용 범위(정규화 좌표). 이미지가 화면에서 완전히 사라지지 않게 ±1로 묶는다. */
export const COMPARE_PAN_LIMIT = 1;

export function clampComparePan(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(COMPARE_PAN_LIMIT, Math.max(-COMPARE_PAN_LIMIT, value));
}

/** 동기화의 기준이 되는 공유 뷰포트. 기준 페인에서 조작이 발생하면 이것만 바뀐다. */
export interface SharedCompareViewport {
  readonly scale: number;
  /** 기준 페인의 이동. 페인 표시 영역 기준 정규화 좌표. */
  readonly tx: number;
  readonly ty: number;
}

export const COMPARE_VIEWPORT_IDENTITY: SharedCompareViewport = { scale: 1, tx: 0, ty: 0 };

/** 한 페인의 실제 변환: 공유(또는 개별) 뷰포트에 그 소스의 정렬 오프셋을 합성한 결과. */
export interface ComparePaneTransform {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
  /** 좌우 반전이 켜졌으면 -1. CSS transform의 scaleX와 짝을 이룬다. */
  readonly flipX: 1 | -1;
  /** 상하 반전이 켜졌으면 -1. */
  readonly flipY: 1 | -1;
}

export function resolvePaneTransform(
  session: Pick<CompareSession, "syncView" | "offsets" | "flipBoth" | "flipVertical">,
  viewport: SharedCompareViewport,
  paneSource: CompareSourceRef,
  paneLocal?: SharedCompareViewport,
): ComparePaneTransform {
  const flipX: 1 | -1 = session.flipBoth ? -1 : 1;
  const flipY: 1 | -1 = session.flipVertical ? -1 : 1;
  if (!session.syncView) {
    const local = paneLocal ?? COMPARE_VIEWPORT_IDENTITY;
    return { scale: clampCompareScale(local.scale), tx: clampComparePan(local.tx), ty: clampComparePan(local.ty), flipX, flipY };
  }
  const offset = session.offsets[compareSourceKey(paneSource)] ?? COMPARE_OFFSET_ZERO;
  return {
    scale: clampCompareScale(viewport.scale),
    tx: clampComparePan(viewport.tx + offset.dx),
    ty: clampComparePan(viewport.ty + offset.dy),
    flipX,
    flipY,
  };
}

/** CSS transform 문자열. translate는 래퍼 크기 기준 %로 적용된다. */
export function comparePaneTransformCss(transform: ComparePaneTransform): string {
  const tx = Math.round(transform.tx * 10_000) / 100;
  const ty = Math.round(transform.ty * 10_000) / 100;
  return `translate(${tx}%, ${ty}%) scale(${transform.scale}) scaleX(${transform.flipX}) scaleY(${transform.flipY})`;
}

/**
 * 기준 페인에서 일어난 확대(중심점 고정)를 뷰포트로 환산한다.
 * center는 기준 페인 표시 영역의 정규화 좌표(0..1). 전 페인이 같은 지점을 중심으로 확대된다.
 */
export function zoomCompareViewport(
  viewport: SharedCompareViewport,
  nextScaleRaw: number,
  center: { readonly x: number; readonly y: number },
): SharedCompareViewport {
  const nextScale = clampCompareScale(nextScaleRaw);
  const ratio = nextScale / viewport.scale;
  return {
    scale: nextScale,
    tx: clampComparePan(center.x - (center.x - viewport.tx) * ratio),
    ty: clampComparePan(center.y - (center.y - viewport.ty) * ratio),
  };
}

/** 드래그 이동을 뷰포트에 반영한다. delta는 페인 크기 기준 정규화 이동량. */
export function panCompareViewport(
  viewport: SharedCompareViewport,
  delta: { readonly dx: number; readonly dy: number },
): SharedCompareViewport {
  return {
    scale: viewport.scale,
    tx: clampComparePan(viewport.tx + delta.dx),
    ty: clampComparePan(viewport.ty + delta.dy),
  };
}

// ── 이미지 표시 영역 (object-fit: contain 레터박스 보정) ────────────────

/** contain으로 표시되는 이미지의 실제 콘텐츠 영역(컨테이너 기준 %). */
export interface CompareContainRect {
  readonly leftPct: number;
  readonly topPct: number;
  readonly widthPct: number;
  readonly heightPct: number;
}

/**
 * 컨테이너 안에 contain으로 그려지는 이미지 콘텐츠의 영역을 구한다.
 * 핀·스포이드는 이 영역 기준으로 좌표를 계산해야 레터박스 여백에서 어긋나지 않는다.
 */
export function computeCompareContainRect(
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): CompareContainRect {
  if (containerWidth <= 0 || containerHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
    return { leftPct: 0, topPct: 0, widthPct: 100, heightPct: 100 };
  }
  const scale = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight);
  const widthPct = ((naturalWidth * scale) / containerWidth) * 100;
  const heightPct = ((naturalHeight * scale) / containerHeight) * 100;
  return {
    leftPct: (100 - widthPct) / 2,
    topPct: (100 - heightPct) / 2,
    widthPct,
    heightPct,
  };
}

/**
 * 콘텐츠 영역 안의 클릭 위치(영역 기준 0..1)를 이미지 정규화 좌표로 바꾼다.
 * 반전이 켜져 있으면 화면에 보이는 위치가 좌우/상하로 뒤집혀 있으므로 되돌린다.
 */
export function comparePointFromPaneLocal(
  local: { readonly x: number; readonly y: number },
  flipX: boolean,
  flipY: boolean,
): { readonly x: number; readonly y: number } {
  const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  return {
    x: clamp01(flipX ? 1 - local.x : local.x),
    y: clamp01(flipY ? 1 - local.y : local.y),
  };
}

// ── 스포이드 색상 ───────────────────────────────────────────────────────

export interface ComparePickedColor {
  readonly hex: string;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

export function compareColorFromRgb(r: number, g: number, b: number): ComparePickedColor {
  const clamp255 = (v: number) => Math.min(255, Math.max(0, Math.round(Number.isFinite(v) ? v : 0)));
  const rr = clamp255(r);
  const gg = clamp255(g);
  const bb = clamp255(b);
  const hex = `#${[rr, gg, bb].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  const rn = rr / 255;
  const gn = gg / 255;
  const bn = bb / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  return {
    hex,
    r: rr,
    g: gg,
    b: bb,
    h: Math.round(h),
    s: max === 0 ? 0 : Math.round((delta / max) * 100),
    v: Math.round(max * 100),
  };
}

// ── 핀 앵커 (studio-comments 앵커 유니온의 compare-image) ───────────────

/**
 * 비교 이미지 위의 핀 앵커. 원고 핀과 같은 스레드 체계를 쓰며,
 * pairedPoolItemId로 "무엇과 비교하던 중의 핀인지" 맥락을 함께 남긴다.
 */
export interface CompareImageAnchor {
  readonly type: "compare-image";
  readonly poolItemId: string;
  readonly x: number;
  readonly y: number;
  readonly pairedPoolItemId?: string;
}

export function createCompareImageAnchor(
  poolItemId: string,
  point: { readonly x: number; readonly y: number },
  pairedPoolItemId?: string,
): CompareImageAnchor {
  const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  return {
    type: "compare-image",
    poolItemId,
    x: clamp01(point.x),
    y: clamp01(point.y),
    ...(pairedPoolItemId && pairedPoolItemId !== poolItemId ? { pairedPoolItemId } : {}),
  };
}

function isCompareImageAnchor(anchor: StudioCommentThread["anchor"]): anchor is CompareImageAnchor {
  return (anchor as { type?: string }).type === "compare-image";
}

// ── 핀 파생 (댓글 문서 → 비교 핀 목록) ──────────────────────────────────

/** 화면 표시용 비교 핀: 스레드 정보 + 꽂힌 소스·상대 소스의 라벨까지 해석한 형태. */
export interface ComparePin {
  readonly id: string;
  readonly threadId: string;
  readonly poolItemId: string;
  readonly poolLabel: string;
  readonly sourceKind: CompareSourceKind | null;
  readonly pairedPoolItemId: string | null;
  readonly pairedLabel: string | null;
  readonly x: number;
  readonly y: number;
  readonly status: ManuscriptPinStatus;
  readonly authorId: string | null;
  readonly authorName: string;
  readonly createdAt: string;
  /** 긴급 접두사를 뗀 표시용 본문. */
  readonly body: string;
  readonly replyCount: number;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  /** 표시 순번(생성 순서, 1부터). */
  readonly number: number;
}

/**
 * 댓글 문서에서 비교 핀만 뽑아 풀 라벨과 함께 해석한다.
 * 풀에서 빠진 소스의 핀도 남긴다(poolLabel은 앵커가 아는 id로 대체 표시) —
 * 소스를 지웠다고 검수 기록이 사라지면 안 되기 때문이다.
 */
export function commentsDocumentToComparePins(
  document: StudioCommentsDocument,
  pool: readonly ComparePoolItem[],
): ComparePin[] {
  const byId = new Map(pool.map((item) => [item.id, item]));
  const pins: ComparePin[] = [];
  const threads = [...document.threads].sort((a, b) => {
    const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
  for (const thread of threads) {
    if (!isCompareImageAnchor(thread.anchor)) continue;
    const anchor = thread.anchor;
    const item = byId.get(anchor.poolItemId);
    const paired = anchor.pairedPoolItemId ? byId.get(anchor.pairedPoolItemId) : undefined;
    pins.push({
      id: `pin-${thread.id}`,
      threadId: thread.id,
      poolItemId: anchor.poolItemId,
      poolLabel: item?.label ?? anchor.poolItemId,
      sourceKind: item?.source.kind ?? null,
      pairedPoolItemId: anchor.pairedPoolItemId ?? null,
      pairedLabel: anchor.pairedPoolItemId ? (paired?.label ?? anchor.pairedPoolItemId) : null,
      x: anchor.x,
      y: anchor.y,
      status: resolvePinStatusFromThread(thread),
      authorId: thread.author.id ?? null,
      authorName: thread.author.displayName,
      createdAt: thread.createdAt,
      body: stripManuscriptPinUrgentPrefix(thread.body),
      replyCount: thread.replies.length,
      assigneeId: thread.assignee?.id ?? null,
      assigneeName: thread.assignee?.displayName ?? null,
      number: pins.length + 1,
    });
  }
  return pins;
}

/** 한 풀 항목에 꽂힌 핀만. */
export function comparePinsForPoolItem(pins: readonly ComparePin[], poolItemId: string): ComparePin[] {
  return pins.filter((pin) => pin.poolItemId === poolItemId);
}

// ── 승인 게이트 집계 ────────────────────────────────────────────────────

export interface ComparePinGateSummary {
  readonly openCount: number;
  readonly urgentOpenCount: number;
  /** 긴급 핀이 꽂힌 소스 라벨들(중복 제거, 등장 순서). 잠금 사유 문장에 출처를 표시하는 용도. */
  readonly urgentSourceLabels: readonly string[];
}

/**
 * 비교 핀의 게이트 집계. 원고 핀과 같은 규칙: '긴급'(필수 수정) 미해결이 있으면 승인이 잠긴다.
 * 회차 룸은 이 집계를 원고 핀 집계와 합산해 잠금 조건·사유를 만든다.
 */
export function summarizeComparePinGate(
  document: StudioCommentsDocument,
  pool: readonly ComparePoolItem[],
): ComparePinGateSummary {
  const pins = commentsDocumentToComparePins(document, pool);
  const labels: string[] = [];
  let openCount = 0;
  let urgentOpenCount = 0;
  for (const pin of pins) {
    if (pin.status === "resolved") continue;
    openCount += 1;
    if (pin.status === "urgent") {
      urgentOpenCount += 1;
      if (!labels.includes(pin.poolLabel)) labels.push(pin.poolLabel);
    }
  }
  return { openCount, urgentOpenCount, urgentSourceLabels: labels };
}

// ── 검수 프리셋 ─────────────────────────────────────────────────────────

export type ComparePresetId = "previous-episode" | "storyboard" | "external-brief";

export const COMPARE_PRESET_IDS: readonly ComparePresetId[] = ["previous-episode", "storyboard", "external-brief"] as const;

export const COMPARE_PRESET_LABELS: Readonly<Record<ComparePresetId, { readonly ko: string; readonly en: string }>> = {
  "previous-episode": { ko: "전 회차와 비교", en: "Compare with previous episode" },
  "storyboard": { ko: "콘티와 비교", en: "Compare with storyboard" },
  "external-brief": { ko: "시안과 비교", en: "Compare with client brief" },
};

/**
 * 프리셋 적용 결과. 적용할 수 없으면 reason에 기계 판독용 사유를 돌려주고
 * 호출 측이 사용자 문구로 바꾼다.
 */
export type ComparePresetResult =
  | { readonly ok: true; readonly session: CompareSession }
  | { readonly ok: false; readonly reason: "no-current" | "no-counterpart" };

/** 라벨에서 첫 번째 숫자 토큰(컷 번호 등)을 뽑는다. 없으면 null. */
export function compareLabelNumberToken(label: string): string | null {
  const match = /\d+/.exec(label);
  return match ? match[0] : null;
}

/**
 * 전 회차 페이지 후보 중 현재 원고 라벨과 컷 번호가 맞는 페이지를 고른다.
 * 맞는 게 없으면 첫 페이지를 돌려준다(프리셋은 배치가 목적, 이후 조작은 자유).
 */
export function matchComparePresetPage(
  pages: readonly ComparePoolItem[],
  currentLabel: string,
): ComparePoolItem | null {
  if (pages.length === 0) return null;
  const token = compareLabelNumberToken(currentLabel);
  if (token) {
    const matched = pages.find((page) => compareLabelNumberToken(page.label) === token);
    if (matched) return matched;
  }
  return pages[0];
}

/**
 * 프리셋을 적용한다: 현재 원고(기준 페인)를 유지하고 상대 소스를 두 번째 페인에 배치한다.
 * - previous-episode: 상대는 pool 안의 page 소스 중 컷 번호 매칭.
 * - storyboard: 상대는 호출 측이 알려 준 콘티 리비전 소스.
 * - external-brief: 상대는 pool의 첫 external 소스.
 * 기준 소스가 없으면(현재 원고 미배치) 풀의 첫 revision을 기준으로 삼는다.
 */
export function applyComparePreset(
  session: CompareSession,
  preset: ComparePresetId,
  options?: { readonly storyboardSource?: CompareSourceRef | null },
): ComparePresetResult {
  const currentKey = session.panes.length > 0 ? compareSourceKey(session.panes[0]) : null;
  const currentItem = session.pool.find((item) => compareSourceKey(item.source) === currentKey)
    ?? session.pool.find((item) => item.source.kind === "revision")
    ?? session.pool[0];
  if (!currentItem) return { ok: false, reason: "no-current" };

  let counterpart: ComparePoolItem | null = null;
  if (preset === "previous-episode") {
    counterpart = matchComparePresetPage(
      session.pool.filter((item) => item.source.kind === "page" && item.id !== currentItem.id),
      currentItem.label,
    );
  } else if (preset === "storyboard") {
    const key = options?.storyboardSource ? compareSourceKey(options.storyboardSource) : null;
    counterpart = key
      ? session.pool.find((item) => compareSourceKey(item.source) === key && item.id !== currentItem.id) ?? null
      : session.pool.find((item) => item.source.kind === "revision" && item.id !== currentItem.id) ?? null;
  } else {
    counterpart = session.pool.find((item) => item.source.kind === "external" && item.id !== currentItem.id) ?? null;
  }
  if (!counterpart) return { ok: false, reason: "no-counterpart" };

  return {
    ok: true,
    session: { ...session, mode: "panes", panes: [currentItem.source, counterpart.source] },
  };
}
