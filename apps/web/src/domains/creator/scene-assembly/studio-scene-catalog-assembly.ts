/**
 * Studio Scene Catalog Assembly — 슬롯 문서 × 우리 자산 카탈로그 → 장면 초안.
 *
 * 문장→장면 조립 계약(studio-scene-slot-contract)의 실행 절반이다. 슬롯의
 * 쿼리·키워드로 자산 카탈로그를 lexical 검색+재랭킹해(바이브 투닝 파이프라인의
 * "자산군별 검색 → 후보 수집 → 재랭킹" 단계에 해당) 슬롯별 1순위 자산을 확정하고,
 * 빈 캔버스에 바로 얹을 수 있는 장면 초안을 만든다.
 *
 * 카탈로그는 이 모듈의 최소 진입 형태(StudioSceneCatalogEntry)로 어댑트해서
 * 넣는다 — 통합 카탈로그(StudioUnifiedAssetItem)·일러스트 배경 메타·번들
 * 래스터 에셋·캐릭터 계약(CharacterAsset)·로컬 에셋(StudioAsset) 어댑터를
 * 함께 제공한다. 새 카탈로그가 생겨도 어댑터만 추가하면 된다.
 *
 * 산출은 호스트가 그대로 El로 바꿀 수 있는 두 묶음이다:
 *  - seeds: SceneSeed[](studio-scene-templates의 정본 시드 — 프레임·말풍선·
 *    나레이션 박스·효과음 텍스트). 배경 이미지는 일러스트 템플릿 규약대로
 *    프레임 seed의 bg에 실린다.
 *  - images: 캐릭터·소품 이미지 배치(ImageEl 재료). svg 자산은 svg 필드로
 *    넘기고 data URL 변환은 호스트의 svgToDataUrl 몫으로 남긴다(코어에
 *    브라우저 의존성을 들이지 않기 위해).
 * 매칭 실패는 지어내지 않는다: unmatched에 쿼리와 이유가 남고, 말풍선은
 * 슬롯 위치만으로라도 배치돼 초안의 골격은 유지된다.
 *
 * 전부 순수·결정적. 동률은 featured 우선 → id 사전순으로 고정한다.
 */

import type { Studio2dAssetMetadata } from "../studio-2d-asset-quality";
import type { CharacterAsset } from "../studio-characters";
import type { SceneSeed } from "../studio-scene-templates";
import type { StudioRasterAsset } from "../render/studio-raster-assets";
import type { StudioAsset } from "../studio-asset-library";
import type { StudioUnifiedAssetItem } from "../studio-unified-asset-catalog";
import type {
  StudioSceneCharacterSlot,
  StudioSceneSlotDocument,
} from "./studio-scene-slot-contract";

// ---------------------------------------------------------------------------
// 카탈로그 진입 형태 + 어댑터
// ---------------------------------------------------------------------------

export type StudioSceneCatalogKind = "background" | "character" | "prop" | "effect";

export interface StudioSceneCatalogEntry {
  readonly id: string;
  readonly kind: StudioSceneCatalogKind;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly description?: string;
  /** 이미지 자산 경로(data URL 포함). svg와 동시 존재 시 src 우선. */
  readonly src?: string;
  /** 독립 실행 SVG 마크업(요소 카탈로그·캐릭터 표정). */
  readonly svg?: string;
  readonly width: number;
  readonly height: number;
  readonly timeOfDay?: "낮" | "노을" | "밤";
  readonly environment?: "실내" | "실외";
  readonly featured?: boolean;
}

