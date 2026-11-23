// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioProductionGoodsPanel } from "./StudioProductionGoodsPanel";
import {
  DEFAULT_BARRIER_FREE_EPISODE_INPUT,
  GOODS_PRODUCT_SPECS,
  buildBarrierFreeEpisodeScript,
  generateGoodsPrintDieCutPackage,
  mmToPixels,
  type GoodsProductKind,
} from "./barrierfree-and-goods-diecut";
import {
  DEFAULT_CHARACTER_REFERENCE_LIBRARY,
  DEFAULT_CUT_REFERENCE_CONTEXTS,
  DEFAULT_TRAJECTORY_STROKES,
  PRODUCTION_STAGES,
  analyzeDeadlineWarRoom,
  autoAssignBottleneckCuts,
  createDefaultSixtyCutWarRoomInput,
  generateActionTrajectoryVfx,
  resolveCutCharacterReferenceDock,
  type ActionTrajectoryVfxKind,
} from "./reference-dock-action-fx-warroom";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;

describe("webtoon-production-goods: 현업 제작 도크 · 액션 VFX · 60컷 워룸 · WCAG AAA 배리어프리 · 굿즈 칼선", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("컷 등장인물 ID·태그·대사 언급으로 턴어라운드 3슬롯·6표정·OKLCH 스와치를 자동 추종한다", () => {
    const cut14 = resolveCutCharacterReferenceDock(DEFAULT_CUT_REFERENCE_CONTEXTS[0]);
    expect(cut14.matchedCharacters).toHaveLength(2);
    expect(cut14.primaryCharacter?.character.id).toBe("char-seoyeon");
    expect(cut14.primaryCharacter?.matchReason).toBe("id-match");
    expect(cut14.primaryCharacter?.recommendedExpressionId).toBe("angry");
    expect(cut14.primaryCharacter?.turnarounds.map((t) => t.angle)).toEqual(["front", "side", "back"]);
    expect(cut14.primaryCharacter?.expressions).toHaveLength(6);

    // 야간 조명 무드에서 OKLCH 스와치가 결정론적으로 보정되고 원시 색상이 0건이다
    const daylightCut = resolveCutCharacterReferenceDock({
      ...DEFAULT_CUT_REFERENCE_CONTEXTS[0],
      lightingMood: "daylight",
    });
    const nightSkin = cut14.primaryCharacter?.swatches.find((s) => s.role === "skin-base");
    const daySkin = daylightCut.primaryCharacter?.swatches.find((s) => s.role === "skin-base");
    expect(nightSkin?.oklch).toBe(daySkin?.oklch);
    expect(nightSkin?.lightingAdjustedOklch).not.toBe(daySkin?.lightingAdjustedOklch);
    for (const sw of cut14.primaryCharacter?.swatches ?? []) {
      expect(sw.oklch.startsWith("oklch(")).toBe(true);
      expect(sw.lightingAdjustedOklch.startsWith("oklch(")).toBe(true);
      expect(RAW_COLOR_REGEX.test(sw.oklch)).toBe(false);
      expect(RAW_COLOR_REGEX.test(sw.lightingAdjustedOklch)).toBe(false);
    }

    // 태그 + 대사 언급 + 미등록 ID 처리 검증
    const mixedCut = resolveCutCharacterReferenceDock({
      cutId: "CUT-99",
      cutNumber: 99,
      sceneTitleKo: "우천 대치",
      sceneTitleEn: "Rain Standoff",
      characterIds: ["char-unknown-999"],
      tags: ["윤하린", "눈물"],
      dialogueOrMemo: "한도윤이 멀리서 신호탄을 쏘아 올린다.",
      lightingMood: "sunset",
    });
    expect(mixedCut.unmatchedIds).toEqual(["char-unknown-999"]);
    expect(mixedCut.matchedCharacters.map((c) => c.character.id)).toEqual(["char-harin", "char-doyun"]);
    expect(mixedCut.matchedCharacters[0].matchReason).toBe("tag-match");
    expect(mixedCut.matchedCharacters[1].matchReason).toBe("script-mention");
    expect(mixedCut.matchedCharacters[0].recommendedExpressionId).toBe("tearful");
    expect(DEFAULT_CHARACTER_REFERENCE_LIBRARY).toHaveLength(3);
  });

  it("4종 액션·판타지 물리 궤적(검기·불꽃·물보라·타격 파편)을 결정론적 SVG·폴리곤으로 생성한다", () => {
    const kinds: readonly ActionTrajectoryVfxKind[] = [
      "sword-arc",
      "flame-ribbon",
      "water-splash",
      "impact-shatter",
    ];

    for (const kind of kinds) {
      const a = generateActionTrajectoryVfx({
        kind,
        points: DEFAULT_TRAJECTORY_STROKES[0].points,
        baseWidthPx: 34,
        perspectiveTaper: 0.78,
        intensity: 1.2,
        seed: 42,
      });
      const b = generateActionTrajectoryVfx({
        kind,
        points: DEFAULT_TRAJECTORY_STROKES[0].points,
        baseWidthPx: 34,
        perspectiveTaper: 0.78,
        intensity: 1.2,
        seed: 42,
      });

      // 동일 시드·입력 결정론성
      expect(a.svg).toBe(b.svg);
      expect(a.metrics).toEqual(b.metrics);
      expect(a.metrics.arcLengthPx).toBeGreaterThan(200);
      expect(a.metrics.peakWidthPx).toBeGreaterThan(a.metrics.minWidthPx);
      expect(a.primaryPolygons.length).toBeGreaterThanOrEqual(kind === "impact-shatter" ? 2 : 1);
      expect(a.corePolygons.length).toBeGreaterThanOrEqual(1);
      expect(a.debrisPolygons.length).toBeGreaterThanOrEqual(5);
      expect(a.speedLines.length).toBeGreaterThanOrEqual(6);
      expect(a.svg).toContain(`data-vfx-kind="${kind}"`);
      expect(a.svg).toContain(`<g id="vfx-speedlines">`);
      expect(a.svg).toContain(`<g id="vfx-debris-shards">`);
      expect(RAW_COLOR_REGEX.test(a.svg)).toBe(false);
      expect(a.svg).not.toContain("NaN");
    }

    // 1포인트·비정상 좌표 방어 검증
    const degenerate = generateActionTrajectoryVfx({
      kind: "sword-arc",
      points: [{ x: Number.NaN, y: 10 }, { x: 100, y: 100 }],
      seed: Number.NaN,
    });
    expect(degenerate.metrics.arcLengthPx).toBeGreaterThan(100);
    expect(degenerate.svg).not.toContain("NaN");
    expect(degenerate.svg).not.toContain("Infinity");
  });

  it("60컷 5공정 마감 워룸에서 병목 공정·지연 컷을 탐지하고 어시스턴트 부하를 균등 재배분한다", () => {
    const input = createDefaultSixtyCutWarRoomInput();
    expect(input.cuts).toHaveLength(60);

    const analysis = analyzeDeadlineWarRoom(input);
    expect(analysis.totalCuts).toBe(60);
    expect(analysis.stageSummaries).toHaveLength(PRODUCTION_STAGES.length);
    expect(analysis.overallProgressPct).toBeGreaterThan(50);
    expect(analysis.overallProgressPct).toBeLessThan(100);
    expect(analysis.primaryBottleneckStage).not.toBeNull();
    expect(["shading", "background"]).toContain(analysis.primaryBottleneckStage?.stageId);
    expect(analysis.delayedCuts.length).toBeGreaterThan(10);

    // 마감 잔여 시간 변화에 따른 위험도 전이 검증
    const tightDeadline = analyzeDeadlineWarRoom({ ...input, hoursUntilDeadline: 4 });
    const relaxedDeadline = analyzeDeadlineWarRoom({ ...input, hoursUntilDeadline: 48 });
    expect(tightDeadline.deadlineRisk).toBe("critical");
    expect(["safe", "tight"]).toContain(relaxedDeadline.deadlineRisk);

    // 어시스턴트 원클릭 재배분 검증 (비파괴 갱신 + 가동률 균등화)
    const plan = autoAssignBottleneckCuts(input);
    expect(plan.assignments.length).toBeGreaterThan(50);
    expect(plan.updatedCuts).toHaveLength(60);
    expect(plan.updatedCuts).not.toBe(input.cuts);
    expect(plan.unassignedOverflowTasks).toHaveLength(0);
    expect(plan.loadBalanceSpreadPct).toBeLessThanOrEqual(20);
    for (const load of plan.assistantLoads) {
      expect(load.assignedHours).toBeLessThanOrEqual(load.availableHours + 0.05);
      expect(load.assignedTaskCount).toBeGreaterThan(0);
    }

    // 가용 시간이 부족하면 숨기지 않고 초과 미배정 작업을 정확히 보고한다
    const understaffed = autoAssignBottleneckCuts({
      ...input,
      assistants: [{ id: "solo", nameKo: "단독 어시", nameEn: "Solo", specialties: ["shading"], availableHours: 2 }],
    });
    expect(understaffed.unassignedOverflowTasks.length).toBeGreaterThan(0);
  });

  it("배리어프리(WCAG 2.2 AAA) 자동 Alt-Text · WebVTT · 점자 · 한영 대본 및 JSON을 규격에 맞게 출고한다", () => {
    const pkg = buildBarrierFreeEpisodeScript(DEFAULT_BARRIER_FREE_EPISODE_INPUT);
    expect(pkg.schemaVersion).toBe("toonstudio.barrier-free-episode.v1");
    expect(pkg.wcagConformance).toBe("WCAG-2.2-AAA");
    expect(pkg.audit.passed).toBe(true);
    expect(pkg.audit.conformanceLevel).toBe("AAA");
    expect(pkg.cuts).toHaveLength(4);

    // 단조 비겹침 WebVTT 타임코드 및 음성 태그 검증
    expect(pkg.webVttKo.startsWith("WEBVTT\n")).toBe(true);
    expect(pkg.webVttEn.startsWith("WEBVTT\n")).toBe(true);
    expect(pkg.webVttKo).toContain("-->");
    expect(pkg.webVttKo).toContain("<v 해설>");
    expect(pkg.webVttKo).toContain("<v 강서연>");
    expect(pkg.webVttEn).toContain("<v Narrator>");
    for (let i = 0; i < pkg.cuts.length; i += 1) {
      const cut = pkg.cuts[i];
      expect(cut.endSec).toBeGreaterThan(cut.startSec);
      expect(cut.startTimestamp).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
      if (i > 0) expect(cut.startSec).toBeGreaterThanOrEqual(pkg.cuts[i - 1].endSec);
    }

    // 섬광 액션 컷(CUT-03)에 WCAG 2.3.2 감각 주의 문구 포함
    expect(pkg.cuts[2].sensoryAdvisoryKo).toContain("WCAG 2.3.2");
    expect(pkg.cuts[2].sensoryAdvisoryEn).toContain("WCAG 2.3.2");

    // 점자 포맷 및 JSON 파싱 무결성
    expect(pkg.brailleTextKo).toContain("[컷 01]");
    expect(pkg.brailleTextKo).toContain("[효과음]");
    expect(pkg.structuredScriptKo).toContain("# 배리어프리 오디오 디스크립션 대본");
    expect(pkg.structuredScriptEn).toContain("# Barrier-Free Audio Description Script");
    const parsed = JSON.parse(pkg.screenReaderJson) as { wcagConformance: string; cuts: unknown[] };
    expect(parsed.wcagConformance).toBe("WCAG-2.2-AAA");
    expect(parsed.cuts).toHaveLength(4);
  });

  it("4종 굿즈의 2.0mm 칼선(300DPI=24px) · CutContour 스팟컬러 · 키링 3mm 타공 · 0.15mm 화이트 트랩 · 도련을 검증한다", () => {
    expect(mmToPixels(2.0, 300)).toBe(24);
    const kinds: readonly GoodsProductKind[] = ["acrylic-stand", "photocard", "keyring", "sticker"];

    for (const kind of kinds) {
      const pkg = generateGoodsPrintDieCutPackage({
        kind,
        title: `은월의 기록 ${GOODS_PRODUCT_SPECS[kind].labelKo}`,
        dpi: 300,
        dieCutOffsetMm: 2.0,
        whiteTrapShrinkMm: 0.15,
      });

      expect(pkg.validation.passed).toBe(true);
      expect(pkg.dieCutOffsetMm).toBe(2.0);
      expect(pkg.dieCutOffsetPx).toBe(24);
      expect(pkg.whiteTrapShrinkMm).toBe(0.15);
      // 외곽 칼선 면적 > 아트워크 실루엣 면적 > 화이트 백킹 트랩 축소 면적
      expect(pkg.dieCutAreaMm2).toBeGreaterThan(pkg.artworkAreaMm2);
      expect(pkg.whiteBackingAreaMm2).toBeLessThan(pkg.artworkAreaMm2);
      expect(pkg.whiteBackingAreaMm2).toBeGreaterThan(0);

      expect(pkg.cmykSeparationSummary.cutContourSpotName).toBe("CutContour");
      expect(pkg.cmykSeparationSummary.cutContourCmyk).toBe("C0 M100 Y0 K0");
      expect(pkg.cmykSeparationSummary.whiteBackingSpotName).toBe("SpotWhite");
      expect(pkg.svg).toContain(`id="CutContour"`);
      expect(pkg.svg).toContain(`data-spot-color="CutContour"`);
      expect(pkg.svg).toContain(`data-cmyk="0,100,0,0"`);
      expect(pkg.svg).toContain(`id="SpotWhite"`);
      expect(pkg.svg).toContain(`data-trap-shrink-mm="0.15"`);
      expect(RAW_COLOR_REGEX.test(pkg.svg)).toBe(false);

      if (kind === "keyring") {
        expect(pkg.keyringHole?.diameterMm).toBe(3.0);
        expect(pkg.svg).toContain(`id="KeyringPunchHole"`);
        expect(pkg.svg).toContain(`data-hole-diameter-mm="3"`);
      } else if (kind === "acrylic-stand") {
        expect(pkg.svg).toContain(`id="AcrylicBasePeg"`);
        expect(pkg.keyringHole).toBeNull();
      }
    }

    // 알파 마스크 실루엣 추출 + 도련/DPI 규격 미달 감지 검증
    const maskW = 16;
    const maskH = 16;
    const pixels = new Uint8Array(maskW * maskH);
    for (let y = 3; y <= 12; y += 1) {
      for (let x = 4; x <= 11; x += 1) pixels[y * maskW + x] = 255;
    }
    const maskPkg = generateGoodsPrintDieCutPackage({
      kind: "sticker",
      title: "알파 마스크 테스트",
      alphaMask: { width: maskW, height: maskH, pixels },
      dpi: 150,
      bleedMm: 0.5,
    });
    expect(maskPkg.artworkPolygonMm.length).toBeGreaterThanOrEqual(4);
    expect(maskPkg.validation.passed).toBe(false);
    expect(maskPkg.validation.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("StudioProductionGoodsPanel 3탭 전환·상호작용·다운로드·KO/EN·Calm Atelier 토큰 위생을 전수 검증한다", () => {
    const createObjectUrlSpy = vi.fn(() => "blob:production-goods-url");
    const revokeObjectUrlSpy = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectUrlSpy, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectUrlSpy, configurable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    // 모든 props optional 렌더링 검증
    const { container, unmount } = render(<StudioProductionGoodsPanel />);
    expect(screen.getByText("현업 연재 제작 · 굿즈 자동 출고 스튜디오")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "캐릭터 레퍼런스 · 액션 이펙트" }).getAttribute("aria-selected")).toBe("true");
    expect(container.innerHTML).toContain("[word-break:keep-all]");
    expect(container.innerHTML).toContain("tabular-nums");
    expect(container.innerHTML).not.toContain("transition-all");

    // Tab 1: 컷 전환 -> 캐릭터 자동 추종 & VFX 전환 + SVG 다운로드
    fireEvent.click(screen.getByRole("button", { name: /CUT #29/ }));
    expect(screen.getByText(/한도윤 · 조력자/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "불꽃 화염띠" }));
    expect(screen.getByRole("button", { name: "불꽃 화염띠" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "VFX SVG 저장" }));
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:production-goods-url");

    // Tab 2: 60컷 연재 마감 워룸 -> 원클릭 재배분
    fireEvent.click(screen.getByRole("tab", { name: "연재 마감 워룸" }));
    expect(screen.getByText(/전체 60컷 공정률/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "어시스턴트 병목 원클릭 재배분" }));
    expect(screen.getByRole("status").textContent).toContain("재배분했습니다");
    expect(screen.getByText(/김민아/)).toBeTruthy();

    // Tab 3: 배리어프리 포맷 전환 + 굿즈 키링 전환 + 출고 다운로드
    fireEvent.click(screen.getByRole("tab", { name: "배리어프리 · 굿즈 칼선/화이트잉크" }));
    fireEvent.click(screen.getByRole("button", { name: "WebVTT" }));
    expect(screen.getByText(/WEBVTT/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "점자 텍스트" }));
    expect(screen.getByText(/\[컷 01\]/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "아크릴 키링" }));
    expect(screen.getByText(/키링 3.0mm 타공 홀/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "CutContour SVG 출고" }));
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(2);
    unmount();

    // EN 모드 전 탭 렌더링 검증
    useI18n.setState({ lang: "en" });
    const enView = render(<StudioProductionGoodsPanel initialGoodsKind="keyring" />);
    expect(screen.getByText("Pro Serialization & Goods Print Studio")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Deadline War-Room" }));
    expect(screen.getByText(/60 cuts at/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Barrier-Free & Goods Die-Cut" }));
    expect(screen.getByText(/1-Click Fandom Goods CutContour/)).toBeTruthy();
    expect(enView.container.innerHTML).not.toContain("transition-all");
    enView.unmount();

    // 소스 파일 정적 위생 검증 (배럴 index.ts 금지 · raw hex/rgb/hsl 0건 · localStorage 0건 · transition-all 0건)
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/webtoon-production-goods");
    expect(fs.existsSync(path.join(dir, "index.ts"))).toBe(false);
    for (const file of [
      "reference-dock-action-fx-warroom.ts",
      "barrierfree-and-goods-diecut.ts",
      "StudioProductionGoodsPanel.tsx",
    ]) {
      const src = fs.readFileSync(path.join(dir, file), "utf8");
      expect(RAW_COLOR_REGEX.test(src), `${file} must not contain raw hex/rgb/hsl`).toBe(false);
      expect(src.includes("transition-all"), `${file} must not contain transition-all`).toBe(false);
      expect(/\blocalStorage\b/.test(src), `${file} must not reference localStorage`).toBe(false);
    }
  });
});
