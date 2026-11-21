/**
 * Studio Live Component & W3C DTCG Design Token Bridge + Multi-Edit Batch Engine.
 *
 * 기존 `studio-component-instance-core.ts`와 `studio-webtoon-design-tokens.ts` 코어를
 * 실제 2D 캔버스·슬롯·W3C DTCG 토큰·Multi-Edit 워크플로로 연결한다:
 *   1) Figma GA Slots (`minChildren`/`maxChildren`/`allowPreferredValuesOnly`/`stretchChildOnInsert`) 가드레일.
 *   2) W3C DTCG(`.tokens.json`) 양방향 Import/Export(`{alias}` 해석 + 순환 차단) + 캔버스 모드 1클릭 전환 + CSS Inspect.
 *   3) Figma Multi-Edit: 여러 프레임/컷 간 매칭 레이어 자동 선택 + 로컬 피벗 보존 일괄 편집 단일 Undo 트랜잭션 패치.
 */

import {
  resolveStudioComponentInstance,
  type StudioComponentDocument,
  type StudioComponentJsonObject,
  type StudioResolvedComponentInstance,
} from "../studio-component-instance-core";
import {
  createStudioWebtoonDesignTokenDocument,
  resolveStudioWebtoonDesignToken,
  STUDIO_WEBTOON_BUILTIN_MODE_AXES,
  STUDIO_WEBTOON_DESIGN_TOKEN_VERSION,
  type StudioWebtoonDesignToken,
  type StudioWebtoonDesignTokenDocument,
} from "../studio-webtoon-design-tokens";

import type { El } from "../studio-element-model";

