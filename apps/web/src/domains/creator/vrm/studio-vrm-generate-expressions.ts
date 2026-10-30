/**
 * 생성형 VRM 의 **표정 정의와 표정 편집**.
 *
 * 표정은 얼굴 패치(눈·홍채·하이라이트·윗눈꺼풀 선·눈썹·입)의 모양을 바꾼 결과를 모프 타깃으로
 * 굽는다(studio-vrm-humanoid-mesh). 이 모듈은 그 "어떻게 바꾸는가"의 단일 권위다.
 *
 *  - 기본 표정 테이블({@link STUDIO_VRM_DEFAULT_FACE_MORPHS})은 VRM 1.0 표정 프리셋과 이름이 1:1로
 *    같다. 예전에는 휴머노이드 메시 안의 상수였고, 표정을 편집할 수 있게 하면서 이리로 옮겼다.
 *  - 표정 편집은 VRoid Studio 의 표정 편집(공개 가이드 기준: 얼굴 편집 → 표정 탭에서 프리셋 표정을
 *    눈썹·눈·입 부위 슬라이더로 조정)과 같은 작업 흐름을 **자체 파라미터 모델**로 재현한다.
 *    슬라이더 값은 기본 표정 위에 얹는 **조정량**이라, 아무것도 움직이지 않으면 기본 테이블을
 *    그대로 돌려준다 — 편집하지 않은 생성 VRM 은 이전과 바이트 단위로 같다.
 *  - 커스텀 표정은 VRM 1.0 `expressions.custom` 으로 나간다. 키는 처음에 ASCII 템플릿 id(두 번째부터
 *    `_2`)이고, VRoid Studio 처럼 사용자가 다른 앱에 보일 이름으로 바꿀 수 있다. 이름은 장면 문서 저장
 *    경계를 지나도록 글자·숫자·공백·`_`·`-`·`.` 만 32자까지 쓰고, VRM 프리셋·다른 커스텀 표정과
 *    대소문자 구분 없이 겹치지 않는다. 화면에는 템플릿 이름 그대로면 템플릿의 한글 라벨을, 바꾼
 *    이름이면 그 이름을 보여 준다.
 */

/** `eyeline` 은 윗눈꺼풀 선. 이게 없으면 눈이 "고글"처럼 읽힌다(상용 아바타도 별도 재질로 둔다). */
export type StudioVrmFacePatchId = "eye" | "iris" | "glint" | "eyeline" | "brow" | "mouth";

export type StudioVrmFacePatchMorphOp = {
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly worldOffsetX?: number;
  /** 두개골 세로 반경의 배수로 주는 이동. 피처 자기 크기와 무관하게 얼굴 전체를 기준으로 움직인다. */
  readonly offsetHeadY?: number;
  readonly tilt?: number;
  readonly bow?: number;
  /** 세로로 줄일 때 위/아래 어느 가장자리를 고정할지. 눈꺼풀이 닫히는 방향을 정한다. */
  readonly collapse?: "top" | "bottom";
};

export type StudioVrmFaceMorph = {
  readonly name: string;
  readonly ops: Partial<Record<StudioVrmFacePatchId, StudioVrmFacePatchMorphOp>>;
  /** 지정하면 그쪽 패치에만 적용된다(한쪽 눈 깜빡임). */
  readonly side?: "left" | "right";
  /**
   * 패치별 한쪽 제한. `side` 보다 우선한다. 윙크처럼 눈은 한쪽만 감고 입·눈썹은 그대로 움직이는
   * 표정에 쓴다 — `side` 를 쓰면 가운데에 있는 입 패치가 통째로 빠진다.
   */
  readonly patchSides?: Partial<Record<StudioVrmFacePatchId, "left" | "right">>;
};

/** 완전히 감은 눈의 세로 배율. 아래 눈꺼풀 선까지 눌러 붙인다. */
export const STUDIO_VRM_CLOSED_EYE_SCALE = 0.06;

/** 눈 감김 — 아래 눈꺼풀 선까지 눌러 붙인다. */
const CLOSE_EYE: StudioVrmFacePatchMorphOp = { collapse: "bottom", scaleY: STUDIO_VRM_CLOSED_EYE_SCALE };
/** 눈이 닫히면 윗눈꺼풀 선도 아래 눈꺼풀까지 함께 내려와야 한 줄로 읽힌다. */
const CLOSE_EYELINE: StudioVrmFacePatchMorphOp = { offsetHeadY: -0.36 };

/**
 * VRM 1.0 표정 프리셋과 **이름이 1:1로 같은** 모프 타깃들. 표정 바인딩이
 * `가중치 1로 같은 이름의 타깃 하나`가 되어 익스포터·로더 양쪽에서 읽기 쉽다.
 */
