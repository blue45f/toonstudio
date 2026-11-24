// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  analyzeEpisodeContinuity,
  applyAllContinuityFixes,
  applyContinuityFix,
  computeCiede2000,
  computeOklchDeltaE00,
  createDemo60CutEpisode,
  shortestAngularDiffDeg,
  StudioWebtoonContinuityGuardPanel,
  type CharacterCutSnapshot,
  type CutSceneTag,
  type OklchColor,
  type WebtoonCutSnapshot,
  type WebtoonEpisodeTimeline,
} from "./index";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

const BASE_OUTFIT: OklchColor = { l: 0.48, c: 0.11, h: 245 };
const BASE_HAIR: OklchColor = { l: 0.26, c: 0.03, h: 260 };

function makeCut(
  cutNumber: number,
  overrides: Partial<WebtoonCutSnapshot> & {
    readonly characters?: readonly CharacterCutSnapshot[];
  } = {},
): WebtoonCutSnapshot {
  return {
    cutNumber,
    sceneId: overrides.sceneId ?? "scene-a",
    sceneNameKo: overrides.sceneNameKo ?? "씬 A",
    sceneNameEn: overrides.sceneNameEn ?? "Scene A",
    sceneTags: overrides.sceneTags ?? (["day"] as readonly CutSceneTag[]),
    keyLight: overrides.keyLight ?? { azimuthDeg: 40, elevationDeg: 35 },
    characters: overrides.characters ?? [
      {
        characterId: "hero",
        nameKo: "주인공",
        nameEn: "Hero",
        outfitColor: { ...BASE_OUTFIT },
        hairColor: { ...BASE_HAIR },
        props: [
          { id: "p-glasses", kind: "glasses", labelKo: "안경", labelEn: "Glasses", side: "center" },
          { id: "p-scar", kind: "scar", labelKo: "흉터", labelEn: "Scar", side: "left" },
          { id: "p-watch", kind: "watch", labelKo: "시계", labelEn: "Watch", side: "left" },
        ],
        asymmetricTraits: { hairPartSide: "left", hatTiltSide: "right" },
      },
    ],
    intentionalPropEvents: overrides.intentionalPropEvents,
  };
}

function makeEpisode(cuts: readonly WebtoonCutSnapshot[]): WebtoonEpisodeTimeline {
  return {
    episodeId: "test-ep",
    titleKo: "테스트 에피소드",
    titleEn: "Test Episode",
    cuts,
  };
}

describe("OKLCH · CIEDE2000 ΔE00 및 원형 방위각 계산 정확도", () => {
  it("Sharma et al. (2005) 표준 CIEDE2000 벤치마크 쌍을 정밀하게 일치시킨다", () => {
    expect(
      computeCiede2000({ l: 50.0, a: 2.6772, b: -79.7751 }, { l: 50.0, a: 0.0, b: -82.7485 }),
    ).toBeCloseTo(2.0425, 3);
    expect(
      computeCiede2000({ l: 50.0, a: 3.1571, b: -77.2803 }, { l: 50.0, a: 0.0, b: -82.7485 }),
    ).toBeCloseTo(2.8615, 3);
    expect(
      computeCiede2000({ l: 50.0, a: 2.5, b: 0.0 }, { l: 73.0, a: 25.0, b: -18.0 }),
    ).toBeCloseTo(27.1492, 3);
  });

  it("동일 OKLCH 색차는 0이며, 원형 방위각 최단 차이는 360° 경계를 정확히 래핑한다", () => {
    expect(computeOklchDeltaE00(BASE_OUTFIT, { ...BASE_OUTFIT })).toBeCloseTo(0, 6);
    expect(computeOklchDeltaE00(BASE_OUTFIT, { l: 0.68, c: 0.18, h: 40 })).toBeGreaterThan(20);
    expect(shortestAngularDiffDeg(350, 10)).toBeCloseTo(20, 6);
    expect(shortestAngularDiffDeg(315, 60)).toBeCloseTo(105, 6);
    expect(shortestAngularDiffDeg(-30, 30)).toBeCloseTo(60, 6);
  });
});

