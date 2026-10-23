/**
 * 화풍 팩 → 캐릭터 랩 소스별 매핑(레시피 v3, 2026-10-23 S-1). 데이터와 `style/apply` 명령 조립만 한다(순수).
 *
 * 화풍 팩의 얼굴·비례 값은 **측정 목표**(눈폭/얼굴, 두신 등)라서 소스마다 그 목표에 가까워지는 수단이 다르다(설계 §2.1·§5.3):
 * - 절차 소스: 눈·눈동자 프리셋 교체 + 얼굴 파라미터 값(설계 §5.3 표의 절차 열 그대로).
 * - 키트 소스: 눈은 베이스에 구워져 있어 눈 프리셋은 바꾸지 않고, 표가 정한 눈동자 프리셋과 morph 값만 쓴다.
 *   속눈썹은 키트 베이스가 라이너로 구워 두었으므로(웹툰 스타일 가이드 §2 `lash_style`) 화풍의 속눈썹이 라이너가 아니면 partial이다.
 *   SD 눈(sd-dot)은 SD 전용 키트 베이스가 있어야 해서(설계 O1) 키트에서는 unavailable이다 — 다른 눈으로 바꿔 넣지 않는다(무음 대체 금지).
 * - 제작 패키지: 얼굴 매핑이 없다(unavailable).
 *
 * 체형 오프셋: 비례 목표 6축(두신·다리·팔·어깨·머리 너비·손 — 레시피 `style.proportion`)이 맡지 않는 체형 성격(가슴 두께·허리·엉덩이·목 길이)의
 * 화풍 초기값이다. 비례 축과 겹치는 체형 키(headSize·legLength·armLength·shoulderWidth)는 두 번 적용되지 않게 쓰지 않는다(시험이 강제).
 * 계약 `style/apply`·`StyleFaceBinding`에는 체형 값을 실을 자리가 없으므로 지금은 섞기(`state/look-mixer` DI)와 화풍 뷰의 명시 동작만 쓴다
 * (계약에 `body`를 더하는 요청은 S-1 보고에 남겼다). 키트는 베이스가 체형 성격을 이미 굽고 있어 화풍별 오프셋을 비워 둔다.
 *
 * 수치: 눈 계열 표(설계 §5.3)의 값은 그대로, 화풍별 중립 표정·체형 오프셋은 [제안] 초기값이다(접촉 시트로 고친다).
 */
import { STYLE_FIGURES } from "../contracts";

import type {
  ArtStyleId,
  ArtStylePack,
  BodyParamKey,
  EyeFamily,
  ExpressionWeights,
  LabCommand,
  RecipeSource,
  StyleApplyScope,
  StyleFaceBinding,
  StyleFigure,
} from "../contracts";

export const STYLE_BINDING_SOURCES = ["procedural", "kit"] as const;
export type StyleBindingSource = (typeof STYLE_BINDING_SOURCES)[number];
export type StyleBindingStatus = "available" | "partial" | "unavailable";

/** 화풍 체형 오프셋에 쓸 수 있는 체형 키(비례 6축이 맡는 headSize·legLength·armLength·shoulderWidth·키는 뺀다) */
export const STYLE_BODY_OFFSET_KEYS = ["chestDepth", "waist", "hip", "neckLength"] as const satisfies readonly BodyParamKey[];
export type StyleBodyOffsetKey = (typeof STYLE_BODY_OFFSET_KEYS)[number];
export type StyleBodyOffsets = Readonly<Partial<Record<StyleBodyOffsetKey, number>>>;

/** 키트 베이스가 구워 둔 속눈썹 모양(webtoon-style-guide §2 `lash_style="liner"`, 여·남 모두) */
export const KIT_BASE_LASH = "liner" as const;

