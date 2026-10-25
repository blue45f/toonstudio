/**
 * 웹툰 어시스턴트 구인·외주·포트폴리오 표준 양식 및 계약 안전 검증 모델.
 *
 * REA 클린룸 역공학 근거:
 * - 방방곡곡 (`https://cafe.naver.com/bscomic`, `clubid=10194236`):
 *   - `menuId=294` (`[구인]정규/계약직원`, `boardType=W`), `menuId=295` (`[구인]단기/외주/기타`, `boardType=I`, `headId=175: 구인완료`)
 *   - `menuId=297` (`[구직&포트폴리오]`, `headId=182~187`: 정규직 구직·계약직 구직·단기프로젝트·프리랜서·아르바이트·기타)
 *   - `menuId=239` (`[모집]모임/파트너`), `menuId=309` (`커미션`), 공지 `#869608` (`[한국만화영상진흥원] 만화인 헬프데스크`)
 *   - 실제 공고(`#874418`, `#874360`, `#874352`, `#874090`, `#874018`)의 표준 양식, 지원 메일 제목 규격,
 *     포트폴리오 제출 규격(무압축 JPG/PDF, 옷주름·전신·원꾸 전후 비교), 회당 기준 컷수 및 초과 컷당 추가 단가, 유급 샘플 테스트
 * - 웹픽월드 (`https://www.webpickworld.com/api/job-role-categories`):
 *   - `001` 웹툰 17개 세부 공정 코드(`001.001` 글 작가 ~ `001.017` 후보정 담당)
 * - 웹툰몬 (`https://homma.vqoo.net/`):
 *   - 구인·구직·과외 맞춤 필터 및 포트폴리오 매칭 구조
 */

export type WebtoonSpecializationCode =
  | "001.001"
  | "001.002"
  | "001.003"
  | "001.004"
  | "001.005"
  | "001.006"
  | "001.007"
  | "001.008"
  | "001.009"
  | "001.010"
  | "001.011"
  | "001.012"
  | "001.013"
  | "001.014"
  | "001.015"
  | "001.016"
  | "001.017";

export interface WebtoonSpecializationPart {
  readonly code: WebtoonSpecializationCode;
  readonly slug: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly defaultScopeKo: string;
  readonly requiredPortfolioCheckpointsKo: readonly string[];
  readonly primaryTools: readonly WebtoonProductionTool[];
}

export type WebtoonProductionTool =
  | "clip-studio-ex"
  | "photoshop"
  | "sketchup"
  | "blender"
  | "snaptoon"
  | "illustrator";

export type OutsourcingBoardCategory =
  | "regular-contract"
  | "short-term-outsourcing"
  | "job-seeking-portfolio"
  | "partner-team"
  | "commission";

export type JobSeekingHeadTagId = 182 | 183 | 184 | 185 | 186 | 187;

export interface JobSeekingHeadTag {
  readonly headId: JobSeekingHeadTagId;
  readonly labelKo: string;
  readonly labelEn: string;
}

export type WebtoonGenreTag =
  | "romance-fantasy"
  | "modern-fantasy"
  | "martial-arts"
  | "action-shonen"
  | "modern-romance"
  | "drama-daily"
  | "bl-gl"
  | "adult-19";

export type WorkTitleVisibility = "confidential-prelaunch" | "nda-on-contract" | "public-title";

export type OutsourcingRateModel =
  | "per-episode-with-overtime"
  | "per-cut"
  | "monthly-fixed";

export interface OutsourcingRecruitmentSpec {
  readonly boardCategory: OutsourcingBoardCategory;
  readonly partCode: WebtoonSpecializationCode;
  readonly recruiterNameOrStudio: string;
  readonly hasBusinessRegistration: boolean;
  readonly workTitleVisibility: WorkTitleVisibility;
  readonly workTitleOrPlaceholder: string;
  readonly genre: WebtoonGenreTag;
  readonly isAdultContent: boolean;
  readonly processScopeDetailKo: string;
  readonly rateModel: OutsourcingRateModel;
  readonly baseEpisodeRateKrw: number;
  readonly baseCutThreshold: number;
  readonly overtimeCutRateKrw: number;
  readonly perCutRateKrw: number;
  readonly monthlySalaryKrw: number;
  readonly requiresSampleTest: boolean;
  readonly isSampleTestPaid: boolean;
  readonly sampleTestFeeKrw: number;
  readonly maxFreeRetakeCount: number;
  readonly allowExternalCloudLinkPortfolio: boolean;
  readonly requiredPortfolioFormats: readonly ("pdf" | "uncompressed-jpg")[];
  readonly applicantSubjectPrefix: string;
}

