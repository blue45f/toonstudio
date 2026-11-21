import {
  maskCreatorInputBeforeAiSend,
  runFreeAiZeroBillAssist,
  type FreeAiZeroBillAssistInput,
  type FreeAiZeroBillAssistResponse,
} from "@/shared/ai/free-ai-zero-bill-cascade";

import {
  DIVISION_PRESET_OPTIONS,
  MAX_UNDO_HISTORY,
  PLATFORM_SPEC_OPTIONS,
  SMART_FORM_WORKFLOW_SCHEMAS,
  assertMinimalRequiredContract,
  type SmartFormFieldOrigin,
  type SmartFormRecommendationSource,
  type SmartFormWorkflowId,
} from "./smart-form-workflow-schemas";

export {
  AGE_RATING_OPTIONS,
  DIVISION_PRESET_OPTIONS,
  GENRE_OPTIONS,
  MAX_REQUIRED_FIELDS,
  MAX_UNDO_HISTORY,
  MIN_OPTIONAL_FIELDS,
  PLATFORM_SPEC_OPTIONS,
  SMART_FORM_WORKFLOW_IDS,
  SMART_FORM_WORKFLOW_SCHEMAS,
  assertAllBuiltInWorkflowContracts,
  assertMinimalRequiredContract,
  type SmartFormFieldDefinition,
  type SmartFormFieldKind,
  type SmartFormFieldOrigin,
  type SmartFormRecommendationSource,
  type SmartFormWorkflowId,
  type SmartFormWorkflowSchema,
} from "./smart-form-workflow-schemas";

export interface SmartFieldRecommendation {
  readonly fieldId: string;
  readonly value: string;
  readonly confidence: number;
  readonly reasonKo: string;
  readonly source: SmartFormRecommendationSource;
  readonly tagsPreview?: readonly string[];
}

export interface SmartFormContextSignals {
  readonly genre: string;
  readonly subGenre: string | null;
  readonly platformKey: "naver" | "kakao" | "cuttoon" | "print" | "highres";
  readonly episodeNumber: number | null;
  readonly moodKey:
    | "night-neon"
    | "warm-school"
    | "action-crimson"
    | "cozy-daily"
    | "mystery-fog"
    | "cyber-pulse";
  readonly divisionRole: string;
  readonly inquiryCategory: string;
  readonly matchedKeywords: readonly string[];
}

export interface SmartFormAutofillResult {
  readonly workflowId: SmartFormWorkflowId;
  readonly hasEnoughContext: boolean;
  readonly engineMode: "local-deterministic" | "zero-bill-cascade";
  readonly providerLabelKo: string;
  readonly costKrw: 0;
  readonly costUsdGuaranteed: "$0.00";
  readonly paidBillingBlocked: true;
  readonly piiRedactedCount: number;
  readonly filledCount: number;
  readonly summaryKo: string;
  readonly noticeKo: string | null;
  readonly signals: SmartFormContextSignals;
  readonly recommendations: Readonly<Record<string, SmartFieldRecommendation>>;
}

export interface SmartFormUndoSnapshot {
  readonly id: string;
  readonly createdAtIso: string;
  readonly labelKo: string;
  readonly optionalValues: Readonly<Record<string, string>>;
  readonly fieldOrigins: Readonly<Record<string, SmartFormFieldOrigin>>;
}

export interface SmartFormState {
  readonly workflowId: SmartFormWorkflowId;
  readonly requiredValues: Readonly<Record<string, string>>;
  readonly optionalValues: Readonly<Record<string, string>>;
  readonly fieldOrigins: Readonly<Record<string, SmartFormFieldOrigin>>;
  readonly recommendations: Readonly<Record<string, SmartFieldRecommendation>>;
  readonly undoStack: readonly SmartFormUndoSnapshot[];
  readonly lastNoticeKo: string | null;
  readonly lastEngineMode: "local-deterministic" | "zero-bill-cascade" | null;
  readonly lastCostKrw: 0;
}

export interface SmartFormValidationResult {
  readonly valid: boolean;
  readonly missingFieldIds: readonly string[];
  readonly messageKo: string;
}

export type ZeroBillAssistRunner = (
  input: FreeAiZeroBillAssistInput,
  options?: { readonly signal?: AbortSignal },
) => Promise<FreeAiZeroBillAssistResponse>;

const CASCADE_ENRICH_TARGET_FIELD: Readonly<Record<SmartFormWorkflowId, string>> = {
  "project-create": "synopsis",
  "episode-publish": "episodeSummary",
  "export-release": "preflightChecklist",
  "team-division-invite": "welcomeMessage",
  "support-inquiry": "selfCheckTip",
};

const SUPPORT_SURFACE_MAP: Readonly<Record<string, string>> = {
  "드로잉·브러시 성능": "스튜디오 캔버스 편집기 (브러시·필압 입력)",
  "저장·자동 백업": "로컬 SQLite/OPFS 저장소 및 동기화 상태바",
  "내보내기·출고 규격": "원고 내보내기 · Rights BOM 프리플라이트 패널",
  "협업·권한·계정": "분업 팀 초대 · 워크스페이스 권한 관리",
  "요금·결제 안내": "계정 · 요금제 및 무료 AI 보호 설정",
  "일반 사용 안내": "ToonStudio 작업실 전반",
};

