/**
 * 섞기(랜덤 + 잠금) — 레시피 v3 "내 룩" 섹션(2026-10-23 S-1). 순수·결정적: 같은 레시피·카탈로그·능력·팩·잠금·시드면 같은 결과다
 * (`Math.random` 금지 — `shared/prng` mulberry32). 결과는 look/1 문서(scope `full`)라 그대로 `look-preset/apply` 한 번(history 1단계)으로 적용한다.
 *
 * 잠금 그룹(계약 `LOOK_LOCK_GROUPS`)과 레시피 구역:
 * - 화풍(style): `style`(팩 출처·비례·중립 표정)·`look`·툰 3필드. 비례는 몸이, 중립 표정은 얼굴이 풀려 있을 때만 바꾼다(잠그면 지금 값을 싣는다).
 * - 얼굴(face): 얼굴 6슬롯 + **헤어 슬롯**(머리 모양은 옷보다 인물 정체성에 가깝다 — 옷을 섞어도 헤어는 그대로)·얼굴 파라미터·헤어 형태 값.
 * - 몸(body): 체형 슬롯·체형 파라미터. 색(colors): 27채널 색·헤어 색 흐름.
 * - 옷(outfit): 상의·하의·신발 슬롯·겹쳐 입기 층·의상 채널 표면·의상 형태 값. 소품(accessories): 액세서리 슬롯·추가 소품·소품 표면·소품 형태 값.
 * 구역이 두 그룹에 걸치면(옷장·표면·형태 값·화풍 구역) 잠근 쪽 몫은 지금 레시피 값을 그대로 싣는다 — 그래서 적용해도 잠근 값은 바뀌지 않는다.
 *
 * 품질 규칙:
 * - 그룹마다 따로 PRNG(시드·그룹 이름에서 만든다)를 쓰고 추출 횟수를 고정해, 다른 그룹을 잠그거나 풀어도 이 그룹 결과가 흔들리지 않는다.
 * - 소스가 그리지 못하는 것은 만들지 않는다: 슬롯 능력 unavailable·프리셋 단위 미제공 프리셋은 고르지 않고, 커스터마이즈 능력(`custom`)이
 *   없거나 지원하지 않는 층·앵커(추가 소품)·무늬(UV1)·헤어 흐름은 섞지 않는다(그 값은 지금 값을 둔다 — 지우지도 않는다).
 *   색을 섞으면 직접 지정한 상속 채널은 상속으로 돌아가고(새 기본 색을 따라간다), 소스가 따로 칠하는 상속 채널만 새로 정한다.
 * - 형태 키는 소스가 **지금 올린 파츠**에 대해 보고한 이름이라, 파츠(프리셋)가 그대로인 범위만 새 값을 뽑고 파츠가 바뀐 범위는 비운다
 *   (파츠는 그대로인데 소스가 형태 키를 보고하지 않으면 지금 값을 둔다).
 * - 카탈로그 충돌(`conflictsWith`)이 생기는 프리셋은 고르지 않는다(값이 정해진 슬롯 기준). 고를 것이 없으면 지금 값을 두고 알린다.
 * - 화풍을 섞었거나 잠근 화풍이 있으면 얼굴은 그 화풍의 소스별 얼굴 매핑(눈·눈동자·얼굴 값), 몸은 체형 오프셋을 따른다(주입 `styleBinding`).
 * - 층은 바탕 프리셋과 어울리는 것만 고른다(주입 `layerOptions` — 청바지 위 레그웨어 같은 조합을 만들지 않는다).
 * - 색은 OKLCh 배색(유사·보색·분할 보색·삼각·단색), 피부·헤어는 화풍 팔레트 견본에서 고른다(`look-mixer-parts.ts`).
 * 팩·매핑·소품 앵커·층 궁합은 presets 데이터라(영역 경계) composition이 주입한다:
 * `presets/art-style-packs`·`art-style-lab-bindings`(`mixerStyleBindingFor`)·`accessory-anchors`(`accessoryAnchorsFor`)·`layering`(`layerOptionsFor`).
 */
