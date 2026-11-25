// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioFreeAiAssistWorkbench } from "../../studio-shell/StudioFreeAiAssistWorkbench";
import {
  CANVA_BRAND_KIT_PRESETS,
  generateMagicDesignLayout,
  MAGIC_SWITCH_FORMATS,
  planMagicEraserMask,
  planMagicExpandCanvas,
  planMagicGrabSeparation,
  runMagicSwitchReflow,
  runMagicWriteZeroBill,
} from "../canva-magic-studio-engine";
import {
  auditDesignSystemAndBubbleContrast,
  computeRelativeLuminance,
  computeWcagContrastRatio,
  exportAutoLayoutBridge,
  generateFirstDraftAutoLayout,
  oklchToSrgb,
  parseOklchString,
  smartRenameAndOrganizeLayers,
  suggestAccessibleOklchForeground,
} from "../figma-ai-layout-engine";
import { StudioDesignStoryAi4SuitesPanel } from "../StudioDesignStoryAi4SuitesPanel";
import {
  buildPlotrLayoutAndLineCleanupPlan,
  compilePlotrStoryboardFromScript,
  createCharacterIdentityAnchor,
  createCharacterCategory,
  createInitialTooningRegistry,
  generateTooningMagicPanels,
  IDENTITY_LOCK_ANGLES,
  importPersonaChatLogToCuts,
  KWEBTOON_EXPRESSION_POSE_CARDS,
  reorderCharacterCategories,
  reorderTooningPanels,
  searchCharactersByTag,
  swapExpressionPoseCard,
  updateCharacterAuthorType,
  updateCharacterCategory,
  updateCharacterResource,
  verifySixAngleIdentityConsistency,
} from "../tooning-plotr-story-engine";

afterEach(cleanup);

