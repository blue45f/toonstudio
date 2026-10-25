import { useState, type FocusEvent, type FormEvent } from "react";
import {
  BSCOMIC_BOARD_CATEGORIES,
  calculateEpisodeOutsourcingSettlement,
  evaluateContractHelpdeskSafety,
  formatApplicationSubjectLine,
  getSpecializationPartByCode,
  JOB_SEEKING_HEAD_TAGS,
  matchAssistantCandidateProfile,
  WEBTOON_GENRE_LABELS,
  WEBTOON_SPECIALIZATION_PARTS,
  WEBTOON_TOOL_LABELS,
  type AssistantJobSeekerProfile,
  type OutsourcingBoardCategory,
  type OutsourcingRateModel,
  type WebtoonGenreTag,
  type WebtoonSpecializationCode,
  type WorkTitleVisibility,
} from "./webtoon-assistant-outsourcing-model";

const SAMPLE_JOB_SEEKERS: readonly AssistantJobSeekerProfile[] = [
  {
    id: "cand-lineart-pro",
    penName: "펜선장인_하늘",
    headId: 185,
    primaryPartCode: "001.003",
    secondaryPartCodes: ["001.004", "001.009"],
    preferredGenres: ["romance-fantasy", "modern-fantasy", "martial-arts"],
    excludedGenres: ["adult-19", "bl-gl"],
    tools: ["clip-studio-ex", "photoshop"],
    weeklyMaxCuts: 70,
    availableForUrgentSub: true,
    portfolioVerified: true,
  },
  {
    id: "cand-bg3d-master",
    penName: "스냅툰배경_도윤",
    headId: 184,
    primaryPartCode: "001.008",
    secondaryPartCodes: ["001.007", "001.017"],
    preferredGenres: ["romance-fantasy", "modern-fantasy", "action-shonen"],
    excludedGenres: [],
    tools: ["sketchup", "blender", "snaptoon", "clip-studio-ex"],
    weeklyMaxCuts: 65,
    availableForUrgentSub: true,
    portfolioVerified: true,
  },
  {
    id: "cand-post-finish",
    penName: "원꾸빛보정_세아",
    headId: 183,
    primaryPartCode: "001.017",
    secondaryPartCodes: ["001.005", "001.006", "001.011"],
    preferredGenres: ["romance-fantasy", "modern-romance", "bl-gl"],
    excludedGenres: ["martial-arts"],
    tools: ["clip-studio-ex", "photoshop"],
    weeklyMaxCuts: 80,
    availableForUrgentSub: false,
    portfolioVerified: true,
  },
];

