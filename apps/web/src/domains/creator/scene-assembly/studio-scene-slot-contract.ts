/**
 * Studio Scene Slot Contract — 문장→장면 조립의 슬롯 스키마 (계약 정본).
 *
 * 투닝 본체 "바이브 투닝"의 Scene JSON 파이프라인(툰스퀘어 공식 기술 블로그)을
 * 우리 구조로 흡수한 계약이다: 문장 1개를 배경 쿼리·캐릭터 슬롯(라벨·포즈·위치·
 * 스케일)·소품·대사·나레이션·효과음 슬롯으로 구조화하면, 자산 카탈로그 매칭
 * (studio-scene-catalog-assembly)이 장면 초안을 조립한다.
 *
 * 역할 분담:
 *  - 이 파일: 슬롯 문서의 타입·상한·정규화(검증)만. 파싱·검색·배치 로직 없음.
 *  - 구조화(structure)는 제공자 몫이다. AI 제공자는
 *    studio-scene-provider.ts의 StudioSceneStructureProvider 인터페이스를
 *    구현하고, 규칙 기반 폴백 구조화기(studio-scene-fallback-structurer)가
 *    제공자 실패·미연결 시 최소 동작을 보장한다(원 설계의 폴백 포인트).
 *  - 정규화는 경계 방어다: AI가 만든 JSON이든 손으로 쓴 문서든, 조립 단계에
 *    들어가기 전에 반드시 normalizeStudioSceneSlotDocument를 거친다.
 *    상한을 넘는 슬롯은 버려지지 않고 issues에 기록된 채 잘린다 — 조용히
 *    사라지는 데이터가 없게.
 *
 * 전부 순수·결정적. DOM/Konva/네트워크 의존성 없음.
 */

export const STUDIO_SCENE_SLOT_VERSION = 1 as const;

/** 슬롯 문서가 어디서 왔는가. "fallback"은 규칙 기반 구조화기 산출. */
export type StudioSceneSlotSource = "ai" | "fallback" | "manual";

/** 배경 메타(일러스트 팩 Studio2dAssetMetadata.timeOfDay)와 같은 어휘 + 새벽/아침. */
export type StudioSceneTimeOfDay = "새벽" | "아침" | "낮" | "노을" | "밤";
/** 배경 메타(Studio2dAssetMetadata.environment)와 같은 어휘. */
export type StudioSceneEnvironment = "실내" | "실외";

/** 캐릭터의 프레임 안 자리. 조립 단계가 앵커 비율로 변환한다. */
export type StudioSceneCharacterPosition =
  | "left"
  | "center"
  | "right"
  | "foreground"
  | "background";
/** 캐릭터가 바라보는 방향. 조립 시 ImageEl.flipped로 변환된다. */
export type StudioSceneFacing = "left" | "right" | "front";
/** 대사 말풍선 형태 힌트 — SceneSeedBubble.variant와 호환되는 부분집합. */
export type StudioSceneDialogueVariantHint =
  | "speech"
  | "thought"
  | "shout"
  | "whisper";

export interface StudioSceneBackgroundSlot {
  /** 배경 자산 검색 쿼리(예: "노을 진 옥상"). */
  readonly query: string;
  /** 검색 보조 키워드(동의어·시간대·날씨 포함 가능). */
  readonly keywords: readonly string[];
  readonly timeOfDay?: StudioSceneTimeOfDay;
  readonly environment?: StudioSceneEnvironment;
  /** 분위기 메모(예: "긴장", "포근") — 매칭 가점에만 쓰인다. */
  readonly mood?: string;
}

export interface StudioSceneCharacterSlot {
  /** 캐릭터 라벨 — 프로젝트 명단의 이름 또는 역할명(예: "지훈", "소녀"). */
  readonly label: string;
  /** 캐릭터 자산 검색 쿼리(보통 `${label} ${pose}`). */
  readonly query: string;
  /** 포즈 라벨(예: "앉은", "달리는"). 자산 키워드 매칭에 쓰인다. */
  readonly pose?: string;
  /** 표정 라벨(예: "기쁨", "놀람"). */
  readonly expression?: string;
  readonly position: StudioSceneCharacterPosition;
  /** 상대 크기 0.3–1.6 (1 = 기본 신장). 정규화가 클램프한다. */
  readonly scale: number;
  readonly facing: StudioSceneFacing;
}

export type StudioScenePropPosition = "left" | "center" | "right" | "bottom";

