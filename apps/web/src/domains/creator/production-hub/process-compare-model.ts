/**
 * 공정 비교 모드 (나란히 보기) 순수 모델.
 *
 * 크레코의 "비교 모드"를 뛰어넘는 UX를 목표로, 모든 상태 계산을
 * React 바깥의 순수 함수로 분리한다. 뷰어는 이 모듈의 타입·헬퍼만 사용한다.
 */

export type ProcessCompareKind = "image" | "text" | "media" | "package";

/**
 * 비교 소스 종류 4종 (FLAGSHIP §4 소스 풀).
 * 지금까지 비교는 내부 리비전(revision)만 소스였고, 이제 외부 파일·URL(external),
 * 지난 회차 페이지(page), 레퍼런스 보드 이미지(reference)까지 한 풀로 개방한다.
 */
export type CompareSourceKind = "revision" | "external" | "page" | "reference";

export const COMPARE_SOURCE_KINDS: readonly CompareSourceKind[] = ["revision", "external", "page", "reference"] as const;

/** 비교 소스 참조 유니온. 풀 항목의 정체성은 이 참조의 키(compareSourceKey)로 정한다. */
export type CompareSourceRef =
  | { readonly kind: "revision"; readonly processId: string; readonly revisionId: string }
  | { readonly kind: "external"; readonly assetId: string }
  | { readonly kind: "page"; readonly projectId: string; readonly episodeId: string; readonly pageId: string }
  | { readonly kind: "reference"; readonly boardId: string; readonly itemId: string };

/** 소스 참조의 안정 키. 풀 중복 제거와 핀·세션 복원의 기준이 된다. */
export function compareSourceKey(source: CompareSourceRef): string {
  switch (source.kind) {
    case "revision": return `revision:${source.processId}::${source.revisionId}`;
    case "external": return `external:${source.assetId}`;
    case "page": return `page:${source.projectId}::${source.episodeId}::${source.pageId}`;
    case "reference": return `reference:${source.boardId}::${source.itemId}`;
  }
}

/** 소스 종류 배지 문구. 페인 라벨과 풀 칩에서 "어떤 종류의 소스인지"를 항상 보여 준다. */
export function compareSourceKindLabel(kind: CompareSourceKind): { readonly ko: string; readonly en: string } {
  switch (kind) {
    case "revision": return { ko: "버전", en: "Version" };
    case "external": return { ko: "외부 이미지", en: "External" };
    case "page": return { ko: "지난 회차", en: "Previous episode" };
    case "reference": return { ko: "레퍼런스", en: "Reference" };
  }
}

/** 비교 뷰어에 나란히 표시되는 뷰어(페인) 개수. */
export type ProcessCompareLayout = 2 | 3 | 4;

/** 비교 방식: 나란히 보기 / 비포·애프터 슬라이더 / 깜빡임(차이 찾기) / 오버레이(투명도 겹침, 2단계 신규). */
export type ProcessCompareMode = "panes" | "slider" | "blink" | "overlay";

/** 개별 비교 항목: 한 공정의 한 리비전. */
export interface ProcessCompareItem {
  readonly id: string;
  readonly processId: string;
  readonly processLabel: string;
  readonly kind: ProcessCompareKind;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly revisionIndex: number;
  readonly createdAt: string;
  /** 렌더된 이미지 URL. 없으면 플레이스홀더 아트를 사용한다. */
  readonly imageUrl: string | null;
  readonly statusTone: "ready" | "working" | "review" | "approved" | "done";
  /** 이 항목이 어떤 소스에서 왔는지 (4종 유니온). 리비전 항목은 revision이다. */
  readonly source: CompareSourceRef;
  /** source.kind와 같은 값. 배지·그룹핑에서 유니온을 좁히지 않고 쓰기 위한 사본. */
  readonly sourceKind: CompareSourceKind;
  /** 외부 이미지의 출처 메모(파일명·권리 표기 등). 그 외 소스는 null. */
  readonly originNote: string | null;
}

/** 한 페인이 바라보는 소스 (공정 + 리비전). */
export interface ProcessComparePaneSource {
  readonly processId: string;
  readonly revisionId: string;
}

export const PROCESS_COMPARE_LAYOUTS: readonly ProcessCompareLayout[] = [2, 3, 4] as const;

export const PROCESS_COMPARE_MODES: readonly ProcessCompareMode[] = ["panes", "slider", "blink", "overlay"] as const;

/** 슬라이더 위치(%) 범위. */
export const PROCESS_COMPARE_SLIDER_MIN = 0;
export const PROCESS_COMPARE_SLIDER_MAX = 100;

export function clampProcessCompareSlider(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(PROCESS_COMPARE_SLIDER_MAX, Math.max(PROCESS_COMPARE_SLIDER_MIN, value));
}

