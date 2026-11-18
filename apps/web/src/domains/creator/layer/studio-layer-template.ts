/**
 * CSP 레이어 템플릿 등록(`editactionregistlayertemplate`) 및 벡터 SVG 클립보드 직렬화(`editactioncopyvectorassvg`) 엔진.
 *
 * 대용량 래스터 픽셀(data URL, 마스크 바이트, 3D 장면 등)을 제거하고 폴더·레이어 계층 구조,
 * 역할(Role), 색 라벨, 클리핑·참조·알파잠금·표현색 속성만 경량 JSON으로 캡처·검증·인스턴스화한다.
 * 또한 선택된 벡터 획을 외부 일러스트 도구 호환 SVG 마크업으로 직렬화한다.
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 * - evidence_id: ev_0c6a677d38f821a7c782b943662be657510c27ee397e744fa128f63a1ca2d1fa
 */

import { normalizeStudioLayerExpressionColorSettings } from "./studio-layer-expression-color";
import { normalizeStudioLayerColor, normalizeStudioLayerRole } from "./studio-layer-navigator";

import type { El } from "../studio-element-model";
import type { LayerGroup } from "../studio-layers";
import type { StudioLayerExpressionColorSettings } from "./studio-layer-expression-color";
import type { StudioLayerColor, StudioLayerRole } from "./studio-layer-navigator";

export const STUDIO_LAYER_TEMPLATE_STORAGE_KEY = "toonstudio:layer-templates:v1";
export const MAX_SAVED_STUDIO_LAYER_TEMPLATES = 64;

export type StudioLayerTemplateEntryKind = "raster" | "vector" | "text" | "bubble" | "frame" | "effect";

export interface StudioLayerTemplateGroupSlot {
  readonly slotId: string;
  readonly name: string;
  readonly collapsed?: boolean;
  readonly hidden?: boolean;
  readonly locked?: boolean;
}

export interface StudioLayerTemplateLayerSlot {
  readonly slotId: string;
  readonly name: string;
  readonly layerKind: StudioLayerTemplateEntryKind;
  readonly groupSlotId?: string;
  readonly role?: StudioLayerRole;
  readonly color?: StudioLayerColor;
  readonly opacity?: number;
  readonly blendMode?: string;
  readonly clipBelow?: boolean;
  readonly alphaLocked?: boolean;
  readonly fillReference?: boolean;
  readonly hidden?: boolean;
  readonly locked?: boolean;
  readonly expressionColor?: StudioLayerExpressionColorSettings;
}

export interface StudioLayerTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly builtin?: boolean;
  readonly groups: readonly StudioLayerTemplateGroupSlot[];
  readonly layers: readonly StudioLayerTemplateLayerSlot[];
}

export interface StudioLayerTemplateSourceElement {
  readonly id: string;
  readonly name?: string;
  readonly label?: string;
  readonly type?: string;
  readonly groupId?: string;
  readonly role?: StudioLayerRole;
  readonly color?: StudioLayerColor;
  readonly opacity?: number;
  readonly blendMode?: string;
  readonly clipBelow?: boolean;
  readonly alphaLocked?: boolean;
  readonly fillReference?: boolean;
  readonly hidden?: boolean;
  readonly locked?: boolean;
  readonly expressionColor?: Partial<StudioLayerExpressionColorSettings> | null;
  readonly src?: unknown;
  readonly maskSrc?: unknown;
  readonly filterMaskSrc?: unknown;
  readonly points?: unknown;
  readonly frames?: unknown;
}

export interface StudioLayerTemplateStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface InstantiatedTemplateLayer {
  readonly id: string;
  readonly name: string;
  readonly type: "image" | "draw" | "text" | "bubble" | "frame" | "focusLines";
  readonly layerKind: StudioLayerTemplateEntryKind;
  readonly groupId?: string;
  readonly role?: StudioLayerRole;
  readonly color?: StudioLayerColor;
  readonly opacity: number;
  readonly blendMode?: string;
  readonly clipBelow?: boolean;
  readonly alphaLocked?: boolean;
  readonly fillReference?: boolean;
  readonly hidden?: boolean;
  readonly locked?: boolean;
  readonly expressionColor?: StudioLayerExpressionColorSettings;
}