const SUPPORT_TIP_MAP: Readonly<Record<string, string>> = {
  "드로잉·브러시 성능":
    "브라우저 하드웨어 가속(WebGPU/WebGL) 활성화와 브러시 안정화 수치를 1단계 낮춰 비교해 보세요.",
  "저장·자동 백업":
    "브라우저 시크릿 모드 여부를 확인하고, 상단 저장 배지에서 로컬 스냅샷 백업(.toon)을 먼저 내려받으세요.",
  "내보내기·출고 규격":
    "출고 패널의 Rights BOM 경고를 열어 누락된 무료 폰트 대체 옵션이 켜져 있는지 확인해 보세요.",
  "협업·권한·계정":
    "초대 링크를 받은 브라우저에서 로그인 계정이 초대 이메일과 일치하는지 확인해 보세요.",
  "요금·결제 안내":
    "ToonStudio 무료 AI 모드는 ₩0 한도 보호가 기본 활성화되어 유료 과금이 발생하지 않습니다.",
  "일반 사용 안내": "페이지를 새로고침해도 로컬 자동 저장 원고는 안전하게 유지됩니다.",
};

function detectSignals(rawText: string): SmartFormContextSignals {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const matched: string[] = [];

  const hasAny = (keywords: readonly string[]): boolean => {
    let found = false;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        if (!matched.includes(kw)) matched.push(kw);
        found = true;
      }
    }
    return found;
  };

  const isRofan = hasAny(["로판", "로맨스판타지", "영애", "황궁", "공작", "회귀", "빙의"]);
  const isSchool = hasAny(["학원", "학교", "교실", "청춘", "선배", "캠퍼스", "동아리"]);
  const isAction = hasAny(["액션", "판타지", "던전", "헌터", "보스", "각성", "전투", "무협"]);
  const isDaily = hasAny(["일상", "4컷", "네컷", "고양이", "개그", "코미디", "공감", "브이로그", "직장"]);
  const isMystery = hasAny(["미스터리", "추리", "스릴러", "탐정", "비밀", "자정", "사건", "공포"]);
  const isSf = hasAny(["사이버펑크", "sf", "우주", "미래", "로봇", "디스토피아", "네온"]);
  const isRomance = hasAny(["로맨스", "고백", "첫사랑", "연애", "설렘", "짝사랑"]);
  const isNight = hasAny(["야경", "밤", "새벽", "달빛", "자정", "옥상", "서울", "네온"]);

  let genre = "힐링·드라마";
  let subGenre: string | null = null;
  let moodKey: SmartFormContextSignals["moodKey"] = "warm-school";

  if (isRofan) {
    genre = "로맨스 판타지";
    subGenre = isSchool ? "학원물" : isMystery ? "미스터리" : null;
    moodKey = isNight ? "night-neon" : "warm-school";
  } else if (isSf) {
    genre = "SF·사이버펑크";
    subGenre = isAction ? "액션" : null;
    moodKey = "cyber-pulse";
  } else if (isAction) {
    genre = "액션·판타지";
    subGenre = isSchool ? "학원물" : null;
    moodKey = "action-crimson";
  } else if (isMystery) {
    genre = "미스터리·스릴러";
    moodKey = "mystery-fog";
  } else if (isDaily) {
    genre = "일상·코미디";
    moodKey = "cozy-daily";
  } else if (isSchool || isRomance) {
    genre = "학원·청춘";
    subGenre = isRomance ? "로맨스" : null;
    moodKey = isNight ? "night-neon" : "warm-school";
  } else if (isNight) {
    moodKey = "night-neon";
  }

  let platformKey: SmartFormContextSignals["platformKey"] = "naver";
  if (hasAny(["단행본", "인쇄", "cmyk", "출판", "b5", "pdf"])) platformKey = "print";
  else if (hasAny(["4컷", "컷툰", "인스타", "sns", "정사각"])) platformKey = "cuttoon";
  else if (hasAny(["카카오", "카카페", "kakao"])) platformKey = "kakao";
  else if (hasAny(["고해상도", "1080", "마스터", "공모전"])) platformKey = "highres";
  else hasAny(["네이버", "naver", "웹툰"]);

  const epMatch = text.match(/(\d{1,3})\s*화|ep\.?\s*(\d{1,3})|제\s*(\d{1,3})\s*장/iu);
  const episodeNumber = epMatch ? Number(epMatch[1] ?? epMatch[2] ?? epMatch[3]) : null;

  let divisionRole = "콘티·작화 협업 담당";
  if (hasAny(["채색", "명암", "보정", "밑색", "조명"])) divisionRole = "채색·명암·보정 담당";
  else if (hasAny(["배경", "3d", "스케치업", "블렌더"])) divisionRole = "3D 배경·공간 연출 담당";
  else if (hasAny(["선화", "펜터치", "잉킹"])) divisionRole = "선화·펜터치 담당";
  else if (hasAny(["식자", "번역", "현지화", "효과음", "말풍선"])) divisionRole = "식자·효과음·현지화 담당";
  else if (hasAny(["글", "대본", "콘티", "스토리"])) divisionRole = "스토리·콘티 담당";

  let inquiryCategory = "일반 사용 안내";
  if (hasAny(["브러시", "필압", "지연", "렉", "느려", "태블릿", "펜"])) inquiryCategory = "드로잉·브러시 성능";
  else if (hasAny(["저장", "동기화", "유실", "복구", "오프라인"])) inquiryCategory = "저장·자동 백업";
  else if (hasAny(["내보내기", "출고", "폰트", "pdf", "규격", "다운로드"])) inquiryCategory = "내보내기·출고 규격";
  else if (hasAny(["초대", "권한", "팀원", "공유", "계정", "로그인"])) inquiryCategory = "협업·권한·계정";
  else if (hasAny(["결제", "구독", "환불", "과금"])) inquiryCategory = "요금·결제 안내";

  return {
    genre,
    subGenre,
    platformKey,
    episodeNumber: Number.isFinite(episodeNumber) ? episodeNumber : null,
    moodKey,
    divisionRole,
    inquiryCategory,
    matchedKeywords: matched.slice(0, 6),
  };
}