export const PACKAGE_STYLE_FACE_REASON_KO = "제작 패키지 소스에는 화풍 얼굴 매핑이 없습니다(눈·눈동자 프리셋과 얼굴 형태 키가 패키지마다 다릅니다).";
const KIT_SD_EYES_REASON_KO = "SD 눈(점 눈)은 SD 전용 키트 베이스가 있어야 합니다. 지금 키트 베이스에서는 화풍 얼굴을 적용하지 않습니다.";
const KIT_BODY_NOTE_KO = "키트 베이스(웹툰 LookStyle)는 체형 성격을 베이스에 구워 두었고 화풍별 보정값은 아직 접촉 시트로 정하지 않아 비워 둔다.";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ---------------------------------------------------------------- 눈 계열 표(설계 §5.3)

interface EyeFamilySourceMapping {
  readonly status: Exclude<StyleBindingStatus, "partial">;
  readonly reasonKo?: string;
  readonly slots: StyleFaceBinding["slots"];
  readonly face: StyleFaceBinding["face"];
  readonly neutralFacs: StyleFaceBinding["neutralFacs"];
}

function mapping(slots: StyleFaceBinding["slots"], face: StyleFaceBinding["face"], neutralFacs: StyleFaceBinding["neutralFacs"] = {}): EyeFamilySourceMapping {
  return { status: "available", slots, face, neutralFacs };
}

/**
 * 눈 계열 × 소스 매핑. 절차 열은 설계 §5.3 표 그대로(눈·눈동자 프리셋 + 얼굴 값), 키트 열은 표의 키트 열(눈동자 프리셋·morph)이다.
 * 눈 프리셋을 고르면 reducer가 그 프리셋의 카탈로그 patch(눈 크기·간격·기울기)를 먼저 넣고, 여기 적은 얼굴 값이 나열한 키만 덮어쓴다.
 */
export const EYE_FAMILY_BINDINGS: Readonly<Record<EyeFamily, Readonly<Record<StyleBindingSource, EyeFamilySourceMapping>>>> = deepFreeze({
  "anime-round": {
    procedural: mapping({ eyes: "eyes/round", irises: "irises/round-large" }, { eyeSize: 0.6 }),
    kit: mapping({ irises: "irises/round-large" }, { eyeSize: 0.6 }),
  },
  "webtoon-almond": {
    procedural: mapping({ eyes: "eyes/almond", irises: "irises/soft-gradient" }, { eyeSize: 0.3, eyeTilt: 0.15 }),
    // 키트 베이스 자체가 웹툰 눈(LookStyle webtoon)이라 바꾸지 않는다.
    kit: mapping({}, {}),
  },
  "shounen-sharp": {
    procedural: mapping({ eyes: "eyes/narrow", irises: "irises/round-small" }, { eyeTilt: 0.5, eyeSize: -0.2 }, { browDown: 0.2 }),
    kit: mapping({}, { eyeTilt: 0.5, eyeSize: -0.2 }, { browDown: 0.2 }),
  },
  "shoujo-sparkle": {
    procedural: mapping({ eyes: "eyes/wide", irises: "irises/star-highlight" }, { eyeSize: 0.9 }),
    kit: mapping({ irises: "irises/star-highlight" }, {}),
  },
  realistic: {
    procedural: mapping({ eyes: "eyes/almond", irises: "irises/round-small" }, { eyeSize: -0.4 }),
    kit: mapping({}, { eyeSize: -0.4 }),
  },
  "sd-dot": {
    procedural: mapping({ eyes: "eyes/round", irises: "irises/round-large" }, { eyeSize: 1, eyeSpacing: 0.3 }),
    kit: { status: "unavailable", reasonKo: KIT_SD_EYES_REASON_KO, slots: {}, face: {}, neutralFacs: {} },
  },
  "ink-narrow": {
    procedural: mapping({ eyes: "eyes/narrow", irises: "irises/round-small" }, { eyeSize: -0.3 }),
    kit: mapping({}, { eyeSize: -0.3 }),
  },
});

// ---------------------------------------------------------------- 화풍별 중립 표정·체형 오프셋([제안])