import {
  ACCESSORY_ANCHOR_LABELS_KO,
  BODY_PARAM_KEYS,
  CHANNEL_KEYS,
  CHARACTER_LOOK_FORMAT,
  DEFAULT_ACCESSORY_OFFSET,
  FACE_PARAM_KEYS,
  LOOK_LOCK_GROUPS,
  LOOK_LOCK_LABELS_KO,
  MAX_SHAPES_PER_SCOPE,
  PATTERN_LABELS_KO,
  SLOT_LABELS_KO,
  WARDROBE_LAYERS,
  WARDROBE_LAYER_LABELS_KO,
  WARDROBE_LAYER_SLOT,
  applyCharacterLook,
  characterLookSchema,
  clampExpression,
  clampProportion,
  createDefaultHairColor,
  describeRecipeIssues,
  failVisible,
  isAccessoryInstanceId,
  mergeLook,
  presetSlot,
} from "../contracts";
import { createPrng, seedFromString } from "../shared/prng";

import { presetUnavailableReasonKo } from "./apply-plan";
import { mixColors, mixSurfaces, roundTo } from "./look-mixer-parts";

import type {
  AccessoryAnchor,
  AccessoryInstance,
  ArtStylePack,
  BodyParamKey,
  ChannelKey,
  CharacterLook,
  CharacterRecipe,
  CustomCapabilities,
  LabFailure,
  LookLockGroup,
  PartScope,
  PresetCatalog,
  PresetEntry,
  PresetId,
  Proportion,
  SlotCapabilityMap,
  SlotKind,
  StyleFaceBinding,
  StyleFigure,
  Surface,
  WardrobeLayer,
} from "../contracts";
import type { Prng } from "../shared/prng";

export { LOOK_MIXER_SCHEMES, LOOK_MIXER_SCHEME_LABELS_KO, oklchHex } from "./look-mixer-parts";

/** 알고리즘 판. 바꾸면 같은 시드라도 다른 결과가 나온다(저장된 섞기 룩은 payload를 그대로 쓰므로 영향 없음). */
export const LOOK_MIXER_VERSION = 1;

/** 화풍 팩 × 소스 매핑(주입, `presets/art-style-lab-bindings` `mixerStyleBindingFor`와 같은 모양) */
export interface MixerStyleBinding {
  readonly face: StyleFaceBinding | null;
  readonly body: Readonly<Partial<Record<BodyParamKey, number>>>;
}

export interface LookMixerInput {
  readonly recipe: CharacterRecipe;
  readonly catalog: PresetCatalog;
  readonly capabilities: SlotCapabilityMap;
  /** 엔진이 보고한 커스터마이즈 능력. 없으면 층·추가 소품·무늬·헤어 흐름·상속 채널·형태 키를 섞지 않는다. */
  readonly custom?: CustomCapabilities;
  readonly packs: readonly ArtStylePack[];
  readonly styleBinding?: (pack: ArtStylePack, figure: StyleFigure) => MixerStyleBinding | null;
  /** 소품 프리셋 → 어울리는 앵커. 없으면 추가 소품을 만들지 않는다(앵커를 지어내지 않는다). */
  readonly accessoryAnchors?: (presetId: PresetId) => readonly AccessoryAnchor[];
  /** 바탕 프리셋 → 그 층에 어울리는 프리셋(`presets/layering` `layerOptionsFor`). 없으면 같은 슬롯의 다른 프리셋 아무거나 고른다. */
  readonly layerOptions?: (layer: WardrobeLayer, base: PresetId | null) => readonly PresetId[];
  readonly figure: StyleFigure;
  readonly locks: readonly LookLockGroup[];
  /** uint32 */
  readonly seed: number;
}

export interface LookMixLine {
  readonly group: LookLockGroup;
  readonly labelKo: string;
  readonly locked: boolean;
  readonly textKo: string;
}

export interface LookMixResult {
  /** `look-preset/apply`에 싣는 문서(scope full, 잠근 그룹 구역은 없거나 지금 값) */
  readonly look: CharacterLook;
  /** 적용한 레시피(미리보기·시험용) */
  readonly recipe: CharacterRecipe;
  readonly lines: readonly LookMixLine[];
  readonly descriptionKo: string;
  readonly noticesKo: readonly string[];
  /** 화풍을 섞었는데 셰이딩이 PBR이면 true(look/1 문서는 셰이딩 모드를 싣지 못한다 — 화면이 툰 모드 전환을 권한다) */
  readonly needsToonMode: boolean;
}

export type LookMixOutcome = { readonly ok: true; readonly result: LookMixResult } | { readonly ok: false; readonly failure: LabFailure };

