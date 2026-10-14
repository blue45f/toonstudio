/**
 * Studio Artifact Intake Tray — 모드 간 산출물 인입 트레이의 순수 모델.
 *
 * 기획(초안)·3D(캡처)·생성(이미지) 모드에서 만든 산출물은 각 모드 안에 갇히면
 * 작가가 파일을 내려받아 다시 올리는 왕복을 하게 된다. 이 모델은 그 산출물들을
 * 에디터 안 "가져오기" 트레이 하나로 모아, 골라서 컷(페이지)에 배치하고,
 * 끝내 쓰지 않은 산출물은 정리할 수 있게 하는 계약이다(투닝 플러스 Editor의
 * 산출물 인입 구조를 ToonStudio 페이지/레이어 계약에 맞게 재구현).
 *
 * - 트레이는 불변 값이다. 모든 연산은 새 트레이를 반환하고, 실질 변화가 없으면
 *   원본 참조를 그대로 반환한다(studio-panel-shot-tags.withShotTag 와 동일 계약 —
 *   호출측이 `next !== tray` 로 커밋 여부를 판단할 수 있다).
 * - 산출물은 페이로드(이미지 src 또는 텍스트) 없이는 들어오지 않는다. 제목이
 *   비면 출처 기본 제목을 쓴다 — 없는 내용을 지어내지 않되, 목록에서 식별은
 *   가능해야 하기 때문이다.
 * - 배치(placement)는 페이지 id 를 산출물에 기록하는 것과, 호스트가 레이어로
 *   만들 수 있는 배치 지시(ArtifactCutPlacement)를 함께 돌려준다. 이미지 산출물은
 *   "image-layer", 텍스트 초안은 "text-note" 로 배치된다.
 * - 미사용 정리(prune)는 "한 번도 배치되지 않았고" 보관 기간이 지난 산출물만
 *   대상으로 한다. 배치된 산출물과 최근 산출물은 어떤 경우에도 지우지 않는다.
 *
 * 전부 불변 · 부수효과 없음. DOM/Konva/React 의존 없음.
 */

/** 산출물 출처 모드. */
export type ArtifactIntakeSource = "plan-draft" | "capture-3d" | "generated-image";

/** 산출물 페이로드 종류. */
export type ArtifactIntakeKind = "image" | "text";

export interface ArtifactIntakeItem {
  readonly id: string;
  readonly source: ArtifactIntakeSource;
  readonly kind: ArtifactIntakeKind;
  readonly title: string;
  /** ISO 8601 생성 시각. */
  readonly createdAt: string;
  /** 이미지 산출물의 미리보기/원본 src (kind === "image" 인 경우). */
  readonly previewSrc?: string;
  /** 텍스트 산출물의 본문 (kind === "text" 인 경우). */
  readonly text?: string;
  /** 출처 모드 안에서의 원본 식별자 — 같은 원본의 재인입 중복 판정에 쓴다. */
  readonly sourceRef?: string;
  /** 이 산출물이 배치된 컷(페이지) id 목록. 비어 있으면 미사용. */
  readonly placedPageIds: readonly string[];
}

export interface ArtifactIntakeTray {
  readonly items: readonly ArtifactIntakeItem[];
}

/** 호스트가 컷에 실제로 만들 배치 지시. */
export interface ArtifactCutPlacement {
  readonly artifactId: string;
  readonly pageId: string;
  readonly layerKind: "image-layer" | "text-note";
  readonly title: string;
  readonly src?: string;
  readonly text?: string;
}

export interface ArtifactIntakeCounts {
  readonly total: number;
  readonly unused: number;
  readonly placed: number;
  readonly bySource: Readonly<Record<ArtifactIntakeSource, number>>;
}

export type ArtifactIntakeUsageFilter = "all" | "unused" | "placed";

export interface ArtifactIntakeSelection {
  readonly source?: ArtifactIntakeSource | "all";
  readonly usage?: ArtifactIntakeUsageFilter;
  readonly query?: string;
}