/**
 * 슬라이더 모드에서 왼쪽(이전) 레이어에 적용할 clip-path.
 * position% 지점의 왼쪽이 보인다.
 */
export function processCompareSliderClip(position: number): string {
  const clamped = clampProcessCompareSlider(position);
  return `inset(0 ${100 - clamped}% 0 0)`;
}

/**
 * 슬라이더 핸들의 키보드 이동량(px 기준이 아닌 % 기준).
 * Shift와 함께 누르면 크게 이동한다.
 */
export function processCompareSliderStep(shiftKey: boolean): number {
  return shiftKey ? 10 : 2;
}

export function moveProcessCompareSlider(position: number, delta: number): number {
  return clampProcessCompareSlider(position + delta);
}

/**
 * 공정 목록에서 비교 항목을 만든다. 리비전이 없는 공정은 제외한다.
 * resolveImageUrl이 URL을 반환하지 못하면 imageUrl은 null이 되고
 * 뷰어가 플레이스홀더 아트를 렌더한다.
 */
export function buildProcessCompareItems<TProcess extends {
  readonly id: string;
  readonly label: string;
  readonly kind: ProcessCompareKind;
  readonly revisions: readonly {
    readonly id: string;
    readonly createdAt: string;
  }[];
}>(processes: readonly TProcess[], resolveImageUrl?: (processId: string, revisionId: string) => string | null): ProcessCompareItem[] {
  const items: ProcessCompareItem[] = [];
  for (const process of processes) {
    process.revisions.forEach((revision, index) => {
      items.push({
        id: `${process.id}::${revision.id}`,
        processId: process.id,
        processLabel: process.label,
        kind: process.kind,
        revisionId: revision.id,
        revisionLabel: `v${index + 1}`,
        revisionIndex: index + 1,
        createdAt: revision.createdAt,
        imageUrl: resolveImageUrl ? (resolveImageUrl(process.id, revision.id) ?? null) : null,
        statusTone: index === process.revisions.length - 1 ? "done" : "working",
        source: { kind: "revision", processId: process.id, revisionId: revision.id },
        sourceKind: "revision",
        originNote: null,
      });
    });
  }
  return items;
}

/** 합성 페인 식별자: 기존 페인 기계(공정+리비전)를 모든 소스 종류에 그대로 재사용하기 위한 규칙. */
function syntheticPaneIds(source: CompareSourceRef): { readonly processId: string; readonly revisionId: string } {
  switch (source.kind) {
    case "revision": return { processId: source.processId, revisionId: source.revisionId };
    case "external": return { processId: `external:${source.assetId}`, revisionId: source.assetId };
    case "page": return { processId: `page:${source.episodeId}`, revisionId: source.pageId };
    case "reference": return { processId: `reference:${source.boardId}`, revisionId: source.itemId };
  }
}

export interface ExternalCompareItemInput {
  /** 가져온 에셋의 안정 id. URL은 externalCompareAssetIdForUrl, 파일은 externalCompareAssetIdForFile로 만든다. */
  readonly assetId: string;
  readonly label: string;
  readonly imageUrl: string | null;
  readonly createdAt?: string;
  /** 출처·권리 메모. 클라이언트 시안처럼 출처를 남겨야 하는 이미지에 쓴다. */
  readonly originNote?: string | null;
}

/** 외부 파일·URL 이미지를 비교 항목으로 만든다. 버전과 같은 풀·페인에 그대로 들어간다. */
export function buildExternalCompareItem(input: ExternalCompareItemInput): ProcessCompareItem {
  const source: CompareSourceRef = { kind: "external", assetId: input.assetId };
  const ids = syntheticPaneIds(source);
  return {
    id: compareSourceKey(source),
    processId: ids.processId,
    processLabel: input.label,
    kind: "image",
    revisionId: ids.revisionId,
    revisionLabel: "외부 이미지",
    revisionIndex: 1,
    createdAt: input.createdAt ?? "",
    imageUrl: input.imageUrl,
    statusTone: "ready",
    source,
    sourceKind: "external",
    originNote: input.originNote ?? null,
  };
}

export interface PageCompareItemInput {
  readonly projectId: string;
  readonly episodeId: string;
  readonly pageId: string;
  /** 회차 라벨 (예: "12화"). 페인의 공정 라벨 자리에 표시된다. */
  readonly episodeLabel: string;
  /** 페이지 라벨 (예: "34컷"). 페인의 버전 라벨 자리에 표시된다. */
  readonly pageLabel: string;
  readonly imageUrl: string | null;
  readonly createdAt?: string;
}

