/**
 * KaistoryLearningPlatformSection.tsx — KAISTORY 학습 플랫폼 3대 프로덕트
 * (`KAION · 학습자료·문제 등록`, `KAITOON · 만화+교육 서비스`, `학습카드 · QR 교과 연계`)
 * 통합 워크벤치 섹션.
 */

import {
  Award,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Flag,
  GraduationCap,
  Layers,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/shared/lib/utils";

import {
  analyzeSuneungQuestionTrend,
  canDeleteCurriculumNode,
  compileKaionMaterialPrompt,
  extractMaterialKeywords,
  KAION_DEFAULT_CURRICULUM_NODES,
  KAION_DEFAULT_QUESTIONS,
  KAION_DIFFICULTY_LABELS,
  KAION_QUESTION_TYPE_LABELS,
  recommendRelatedQuestions,
  resolveCurriculumBreadcrumb,
  type KaionQuestionDifficulty,
  type KaionQuestionType,
} from "./kaistory-kaion-curriculum";
import {
  buildWrongAnswerNote,
  computeSubjectMasteryStats,
  gradeKaitoonQuestionAttempt,
  KAITOON_EXTERNAL_STEM_SITES,
  KAITOON_ISSUE_CATEGORY_LABELS,
  normalizeKatexMarkdownForCjk,
  unlockEpisodeWithPoints,
  type KaitoonIssueCategory,
  type KaitoonQuestionAttemptRecord,
} from "./kaistory-kaitoon-learning";

export type KaistoryLearningTabId = "kaion" | "kaitoon" | "stem_hub";

const INITIAL_ATTEMPTS: readonly KaitoonQuestionAttemptRecord[] = Object.freeze([
  {
    questionId: "q-inertia-mc-1",
    subjectName: "물리",
    conceptName: "뉴턴 제1법칙(관성의 법칙)",
    isCorrect: false,
    submittedAnswer: "2",
    attemptedAtIso: "2026-10-25T09:00:00Z",
  },
  {
    questionId: "q-inertia-mc-1",
    subjectName: "물리",
    conceptName: "뉴턴 제1법칙(관성의 법칙)",
    isCorrect: false,
    submittedAnswer: "3",
    attemptedAtIso: "2026-10-25T09:05:00Z",
  },
  {
    questionId: "q-math-1",
    subjectName: "수학",
    conceptName: "좌표평면과 일차함수",
    isCorrect: true,
    submittedAnswer: "1",
    attemptedAtIso: "2026-10-25T10:00:00Z",
  },
]);

export function KaistoryLearningPlatformSection() {
  const [activeTab, setActiveTab] = useState<KaistoryLearningTabId>("kaion");
  const [statusMessage, setStatusMessage] = useState("");

  // 1. KAION 상태
  const [selectedConceptId, setSelectedConceptId] = useState("concept-inertia-law");
  const [deleteTargetId, setDeleteTargetId] = useState("subj-physics");
  const [materialSummaryInput, setMaterialSummaryInput] = useState(
    "###관성의 법칙\n외부 알짜힘 $\\sum F = 0$는 물체가 등속 직선 운동이나 정지 상태를 유지하게 만든다.",
  );
  const [targetDifficulty, setTargetDifficulty] = useState<KaionQuestionDifficulty>("HARD");
  const [targetQuestionType, setTargetQuestionType] = useState<KaionQuestionType>("ESSAY");
  const [suneungSubject, setSuneungSubject] = useState("물리학I");

  // 2. KAITOON 상태
  const [selectedQuestionId, setSelectedQuestionId] = useState("q-inertia-mc-1");
  const [submittedAnswer, setSubmittedAnswer] = useState("1");
  const [attempts, setAttempts] = useState<readonly KaitoonQuestionAttemptRecord[]>(INITIAL_ATTEMPTS);
  const [studentPoints, setStudentPoints] = useState(350);
  const [unlockedEpisodeNotice, setUnlockedEpisodeNotice] = useState("");
  const [issueCategory, setIssueCategory] = useState<KaitoonIssueCategory>("DISPLAY_ISSUE");

  // 3. 외부 STEM 리소스 필터
  const [selectedStemSubject, setSelectedStemSubject] = useState<string>("전체");

  const selectedConcept = useMemo(
    () =>
      KAION_DEFAULT_CURRICULUM_NODES.find((n) => n.id === selectedConceptId) ??
      KAION_DEFAULT_CURRICULUM_NODES[KAION_DEFAULT_CURRICULUM_NODES.length - 1]!,
    [selectedConceptId],
  );
  const breadcrumb = useMemo(
    () => resolveCurriculumBreadcrumb(selectedConcept.id, KAION_DEFAULT_CURRICULUM_NODES),
    [selectedConcept.id],
  );
  const deleteValidation = useMemo(
    () =>
      canDeleteCurriculumNode({
        targetNodeId: deleteTargetId,
        nodes: KAION_DEFAULT_CURRICULUM_NODES,
        materials: [],
        questions: KAION_DEFAULT_QUESTIONS,
      }),
    [deleteTargetId],
  );
  const extractedKeywords = useMemo(
    () => extractMaterialKeywords(materialSummaryInput),
    [materialSummaryInput],
  );
  const normalizedKatexPreview = useMemo(
    () => normalizeKatexMarkdownForCjk(materialSummaryInput),
    [materialSummaryInput],
  );
  const kaionPrompt = useMemo(
    () =>
      compileKaionMaterialPrompt({
        concept: selectedConcept,
        breadcrumb,
        keywords: extractedKeywords,
        targetDifficulty,
        targetQuestionType,
      }),
    [breadcrumb, extractedKeywords, selectedConcept, targetDifficulty, targetQuestionType],
  );
  const relatedQuestions = useMemo(
    () =>
      recommendRelatedQuestions({
        conceptId: selectedConcept.id,
        keywords: extractedKeywords,
        questionBank: KAION_DEFAULT_QUESTIONS,
        limit: 10,
      }),
    [extractedKeywords, selectedConcept.id],
  );
  const suneungTrend = useMemo(
    () => analyzeSuneungQuestionTrend(suneungSubject),
    [suneungSubject],
  );

  const activeQuestion = useMemo(
    () =>
      KAION_DEFAULT_QUESTIONS.find((q) => q.id === selectedQuestionId) ??
      KAION_DEFAULT_QUESTIONS[0]!,
    [selectedQuestionId],
  );
  const wrongNotes = useMemo(() => buildWrongAnswerNote(attempts), [attempts]);
  const masteryStats = useMemo(() => computeSubjectMasteryStats(attempts), [attempts]);

  const filteredStemSites = useMemo(
    () =>
      selectedStemSubject === "전체"
        ? KAITOON_EXTERNAL_STEM_SITES
        : KAITOON_EXTERNAL_STEM_SITES.filter((site) =>
            site.subjectTags.includes(selectedStemSubject),
          ),
    [selectedStemSubject],
  );

  const handleGradeAnswer = () => {
    const prevForQuestion = attempts.filter((a) => a.questionId === activeQuestion.id);
    const alreadySolved = prevForQuestion.some((a) => a.isCorrect);
    const outcome = gradeKaitoonQuestionAttempt({
      question: activeQuestion,
      submittedAnswer,
      previousAttemptCount: prevForQuestion.length,
      alreadySolvedBefore: alreadySolved,
    });

    setAttempts((prev) => [
      ...prev,
      {
        questionId: activeQuestion.id,
        subjectName: "물리",
        conceptName: selectedConcept.name,
        isCorrect: outcome.isCorrect,
        submittedAnswer,
        attemptedAtIso: new Date().toISOString(),
      },
    ]);
    if (outcome.earnedPoints > 0) {
      setStudentPoints((p) => p + outcome.earnedPoints);
    }
    setStatusMessage(outcome.feedbackKo);
  };

  const handleUnlockEpisode = () => {
    const res = unlockEpisodeWithPoints({
      currentPoints: studentPoints,
      costPoints: 100,
      episodeId: "kaitoon-ep-inertia-1",
      episodeTitle: "1화. 급정거하는 버스와 관성의 비밀",
      nowIso: "2026-10-26T00:00:00.000Z",
    });
    setStudentPoints(res.remainingPoints);
    if (res.pass) {
      setUnlockedEpisodeNotice(res.pass.noticeKo);
    }
    setStatusMessage(res.messageKo);
  };

  const handleReportIssue = () => {
    setStatusMessage(
      `문항 오류 신고 접수 완료: [${KAITOON_ISSUE_CATEGORY_LABELS[issueCategory]}] (${activeQuestion.id})`,
    );
  };

  return (
    <section
      className="mt-8 rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby="kaistory-learning-platform-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
            <Sparkles size={14} aria-hidden="true" /> KAISTORY LEARNING PLATFORM · KAION & KAITOON
          </p>
          <h2
            id="kaistory-learning-platform-heading"
            className="mt-1 text-xl font-black tracking-tight text-fg sm:text-2xl"
          >
            KAION 6단계 교육과정·문제은행 & KAITOON 만화+교육 학습관
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            초등 3-4·초등 5-6·중학·고등 수학·과학(물리·화학·생물·지구과학) 6단계 커리큘럼 설계부터
            KaTeX 수식 학습카드, AI 서술형 채점, 반복 오답노트, 포인트 1주일 열람권까지 통합 제공합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel px-3.5 py-2 text-xs font-bold text-fg">
          <Award size={16} className="text-accent" aria-hidden="true" />
          보유 학습 포인트: <span>{studentPoints}P</span>
        </div>
      </div>

      {statusMessage ? (
        <p
          role="status"
          className="mt-3 flex items-center gap-2 rounded-xl border border-good/35 bg-good/10 px-3 py-2 text-xs font-semibold text-fg"
        >
          <CheckCircle2 size={14} className="text-good" aria-hidden="true" />
          {statusMessage}
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label="KAISTORY 학습 플랫폼 탭"
        className="mt-4 grid gap-2 sm:grid-cols-3"
      >
        <button
          type="button"
          role="tab"
          id="kaistory-learn-tab-kaion"
          aria-selected={activeTab === "kaion"}
          aria-controls="kaistory-learn-panel-kaion"
          onClick={() => setActiveTab("kaion")}
          className={cn(
            "flex flex-col items-start rounded-2xl border p-3 text-left transition-all",
            activeTab === "kaion"
              ? "border-accent bg-accent-soft/45 shadow-sm"
              : "border-line bg-panel/60 text-fg-2 hover:text-fg",
          )}
        >
          <span className="flex items-center gap-1.5 text-xs font-black text-fg">
            <Layers size={15} className="text-accent" aria-hidden="true" />
            1. KAION · 교육과정·문제 등록
          </span>
          <span className="mt-1 text-[0.7rem] text-fg-3">
            6단계 트리 · 상향식 삭제 검증 · AI 문제 생성 · 수능 기출 분석
          </span>
        </button>

        <button
          type="button"
          role="tab"
          id="kaistory-learn-tab-kaitoon"
          aria-selected={activeTab === "kaitoon"}
          aria-controls="kaistory-learn-panel-kaitoon"
          onClick={() => setActiveTab("kaitoon")}
          className={cn(
            "flex flex-col items-start rounded-2xl border p-3 text-left transition-all",
            activeTab === "kaitoon"
              ? "border-accent bg-accent-soft/45 shadow-sm"
              : "border-line bg-panel/60 text-fg-2 hover:text-fg",
          )}
        >
          <span className="flex items-center gap-1.5 text-xs font-black text-fg">
            <GraduationCap size={15} className="text-accent" aria-hidden="true" />
            2. KAITOON · 만화+교육 학습·오답노트
          </span>
          <span className="mt-1 text-[0.7rem] text-fg-3">
            3유형 문제 풀이 · 반복 오답 추적 · 과목별 성취도 · 1주일 열람권
          </span>
        </button>

        <button
          type="button"
          role="tab"
          id="kaistory-learn-tab-stem"
          aria-selected={activeTab === "stem_hub"}
          aria-controls="kaistory-learn-panel-stem"
          onClick={() => setActiveTab("stem_hub")}
          className={cn(
            "flex flex-col items-start rounded-2xl border p-3 text-left transition-all",
            activeTab === "stem_hub"
              ? "border-accent bg-accent-soft/45 shadow-sm"
              : "border-line bg-panel/60 text-fg-2 hover:text-fg",
          )}
        >
          <span className="flex items-center gap-1.5 text-xs font-black text-fg">
            <BookOpen size={15} className="text-accent" aria-hidden="true" />
            3. 외부 STEM 실험·백과 15선
          </span>
          <span className="mt-1 text-[0.7rem] text-fg-3">
            PhET · Ptable · Desmos · 칸아카데미 · 사이언스올 등 연계
          </span>
        </button>
      </div>

      {/* 1. KAION 탭 패널 */}
      {activeTab === "kaion" ? (
        <div
          role="tabpanel"
          id="kaistory-learn-panel-kaion"
          aria-labelledby="kaistory-learn-tab-kaion"
          className="mt-4 grid gap-4 lg:grid-cols-2"
        >
          <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
            <h3 className="text-sm font-bold text-fg">
              6단계 교육과정 경로 (하향식 등록 · 상향식 삭제 안전 검증)
            </h3>
            <p className="rounded-xl border border-line bg-card p-2.5 text-xs text-fg-2">
              현재 6단계 경로:{" "}
              <strong>{breadcrumb.map((node) => node.name).join(" > ")}</strong>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-fg-2">
                세부개념 선택
                <select
                  aria-label="세부개념 선택"
                  value={selectedConceptId}
                  onChange={(e) => setSelectedConceptId(e.target.value)}
                  className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
                >
                  {KAION_DEFAULT_CURRICULUM_NODES.filter((n) => n.level === "concept").map(
                    (node) => (
                      <option key={node.id} value={node.id}>
                        [{node.code}] {node.name}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="text-xs font-semibold text-fg-2">
                상향식(Bottom-Up) 삭제 검증 대상
                <select
                  aria-label="삭제 검증 대상"
                  value={deleteTargetId}
                  onChange={(e) => setDeleteTargetId(e.target.value)}
                  className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
                >
                  {KAION_DEFAULT_CURRICULUM_NODES.map((node) => (
                    <option key={node.id} value={node.id}>
                      [{node.level}] {node.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="rounded-xl border border-line bg-card p-2.5 text-xs text-fg-2">
              삭제 검증 결과: <strong>{deleteValidation.reasonKo}</strong>
            </p>

            <label className="block text-xs font-semibold text-fg-2">
              학습자료 마크다운 & KaTeX CJK 조사 경계 자동 교정
              <textarea
                rows={3}
                value={materialSummaryInput}
                onChange={(e) => setMaterialSummaryInput(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-card p-2.5 text-xs text-fg"
              />
            </label>
            <div className="rounded-xl border border-line bg-card p-2.5 text-xs text-fg-2">
              <p className="font-bold text-fg">KaTeX CJK 조사 분리 결과:</p>
              <pre className="mt-1 whitespace-pre-wrap text-[0.72rem]">{normalizedKatexPreview}</pre>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
            <h3 className="text-sm font-bold text-fg">
              5난이도×3유형 AI 문항 생성 프롬프트 & 수능 기출 분석
            </h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs font-semibold text-fg-2">
                목표 난이도
                <select
                  aria-label="목표 난이도"
                  value={targetDifficulty}
                  onChange={(e) => setTargetDifficulty(e.target.value as KaionQuestionDifficulty)}
                  className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2 text-xs text-fg"
                >
                  {(
                    Object.entries(KAION_DIFFICULTY_LABELS) as [
                      KaionQuestionDifficulty,
                      string,
                    ][]
                  ).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-fg-2">
                문항 유형
                <select
                  aria-label="문항 유형"
                  value={targetQuestionType}
                  onChange={(e) => setTargetQuestionType(e.target.value as KaionQuestionType)}
                  className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2 text-xs text-fg"
                >
                  {(
                    Object.entries(KAION_QUESTION_TYPE_LABELS) as [KaionQuestionType, string][]
                  ).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-fg-2">
                수능 기출 과목
                <select
                  aria-label="수능 기출 과목"
                  value={suneungSubject}
                  onChange={(e) => setSuneungSubject(e.target.value)}
                  className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2 text-xs text-fg"
                >
                  <option value="물리학I">물리학I</option>
                  <option value="공통수학">공통수학</option>
                  <option value="화학I">화학I</option>
                </select>
              </label>
            </div>

            <pre className="whitespace-pre-wrap rounded-xl border border-line bg-card p-2.5 text-[0.7rem] text-fg-2">
              {kaionPrompt}
            </pre>

            <div className="rounded-xl border border-line bg-card p-3 text-xs text-fg-2">
              <p className="font-bold text-fg">
                연관 추천 문항 ({relatedQuestions.length}개 / 최대 10개) & {suneungTrend.examYearRange}{" "}
                소재 추천
              </p>
              <p className="mt-1 text-[0.72rem] text-fg-3">
                추천 만화 스토리 훅: {suneungTrend.recommendedCartoonStoryHookKo}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* 2. KAITOON 탭 패널 */}
      {activeTab === "kaitoon" ? (
        <div
          role="tabpanel"
          id="kaistory-learn-panel-kaitoon"
          aria-labelledby="kaistory-learn-tab-kaitoon"
          className="mt-4 grid gap-4 lg:grid-cols-2"
        >
          <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
            <h3 className="text-sm font-bold text-fg">
              만화 연계 3유형(객관식·단답형·AI 서술형) 문제 풀이 & 포인트 보상
            </h3>
            <label className="block text-xs font-semibold text-fg-2">
              연습 문항 선택
              <select
                aria-label="연습 문항 선택"
                value={selectedQuestionId}
                onChange={(e) => setSelectedQuestionId(e.target.value)}
                className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
              >
                {KAION_DEFAULT_QUESTIONS.map((q) => (
                  <option key={q.id} value={q.id}>
                    [{KAION_QUESTION_TYPE_LABELS[q.type]} · {KAION_DIFFICULTY_LABELS[q.difficulty]}]{" "}
                    {q.id} (+{q.pointsReward}P)
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-line bg-card p-3 text-xs text-fg">
              <p className="font-semibold">{activeQuestion.stemMarkdown}</p>
              {activeQuestion.choices.length > 0 ? (
                <ul className="mt-2 space-y-1 text-fg-2">
                  {activeQuestion.choices.map((c) => (
                    <li key={c.number}>
                      {c.number}번. {c.text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label="답안 입력"
                value={submittedAnswer}
                onChange={(e) => setSubmittedAnswer(e.target.value)}
                placeholder="정답 번호 또는 서술형 답안을 입력하세요"
                className="min-h-9 flex-1 rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
              />
              <button
                type="button"
                onClick={handleGradeAnswer}
                className="min-h-9 rounded-xl bg-accent px-3.5 text-xs font-bold text-on-accent"
              >
                답안 제출 및 채점
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="오류 신고 유형"
                  value={issueCategory}
                  onChange={(e) => setIssueCategory(e.target.value as KaitoonIssueCategory)}
                  className="min-h-8 rounded-lg border border-line bg-card px-2 text-xs text-fg"
                >
                  {(
                    Object.entries(KAITOON_ISSUE_CATEGORY_LABELS) as [
                      KaitoonIssueCategory,
                      string,
                    ][]
                  ).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleReportIssue}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 hover:text-fg"
                >
                  <Flag size={12} aria-hidden="true" /> 문항 오류 신고
                </button>
              </div>

              <button
                type="button"
                onClick={handleUnlockEpisode}
                className="min-h-8 rounded-lg border border-accent/50 bg-accent-soft/40 px-2.5 text-xs font-bold text-fg"
              >
                100P로 유료 에피소드 1주일 열람
              </button>
            </div>
            {unlockedEpisodeNotice ? (
              <p className="rounded-xl border border-line bg-card p-2 text-xs font-semibold text-fg">
                {unlockedEpisodeNotice}
              </p>
            ) : null}
          </div>

          <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
            <h3 className="text-sm font-bold text-fg">
              오답노트 (반복 오답 감지) & 과목별 우수(≥90%)·부진(≤40%) 성취도
            </h3>
            <div className="space-y-1.5">
              {wrongNotes.map((entry) => (
                <div
                  key={entry.questionId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs"
                >
                  <span>
                    <strong>[{entry.subjectName}]</strong> {entry.conceptName} (오답 {entry.wrongCount}
                    회 / 총 {entry.totalAttempts}회)
                  </span>
                  <span className="font-bold">
                    {entry.isRepeatedWrong
                      ? "반복 오답 · 복습 필수"
                      : entry.resolved
                        ? "해결 완료"
                        : "미해결"}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-line bg-card p-3 text-xs">
              <p className="font-bold text-fg">과목별 성취도 등급</p>
              <ul className="mt-1.5 space-y-1 text-fg-2">
                {masteryStats.map((stat) => (
                  <li key={stat.subjectName}>
                    <strong>{stat.subjectName}</strong>: 정답률 {stat.accuracyPercent}% (
                    {stat.correctCount}/{stat.totalAttempted}) → 등급:{" "}
                    <strong>{stat.gradeBand}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* 3. 외부 STEM 리소스 디렉터리 탭 패널 */}
      {activeTab === "stem_hub" ? (
        <div
          role="tabpanel"
          id="kaistory-learn-panel-stem"
          aria-labelledby="kaistory-learn-tab-stem"
          className="mt-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-fg">
              KAITOON 연계 외부 수학·과학(STEM) 실험·백과 15선 ({filteredStemSites.length}개 표시)
            </h3>
            <div className="flex flex-wrap gap-1" role="group" aria-label="STEM 과목 필터">
              {["전체", "수학", "물리", "화학", "생물", "지구과학"].map((subj) => (
                <button
                  key={subj}
                  type="button"
                  aria-pressed={selectedStemSubject === subj}
                  onClick={() => setSelectedStemSubject(subj)}
                  className={cn(
                    "min-h-8 rounded-lg border px-2.5 text-xs font-bold",
                    selectedStemSubject === subj
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-panel text-fg-2",
                  )}
                >
                  {subj}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredStemSites.map((site) => (
              <article
                key={site.id}
                className="flex flex-col justify-between rounded-2xl border border-line bg-panel/50 p-3 text-xs"
              >
                <div>
                  <span className="text-[0.68rem] font-bold text-accent">{site.category}</span>
                  <h4 className="mt-0.5 font-bold text-fg">{site.name}</h4>
                  <p className="mt-1 text-fg-2">{site.summaryKo}</p>
                </div>
                <a
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 font-bold text-accent hover:underline"
                >
                  리소스 열기 <ExternalLink size={12} aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