export interface EpisodeSettlementCalculationInput {
  readonly rateModel: OutsourcingRateModel;
  readonly baseEpisodeRateKrw: number;
  readonly baseCutThreshold: number;
  readonly overtimeCutRateKrw: number;
  readonly perCutRateKrw: number;
  readonly monthlySalaryKrw: number;
  readonly actualCutCount: number;
  readonly includePaidSampleTest: boolean;
  readonly sampleTestFeeKrw: number;
  readonly applyWithholdingTax3_3: boolean;
}

export interface EpisodeSettlementResult {
  readonly basePayKrw: number;
  readonly overtimeCutCount: number;
  readonly overtimePayKrw: number;
  readonly sampleTestPayKrw: number;
  readonly grossTotalKrw: number;
  readonly withholdingTaxKrw: number;
  readonly netPayoutKrw: number;
  readonly summaryKo: string;
}

export interface ContractHelpdeskChecklistInput {
  readonly writtenContractConfirmed: boolean;
  readonly businessOrWithholdingDeclared: boolean;
  readonly requiresSampleTest: boolean;
  readonly isSampleTestPaid: boolean;
  readonly overtimeCutRateSpecified: boolean;
  readonly maxFreeRetakeCount: number;
  readonly creditAndPortfolioPolicyClear: boolean;
}

export interface ContractHelpdeskSafetyEvaluation {
  readonly isSafeForPublish: boolean;
  readonly scoreOutOf100: number;
  readonly passedChecksKo: readonly string[];
  readonly warningsKo: readonly string[];
  readonly helpdeskAdvisoryKo: string;
}

export interface AssistantJobSeekerProfile {
  readonly id: string;
  readonly penName: string;
  readonly headId: JobSeekingHeadTagId;
  readonly primaryPartCode: WebtoonSpecializationCode;
  readonly secondaryPartCodes: readonly WebtoonSpecializationCode[];
  readonly preferredGenres: readonly WebtoonGenreTag[];
  readonly excludedGenres: readonly WebtoonGenreTag[];
  readonly tools: readonly WebtoonProductionTool[];
  readonly weeklyMaxCuts: number;
  readonly availableForUrgentSub: boolean;
  readonly portfolioVerified: boolean;
}

export interface CandidateMatchEvaluation {
  readonly candidateId: string;
  readonly penName: string;
  readonly isEligible: boolean;
  readonly matchScore: number;
  readonly matchedReasonsKo: readonly string[];
  readonly disqualifierReasonsKo: readonly string[];
}