export interface InstantiateLayerTemplateOptions {
  readonly existingGroupIds?: Iterable<string>;
  readonly existingLayerIds?: Iterable<string>;
  readonly idPrefix?: string;
  readonly sequenceStart?: number;
}

export interface InstantiatedLayerTemplateResult {
  readonly groups: readonly LayerGroup[];
  readonly layers: readonly InstantiatedTemplateLayer[];
  readonly groupIdMap: ReadonlyMap<string, string>;
}

export interface VectorClipboardStrokeInput {
  readonly id?: string;
  readonly points: readonly number[];
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly opacity?: number;
  readonly fill?: string;
  readonly closed?: boolean;
  readonly lineCap?: "round" | "butt" | "square";
  readonly lineJoin?: "round" | "miter" | "bevel";
}

export interface VectorClipboardSvgOptions {
  readonly width?: number;
  readonly height?: number;
  readonly paddingPx?: number;
  readonly title?: string;
}

const VALID_ENTRY_KINDS: readonly StudioLayerTemplateEntryKind[] = [
  "raster", "vector", "text", "bubble", "frame", "effect",
];

function sanitizeText(raw: unknown, fallback: string, maxLen = 80): string {
  if (typeof raw !== "string") return fallback;
  let safe = "";
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    safe += cp <= 31 || cp === 127 ? " " : ch;
  }
  const cleaned = safe.trim();
  return cleaned ? cleaned.slice(0, maxLen) : fallback;
}

function clampUnitOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}

function entryKindFromSourceType(type?: string): StudioLayerTemplateEntryKind {
  if (type === "draw") return "vector";
  if (type === "text") return "text";
  if (type === "bubble") return "bubble";
  if (type === "frame") return "frame";
  if (type === "focusLines" || type === "speedLines") return "effect";
  return "raster";
}

function documentTypeFromEntryKind(kind: StudioLayerTemplateEntryKind): InstantiatedTemplateLayer["type"] {
  if (kind === "vector") return "draw";
  if (kind === "text") return "text";
  if (kind === "bubble") return "bubble";
  if (kind === "frame") return "frame";
  if (kind === "effect") return "focusLines";
  return "image";
}

const MONO_EXPR = normalizeStudioLayerExpressionColorSettings({
  expressionMode: "monochrome",
  imageThreshold: 128,
  alphaThreshold: 128,
});

const BLUE_ROUGH_EXPR = normalizeStudioLayerExpressionColorSettings({
  layerColorTint: { enabled: true, mainColor: "#2563eb", subColor: "#ffffff" },
});

function defineBuiltinTemplate(tpl: StudioLayerTemplate): StudioLayerTemplate {
  return Object.freeze({
    ...tpl,
    groups: Object.freeze([...tpl.groups]),
    layers: Object.freeze([...tpl.layers]),
  });
}