/** 통합 카탈로그 항목 어댑터. 장면 템플릿·3D 오브젝트·네이티브 도구는 슬롯 자산이 아니라 null. */
export function adaptUnifiedAssetToSceneCatalog(
  item: StudioUnifiedAssetItem
): StudioSceneCatalogEntry | null {
  const base = {
    id: item.id,
    title: item.title,
    keywords: [...item.keywords, item.title],
    description: item.description,
    featured: item.discoverability === "featured",
  };
  switch (item.source.kind) {
    case "background": {
      const value = item.source.value;
      return {
        ...base,
        kind: "background",
        ...(value.imgSrc ? { src: value.imgSrc } : {}),
        ...(value.svg ? { svg: value.svg } : {}),
        width: value.width ?? 1600,
        height: value.height ?? 1000,
      };
    }
    case "builtin-raster": {
      const value = item.source.value;
      return {
        ...base,
        kind: value.kind === "effect-overlay" ? "effect" : "prop",
        src: value.src,
        keywords: [...value.tags, value.label],
        width: value.width,
        height: value.height,
      };
    }
    case "element": {
      const value = item.source.value;
      return {
        ...base,
        kind:
          value.category === "sfx" || value.category === "effect" ? "effect" : "prop",
        svg: value.svg,
        width: value.width,
        height: value.height,
      };
    }
    case "local":
      return adaptLocalAssetToSceneCatalog(item.source.value, "prop", {
        title: item.title,
        keywords: item.keywords,
      });
    default:
      return null;
  }
}

/** 일러스트 팩 배경 메타 어댑터 — 시간대·실내외를 그대로 실어 매칭 가점에 쓴다. */
export function adaptIllustrationBackgroundToSceneCatalog(
  meta: Studio2dAssetMetadata
): StudioSceneCatalogEntry {
  return {
    id: meta.id,
    kind: "background",
    title: meta.title,
    keywords: [...meta.tags, meta.title],
    src: meta.src,
    width: meta.width,
    height: meta.height,
    timeOfDay: meta.timeOfDay,
    environment: meta.environment,
    featured: meta.recommended,
  };
}

/** 번들 래스터 에셋 어댑터(소품 클러스터·효과 오버레이). */
export function adaptRasterAssetToSceneCatalog(
  asset: StudioRasterAsset
): StudioSceneCatalogEntry {
  return {
    id: asset.id,
    kind: asset.kind === "effect-overlay" ? "effect" : "prop",
    title: asset.label,
    keywords: [...asset.tags, asset.label],
    description: asset.description,
    src: asset.src,
    width: asset.width,
    height: asset.height,
  };
}

/**
 * 캐릭터 계약 어댑터. 표정 1개 = 진입 1개(포즈·표정 쿼리가 표정 단위로
 * 매칭되게). expressionId 미지정 시 전 표정을 각각 진입으로 펼친다.
 */
export function adaptCharacterAssetToSceneCatalog(
  asset: CharacterAsset,
  expressionId?: string
): StudioSceneCatalogEntry[] {
  const expressions = expressionId
    ? asset.expressions.filter((e) => e.id === expressionId)
    : asset.expressions;
  return expressions.map((expression) => ({
    id: `${asset.id}:${expression.id}`,
    kind: "character" as const,
    title: `${asset.label} ${expression.label}`,
    keywords: [asset.label, expression.label, expression.id],
    ...(expression.imgSrc ? { src: expression.imgSrc } : {}),
    ...(expression.svg ? { svg: expression.svg } : {}),
    width: asset.width,
    height: asset.height,
  }));
}

/** 로컬(내) 에셋 어댑터 — 종류는 호스트가 안다(배경으로 올린 그림 등). */
export function adaptLocalAssetToSceneCatalog(
  asset: StudioAsset,
  kind: StudioSceneCatalogKind,
  hints?: { title?: string; keywords?: readonly string[] }
): StudioSceneCatalogEntry {
  return {
    id: `local:${asset.id}`,
    kind,
    title: hints?.title ?? asset.name,
    keywords: [...(hints?.keywords ?? []), asset.name],
    src: asset.dataUrl,
    width: asset.width,
    height: asset.height,
  };
}

// ---------------------------------------------------------------------------
// lexical 매칭 + 재랭킹 (통합 카탈로그 searchStudioUnifiedAssets와 같은 채점 감각)
// ---------------------------------------------------------------------------