export function WebtoonAssistantOutsourcingSuite() {
  // 1. 방방곡곡·웹픽월드 표준 구인·외주 양식 상태
  const [boardCategory, setBoardCategory] = useState<OutsourcingBoardCategory>("short-term-outsourcing");
  const [partCode, setPartCode] = useState<WebtoonSpecializationCode>("001.003");
  const [genre, setGenre] = useState<WebtoonGenreTag>("romance-fantasy");
  const [isAdultContent, setIsAdultContent] = useState<boolean>(false);
  const [workTitleVisibility, setWorkTitleVisibility] = useState<WorkTitleVisibility>("confidential-prelaunch");
  const [applicantSubjectPrefix, setApplicantSubjectPrefix] = useState<string>("방사_단기외주");
  const [applicantPenName, setApplicantPenName] = useState<string>("김툰어시");
  const [penNameInteractedInvalid, setPenNameInteractedInvalid] = useState<boolean>(false);

  // 2. 회당 기본 컷수 + 초과 컷당 할증 단가 계산기 상태 (`#874018` 패턴)
  const [rateModel, setRateModel] = useState<OutsourcingRateModel>("per-episode-with-overtime");
  const [baseEpisodeRateKrw, setBaseEpisodeRateKrw] = useState<number>(450000);
  const [baseCutThreshold, setBaseCutThreshold] = useState<number>(30);
  const [overtimeCutRateKrw, setOvertimeCutRateKrw] = useState<number>(15000);
  const perCutRateKrw = 16000;
  const monthlySalaryKrw = 2800000;
  const [actualCutCount, setActualCutCount] = useState<number>(40);
  const [includePaidSampleTest, setIncludePaidSampleTest] = useState<boolean>(true);
  const [sampleTestFeeKrw, setSampleTestFeeKrw] = useState<number>(50000);
  const [applyWithholdingTax3_3, setApplyWithholdingTax3_3] = useState<boolean>(true);

  // 3. 만화인 헬프데스크(`#869608`) 6대 계약 안전 점검 상태
  const [writtenContractConfirmed, setWrittenContractConfirmed] = useState<boolean>(true);
  const [businessOrWithholdingDeclared, setBusinessOrWithholdingDeclared] = useState<boolean>(true);
  const [requiresSampleTest, setRequiresSampleTest] = useState<boolean>(true);
  const [isSampleTestPaid, setIsSampleTestPaid] = useState<boolean>(true);
  const [overtimeCutRateSpecified, setOvertimeCutRateSpecified] = useState<boolean>(true);
  const [maxFreeRetakeCount, setMaxFreeRetakeCount] = useState<number>(2);
  const [creditAndPortfolioPolicyClear, setCreditAndPortfolioPolicyClear] = useState<boolean>(true);

  const selectedPart = getSpecializationPartByCode(partCode);
  const selectedBoard = BSCOMIC_BOARD_CATEGORIES[boardCategory];

  const subjectLinePreview = formatApplicationSubjectLine(
    { boardCategory, partCode, applicantSubjectPrefix },
    applicantPenName,
  );

  const settlement = calculateEpisodeOutsourcingSettlement({
    rateModel,
    baseEpisodeRateKrw,
    baseCutThreshold,
    overtimeCutRateKrw,
    perCutRateKrw,
    monthlySalaryKrw,
    actualCutCount,
    includePaidSampleTest,
    sampleTestFeeKrw,
    applyWithholdingTax3_3,
  });

  const safetyEvaluation = evaluateContractHelpdeskSafety({
    writtenContractConfirmed,
    businessOrWithholdingDeclared,
    requiresSampleTest,
    isSampleTestPaid,
    overtimeCutRateSpecified,
    maxFreeRetakeCount,
    creditAndPortfolioPolicyClear,
  });

  const candidateMatches = SAMPLE_JOB_SEEKERS.map((candidate) =>
    matchAssistantCandidateProfile(
      { partCode, genre, isAdultContent, baseCutThreshold },
      candidate,
    ),
  );

  // `accessible-error-announcement`: 사용자 상호작용(blur/input) 후에만 `:user-invalid` 및 `aria-invalid` 동기화
  const syncPenNameValidity = (
    event: FocusEvent<HTMLInputElement> | FormEvent<HTMLInputElement>,
    forceAfterBlur: boolean,
  ) => {
    const input = event.currentTarget;
    const isUserInvalid =
      typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("selector(:user-invalid)")
        ? input.matches(":user-invalid") || (forceAfterBlur && !input.value.trim())
        : (forceAfterBlur || penNameInteractedInvalid) && !input.value.trim();
    setPenNameInteractedInvalid(isUserInvalid);
  };

  return (
    <section
      aria-label="웹툰 어시스턴트 파트별 구인·외주 양식 및 만화인 헬프데스크 계약 안전 관리"
      data-testid="webtoon-assistant-outsourcing-suite"
      className="space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5 text-fg"
    >
      <header className="space-y-1">
        <p className="text-xs font-bold tracking-wide text-accent">
          OUTSOURCING · ASSISTANT HIRING STANDARD (방방곡곡 · 만화인 · 웹픽월드 표준 내재화)
        </p>
        <h2 className="text-lg font-bold">
          웹툰 17개 전문 파트 외주·구인 양식 &amp; 단가·계약 안전 워크스페이스
        </h2>
        <p className="text-xs text-fg-2">
          선화·밑색·채색·3D배경·식자·후보정(원꾸) 등 세부 공정별 표준 모집 요강, 초과 컷당 할증 정산, 만화인 헬프데스크 6대 계약 안전 점검을 한 화면에서 관리합니다.
        </p>
      </header>

      {/* 1. 게시판 카테고리 및 17개 웹툰 전문 공정 선택 */}
      <div className="grid gap-3 rounded-xl border border-line bg-canvas/60 p-3.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>1. 모집 게시판 분류 &amp; 웹픽월드 표준 17개 웹툰 세부 공정</strong>
          <span
            data-testid="selected-board-badge"
            className="rounded-full bg-accent/15 px-2.5 py-0.5 font-semibold text-accent"
          >
            {selectedBoard.labelKo} (menuId={selectedBoard.menuId} · boardType={selectedBoard.boardType})
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1">
            <span className="font-semibold">게시판 유형:</span>
            <select
              aria-label="외주 구인 게시판 유형"
              data-testid="outsourcing-board-category-select"
              value={boardCategory}
              onChange={(e) => setBoardCategory(e.target.value as OutsourcingBoardCategory)}
              className="rounded border border-line bg-panel px-2 py-1.5"
            >
              {Object.entries(BSCOMIC_BOARD_CATEGORIES).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.labelKo}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="font-semibold">세부 모집 파트 (17개 공정):</span>
            <select
              aria-label="웹툰 세부 모집 파트"
              data-testid="outsourcing-part-code-select"
              value={partCode}
              onChange={(e) => setPartCode(e.target.value as WebtoonSpecializationCode)}
              className="rounded border border-line bg-panel px-2 py-1.5"
            >
              {WEBTOON_SPECIALIZATION_PARTS.map((part) => (
                <option key={part.code} value={part.code}>
                  [{part.code}] {part.labelKo}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="font-semibold">작품 장르:</span>
            <select
              aria-label="외주 작품 장르"
              data-testid="outsourcing-genre-select"
              value={genre}
              onChange={(e) => setGenre(e.target.value as WebtoonGenreTag)}
              className="rounded border border-line bg-panel px-2 py-1.5"
            >
              {Object.entries(WEBTOON_GENRE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="font-semibold">작품 제목 공개 범위:</span>
            <select
              aria-label="작품 제목 공개 범위"
              value={workTitleVisibility}
              onChange={(e) => setWorkTitleVisibility(e.target.value as WorkTitleVisibility)}
              className="rounded border border-line bg-panel px-2 py-1.5"
            >
              <option value="confidential-prelaunch">런칭 전 비공개 (장르·화풍만 공개)</option>
              <option value="nda-on-contract">대외비 (샘플 테스트/계약 시 공개)</option>
              <option value="public-title">연재작 제목 전체 공개</option>
            </select>
          </label>
        </div>

        <div className="rounded-lg border border-line bg-panel p-2.5 space-y-1.5">
          <div>
            <strong>표준 공정 범위 ({selectedPart.code} {selectedPart.labelKo}):</strong>{" "}
            <span data-testid="selected-part-default-scope">{selectedPart.defaultScopeKo}</span>
          </div>
          <div>
            <strong>필수 포트폴리오 검증 항목 (무압축 JPG/PDF 권장):</strong>{" "}
            <span data-testid="selected-part-portfolio-checkpoints">
              {selectedPart.requiredPortfolioCheckpointsKo.join(" · ")}
            </span>
          </div>
          <div>
            <strong>권장 제작 툴:</strong>{" "}
            {selectedPart.primaryTools.map((tool) => WEBTOON_TOOL_LABELS[tool]).join(", ")}
          </div>
        </div>

        {/* 지원 메일/지원서 제목 규격 자동 생성기 */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="inline-flex items-center gap-1.5">
            <span>지원 말머리 접두사:</span>
            <input
              type="text"
              aria-label="지원 말머리 접두사"
              data-testid="applicant-subject-prefix-input"
              value={applicantSubjectPrefix}
              onChange={(e) => setApplicantSubjectPrefix(e.target.value)}
              className="w-32 rounded border border-line bg-panel px-2 py-1"
            />
          </label>
          <div className="inline-flex flex-col gap-0.5">
            <label className="inline-flex items-center gap-1.5">
              <span>지원자 활동필명:</span>
              <input
                type="text"
                required
                aria-label="지원자 활동필명"
                aria-invalid={penNameInteractedInvalid ? "true" : undefined}
                aria-errormessage="applicant-pen-name-error"
                data-testid="applicant-pen-name-input"
                value={applicantPenName}
                onChange={(e) => setApplicantPenName(e.target.value)}
                onBlur={(e) => syncPenNameValidity(e, true)}
                onInput={(e) => {
                  if (penNameInteractedInvalid) syncPenNameValidity(e, false);
                }}
                className="w-32 rounded border border-line bg-panel px-2 py-1"
              />
            </label>
            {penNameInteractedInvalid && (
              <span
                id="applicant-pen-name-error"
                role="alert"
                data-testid="applicant-pen-name-error"
                className="text-[11px] text-danger"
              >
                지원서 제목 생성을 위해 활동필명을 입력해 주세요.
              </span>
            )}
          </div>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              data-testid="outsourcing-adult-content-toggle"
              checked={isAdultContent}
              onChange={(e) => setIsAdultContent(e.target.checked)}
            />
            <span>성인물(19금) 작품 여부</span>
          </label>
          <span
            data-testid="generated-subject-line-preview"
            className="rounded bg-raised px-2.5 py-1 font-mono font-semibold"
          >
            지원 제목 규격: {subjectLinePreview}
          </span>
        </div>
      </div>

      {/* 2. 회당 기본 컷수 + 초과 컷당 할증 단가 및 유급 샘플 테스트 정산 계산기 */}
      <div className="grid gap-3 rounded-xl border border-line bg-canvas/60 p-3.5 text-xs">
        <strong>2. 회차당 기준 컷수 &amp; 초과 컷당 할증 단가 · 유급 샘플 테스트 정산기</strong>

        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <label className="grid gap-1">
            <span>단가 책정 방식:</span>
            <select
              aria-label="외주 단가 책정 방식"
              data-testid="outsourcing-rate-model-select"
              value={rateModel}
              onChange={(e) => setRateModel(e.target.value as OutsourcingRateModel)}
              className="rounded border border-line bg-panel px-2 py-1"
            >
              <option value="per-episode-with-overtime">회당 기본가 + 초과 컷 할증</option>
              <option value="per-cut">순수 컷당 단가</option>
              <option value="monthly-fixed">월 고정급(계약직)</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span>회당 기본 단가(원):</span>
            <input
              type="number"
              aria-label="회당 기본 단가"
              data-testid="base-episode-rate-input"
              value={baseEpisodeRateKrw}
              onChange={(e) => setBaseEpisodeRateKrw(Number(e.target.value) || 0)}
              className="rounded border border-line bg-panel px-2 py-1"
            />
          </label>

          <label className="grid gap-1">
            <span>기준 컷수(컷):</span>
            <input
              type="number"
              aria-label="회당 기준 컷수"
              data-testid="base-cut-threshold-input"
              value={baseCutThreshold}
              onChange={(e) => setBaseCutThreshold(Number(e.target.value) || 1)}
              className="rounded border border-line bg-panel px-2 py-1"
            />
          </label>

          <label className="grid gap-1">
            <span>초과 컷당 추가금(원):</span>
            <input
              type="number"
              aria-label="초과 컷당 추가 단가"
              data-testid="overtime-cut-rate-input"
              value={overtimeCutRateKrw}
              onChange={(e) => setOvertimeCutRateKrw(Number(e.target.value) || 0)}
              className="rounded border border-line bg-panel px-2 py-1"
            />
          </label>

          <label className="grid gap-1">
            <span>실제 작업 컷수(컷):</span>
            <input
              type="number"
              aria-label="실제 작업 컷수"
              data-testid="actual-cut-count-input"
              value={actualCutCount}
              onChange={(e) => setActualCutCount(Number(e.target.value) || 0)}
              className="rounded border border-line bg-panel px-2 py-1"
            />
          </label>

          <label className="grid gap-1">
            <span>유급 테스트비(원):</span>
            <input
              type="number"
              aria-label="유급 샘플 테스트비"
              data-testid="sample-test-fee-input"
              value={sampleTestFeeKrw}
              onChange={(e) => setSampleTestFeeKrw(Number(e.target.value) || 0)}
              className="rounded border border-line bg-panel px-2 py-1"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              data-testid="include-paid-sample-test-toggle"
              checked={includePaidSampleTest}
              onChange={(e) => setIncludePaidSampleTest(e.target.checked)}
            />
            <span>유급 샘플 테스트비 정산 포함</span>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              data-testid="withholding-tax-toggle"
              checked={applyWithholdingTax3_3}
              onChange={(e) => setApplyWithholdingTax3_3(e.target.checked)}
            />
            <span>3.3% 사업소득 원천징수 공제 계산</span>
          </label>
        </div>

        <div
          data-testid="episode-settlement-summary-banner"
          className="rounded-lg border border-accent/35 bg-accent/10 px-3 py-2 font-semibold text-fg"
        >
          {settlement.summaryKo}
        </div>
      </div>

      {/* 3. 한국만화영상진흥원 만화인 헬프데스크 6대 계약 안전 점검 */}
      <div className="grid gap-2.5 rounded-xl border border-line bg-canvas/60 p-3.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>3. 만화인 헬프데스크 표준계약 &amp; 불공정 외주 방지 6대 안전 점검</strong>
          <span
            data-testid="contract-safety-score-badge"
            className="rounded-full px-2.5 py-0.5 font-bold"
            style={{
              background: safetyEvaluation.isSafeForPublish ? "#dcfce7" : "#fef3c7",
              color: safetyEvaluation.isSafeForPublish ? "#166534" : "#92400e",
            }}
          >
            안전도 {safetyEvaluation.scoreOutOf100}점 ({safetyEvaluation.isSafeForPublish ? "공고 게시 적합" : "보완 권고"})
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              data-testid="check-written-contract"
              checked={writtenContractConfirmed}
              onChange={(e) => setWrittenContractConfirmed(e.target.checked)}
            />
            <span>서면 표준계약서 체결</span>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={businessOrWithholdingDeclared}
              onChange={(e) => setBusinessOrWithholdingDeclared(e.target.checked)}
            />
            <span>사업자등록 여부 명시</span>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              data-testid="check-paid-sample-test"
              checked={isSampleTestPaid}
              onChange={(e) => {
                setIsSampleTestPaid(e.target.checked);
                setRequiresSampleTest(true);
              }}
            />
            <span>유급 샘플 테스트 보장</span>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={overtimeCutRateSpecified}
              onChange={(e) => setOvertimeCutRateSpecified(e.target.checked)}
            />
            <span>초과 컷당 할증 단가 명시</span>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <span>무상 리테이크 상한(회):</span>
            <input
              type="number"
              aria-label="무상 리테이크 허용 상한"
              data-testid="max-free-retake-input"
              value={maxFreeRetakeCount}
              onChange={(e) => setMaxFreeRetakeCount(Number(e.target.value) || 0)}
              className="w-14 rounded border border-line bg-panel px-1.5 py-0.5"
            />
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={creditAndPortfolioPolicyClear}
              onChange={(e) => setCreditAndPortfolioPolicyClear(e.target.checked)}
            />
            <span>크레딧·포트폴리오 공개 기준 명시</span>
          </label>
        </div>

        <p data-testid="contract-helpdesk-advisory" className="text-fg-2">
          {safetyEvaluation.helpdeskAdvisoryKo}
        </p>
        {safetyEvaluation.warningsKo.length > 0 && (
          <ul role="alert" data-testid="contract-safety-warnings" className="list-disc pl-5 text-danger space-y-0.5">
            {safetyEvaluation.warningsKo.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </div>

      {/* 4. 구직자 포트폴리오(menus/297 말머리 182~187) 매칭 시뮬레이터 */}
      <div className="grid gap-2.5 rounded-xl border border-line bg-canvas/60 p-3.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>4. 구직·포트폴리오 인재 풀(말머리 182~187) 파트·장르·툴 자동 매칭</strong>
          <span className="text-fg-3">
            구직 말머리: {JOB_SEEKING_HEAD_TAGS.map((tag) => `${tag.labelKo}(${tag.headId})`).join(" · ")}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {candidateMatches.map((match) => (
            <div
              key={match.candidateId}
              data-testid={`candidate-match-card-${match.candidateId}`}
              className="rounded-lg border border-line bg-panel p-2.5 space-y-1"
            >
              <div className="flex items-center justify-between">
                <strong>{match.penName}</strong>
                <span
                  data-testid={`candidate-match-score-${match.candidateId}`}
                  className="rounded px-1.5 py-0.5 font-bold"
                  style={{
                    background: match.isEligible ? "#dcfce7" : "#fee2e2",
                    color: match.isEligible ? "#166534" : "#991b1b",
                  }}
                >
                  {match.isEligible ? `적합 ${match.matchScore}점` : "제외 조건 해당"}
                </span>
              </div>
              {match.isEligible ? (
                <p className="text-fg-2">{match.matchedReasonsKo.join(" · ")}</p>
              ) : (
                <p className="text-danger">{match.disqualifierReasonsKo.join(" · ")}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