/**
 * 눈 계열 표정에 더하는 화풍 중립 표정. 사실 비례 중립 얼굴은 화나 보여 웹툰·소녀·SD는 입꼬리를 조금 올린다(가이드 §2 `neutral_facs`).
 * 키트 베이스는 그 미소를 이미 굽고 있어(여 1.4·남 0.9) 키트에는 더하지 않는다.
 */
const PACK_NEUTRAL_FACS: Readonly<Partial<Record<ArtStyleId, Readonly<Record<StyleBindingSource, ExpressionWeights>>>>> = deepFreeze({
  "kr-webtoon-romance": { procedural: { mouthSmile: 0.15 }, kit: {} },
  "jp-shoujo-soft": { procedural: { mouthSmile: 0.1 }, kit: {} },
  "sd-chibi": { procedural: { mouthSmile: 0.2 }, kit: {} },
});

/** 절차 소스의 화풍 체형 오프셋(체형 계열별). 로맨스 여성 허리 −0.25는 키트 웹툰 베이스가 굽는 값(가이드 §2 `neutral_body`)과 같게 맞췄다. */
export const PROCEDURAL_STYLE_BODY_OFFSETS: Readonly<Record<ArtStyleId, Readonly<Record<StyleFigure, StyleBodyOffsets>>>> = deepFreeze({
  "jp-anime-cel": { feminine: { waist: -0.15, neckLength: 0.15 }, masculine: { neckLength: 0.1 } },
  "jp-shounen-ink": { feminine: { waist: -0.1 }, masculine: { chestDepth: 0.15 } },
  "jp-shoujo-soft": { feminine: { waist: -0.3, hip: -0.1, neckLength: 0.25 }, masculine: { chestDepth: -0.15, waist: -0.15, neckLength: 0.2 } },
  "jp-seinen-real": { feminine: {}, masculine: { chestDepth: 0.25 } },
  "kr-webtoon-romance": { feminine: { waist: -0.25, neckLength: 0.15 }, masculine: { chestDepth: -0.1, neckLength: 0.1 } },
  "kr-webtoon-action": { feminine: { waist: -0.15 }, masculine: { chestDepth: 0.3, waist: -0.1 } },
  "sd-chibi": { feminine: { neckLength: -0.8, waist: 0.2 }, masculine: { neckLength: -0.8, waist: 0.2 } },
  "ink-wash": { feminine: { neckLength: 0.1 }, masculine: { neckLength: 0.1 } },
});

const EMPTY_BODY: Readonly<Record<StyleFigure, StyleBodyOffsets>> = deepFreeze({ feminine: {}, masculine: {} });

// ---------------------------------------------------------------- 조회

export interface StyleSourceBinding {
  readonly packId: ArtStyleId;
  readonly source: StyleBindingSource;
  readonly eyeFamily: EyeFamily;
  /** 얼굴 범위를 이 소스에 적용할 수 있는지. partial·unavailable이면 `faceReasonKo`가 있다. */
  readonly faceStatus: StyleBindingStatus;
  readonly faceReasonKo?: string;
  /** `style/apply` 명령에 싣는 얼굴 바인딩(unavailable이면 null) */
  readonly face: StyleFaceBinding | null;
  /** 체형 계열별 체형 오프셋(비례 6축 밖 키만) */
  readonly body: Readonly<Record<StyleFigure, StyleBodyOffsets>>;
  /** 체형 오프셋을 비워 둔 이유(키트) */
  readonly bodyNoteKo?: string;
}

function sumFacs(a: ExpressionWeights, b: ExpressionWeights): ExpressionWeights {
  const result: Record<string, number> = { ...a };
  for (const [unit, value] of Object.entries(b)) {
    if (value === undefined) continue;
    result[unit] = Math.min(1, (result[unit] ?? 0) + value);
  }
  return result as ExpressionWeights;
}

