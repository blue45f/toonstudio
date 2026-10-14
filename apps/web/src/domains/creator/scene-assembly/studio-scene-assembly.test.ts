import { describe, it, expect } from "vitest";

import {
  normalizeStudioSceneSlotDocument,
  isStudioSceneSlotDocument,
  STUDIO_SCENE_MAX_CHARACTERS,
} from "./studio-scene-slot-contract";
import { structureSentenceToSceneFallback } from "./studio-scene-fallback-structurer";
import {
  adaptCharacterAssetToSceneCatalog,
  adaptIllustrationBackgroundToSceneCatalog,
  adaptLocalAssetToSceneCatalog,
  adaptRasterAssetToSceneCatalog,
  adaptUnifiedAssetToSceneCatalog,
  assembleSceneDraft,
  rankSceneCatalogForSlot,
  type StudioSceneCatalogEntry,
} from "./studio-scene-catalog-assembly";
import {
  structureSceneWithFallback,
  type StudioSceneStructureProvider,
} from "./studio-scene-provider";

import type { Studio2dAssetMetadata } from "../studio-2d-asset-quality";
import type { CharacterAsset } from "../studio-characters";
import type { StudioRasterAsset } from "../render/studio-raster-assets";
import type { StudioAsset } from "../studio-asset-library";
import type { StudioUnifiedAssetItem } from "../studio-unified-asset-catalog";

// ---------------------------------------------------------------------------
// 슬롯 계약 정규화
// ---------------------------------------------------------------------------

describe("normalizeStudioSceneSlotDocument", () => {
  it("유효한 문서를 정규화한다 — scale 클램프, 캐릭터 쿼리 기본값", () => {
    const { document, issues } = normalizeStudioSceneSlotDocument(
      {
        sentence: "테스트 문장",
        source: "ai",
        background: { query: "카페", keywords: ["카페", "카페", "실내"] },
        characters: [{ label: "지훈", pose: "앉은", scale: 9 }],
        dialogues: [{ text: "안녕" }],
      },
      "ai"
    );
    expect(document).not.toBeNull();
    expect(document!.background?.keywords).toEqual(["카페", "실내"]);
    expect(document!.characters[0].scale).toBe(1.6);
    expect(document!.characters[0].query).toBe("지훈 앉은");
    expect(document!.characters[0].position).toBe("center");
    expect(document!.dialogues[0].variantHint).toBe("speech");
    expect(issues).toEqual([]);
    expect(isStudioSceneSlotDocument(document)).toBe(true);
  });

  it("원문이 없으면 document=null", () => {
    expect(normalizeStudioSceneSlotDocument(null, "ai").document).toBeNull();
    expect(normalizeStudioSceneSlotDocument({ characters: [] }, "ai").document).toBeNull();
    expect(
      normalizeStudioSceneSlotDocument({ sentence: "  " }, "ai").issues
    ).toContain("sentence-missing");
  });

  it("상한을 넘는 슬롯은 issues를 남기고 잘린다", () => {
    const characters = Array.from({ length: STUDIO_SCENE_MAX_CHARACTERS + 2 }, (_, i) => ({
      label: `인물${i}`,
    }));
    const { document, issues } = normalizeStudioSceneSlotDocument(
      { sentence: "문장", characters, dialogues: [{ text: "" }, { text: "유효" }] },
      "ai"
    );
    expect(document!.characters).toHaveLength(STUDIO_SCENE_MAX_CHARACTERS);
    expect(issues).toContain("characters-truncated");
    expect(issues).toContain("dialogue-text-empty");
    expect(document!.dialogues).toHaveLength(1);
  });

  it("쿼리 없는 배경은 null이 되고 issue가 남는다", () => {
    const { document, issues } = normalizeStudioSceneSlotDocument(
      { sentence: "문장", background: { query: "", keywords: [] } },
      "ai"
    );
    expect(document!.background).toBeNull();
    expect(issues).toContain("background-query-empty");
  });
});

// ---------------------------------------------------------------------------
// 규칙 기반 폴백 구조화기
// ---------------------------------------------------------------------------

