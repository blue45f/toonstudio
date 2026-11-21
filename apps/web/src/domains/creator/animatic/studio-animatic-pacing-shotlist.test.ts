import { describe, expect, it } from "vitest";
import {
  applyDialoguePacingPlan,
  compareMultiTakeReviewPins,
  compileProductionShotList,
  computeDialoguePacingPlan,
  countDialogueMetrics,
  createTimecodeReviewPin,
  exportShotListToCsv,
  formatTimecodeMs,
  syncReviewPinsToAnimaticMarkers,
  type AnimaticCutInput,
} from "./studio-animatic-pacing-shotlist";

const SAMPLE_CUTS: readonly AnimaticCutInput[] = [
  {
    cutId: "cut-01",
    shotNumber: "1A",
    sceneLabel: "옥상 대치",
    shotSize: "OTS",
    lensMm: 24,
    cameraMove: "느린 돌리 인",
    characters: ["서진", "도윤"],
    bg3dRef: "bg3d://rooftop-sunset",
    props: ["우산", "열쇠"],
    sfxTags: ["바람소리"],
    dialogues: [
      { id: "d1", speaker: "서진", text: "여기까지 오느라 꽤 오래 걸렸네." },
      { id: "d2", speaker: "도윤", text: "Check the rooftop door now." },
    ],
    beatPacing: "normal",
    currentHoldMs: 1200,
  },
  {
    cutId: "cut-02",
    shotNumber: "1B",
    sceneLabel: "옥상 대치",
    shotSize: "CU",
    lensMm: 85,
    cameraMove: "고정",
    characters: ["도윤"],
    props: [],
    sfxTags: ["심장박동", "정적"],
    dialogues: [],
    beatPacing: "reveal",
    currentHoldMs: 800,
    visualActionBaseMs: 1000,
  },
];

describe("studio-animatic-pacing-shotlist", () => {
  it("한글 음절과 영문 단어 수를 계산해 비파괴 권장 컷 타이밍 Diff를 산출한다", () => {
    const metrics = countDialogueMetrics("안녕 세상! Hello world");
    expect(metrics.koreanSyllableCount).toBe(4);
    expect(metrics.englishWordCount).toBe(2);

    const plan = computeDialoguePacingPlan(SAMPLE_CUTS, {
      koreanSyllablesPerSec: 12,
      englishWordsPerMin: 160,
    });
    expect(plan.entries).toHaveLength(2);
    // cut-01은 2개 말풍선 + 호흡(600ms) + 대사 독서시간으로 기존 1200ms보다 증가해야 함
    expect(plan.entries[0]?.recommendedMs).toBeGreaterThan(2500);
    expect(plan.entries[0]?.deltaMs).toBeGreaterThan(0);
    // cut-02는 무대사 reveal(1.35x * 1000ms = 1350ms)
    expect(plan.entries[1]?.recommendedMs).toBe(1350);

    const applied = applyDialoguePacingPlan(SAMPLE_CUTS, plan, new Set(["cut-02"]));
    expect(applied[0]?.currentHoldMs).toBe(1200);
    expect(applied[1]?.currentHoldMs).toBe(1350);
  });

  it("프로덕션 샷 리스트와 누적 타임코드·RFC-4180 CSV 내보내기를 생성한다", () => {
    expect(formatTimecodeMs(65_420)).toBe("01:05.420");

    const rows = compileProductionShotList(SAMPLE_CUTS);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.cumulativeStartTimecode).toBe("00:00.000");
    expect(rows[0]?.cumulativeEndTimecode).toBe("00:01.200");
    expect(rows[1]?.cumulativeStartTimecode).toBe("00:01.200");
    expect(rows[1]?.cumulativeEndTimecode).toBe("00:02.000");

    const csv = exportShotListToCsv(rows);
    expect(csv).toContain("샷 번호,컷 ID");
    expect(csv).toContain('"서진, 도윤"');
    expect(csv).toContain("24mm / 느린 돌리 인");
  });

  it("공유 토큰 격리 게스트 SVG 드로우오버 핀 검증·멀티 테이크 비교·마커 동기화를 수행한다", () => {
    expect(() =>
      createTimecodeReviewPin({
        id: "bad-svg",
        shareTokenScope: "tok-1",
        takeId: "take-a",
        segmentId: "cut-01",
        timeMs: 500,
        reviewerAlias: "담당 PD",
        comment: "수정",
        drawoverStrokes: [
          {
            id: "s1",
            colorToken: "danger",
            strokeWidthPx: 3,
            pathD: "M 0 0 <script>alert(1)</script>",
          },
        ],
        createdAtIso: "2026-11-20T09:00:00Z",
      }),
    ).toThrow(/허용되지 않는 SVG/);

    const pinA = createTimecodeReviewPin({
      id: "p1",
      shareTokenScope: "tok-ep01",
      takeId: "take-a",
      segmentId: "cut-01",
      timeMs: 900,
      reviewerAlias: "PD 김",
      comment: "어깨 구도 살짝 왼쪽으로",
      status: "revision-requested",
      drawoverStrokes: [
        { id: "st-1", colorToken: "danger", strokeWidthPx: 3, pathD: "M 10 20 L 80 40" },
      ],
      createdAtIso: "2026-11-20T09:10:00Z",
    });
    const pinB = createTimecodeReviewPin({
      id: "p2",
      shareTokenScope: "tok-ep01",
      takeId: "take-b",
      segmentId: "cut-01",
      timeMs: 400,
      reviewerAlias: "작화 어시",
      comment: "타이밍 자연스러움",
      status: "approved-candidate",
      createdAtIso: "2026-11-20T09:12:00Z",
    });
    const foreignPin = createTimecodeReviewPin({
      id: "p-foreign",
      shareTokenScope: "tok-other",
      takeId: "take-a",
      segmentId: "cut-01",
      timeMs: 100,
      reviewerAlias: "외부",
      comment: "격리되어야 함",
      createdAtIso: "2026-11-20T09:15:00Z",
    });

    const cmp = compareMultiTakeReviewPins(
      [pinA, pinB, foreignPin],
      "tok-ep01",
      "take-a",
      "take-b",
    );
    expect(cmp.recommendedTakeId).toBe("take-b");
    expect(cmp.revisionDeltaBMinusA).toBe(-1);

    const markers = syncReviewPinsToAnimaticMarkers([pinA, pinB, foreignPin], "tok-ep01");
    expect(markers).toHaveLength(2);
    expect(markers[0]?.sourcePinId).toBe("p2");
    expect(markers[1]?.hasDrawoverOverlay).toBe(true);
  });
});