/** 지난 회차 페이지를 비교 항목으로 만든다. 연재 톤·캐릭터 일관성 검수의 주 소스다. */
export function buildPageCompareItem(input: PageCompareItemInput): ProcessCompareItem {
  const source: CompareSourceRef = { kind: "page", projectId: input.projectId, episodeId: input.episodeId, pageId: input.pageId };
  const ids = syntheticPaneIds(source);
  return {
    id: compareSourceKey(source),
    processId: ids.processId,
    processLabel: input.episodeLabel,
    kind: "image",
    revisionId: ids.revisionId,
    revisionLabel: input.pageLabel,
    revisionIndex: 1,
    createdAt: input.createdAt ?? "",
    imageUrl: input.imageUrl,
    statusTone: "ready",
    source,
    sourceKind: "page",
    originNote: null,
  };
}

export interface ReferenceCompareItemInput {
  readonly boardId: string;
  readonly itemId: string;
  /** 보드 라벨 (예: "레퍼런스 보드"). */
  readonly boardLabel: string;
  /** 보드 이미지 라벨 (예: "포즈 사진 3"). */
  readonly itemLabel: string;
  readonly imageUrl: string | null;
  readonly createdAt?: string;
}

/** 레퍼런스 보드 이미지를 비교 항목으로 만든다. 보드에 올린 사진이 곧 비교 소스가 된다. */
export function buildReferenceCompareItem(input: ReferenceCompareItemInput): ProcessCompareItem {
  const source: CompareSourceRef = { kind: "reference", boardId: input.boardId, itemId: input.itemId };
  const ids = syntheticPaneIds(source);
  return {
    id: compareSourceKey(source),
    processId: ids.processId,
    processLabel: input.boardLabel,
    kind: "image",
    revisionId: ids.revisionId,
    revisionLabel: input.itemLabel,
    revisionIndex: 1,
    createdAt: input.createdAt ?? "",
    imageUrl: input.imageUrl,
    statusTone: "ready",
    source,
    sourceKind: "reference",
    originNote: null,
  };
}

/** 소스 키 기준으로 중복을 제거한다. 먼저 들어온 항목이 이긴다(순서 유지). */
export function dedupeProcessCompareItems(items: readonly ProcessCompareItem[]): ProcessCompareItem[] {
  const seen = new Set<string>();
  const out: ProcessCompareItem[] = [];
  for (const item of items) {
    const key = compareSourceKey(item.source);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** 여러 출처(버전·지난 회차·레퍼런스·사용자가 추가한 외부 이미지)를 한 풀로 합친다. */
export function mergeProcessCompareItems(
  ...groups: readonly (readonly ProcessCompareItem[])[]
): ProcessCompareItem[] {
  return dedupeProcessCompareItems(groups.flatMap((group) => [...group]));
}

/** 소스 참조로 풀 항목을 찾는다. */
export function findProcessCompareItemBySource(
  items: readonly ProcessCompareItem[],
  source: CompareSourceRef,
): ProcessCompareItem | null {
  const key = compareSourceKey(source);
  return items.find((item) => compareSourceKey(item.source) === key) ?? null;
}

/** 종류별 항목 수. 풀 헤더의 배지(버전 n · 외부 n · 지난 회차 n · 레퍼런스 n)에 쓴다. */
export function countProcessCompareItemsBySourceKind(
  items: readonly ProcessCompareItem[],
): Readonly<Record<CompareSourceKind, number>> {
  const counts: Record<CompareSourceKind, number> = { revision: 0, external: 0, page: 0, reference: 0 };
  for (const item of items) counts[item.sourceKind] += 1;
  return counts;
}

export type ExternalCompareUrlCheck =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: "empty" | "invalid" | "protocol" };

/** 외부 이미지 URL 검증. http/https만 허용하고, 실패 사유를 호출자가 문구로 바꿀 수 있게 돌려준다. */
export function validateExternalCompareUrl(raw: string): ExternalCompareUrlCheck {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false, reason: "protocol" };
  return { ok: true, url: parsed.toString() };
}

/** URL의 결정적 해시. 같은 URL을 다시 추가해도 같은 에셋 id가 되어 풀에서 중복되지 않는다. */
export function externalCompareAssetIdForUrl(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i += 1) {
    hash = ((hash << 5) + hash + url.charCodeAt(i)) | 0;
  }
  return `url-${(hash >>> 0).toString(36)}`;
}

/** 파일의 결정적 에셋 id. 같은 파일을 다시 추가해도 풀에서 중복되지 않는다. */
export function externalCompareAssetIdForFile(file: {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
}): string {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60) || "file";
  return `file-${safeName}-${file.size}-${file.lastModified}`;
}

export function findProcessCompareItem(
  items: readonly ProcessCompareItem[],
  source: ProcessComparePaneSource,
): ProcessCompareItem | null {
  return items.find((item) => item.processId === source.processId && item.revisionId === source.revisionId) ?? null;
}

/**
 * 기본 페인 구성: 서로 다른 공정의 최신 리비전을 앞에서부터 layout개 선택.
 * 항목이 부족하면 가능한 만큼만 반환한다.
 */