describe("① 소품 증발 / 돌연 출현 적발 및 자동 교정", () => {
  it("같은 씬 내 소품(안경·베레모·귀걸이·시계·상처·가방) 증발 및 돌연 출현을 적발하고 의도된 이벤트는 허용한다", () => {
    const cut1 = makeCut(1, {
      characters: [
        {
          characterId: "c1",
          nameKo: "서진",
          nameEn: "Seojin",
          outfitColor: BASE_OUTFIT,
          hairColor: BASE_HAIR,
          props: [
            { id: "g1", kind: "glasses", labelKo: "안경", labelEn: "Glasses", side: "center" },
            { id: "b1", kind: "beret", labelKo: "베레모", labelEn: "Beret", side: "right" },
            { id: "e1", kind: "earrings", labelKo: "귀걸이", labelEn: "Earrings", side: "both" },
          ],
        },
      ],
    });
    // Cut 2: 안경 증발 + 가방 돌연 출현 (귀걸이는 의도적 제거 이벤트로 허용)
    const cut2 = makeCut(2, {
      characters: [
        {
          characterId: "c1",
          nameKo: "서진",
          nameEn: "Seojin",
          outfitColor: BASE_OUTFIT,
          hairColor: BASE_HAIR,
          props: [
            { id: "b1", kind: "beret", labelKo: "베레모", labelEn: "Beret", side: "right" },
            { id: "bag1", kind: "bag", labelKo: "가방", labelEn: "Bag", side: "right" },
          ],
        },
      ],
      intentionalPropEvents: [{ characterId: "c1", propKind: "earrings", action: "removed" }],
    });

    const ep = makeEpisode([cut1, cut2]);
    const report = analyzeEpisodeContinuity(ep);
    expect(report.countsByCategory["prop-continuity"]).toBe(2);
    expect(report.issues.map((i) => i.subtype).sort()).toEqual([
      "prop-sudden-appearance",
      "prop-vanished",
    ]);

    // 원클릭 일괄 교정 적용 시 안경 복원·가방 제거되어 오류 0건 달성
    const fixed = applyAllContinuityFixes(ep);
    expect(fixed.remainingIssueCount).toBe(0);
    const fixedProps = fixed.episode.cuts[1]?.characters[0]?.props.map((p) => p.kind).sort();
    expect(fixedProps).toEqual(["beret", "glasses"]);
  });

  it("영구 표식(상처·흉터)은 씬이 바뀌어도 회상 씬이 아니면 누락을 적발한다", () => {
    const cut1 = makeCut(1, { sceneId: "scene-1" });
    const cut2 = makeCut(2, {
      sceneId: "scene-2",
      sceneTags: ["day"],
      characters: [
        {
          ...cut1.characters[0]!,
          props: cut1.characters[0]!.props.filter((p) => p.kind !== "scar"),
        },
      ],
    });
    const report = analyzeEpisodeContinuity(makeEpisode([cut1, cut2]));
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]?.subtype).toBe("prop-vanished");
    expect(report.issues[0]?.severity).toBe("critical");
  });
});

describe("② 좌우 반전 오류 (흉터·가르마·모자 기울기·손목시계)", () => {
  it("4종 비대칭 요소 좌↔우 뒤집힘을 모두 적발하고 거울 반사 씬은 예외 처리한다", () => {
    const cut1 = makeCut(1);
    // Cut 2: 거울 반사 씬 -> 좌우 반전 예외 처리되어야 함
    const cut2Mirror = makeCut(2, {
      sceneTags: ["indoor", "mirror-reflection"],
      characters: [
        {
          ...cut1.characters[0]!,
          props: [
            { id: "p-glasses", kind: "glasses", labelKo: "안경", labelEn: "Glasses", side: "center" },
            { id: "p-scar", kind: "scar", labelKo: "흉터", labelEn: "Scar", side: "right" },
            { id: "p-watch", kind: "watch", labelKo: "시계", labelEn: "Watch", side: "right" },
          ],
          asymmetricTraits: { hairPartSide: "right", hatTiltSide: "left" },
        },
      ],
    });
    // Cut 3: 일반 컷인데 흉터·시계·가르마·모자 기울기 모두 반전된 상태
    const cut3Flipped = makeCut(3, {
      sceneTags: ["indoor"],
      characters: [
        {
          ...cut1.characters[0]!,
          props: [
            { id: "p-glasses", kind: "glasses", labelKo: "안경", labelEn: "Glasses", side: "center" },
            { id: "p-scar", kind: "scar", labelKo: "흉터", labelEn: "Scar", side: "right" },
            { id: "p-watch", kind: "watch", labelKo: "시계", labelEn: "Watch", side: "right" },
          ],
          asymmetricTraits: { hairPartSide: "right", hatTiltSide: "left" },
        },
      ],
    });

    const ep = makeEpisode([cut1, cut2Mirror, cut3Flipped]);
    const report = analyzeEpisodeContinuity(ep);
    expect(report.issuesByCut[2]).toBeUndefined();
    expect(report.countsByCategory["left-right-flip"]).toBe(4);
    expect(report.issues.map((i) => i.subtype).sort()).toEqual([
      "hair-part-flip",
      "hat-tilt-flip",
      "scar-flip",
      "watch-flip",
    ]);

    const fixed = applyAllContinuityFixes(ep);
    expect(fixed.remainingIssueCount).toBe(0);
    const fixedHero = fixed.episode.cuts[2]?.characters[0];
    expect(fixedHero?.asymmetricTraits).toEqual({ hairPartSide: "left", hatTiltSide: "right" });
    expect(fixedHero?.props.find((p) => p.kind === "scar")?.side).toBe("left");
    expect(fixedHero?.props.find((p) => p.kind === "watch")?.side).toBe("left");
  });
});