export const STUDIO_VRM_DEFAULT_FACE_MORPHS: readonly StudioVrmFaceMorph[] = Object.freeze([
  { name: "blink", ops: { eye: CLOSE_EYE, iris: CLOSE_EYE, glint: CLOSE_EYE, eyeline: CLOSE_EYELINE } },
  {
    name: "blinkLeft",
    side: "left",
    ops: { eye: CLOSE_EYE, iris: CLOSE_EYE, glint: CLOSE_EYE, eyeline: CLOSE_EYELINE },
  },
  {
    name: "blinkRight",
    side: "right",
    ops: { eye: CLOSE_EYE, iris: CLOSE_EYE, glint: CLOSE_EYE, eyeline: CLOSE_EYELINE },
  },
  {
    name: "happy",
    ops: {
      eye: { collapse: "bottom", scaleY: 0.3, bow: 0.009 },
      iris: { collapse: "bottom", scaleY: 0.3, bow: 0.009 },
      glint: { collapse: "bottom", scaleY: 0.3, bow: 0.009 },
      eyeline: { offsetHeadY: -0.26, bow: 0.009 },
      brow: { offsetY: 0.004 },
      mouth: { scaleX: 1.5, scaleY: 1.5, bow: -0.006 },
    },
  },
  {
    name: "angry",
    ops: {
      brow: { tilt: 0.34, offsetY: -0.008 },
      eye: { scaleY: 0.82, offsetY: -0.002 },
      eyeline: { offsetHeadY: -0.03, tilt: 0.1 },
      mouth: { scaleX: 0.86, bow: 0.004 },
    },
  },
  {
    name: "sad",
    ops: {
      brow: { tilt: -0.3, offsetY: 0.004 },
      eye: { scaleY: 0.86, offsetY: -0.003 },
      mouth: { scaleX: 0.9, bow: 0.005 },
    },
  },
  {
    name: "relaxed",
    ops: {
      eye: { collapse: "bottom", scaleY: 0.58 },
      iris: { collapse: "bottom", scaleY: 0.58 },
      glint: { collapse: "bottom", scaleY: 0.58 },
      eyeline: { offsetHeadY: -0.15 },
      mouth: { scaleX: 1.2, bow: -0.004 },
    },
  },
  {
    name: "surprised",
    ops: {
      eye: { scaleX: 1.1, scaleY: 1.28 },
      iris: { scaleX: 1.1, scaleY: 1.2 },
      eyeline: { offsetHeadY: 0.02 },
      brow: { offsetY: 0.01 },
      mouth: { scaleX: 0.86, scaleY: 2.4 },
    },
  },
  { name: "aa", ops: { mouth: { scaleX: 0.92, scaleY: 3 } } },
  { name: "ih", ops: { mouth: { scaleX: 1.4, scaleY: 0.85 } } },
  { name: "ou", ops: { mouth: { scaleX: 0.62, scaleY: 2 } } },
  { name: "ee", ops: { mouth: { scaleX: 1.45, scaleY: 1.25 } } },
  { name: "oh", ops: { mouth: { scaleX: 0.85, scaleY: 2.6 } } },
  { name: "lookUp", ops: { iris: { offsetY: 0.006 }, glint: { offsetY: 0.006 } } },
  { name: "lookDown", ops: { iris: { offsetY: -0.006 }, glint: { offsetY: -0.006 } } },
  { name: "lookLeft", ops: { iris: { worldOffsetX: 0.007 }, glint: { worldOffsetX: 0.007 } } },
  { name: "lookRight", ops: { iris: { worldOffsetX: -0.007 }, glint: { worldOffsetX: -0.007 } } },
] satisfies readonly StudioVrmFaceMorph[]);

/* -------------------------------------------------------------------------- */
/* 편집 파라미터                                                                */
/* -------------------------------------------------------------------------- */

export const STUDIO_VRM_EXPRESSION_PARAM_KEYS = [
  "browRaise",
  "browAngle",
  "eyeClose",
  "eyeSmile",
  "eyeWiden",
  "irisSize",
  "mouthOpen",
  "mouthWidth",
  "mouthCurve",
] as const;

export type StudioVrmExpressionParamKey = (typeof STUDIO_VRM_EXPRESSION_PARAM_KEYS)[number];
export type StudioVrmExpressionPart = "brow" | "eye" | "mouth";

/** 0 이 아닌 조정량만 담는다. 키가 없으면 그 부위는 기본 표정 그대로다. */
export type StudioVrmExpressionDelta = Readonly<Partial<Record<StudioVrmExpressionParamKey, number>>>;

export type StudioVrmExpressionParamSpec = {
  readonly label: string;
  readonly part: StudioVrmExpressionPart;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** 슬라이더 낮은 쪽·높은 쪽 끝이 뜻하는 모양. */
  readonly lowHint: string;
  readonly highHint: string;
};

export const STUDIO_VRM_EXPRESSION_PARAMS: Readonly<
  Record<StudioVrmExpressionParamKey, StudioVrmExpressionParamSpec>
> = Object.freeze({
  browRaise: { label: "눈썹 높이", part: "brow", min: -1, max: 1, step: 0.05, lowHint: "내림", highHint: "올림" },
  browAngle: { label: "눈썹 각도", part: "brow", min: -1, max: 1, step: 0.05, lowHint: "처짐", highHint: "치켜뜸" },
  eyeClose: { label: "눈 감김", part: "eye", min: -1, max: 1, step: 0.05, lowHint: "더 뜸", highHint: "감음" },
  eyeSmile: { label: "눈웃음", part: "eye", min: 0, max: 1, step: 0.05, lowHint: "없음", highHint: "반달눈" },
  eyeWiden: { label: "눈 크게", part: "eye", min: 0, max: 1, step: 0.05, lowHint: "기본", highHint: "휘둥그레" },
  irisSize: { label: "눈동자 크기", part: "eye", min: -1, max: 1, step: 0.05, lowHint: "작게", highHint: "크게" },
  mouthOpen: { label: "입 벌림", part: "mouth", min: -1, max: 1, step: 0.05, lowHint: "다묾", highHint: "크게 벌림" },
  mouthWidth: { label: "입 너비", part: "mouth", min: -1, max: 1, step: 0.05, lowHint: "오므림", highHint: "넓게" },
  mouthCurve: { label: "입꼬리", part: "mouth", min: -1, max: 1, step: 0.05, lowHint: "내림", highHint: "올림" },
});

