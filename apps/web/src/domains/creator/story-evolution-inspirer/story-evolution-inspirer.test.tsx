// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STORY_PITCH_SAMPLES,
  WEBTOON_CLICHE_PATTERNS,
  analyzeStoryClicheSimilarity,
  combineRandomInspirationSpark,
  type StoryPitchInput,
} from "./anti-cliche-divergence-engine";
import {
  ABRUPT_PSYCHOLOGY_DELTA_THRESHOLD,
  DEFAULT_CHARACTER_GROWTH_PRESETS,
  applyTimelineSuggestedFix,
  createContradictionDemoArc,
  evaluateCharacterTimelineConsistency,
  interpolateCharacterAppearanceAtEpisode,
  type CharacterGrowthArc,
} from "./character-growth-timeline";
import { StoryGrowthInspirerPanel } from "./StoryGrowthInspirerPanel";

afterEach(cleanup);

function buildCustomArc(overrides?: Partial<CharacterGrowthArc>): CharacterGrowthArc {
  return {
    id: "custom-hero",
    characterName: "한시우",
    roleSummary: "경비대 신입 → 조사국 팀장",
    genreLabel: "현대 판타지",
    baselineHair: "단정한 흑발",
    baselineOutfit: "청회색 근무복",
    baselineProps: ["신분증"],
    lockedSpeechTone: null,
    snapshots: [
      {
        id: "ep-1",
        episode: 1,
        ageYears: 20,
        elapsedMonths: 0,
        appearanceDelta: {
          addedScars: [],
          hair: "단정한 흑발",
          outfit: "청회색 근무복",
          addedProps: ["신분증"],
        },
        psychology: { courage: 40, trust: 70, warmth: 65, restraint: 45, ambition: 35 },
        speechTone: "casual",
        triggerEvent: "1화 첫 현장 투입",
      },
      {
        id: "ep-15",
        episode: 15,
        ageYears: 21,
        elapsedMonths: 8,
        appearanceDelta: {
          addedScars: ["왼뺨 흉터"],
          outfit: "어두운 방호 코트",
          addedProps: ["접이식 경봉"],
        },
        psychology: { courage: 62, trust: 52, warmth: 58, restraint: 72, ambition: 50 },
        speechTone: "terse",
        triggerEvent: "15화 야간 지하철 전투 사건에서 동료를 구하다 왼뺨을 베임",
      },
    ],
    ...overrides,
  };
}