const FACE_SLOTS: readonly SlotKind[] = ["face-shape", "eyes", "irises", "nose", "mouth", "ears", "hair"];
const IDENTITY_SLOTS: readonly SlotKind[] = ["face-shape", "eyes", "irises", "nose", "mouth", "ears"];
const OUTFIT_SLOTS = ["top", "bottom", "shoes"] as const satisfies readonly SlotKind[];
const GROUP_SLOTS: Readonly<Record<LookLockGroup, readonly SlotKind[]>> = { face: FACE_SLOTS, body: ["body"], colors: [], outfit: OUTFIT_SLOTS, accessories: ["accessory"], style: [] };
const LAYER_CHANCE: Readonly<Record<WardrobeLayer, number>> = { inner: 0.3, outer: 0.35, legwear: 0.25 };
/** 섞는 순서(앞 그룹의 결정이 뒤 그룹의 충돌 검사·팔레트 기준이 된다)이자 설명 순서 */
const MIX_ORDER: readonly LookLockGroup[] = ["style", "face", "body", "outfit", "accessories", "colors"];
const ACCESSORY_MATERIALS = ["metal", "plastic", "leather", "cloth-silk"] as const;
/** 소품 계열 채널(표면은 소품 그룹이 섞는다) */
const ACCESSORY_CHANNELS: ReadonlySet<ChannelKey> = new Set(["accessory", "accessory-accent", "hair-accessory", "hair-accessory-accent"]);
/** 옷 그룹이 표면을 섞는 의상 채널 */
const OUTFIT_SURFACE_CHANNELS: ReadonlySet<ChannelKey> = new Set([
  "top",
  "top-trim",
  "top-accent",
  "inner",
  "inner-trim",
  "outer",
  "outer-trim",
  "outer-accent",
  "bottom",
  "bottom-trim",
  "legwear",
  "shoes",
  "shoes-sole",
  "shoes-lace",
]);

/** 형태 값 범위 → 그 범위를 섞는 그룹 */
function scopeGroup(scope: string): LookLockGroup {
  if (scope === "hair") return "face";
  if (scope === "accessory" || isAccessoryInstanceId(scope)) return "accessories";
  return "outfit";
}

function groupPrng(seed: number, stream: string): Prng {
  return createPrng(seedFromString(`look-mixer/v${LOOK_MIXER_VERSION}:${seed >>> 0}:${stream}`));
}

function clampParamValue(value: number): number {
  return roundTo(Math.min(1, Math.max(-1, value)), 2);
}

function labelOf(catalog: PresetCatalog, id: PresetId | null | undefined): string {
  if (id === null || id === undefined) return "없음";
  return catalog.get(id)?.labelKo ?? id;
}

// ---------------------------------------------------------------- 섞기 상태

interface MixContext {
  readonly input: LookMixerInput;
  readonly locks: readonly LookLockGroup[];
  readonly slots: Partial<Record<SlotKind, PresetId | null>>;
  /** 값이 확정된 슬롯(잠근 그룹·이미 섞은 그룹) — 충돌 검사는 여기에만 한다 */
  readonly decided: Set<SlotKind>;
  readonly payload: Record<string, unknown>;
  readonly partParams: Record<string, Record<string, number>>;
  readonly notices: string[];
  readonly lines: Map<LookLockGroup, string>;
  readonly layers: Record<WardrobeLayer, PresetId | null>;
  accessories: AccessoryInstance[];
  readonly outfitSurfaces: Partial<Record<ChannelKey, Surface>>;
  readonly accessorySurfaces: Partial<Record<ChannelKey, Surface>>;
  /** 섞은 뒤의 화풍(섞었으면 새 팩, 잠갔으면 지금 팩) */
  activePack: ArtStylePack | null;
  /** 이번에 섞어 고른 팩 */
  mixedPack: ArtStylePack | null;
}

function unlocked(ctx: MixContext, group: LookLockGroup): boolean {
  return !ctx.locks.includes(group);
}

/** 이 소스가 고를 수 있는 슬롯 프리셋(카탈로그 순서) */
function availablePresets(ctx: MixContext, slot: SlotKind): PresetEntry[] {
  const capability = ctx.input.capabilities[slot];
  if (capability.status === "unavailable") return [];
  return ctx.input.catalog.bySlot(slot).filter((entry) => presetUnavailableReasonKo(capability, entry.id) === null);
}