describe("structureSentenceToSceneFallback", () => {
  it("장소·시간대·포즈·화자·대사를 한 문장에서 뽑는다", () => {
    const doc = structureSentenceToSceneFallback(
      "노을 진 옥상에서 지훈이 서 있었다. “조금만 더 기다릴게.” 지훈이 말했다.",
      { characterNames: ["지훈"] }
    );
    expect(doc.source).toBe("fallback");
    expect(doc.background?.query).toBe("노을 옥상");
    expect(doc.background?.timeOfDay).toBe("노을");
    expect(doc.background?.environment).toBe("실외");
    expect(doc.characters).toHaveLength(1);
    expect(doc.characters[0]).toMatchObject({ label: "지훈", pose: "서 있는", position: "left" });
    expect(doc.dialogues).toHaveLength(1);
    expect(doc.dialogues[0]).toMatchObject({
      text: "조금만 더 기다릴게.",
      speaker: "지훈",
      variantHint: "speech",
    });
  });

  it("외침은 shout, 속마음은 thought로 귀속한다", () => {
    const shout = structureSentenceToSceneFallback("“이게 끝이 아니야!” 민지가 외쳤다.", {
      characterNames: ["민지"],
    });
    expect(shout.dialogues[0].variantHint).toBe("shout");
    expect(shout.dialogues[0].speaker).toBe("민지");
    expect(shout.background).toBeNull();
    expect(shout.warnings).toContain("background-not-found");

    const thought = structureSentenceToSceneFallback(
      "지훈은 속으로 생각했다. ‘역시 그럴 줄 알았어.’",
      { characterNames: ["지훈"] }
    );
    expect(thought.dialogues[0].variantHint).toBe("thought");
    expect(thought.dialogues[0].speaker).toBe("지훈");
  });

  it("『』 나레이션과 날씨 키워드, 소품을 뽑는다", () => {
    const doc = structureSentenceToSceneFallback(
      "『3년 전, 그날.』 비 오는 카페에서 그녀가 커피를 마셨다."
    );
    expect(doc.narrations.map((n) => n.text)).toContain("3년 전, 그날.");
    expect(doc.background?.query).toBe("카페");
    expect(doc.background?.keywords).toContain("비");
    expect(doc.props.map((p) => p.query)).toContain("커피");
  });

  it("위치 단어와 포즈가 캐릭터마다 따로 붙는다(옆 절 간섭 없음)", () => {
    const doc = structureSentenceToSceneFallback(
      "왼쪽에 민지가 앉아 있고, 오른쪽에 지훈이 서 있었다.",
      { characterNames: ["민지", "지훈"] }
    );
    const minji = doc.characters.find((c) => c.label === "민지");
    const jihoon = doc.characters.find((c) => c.label === "지훈");
    expect(minji).toMatchObject({ position: "left", pose: "앉은" });
    expect(jihoon).toMatchObject({ position: "right", pose: "서 있는" });
  });

  it("책상은 책으로 이중 계산하지 않는다", () => {
    const doc = structureSentenceToSceneFallback("교실에서 지훈이 책상 위에 편지를 올려 두었다.", {
      characterNames: ["지훈"],
    });
    const queries = doc.props.map((p) => p.query);
    expect(queries).toContain("책상");
    expect(queries).toContain("편지");
    expect(queries).not.toContain("책");
    expect(doc.background?.query).toBe("교실");
  });

  it("아무것도 못 찾으면 원문을 나레이션으로 보존한다", () => {
    const doc = structureSentenceToSceneFallback("뭔가 좋은 일이 생길 것만 같았다.");
    expect(doc.narrations.map((n) => n.text)).toContain("뭔가 좋은 일이 생길 것만 같았다.");
    expect(doc.warnings).toContain("sentence-preserved-as-narration");
  });

  it("빈 문장에도 throw 없이 경고 문서를 돌려준다", () => {
    const doc = structureSentenceToSceneFallback("   ");
    expect(doc.sentence).toBe("");
    expect(doc.warnings).toContain("empty-sentence");
  });

  it("결정적이다 — 같은 입력은 같은 문서", () => {
    const sentence = "밤의 교실에서 민지가 책을 읽고 있었다. “다 읽었어?” 지훈이 물었다.";
    const a = structureSentenceToSceneFallback(sentence, { characterNames: ["민지", "지훈"] });
    const b = structureSentenceToSceneFallback(sentence, { characterNames: ["민지", "지훈"] });
    expect(a).toEqual(b);
    expect(a.background?.timeOfDay).toBe("밤");
    // 지훈은 대사 뒤 귀속 절("지훈이 물었다")에 등장하므로 캐릭터 슬롯에도 잡힌다.
    expect(a.characters.map((c) => c.label)).toEqual(["민지", "지훈"]);
    // 화자는 앞 절의 민지가 아니라 발화 동사에 붙은 지훈이다.
    expect(a.dialogues[0].speaker).toBe("지훈");
  });
});