describe("시간축 캐릭터 성장·심리 일관성 엔진 (character-growth-timeline)", () => {
  it("기본 프리셋 2종(이도현, 세라피나)은 1화→25화→60화 실데이터이며 모순 없이 의도된 성장으로 승인된다", () => {
    expect(DEFAULT_CHARACTER_GROWTH_PRESETS).toHaveLength(2);
    const names = DEFAULT_CHARACTER_GROWTH_PRESETS.map((preset) => preset.characterName);
    expect(names).toEqual(["이도현", "세라피나"]);

    for (const preset of DEFAULT_CHARACTER_GROWTH_PRESETS) {
      expect(preset.snapshots.map((snap) => snap.episode)).toEqual([1, 25, 60]);
      const report = evaluateCharacterTimelineConsistency(preset);
      expect(report.overallStatus).toBe("consistent");
      expect(report.contradictionCount).toBe(0);
      expect(report.consistencyScore).toBe(100);
      expect(report.intentionalGrowthCount).toBe(2);
    }
  });

  it("triggerEvent가 있는 자연스러운 성장(15화 전투 사건→왼뺨 흉터 추가+신중함 상승)은 intentional-growth로 승인한다", () => {
    const arc = buildCustomArc();
    const report = evaluateCharacterTimelineConsistency(arc);

    expect(report.overallStatus).toBe("consistent");
    expect(report.contradictionCount).toBe(0);
    expect(report.transitions).toHaveLength(1);
    expect(report.transitions[0]?.verdict).toBe("intentional-growth");
    expect(report.transitions[0]?.addedScars).toContain("왼뺨 흉터");
    expect(report.transitions[0]?.psychologyDeltas.restraint).toBe(27);
  });

  it("사건 없이 흉터가 사라지면(removedScars 또는 visibleScarsOverride 누락) contradiction과 1클릭 복구 제안을 반환한다", () => {
    const base = buildCustomArc();
    const vanishedViaRemoved: CharacterGrowthArc = {
      ...base,
      snapshots: [
        ...base.snapshots,
        {
          id: "ep-30",
          episode: 30,
          ageYears: 21,
          elapsedMonths: 14,
          appearanceDelta: {
            addedScars: [],
            removedScars: ["왼뺨 흉터"],
          },
          psychology: { courage: 65, trust: 55, warmth: 60, restraint: 75, ambition: 52 },
          speechTone: "terse",
          triggerEvent: "",
        },
      ],
    };

    const report1 = evaluateCharacterTimelineConsistency(vanishedViaRemoved);
    expect(report1.overallStatus).toBe("has-contradictions");
    const scarFinding = report1.findings.find((item) => item.code === "scar-vanished");
    expect(scarFinding).toBeDefined();
    expect(scarFinding?.suggestedFix.kind).toBe("restore-scars");

    // 1클릭 복구 적용 시 모순 해소
    if (scarFinding) {
      const fixed = applyTimelineSuggestedFix(vanishedViaRemoved, scarFinding.suggestedFix);
      const afterFix = evaluateCharacterTimelineConsistency(fixed);
      expect(afterFix.contradictionCount).toBe(0);
      expect(afterFix.overallStatus).toBe("consistent");
    }

    // visibleScarsOverride에서 기존 흉터를 빠뜨린 경우도 탐지
    const vanishedViaOverride: CharacterGrowthArc = {
      ...base,
      snapshots: [
        ...base.snapshots,
        {
          id: "ep-32",
          episode: 32,
          ageYears: 21,
          elapsedMonths: 15,
          appearanceDelta: {
            addedScars: [],
            visibleScarsOverride: [],
          },
          psychology: { courage: 64, trust: 54, warmth: 59, restraint: 73, ambition: 51 },
          speechTone: "terse",
          triggerEvent: null,
        },
      ],
    };
    const report2 = evaluateCharacterTimelineConsistency(vanishedViaOverride);
    expect(report2.findings.some((item) => item.code === "scar-vanished")).toBe(true);
  });

  it("연령 또는 경과 시간이 역행하면 age-regression 모순 경고와 시간축 보정 제안을 반환한다", () => {
    const base = buildCustomArc();
    const regressed: CharacterGrowthArc = {
      ...base,
      snapshots: [
        ...base.snapshots,
        {
          id: "ep-28",
          episode: 28,
          ageYears: 19,
          elapsedMonths: 4,
          appearanceDelta: { addedScars: [] },
          psychology: { courage: 64, trust: 55, warmth: 60, restraint: 74, ambition: 54 },
          speechTone: "terse",
          triggerEvent: "28화 지부 이동",
        },
      ],
    };

    const report = evaluateCharacterTimelineConsistency(regressed);
    const ageFinding = report.findings.find((item) => item.code === "age-regression");
    expect(ageFinding).toBeDefined();
    expect(ageFinding?.suggestedFix.kind).toBe("fix-age");
    expect(ageFinding?.suggestedFix.proposedAgeYears).toBe(21);

    if (ageFinding) {
      const fixed = applyTimelineSuggestedFix(regressed, ageFinding.suggestedFix);
      const rechecked = evaluateCharacterTimelineConsistency(fixed);
      expect(rechecked.findings.some((item) => item.code === "age-regression")).toBe(false);
    }
  });

  it("사건 없이 심리 변화폭이 45 이상 급반전하면 모순 경고 후 1클릭 사건 기록으로 의도된 성장으로 전환된다", () => {
    const base = buildCustomArc();
    const abruptArc: CharacterGrowthArc = {
      ...base,
      snapshots: [
        ...base.snapshots,
        {
          id: "ep-22",
          episode: 22,
          ageYears: 21,
          elapsedMonths: 12,
          appearanceDelta: { addedScars: [] },
          psychology: {
            courage: 62,
            trust: 52 - ABRUPT_PSYCHOLOGY_DELTA_THRESHOLD, // delta = -45
            warmth: 58,
            restraint: 72,
            ambition: 50,
          },
          speechTone: "terse",
          triggerEvent: "",
        },
      ],
    };

    const report = evaluateCharacterTimelineConsistency(abruptArc);
    const psychFinding = report.findings.find((item) => item.code === "abrupt-psychology-reversal");
    expect(psychFinding).toBeDefined();
    expect(psychFinding?.suggestedFix.kind).toBe("record-trigger");

    if (psychFinding) {
      const fixed = applyTimelineSuggestedFix(abruptArc, psychFinding.suggestedFix);
      const afterFix = evaluateCharacterTimelineConsistency(fixed);
      expect(afterFix.contradictionCount).toBe(0);
      expect(afterFix.transitions[1]?.verdict).toBe("intentional-growth");
    }
  });

  it("말투 락킹 위반(아크 고정 잠금 또는 사건 없는 톤 변경)을 탐지하고 1클릭으로 복구한다", () => {
    const lockedArc = buildCustomArc({ lockedSpeechTone: "formal" });
    const report = evaluateCharacterTimelineConsistency(lockedArc);
    const lockFindings = report.findings.filter((item) => item.code === "speech-tone-lock-violation");
    expect(lockFindings.length).toBeGreaterThanOrEqual(1);

    let patched = lockedArc;
    for (const finding of lockFindings) {
      patched = applyTimelineSuggestedFix(patched, finding.suggestedFix);
    }
    const fixedReport = evaluateCharacterTimelineConsistency(patched);
    expect(fixedReport.contradictionCount).toBe(0);
  });

  it("interpolateCharacterAppearanceAtEpisode는 정확 회차·중간 회차·경계 회차의 흉터·복장·심리·말투 가이드를 합성 반환한다", () => {
    const dohyun = DEFAULT_CHARACTER_GROWTH_PRESETS[0];
    expect(dohyun).toBeDefined();
    if (!dohyun) return;

    const ep13 = interpolateCharacterAppearanceAtEpisode(dohyun, 13);
    expect(ep13.interpolationMode).toBe("interpolated");
    expect(ep13.episode).toBe(13);
    expect(ep13.ageYears).toBe(19.5);
    expect(ep13.psychology.courage).toBe(52); // 1화(38)와 25화(66)의 정중앙
    expect(ep13.activeScars).toEqual([]); // 25화 흉터는 아직 발생 전
    expect(ep13.nextMilestoneEpisode).toBe(25);
    expect(ep13.speechGuideKo.length).toBeGreaterThan(10);

    const ep42 = interpolateCharacterAppearanceAtEpisode(dohyun, 42);
    expect(ep42.activeScars).toContain("왼뺨 사선 흉터");
    expect(ep42.outfit).toBe("검은 방탄 전술 코트");
    expect(ep42.props).toContain("흑요석 쌍단검");
    expect(ep42.props).not.toContain("낡은 철제 단검");
    expect(ep42.psychology.restraint).toBeGreaterThan(70);
    expect(ep42.psychology.restraint).toBeLessThan(84);

    const ep60 = interpolateCharacterAppearanceAtEpisode(dohyun, 60);
    expect(ep60.interpolationMode).toBe("exact");
    expect(ep60.activeScars).toEqual(["왼뺨 사선 흉터", "오른손등 마력 화상 자국"]);
    expect(ep60.speechTone).toBe("formal");

    const ep90 = interpolateCharacterAppearanceAtEpisode(dohyun, 90);
    expect(ep90.interpolationMode).toBe("after-last");
    expect(ep90.activeScars).toEqual(["왼뺨 사선 흉터", "오른손등 마력 화상 자국"]);
  });
});