export interface StudioScenePropSlot {
  readonly query: string;
  readonly keywords: readonly string[];
  readonly position: StudioScenePropPosition;
  /** 상대 크기 0.3–1.6. 정규화가 클램프한다. */
  readonly scale: number;
}

export interface StudioSceneDialogueSlot {
  readonly text: string;
  /** 화자 라벨 — 캐릭터 슬롯 label과 같으면 그 캐릭터 위에 말풍선이 붙는다. */
  readonly speaker?: string;
  readonly variantHint: StudioSceneDialogueVariantHint;
}

export interface StudioSceneNarrationSlot {
  readonly text: string;
}

export interface StudioSceneSfxSlot {
  readonly text: string;
  readonly emphasis: "normal" | "strong";
}

/** 문장 1개가 구조화된 장면 슬롯 문서. 조립 단계의 유일한 입력 계약. */
export interface StudioSceneSlotDocument {
  readonly version: typeof STUDIO_SCENE_SLOT_VERSION;
  /** 원문 문장(추적·재구조화용으로 항상 보존). */
  readonly sentence: string;
  readonly source: StudioSceneSlotSource;
  /** 배경을 특정할 수 없으면 null — 조립 단계가 무채색 프레임으로 폴백한다. */
  readonly background: StudioSceneBackgroundSlot | null;
  readonly characters: readonly StudioSceneCharacterSlot[];
  readonly props: readonly StudioScenePropSlot[];
  readonly dialogues: readonly StudioSceneDialogueSlot[];
  readonly narrations: readonly StudioSceneNarrationSlot[];
  readonly sfx: readonly StudioSceneSfxSlot[];
  /** 구조화·정규화 과정에서 생긴 정직한 경고(숨기지 않는다). */
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// 상한 — AI 산출이 폭주해도 캔버스와 검수 비용이 예측 가능하게.
// ---------------------------------------------------------------------------

export const STUDIO_SCENE_MAX_CHARACTERS = 4;
export const STUDIO_SCENE_MAX_PROPS = 6;
export const STUDIO_SCENE_MAX_DIALOGUES = 6;
export const STUDIO_SCENE_MAX_NARRATIONS = 3;
export const STUDIO_SCENE_MAX_SFX = 4;
export const STUDIO_SCENE_MAX_KEYWORDS = 8;
export const STUDIO_SCENE_SENTENCE_MAX_LENGTH = 1000;
export const STUDIO_SCENE_QUERY_MAX_LENGTH = 80;
export const STUDIO_SCENE_LABEL_MAX_LENGTH = 40;
export const STUDIO_SCENE_DIALOGUE_MAX_LENGTH = 200;
export const STUDIO_SCENE_NARRATION_MAX_LENGTH = 300;
export const STUDIO_SCENE_SCALE_MIN = 0.3;
export const STUDIO_SCENE_SCALE_MAX = 1.6;

// ---------------------------------------------------------------------------
// 정규화 — studio-element-model의 bounded 텍스트 규약(제어문자 제거·
// surrogate pair 절단 방지)과 같은 방식을 이 계약 안에서 자체 적용한다.
// ---------------------------------------------------------------------------

function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  let safe = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    safe += cp <= 31 || (cp >= 127 && cp <= 159) ? " " : ch;
  }
  const collapsed = safe.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maximum) return collapsed;
  const truncated = collapsed.slice(0, maximum);
  const tail = truncated.charCodeAt(truncated.length - 1);
  return tail >= 0xd800 && tail <= 0xdbff ? truncated.slice(0, -1) : truncated;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeKeywords(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const kw = boundedText(raw, 24);
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    out.push(kw);
    if (out.length >= STUDIO_SCENE_MAX_KEYWORDS) break;
  }
  return out;
}

function normalizeScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(STUDIO_SCENE_SCALE_MAX, Math.max(STUDIO_SCENE_SCALE_MIN, value));
}

const TIME_OF_DAYS: readonly string[] = ["새벽", "아침", "낮", "노을", "밤"];
const ENVIRONMENTS: readonly string[] = ["실내", "실외"];
const CHARACTER_POSITIONS: readonly string[] = [
  "left",
  "center",
  "right",
  "foreground",
  "background",
];
const FACINGS: readonly string[] = ["left", "right", "front"];
const PROP_POSITIONS: readonly string[] = ["left", "center", "right", "bottom"];
const VARIANT_HINTS: readonly string[] = ["speech", "thought", "shout", "whisper"];
const SOURCES: readonly string[] = ["ai", "fallback", "manual"];