export const STUDIO_VRM_EXPRESSION_PARTS: readonly { readonly id: StudioVrmExpressionPart; readonly label: string }[] =
  Object.freeze([
    { id: "brow", label: "눈썹" },
    { id: "eye", label: "눈" },
    { id: "mouth", label: "입" },
  ]);

/* -------------------------------------------------------------------------- */
/* 편집 대상: 프리셋 표정 + 커스텀 표정 템플릿                                     */
/* -------------------------------------------------------------------------- */

export type StudioVrmEditableExpressionPreset =
  | "happy"
  | "angry"
  | "sad"
  | "relaxed"
  | "surprised"
  | "aa"
  | "ih"
  | "ou"
  | "ee"
  | "oh";

export type StudioVrmEditableExpressionPresetSpec = {
  readonly name: StudioVrmEditableExpressionPreset;
  readonly label: string;
  /** 이 표정에서 조정할 수 있는 부위. 입모양(립싱크) 표정은 입만 움직여야 대사와 감정이 겹치지 않는다. */
  readonly parts: readonly StudioVrmExpressionPart[];
};

const ALL_PARTS: readonly StudioVrmExpressionPart[] = Object.freeze(["brow", "eye", "mouth"]);
const MOUTH_ONLY: readonly StudioVrmExpressionPart[] = Object.freeze(["mouth"]);

/** 라벨은 포저의 표정 라벨(studio-vrm-poser-catalogs)과 같다 — 생성 뒤 포저에서 같은 이름으로 보인다. */
export const STUDIO_VRM_EDITABLE_EXPRESSION_PRESETS: readonly StudioVrmEditableExpressionPresetSpec[] =
  Object.freeze([
    { name: "happy", label: "행복", parts: ALL_PARTS },
    { name: "angry", label: "화남", parts: ALL_PARTS },
    { name: "sad", label: "슬픔", parts: ALL_PARTS },
    { name: "relaxed", label: "편안", parts: ALL_PARTS },
    { name: "surprised", label: "놀람", parts: ALL_PARTS },
    { name: "aa", label: "입모양 A", parts: MOUTH_ONLY },
    { name: "ih", label: "입모양 I", parts: MOUTH_ONLY },
    { name: "ou", label: "입모양 U", parts: MOUTH_ONLY },
    { name: "ee", label: "입모양 E", parts: MOUTH_ONLY },
    { name: "oh", label: "입모양 O", parts: MOUTH_ONLY },
  ]);

const EDITABLE_PRESET_BY_NAME = new Map<string, StudioVrmEditableExpressionPresetSpec>(
  STUDIO_VRM_EDITABLE_EXPRESSION_PRESETS.map((spec) => [spec.name, spec]),
);

export type StudioVrmCustomExpressionTemplateId =
  | "mine"
  | "wink"
  | "jitome"
  | "smug"
  | "pout"
  | "shock"
  | "determined"
  | "teary"
  | "sleepy"
  | "laugh";

export type StudioVrmCustomExpressionTemplate = {
  readonly id: StudioVrmCustomExpressionTemplateId;
  readonly label: string;
  readonly hint: string;
  readonly delta: StudioVrmExpressionDelta;
  readonly eyeSide?: "left" | "right";
};

/**
 * 웹툰 컷에서 자주 쓰는 연기 표정. VRM 프리셋에 없는 것만 골랐다(프리셋과 겹치면 키가 충돌한다).
 * 값은 무표정에서의 조정량이고, 추가한 뒤에도 슬라이더로 자유롭게 다듬는다.
 */
export const STUDIO_VRM_CUSTOM_EXPRESSION_TEMPLATES: readonly StudioVrmCustomExpressionTemplate[] =
  Object.freeze([
    { id: "mine", label: "내 표정", hint: "무표정에서 직접 만들기", delta: {} },
    {
      id: "wink",
      label: "윙크",
      hint: "왼쪽 눈을 감고 웃기",
      eyeSide: "left",
      delta: { eyeClose: 1, eyeSmile: 0.35, browRaise: 0.15, mouthCurve: 0.6 },
    },
    {
      id: "jitome",
      label: "게슴츠레",
      hint: "반쯤 감은 시큰둥한 눈",
      delta: { eyeClose: 0.45, browRaise: -0.25, mouthWidth: -0.2, mouthCurve: -0.15 },
    },
    {
      id: "smug",
      label: "의기양양",
      hint: "눈을 가늘게 뜨고 씩 웃기",
      delta: { eyeClose: 0.35, eyeSmile: 0.3, browAngle: 0.15, mouthWidth: 0.2, mouthCurve: 0.75 },
    },
    {
      id: "pout",
      label: "뾰로통",
      hint: "입을 모으고 눈썹을 찌푸리기",
      delta: { browRaise: -0.1, browAngle: 0.35, mouthOpen: 0.2, mouthWidth: -0.6, mouthCurve: -0.4 },
    },
    {
      id: "shock",
      label: "충격",
      hint: "휘둥그레진 눈과 벌어진 입",
      delta: { browRaise: 1, eyeWiden: 1, irisSize: -0.6, mouthOpen: 0.75, mouthWidth: -0.2 },
    },
    {
      id: "determined",
      label: "결연",
      hint: "눈썹을 내리고 입을 다문 결심",
      delta: { browRaise: -0.5, browAngle: 0.55, eyeClose: 0.15, mouthWidth: -0.15, mouthCurve: -0.2 },
    },
    {
      id: "teary",
      label: "울먹임",
      hint: "처진 눈썹과 일그러진 입",
      delta: { browRaise: 0.3, browAngle: -0.8, eyeClose: 0.2, mouthOpen: 0.1, mouthCurve: -0.6 },
    },
    {
      id: "sleepy",
      label: "졸림",
      hint: "무거운 눈꺼풀",
      delta: { browRaise: -0.15, eyeClose: 0.7, mouthOpen: 0.05 },
    },
    {
      id: "laugh",
      label: "폭소",
      hint: "눈을 접고 크게 웃기",
      delta: { browRaise: 0.3, eyeClose: 0.85, eyeSmile: 1, mouthOpen: 0.9, mouthWidth: 0.35, mouthCurve: 0.8 },
    },
  ]);