function buildBinding(pack: ArtStylePack, source: StyleBindingSource): StyleSourceBinding {
  const family = EYE_FAMILY_BINDINGS[pack.face.eyeFamily][source];
  const body = source === "procedural" ? PROCEDURAL_STYLE_BODY_OFFSETS[pack.id] : EMPTY_BODY;
  const bodyNote = source === "kit" ? { bodyNoteKo: KIT_BODY_NOTE_KO } : {};
  if (family.status === "unavailable") {
    return { packId: pack.id, source, eyeFamily: pack.face.eyeFamily, faceStatus: "unavailable", faceReasonKo: family.reasonKo ?? "이 소스에는 이 화풍의 얼굴 매핑이 없습니다.", face: null, body, ...bodyNote };
  }
  const neutralFacs = sumFacs(family.neutralFacs, PACK_NEUTRAL_FACS[pack.id]?.[source] ?? {});
  const face: StyleFaceBinding = { face: { ...family.face }, slots: { ...family.slots }, neutralFacs };
  if (source === "kit" && pack.face.lash !== KIT_BASE_LASH) {
    const lashKo = pack.face.lash === "strands" ? "가닥 속눈썹" : "속눈썹 없음";
    return {
      packId: pack.id,
      source,
      eyeFamily: pack.face.eyeFamily,
      faceStatus: "partial",
      faceReasonKo: `키트 베이스는 속눈썹을 라이너로 구워 두어 이 화풍의 ${lashKo}은(는) 바뀌지 않습니다. 눈동자·눈 크기·중립 표정만 적용합니다.`,
      face,
      body,
      ...bodyNote,
    };
  }
  return { packId: pack.id, source, eyeFamily: pack.face.eyeFamily, faceStatus: "available", face, body, ...bodyNote };
}

/** 팩 × 소스 매핑(얼굴 바인딩·체형 오프셋·상태). 결과는 매번 새 객체다. */
export function styleSourceBinding(pack: ArtStylePack, source: StyleBindingSource): StyleSourceBinding {
  return buildBinding(pack, source);
}

/** 레시피 소스 → 매핑 소스(제작 패키지는 매핑이 없어 null) */
export function styleBindingSourceOf(source: RecipeSource): StyleBindingSource | null {
  if (source.kind === "procedural") return "procedural";
  if (source.kind === "kit") return "kit";
  return null;
}

/** 소스의 기본 체형 계열: 키트는 베이스(female → feminine, male → masculine), 그 밖은 feminine(화풍 뷰가 바꿀 수 있게 노출한다) */
export function defaultStyleFigure(source: RecipeSource): StyleFigure {
  if (source.kind === "kit") return source.baseId === "male" ? "masculine" : "feminine";
  return "feminine";
}

/** 섞기(`state/look-mixer`)에 주입하는 매핑 함수(구조적으로 `MixerStyleBinding`과 같다). 제작 패키지는 언제나 null. */
export function mixerStyleBindingFor(
  source: RecipeSource,
): (pack: ArtStylePack, figure: StyleFigure) => { readonly face: StyleFaceBinding | null; readonly body: Readonly<Partial<Record<BodyParamKey, number>>> } | null {
  const bindingSource = styleBindingSourceOf(source);
  return (pack, figure) => {
    if (bindingSource === null) return null;
    const binding = buildBinding(pack, bindingSource);
    return { face: binding.face, body: binding.body[figure] };
  };
}

// ---------------------------------------------------------------- style/apply 명령 조립

export type StyleApplyCommand = Extract<LabCommand, { readonly type: "style/apply" }>;

export interface StyleApplyRequest {
  readonly pack: ArtStylePack;
  readonly source: RecipeSource;
  readonly scope: StyleApplyScope;
  /** 없으면 `defaultStyleFigure(source)` */
  readonly figure?: StyleFigure;
  readonly paletteIndex?: { readonly skin?: number; readonly hair?: number };
}

