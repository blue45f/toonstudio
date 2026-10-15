import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MATERIAL_LEXICON } from "./material-intent-lexicon";
import {
  isSearchableLens,
  MATERIAL_INTENT_MAX_LENGTH,
  MATERIAL_LENS_DEFINITIONS,
  MATERIAL_MARKET_TAGS,
  MATERIAL_WEATHER_CITIES,
  materialLensDefinition,
  materialMarketParams,
  normalizeMaterialIntentInput,
  planMaterialIntent,
} from "./material-intent-plan";
import { resolveReferenceQuery } from "./reference-query-language";

import type {
  MaterialCueAxis,
  MaterialIntentLens,
  MaterialIntentPlan,
  MaterialLensId,
  MaterialLensProvider,
} from "./material-intent-plan";

/** 전각 공백(U+3000). 소스에 보이지 않는 문자를 두지 않으려고 코드로 만든다. */
const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);

/** 제어 문자(U+0000~U+001F, U+007F)가 하나라도 있는지. 정규식 대신 코드 값으로 검사한다. */
function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
}

const lensIds = (plan: MaterialIntentPlan): MaterialLensId[] => plan.lenses.map((lens) => lens.id);

function lensOf(plan: MaterialIntentPlan, id: MaterialLensId): MaterialIntentLens {
  const lens = [...plan.lenses, ...plan.alternatives].find((candidate) => candidate.id === id);
  if (!lens) throw new Error(`렌즈 ${id} 가 계획에 없다: ${plan.input}`);
  return lens;
}

interface SentenceCase {
  readonly input: string;
  /** 고른 렌즈(점수순). 정확히 일치해야 한다. */
  readonly lenses: readonly MaterialLensId[];
  /** 제공처별로 실제 보내는 검색어 중 확인할 것 */
  readonly queries?: Readonly<Partial<Record<MaterialLensProvider, string>>>;
  readonly unresolved?: readonly string[];
  readonly passthrough?: readonly string[];
  readonly conflicts?: readonly MaterialCueAxis[];
  readonly status?: MaterialIntentPlan["status"];
}

/**
 * 한국어 문장 케이스. 기대값은 규칙(단서 사전·점수·검색어 조합)이 낸 결과를 사람이 읽고 타당한지 확인해 고정한 것이다.
 * 규칙을 바꾸면 이 표가 먼저 깨지므로, 바뀐 렌즈·검색어가 의도인지 검토한 뒤 갱신한다.
 */