export const WEBTOON_SPECIALIZATION_PARTS: readonly WebtoonSpecializationPart[] = Object.freeze([
  {
    code: "001.001",
    slug: "story-writer",
    labelKo: "글 작가 (스토리·각색)",
    labelEn: "Story & Adaptation Writer",
    defaultScopeKo: "원작 웹소설 각색 또는 오리지널 트리트먼트·회차별 대본 집필",
    requiredPortfolioCheckpointsKo: ["완결 또는 3화 이상 연속 각색 대본 샘플", "회차별 기승전결 및 클리프행어 구성안"],
    primaryTools: ["clip-studio-ex"],
  },
  {
    code: "001.002",
    slug: "storyboard",
    labelKo: "콘티 작가 (연출·화면 설계)",
    labelEn: "Storyboard Artist",
    defaultScopeKo: "글 콘티 기반 60~75컷 스크롤 연출, 카메라 앵글·말풍선 배치 설계",
    requiredPortfolioCheckpointsKo: ["대사 포함 스크롤 연출 콘티 1화 분량", "액션 또는 감정선 연출 전후 비교"],
    primaryTools: ["clip-studio-ex", "photoshop"],
  },
  {
    code: "001.003",
    slug: "lineart",
    labelKo: "선화 작가 (펜선·인물·엑스트라)",
    labelEn: "Line Art Assistant",
    defaultScopeKo: "러프 스케치 위 캐릭터 펜선 따기, 의상 옷주름 묘사 및 엑스트라 선화 작업",
    requiredPortfolioCheckpointsKo: ["옷주름·인체 전신 샷 필수 포함", "콘티→선화 완성본 비교 샘플", "컷당 평균 소요 시간 기재"],
    primaryTools: ["clip-studio-ex"],
  },
  {
    code: "001.004",
    slug: "flats",
    labelKo: "밑색 담당 (레이어 분리 채색)",
    labelEn: "Flats Assistant",
    defaultScopeKo: "피부·헤어·의상·장신구 부위별 지정 팔레트 밑색 분리 및 틈새 메우기",
    requiredPortfolioCheckpointsKo: ["부위별 폴더·레이어 분리 구조 캡처", "컬러 파레트 준수 정확도 샘플"],
    primaryTools: ["clip-studio-ex", "photoshop"],
  },
  {
    code: "001.005",
    slug: "coloring-shading",
    labelKo: "채색 작가 (명암·질감 표현)",
    labelEn: "Coloring & Shading Artist",
    defaultScopeKo: "밑색 완료 원고 위 1·2차 셀/브러시 명암, 금속·보석·피부 질감 묘사",
    requiredPortfolioCheckpointsKo: ["밑색→명암 완성 전후 비교 컷", "역광·야간·실내 조명별 채색 샘플"],
    primaryTools: ["clip-studio-ex", "photoshop"],
  },
  {
    code: "001.006",
    slug: "color-grading",
    labelKo: "보정 작가 (색감·조명 연출)",
    labelEn: "Color Grading Specialist",
    defaultScopeKo: "시간대·감정선에 맞춘 그라데이션 맵, 광원 효과 및 컷 간 톤 균일화",
    requiredPortfolioCheckpointsKo: ["보정 전/후 비교 포트폴리오 5컷 이상"],
    primaryTools: ["clip-studio-ex", "photoshop"],
  },
  {
    code: "001.007",
    slug: "background-2d",
    labelKo: "배경 작가 (2D 배경 작화·리터칭)",
    labelEn: "2D Background Artist",
    defaultScopeKo: "자연물·이세계 배경 작화 및 3D 추출 배경 위 작화풍 리터칭",
    requiredPortfolioCheckpointsKo: ["2D 배경 단독 작화 및 3D 리터칭 샘플"],
    primaryTools: ["clip-studio-ex", "photoshop"],
  },
  {
    code: "001.008",
    slug: "background-3d",
    labelKo: "3D 배경 담당 (모델링·추출·배치)",
    labelEn: "3D Background Specialist",
    defaultScopeKo: "스케치업·블렌더·스냅툰 3D 배경 제작 및 콘티 앵글 맞춤 은선·텍스처 추출 배치",
    requiredPortfolioCheckpointsKo: ["3D 모델링 또는 스냅툰/스케치업 컷 배치·조명 세팅 샘플", "보유 상업 라이선스 에셋 목록"],
    primaryTools: ["sketchup", "blender", "snaptoon", "clip-studio-ex"],
  },
  {
    code: "001.009",
    slug: "character-art",
    labelKo: "캐릭터 작화 전담 (주연 데생·작감)",
    labelEn: "Lead Character Artist",
    defaultScopeKo: "주요 등장인물 얼굴·체형 작화 유지(작감) 및 하이라이트 컷 전담",
    requiredPortfolioCheckpointsKo: ["캐릭터 시트(삼면도·표정 시트) 및 하이라이트 컷"],
    primaryTools: ["clip-studio-ex"],
  },
  {
    code: "001.010",
    slug: "sd-chibi",
    labelKo: "SD/개그 컷 담당",
    labelEn: "SD & Chibi Cut Artist",
    defaultScopeKo: "회차 내 데포르메(SD) 개그 연출 컷 및 마스코트 작화 전담",
    requiredPortfolioCheckpointsKo: ["SD 캐릭터 감정 표현 및 개그 컷 샘플"],
    primaryTools: ["clip-studio-ex"],
  },
  {
    code: "001.011",
    slug: "effects",
    labelKo: "효과 담당 (이펙트·액션 연출)",
    labelEn: "VFX & Action Effects Artist",
    defaultScopeKo: "마법·검기·폭발·집중선 이펙트 브러시 연출 및 타격감 보강",
    requiredPortfolioCheckpointsKo: ["액션/판타지 이펙트 전후 비교 샘플"],
    primaryTools: ["clip-studio-ex", "photoshop"],
  },
  {
    code: "001.012",
    slug: "balloon-typo",
    labelKo: "말풍선/타이포 담당 (효과음 작화)",
    labelEn: "Speech Balloon & SFX Typography",
    defaultScopeKo: "감정선별 말풍선 디자인 및 손글씨/타이포 효과음(SFX) 배치",
    requiredPortfolioCheckpointsKo: ["장르별 효과음 타이포 및 말풍선 연출 샘플"],
    primaryTools: ["clip-studio-ex", "illustrator", "photoshop"],
  },
  {
    code: "001.013",
    slug: "lettering",
    labelKo: "식자 담당 (대사 입력·식자 마감)",
    labelEn: "Lettering Assistant",
    defaultScopeKo: "대본 대조 대사 식자 입력, 폰트 위계 정리 및 다국어 식자 대응",
    requiredPortfolioCheckpointsKo: ["식자 레이어 템플릿 정리 및 대사 배치 샘플"],
    primaryTools: ["clip-studio-ex", "photoshop"],
  },
  {
    code: "001.014",
    slug: "qc-review",
    labelKo: "검수 담당 (작화·식자·출고 규격 QC)",
    labelEn: "Quality Control Reviewer",
    defaultScopeKo: "옥에 티(소품·의상 오류), 오탈자, 레이어 누락 및 플랫폼 출고 해상도 최종 검수",
    requiredPortfolioCheckpointsKo: ["검수 체크리스트 및 오류 검출 리포트 경험"],
    primaryTools: ["clip-studio-ex", "photoshop"],
  },
  {
    code: "001.015",
    slug: "webtoon-pd",
    labelKo: "웹툰 PD (일정·외주 파이프라인 관리)",
    labelEn: "Webtoon Producer (PD)",
    defaultScopeKo: "어시스턴트 분업 일정 조율, 세이브 원고 버퍼 관리 및 에셋 라이선스 배분",
    requiredPortfolioCheckpointsKo: ["담당 런칭작/연재작 관리 이력"],
    primaryTools: ["clip-studio-ex"],
  },
  {
    code: "001.016",
    slug: "editor",
    labelKo: "편집자 (기획·연재처 커뮤니케이션)",
    labelEn: "Managing Editor",
    defaultScopeKo: "스토리 피드백, 플랫폼 프로모션 협의 및 연재 지표 분석",
    requiredPortfolioCheckpointsKo: ["기획·편집 참여 작품 이력"],
    primaryTools: ["clip-studio-ex"],
  },
  {
    code: "001.017",
    slug: "post-processing",
    labelKo: "후보정·원꾸 담당 (식자 전 최종 마감)",
    labelEn: "Post-Processing & Manuscript Finishing",
    defaultScopeKo: "명암까지 완료된 원고를 받아 식자 전까지의 후보정·원꾸(이펙트·배경 블렌딩·광원) 전반",
    requiredPortfolioCheckpointsKo: ["명암본→원꾸·후보정 완료본 전후 비교 필수", "컷당 소요 시간 및 본인 기여도(%) 명시"],
    primaryTools: ["clip-studio-ex", "photoshop"],
  },
]);

