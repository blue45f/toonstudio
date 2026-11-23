// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { IdeaToWebtoonPipelinePanel } from "./IdeaToWebtoonPipelinePanel";
import { IDEA_PROMPT_PRESETS } from "./idea-to-episode-catalog";
import {
  auditEpisodeContinuity,
  autoRepairEpisodeContinuity,
  compileIdeaToWebtoonEpisode,
  injectDemoContinuityFaults,
  serializeEpisodeBlueprintJson,
  validateToonStudioBlueprintJson,
} from "./idea-to-episode-pipeline";
import {
  EPISODE_LENGTH_SPECS,
  MAX_BUBBLES_PER_PANEL,
  MAX_BUBBLE_CHAR_LENGTH,
  WEBTOON_GENRE_IDS,
  type CompiledWebtoonEpisodePlan,
} from "./idea-to-episode-types";

const HANGUL_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/u;
const RAW_HEX_RE = /#[0-9a-fA-F]{3,8}\b/;

describe("1. 6종 장르 × 3종 분량(4/12/24컷) 결정론적 6단계 파이프라인 컴파일", () => {
  it("18개 전 조합에서 동일한 입력은 동일한 결과를 산출하고 5대 연속성 규칙을 초기 통과한다", () => {
    for (const genre of WEBTOON_GENRE_IDS) {
      for (const lengthSpec of EPISODE_LENGTH_SPECS) {
        const input = {
          logline: "",
          genre,
          lengthId: lengthSpec.id,
          locale: "ko" as const,
        };
        const runA = compileIdeaToWebtoonEpisode(input);
        const runB = compileIdeaToWebtoonEpisode(input);

        // 결정론 불변식
        expect(runA).toEqual(runB);
        expect(runA.stages).toHaveLength(6);
        expect(runA.panels).toHaveLength(lengthSpec.panelCount);

        // Stage 1: 기·승·전·결·엔딩 클리프행어 5비트 완비
        expect(runA.storyBeats.map((beat) => beat.act)).toEqual([
          "setup",
          "development",
          "turn",
          "climax",
          "cliffhanger",
        ]);
        expect(runA.storyBeats.some((beat) => beat.isCliffhanger)).toBe(true);

        // Stage 2: 캐릭터 DNA 락 3인 · 시맨틱 토큰 전용(원시 hex 0건)
        expect(runA.characters).toHaveLength(3);
        for (const character of runA.characters) {
          expect(character.consistencyHash).toMatch(/^DNA-[0-9A-F]{8}$/);
          expect(character.appearanceAnchors.length).toBeGreaterThanOrEqual(2);
          expect(character.propsInventory.length).toBeGreaterThanOrEqual(1);
          expect(character.relationships.length).toBeGreaterThanOrEqual(1);
          for (const token of character.signaturePaletteTokens) {
            expect(token.cssVar).toMatch(/^var\(--color-/);
            expect(RAW_HEX_RE.test(token.cssVar)).toBe(false);
          }
        }

        // Stage 3: 스크롤 호흡 및 최종 컷 클리프행어
        const lastPanel = runA.panels[runA.panels.length - 1];
        expect(lastPanel.isCliffhangerPanel).toBe(true);
        expect(lastPanel.gutterBeforePx).toBeGreaterThanOrEqual(360);

        // Stage 4: 초기 생성본 연속성 100점 · 0건 모순
        expect(runA.continuityAudit.passed).toBe(true);
        expect(runA.continuityAudit.findings).toHaveLength(0);
        expect(runA.continuityAudit.score).toBe(100);

        // Stage 5: 적응형 OST 큐가 첫 컷~끝 컷을 누락 없이 커버
        expect(runA.ostCues.length).toBeGreaterThanOrEqual(3);
        expect(runA.ostCues[0].startPanelIndex).toBe(1);
        expect(runA.ostCues[runA.ostCues.length - 1].endPanelIndex).toBe(
          lengthSpec.panelCount,
        );

        // Stage 6: 블루프린트 JSON 스키마 무결성 통과
        const serialized = serializeEpisodeBlueprintJson(runA);
        const validation = validateToonStudioBlueprintJson(serialized);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
      }
    }
  });

  it("사용자 커스텀 1줄 로그라인이 시드와 에피소드 제목에 결정론적으로 반영된다", () => {
    const planA = compileIdeaToWebtoonEpisode({
      logline: "폐교 음악실에서 자정마다 울리는 피아노가 과거의 범인을 지목한다.",
      genre: "thriller",
      lengthId: "prologue-12",
      locale: "ko",
    });
    const planB = compileIdeaToWebtoonEpisode({
      logline: "지하 도서관의 고서가 매일 아침 주인공의 내일을 미리 써 내려간다.",
      genre: "thriller",
      lengthId: "prologue-12",
      locale: "ko",
    });

    expect(planA.deterministicSeed).not.toBe(planB.deterministicSeed);
    expect(planA.episodeTitle.ko).toContain("폐교 음악실");
    expect(planA.storyBeats[0].summary.ko).toContain("폐교 음악실");
    // EN 텍스트에는 한국어 커스텀 로그라인이 유출되지 않는다
    expect(HANGUL_RE.test(planA.episodeTitle.en)).toBe(false);
    expect(HANGUL_RE.test(planA.storyBeats[0].summary.en)).toBe(false);
  });
});

describe("2. Stage 4 장기 연재 연속성·모순 감사기 & 원클릭 자동 교정", () => {
  it("의도적 연속성 모순 5종을 정확히 검출하고 autoRepairEpisodeContinuity로 0건까지 완전 해소한다", () => {
    const clean = compileIdeaToWebtoonEpisode({
      logline: IDEA_PROMPT_PRESETS[0].logline.ko,
      genre: "romance-fantasy",
      lengthId: "prologue-12",
      locale: "ko",
    });

    const faulted = injectDemoContinuityFaults(clean);
    const audit = auditEpisodeContinuity(faulted);

    expect(audit.passed).toBe(false);
    expect(audit.score).toBeLessThan(100);
    expect(audit.countsByRule.OUTFIT_MISMATCH).toBeGreaterThanOrEqual(1);
    expect(audit.countsByRule.TIMELINE_REGRESSION).toBeGreaterThanOrEqual(1);
    expect(audit.countsByRule.DIALOGUE_BUBBLE_OVERLOAD).toBeGreaterThanOrEqual(1);
    expect(audit.countsByRule.MISSING_CLIFFHANGER).toBeGreaterThanOrEqual(1);
    expect(audit.countsByRule.MONOTONOUS_SHOT_SEQUENCE).toBeGreaterThanOrEqual(1);

    const repaired = autoRepairEpisodeContinuity(faulted);
    const postAudit = auditEpisodeContinuity(repaired);

    expect(postAudit.findings).toHaveLength(0);
    expect(postAudit.passed).toBe(true);
    expect(postAudit.score).toBe(100);
    expect(repaired.repairCount).toBe(1);
    expect(repaired.stages.find((s) => s.stageId === "continuity-audit")?.status).toBe("repaired");

    // 개별 교정 결과 불변식 검증
    const lead = repaired.characters[0];
    expect(repaired.panels[1].outfitAssignments[lead.id]).toBe(lead.lockedOutfitId);

    for (const panel of repaired.panels) {
      expect(panel.dialogues.length).toBeLessThanOrEqual(MAX_BUBBLES_PER_PANEL);
      for (const bubble of panel.dialogues) {
        expect(bubble.text.ko.length).toBeLessThanOrEqual(MAX_BUBBLE_CHAR_LENGTH);
        expect(bubble.text.en.length).toBeLessThanOrEqual(MAX_BUBBLE_CHAR_LENGTH);
      }
    }

    // 연속 3컷 동일 샷 0건
    for (let i = 2; i < repaired.panels.length; i += 1) {
      const tripleSame =
        repaired.panels[i].cameraShot === repaired.panels[i - 1].cameraShot &&
        repaired.panels[i - 1].cameraShot === repaired.panels[i - 2].cameraShot;
      expect(tripleSame).toBe(false);
    }

    // 마지막 컷 클리프행어 복구 & JSON 동기화
    const last = repaired.panels[repaired.panels.length - 1];
    expect(last.isCliffhangerPanel).toBe(true);
    expect(last.tensionScore).toBeGreaterThanOrEqual(90);
    expect(repaired.studioBlueprint.auditSummary.passed).toBe(true);
    expect(repaired.studioBlueprint.auditSummary.findingCount).toBe(0);
  });

  it("회상(isFlashback) 컷은 과거 시간대를 써도 시간대 역행 오류로 오탐하지 않는다", () => {
    const clean = compileIdeaToWebtoonEpisode({
      logline: IDEA_PROMPT_PRESETS[2].logline.ko,
      genre: "murim",
      lengthId: "prologue-12",
      locale: "ko",
    });

    const withFlashback: CompiledWebtoonEpisodePlan = {
      ...clean,
      panels: clean.panels.map((panel, idx) =>
        idx === 5
          ? { ...panel, timeOfDay: "dawn", timeSlotOrder: 0, isFlashback: true }
          : panel,
      ),
    };

    const report = auditEpisodeContinuity(withFlashback);
    expect(report.countsByRule.TIMELINE_REGRESSION).toBe(0);
    expect(report.passed).toBe(true);
  });
});

describe("3. Stage 6 ToonStudio 프로젝트 블루프린트 JSON 직렬화 및 검증", () => {
  it("직렬화된 프로젝트 JSON의 캔버스 좌표·레이어·캐릭터 바이블·OST 큐가 스키마와 일치한다", () => {
    const plan = compileIdeaToWebtoonEpisode({
      logline: IDEA_PROMPT_PRESETS[1].logline.ko,
      genre: "modern-fantasy",
      lengthId: "full-24",
      locale: "ko",
    });

    const json = serializeEpisodeBlueprintJson(plan);
    const result = validateToonStudioBlueprintJson(json);

    expect(result.valid).toBe(true);
    expect(result.document?.schemaVersion).toBe("toonstudio.episode-blueprint.v2");
    expect(result.document?.panels).toHaveLength(24);
    expect(result.document?.layers).toHaveLength(8);
    expect(result.document?.canvas.totalHeightPx).toBe(plan.totalStripHeightPx);
    expect(RAW_HEX_RE.test(json)).toBe(false);
  });

  it("잘못된 JSON 문법·버전 불일치·겹치는 패널 좌표를 정확히 거부한다", () => {
    expect(validateToonStudioBlueprintJson("{invalid-json").valid).toBe(false);

    const plan = compileIdeaToWebtoonEpisode({
      logline: "Test premise",
      genre: "action-noir",
      lengthId: "shorts-4",
      locale: "en",
    });
    const broken = {
      ...plan.studioBlueprint,
      schemaVersion: "legacy.v0",
      panels: plan.studioBlueprint.panels.map((panel, idx) =>
        idx === 1 ? { ...panel, yOffsetPx: 0 } : panel,
      ),
    };
    const validation = validateToonStudioBlueprintJson(JSON.stringify(broken));
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("4. IdeaToWebtoonPipelinePanel UI 생성 · 자동 교정 · JSON 내보내기 · EN 모드 한글 0자", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    useI18n.setState({ lang: "ko" });
  });

  it("초기 워크벤치 렌더링, 4종 추천 칩, 장르·분량 전환, 커스텀 아이디어 생성이 동작한다", () => {
    render(<IdeaToWebtoonPipelinePanel />);

    expect(screen.getByTestId("idea-to-webtoon-pipeline-panel")).toBeTruthy();
    expect(screen.getByTestId("i2w-stage-stepper").querySelectorAll("li")).toHaveLength(6);
    expect(screen.getByTestId("i2w-preset-chips").querySelectorAll("button")).toHaveLength(4);
    expect(screen.getByTestId("i2w-genre-selector").querySelectorAll("button")).toHaveLength(6);
    expect(screen.getByTestId("i2w-length-selector").querySelectorAll("button")).toHaveLength(3);
    expect(screen.getByTestId("i2w-ost-emotion-svg")).toBeTruthy();

    // 4컷 쇼츠 프리셋(액션느와르) 클릭 -> 4컷 즉시 갱신
    fireEvent.click(screen.getByTestId("i2w-preset-noir-rain-witness"));
    expect(
      screen.getByTestId("i2w-panel-strip-list").querySelectorAll("article"),
    ).toHaveLength(4);

    // 24컷 정규화로 전환 -> 24컷 즉시 갱신
    fireEvent.click(screen.getByTestId("i2w-length-full-24"));
    expect(
      screen.getByTestId("i2w-panel-strip-list").querySelectorAll("article"),
    ).toHaveLength(24);

    // 커스텀 1줄 아이디어 입력 및 생성
    const input = screen.getByTestId("i2w-logline-input") as HTMLInputElement;
    fireEvent.change(input, {
      target: { value: "고장 난 엘리베이터가 13층 대신 1999년 옥상으로 문을 연다." },
    });
    fireEvent.click(screen.getByTestId("i2w-generate-btn"));
    expect(screen.getByTestId("i2w-status-banner").textContent).toContain("24컷");
  });

  it("모순 5종 시뮬레이션 -> 검출 배지 표시 -> 원클릭 자동 교정으로 모순 0건 복구 & JSON 내보내기", () => {
    const onExport = vi.fn();
    render(<IdeaToWebtoonPipelinePanel onExportBlueprintJson={onExport} />);

    const repairBtn = screen.getByTestId("i2w-auto-repair-btn") as HTMLButtonElement;
    expect(repairBtn.disabled).toBe(true);
    expect(screen.getByTestId("i2w-audit-finding-count").textContent).toContain("0건");

    // 의도적 모순 5종 시뮬레이션
    fireEvent.click(screen.getByTestId("i2w-simulate-faults-btn"));
    expect(repairBtn.disabled).toBe(false);
    expect(screen.getByTestId("i2w-audit-findings-list").querySelectorAll("li").length).toBeGreaterThanOrEqual(5);

    // 원클릭 자동 교정 실행
    fireEvent.click(repairBtn);
    expect(repairBtn.disabled).toBe(true);
    expect(screen.getByTestId("i2w-audit-finding-count").textContent).toContain("0건");
    expect(screen.getByTestId("i2w-continuity-score-badge").textContent).toContain("100점");
    expect(screen.getByTestId("i2w-repair-count-badge")).toBeTruthy();

    // ToonStudio 프로젝트 JSON 내보내기
    fireEvent.click(screen.getByTestId("i2w-export-json-btn"));
    expect(onExport).toHaveBeenCalledTimes(1);
    const [exportedJson] = onExport.mock.calls[0] as [string];
    expect(validateToonStudioBlueprintJson(exportedJson).valid).toBe(true);
    expect(screen.getByTestId("i2w-json-preview").textContent).toContain(
      "toonstudio.episode-blueprint.v2",
    );
  });

  it("EN 모드에서는 초기 화면·프리셋 전환·모순 시뮬레이션·자동 교정·JSON 미리보기 전 영역에 한글이 0자다", () => {
    useI18n.setState({ lang: "en" });
    const { container } = render(<IdeaToWebtoonPipelinePanel />);

    const assertZeroHangul = () => {
      expect(container.textContent ?? "").not.toMatch(HANGUL_RE);
      const input = screen.getByTestId("i2w-logline-input") as HTMLInputElement;
      expect(input.value).not.toMatch(HANGUL_RE);
      expect(input.placeholder).not.toMatch(HANGUL_RE);
      const ariaEls = container.querySelectorAll("[aria-label]");
      for (const el of ariaEls) {
        expect(el.getAttribute("aria-label") ?? "").not.toMatch(HANGUL_RE);
      }
    };

    // 1) 초기 EN 화면
    assertZeroHangul();

    // 2) 프리셋 칩 + 장르 전환
    fireEvent.click(screen.getByTestId("i2w-preset-murim-broken-blade"));
    assertZeroHangul();

    fireEvent.click(screen.getByTestId("i2w-genre-slice-of-comedy"));
    assertZeroHangul();

    // 3) 모순 5종 시뮬레이션
    fireEvent.click(screen.getByTestId("i2w-simulate-faults-btn"));
    expect(screen.getByTestId("i2w-audit-findings-list").querySelectorAll("li").length).toBeGreaterThanOrEqual(5);
    assertZeroHangul();

    // 4) 원클릭 자동 교정 + JSON 미리보기
    fireEvent.click(screen.getByTestId("i2w-auto-repair-btn"));
    fireEvent.click(screen.getByTestId("i2w-export-json-btn"));
    expect(screen.getByTestId("i2w-json-preview")).toBeTruthy();
    assertZeroHangul();
  });
});
