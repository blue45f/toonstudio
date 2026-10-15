import { planMaterialIntent } from "@toonstudio/core/material-intent-plan";
import { describe, expect, it } from "vitest";

import {
  buildHubBrief,
  EMPTY_HUB_OVERRIDES,
  hubInitialSlots,
  hubLensSlots,
  hubLensViews,
  hubMarketHref,
  hubNeedsCity,
  hubProviderQuery,
  hubSignature,
  hubSlotKey,
  matchSavedResources,
  normalizeHubQuery,
  providerShortName,
  providerSiteUrl,
  studioDropAsset,
  summarizeSlots,
} from "./material-hub-model";
import { hubItem } from "./material-hub.test-fixtures";

import type { HubOverrides, HubSlotState } from "./material-hub-model";

/** 전각 공백(U+3000). 소스에 보이지 않는 문자를 두지 않으려고 코드로 만든다. */
const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);

const plan = (input: string, exclude: readonly string[] = []) => planMaterialIntent(input, { exclude });

function lens(input: string, id: string) {
  const found = [...plan(input).lenses, ...plan(input).alternatives].find((candidate) => candidate.id === id);
  if (!found) throw new Error(`${input}: ${id} 렌즈 없음`);
  return found;
}

describe("렌즈 보기와 제공처 호출 계획", () => {
  it("계획이 고른 렌즈는 켜고, 대안은 꺼 둔 채 제안한다", () => {
    const views = hubLensViews(plan("비 오는 골목 야경"), EMPTY_HUB_OVERRIDES);
    expect(views.filter((view) => view.on).map((view) => view.lens.id)).toEqual(["3d-material", "weather-light"]);
    expect(views.filter((view) => view.suggested).every((view) => !view.on)).toBe(true);
    expect(views.some((view) => view.suggested)).toBe(true);
  });

  it("사용자가 켜고 끈 렌즈를 계획의 기본값보다 우선한다", () => {
    const overrides: HubOverrides = { ...EMPTY_HUB_OVERRIDES, lensOn: { "3d-material": false, "photo-archive": true } };
    const on = hubLensViews(plan("비 오는 골목 야경"), overrides).filter((view) => view.on).map((view) => view.lens.id);
    expect(on).toContain("photo-archive");
    expect(on).not.toContain("3d-material");
  });

  it("제출 직후에는 렌즈별 선두 제공처만 부른다", () => {
    const slots = hubInitialSlots(plan("한복 캐릭터"), EMPTY_HUB_OVERRIDES);
    expect(slots.map((slot) => slot.provider)).toEqual(["met", "aic"]);
    expect(slots.every((slot) => slot.query === "Korean costume figure")).toBe(true);
    // 나머지 제공처는 사용자가 "다른 제공처에서도 찾기"를 눌러야 부른다.
    const all = hubLensSlots(lens("한복 캐릭터", "reference-art"), EMPTY_HUB_OVERRIDES);
    expect(all.slots.map((slot) => [slot.provider, slot.initial])).toEqual([
      ["met", true], ["aic", true], ["cleveland", false], ["rijksmuseum", false], ["vam", false],
    ]);
  });

  it("한 번의 제출이 서버의 분당 20회 제한보다 적게 부른다 — 어떤 문장이든", () => {
    for (const sentence of ["비 오는 골목 야경", "1980년대 서울 시장 사진", "서울 비 오는 밤", "한강 노을", "내가 저장한 고양이 3D 모델"]) {
      expect(hubInitialSlots(plan(sentence), EMPTY_HUB_OVERRIDES).length, sentence).toBeLessThan(10);
    }
  });

  it("날씨·빛은 도시를 받기 전에는 제공처를 부르지 않는다", () => {
    const slots = hubInitialSlots(plan("비 오는 골목 야경"), EMPTY_HUB_OVERRIDES);
    expect(slots.map((slot) => slot.provider)).toEqual(["polyhaven", "ambientcg"]);
    expect(hubNeedsCity(lens("비 오는 골목 야경", "weather-light"), EMPTY_HUB_OVERRIDES)).toBe(true);
    const withCity: HubOverrides = { ...EMPTY_HUB_OVERRIDES, queries: { "weather-light": "서울" } };
    expect(hubNeedsCity(lens("비 오는 골목 야경", "weather-light"), withCity)).toBe(false);
    expect(hubInitialSlots(plan("비 오는 골목 야경"), withCity).map((slot) => slot.provider)).toEqual(["polyhaven", "ambientcg", "metweather"]);
  });

  it("보낼 검색어를 만들 수 없는 제공처는 호출하지 않고 따로 알린다", () => {
    const { slots, unavailable } = hubLensSlots(lens("저작권 걱정 없는 학교 배경", "photo-archive"), { ...EMPTY_HUB_OVERRIDES, lensOn: {} });
    expect(slots.length).toBeGreaterThan(0);
    expect(unavailable).toEqual([]);
    const empty = hubLensSlots({ ...lens("한복 캐릭터", "reference-art"), providerQueries: {}, providerQuery: "" }, EMPTY_HUB_OVERRIDES);
    expect(empty.slots).toEqual([]);
    expect(empty.unavailable).toEqual(["met", "aic", "cleveland", "rijksmuseum", "vam"]);
  });

  it("같은 제공처·검색어는 같은 캐시 키를 쓴다", () => {
    expect(hubSlotKey("met", "Korean costume")).toBe("met::Korean costume");
    const first = hubInitialSlots(plan("한복 캐릭터"), EMPTY_HUB_OVERRIDES);
    const again = hubInitialSlots(plan("한복  캐릭터"), EMPTY_HUB_OVERRIDES);
    expect(again.map((slot) => slot.key)).toEqual(first.map((slot) => slot.key));
  });
});