export const BSCOMIC_BOARD_CATEGORIES: Readonly<
  Record<
    OutsourcingBoardCategory,
    {
      readonly menuId: number;
      readonly boardType: "W" | "I";
      readonly labelKo: string;
      readonly labelEn: string;
      readonly descriptionKo: string;
    }
  >
> = Object.freeze({
  "regular-contract": {
    menuId: 294,
    boardType: "W",
    labelKo: "[구인] 정규/계약직원",
    labelEn: "Full-time & Contract Recruitment",
    descriptionKo: "스튜디오·에이전시·작가팀의 정규직, 연재 계약직, 장기 메인 어시스턴트 채용 공고",
  },
  "short-term-outsourcing": {
    menuId: 295,
    boardType: "I",
    labelKo: "[구인] 단기/외주/대타",
    labelEn: "Short-term Outsourcing & Urgent Sub",
    descriptionKo: "회차별 단기 외주, 특정 파트(선화·밑색·3D배경·원꾸) 부분 외주 및 긴급 1회성 대타 구인",
  },
  "job-seeking-portfolio": {
    menuId: 297,
    boardType: "I",
    labelKo: "[구직&포트폴리오]",
    labelEn: "Job Seeking & Portfolio Showcase",
    descriptionKo: "어시스턴트·작가의 파트별 포트폴리오 등록 및 즉시 투입 가능 일정 공개",
  },
  "partner-team": {
    menuId: 239,
    boardType: "W",
    labelKo: "[모집] 모임/파트너",
    labelEn: "Co-Creation Partner & Team",
    descriptionKo: "공모전·신규 런칭 준비를 위한 글/그림 공동창작 파트너 모집",
  },
  commission: {
    menuId: 309,
    boardType: "I",
    labelKo: "커미션 (표지·타이틀·단발 작화)",
    labelEn: "Commission",
    descriptionKo: "웹소설 표지, 타이틀 로고, 홍보 일러스트 등 단발성 의뢰",
  },
});