describe("③ 의상·헤어 OKLCH ΔE00 색감 급변 및 야간/회상 예외", () => {
  it("일반 씬의 의상/헤어 색감 급변은 적발하되, 야간·회상 씬 및 복귀 컷은 오탐 없이 예외 처리한다", () => {
    const cut1Day = makeCut(1, { sceneId: "s1", sceneTags: ["day"] });
    const cut2Night = makeCut(2, {
      sceneId: "s2",
      sceneTags: ["night"],
      characters: [
        {
          ...cut1Day.characters[0]!,
          outfitColor: { l: 0.2, c: 0.06, h: 270 },
          hairColor: { l: 0.12, c: 0.02, h: 275 },
        },
      ],
    });
    const cut3Flashback = makeCut(3, {
      sceneId: "s3",
      sceneTags: ["flashback"],
      characters: [
        {
          ...cut1Day.characters[0]!,
          outfitColor: { l: 0.72, c: 0.05, h: 80 },
          hairColor: { l: 0.5, c: 0.05, h: 75 },
        },
      ],
    });
    // Cut 4: 주간 복귀 (원래 팔레트 -> 오탐 0건이어야 함)
    const cut4DayClean = makeCut(4, { sceneId: "s4", sceneTags: ["day"] });
    // Cut 5: 주간인데 의상/헤어가 급변 -> 2건 적발되어야 함
    const cut5Drift = makeCut(5, {
      sceneId: "s4",
      sceneTags: ["day"],
      characters: [
        {
          ...cut1Day.characters[0]!,
          outfitColor: { l: 0.68, c: 0.17, h: 145 },
          hairColor: { l: 0.58, c: 0.16, h: 32 },
        },
      ],
    });

    const ep = makeEpisode([cut1Day, cut2Night, cut3Flashback, cut4DayClean, cut5Drift]);
    const report = analyzeEpisodeContinuity(ep);
    expect(report.exemptedColorTransitions).toHaveLength(2);
    expect(report.issuesByCut[2]).toBeUndefined();
    expect(report.issuesByCut[3]).toBeUndefined();
    expect(report.issuesByCut[4]).toBeUndefined();
    expect(report.countsByCategory["color-shift"]).toBe(2);
    expect(report.issues.every((i) => i.cutNumber === 5)).toBe(true);
    expect(report.issues.every((i) => (i.metrics.deltaE00 ?? 0) > 15)).toBe(true);

    const fixed = applyAllContinuityFixes(ep);
    expect(fixed.remainingIssueCount).toBe(0);
    const restoredHero = fixed.episode.cuts[4]?.characters[0];
    expect(computeOklchDeltaE00(restoredHero!.outfitColor, BASE_OUTFIT)).toBeCloseTo(0, 6);
    expect(computeOklchDeltaE00(restoredHero!.hairColor, BASE_HAIR)).toBeCloseTo(0, 6);
  });
});

