/**
 * 3D 소재 라이브러리 항목의 권리 보기 모델 — 카드의 권리 요약과 권리 필터가 같은 값을 읽게 하는 순수 모듈.
 *
 * 항목마다 권리 사실을 세 곳에서 모은다.
 * - 번들 소재: 배포 카탈로그의 출처 기록(provenance).
 * - 가져온 소재: 라이브러리 레코드의 권리(`rights`). 장면에 붙는 첨부 권리가 여기서 온다.
 * - 메타데이터 저장소 기록(V3): AI 표기·제공처·작성자·확인일처럼 라이브러리 레코드에 없는 항목을 덧붙인다.
 *
 * 라이브러리와 메타데이터가 같은 칸(권리 상태·상업 사용)을 다르게 말하면 **더 제한적인 쪽**을 쓴다(미확인이 가장 제한적).
 * 어느 쪽도 다른 쪽의 허용을 늘리지 못하고, 어긋났다는 사실(conflict)은 화면에 알린다.
 *
 * 사실을 하나의 정규화된 메타데이터 기록으로 만든 뒤 그 기록에서 상태를 읽으므로, 카드에 보이는 값과 필터가
 * 쓰는 값은 구조적으로 같다. 어디에서도 알 수 없으면 "미확인"이며, 미확인이 허용으로 읽히는 길은 없다.
 * 기록은 상태(권리 상태·상업 사용·AI 표기)만 담는다. 라이선스 이름·제공처·작성자 같은 글은 라이브러리가 받아들이는 글자
 * (`<`·`>`·주소·보이지 않는 글자 등)를 메타데이터 저장 규칙이 거절할 수 있어, 상태 판정에 끼지 않게 화면용 글로 따로 다룬다.
 * 이 모듈은 기록된 표기를 보여 줄 뿐 법률 자문이 아니다.
 */

import {
  STUDIO_BG3D_ASSET_METADATA_LIMITS,
  STUDIO_BG3D_ASSET_METADATA_VERSION,
  normalizeStudioBg3dAssetMetadata,
} from "./studio-bg3d-asset-metadata";
import {
  UNKNOWN_STUDIO_BG3D_ASSET_RIGHTS_STATE,
  hasActiveStudioBg3dAssetRightsFacets,
  queryStudioBg3dAssetRights,
  readStudioBg3dAssetRightsState,
  studioBg3dAssetRightsFacetsAdmitUnknown,
} from "./studio-bg3d-asset-rights-facets";
import { STUDIO_BG3D_IMPORT_LICENSE_PLACEHOLDER } from "./studio-bg3d-import-rights-receipt";

import type { Bg3dModelLibraryEntry } from "./bg3d-model-library";
import type {
  StudioBg3dAssetAiGenerated,
  StudioBg3dAssetAiTraining,
  StudioBg3dAssetMetadata,
  StudioBg3dAssetRightsStatus,
} from "./studio-bg3d-asset-metadata";
import type { StudioBg3dAssetRightsFacets, StudioBg3dAssetRightsState } from "./studio-bg3d-asset-rights-facets";
import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document-types";

/** 소재가 라이브러리에 들어온 길. 기본 제공(배포 카탈로그) 또는 사용자가 가져온 파일. */
export type StudioBg3dAssetOrigin = "bundled" | "imported";
export type StudioBg3dAssetAttribution = "required" | "not-required" | "unknown";
/** 권리 사실을 어디서 읽었는가. entry-only 는 어디서도 읽지 못해 목록 항목만 있는 상태다. */
export type StudioBg3dAssetRightsBasis = "catalog" | "library" | "metadata" | "entry-only";

/** 카드 필터가 들고 있는 선택. 권리 패싯에 출처를 더한 것이다. */
export interface StudioBg3dAssetRightsFilter extends StudioBg3dAssetRightsFacets {
  readonly origin?: readonly StudioBg3dAssetOrigin[];
}