describe("Canva Magic Studio 클린룸 엔진", () => {
  it("1. Magic Design이 4종 포맷별 구조화 레이아웃과 브랜드 키트 잠금을 합성한다", () => {
    const lockedKit = { ...CANVA_BRAND_KIT_PRESETS[2], locked: true };
    const formats = ["episode-thumbnail", "promo-poster", "sns-card", "episode-banner"] as const;

    for (const format of formats) {
      const doc = generateMagicDesignLayout({
        promptKo: "비 오는 날 옥상에서 다시 만난 첫사랑 판타지 1화",
        format,
        brandKit: lockedKit,
        titleKo: "달빛 아래 서약",
      });
      expect(doc.brandKit.id).toBe(lockedKit.id);
      expect(doc.shieldAudit.zeroPaidApi).toBe(true);
      expect(doc.shieldAudit.brandLocked).toBe(true);
      expect(doc.layers.length).toBeGreaterThanOrEqual(6);
      expect(doc.layers.every((layer) => layer.safeZoneCompliant)).toBe(true);
    }
  });

  it("2. Magic Switch가 6종 다규격(네이버/카카오/인스타/숏폼 9:16/16:9/단행본 B5)으로 세이프존을 보존해 리플로우한다", () => {
    const source = generateMagicDesignLayout({
      promptKo: "네온 야간 추격전 액션 신작 포스터",
      format: "episode-thumbnail",
    });
    const reflows = runMagicSwitchReflow(source);

    expect(MAGIC_SWITCH_FORMATS).toHaveLength(6);
    expect(reflows).toHaveLength(6);

    const dimensions = reflows.map((item) => [item.targetId, item.width, item.height]);
    expect(dimensions).toEqual([
      ["naver-vertical", 800, 1280],
      ["kakaopage-vertical", 720, 1280],
      ["instagram-portrait", 1080, 1350],
      ["shortform-9-16", 1080, 1920],
      ["xyoutube-16-9", 1920, 1080],
      ["print-b5", 2150, 3035],
    ]);

    for (const item of reflows) {
      expect(item.safeZonePreserved).toBe(true);
      expect(item.minLegibleFontMet).toBe(true);
      const nonBg = item.layers.filter((l) => l.role !== "background");
      for (const layer of nonBg) {
        expect(layer.x).toBeGreaterThanOrEqual(item.safeMargins.left);
        expect(layer.y).toBeGreaterThanOrEqual(item.safeMargins.top);
        expect(layer.x + layer.width).toBeLessThanOrEqual(item.width - item.safeMargins.right);
        expect(layer.y + layer.height).toBeLessThanOrEqual(item.height - item.safeMargins.bottom);
      }
    }
  });

  it("3. Magic Switch는 16:9 가로 분할 전략과 숏폼 9:16 상하단 UI 세이프존(210/320px)을 구분해 적용한다", () => {
    const source = generateMagicDesignLayout({
      promptKo: "일상 직장인 컷툰 프로모",
      format: "promo-poster",
    });
    const [shortform, landscape] = runMagicSwitchReflow(source, [
      "shortform-9-16",
      "xyoutube-16-9",
    ]);

    expect(shortform.safeMargins.top).toBe(210);
    expect(shortform.safeMargins.bottom).toBe(320);
    expect(shortform.layoutStrategyKo).toContain("숏폼");

    const titleLayer = landscape.layers.find((l) => l.role === "title-typography");
    const heroLayer = landscape.layers.find((l) => l.role === "hero-subject");
    expect(titleLayer).toBeDefined();
    expect(heroLayer).toBeDefined();
    expect((titleLayer?.x ?? 0) + (titleLayer?.width ?? 0)).toBeLessThanOrEqual(heroLayer?.x ?? 0);
  });

  it("4. Magic Grab이 전경 피사체와 배경 복원 레이어를 비파괴 계획으로 분리한다", () => {
    const doc = generateMagicDesignLayout({
      promptKo: "비 오는 날 주인공 클로즈업",
      format: "episode-thumbnail",
    });
    const plan = planMagicGrabSeparation(doc, "우산 쓴 여주인공");

    expect(plan.zeroPaidApi).toBe(true);
    expect(plan.foregroundLayer.featherRadiusPx).toBeGreaterThan(0);
    expect(plan.backgroundInpaintLayer.holeFillBbox.width).toBeGreaterThan(
      plan.foregroundLayer.bbox.width,
    );
    expect(plan.nonDestructiveOpsKo.length).toBeGreaterThanOrEqual(3);
  });

  it("5. Magic Eraser가 마스크 영역을 캔버스 경계로 보정하고 문맥 크롭과 면적 비율을 계산한다", () => {
    const plan = planMagicEraserMask(800, 1280, [
      { x: 750, y: 1200, width: 120, height: 150, labelKo: "구석 행인" },
      { x: 100, y: 200, width: 200, height: 160, labelKo: "간판 글자" },
    ]);

    expect(plan.zeroPaidApi).toBe(true);
    expect(plan.normalizedRegions).toHaveLength(2);
    expect(plan.normalizedRegions[0].maskRect.x + plan.normalizedRegions[0].maskRect.width).toBeLessThanOrEqual(800);
    expect(plan.normalizedRegions[0].maskRect.y + plan.normalizedRegions[0].maskRect.height).toBeLessThanOrEqual(1280);
    expect(plan.totalMaskedAreaPct).toBeGreaterThan(0);
    expect(plan.patchMatchPasses).toBeGreaterThanOrEqual(3);
  });

  it("6. Magic Expand가 원본 구도 앵커를 보존하며 4방향 확장 밴드를 산출한다", () => {
    const plan = planMagicExpandCanvas({
      sourceWidth: 800,
      sourceHeight: 1280,
      targetWidth: 1920,
      targetHeight: 1350,
      align: "center",
    });

    expect(plan.zeroPaidApi).toBe(true);
    expect(plan.anchorRect).toEqual({ x: 560, y: 35, width: 800, height: 1280 });
    expect(plan.expandBandsPx.left + plan.expandBandsPx.right + 800).toBe(1920);
    expect(plan.expandBandsPx.top + plan.expandBandsPx.bottom + 1280).toBe(1350);
    expect(plan.seamFeatherPx).toBeGreaterThan(0);
  });

  it("7. Magic Write 오프라인·할당량 차단 폴백은 ₩0 과금 차단과 개인정보 마스킹을 보장한다", async () => {
    const fetch429 = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: "quota_exceeded" }), { status: 429 }),
    );
    const result = await runMagicWriteZeroBill(
      {
        kind: "sns-post",
        promptKo: "연락처 010-9876-5432, editor@example.com 으로 보낼 신작 홍보글",
        projectTitle: "새벽의 레코드",
      },
      { fetchImpl: fetch429 },
    );

    expect(result.costGuaranteedZeroUsd).toBe(0);
    expect(result.paidBillingBlocked).toBe(true);
    expect(result.providerTier).toBe("local-fallback");
    expect(result.piiRedactedCount).toBeGreaterThanOrEqual(2);
    expect(result.variantsKo.join(" ")).not.toContain("010-9876-5432");
    expect(result.variantsKo.join(" ")).not.toContain("editor@example.com");
  });

  it("Magic Write는 클라우드 선택 없이 브라우저 기본 요청을 보내지 않는다", async () => {
    const ambientFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ code: "quota_exceeded" }, { status: 429 }),
    );
    try {
      const result = await runMagicWriteZeroBill({ kind: "promo-copy", promptKo: "합성 홍보 문구" });
      expect(ambientFetch).not.toHaveBeenCalled();
      expect(result.providerTier).toBe("local-fallback");

      const cloudFallback = await runMagicWriteZeroBill({
        kind: "promo-copy",
        promptKo: "합성 홍보 문구",
        offlineOnly: false,
      });
      expect(ambientFetch).toHaveBeenCalledTimes(1);
      expect(cloudFallback.providerTier).toBe("local-fallback");
      expect(cloudFallback.noticeKo).toContain("클라우드 무료 한도 보호");
    } finally {
      ambientFetch.mockRestore();
    }
  });

  it("8. Magic Write가 무료 클라우드 캐스케이드 응답 성공 시 구조화 카피를 연결한다", async () => {
    const fetchOk = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: "github-models-free",
          providerTier: "cloud-free",
          model: "openai/gpt-4o-mini",
          privacy: { piiRedactedCount: 0 },
          result: {
            mode: "thumbnail-hook-optimizer",
            data: {
              hookDiagnosis: "호기심 질문형 1화 카피",
              variants: ["단 한 장의 녹음 테이프가 모든 기억을 깨운다"],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await runMagicWriteZeroBill(
      { kind: "title-ab", promptKo: "기억을 잃은 피아니스트 미스터리 1화" },
      { fetchImpl: fetchOk },
    );

    expect(result.providerId).toBe("github-models-free");
    expect(result.providerTier).toBe("cloud-free");
    expect(result.costGuaranteedZeroUsd).toBe(0);
    expect(result.headlineKo).toBe("호기심 질문형 1화 카피");
  });
});

