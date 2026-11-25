// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LOGLINE_MAX_CHARS,
  LOGLINE_MIN_CHARS,
  PITCH_BIBLE_SCHEMA_VERSION,
  PITCH_DATA_SOURCE_KIND,
  PITCH_GENRE_IDS,
  PITCH_SLIDE_IDS,
  SECONDARY_RIGHTS_TRACK_IDS,
  StudioGlobalIpPitchPanel,
  TARGET_SEASON_CHAPTERS,
  TARGET_SEASON_EPISODES,
  auditPitchBibleReadiness,
  buildPitchBibleDeck,
  computeSeasonArcTotals,
  createPitchBibleStarter,
  createPitchEstimateRange,
  detectExaggerationMatches,
  exportPitchBibleJson,
  exportPitchBibleMarkdown,
  formatEstimateRangeLabel,
  validateLoglineLength,
} from "./index";

afterEach(cleanup);

describe("1. 3종 장르 스타터 및 12장 글로벌 피칭 바이블 덱 생성", () => {
  it("3종 장르 스타터(액션 판타지·현대 로맨스·미스터리 스릴러)가 고유 원고와 깊은 복사본을 생성한다", () => {
    const af1 = createPitchBibleStarter("action-fantasy");
    const af2 = createPitchBibleStarter("action-fantasy");
    const mr = createPitchBibleStarter("modern-romance");
    const mt = createPitchBibleStarter("mystery-thriller");

    expect(new Set([af1.cover.titleKo, mr.cover.titleKo, mt.cover.titleKo]).size).toBe(3);
    expect(af1).not.toBe(af2);
    expect(af1.coreCharacters).not.toBe(af2.coreCharacters);
    expect(af1.secondaryRights.tracks).not.toBe(af2.secondaryRights.tracks);
  });

  it("buildPitchBibleDeck가 12장 슬라이드를 1~12번 표준 순서로 빠짐없이 조판한다", () => {
    const deck = buildPitchBibleDeck(createPitchBibleStarter("action-fantasy"));
    expect(deck.schemaVersion).toBe(PITCH_BIBLE_SCHEMA_VERSION);
    expect(deck.slides).toHaveLength(12);
    expect(deck.slides.map((s) => s.id)).toEqual([...PITCH_SLIDE_IDS]);
    expect(deck.slides.map((s) => s.slideNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const slide of deck.slides) {
      expect(slide.headlineKo.trim().length).toBeGreaterThan(0);
      expect(slide.summaryBulletsKo.length).toBeGreaterThan(0);
    }
  });

  it("모든 3종 스타터가 25~45자 최적 로그라인·핵심 캐릭터 4인·12부작/60화·2차 판권 4축을 충족한다", () => {
    for (const genreId of PITCH_GENRE_IDS) {
      const deck = buildPitchBibleDeck(createPitchBibleStarter(genreId));
      expect(deck.loglineValidation.isOptimal).toBe(true);
      expect(deck.loglineValidation.charCount).toBeGreaterThanOrEqual(LOGLINE_MIN_CHARS);
      expect(deck.loglineValidation.charCount).toBeLessThanOrEqual(LOGLINE_MAX_CHARS);
      expect(deck.characterCount).toBe(4);
      expect(deck.seasonTotals.totalEpisodes).toBe(TARGET_SEASON_EPISODES);
      expect(deck.seasonTotals.totalChapters).toBe(TARGET_SEASON_CHAPTERS);
      expect(deck.seasonTotals.matchesStandard12x60).toBe(true);
      expect(deck.input.secondaryRights.tracks.map((t) => t.id)).toEqual([...SECONDARY_RIGHTS_TRACK_IDS]);
    }
  });

  it("모든 시장·예산 범위가 dataSourceKind='estimate'와 '추정' 배지를 명시하고 허구 통계를 포함하지 않는다", () => {
    for (const genreId of PITCH_GENRE_IDS) {
      const deck = buildPitchBibleDeck(createPitchBibleStarter(genreId));
      expect(deck.dataSourceKind).toBe(PITCH_DATA_SOURCE_KIND);
      expect(deck.badgeLabelKo).toBe("추정");
      expect(deck.allEstimatesTagged).toBe(true);

      const ranges = [
        deck.input.targetPositioning.addressableRangeEstimate,
        ...deck.input.secondaryRights.tracks.map((t) => t.budgetRangeEstimate),
        deck.input.productionSchedule.totalBudgetEstimate,
      ];
      for (const r of ranges) {
        expect(r.dataSourceKind).toBe("estimate");
        expect(r.badgeLabelKo).toBe("추정");
        expect(r.minAmount).toBeLessThanOrEqual(r.maxAmount);
      }
      const estimateSlides = deck.slides.filter((s) => s.hasEstimateData);
      expect(estimateSlides.map((s) => s.id)).toEqual(["target-positioning", "secondary-rights", "production-schedule"]);
      for (const s of estimateSlides) {
        expect(s.dataSourceKind).toBe("estimate");
      }
    }
  });

  it("음수·NaN·Infinity 추정 범위 입력을 0 이상 유한값으로 안전 정규화한다", () => {
    const safeRange = createPitchEstimateRange({
      minAmount: Number.NaN,
      maxAmount: Number.POSITIVE_INFINITY,
      unitKo: "억원",
      unitEn: "100M KRW",
      assumptionKo: "기획 가정(추정)",
      assumptionEn: "Planning estimate",
    });
    expect(safeRange.minAmount).toBe(0);
    expect(safeRange.maxAmount).toBe(0);
    expect(safeRange.dataSourceKind).toBe("estimate");

    const starter = createPitchBibleStarter("action-fantasy");
    const mutated = {
      ...starter,
      productionSchedule: {
        ...starter.productionSchedule,
        totalBudgetEstimate: { ...starter.productionSchedule.totalBudgetEstimate, minAmount: -12, maxAmount: Number.NaN },
      },
    };
    const deck = buildPitchBibleDeck(mutated);
    expect(deck.input.productionSchedule.totalBudgetEstimate.minAmount).toBe(0);
    expect(deck.input.productionSchedule.totalBudgetEstimate.maxAmount).toBe(0);
  });

  it("computeSeasonArcTotals가 막별 부작·화수 합계를 정확히 산출하고 12부작/60화 일탈을 감지한다", () => {
    const starter = createPitchBibleStarter("modern-romance");
    const standard = computeSeasonArcTotals(starter.seasonArc.blocks);
    expect(standard.matchesStandard12x60).toBe(true);
    expect(standard.totalEpisodes).toBe(12);
    expect(standard.totalChapters).toBe(60);

    const altered = computeSeasonArcTotals(
      starter.seasonArc.blocks.map((b, i) => (i === 0 ? { ...b, episodeCount: 4, chapterEnd: 20 } : b)),
    );
    expect(altered.totalEpisodes).toBe(13);
    expect(altered.totalChapters).toBe(65);
    expect(altered.matchesStandard12x60).toBe(false);
  });
});

describe("2. 25~45자 로그라인 검증기 및 과장·허구 통계 감지기", () => {
  it("빈 문자열 및 공백만 있는 로그라인을 empty 상태로 판정한다", () => {
    const res = validateLoglineLength("   ");
    expect(res.status).toBe("empty");
    expect(res.isOptimal).toBe(false);
    expect(res.charCount).toBe(0);
  });

  it("24자는 too-short, 25자는 optimal 경계로 정확히 판정한다", () => {
    const short24 = validateLoglineLength("가".repeat(24));
    expect(short24.status).toBe("too-short");
    expect(short24.deltaFromRange).toBe(-1);

    const exact25 = validateLoglineLength("가".repeat(25));
    expect(exact25.status).toBe("optimal");
    expect(exact25.isOptimal).toBe(true);
    expect(exact25.deltaFromRange).toBe(0);
  });

  it("45자는 optimal, 46자는 too-long으로 판정하며 앞뒤 공백은 제외한다", () => {
    const exact45 = validateLoglineLength(`  ${"나".repeat(45)}  `);
    expect(exact45.status).toBe("optimal");
    expect(exact45.charCount).toBe(45);

    const long46 = validateLoglineLength("나".repeat(46));
    expect(long46.status).toBe("too-long");
    expect(long46.deltaFromRange).toBe(1);
  });

  it("국문 과장·흥행 보장 문구를 overclaim으로 정확히 감지한다", () => {
    const matches = detectExaggerationMatches("전 세계 1위 및 100% 흥행을 보장하는 무조건 성공할 대박 확정 IP");
    expect(matches.length).toBeGreaterThanOrEqual(3);
    expect(matches.every((m) => m.kind === "overclaim")).toBe(true);
  });

  it("근거 없는 조회수·매출·점유율 확정 통계를 unverified-stat으로 감지한다", () => {
    const matches = detectExaggerationMatches("론칭 1주 내 누적 1억 뷰 달성 및 전환율 85%, 연 매출 200억 확정");
    expect(matches.some((m) => m.kind === "unverified-stat")).toBe(true);
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("영문 과장·ROI 표현을 감지하고 절제된 에디토리얼 문장에는 오탐을 내지 않는다", () => {
    const eng = detectExaggerationMatches("A guaranteed hit with 100% success and ROI 500% across OTT.");
    expect(eng.some((m) => m.kind === "overclaim")).toBe(true);
    expect(eng.some((m) => m.kind === "unverified-stat")).toBe(true);

    const clean = detectExaggerationMatches("시간을 독점한 부유 제국에서 시계공이 금지된 태양로를 깨워 탈환전에 나선다.");
    expect(clean).toHaveLength(0);
  });
});

describe("3. 피칭 완성도 감사기 (auditPitchBibleReadiness)", () => {
  it("3종 기본 스타터 모두 100점·pitch-ready·차단 0·경고 0·dataSourceKind='estimate'로 통과한다", () => {
    for (const genreId of PITCH_GENRE_IDS) {
      const audit = auditPitchBibleReadiness(createPitchBibleStarter(genreId));
      expect(audit.score).toBe(100);
      expect(audit.grade).toBe("pitch-ready");
      expect(audit.blockerCount).toBe(0);
      expect(audit.warningCount).toBe(0);
      expect(audit.readySlideCount).toBe(12);
      expect(audit.dataSourceKind).toBe("estimate");
      expect(audit.badgeLabelKo).toBe("추정");
    }
  });

  it("표지 제목·스튜디오 또는 로그라인이 비면 차단(blocker) 이슈와 점수 감점을 반환한다", () => {
    const base = createPitchBibleStarter("action-fantasy");
    const broken = {
      ...base,
      cover: { ...base.cover, titleKo: "" },
      logline: { ...base.logline, loglineKo: "" },
    };
    const audit = auditPitchBibleReadiness(broken);
    expect(audit.blockerCount).toBeGreaterThanOrEqual(2);
    expect(audit.missingIssues.some((i) => i.code === "missing-cover-core")).toBe(true);
    expect(audit.missingIssues.some((i) => i.code === "missing-logline")).toBe(true);
    expect(audit.score).toBeLessThan(80);
  });

  it("로그라인 길이가 25~45자를 벗어나면 structure 경고를 발생시킨다", () => {
    const base = createPitchBibleStarter("modern-romance");
    const audit = auditPitchBibleReadiness({ ...base, logline: { ...base.logline, loglineKo: "너무 짧은 로그라인." } });
    expect(audit.structureIssues.some((i) => i.code === "logline-length-out-of-range")).toBe(true);
    expect(audit.slideAudits.find((s) => s.slideId === "logline")?.status).toBe("warning");
  });

  it("핵심 캐릭터가 4인 미만이면 경고, 2인 미만이면 차단으로 에스컬레이션한다", () => {
    const base = createPitchBibleStarter("mystery-thriller");
    const three = auditPitchBibleReadiness({ ...base, coreCharacters: base.coreCharacters.slice(0, 3) });
    expect(three.issues.find((i) => i.code === "incomplete-core-characters")?.severity).toBe("warning");

    const one = auditPitchBibleReadiness({ ...base, coreCharacters: base.coreCharacters.slice(0, 1) });
    expect(one.issues.find((i) => i.code === "incomplete-core-characters")?.severity).toBe("blocker");
  });

  it("시즌 1 총량이 12부작/60화와 어긋나면 season-arc-ratio-mismatch 경고를 반환한다", () => {
    const base = createPitchBibleStarter("action-fantasy");
    const audit = auditPitchBibleReadiness({
      ...base,
      seasonArc: {
        ...base.seasonArc,
        blocks: base.seasonArc.blocks.map((b, i) => (i === 3 ? { ...b, episodeCount: 2, chapterEnd: 52 } : b)),
      },
    });
    expect(audit.structureIssues.some((i) => i.code === "season-arc-ratio-mismatch")).toBe(true);
  });

  it("과장 표현과 허구 통계를 삽입하면 exaggerationIssues로 분리 감지하고 점수를 강하게 감점한다", () => {
    const base = createPitchBibleStarter("action-fantasy");
    const hyped = {
      ...base,
      creativeIntent: { ...base.creativeIntent, globalTimelinessKo: "전 세계 1위 및 100% 흥행 보장 프로젝트" },
      targetPositioning: { ...base.targetPositioning, viewerHookKo: "론칭 즉시 누적 1억 뷰 확정과 시장 점유율 60% 달성" },
    };
    const audit = auditPitchBibleReadiness(hyped);
    expect(audit.exaggerationIssues.length).toBeGreaterThanOrEqual(3);
    expect(audit.exaggerationIssues.some((i) => i.code === "unverified-market-stat" && i.severity === "blocker")).toBe(true);
    expect(audit.exaggerationIssues.some((i) => i.code === "exaggerated-claim" && i.severity === "warning")).toBe(true);
    expect(audit.grade).not.toBe("pitch-ready");
  });

  it("하한>상한 역전 범위·추정 근거 누락을 감지하며 다중 결함 시 점수를 0~100으로 클램핑한다", () => {
    const base = createPitchBibleStarter("action-fantasy");
    const badRange = {
      ...base,
      cover: { ...base.cover, titleKo: "", studioName: "" },
      logline: { loglineKo: "", highConceptHookKo: "" },
      creativeIntent: { originMotifKo: "", universalThemeKo: "", globalTimelinessKo: "전 세계 1위 100% 흥행 보장 누적 2억 뷰", directorPromiseKo: "" },
      worldRules: { settingSummaryKo: "", conflictMechanismKo: "", rules: [] },
      coreCharacters: [],
      seasonArc: { ...base.seasonArc, blocks: [] },
      visualTone: { ...base.visualTone, artStyleKo: "", lightingMoodKo: "" },
      targetPositioning: {
        ...base.targetPositioning,
        primaryAudienceKo: "",
        ottChannels: [],
        addressableRangeEstimate: { ...base.targetPositioning.addressableRangeEstimate, minAmount: 500, maxAmount: 100, assumptionKo: "" },
      },
      compPositioning: { positioningFormulaKo: "", entries: [] },
      secondaryRights: { expansionThesisKo: "", tracks: [] },
      productionSchedule: { ...base.productionSchedule, milestones: [] },
      contact: { ...base.contact, contactEmail: "invalid", availableRights: [] },
    };
    const audit = auditPitchBibleReadiness(badRange);
    expect(audit.estimateGuardIssues.some((i) => i.code === "inverted-estimate-range")).toBe(true);
    expect(audit.estimateGuardIssues.some((i) => i.code === "missing-estimate-assumption")).toBe(true);
    expect(audit.score).toBeGreaterThanOrEqual(0);
    expect(audit.score).toBeLessThanOrEqual(100);
    expect(audit.grade).toBe("draft-incomplete");
  });
});

describe("4. 에디토리얼 Markdown 바이블 & JSON 패키지 내보내기", () => {
  it("exportPitchBibleMarkdown이 12장 섹션·4인 표·12부작/60화·4대 2차 판권·[추정] 안내를 모두 포함한다", () => {
    const deck = buildPitchBibleDeck(createPitchBibleStarter("action-fantasy"));
    const md = exportPitchBibleMarkdown(deck);
    for (let i = 1; i <= 12; i += 1) {
      expect(md).toContain(`## ${String(i).padStart(2, "0")}.`);
    }
    expect(md).toContain("dataSourceKind: `estimate`");
    expect(md).toContain("추정");
    expect(md).toContain("강하진");
    expect(md).toContain("12부작 / 60화");
    expect(md).toContain("단행본·글로벌 출판");
    expect(md).toContain("굿즈·컬렉터블");
    expect(md).toContain("애니·드라마 영상화");
    expect(md).toContain("게임·인터랙티브");
  });

  it("exportPitchBibleMarkdown이 영문 로케일과 감사 경고 목록을 정상 반영한다", () => {
    const starter = createPitchBibleStarter("modern-romance");
    const deck = buildPitchBibleDeck({ ...starter, logline: { ...starter.logline, loglineKo: "짧은 로그라인" } });
    const md = exportPitchBibleMarkdown(deck, undefined, { locale: "en" });
    expect(md).toContain("Global IP Pitch Bible (12 Slides)");
    expect(md).toContain("## 02. Logline (25-45 Char Check)");
    expect(md).toContain("[WARNING] (logline)");
  });

  it("exportPitchBibleJson이 스키마 버전·dataSourceKind='estimate'·12장 덱·감사 결과를 파싱 가능한 JSON으로 출력한다", () => {
    const deck = buildPitchBibleDeck(createPitchBibleStarter("mystery-thriller"));
    const raw = exportPitchBibleJson(deck);
    const parsed = JSON.parse(raw) as {
      schemaVersion: string;
      dataSourceKind: string;
      badgeLabelKo: string;
      deck: { slides: unknown[]; allEstimatesTagged: boolean };
      audit: { score: number; dataSourceKind: string };
    };
    expect(parsed.schemaVersion).toBe(PITCH_BIBLE_SCHEMA_VERSION);
    expect(parsed.dataSourceKind).toBe("estimate");
    expect(parsed.badgeLabelKo).toBe("추정");
    expect(parsed.deck.slides).toHaveLength(12);
    expect(parsed.deck.allEstimatesTagged).toBe(true);
    expect(parsed.audit.score).toBe(100);
    expect(parsed.audit.dataSourceKind).toBe("estimate");
  });

  it("formatEstimateRangeLabel이 국문(추정)과 영문(Estimate) 범위 문자열을 일관되게 포맷한다", () => {
    const range = createPitchEstimateRange({
      minAmount: 10, maxAmount: 25, unitKo: "억원", unitEn: "100M KRW", assumptionKo: "가정", assumptionEn: "Assumption",
    });
    expect(formatEstimateRangeLabel(range, "ko")).toContain("10~25 억원 (추정)");
    expect(formatEstimateRangeLabel(range, "en")).toContain("10~25 100M KRW (Estimate)");
  });
});

describe("5. StudioGlobalIpPitchPanel 단독 렌더 및 실시간 편집 UI", () => {
  it("Props 없이 단독 렌더(<StudioGlobalIpPitchPanel />)되며 추정 배지·12장 내비게이터·100/100 점수를 표시한다", () => {
    render(<StudioGlobalIpPitchPanel />);
    expect(screen.getByTestId("studio-global-ip-pitch-panel")).toBeTruthy();
    expect(screen.getByTestId("pitch-estimate-badge").textContent).toBe("추정");
    expect(screen.getByTestId("pitch-kpi-score").textContent).toBe("100/100");
    expect(screen.getByTestId("pitch-kpi-season").textContent).toContain("12부작 / 60화");
    expect(screen.getByTestId("pitch-audit-clean")).toBeTruthy();
    for (const slideId of PITCH_SLIDE_IDS) {
      expect(screen.getByTestId(`pitch-nav-${slideId}`)).toBeTruthy();
    }
  });

  it("3종 장르 스타터 전환과 기본 복원 버튼이 실시간으로 원고를 교체·초기화한다", () => {
    render(<StudioGlobalIpPitchPanel />);
    fireEvent.click(screen.getByTestId("pitch-starter-modern-romance"));
    expect((screen.getByTestId("pitch-input-title-ko") as HTMLInputElement).value).toContain("편집자의 서재");

    fireEvent.click(screen.getByTestId("pitch-starter-mystery-thriller"));
    expect((screen.getByTestId("pitch-input-title-ko") as HTMLInputElement).value).toContain("안개항");

    fireEvent.change(screen.getByTestId("pitch-input-title-ko"), { target: { value: "임시 수정 제목" } });
    expect((screen.getByTestId("pitch-input-title-ko") as HTMLInputElement).value).toBe("임시 수정 제목");

    fireEvent.click(screen.getByTestId("pitch-reset-btn"));
    expect((screen.getByTestId("pitch-input-title-ko") as HTMLInputElement).value).toContain("안개항");
  });

  it("12장 내비게이터와 이전/다음 버튼으로 1번부터 12번까지 모든 슬라이드 편집기를 순회할 수 있다", () => {
    render(<StudioGlobalIpPitchPanel />);
    expect(screen.getByTestId("pitch-active-slide-num").textContent).toBe("01 / 12");
    expect(screen.getByTestId("pitch-editor-cover")).toBeTruthy();

    for (let i = 1; i < PITCH_SLIDE_IDS.length; i += 1) {
      fireEvent.click(screen.getByTestId("pitch-next-slide-btn"));
      expect(screen.getByTestId("pitch-active-slide-num").textContent).toBe(`${String(i + 1).padStart(2, "0")} / 12`);
      expect(screen.getByTestId(`pitch-editor-${PITCH_SLIDE_IDS[i]}`)).toBeTruthy();
    }
    fireEvent.click(screen.getByTestId("pitch-prev-slide-btn"));
    expect(screen.getByTestId("pitch-active-slide-num").textContent).toBe("11 / 12");
  });

  it("로그라인 실시간 편집 시 글자수 미터·과장 감지가 즉시 갱신되고 감사 리포트에서 해당 슬라이드로 이동한다", () => {
    render(<StudioGlobalIpPitchPanel />);
    fireEvent.click(screen.getByTestId("pitch-nav-logline"));
    fireEvent.change(screen.getByTestId("pitch-input-logline"), { target: { value: "무조건 1위 흥행 보장" } });

    expect(screen.getByTestId("pitch-audit-issue-logline-length-out-of-range")).toBeTruthy();
    expect(screen.getAllByTestId("pitch-audit-issue-exaggerated-claim").length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByTestId("pitch-nav-contact"));
    expect(screen.getByTestId("pitch-active-slide-num").textContent).toBe("12 / 12");

    fireEvent.click(screen.getByTestId("pitch-jump-logline-logline-length-out-of-range"));
    expect(screen.getByTestId("pitch-active-slide-num").textContent).toBe("02 / 12");
  });

  it("캐릭터·시즌 아크·2차 판권 추정 예산·협업 문의 편집이 실시간 감사 점수에 반영된다", () => {
    render(<StudioGlobalIpPitchPanel />);

    fireEvent.click(screen.getByTestId("pitch-nav-core-characters"));
    fireEvent.click(screen.getByTestId("pitch-char-tab-1"));
    fireEvent.change(screen.getByTestId("pitch-char-desire"), { target: { value: "" } });
    expect(screen.getByTestId("pitch-audit-issue-incomplete-core-characters")).toBeTruthy();

    fireEvent.click(screen.getByTestId("pitch-nav-season-arc"));
    fireEvent.change(screen.getByTestId("pitch-arc-episodes-0"), { target: { value: "5" } });
    expect(screen.getByTestId("pitch-kpi-season").textContent).toContain("14부작");
    expect(screen.getByTestId("pitch-audit-issue-season-arc-ratio-mismatch")).toBeTruthy();

    fireEvent.click(screen.getByTestId("pitch-nav-secondary-rights"));
    fireEvent.change(screen.getByTestId("pitch-rights-est-print-min"), { target: { value: "99" } });
    expect(screen.getByTestId("pitch-audit-issue-inverted-estimate-range")).toBeTruthy();

    fireEvent.click(screen.getByTestId("pitch-nav-contact"));
    fireEvent.change(screen.getByTestId("pitch-contact-email"), { target: { value: "not-an-email" } });
    expect(screen.getByTestId("pitch-audit-issue-missing-contact-details")).toBeTruthy();
  });

  it("Markdown/JSON 미리보기 탭·복사 버튼·영문 로케일·콜백이 정확히 동작한다", () => {
    const onDeckChange = vi.fn();
    const onExportMarkdown = vi.fn();
    const onExportJson = vi.fn();

    render(
      <StudioGlobalIpPitchPanel
        locale="en"
        initialGenreId="modern-romance"
        onDeckChange={onDeckChange}
        onExportMarkdown={onExportMarkdown}
        onExportJson={onExportJson}
      />,
    );

    expect(onDeckChange).toHaveBeenCalled();
    expect(screen.getByTestId("pitch-estimate-badge").textContent).toBe("Estimate");
    expect(screen.getByTestId("pitch-copy-markdown-btn").textContent).toContain("Copy Markdown");

    fireEvent.click(screen.getByTestId("pitch-copy-markdown-btn"));
    expect(onExportMarkdown).toHaveBeenCalledTimes(1);
    expect(onExportMarkdown.mock.calls[0]?.[0]).toContain("Eleven PM at the Editor's Desk");

    fireEvent.click(screen.getByTestId("pitch-copy-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain(PITCH_BIBLE_SCHEMA_VERSION);
    expect(screen.getByTestId("pitch-export-preview").textContent).toContain('"dataSourceKind": "estimate"');

    fireEvent.click(screen.getByTestId("pitch-export-tab-hidden"));
    expect(screen.queryByTestId("pitch-export-preview")).toBeNull();
  });
});

describe("6. 코드 위생 및 Calm Atelier 규율 자가 검증", () => {
  it("4개 파일 800줄 이하 및 금지 패턴 0건·필수 Calm Atelier 토큰 사용을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "global-ip-pitch-engine.ts",
      "StudioGlobalIpPitchPanel.tsx",
      "index.ts",
      "global-ip-pitch-studio.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "global-ip-pitch-studio.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }

      if (file === "StudioGlobalIpPitchPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("추정");
      }
    }
  });
});