const SENTENCE_CASES: readonly SentenceCase[] = [
  // ── 대표 문장 ──────────────────────────────────────────────────────────
  { input: "비 오는 골목 야경", lenses: ["3d-material", "weather-light"], queries: { polyhaven: "alley night" } },
  { input: "조선시대 한복 입은 인물 포즈", lenses: ["reference-art"], queries: { met: "Joseon Korean costume pose", vam: "Joseon Korean costume pose" } },
  {
    input: "1980년대 서울 시장 사진",
    lenses: ["photo-archive", "korean-place"],
    queries: { internetarchive: "1980s Seoul market photograph", wikimedia: "서울", kheritage: "서울", tourapi: "서울 시장", korean: "시장" },
  },
  // ── 소재 탐색 예시(material-search-ux) ────────────────────────────────
  { input: "벚꽃 배경", lenses: ["market-resource", "3d-material"], queries: { polyhaven: "cherry blossom" } },
  { input: "한복 캐릭터", lenses: ["reference-art"], queries: { aic: "Korean costume figure" } },
  { input: "나무 질감", lenses: ["3d-material"], queries: { polyhaven: "wood", ambientcg: "wood" } },
  { input: "골목 야경", lenses: ["3d-material", "weather-light", "market-resource"], queries: { ambientcg: "alley night" } },
  { input: "낡은 벽돌", lenses: ["3d-material"], queries: { polyhaven: "worn brick" } },
  { input: "숲속 빛", lenses: ["weather-light", "3d-material"], queries: { polyhaven: "forest light" } },
  // ── 폰트·마켓·내 라이브러리 ───────────────────────────────────────────
  { input: "손글씨 폰트", lenses: ["font"], queries: { googlefonts: "korean handwriting" } },
  { input: "명조체 폰트", lenses: ["font"], queries: { googlefonts: "korean serif" } },
  { input: "저작권 걱정 없는 학교 배경", lenses: ["market-resource", "3d-material"], queries: { polyhaven: "school" } },
  { input: "템플릿 브러시", lenses: ["market-resource"], conflicts: ["market-kind"] },
  { input: "G펜 브러시 CC0", lenses: ["market-resource"] },
  { input: "소품 의자", lenses: ["market-resource", "3d-material", "reference-art"], queries: { polyhaven: "chair", met: "chair" } },
  { input: "3D 소품", lenses: ["market-resource"] },
  { input: "내가 저장한 고양이 3D 모델", lenses: ["my-library", "3d-material", "creature", "market-resource"], queries: { polyhaven: "cat", gbif: "고양이" } },
  // ── 상충 단서 ─────────────────────────────────────────────────────────
  { input: "맑은 날 비 오는 골목", lenses: ["3d-material", "weather-light", "market-resource"], conflicts: ["weather"] },
  { input: "여름 눈 오는 거리", lenses: ["3d-material", "weather-light", "market-resource"], conflicts: ["season"] },
  { input: "밤 낮 골목", lenses: ["3d-material", "weather-light"], conflicts: ["time"] },
  { input: "비상업 CC0 팔레트", lenses: ["market-resource"], conflicts: ["license"] },
  { input: "조선시대 1980년대 시장", lenses: ["photo-archive", "3d-material", "market-resource"], conflicts: ["era"] },
  // ── 날씨·장소·시대 ────────────────────────────────────────────────────
  { input: "서울 비 오는 밤", lenses: ["weather-light", "3d-material", "korean-place", "photo-archive"], queries: { metweather: "서울", polyhaven: "rain night" } },
  { input: "20세기 초 서울 거리", lenses: ["photo-archive", "3d-material", "korean-place"], queries: { internetarchive: "early 20th century Seoul street" } },
  { input: "경복궁 야경", lenses: ["korean-place", "3d-material", "weather-light"], queries: { kheritage: "경복궁", tourapi: "경복궁" } },
  { input: "한옥 마을 눈 오는 겨울 밤", lenses: ["3d-material", "weather-light", "korean-place"], queries: { tourapi: "한옥 마을", kheritage: "한옥" } },
  { input: "1920년대 기차역", lenses: ["photo-archive", "3d-material", "market-resource"], queries: { internetarchive: "1920s train station" } },
  { input: "80년대 서울", lenses: ["photo-archive", "korean-place"], queries: { internetarchive: "1980s Seoul" } },
  { input: "19세기 런던 거리", lenses: ["photo-archive", "3d-material", "reference-art"], queries: { internetarchive: "19th century London street", wikimedia: "런던" } },
  { input: "조선 말 한복", lenses: ["reference-art"], queries: { met: "late Joseon Korean costume" } },
  { input: "도쿄 야경 사진", lenses: ["photo-archive"], queries: { internetarchive: "Tokyo night photograph", wikimedia: "도쿄" } },
  { input: "한강 노을", lenses: ["korean-place", "3d-material", "photo-archive", "weather-light"], queries: { kheritage: "한강" } },
  { input: "중세 갑옷", lenses: ["reference-art", "3d-material"], queries: { met: "medieval armor" } },
  { input: "고양이 사진 흑백", lenses: ["photo-archive"], queries: { internetarchive: "cat black and white photograph" } },
  // ── 생물 ──────────────────────────────────────────────────────────────
  { input: "여우", lenses: ["creature"], queries: { gbif: "여우" } },
  { input: "올빼미", lenses: ["creature"], queries: { gbif: "owl" } },
  // ── 공간·자연 ─────────────────────────────────────────────────────────
  { input: "가을 단풍 숲", lenses: ["3d-material"], queries: { polyhaven: "autumn leaves forest" } },
  { input: "해질녘 바다", lenses: ["3d-material", "weather-light"], queries: { polyhaven: "sunset sea" } },
  { input: "교실 창가 햇살", lenses: ["3d-material", "market-resource", "weather-light"], queries: { polyhaven: "classroom window side" } },
  { input: "학교 복도", lenses: ["3d-material", "market-resource"], queries: { polyhaven: "school hallway" } },
  { input: "카페 인테리어", lenses: ["3d-material", "market-resource"], queries: { polyhaven: "cafe interior" } },
  // ── 영어 혼용 ─────────────────────────────────────────────────────────
  { input: "rainy alley at night", lenses: ["3d-material", "weather-light"], queries: { polyhaven: "alley night" } },
  { input: "samurai armor", lenses: ["reference-art", "3d-material"], queries: { met: "samurai armor" }, passthrough: ["samurai"] },
  { input: "Nujabes 같은 분위기", lenses: ["reference-art"], queries: { met: "Nujabes" }, passthrough: ["Nujabes"], status: "fallback" },
  // ── 미지원 단어 보존 ──────────────────────────────────────────────────
  { input: "스산한 폐건물", lenses: ["3d-material", "market-resource"], queries: { polyhaven: "스산한 abandoned building" }, unresolved: ["스산한"] },
  { input: "20년대 서울", lenses: ["korean-place", "photo-archive"], queries: { internetarchive: "20년대 Seoul" }, unresolved: ["20년대"] },
  // ── 중복 · 띄어쓰기 ──────────────────────────────────────────────────
  { input: "비 비 비 골목 골목", lenses: ["3d-material", "weather-light", "market-resource"], queries: { polyhaven: "rain alley" } },
  { input: "비오는골목야경", lenses: ["3d-material", "weather-light"], queries: { polyhaven: "alley night" } },
  { input: "  비   오는   골목  ", lenses: ["3d-material", "weather-light", "market-resource"], queries: { polyhaven: "rain alley" } },
  // ── 한 낱말 ──────────────────────────────────────────────────────────
  { input: "비", lenses: ["weather-light", "3d-material"], queries: { polyhaven: "rain" } },
  { input: "눈", lenses: ["weather-light", "3d-material"], queries: { polyhaven: "snow" } },
];

