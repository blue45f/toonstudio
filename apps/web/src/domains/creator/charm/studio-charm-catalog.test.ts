import { beforeAll, describe, expect, it } from "vitest";

import { STUDIO_RASTER_ASSETS } from "../render/studio-raster-assets";
import { BUBBLE_VARIANTS, EFFECT_EMOJIS } from "../studio-assets";
import { listStudioElementLibrary } from "../studio-elements-catalog";
import { listStudioObjectInsertItems } from "../studio-object-insert-catalog";
import {
  STUDIO_CHARM_EMOJI_LABELS,
  buildStudioCharmCatalog,
  studioCharmEmojiOfId,
  type StudioCharmCatalog,
} from "./studio-charm-catalog";
import { loadStudioCharmCatalogData } from "./studio-charm-catalog-data";
import { STUDIO_CHARM_SECTIONS, type StudioCharmCatalogData } from "./studio-charm-descriptor";
import { createStudioCharmId, studioCharmEmojiRawId } from "./studio-charm-model";

let data: StudioCharmCatalogData;
let catalog: StudioCharmCatalog;

beforeAll(async () => {
  data = await loadStudioCharmCatalogData();
  catalog = buildStudioCharmCatalog({ data, library: [], libraryReady: true });
});

describe("참 카탈로그: 기존 카탈로그만 읽는다", () => {
  it("지연 데이터는 기존 효과·스티커·소품·효과음 모듈에서 그대로 온다", () => {
    expect(data.fxOverlays.length).toBeGreaterThan(10);
    expect(data.comicStickers.length).toBeGreaterThan(10);
    expect(data.propStickers.length).toBeGreaterThan(10);
    expect(data.sfxPresets.length).toBeGreaterThan(10);
  });

  it("모든 항목은 유일한 ID 를 가지고 분류별 개수의 합과 같다", () => {
    const ids = catalog.descriptors.map((descriptor) => descriptor.id);
    expect(new Set(ids).size).toBe(ids.length);
    const total = STUDIO_CHARM_SECTIONS.reduce((sum, section) => sum + catalog.sectionCounts[section], 0);
    expect(total).toBe(catalog.descriptors.length);
  });

  it("원본 카탈로그 항목이 ID 형식이나 ID 중복 때문에 조용히 빠지지 않는다", () => {
    const expected =
      data.fxOverlays.length + data.comicStickers.length + data.creatureStickers.length + data.propStickers.length
      + data.sfxPresets.length + EFFECT_EMOJIS.length + listStudioElementLibrary().length
      + STUDIO_RASTER_ASSETS.length + BUBBLE_VARIANTS.length + listStudioObjectInsertItems().length;
    expect(catalog.descriptors).toHaveLength(expected);
  });

  it("모든 효과 이모지에 한글 이름이 있다", () => {
    for (const emoji of EFFECT_EMOJIS) {
      expect(STUDIO_CHARM_EMOJI_LABELS[emoji], `이모지 ${emoji} 이름`).toBeTruthy();
    }
  });

  it("이모지 참 ID 에서 글리프를 되찾는다", () => {
    const id = createStudioCharmId("emoji", studioCharmEmojiRawId("💧") ?? "");
    expect(studioCharmEmojiOfId(id)).toBe("💧");
    expect(studioCharmEmojiOfId(createStudioCharmId("fx", "radial-focus"))).toBeNull();
  });
});

describe("참 해석과 상태", () => {
  it("지연 데이터가 오기 전에는 효과·효과음 참이 pending 이고 정적 항목은 바로 해석된다", () => {
    const early = buildStudioCharmCatalog({ data: null, library: [], libraryReady: true });
    expect(early.resolve(createStudioCharmId("fx", "radial-focus"))).toEqual({ status: "pending" });
    expect(early.resolve(createStudioCharmId("sfx", "sfx-kwang"))).toEqual({ status: "pending" });
    expect(early.resolve(createStudioCharmId("emoji", "1f4a7")).status).toBe("ready");
    expect(early.resolve(createStudioCharmId("element", "decor-burst-lines")).status).toBe("ready");
  });

  it("데이터가 온 뒤에도 없는 원본은 missing 으로 알린다", () => {
    expect(catalog.resolve(createStudioCharmId("fx", "no-such-effect"))).toEqual({ status: "missing" });
    expect(catalog.resolve(createStudioCharmId("object", "obj-prim-nope"))).toEqual({ status: "missing" });
    expect(catalog.resolve(createStudioCharmId("raster", "builtin-raster-nope"))).toEqual({ status: "missing" });
  });

  it("내 소재는 목록을 읽는 동안 pending, 읽은 뒤 없으면 missing 이다", () => {
    const id = createStudioCharmId("library", "asset-1");
    expect(buildStudioCharmCatalog({ data, library: [], libraryReady: false }).resolve(id)).toEqual({ status: "pending" });
    expect(buildStudioCharmCatalog({ data, library: [], libraryReady: true }).resolve(id)).toEqual({ status: "missing" });
  });

  it("집중선·속도선·땀방울이 기존 효과 자산으로 해석되고 삽입 동작이 SVG 이미지다", () => {
    for (const rawId of ["radial-focus", "speed-lines", "sweat-drop"]) {
      const resolution = catalog.resolve(createStudioCharmId("fx", rawId));
      expect(resolution.status).toBe("ready");
      if (resolution.status !== "ready") continue;
      expect(resolution.descriptor.action.type).toBe("svg-image");
      expect(resolution.descriptor.preview.type).toBe("svg");
      expect(resolution.descriptor.rights.origin).toBe("toonstudio-original");
      expect(resolution.descriptor.rights.aiGenerated).toBe(false);
    }
  });
});