/** 장면 용어 동의어 — 쿼리 확장용. 통합 카탈로그 QUERY_SYNONYMS와 겹치는 핵심만. */
const SCENE_SYNONYMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  학교: ["교실", "학원", "school", "classroom"],
  교실: ["학교", "학원", "school", "classroom"],
  거리: ["골목", "도시", "street", "city"],
  골목: ["거리", "도시", "street"],
  방: ["침실", "bedroom", "room"],
  침실: ["방", "bedroom"],
  궁궐: ["궁전", "palace"],
  궁전: ["궁궐", "palace"],
  밤: ["야간", "night"],
  야간: ["밤", "night"],
  비: ["우천", "rain"],
  로맨스: ["연애", "romance"],
  판타지: ["마법", "fantasy"],
  카페: ["cafe", "coffee"],
  옥상: ["rooftop", "지붕"],
});

function expandTerms(terms: readonly string[]): string[] {
  const out = new Set<string>();
  for (const term of terms) {
    const normalized = term.trim().toLowerCase();
    if (!normalized) continue;
    out.add(normalized);
    for (const syn of SCENE_SYNONYMS[normalized] ?? []) out.add(syn.toLowerCase());
    // "노을 옥상"처럼 합쳐진 쿼리는 토큰으로도 쪼개어 확장한다.
    for (const token of normalized.split(/\s+/)) {
      if (!token) continue;
      out.add(token);
      for (const syn of SCENE_SYNONYMS[token] ?? []) out.add(syn.toLowerCase());
    }
  }
  return [...out];
}

export interface StudioSceneCatalogMatch {
  readonly entry: StudioSceneCatalogEntry;
  readonly score: number;
}

function scoreEntry(
  entry: StudioSceneCatalogEntry,
  terms: readonly string[],
  context: { timeOfDay?: string; environment?: string }
): number {
  const title = entry.title.toLowerCase();
  const keywords = entry.keywords.map((k) => k.toLowerCase());
  const description = (entry.description ?? "").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title === term) score += 1000;
    else if (title.startsWith(term)) score += 400;
    else if (title.includes(term)) score += 250;
    if (keywords.some((k) => k === term)) score += 160;
    else if (keywords.some((k) => k.includes(term))) score += 90;
    if (description.includes(term)) score += 30;
  }
  if (context.timeOfDay && entry.timeOfDay) {
    score += entry.timeOfDay === context.timeOfDay ? 150 : -60;
  }
  if (context.environment && entry.environment) {
    score += entry.environment === context.environment ? 80 : -40;
  }
  if (entry.featured) score += 40;
  return score;
}

/**
 * 슬롯 1개에 대한 카탈로그 랭킹. 점수 0 이하는 후보에서 제외하고,
 * 점수 → featured → id 순으로 결정적으로 정렬한다.
 */
export function rankSceneCatalogForSlot(
  catalog: readonly StudioSceneCatalogEntry[],
  kind: StudioSceneCatalogKind,
  query: string,
  keywords: readonly string[],
  options: {
    limit?: number;
    timeOfDay?: string;
    environment?: string;
  } = {}
): StudioSceneCatalogMatch[] {
  const terms = expandTerms([query, ...keywords]);
  if (terms.length === 0) return [];
  const limit = options.limit ?? 3;
  return catalog
    .filter((entry) => entry.kind === kind)
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, terms, {
        timeOfDay: options.timeOfDay,
        environment: options.environment,
      }),
    }))
    .filter((m) => m.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.entry.featured ?? false) - Number(a.entry.featured ?? false) ||
        (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0)
    )
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// 조립 — 슬롯 문서 + 카탈로그 → SceneSeed[] + 이미지 배치
// 좌표 규약은 studio-scene-templates와 동일: 캔버스 폭 720, 프레임 x=origin+30.
// ---------------------------------------------------------------------------

export const STUDIO_SCENE_ASSEMBLY_CANVAS_WIDTH = 720;
export const STUDIO_SCENE_ASSEMBLY_FRAME_X = 30;
export const STUDIO_SCENE_ASSEMBLY_FRAME_WIDTH = 660;
export const STUDIO_SCENE_ASSEMBLY_FRAME_HEIGHT = 520;
/** 캐릭터 기본 신장(px, scale 1 기준). */
export const STUDIO_SCENE_ASSEMBLY_CHARACTER_HEIGHT = 300;

export interface StudioSceneAssemblyOptions {
  readonly originX?: number;
  readonly originY?: number;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
}