function conflicts(ctx: MixContext, entry: PresetEntry): boolean {
  for (const other of entry.conflictsWith) {
    const slot = presetSlot(other);
    if (slot !== entry.slot && ctx.decided.has(slot) && ctx.slots[slot] === other) return true;
  }
  for (const slot of ctx.decided) {
    if (slot === entry.slot) continue;
    const id = ctx.slots[slot];
    if (id && ctx.input.catalog.get(id)?.conflictsWith.includes(entry.id)) return true;
  }
  return false;
}

/** 슬롯 하나를 섞는다: 후보를 섞어(추출 횟수 고정) 충돌 없는 첫 프리셋. `preferred`가 후보에 있으면 그것을 쓴다. */
function mixSlot(ctx: MixContext, rng: Prng, slot: SlotKind, preferred?: PresetId): void {
  const candidates = availablePresets(ctx, slot);
  const order = rng.shuffle([...candidates]);
  const choice = (preferred !== undefined ? candidates.find((entry) => entry.id === preferred) : undefined) ?? order.find((entry) => !conflicts(ctx, entry));
  if (choice) ctx.slots[slot] = choice.id;
  else if (candidates.length > 0) ctx.notices.push(`${SLOT_LABELS_KO[slot]}: 겹치지 않는 프리셋이 없어 그대로 두었습니다.`);
  ctx.decided.add(slot);
}

/**
 * 형태 값: 소스가 그 범위에 보고한 이름만 −0.6..0.6로 새로 뽑는다(추출은 늘 한다). 파츠가 바뀐 범위는 비운다(옛 파츠의 키다).
 * 파츠는 그대로인데 소스가 형태 키를 보고하지 않으면 지금 값을 둔다(그리지 못하는 값을 지우지 않는다 — 플래너가 미지원 사유로 알린다).
 */
function mixShapes(ctx: MixContext, rng: Prng, scope: PartScope, samePart: boolean): void {
  const names = (ctx.input.custom?.shapes[scope] ?? []).slice(0, MAX_SHAPES_PER_SCOPE);
  const values: Record<string, number> = {};
  for (const name of names) {
    const value = roundTo(rng.nextRange(-0.6, 0.6), 2);
    if (value !== 0) values[name] = value;
  }
  if (!samePart) return;
  const current = ctx.input.recipe.partParams[scope];
  if (names.length === 0) {
    if (current) ctx.partParams[scope] = { ...current };
  } else if (Object.keys(values).length > 0) {
    ctx.partParams[scope] = values;
  }
}

function addSlots(ctx: MixContext, kinds: readonly SlotKind[]): void {
  ctx.payload.slots = { ...(ctx.payload.slots as Record<string, unknown> | undefined), ...Object.fromEntries(kinds.map((slot) => [slot, ctx.slots[slot] ?? null])) };
}

// ---------------------------------------------------------------- 그룹

function mixStyle(ctx: MixContext): void {
  const { input } = ctx;
  const { recipe, figure } = input;
  // 팩 고르기는 style-pack 스트림, 선 굵기·부드러움·비례 흔들기는 style 스트림(추출 횟수 고정)
  const others = input.packs.filter((pack) => pack.id !== recipe.style.packId);
  const candidates = others.length > 0 ? others : input.packs;
  const index = groupPrng(input.seed, "style-pack").nextInt(candidates.length);
  const rng = groupPrng(input.seed, "style");
  const lineScale = rng.nextRange(0.85, 1.15);
  const softShift = rng.nextRange(-0.05, 0.05);
  const headsShift = rng.nextRange(-0.15, 0.15);
  const legShift = rng.nextRange(-0.01, 0.01);
  const pack = candidates[index];
  if (pack === undefined) {
    ctx.notices.push("화풍 팩이 없어 화풍은 그대로 두었습니다.");
    return;
  }
  ctx.mixedPack = pack;
  ctx.activePack = pack;
  ctx.payload.look = mergeLook(pack.look, {
    line: { widthMm: roundTo(Math.min(20, Math.max(0, pack.look.line.widthMm * lineScale)), 1) },
    ramp: { softness: roundTo(Math.min(1, Math.max(0, pack.look.ramp.softness + softShift)), 2) },
  });
  ctx.payload.toon = { rampSteps: pack.toon.rampSteps, rim: pack.toon.rim, outline: pack.toon.outline };
  const target = pack.proportion[figure];
  const bodyFree = unlocked(ctx, "body");
  const proportion: Proportion | null = bodyFree
    ? { ...target, headsTall: roundTo(clampProportion("headsTall", target.headsTall + headsShift), 2), legRatio: roundTo(clampProportion("legRatio", target.legRatio + legShift), 3) }
    : recipe.style.proportion;
  const faceFree = unlocked(ctx, "face");
  const binding = faceFree && input.styleBinding ? input.styleBinding(pack, figure) : null;
  ctx.payload.style = {
    packId: pack.id,
    packRevision: pack.revision,
    proportion,
    neutralFacs: faceFree ? clampExpression(binding?.face?.neutralFacs ?? {}) : { ...recipe.style.neutralFacs },
  };
  ctx.lines.set("style", `화풍: ${pack.labelKo}${bodyFree && proportion ? ` · 두신 ${proportion.headsTall.toFixed(1)}` : ""}`);
}