export interface LiveSlotSettings {
  readonly slotId: string;
  readonly labelKo: string;
  readonly minChildren: number;
  readonly maxChildren: number;
  readonly allowPreferredValuesOnly: boolean;
  readonly preferredComponentIds: readonly string[];
  readonly stretchChildOnInsert: boolean;
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface LiveSlotChildItem {
  readonly id: string;
  readonly name: string;
  readonly kind: "component-ref" | "bubble" | "text" | "draw" | "frame" | "badge";
  readonly componentId?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly props: Readonly<Record<string, unknown>>;
}

export interface LiveComponentSlotContainer {
  readonly instanceId: string;
  readonly componentId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly slots: readonly LiveSlotSettings[];
  readonly slotChildren: Readonly<Record<string, readonly LiveSlotChildItem[]>>;
  readonly variantSelection: Readonly<Record<string, string>>;
}

export type SlotGuardrailErrorCode =
  | "UNKNOWN_SLOT"
  | "MAX_CHILDREN_EXCEEDED"
  | "MIN_CHILDREN_VIOLATION"
  | "PREFERRED_COMPONENT_REQUIRED"
  | "DUPLICATE_CHILD_ID"
  | "CHILD_NOT_FOUND";

export type SlotMutationResult =
  | { readonly ok: true; readonly container: LiveComponentSlotContainer; readonly insertedChild?: LiveSlotChildItem }
  | { readonly ok: false; readonly code: SlotGuardrailErrorCode; readonly messageKo: string };

export interface ProjectedComponentCanvasNode {
  readonly nodeId: string;
  readonly instanceId: string;
  readonly componentId: string;
  readonly payloadFingerprint: string;
  readonly variantSelection: Readonly<Record<string, string>>;
  readonly payload: StudioComponentJsonObject;
  readonly updateAvailable: boolean;
}

export type DtcgTokenType = "color" | "dimension" | "fontFamily" | "fontWeight" | "number" | "typography" | "strokeStyle";
export interface DtcgTokenLeaf { readonly $value: unknown; readonly $type?: DtcgTokenType; readonly $description?: string; readonly $extensions?: Readonly<Record<string, unknown>>; }
export interface DtcgTokenGroup { readonly $type?: DtcgTokenType; readonly $description?: string; readonly [key: string]: DtcgTokenLeaf | DtcgTokenGroup | string | undefined; }

export type LiveTokenBindableProperty = "fill" | "stroke" | "textFill" | "font" | "fontSize" | "strokeWidth" | "bg";
export interface LiveTokenElementBinding { readonly elementId: string; readonly property: LiveTokenBindableProperty; readonly tokenId: string; readonly tokenField: string; }

export interface ApplyDesignTokenModesResult {
  readonly elements: readonly El[];
  readonly activeModes: Readonly<Record<string, string>>;
  readonly changedElementIds: readonly string[];
  readonly resolvedByBindingKey: Readonly<Record<string, string | number>>;
  readonly unresolvedBindings: readonly LiveTokenElementBinding[];
}

export interface DtcgImportResult {
  readonly document: StudioWebtoonDesignTokenDocument;
  readonly importedTokenCount: number;
  readonly resolvedAliasCount: number;
  readonly warnings: readonly string[];
}

export interface MultiEditNode {
  readonly id: string;
  readonly containerId: string;
  readonly name: string;
  readonly slotId?: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly style: Readonly<Record<string, unknown>>;
  readonly text?: string;
}

export interface MultiEditContainer { readonly containerId: string; readonly name: string; readonly nodes: readonly MultiEditNode[]; }
export type MultiEditMatchStrategy = "name" | "slot" | "name-and-type";

export type MultiEditCommand =
  | { readonly kind: "translate"; readonly dx: number; readonly dy: number }
  | { readonly kind: "rotate-local"; readonly deltaDeg: number }
  | { readonly kind: "scale-local"; readonly scaleX: number; readonly scaleY: number }
  | { readonly kind: "set-style"; readonly patch: Readonly<Record<string, unknown>> }
  | { readonly kind: "set-text"; readonly text: string };

export interface MultiEditNodeChange { readonly containerId: string; readonly nodeId: string; readonly before: MultiEditNode; readonly after: MultiEditNode; }
export interface MultiEditBatchPatch { readonly transactionId: string; readonly undoLabelKo: string; readonly commandKind: MultiEditCommand["kind"]; readonly changes: readonly MultiEditNodeChange[]; }

const round2 = (v: number): number => Math.round(v * 100) / 100;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isDtcgLeaf = (n: unknown): n is DtcgTokenLeaf => isRecord(n) && Object.hasOwn(n, "$value");

function lookupNestedField(obj: unknown, fieldPath: string): unknown {
  let cur: unknown = obj;
  for (const part of fieldPath.split(".").filter(Boolean)) {
    if (!isRecord(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Detach 없이 슬롯에 자식을 삽입하며 `SlotSettings` 가드레일을 강제한다. */
export function insertChildIntoComponentSlot(container: LiveComponentSlotContainer, slotId: string, child: LiveSlotChildItem): SlotMutationResult {
  const slot = container.slots.find((s) => s.slotId === slotId);
  if (!slot) return { ok: false, code: "UNKNOWN_SLOT", messageKo: "지정한 슬롯을 찾을 수 없습니다." };
  const existing = container.slotChildren[slotId] ?? [];
  if (existing.some((it) => it.id === child.id)) return { ok: false, code: "DUPLICATE_CHILD_ID", messageKo: "같은 ID의 슬롯 요소가 이미 존재합니다." };
  if (existing.length >= slot.maxChildren) return { ok: false, code: "MAX_CHILDREN_EXCEEDED", messageKo: `이 슬롯에는 최대 ${slot.maxChildren}개까지 넣을 수 있습니다.` };
  if (slot.allowPreferredValuesOnly && !(child.componentId && slot.preferredComponentIds.includes(child.componentId))) {
    return { ok: false, code: "PREFERRED_COMPONENT_REQUIRED", messageKo: "권장 컴포넌트로 지정된 항목만 이 슬롯에 삽입할 수 있습니다." };
  }
  const insertedChild: LiveSlotChildItem = slot.stretchChildOnInsert
    ? { ...child, x: round2(container.x + slot.bounds.x), y: round2(container.y + slot.bounds.y), width: round2(slot.bounds.width), height: round2(slot.bounds.height) }
    : child;
  return { ok: true, insertedChild, container: { ...container, slotChildren: { ...container.slotChildren, [slotId]: [...existing, insertedChild] } } };
}

/** 슬롯에서 자식을 제거하며 `minChildren` 하한을 보호한다. */
export function removeChildFromComponentSlot(container: LiveComponentSlotContainer, slotId: string, childId: string): SlotMutationResult {
  const slot = container.slots.find((s) => s.slotId === slotId);
  if (!slot) return { ok: false, code: "UNKNOWN_SLOT", messageKo: "지정한 슬롯을 찾을 수 없습니다." };
  const existing = container.slotChildren[slotId] ?? [];
  if (!existing.some((it) => it.id === childId)) return { ok: false, code: "CHILD_NOT_FOUND", messageKo: "제거할 슬롯 요소를 찾지 못했습니다." };
  if (existing.length - 1 < slot.minChildren) return { ok: false, code: "MIN_CHILDREN_VIOLATION", messageKo: `이 슬롯에는 최소 ${slot.minChildren}개 이상의 요소가 필요합니다.` };
  return { ok: true, container: { ...container, slotChildren: { ...container.slotChildren, [slotId]: existing.filter((it) => it.id !== childId) } } };
}

/** 기존 `studio-component-instance-core` 인스턴스를 캔버스 투영 노드로 변환한다. */
export function projectCoreComponentInstanceToCanvas(document: StudioComponentDocument, instanceId: string): ProjectedComponentCanvasNode {
  const resolved: StudioResolvedComponentInstance = resolveStudioComponentInstance(document, instanceId);
  return {
    nodeId: `cmp-node:${resolved.instanceId}`,
    instanceId: resolved.instanceId,
    componentId: resolved.componentId,
    payloadFingerprint: resolved.payloadFingerprint,
    variantSelection: resolved.variantSelection,
    payload: resolved.payload,
    updateAvailable: resolved.updateAvailable,
  };
}

/** `StudioWebtoonDesignTokenDocument`를 W3C DTCG `.tokens.json` 구조로 내보낸다. */
export function exportWebtoonTokensToDtcg(document: StudioWebtoonDesignTokenDocument, activeModes?: Readonly<Record<string, string>>): DtcgTokenGroup {
  const root: Record<string, Record<string, unknown>> = {};
  for (const token of document.tokens) {
    const resolved = resolveStudioWebtoonDesignToken(document, token.id, { modes: activeModes });
    const group = (root[token.category] ??= {});
    const val = resolved.value;

    if (token.category === "palette") {
      const pv = val as { readonly colors: readonly string[]; readonly roles: Readonly<Record<string, string>> };
      const roleNodes: Record<string, DtcgTokenLeaf> = {};
      for (const [role, color] of Object.entries(pv.roles)) roleNodes[role] = { $type: "color", $value: color, $description: `${token.label} · ${role}` };
      group[token.id] = { $description: token.label, ...roleNodes, ...(pv.colors[0] ? { swatches: { $type: "color", $value: pv.colors[0], $extensions: { "studio.colors": [...pv.colors] } } } : {}) };
    } else if (token.category === "typography") {
      const tv = val as { readonly fontFamily: string; readonly fontSizePx: number; readonly lineHeight: number; readonly fontWeight: number; readonly letterSpacingPx: number; readonly color: string };
      group[token.id] = { $type: "typography", $description: token.label, $value: { fontFamily: tv.fontFamily, fontSize: `${tv.fontSizePx}px`, fontWeight: tv.fontWeight, lineHeight: tv.lineHeight, letterSpacing: `${tv.letterSpacingPx}px` }, $extensions: { "studio.color": tv.color, "studio.modes": resolved.activeModes } };
    } else if (token.category === "spacing") {
      const sv = val as { readonly panelGutterPx: number; readonly contentMarginPx: number };
      group[token.id] = { $description: token.label, panelGutter: { $type: "dimension", $value: `${sv.panelGutterPx}px` }, contentMargin: { $type: "dimension", $value: `${sv.contentMarginPx}px` } };
    } else if (token.category === "stroke") {
      const st = val as { readonly color: string; readonly widthPx: number; readonly lineCap: string; readonly lineJoin: string };
      group[token.id] = { $type: "strokeStyle", $description: token.label, $value: { lineCap: st.lineCap, dashArray: [] }, $extensions: { "studio.color": st.color, "studio.widthPx": st.widthPx, "studio.lineJoin": st.lineJoin } };
    } else if (token.category === "bubble") {
      const bb = val as { readonly fill: string; readonly textColor: string; readonly borderColor: string; readonly borderWidthPx: number; readonly fontFamily: string; readonly fontSizePx: number };
      group[token.id] = { $description: token.label, fill: { $type: "color", $value: bb.fill }, textColor: { $type: "color", $value: bb.textColor }, borderColor: { $type: "color", $value: bb.borderColor }, borderWidth: { $type: "dimension", $value: `${bb.borderWidthPx}px` }, fontFamily: { $type: "fontFamily", $value: bb.fontFamily }, fontSize: { $type: "dimension", $value: `${bb.fontSizePx}px` } };
    }
  }
  return root as unknown as DtcgTokenGroup;
}

function parsePxDimension(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const m = /^(-?\d+(?:\.\d+)?)px$/i.exec(value.trim());
    if (m) return Number(m[1]);
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

/** W3C DTCG `.tokens.json`을 `{alias.path}` 해석(순환 차단)과 함께 가져온다. */
export function importDtcgToWebtoonTokenDocument(dtcgRoot: DtcgTokenGroup): DtcgImportResult {
  const leaves = new Map<string, { readonly value: unknown; readonly type?: DtcgTokenType; readonly description?: string; readonly extensions?: Readonly<Record<string, unknown>> }>();
  const warnings: string[] = [];

  const walk = (node: unknown, prefix: string, inheritedType?: DtcgTokenType): void => {
    if (!isRecord(node)) return;
    const groupType = typeof node.$type === "string" ? (node.$type as DtcgTokenType) : inheritedType;
    if (isDtcgLeaf(node)) {
      leaves.set(prefix, { value: node.$value, type: (node.$type ?? groupType) as DtcgTokenType | undefined, description: typeof node.$description === "string" ? node.$description : undefined, extensions: isRecord(node.$extensions) ? node.$extensions : undefined });
      return;
    }
    for (const [k, child] of Object.entries(node)) if (!k.startsWith("$")) walk(child, prefix ? `${prefix}.${k}` : k, groupType);
  };
  walk(dtcgRoot, "");

  let resolvedAliasCount = 0;
  const resolveVal = (raw: unknown, trail: Set<string>): unknown => {
    if (typeof raw === "string") {
      const m = /^\{([a-zA-Z0-9._-]+)\}$/.exec(raw.trim());
      if (m) {
        const refPath = m[1]!;
        if (trail.has(refPath)) { warnings.push(`순환 토큰 별칭 참조를 차단했습니다: ${refPath}`); return undefined; }
        const target = leaves.get(refPath);
        if (!target) { warnings.push(`존재하지 않는 토큰 별칭 참조입니다: ${refPath}`); return undefined; }
        resolvedAliasCount += 1;
        const nextTrail = new Set(trail);
        nextTrail.add(refPath);
        return resolveVal(target.value, nextTrail);
      }
    }
    if (isRecord(raw)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) out[k] = resolveVal(v, trail);
      return out;
    }
    return raw;
  };

  const tokens: StudioWebtoonDesignToken[] = [], paletteColors: string[] = [], paletteRoles: Record<string, string> = {};
  for (const [path, leaf] of leaves.entries()) {
    const resolved = resolveVal(leaf.value, new Set([path]));
    if (resolved === undefined) continue;
    const safeId = path.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
    if (leaf.type === "color" && typeof resolved === "string") {
      paletteColors.push(resolved); paletteRoles[safeId] = resolved;
    } else if (leaf.type === "typography" && isRecord(resolved)) {
      const extColor = typeof leaf.extensions?.["studio.color"] === "string" ? leaf.extensions["studio.color"] : undefined;
      tokens.push({ id: safeId, label: leaf.description ?? path, category: "typography", value: { fontFamily: typeof resolved.fontFamily === "string" ? resolved.fontFamily : "Pretendard", fontSizePx: parsePxDimension(resolved.fontSize, 20), fontWeight: typeof resolved.fontWeight === "number" ? resolved.fontWeight : 500, lineHeight: typeof resolved.lineHeight === "number" ? resolved.lineHeight : 1.3, letterSpacingPx: parsePxDimension(resolved.letterSpacing, 0), ...(extColor ? { color: extColor } : {}) } });
    } else if (leaf.type === "dimension") {
      const px = Math.max(0, parsePxDimension(resolved, 16));
      tokens.push({ id: safeId, label: leaf.description ?? path, category: "spacing", value: { panelGutterPx: px, contentMarginPx: px } });
    } else if (leaf.type === "strokeStyle") {
      const extColor = typeof leaf.extensions?.["studio.color"] === "string" ? leaf.extensions["studio.color"] : undefined;
      const extWidth = typeof leaf.extensions?.["studio.widthPx"] === "number" ? leaf.extensions["studio.widthPx"] : 2;
      tokens.push({ id: safeId, label: leaf.description ?? path, category: "stroke", value: { ...(extColor ? { color: extColor } : {}), widthPx: Math.max(0.25, extWidth) } });
    }
  }
  if (paletteColors.length > 0) {
    tokens.unshift({ id: "dtcg-palette", label: "DTCG 가져오기 팔레트", category: "palette", value: { colors: paletteColors, roles: paletteRoles } });
  }
  const document = createStudioWebtoonDesignTokenDocument({ version: STUDIO_WEBTOON_DESIGN_TOKEN_VERSION, axes: STUDIO_WEBTOON_BUILTIN_MODE_AXES, tokens });
  return { document, importedTokenCount: tokens.length, resolvedAliasCount, warnings };
}

function patchElementProperty(el: El, property: LiveTokenBindableProperty, val: string | number): { readonly next: El; readonly changed: boolean } {
  if (el.type === "bubble") {
    if (property === "fill" && typeof val === "string" && el.fill !== val) return { next: { ...el, fill: val }, changed: true };
    if (property === "textFill" && typeof val === "string" && el.textFill !== val) return { next: { ...el, textFill: val }, changed: true };
    if (property === "stroke" && typeof val === "string" && el.stroke !== val) return { next: { ...el, stroke: val }, changed: true };
    if (property === "font" && typeof val === "string" && el.font !== val) return { next: { ...el, font: val }, changed: true };
    if (property === "fontSize" && typeof val === "number" && el.fontSize !== val) return { next: { ...el, fontSize: val }, changed: true };
    if (property === "strokeWidth" && typeof val === "number" && el.strokeWidth !== val) return { next: { ...el, strokeWidth: val }, changed: true };
  } else if (el.type === "text") {
    if (property === "fill" && typeof val === "string" && el.fill !== val) return { next: { ...el, fill: val }, changed: true };
    if (property === "font" && typeof val === "string" && el.font !== val) return { next: { ...el, font: val }, changed: true };
    if (property === "fontSize" && typeof val === "number" && el.fontSize !== val) return { next: { ...el, fontSize: val }, changed: true };
  } else if (el.type === "draw") {
    if (property === "stroke" && typeof val === "string" && el.stroke !== val) return { next: { ...el, stroke: val }, changed: true };
    if (property === "fill" && typeof val === "string" && el.fill !== val) return { next: { ...el, fill: val }, changed: true };
    if (property === "strokeWidth" && typeof val === "number" && el.strokeWidth !== val) return { next: { ...el, strokeWidth: val }, changed: true };
  } else if (el.type === "frame") {
    if (property === "bg" && typeof val === "string" && el.bgColor !== val) return { next: { ...el, bgColor: val, bg: val }, changed: true };
    if (property === "stroke" && typeof val === "string" && el.stroke !== val) return { next: { ...el, stroke: val }, changed: true };
    if (property === "strokeWidth" && typeof val === "number" && el.strokeWidth !== val) return { next: { ...el, strokeWidth: val }, changed: true };
  }
  return { next: el, changed: false };
}

/** 활성 모드(`밤/회상/인쇄/영어`)에 따라 바인딩된 캔버스 요소 속성을 한 번에 전환한다. */
export function applyDesignTokenModesToCanvas(
  elements: readonly El[],
  bindings: readonly LiveTokenElementBinding[],
  tokenDoc: StudioWebtoonDesignTokenDocument,
  activeModes: Readonly<Record<string, string>>,
): ApplyDesignTokenModesResult {
  const byEl = new Map<string, LiveTokenElementBinding[]>();
  for (const b of bindings) { const arr = byEl.get(b.elementId); if (arr) arr.push(b); else byEl.set(b.elementId, [b]); }
  const resolvedByBindingKey: Record<string, string | number> = {}, unresolvedBindings: LiveTokenElementBinding[] = [], changedElementIds: string[] = [];

  const nextElements = elements.map((el) => {
    const elBindings = byEl.get(el.id);
    if (!elBindings) return el;
    let cur = el, dirty = false;
    for (const b of elBindings) {
      let resolvedValue: unknown;
      try { resolvedValue = lookupNestedField(resolveStudioWebtoonDesignToken(tokenDoc, b.tokenId, { modes: activeModes }).value, b.tokenField); }
      catch { unresolvedBindings.push(b); continue; }
      if (typeof resolvedValue !== "string" && typeof resolvedValue !== "number") { unresolvedBindings.push(b); continue; }
      resolvedByBindingKey[`${b.elementId}:${b.property}`] = resolvedValue;
      const res = patchElementProperty(cur, b.property, resolvedValue);
      if (res.changed) { cur = res.next; dirty = true; }
    }
    if (dirty) changedElementIds.push(el.id);
    return cur;
  });
  return { elements: nextElements, activeModes, changedElementIds, resolvedByBindingKey, unresolvedBindings };
}

export function exportResolvedTokensToCssVariables(tokenDoc: StudioWebtoonDesignTokenDocument, activeModes?: Readonly<Record<string, string>>): string {
  const decls: string[] = [];
  for (const token of tokenDoc.tokens) {
    const resolved = resolveStudioWebtoonDesignToken(tokenDoc, token.id, { modes: activeModes });
    const slug = token.id.replace(/[^a-zA-Z0-9_-]/g, "-");
    if (token.category === "palette") {
      for (const [role, hex] of Object.entries((resolved.value as { readonly roles: Readonly<Record<string, string>> }).roles)) {
        decls.push(`  --ts-${slug}-${role.replace(/[^a-zA-Z0-9_-]/g, "-")}: ${hex};`);
      }
    } else if (token.category === "typography") {
      const v = resolved.value as { readonly fontFamily: string; readonly fontSizePx: number; readonly lineHeight: number };
      decls.push(`  --ts-${slug}-font: ${v.fontFamily};`, `  --ts-${slug}-size: ${v.fontSizePx}px;`, `  --ts-${slug}-leading: ${v.lineHeight};`);
    } else if (token.category === "spacing") {
      const v = resolved.value as { readonly panelGutterPx: number; readonly contentMarginPx: number };
      decls.push(`  --ts-${slug}-gutter: ${v.panelGutterPx}px;`, `  --ts-${slug}-margin: ${v.contentMarginPx}px;`);
    } else if (token.category === "stroke") {
      const v = resolved.value as { readonly color: string; readonly widthPx: number };
      decls.push(`  --ts-${slug}-color: ${v.color};`, `  --ts-${slug}-width: ${v.widthPx}px;`);
    }
  }
  return `:root {\n${decls.join("\n")}\n}`;
}

export function selectMatchingLayersForMultiEdit(containers: readonly MultiEditContainer[], seedNodeId: string, strategy: MultiEditMatchStrategy = "name-and-type"): readonly string[] {
  let seed: MultiEditNode | null = null;
  for (const c of containers) { const found = c.nodes.find((n) => n.id === seedNodeId); if (found) { seed = found; break; } }
  if (!seed) return [];
  const matched: string[] = [];
  for (const c of containers) {
    for (const n of c.nodes) {
      const ok = strategy === "slot" ? Boolean(seed.slotId && n.slotId === seed.slotId) : strategy === "name" ? n.name === seed.name : n.name === seed.name && n.type === seed.type;
      if (ok) matched.push(n.id);
    }
  }
  return matched;
}

function applyCommandToNode(node: MultiEditNode, cmd: MultiEditCommand): MultiEditNode {
  if (cmd.kind === "translate") return { ...node, x: round2(node.x + cmd.dx), y: round2(node.y + cmd.dy) };
  if (cmd.kind === "rotate-local") return { ...node, rotation: round2((node.rotation + cmd.deltaDeg) % 360) };
  if (cmd.kind === "scale-local") {
    const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
    const w = Math.max(1, round2(node.width * cmd.scaleX)), h = Math.max(1, round2(node.height * cmd.scaleY));
    return { ...node, x: round2(cx - w / 2), y: round2(cy - h / 2), width: w, height: h };
  }
  if (cmd.kind === "set-style") return { ...node, style: { ...node.style, ...cmd.patch } };
  return { ...node, text: cmd.text };
}

const MULTI_EDIT_UNDO_LABEL: Readonly<Record<MultiEditCommand["kind"], string>> = Object.freeze({
  translate: "멀티 선택 일괄 이동",
  "rotate-local": "멀티 선택 개별 회전",
  "scale-local": "멀티 선택 개별 크기 조절",
  "set-style": "멀티 선택 스타일 일괄 변경",
  "set-text": "멀티 선택 텍스트 일괄 변경",
});

export function buildMultiEditBatchPatch(containers: readonly MultiEditContainer[], selectedNodeIds: readonly string[], command: MultiEditCommand, transactionId = "multi-edit-tx-1"): MultiEditBatchPatch {
  const selected = new Set(selectedNodeIds);
  const changes: MultiEditNodeChange[] = [];
  for (const c of containers) {
    for (const n of c.nodes) if (selected.has(n.id)) changes.push({ containerId: c.containerId, nodeId: n.id, before: n, after: applyCommandToNode(n, command) });
  }
  return { transactionId, undoLabelKo: MULTI_EDIT_UNDO_LABEL[command.kind], commandKind: command.kind, changes };
}

export function applyMultiEditBatchPatch(containers: readonly MultiEditContainer[], batchPatch: MultiEditBatchPatch): readonly MultiEditContainer[] {
  const afterById = new Map<string, MultiEditNode>(batchPatch.changes.map((ch) => [ch.nodeId, ch.after]));
  return containers.map((c) => {
    let touched = false;
    const nodes = c.nodes.map((n) => { const next = afterById.get(n.id); if (!next) return n; touched = true; return next; });
    return touched ? { ...c, nodes } : c;
  });
}

export function invertMultiEditBatchPatch(batchPatch: MultiEditBatchPatch): MultiEditBatchPatch {
  return {
    transactionId: `${batchPatch.transactionId}:undo`,
    undoLabelKo: `${batchPatch.undoLabelKo} 되돌리기`,
    commandKind: batchPatch.commandKind,
    changes: batchPatch.changes.map((ch) => ({ containerId: ch.containerId, nodeId: ch.nodeId, before: ch.after, after: ch.before })),
  };
}