function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly string[],
  fallback: T
): T {
  return typeof value === "string" && allowed.includes(value) ? (value as T) : fallback;
}

function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly string[]
): T | undefined {
  return typeof value === "string" && allowed.includes(value) ? (value as T) : undefined;
}

export interface StudioSceneNormalizeResult {
  /** 구조적으로 쓸 수 없으면(원문이 없음) null. 그 외에는 항상 정규화 문서. */
  readonly document: StudioSceneSlotDocument | null;
  /** 정규화 중 잘리거나 버려진 것들의 기록. */
  readonly issues: readonly string[];
}

/** 빈 슬롯 문서 — 구조화기가 채워 넣을 출발점. */
export function emptyStudioSceneSlotDocument(
  sentence: string,
  source: StudioSceneSlotSource
): StudioSceneSlotDocument {
  return {
    version: STUDIO_SCENE_SLOT_VERSION,
    sentence: boundedText(sentence, STUDIO_SCENE_SENTENCE_MAX_LENGTH),
    source,
    background: null,
    characters: [],
    props: [],
    dialogues: [],
    narrations: [],
    sfx: [],
    warnings: [],
  };
}

/**
 * 임의의 값(주로 AI 제공자 JSON)을 슬롯 문서로 정규화한다.
 * 원문 문장이 비어 있으면 document=null — 호출자는 폴백 구조화기로
 * 되돌아가야 한다(studio-scene-provider의 계약).
 */