/** 번들 카탈로그 출처 기록 중 이 모듈이 읽는 필드. 카탈로그 모듈에 직접 의존하지 않도록 구조 타입으로 받는다. */
export interface StudioBg3dBundledProvenanceLike {
  readonly origin: string;
  readonly license: string;
  readonly commercialUse: boolean;
  readonly attributionRequired: boolean;
  readonly provider?: string;
  readonly author?: string;
}

export interface StudioBg3dAssetRightsSources {
  /** 라이브러리 레코드의 권리. 키는 라이브러리 행 ID. */
  readonly libraryRightsById?: ReadonlyMap<string, StudioBg3dAttachmentRights>;
  /** 메타데이터 저장소 기록. 키는 정규화된 콘텐츠 해시. */
  readonly metadataByHash?: ReadonlyMap<string, StudioBg3dAssetMetadata>;
  /** 번들 소재의 출처 기록. 번들이 아니거나 기록이 없으면 undefined. */
  readonly provenanceOf?: (entryId: string) => StudioBg3dBundledProvenanceLike | undefined;
}

export interface StudioBg3dAssetRightsView {
  readonly entryId: string;
  readonly origin: StudioBg3dAssetOrigin;
  readonly basis: StudioBg3dAssetRightsBasis;
  readonly state: StudioBg3dAssetRightsState;
  readonly attribution: StudioBg3dAssetAttribution;
  /** 출처 표기 문구. 표기가 필요하다고 기록된 경우에만 있다. */
  readonly attributionText: string | null;
  readonly licenseName: string | null;
  readonly provider: string | null;
  readonly author: string | null;
  /** 구매·내려받은 날짜(YYYY-MM-DD). */
  readonly acquiredOn: string | null;
  /** 라이브러리 기록과 메타데이터 기록이 권리 상태·상업 사용을 다르게 말해 더 제한적인 쪽을 쓴 경우. */
  readonly conflict: boolean;
  /** 질의에 쓰는 정규화 기록(상태만 담는다). 콘텐츠 해시가 없는 항목은 null 이다. */
  readonly record: StudioBg3dAssetMetadata | null;
}

type EntryLike = Pick<
  Bg3dModelLibraryEntry,
  "id" | "name" | "format" | "source" | "createdAt" | "updatedAt" | "contentHash" | "byteSize"
>;

interface RightsFacts {
  readonly basis: StudioBg3dAssetRightsBasis;
  readonly status: StudioBg3dAssetRightsStatus;
  readonly commercialUse: boolean;
  readonly attributionRequired: boolean | null;
  readonly attributionText: string | null;
  readonly licenseName: string | null;
  readonly provider: string | null;
  readonly author: string | null;
  readonly acquiredOn: string | null;
  readonly aiGenerated: StudioBg3dAssetAiGenerated | null;
  readonly aiTraining: StudioBg3dAssetAiTraining | null;
  readonly conflict: boolean;
}

const FALLBACK_NAME = "3D 모델";

const NO_FACTS: RightsFacts = Object.freeze({
  basis: "entry-only",
  status: "unknown",
  commercialUse: false,
  attributionRequired: null,
  attributionText: null,
  licenseName: null,
  provider: null,
  author: null,
  acquiredOn: null,
  aiGenerated: null,
  aiTraining: null,
  conflict: false,
});

function bundledFacts(provenance: StudioBg3dBundledProvenanceLike): RightsFacts {
  const publicDomain = provenance.license === "CC0-1.0";
  const origin = String(provenance.origin);
  return {
    basis: "catalog",
    status: publicDomain ? "public-domain" : "licensed",
    // 허용이라고 적힌 경우만 허용이다. 값이 없거나 불리언이 아니면 허용으로 읽지 않는다.
    commercialUse: provenance.commercialUse === true,
    // 불리언으로 적힌 경우만 안다(true 필요, false 불필요). 그 밖에는 미확인이다.
    attributionRequired: typeof provenance.attributionRequired === "boolean" ? provenance.attributionRequired : null,
    attributionText: null,
    licenseName: publicDomain ? "CC0 1.0" : provenance.license,
    provider: provenance.provider ?? null,
    author: provenance.author ?? null,
    acquiredOn: null,
    // 카탈로그가 만든 방식을 밝힌 경우만 안다. 모르는 방식은 미확인으로 둔다.
    aiGenerated: origin.startsWith("ai-generated") ? "yes" : origin.startsWith("original-") ? "no" : null,
    aiTraining: null,
    conflict: false,
  };
}

