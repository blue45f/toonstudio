// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { ClassroomCritiqueRubricPanel } from "./ClassroomCritiqueRubricPanel";
import { LearningClassroomPage } from "./LearningClassroomPage";
import {
  FIVE_AXIS_RUBRIC_SPECS,
  RUBRIC_AXIS_ORDER,
  addRedlinePin,
  buildNonExportableOverlayModel,
  buildStudentPortfolioBundle,
  createInitialClassroomSubmissions,
  evaluateFiveAxisRubric,
  toggleRedlinePinResolved,
} from "./classroom-critique-rubric";

const HANGUL_REGEX = /[가-힣]/u;
const INITIAL_LANG = useI18n.getState().lang;

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useI18n.setState({ lang: INITIAL_LANG });
});

describe("교실 5축 루브릭 · 붉은펜/음성 첨삭 · 비출력 오버레이 · 학기 포트폴리오 엔진", () => {
  it("5축 실기 루브릭 등급(S/A/B/C), 포트폴리오 통과 기준(B등급 이상), 자동 보완 가이드를 계산한다", () => {
    expect(FIVE_AXIS_RUBRIC_SPECS).toHaveLength(5);
    expect(RUBRIC_AXIS_ORDER).toEqual([
      "direction-composition",
      "perspective-anatomy",
      "lineart-pressure",
      "balloon-readability",
      "finish-polish",
    ]);

    const gradeS = evaluateFiveAxisRubric({
      "direction-composition": 5,
      "perspective-anatomy": 5,
      "lineart-pressure": 5,
      "balloon-readability": 4,
      "finish-polish": 4,
    });
    expect(gradeS.totalScore).toBe(23);
    expect(gradeS.grade).toBe("S");
    expect(gradeS.portfolioEligible).toBe(true);
    expect(gradeS.improvementGuides[0]?.priority).toBe("polish");

    const gradeA = evaluateFiveAxisRubric({
      "direction-composition": 4,
      "perspective-anatomy": 4,
      "lineart-pressure": 4,
      "balloon-readability": 4,
      "finish-polish": 4,
    });
    expect(gradeA.grade).toBe("A");
    expect(gradeA.portfolioEligible).toBe(true);

    const gradeB = evaluateFiveAxisRubric({
      "direction-composition": 3,
      "perspective-anatomy": 3,
      "lineart-pressure": 3,
      "balloon-readability": 3,
      "finish-polish": 3,
    });
    expect(gradeB.totalScore).toBe(15);
    expect(gradeB.grade).toBe("B");
    expect(gradeB.portfolioEligible).toBe(true);

    const gradeC = evaluateFiveAxisRubric({
      "direction-composition": 3,
      "perspective-anatomy": 2,
      "lineart-pressure": 1,
      "balloon-readability": 3,
      "finish-polish": 2,
    });
    expect(gradeC.totalScore).toBe(11);
    expect(gradeC.grade).toBe("C");
    expect(gradeC.portfolioEligible).toBe(false);
    expect(gradeC.weakestAxisId).toBe("lineart-pressure");
    expect(gradeC.improvementGuides[0]?.priority).toBe("critical");
    expect(HANGUL_REGEX.test(gradeC.summaryEn)).toBe(false);
    expect(HANGUL_REGEX.test(gradeC.gradeLabelEn)).toBe(false);
  });

  it("붉은펜 좌표 클램핑, 1클릭 완료 토글, 비출력 캔버스 오버레이(exportable: false) 모델을 생성한다", () => {
    const [first, second] = createInitialClassroomSubmissions();
    const added = addRedlinePin(second.redlinePins, {
      id: "pin-edge",
      cutId: second.cutLabel,
      xPct: 142.8,
      yPct: -12,
      axisId: "lineart-pressure",
      severity: "must-fix",
      noteKo: "어깨 외곽 틈새 봉합",
      noteEn: "Seal shoulder contour gap",
      checklistItemKo: "어깨선 봉합",
      checklistItemEn: "Close shoulder stroke",
      voiceNote: {
        durationSec: 15,
        transcriptKo: "어깨선 끝을 닫아 주세요.",
        transcriptEn: "Close the shoulder edge cleanly.",
        recordedAtIso: "2026-11-23T10:00:00Z",
      },
    });
    const edgePin = added.find((pin) => pin.id === "pin-edge");
    expect(edgePin?.xPct).toBe(100);
    expect(edgePin?.yPct).toBe(0);
    expect(edgePin?.resolved).toBe(false);

    const resolved = toggleRedlinePinResolved(added, "pin-edge", "2026-11-23T11:00:00Z");
    expect(resolved.find((pin) => pin.id === "pin-edge")?.resolved).toBe(true);

    const overlay = buildNonExportableOverlayModel({ ...second, redlinePins: resolved });
    expect(overlay.schemaVersion).toBe("toonstudio.redline-overlay.v1");
    expect(overlay.layerName).toBe("99_NONPRINT_INSTRUCTOR_REDLINE");
    expect(overlay.exportable).toBe(false);
    expect(overlay.printVisible).toBe(false);
    expect(overlay.totalPinCount).toBe(3);
    expect(overlay.unresolvedPinCount).toBe(2);
    expect(overlay.voiceNoteCount).toBe(2);
    expect(first.redlinePins[0]?.resolved).toBe(true);
  });

  it("B등급 이상 과제만 선별해 웹·인쇄·JSON 학생 학기 포트폴리오 번들을 생성한다", () => {
    const submissions = createInitialClassroomSubmissions();
    const bundle = buildStudentPortfolioBundle(submissions, {
      studentId: "stu-jiwoo",
      studentNameKo: "김지우",
      studentNameEn: "Jiwoo Kim",
      classroomNameKo: "웹툰 제작 입문 · 8주",
      classroomNameEn: "Webtoon Foundation · 8 Weeks",
    });

    // 초기 3편 중 S(23점), B(17점) 2편 포함, C(12점) 1편 제외
    expect(bundle.includedWorks).toHaveLength(2);
    expect(bundle.excludedSubmissionIds).toEqual(["sub-w5-ink-draft"]);
    expect(bundle.includedWorks[0]?.grade).toBe("S");
    expect(bundle.includedWorks[1]?.grade).toBe("B");
    expect(bundle.overallAverageScore).toBe(20);
    expect(bundle.overallGrade).toBe("A");

    const parsedJson = JSON.parse(bundle.jsonPayload) as { includedWorks: unknown[]; minimumPassingGrade: string };
    expect(parsedJson.includedWorks).toHaveLength(2);
    expect(parsedJson.minimumPassingGrade).toBe("B");
    expect(HANGUL_REGEX.test(bundle.webSummaryEn)).toBe(false);
    expect(HANGUL_REGEX.test(bundle.printableMarkdownEn)).toBe(false);
  });
});