describe("유사 화풍·클리셰 비틀기 영감 생성기 (anti-cliche-divergence-engine)", () => {
  it("12종의 고유한 웹툰 클리셰 패턴과 작화 무드 프로파일을 보유한다", () => {
    expect(WEBTOON_CLICHE_PATTERNS).toHaveLength(12);
    const ids = new Set(WEBTOON_CLICHE_PATTERNS.map((item) => item.id));
    expect(ids.size).toBe(12);
    for (const pattern of WEBTOON_CLICHE_PATTERNS) {
      expect(pattern.visualMood.lineContrastScore).toBeGreaterThan(0);
      expect(pattern.visualMood.colorTempKelvin).toBeGreaterThan(2000);
      expect(pattern.visualMood.panelsPerMobileScreen).toBeGreaterThan(1);
    }
  });

  it("입력 로그라인과 키워드에 따라 유사 클리셰 유사도(0~100%)와 유사 작화 무드를 정확히 진단한다", () => {
    const hunterInput: StoryPitchInput = {
      logline: "최하위 E급 헌터가 죽기 직전 10년 전 과거로 회귀해 숨겨진 상태창으로 던전을 독점한다.",
      genre: "modern-fantasy",
      keywords: ["회귀", "던전", "상태창", "헌터", "먼치킨"],
      protagonistTrait: "냉철하고 압도적인 효율형 주인공",
    };

    const hunterReport = analyzeStoryClicheSimilarity(hunterInput);
    expect(hunterReport.highestSimilarityPercent).toBeGreaterThanOrEqual(65);
    expect(hunterReport.highestSimilarityPercent).toBeLessThanOrEqual(100);
    expect(hunterReport.riskLevel).toBe("high");
    expect(["regression-munchkin", "dungeon-awakening"]).toContain(
      hunterReport.primaryMatch.patternId,
    );
    expect(hunterReport.detectedVisualMood.lineContrastScore).toBeGreaterThanOrEqual(80);

    const zombieInput: StoryPitchInput = {
      logline: "바이러스 감염으로 좀비가 창궐한 도시에서 생존자 피난처를 지키는 종말 생존기.",
      genre: "thriller-apocalypse",
      keywords: ["좀비", "감염", "바이러스", "생존", "피난처"],
      protagonistTrait: "냉정한 실용주의 생존자",
    };
    const zombieReport = analyzeStoryClicheSimilarity(zombieInput);
    expect(zombieReport.primaryMatch.patternId).toBe("zombie-apocalypse");
    expect(zombieReport.highestSimilarityPercent).toBeGreaterThanOrEqual(75);
  });

  it("서로 직교하는 3가지 독창적 비틀기 방향(서사 전복·장르 무드 피벗·시점 관계 비대칭)을 고유하게 생성한다", () => {
    const sample = DEFAULT_STORY_PITCH_SAMPLES[1]?.input;
    expect(sample).toBeDefined();
    if (!sample) return;

    const report = analyzeStoryClicheSimilarity(sample);
    expect(report.twistDirections).toHaveLength(3);

    const kinds = report.twistDirections.map((item) => item.kind);
    expect(kinds).toEqual([
      "trope-inversion",
      "genre-mood-pivot",
      "pov-relationship-shift",
    ]);

    const axes = new Set(report.twistDirections.map((item) => item.orthogonalAxisKo));
    const titles = new Set(report.twistDirections.map((item) => item.titleKo));
    const primaries = new Set(report.twistDirections.map((item) => item.primaryProposalKo));
    expect(axes.size).toBe(3);
    expect(titles.size).toBe(3);
    expect(primaries.size).toBe(3);

    const pivot = report.twistDirections[1];
    expect(pivot.studioRecipe?.brushPresetKo.length).toBeGreaterThan(3);
    expect(pivot.studioRecipe?.filterMoodKo.length).toBeGreaterThan(3);
    expect(pivot.studioRecipe?.panelRhythmKo.length).toBeGreaterThan(3);
  });

  it("combineRandomInspirationSpark(seed)는 결정적 시드 재현성과 4축 다양성을 보장한다", () => {
    const first = combineRandomInspirationSpark(2026);
    const repeat = combineRandomInspirationSpark(2026);
    expect(repeat).toEqual(first);

    const strFirst = combineRandomInspirationSpark("toonstudio-wave12");
    const strRepeat = combineRandomInspirationSpark("toonstudio-wave12");
    expect(strRepeat).toEqual(strFirst);

    const uniquePrompts = new Set<string>();
    for (let seed = 1; seed <= 12; seed += 1) {
      const spark = combineRandomInspirationSpark(seed * 97);
      expect(spark.setting.labelKo.length).toBeGreaterThan(2);
      expect(spark.conflict.labelKo.length).toBeGreaterThan(2);
      expect(spark.visualDevice.studioTipKo.length).toBeGreaterThan(2);
      expect(spark.emotionalArc.labelKo.length).toBeGreaterThan(2);
      uniquePrompts.add(spark.combinedPromptKo);
    }
    expect(uniquePrompts.size).toBeGreaterThanOrEqual(8);
  });
});