/** 한국어 웹툰·출판 만화 실무 표준 내장 레이어 템플릿 4종. */
export const BUILTIN_STUDIO_LAYER_TEMPLATES: readonly StudioLayerTemplate[] = Object.freeze([
  defineBuiltinTemplate({
    id: "builtin-webtoon-standard-6",
    name: "표준 웹툰 컷 6단",
    description: "콘티·러프부터 배경, 밑색·명암, 펜선화, 후보정 효과, 말풍선·대사까지 6단으로 분리한 연재 표준 구성입니다.",
    builtin: true,
    groups: [
      { slotId: "g-draft", name: "1단 · 콘티·밑그림" },
      { slotId: "g-bg", name: "2단 · 배경" },
      { slotId: "g-color", name: "3단 · 인물 채색" },
      { slotId: "g-ink", name: "4단 · 선화" },
      { slotId: "g-fx", name: "5단 · 조명·효과" },
      { slotId: "g-dialogue", name: "6단 · 말풍선·대사" },
    ],
    layers: [
      { slotId: "l-rough", name: "파란선 러프", layerKind: "raster", groupSlotId: "g-draft", role: "rough", color: "blue", opacity: 0.55, expressionColor: BLUE_ROUGH_EXPR },
      { slotId: "l-bg-plate", name: "배경 플레이트", layerKind: "raster", groupSlotId: "g-bg", role: "reference", color: "green" },
      { slotId: "l-base-color", name: "인물 밑색", layerKind: "raster", groupSlotId: "g-color", role: "color", color: "yellow" },
      { slotId: "l-cell-shade", name: "셀 명암", layerKind: "raster", groupSlotId: "g-color", role: "color", color: "orange", clipBelow: true, blendMode: "multiply" },
      { slotId: "l-main-ink", name: "인물 펜선화", layerKind: "vector", groupSlotId: "g-ink", role: "lineart", color: "red", fillReference: true },
      { slotId: "l-glow-fx", name: "역광·하이라이트", layerKind: "raster", groupSlotId: "g-fx", role: "effect", color: "violet", blendMode: "screen" },
      { slotId: "l-dialogue", name: "대사 말풍선", layerKind: "bubble", groupSlotId: "g-dialogue", role: "lettering" },
    ],
  }),
  defineBuiltinTemplate({
    id: "builtin-rofan-glamour",
    name: "로판 화려 효과 컷",
    description: "로맨스 판타지 하이라이트 컷을 위한 드레스 레이스, 보석 반사, 꽃잎·후광 발광 레이어 세트입니다.",
    builtin: true,
    groups: [
      { slotId: "g-rofan-bg", name: "후광·배경 보케" },
      { slotId: "g-rofan-char", name: "인물·의상 채색" },
      { slotId: "g-rofan-ink", name: "섬세 선화·컬러트레이스" },
      { slotId: "g-rofan-jewel", name: "보석·꽃잎 발광 효과" },
    ],
    layers: [
      { slotId: "l-rofan-aura", name: "배경 오라 그라데이션", layerKind: "raster", groupSlotId: "g-rofan-bg", role: "effect", color: "violet" },
      { slotId: "l-rofan-skin", name: "피부·홍조 수채", layerKind: "raster", groupSlotId: "g-rofan-char", role: "color", color: "orange", expressionColor: normalizeStudioLayerExpressionColorSettings({ watercolorEdge: { enabled: true, rangePx: 3, opacity: 45, darkness: 35, blurPx: 2 } }) },
      { slotId: "l-rofan-dress", name: "드레스·레이스 명암", layerKind: "raster", groupSlotId: "g-rofan-char", role: "color", color: "yellow", clipBelow: true },
      { slotId: "l-rofan-ink", name: "속눈썹·주선화", layerKind: "vector", groupSlotId: "g-rofan-ink", role: "lineart", color: "red", alphaLocked: true, fillReference: true },
      { slotId: "l-rofan-sparkle", name: "보석·샤랄라 발광", layerKind: "raster", groupSlotId: "g-rofan-jewel", role: "effect", color: "violet", blendMode: "add" },
    ],
  }),
  defineBuiltinTemplate({
    id: "builtin-manga-monochrome",
    name: "흑백 출판 만화",
    description: "인쇄용 1비트 모노크롬 먹선·먹베타·스크린톤·파란선 밑그림을 분리한 출판 원고 구성입니다.",
    builtin: true,
    groups: [
      { slotId: "g-manga-draft", name: "밑그림 (인쇄 제외)" },
      { slotId: "g-manga-tone", name: "스크린톤·먹베타" },
      { slotId: "g-manga-ink", name: "펜터치 원화" },
      { slotId: "g-manga-text", name: "식자·말풍선" },
    ],
    layers: [
      { slotId: "l-manga-draft", name: "네임·러프", layerKind: "raster", groupSlotId: "g-manga-draft", role: "rough", color: "blue", opacity: 0.45, expressionColor: BLUE_ROUGH_EXPR },
      { slotId: "l-manga-tone", name: "망점 스크린톤 60L", layerKind: "raster", groupSlotId: "g-manga-tone", role: "tone", color: "green", expressionColor: MONO_EXPR },
      { slotId: "l-manga-beta", name: "먹베타 채움", layerKind: "raster", groupSlotId: "g-manga-tone", role: "tone", expressionColor: MONO_EXPR },
      { slotId: "l-manga-pen", name: "G펜 주선화", layerKind: "vector", groupSlotId: "g-manga-ink", role: "lineart", color: "red", fillReference: true, expressionColor: MONO_EXPR },
      { slotId: "l-manga-balloon", name: "식자 말풍선", layerKind: "bubble", groupSlotId: "g-manga-text", role: "lettering" },
    ],
  }),
  defineBuiltinTemplate({
    id: "builtin-bg-character-split",
    name: "배경+인물 분리",
    description: "3D/원경 배경 팀과 인물 작화 팀이 충돌 없이 협업하도록 원경·인물·전경 소품을 분리한 구조입니다.",
    builtin: true,
    groups: [
      { slotId: "g-split-bg", name: "원경·3D 배경" },
      { slotId: "g-split-char", name: "인물 세트" },
      { slotId: "g-split-fg", name: "전경 소품·포커스 아웃" },
    ],
    layers: [
      { slotId: "l-split-bg-color", name: "3D 배경 채색", layerKind: "raster", groupSlotId: "g-split-bg", role: "color", color: "green" },
      { slotId: "l-split-bg-lt", name: "3D LT 배경 선화", layerKind: "raster", groupSlotId: "g-split-bg", role: "lineart", color: "green" },
      { slotId: "l-split-char-color", name: "주연 채색", layerKind: "raster", groupSlotId: "g-split-char", role: "color", color: "yellow" },
      { slotId: "l-split-char-ink", name: "주연 선화", layerKind: "vector", groupSlotId: "g-split-char", role: "lineart", color: "red", fillReference: true },
      { slotId: "l-split-fg-prop", name: "전경 실루엣·블러 소품", layerKind: "raster", groupSlotId: "g-split-fg", role: "effect", color: "violet" },
    ],
  }),
]);