describe("교실 폐루프 UI 상호작용 & EN 모드 한글 0자 계약", () => {
  it("붉은펜 핀 추가·수정 완료, 5축 루브릭 상향 시 포트폴리오 자동 편입, LearningClassroomPage 지연 마운트를 검증한다", async () => {
    render(
      <MemoryRouter initialEntries={["/learn/classroom"]}>
        <ClassroomCritiqueRubricPanel classroomName="웹툰 제작 입문 · 8주" />
      </MemoryRouter>,
    );

    // 1. 초기 붉은펜 핀 + 음성 첨삭 노트 표시 및 1클릭 수정 완료
    expect(screen.getByTestId("ccr-voice-note-card")).toBeTruthy();
    expect(screen.getByTestId("ccr-pin-pin-02").getAttribute("data-resolved")).toBe("false");
    fireEvent.click(screen.getByTestId("ccr-toggle-pin-resolved-btn"));
    expect(screen.getByTestId("ccr-pin-pin-02").getAttribute("data-resolved")).toBe("true");

    // 2. 강사 모드에서 새 붉은펜 핀 + 음성 노트 추가
    fireEvent.change(screen.getByLabelText("붉은펜 수정 지시"), {
      target: { value: "배경 소실선 재정렬" },
    });
    fireEvent.change(screen.getByLabelText("음성 첨삭 메모 (선택)"), {
      target: { value: "골목 우측 담장 각도만 맞춰 주세요." },
    });
    fireEvent.click(screen.getByRole("button", { name: "좌표에 붉은펜 핀 추가" }));
    expect(screen.getByTestId("ccr-active-pin-detail").textContent).toContain("배경 소실선 재정렬");

    // 3. 비출력 오버레이 모델 미리보기 확인
    fireEvent.click(screen.getByTestId("ccr-toggle-overlay-btn"));
    expect(screen.getByTestId("ccr-overlay-export-preview").textContent).toContain('"exportable": false');

    // 4. C등급 과제(sub-w5-ink-draft) 점수를 B등급으로 올려 포트폴리오 편입(2편 -> 3편)
    expect(screen.getByTestId("ccr-portfolio-summary").textContent).toContain("통과 작품 2편");
    fireEvent.click(screen.getByTestId("ccr-submission-sub-w5-ink-draft"));
    expect(screen.getByTestId("ccr-rubric-grade-badge").textContent).toContain("C");
    fireEvent.click(screen.getByTestId("rubric-lineart-pressure-5"));
    expect(screen.getByTestId("ccr-rubric-grade-badge").textContent).toContain("B");
    expect(screen.getByTestId("ccr-portfolio-summary").textContent).toContain("통과 작품 3편");

    // 5. 1클릭 포트폴리오 생성 및 인쇄/JSON 전환
    fireEvent.click(screen.getByTestId("ccr-build-portfolio-btn"));
    expect(screen.getByTestId("ccr-portfolio-status").textContent).toContain("3편 수록");
    fireEvent.click(screen.getByRole("button", { name: "인쇄용 마크다운" }));
    expect(screen.getByTestId("ccr-portfolio-print-preview").textContent).toContain("# 김지우");
    fireEvent.click(screen.getByRole("button", { name: "JSON 데이터" }));
    expect(screen.getByTestId("ccr-portfolio-json-preview").textContent).toContain("toonstudio.classroom-portfolio.v1");

    // 6. LearningClassroomPage에서 지연 마운트 정상 동작 확인
    cleanup();
    render(
      <MemoryRouter initialEntries={["/learn/classroom"]}>
        <LearningClassroomPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("classroom-critique-rubric-panel")).toBeTruthy();
    });
  });

  it("EN 모드에서는 한국어 classroomName이 전달되어도 전체 패널 텍스트에 한글이 0자다", () => {
    useI18n.setState({ lang: "en" });
    const { container } = render(
      <MemoryRouter initialEntries={["/learn/classroom"]}>
        <ClassroomCritiqueRubricPanel classroomName="웹툰 제작 입문 · 8주" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("ccr-build-portfolio-btn"));
    fireEvent.click(screen.getByRole("button", { name: "Print Sheet" }));
    expect(HANGUL_REGEX.test(container.textContent ?? "")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Web Summary" }));
    expect(HANGUL_REGEX.test(container.textContent ?? "")).toBe(false);

    // 정적 계약: 원시 hex/rgb/hsl 및 transition-all 0건
    const learnDir = resolve(process.cwd(), "apps/web/src/domains/learn");
    const rawColorRegex = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/u;
    for (const file of [
      "classroom-critique-catalog.ts",
      "classroom-critique-rubric.ts",
      "ClassroomCritiqueRubricPanel.tsx",
      "ClassroomPortfolioExportCard.tsx",
      "classroom-critique-rubric.css",
    ]) {
      const content = readFileSync(resolve(learnDir, file), "utf8");
      expect(rawColorRegex.test(content), `raw color in ${file}`).toBe(false);
      expect(content.includes("transition-all"), `transition-all in ${file}`).toBe(false);
    }
  });
});