function mixFace(ctx: MixContext, binding: MixerStyleBinding | null): void {
  const { catalog, recipe } = ctx.input;
  const rng = groupPrng(ctx.input.seed, "face");
  const bound = binding?.face ?? null;
  for (const slot of FACE_SLOTS) mixSlot(ctx, rng, slot, slot === "eyes" || slot === "irises" ? bound?.slots[slot] : undefined);
  const face: Record<string, number> = {};
  for (const slot of IDENTITY_SLOTS) {
    const id = ctx.slots[slot];
    if (id) Object.assign(face, catalog.get(id)?.patch.face ?? {});
  }
  if (bound) Object.assign(face, bound.face);
  for (const key of FACE_PARAM_KEYS) face[key] = clampParamValue((face[key] ?? 0) + rng.nextRange(-0.12, 0.12));
  ctx.payload.face = face;
  mixShapes(ctx, rng, "hair", ctx.slots.hair !== null && ctx.slots.hair === recipe.slots.hair);
  addSlots(ctx, FACE_SLOTS);
  const labels = (["face-shape", "eyes", "irises"] as const).map((slot) => labelOf(catalog, ctx.slots[slot]));
  ctx.lines.set("face", `얼굴: ${labels.join("·")}, 헤어 ${labelOf(catalog, ctx.slots.hair)}${bound ? " (화풍 눈 계열)" : ""}`);
}

function mixBody(ctx: MixContext, binding: MixerStyleBinding | null): void {
  const { catalog } = ctx.input;
  const rng = groupPrng(ctx.input.seed, "body");
  mixSlot(ctx, rng, "body");
  const id = ctx.slots.body;
  const body: Record<string, number> = { ...(id ? (catalog.get(id)?.patch.body ?? {}) : {}) };
  for (const [key, value] of Object.entries(binding?.body ?? {})) if (value !== undefined) body[key] = (body[key] ?? 0) + value;
  for (const key of BODY_PARAM_KEYS) body[key] = clampParamValue((body[key] ?? 0) + rng.nextRange(-0.1, 0.1));
  ctx.payload.body = body;
  addSlots(ctx, ["body"]);
  ctx.lines.set("body", `몸: ${labelOf(catalog, ctx.slots.body)}`);
}