describe("검색어 고치기", () => {
  it("고친 대표 검색어는 대표 검색어를 함께 쓰던 제공처에만 적용한다", () => {
    const photo = lens("1980년대 서울 시장 사진", "photo-archive");
    const overrides: HubOverrides = { ...EMPTY_HUB_OVERRIDES, queries: { "photo-archive": "  Seoul   market 1985 " } };
    expect(hubProviderQuery(photo, "internetarchive", overrides)).toBe("Seoul market 1985");
    expect(hubProviderQuery(photo, "dpla", overrides)).toBe("Seoul market 1985");
    // 한글 문서 제목을 받는 wikimedia 는 건드리지 않는다.
    expect(hubProviderQuery(photo, "wikimedia", overrides)).toBe("서울");
  });

  it("80자를 넘는 입력은 자르고 공백을 정리한다", () => {
    expect(normalizeHubQuery(`  ${"가".repeat(100)}  `).length).toBe(80);
    expect(normalizeHubQuery(`a   b${IDEOGRAPHIC_SPACE}c`)).toBe("a b c");
  });

  it("이해가 바뀌면 서명이 달라지고, 같은 이해면 같다", () => {
    const base = plan("비 오는 골목 야경");
    expect(hubSignature(base, EMPTY_HUB_OVERRIDES)).toBe(hubSignature(plan("비 오는 골목 야경"), EMPTY_HUB_OVERRIDES));
    expect(hubSignature(plan("비 오는 골목 야경", ["place:골목"]), { ...EMPTY_HUB_OVERRIDES, excluded: ["place:골목"] })).not.toBe(hubSignature(base, EMPTY_HUB_OVERRIDES));
    expect(hubSignature(base, { ...EMPTY_HUB_OVERRIDES, lensOn: { "3d-material": false } })).not.toBe(hubSignature(base, EMPTY_HUB_OVERRIDES));
    expect(hubSignature(base, { ...EMPTY_HUB_OVERRIDES, queries: { "3d-material": "brick" } })).not.toBe(hubSignature(base, EMPTY_HUB_OVERRIDES));
  });
});