describe("④ 조명 방향 불일치 (같은 씬 내 방위각 75° 이상 급변)", () => {
  it("동일 씬 내 74° 변화는 통과시키고 75° 이상 및 360° 래핑 급변은 적발·교정한다", () => {
    const cut1 = makeCut(1, { sceneId: "s1", keyLight: { azimuthDeg: 350, elevationDeg: 30 } });
    // 350° -> 64° = Δ74° (허용)
    const cut2Ok = makeCut(2, { sceneId: "s1", keyLight: { azimuthDeg: 64, elevationDeg: 32 } });
    // 64° -> 139° = Δ75° (경고 적발)
    const cut3Jump = makeCut(3, { sceneId: "s1", keyLight: { azimuthDeg: 139, elevationDeg: 45 } });
    // 다른 씬(s2)으로 넘어가면 270° 전환도 정상 허용
    const cut4NewScene = makeCut(4, { sceneId: "s2", keyLight: { azimuthDeg: 270, elevationDeg: 20 } });

    const ep = makeEpisode([cut1, cut2Ok, cut3Jump, cut4NewScene]);
    const report = analyzeEpisodeContinuity(ep);
    expect(report.countsByCategory["lighting-direction"]).toBe(1);
    expect(report.issues[0]?.cutNumber).toBe(3);
    expect(report.issues[0]?.metrics.azimuthDeltaDeg).toBe(75);

    const singleFix = applyContinuityFix(ep, report.issues[0]!);
    expect(singleFix.applied).toBe(true);
    expect(singleFix.report.issues).toHaveLength(0);
    expect(singleFix.episode.cuts[2]?.keyLight.azimuthDeg).toBe(64);
  });
});

describe("60컷·72컷+ 전 에피소드 데모 스캔 · 불변성 · 일괄 교정", () => {
  it("기본 60컷 데모에서 4대 연속성 오류 12건을 전수 적발하고 야간·회상 예외 오탐 0건, 일괄 교정 후 0건(100점)을 달성한다", () => {
    const demo = createDemo60CutEpisode();
    const snapshotBefore = JSON.stringify(demo);

    expect(demo.cuts).toHaveLength(60);
    const report = analyzeEpisodeContinuity(demo);
    expect(report.scannedCutRange).toEqual([1, 60]);
    expect(report.status).toBe("fail");
    expect(report.countsByCategory).toEqual({
      "prop-continuity": 4,
      "left-right-flip": 4,
      "color-shift": 2,
      "lighting-direction": 2,
    });
    expect(report.issues).toHaveLength(12);
    // 야간(33~42컷)·회상(43~50컷)에서는 색감 급변 오탐 0건 및 예외 기록 존재
    expect(report.exemptedColorTransitions.length).toBeGreaterThan(0);
    for (let c = 33; c <= 50; c += 1) {
      const cutIssues = report.issuesByCut[c] ?? [];
      expect(cutIssues.filter((i) => i.category === "color-shift")).toHaveLength(0);
    }

    // 단건 교정 시 원본 불변 유지
    const firstFix = applyContinuityFix(demo, report.issues[0]!);
    expect(JSON.stringify(demo)).toBe(snapshotBefore);
    expect(firstFix.applied).toBe(true);
    expect(firstFix.report.issues).toHaveLength(11);

    // 전 60컷 일괄 교정 -> 잔여 0건 · 점수 100 · PASS
    const batch = applyAllContinuityFixes(demo);
    expect(JSON.stringify(demo)).toBe(snapshotBefore);
    expect(batch.initialIssueCount).toBe(12);
    expect(batch.appliedPatches).toHaveLength(12);
    expect(batch.remainingIssueCount).toBe(0);
    expect(batch.report.score).toBe(100);
    expect(batch.report.status).toBe("pass");
  });

  it("60컷을 초과하는 72컷 장편 타임라인도 상한 없이 정상 스캔한다", () => {
    const demo = createDemo60CutEpisode();
    const lastCut = demo.cuts[59]!;
    const extendedCuts: WebtoonCutSnapshot[] = [...demo.cuts];
    for (let cutNumber = 61; cutNumber <= 72; cutNumber += 1) {
      extendedCuts.push({ ...lastCut, cutNumber });
    }
    const report = analyzeEpisodeContinuity({ ...demo, cuts: extendedCuts });
    expect(report.totalCuts).toBe(72);
    expect(report.scannedCutRange).toEqual([1, 72]);
    expect(report.issues).toHaveLength(12);
  });
});

