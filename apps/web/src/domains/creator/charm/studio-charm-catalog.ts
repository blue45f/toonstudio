/**
 * 참 ID → 화면·삽입 정보 해석기와 검색.
 *
 * 새 소재를 만들지 않는다. 이미 저장소에 있는 카탈로그(요소·효과/스티커/소품 SVG·이모지·내장 일러스트·
 * 효과음·말풍선·3D 삽입 카탈로그)와 내 소재 라이브러리를 읽어, 참이 그릴 모양과 눌렀을 때의 동작으로
 * 바꿔 줄 뿐이다. 원본 항목의 권리 정보(라이선스·AI 생성 여부)는 그대로 요약해 붙인다.
 */

import { resolveAssetUrl } from "@/shared/catalog/catalog-static";

import { STUDIO_RASTER_ASSETS, type StudioRasterAsset } from "../render/studio-raster-assets";
import { BUBBLE_VARIANTS, EFFECT_EMOJIS } from "../studio-assets";
import { listStudioElementLibrary, type StudioElementItem } from "../studio-elements-catalog";
import {
  listStudioObjectInsertItems,
  type StudioObjectInsertItem,
} from "../studio-object-insert-catalog";
import {
  STUDIO_CHARM_SECTIONS,
  type StudioCharmCatalogData,
  type StudioCharmDescriptor,
  type StudioCharmFxAsset,
  type StudioCharmLibraryAsset,
  type StudioCharmRights,
  type StudioCharmSection,
} from "./studio-charm-descriptor";
import {
  parseStudioCharmId,
  splitStudioCharmId,
  studioCharmEmojiFromRawId,
  studioCharmEmojiRawId,
  type StudioCharmId,
  type StudioCharmKind,
} from "./studio-charm-model";

import type { SfxPreset } from "../studio-sfx-presets";

/** `EFFECT_EMOJIS` 각 글리프의 한글 이름. 목록에 이모지가 늘면 시험이 이름 누락을 알려 준다. */
export const STUDIO_CHARM_EMOJI_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "💢": "분노 마크",
  "💦": "땀방울",
  "✨": "반짝",
  "💕": "하트",
  "💥": "충격",
  "😱": "비명",
  "🔥": "불꽃",
  "⚡": "번개",
  "😤": "씩씩",
  "💧": "눈물·물방울",
  "❗": "느낌표",
  "❓": "물음표",
  "💤": "졸음",
  "🎶": "음표",
  "👊": "주먹",
  "🌀": "소용돌이",
  "⭐": "별",
  "🌸": "벚꽃",
  "💬": "말풍선 기호",
  "🗯️": "외침 기호",
  "💭": "생각 기호",
  "☀️": "해",
  "🌙": "달",
  "💫": "어지러움",
  "💘": "하트 화살",
  "🎉": "폭죽",
  "📢": "확성기",
  "⚠️": "경고",
  "🔮": "수정구",
  "💡": "전구",
});

const ORIGINAL_VECTOR_RIGHTS: StudioCharmRights = Object.freeze({
  origin: "toonstudio-original",
  summary: "ToonStudio 가 코드로 직접 만든 내장 벡터입니다. 외부 소재를 쓰지 않았습니다.",
  licenseId: null,
  aiGenerated: false,
  attributionRequired: false,
});

/** 효과음은 그림이 아니라 글자 스타일 프리셋이다. 글자 모양은 편집기에 적용된 글꼴 설정을 따르므로 글꼴 쪽 조건은 단정하지 않는다. */
const SFX_PRESET_RIGHTS: StudioCharmRights = Object.freeze({
  origin: "toonstudio-original",
  summary: "ToonStudio 가 만든 효과음 글자 스타일 프리셋입니다. 글자 모양은 편집기에 적용된 글꼴 설정을 따릅니다.",
  licenseId: null,
  aiGenerated: false,
  attributionRequired: null,
});