describe("스튜디오 전달(MATERIAL_DROP_KEY 계약)", () => {
  it("Poly Haven 재질은 계약의 MaterialAsset 으로 바꾼다", () => {
    const item = hubItem("polyhaven", 1, { title: "Brick wall", description: "붉은 벽돌 · 텍스처 · 최대 4K · 태그 brick, wall" });
    expect(studioDropAsset(item)).toEqual({
      id: "polyhaven:item-1",
      provider: "polyhaven",
      sourceId: "item-1",
      title: "Brick wall",
      kind: "texture",
      tags: ["brick", "wall"],
      authors: ["polyhaven 제공 기관"],
      sourceUrl: item.sourceUrl,
      thumbnailUrl: item.imageUrl,
      license: "CC0-1.0",
    });
  });

  it("ambientCG 는 설명의 종류 라벨로 재질·HDRI·3D 모델을 가리고, 데칼·지형처럼 계약에 없는 종류는 보내지 않는다", () => {
    expect(studioDropAsset(hubItem("ambientcg", 1, { description: "벽돌 · PBR 재질 · 태그 brick" }))?.kind).toBe("texture");
    expect(studioDropAsset(hubItem("ambientcg", 2, { description: "하늘 · HDRI" }))?.kind).toBe("hdri");
    expect(studioDropAsset(hubItem("ambientcg", 3, { description: "의자 · 3D 모델" }))?.kind).toBe("model");
    expect(studioDropAsset(hubItem("ambientcg", 4, { description: "낙서 · 데칼" }))).toBeNull();
    expect(studioDropAsset(hubItem("ambientcg", 5, { description: "언덕 · 지형" }))).toBeNull();
  });

  it("미술관·아카이브·레퍼런스 전용 자료는 스튜디오로 직접 보내지 않는다", () => {
    for (const provider of ["met", "aic", "vam", "internetarchive", "wikimedia", "kheritage", "gbif", "googlefonts"] as const) {
      expect(studioDropAsset(hubItem(provider, 1)), provider).toBeNull();
    }
  });

  it("종류를 알 수 없는 Poly Haven 자료는 추측해서 보내지 않는다", () => {
    expect(studioDropAsset(hubItem("polyhaven", 1, { description: "설명만 있음" }))).toBeNull();
  });

  it("CC0 가 아닌 자료는 제공처가 같아도 보내지 않는다", () => {
    expect(studioDropAsset(hubItem("polyhaven", 1, { description: "텍스처", license: "metadata-only" }))).toBeNull();
  });
});

