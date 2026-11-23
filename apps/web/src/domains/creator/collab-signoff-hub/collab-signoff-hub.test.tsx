// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { CollabSignoffHubPanel } from "./CollabSignoffHubPanel";
import {
  DEFAULT_REVIEW_ROUNDS,
  analyzeReviewRoundsAndSla,
  buildExternalBlindReviewPackage,
  escapeHtml,
  importExternalReviewFeedback,
  parseExternalReviewFeedbackJson,
  type ReviewRoundSnapshot,
} from "./blind-review-and-sla-engine";
import {
  SIGNOFF_STAGE_ORDER,
  advanceEpisodeToNextGate,
  canAdvanceEpisodeToNextGate,
  createInitialEpisodeSignoffBoard,
  recordCutSignoffDecision,
  toggleParallelBgLineartMode,
} from "./multi-role-signoff-engine";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;

describe("collab-signoff-hub: 다중 결재선 · 컷별 부분 승인 · 블라인드 링크 · 라운드 회귀 & SLA", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("7단계 순차 및 선화+3D배경 병렬 게이트 전이와 자동 승격을 정확히 제어한다", () => {
    expect(SIGNOFF_STAGE_ORDER).toEqual([
      "conti",
      "lineart",
      "bg3d",
      "flatting",
      "shading",
      "lettering",
      "pd-final",
    ]);

    // 1) 병렬 게이트 모드: conti 12컷 전원 승인 시 lineart + bg3d 동시 승격
    let parallelBoard = createInitialEpisodeSignoffBoard({
      preset: "fresh",
      cutCount: 12,
      parallelLineartAndBg3d: true,
    });
    expect(parallelBoard.activeStageIds).toEqual(["conti"]);

    for (let i = 1; i <= 11; i += 1) {
      parallelBoard = recordCutSignoffDecision(parallelBoard, {
        cutId: `cut-${String(i).padStart(2, "0")}`,
        stageId: "conti",
        status: "approved",
        reviewerName: "정하윤 작가",
      });
    }
    expect(parallelBoard.activeStageIds).toEqual(["conti"]);
    expect(canAdvanceEpisodeToNextGate(parallelBoard).canAdvance).toBe(false);

    // 수동 승격 전 검사(autoAdvance: false) 후 명시 승격 검증
    const readyBoard = recordCutSignoffDecision(parallelBoard, {
      cutId: "cut-12",
      stageId: "conti",
      status: "approved",
      reviewerName: "정하윤 작가",
      autoAdvance: false,
    });
    const preCheck = canAdvanceEpisodeToNextGate(readyBoard);
    expect(preCheck.canAdvance).toBe(true);
    expect(preCheck.nextStageIds).toEqual(["lineart", "bg3d"]);

    parallelBoard = advanceEpisodeToNextGate(readyBoard, "cut-12", "정하윤 작가");
    expect(parallelBoard.completedStageIds).toEqual(["conti"]);
    expect(parallelBoard.activeStageIds).toEqual(["lineart", "bg3d"]);

    // 선화 12컷 전원 승인해도 3D배경 미완료/반려가 남아 있으면 flatting으로 절대 승격 불가
    for (const cut of parallelBoard.cuts) {
      parallelBoard = recordCutSignoffDecision(parallelBoard, {
        cutId: cut.cutId,
        stageId: "lineart",
        status: "approved",
        reviewerName: "정하윤 작가",
      });
    }
    parallelBoard = recordCutSignoffDecision(parallelBoard, {
      cutId: "cut-05",
      stageId: "bg3d",
      status: "changes-requested",
      reasonTags: ["art"],
      reviewerName: "정하윤 작가",
      comment: "배경 투시 보정",
    });
    expect(parallelBoard.completedStageIds).toContain("lineart");
    expect(parallelBoard.activeStageIds).toEqual(["bg3d"]);
    const blockedCheck = canAdvanceEpisodeToNextGate(parallelBoard);
    expect(blockedCheck.canAdvance).toBe(false);
    expect(blockedCheck.blockedByStageIds).toContain("bg3d");
    expect(blockedCheck.unresolvedRejectionCount).toBe(1);

    // 3D배경 전 컷(반려 컷 포함) 승인 완료 시 flatting으로 자동 승격
    for (const cut of parallelBoard.cuts) {
      parallelBoard = recordCutSignoffDecision(parallelBoard, {
        cutId: cut.cutId,
        stageId: "bg3d",
        status: "approved",
        reviewerName: "정하윤 작가",
      });
    }
    expect(parallelBoard.completedStageIds).toEqual(["conti", "lineart", "bg3d"]);
    expect(parallelBoard.activeStageIds).toEqual(["flatting"]);

    // 2) 순차 게이트 모드: conti -> lineart -> bg3d -> flatting -> shading -> lettering -> pd-final -> final-approved
    let seqBoard = createInitialEpisodeSignoffBoard({
      preset: "fresh",
      cutCount: 4,
      parallelLineartAndBg3d: false,
    });
    for (const stageId of SIGNOFF_STAGE_ORDER) {
      expect(seqBoard.activeStageIds).toEqual([stageId]);
      for (const cut of seqBoard.cuts) {
        seqBoard = recordCutSignoffDecision(seqBoard, {
          cutId: cut.cutId,
          stageId,
          status: "approved",
          reviewerName: "검수자",
        });
      }
    }
    expect(seqBoard.episodeStatus).toBe("final-approved");
    expect(seqBoard.completedStageIds).toEqual(SIGNOFF_STAGE_ORDER);
    expect(canAdvanceEpisodeToNextGate(seqBoard).isEpisodeFullyApproved).toBe(true);
  });

  it("컷별 부분 반려(cut-07) 시 이미 승인된 cut-01..06의 승인 상태와 타임스탬프가 100% 보존된다", () => {
    let board = createInitialEpisodeSignoffBoard({ preset: "in-progress", cutCount: 12 });
    const beforeApprovals = board.cuts.slice(0, 6).map((cut) => ({
      cutId: cut.cutId,
      status: cut.stageStates.lineart.status,
      approvedAtIso: cut.stageStates.lineart.approvedAtIso,
      reviewerName: cut.stageStates.lineart.reviewerName,
    }));
    expect(beforeApprovals.every((item) => item.status === "approved" && Boolean(item.approvedAtIso))).toBe(true);

    board = recordCutSignoffDecision(board, {
      cutId: "cut-07",
      stageId: "lineart",
      status: "changes-requested",
      reviewerName: "김서연 PD",
      reasonTags: ["art", "color", "rating"],
      comment: "인체 비율 및 노출 수위 조정 필요",
      decidedAtIso: "2026-11-23T12:00:00+09:00",
    });

    const cut07 = board.cuts.find((c) => c.cutId === "cut-07");
    expect(cut07?.stageStates.lineart.status).toBe("changes-requested");
    expect(cut07?.stageStates.lineart.reasonTags).toEqual(["art", "color", "rating"]);
    expect(cut07?.stageStates.lineart.approvedAtIso).toBeUndefined();

    // cut-01..06 승인 보존 검증
    for (const prev of beforeApprovals) {
      const current = board.cuts.find((c) => c.cutId === prev.cutId)?.stageStates.lineart;
      expect(current?.status).toBe("approved");
      expect(current?.approvedAtIso).toBe(prev.approvedAtIso);
      expect(current?.reviewerName).toBe(prev.reviewerName);
    }

    const check = canAdvanceEpisodeToNextGate(board, "lineart");
    expect(check.canAdvance).toBe(false);
    expect(check.rejectedCutIdsByStage.lineart).toEqual(["cut-07"]);

    // 병렬 -> 순차 토글 후에도 승인 상태 유지 확인
    const seqToggled = toggleParallelBgLineartMode(board, false);
    expect(seqToggled.activeStageIds).toEqual(["lineart"]);
    expect(seqToggled.cuts[0]?.stageStates.lineart.status).toBe("approved");
  });

  it("외부 블라인드 링크 생성기가 내부 메모를 100% 제거하고 XSS를 차단하며 대각선 워터마크·만료 시각을 포함한다", () => {
    expect(escapeHtml(`<script>alert("x" & 'y')</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;",
    );

    const baseBoard = createInitialEpisodeSignoffBoard({
      preset: "in-progress",
      workTitle: `비밀작품 <script>alert(1)</script>`,
      episodeTitle: `EP.14 <img src=x onerror="evil()">`,
    });

    const pkg = buildExternalBlindReviewPackage({
      board: baseBoard,
      targetStageId: "lineart",
      viewerName: `편집자</script><script>hack()</script>`,
      viewerOrganization: `출판사 & "검수팀"`,
      expiresAtIso: "2026-11-30T23:59:00+09:00",
      hideInternalNotes: true,
    });

    // 1) 블라인드 모드: 내부 공지·어시 메모·내부 코멘트 100% 차단
    expect(pkg.tokenSpec.hideInternalNotes).toBe(true);
    expect(pkg.tokenSpec.strippedInternalNoteCount).toBeGreaterThanOrEqual(4);
    for (const note of baseBoard.internalNotes) {
      expect(pkg.html).not.toContain(note.body);
      expect(pkg.tokenSpecJson).not.toContain(note.body);
    }
    for (const cut of baseBoard.cuts) {
      for (const cutNote of cut.internalStudioNotes) {
        expect(pkg.html).not.toContain(cutNote.body);
      }
    }
    expect(pkg.html).not.toContain("야근 식대 영수증");
    expect(pkg.html).not.toContain("임시 저해상도 파일");
    expect(pkg.html).not.toContain("정산 단가 건");
    expect(pkg.html).not.toContain("선화 밀도 통과");

    // 2) 대각선 반복 워터마크(viewerName · expiresAt) 및 엄격 XSS 방어
    expect(pkg.html).toContain("watermark-layer");
    expect(pkg.html).toContain("rotate(-28deg)");
    expect(pkg.html).toContain("2026-11-30T23:59:00+09:00");
    expect(pkg.html).toContain("&lt;/script&gt;&lt;script&gt;hack()&lt;/script&gt;");
    expect(pkg.html).not.toContain("<script>alert(1)</script>");
    expect(pkg.html).not.toContain("<script>hack()</script>");
    expect(pkg.html).not.toContain(`<img src=x onerror="evil()">`);

    // 3) 외부 CDN/스크립트 0건 + raw hex/rgb/hsl 0건 검증
    expect(pkg.html).not.toMatch(/<script\b[^>]*src=/i);
    expect(pkg.html).not.toMatch(/<link\b[^>]*rel=["']stylesheet["']/i);
    expect(RAW_COLOR_REGEX.test(pkg.html)).toBe(false);

    // 4) 비블라인드 모드(hideInternalNotes: false)에서는 내부 메모가 포함되며 이스케이프 유지
    const nonBlindPkg = buildExternalBlindReviewPackage({
      board: baseBoard,
      targetStageId: "lineart",
      viewerName: "내부 팀장",
      viewerOrganization: "한별 스튜디오",
      expiresAtIso: "2026-11-30T23:59:00+09:00",
      hideInternalNotes: false,
    });
    expect(nonBlindPkg.tokenSpec.strippedInternalNoteCount).toBe(0);
    expect(nonBlindPkg.html).toContain("야근 식대 영수증");
  });

  it("외부 PD 피드백 JSON을 검증·귀속하고 만료 제출·알 수 없는 컷을 안전하게 차단한다", () => {
    const board = createInitialEpisodeSignoffBoard({ preset: "in-progress" });
    const pkg = buildExternalBlindReviewPackage({
      board,
      targetStageId: "lineart",
      viewerName: "김서연 PD",
      viewerOrganization: "문라이트 출판사",
      expiresAtIso: "2026-11-26T18:00:00+09:00",
      hideInternalNotes: true,
    });

    // 잘못된 JSON 방어
    expect(parseExternalReviewFeedbackJson("{broken").items).toHaveLength(0);
    expect(parseExternalReviewFeedbackJson("").errorMessageKo).toBeTruthy();

    // 샘플 피드백 JSON 파싱 및 귀속
    const parsed = parseExternalReviewFeedbackJson(pkg.sampleFeedbackJson);
    expect(parsed.items).toHaveLength(2);

    const result = importExternalReviewFeedback(
      board,
      [
        ...parsed.items,
        {
          cutId: "cut-99",
          stageId: "lineart",
          decision: "changes-requested",
          reasonTags: ["rating"],
          comment: "존재하지 않는 컷",
          reviewerName: "김서연 PD",
        },
        {
          cutId: "cut-11",
          stageId: "lineart",
          decision: "approved",
          comment: "만료 후 제출",
          reviewerName: "김서연 PD",
          submittedAtIso: "2026-12-05T10:00:00+09:00",
        },
      ],
      {
        defaultStageId: "lineart",
        expiresAtIso: "2026-11-26T18:00:00+09:00",
        rejectExpired: true,
      },
    );

    expect(result.appliedCount).toBe(2);
    expect(result.approvedCount).toBe(1);
    expect(result.changesRequestedCount).toBe(1);
    expect(result.ignoredCutIds).toEqual(["cut-99", "cut-11"]);
    expect(result.warnings).toHaveLength(2);

    // cut-07 외부 PD 반려 귀속 + cut-01 기존 승인 보존 검증
    const cut07 = result.board.cuts.find((c) => c.cutId === "cut-07")?.stageStates.lineart;
    expect(cut07?.decisionSource).toBe("external-pd");
    expect(cut07?.status).toBe("changes-requested");
    expect(cut07?.reasonTags).toEqual(["lettering", "pacing"]);
    expect(cut07?.reviewerName).toContain("김서연 PD");
    expect(result.board.cuts[0]?.stageStates.lineart.status).toBe("approved");
  });

  it("검수 라운드(v1->v2->v3) 회귀 핀(regressed)을 자동 적발하고 공정별 SLA·1차 통과율·병목 1위를 정확히 산출한다", () => {
    const defaultReport = analyzeReviewRoundsAndSla(DEFAULT_REVIEW_ROUNDS);
    expect(defaultReport.totalRounds).toBe(3);
    expect(defaultReport.regressedPinCount).toBe(2);
    expect(defaultReport.regressedPins.map((p) => p.pinId)).toEqual([
      "pin-cut07-hand",
      "pin-cut04-balloon",
    ]);
    expect(defaultReport.regressedPins[0]?.resolvedInRound).toBe("v2");
    expect(defaultReport.regressedPins[0]?.reopenedInRound).toBe("v3");
    expect(defaultReport.topRejectionReason?.reasonTag).toBe("art");
    expect(defaultReport.topBottleneckStage?.stageId).toBe("shading");
    expect(defaultReport.slowestStage?.stageId).toBe("shading");

    // 비정렬 라운드(v3, v1, v2) 입력 + 정확한 수치 검증
    const deterministicRounds: readonly ReviewRoundSnapshot[] = [
      {
        roundNumber: 3,
        roundLabel: "v3",
        reviewedAtIso: "2026-11-22T12:00:00+09:00",
        pins: [
          { pinId: "pin-a", cutId: "cut-02", stageId: "bg3d", reasonTag: "color", status: "open", summaryKo: "배경 채도 재이탈" },
          { pinId: "pin-b", cutId: "cut-03", stageId: "lettering", reasonTag: "lettering", status: "resolved", summaryKo: "식자 확정" },
        ],
        stageReviews: [
          { stageId: "bg3d", reviewedCutCount: 10, approvedFirstPassCutCount: 6, reworkCutCount: 4, reviewDurationMinutes: 120 },
          { stageId: "lettering", reviewedCutCount: 10, approvedFirstPassCutCount: 9, reworkCutCount: 1, reviewDurationMinutes: 20 },
        ],
      },
      {
        roundNumber: 1,
        roundLabel: "v1",
        reviewedAtIso: "2026-11-20T12:00:00+09:00",
        pins: [
          { pinId: "pin-a", cutId: "cut-02", stageId: "bg3d", reasonTag: "color", status: "open", summaryKo: "배경 채도 이탈" },
          { pinId: "pin-b", cutId: "cut-03", stageId: "lettering", reasonTag: "lettering", status: "open", summaryKo: "식자 정렬" },
        ],
        stageReviews: [
          { stageId: "bg3d", reviewedCutCount: 10, approvedFirstPassCutCount: 5, reworkCutCount: 5, reviewDurationMinutes: 100 },
          { stageId: "lettering", reviewedCutCount: 10, approvedFirstPassCutCount: 9, reworkCutCount: 1, reviewDurationMinutes: 30 },
        ],
      },
      {
        roundNumber: 2,
        roundLabel: "v2",
        reviewedAtIso: "2026-11-21T12:00:00+09:00",
        pins: [
          { pinId: "pin-a", cutId: "cut-02", stageId: "bg3d", reasonTag: "color", status: "resolved", summaryKo: "배경 채도 수정" },
          { pinId: "pin-b", cutId: "cut-03", stageId: "lettering", reasonTag: "lettering", status: "open", summaryKo: "식자 재수정" },
        ],
        stageReviews: [
          { stageId: "bg3d", reviewedCutCount: 5, approvedFirstPassCutCount: 4, reworkCutCount: 1, reviewDurationMinutes: 110 },
          { stageId: "lettering", reviewedCutCount: 1, approvedFirstPassCutCount: 1, reworkCutCount: 0, reviewDurationMinutes: 25 },
        ],
      },
    ];

    const report = analyzeReviewRoundsAndSla(deterministicRounds);
    expect(report.regressedPinCount).toBe(1);
    expect(report.regressedPins[0]?.pinId).toBe("pin-a");
    expect(report.regressedPins[0]?.lifecycle.map((l) => l.status)).toEqual(["open", "resolved", "regressed"]);

    const bg3d = report.stageSlaReports.find((s) => s.stageId === "bg3d");
    expect(bg3d?.avgReviewDurationMinutes).toBe(110);
    expect(bg3d?.firstPassApprovalRatePct).toBe(50);
    expect(bg3d?.reworkRatePct).toBe(50);
    expect(bg3d?.isOverSla).toBe(true);
    expect(report.topBottleneckStage?.stageId).toBe("bg3d");
  });

  it("CollabSignoffHubPanel UI 3탭 인터랙션·다운로드·외부 피드백 시뮬레이션·EN 모드 및 정적 토큰 위생을 검증한다", () => {
    const createObjectUrlSpy = vi.fn(() => "blob:collab-signoff-url");
    const revokeObjectUrlSpy = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectUrlSpy, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectUrlSpy, configurable: true });
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    // 1) KO 모드 전수 렌더링 및 3탭 인터랙션 (props 없이 호출)
    const { container, unmount } = render(<CollabSignoffHubPanel />);
    expect(screen.getByText("사람 협업 검수 허브")).toBeTruthy();
    expect(container.innerHTML.includes("[word-break:keep-all]")).toBe(true);
    expect(container.innerHTML.includes("tabular-nums")).toBe(true);
    expect(RAW_COLOR_REGEX.test(container.innerHTML)).toBe(false);
    expect(container.innerHTML.includes("transition-all")).toBe(false);
    expect(screen.getByRole("tab", { name: "다중 결재선·컷별 부분 승인" }).getAttribute("aria-selected")).toBe("true");

    // 컷별 부분 반려(cut-02) 시 cut-01 승인 유지 확인
    fireEvent.click(screen.getByRole("button", { name: "식자·말풍선" }));
    fireEvent.click(screen.getByRole("button", { name: "cut-02 반려" }));
    const cut01Card = container.querySelector('[data-cut-card="cut-01"]') as HTMLElement;
    const cut02Card = container.querySelector('[data-cut-card="cut-02"]') as HTMLElement;
    expect(within(cut01Card).getByText("승인")).toBeTruthy();
    expect(within(cut02Card).getByText("반려")).toBeTruthy();

    // 순차 결재선 전환
    fireEvent.click(screen.getByRole("button", { name: "순차 결재선으로 전환" }));
    expect(screen.getByText("7단계 순차 게이트 활성")).toBeTruthy();

    // 2번 탭: 외부 PD 블라인드 링크 + HTML/JSON 다운로드 + 피드백 가져오기 시뮬레이션
    fireEvent.click(screen.getByRole("tab", { name: "외부 PD 블라인드 링크" }));
    expect(screen.getByText(/워터마크 패턴:/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "정적 블라인드 HTML 다운로드" }));
    fireEvent.click(screen.getByRole("button", { name: "토큰 스펙 JSON 다운로드" }));
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(2);
    expect(anchorClickSpy).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:collab-signoff-url");

    fireEvent.click(screen.getByRole("button", { name: "HTML 코드 점검" }));
    expect(screen.getByText(/watermark-layer/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "외부 피드백 가져오기 시뮬레이션" }));
    expect(screen.getByRole("status").textContent).toContain("외부 PD 피드백 2건");

    // 3번 탭: 라운드 회귀·SLA 병목
    fireEvent.click(screen.getByRole("tab", { name: "라운드 회귀·SLA 병목" }));
    expect(screen.getByText("해결 후 재오픈된 회귀 핀 경고")).toBeTruthy();
    expect(screen.getAllByText(/v2 해결 → v3 회귀/)).toHaveLength(2);
    expect(screen.getByText("공정별 검수 리드타임 · 재작업률 대시보드")).toBeTruthy();
    expect(RAW_COLOR_REGEX.test(container.innerHTML)).toBe(false);
    expect(container.innerHTML.includes("transition-all")).toBe(false);
    unmount();

    // 2) EN 모드 3탭 전수 렌더링 (한글 0자 + 원시 색상 0건 확인)
    useI18n.setState({ lang: "en" });
    const enView = render(
      <CollabSignoffHubPanel
        initialWorkTitle="Moonlight Atelier"
        initialEpisodeTitle="EP.14 Seal Fracture"
      />,
    );
    expect(screen.getByText("Human Collab Sign-off Hub")).toBeTruthy();
    expect(enView.container.textContent).not.toMatch(/[가-힣]/);

    fireEvent.click(screen.getByRole("tab", { name: "External PD Blind Link" }));
    expect(screen.getByText(/Blind Mode: Strip 100% of Internal Studio Notes/)).toBeTruthy();
    expect(enView.container.textContent).not.toMatch(/[가-힣]/);

    fireEvent.click(screen.getByRole("tab", { name: "Round Regressions & SLA" }));
    expect(screen.getByText("Reopened Regressed Pin Alerts")).toBeTruthy();
    expect(enView.container.textContent).not.toMatch(/[가-힣]/);
    expect(RAW_COLOR_REGEX.test(enView.container.innerHTML)).toBe(false);
  });
});