const TEMPLATE_BY_ID = new Map<string, StudioVrmCustomExpressionTemplate>(
  STUDIO_VRM_CUSTOM_EXPRESSION_TEMPLATES.map((template) => [template.id, template]),
);
/** 템플릿을 알 수 없는 외부 입력의 표시용 템플릿. 조정량은 저장값을 그대로 쓰므로 모양은 바뀌지 않는다. */
const MINE_TEMPLATE = STUDIO_VRM_CUSTOM_EXPRESSION_TEMPLATES[0];

/** 한 캐릭터에 둘 수 있는 커스텀 표정 수. 모프 타깃 하나가 얼굴 정점 전체 델타라 무한정 늘리지 않는다. */
export const STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS = 12;

export type StudioVrmCustomExpression = {
  /**
   * VRM `expressions.custom` 의 키이자 모프 타깃 이름. 처음에는 템플릿 id(두 번째부터 `_2` 같은
   * 번호)이고, {@link renameStudioVrmCustomExpression} 으로 바꿀 수 있다.
   */
  readonly name: string;
  readonly template: StudioVrmCustomExpressionTemplateId;
  readonly delta: StudioVrmExpressionDelta;
  /** 눈 조정을 한쪽에만 건다(윙크). 생략 = 양쪽. */
  readonly eyeSide?: "left" | "right";
};

export type StudioVrmExpressionAuthoring = {
  readonly presets?: Readonly<Partial<Record<StudioVrmEditableExpressionPreset, StudioVrmExpressionDelta>>>;
  readonly custom?: readonly StudioVrmCustomExpression[];
};

/* -------------------------------------------------------------------------- */
/* 정규화                                                                       */
/* -------------------------------------------------------------------------- */

/** 템플릿에서 만든 그대로의 키(`wink`, `wink_2`). 화면 라벨을 템플릿 한글 이름으로 보여 줄지 정한다. */
const CUSTOM_NAME = /^([a-z]+)(?:_([2-9]|1[0-9]))?$/u;
/**
 * VRM 1.0 프리셋 이름(기본 표정 17종 + neutral)과 겹치는 커스텀 키는 익스포터가 거부하고 three-vrm 도
 * 버린다. 대소문자만 다른 이름(`Happy`)은 앱마다 다르게 다뤄질 수 있어 함께 막는다.
 */
const RESERVED_NAMES = new Set(
  STUDIO_VRM_DEFAULT_FACE_MORPHS.map((morph) => morph.name).concat("neutral").map((name) => name.toLowerCase()),
);
/** 커스텀 표정 이름의 최대 글자 수(코드 포인트). 포저 칩·다른 앱 목록에서 한눈에 읽히는 길이다. */
export const STUDIO_VRM_CUSTOM_EXPRESSION_NAME_MAX_LENGTH = 32;
/**
 * 커스텀 표정 이름에 쓸 수 있는 글자. 장면 문서 저장 경계(studio-vrm-scene-document)는 제어 문자나
 * `http:` 같은 참조 접두사가 든 문자열 하나만 있어도 조형 데이터 전체를 버리므로, 데이터 키와 같은
 * 집합(글자·숫자·공백·`_`·`-`·`.`)으로 좁혀 `:`·`/` 가 아예 들어오지 못하게 한다.
 */
const CUSTOM_NAME_CHARACTERS = /^[\p{L}\p{N}_ .-]+$/u;
const CUSTOM_NAME_SIGNIFICANT = /[\p{L}\p{N}]/u;

export type StudioVrmCustomExpressionNameIssue = "empty" | "tooLong" | "invalid" | "reserved" | "duplicate";

/** 입력한 이름을 저장할 모양으로 다듬는다. 조합형 한글은 완성형으로 모으고 앞뒤·연속 공백을 정리한다. */
export function normalizeStudioVrmCustomExpressionName(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/gu, " ");
}

/**
 * 커스텀 표정 이름의 문제를 돌려준다. `taken` 은 **다른** 커스텀 표정의 이름이고 대소문자를 가리지
 * 않고 비교한다. `name` 은 {@link normalizeStudioVrmCustomExpressionName} 을 거친 값이어야 한다.
 */