/** ImageEl 재료 — 호스트가 id를 채우고 svg는 svgToDataUrl로 바꾼다. */
export interface StudioSceneImagePlacement {
  readonly role: "character" | "prop";
  /** 슬롯 문서 안의 슬롯 인덱스(캐릭터/소품 각각의 배열 기준). */
  readonly slotIndex: number;
  readonly entryId: string;
  readonly entryTitle: string;
  readonly src?: string;
  readonly svg?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** facing이 left면 true (ImageEl.flipped). */
  readonly flipped: boolean;
}

export interface StudioSceneSlotMatch {
  readonly slotKind: "background" | "character" | "prop";
  readonly slotIndex: number;
  readonly query: string;
  readonly entryId: string | null;
  readonly entryTitle: string | null;
  readonly score: number;
}

export interface StudioSceneAssemblyResult {
  readonly seeds: readonly SceneSeed[];
  readonly images: readonly StudioSceneImagePlacement[];
  readonly matches: readonly StudioSceneSlotMatch[];
  readonly unmatched: readonly {
    readonly slotKind: "background" | "character" | "prop";
    readonly slotIndex: number;
    readonly query: string;
    readonly reason: "no-candidate" | "empty-query";
  }[];
  readonly warnings: readonly string[];
}

const TIME_OF_DAY_FRAME_BG: Readonly<Record<string, string>> = {
  새벽: "#2c3350",
  아침: "#fdf3e0",
  낮: "#eef4fb",
  노을: "#ffe3c2",
  밤: "#1d2438",
};
const NEUTRAL_FRAME_BG = "#f2f0ea";
const FRAME_STROKE = "#252731";
const TEXT_INK = "#252731";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const CHARACTER_ANCHOR_RATIO: Readonly<Record<StudioSceneCharacterSlot["position"], number>> = {
  left: 0.22,
  center: 0.5,
  right: 0.78,
  foreground: 0.5,
  background: 0.5,
};

function characterHeight(slot: StudioSceneCharacterSlot, frameHeight: number): number {
  const positionBoost =
    slot.position === "foreground" ? 1.25 : slot.position === "background" ? 0.7 : 1;
  return clamp(
    Math.round(STUDIO_SCENE_ASSEMBLY_CHARACTER_HEIGHT * slot.scale * positionBoost),
    100,
    Math.round(frameHeight * 0.88)
  );
}

/** 대사 길이에 맞는 말풍선 크기 추정(자동 축소 전 1차 값). */
function bubbleSize(text: string): { width: number; height: number } {
  const width = clamp(150 + text.length * 12, 180, 340);
  const charsPerLine = Math.max(8, Math.floor(width / 15));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return { width, height: clamp(58 + lines * 27, 84, 176) };
}