/** 현재 페이지의 폴더·레이어 구조를 픽셀 페이로드 없이 경량 템플릿으로 캡처한다. */
export function captureLayerStructureAsTemplate(input: {
  readonly id?: string;
  readonly name: string;
  readonly description?: string;
  readonly groups: readonly LayerGroup[];
  readonly elements: readonly StudioLayerTemplateSourceElement[];
}): StudioLayerTemplate {
  const safeName = sanitizeText(input.name, "사용자 레이어 템플릿", 60);
  const safeDesc = sanitizeText(
    input.description,
    `${input.elements.length}개 레이어 구조 템플릿`,
    160,
  );
  const templateId = sanitizeText(
    input.id,
    `tpl-${safeName.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-")}-${input.elements.length}`,
    80,
  );

  const groupSlotMap = new Map<string, string>();
  const groups: StudioLayerTemplateGroupSlot[] = [];
  input.groups.forEach((group, index) => {
    const slotId = `g-slot-${index + 1}`;
    groupSlotMap.set(group.id, slotId);
    groups.push({
      slotId,
      name: sanitizeText(group.name, `폴더 ${index + 1}`, 60),
      ...(group.collapsed ? { collapsed: true } : {}),
      ...(group.hidden ? { hidden: true } : {}),
      ...(group.locked ? { locked: true } : {}),
    });
  });

  const layers: StudioLayerTemplateLayerSlot[] = input.elements.map((el, index) => {
    const layerKind = entryKindFromSourceType(el.type);
    const mappedGroupSlot = el.groupId !== undefined ? groupSlotMap.get(el.groupId) : undefined;
    const role = normalizeStudioLayerRole(el.role);
    const color = normalizeStudioLayerColor(el.color);
    const expressionColor = el.expressionColor
      ? normalizeStudioLayerExpressionColorSettings(el.expressionColor)
      : undefined;

    return {
      slotId: `l-slot-${index + 1}`,
      name: sanitizeText(el.name ?? el.label, `레이어 ${index + 1}`, 60),
      layerKind,
      ...(mappedGroupSlot ? { groupSlotId: mappedGroupSlot } : {}),
      ...(role ? { role } : {}),
      ...(color ? { color } : {}),
      ...(el.opacity !== undefined ? { opacity: clampUnitOpacity(el.opacity) } : {}),
      ...(typeof el.blendMode === "string" && el.blendMode.trim()
        ? { blendMode: sanitizeText(el.blendMode, "normal", 32) }
        : {}),
      ...(el.clipBelow ? { clipBelow: true } : {}),
      ...(el.alphaLocked ? { alphaLocked: true } : {}),
      ...(el.fillReference ? { fillReference: true } : {}),
      ...(el.hidden ? { hidden: true } : {}),
      ...(el.locked ? { locked: true } : {}),
      ...(expressionColor ? { expressionColor } : {}),
    };
  });

  return { id: templateId, name: safeName, description: safeDesc, groups, layers };
}