export const JOB_SEEKING_HEAD_TAGS: readonly JobSeekingHeadTag[] = Object.freeze([
  { headId: 182, labelKo: "정규직 구직", labelEn: "Full-time Seeking" },
  { headId: 183, labelKo: "계약직 구직", labelEn: "Contract Seeking" },
  { headId: 184, labelKo: "단기프로젝트", labelEn: "Short-term Project" },
  { headId: 185, labelKo: "프리랜서", labelEn: "Freelancer" },
  { headId: 186, labelKo: "아르바이트", labelEn: "Part-time / Sub" },
  { headId: 187, labelKo: "기타", labelEn: "Other" },
]);

export const WEBTOON_GENRE_LABELS: Readonly<Record<WebtoonGenreTag, string>> = Object.freeze({
  "romance-fantasy": "로맨스판타지 (로판)",
  "modern-fantasy": "현대판타지 (현판·헌터)",
  "martial-arts": "무협·동양풍",
  "action-shonen": "남성향 액션·학원",
  "modern-romance": "현대 로맨스 (현로)",
  "drama-daily": "드라마·일상·스릴러",
  "bl-gl": "BL / GL",
  "adult-19": "성인물 (19금)",
});

export const WEBTOON_TOOL_LABELS: Readonly<Record<WebtoonProductionTool, string>> = Object.freeze({
  "clip-studio-ex": "클립스튜디오 EX (Clip Studio Paint)",
  photoshop: "어도비 포토샵 (Photoshop)",
  sketchup: "스케치업 (SketchUp)",
  blender: "블렌더 (Blender)",
  snaptoon: "스냅툰 (Snaptoon)",
  illustrator: "어도비 일러스트레이터 (Illustrator)",
});

export function getSpecializationPartByCode(
  code: WebtoonSpecializationCode,
): WebtoonSpecializationPart {
  const found = WEBTOON_SPECIALIZATION_PARTS.find((item) => item.code === code);
  return found ?? WEBTOON_SPECIALIZATION_PARTS[2];
}

/**
 * 방방곡곡(`bscomic`) 공고 표준 지원 메일/지원서 제목 규격을 생성한다.
 * 관측 패턴: `[정규직_웹툰선화]성함` (`#874418`), `[선화] 이름 지원서` (`#874352`)
 */
export function formatApplicationSubjectLine(
  spec: Pick<OutsourcingRecruitmentSpec, "boardCategory" | "partCode" | "applicantSubjectPrefix">,
  applicantPenName: string,
): string {
  const part = getSpecializationPartByCode(spec.partCode);
  const cleanName = applicantPenName.trim() || "지원자필명";
  const prefix = spec.applicantSubjectPrefix.trim() || (
    spec.boardCategory === "regular-contract" ? "정규계약" : "외주지원"
  );
  const shortPartName = part.labelKo.split(" ")[0] ?? part.labelKo;
  return `[${prefix}_${shortPartName}] ${cleanName} 지원서`;
}

/**
 * 회차당 기본 컷수 + 초과 컷당 할증 단가(`#874018` 패턴: 20~30컷 기준, 초과 시 컷당 추가 단가)
 * 및 유급 샘플 테스트비, 3.3% 원천징수를 반영한 정산 금액을 계산한다.
 */