export function assembleSceneDraft(
  doc: StudioSceneSlotDocument,
  catalog: readonly StudioSceneCatalogEntry[],
  options: StudioSceneAssemblyOptions = {}
): StudioSceneAssemblyResult {
  const ox = options.originX ?? 0;
  const oy = options.originY ?? 0;
  const frameW = options.frameWidth ?? STUDIO_SCENE_ASSEMBLY_FRAME_WIDTH;
  const frameH = options.frameHeight ?? STUDIO_SCENE_ASSEMBLY_FRAME_HEIGHT;
  const frameX = ox + STUDIO_SCENE_ASSEMBLY_FRAME_X;
  const frameY = oy;
  const floorY = frameY + frameH - 20;

  const warnings: string[] = [...doc.warnings];
  const matches: StudioSceneSlotMatch[] = [];
  const unmatched: StudioSceneAssemblyResult["unmatched"][number][] = [];
  const images: StudioSceneImagePlacement[] = [];
  const seeds: SceneSeed[] = [];

  // — 배경: 1순위 매칭 → 프레임 seed —
  let backgroundSrc: string | undefined;
  if (doc.background) {
    const ranked = rankSceneCatalogForSlot(catalog, "background", doc.background.query, doc.background.keywords, {
      limit: 1,
      timeOfDay: doc.background.timeOfDay,
      environment: doc.background.environment,
    });
    const best = ranked[0];
    if (best) {
      matches.push({
        slotKind: "background",
        slotIndex: 0,
        query: doc.background.query,
        entryId: best.entry.id,
        entryTitle: best.entry.title,
        score: best.score,
      });
      backgroundSrc = best.entry.src;
      if (!backgroundSrc && best.entry.svg) {
        // svg 배경은 호스트가 프레임 bg로 못 실으므로 이미지 배치로 넘긴다.
        images.unshift({
          role: "prop",
          slotIndex: -1,
          entryId: best.entry.id,
          entryTitle: best.entry.title,
          svg: best.entry.svg,
          x: frameX,
          y: frameY,
          width: frameW,
          height: frameH,
          flipped: false,
        });
        warnings.push("background-svg-as-image");
      }
    } else {
      matches.push({
        slotKind: "background",
        slotIndex: 0,
        query: doc.background.query,
        entryId: null,
        entryTitle: null,
        score: 0,
      });
      unmatched.push({
        slotKind: "background",
        slotIndex: 0,
        query: doc.background.query,
        reason: doc.background.query ? "no-candidate" : "empty-query",
      });
      warnings.push("background-unmatched");
    }
  }
  const frameBgColor = doc.background?.timeOfDay
    ? (TIME_OF_DAY_FRAME_BG[doc.background.timeOfDay] ?? NEUTRAL_FRAME_BG)
    : NEUTRAL_FRAME_BG;
  seeds.push({
    type: "frame",
    x: frameX,
    y: frameY,
    width: frameW,
    height: frameH,
    ...(backgroundSrc ? { bg: backgroundSrc } : {}),
    bgColor: frameBgColor,
    stroke: FRAME_STROKE,
    strokeWidth: 3,
  });

  // — 캐릭터: 이미지 배치 + 말풍선 앵커 계산용 중심점 —
  const characterAnchors: { cx: number; topY: number }[] = [];
  doc.characters.forEach((slot, slotIndex) => {
    const ranked = rankSceneCatalogForSlot(catalog, "character", slot.query, [
      slot.label,
      ...(slot.pose ? [slot.pose] : []),
      ...(slot.expression ? [slot.expression] : []),
    ], { limit: 1 });
    const height = characterHeight(slot, frameH);
    const anchorRatio = CHARACTER_ANCHOR_RATIO[slot.position];
    const cx = frameX + frameW * anchorRatio;
    const best = ranked[0];
    if (best) {
      const aspect = best.entry.width > 0 && best.entry.height > 0
        ? best.entry.width / best.entry.height
        : 0.45;
      const width = Math.round(height * aspect);
      matches.push({
        slotKind: "character",
        slotIndex,
        query: slot.query,
        entryId: best.entry.id,
        entryTitle: best.entry.title,
        score: best.score,
      });
      images.push({
        role: "character",
        slotIndex,
        entryId: best.entry.id,
        entryTitle: best.entry.title,
        ...(best.entry.src ? { src: best.entry.src } : {}),
        ...(best.entry.svg ? { svg: best.entry.svg } : {}),
        x: Math.round(cx - width / 2),
        y: Math.round(floorY - height),
        width,
        height,
        flipped: slot.facing === "left",
      });
      characterAnchors.push({ cx, topY: floorY - height });
    } else {
      matches.push({
        slotKind: "character",
        slotIndex,
        query: slot.query,
        entryId: null,
        entryTitle: null,
        score: 0,
      });
      unmatched.push({ slotKind: "character", slotIndex, query: slot.query, reason: "no-candidate" });
      warnings.push(`character-unmatched:${slot.label}`);
      // 자산이 없어도 슬롯 위치 앵커는 유지해 말풍선이 붙을 자리를 남긴다.
      characterAnchors.push({ cx, topY: floorY - height });
    }
  });

  // — 소품: 하단 일렬 배치 —
  doc.props.forEach((slot, slotIndex) => {
    const ranked = rankSceneCatalogForSlot(catalog, "prop", slot.query, slot.keywords, { limit: 1 });
    const best = ranked[0];
    if (!best) {
      matches.push({
        slotKind: "prop",
        slotIndex,
        query: slot.query,
        entryId: null,
        entryTitle: null,
        score: 0,
      });
      unmatched.push({ slotKind: "prop", slotIndex, query: slot.query, reason: "no-candidate" });
      warnings.push(`prop-unmatched:${slot.query}`);
      return;
    }
    matches.push({
      slotKind: "prop",
      slotIndex,
      query: slot.query,
      entryId: best.entry.id,
      entryTitle: best.entry.title,
      score: best.score,
    });
    const maxW = 170 * slot.scale;
    const width = Math.min(best.entry.width, Math.round(maxW));
    const height = best.entry.width > 0
      ? Math.round((width * best.entry.height) / best.entry.width)
      : width;
    const slotRatio =
      slot.position === "left" ? 0.16 : slot.position === "right" ? 0.84 : slot.position === "center" ? 0.5 : 0.3 + slotIndex * 0.14;
    const cx = frameX + frameW * clamp(slotRatio, 0.08, 0.92);
    images.push({
      role: "prop",
      slotIndex,
      entryId: best.entry.id,
      entryTitle: best.entry.title,
      ...(best.entry.src ? { src: best.entry.src } : {}),
      ...(best.entry.svg ? { svg: best.entry.svg } : {}),
      x: Math.round(cx - width / 2),
      y: Math.round(floorY - height),
      width,
      height,
      flipped: false,
    });
  });

  // — 나레이션: 프레임 상단 박스 말풍선(일러스트 템플릿 규약) —
  doc.narrations.forEach((narration, i) => {
    const width = Math.min(520, frameW - 32);
    const lines = Math.max(1, Math.ceil(narration.text.length / 30));
    seeds.push({
      type: "bubble",
      variant: "box",
      text: narration.text,
      x: frameX + 16,
      y: frameY + 14 + i * 78,
      width,
      height: clamp(44 + lines * 24, 60, 120),
      fill: "#ffffff",
      textFill: TEXT_INK,
      rotation: 0,
      tail: "none",
      fontSize: 20,
    });
  });
  const narrationBottom = frameY + 14 + doc.narrations.length * 78;

  // — 대사: 화자 앵커 위 말풍선. 화자가 없으면 상단부터 차례로 쌓는다. —
  doc.dialogues.forEach((dialogue, i) => {
    const size = bubbleSize(dialogue.text);
    const speakerIndex = dialogue.speaker
      ? doc.characters.findIndex((c) => c.label === dialogue.speaker)
      : -1;
    const anchor = speakerIndex >= 0 ? characterAnchors[speakerIndex] : undefined;
    const anchorCx = anchor ? anchor.cx : frameX + frameW * (0.3 + (i % 3) * 0.2);
    const headTop = anchor ? anchor.topY : frameY + frameH * 0.42;
    const x = Math.round(clamp(anchorCx - size.width / 2, frameX + 8, frameX + frameW - size.width - 8));
    const y = Math.round(
      clamp(headTop - size.height - 16 - (i > 0 && speakerIndex >= 0 ? 0 : i * 6), narrationBottom + 4, frameY + frameH - size.height - 8)
    );
    seeds.push({
      type: "bubble",
      variant: dialogue.variantHint,
      text: dialogue.text,
      x,
      y,
      width: size.width,
      height: size.height,
      fill: "#ffffff",
      textFill: TEXT_INK,
      rotation: 0,
      tail: anchorCx <= x + size.width / 2 ? "left" : "right",
      tailDirection: "bottom",
      fontSize: 24,
    });
  });

  // — 효과음: 프레임 중앙부 텍스트 시드(템플릿 규약: Black Han Sans + 흰 외곽선) —
  doc.sfx.forEach((sfx, i) => {
    seeds.push({
      type: "text",
      text: sfx.text,
      x: Math.round(frameX + frameW * 0.38 + i * 46),
      y: Math.round(frameY + frameH * 0.4 + i * 30),
      width: 200,
      fontSize: sfx.emphasis === "strong" ? 72 : 52,
      fill: "#e23b3b",
      rotation: -8,
      font: "Black Han Sans",
      stroke: "#ffffff",
      strokeWidth: 5,
      align: "center",
    });
  });

  return { seeds, images, matches, unmatched, warnings };
}