/** 외부/저장소 JSON 후보를 검증하여 유효한 `StudioLayerTemplate`만 반환한다. */
export function validateStudioLayerTemplate(raw: unknown): StudioLayerTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  if (typeof candidate.name !== "string" || !candidate.name.trim()) return null;
  if (!Array.isArray(candidate.layers) || candidate.layers.length === 0) return null;

  const rawGroups = Array.isArray(candidate.groups) ? candidate.groups : [];
  const validGroupSlots = new Set<string>();
  const groups: StudioLayerTemplateGroupSlot[] = [];

  for (const g of rawGroups) {
    if (!g || typeof g !== "object") continue;
    const groupObj = g as Record<string, unknown>;
    if (typeof groupObj.slotId !== "string" || !groupObj.slotId.trim()) continue;
    const slotId = sanitizeText(groupObj.slotId, "", 64);
    if (!slotId || validGroupSlots.has(slotId)) continue;
    validGroupSlots.add(slotId);
    groups.push({
      slotId,
      name: sanitizeText(groupObj.name, "폴더", 60),
      ...(groupObj.collapsed === true ? { collapsed: true } : {}),
      ...(groupObj.hidden === true ? { hidden: true } : {}),
      ...(groupObj.locked === true ? { locked: true } : {}),
    });
  }

  const seenLayerSlots = new Set<string>();
  const layers: StudioLayerTemplateLayerSlot[] = [];
  for (const l of candidate.layers) {
    if (!l || typeof l !== "object") continue;
    const layerObj = l as Record<string, unknown>;
    const kind = VALID_ENTRY_KINDS.includes(layerObj.layerKind as StudioLayerTemplateEntryKind)
      ? (layerObj.layerKind as StudioLayerTemplateEntryKind)
      : null;
    if (!kind) continue;
    const slotId = sanitizeText(layerObj.slotId, `l-${layers.length + 1}`, 64);
    if (seenLayerSlots.has(slotId)) continue;
    seenLayerSlots.add(slotId);

    const groupSlotId =
      typeof layerObj.groupSlotId === "string" && validGroupSlots.has(layerObj.groupSlotId)
        ? layerObj.groupSlotId
        : undefined;
    const role = normalizeStudioLayerRole(layerObj.role);
    const color = normalizeStudioLayerColor(layerObj.color);

    layers.push({
      slotId,
      name: sanitizeText(layerObj.name, "레이어", 60),
      layerKind: kind,
      ...(groupSlotId ? { groupSlotId } : {}),
      ...(role ? { role } : {}),
      ...(color ? { color } : {}),
      ...(typeof layerObj.opacity === "number" ? { opacity: clampUnitOpacity(layerObj.opacity) } : {}),
      ...(typeof layerObj.blendMode === "string" && layerObj.blendMode.trim()
        ? { blendMode: sanitizeText(layerObj.blendMode, "normal", 32) }
        : {}),
      ...(layerObj.clipBelow === true ? { clipBelow: true } : {}),
      ...(layerObj.alphaLocked === true ? { alphaLocked: true } : {}),
      ...(layerObj.fillReference === true ? { fillReference: true } : {}),
      ...(layerObj.hidden === true ? { hidden: true } : {}),
      ...(layerObj.locked === true ? { locked: true } : {}),
      ...(layerObj.expressionColor && typeof layerObj.expressionColor === "object"
        ? {
            expressionColor: normalizeStudioLayerExpressionColorSettings(
              layerObj.expressionColor as Partial<StudioLayerExpressionColorSettings>,
            ),
          }
        : {}),
    });
  }

  if (layers.length === 0) return null;
  return {
    id: sanitizeText(candidate.id, "tpl-custom", 80),
    name: sanitizeText(candidate.name, "사용자 템플릿", 60),
    description: sanitizeText(candidate.description, "", 160),
    groups,
    layers,
  };
}

function resolveDefaultStorage(explicit?: StudioLayerTemplateStorageLike | null): StudioLayerTemplateStorageLike | null {
  if (explicit !== undefined) return explicit;
  try {
    return typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null;
  } catch {
    return null;
  }
}

/** `localStorage`에서 사용자 저장 레이어 템플릿 목록을 검증하며 읽어온다. */
export function loadSavedLayerTemplates(storage?: StudioLayerTemplateStorageLike | null): readonly StudioLayerTemplate[] {
  const store = resolveDefaultStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(STUDIO_LAYER_TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: StudioLayerTemplate[] = [];
    const seenIds = new Set<string>();
    for (const item of parsed) {
      if (result.length >= MAX_SAVED_STUDIO_LAYER_TEMPLATES) break;
      const validated = validateStudioLayerTemplate(item);
      if (!validated || seenIds.has(validated.id)) continue;
      seenIds.add(validated.id);
      result.push(validated);
    }
    return result;
  } catch {
    return [];
  }
}