/** 값이 클수록 제한적이다. 미확인이 가장 제한적이고, 공개 이용이 가장 덜 제한적이다. */
const STATUS_RESTRICTIVENESS: Readonly<Record<StudioBg3dAssetRightsStatus, number>> = {
  "public-domain": 0,
  owned: 1,
  licensed: 2,
  unknown: 3,
};

function importedFacts(
  library: StudioBg3dAttachmentRights | undefined,
  metadata: StudioBg3dAssetMetadata | undefined,
): RightsFacts {
  const extras = metadata?.rights;
  const overlay = {
    provider: extras?.provider ?? null,
    author: extras?.author ?? null,
    acquiredOn: extras?.purchaseOrDownloadDate ?? null,
    aiGenerated: extras?.aiGenerated ?? null,
    aiTraining: extras?.aiTraining ?? null,
  };
  if (library) {
    // 두 기록이 모두 있으면 더 제한적인 쪽을 쓴다: 권리 상태는 더 제한적인 값, 상업 사용은 둘 다 허용일 때만 허용.
    const status = !extras || STATUS_RESTRICTIVENESS[library.status] >= STATUS_RESTRICTIVENESS[extras.status]
      ? library.status
      : extras.status;
    const commercialUse = library.commercialUse && (extras?.commercialUse ?? true);
    const conflict = extras !== undefined
      && (extras.status !== library.status
        || (library.status !== "unknown" && extras.commercialUse !== library.commercialUse));
    return {
      ...overlay,
      basis: "library",
      status,
      commercialUse,
      // 라이브러리 레코드가 권리 상태를 알고(폼에서 골랐고) 그 답이 최종 판정에 쓰였을 때만 표기 필요 여부도 폼의 답이다: true 필요,
      // false 불필요. 권리 상태를 모르는(기본값) 레코드이거나, 메타데이터의 더 제한적인 상태가 이겨 폼의 답이 다른 상태에 대한 것이
      // 된 경우에는 표기 여부도 모른다.
      attributionRequired: status === "unknown" || status !== library.status ? null : library.attributionRequired,
      attributionText: library.attribution ?? null,
      licenseName: library.licenseName ?? extras?.license ?? null,
      conflict,
    };
  }
  if (extras) {
    return {
      ...overlay,
      basis: "metadata",
      status: extras.status,
      commercialUse: extras.commercialUse,
      attributionRequired: null,
      attributionText: null,
      licenseName: extras.license ?? null,
      conflict: false,
    };
  }
  return NO_FACTS;
}

const DISPLAY_TEXT_MAX_CODE_POINTS = 160;

// 메타데이터 저장 규칙이 거절하는 제어·보이지 않는 글자와 같은 범위다. 글자를 가려 속일 수 있어 화면용 글에서 뺀다.
function isInvisibleOrControl(codePoint: number): boolean {
  return codePoint <= 0x1f
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || (codePoint >= 0x200b && codePoint <= 0x200f)
    || (codePoint >= 0x202a && codePoint <= 0x202e)
    || codePoint === 0x2060
    || (codePoint >= 0x2066 && codePoint <= 0x2069)
    || codePoint === 0xfeff;
}

/**
 * 화면에 보일 사용자 입력 글. 라이브러리가 받아들인 글이라 `<`·`>`·주소는 그대로 두고(React 가 글로만 그린다),
 * 보이지 않는 글자만 빼고 공백을 정리한다(줄바꿈·탭은 공백으로 바꾼다). 비면 null.
 */
function displayText(value: string | null | undefined): string | null {
  if (!value) return null;
  let visible = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= 0x09 && codePoint <= 0x0d) visible += " ";
    else if (!isInvisibleOrControl(codePoint)) visible += character;
  }
  const cleaned = visible.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!cleaned) return null;
  return Array.from(cleaned).slice(0, DISPLAY_TEXT_MAX_CODE_POINTS).join("");
}

function safeTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function recordFor(entry: EntryLike, facts: RightsFacts): StudioBg3dAssetMetadata | null {
  if (!entry.contentHash) return null;
  const known = facts.status !== "unknown";
  // 상태만 담는다. 구매·허가는 저장 규칙상 이름이 필수라 자리표시 이름을 적는다(표시에는 쓰이지 않는다).
  const rights = {
    status: facts.status,
    commercialUse: known && facts.commercialUse,
    teamShareAllowed: false,
    ...(facts.status === "licensed" ? { license: STUDIO_BG3D_IMPORT_LICENSE_PLACEHOLDER } : {}),
    ...(facts.aiGenerated ? { aiGenerated: facts.aiGenerated } : {}),
    ...(facts.aiTraining ? { aiTraining: facts.aiTraining } : {}),
  };
  const createdAt = safeTimestamp(entry.createdAt);
  const updatedAt = Math.max(createdAt, safeTimestamp(entry.updatedAt));
  const byteSize = typeof entry.byteSize === "number" && Number.isSafeInteger(entry.byteSize) && entry.byteSize >= 0
    ? Math.min(entry.byteSize, STUDIO_BG3D_ASSET_METADATA_LIMITS.bytes)
    : 0;
  const build = (name: string) => normalizeStudioBg3dAssetMetadata({
    version: STUDIO_BG3D_ASSET_METADATA_VERSION,
    contentHash: entry.contentHash,
    name,
    format: entry.format,
    createdAt,
    updatedAt,
    byteSize,
    triangles: null,
    textures: null,
    favorite: false,
    collections: [],
    tags: [],
    rights,
  });
  // 이름은 파일에서 왔다. 저장 규칙(마크업·URL 금지 등)에 걸리면 일반 이름으로 다시 만든다.
  return build(entry.name) ?? build(FALLBACK_NAME);
}

/** 항목 하나의 권리 보기. 정보가 없으면 모든 칸이 미확인이다. */
export function buildStudioBg3dAssetRightsView(
  entry: EntryLike,
  sources: StudioBg3dAssetRightsSources = {},
): StudioBg3dAssetRightsView {
  const origin: StudioBg3dAssetOrigin = entry.source === "sample" ? "bundled" : "imported";
  const provenance = origin === "bundled" ? sources.provenanceOf?.(entry.id) : undefined;
  const metadata = entry.contentHash ? sources.metadataByHash?.get(entry.contentHash) : undefined;
  const facts = origin === "bundled"
    ? (provenance ? bundledFacts(provenance) : NO_FACTS)
    : importedFacts(sources.libraryRightsById?.get(entry.id), metadata);

  const record = recordFor(entry, facts);
  const state = record ? readStudioBg3dAssetRightsState(record.rights) : UNKNOWN_STUDIO_BG3D_ASSET_RIGHTS_STATE;
  const known = state.license !== "unknown";
  return Object.freeze({
    entryId: entry.id,
    origin,
    basis: facts.basis,
    state,
    attribution: !known || facts.attributionRequired === null
      ? "unknown"
      : facts.attributionRequired ? "required" : "not-required",
    attributionText: known && facts.attributionRequired ? displayText(facts.attributionText) : null,
    licenseName: displayText(facts.licenseName),
    provider: displayText(facts.provider),
    author: displayText(facts.author),
    acquiredOn: displayText(facts.acquiredOn),
    conflict: facts.conflict,
    record,
  });
}

export function buildStudioBg3dAssetRightsViews(
  entries: readonly EntryLike[],
  sources: StudioBg3dAssetRightsSources = {},
): ReadonlyMap<string, StudioBg3dAssetRightsView> {
  return new Map(entries.map((entry) => [entry.id, buildStudioBg3dAssetRightsView(entry, sources)] as const));
}

export function hasActiveStudioBg3dAssetRightsFilter(filter: StudioBg3dAssetRightsFilter | undefined): boolean {
  return hasActiveStudioBg3dAssetRightsFacets(filter) || (filter?.origin?.length ?? 0) > 0;
}