describe("StoryGrowthInspirerPanel UI 통합 동작 및 1클릭 보정", () => {
  it("프리셋 전환, 회차 보간 슬라이더, 모순 시뮬레이션 및 1클릭 보정 전체 흐름이 동작한다", () => {
    const onArcChange = vi.fn();
    render(<StoryGrowthInspirerPanel onArcChange={onArcChange} />);

    // 기본 탭: 시간축 성장·일관성 추적기
    expect(screen.getByTestId("tab-character-timeline").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("timeline-consistency-score").textContent).toBe("100점");
    expect(screen.getByTestId("timeline-consistent-empty")).toBeTruthy();

    // 세라피나 프리셋으로 전환
    fireEvent.click(screen.getByTestId("preset-preset-seraphina"));
    expect(screen.getByTestId("interpolated-scars").textContent).toContain(
      "오른쪽 쇄골 계약 각인 흉터",
    );

    // 회차 보간 슬라이더로 13화 조회 (1화~25화 중간 보간)
    fireEvent.change(screen.getByTestId("episode-interpolation-slider"), {
      target: { value: "13" },
    });
    expect(screen.getByTestId("interpolated-scars").textContent).toContain("없음");
    expect(Number(screen.getByTestId("psych-ambition").textContent)).toBeGreaterThan(24);
    expect(Number(screen.getByTestId("psych-ambition").textContent)).toBeLessThan(72);

    // 모순 시뮬레이션 삽입 → 모순 경고 다건 표시
    fireEvent.click(screen.getByTestId("simulate-contradiction-btn"));
    expect(screen.getByTestId("contradiction-findings-list")).toBeTruthy();
    expect(Number(screen.getByTestId("timeline-consistency-score").textContent?.replace("점", ""))).toBeLessThan(100);

    // 남아 있는 모든 1클릭 보정 버튼을 차례로 적용해 일관성 100점으로 복원
    let guard = 0;
    while (screen.queryByTestId("contradiction-findings-list") && guard < 6) {
      const list = screen.getByTestId("contradiction-findings-list");
      const firstFixButton = within(list).getAllByRole("button")[0];
      expect(firstFixButton).toBeDefined();
      if (!firstFixButton) break;
      fireEvent.click(firstFixButton);
      guard += 1;
    }

    expect(screen.queryByTestId("contradiction-findings-list")).toBeNull();
    expect(screen.getByTestId("timeline-consistency-score").textContent).toBe("100점");
    expect(onArcChange).toHaveBeenCalled();

    // 말투 고정 잠금 설정 시 락킹 위반 경고 노출 후 프리셋 복원으로 초기화
    fireEvent.change(screen.getByTestId("speech-tone-lock-select"), {
      target: { value: "formal" },
    });
    expect(screen.getByTestId("contradiction-findings-list")).toBeTruthy();
    fireEvent.click(screen.getByTestId("reset-preset-btn"));
    expect(screen.queryByTestId("contradiction-findings-list")).toBeNull();
    expect(screen.getByTestId("timeline-consistency-score").textContent).toBe("100점");
  });

  it("클리셰 진단·영감 비틀기 탭 전환, 실시간 진단 업데이트, 4축 영감 스파크 재생성이 동작한다", () => {
    const firstPreset = DEFAULT_CHARACTER_GROWTH_PRESETS[0];
    expect(firstPreset).toBeDefined();
    if (firstPreset) {
      const demoArc = createContradictionDemoArc(firstPreset);
      expect(evaluateCharacterTimelineConsistency(demoArc).contradictionCount).toBeGreaterThan(0);
    }

    const { container } = render(<StoryGrowthInspirerPanel />);

    fireEvent.click(screen.getByTestId("tab-cliche-inspirer"));
    expect(screen.getByTestId("tab-cliche-inspirer").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("panel-cliche-inspirer")).toBeTruthy();

    // 3방향 직교 카드 렌더링 검증
    expect(screen.getByTestId("twist-card-trope-inversion")).toBeTruthy();
    expect(screen.getByTestId("twist-card-genre-mood-pivot")).toBeTruthy();
    expect(screen.getByTestId("twist-card-pov-relationship-shift")).toBeTruthy();

    // 계약결혼 샘플로 전환 시 진단 갱신
    fireEvent.click(screen.getByTestId("story-sample-sample-contract-rofan"));
    expect(screen.getByTestId("cliche-top-matches").textContent).toMatch(/계약결혼|악녀/);

    // 직접 입력 시 좀비 아포칼립스 즉시 반영
    fireEvent.change(screen.getByTestId("pitch-logline-input"), {
      target: { value: "좀비 바이러스 감염 사태로 봉쇄된 아파트 생존기" },
    });
    fireEvent.change(screen.getByTestId("pitch-genre-select"), {
      target: { value: "thriller-apocalypse" },
    });
    fireEvent.change(screen.getByTestId("pitch-keywords-input"), {
      target: { value: "좀비, 감염, 바이러스, 생존, 피난처" },
    });
    expect(screen.getByTestId("cliche-top-matches").textContent).toContain("좀비 아포칼립스");

    // 무작위 영감 스파크 재생성
    const beforeSeed = screen.getByTestId("spark-seed-label").textContent;
    const beforePrompt = screen.getByTestId("spark-combined-prompt").textContent;
    fireEvent.click(screen.getByTestId("reroll-spark-btn"));
    expect(screen.getByTestId("spark-seed-label").textContent).not.toBe(beforeSeed);
    expect(screen.getByTestId("spark-combined-prompt").textContent).not.toBe(beforePrompt);

    // 인라인 style에 raw hex/rgb/hsl 색상이 없는지 확인
    const styledNodes = container.querySelectorAll("[style]");
    for (const node of styledNodes) {
      const styleText = node.getAttribute("style") ?? "";
      expect(styleText).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|rgba\(|hsl\(/i);
    }
  });
});