describe("planMaterialIntent — 한국어 문장 케이스", () => {
  it("문장 케이스가 40개 이상이다", () => {
    expect(SENTENCE_CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(SENTENCE_CASES.map((testCase) => testCase.input)).size).toBe(SENTENCE_CASES.length);
  });

  it.each(SENTENCE_CASES)("$input", (testCase) => {
    const plan = planMaterialIntent(testCase.input);
    expect(plan.status).toBe(testCase.status ?? "ready");
    expect(lensIds(plan)).toEqual(testCase.lenses);
    for (const [provider, query] of Object.entries(testCase.queries ?? {})) {
      const lens = plan.lenses.find((candidate) => candidate.providers.includes(provider as MaterialLensProvider));
      expect(lens, `${provider} 를 가진 렌즈`).toBeDefined();
      expect(lens?.providerQueries[provider as MaterialLensProvider]).toBe(query);
    }
    if (testCase.unresolved) expect(plan.unresolved).toEqual(testCase.unresolved);
    else expect(plan.unresolved).toEqual([]);
    if (testCase.passthrough) expect(plan.passthrough).toEqual(testCase.passthrough);
    expect(plan.conflicts.map((conflict) => conflict.axis)).toEqual(testCase.conflicts ?? []);
  });

  it("모든 케이스의 제공처 검색어가 서버 제한(2~80자, 제어문자 없음) 안에 있다", () => {
    for (const testCase of SENTENCE_CASES) {
      const plan = planMaterialIntent(testCase.input);
      for (const lens of [...plan.lenses, ...plan.alternatives]) {
        for (const query of Object.values(lens.providerQueries)) {
          expect(query.length, `${testCase.input} / ${lens.id}`).toBeGreaterThanOrEqual(2);
          expect(query.length, `${testCase.input} / ${lens.id}`).toBeLessThanOrEqual(MATERIAL_INTENT_MAX_LENGTH);
          expect(hasControlCharacter(query), `${testCase.input} / ${lens.id}`).toBe(false);
        }
      }
    }
  });

  it("렌즈마다 근거 단서와 한·영 이유, 0~1 신뢰도를 갖는다", () => {
    for (const testCase of SENTENCE_CASES) {
      const plan = planMaterialIntent(testCase.input);
      const cueIds = new Set(plan.cues.map((cue) => cue.id));
      for (const lens of plan.lenses) {
        expect(lens.reason.length).toBeGreaterThan(0);
        expect(lens.reasonEn.length).toBeGreaterThan(0);
        expect(lens.confidence).toBeGreaterThanOrEqual(0.2);
        expect(lens.confidence).toBeLessThanOrEqual(0.95);
        for (const cueId of lens.cueIds) expect(cueIds.has(cueId)).toBe(true);
      }
    }
  });
});