// ---------------------------------------------------------------------------
// 카탈로그 매칭 + 조립
// ---------------------------------------------------------------------------

const catalog: StudioSceneCatalogEntry[] = [
  {
    id: "bg-rooftop-sunset",
    kind: "background",
    title: "노을 옥상",
    keywords: ["옥상", "rooftop", "노을"],
    src: "/assets/bg-rooftop.webp",
    width: 1600,
    height: 1000,
    timeOfDay: "노을",
    environment: "실외",
    featured: true,
  },
  {
    id: "bg-rooftop-night",
    kind: "background",
    title: "밤 옥상",
    keywords: ["옥상", "rooftop", "밤"],
    src: "/assets/bg-rooftop-night.webp",
    width: 1600,
    height: 1000,
    timeOfDay: "밤",
    environment: "실외",
  },
  {
    id: "char-jihoon-stand",
    kind: "character",
    title: "지훈 서 있는",
    keywords: ["지훈", "서 있는"],
    src: "/assets/jihoon.png",
    width: 200,
    height: 400,
  },
  {
    id: "prop-letter",
    kind: "prop",
    title: "편지",
    keywords: ["편지", "letter"],
    src: "/assets/letter.png",
    width: 120,
    height: 90,
  },
];

describe("rankSceneCatalogForSlot", () => {
  it("시간대가 맞는 배경이 1순위가 된다", () => {
    const night = rankSceneCatalogForSlot(catalog, "background", "밤 옥상", ["밤"], {
      timeOfDay: "밤",
    });
    expect(night[0].entry.id).toBe("bg-rooftop-night");
    const sunset = rankSceneCatalogForSlot(catalog, "background", "노을 옥상", ["옥상"], {
      timeOfDay: "노을",
    });
    expect(sunset[0].entry.id).toBe("bg-rooftop-sunset");
  });

  it("관련 없는 종류·점수 0 후보는 제외한다", () => {
    expect(rankSceneCatalogForSlot(catalog, "character", "우주선", [])).toEqual([]);
    expect(rankSceneCatalogForSlot(catalog, "prop", "", [])).toEqual([]);
  });
});