function persistTemplates(templates: readonly StudioLayerTemplate[], storage?: StudioLayerTemplateStorageLike | null): readonly StudioLayerTemplate[] {
  const store = resolveDefaultStorage(storage);
  const bounded = templates.slice(0, MAX_SAVED_STUDIO_LAYER_TEMPLATES);
  if (store) store.setItem(STUDIO_LAYER_TEMPLATE_STORAGE_KEY, JSON.stringify(bounded));
  return bounded;
}

/** 새 레이어 템플릿을 검증 후 `localStorage`에 저장(동일 ID는 교체)한다. */
export function saveLayerTemplateToStorage(template: StudioLayerTemplate, storage?: StudioLayerTemplateStorageLike | null): readonly StudioLayerTemplate[] {
  const validated = validateStudioLayerTemplate(template);
  if (!validated) throw new Error("유효하지 않은 레이어 템플릿 구조입니다.");
  const existing = loadSavedLayerTemplates(storage);
  return persistTemplates([validated, ...existing.filter((item) => item.id !== validated.id)], storage);
}

/** 저장된 사용자 레이어 템플릿의 이름·설명을 수정한다. */
export function updateSavedLayerTemplate(
  templateId: string,
  patch: { readonly name?: string; readonly description?: string },
  storage?: StudioLayerTemplateStorageLike | null,
): readonly StudioLayerTemplate[] {
  const updated = loadSavedLayerTemplates(storage).map((item) => {
    if (item.id !== templateId) return item;
    return {
      ...item,
      name: patch.name !== undefined ? sanitizeText(patch.name, item.name, 60) : item.name,
      description: patch.description !== undefined ? sanitizeText(patch.description, item.description, 160) : item.description,
    };
  });
  return persistTemplates(updated, storage);
}

/** 저장된 사용자 레이어 템플릿을 삭제한다. */
export function deleteSavedLayerTemplate(templateId: string, storage?: StudioLayerTemplateStorageLike | null): readonly StudioLayerTemplate[] {
  return persistTemplates(loadSavedLayerTemplates(storage).filter((item) => item.id !== templateId), storage);
}

/** 내장 4종 웹툰 템플릿과 사용자 저장 템플릿을 합쳐 반환한다. */
export function listAllLayerTemplates(storage?: StudioLayerTemplateStorageLike | null): readonly StudioLayerTemplate[] {
  return [...BUILTIN_STUDIO_LAYER_TEMPLATES, ...loadSavedLayerTemplates(storage)];
}