export interface ArtifactPruneOptions {
  readonly now?: Date | string;
  /** 이 기간보다 오래된 미사용 산출물만 정리한다. 기본 7일. */
  readonly maxAgeMs?: number;
  /** 정리 대상에서 제외할 산출물 id (예: 방금 열어 본 항목). */
  readonly keepIds?: readonly string[];
}

export const ARTIFACT_INTAKE_MAX_ITEMS = 200;
export const ARTIFACT_INTAKE_UNUSED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const ARTIFACT_INTAKE_SOURCE_LABELS: Readonly<
  Record<ArtifactIntakeSource, string>
> = Object.freeze({
  "plan-draft": "기획 초안",
  "capture-3d": "3D 캡처",
  "generated-image": "생성 이미지",
});

const ARTIFACT_SOURCES: readonly ArtifactIntakeSource[] = [
  "plan-draft",
  "capture-3d",
  "generated-image",
] as const;

const SOURCE_SET: ReadonlySet<string> = new Set(ARTIFACT_SOURCES);

function isArtifactSource(value: unknown): value is ArtifactIntakeSource {
  return typeof value === "string" && SOURCE_SET.has(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toIso(value: unknown, fallback: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback;
}

function compareItems(a: ArtifactIntakeItem, b: ArtifactIntakeItem): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function freezeTray(items: readonly ArtifactIntakeItem[]): ArtifactIntakeTray {
  return Object.freeze({ items: Object.freeze([...items].sort(compareItems)) });
}

export const EMPTY_ARTIFACT_INTAKE_TRAY: ArtifactIntakeTray = freezeTray([]);

/**
 * 임의의 값을 트레이 항목으로 정규화한다. 페이로드(이미지 src/텍스트)가 없거나
 * 출처가 카탈로그 밖이면 null — 트레이에 빈 껍데기를 쌓지 않는다.
 */
export function normalizeArtifactIntakeItem(raw: unknown): ArtifactIntakeItem | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const source = record.source;
  if (!isArtifactSource(source)) return null;
  const previewSrc = cleanText(record.previewSrc) || undefined;
  const text = cleanText(record.text) || undefined;
  if (!previewSrc && !text) return null;
  const kind: ArtifactIntakeKind =
    record.kind === "text" || record.kind === "image"
      ? record.kind
      : previewSrc
        ? "image"
        : "text";
  // 종류와 페이로드가 어긋나면(예: text 인데 본문 없음) 있는 페이로드 쪽으로 맞춘다.
  const resolvedKind: ArtifactIntakeKind =
    kind === "text" && !text && previewSrc
      ? "image"
      : kind === "image" && !previewSrc && text
        ? "text"
        : kind;
  const id = cleanText(record.id);
  if (!id) return null;
  const placedRaw = Array.isArray(record.placedPageIds) ? record.placedPageIds : [];
  const placedPageIds = [...new Set(placedRaw.map(cleanText).filter(Boolean))];
  return Object.freeze({
    id,
    source,
    kind: resolvedKind,
    title: cleanText(record.title) || ARTIFACT_INTAKE_SOURCE_LABELS[source],
    createdAt: toIso(record.createdAt, new Date(0).toISOString()),
    ...(previewSrc ? { previewSrc } : {}),
    ...(text ? { text } : {}),
    ...(cleanText(record.sourceRef) ? { sourceRef: cleanText(record.sourceRef) } : {}),
    placedPageIds: Object.freeze(placedPageIds),
  });
}

/** 항목 목록으로 트레이를 만든다. id 중복은 먼저 들어온 항목이 이기고, 최신순 정렬·상한을 적용한다. */
export function createArtifactIntakeTray(
  items?: readonly unknown[],
): ArtifactIntakeTray {
  if (!items || items.length === 0) return EMPTY_ARTIFACT_INTAKE_TRAY;
  const seen = new Set<string>();
  const normalized: ArtifactIntakeItem[] = [];
  for (const raw of items) {
    const item = normalizeArtifactIntakeItem(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    normalized.push(item);
    if (normalized.length >= ARTIFACT_INTAKE_MAX_ITEMS) break;
  }
  if (normalized.length === 0) return EMPTY_ARTIFACT_INTAKE_TRAY;
  return freezeTray(normalized);
}

/** 저장된 값({items} 객체 또는 배열)을 트레이로 복원한다. 깨진 값은 빈 트레이. */
export function parseArtifactIntakeTray(raw: unknown): ArtifactIntakeTray {
  if (Array.isArray(raw)) return createArtifactIntakeTray(raw);
  if (raw && typeof raw === "object") {
    const items = (raw as Record<string, unknown>).items;
    if (Array.isArray(items)) return createArtifactIntakeTray(items);
  }
  return EMPTY_ARTIFACT_INTAKE_TRAY;
}

export interface ArtifactIntakeInput {
  readonly id: string;
  readonly source: ArtifactIntakeSource;
  readonly kind?: ArtifactIntakeKind;
  readonly title?: string;
  readonly createdAt?: Date | string;
  readonly previewSrc?: string;
  readonly text?: string;
  readonly sourceRef?: string;
}

/**
 * 산출물 하나를 트레이에 인입한다. 같은 id 거나 같은 (source, sourceRef) 가
 * 이미 있으면 중복으로 보고 원본 트레이 참조와 기존 항목을 돌려준다
 * (added: false) — 모드가 같은 산출물을 다시 내보내도 트레이가 부풀지 않는다.
 */
export function enqueueArtifact(
  tray: ArtifactIntakeTray,
  input: ArtifactIntakeInput,
  now: Date = new Date(),
): { readonly tray: ArtifactIntakeTray; readonly item: ArtifactIntakeItem | null; readonly added: boolean } {
  const item = normalizeArtifactIntakeItem({
    ...input,
    createdAt: input.createdAt ?? now,
  });
  if (!item) return { tray, item: null, added: false };
  const duplicate = tray.items.find(
    (existing) =>
      existing.id === item.id ||
      (item.sourceRef !== undefined &&
        existing.source === item.source &&
        existing.sourceRef === item.sourceRef),
  );
  if (duplicate) return { tray, item: duplicate, added: false };
  const items = [item, ...tray.items].slice(0, ARTIFACT_INTAKE_MAX_ITEMS);
  return { tray: freezeTray(items), item, added: true };
}

/** 여러 산출물을 한 번에 인입한다. 반환값은 실제로 추가된 항목들. */
export function enqueueArtifacts(
  tray: ArtifactIntakeTray,
  inputs: readonly ArtifactIntakeInput[],
  now: Date = new Date(),
): { readonly tray: ArtifactIntakeTray; readonly addedItems: readonly ArtifactIntakeItem[] } {
  let current = tray;
  const addedItems: ArtifactIntakeItem[] = [];
  for (const input of inputs) {
    const result = enqueueArtifact(current, input, now);
    current = result.tray;
    if (result.added && result.item) addedItems.push(result.item);
  }
  return { tray: current, addedItems };
}

/* ── 출처 모드별 인입 어댑터 ─────────────────────────────────────────────
 * 각 모드는 자기가 가진 최소 필드만 넘긴다. sourceRef 는 모드 접두를 붙여
 * 재인입 중복 판정이 모드를 넘어 섞이지 않게 한다. */

export interface PlanDraftArtifactSource {
  readonly id: string;
  readonly title?: string;
  readonly text: string;
  readonly createdAt?: Date | string;
}

export function artifactFromPlanDraft(draft: PlanDraftArtifactSource): ArtifactIntakeInput {
  return {
    id: `plan:${draft.id}`,
    source: "plan-draft",
    kind: "text",
    title: draft.title,
    text: draft.text,
    createdAt: draft.createdAt,
    sourceRef: `plan:${draft.id}`,
  };
}

export interface Capture3dArtifactSource {
  readonly id: string;
  readonly title?: string;
  /** 캡처 이미지 src (data URL 또는 저장된 URL). */
  readonly src: string;
  readonly createdAt?: Date | string;
}

export function artifactFromCapture3d(capture: Capture3dArtifactSource): ArtifactIntakeInput {
  return {
    id: `capture3d:${capture.id}`,
    source: "capture-3d",
    kind: "image",
    title: capture.title,
    previewSrc: capture.src,
    createdAt: capture.createdAt,
    sourceRef: `capture3d:${capture.id}`,
  };
}

export interface GeneratedImageArtifactSource {
  readonly id: string;
  readonly title?: string;
  /** 생성 결과 이미지 src. */
  readonly src: string;
  /** 생성 프롬프트 — 제목이 없을 때 식별용으로만 쓰고, 제목 자체를 지어내지 않는다. */
  readonly prompt?: string;
  readonly createdAt?: Date | string;
}

export function artifactFromGeneratedImage(image: GeneratedImageArtifactSource): ArtifactIntakeInput {
  return {
    id: `generated:${image.id}`,
    source: "generated-image",
    kind: "image",
    title: image.title ?? (image.prompt ? image.prompt.trim().slice(0, 60) : undefined),
    previewSrc: image.src,
    createdAt: image.createdAt,
    sourceRef: `generated:${image.id}`,
  };
}

/** 세 모드의 산출물을 한 번에 모아 트레이를 만든다(초기 인입·복원용). */
export function buildArtifactIntakeTrayFromSources(sources: {
  readonly planDrafts?: readonly PlanDraftArtifactSource[];
  readonly captures3d?: readonly Capture3dArtifactSource[];
  readonly generatedImages?: readonly GeneratedImageArtifactSource[];
}): ArtifactIntakeTray {
  const inputs: ArtifactIntakeInput[] = [
    ...(sources.planDrafts ?? []).map(artifactFromPlanDraft),
    ...(sources.captures3d ?? []).map(artifactFromCapture3d),
    ...(sources.generatedImages ?? []).map(artifactFromGeneratedImage),
  ];
  return enqueueArtifacts(EMPTY_ARTIFACT_INTAKE_TRAY, inputs).tray;
}

/* ── 조회 ─────────────────────────────────────────────────────────────── */

export function isArtifactPlacedOn(item: ArtifactIntakeItem, pageId: string): boolean {
  return item.placedPageIds.includes(pageId);
}

export function isArtifactUnused(item: ArtifactIntakeItem): boolean {
  return item.placedPageIds.length === 0;
}

export function selectArtifactIntakeItems(
  tray: ArtifactIntakeTray,
  selection: ArtifactIntakeSelection = {},
): ArtifactIntakeItem[] {
  const source = selection.source ?? "all";
  const usage = selection.usage ?? "all";
  const query = cleanText(selection.query).toLowerCase();
  return tray.items.filter((item) => {
    if (source !== "all" && item.source !== source) return false;
    if (usage === "unused" && !isArtifactUnused(item)) return false;
    if (usage === "placed" && isArtifactUnused(item)) return false;
    if (query) {
      const haystack = `${item.title} ${item.text ?? ""} ${ARTIFACT_INTAKE_SOURCE_LABELS[item.source]}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function countArtifactIntakeItems(tray: ArtifactIntakeTray): ArtifactIntakeCounts {
  const bySource: Record<ArtifactIntakeSource, number> = {
    "plan-draft": 0,
    "capture-3d": 0,
    "generated-image": 0,
  };
  let placed = 0;
  for (const item of tray.items) {
    bySource[item.source] += 1;
    if (!isArtifactUnused(item)) placed += 1;
  }
  return Object.freeze({
    total: tray.items.length,
    unused: tray.items.length - placed,
    placed,
    bySource: Object.freeze(bySource),
  });
}

/* ── 컷 배치 ──────────────────────────────────────────────────────────── */

/** 산출물을 컷에 배치할 때 호스트가 만들 레이어 지시. pageId 가 비면 null. */
export function buildArtifactCutPlacement(
  item: ArtifactIntakeItem,
  pageId: string,
): ArtifactCutPlacement | null {
  const target = cleanText(pageId);
  if (!target) return null;
  return Object.freeze(
    item.kind === "image"
      ? {
          artifactId: item.id,
          pageId: target,
          layerKind: "image-layer" as const,
          title: item.title,
          ...(item.previewSrc ? { src: item.previewSrc } : {}),
        }
      : {
          artifactId: item.id,
          pageId: target,
          layerKind: "text-note" as const,
          title: item.title,
          ...(item.text ? { text: item.text } : {}),
        },
  );
}

/**
 * 산출물을 컷에 배치한다. 이미 그 컷에 배치돼 있으면 트레이 참조는 그대로 두고
 * 배치 지시만 다시 돌려준다(호스트가 레이어 중복을 만들지 않게 재호출이 안전).
 * 없는 산출물이거나 pageId 가 비면 null.
 */
export function placeArtifactOnCut(
  tray: ArtifactIntakeTray,
  artifactId: string,
  pageId: string,
): { readonly tray: ArtifactIntakeTray; readonly placement: ArtifactCutPlacement } | null {
  const target = cleanText(pageId);
  if (!target) return null;
  const item = tray.items.find((candidate) => candidate.id === artifactId);
  if (!item) return null;
  const placement = buildArtifactCutPlacement(item, target);
  if (!placement) return null;
  if (isArtifactPlacedOn(item, target)) return { tray, placement };
  const nextItems = tray.items.map((candidate) =>
    candidate.id === item.id
      ? Object.freeze({
          ...candidate,
          placedPageIds: Object.freeze([...candidate.placedPageIds, target]),
        })
      : candidate,
  );
  return { tray: freezeTray(nextItems), placement };
}

/** 특정 컷에서만 배치를 뺀다. 다른 컷의 배치는 유지된다. 변화 없으면 원본 참조. */
export function removeArtifactPlacement(
  tray: ArtifactIntakeTray,
  artifactId: string,
  pageId: string,
): ArtifactIntakeTray {
  const item = tray.items.find((candidate) => candidate.id === artifactId);
  if (!item || !isArtifactPlacedOn(item, pageId)) return tray;
  const nextItems = tray.items.map((candidate) =>
    candidate.id === item.id
      ? Object.freeze({
          ...candidate,
          placedPageIds: Object.freeze(
            candidate.placedPageIds.filter((placed) => placed !== pageId),
          ),
        })
      : candidate,
  );
  return freezeTray(nextItems);
}

/* ── 정리 ─────────────────────────────────────────────────────────────── */

/**
 * 정리 대상 id 미리보기 — "한 번도 배치되지 않았고" 보관 기간이 지난 항목만.
 * 생성 시각을 해석할 수 없는 항목은 정리하지 않는다(모르는 것을 지우지 않음).
 */
export function unusedArtifactPruneCandidates(
  tray: ArtifactIntakeTray,
  options: ArtifactPruneOptions = {},
): string[] {
  const now = options.now ? new Date(options.now) : new Date();
  const maxAgeMs = options.maxAgeMs ?? ARTIFACT_INTAKE_UNUSED_MAX_AGE_MS;
  const cutoff = now.getTime() - maxAgeMs;
  const keep = new Set(options.keepIds ?? []);
  return tray.items
    .filter((item) => {
      if (!isArtifactUnused(item) || keep.has(item.id)) return false;
      const created = new Date(item.createdAt).getTime();
      return !Number.isNaN(created) && created <= cutoff;
    })
    .map((item) => item.id);
}

/** 미사용 산출물 정리. 배치된·최근 산출물은 남는다. */
export function pruneUnusedArtifacts(
  tray: ArtifactIntakeTray,
  options: ArtifactPruneOptions = {},
): { readonly tray: ArtifactIntakeTray; readonly removedIds: readonly string[] } {
  const removedIds = unusedArtifactPruneCandidates(tray, options);
  if (removedIds.length === 0) return { tray, removedIds };
  return { tray: discardArtifacts(tray, removedIds), removedIds };
}

/** 지정한 산출물들을 트레이에서 버린다. 하나도 없으면 원본 참조. */
export function discardArtifacts(
  tray: ArtifactIntakeTray,
  artifactIds: readonly string[],
): ArtifactIntakeTray {
  if (artifactIds.length === 0) return tray;
  const targets = new Set(artifactIds);
  const nextItems = tray.items.filter((item) => !targets.has(item.id));
  if (nextItems.length === tray.items.length) return tray;
  if (nextItems.length === 0) return EMPTY_ARTIFACT_INTAKE_TRAY;
  return freezeTray(nextItems);
}