export function defaultProcessCompareSources(
  items: readonly ProcessCompareItem[],
  layout: ProcessCompareLayout,
): ProcessComparePaneSource[] {
  const seen = new Set<string>();
  const sources: ProcessComparePaneSource[] = [];
  // 최신 리비전이 뒤에 오도록 정렬되어 있다고 가정하고 뒤에서부터 탐색
  for (let i = items.length - 1; i >= 0 && sources.length < layout; i -= 1) {
    const item = items[i];
    if (seen.has(item.processId)) continue;
    seen.add(item.processId);
    sources.unshift({ processId: item.processId, revisionId: item.revisionId });
  }
  return sources;
}

/**
 * 공정 피커용 그룹: 공정별 리비전 목록.
 */
export interface ProcessCompareProcessGroup {
  readonly processId: string;
  readonly processLabel: string;
  readonly items: readonly ProcessCompareItem[];
}

export function groupProcessCompareItems(items: readonly ProcessCompareItem[]): ProcessCompareProcessGroup[] {
  const byProcess = new Map<string, { processId: string; processLabel: string; items: ProcessCompareItem[] }>();
  for (const item of items) {
    let group = byProcess.get(item.processId);
    if (!group) {
      group = { processId: item.processId, processLabel: item.processLabel, items: [] };
      byProcess.set(item.processId, group);
    }
    group.items.push(item);
  }
  return [...byProcess.values()];
}

/**
 * 동기 스크롤: 소스 페인의 스크롤 위치를 다른 페인에 그대로 적용한다.
 * 줌이 동일하다는 전제 하에 offset을 1:1로 복사한다.
 */
export function applySyncedScroll(
  targets: readonly { scrollLeft: number; scrollTop: number }[],
  source: { scrollLeft: number; scrollTop: number },
): void {
  for (const target of targets) {
    target.scrollLeft = source.scrollLeft;
    target.scrollTop = source.scrollTop;
  }
}

export const PROCESS_COMPARE_ZOOM_MIN = 0.5;
export const PROCESS_COMPARE_ZOOM_MAX = 4;
export const PROCESS_COMPARE_ZOOM_STEP = 0.25;

export function clampProcessCompareZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(PROCESS_COMPARE_ZOOM_MAX, Math.max(PROCESS_COMPARE_ZOOM_MIN, value));
}

export function zoomProcessCompareIn(current: number): number {
  return clampProcessCompareZoom(Math.round((current + PROCESS_COMPARE_ZOOM_STEP) * 100) / 100);
}

export function zoomProcessCompareOut(current: number): number {
  return clampProcessCompareZoom(Math.round((current - PROCESS_COMPARE_ZOOM_STEP) * 100) / 100);
}

// ── 2단계: 확대·이동 완전 동기화 + 정렬 오프셋 + 반전 + 오버레이 ──────────
//
// FLAGSHIP §5.1~5.3. 지금까지 줌은 나란히 모드의 배율 숫자 하나였고 이동은
// 스크롤 동기화뿐이라, 한 페인을 확대·이동해도 "같은 위치를 같은 크기로"
// 보는 보장이 없었다. 여기서부터는 공유 뷰포트(배율+이동)가 기준이고,
// 페인별 정렬 오프셋을 합성한 변환을 전 페인·전 모드가 공유한다.

/** 이동(pan)의 허용 범위(페인 크기 기준 정규화 좌표). 이미지가 완전히 사라지지 않게 ±1로 묶는다. */
export const PROCESS_COMPARE_PAN_LIMIT = 1;

export function clampProcessComparePan(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(PROCESS_COMPARE_PAN_LIMIT, Math.max(-PROCESS_COMPARE_PAN_LIMIT, value));
}

/**
 * 동기화의 기준이 되는 공유 뷰포트. 잠금이 켜져 있으면 어느 페인에서
 * 조작해도 이 값 하나만 바뀌고, 전 페인이 같은 배율·같은 상대 위치로 움직인다.
 * tx/ty는 페인 표시 영역 기준 정규화 이동량(-1..1)이다.
 */