describe("마켓·내 라이브러리·저장 보드", () => {
  it("마켓 주소는 계획의 조건을 기존 URL 필터(q·kind·license·tag)로 옮긴다", () => {
    expect(hubMarketHref(plan("저작권 걱정 없는 학교 배경"))).toBe("/market/browse?q=%EB%B0%B0%EA%B2%BD&kind=asset&license=cc0-1.0&tag=%ED%95%99%EA%B5%90");
    expect(hubMarketHref(plan("G펜 브러시"))).toBe("/market/browse?kind=brush");
    expect(hubMarketHref(plan(""))).toBe("/market/browse");
    const url = new URL(hubMarketHref(plan("비 오는 골목 야경")), "https://local.test");
    expect(url.searchParams.get("q")).toBe("골목 야경");
    expect(url.searchParams.get("tag")).toBe("배경");
  });

  it("저장 보드에서 키워드와 겹치는 자료만 찾는다(제목·설명·저작자·크레딧)", () => {
    const saved = [
      hubItem("met", 1, { title: "Korean costume study", description: "joseon" }),
      hubItem("met", 2, { title: "Armor", description: "steel" }),
      hubItem("aic", 3, { title: "Untitled", creator: "Alley painter" }),
    ];
    expect(matchSavedResources(saved, ["costume"]).map((item) => item.id)).toEqual(["met:item-1"]);
    expect(matchSavedResources(saved, ["ALLEY", "armor"]).map((item) => item.id)).toEqual(["met:item-2", "aic:item-3"]);
    expect(matchSavedResources(saved, [])).toEqual([]);
    expect(matchSavedResources(saved, ["a"])).toEqual([]);
  });

  it("제공처 이름과 공식 사이트를 알려 준다(검색 설정에 없는 aic·cleveland 포함)", () => {
    expect(providerShortName("polyhaven")).toBe("Poly Haven");
    expect(providerShortName("met")).toBe("The Met");
    expect(providerSiteUrl("polyhaven")).toBe("https://polyhaven.com/");
    expect(providerSiteUrl("aic")).toMatch(/^https:\/\/www\.artic\.edu\//u);
    expect(providerSiteUrl("cleveland")).toMatch(/^https:\/\/www\.clevelandart\.org\//u);
    for (const provider of ["polyhaven", "ambientcg", "met", "aic", "cleveland", "rijksmuseum", "vam", "internetarchive", "wikimedia", "smithsonian", "europeana", "dpla", "kheritage", "tourapi", "korean", "metweather", "gbif", "googlefonts"] as const) {
      expect(providerSiteUrl(provider), provider).toMatch(/^https:\/\//u);
    }
  });
});

describe("브리프", () => {
  const now = new Date("2026-10-15T03:00:00.000Z");

  it("문장·이해·보낸 검색어와, 담은 자료의 출처 기록(attributionMarkdown)을 한글 Markdown 으로 만든다", () => {
    const items = [hubItem("polyhaven", 1, { title: "Brick wall" }), hubItem("met", 2, { title: "Armor study" })];
    const brief = buildHubBrief({ plan: plan("비 오는 골목 야경"), overrides: EMPTY_HUB_OVERRIDES, items, now });
    expect(brief).toContain("# 장면 소재 브리프");
    expect(brief).toContain("- 문장: 비 오는 골목 야경");
    expect(brief).toContain("2026년 10월 15일");
    expect(brief).toContain("- 담은 자료: 2개");
    expect(brief).toContain("## 이렇게 이해했어요");
    expect(brief).toContain("polyhaven `alley night`");
    expect(brief).toContain("비 오는 → rain");
    expect(brief).toContain("## 담은 자료와 출처");
    expect(brief).toContain("## Brick wall");
    expect(brief).toContain("- 원문: https://polyhaven.com/a/brick_1");
    expect(brief).toContain("- 이용조건: CC0");
    expect(brief).toContain("권리 허가서나 법률 검토를 대신하지 않습니다");
    expect(brief).not.toContain("# 창작 자료 출처 기록");
  });

  it("담은 자료가 없으면 그렇게 적고, 미지원 낱말과 어긋나는 단서도 숨기지 않는다", () => {
    const brief = buildHubBrief({ plan: plan("스산한 맑은 비 골목"), overrides: EMPTY_HUB_OVERRIDES, items: [], now });
    expect(brief).toContain("아직 담은 자료가 없습니다");
    expect(brief).toContain("### 사전에 없는 낱말");
    expect(brief).toContain("스산한");
    expect(brief).toContain("### 어긋나는 단서");
  });

  it("끈 단서는 제외로 표시하고, 끈 렌즈는 적지 않는다", () => {
    const overrides: HubOverrides = { ...EMPTY_HUB_OVERRIDES, excluded: ["place:골목"], lensOn: { "weather-light": false } };
    const brief = buildHubBrief({ plan: plan("비 오는 골목 야경", ["place:골목"]), overrides, items: [], now });
    expect(brief).toContain("골목(제외)");
    expect(brief).not.toContain("날씨·빛 참고");
  });
});

describe("진행 요약", () => {
  const state = (status: HubSlotState["status"], count = 0): HubSlotState => ({
    key: status, provider: "met", query: "q", status, items: Array.from({ length: count }, (_, index) => hubItem("met", index + 1)),
    page: 1, hasMore: false, message: "", errorCode: null, loadingMore: false, visible: 4,
  });

  it("상태별로 센다: 받는 중·받음·비어 있음·실패(오류·미설정·일시 불가)", () => {
    expect(summarizeSlots([state("loading"), state("ready", 3), state("partial", 1), state("empty"), state("error"), state("not_configured"), state("unavailable"), undefined])).toEqual({
      requested: 7, loading: 1, ready: 2, empty: 1, failed: 3, items: 4,
    });
  });
});