const SYSTEM_GLYPH_RIGHTS: StudioCharmRights = Object.freeze({
  origin: "system-glyph",
  summary: "기기의 이모지 글꼴로 그려지는 글리프입니다. 별도 소재 파일이나 라이선스 항목이 없습니다.",
  licenseId: null,
  aiGenerated: false,
  attributionRequired: null,
});

const BUILTIN_3D_RIGHTS: StudioCharmRights = Object.freeze({
  origin: "toonstudio-3d",
  summary: "ToonStudio 내장 3D 도형·소품·씬 템플릿입니다. 3D 도구에서 열어 편집합니다.",
  licenseId: null,
  aiGenerated: false,
  attributionRequired: false,
});

const ELEMENT_SECTION: Readonly<Record<string, StudioCharmSection>> = Object.freeze({
  effect: "effect",
  sfx: "sfx",
});

const KIND_NEEDS_CATALOG_DATA: ReadonlySet<StudioCharmKind> = new Set<StudioCharmKind>(["fx", "sfx"]);

function tryId(kind: StudioCharmKind, rawId: string): StudioCharmId | null {
  return parseStudioCharmId(`${kind}:${rawId}`);
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

function elementDescriptor(item: StudioElementItem): StudioCharmDescriptor | null {
  const id = tryId("element", item.id);
  if (!id) return null;
  return {
    id,
    kind: "element",
    section: ELEMENT_SECTION[item.category] ?? "shape",
    label: item.label,
    keywords: [item.id, item.category, ...item.keywords],
    preview: { type: "svg", svg: item.svg },
    action: { type: "svg-image", svg: item.svg, width: item.width, height: item.height },
    rights: ORIGINAL_VECTOR_RIGHTS,
  };
}

function fxDescriptor(asset: StudioCharmFxAsset, section: StudioCharmSection): StudioCharmDescriptor | null {
  const id = tryId("fx", asset.id);
  if (!id) return null;
  return {
    id,
    kind: "fx",
    section,
    label: asset.label,
    keywords: [asset.id],
    preview: { type: "svg", svg: asset.svg },
    action: { type: "svg-image", svg: asset.svg, width: asset.width, height: asset.height },
    rights: ORIGINAL_VECTOR_RIGHTS,
  };
}

function emojiDescriptor(emoji: string): StudioCharmDescriptor | null {
  const raw = studioCharmEmojiRawId(emoji);
  const id = raw ? tryId("emoji", raw) : null;
  if (!id) return null;
  const label = STUDIO_CHARM_EMOJI_LABELS[emoji] ?? "이모지";
  return {
    id,
    kind: "emoji",
    section: "emoji",
    label,
    keywords: [emoji, "이모지", "스티커"],
    preview: { type: "emoji", emoji },
    action: { type: "emoji-sticker", emoji },
    rights: SYSTEM_GLYPH_RIGHTS,
  };
}

function rasterDescriptor(asset: StudioRasterAsset): StudioCharmDescriptor | null {
  const id = tryId("raster", asset.id);
  if (!id) return null;
  return {
    id,
    kind: "raster",
    section: "illustration",
    label: asset.label,
    keywords: [asset.id, asset.collection, asset.description, ...asset.tags],
    preview: { type: "image", src: resolveAssetUrl(asset.src) },
    action: { type: "raster-asset", asset },
    rights: {
      origin: "builtin-ai-raster",
      summary: `내장 AI 생성 일러스트 · 프로젝트 내부 사용 라이선스(${asset.license.licenseRef})`,
      licenseId: asset.license.licenseRef,
      aiGenerated: asset.provenance.origin === "ai-generated",
      attributionRequired: asset.license.attributionRequired,
    },
  };
}

function libraryDescriptor(asset: StudioCharmLibraryAsset): StudioCharmDescriptor | null {
  const id = tryId("library", asset.id);
  if (!id) return null;
  const rights = asset.rights;
  const aiGenerated = asset.kind === "ai" || rights?.sourceKind === "ai-generated";
  return {
    id,
    kind: "library",
    section: "mine",
    label: asset.name,
    keywords: [asset.id, asset.name, "내 소재", "라이브러리"],
    preview: { type: "image", src: asset.dataUrl },
    action: { type: "library-image", dataUrl: asset.dataUrl, width: asset.width, height: asset.height },
    rights: rights
      ? {
        origin: "user-library",
        summary: `내 소재 · ${rights.licenseLabel}${rights.rightsConfirmed ? "" : " (권리 확인 전)"}`,
        licenseId: rights.licenseId,
        aiGenerated,
        attributionRequired: rights.attributionRequired,
      }
      : {
        origin: "user-library",
        summary: "권리 정보가 기록되지 않은 내 소재입니다. 사용 전에 출처와 사용권을 확인하세요.",
        licenseId: null,
        aiGenerated,
        attributionRequired: null,
      },
  };
}

function sfxDescriptor(preset: SfxPreset): StudioCharmDescriptor | null {
  const id = tryId("sfx", preset.id);
  if (!id) return null;
  return {
    id,
    kind: "sfx",
    section: "sfx",
    label: preset.label,
    keywords: [preset.id, preset.text, preset.category, ...(preset.keywords ?? [])],
    preview: { type: "text", text: preset.text },
    action: { type: "sfx-text", preset },
    rights: SFX_PRESET_RIGHTS,
  };
}

function bubbleDescriptors(): StudioCharmDescriptor[] {
  const out: StudioCharmDescriptor[] = [];
  for (const variant of BUBBLE_VARIANTS) {
    const id = tryId("bubble", variant.id);
    if (!id) continue;
    out.push({
      id,
      kind: "bubble",
      section: "bubble",
      label: `말풍선 · ${variant.label}`,
      keywords: [variant.id, variant.hint, "말풍선", "대사"],
      preview: { type: "icon", icon: "bubble" },
      action: { type: "native-bubble", variant: variant.id },
      rights: ORIGINAL_VECTOR_RIGHTS,
    });
  }
  return out;
}

function objectDescriptor(item: StudioObjectInsertItem): StudioCharmDescriptor | null {
  const id = tryId("object", item.id);
  if (!id) return null;
  return {
    id,
    kind: "object",
    section: "object3d",
    label: item.label,
    keywords: [item.id, item.sourceId, item.familyLabel, ...item.keywords],
    preview: { type: "icon", icon: "object3d" },
    action: {
      type: "open-3d",
      itemId: item.id,
      openTarget: item.openTarget,
      sourceId: item.sourceId,
      width: item.defaultWidth,
      height: item.defaultHeight,
    },
    rights: BUILTIN_3D_RIGHTS,
  };
}

/** 참이 해석되지 못한 이유. 지연 데이터를 기다리는 중과 원본이 사라진 경우를 구분한다. */
export type StudioCharmResolution =
  | { readonly status: "ready"; readonly descriptor: StudioCharmDescriptor }
  | { readonly status: "pending" }
  | { readonly status: "missing" };

export interface StudioCharmSearchInput {
  readonly query?: string;
  readonly section?: StudioCharmSection | "all";
  readonly limit?: number;
}

export interface StudioCharmCatalog {
  /** 선택기에 보일 전체 항목(분류 순서 → 원본 순서). */
  readonly descriptors: readonly StudioCharmDescriptor[];
  readonly sectionCounts: Readonly<Record<StudioCharmSection, number>>;
  resolve(id: StudioCharmId): StudioCharmResolution;
  search(input: StudioCharmSearchInput): readonly StudioCharmDescriptor[];
}

export interface BuildStudioCharmCatalogInput {
  /** 지연 데이터가 아직 오지 않았으면 null. 효과·스티커·소품·효과음 참은 `pending` 으로 남는다. */
  readonly data: StudioCharmCatalogData | null;
  readonly library: readonly StudioCharmLibraryAsset[];
  /** 내 소재 목록을 아직 읽는 중이면 false. 이 동안 내 소재 참은 `pending` 이다. */
  readonly libraryReady: boolean;
}

const DEFAULT_SEARCH_LIMIT = 200;

export function buildStudioCharmCatalog(input: BuildStudioCharmCatalogInput): StudioCharmCatalog {
  const { data, library, libraryReady } = input;
  const bySection = new Map<StudioCharmSection, StudioCharmDescriptor[]>(
    STUDIO_CHARM_SECTIONS.map((section) => [section, []]),
  );
  const push = (descriptor: StudioCharmDescriptor | null): void => {
    if (descriptor) bySection.get(descriptor.section)?.push(descriptor);
  };

  if (data) {
    for (const asset of data.fxOverlays) push(fxDescriptor(asset, "effect"));
    for (const asset of data.comicStickers) push(fxDescriptor(asset, "sticker"));
    for (const asset of data.creatureStickers) push(fxDescriptor(asset, "sticker"));
    for (const asset of data.propStickers) push(fxDescriptor(asset, "prop"));
    for (const preset of data.sfxPresets) push(sfxDescriptor(preset));
  }
  for (const emoji of EFFECT_EMOJIS) push(emojiDescriptor(emoji));
  for (const item of listStudioElementLibrary()) push(elementDescriptor(item));
  for (const asset of STUDIO_RASTER_ASSETS) push(rasterDescriptor(asset));
  for (const asset of library) push(libraryDescriptor(asset));
  for (const descriptor of bubbleDescriptors()) push(descriptor);
  for (const item of listStudioObjectInsertItems()) push(objectDescriptor(item));

  const descriptors: StudioCharmDescriptor[] = [];
  const counts: Record<StudioCharmSection, number> = {
    effect: 0,
    sticker: 0,
    prop: 0,
    emoji: 0,
    sfx: 0,
    shape: 0,
    illustration: 0,
    mine: 0,
    bubble: 0,
    object3d: 0,
  };
  for (const section of STUDIO_CHARM_SECTIONS) {
    const items = bySection.get(section) ?? [];
    counts[section] = items.length;
    descriptors.push(...items);
  }

  const byId = new Map<StudioCharmId, StudioCharmDescriptor>();
  const haystacks = new Map<StudioCharmDescriptor, string>();
  for (const descriptor of descriptors) {
    if (!byId.has(descriptor.id)) byId.set(descriptor.id, descriptor);
    haystacks.set(
      descriptor,
      normalizeText([descriptor.label, descriptor.id, ...descriptor.keywords].join(" ")),
    );
  }

  const resolve = (id: StudioCharmId): StudioCharmResolution => {
    const found = byId.get(id);
    if (found) return { status: "ready", descriptor: found };
    const { kind } = splitStudioCharmId(id);
    if (KIND_NEEDS_CATALOG_DATA.has(kind) && !data) return { status: "pending" };
    if (kind === "library" && !libraryReady) return { status: "pending" };
    return { status: "missing" };
  };

  const search = ({
    query = "",
    section = "all",
    limit = DEFAULT_SEARCH_LIMIT,
  }: StudioCharmSearchInput): readonly StudioCharmDescriptor[] => {
    const tokens = normalizeText(query).split(/\s+/u).filter(Boolean);
    const cap = Math.max(1, Math.min(2_000, Math.trunc(Number.isFinite(limit) ? limit : DEFAULT_SEARCH_LIMIT)));
    const out: StudioCharmDescriptor[] = [];
    for (const descriptor of descriptors) {
      if (section !== "all" && descriptor.section !== section) continue;
      const haystack = haystacks.get(descriptor) ?? "";
      if (!tokens.every((token) => haystack.includes(token))) continue;
      out.push(descriptor);
      if (out.length >= cap) break;
    }
    return out;
  };

  return Object.freeze({
    descriptors: Object.freeze(descriptors),
    sectionCounts: Object.freeze(counts),
    resolve,
    search,
  });
}

/** 이모지 참 ID 에서 글리프를 복원한다(드래그·선택기에서 사용). */
export function studioCharmEmojiOfId(id: StudioCharmId): string | null {
  const { kind, rawId } = splitStudioCharmId(id);
  return kind === "emoji" ? studioCharmEmojiFromRawId(rawId) : null;
}