export function checkStudioVrmCustomExpressionName(
  name: string,
  taken: Iterable<string>,
): StudioVrmCustomExpressionNameIssue | null {
  if (!CUSTOM_NAME_SIGNIFICANT.test(name)) return "empty";
  if (Array.from(name).length > STUDIO_VRM_CUSTOM_EXPRESSION_NAME_MAX_LENGTH) return "tooLong";
  if (!CUSTOM_NAME_CHARACTERS.test(name)) return "invalid";
  const folded = name.toLowerCase();
  if (RESERVED_NAMES.has(folded)) return "reserved";
  for (const other of taken) {
    if (other.toLowerCase() === folded) return "duplicate";
  }
  return null;
}
/** 저장값 안정을 위한 반올림 단위. 슬라이더 한 칸(0.05)보다 충분히 잘다. */
const VALUE_PRECISION = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeDelta(raw: unknown, parts: readonly StudioVrmExpressionPart[]): StudioVrmExpressionDelta {
  if (!isRecord(raw)) return {};
  const delta: Partial<Record<StudioVrmExpressionParamKey, number>> = {};
  for (const key of STUDIO_VRM_EXPRESSION_PARAM_KEYS) {
    const spec = STUDIO_VRM_EXPRESSION_PARAMS[key];
    if (!parts.includes(spec.part)) continue;
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const bounded = Math.round(Math.min(spec.max, Math.max(spec.min, value)) * VALUE_PRECISION) / VALUE_PRECISION;
    if (bounded !== 0) delta[key] = bounded;
  }
  return delta;
}

function hasEntries(value: object): boolean {
  return Object.keys(value).length > 0;
}

/**
 * 저장본·외부 입력을 표정 편집 상태로 정규화한다. 비어 있으면 `undefined` 를 돌려줘
 * 조형 상태에 키가 생기지 않게 한다(하위호환 계약).
 */
