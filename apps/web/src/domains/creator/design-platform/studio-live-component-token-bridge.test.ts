import { describe, expect, it } from "vitest";

import { rgbToHex } from "../studio-color-harmony-engine";
import {
  createStudioWebtoonDesignTokenDocument,
  STUDIO_WEBTOON_BUILTIN_MODE_AXES,
  STUDIO_WEBTOON_DESIGN_TOKEN_VERSION,
} from "../studio-webtoon-design-tokens";

import {
  applyDesignTokenModesToCanvas,
  applyMultiEditBatchPatch,
  buildMultiEditBatchPatch,
  exportResolvedTokensToCssVariables,
  exportWebtoonTokensToDtcg,
  importDtcgToWebtoonTokenDocument,
  insertChildIntoComponentSlot,
  invertMultiEditBatchPatch,
  removeChildFromComponentSlot,
  selectMatchingLayersForMultiEdit,
  type DtcgTokenGroup,
  type LiveComponentSlotContainer,
  type MultiEditContainer,
} from "./studio-live-component-token-bridge";

import type { El } from "../studio-element-model";

describe("studio-live-component-token-bridge", () => {
  it("Figma SlotSettings 가드레일(maxChildren/minChildren/preferred/stretch)을 Detach 없이 강제한다", () => {
    const container: LiveComponentSlotContainer = {
      instanceId: "inst-card-1",
      componentId: "cmp-episode-card",
      x: 100,
      y: 50,
      width: 300,
      height: 200,
      variantSelection: { tone: "default" },
      slots: [
        {
          slotId: "badge-slot",
          labelKo: "등급 배지 슬롯",
          minChildren: 1,
          maxChildren: 2,
          allowPreferredValuesOnly: true,
          preferredComponentIds: ["cmp-badge-all", "cmp-badge-15"],
          stretchChildOnInsert: true,
          bounds: { x: 16, y: 12, width: 64, height: 28 },
        },
      ],
      slotChildren: {
        "badge-slot": [
          {
            id: "child-initial",
            name: "전체이용가",
            kind: "component-ref",
            componentId: "cmp-badge-all",
            x: 116,
            y: 62,
            width: 64,
            height: 28,
            props: {},
          },
        ],
      },
    };

    // 권장 컴포넌트가 아닌 항목은 거부
    const rejected = insertChildIntoComponentSlot(container, "badge-slot", {
      id: "child-random",
      name: "임의 도형",
      kind: "draw",
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      props: {},
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe("PREFERRED_COMPONENT_REQUIRED");

    // minChildren=1 보호: 유일한 자식 삭제 거부
    const minBlocked = removeChildFromComponentSlot(container, "badge-slot", "child-initial");
    expect(minBlocked.ok).toBe(false);
    if (!minBlocked.ok) expect(minBlocked.code).toBe("MIN_CHILDREN_VIOLATION");

    // 권장 컴포넌트 삽입 + stretchChildOnInsert 적용
    const inserted = insertChildIntoComponentSlot(container, "badge-slot", {
      id: "child-15",
      name: "15세 배지",
      kind: "component-ref",
      componentId: "cmp-badge-15",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      props: {},
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.insertedChild?.x).toBe(116);
    expect(inserted.insertedChild?.width).toBe(64);

    // maxChildren=2 초과 삽입 거부
    const overflow = insertChildIntoComponentSlot(inserted.container, "badge-slot", {
      id: "child-third",
      name: "세번째 배지",
      kind: "component-ref",
      componentId: "cmp-badge-all",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      props: {},
    });
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.code).toBe("MAX_CHILDREN_EXCEEDED");
  });

  it("W3C DTCG 양방향 변환(별칭 해석·순환 차단)과 모드별 캔버스 일괄 바인딩이 동작한다", () => {
    const dayBubbleBg = rgbToHex(252, 250, 245);
    const nightBubbleBg = rgbToHex(32, 38, 56);
    const dayInk = rgbToHex(24, 24, 28);
    const nightInk = rgbToHex(232, 238, 248);

    const tokenDoc = createStudioWebtoonDesignTokenDocument({
      version: STUDIO_WEBTOON_DESIGN_TOKEN_VERSION,
      axes: STUDIO_WEBTOON_BUILTIN_MODE_AXES,
      tokens: [
        {
          id: "dialogue-bubble",
          label: "기본 대사 말풍선",
          category: "bubble",
          value: {
            fill: dayBubbleBg,
            textColor: dayInk,
            borderColor: dayInk,
            borderWidthPx: 2,
            fontFamily: "Pretendard",
            fontSizePx: 22,
          },
          overrides: [
            {
              id: "night-theme",
              selector: { theme: "night" },
              value: { fill: nightBubbleBg, textColor: nightInk, borderColor: nightInk },
            },
            {
              id: "en-locale",
              selector: { language: "en" },
              value: { fontFamily: "Inter", fontSizePx: 18 },
            },
          ],
        },
        {
          id: "episode-gutter",
          label: "컷 여백",
          category: "spacing",
          value: { panelGutterPx: 24, contentMarginPx: 16 },
        },
      ],
    });

    const elements: El[] = [
      {
        id: "b1",
        type: "bubble",
        variant: "speech",
        text: "안녕하세요",
        x: 40,
        y: 60,
        width: 180,
        height: 90,
        fill: dayBubbleBg,
        textFill: dayInk,
        rotation: 0,
        font: "Pretendard",
        fontSize: 22,
      },
    ];

    const bindings = [
      { elementId: "b1", property: "fill" as const, tokenId: "dialogue-bubble", tokenField: "fill" },
      { elementId: "b1", property: "textFill" as const, tokenId: "dialogue-bubble", tokenField: "textColor" },
      { elementId: "b1", property: "font" as const, tokenId: "dialogue-bubble", tokenField: "fontFamily" },
      { elementId: "b1", property: "fontSize" as const, tokenId: "dialogue-bubble", tokenField: "fontSizePx" },
    ];

    const nightEn = applyDesignTokenModesToCanvas(elements, bindings, tokenDoc, {
      theme: "night",
      language: "en",
    });
    expect(nightEn.changedElementIds).toEqual(["b1"]);
    const updatedBubble = nightEn.elements[0]!;
    expect(updatedBubble.type === "bubble" && updatedBubble.fill).toBe(nightBubbleBg);
    expect(updatedBubble.type === "bubble" && updatedBubble.textFill).toBe(nightInk);
    expect(updatedBubble.type === "bubble" && updatedBubble.font).toBe("Inter");
    expect(updatedBubble.type === "bubble" && updatedBubble.fontSize).toBe(18);

    // DTCG 내보내기 & CSS 변수 Inspect 검증
    const dtcgExport = exportWebtoonTokensToDtcg(tokenDoc, { theme: "night" });
    expect(dtcgExport).toHaveProperty("bubble");
    expect(dtcgExport).toHaveProperty("spacing");
    const cssVars = exportResolvedTokensToCssVariables(tokenDoc);
    expect(cssVars).toContain("--ts-episode-gutter-gutter: 24px;");

    // DTCG 가져오기: 별칭 해석 + 순환 참조 차단
    const accentHex = rgbToHex(42, 118, 92);
    const dtcgIncoming: DtcgTokenGroup = {
      brand: {
        $type: "color",
        primary: { $value: accentHex },
        buttonBg: { $value: "{brand.primary}" },
        cycleA: { $value: "{brand.cycleB}" },
        cycleB: { $value: "{brand.cycleA}" },
      },
      layout: {
        gutter: { $type: "dimension", $value: "20px" },
      },
    };
    const imported = importDtcgToWebtoonTokenDocument(dtcgIncoming);
    expect(imported.resolvedAliasCount).toBeGreaterThanOrEqual(1);
    expect(imported.warnings.some((w) => w.includes("순환"))).toBe(true);
    expect(imported.importedTokenCount).toBeGreaterThanOrEqual(2);
  });

  it("Multi-Edit 매칭 선택과 로컬 피벗 보존 일괄 편집 + Undo 역패치를 단일 트랜잭션으로 처리한다", () => {
    const containers: MultiEditContainer[] = [
      {
        containerId: "cut-1",
        name: "1컷",
        nodes: [
          {
            id: "c1-title",
            containerId: "cut-1",
            name: "화자명",
            slotId: "speaker-slot",
            type: "text",
            x: 10,
            y: 20,
            width: 100,
            height: 30,
            rotation: 0,
            style: { opacity: 1 },
            text: "주인공",
          },
        ],
      },
      {
        containerId: "cut-2",
        name: "2컷",
        nodes: [
          {
            id: "c2-title",
            containerId: "cut-2",
            name: "화자명",
            slotId: "speaker-slot",
            type: "text",
            x: 300,
            y: 40,
            width: 120,
            height: 40,
            rotation: 15,
            style: { opacity: 1 },
            text: "주인공",
          },
        ],
      },
    ];

    const matchedIds = selectMatchingLayersForMultiEdit(containers, "c1-title", "slot");
    expect(matchedIds).toEqual(["c1-title", "c2-title"]);

    // 로컬 중심점 유지 2배 스케일 패치
    const scalePatch = buildMultiEditBatchPatch(containers, matchedIds, {
      kind: "scale-local",
      scaleX: 2,
      scaleY: 2,
    });
    expect(scalePatch.changes).toHaveLength(2);
    const scaled = applyMultiEditBatchPatch(containers, scalePatch);
    const c1After = scaled[0]!.nodes[0]!;
    const c2After = scaled[1]!.nodes[0]!;
    // 로컬 중심 보존 검증: (10+50=60, 20+15=35) 유지
    expect(c1After.x + c1After.width / 2).toBeCloseTo(60, 2);
    expect(c1After.y + c1After.height / 2).toBeCloseTo(35, 2);
    expect(c2After.x + c2After.width / 2).toBeCloseTo(360, 2);
    expect(c2After.width).toBe(240);

    // 단일 트랜잭션 Undo 역패치 적용 시 원본 완벽 복원
    const undone = applyMultiEditBatchPatch(scaled, invertMultiEditBatchPatch(scalePatch));
    expect(undone).toEqual(containers);
  });
});