describe("assembleSceneDraft", () => {
  const sentence =
    "노을 진 옥상에서 지훈이 서 있었다. 지훈이 편지를 들고 있었다. “조금만 더 기다릴게.” 지훈이 말했다.";
  const doc = structureSentenceToSceneFallback(sentence, { characterNames: ["지훈"] });

  it("프레임 bg·캐릭터·소품·말풍선이 초안으로 조립된다", () => {
    const result = assembleSceneDraft(doc, catalog);
    const frame = result.seeds.find((s) => s.type === "frame");
    expect(frame).toMatchObject({ type: "frame", bg: "/assets/bg-rooftop.webp", bgColor: "#ffe3c2" });

    const character = result.images.find((i) => i.role === "character");
    // 프레임 x=30, 폭 660, left 앵커 0.22 → 중심 175.2; 200×400 자산 → 높이 300, 폭 150.
    expect(character).toMatchObject({
      entryId: "char-jihoon-stand",
      x: 100,
      y: 200,
      width: 150,
      height: 300,
      flipped: false,
    });
    const prop = result.images.find((i) => i.role === "prop");
    expect(prop).toMatchObject({ entryId: "prop-letter", width: 120, height: 90, y: 410 });

    const bubble = result.seeds.find((s) => s.type === "bubble");
    expect(bubble).toMatchObject({ text: "조금만 더 기다릴게.", variant: "speech", tailDirection: "bottom" });
    expect(result.unmatched).toEqual([]);
  });

  it("캐릭터 자산이 없으면 unmatched로 남기고 말풍선 골격은 유지한다", () => {
    const withoutCharacters = catalog.filter((e) => e.kind !== "character");
    const result = assembleSceneDraft(doc, withoutCharacters);
    expect(result.images.some((i) => i.role === "character")).toBe(false);
    expect(result.unmatched).toContainEqual(
      expect.objectContaining({ slotKind: "character", slotIndex: 0, reason: "no-candidate" })
    );
    expect(result.warnings).toContain("character-unmatched:지훈");
    expect(result.seeds.some((s) => s.type === "bubble")).toBe(true);
  });

  it("배경이 없으면 단색 프레임으로 폴백하고 경고를 남긴다", () => {
    const noBg = structureSentenceToSceneFallback("“이게 끝이 아니야!” 민지가 외쳤다.", {
      characterNames: ["민지"],
    });
    const result = assembleSceneDraft(noBg, catalog);
    const frame = result.seeds.find((s) => s.type === "frame");
    expect(frame).toMatchObject({ type: "frame", bgColor: "#f2f0ea" });
    expect(frame && "bg" in frame ? frame.bg : undefined).toBeUndefined();
  });

  it("결정적이다 — 같은 문서·카탈로그는 같은 초안", () => {
    expect(assembleSceneDraft(doc, catalog)).toEqual(assembleSceneDraft(doc, catalog));
  });
});

// ---------------------------------------------------------------------------
// 카탈로그 어댑터
// ---------------------------------------------------------------------------

describe("catalog adapters", () => {
  it("통합 카탈로그 배경 항목을 배경 진입으로 바꾼다", () => {
    const item = {
      id: "unified-bg-1",
      category: "scene",
      scope: "studio",
      title: "햇살 카페",
      description: "밝은 카페 배경",
      categoryLabel: "장면",
      keywords: ["카페"],
      badges: [],
      preview: { kind: "image", src: "/assets/cafe.webp" },
      useMode: "insert",
      useLabel: "배치",
      discoverability: "featured",
      sortPriority: 10,
      source: {
        kind: "background",
        value: { id: "cafe", label: "카페", genre: "일상", imgSrc: "/assets/cafe.webp", width: 1600, height: 1000 },
      },
    } as unknown as StudioUnifiedAssetItem;
    const entry = adaptUnifiedAssetToSceneCatalog(item);
    expect(entry).toMatchObject({ kind: "background", src: "/assets/cafe.webp", featured: true });
  });

  it("일러스트 배경 메타는 시간대·실내외를 싣는다", () => {
    const meta = {
      id: "illustration-starlit-rooftop",
      title: "별밤 옥상",
      src: "/assets/studio/illustration-20260926/rooftop.png",
      width: 1600,
      height: 1000,
      tags: ["옥상", "밤"],
      environment: "실외",
      timeOfDay: "밤",
      recommended: true,
    } as unknown as Studio2dAssetMetadata;
    expect(adaptIllustrationBackgroundToSceneCatalog(meta)).toMatchObject({
      kind: "background",
      timeOfDay: "밤",
      environment: "실외",
      featured: true,
    });
  });

  it("캐릭터 계약은 표정 단위 진입으로 펼친다", () => {
    const asset: CharacterAsset = {
      id: "jihoon",
      label: "지훈",
      emoji: "🧑",
      width: 200,
      height: 400,
      expressions: [
        { id: "happy", label: "기쁨", svg: "<svg/>", imgSrc: "/assets/jihoon-happy.png" },
        { id: "sad", label: "슬픔", svg: "<svg/>" },
      ],
    };
    const entries = adaptCharacterAssetToSceneCatalog(asset);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: "jihoon:happy", kind: "character", src: "/assets/jihoon-happy.png" });
    expect(entries[1].svg).toBe("<svg/>");
    expect(adaptCharacterAssetToSceneCatalog(asset, "sad")).toHaveLength(1);
  });

  it("래스터 에셋과 로컬 에셋을 소품 진입으로 바꾼다", () => {
    const raster = {
      id: "builtin-raster-daily-cafe-table-for-two",
      label: "카페 테이블 2인 세트",
      description: "카페 소품",
      kind: "prop-cluster",
      src: "/assets/studio/props/daily/webtoon_cafe_table_for_two.webp",
      width: 1536,
      height: 1024,
      tags: ["카페", "테이블"],
    } as unknown as StudioRasterAsset;
    expect(adaptRasterAssetToSceneCatalog(raster)).toMatchObject({
      kind: "prop",
      src: "/assets/studio/props/daily/webtoon_cafe_table_for_two.webp",
    });

    const local = {
      id: "asset-1",
      name: "우리 집 거실 사진",
      dataUrl: "data:image/png;base64,AAAA",
      width: 800,
      height: 600,
      createdAt: 1,
    } as unknown as StudioAsset;
    expect(adaptLocalAssetToSceneCatalog(local, "background")).toMatchObject({
      id: "local:asset-1",
      kind: "background",
      src: "data:image/png;base64,AAAA",
    });
  });
});