export function calculateEpisodeOutsourcingSettlement(
  input: EpisodeSettlementCalculationInput,
): EpisodeSettlementResult {
  const safeActualCuts = Math.max(0, Math.trunc(input.actualCutCount));
  const safeThreshold = Math.max(1, Math.trunc(input.baseCutThreshold));
  const sampleTestPayKrw = input.includePaidSampleTest
    ? Math.max(0, Math.round(input.sampleTestFeeKrw))
    : 0;

  let basePayKrw: number;
  let overtimeCutCount = 0;
  let overtimePayKrw = 0;

  if (input.rateModel === "per-episode-with-overtime") {
    basePayKrw = Math.max(0, Math.round(input.baseEpisodeRateKrw));
    overtimeCutCount = Math.max(0, safeActualCuts - safeThreshold);
    overtimePayKrw = overtimeCutCount * Math.max(0, Math.round(input.overtimeCutRateKrw));
  } else if (input.rateModel === "per-cut") {
    basePayKrw = safeActualCuts * Math.max(0, Math.round(input.perCutRateKrw));
  } else {
    basePayKrw = Math.max(0, Math.round(input.monthlySalaryKrw));
  }

  const grossTotalKrw = basePayKrw + overtimePayKrw + sampleTestPayKrw;
  const withholdingTaxKrw = input.applyWithholdingTax3_3
    ? Math.round(grossTotalKrw * 0.033)
    : 0;
  const netPayoutKrw = grossTotalKrw - withholdingTaxKrw;

  const summaryKo =
    input.rateModel === "per-episode-with-overtime"
      ? `기본 ${safeThreshold}컷(${basePayKrw.toLocaleString("ko-KR")}원) + 초과 ${overtimeCutCount}컷(${overtimePayKrw.toLocaleString("ko-KR")}원)${sampleTestPayKrw > 0 ? ` + 유급 테스트(${sampleTestPayKrw.toLocaleString("ko-KR")}원)` : ""} = 세전 ${grossTotalKrw.toLocaleString("ko-KR")}원 (실지급 ${netPayoutKrw.toLocaleString("ko-KR")}원)`
      : `총 ${safeActualCuts}컷 정산 세전 ${grossTotalKrw.toLocaleString("ko-KR")}원 (실지급 ${netPayoutKrw.toLocaleString("ko-KR")}원)`;

  return {
    basePayKrw,
    overtimeCutCount,
    overtimePayKrw,
    sampleTestPayKrw,
    grossTotalKrw,
    withholdingTaxKrw,
    netPayoutKrw,
    summaryKo,
  };
}

/**
 * 한국만화영상진흥원 '만화인 헬프데스크'(`#869608`) 및 방방곡곡 구인구직 필독 규정 기반
 * 외주·구인 계약 안전도 점검을 수행한다.
 */
export function evaluateContractHelpdeskSafety(
  input: ContractHelpdeskChecklistInput,
): ContractHelpdeskSafetyEvaluation {
  const passedChecksKo: string[] = [];
  const warningsKo: string[] = [];

  if (input.writtenContractConfirmed) {
    passedChecksKo.push("표준 계약서(문화체육관광부 만화 분야 표준계약서 준거) 서면 체결 명시");
  } else {
    warningsKo.push("서면 계약서 체결 여부가 누락되었습니다. 착수 전 표준계약서 작성이 필수입니다.");
  }

  if (input.businessOrWithholdingDeclared) {
    passedChecksKo.push("사업자등록 여부 및 정산 세무 처리(세금계산서 또는 3.3% 원천징수) 주체 명시");
  } else {
    warningsKo.push("사업자등록 유무 및 정산 방식이 불명확합니다 (방방곡곡 필수 기재 항목).");
  }

  if (!input.requiresSampleTest || input.isSampleTestPaid) {
    passedChecksKo.push(
      input.requiresSampleTest
        ? "유급 샘플 테스트비 지급 보장 (무급 테스트 착취 방지)"
        : "별도 샘플 테스트 없이 포트폴리오 기반 즉시 심사",
    );
  } else {
    warningsKo.push("샘플 테스트가 무급으로 설정되어 있습니다. 창작물 실무 테스트는 유급 지급이 권장됩니다.");
  }

  if (input.overtimeCutRateSpecified) {
    passedChecksKo.push("회당 기준 컷수 및 초과 컷당 할증 단가 산정 기준 명시");
  } else {
    warningsKo.push("회당 기준 컷수 초과 시 추가 단가 기준이 없어 무제한 분량 증가 분쟁 위험이 있습니다.");
  }

  if (input.maxFreeRetakeCount <= 2) {
    passedChecksKo.push(`무상 리테이크(수정) 횟수 상한(${input.maxFreeRetakeCount}회) 명시`);
  } else {
    warningsKo.push(`무상 리테이크 허용 횟수(${input.maxFreeRetakeCount}회)가 과도합니다. 1~2회 상한 설정을 권장합니다.`);
  }

  if (input.creditAndPortfolioPolicyClear) {
    passedChecksKo.push("작품 크레딧(필명) 표기 및 포트폴리오 공개 허용 시점 명시");
  } else {
    warningsKo.push("어시스턴트 크레딧 표기 및 런칭 후 포트폴리오 활용 가능 여부가 누락되었습니다.");
  }

  const totalChecks = 6;
  const scoreOutOf100 = Math.round((passedChecksKo.length / totalChecks) * 100);
  const isSafeForPublish = warningsKo.length === 0;

  return {
    isSafeForPublish,
    scoreOutOf100,
    passedChecksKo,
    warningsKo,
    helpdeskAdvisoryKo: isSafeForPublish
      ? "만화인 헬프데스크 6대 권익 보호 기준을 모두 충족하여 안전하게 구인/외주 공고를 게시할 수 있습니다."
      : `총 ${warningsKo.length}건의 계약 분쟁 위험 항목이 감지되었습니다. 한국만화영상진흥원 만화인 헬프데스크 사전 계약 검토 권고사항을 반영해 주세요.`,
  };
}