export type StyleApplyCommandResult =
  | { readonly ok: true; readonly command: StyleApplyCommand; readonly binding: StyleSourceBinding | null; readonly noticesKo: readonly string[] }
  | { readonly ok: false; readonly code: string; readonly reasonKo: string };

function paletteIndexProblem(pack: ArtStylePack, index: StyleApplyRequest["paletteIndex"]): string | null {
  const skin = index?.skin ?? 0;
  if (!Number.isInteger(skin) || skin < 0 || skin >= pack.palette.skin.length) return `화풍 팩 피부 팔레트에 ${String(skin)}번 색이 없습니다(${pack.palette.skin.length}색).`;
  const hair = index?.hair;
  if (hair === undefined) return null;
  if (pack.palette.hair.length === 0) return "화풍 팩에 헤어 팔레트가 없습니다.";
  if (!Number.isInteger(hair) || hair < 0 || hair >= pack.palette.hair.length) return `화풍 팩 헤어 팔레트에 ${String(hair)}번 색이 없습니다(${pack.palette.hair.length}색).`;
  return null;
}

/**
 * 화풍 카드 적용 명령을 만든다. 얼굴 범위면 소스에 맞는 얼굴 바인딩을 싣고, 매핑이 없는 소스(제작 패키지·키트 SD 눈)면
 * 다른 값으로 바꿔 넣지 않고 한글 사유로 거부한다(화풍 뷰가 얼굴 범위를 끄라고 안내한다). partial이면 명령은 만들고 사유를 `noticesKo`로 준다.
 */
export function buildStyleApplyCommand(request: StyleApplyRequest): StyleApplyCommandResult {
  const { pack, source, scope } = request;
  if (!scope.look && !scope.proportion && !scope.face && !scope.palette) {
    return { ok: false, code: "style-scope-empty", reasonKo: "화풍 적용 범위(룩·비례·얼굴·팔레트)를 하나 이상 골라야 합니다." };
  }
  const figure = request.figure ?? defaultStyleFigure(source);
  if (!(STYLE_FIGURES as readonly string[]).includes(figure)) return { ok: false, code: "style-figure", reasonKo: `체형 계열이 아닙니다: ${String(figure)}` };
  if (scope.palette) {
    const problem = paletteIndexProblem(pack, request.paletteIndex);
    if (problem !== null) return { ok: false, code: "style-palette-index", reasonKo: problem };
  }
  const bindingSource = styleBindingSourceOf(source);
  const binding = bindingSource === null ? null : buildBinding(pack, bindingSource);
  const noticesKo: string[] = [];
  let face: StyleFaceBinding | undefined;
  if (scope.face) {
    if (binding === null) return { ok: false, code: "style-face-unavailable", reasonKo: PACKAGE_STYLE_FACE_REASON_KO };
    if (binding.face === null) return { ok: false, code: "style-face-unavailable", reasonKo: binding.faceReasonKo ?? "이 소스에는 이 화풍의 얼굴 매핑이 없습니다." };
    if (binding.faceStatus === "partial" && binding.faceReasonKo) noticesKo.push(binding.faceReasonKo);
    face = binding.face;
  }
  const command: StyleApplyCommand = {
    type: "style/apply",
    pack,
    scope: { look: scope.look, proportion: scope.proportion, face: scope.face, palette: scope.palette },
    figure,
    ...(face ? { face } : {}),
    ...(scope.palette && request.paletteIndex ? { paletteIndex: request.paletteIndex } : {}),
  };
  return { ok: true, command, binding, noticesKo };
}

/** 모든 팩 × 소스 매핑 중 얼굴 범위를 적용할 수 있는 수(구성 공간 원장의 데이터 지표) — unavailable은 세지 않는다. */
export function countStyleFaceBindings(packs: readonly ArtStylePack[]): number {
  let count = 0;
  for (const pack of packs) {
    for (const source of STYLE_BINDING_SOURCES) if (buildBinding(pack, source).faceStatus !== "unavailable") count += 1;
  }
  return count;
}