export interface ProcessCompareViewport {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

export const PROCESS_COMPARE_VIEWPORT_IDENTITY: ProcessCompareViewport = { scale: 1, tx: 0, ty: 0 };

/** 상태에 소수 오차가 쌓이지 않게 정규화 좌표를 소수 4자리로 반올림한다. */
function roundCompareCoord(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** 드래그 이동을 뷰포트에 반영한다. delta는 페인 크기 기준 정규화 이동량. */
export function panProcessCompareViewport(
  viewport: ProcessCompareViewport,
  delta: { readonly dx: number; readonly dy: number },
): ProcessCompareViewport {
  return {
    scale: clampProcessCompareZoom(viewport.scale),
    tx: roundCompareCoord(clampProcessComparePan(viewport.tx + (Number.isFinite(delta.dx) ? delta.dx : 0))),
    ty: roundCompareCoord(clampProcessComparePan(viewport.ty + (Number.isFinite(delta.dy) ? delta.dy : 0))),
  };
}

/**
 * 중심점 고정 확대. center는 조작이 일어난 페인 표시 영역의 정규화 좌표(0..1)로,
 * 전 페인이 같은 지점을 중심으로 확대되게 tx/ty를 함께 보정한다.
 * 변환 원점이 요소 중심(transform-origin: center)이라, 중심에서 확대하면
 * 이동 보정은 0이고, 모서리 쪽으로 갈수록 반대 방향 보정이 커진다.
 */
export function zoomProcessCompareViewportAt(
  viewport: ProcessCompareViewport,
  nextScaleRaw: number,
  center: { readonly x: number; readonly y: number },
): ProcessCompareViewport {
  const nextScale = clampProcessCompareZoom(nextScaleRaw);
  const base = clampProcessCompareZoom(viewport.scale);
  if (nextScale === base) return { scale: nextScale, tx: roundCompareCoord(clampProcessComparePan(viewport.tx)), ty: roundCompareCoord(clampProcessComparePan(viewport.ty)) };
  const ratio = nextScale / base;
  const cx = Number.isFinite(center.x) ? center.x : 0.5;
  const cy = Number.isFinite(center.y) ? center.y : 0.5;
  return {
    scale: nextScale,
    tx: roundCompareCoord(clampProcessComparePan((cx - 0.5) * (1 - ratio) + viewport.tx * ratio)),
    ty: roundCompareCoord(clampProcessComparePan((cy - 0.5) * (1 - ratio) + viewport.ty * ratio)),
  };
}

/** 페인별 정렬 오프셋의 허용 범위(정규화 좌표). 여백 차이 같은 미세 정렬 전용이라 ±0.25로 좁게 묶는다. */
export const PROCESS_COMPARE_OFFSET_LIMIT = 0.25;

export function clampProcessCompareOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(PROCESS_COMPARE_OFFSET_LIMIT, Math.max(-PROCESS_COMPARE_OFFSET_LIMIT, value));
}

/** 한 소스의 정렬 오프셋. 동기화가 유지되는 기준점 보정값이다. */
export interface ProcessComparePaneOffset {
  readonly dx: number;
  readonly dy: number;
}

export const PROCESS_COMPARE_OFFSET_ZERO: ProcessComparePaneOffset = { dx: 0, dy: 0 };

/** 오프셋 맵의 키. 페인 소스(공정+리비전)는 항목 id와 같은 규칙이다. */
export function processComparePaneKey(source: ProcessComparePaneSource): string {
  return `${source.processId}::${source.revisionId}`;
}

/** 오프셋을 설정한다. 0으로 돌아오면 키를 지워 맵을 깨끗하게 유지한다(새 객체 반환). */
export function setProcessComparePaneOffset(
  offsets: Readonly<Record<string, ProcessComparePaneOffset>>,
  paneKey: string,
  offset: ProcessComparePaneOffset,
): Readonly<Record<string, ProcessComparePaneOffset>> {
  const clamped = { dx: clampProcessCompareOffset(offset.dx), dy: clampProcessCompareOffset(offset.dy) };
  const next: Record<string, ProcessComparePaneOffset> = { ...offsets };
  if (clamped.dx === 0 && clamped.dy === 0) delete next[paneKey];
  else next[paneKey] = clamped;
  return next;
}

/** 모든 페인의 오프셋이 0인지 — 차이 표시가 의미를 가지려면 정렬이 맞아 있어야 한다(§5.2 안내용). */
export function areProcessCompareOffsetsAligned(
  offsets: Readonly<Record<string, ProcessComparePaneOffset>>,
): boolean {
  return Object.values(offsets).every((offset) => offset.dx === 0 && offset.dy === 0);
}

/** 한 페인의 실제 변환: (공유 또는 개별) 뷰포트 + 그 소스의 정렬 오프셋 + 전 페인 동시 반전. */
export interface ProcessComparePaneTransform {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
  /** 좌우 반전이 켜졌으면 -1. CSS transform의 scaleX와 짝을 이룬다. */
  readonly flipX: 1 | -1;
  /** 상하 반전이 켜졌으면 -1. */
  readonly flipY: 1 | -1;
}

export function resolveProcessComparePaneTransform(args: {
  readonly syncView: boolean;
  readonly shared: ProcessCompareViewport;
  readonly local?: ProcessCompareViewport | null;
  readonly offset?: ProcessComparePaneOffset | null;
  readonly flipHorizontal: boolean;
  readonly flipVertical: boolean;
}): ProcessComparePaneTransform {
  const base = args.syncView ? args.shared : (args.local ?? PROCESS_COMPARE_VIEWPORT_IDENTITY);
  const offset = args.offset ?? PROCESS_COMPARE_OFFSET_ZERO;
  return {
    scale: clampProcessCompareZoom(base.scale),
    tx: roundCompareCoord(clampProcessComparePan(base.tx + offset.dx)),
    ty: roundCompareCoord(clampProcessComparePan(base.ty + offset.dy)),
    flipX: args.flipHorizontal ? -1 : 1,
    flipY: args.flipVertical ? -1 : 1,
  };
}

/** CSS transform 문자열. translate는 요소 크기 기준 %로 적용된다(정규화 이동량 × 100). */
export function processComparePaneTransformCss(transform: ProcessComparePaneTransform): string {
  const tx = Math.round(transform.tx * 10_000) / 100;
  const ty = Math.round(transform.ty * 10_000) / 100;
  return `translate(${tx}%, ${ty}%) scale(${transform.scale}) scaleX(${transform.flipX}) scaleY(${transform.flipY})`;
}

/**
 * 반전이 켜진 페인에서 읽은 정규화 좌표(0..1)를 원래 이미지 좌표로 되돌린다.
 * 이후 단계의 핀·스포이드가 반전 상태에서도 어긋나지 않게 하는 보정(§5.3).
 */
export function invertProcessComparePoint(
  point: { readonly x: number; readonly y: number },
  flipHorizontal: boolean,
  flipVertical: boolean,
): { readonly x: number; readonly y: number } {
  const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  return {
    x: clamp01(flipHorizontal ? 1 - point.x : point.x),
    y: clamp01(flipVertical ? 1 - point.y : point.y),
  };
}

// ── 오버레이 모드 (2단계 신규, §5.2) ──────────────────────────────────────

/** 오버레이에서 위에 겹치는 이미지의 불투명도 범위·기본값. */
export const PROCESS_COMPARE_OVERLAY_MIN = 0;
export const PROCESS_COMPARE_OVERLAY_MAX = 1;
export const PROCESS_COMPARE_OVERLAY_DEFAULT = 0.5;

export function clampProcessCompareOverlayOpacity(value: number): number {
  if (!Number.isFinite(value)) return PROCESS_COMPARE_OVERLAY_DEFAULT;
  return Math.min(PROCESS_COMPARE_OVERLAY_MAX, Math.max(PROCESS_COMPARE_OVERLAY_MIN, value));
}

/** 깜빡임 모드 주기(ms) 범위. */
export const PROCESS_COMPARE_BLINK_MIN_MS = 250;
export const PROCESS_COMPARE_BLINK_MAX_MS = 2000;

export function clampProcessCompareBlinkMs(value: number): number {
  if (!Number.isFinite(value)) return 800;
  return Math.min(PROCESS_COMPARE_BLINK_MAX_MS, Math.max(PROCESS_COMPARE_BLINK_MIN_MS, value));
}

/**
 * 차이 하이라이트: 다운스케일된 두 이미지의 픽셀 차이를 비교해
 * 차이가 큰 셀들의 경계 박스를 원본 좌표(%)로 반환한다.
 * data는 width*height*4 RGBA 배열이다.
 */
export interface ProcessCompareDiffRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function computeProcessCompareDiffRegions(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { readonly cellSize?: number; readonly threshold?: number; readonly maxRegions?: number },
): ProcessCompareDiffRegion[] {
  const cellSize = options?.cellSize ?? 8;
  const threshold = options?.threshold ?? 48;
  const maxRegions = options?.maxRegions ?? 6;
  if (a.length !== b.length || width <= 0 || height <= 0) return [];

  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const scores: { col: number; row: number; score: number }[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let sum = 0;
      let count = 0;
      for (let y = row * cellSize; y < Math.min((row + 1) * cellSize, height); y += 1) {
        for (let x = col * cellSize; x < Math.min((col + 1) * cellSize, width); x += 1) {
          const i = (y * width + x) * 4;
          const dr = Math.abs(a[i] - b[i]);
          const dg = Math.abs(a[i + 1] - b[i + 1]);
          const db = Math.abs(a[i + 2] - b[i + 2]);
          sum += (dr + dg + db) / 3;
          count += 1;
        }
      }
      const avg = count === 0 ? 0 : sum / count;
      if (avg >= threshold) scores.push({ col, row, score: avg });
    }
  }