// ---------------------------------------------------------------------------
// 제공자 + 폴백 규약
// ---------------------------------------------------------------------------

describe("structureSceneWithFallback", () => {
  it("제공자 미지정 시 로컬 규칙 제공자로 동작한다", async () => {
    const outcome = await structureSceneWithFallback({
      sentence: "노을 진 옥상에서 지훈이 서 있었다.",
      characterNames: ["지훈"],
    });
    expect(outcome.providerId).toBe("local-rules");
    expect(outcome.usedFallback).toBe(false);
    expect(outcome.document.background?.query).toBe("노을 옥상");
  });

  it("원격 제공자의 유효한 문서는 그대로 쓴다", async () => {
    const ai: StudioSceneStructureProvider = {
      id: "test-ai",
      kind: "remote-ai",
      async structure() {
        return {
          background: { query: "카페", keywords: ["카페"] },
          characters: [{ label: "민지", position: "left" }],
          dialogues: [{ text: "안녕", speaker: "민지" }],
        };
      },
    };
    const outcome = await structureSceneWithFallback({ sentence: "카페에서 민지가 말했다." }, ai);
    expect(outcome.usedFallback).toBe(false);
    expect(outcome.providerId).toBe("test-ai");
    expect(outcome.document.source).toBe("ai");
    expect(outcome.document.sentence).toBe("카페에서 민지가 말했다.");
    expect(outcome.document.background?.query).toBe("카페");
  });

  it("제공자가 throw하면 폴백 문서로 진행하고 사유를 남긴다", async () => {
    const broken: StudioSceneStructureProvider = {
      id: "broken-ai",
      kind: "remote-ai",
      async structure() {
        throw new Error("quota-exceeded");
      },
    };
    const outcome = await structureSceneWithFallback(
      { sentence: "교실에서 지훈이 앉아 있었다.", characterNames: ["지훈"] },
      broken
    );
    expect(outcome.usedFallback).toBe(true);
    expect(outcome.fallbackReason).toBe("quota-exceeded");
    expect(outcome.document.source).toBe("fallback");
    expect(outcome.document.background?.query).toBe("교실");
  });

  it("제공자가 빈 문서를 내거나 타임아웃이면 폴백한다", async () => {
    const empty: StudioSceneStructureProvider = {
      id: "empty-ai",
      kind: "remote-ai",
      async structure() {
        return { nothing: true };
      },
    };
    const emptyOutcome = await structureSceneWithFallback(
      { sentence: "옥상에서 지훈이 서 있었다.", characterNames: ["지훈"] },
      empty
    );
    expect(emptyOutcome.usedFallback).toBe(true);
    expect(emptyOutcome.fallbackReason).toBe("provider-output-unusable");

    const slow: StudioSceneStructureProvider = {
      id: "slow-ai",
      kind: "remote-ai",
      async structure() {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return { background: { query: "카페" } };
      },
    };
    const slowOutcome = await structureSceneWithFallback(
      { sentence: "옥상에서 지훈이 서 있었다.", characterNames: ["지훈"] },
      slow,
      { timeoutMs: 5 }
    );
    expect(slowOutcome.usedFallback).toBe(true);
    expect(slowOutcome.fallbackReason).toBe("provider-timeout");
  });
});