/**
 * 권리 필터를 목록에 적용한다. 켜진 필터가 없으면 입력 목록을 그대로 돌려주어 목록이 사라지지 않는다.
 * 권리 패싯은 `queryStudioBg3dAssetRights` 로 판정하고, 해시가 없어 기록을 만들 수 없는 항목은 모든 칸이
 * 미확인인 항목으로 취급한다.
 */
export function filterStudioBg3dAssetRightsEntries<T extends EntryLike>(
  entries: readonly T[],
  views: ReadonlyMap<string, StudioBg3dAssetRightsView>,
  filter: StudioBg3dAssetRightsFilter | undefined,
): readonly T[] {
  if (!hasActiveStudioBg3dAssetRightsFilter(filter)) return entries;

  const originFiltered = (filter?.origin?.length ?? 0) > 0
    ? entries.filter((entry) => filter?.origin?.includes(views.get(entry.id)?.origin ?? (entry.source === "sample" ? "bundled" : "imported")))
    : entries;
  if (!hasActiveStudioBg3dAssetRightsFacets(filter)) return originFiltered;

  const records = originFiltered.flatMap((entry) => {
    const record = views.get(entry.id)?.record;
    return record ? [record] : [];
  });
  // 출처(origin)는 메타데이터 기록의 속성이 아니라 위에서 이미 걸렀다. 권리 패싯만 질의에 넘긴다.
  const rights: StudioBg3dAssetRightsFacets = {
    license: filter?.license,
    commercial: filter?.commercial,
    aiGenerated: filter?.aiGenerated,
    aiTraining: filter?.aiTraining,
  };
  // 질의 한 번이 받는 기록 수에는 상한이 있다. 넘으면 질의가 통째로 빈 결과가 되므로 상한 크기로 나눠 묻고 합친다.
  const matched = new Set<string>();
  const page = STUDIO_BG3D_ASSET_METADATA_LIMITS.assetsPerQuery;
  for (let start = 0; start < records.length; start += page) {
    for (const { contentHash } of queryStudioBg3dAssetRights(records.slice(start, start + page), { rights })) {
      matched.add(contentHash);
    }
  }
  const admitUnknown = studioBg3dAssetRightsFacetsAdmitUnknown(rights);
  return originFiltered.filter((entry) => {
    const record = views.get(entry.id)?.record;
    return record ? matched.has(record.contentHash) : admitUnknown;
  });
}

export interface StudioBg3dAssetRightsCounts {
  readonly origin: Readonly<Record<StudioBg3dAssetOrigin, number>>;
  readonly license: Readonly<Record<StudioBg3dAssetRightsStatus, number>>;
  readonly commercial: Readonly<Record<StudioBg3dAssetRightsState["commercial"], number>>;
  readonly aiGenerated: Readonly<Record<StudioBg3dAssetRightsState["aiGenerated"], number>>;
  readonly aiTraining: Readonly<Record<StudioBg3dAssetRightsState["aiTraining"], number>>;
}

/** 칩에 붙일 개수. 다른 필터와 무관하게 전체 목록에서 값별로 센다. */
export function countStudioBg3dAssetRightsValues(
  entries: readonly EntryLike[],
  views: ReadonlyMap<string, StudioBg3dAssetRightsView>,
): StudioBg3dAssetRightsCounts {
  const counts = {
    origin: { bundled: 0, imported: 0 },
    license: { owned: 0, licensed: 0, "public-domain": 0, unknown: 0 },
    commercial: { allowed: 0, unknown: 0 },
    aiGenerated: { yes: 0, no: 0, unknown: 0 },
    aiTraining: { allowed: 0, prohibited: 0, unknown: 0 },
  };
  for (const entry of entries) {
    const view = views.get(entry.id) ?? buildStudioBg3dAssetRightsView(entry);
    counts.origin[view.origin] += 1;
    counts.license[view.state.license] += 1;
    counts.commercial[view.state.commercial] += 1;
    counts.aiGenerated[view.state.aiGenerated] += 1;
    counts.aiTraining[view.state.aiTraining] += 1;
  }
  return counts;
}