/**
 * 구인 공고 조건과 구직자(`menus/297` 포트폴리오) 프로필의 파트·장르(비선호/성인물 제외 포함)·툴 적합도를 평가한다.
 */
export function matchAssistantCandidateProfile(
  spec: Pick<
    OutsourcingRecruitmentSpec,
    "partCode" | "genre" | "isAdultContent" | "baseCutThreshold"
  >,
  candidate: AssistantJobSeekerProfile,
): CandidateMatchEvaluation {
  const matchedReasonsKo: string[] = [];
  const disqualifierReasonsKo: string[] = [];
  let matchScore = 0;

  // 1. 파트 일치 여부
  const isPrimaryPart = candidate.primaryPartCode === spec.partCode;
  const isSecondaryPart = candidate.secondaryPartCodes.includes(spec.partCode);
  if (isPrimaryPart) {
    matchScore += 45;
    matchedReasonsKo.push("주력 1순위 담당 공정 일치");
  } else if (isSecondaryPart) {
    matchScore += 30;
    matchedReasonsKo.push("부전공(2순위) 가능 공정 일치");
  } else {
    disqualifierReasonsKo.push("모집 공정과 구직자 담당 파트가 일치하지 않음");
  }

  // 2. 비선호/제외 장르 및 성인물 제외 조건 검사 (`#874436` 패턴)
  if (candidate.excludedGenres.includes(spec.genre)) {
    disqualifierReasonsKo.push(`구직자 제외 장르(${WEBTOON_GENRE_LABELS[spec.genre]})에 해당함`);
  } else if (spec.isAdultContent && candidate.excludedGenres.includes("adult-19")) {
    disqualifierReasonsKo.push("구직자가 성인물(19금) 작업을 제외 조건으로 설정함");
  } else if (candidate.preferredGenres.includes(spec.genre)) {
    matchScore += 25;
    matchedReasonsKo.push(`선호 장르(${WEBTOON_GENRE_LABELS[spec.genre]}) 일치`);
  } else {
    matchScore += 15;
    matchedReasonsKo.push("작업 가능 장르 범위 충족");
  }

  // 3. 필수 툴 보유 여부
  const partMeta = getSpecializationPartByCode(spec.partCode);
  const hasPrimaryTool = partMeta.primaryTools.some((tool) => candidate.tools.includes(tool));
  if (hasPrimaryTool) {
    matchScore += 15;
    matchedReasonsKo.push("파트 필수 제작 툴 보유");
  } else {
    disqualifierReasonsKo.push("파트 필수 제작 툴 미보유");
  }

  // 4. 주간 소화 컷수 및 포트폴리오 검증
  if (candidate.weeklyMaxCuts >= spec.baseCutThreshold) {
    matchScore += 10;
    matchedReasonsKo.push(`주간 소화 가능 컷수(${candidate.weeklyMaxCuts}컷) 충족`);
  }
  if (candidate.portfolioVerified) {
    matchScore += 5;
    matchedReasonsKo.push("무압축 원본 포트폴리오 및 기여도 검증 완료");
  }

  const isEligible = disqualifierReasonsKo.length === 0;
  return {
    candidateId: candidate.id,
    penName: candidate.penName,
    isEligible,
    matchScore: isEligible ? Math.min(100, matchScore) : 0,
    matchedReasonsKo,
    disqualifierReasonsKo,
  };
}