function mixOutfit(ctx: MixContext): void {
  const { catalog, capabilities, custom, recipe } = ctx.input;
  const rng = groupPrng(ctx.input.seed, "outfit");
  for (const slot of OUTFIT_SLOTS) mixSlot(ctx, rng, slot);
  for (const layer of WARDROBE_LAYERS) {
    const roll = rng.next();
    const pick = rng.next();
    const baseSlot = WARDROBE_LAYER_SLOT[layer];
    if (custom === undefined || !custom.layers.includes(layer) || capabilities[baseSlot].status === "unavailable") continue;
    const base = ctx.slots[baseSlot] ?? null;
    const taken = new Set<string>([base ?? "", ...(layer === "outer" ? [ctx.layers.inner ?? ""] : [])]);
    const allowed = ctx.input.layerOptions ? new Set<string>(ctx.input.layerOptions(layer, base)) : null;
    const options = availablePresets(ctx, baseSlot).filter((entry) => !taken.has(entry.id) && (allowed === null || allowed.has(entry.id)));
    ctx.layers[layer] = roll < LAYER_CHANCE[layer] && options.length > 0 ? (options[Math.floor(pick * options.length)]?.id ?? null) : null;
  }
  const patternUv = custom?.patternUv === true;
  Object.assign(ctx.outfitSurfaces, mixSurfaces(rng, { layers: ctx.layers, patternUv }));
  if (!patternUv) {
    // 무늬를 그리지 못하는 소스: 지금 무늬가 있는 의상 표면은 섞지 않고 그대로 둔다(그리지 못하는 값을 지우지 않는다).
    for (const [key, surface] of Object.entries(recipe.surfaces) as Array<[ChannelKey, Surface | undefined]>) {
      if (surface?.pattern && OUTFIT_SURFACE_CHANNELS.has(key)) ctx.outfitSurfaces[key] = structuredClone(surface);
    }
  }
  for (const scope of OUTFIT_SLOTS) mixShapes(ctx, rng, scope, ctx.slots[scope] !== null && ctx.slots[scope] === recipe.slots[scope]);
  for (const layer of WARDROBE_LAYERS) mixShapes(ctx, rng, layer, ctx.layers[layer] !== null && ctx.layers[layer] === recipe.wardrobe[layer]);
  addSlots(ctx, OUTFIT_SLOTS);
  const layerText = WARDROBE_LAYERS.filter((layer) => ctx.layers[layer] !== null).map((layer) => `${WARDROBE_LAYER_LABELS_KO[layer]} ${labelOf(catalog, ctx.layers[layer])}`);
  const patterns = Object.entries(ctx.outfitSurfaces).flatMap(([channel, surface]) => (surface?.pattern ? [`${PATTERN_LABELS_KO[surface.pattern.kind]}(${channel})`] : []));
  const slotsText = OUTFIT_SLOTS.map((slot) => labelOf(catalog, ctx.slots[slot])).join(" + ");
  ctx.lines.set("outfit", `옷: ${slotsText}${layerText.length > 0 ? ` (${layerText.join(", ")})` : ""}${patterns.length > 0 ? ` · 무늬 ${patterns.join(", ")}` : ""}`);
}

function mixAccessories(ctx: MixContext): void {
  const { catalog, custom, recipe } = ctx.input;
  const rng = groupPrng(ctx.input.seed, "accessories");
  const noneRoll = rng.next();
  const candidates = availablePresets(ctx, "accessory");
  const order = rng.shuffle([...candidates]);
  if (candidates.length > 0) {
    const choice = order.find((entry) => !conflicts(ctx, entry));
    ctx.slots.accessory = noneRoll < 0.25 || choice === undefined ? null : choice.id;
  }
  ctx.decided.add("accessory");
  const countRoll = rng.next();
  const draws = [0, 1].map(() => ({ preset: rng.next(), anchor: rng.next() }));
  const anchorsOf = ctx.input.accessoryAnchors;
  if (custom !== undefined && custom.anchors.length > 0 && anchorsOf && candidates.length > 0) {
    const count = countRoll < 0.5 ? 0 : countRoll < 0.85 ? 1 : 2;
    const extras: AccessoryInstance[] = [];
    for (const draw of draws.slice(0, count)) {
      const entry = candidates[Math.floor(draw.preset * candidates.length)];
      if (!entry || entry.id === ctx.slots.accessory || conflicts(ctx, entry)) continue;
      const anchors = anchorsOf(entry.id).filter((anchor) => custom.anchors.includes(anchor));
      const anchor = anchors[Math.floor(draw.anchor * anchors.length)];
      if (anchor === undefined || extras.some((extra) => extra.presetId === entry.id && extra.anchor === anchor)) continue;
      extras.push({ id: `acc-${extras.length + 1}`, presetId: entry.id, anchor, offset: structuredClone(DEFAULT_ACCESSORY_OFFSET) });
    }
    ctx.accessories = extras;
  } else {
    // 추가 소품을 섞을 수 없는 소스: 지금 소품과 그 형태 값을 그대로 둔다.
    for (const instance of ctx.accessories) {
      const values = recipe.partParams[instance.id];
      if (values) ctx.partParams[instance.id] = { ...values };
    }
  }
  const materialRoll = rng.next();
  const materialPick = rng.next();
  if (materialRoll < 0.4 && ctx.slots.accessory !== null) ctx.accessorySurfaces.accessory = { material: ACCESSORY_MATERIALS[Math.floor(materialPick * ACCESSORY_MATERIALS.length)] ?? "metal", pattern: null };
  mixShapes(ctx, rng, "accessory", ctx.slots.accessory !== null && ctx.slots.accessory === recipe.slots.accessory);
  addSlots(ctx, ["accessory"]);
  const extrasText = ctx.accessories.map((instance) => `+ ${labelOf(catalog, instance.presetId)}(${ACCESSORY_ANCHOR_LABELS_KO[instance.anchor]})`);
  ctx.lines.set("accessories", `소품: ${labelOf(catalog, ctx.slots.accessory)}${extrasText.length > 0 ? ` ${extrasText.join(" ")}` : ""}`);
}