  scores.sort((x, y) => y.score - x.score);
  return scores.slice(0, maxRegions).map(({ col, row }) => ({
    x: (col * cellSize / width) * 100,
    y: (row * cellSize / height) * 100,
    width: (Math.min(cellSize, width - col * cellSize) / width) * 100,
    height: (Math.min(cellSize, height - row * cellSize) / height) * 100,
  }));
}

/**
 * 이미지가 없을 때 사용하는 결정적 플레이스홀더 아트 (SVG data URI).
 * 공정 종류별 그라데이션 + 라벨. seed로 색상 순환.
 */
const PROCESS_COMPARE_ART_HUES: Record<ProcessCompareKind, readonly number[]> = {
  image: [222, 258, 285],
  text: [160, 185, 210],
  media: [320, 345, 20],
  package: [40, 65, 90],
};

const PROCESS_COMPARE_ART_GLYPH: Record<ProcessCompareKind, string> = {
  image: "◈",
  text: "✎",
  media: "▶",
  package: "▣",
};

export function processComparePlaceholderArt(kind: ProcessCompareKind, label: string, seed = 0): string {
  const hues = PROCESS_COMPARE_ART_HUES[kind];
  const hue = hues[Math.abs(seed) % hues.length];
  const glyph = PROCESS_COMPARE_ART_GLYPH[kind];
  const safeLabel = label.replace(/[<>&"']/g, "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="900" viewBox="0 0 640 900">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue},45%,26%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,14%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="640" height="900" fill="url(#g)"/>` +
    `<circle cx="320" cy="380" r="150" fill="none" stroke="hsl(${hue},70%,65%)" stroke-opacity="0.25" stroke-width="2"/>` +
    `<circle cx="320" cy="380" r="105" fill="none" stroke="hsl(${hue},70%,65%)" stroke-opacity="0.18" stroke-width="2"/>` +
    `<text x="320" y="410" text-anchor="middle" font-size="120" fill="hsl(${hue},80%,72%)" fill-opacity="0.85">${glyph}</text>` +
    `<text x="320" y="620" text-anchor="middle" font-size="44" font-weight="700" fill="#ffffff" fill-opacity="0.92" font-family="sans-serif">${safeLabel}</text>` +
    `<text x="320" y="668" text-anchor="middle" font-size="24" fill="#ffffff" fill-opacity="0.55" font-family="sans-serif">preview</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ── 검수 프리셋 3종 (FLAGSHIP §5.7 원클릭 구성) ─────────────────────────
//
// 프리셋은 풀을 채우고 페인을 배치할 뿐, 그 뒤 조작은 자유다. 세 프리셋 모두
// "현재 원고(기준 페인) + 상대 소스" 2페인 나란히 구성을 돌려준다.
// 상대 소스가 풀에 없으면 억지로 배치하지 않고 reason으로 실패를 알린다 —
// 호출 측(뷰어)이 프리셋별 안내 문구로 바꿔 보여 준다.

/** 검수 프리셋 식별자. 순서는 뷰어 버튼 노출 순서와 같다. */
export type ProcessComparePresetId = "previous-episode" | "storyboard" | "external-brief";

export const PROCESS_COMPARE_PRESET_IDS: readonly ProcessComparePresetId[] = [
  "previous-episode",
  "storyboard",
  "external-brief",
] as const;

export const PROCESS_COMPARE_PRESET_LABELS: Readonly<Record<ProcessComparePresetId, { readonly ko: string; readonly en: string }>> = {
  "previous-episode": { ko: "전 회차와 비교", en: "Compare with previous episode" },
  "storyboard": { ko: "콘티와 비교", en: "Compare with storyboard" },
  "external-brief": { ko: "시안과 비교", en: "Compare with client brief" },
};

/**
 * 항목이 콘티 리비전인지 판정한다.
 * 정본 라벨은 productionManuscriptProcessLabel이 아티팩트 종류에서 만들며
 * 콘티 아티팩트(kind: "storyboard")의 라벨은 "콘티"다. 데모 샘플은 공정 id가
 * "storyboard"이고, 실데이터 공정 id는 아티팩트 id라 라벨 판정을 함께 쓴다.
 */
export function isProcessCompareStoryboardItem(item: ProcessCompareItem): boolean {
  if (item.sourceKind !== "revision") return false;
  const label = item.processLabel.trim().toLowerCase();
  return item.processId.toLowerCase().includes("storyboard")
    || label.includes("storyboard")
    || label.includes("콘티");
}

/** createdAt이 가장 최근인 항목. 동률이면 풀에서 뒤에 있는 항목(나중에 들어온 쪽)을 고른다. */
function latestProcessCompareItem(items: readonly ProcessCompareItem[]): ProcessCompareItem | null {
  let best: ProcessCompareItem | null = null;
  for (const item of items) {
    if (!best || item.createdAt >= best.createdAt) best = item;
  }
  return best;
}

/** 라벨에서 첫 번째 숫자 토큰(컷 번호 등)을 뽑는다. 없으면 null. */
export function processCompareLabelNumberToken(label: string): string | null {
  const match = /\d+/.exec(label);
  return match ? match[0] : null;
}

/**
 * 전 회차 페이지 후보 중 현재 원고와 컷 번호가 맞는 페이지를 고른다.
 * 컷 번호는 원고의 공정 라벨(예: "34컷 선화")에서만 읽는다 — 버전 라벨(vN)은
 * 컷 번호가 아니라 우연히 겹칠 수 있어 매칭 근거로 쓰지 않는다.
 * 맞는 게 없으면 첫 페이지를 돌려준다(프리셋은 배치가 목적, 이후 조작은 자유).
 */
export function matchProcessComparePresetPage(
  pages: readonly ProcessCompareItem[],
  current: ProcessCompareItem,
): ProcessCompareItem | null {
  if (pages.length === 0) return null;
  const token = processCompareLabelNumberToken(current.processLabel);
  if (token) {
    const matched = pages.find((page) =>
      processCompareLabelNumberToken(page.revisionLabel) === token
      || processCompareLabelNumberToken(page.processLabel) === token);
    if (matched) return matched;
  }
  return pages[0];
}

export type ProcessComparePresetResult =
  | {
      readonly ok: true;
      readonly preset: ProcessComparePresetId;
      readonly current: ProcessCompareItem;
      readonly counterpart: ProcessCompareItem;
      /** [기준 페인, 상대 페인] 순서의 페인 소스 쌍. 뷰어는 이대로 배치한다. */
      readonly sources: readonly [ProcessComparePaneSource, ProcessComparePaneSource];
    }
  | {
      readonly ok: false;
      readonly preset: ProcessComparePresetId;
      /** no-current: 기준으로 삼을 현재 원고가 풀에 없음. no-counterpart: 상대 소스가 풀에 없음. */
      readonly reason: "no-current" | "no-counterpart";
    };

/**
 * 프리셋을 적용해 페인 소스 쌍을 계산한다(순수 함수 — 상태 변경은 뷰어 몫).
 * 현재 원고(기준) 선택 규칙:
 *  1. 첫 페인에 배치된 항목을 유지한다. 단, 그 항목이 콘티 리비전이면 원고가
 *     아니므로 기준에서 제외한다(콘티는 항상 상대 자리).
 *  2. 없으면 콘티가 아닌 리비전 중 가장 최근 것.
 *  3. 그것도 없으면 가장 최근 리비전 → 첫 페인 항목 순으로 폴백한다.
 * 상대 선택 규칙:
 *  - previous-episode: 풀의 page 소스 중 컷 번호 매칭(matchProcessComparePresetPage).
 *  - storyboard: 콘티 리비전 중 가장 최근 것. 현재 원고 자체가 콘티뿐이면
 *    기준으로 삼을 원고가 없는 것으로 보고 no-current.
 *  - external-brief: 풀의 external 소스 중 가장 최근 것(최근에 추가한 시안).
 */
export function applyProcessComparePreset(
  items: readonly ProcessCompareItem[],
  preset: ProcessComparePresetId,
  currentSources?: readonly ProcessComparePaneSource[],
): ProcessComparePresetResult {
  const paneCurrent = currentSources && currentSources.length > 0
    ? findProcessCompareItem(items, currentSources[0])
    : null;
  const revisions = items.filter((item) => item.sourceKind === "revision");
  const current: ProcessCompareItem | null =
    (paneCurrent && !isProcessCompareStoryboardItem(paneCurrent) ? paneCurrent : null)
    ?? latestProcessCompareItem(revisions.filter((item) => !isProcessCompareStoryboardItem(item)))
    ?? latestProcessCompareItem(revisions)
    ?? paneCurrent;
  if (!current) return { ok: false, preset, reason: "no-current" };

  let counterpart: ProcessCompareItem | null = null;
  if (preset === "previous-episode") {
    counterpart = matchProcessComparePresetPage(
      items.filter((item) => item.sourceKind === "page" && item.id !== current.id),
      current,
    );
  } else if (preset === "storyboard") {
    if (isProcessCompareStoryboardItem(current)) return { ok: false, preset, reason: "no-current" };
    counterpart = latestProcessCompareItem(
      items.filter((item) => isProcessCompareStoryboardItem(item) && item.id !== current.id),
    );
  } else {
    counterpart = latestProcessCompareItem(
      items.filter((item) => item.sourceKind === "external" && item.id !== current.id),
    );
  }
  if (!counterpart) return { ok: false, preset, reason: "no-counterpart" };

  return {
    ok: true,
    preset,
    current,
    counterpart,
    sources: [
      { processId: current.processId, revisionId: current.revisionId },
      { processId: counterpart.processId, revisionId: counterpart.revisionId },
    ],
  };
}

/** 비교 가능한 항목이 2개 이상인지 (런처 버튼 활성화 조건). */
export function canOpenProcessCompare(items: readonly ProcessCompareItem[]): boolean {
  return items.length >= 2;
}