export function sanitizeStudioVrmExpressionAuthoring(raw: unknown): StudioVrmExpressionAuthoring | undefined {
  if (!isRecord(raw)) return undefined;

  const presets: Partial<Record<StudioVrmEditableExpressionPreset, StudioVrmExpressionDelta>> = {};
  if (isRecord(raw.presets)) {
    for (const spec of STUDIO_VRM_EDITABLE_EXPRESSION_PRESETS) {
      const delta = sanitizeDelta(raw.presets[spec.name], spec.parts);
      if (hasEntries(delta)) presets[spec.name] = delta;
    }
  }

  const custom: StudioVrmCustomExpression[] = [];
  for (const entry of Array.isArray(raw.custom) ? raw.custom : []) {
    if (custom.length >= STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS) break;
    if (!isRecord(entry) || typeof entry.name !== "string") continue;
    // 다듬지 않은 이름은 버린다. 다듬어 받아 주면 같은 문서가 저장할 때마다 다른 키로 나간다.
    const name = entry.name;
    if (normalizeStudioVrmCustomExpressionName(name) !== name) continue;
    if (checkStudioVrmCustomExpressionName(name, custom.map((kept) => kept.name)) !== null) continue;
    // 이름을 바꾼 표정은 저장된 템플릿을 따르고, 이름 바꾸기 전에 저장한 문서는 키에서 템플릿을 유도한다.
    const template = (typeof entry.template === "string" ? TEMPLATE_BY_ID.get(entry.template) : undefined)
      ?? TEMPLATE_BY_ID.get(CUSTOM_NAME.exec(name)?.[1] ?? "")
      ?? MINE_TEMPLATE;
    custom.push({
      name,
      template: template.id,
      delta: sanitizeDelta(entry.delta, ALL_PARTS),
      ...(entry.eyeSide === "left" || entry.eyeSide === "right" ? { eyeSide: entry.eyeSide } : {}),
    });
  }

  if (!hasEntries(presets) && custom.length === 0) return undefined;
  return {
    ...(hasEntries(presets) ? { presets } : {}),
    ...(custom.length > 0 ? { custom } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* 조정량 → 패치 연산                                                            */
/* -------------------------------------------------------------------------- */

/**
 * 눈 세로 배율이 1 바뀔 때 윗눈꺼풀 선이 따라 움직이는 양(두개골 세로 반경 배수).
 * 기본 표정(blink·happy·relaxed)의 눈 배율과 선 이동을 맞춘 값이다 — 아래 고정으로 닫히면 윗선이
 * 눈 높이 대부분을 따라 내려오고, 가운데 고정이면 절반 남짓만 내려온다.
 */
const EYELINE_FOLLOW_BOTTOM = 0.383;
const EYELINE_FOLLOW_CENTER = 0.183;
const MIN_PATCH_SCALE = 0.02;
const MAX_PATCH_SCALE = 6;

function clampScale(value: number): number {
  return Math.min(MAX_PATCH_SCALE, Math.max(MIN_PATCH_SCALE, value));
}

/** 감김(+)은 완전히 감은 눈으로, 뜸(−)은 다 뜬 눈(1)으로 선형 보간한다. 이미 1 이상이면 더 뜨지 않는다. */
function closeEyeScale(base: number, amount: number): number {
  if (amount > 0) return base + (STUDIO_VRM_CLOSED_EYE_SCALE - base) * amount;
  if (amount < 0) return base + (Math.max(base, 1) - base) * -amount;
  return base;
}

type MutableOp = { -readonly [K in keyof StudioVrmFacePatchMorphOp]: StudioVrmFacePatchMorphOp[K] };

function compileDelta(
  base: StudioVrmFaceMorph | null,
  name: string,
  delta: StudioVrmExpressionDelta,
  eyeSide?: "left" | "right",
): StudioVrmFaceMorph {
  const ops: Partial<Record<StudioVrmFacePatchId, MutableOp>> = {};
  for (const [patch, op] of Object.entries(base?.ops ?? {}) as [StudioVrmFacePatchId, StudioVrmFacePatchMorphOp][]) {
    ops[patch] = { ...op };
  }
  const opFor = (patch: StudioVrmFacePatchId): MutableOp => (ops[patch] ??= {});
  const browRaise = delta.browRaise ?? 0;
  const browAngle = delta.browAngle ?? 0;
  const eyeClose = delta.eyeClose ?? 0;
  const eyeSmile = delta.eyeSmile ?? 0;
  const eyeWiden = delta.eyeWiden ?? 0;
  const irisSize = delta.irisSize ?? 0;
  const mouthOpen = delta.mouthOpen ?? 0;
  const mouthWidth = delta.mouthWidth ?? 0;
  const mouthCurve = delta.mouthCurve ?? 0;

  if (browRaise !== 0 || browAngle !== 0) {
    const brow = opFor("brow");
    if (browRaise !== 0) brow.offsetY = (brow.offsetY ?? 0) + 0.01 * browRaise;
    if (browAngle !== 0) brow.tilt = (brow.tilt ?? 0) + 0.34 * browAngle;
  }

  const touchesEye = eyeClose !== 0 || eyeSmile !== 0 || eyeWiden !== 0 || irisSize !== 0;
  if (touchesEye) {
    const eyeBase = ops.eye;
    const eyeBaseScale = eyeBase?.scaleY ?? 1;
    // 기본 표정이 가운데 고정으로 이미 눈을 줄였다면(화남·슬픔) 그 고정을 유지한다. 바꾸면 조정량이
    // 0 근처일 때 눈이 툭 내려앉는다. 배율이 1 이면 고정점이 결과에 영향을 주지 않으므로 아래 고정으로
    // 감기게 한다 — 눈꺼풀은 위에서 내려와 아래 선에서 닫힌다.
    const anchorBottom = eyeBase?.collapse === "bottom" || eyeBase?.scaleY === undefined;
    for (const patch of ["eye", "iris", "glint"] as const) {
      if (eyeClose === 0 && eyeSmile === 0 && eyeWiden === 0 && (patch === "eye" || irisSize === 0)) continue;
      const op = opFor(patch);
      if (eyeClose !== 0 || eyeWiden !== 0 || (patch !== "eye" && irisSize !== 0)) {
        let scaleX = op.scaleX ?? 1;
        let scaleY = closeEyeScale(op.scaleY ?? 1, eyeClose);
        if (eyeWiden !== 0 && patch !== "glint") {
          scaleX *= 1 + 0.1 * eyeWiden;
          scaleY *= 1 + (patch === "eye" ? 0.28 : 0.2) * eyeWiden;
        }
        if (irisSize !== 0 && patch !== "eye") {
          const factor = 1.3 ** irisSize;
          scaleX *= factor;
          scaleY *= factor;
        }
        if (scaleX !== (op.scaleX ?? 1)) op.scaleX = clampScale(scaleX);
        if (scaleY !== (op.scaleY ?? 1)) op.scaleY = clampScale(scaleY);
        // 고정점은 **감길 때만** 정한다. 눈동자 크기·눈 크게는 놀람 표정처럼 가운데를 기준으로 커져야 한다.
        if (anchorBottom && eyeClose !== 0) op.collapse = op.collapse ?? "bottom";
      }
      if (eyeSmile !== 0) op.bow = (op.bow ?? 0) + 0.012 * eyeSmile;
    }
    const follow = anchorBottom ? EYELINE_FOLLOW_BOTTOM : EYELINE_FOLLOW_CENTER;
    const shift = follow * (closeEyeScale(eyeBaseScale, eyeClose) - eyeBaseScale) + 0.02 * eyeWiden;
    if (shift !== 0 || eyeSmile !== 0) {
      const eyeline = opFor("eyeline");
      if (shift !== 0) eyeline.offsetHeadY = (eyeline.offsetHeadY ?? 0) + shift;
      if (eyeSmile !== 0) eyeline.bow = (eyeline.bow ?? 0) + 0.012 * eyeSmile;
    }
  }

  if (mouthOpen !== 0 || mouthWidth !== 0 || mouthCurve !== 0) {
    const mouth = opFor("mouth");
    if (mouthOpen !== 0) mouth.scaleY = clampScale((mouth.scaleY ?? 1) * 3 ** mouthOpen);
    if (mouthWidth !== 0) mouth.scaleX = clampScale((mouth.scaleX ?? 1) * 1.5 ** mouthWidth);
    if (mouthCurve !== 0) mouth.bow = (mouth.bow ?? 0) - 0.008 * mouthCurve;
  }

  const patchSides: Partial<Record<StudioVrmFacePatchId, "left" | "right">> = {};
  if (eyeSide) {
    for (const patch of ["eye", "iris", "glint", "eyeline"] as const) {
      if (ops[patch]) patchSides[patch] = eyeSide;
    }
  }

  return {
    name,
    ops,
    ...(base?.side ? { side: base.side } : {}),
    ...(hasEntries(patchSides) ? { patchSides } : {}),
  };
}

/**
 * 편집 상태를 얼굴 모프 목록으로 푼다. 편집이 없으면 **기본 테이블 그 자체**를 돌려준다
 * (호출자가 참조 비교로 "편집 없음"을 알 수 있고, 굽는 결과도 이전과 같다).
 *
 * 조정량이 하나도 없는 커스텀 표정은 내보내지 않는다 — 아무 변화 없는 모프 타깃은 파일만 키운다.
 */
export function resolveStudioVrmFaceMorphs(
  authoring: StudioVrmExpressionAuthoring | undefined,
): readonly StudioVrmFaceMorph[] {
  const presets = authoring?.presets;
  const custom = (authoring?.custom ?? []).filter((entry) => hasEntries(entry.delta));
  if ((!presets || !hasEntries(presets)) && custom.length === 0) return STUDIO_VRM_DEFAULT_FACE_MORPHS;

  const morphs = STUDIO_VRM_DEFAULT_FACE_MORPHS.map((morph) => {
    const delta = presets?.[morph.name as StudioVrmEditableExpressionPreset];
    return delta && hasEntries(delta) ? compileDelta(morph, morph.name, delta) : morph;
  });
  for (const entry of custom) morphs.push(compileDelta(null, entry.name, entry.delta, entry.eyeSide));
  return Object.freeze(morphs);
}

/* -------------------------------------------------------------------------- */
/* VRM 표정 메타데이터                                                          */
/* -------------------------------------------------------------------------- */

export type StudioVrmExpressionOverridePolicy = {
  readonly overrideBlink?: "block" | "blend";
  readonly overrideMouth?: "blend";
};

/**
 * 커스텀 표정이 깜빡임·립싱크와 **겹쳐 쌓이지 않게** 하는 VRM 1.0 override.
 *
 * 생성기의 기본 표정과 같은 원칙이다: 눈을 크게 바꾸는 표정은 깜빡임을 막고(block), 조금만
 * 바꾸면 세기에 비례해 줄인다(blend). 입 모양을 정한 표정은 대사 립싱크가 그 입을 덮어쓰지 않게
 * 입모양 표정을 세기에 비례해 줄인다.
 */
export function studioVrmExpressionOverridePolicy(delta: StudioVrmExpressionDelta): StudioVrmExpressionOverridePolicy {
  const strongEye = (delta.eyeClose ?? 0) >= 0.3 || (delta.eyeSmile ?? 0) >= 0.3 || (delta.eyeWiden ?? 0) >= 0.3;
  const anyEye = ["eyeClose", "eyeSmile", "eyeWiden", "irisSize"].some(
    (key) => (delta[key as StudioVrmExpressionParamKey] ?? 0) !== 0,
  );
  const anyMouth = ["mouthOpen", "mouthWidth", "mouthCurve"].some(
    (key) => (delta[key as StudioVrmExpressionParamKey] ?? 0) !== 0,
  );
  return {
    ...(strongEye ? { overrideBlink: "block" as const } : anyEye ? { overrideBlink: "blend" as const } : {}),
    ...(anyMouth ? { overrideMouth: "blend" as const } : {}),
  };
}

/** 두 깜빡임 정책 중 더 강한 쪽. 편집으로 눈을 많이 감은 기본 표정이 깜빡임과 겹쳐 뒤집히지 않게 한다. */
export function strongerStudioVrmBlinkOverride(
  left: "block" | "blend" | undefined,
  right: "block" | "blend" | undefined,
): "block" | "blend" | undefined {
  if (left === "block" || right === "block") return "block";
  return left ?? right;
}

/** 프리셋이 아닌 이름(커스텀 표정)인지. 생성 레시피가 `preset`/`custom` 으로 나눌 때 쓴다. */
export function isStudioVrmCustomExpressionName(name: string): boolean {
  return !RESERVED_NAMES.has(name.toLowerCase());
}

/** 커스텀 표정 키의 한글 라벨. 템플릿 키가 아니면 `null`(호출자가 원래 이름을 쓴다). */
export function studioVrmCustomExpressionLabel(name: string): string | null {
  const match = CUSTOM_NAME.exec(name);
  const template = match ? TEMPLATE_BY_ID.get(match[1]) : undefined;
  if (!match || !template) return null;
  return match[2] ? `${template.label} ${match[2]}` : template.label;
}

/**
 * 편집기에 보일 커스텀 표정 이름. 템플릿에서 만든 키 그대로면 그 템플릿의 한글 라벨, 사용자가 바꾼
 * 이름이면 그 이름이다 — 다른 템플릿 id 와 같은 이름(`smug`)으로 바꿔도 남의 라벨을 빌려 오지 않는다.
 */
export function studioVrmCustomExpressionDisplayName(entry: Pick<StudioVrmCustomExpression, "name" | "template">): string {
  const match = CUSTOM_NAME.exec(entry.name);
  const template = TEMPLATE_BY_ID.get(entry.template);
  if (!match || !template || match[1] !== template.id) return entry.name;
  return match[2] ? `${template.label} ${match[2]}` : template.label;
}

/* -------------------------------------------------------------------------- */
/* 편집 조작(UI 가 쓰는 순수 갱신 함수)                                          */
/* -------------------------------------------------------------------------- */

function withDelta(delta: StudioVrmExpressionDelta, key: StudioVrmExpressionParamKey, value: number) {
  return { ...delta, [key]: value };
}

/** 프리셋 표정의 슬라이더 하나를 바꾼다. 0 으로 돌리면 그 키가 사라진다. */
export function setStudioVrmPresetExpressionParam(
  authoring: StudioVrmExpressionAuthoring | undefined,
  preset: StudioVrmEditableExpressionPreset,
  key: StudioVrmExpressionParamKey,
  value: number,
): StudioVrmExpressionAuthoring | undefined {
  if (!EDITABLE_PRESET_BY_NAME.has(preset)) return sanitizeStudioVrmExpressionAuthoring(authoring);
  const current = authoring?.presets?.[preset] ?? {};
  return sanitizeStudioVrmExpressionAuthoring({
    ...authoring,
    presets: { ...authoring?.presets, [preset]: withDelta(current, key, value) },
  });
}

export function resetStudioVrmPresetExpression(
  authoring: StudioVrmExpressionAuthoring | undefined,
  preset: StudioVrmEditableExpressionPreset,
): StudioVrmExpressionAuthoring | undefined {
  const presets = { ...authoring?.presets };
  delete presets[preset];
  return sanitizeStudioVrmExpressionAuthoring({ ...authoring, presets });
}

/** 템플릿에서 커스텀 표정을 하나 더한다. 자리가 없으면 상태를 그대로 두고 `name: null` 을 돌려준다. */
export function addStudioVrmCustomExpression(
  authoring: StudioVrmExpressionAuthoring | undefined,
  templateId: StudioVrmCustomExpressionTemplateId,
): { readonly authoring: StudioVrmExpressionAuthoring | undefined; readonly name: string | null } {
  const template = TEMPLATE_BY_ID.get(templateId);
  const existing = authoring?.custom ?? [];
  if (!template || existing.length >= STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS) {
    return { authoring: sanitizeStudioVrmExpressionAuthoring(authoring), name: null };
  }
  // 이름을 바꾼 표정이 `Wink` 처럼 대소문자만 다른 키를 쓰고 있을 수 있어 접어서 비교한다.
  const taken = new Set(existing.map((entry) => entry.name.toLowerCase()));
  let name: string = template.id;
  for (let index = 2; taken.has(name); index += 1) {
    if (index > 19) return { authoring: sanitizeStudioVrmExpressionAuthoring(authoring), name: null };
    name = `${template.id}_${index}`;
  }
  const entry: StudioVrmCustomExpression = {
    name,
    template: template.id,
    delta: { ...template.delta },
    ...(template.eyeSide ? { eyeSide: template.eyeSide } : {}),
  };
  return {
    authoring: sanitizeStudioVrmExpressionAuthoring({ ...authoring, custom: [...existing, entry] }),
    name,
  };
}

function mapCustom(
  authoring: StudioVrmExpressionAuthoring | undefined,
  name: string,
  update: (entry: StudioVrmCustomExpression) => StudioVrmCustomExpression | null,
): StudioVrmExpressionAuthoring | undefined {
  const custom = (authoring?.custom ?? []).flatMap((entry) => {
    if (entry.name !== name) return [entry];
    const next = update(entry);
    return next ? [next] : [];
  });
  return sanitizeStudioVrmExpressionAuthoring({ ...authoring, custom });
}

export function setStudioVrmCustomExpressionParam(
  authoring: StudioVrmExpressionAuthoring | undefined,
  name: string,
  key: StudioVrmExpressionParamKey,
  value: number,
): StudioVrmExpressionAuthoring | undefined {
  return mapCustom(authoring, name, (entry) => ({ ...entry, delta: withDelta(entry.delta, key, value) }));
}

export function setStudioVrmCustomExpressionEyeSide(
  authoring: StudioVrmExpressionAuthoring | undefined,
  name: string,
  eyeSide: "both" | "left" | "right",
): StudioVrmExpressionAuthoring | undefined {
  return mapCustom(authoring, name, (entry) => (
    eyeSide === "both"
      ? { name: entry.name, template: entry.template, delta: entry.delta }
      : { ...entry, eyeSide }
  ));
}

export function removeStudioVrmCustomExpression(
  authoring: StudioVrmExpressionAuthoring | undefined,
  name: string,
): StudioVrmExpressionAuthoring | undefined {
  return mapCustom(authoring, name, () => null);
}

export type StudioVrmCustomExpressionRename =
  | { readonly ok: true; readonly authoring: StudioVrmExpressionAuthoring | undefined; readonly name: string }
  | { readonly ok: false; readonly issue: StudioVrmCustomExpressionNameIssue };

/**
 * 커스텀 표정의 이름(VRM 키)을 바꾼다. 입력은 {@link normalizeStudioVrmCustomExpressionName} 으로
 * 다듬은 뒤 검사하고, 문제가 있으면 상태를 바꾸지 않고 그 이유를 돌려준다. 같은 이름이면 그대로 둔다.
 */
export function renameStudioVrmCustomExpression(
  authoring: StudioVrmExpressionAuthoring | undefined,
  name: string,
  nextRaw: string,
): StudioVrmCustomExpressionRename {
  const next = normalizeStudioVrmCustomExpressionName(nextRaw);
  const others = (authoring?.custom ?? []).filter((entry) => entry.name !== name).map((entry) => entry.name);
  if (next === name) return { ok: true, authoring: sanitizeStudioVrmExpressionAuthoring(authoring), name };
  const issue = checkStudioVrmCustomExpressionName(next, others);
  if (issue) return { ok: false, issue };
  return { ok: true, authoring: mapCustom(authoring, name, (entry) => ({ ...entry, name: next })), name: next };
}

/** 편집한 표정 수(프리셋 + 조정한 커스텀). 패널 요약 배지에 쓴다. */
export function countStudioVrmEditedExpressions(authoring: StudioVrmExpressionAuthoring | undefined): number {
  const presets = Object.keys(authoring?.presets ?? {}).length;
  const custom = (authoring?.custom ?? []).filter((entry) => hasEntries(entry.delta)).length;
  return presets + custom;
}