function mixColorGroup(ctx: MixContext): void {
  const { custom, recipe, packs } = ctx.input;
  const rng = groupPrng(ctx.input.seed, "colors");
  const mixed = mixColors(rng, { recipe, packs, activePack: ctx.activePack, paintable: (key) => custom?.channels.includes(key) === true });
  ctx.payload.colors = mixed.colors;
  const hairRoll = rng.next();
  const gradientStart = rng.nextRange(0.35, 0.7);
  const tipMix = rng.nextRange(0.4, 0.9);
  const accent = (["none", "streak", "inner"] as const)[rng.nextInt(3)] ?? "none";
  if (custom?.hairFlow) ctx.payload.hairColor = hairRoll < 0.3 ? { gradient: [roundTo(gradientStart, 2), 1], tipMix: roundTo(tipMix, 2), accent } : createDefaultHairColor();
  const flow = custom?.hairFlow && hairRoll < 0.3 ? " · 헤어 끝 물들임" : "";
  ctx.lines.set("colors", `색: ${mixed.schemeKo} 배색 · 헤어 ${mixed.colors.hair ?? recipe.colors.hair}${flow}`);
}

/** 여러 그룹이 걸친 구역(옷장·표면·형태 값): 잠근 쪽 몫은 지금 값 */
function composeShared(ctx: MixContext): void {
  const { recipe } = ctx.input;
  const outfit = unlocked(ctx, "outfit");
  const accessories = unlocked(ctx, "accessories");
  if (outfit || accessories) {
    ctx.payload.wardrobe = { ...ctx.layers, accessories: ctx.accessories };
    const surfaces: Partial<Record<ChannelKey, Surface>> = {};
    for (const key of CHANNEL_KEYS) {
      const owner: LookLockGroup | null = ACCESSORY_CHANNELS.has(key) ? "accessories" : OUTFIT_SURFACE_CHANNELS.has(key) ? "outfit" : null;
      const mixed = owner === "outfit" ? ctx.outfitSurfaces[key] : ctx.accessorySurfaces[key];
      const value = owner !== null && unlocked(ctx, owner) ? mixed : recipe.surfaces[key];
      if (value !== undefined) surfaces[key] = structuredClone(value);
    }
    ctx.payload.surfaces = surfaces;
  }
  if (unlocked(ctx, "face") || outfit || accessories) ctx.payload.partParams = ctx.partParams;
}

function validate(input: LookMixerInput, now: number | undefined): LabFailure | null {
  const { seed, locks } = input;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return failVisible("look-mix-seed", `섞기 시드는 0~4294967295 정수여야 합니다: ${String(seed)}`, undefined, now);
  for (const lock of locks) {
    if (!(LOOK_LOCK_GROUPS as readonly string[]).includes(lock)) return failVisible("look-mix-lock", `잠금 그룹이 아닙니다: ${String(lock)}`, undefined, now);
  }
  if (LOOK_LOCK_GROUPS.every((group) => locks.includes(group))) return failVisible("look-mix-all-locked", "모든 그룹을 잠가 섞을 것이 없습니다. 하나 이상 잠금을 푸세요.", undefined, now);
  return null;
}

// ---------------------------------------------------------------- 진입점