describe("StudioWebtoonContinuityGuardPanel: 단독 렌더 · 60컷 타임라인 · 원클릭 교정 · KO/EN · Calm Atelier 위생", () => {
  it("props 없이 단독 렌더되어 60컷 타임라인·카테고리 필터·컷 상세·원클릭 교정·일괄 교정·초기화가 동작한다", () => {
    const onEpisodeChange = vi.fn();
    const { rerender } = render(<StudioWebtoonContinuityGuardPanel />);

    expect(screen.getByTestId("webtoon-continuity-guard-panel")).toBeTruthy();
    expect(screen.getByTestId("continuity-gate-status").textContent).toContain("FAIL");
    const grid = screen.getByTestId("continuity-timeline-grid");
    expect(within(grid).getAllByRole("button")).toHaveLength(60);
    expect(screen.getByTestId("continuity-exempt-badge").textContent).toContain("예외");

    // 4대 오류 분류 필터링 (조명 방향 2건)
    fireEvent.click(screen.getByTestId("continuity-filter-lighting-direction"));
    expect(within(screen.getByTestId("continuity-issue-list")).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("continuity-filter-all"));
    expect(within(screen.getByTestId("continuity-issue-list")).getAllByRole("listitem")).toHaveLength(12);

    // 8컷 클릭 -> 컷 상세 인스펙터 열림 & 8컷 오류(안경 증발) 1건만 표시
    fireEvent.click(screen.getByTestId("continuity-cut-cell-8"));
    expect(screen.getByTestId("continuity-cut-inspector").textContent).toContain("#08컷 스냅샷");
    expect(within(screen.getByTestId("continuity-issue-list")).getAllByRole("listitem")).toHaveLength(1);

    // 콜백 연결 후 단건 원클릭 교정 적용 -> 8컷 통과 상태로 전환
    rerender(<StudioWebtoonContinuityGuardPanel onEpisodeChange={onEpisodeChange} />);
    const fixCut8Btn = within(screen.getByTestId("continuity-issue-list")).getByRole("button", {
      name: /원클릭 자동 교정/,
    });
    fireEvent.click(fixCut8Btn);
    expect(screen.getByTestId("continuity-empty-pass")).toBeTruthy();
    expect(screen.getByTestId("continuity-status-notice").textContent).toContain("잔여 오류 11건");
    expect(onEpisodeChange).toHaveBeenCalledTimes(1);

    // 전체 컷 복귀 후 일괄 자동 교정 -> 0건 · PASS · 100/100
    fireEvent.click(screen.getByTestId("continuity-clear-cut-filter"));
    fireEvent.click(screen.getByTestId("continuity-fix-all-btn"));
    expect(screen.getByTestId("continuity-gate-status").textContent).toContain("PASS");
    expect(screen.getByTestId("continuity-score-badge").textContent).toContain("100/100");
    expect(screen.getByTestId("continuity-applied-count").textContent).toContain("12건");

    // 초기화 버튼 클릭 -> 초기 12건 복원
    fireEvent.click(screen.getByTestId("continuity-reset-btn"));
    expect(screen.getByTestId("continuity-gate-status").textContent).toContain("FAIL");
    expect(within(screen.getByTestId("continuity-issue-list")).getAllByRole("listitem")).toHaveLength(12);
  });

  it("영어 로케일(en)에서는 한글 문자 없이 영어 UI와 오류 카드를 렌더링한다", () => {
    const { container } = render(<StudioWebtoonContinuityGuardPanel locale="en" />);
    expect(screen.getByTestId("continuity-gate-status").textContent).toContain("FAIL");
    expect(screen.getByTestId("continuity-exempt-badge").textContent).toContain("Night/Flashback");
    expect(container.textContent).not.toMatch(/[가-힣]/);

    // 일괄 교정 후 알림까지 한글 누출 없음 검증
    fireEvent.click(screen.getByTestId("continuity-fix-all-btn"));
    expect(screen.getByTestId("continuity-gate-status").textContent).toContain("PASS");
    expect(container.textContent).not.toMatch(/[가-힣]/);
  });

  it("Calm Atelier 토큰 위생(원시 hex/rgb/hsl 금지 · localStorage/sessionStorage 금지 · 모든 파일 800줄 이하)을 준수한다", () => {
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/webtoon-continuity-guard");
    const files = [
      "continuity-color-math.ts",
      "continuity-types.ts",
      "continuity-patch-engine.ts",
      "continuity-demo-episode.ts",
      "webtoon-continuity-guard.ts",
      "StudioWebtoonContinuityGuardPanel.tsx",
      "index.ts",
      "webtoon-continuity-guard.test.tsx",
    ];

    for (const file of files) {
      const fullPath = path.join(dir, file);
      expect(existsSync(fullPath)).toBe(true);
      const src = readFileSync(fullPath, "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "webtoon-continuity-guard.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/);
        expect(src).not.toMatch(/\bsessionStorage\b/);
      }
    }

    const panelSrc = readFileSync(path.join(dir, "StudioWebtoonContinuityGuardPanel.tsx"), "utf8");
    expect(panelSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panelSrc).not.toMatch(/\brgba?\s*\(/i);
    expect(panelSrc).not.toMatch(/\bhsla?\s*\(/i);
    expect(panelSrc).not.toContain("transition-all");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
  });
});