describe("입력 정규화 · 빈 입력 · 80자 상한", () => {
  it.each(["", "   ", "\n\t", "!!!", "...,,,", "??"])("%j 는 빈 계획이다", (input) => {
    const plan = planMaterialIntent(input);
    expect(plan.status).toBe("empty");
    expect(plan.lenses).toEqual([]);
    expect(plan.cues).toEqual([]);
    expect(plan.market).toEqual({ tags: [], query: "" });
    expect(plan.myLibrary.keywords).toEqual([]);
  });

  it("한 글자 영문처럼 보낼 검색어를 만들 수 없는 입력은 빈 계획이고 낱말은 남긴다", () => {
    const plan = planMaterialIntent("x");
    expect(plan.status).toBe("empty");
    expect(plan.passthrough).toEqual(["x"]);
  });

  it("NFKC 로 정규화한다: 전각 문자·전각 공백을 반각으로 바꾼다", () => {
    const plan = planMaterialIntent(`ＣＣ０${IDEOGRAPHIC_SPACE}배경`);
    expect(plan.input).toBe("CC0 배경");
    expect(plan.market.license).toBe("cc0-1.0");
    expect(normalizeMaterialIntentInput(`  골목${IDEOGRAPHIC_SPACE}${IDEOGRAPHIC_SPACE}야경  `).text).toBe("골목 야경");
  });

  it("제어 문자는 공백으로 바꾼다", () => {
    expect(normalizeMaterialIntentInput("비\u0000오는\u0007골목").text).toBe("비 오는 골목");
  });

  it("80자를 넘는 문장은 낱말 경계에서 잘라 truncated 로 알리고 계획은 그대로 만든다", () => {
    const long = `비 오는 골목 야경 ${"아주 긴 설명을 덧붙여 ".repeat(8)}`;
    expect(long.length).toBeGreaterThan(MATERIAL_INTENT_MAX_LENGTH);
    const plan = planMaterialIntent(long);
    expect(plan.truncated).toBe(true);
    expect(plan.input.length).toBeLessThanOrEqual(MATERIAL_INTENT_MAX_LENGTH);
    expect(plan.originalLength).toBeGreaterThan(MATERIAL_INTENT_MAX_LENGTH);
    expect(plan.input.startsWith("비 오는 골목 야경")).toBe(true);
    expect(lensIds(plan)).toContain("3d-material");
    expect(plan.input.endsWith(" ")).toBe(false);
  });

  it("정확히 80자는 자르지 않고, 81자는 자른다", () => {
    const exact = "가".repeat(MATERIAL_INTENT_MAX_LENGTH);
    expect(planMaterialIntent(exact).truncated).toBe(false);
    expect(planMaterialIntent(`${exact}나`).truncated).toBe(true);
    expect(planMaterialIntent(`${exact}나`).input).toBe(exact);
  });

  it("서로게이트 쌍을 가르지 않는다", () => {
    const text = `${"가".repeat(MATERIAL_INTENT_MAX_LENGTH - 1)}😀`;
    const normalized = normalizeMaterialIntentInput(text);
    expect(normalized.truncated).toBe(true);
    const last = normalized.text.charCodeAt(normalized.text.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    expect(() => encodeURIComponent(normalized.text)).not.toThrow();
  });

  it("아주 긴 입력도 안전하게 자른다", () => {
    const plan = planMaterialIntent("비 ".repeat(50_000));
    expect(plan.input.length).toBeLessThanOrEqual(MATERIAL_INTENT_MAX_LENGTH);
    expect(plan.truncated).toBe(true);
  });
});

describe("영어 혼용", () => {
  it("영어 단서도 같은 단서로 올려 한글 문장과 같은 렌즈를 고른다", () => {
    const korean = planMaterialIntent("비 오는 골목 밤");
    const english = planMaterialIntent("rainy alley night");
    expect(lensIds(english)).toEqual(lensIds(korean));
    expect(english.cues.map((cue) => cue.id)).toEqual(korean.cues.map((cue) => cue.id));
  });

  it("섞어 써도 된다: 한글 단서와 영어 단서를 한 문장에서 함께 읽는다", () => {
    const plan = planMaterialIntent("rainy 골목 night");
    expect(plan.cues.map((cue) => cue.term)).toEqual(["rain", "alley", "night"]);
    expect(plan.unresolved).toEqual([]);
  });

  it("사전에 없는 영어 낱말(고유명사)은 번역 없이 그대로 보내고 passthrough 로 알린다", () => {
    const plan = planMaterialIntent("Joe Hisaishi 느낌의 숲");
    expect(plan.passthrough).toEqual(["Joe", "Hisaishi"]);
    expect(plan.unresolved).toEqual([]);
    expect(lensOf(plan, "3d-material").providerQueries.polyhaven).toBe("Joe Hisaishi forest");
  });

  it("영어 불용어는 검색어에 넣지 않는다", () => {
    const plan = planMaterialIntent("a castle in the forest");
    expect(plan.passthrough).toEqual([]);
    expect(plan.cues.map((cue) => cue.term)).toEqual(["castle", "forest"]);
  });

  it("영어 시대 표기를 읽는다", () => {
    expect(planMaterialIntent("19th century London street").cues[0]?.term).toBe("19th century");
    expect(planMaterialIntent("1980s Seoul").cues[0]?.term).toBe("1980s");
    expect(planMaterialIntent("80s Seoul").cues[0]?.term).toBe("1980s");
  });
});

describe("시대 표기", () => {
  it.each([
    ["1980년대 서울", "1980s"],
    ["80년대 서울", "1980s"],
    ["1945년 서울", "1945"],
    ["19세기 런던", "19th century"],
    ["20세기 초 서울", "early 20th century"],
    ["1세기 로마", "1st century"],
    ["조선 후기 한복", "late Joseon"],
    ["조선 초 궁궐", "early Joseon"],
  ])("%s → %s", (input, term) => {
    const era = planMaterialIntent(input).cues.find((cue) => cue.kind === "era");
    expect(era?.term).toBe(term);
  });

  it("모호한 두 자리 연대(20년대)는 시대로 추정하지 않고 미지원 낱말로 남긴다", () => {
    const plan = planMaterialIntent("20년대 서울");
    expect(plan.cues.some((cue) => cue.kind === "era")).toBe(false);
    expect(plan.unresolved).toEqual(["20년대"]);
  });

  it("시대 단서만으로는 미술 렌즈를 세우지 않는다", () => {
    const plan = planMaterialIntent("80년대 서울");
    expect(lensIds(plan)).not.toContain("reference-art");
    expect(plan.alternatives.map((lens) => lens.id)).toContain("reference-art");
  });
});

describe("미지원 단어 보존", () => {
  it("사전에 없는 한글 낱말은 지우지 않고 unresolved 와 검색어에 그대로 남긴다", () => {
    const plan = planMaterialIntent("스산한 골목");
    expect(plan.unresolved).toEqual(["스산한"]);
    expect(lensOf(plan, "3d-material").providerQuery).toBe("스산한 alley");
  });

  it("조사가 붙은 미지원 낱말은 두 글자 이상 조사만 떼어 정리한다", () => {
    expect(planMaterialIntent("연희동에서 골목").unresolved).toEqual(["연희동"]);
    // 한 글자 조사는 이름 속 글자를 깨뜨릴 수 있어 떼지 않는다.
    expect(planMaterialIntent("바쿠스카이 골목").unresolved).toEqual(["바쿠스카이"]);
  });

  it("검색어에 붙는 미지원 낱말은 2개까지이고, 나머지도 unresolved 에는 모두 남는다", () => {
    const plan = planMaterialIntent("가나다 라마바 사아자 골목");
    expect(plan.unresolved).toEqual(["가나다", "라마바", "사아자"]);
    expect(lensOf(plan, "3d-material").providerQuery).toBe("가나다 라마바 alley");
    expect(lensOf(plan, "3d-material").providerQuery).not.toContain("사아자");
  });

  it("기능어·불용어·숫자는 미지원 낱말로 올리지 않는다", () => {
    const plan = planMaterialIntent("한복 입은 아이 3명 찾아줘");
    expect(plan.unresolved).toEqual([]);
  });

  it("제외한 미지원 낱말은 검색어에서만 빠지고 unresolved 에는 남는다", () => {
    const plan = planMaterialIntent("스산한 골목", { exclude: ["free:스산한"] });
    expect(plan.unresolved).toEqual(["스산한"]);
    expect(lensOf(plan, "3d-material").providerQuery).toBe("alley");
  });
});

describe("렌즈 중복 제거", () => {
  it("같은 단서를 여러 번 적어도 단서와 렌즈는 하나다", () => {
    const plan = planMaterialIntent("비 비 비 골목 골목 골목 비");
    expect(plan.cues.map((cue) => cue.id)).toEqual(["weather:비", "place:골목"]);
    const ids = lensIds(plan);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("같은 렌즈를 가리키는 서로 다른 단서가 여럿이어도 렌즈 하나로 합친다", () => {
    const plan = planMaterialIntent("벽돌 콘크리트 대리석 나무 의자");
    expect(lensIds(plan).filter((id) => id === "3d-material")).toHaveLength(1);
    expect(lensOf(plan, "3d-material").cueIds.length).toBeGreaterThanOrEqual(4);
  });

  it("고른 렌즈와 대안 렌즈는 겹치지 않는다", () => {
    for (const testCase of SENTENCE_CASES) {
      const plan = planMaterialIntent(testCase.input);
      const ids = [...lensIds(plan), ...plan.alternatives.map((lens) => lens.id)];
      expect(new Set(ids).size, testCase.input).toBe(ids.length);
    }
  });

  it("같은 표면형이 다른 표기(띄어쓰기 · 조사)로 반복돼도 한 번만 센다", () => {
    const plan = planMaterialIntent("골목 골목에서 골목의 풍경");
    expect(plan.cues).toHaveLength(1);
  });

  it("영어와 한글로 같은 단서를 적어도 하나로 합친다", () => {
    const plan = planMaterialIntent("비 rain rainy 골목");
    expect(plan.cues.map((cue) => cue.id)).toEqual(["weather:비", "place:골목"]);
  });
});

describe("상충 단서", () => {
  it("상충 단서는 지우지 않고 conflicts 로 알린다", () => {
    const plan = planMaterialIntent("맑은 날 비 오는 골목");
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.axis).toBe("weather");
    expect([...(plan.conflicts[0]?.cueIds ?? [])].sort()).toEqual(["weather:맑은", "weather:비"].sort());
    expect(plan.conflicts[0]?.message).toContain("‘맑은’");
    expect(plan.conflicts[0]?.messageEn).toContain("‘clear sky’");
    // 두 단서 모두 계획에 남아 있어 사용자가 어느 쪽을 끌지 정할 수 있다.
    expect(plan.cues.map((cue) => cue.id)).toEqual(expect.arrayContaining(["weather:맑은", "weather:비"]));
  });

  it("상충이 있으면 그 단서를 근거로 한 렌즈의 신뢰도를 낮춘다", () => {
    // 두 문장은 같은 점수를 내지만 앞쪽만 서로 어긋난다(맑음×비 / 안개×비).
    const clashing = planMaterialIntent("맑은 비");
    const calm = planMaterialIntent("안개 비");
    expect(clashing.conflicts).toHaveLength(1);
    expect(calm.conflicts).toEqual([]);
    expect(lensOf(clashing, "weather-light").confidence).toBeLessThan(lensOf(calm, "weather-light").confidence);
  });

  it.each([
    ["밤 낮 골목", "time"],
    ["새벽 황혼 하늘", "time"],
    ["눈 오는 맑은 거리", "weather"],
    ["비 눈 골목", "weather"],
    ["봄 겨울 숲", "season"],
    ["조선시대 르네상스 초상화", "era"],
    ["템플릿 팔레트", "market-kind"],
    ["CC0 비상업 브러시", "license"],
  ] as const)("%s → %s 충돌", (input, axis) => {
    expect(planMaterialIntent(input).conflicts.map((conflict) => conflict.axis)).toContain(axis);
  });

  it("양립하는 조합은 충돌로 보지 않는다", () => {
    for (const input of ["비 오는 밤 골목", "안개 낀 새벽 숲", "눈 오는 겨울 밤", "흐린 날 비 오는 거리", "밤 야경 골목"]) {
      expect(planMaterialIntent(input).conflicts, input).toEqual([]);
    }
  });

  it("사용자가 한쪽 단서를 끄면 충돌이 사라지고 검색어에서도 빠진다", () => {
    const plan = planMaterialIntent("맑은 날 비 오는 골목", { exclude: ["weather:맑은"] });
    expect(plan.conflicts).toEqual([]);
    expect(plan.cues.find((cue) => cue.id === "weather:맑은")?.excluded).toBe(true);
    expect(lensOf(plan, "3d-material").providerQuery).toBe("rain alley");
  });
});

describe("단서 끄기(exclude)", () => {
  it("끈 단서는 계획에 남지만 점수·검색어·마켓에서는 빠진다", () => {
    const base = planMaterialIntent("비 오는 골목 야경");
    const plan = planMaterialIntent("비 오는 골목 야경", { exclude: ["place:골목"] });
    expect(plan.cues.map((cue) => cue.id)).toEqual(base.cues.map((cue) => cue.id));
    expect(plan.cues.find((cue) => cue.id === "place:골목")?.excluded).toBe(true);
    expect(lensOf(plan, "3d-material").providerQuery).toBe("rain night");
    expect(plan.market.query).not.toContain("골목");
  });

  it("끌 수 있는 것은 모두 끈 계획은 빈 계획이다", () => {
    const plan = planMaterialIntent("비 오는 골목", { exclude: ["weather:비", "place:골목"] });
    expect(plan.status).toBe("empty");
    expect(plan.lenses).toEqual([]);
  });

  it("알 수 없는 id 는 무시한다", () => {
    expect(lensIds(planMaterialIntent("비 오는 골목", { exclude: ["없는:단서"] }))).toEqual(lensIds(planMaterialIntent("비 오는 골목")));
  });
});

describe("붙여 쓴 낱말", () => {
  it("사전 표면형으로 빈틈없이 나뉠 때만 나눈다", () => {
    expect(planMaterialIntent("비오는골목야경").cues.map((cue) => cue.id)).toEqual(planMaterialIntent("비 오는 골목 야경").cues.map((cue) => cue.id));
    expect(planMaterialIntent("한복입은인물포즈").cues.map((cue) => cue.id)).toEqual(["costume:한복", "figure:인물", "figure:포즈"]);
  });

  it("한 조각이라도 사전 밖이면 이름을 조각내지 않고 통째로 미지원 낱말로 둔다", () => {
    const plan = planMaterialIntent("바쿠스카이가즈");
    expect(plan.unresolved).toEqual(["바쿠스카이가즈"]);
    expect(plan.cues).toEqual([]);
  });

  it("사전에 있는 한 낱말은 쪼개지 않는다", () => {
    expect(planMaterialIntent("소나무").cues.map((cue) => cue.id)).toEqual(["plant:소나무"]);
    expect(planMaterialIntent("고양이").cues.map((cue) => cue.id)).toEqual(["creature:고양이"]);
  });
});

describe("날씨·생물·폰트 렌즈의 제공처별 검색어", () => {
  it("날씨·빛 렌즈는 지원 도시가 문장에 있어야 예보를 부를 수 있다", () => {
    const withCity = planMaterialIntent("서울 비 오는 밤");
    expect(lensOf(withCity, "weather-light").providerQueries).toEqual({ metweather: "서울" });
    expect(lensOf(withCity, "weather-light").requires).toBeUndefined();
    expect(isSearchableLens(lensOf(withCity, "weather-light"))).toBe(true);

    const withoutCity = planMaterialIntent("비 오는 골목 야경");
    expect(lensOf(withoutCity, "weather-light").providerQueries).toEqual({});
    expect(lensOf(withoutCity, "weather-light").requires).toBe("city");
    expect(isSearchableLens(lensOf(withoutCity, "weather-light"))).toBe(false);
  });

  it("지원 도시 목록은 서버 예보 도시와 같은 8곳이다", () => {
    expect([...MATERIAL_WEATHER_CITIES]).toEqual(["서울", "부산", "제주", "도쿄", "오키나와", "런던", "파리", "뉴욕"]);
  });

  it("지원하지 않는 도시(대구)는 도시로 읽지 않는다", () => {
    expect(lensOf(planMaterialIntent("대구 비 오는 밤"), "weather-light").requires).toBe("city");
  });

  it("GBIF 는 서버 별칭표에 있는 한글 종명이면 한글을, 아니면 영문 일반명을 보낸다", () => {
    expect(lensOf(planMaterialIntent("여우"), "creature").providerQueries.gbif).toBe("여우");
    expect(lensOf(planMaterialIntent("붉은여우"), "creature").providerQueries.gbif).toBe("붉은여우");
    expect(lensOf(planMaterialIntent("고슴도치"), "creature").providerQueries.gbif).toBe("hedgehog");
  });

  it("폰트 검색은 한글 지원 + 스타일 한 가지로 좁힌다", () => {
    expect(lensOf(planMaterialIntent("폰트"), "font").providerQueries.googlefonts).toBe("korean");
    expect(lensOf(planMaterialIntent("고딕체 폰트"), "font").providerQueries.googlefonts).toBe("korean sans-serif");
    expect(lensOf(planMaterialIntent("붓글씨 느낌의 제목 폰트"), "font").providerQueries.googlefonts).toBe("korean handwriting");
  });

  it("3D 렌즈는 종류를 말하는 단서(3D·질감)의 영문 낱말을 검색어에 넣지 않는다", () => {
    expect(lensOf(planMaterialIntent("벽돌 질감"), "3d-material").providerQuery).toBe("brick");
    expect(lensOf(planMaterialIntent("내가 저장한 고양이 3D 모델"), "3d-material").providerQuery).toBe("cat");
  });

  it("영문 인덱스 렌즈의 검색어는 중복·포함 낱말을 걸러 낸다", () => {
    expect(lensOf(planMaterialIntent("고양이 사진 흑백"), "photo-archive").providerQuery).toBe("cat black and white photograph");
  });

  it("wikimedia 는 문서 제목 하나(도시·유산)를, 영문 인덱스는 영문 검색어를 받는다", () => {
    const lens = lensOf(planMaterialIntent("1980년대 서울 시장 사진"), "photo-archive");
    expect(lens.providerQueries.wikimedia).toBe("서울");
    expect(lens.providerQueries.dpla).toBe("1980s Seoul market photograph");
    expect(lens.providerQuery).toBe("1980s Seoul market photograph");
  });
});

describe("마켓 계획과 URL 필터", () => {
  it("종류·라이선스·태그·검색어를 문장에서 읽는다", () => {
    expect(planMaterialIntent("저작권 걱정 없는 학교 배경").market).toEqual({ kind: "asset", license: "cc0-1.0", tags: ["학교", "배경"], query: "" });
    expect(planMaterialIntent("G펜 브러시 CC0").market).toEqual({ kind: "brush", license: "cc0-1.0", tags: [], query: "" });
    expect(planMaterialIntent("비상업 팔레트").market).toEqual({ kind: "palette", license: "cc-by-nc-4.0", tags: [], query: "" });
    expect(planMaterialIntent("출처 표시 필터").market.license).toBe("cc-by-4.0");
  });

  it("3D 에셋 아래에서는 확인된 태그(소품·3D)만 태그로 쓰고 나머지는 검색어로 돌린다", () => {
    const market = planMaterialIntent("3D 학교 의자").market;
    expect(market.kind).toBe("3d-asset");
    expect(market.tags).toEqual(["소품", "3D"]);
    expect(market.query).toContain("학교");
  });

  it("마켓 태그는 확인된 공개 태그만 쓴다", () => {
    for (const testCase of SENTENCE_CASES) {
      for (const tag of planMaterialIntent(testCase.input).market.tags) expect(MATERIAL_MARKET_TAGS).toContain(tag);
    }
  });

  it("마켓 URL 필터는 태그를 하나만 쓰고 나머지는 검색어로 돌린다", () => {
    expect(materialMarketParams(planMaterialIntent("저작권 걱정 없는 학교 배경").market)).toEqual({
      q: "배경", kind: "asset", license: "cc0-1.0", tag: "학교",
    });
    expect(materialMarketParams(planMaterialIntent("비 오는 골목 야경").market)).toEqual({ q: "골목 야경", kind: "asset", tag: "배경" });
    expect(materialMarketParams(planMaterialIntent("").market)).toEqual({});
  });

  it("마켓 검색어는 80자 이하이고 마켓이 받는 태그 길이(24자) 안이다", () => {
    for (const testCase of SENTENCE_CASES) {
      const params = materialMarketParams(planMaterialIntent(testCase.input).market);
      expect((params.q ?? "").length).toBeLessThanOrEqual(MATERIAL_INTENT_MAX_LENGTH);
      expect((params.tag ?? "").length).toBeLessThanOrEqual(24);
    }
  });

  it("내 라이브러리 키워드는 한글 낱말을 앞에, 영문 검색어를 뒤에 두고 8개 이하다", () => {
    const keywords = planMaterialIntent("내가 저장한 고양이 3D 모델").myLibrary.keywords;
    expect(keywords).toEqual(["고양이", "cat"]);
    const many = planMaterialIntent("벽돌 콘크리트 대리석 나무 의자 책상 침대 거울 촛대").myLibrary.keywords;
    expect(many.length).toBeLessThanOrEqual(8);
  });
});

describe("렌즈 정의와 호출 예산", () => {
  const KNOWN_PROVIDERS: ReadonlySet<string> = new Set([
    "polyhaven", "ambientcg", "met", "aic", "cleveland", "rijksmuseum", "vam",
    "internetarchive", "wikimedia", "smithsonian", "europeana", "dpla",
    "kheritage", "tourapi", "korean", "metweather", "gbif", "googlefonts",
  ]);

  it("렌즈는 9개이고 id 가 겹치지 않으며 제공처는 서로 겹치지 않는다", () => {
    const ids = MATERIAL_LENS_DEFINITIONS.map((definition) => definition.id);
    expect(ids).toEqual([
      "3d-material", "reference-art", "photo-archive", "korean-place", "weather-light",
      "creature", "font", "market-resource", "my-library",
    ]);
    const providers = MATERIAL_LENS_DEFINITIONS.flatMap((definition) => definition.providers);
    expect(new Set(providers).size).toBe(providers.length);
    for (const provider of providers) expect(KNOWN_PROVIDERS.has(provider)).toBe(true);
  });

  it("스펙의 렌즈·제공처 배치와 같다", () => {
    expect(materialLensDefinition("3d-material").providers).toEqual(["polyhaven", "ambientcg"]);
    expect(materialLensDefinition("reference-art").providers).toEqual(["met", "aic", "cleveland", "rijksmuseum", "vam"]);
    expect(materialLensDefinition("photo-archive").providers).toEqual(["internetarchive", "wikimedia", "smithsonian", "europeana", "dpla"]);
    expect(materialLensDefinition("korean-place").providers).toEqual(["kheritage", "tourapi", "korean"]);
    expect(materialLensDefinition("weather-light").providers).toEqual(["metweather"]);
    expect(materialLensDefinition("creature").providers).toEqual(["gbif"]);
    expect(materialLensDefinition("font").providers).toEqual(["googlefonts"]);
    expect(materialLensDefinition("market-resource").providers).toEqual([]);
    expect(materialLensDefinition("my-library").providers).toEqual([]);
  });

  it("제출 직후 호출 수의 합은 서버의 분당 20회 제한보다 작다", () => {
    for (const definition of MATERIAL_LENS_DEFINITIONS) {
      expect(definition.initialProviders).toBeLessThanOrEqual(definition.providers.length);
    }
    const total = MATERIAL_LENS_DEFINITIONS.reduce((sum, definition) => sum + definition.initialProviders, 0);
    expect(total).toBeLessThan(20);
  });

  it("라벨은 한글과 영문이 모두 있다", () => {
    for (const definition of MATERIAL_LENS_DEFINITIONS) {
      expect(definition.label).toMatch(/\p{Script=Hangul}/u);
      expect(definition.labelEn).toMatch(/[A-Za-z]/u);
    }
  });
});

describe("단서 사전", () => {
  it("사전을 구성하는 동안 문제(번역어 누락·표면형 중복)가 없다", () => {
    expect(MATERIAL_LEXICON.issues).toEqual([]);
    expect(MATERIAL_LEXICON.concepts.length).toBeGreaterThan(400);
  });

  it("reference-query-language 가 아는 낱말은 그 사전의 번역어를 그대로 쓴다", () => {
    // 의도적으로 다르게 쓰는 낱말: 3D 제공처 검색에 맞춰 metalwork 대신 metal, 사전의 조사 오해석("종로"=종+로), 혼합 표기.
    const intentional = new Set(["금속", "종로", "3d 배경"]);
    const drift: string[] = [];
    for (const [surface, concept] of MATERIAL_LEXICON.bySurface) {
      if (intentional.has(surface)) continue;
      const resolved = resolveReferenceQuery(surface);
      if (resolved.status === "translated" && resolved.matched.length === 1 && resolved.providerQuery !== concept.term) {
        drift.push(`${surface}: 기본 사전=${resolved.providerQuery} / 단서 사전=${concept.term}`);
      }
    }
    expect(drift).toEqual([]);
  });

  it("모든 단서는 번역어·대표 표기를 갖고 가리키는 렌즈가 실제 렌즈다", () => {
    const lensSet = new Set<string>(MATERIAL_LENS_DEFINITIONS.map((definition) => definition.id));
    for (const concept of MATERIAL_LEXICON.concepts) {
      expect(concept.term.length, concept.id).toBeGreaterThan(0);
      expect(concept.term.length, concept.id).toBeLessThanOrEqual(40);
      expect(concept.ko.length, concept.id).toBeGreaterThan(0);
      for (const lens of Object.keys(concept.feeds)) expect(lensSet.has(lens), `${concept.id} → ${lens}`).toBe(true);
      if (concept.marketTag) expect(MATERIAL_MARKET_TAGS).toContain(concept.marketTag);
      if (!concept.neutral) expect(Object.keys(concept.feeds).length, concept.id).toBeGreaterThan(0);
    }
  });

  it("분위기 단서는 보조 신호일 뿐 렌즈를 세우거나 검색어에 들어가지 않는다", () => {
    const plan = planMaterialIntent("신비로운 골목");
    expect(plan.cues.find((cue) => cue.label === "신비로운")?.neutral).toBe(true);
    expect(lensOf(plan, "3d-material").providerQuery).toBe("alley");
  });

  it("마켓 종류·라이선스 단서는 마켓 계약의 값만 쓴다", () => {
    const kinds = new Set(["template", "asset", "3d-asset", "3d-preset", "brush", "palette", "filter"]);
    const licenses = new Set(["cc0-1.0", "cc-by-4.0", "cc-by-nc-4.0"]);
    for (const concept of MATERIAL_LEXICON.concepts) {
      if (concept.marketKind) expect(kinds.has(concept.marketKind)).toBe(true);
      if (concept.marketLicense) expect(licenses.has(concept.marketLicense)).toBe(true);
    }
  });
});

describe("결정성 · 순수성", () => {
  it("같은 입력은 언제나 같은 계획을 낸다", () => {
    for (const testCase of SENTENCE_CASES) {
      expect(planMaterialIntent(testCase.input)).toEqual(planMaterialIntent(testCase.input));
    }
  });

  it("계획은 JSON 으로 직렬화했다 되돌려도 같다(함수·Map·undefined 없음)", () => {
    for (const testCase of SENTENCE_CASES) {
      const plan = planMaterialIntent(testCase.input);
      expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
    }
  });

  it("호출 순서와 무관하다", () => {
    const first = SENTENCE_CASES.map((testCase) => planMaterialIntent(testCase.input));
    const reversed = [...SENTENCE_CASES].reverse().map((testCase) => planMaterialIntent(testCase.input)).reverse();
    expect(reversed).toEqual(first);
  });

  it("입력 객체를 바꾸지 않는다", () => {
    const exclude = ["weather:비"];
    planMaterialIntent("비 오는 골목", { exclude });
    expect(exclude).toEqual(["weather:비"]);
  });

  it("소스에 네트워크·시간·난수·AI 호출이 없다", () => {
    for (const file of ["./material-intent-plan.ts", "./material-intent-lexicon.ts"]) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8")
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .replace(/^\s*\/\/.*$/gmu, "");
      expect(source, file).not.toMatch(/\bfetch\s*\(/u);
      expect(source, file).not.toMatch(/\bXMLHttpRequest\b|\bWebSocket\b|\b(?:navigator|window|document|globalThis|localStorage)\s*[.[]/u);
      expect(source, file).not.toMatch(/\bDate\b|Math\.random|performance\.now|setTimeout|setInterval/u);
      expect(source, file).not.toMatch(/\bimport\s*\(/u);
      expect(source, file).not.toMatch(/studio-ai|openai|anthropic|gemini/iu);
      // 브라우저·React·앱 코드를 끌어오지 않는다: 같은 core 패키지 안의 모듈만 import 한다.
      for (const match of source.matchAll(/from\s+"([^"]+)"/gu)) expect(match[1], file).toMatch(/^\.\//u);
    }
  });
});

describe("무작위 입력 불변식", () => {
  const FRAGMENTS = [
    "비", "오는", "골목", "야경", "한복", "조선시대", "1980년대", "서울", "시장", "사진", "학교", "배경", "CC0", "브러시",
    "g펜", "rain", "alley", "night", "3D", "모델", "고양이", "폰트", "스산한", "폐건물", "20년대", "맑은", "눈", "여름",
    "template", "저작권", "걱정", "없는", "내가", "저장한", "🙂", "！", "ＣＣ０", "한", "x", "가나다라마바사",
  ];
  const NOISE = "가나다라마바사아자차카타파하abcdefghijklmnopqrstuvwxyz0123456789 .,-_/()[]{}!?@#$%^&*+=~'\"<>|:;🙂中文日本語";

  function randomInputs(count: number): string[] {
    // 시드가 고정된 선형 합동 생성기라 실행마다 같은 입력이 나온다.
    let seed = 20261015;
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const pick = (items: readonly string[]): string => items[Math.floor(next() * items.length)] ?? "";
    return Array.from({ length: count }, () => {
      const parts = Array.from({ length: 1 + Math.floor(next() * 14) }, () => (
        next() < 0.7 ? pick(FRAGMENTS) : Array.from({ length: 1 + Math.floor(next() * 8) }, () => NOISE.charAt(Math.floor(next() * NOISE.length))).join("")
      ));
      return parts.join(next() < 0.2 ? "" : " ");
    });
  }

  it("2천 개의 의사 난수 입력에서 던지지 않고, 결정적이며, 검색어 길이·렌즈·마켓 태그 범위를 지킨다", () => {
    for (const input of randomInputs(2000)) {
      const plan = planMaterialIntent(input);
      expect(planMaterialIntent(input), input).toEqual(plan);
      expect(plan.input.length, input).toBeLessThanOrEqual(MATERIAL_INTENT_MAX_LENGTH);
      const ids = plan.lenses.map((lens) => lens.id);
      expect(new Set(ids).size, input).toBe(ids.length);
      expect(plan.status === "empty", input).toBe(plan.lenses.length === 0);
      for (const lens of [...plan.lenses, ...plan.alternatives]) {
        expect(lens.confidence, input).toBeGreaterThanOrEqual(0);
        expect(lens.confidence, input).toBeLessThanOrEqual(1);
        for (const query of Object.values(lens.providerQueries)) {
          expect(query.length, `${input} → ${lens.id}`).toBeGreaterThanOrEqual(2);
          expect(query.length, `${input} → ${lens.id}`).toBeLessThanOrEqual(MATERIAL_INTENT_MAX_LENGTH);
        }
      }
      for (const tag of plan.market.tags) expect(MATERIAL_MARKET_TAGS, input).toContain(tag);
      expect((materialMarketParams(plan.market).q ?? "").length, input).toBeLessThanOrEqual(MATERIAL_INTENT_MAX_LENGTH);
    }
  });

  it("읽은 단서와 낱말을 모두 끄면 어떤 입력이든 빈 계획이 된다", () => {
    for (const input of randomInputs(300)) {
      const plan = planMaterialIntent(input);
      const exclude = [...plan.cues.map((cue) => cue.id), ...plan.unresolved.map((word) => `free:${word}`), ...plan.passthrough.map((word) => `free:${word}`)];
      expect(planMaterialIntent(input, { exclude }).status, input).toBe("empty");
    }
  });
});