describe("권리 정보는 원본에서 그대로 온다", () => {
  it("내장 일러스트는 AI 생성 여부와 라이선스 참조를 원본 항목에서 가져온다", () => {
    const asset = STUDIO_RASTER_ASSETS[0];
    expect(asset).toBeDefined();
    const resolution = catalog.resolve(createStudioCharmId("raster", asset.id));
    expect(resolution.status).toBe("ready");
    if (resolution.status !== "ready") return;
    expect(resolution.descriptor.rights).toMatchObject({
      origin: "builtin-ai-raster",
      licenseId: asset.license.licenseRef,
      aiGenerated: asset.provenance.origin === "ai-generated",
      attributionRequired: asset.license.attributionRequired,
    });
    expect(resolution.descriptor.action).toEqual({ type: "raster-asset", asset });
  });

  it("내 소재는 기록된 권리를 그대로 요약하고, 없으면 확인이 필요하다고 정직하게 말한다", () => {
    const library = [
      {
        id: "asset-with-rights",
        name: "내 손 그림",
        dataUrl: "data:image/png;base64,AAAA",
        width: 120,
        height: 90,
        kind: "ai",
        rights: { licenseId: "cc-by-4.0", licenseLabel: "CC BY 4.0", attributionRequired: true, rightsConfirmed: true },
      },
      { id: "asset-plain", name: "이름 없는 소재", dataUrl: "data:image/png;base64,BBBB", width: 10, height: 10 },
    ];
    const built = buildStudioCharmCatalog({ data, library, libraryReady: true });
    const withRights = built.resolve(createStudioCharmId("library", "asset-with-rights"));
    const plain = built.resolve(createStudioCharmId("library", "asset-plain"));
    expect(withRights.status === "ready" && withRights.descriptor.rights).toMatchObject({
      origin: "user-library",
      licenseId: "cc-by-4.0",
      attributionRequired: true,
      aiGenerated: true,
    });
    expect(plain.status === "ready" && plain.descriptor.rights).toMatchObject({
      licenseId: null,
      attributionRequired: null,
      aiGenerated: false,
    });
    expect(plain.status === "ready" && plain.descriptor.rights.summary).toContain("확인");
    expect(plain.status === "ready" && plain.descriptor.action).toMatchObject({ type: "library-image", width: 10, height: 10 });
  });

  it("출처가 AI 생성이라고 기록된 내 소재도 kind 와 관계없이 AI 로 표시한다", () => {
    const library = [{
      id: "asset-imported-ai",
      name: "가져온 AI 그림",
      dataUrl: "data:image/png;base64,CCCC",
      width: 10,
      height: 10,
      rights: { sourceKind: "ai-generated", licenseId: "custom", licenseLabel: "직접 확인", attributionRequired: null, rightsConfirmed: false },
    }];
    const built = buildStudioCharmCatalog({ data, library, libraryReady: true });
    const resolution = built.resolve(createStudioCharmId("library", "asset-imported-ai"));
    expect(resolution.status === "ready" && resolution.descriptor.rights.aiGenerated).toBe(true);
    expect(resolution.status === "ready" && resolution.descriptor.rights.summary).toContain("권리 확인 전");
  });

  it("효과음은 그림이 아니라 글자 스타일이라서 '직접 만든 벡터'로 요약하지 않고 글꼴 조건은 단정하지 않는다", () => {
    const resolution = catalog.resolve(createStudioCharmId("sfx", "sfx-kwang"));
    expect(resolution.status).toBe("ready");
    if (resolution.status !== "ready") return;
    expect(resolution.descriptor.rights.summary).toContain("글자 스타일");
    expect(resolution.descriptor.rights.summary).not.toContain("벡터");
    expect(resolution.descriptor.rights.attributionRequired).toBeNull();
  });

  it("이모지는 파일이 없는 시스템 글리프라는 사실을 숨기지 않는다", () => {
    const resolution = catalog.resolve(createStudioCharmId("emoji", "1f4a7"));
    expect(resolution.status === "ready" && resolution.descriptor.rights.origin).toBe("system-glyph");
    expect(resolution.status === "ready" && resolution.descriptor.label).toBe("눈물·물방울");
  });
});

describe("참 검색", () => {
  it("모든 낱말이 맞는 항목만 찾고 분류로 좁힌다", () => {
    const focus = catalog.search({ query: "집중선" });
    expect(focus.some((item) => item.id === createStudioCharmId("fx", "radial-focus"))).toBe(true);
    expect(catalog.search({ query: "집중선 존재하지않는낱말" })).toHaveLength(0);
    const effectsOnly = catalog.search({ query: "집중선", section: "effect" });
    expect(effectsOnly.every((item) => item.section === "effect")).toBe(true);
    expect(catalog.search({ query: "땀", section: "emoji" }).some((item) => item.label === "땀방울")).toBe(true);
  });

  it("빈 검색어는 전체를 한도 안에서 돌려주고 한도는 1 이상으로 맞춘다", () => {
    expect(catalog.search({ limit: 5 })).toHaveLength(5);
    expect(catalog.search({ limit: 0 })).toHaveLength(1);
    expect(catalog.search({ limit: 3, section: "bubble" }).every((item) => item.kind === "bubble")).toBe(true);
  });

  it("대소문자와 전각 문자를 구분하지 않는다", () => {
    expect(catalog.search({ query: "ＳＰＥＥＤ" }).length).toBeGreaterThan(0);
  });
});
