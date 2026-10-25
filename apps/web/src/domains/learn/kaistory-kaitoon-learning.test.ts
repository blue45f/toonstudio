import { describe, expect, it } from "vitest";

import { KAION_DEFAULT_QUESTIONS } from "./kaistory-kaion-curriculum";
import {
  buildWrongAnswerNote,
  computeSubjectMasteryStats,
  gradeKaitoonQuestionAttempt,
  KAITOON_EXTERNAL_STEM_SITES,
  normalizeKatexMarkdownForCjk,
  unlockEpisodeWithPoints,
} from "./kaistory-kaitoon-learning";

describe("kaistory-kaitoon-learning", () => {
  it("KaTeX 수식 뒤에 한글 조사가 바로 붙을 때 공백을 삽입하고 마크다운 헤딩을 교정한다", () => {
    const raw = "###뉴턴 제2법칙\n알짜힘 $F=ma$는 가속도 $a$에 비례한다.";
    const normalized = normalizeKatexMarkdownForCjk(raw);
    expect(normalized).toBe("### 뉴턴 제2법칙\n알짜힘 $F=ma$ 는 가속도 $a$ 에 비례한다.");
  });

  it("객관식·단답형·AI 서술형 3유형을 채점하고 첫 정답(100%)과 재도전(50%) 포인트를 구분한다", () => {
    const mcQuestion = KAION_DEFAULT_QUESTIONS[0]!;
    const firstTry = gradeKaitoonQuestionAttempt({
      question: mcQuestion,
      submittedAnswer: "1",
      previousAttemptCount: 0,
      alreadySolvedBefore: false,
    });
    expect(firstTry.isCorrect).toBe(true);
    expect(firstTry.transactionType).toBe("FIRST_CORRECT");
    expect(firstTry.earnedPoints).toBe(100);

    const retrySolve = gradeKaitoonQuestionAttempt({
      question: mcQuestion,
      submittedAnswer: "1",
      previousAttemptCount: 2,
      alreadySolvedBefore: false,
    });
    expect(retrySolve.isCorrect).toBe(true);
    expect(retrySolve.transactionType).toBe("RETRY_CORRECT");
    expect(retrySolve.earnedPoints).toBe(50);

    const essayQuestion = KAION_DEFAULT_QUESTIONS[2]!;
    const essayPass = gradeKaitoonQuestionAttempt({
      question: essayQuestion,
      submittedAnswer: "관성 때문에 기존의 운동 상태를 유지하려는 몸을 안전벨트가 잡아준다.",
      previousAttemptCount: 0,
      alreadySolvedBefore: false,
    });
    expect(essayPass.isCorrect).toBe(true);
    expect(essayPass.scorePercent).toBe(100);
    expect(essayPass.earnedPoints).toBe(250);
  });

  it("오답노트에서 2회 이상 틀리고 미해결인 문항을 '반복 오답'으로 표시하며 과목별 우수/부진을 판정한다", () => {
    const attempts = [
      {
        questionId: "q-1",
        subjectName: "물리",
        conceptName: "관성의 법칙",
        isCorrect: false,
        submittedAnswer: "2",
        attemptedAtIso: "2026-10-25T10:00:00Z",
      },
      {
        questionId: "q-1",
        subjectName: "물리",
        conceptName: "관성의 법칙",
        isCorrect: false,
        submittedAnswer: "3",
        attemptedAtIso: "2026-10-25T10:05:00Z",
      },
      {
        questionId: "q-2",
        subjectName: "수학",
        conceptName: "일차함수",
        isCorrect: true,
        submittedAnswer: "1",
        attemptedAtIso: "2026-10-25T11:00:00Z",
      },
    ];

    const wrongNotes = buildWrongAnswerNote(attempts);
    expect(wrongNotes).toHaveLength(1);
    expect(wrongNotes[0]?.isRepeatedWrong).toBe(true);
    expect(wrongNotes[0]?.resolved).toBe(false);

    const stats = computeSubjectMasteryStats(attempts);
    const physicsStat = stats.find((s) => s.subjectName === "물리");
    const mathStat = stats.find((s) => s.subjectName === "수학");
    expect(physicsStat?.gradeBand).toBe("부진");
    expect(mathStat?.gradeBand).toBe("우수");
  });

  it("포인트를 차감해 1주일(7일) 에피소드 열람권을 발급하고 15개 외부 STEM 사이트를 제공한다", () => {
    expect(KAITOON_EXTERNAL_STEM_SITES).toHaveLength(15);

    const unlocked = unlockEpisodeWithPoints({
      currentPoints: 300,
      costPoints: 100,
      episodeId: "ep-inertia-1",
      episodeTitle: "1화. 급정거하는 버스와 관성의 비밀",
      nowIso: "2026-10-26T00:00:00.000Z",
    });
    expect(unlocked.ok).toBe(true);
    expect(unlocked.remainingPoints).toBe(200);
    expect(unlocked.pass?.expiresAtIso).toBe("2026-11-02T00:00:00.000Z");
    expect(unlocked.pass?.noticeKo).toContain("1주일 동안 볼 수 있습니다");
  });
});