export function normalizeStudioSceneSlotDocument(
  raw: unknown,
  fallbackSource: StudioSceneSlotSource
): StudioSceneNormalizeResult {
  const issues: string[] = [];
  const root = asRecord(raw);
  const sentence = boundedText(root.sentence, STUDIO_SCENE_SENTENCE_MAX_LENGTH);
  if (!sentence) {
    return { document: null, issues: ["sentence-missing"] };
  }
  const source = pickEnum<StudioSceneSlotSource>(root.source, SOURCES, fallbackSource);

  // — 배경 —
  let background: StudioSceneBackgroundSlot | null = null;
  if (root.background != null) {
    const bg = asRecord(root.background);
    const keywords = normalizeKeywords(bg.keywords);
    let query = boundedText(bg.query, STUDIO_SCENE_QUERY_MAX_LENGTH);
    if (!query && keywords.length > 0) query = keywords.join(" ");
    if (!query) {
      issues.push("background-query-empty");
    } else {
      background = {
        query,
        keywords,
        ...(optionalEnum<StudioSceneTimeOfDay>(bg.timeOfDay, TIME_OF_DAYS)
          ? { timeOfDay: optionalEnum<StudioSceneTimeOfDay>(bg.timeOfDay, TIME_OF_DAYS) }
          : {}),
        ...(optionalEnum<StudioSceneEnvironment>(bg.environment, ENVIRONMENTS)
          ? { environment: optionalEnum<StudioSceneEnvironment>(bg.environment, ENVIRONMENTS) }
          : {}),
        ...(boundedText(bg.mood, STUDIO_SCENE_LABEL_MAX_LENGTH)
          ? { mood: boundedText(bg.mood, STUDIO_SCENE_LABEL_MAX_LENGTH) }
          : {}),
      };
    }
  }

  // — 캐릭터 —
  const characters: StudioSceneCharacterSlot[] = [];
  if (Array.isArray(root.characters)) {
    for (const entry of root.characters) {
      const c = asRecord(entry);
      const label = boundedText(c.label, STUDIO_SCENE_LABEL_MAX_LENGTH);
      if (!label) {
        issues.push("character-label-empty");
        continue;
      }
      const pose = boundedText(c.pose, STUDIO_SCENE_LABEL_MAX_LENGTH) || undefined;
      characters.push({
        label,
        query:
          boundedText(c.query, STUDIO_SCENE_QUERY_MAX_LENGTH) ||
          (pose ? `${label} ${pose}` : label),
        ...(pose ? { pose } : {}),
        ...(boundedText(c.expression, STUDIO_SCENE_LABEL_MAX_LENGTH)
          ? { expression: boundedText(c.expression, STUDIO_SCENE_LABEL_MAX_LENGTH) }
          : {}),
        position: pickEnum<StudioSceneCharacterPosition>(
          c.position,
          CHARACTER_POSITIONS,
          "center"
        ),
        scale: normalizeScale(c.scale),
        facing: pickEnum<StudioSceneFacing>(c.facing, FACINGS, "front"),
      });
      if (characters.length >= STUDIO_SCENE_MAX_CHARACTERS) {
        if (root.characters.length > STUDIO_SCENE_MAX_CHARACTERS) {
          issues.push("characters-truncated");
        }
        break;
      }
    }
  }

  // — 소품 —
  const props: StudioScenePropSlot[] = [];
  if (Array.isArray(root.props)) {
    for (const entry of root.props) {
      const p = asRecord(entry);
      const query = boundedText(p.query, STUDIO_SCENE_QUERY_MAX_LENGTH);
      if (!query) {
        issues.push("prop-query-empty");
        continue;
      }
      props.push({
        query,
        keywords: normalizeKeywords(p.keywords),
        position: pickEnum<StudioScenePropPosition>(p.position, PROP_POSITIONS, "bottom"),
        scale: normalizeScale(p.scale),
      });
      if (props.length >= STUDIO_SCENE_MAX_PROPS) {
        if (root.props.length > STUDIO_SCENE_MAX_PROPS) issues.push("props-truncated");
        break;
      }
    }
  }

  // — 대사 —
  const dialogues: StudioSceneDialogueSlot[] = [];
  if (Array.isArray(root.dialogues)) {
    for (const entry of root.dialogues) {
      const d = asRecord(entry);
      const text = boundedText(d.text, STUDIO_SCENE_DIALOGUE_MAX_LENGTH);
      if (!text) {
        issues.push("dialogue-text-empty");
        continue;
      }
      dialogues.push({
        text,
        ...(boundedText(d.speaker, STUDIO_SCENE_LABEL_MAX_LENGTH)
          ? { speaker: boundedText(d.speaker, STUDIO_SCENE_LABEL_MAX_LENGTH) }
          : {}),
        variantHint: pickEnum<StudioSceneDialogueVariantHint>(
          d.variantHint,
          VARIANT_HINTS,
          "speech"
        ),
      });
      if (dialogues.length >= STUDIO_SCENE_MAX_DIALOGUES) {
        if (root.dialogues.length > STUDIO_SCENE_MAX_DIALOGUES) {
          issues.push("dialogues-truncated");
        }
        break;
      }
    }
  }

  // — 나레이션 —
  const narrations: StudioSceneNarrationSlot[] = [];
  if (Array.isArray(root.narrations)) {
    for (const entry of root.narrations) {
      const n = asRecord(entry);
      const text = boundedText(n.text, STUDIO_SCENE_NARRATION_MAX_LENGTH);
      if (!text) continue;
      narrations.push({ text });
      if (narrations.length >= STUDIO_SCENE_MAX_NARRATIONS) {
        if (root.narrations.length > STUDIO_SCENE_MAX_NARRATIONS) {
          issues.push("narrations-truncated");
        }
        break;
      }
    }
  }

  // — 효과음 —
  const sfx: StudioSceneSfxSlot[] = [];
  if (Array.isArray(root.sfx)) {
    for (const entry of root.sfx) {
      const s = asRecord(entry);
      const text = boundedText(s.text, STUDIO_SCENE_LABEL_MAX_LENGTH);
      if (!text) continue;
      sfx.push({ text, emphasis: s.emphasis === "strong" ? "strong" : "normal" });
      if (sfx.length >= STUDIO_SCENE_MAX_SFX) {
        if (root.sfx.length > STUDIO_SCENE_MAX_SFX) issues.push("sfx-truncated");
        break;
      }
    }
  }

  const warnings: string[] = [];
  if (Array.isArray(root.warnings)) {
    for (const w of root.warnings) {
      const text = boundedText(w, 120);
      if (text) warnings.push(text);
      if (warnings.length >= 8) break;
    }
  }

  return {
    document: {
      version: STUDIO_SCENE_SLOT_VERSION,
      sentence,
      source,
      background,
      characters,
      props,
      dialogues,
      narrations,
      sfx,
      warnings,
    },
    issues,
  };
}

/** 정규화를 이미 거친 문서인지 빠르게 판정(호스트 배선 가드용). */
export function isStudioSceneSlotDocument(value: unknown): value is StudioSceneSlotDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<StudioSceneSlotDocument>;
  return (
    doc.version === STUDIO_SCENE_SLOT_VERSION &&
    typeof doc.sentence === "string" &&
    doc.sentence.length > 0 &&
    Array.isArray(doc.characters) &&
    Array.isArray(doc.dialogues) &&
    Array.isArray(doc.narrations)
  );
}