function platformSpecFromKey(key: SmartFormContextSignals["platformKey"]): string {
  if (key === "kakao") return PLATFORM_SPEC_OPTIONS[1];
  if (key === "highres") return PLATFORM_SPEC_OPTIONS[2];
  if (key === "cuttoon") return PLATFORM_SPEC_OPTIONS[3];
  if (key === "print") return PLATFORM_SPEC_OPTIONS[4];
  return PLATFORM_SPEC_OPTIONS[0];
}

function oklchPaletteForMood(mood: SmartFormContextSignals["moodKey"]): string {
  switch (mood) {
    case "night-neon":
      return "배경 oklch(0.22 0.05 262) 야간 인디고 · 키 oklch(0.74 0.16 350) 로즈 글로우 · 포인트 oklch(0.84 0.14 78) 가로등 앰버";
    case "cyber-pulse":
      return "배경 oklch(0.18 0.04 250) 딥 슬레이트 · 키 oklch(0.76 0.15 205) 시안 펄스 · 포인트 oklch(0.68 0.21 28) 시그널 코랄";
    case "action-crimson":
      return "배경 oklch(0.2 0.02 48) 차콜 잉크 · 키 oklch(0.66 0.2 32) 크림슨 스파크 · 포인트 oklch(0.86 0.15 86) 골드 림라이트";
    case "cozy-daily":
      return "배경 oklch(0.95 0.02 88) 웜 페이퍼 · 키 oklch(0.74 0.12 52) 살구 피치 · 포인트 oklch(0.62 0.13 158) 세이지 민트";
    case "mystery-fog":
      return "배경 oklch(0.21 0.03 236) 안개 네이비 · 키 oklch(0.72 0.08 212) 문라이트 스틸 · 포인트 oklch(0.72 0.18 42) 앰버 단서";
    default:
      return "배경 oklch(0.93 0.02 82) 노을 아이보리 · 키 oklch(0.72 0.16 42) 감귤 악센트 · 포인트 oklch(0.64 0.11 232) 스카이 블루";
  }
}