describe("Figma AI 클린룸 레이아웃·감사·브리지 엔진", () => {
  it("9. First Draft가 3가지 모드(웹툰 컷 그리드·말풍선·게임/앱 HUD)의 오토레이아웃 트리를 생성한다", () => {
    const grid = generateFirstDraftAutoLayout({ promptKo: "6컷 세로 액션 씬", mode: "webtoon-panel-grid" });
    const dialogue = generateFirstDraftAutoLayout({ promptKo: "옥상 고백 대사", mode: "dialogue-overlay" });
    const hud = generateFirstDraftAutoLayout({ promptKo: "보스전 체력바 HUD", mode: "game-app-hud" });

    expect(grid.root.children).toHaveLength(6);
    expect(grid.totalNodeCount).toBe(1 + 6 * 3);
    expect(dialogue.root.children.some((node) => node.role === "speech-bubble")).toBe(true);
    expect(hud.root.children.some((node) => node.role === "hud-bar")).toBe(true);
    expect(hud.prototypeFlows.length).toBeGreaterThanOrEqual(2);
  });

  it("10. Smart Rename & Auto-Organize가 무작위 레이어명을 00_배경~04_효과 표준 그룹으로 자동 분류한다", () => {
    const report = smartRenameAndOrganizeLayers([
      { id: "l1", name: "Rectangle 1", zIndex: 0 },
      { id: "l2", name: "Vector 19", kind: "vector", zIndex: 1 },
      { id: "l3", name: "Layer 1 copy", blendMode: "multiply", zIndex: 2 },
      { id: "l4", name: "Text 3", hasText: true, zIndex: 3 },
      { id: "l5", name: "Bloom_Final_2", blendMode: "screen", zIndex: 4 },
    ]);

    expect(report.renamedLayers.map((r) => r.newNameKo)).toEqual([
      "00_배경_01",
      "01_캐릭터_선화_01",
      "02_채색_01",
      "03_말풍선_01",
      "04_효과_01",
    ]);
    expect(report.organizedGroups.every((group) => group.count === 1)).toBe(true);
    expect(report.changedCount).toBe(5);
  });

  it("11. WCAG 2.1 sRGB 상대 휘도 및 대비율 공식이 이론값(21:1 · 1:1)과 일치한다", () => {
    expect(computeRelativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(computeRelativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(computeWcagContrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBe(21);
    expect(computeWcagContrastRatio({ r: 120, g: 120, b: 120 }, { r: 120, g: 120, b: 120 })).toBe(1);

    const whiteRgb = oklchToSrgb({ l: 1, c: 0, h: 0 });
    const blackRgb = oklchToSrgb({ l: 0, c: 0, h: 0 });
    expect(whiteRgb).toEqual({ r: 255, g: 255, b: 255 });
    expect(blackRgb).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("12. 말풍선 대비 감사기가 4.5:1 미달 색상을 검출하고 4.5:1 이상 OKLCH 보정색을 자동 제안한다", () => {
    const draft = generateFirstDraftAutoLayout({ promptKo: "4컷 대사", mode: "webtoon-panel-grid" });
    const audit = auditDesignSystemAndBubbleContrast(draft, [
      {
        id: "low-contrast",
        labelKo: "흐린 속삭임 말풍선",
        foregroundOklch: "oklch(0.72 0.03 250)",
        backgroundOklch: "oklch(0.95 0.01 90)",
        fontSizePx: 18,
      },
      {
        id: "high-contrast",
        labelKo: "선명한 대사 말풍선",
        foregroundOklch: "oklch(0.2 0.02 250)",
        backgroundOklch: "oklch(0.98 0.01 90)",
        fontSizePx: 18,
      },
    ]);

    expect(audit.failAaCount).toBe(1);
    expect(audit.passAaCount).toBe(1);
    const failed = audit.contrastFindings[0];
    expect(failed.passesAa).toBe(false);
    expect(failed.contrastRatio).toBeLessThan(4.5);
    expect(failed.suggestedForegroundOklch).toMatch(/^oklch\(/u);
    expect(failed.suggestedContrastRatio).toBeGreaterThanOrEqual(4.5);

    const directFix = suggestAccessibleOklchForeground(
      { l: 0.72, c: 0.03, h: 250 },
      { l: 0.95, c: 0.01, h: 90 },
      4.5,
    );
    expect(directFix.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("13. 디자인 시스템 감사기가 4px 그리드·말풍선 폰트·44px 터치 영역 위반을 감지한다", () => {
    const base = generateFirstDraftAutoLayout({ promptKo: "HUD", mode: "game-app-hud" });
    const brokenDraft = {
      ...base,
      root: {
        ...base.root,
        gapPx: 13,
        children: [
          {
            ...base.root.children[0],
            role: "button" as const,
            heightPx: 32,
          },
          {
            ...base.root.children[1],
            role: "speech-bubble" as const,
            fontSizePx: 12,
          },
        ],
      },
    };
    const audit = auditDesignSystemAndBubbleContrast(brokenDraft, []);
    expect(audit.consistencyIssuesKo.length).toBeGreaterThanOrEqual(3);
    expect(audit.overallScore).toBeLessThan(80);
  });

  it("14. Code·MCP 브리지가 원시 HEX 없는 CSS Flex/Grid, 유효 JSON, ToonStudio MCP 툴 체인을 내보낸다", () => {
    const draft = generateFirstDraftAutoLayout({ promptKo: "4컷 웹툰", mode: "webtoon-panel-grid" });
    const exported = exportAutoLayoutBridge(draft);

    expect(exported.cssCode).toContain("display: grid;");
    expect(exported.cssCode).toContain("var(--canvas)");
    expect(exported.cssCode).not.toMatch(/#[0-9a-fA-F]{3,6}\b/u);

    const parsedJson = JSON.parse(exported.jsonSchema) as { schemaVersion: string; root: { id: string } };
    expect(parsedJson.schemaVersion).toBe("toonstudio-autolayout-v1");
    expect(parsedJson.root.id).toBe("webtoon-grid-root");
    expect(exported.mcpToolChain.map((s) => s.toolName)).toContain("studio.canvas.create");
    expect(exported.mcpToolChain.map((s) => s.toolName)).toContain("studio.export.preflight_check");
  });

  it("15. 잘못된 OKLCH 문자열을 안전하게 null 처리하고 대비 계산 시 예외를 던지지 않는다", () => {
    expect(parseOklchString("invalid-color")).toBeNull();
    expect(parseOklchString("oklch(96% 0.01 90)")).toEqual({ l: 0.96, c: 0.01, h: 90 });
    expect(computeWcagContrastRatio("bad-input", "oklch(0.98 0.01 90)")).toBeGreaterThan(1);
  });
});

describe("Tooning AI & Plotr AI 클린룸 엔진", () => {
  it("16. 투닝 단계별 캐릭터 카테고리 생성·수정·순서 변경·권한 변경·리소스 갱신·태그 검색이 불변으로 동작한다", () => {
    let state = createInitialTooningRegistry();
    state = createCharacterCategory(state, { id: "cat-school-class", nameKo: "학교 수업반", authorType: "school-class" });
    state = updateCharacterCategory(state, "cat-school-class", {
      nameKo: "중등 웹툰반",
      enabledSteps: { face: true, expression: true, hair: true, outfit: true, pose: true, prop: false },
    });
    state = reorderCharacterCategories(state, ["cat-school-class", "cat-action-hero", "cat-school-lead", "cat-office-drama"]);
    state = updateCharacterAuthorType(state, "char-seoyeon", "school-class");
    state = updateCharacterResource(state, "char-seoyeon", {
      stepKey: "prop",
      stepValue: "빨간 다이어리",
      colorSetOklch: { accent: "oklch(0.62 0.2 22)" },
    });

    expect(state.categories[0].id).toBe("cat-school-class");
    expect(state.categories[0].nameKo).toBe("중등 웹툰반");
    expect(state.categories[0].order).toBe(0);
    const updatedLead = state.characters.find((c) => c.id === "char-seoyeon");
    expect(updatedLead?.authorType).toBe("school-class");
    expect(updatedLead?.stepData.prop).toBe("빨간 다이어리");
    expect(searchCharactersByTag(state, "우산")).toHaveLength(1);
  });

  it("17. 한국 웹툰 표정·포즈 카드가 정확히 20종이며 고유 ID와 연출 큐를 가진다", () => {
    expect(KWEBTOON_EXPRESSION_POSE_CARDS).toHaveLength(20);
    const uniqueIds = new Set(KWEBTOON_EXPRESSION_POSE_CARDS.map((card) => card.id));
    expect(uniqueIds.size).toBe(20);
    for (const card of KWEBTOON_EXPRESSION_POSE_CARDS) {
      expect(card.labelKo.length).toBeGreaterThan(2);
      expect(card.facialCueKo.length).toBeGreaterThan(4);
      expect(card.bodyCueKo.length).toBeGreaterThan(4);
    }
  });

  it("18. 한 문장 스토리로 4컷·8컷 웹툰을 생성하고 표정 카드 교체 및 드래그 순서 변경을 수행한다", () => {
    const fourCuts = generateTooningMagicPanels({ oneSentenceStoryKo: "비 오는 편의점 재회", cutCount: 4 });
    const eightCuts = generateTooningMagicPanels({ oneSentenceStoryKo: "비 오는 편의점 재회", cutCount: 8 });
    expect(fourCuts).toHaveLength(4);
    expect(eightCuts).toHaveLength(8);

    const swapped = swapExpressionPoseCard(fourCuts, "tooning-cut-1", "card-20-shadow-twist");
    expect(swapped[0].expressionPoseCardId).toBe("card-20-shadow-twist");

    const reordered = reorderTooningPanels(swapped, 0, 2);
    expect(reordered[2].panelId).toBe("tooning-cut-1");
    expect(reordered.map((p) => p.order)).toEqual([0, 1, 2, 3]);
  });

  it("19. 캐릭터 페르소나 대화 로그를 말풍선 컷으로 변환하고 긴 대사를 자동 분할한다", () => {
    const cuts = importPersonaChatLogToCuts(
      [
        "서연: 내가 오늘 왜 늦었냐면 집 앞에서 갑자기 폭우가 쏟아져서 우산을 다시 챙기느라 버스를 놓치고 말았어!!",
        "도진: 괜찮아? 감기 걸리겠다…",
      ].join("\n"),
    );

    expect(cuts.length).toBeGreaterThanOrEqual(3);
    expect(cuts[0].splitPart).toBe("1/2");
    expect(cuts[0].expressionPoseCardId).toBe("card-04-shock");
    expect(cuts[cuts.length - 1].speakerKo).toBe("도진");
    expect(cuts[cuts.length - 1].alignment).toBe("right");
  });

  it("20. Plotr 원문 파서가 웹소설 1화를 컷·텐션 곡선·3D 접지 블로킹(groundY=0)·영상 트랜지션으로 컴파일한다", () => {
    const plan = compilePlotrStoryboardFromScript(
      [
        "새벽 지하철 승강장에 차가운 바람이 스쳤다.",
        "\"정말 여기서 끝낼 거야?\" 도진이 목소리를 낮췄다.",
        "서연은 대답 대신 가방을 움켜쥐고 계단 위로 달려 올라갔다.",
        "그 순간 정면 전광판에 사라졌던 동생의 이름이 떠올랐다.",
      ].join("\n"),
      "새벽 승강장 1화",
    );

    expect(plan.cuts.length).toBeGreaterThanOrEqual(4);
    expect(plan.tensionCurve).toHaveLength(plan.cuts.length);
    expect(plan.cuts.every((cut) => cut.blocking3d.groundY === 0)).toBe(true);
    expect(plan.cuts[plan.cuts.length - 1].beatKind).toBe("cliffhanger");
    expect(plan.cuts[plan.cuts.length - 1].videoTransition.kind).toBe("zoom-push");
  });

  it("21. 6앵글 다각도 캐릭터 앵커 잠금이 정면·반측면·측면·후면·로우·하이 전 앵글 일관성을 검증한다", () => {
    const anchor = createCharacterIdentityAnchor({ characterId: "hero-1", nameKo: "한서연" });
    expect(IDENTITY_LOCK_ANGLES).toHaveLength(6);

    const perfectObservations = IDENTITY_LOCK_ANGLES.map((spec) => ({
      angle: spec.angle,
      observedFaceRatio: anchor.faceRatio,
      observedHairSilhouetteToken: anchor.hairSilhouetteToken,
      observedOutfitTokens: anchor.outfitTokens,
      observedPaletteOklch: anchor.paletteOklch,
    }));

    const report = verifySixAngleIdentityConsistency(anchor, perfectObservations);
    expect(report.allAnglesPassed).toBe(true);
    expect(report.overallConsistencyScore).toBe(100);
  });

  it("22. 6앵글 드리프트 감지기가 얼굴 비율·헤어 실루엣·누락 의상·OKLCH 색감 편차를 적발하고 교정 팁을 반환한다", () => {
    const anchor = createCharacterIdentityAnchor({ characterId: "hero-1", nameKo: "한서연" });
    const drifted = IDENTITY_LOCK_ANGLES.map((spec) => ({
      angle: spec.angle,
      observedFaceRatio:
        spec.angle === "low-angle"
          ? { eyeSpacingRatio: 0.6, jawRatio: 0.8, headToBodyRatio: 5.9 }
          : anchor.faceRatio,
      observedHairSilhouetteToken:
        spec.angle === "profile" ? "long-wavy-ponytail" : anchor.hairSilhouetteToken,
      observedOutfitTokens: spec.angle === "back" ? ["beige-trench"] : anchor.outfitTokens,
      observedPaletteOklch:
        spec.angle === "high-angle"
          ? { ...anchor.paletteOklch, hair: "oklch(0.75 0.2 120)" }
          : anchor.paletteOklch,
    }));

    const report = verifySixAngleIdentityConsistency(anchor, drifted);
    expect(report.allAnglesPassed).toBe(false);
    expect(report.overallConsistencyScore).toBeLessThan(90);

    const lowAngle = report.angleResults.find((item) => item.angle === "low-angle");
    const backAngle = report.angleResults.find((item) => item.angle === "back");
    expect(lowAngle?.passed).toBe(false);
    expect(lowAngle?.fixHintsKo[0]).toContain("비율");
    expect(backAngle?.passed).toBe(false);
    expect(backAngle?.fixHintsKo[0]).toContain("누락");
  });

  it("23. 자동 여백(Gutter) 계산기가 클리프행어 컷에 넓은 낙하 여백을, 대사 컷에 촘촘한 여백을 배정한다", () => {
    const plan = compilePlotrStoryboardFromScript(
      [
        "학교 옥상에 노을이 내렸다.",
        "\"오늘 꼭 할 말이 있어.\"",
        "그 순간 옥상 문 너머에서 뜻밖의 인물이 모습을 드러냈다.",
      ].join("\n"),
    );
    const layout = buildPlotrLayoutAndLineCleanupPlan(plan, "vertical-scroll");

    const dialogueBox = layout.panelBoxes[1];
    const endingBox = layout.panelBoxes[layout.panelBoxes.length - 1];
    expect(endingBox.gutterAfterPx).toBeGreaterThan(dialogueBox.gutterAfterPx);
    expect(endingBox.gutterAfterPx).toBeGreaterThanOrEqual(320);
  });

  it("24. 세로 스크롤 및 페이지 Z-동선 읽기 좌표와 비파괴 선화 정리 계획을 산출한다", () => {
    const plan = compilePlotrStoryboardFromScript(
      "첫 장면이 열렸다.\n\"안녕?\"\n갑자기 뛰기 시작했다.\n마지막 반전이 드러났다.",
    );
    const vertical = buildPlotrLayoutAndLineCleanupPlan(plan, "vertical-scroll");
    const zFlow = buildPlotrLayoutAndLineCleanupPlan(plan, "page-z-flow");

    expect(vertical.canvasWidthPx).toBe(800);
    expect(zFlow.canvasWidthPx).toBe(1480);
    expect(zFlow.panelBoxes[1].x).toBeGreaterThan(zFlow.panelBoxes[0].x);
    expect(zFlow.lineCleanup.nonDestructiveBackup).toBe(true);
    expect(zFlow.lineCleanup.closeGapPx).toBe(4);
  });
});

describe("StudioDesignStoryAi4SuitesPanel UI · 접근성 · 지연 마운트 통합", () => {
  it("25. 4대 한국어 탭과 접근성(tablist/min-h-11/tabular-nums/keep-all)을 렌더링하고 내부 코드를 노출하지 않는다", () => {
    const { container } = render(<StudioDesignStoryAi4SuitesPanel projectTitle="비 오는 날의 서약" />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringContaining("캔바 매직 디자인"),
      expect.stringContaining("피그마 AI 레이아웃"),
      expect.stringContaining("투닝 매직 컷툰"),
      expect.stringContaining("플로터 AI 콘티"),
    ]);

    for (const tab of tabs) {
      expect(tab.className).toContain("min-h-11");
    }
    const text = container.textContent ?? "";
    expect(text).not.toContain("ev_e2dac3e6");
    expect(text).not.toContain("eachStepTFControl");
    expect(container.querySelector(".tabular-nums")).not.toBeNull();
    expect(container.innerHTML).toContain("[word-break:keep-all]");
  });

  it("26. 캔바 탭에서 6종 규격 자동 변환과 ₩0 홍보 카피 생성이 동작한다", async () => {
    render(<StudioDesignStoryAi4SuitesPanel projectTitle="달빛 우산" />);

    fireEvent.click(screen.getByRole("button", { name: /원클릭 6종 규격 자동 변환/u }));
    const grid = screen.getByTestId("canva-magic-switch-grid");
    expect(grid.textContent).toContain("네이버 세로");
    expect(grid.textContent).toContain("단행본 B5");

    fireEvent.click(screen.getByRole("button", { name: /₩0 홍보 카피 만들기/u }));
    await waitFor(() => {
      expect(screen.getByTestId("canva-magic-write-result")).toBeTruthy();
    });
    expect(screen.getByTestId("canva-magic-write-result").textContent).toContain("비용 ₩0");
  });

  it("홍보 초안은 이 기기에서 만들고 무료 클라우드를 직접 고를 때만 서버에 보낸다", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        provider: "github-models-free",
        providerTier: "cloud-free",
        model: "openai/gpt-4o-mini",
        privacy: { piiRedactedCount: 0 },
        result: {
          mode: "thumbnail-hook-optimizer",
          data: {
            hookDiagnosis: "합성 클라우드 홍보 제목",
            titleVariants: [
              { variantLabel: "첫 만남", title: "우산을 건넨 날", subCopy: "첫 장면", hookReason: "만남" },
              { variantLabel: "반전", title: "닫히지 않은 우산", subCopy: "둘의 사연", hookReason: "호기심" },
            ],
            thumbnailSpec: {
              focalSubject: "노란 우산", contrastNote: "배경을 어둡게",
              textOverlayMaxChars: 12, cropSafetyTip: "우산을 가운데 배치",
            },
          },
        },
      }))
      .mockResolvedValueOnce(Response.json({ code: "quota_exceeded" }, { status: 429 }));

    render(<StudioDesignStoryAi4SuitesPanel projectTitle="달빛 우산" fetchImpl={fetchImpl} />);
    fireEvent.change(screen.getByLabelText("한 줄로 원하는 디자인 설명하기"), {
      target: { value: "합성 홍보 문구 editor@example.com" },
    });

    const result = () => screen.getByTestId("canva-magic-write-result").textContent;
    fireEvent.click(screen.getByRole("button", { name: /₩0 홍보 카피 만들기/u }));
    await waitFor(() => expect(screen.getByTestId("canva-magic-write-result")).toBeTruthy());
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result()).toContain("이 기기에서 생성");

    const cloud = screen.getByRole("button", { name: "무료 클라우드로 초안 만들기" });
    const disclosure = cloud.getAttribute("aria-describedby");
    expect(disclosure).toBeTruthy();
    expect(document.getElementById(disclosure ?? "")?.textContent)
      .toContain("문구, 작품 제목, 브랜드 말투를 서버에 보냅니다");
    fireEvent.click(cloud);
    await waitFor(() => expect(result()).toContain("합성 클라우드 홍보 제목"));
    expect(result()).toContain("무료 클라우드에서 생성");
    expect(result()).toContain("우산을 건넨 날");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/studio/ai/creative-assist");
    expect(JSON.parse(String(request?.body))).toMatchObject({
      mode: "thumbnail-hook-optimizer",
      inputText: expect.stringContaining("합성 홍보 문구"),
      projectTitle: "달빛 우산",
      genreOrTone: "따뜻하고 섬세한 감성",
      allowZeroBillCascade: true,
    });
    expect(String(request?.body)).not.toContain("editor@example.com");

    fireEvent.click(screen.getByRole("button", { name: "무료 클라우드로 초안 만들기" }));
    await waitFor(() => expect(result()).toContain("이 기기에서 생성"));
    expect(result()).toContain("클라우드 무료 한도 보호");
    expect(result()).toContain("비용 ₩0");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("27. 피그마 탭에서 레이어 표준 정리와 4.5:1 말풍선 대비 자동 보정이 동작한다", () => {
    render(<StudioDesignStoryAi4SuitesPanel />);

    fireEvent.click(screen.getByRole("tab", { name: /피그마 AI 레이아웃/u }));
    expect(screen.getByText(/01_캐릭터_선화_01/u)).toBeTruthy();
    expect(screen.getAllByText(/보정 필요/u).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: /부족한 대비 자동 보정/u }));
    expect(screen.queryByText(/보정 필요/u)).toBeNull();
  });

  it("28. 투닝 탭에서 8컷 생성과 20종 표정 카드 교체가 즉시 반영된다", () => {
    render(<StudioDesignStoryAi4SuitesPanel />);

    fireEvent.click(screen.getByRole("tab", { name: /투닝 매직 컷툰/u }));
    fireEvent.click(screen.getByRole("button", { name: "8컷 만들기" }));
    expect(screen.getByRole("button", { name: /8컷 · 결/u })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "반전 그림자 눈빛" }));
    expect(screen.getAllByText(/표정·포즈: 반전 그림자 눈빛/u).length).toBeGreaterThanOrEqual(1);
  });

  it("29. 플로터 탭에서 페이지 Z-동선 전환과 6앵글 작화 흔들림 감지 토글이 동작한다", () => {
    render(<StudioDesignStoryAi4SuitesPanel />);

    fireEvent.click(screen.getByRole("tab", { name: /플로터 AI 콘티/u }));
    const zFlowBtn = screen.getByRole("button", { name: "페이지 Z-동선" });
    fireEvent.click(zFlowBtn);
    expect(zFlowBtn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /작화 흔들림 감지 테스트/u }));
    expect(screen.getByText(/정상 앵커 상태로 복구/u)).toBeTruthy();
  });

  it("30. StudioFreeAiAssistWorkbench가 초기에는 4대 스튜디오 랩을 마운트하지 않고 클릭 시 지연 마운트한다", async () => {
    const offlineFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    render(<StudioFreeAiAssistWorkbench projectTitle="테스트 작품" fetchImpl={offlineFetch} />);

    expect(screen.queryByTestId("studio-design-story-4suites-panel")).toBeNull();
    const toggle = screen.getByRole("button", { name: /4대 스튜디오 랩 열기/u });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByTestId("studio-design-story-4suites-panel")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /4대 스튜디오 랩 접기/u }).getAttribute("aria-expanded")).toBe("true");
  });
});