/** 섞기. 실패(시드·잠금 형식, 전부 잠금, 계약 위반)는 한글 사유로 돌려준다(throw 없음). */
export function mixLook(input: LookMixerInput, now?: number): LookMixOutcome {
  const invalid = validate(input, now);
  if (invalid) return { ok: false, failure: invalid };
  const { recipe } = input;
  const locks = LOOK_LOCK_GROUPS.filter((group) => input.locks.includes(group));
  const ctx: MixContext = {
    input,
    locks,
    slots: { ...recipe.slots },
    decided: new Set(),
    payload: {},
    partParams: {},
    notices: [],
    lines: new Map(),
    layers: { inner: recipe.wardrobe.inner, outer: recipe.wardrobe.outer, legwear: recipe.wardrobe.legwear },
    accessories: recipe.wardrobe.accessories.map((instance) => structuredClone(instance)),
    outfitSurfaces: {},
    accessorySurfaces: {},
    activePack: input.packs.find((pack) => pack.id === recipe.style.packId) ?? null,
    mixedPack: null,
  };
  for (const group of locks) for (const slot of GROUP_SLOTS[group]) ctx.decided.add(slot);
  for (const [scope, values] of Object.entries(recipe.partParams)) if (values && locks.includes(scopeGroup(scope))) ctx.partParams[scope] = { ...values };

  // 고정 순서: 화풍 → 얼굴 → 몸 → 옷 → 소품 → 색(앞 그룹의 결정이 뒤 그룹의 충돌 검사·팔레트 기준이 된다)
  if (unlocked(ctx, "style")) mixStyle(ctx);
  const binding = ctx.activePack && input.styleBinding ? input.styleBinding(ctx.activePack, input.figure) : null;
  if (unlocked(ctx, "face")) mixFace(ctx, binding);
  if (unlocked(ctx, "body")) mixBody(ctx, binding);
  if (unlocked(ctx, "outfit")) mixOutfit(ctx);
  if (unlocked(ctx, "accessories")) mixAccessories(ctx);
  if (unlocked(ctx, "colors")) mixColorGroup(ctx);
  composeShared(ctx);
  if (input.custom === undefined && (unlocked(ctx, "outfit") || unlocked(ctx, "accessories") || unlocked(ctx, "colors"))) {
    ctx.notices.push("엔진이 커스터마이즈 능력을 보고하지 않아 겹쳐 입기·추가 소품·무늬·헤어 흐름·세부 채널 색은 섞지 않았습니다.");
  }
  const needsToonMode = ctx.mixedPack !== null && recipe.shading.mode !== "toon";
  if (needsToonMode) ctx.notices.push("셰이딩이 PBR이라 섞은 화풍이 화면에 보이지 않습니다. 툰 모드로 바꾸면 보입니다.");

  const look = { format: CHARACTER_LOOK_FORMAT, id: `mix-${input.seed.toString(36)}`, nameKo: `섞기 #${input.seed}`, scope: "full" as const, payload: ctx.payload, locks: [...locks], seed: input.seed };
  const parsed = characterLookSchema.safeParse(look);
  if (!parsed.success) return { ok: false, failure: failVisible("look-mix-invalid", `섞기 결과가 룩 형식에 맞지 않습니다: ${describeRecipeIssues(parsed.error.issues)}`, undefined, now) };
  const applied = applyCharacterLook(recipe, parsed.data, now);
  if (!applied.ok) return { ok: false, failure: applied.failure };

  const lines: LookMixLine[] = LOOK_LOCK_GROUPS.map((group) => {
    const free = unlocked(ctx, group);
    return { group, labelKo: LOOK_LOCK_LABELS_KO[group], locked: !free, textKo: free ? (ctx.lines.get(group) ?? `${LOOK_LOCK_LABELS_KO[group]}: 그대로`) : `${LOOK_LOCK_LABELS_KO[group]}: 잠금` };
  });
  // 설명은 섞는 순서(화풍 → 얼굴 → 몸 → 옷 → 소품 → 색)로 읽히게 쓴다. `lines`는 잠금 토글과 같은 계약 순서다.
  const mixedText = MIX_ORDER.flatMap((group) => lines.filter((line) => line.group === group && !line.locked).map((line) => line.textKo));
  const lockText = locks.length > 0 ? ` (잠금: ${locks.map((group) => LOOK_LOCK_LABELS_KO[group]).join("·")})` : "";
  return {
    ok: true,
    result: { look: parsed.data, recipe: applied.recipe, lines, descriptionKo: `섞기 #${input.seed}: ${mixedText.join(" · ")}${lockText}`, noticesKo: ctx.notices, needsToonMode },
  };
}

/** 다음 섞기 시드(이전 시드에서 결정적으로 만든다). 화면은 버튼을 누를 때마다 이 값을 쓰고 시드를 보여 준다. */
export function nextMixSeed(previous: number): number {
  return seedFromString(`look-mixer/next:${previous >>> 0}`);
}