function buildFiveTags(text: string, signals: SmartFormContextSignals): readonly string[] {
  const pool: string[] = [];
  const push = (raw: string) => {
    const clean = raw.replace(/^#+/u, "").replace(/\s+/gu, "");
    if (!clean) return;
    const tag = `#${clean}`;
    if (!pool.includes(tag)) pool.push(tag);
  };

  const genreSeeds: Readonly<Record<string, readonly [string, string]>> = {
    "로맨스 판타지": ["로판", "감성판타지"],
    "SF·사이버펑크": ["사이버펑크", "SF웹툰"],
    "액션·판타지": ["액션판타지", "전투연출"],
    "일상·코미디": ["일상툰", "공감코미디"],
    "미스터리·스릴러": ["미스터리", "추리스릴러"],
    "학원·청춘": ["학원물", "청춘로맨스"],
    "힐링·드라마": ["감성드라마", "힐링웹툰"],
  };
  for (const seed of genreSeeds[signals.genre] ?? ["감성드라마", "오리지널"]) push(seed);

  if (signals.subGenre) push(signals.subGenre);
  if (text.includes("서울")) push("서울배경");
  if (text.includes("야경") || text.includes("밤") || text.includes("옥상")) push("야경무드");
  if (text.includes("고양이")) push("반려동물");
  if (signals.episodeNumber !== null) push(`${signals.episodeNumber}화`);
  if (signals.platformKey === "cuttoon") push("4컷툰");
  else if (signals.platformKey === "print") push("단행본");
  else push("세로스크롤");

  for (const fallback of ["신작추천", "오리지널웹툰", "몰입연출", "툰스튜디오", "첫화공개"]) {
    if (pool.length >= 5) break;
    push(fallback);
  }
  return pool.slice(0, 5);
}

function makeRec(
  fieldId: string,
  value: string,
  confidence: number,
  reasonKo: string,
  tagsPreview?: readonly string[],
): SmartFieldRecommendation {
  return {
    fieldId,
    value,
    confidence: Math.min(0.98, Math.max(0.65, Number(confidence.toFixed(2)))),
    reasonKo,
    source: "ai-local",
    ...(tagsPreview ? { tagsPreview } : {}),
  };
}

function buildWorkflowRecommendations(
  workflowId: SmartFormWorkflowId,
  requiredValues: Readonly<Record<string, string>>,
  signals: SmartFormContextSignals,
): Readonly<Record<string, SmartFieldRecommendation>> {
  const primaryText = Object.values(requiredValues)
    .map((val) => val.trim())
    .filter(Boolean)
    .join(" · ");
  const cueLabel =
    signals.matchedKeywords.length > 0
      ? `‘${signals.matchedKeywords.slice(0, 3).join(" · ")}’`
      : `‘${primaryText.slice(0, 18)}’`;
  const epLabel = signals.episodeNumber !== null ? `${signals.episodeNumber}화` : "1화";
  const epCode = `ep${String(signals.episodeNumber ?? 1).padStart(2, "0")}`;
  const tags = buildFiveTags(primaryText, signals);
  const spec = platformSpecFromKey(signals.platformKey);

  const ageRating =
    signals.genre === "미스터리·스릴러" || signals.genre === "SF·사이버펑크"
      ? "15세 이용가"
      : signals.genre === "액션·판타지" || signals.genre === "로맨스 판타지"
        ? "12세 이용가"
        : "전체 이용가";

  const divisionPreset =
    signals.platformKey === "cuttoon"
      ? DIVISION_PRESET_OPTIONS[0]
      : signals.genre === "액션·판타지" || signals.genre === "SF·사이버펑크"
        ? DIVISION_PRESET_OPTIONS[3]
        : signals.genre === "로맨스 판타지"
          ? DIVISION_PRESET_OPTIONS[2]
          : DIVISION_PRESET_OPTIONS[1];

  const scrollMargin =
    signals.platformKey === "cuttoon"
      ? "카드 간 여백 48px (4컷 스와이프 기준)"
      : signals.genre === "액션·판타지" || signals.genre === "SF·사이버펑크"
        ? "180px 기본 · 타격 컷 직전 340px 낙하 여백"
        : signals.genre === "미스터리·스릴러"
          ? "320px 서스펜스 호흡 · 반전 컷 직전 440px"
          : "260px 감성 스크롤 호흡 · 대사 컷 균형 간격";

  if (workflowId === "project-create") {
    const genreDisplay = signals.subGenre ? `${signals.genre} (${signals.subGenre} 결합)` : signals.genre;
    return {
      genre: makeRec("genre", signals.genre, 0.93, `${cueLabel} 단서를 분석해 ‘${genreDisplay}’ 장르로 분류했어요.`),
      targetPlatformSpec: makeRec("targetPlatformSpec", spec, 0.91, `${cueLabel} 형식 단서에 맞춰 바로 출고 가능한 표준 규격을 선택했어요.`),
      ageRating: makeRec("ageRating", ageRating, 0.87, `‘${signals.genre}’ 장르의 표준 연출 수위에 맞춘 안전 등급이에요.`),
      tags: makeRec("tags", tags.join(", "), 0.92, `${cueLabel} 핵심어와 독자 검색어를 조합해 추천 태그 5개를 구성했어요.`, tags),
      synopsis: makeRec(
        "synopsis",
        `‘${primaryText}’에서 시작되는 ${genreDisplay} 이야기. 익숙한 일상이 흔들리는 순간, 주인공은 숨겨진 진실과 마주하며 ${epLabel}의 결정적 선택을 내립니다.`,
        0.86,
        "입력하신 한 줄 설명을 바탕으로 작품 홈에 바로 쓸 2줄 시놉시스 초안을 만들었어요.",
      ),
      rightsBomDefault: makeRec(
        "rightsBomDefault",
        "상업 무료 폰트(OFL) · 오리지널/CC0 배경 · AI 보조 사용 투명 기록 ON",
        0.95,
        "출고 직전 저작권 반려를 예방하는 ToonStudio 표준 Rights BOM 안전 기본값이에요.",
      ),
      divisionPreset: makeRec("divisionPreset", divisionPreset, 0.84, `‘${signals.genre}’ 작화 밀도와 플랫폼 형식에 맞는 협업 구성을 추천했어요.`),
      scrollMarginPx: makeRec("scrollMarginPx", scrollMargin, 0.88, "장르 템포에 맞춰 모바일 독자가 편하게 읽는 컷 여백 기준을 잡았어요."),
      colorPalette: makeRec("colorPalette", oklchPaletteForMood(signals.moodKey), 0.9, `${cueLabel} 시간대와 분위기 키워드로 OKLCH 기반 키·포인트 배색을 맞췄어요.`),
    };
  }

  if (workflowId === "episode-publish") {
    return {
      episodeSummary: makeRec("episodeSummary", `[${epLabel}] ${primaryText} — 예상치 못한 감정의 균열이 찾아오며 다음 전개의 결정적 실마리가 드러납니다.`, 0.9, `${cueLabel} 핵심 장면에서 스포일러를 줄이고 호기심을 살린 회차 소개글이에요.`),
      authorNote: makeRec("authorNote", `${epLabel} 읽어 주셔서 감사합니다! 이번 화에서 가장 기억에 남은 장면이 있다면 댓글로 들려주세요.`, 0.85, "독자 댓글 반응을 자연스럽게 이끄는 간결한 작가의 말 초안이에요."),
      ageRating: makeRec("ageRating", ageRating, 0.88, `장면 분위기와 장르(${signals.genre})에 맞춘 회차 등급이에요.`),
      publishSchedule: makeRec("publishSchedule", signals.moodKey === "cozy-daily" ? "수/토 12:00 KST (점심 가벼운 탐색 시간대)" : "화/금 22:00 KST (야간 웹툰 집중 유입 시간대)", 0.83, `‘${signals.genre}’ 독자층의 열람 피크 시간대를 기준으로 잡았어요.`),
      thumbnailHook: makeRec("thumbnailHook", `주인공 감정 표정 클로즈업(55%) + 중앙 70% 안전 크롭 · 카피: “${primaryText.slice(0, 18)}”`, 0.89, "1:1·16:9 목록 카드 양쪽에서 얼굴과 제목이 잘리지 않는 구도예요."),
      scrollMarginPx: makeRec("scrollMarginPx", `${scrollMargin} · 엔딩 컷 직전 400px 클리프행어 여백`, 0.87, "회차 마지막 컷의 여운과 다음 화 클릭률을 높이는 여백 권장값이에요."),
      hashtags: makeRec("hashtags", tags.join(" "), 0.91, "SNS와 연재 알림에 바로 붙일 수 있는 해시태그 5개예요.", tags),
      rightsBomDefault: makeRec("rightsBomDefault", `${epLabel} 사용 폰트·3D 배경·효과음 라이선스 BOM 첨부 완료 (상업 안전)`, 0.95, "발행 시 Rights BOM 증빙이 자동으로 연결되도록 안전 기본값을 채웠어요."),
    };
  }

  if (workflowId === "export-release") {
    const isPrint = signals.platformKey === "print";
    return {
      targetPlatformSpec: makeRec("targetPlatformSpec", spec, 0.94, `${cueLabel} 출고 대상에 맞는 플랫폼 표준 규격이에요.`),
      fileFormat: makeRec("fileFormat", isPrint ? "PDF/X-1a (무손실 300DPI) + 원본 레이어 백업" : "JPG 92% sRGB (원본 PNG 마스터 별도 보존)", 0.92, isPrint ? "인쇄소 납품 기준 무손실 포맷을 선택했어요." : "웹 연재 용량 제한과 선명도를 동시에 지키는 품질이에요."),
      sliceHeightPx: makeRec("sliceHeightPx", isPrint ? "분할 없음 (단면/펼침 페이지 단위 + 3mm 도련)" : signals.platformKey === "cuttoon" ? "1080px 정사각 컷 단위 자동 분할" : "1280px 세로 자동 분할 (말풍선·텍스트 박스 경계 회피)", 0.91, "출고 시 대사나 인물 얼굴이 컷 경계에서 잘리지 않도록 맞췄어요."),
      colorProfile: makeRec("colorProfile", isPrint ? "CMYK Japan Color 2001 Coated (ICC 내장)" : "sRGB IEC61966-2.1 (모바일 표준 색 공간)", 0.93, isPrint ? "인쇄 색 편차를 줄이는 CMYK 프로파일이에요." : "모바일 기기 간 색감 왜곡을 최소화하는 표준이에요."),
      rightsBomDefault: makeRec("rightsBomDefault", "출고 전 Rights BOM 자동 검증 필수 (미확인 에셋 발견 시 경고 차단)", 0.96, "상업 연재 출고 전 라이선스 누락을 자동으로 걸러냅니다."),
      filenameTemplate: makeRec("filenameTemplate", isPrint ? `${epCode}_print_cmyk_b5_{page:03d}.pdf` : `${epCode}_${signals.platformKey}_{slice:02d}.jpg`, 0.89, `${epLabel} 기준으로 정렬 오류가 없는 파일명 패턴을 생성했어요.`),
      preflightChecklist: makeRec("preflightChecklist", isPrint ? "3mm 도련 · 재단선 · 먹(K100) 텍스트 · 300DPI 이미지 확인" : "말풍선 16px 이상 · 가로 폭 규격 일치 · 파일당 20MB 이하 · Rights BOM 통과", 0.9, "출고 반려 빈도가 높은 핵심 항목만 자동 점검 목록에 넣었어요."),
    };
  }

  if (workflowId === "team-division-invite") {
    const invitee = requiredValues.inviteTarget?.trim() || "협업 작가님";
    const taskLine = requiredValues.teamNeed?.trim() || primaryText;
    return {
      divisionRole: makeRec("divisionRole", signals.divisionRole, 0.93, `‘${taskLine}’ 업무 설명을 분석해 6인 분업 보드의 ‘${signals.divisionRole}’ 역할을 연결했어요.`),
      divisionPreset: makeRec("divisionPreset", divisionPreset, 0.85, "현재 분업 범위에 맞는 팀 운영 템플릿이에요."),
      permissionScope: makeRec("permissionScope", `${signals.divisionRole} 전용 컷 슬라이스 편집 · 타 공정 원본 레이어 보호 잠금`, 0.91, "작업 충돌을 막고 담당 레이어만 안전하게 편집하도록 권한을 설정했어요."),
      handoffRule: makeRec("handoffRule", `${epLabel} 담당 폴더 업로드 → 체크리스트 완료 시 다음 공정 담당자에게 자동 알림`, 0.88, "분업 인수인계 누락을 줄이는 표준 전달 규칙이에요."),
      deadlineHint: makeRec("deadlineHint", "회차 마감 48시간 전 1차 공유 · 24시간 전 수정 반영 및 최종 확정", 0.84, "연재 마감 직전 병목을 피하는 권장 일정이에요."),
      rightsBomDefault: makeRec("rightsBomDefault", `${invitee}님 기여 공정(${signals.divisionRole}) 크레딧 및 사용 에셋 출처 자동 기록`, 0.94, "협업자 크레딧과 Rights BOM 이력을 누락 없이 남겨요."),
      welcomeMessage: makeRec("welcomeMessage", `안녕하세요 ${invitee}님! ‘${taskLine}’ 공정(${signals.divisionRole}) 협업을 위해 ToonStudio 작업 보드에 초대드립니다. 링크를 열면 담당 컷과 참고 가이드를 바로 확인하실 수 있어요.`, 0.9, "초대할 팀원과 작업 내용을 반영해 바로 보낼 수 있는 인사말을 작성했어요."),
    };
  }

  const highUrgency =
    signals.inquiryCategory === "저장·자동 백업" || signals.inquiryCategory === "드로잉·브러시 성능";
  const surface = SUPPORT_SURFACE_MAP[signals.inquiryCategory] ?? "ToonStudio 작업실";
  return {
    inquiryCategory: makeRec("inquiryCategory", signals.inquiryCategory, 0.92, `${cueLabel} 증상 키워드로 가장 적합한 지원 분류를 지정했어요.`),
    urgencyLevel: makeRec("urgencyLevel", highUrgency ? "높음 (작업 흐름·저장 영향 우선 확인)" : "보통 (영업일 기준 순차 답변)", 0.86, highUrgency ? "작업 중단이나 저장 영향이 감지되어 우선순위를 높였어요." : "일반 문의 기준 우선순위예요."),
    affectedSurface: makeRec("affectedSurface", surface, 0.88, "문의 분류에 해당하는 작업 화면 경로를 자동으로 연결했어요."),
    environmentSummary: makeRec("environmentSummary", "웹 스튜디오(로컬 우선 SQLite/OPFS) · 개인정보·토큰 자동 비공개 처리됨", 0.94, "진단에 필요한 최소 실행 환경 정보만 안전하게 요약했어요."),
    reproHint: makeRec("reproHint", `1) ${surface} 진입\n2) “${primaryText}” 관련 동작 실행\n3) 증상 재발 여부 확인`, 0.84, "지원팀이 빠르게 원인을 재현할 수 있도록 3단계 순서를 정리했어요."),
    expectedOutcome: makeRec("expectedOutcome", "오류나 지연 없이 의도한 작업 결과가 즉시 반영되고 안전하게 저장됨", 0.83, "정상 동작 기준을 명확히 적어 답변 왕복을 줄여 드려요."),
    selfCheckTip: makeRec("selfCheckTip", SUPPORT_TIP_MAP[signals.inquiryCategory] ?? SUPPORT_TIP_MAP["일반 사용 안내"], 0.89, "문의를 보내기 전에 1분 안에 바로 확인해 볼 수 있는 점검 팁이에요."),
  };
}

export function generateSmartFormRecommendations(params: {
  readonly workflowId: SmartFormWorkflowId;
  readonly requiredValues: Readonly<Record<string, string>>;
}): SmartFormAutofillResult {
  const schema = SMART_FORM_WORKFLOW_SCHEMAS[params.workflowId];
  assertMinimalRequiredContract(schema);

  const combinedRaw = schema.requiredFields
    .map((field) => params.requiredValues[field.id]?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  const masked = maskCreatorInputBeforeAiSend(combinedRaw);
  const signals = detectSignals(masked.sanitizedText);

  if (masked.sanitizedText.trim().length < 2) {
    return {
      workflowId: params.workflowId,
      hasEnoughContext: false,
      engineMode: "local-deterministic",
      providerLabelKo: "로컬 즉시 추론 (₩0)",
      costKrw: 0,
      costUsdGuaranteed: "$0.00",
      paidBillingBlocked: true,
      piiRedactedCount: masked.redactedCount,
      filledCount: 0,
      summaryKo: "필수 칸에 두 글자 이상 입력하시면 AI가 나머지 선택 항목을 한 번에 채워드려요.",
      noticeKo: "필수 입력값이 비어 있어 아직 권장값을 생성하지 않았어요.",
      signals,
      recommendations: {},
    };
  }

  const recommendations = buildWorkflowRecommendations(
    params.workflowId,
    params.requiredValues,
    signals,
  );
  const filledCount = Object.keys(recommendations).length;

  return {
    workflowId: params.workflowId,
    hasEnoughContext: true,
    engineMode: "local-deterministic",
    providerLabelKo: "로컬 즉시 추론 (₩0)",
    costKrw: 0,
    costUsdGuaranteed: "$0.00",
    paidBillingBlocked: true,
    piiRedactedCount: masked.redactedCount,
    filledCount,
    summaryKo: `입력한 핵심 내용으로 선택 항목 ${filledCount}개를 즉시 추천 채움했어요. 항목마다 바로 수정하거나 되돌릴 수 있어요.`,
    noticeKo:
      masked.redactedCount > 0
        ? `민감 정보 ${masked.redactedCount}건은 분석 전 안전하게 가림 처리했어요.`
        : null,
    signals,
    recommendations,
  };
}

export async function enhanceRecommendationsWithZeroBillAi(params: {
  readonly workflowId: SmartFormWorkflowId;
  readonly requiredValues: Readonly<Record<string, string>>;
  readonly assistRunner?: ZeroBillAssistRunner;
  readonly signal?: AbortSignal;
}): Promise<SmartFormAutofillResult> {
  const baseline = generateSmartFormRecommendations({
    workflowId: params.workflowId,
    requiredValues: params.requiredValues,
  });
  if (!baseline.hasEnoughContext) return baseline;

  const schema = SMART_FORM_WORKFLOW_SCHEMAS[params.workflowId];
  const combinedRaw = schema.requiredFields
    .map((field) => params.requiredValues[field.id]?.trim() ?? "")
    .filter(Boolean)
    .join(" · ");
  const masked = maskCreatorInputBeforeAiSend(combinedRaw);
  const runner = params.assistRunner ?? runFreeAiZeroBillAssist;

  try {
    const response = await runner(
      {
        mode: schema.cascadeMode,
        inputText: masked.sanitizedText,
        projectTitle: masked.sanitizedText.slice(0, 60),
        genreOrTone: baseline.signals.genre,
        targetPlatform:
          baseline.signals.platformKey === "cuttoon"
            ? "cuttoon"
            : baseline.signals.platformKey === "print"
              ? "page-comic"
              : "vertical-webtoon",
      },
      { signal: params.signal },
    );

    const targetFieldId = CASCADE_ENRICH_TARGET_FIELD[params.workflowId];
    const existingTarget = baseline.recommendations[targetFieldId];
    const leadBullet = response.bulletsKo.find((line) => line.trim().length > 0);
    const enrichedRecommendations: Record<string, SmartFieldRecommendation> = {
      ...baseline.recommendations,
    };

    if (existingTarget && leadBullet) {
      enrichedRecommendations[targetFieldId] = {
        ...existingTarget,
        value: `${existingTarget.value}\n· ${leadBullet}`,
        confidence: Math.min(0.98, Number((existingTarget.confidence + 0.04).toFixed(2))),
        reasonKo:
          response.providerTier === "cloud-free"
            ? "₩0 무료 AI 캐스케이드 심화 제안으로 문장을 보강했어요."
            : "로컬 무과금 코치(₩0) 심화 제안을 안전하게 반영했어요.",
        source: "ai-zero-bill-cascade",
      };
    }

    return {
      ...baseline,
      engineMode: "zero-bill-cascade",
      providerLabelKo:
        response.providerTier === "cloud-free"
          ? `₩0 무료 AI 캐스케이드 (${response.providerId})`
          : "로컬 무과금 코치 폴백 (₩0)",
      costKrw: 0,
      costUsdGuaranteed: "$0.00",
      paidBillingBlocked: true,
      piiRedactedCount: baseline.piiRedactedCount + response.piiRedactedCount,
      summaryKo: `₩0 무료 AI 브리지로 선택 항목 ${Object.keys(enrichedRecommendations).length}개를 보강했어요.`,
      noticeKo: response.fallbackNoticeKo ?? baseline.noticeKo,
      recommendations: enrichedRecommendations,
    };
  } catch {
    return {
      ...baseline,
      noticeKo: "무료 클라우드 AI에 연결되지 않아 유료 전환 없이 로컬 추론(₩0) 결과를 유지했어요.",
    };
  }
}

export function createInitialSmartFormState(
  workflowId: SmartFormWorkflowId = "project-create",
): SmartFormState {
  const schema = SMART_FORM_WORKFLOW_SCHEMAS[workflowId];
  const requiredValues: Record<string, string> = {};
  const optionalValues: Record<string, string> = {};
  const fieldOrigins: Record<string, SmartFormFieldOrigin> = {};

  for (const field of schema.requiredFields) requiredValues[field.id] = "";
  for (const field of schema.optionalFields) {
    optionalValues[field.id] = "";
    fieldOrigins[field.id] = "empty";
  }

  return {
    workflowId,
    requiredValues,
    optionalValues,
    fieldOrigins,
    recommendations: {},
    undoStack: [],
    lastNoticeKo: null,
    lastEngineMode: null,
    lastCostKrw: 0,
  };
}

export function updateRequiredFieldValue(
  state: SmartFormState,
  fieldId: string,
  value: string,
): SmartFormState {
  return { ...state, requiredValues: { ...state.requiredValues, [fieldId]: value } };
}

export function updateOptionalFieldValue(
  state: SmartFormState,
  fieldId: string,
  value: string,
): SmartFormState {
  return {
    ...state,
    optionalValues: { ...state.optionalValues, [fieldId]: value },
    fieldOrigins: {
      ...state.fieldOrigins,
      [fieldId]: value.trim().length > 0 ? "user-edited" : "empty",
    },
  };
}

export function applySmartFormRecommendations(
  state: SmartFormState,
  result: SmartFormAutofillResult,
  options: { readonly respectUserEdits?: boolean; readonly nowIso?: string } = {},
): SmartFormState {
  if (!result.hasEnoughContext || Object.keys(result.recommendations).length === 0) {
    return {
      ...state,
      lastNoticeKo: result.noticeKo ?? result.summaryKo,
      lastEngineMode: result.engineMode,
    };
  }

  const respectUserEdits = options.respectUserEdits ?? true;
  const snapshot: SmartFormUndoSnapshot = {
    id: `undo-${state.undoStack.length + 1}`,
    createdAtIso: options.nowIso ?? new Date().toISOString(),
    labelKo: `${SMART_FORM_WORKFLOW_SCHEMAS[state.workflowId].tabLabelKo} 자동 채움 이전 상태`,
    optionalValues: { ...state.optionalValues },
    fieldOrigins: { ...state.fieldOrigins },
  };

  const nextOptionalValues: Record<string, string> = { ...state.optionalValues };
  const nextOrigins: Record<string, SmartFormFieldOrigin> = { ...state.fieldOrigins };
  let appliedCount = 0;
  let preservedManualCount = 0;

  for (const [fieldId, rec] of Object.entries(result.recommendations)) {
    if (respectUserEdits && state.fieldOrigins[fieldId] === "user-edited") {
      preservedManualCount += 1;
      continue;
    }
    nextOptionalValues[fieldId] = rec.value;
    nextOrigins[fieldId] = "ai-suggested";
    appliedCount += 1;
  }

  const noticeSuffix =
    preservedManualCount > 0
      ? ` (직접 수정한 ${preservedManualCount}개 항목은 그대로 유지했어요.)`
      : "";

  return {
    ...state,
    optionalValues: nextOptionalValues,
    fieldOrigins: nextOrigins,
    recommendations: { ...state.recommendations, ...result.recommendations },
    undoStack: [...state.undoStack.slice(-(MAX_UNDO_HISTORY - 1)), snapshot],
    lastNoticeKo: `AI 권장값 ${appliedCount}개를 채웠어요.${noticeSuffix}`,
    lastEngineMode: result.engineMode,
    lastCostKrw: 0,
  };
}

export function undoSmartFormAutofill(state: SmartFormState): SmartFormState {
  if (state.undoStack.length === 0) {
    return { ...state, lastNoticeKo: "되돌릴 이전 자동 채우기 기록이 없어요." };
  }
  const previous = state.undoStack[state.undoStack.length - 1];
  return {
    ...state,
    optionalValues: { ...previous.optionalValues },
    fieldOrigins: { ...previous.fieldOrigins },
    undoStack: state.undoStack.slice(0, -1),
    lastNoticeKo: "자동 채우기 이전 상태로 되돌렸어요.",
  };
}

export function restoreSingleFieldAiSuggestion(
  state: SmartFormState,
  fieldId: string,
): SmartFormState {
  const recommendation = state.recommendations[fieldId];
  if (!recommendation) return state;
  return {
    ...state,
    optionalValues: { ...state.optionalValues, [fieldId]: recommendation.value },
    fieldOrigins: { ...state.fieldOrigins, [fieldId]: "ai-suggested" },
    lastNoticeKo: "선택한 항목에 AI 권장 제안을 다시 적용했어요.",
  };
}

export function validateMinimalFormSubmission(state: SmartFormState): SmartFormValidationResult {
  const schema = SMART_FORM_WORKFLOW_SCHEMAS[state.workflowId];
  const missingFieldIds = schema.requiredFields
    .filter((field) => (state.requiredValues[field.id]?.trim().length ?? 0) === 0)
    .map((field) => field.id);

  if (missingFieldIds.length > 0) {
    const missingLabels = schema.requiredFields
      .filter((field) => missingFieldIds.includes(field.id))
      .map((field) => field.labelKo)
      .join(", ");
    return {
      valid: false,
      missingFieldIds,
      messageKo: `필수 항목(${missingLabels})만 입력하시면 바로 진행할 수 있어요.`,
    };
  }

  return {
    valid: true,
    missingFieldIds: [],
    messageKo: `필수 ${schema.requiredFields.length}개 입력 완료! 선택 항목은 언제든 나중에 바꿔도 괜찮아요.`,
  };
}

export function countAiFilledOptionalFields(state: SmartFormState): number {
  return Object.values(state.fieldOrigins).filter((origin) => origin === "ai-suggested").length;
}