function allocateCollisionFreeId(prefix: string, used: Set<string>, counterRef: { value: number }): string {
  while (true) {
    counterRef.value += 1;
    const candidate = `${prefix}-${counterRef.value}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

/** 기존 문서 ID와 충돌하지 않는 새 ID로 템플릿을 인스턴스화한다. */
export function instantiateLayerTemplate(
  template: StudioLayerTemplate,
  options: InstantiateLayerTemplateOptions = {},
): InstantiatedLayerTemplateResult {
  const usedGroupIds = new Set<string>(options.existingGroupIds ?? []);
  const usedLayerIds = new Set<string>(options.existingLayerIds ?? []);
  const prefix = sanitizeText(options.idPrefix, "tpl", 24);
  const groupCounter = { value: Math.max(0, Math.trunc(options.sequenceStart ?? 0)) };
  const layerCounter = { value: Math.max(0, Math.trunc(options.sequenceStart ?? 0)) };

  const groupIdMap = new Map<string, string>();
  const groups: LayerGroup[] = template.groups.map((slot) => {
    const freshGroupId = allocateCollisionFreeId(`${prefix}-group`, usedGroupIds, groupCounter);
    groupIdMap.set(slot.slotId, freshGroupId);
    return {
      id: freshGroupId,
      name: slot.name,
      collapsed: slot.collapsed === true,
      hidden: slot.hidden === true,
      locked: slot.locked === true,
    };
  });

  const orderedSlots: StudioLayerTemplateLayerSlot[] = [];
  const emittedGroupSlots = new Set<string>();
  for (const slot of template.layers) {
    if (!slot.groupSlotId || !groupIdMap.has(slot.groupSlotId)) {
      orderedSlots.push(slot);
      continue;
    }
    if (emittedGroupSlots.has(slot.groupSlotId)) continue;
    emittedGroupSlots.add(slot.groupSlotId);
    for (const member of template.layers) {
      if (member.groupSlotId === slot.groupSlotId) orderedSlots.push(member);
    }
  }

  const layers: InstantiatedTemplateLayer[] = orderedSlots.map((slot) => {
    const freshLayerId = allocateCollisionFreeId(`${prefix}-layer`, usedLayerIds, layerCounter);
    const mappedGroupId = slot.groupSlotId ? groupIdMap.get(slot.groupSlotId) : undefined;
    return {
      id: freshLayerId,
      name: slot.name,
      type: documentTypeFromEntryKind(slot.layerKind),
      layerKind: slot.layerKind,
      ...(mappedGroupId ? { groupId: mappedGroupId } : {}),
      ...(slot.role ? { role: slot.role } : {}),
      ...(slot.color ? { color: slot.color } : {}),
      opacity: clampUnitOpacity(slot.opacity ?? 1),
      ...(slot.blendMode ? { blendMode: slot.blendMode } : {}),
      ...(slot.clipBelow ? { clipBelow: true } : {}),
      ...(slot.alphaLocked ? { alphaLocked: true } : {}),
      ...(slot.fillReference ? { fillReference: true } : {}),
      ...(slot.hidden ? { hidden: true } : {}),
      ...(slot.locked ? { locked: true } : {}),
      ...(slot.expressionColor ? { expressionColor: slot.expressionColor } : {}),
    };
  });

  return { groups, layers, groupIdMap };
}

const TRANSPARENT_1PX_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=";

/** 인스턴스화된 레이어 템플릿 슬롯을 실제 페이지 문서 요소(`El[]`)로 구체화한다. */
export function buildPageElementsFromInstantiatedTemplate(
  instantiated: InstantiatedLayerTemplateResult,
  bounds: { readonly width?: number; readonly height?: number } = {},
): El[] {
  const w = Math.max(64, Math.round(bounds.width ?? 800));
  const h = Math.max(64, Math.min(1200, Math.round(bounds.height ?? 1200)));
  return instantiated.layers.map((layer): El => {
    const meta = {
      name: layer.name, opacity: layer.opacity,
      ...(layer.groupId ? { groupId: layer.groupId } : {}),
      ...(layer.role ? { layerRole: layer.role } : {}),
      ...(layer.color ? { layerColor: layer.color } : {}),
      ...(layer.blendMode ? { blendMode: layer.blendMode } : {}),
      ...(layer.clipBelow ? { clipBelow: true } : {}),
      ...(layer.alphaLocked ? { alphaLocked: true } : {}),
      ...(layer.hidden ? { hidden: true } : {}),
      ...(layer.locked ? { locked: true } : {}),
    };
    if (layer.type === "draw") return { id: layer.id, type: "draw", kind: "freehand", points: [], stroke: "#111827", strokeWidth: 3, ...meta };
    if (layer.type === "bubble") return { id: layer.id, type: "bubble", variant: "speech", text: "", x: Math.round(w * 0.15), y: 80, width: Math.round(w * 0.45), height: 140, fill: "#ffffff", textFill: "#111827", rotation: 0, ...meta };
    if (layer.type === "text") return { id: layer.id, type: "text", text: layer.name, x: Math.round(w * 0.15), y: 80, width: Math.round(w * 0.5), fontSize: 24, fill: "#111827", rotation: 0, ...meta };
    if (layer.type === "frame") return { id: layer.id, type: "frame", x: 40, y: 40, width: w - 80, height: Math.max(200, Math.round(h * 0.4)), stroke: "#111827", strokeWidth: 3, ...meta };
    if (layer.type === "focusLines") return { id: layer.id, type: "focusLines", x: 0, y: 0, width: w, height: h, lineCount: 36, innerRadius: 120, outerRadius: Math.round(w * 0.6), stroke: "#111827", strokeWidth: 2, noise: 0.25, rotation: 0, ...meta };
    return { id: layer.id, type: "image", src: TRANSPARENT_1PX_PNG, x: 0, y: 0, width: w, height: h, rotation: 0, ...(layer.fillReference ? { fillReference: true } : {}), ...meta };
  });
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 선택된 벡터 획들을 클립보드 복사용 독립형 SVG 1.1 마크업으로 직렬화한다 (`editactioncopyvectorassvg`). */
export function serializeVectorsToClipboardSvg(
  strokes: readonly VectorClipboardStrokeInput[],
  options: VectorClipboardSvgOptions = {},
): string {
  const padding = typeof options.paddingPx === "number" && Number.isFinite(options.paddingPx) ? Math.max(0, options.paddingPx) : 8;
  const validStrokes: Array<{ readonly stroke: VectorClipboardStrokeInput; readonly coords: readonly number[] }> = [];
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;

  for (const item of strokes) {
    if (!Array.isArray(item.points) || item.points.length < 2) continue;
    const pairCount = Math.floor(item.points.length / 2);
    const coords: number[] = [];
    let valid = true;
    for (let i = 0; i < pairCount * 2; i += 2) {
      const x = item.points[i]!, y = item.points[i + 1]!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) { valid = false; break; }
      coords.push(roundCoord(x), roundCoord(y));
    }
    if (!valid || coords.length < 2) continue;
    const halfWidth = Math.max(0.5, (item.strokeWidth ?? 2) * 0.5);
    for (let i = 0; i < coords.length; i += 2) {
      const x = coords[i]!, y = coords[i + 1]!;
      if (x - halfWidth < minX) minX = x - halfWidth;
      if (y - halfWidth < minY) minY = y - halfWidth;
      if (x + halfWidth > maxX) maxX = x + halfWidth;
      if (y + halfWidth > maxY) maxY = y + halfWidth;
    }
    validStrokes.push({ stroke: item, coords });
  }

  const explicitW = typeof options.width === "number" && Number.isFinite(options.width) && options.width > 0 ? roundCoord(options.width) : null;
  const explicitH = typeof options.height === "number" && Number.isFinite(options.height) && options.height > 0 ? roundCoord(options.height) : null;
  const vbX = explicitW !== null ? 0 : validStrokes.length > 0 ? roundCoord(minX - padding) : 0;
  const vbY = explicitH !== null ? 0 : validStrokes.length > 0 ? roundCoord(minY - padding) : 0;
  const vbW = explicitW ?? (validStrokes.length > 0 ? Math.max(1, roundCoord(maxX - minX + padding * 2)) : 100);
  const vbH = explicitH ?? (validStrokes.length > 0 ? Math.max(1, roundCoord(maxY - minY + padding * 2)) : 100);

  const elementsXml: string[] = [];
  if (options.title && options.title.trim()) elementsXml.push(`  <title>${escapeXmlAttr(options.title.trim())}</title>`);

  for (const { stroke, coords } of validStrokes) {
    const color = escapeXmlAttr(stroke.stroke?.trim() || "#000000");
    const fill = escapeXmlAttr(stroke.fill?.trim() || "none");
    const strokeWidth = typeof stroke.strokeWidth === "number" && Number.isFinite(stroke.strokeWidth) ? Math.max(0.1, roundCoord(stroke.strokeWidth)) : 2;
    const opacity = clampUnitOpacity(stroke.opacity ?? 1);
    const idAttr = stroke.id ? ` id="${escapeXmlAttr(stroke.id)}"` : "";
    const opacityAttr = opacity < 1 ? ` opacity="${opacity}"` : "";

    if (coords.length === 2) {
      elementsXml.push(`  <circle${idAttr} cx="${coords[0]}" cy="${coords[1]}" r="${roundCoord(strokeWidth / 2)}" fill="${color}"${opacityAttr} />`);
      continue;
    }
    const commands: string[] = [`M ${coords[0]} ${coords[1]}`];
    for (let i = 2; i < coords.length; i += 2) commands.push(`L ${coords[i]} ${coords[i + 1]}`);
    if (stroke.closed) commands.push("Z");
    elementsXml.push(`  <path${idAttr} d="${commands.join(" ")}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="${stroke.lineCap ?? "round"}" stroke-linejoin="${stroke.lineJoin ?? "round"}"${opacityAttr} />`);
  }

  return [`<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">`, ...elementsXml, `</svg>`].join("\n");
}
