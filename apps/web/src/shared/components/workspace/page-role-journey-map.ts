import { canonicalSitePath } from "@/shared/lib/site-route-authority";
import {
  CREATOR_JOURNEY_STAGES,
  accentToneBadgeClasses,
  accentToneChipClasses,
  type CreatorJourneyStage,
  type JourneyStageNumber,
  type PageJourneyAccentTone,
} from "./page-role-journey-shell-lite";

export {
  CREATOR_JOURNEY_STAGES,
  accentToneBadgeClasses,
  accentToneChipClasses,
  type CreatorJourneyStage,
  type JourneyStageNumber,
  type PageJourneyAccentTone,
};

export interface JourneyNextStep {
  readonly href: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly reasonKo: string;
  readonly reasonEn: string;
  readonly accentTone: PageJourneyAccentTone;
}

export interface PageRoleJourneyEntry {
  readonly pathPattern: string;
  readonly exact?: boolean;
  readonly stageNumber: JourneyStageNumber;
  readonly stageBadgeKo: string;
  readonly stageBadgeEn: string;
  readonly pageLabelKo: string;
  readonly pageLabelEn: string;
  readonly roleHeadlineKo: string;
  readonly roleHeadlineEn: string;
  readonly clearDistinctionKo: string;
  readonly clearDistinctionEn: string;
  readonly accentTone: PageJourneyAccentTone;
  readonly recommendedNextSteps: readonly JourneyNextStep[];
}

const nextStep = (
  href: string,
  labelKo: string,
  labelEn: string,
  reasonKo: string,
  reasonEn: string,
  accentTone: PageJourneyAccentTone,
): JourneyNextStep => ({ href, labelKo, labelEn, reasonKo, reasonEn, accentTone });

/** 신규 핵심 5+1 표면으로 1클릭 도달하는 공통 바로가기 (통합 소재 검색 최상단 전진 배치). */
export const CORE_SURFACE_QUICK_LINKS: readonly JourneyNextStep[] = Object.freeze([
  nextStep("/research/materials", "통합 소재 검색", "Unified Asset Search", "3D 배경·브러시·텍스처·포즈·효과음을 라이선스 검증과 함께 1클릭 탐색", "Search verified 3D scenes, brushes, textures, poses and SFX in one click", "market"),
  nextStep("/studio/bg3d", "스튜디오 3D·AI", "Studio 3D & AI", "3D 배경·캐릭터·AI 구도를 한 캔버스에서 합성", "Compose 3D scenes, characters and AI guides", "three-d"),
  nextStep("/production", "분업 OS", "Production OS", "팀원 공정 배정·검수·정산을 한눈에 관제", "Coordinate episode stages, reviews and payouts", "collab"),
  nextStep("/market", "에셋 마켓", "Asset Market", "상업용 3D 배경·브러시·소재 호환성 확인 후 적용", "Browse licensed 3D scenes, brushes and materials", "market"),
  nextStep("/studio/support", "AI 고객센터 1:1 채팅", "AI Support 1:1 Chat", "오류 해결·원고 복구·기능 안내를 실시간 AI 상담", "Get instant 1:1 AI troubleshooting and recovery help", "support"),
  nextStep("/creator-support", "창작자 지원 프로그램", "Creator Support", "신인·학생 창작자 멘토링·제작 지원 신청", "Apply for new & student creator support programs", "support"),
]);

const STAGE_BY_NUMBER: Readonly<Record<JourneyStageNumber, CreatorJourneyStage>> = {
  1: CREATOR_JOURNEY_STAGES[0]!,
  2: CREATOR_JOURNEY_STAGES[1]!,
  3: CREATOR_JOURNEY_STAGES[2]!,
  4: CREATOR_JOURNEY_STAGES[3]!,
  5: CREATOR_JOURNEY_STAGES[4]!,
};

/** 7대 목적 그룹 ID를 5단계 창작 여정 단계에 일관되게 매핑한다. */
const GROUP_TO_STAGE_NUMBER: Readonly<Record<string, JourneyStageNumber>> = {
  personal: 1,
  create: 2,
  publish: 2,
  connect: 3,
  discover: 4,
  grow: 4,
  rest: 4,
};

const pageRole = (
  pathPattern: string,
  stageNumber: JourneyStageNumber,
  accentTone: PageJourneyAccentTone,
  labels: readonly [ko: string, en: string],
  headlines: readonly [ko: string, en: string],
  distinctions: readonly [ko: string, en: string],
  recommendedNextSteps: readonly JourneyNextStep[],
  exact?: boolean,
): PageRoleJourneyEntry => {
  const stage = STAGE_BY_NUMBER[stageNumber];
  return {
    pathPattern,
    ...(exact ? { exact: true } : null),
    stageNumber,
    stageBadgeKo: stage.badgeKo,
    stageBadgeEn: stage.badgeEn,
    pageLabelKo: labels[0],
    pageLabelEn: labels[1],
    roleHeadlineKo: headlines[0],
    roleHeadlineEn: headlines[1],
    clearDistinctionKo: distinctions[0],
    clearDistinctionEn: distinctions[1],
    accentTone,
    recommendedNextSteps,
  };
};

/**
 * ToonStudio 핵심 페이지별 역할·순서·다음 추천 동선 단일 지도.
 * 초보자도 1초 만에 "이 페이지가 무엇을 하는 곳인지"와 "다음 어디로 갈지"를 이해하게 설계했다.
 */
export const PAGE_ROLE_JOURNEY_ENTRIES: readonly PageRoleJourneyEntry[] = Object.freeze([
  // ── ① 시작·홈 ──
  pageRole("/", 1, "creation", ["사이트 홈", "Site home"],
    ["작품 둘러보기와 스튜디오 시작점을 한눈에 고르는 첫 화면", "Start here to explore works or jump straight into creating"],
    ["개인 작업실(/home)이 아니라 공개 첫 화면입니다", "Public front door, separate from your private workspace home"],
    [
      nextStep("/create", "새 작품 시작", "Start a work", "빈 캔버스·템플릿 중 시작 방식 고르기", "Pick blank canvas or template", "creation"),
      nextStep("/studio", "스튜디오 열기", "Open studio", "원고 직접 그리기·3D·AI 작업", "Draw episodes with 3D & AI", "three-d"),
      nextStep("/discover", "작품 둘러보기", "Explore stories", "인기 작품과 레퍼런스 탐색", "Discover popular works", "market"),
    ], true),
  pageRole("/home", 1, "creation", ["작업 홈", "Workspace home"],
    ["진행 중인 원고와 팀 할 일을 이어서 여는 개인 작업 대시보드", "Resume recent manuscripts and team tasks from one personal hub"],
    ["직접 그리는 편집기(/studio) 진입 전 오늘 할 일을 고르는 허브입니다", "Daily launchpad before opening the full drawing canvas"],
    [
      nextStep("/studio", "원고 바로 그리기", "Draw in studio", "최근 프로젝트 캔버스 이어서 열기", "Continue on the canvas", "creation"),
      nextStep("/production", "팀 분업 관제", "Production OS", "회차별 공정·검수·마감 확인", "Check episode stages & reviews", "collab"),
      nextStep("/studio/support", "AI 1:1 상담", "AI 1:1 support", "막힌 기능·복구 바로 물어보기", "Ask AI support chat right away", "support"),
    ]),
  pageRole("/create", 1, "creation", ["작품 시작하기", "Start a work"],
    ["새 원고·템플릿·파일 가져오기 중 가장 빠른 출발 방식을 고르는 화면", "Choose between a blank canvas, template, or file import"],
    ["복잡한 설정 없이 1클릭으로 첫 캔버스를 여는 시작 관문입니다", "One-click starting sheet before detailed canvas setup"],
    [
      nextStep("/studio/new", "새 원고 만들기", "New project", "웹툰·일러스트 규격 바로 생성", "Create webtoon or illustration", "creation"),
      nextStep("/studio/templates", "시작 템플릿", "Templates", "장르별 컷 분할 프리셋으로 1분 시작", "Start in 1 min with layout presets", "three-d"),
      nextStep("/studio/import", "PSD·파일 가져오기", "Import PSD/files", "기존 포토샵·이미지 원본 보존 불러오기", "Import PSD or image layers intact", "market"),
    ], true),
  pageRole("/studio/new", 1, "creation", ["새 프로젝트", "New project"],
    ["웹툰·일러스트·콘티 규격을 정하고 바로 캔버스를 여는 생성 화면", "Pick canvas format and launch your manuscript immediately"],
    ["프로젝트 생성 전용 화면이며, 생성 후 스튜디오(/studio)로 이어집니다", "Focused creation form that hands off directly to the canvas"],
    [
      nextStep("/studio", "내 작업 목록", "My works", "만든 프로젝트 열기·관리", "Open and manage projects", "creation"),
      nextStep("/studio/bg3d", "3D 배경 먼저 잡기", "3D background", "컷에 넣을 3D 공간 구도 세팅", "Frame a 3D scene first", "three-d"),
      nextStep("/market", "브러시·소재 추가", "Find assets", "시작 전 필요한 펜·3D 소재 받기", "Get brushes and 3D assets", "market"),
    ]),
  pageRole("/studio/templates", 1, "creation", ["시작 템플릿", "Templates"],
    ["장르별 컷 분할·세로 스크롤 규격 프리셋으로 빠르게 시작하는 화면", "Start fast with genre-ready panel layouts and scroll specs"],
    ["빈 화면 대신 검증된 컷 구성을 골라 즉시 편집을 시작합니다", "Pre-built panel structures instead of starting from scratch"],
    [
      nextStep("/studio/comic", "웹툰 컷 편집", "Webtoon canvas", "선택한 템플릿에 펜선·말풍선 채우기", "Ink and letter panels", "creation"),
      nextStep("/studio/new", "직접 규격 만들기", "Custom spec", "원하는 해상도·비율 직접 입력", "Configure custom size", "three-d"),
      nextStep("/market", "소재 더 찾기", "Asset market", "배경·효과 소재 보강", "Add backgrounds and effects", "market"),
    ]),
  pageRole("/studio/import", 1, "creation", ["파일 가져오기", "Import files"],
    ["PSD·이미지·원고 파일을 원본 레이어 그대로 스튜디오로 옮기는 화면", "Bring PSD and image files into ToonStudio with layers preserved"],
    ["외부 앱 작업물을 손실 없이 가져오는 전용 입구입니다", "Lossless bridge for external PSD and image files"],
    [
      nextStep("/studio", "가져온 원고 열기", "Open imported work", "스튜디오 캔버스에서 이어 그리기", "Continue drawing in studio", "creation"),
      nextStep("/studio/assets", "작품 재료 정리", "Organize assets", "가져온 소재와 라이선스 확인", "Review imported materials", "three-d"),
      nextStep("/studio/support", "변환 오류 AI 상담", "Import help chat", "파일이 안 열릴 때 즉시 해결", "Fix import issues with AI chat", "support"),
    ]),
  pageRole("/now", 1, "creation", ["오늘의 영감", "Daily inspiration"],
    ["빈 화면 부담을 줄이는 짧은 창작 주제와 첫 아이디어를 받는 화면", "Beat blank-page block with a quick daily creative prompt"],
    ["기획 전 워밍업 공간이며, 바로 새 작품(/create)으로 넘길 수 있습니다", "Light warm-up prompt that launches straight into creation"],
    [
      nextStep("/create", "아이디어 바로 시작", "Start from prompt", "떠오른 주제로 첫 컷 열기", "Turn this prompt into a draft", "creation"),
      nextStep("/discover", "레퍼런스 작품 보기", "Browse works", "비슷한 분위기 작품 참고", "Check mood references", "market"),
      nextStep("/learn", "초보 3컷 따라하기", "First 3 panels", "5분 튜토리얼로 손 풀기", "Warm up with a 5-min guide", "market"),
    ]),

  // ── ② 작품 제작 (스튜디오·3D·AI·포토샵) ──
  pageRole("/studio", 2, "creation", ["스튜디오 · 내 작업", "Studio · My work"],
    ["원고를 직접 그리고 3D·AI·포토샵 레이어를 조합하는 메인 제작 허브", "Draw manuscripts directly and combine 3D, AI and layer tools"],
    ["원고 직접 제작(/studio) · 팀 공정 관제(/production)와 명확히 분리됩니다", "Direct artwork creation — distinct from team Production OS"],
    [
      nextStep("/studio/bg3d", "배경·3D 합성", "3D stage", "3D 배경과 캐릭터를 한 잉크·조명으로 합성", "Match 3D background & character", "three-d"),
      nextStep("/studio/publish", "검수·내보내기", "Review & export", "모바일 폭·권리 BOM 점검 후 출력", "Check mobile width & export", "creation"),
      nextStep("/production", "팀 분업 넘기기", "Team Production OS", "선화·채색·후보정 담당자 배정", "Assign stages to teammates", "collab"),
    ], true),
  pageRole("/studio/comic", 2, "creation", ["웹툰 만들기", "Webtoon studio"],
    ["세로 스크롤 컷 배치·펜선·채색·말풍선 대사를 한 화면에서 완성하는 편집기", "Draw panels, ink, color and place dialogue on one vertical canvas"],
    ["컷 연출·말풍선·대사 집중 작업 공간입니다", "Dedicated to panel flow, inking, coloring and lettering"],
    [
      nextStep("/studio/bg3d", "3D 배경 넣기", "Insert 3D scene", "투시 맞춘 3D 배경을 컷에 삽입", "Drop perspective-locked 3D backdrop", "three-d"),
      nextStep("/market", "브러시·효과 찾기", "Brushes & FX", "효과선·브러시 소재 바로 불러오기", "Grab brushes and speedlines", "market"),
      nextStep("/studio/publish", "연재 규격 검수", "Publish check", "플랫폼 규격·권리 확인 후 내보내기", "Verify specs & export episode", "creation"),
    ]),
  pageRole("/studio/bg3d", 2, "three-d", ["배경 · 3D 스테이지", "Background · 3D stage"],
    ["3D 배경과 3D 캐릭터를 한 조명·투시·잉크선으로 맞춰 컷에 바로 얹는 공간", "Stage 3D scenes and characters with unified lighting and ink lines"],
    ["2D 원고(/studio)에 꽂아 쓸 3D 배경·카메라·조명 전용 스테이지입니다", "Dedicated 3D camera, lighting and cel-ink backdrop stage"],
    [
      nextStep("/studio/assets/characters/new", "3D 캐릭터 포즈", "3D character", "장면에 세울 캐릭터 표정·포즈 만들기", "Pose characters for this scene", "three-d"),
      nextStep("/studio/comic", "원고 컷에 적용", "Apply to panels", "렌더링한 배경을 웹툰 컷에 배치", "Place rendered scene into comic", "creation"),
      nextStep("/market", "3D 배경 더 찾기", "3D market", "CC0·상업용 3D 건물·실내 모델 탐색", "Browse commercial-safe 3D sets", "market"),
    ]),
  pageRole("/studio/assets/characters", 2, "three-d", ["캐릭터 만들기", "Character shaper"],
    ["캐릭터 외형·표정·포즈와 3D 마네킹 레퍼런스를 제작·저장하는 작업대", "Design characters, expressions, poses and 3D figure references"],
    ["작품 전체에서 일관된 작화를 유지하는 캐릭터 시트·3D 포즈 전용 도구입니다", "Consistent character sheets and 3D pose rigs for every episode"],
    [
      nextStep("/studio/bg3d", "3D 배경과 합성", "Composite with 3D", "만든 캐릭터를 3D 배경에 세워 촬영", "Place character on 3D backdrop", "three-d"),
      nextStep("/studio/assets", "작품 재료에 보관", "Save to assets", "회차마다 꺼내 쓰도록 보관함 정리", "Keep in project materials", "three-d"),
      nextStep("/studio/comic", "웹툰 컷에 그리기", "Draw in webtoon", "캐릭터 레퍼런스로 본편 작화", "Draw episodes with reference", "creation"),
    ]),
  pageRole("/studio/assets", 2, "three-d", ["작품 재료", "Work materials"],
    ["내 작품에 연결된 브러시·캐릭터·3D·배경 소재와 사용 권리를 관리하는 보관함", "Manage brushes, characters, 3D sets and license rights for your work"],
    ["새 소재를 사는 마켓(/market)이 아니라 내가 이미 담은 소재 보관함입니다", "Your owned & linked project library — separate from /market store"],
    [
      nextStep("/market", "새 소재 더 찾기", "Browse market", "부족한 3D 배경·브러시 추가 확보", "Discover new 3D & brush assets", "market"),
      nextStep("/studio/bg3d", "3D 스테이지 열기", "Open 3D stage", "보관한 3D 소재로 장면 구도 잡기", "Stage your 3D materials", "three-d"),
      nextStep("/studio/publish", "권리 점검·내보내기", "Rights & export", "출고 전 Rights BOM 라이선스 확인", "Verify Rights BOM before export", "creation"),
    ]),
  pageRole("/studio/publish", 2, "creation", ["검수·내보내기", "Review & export"],
    ["모바일 가독성·권리 BOM·플랫폼 규격을 최종 점검하고 원고를 출력하는 화면", "Check mobile legibility, Rights BOM and platform specs before export"],
    ["그리기 완료 후 연재 직전 최종 품질·라이선스 관문입니다", "Final preflight quality and license gate before publishing"],
    [
      nextStep("/studio/growth", "썸네일·제목 실험", "Growth lab", "독자 클릭률 높은 썸네일·제목 비교", "Test thumbnails and titles", "creation"),
      nextStep("/production", "팀 완료 보고", "Production OS", "회차 상태 완료 처리·정산 확인", "Mark episode done & check payout", "collab"),
      nextStep("/showcase", "갤러리에 공개", "Publish showcase", "완성 작품과 제작 과정 공유", "Share work with creators", "collab"),
    ]),
  pageRole("/studio/growth", 2, "creation", ["성장 실험", "Growth lab"],
    ["썸네일·제목 후보와 독자 이탈 구간을 비교해 다음 화 반응을 높이는 화면", "Compare thumbnail/title variants and reader retention signals"],
    ["발행 후 성과를 확인해 다음 화 연출을 개선하는 분석 작업대입니다", "Post-publish experiments to sharpen your next episode"],
    [
      nextStep("/studio/publish", "개선본 다시 출력", "Re-export", "검증된 썸네일·원고로 갱신", "Export updated assets", "creation"),
      nextStep("/insights", "장르 트렌드 보기", "Genre trends", "독자 선호 장르 흐름 참고", "Read platform trend data", "market"),
      nextStep("/studio", "다음 화 그리기", "Next episode", "바로 다음 회차 작업 시작", "Open canvas for next episode", "creation"),
    ]),
  pageRole("/studio/present", 2, "creation", ["발표 준비", "Presentation"],
    ["기획서·피치 자료·작품 미리보기를 제안용으로 정리해 발표하는 화면", "Organize pitch decks and episode previews for editors or partners"],
    ["연재 제안·공모전·영상화 미팅용 발표 패키지를 구성하는 공간입니다", "Clean pitch packaging for editors, contests and deals"],
    [
      nextStep("/studio/share", "외부 링크 공유", "Share links", "권한·만료일 걸고 안전하게 전달", "Share with expiry & permissions", "collab"),
      nextStep("/opportunities", "공모전·지원사업", "Opportunities", "제출할 공모전·지원 일정 확인", "Find open contests & grants", "collab"),
      nextStep("/studio/publish", "최종본 출력", "Export package", "제출 규격 파일로 내보내기", "Export submission files", "creation"),
    ]),
  pageRole("/studio/jobs", 2, "three-d", ["처리 중 작업", "Processing jobs"],
    ["AI 보조·3D 렌더링·내보내기 백그라운드 작업 진행 상태를 확인하는 화면", "Monitor background AI assist, 3D renders and export jobs"],
    ["오래 걸리는 렌더링·변환 작업의 성공·실패를 추적하는 상태판입니다", "Live status queue for heavy render and export tasks"],
    [
      nextStep("/studio", "완료 결과 확인", "Open studio", "완성된 레이어·파일 원고에서 열기", "Inspect outputs in studio", "creation"),
      nextStep("/studio/assets", "생성 소재 보관함", "Asset library", "생성된 소재·패키지 관리", "Manage generated assets", "three-d"),
      nextStep("/studio/support", "실패 원인 AI 상담", "Job error chat", "작업 오류 로그 바로 해결 안내", "Resolve failed jobs with AI", "support"),
    ]),
  pageRole("/studio/p/", 2, "creation", ["프로젝트 작업실", "Project workspace"],
    ["선택한 작품의 기획·회차·소재·검수·배포를 한 흐름으로 이어가는 작업실", "Manage planning, episodes, assets, review and export for this work"],
    ["개별 작품 단위 전용 공간이며 상단에서 프로젝트 목록으로 복귀합니다", "Single-title workspace covering story through delivery"],
    [
      nextStep("/studio", "전체 프로젝트 목록", "All projects", "다른 작품 전환 또는 새 작품 생성", "Switch works or start new", "creation"),
      nextStep("/production", "팀 분업 관제", "Production OS", "회차별 스태프 배정·정산 연결", "Coordinate staff & payouts", "collab"),
      nextStep("/studio/publish", "검수·내보내기", "Review & export", "완성 회차 품질·권리 최종 점검", "Run preflight before release", "creation"),
    ]),

  // ── ③ 분업·협업·커뮤니티 ──
  pageRole("/production", 3, "collab", ["제작 관리 · 분업 OS", "Production OS"],
    ["팀원 역할 배정·회차 공정·검수·정산까지 한눈에 통제하는 분업 관제 화면", "Control staff roles, episode pipelines, reviews and payouts in one OS"],
    ["원고 직접 그리기(/studio)가 아닌 팀 분업·일정·정산 전용 관제실입니다", "Team division, schedule & payout control — distinct from drawing"],
    [
      nextStep("/team", "팀원·권한 관리", "Team & roles", "선화·채색·배경 담당자 초대·역할 설정", "Invite staff and set permissions", "collab"),
      nextStep("/studio/review", "올라온 원고 검수", "Review drafts", "제출된 회차 컷 피드백·승인", "Approve submitted episode cuts", "collab"),
      nextStep("/studio/publish", "완료 회차 내보내기", "Export episode", "검수 끝난 회차 최종 출력", "Export approved episode", "creation"),
    ]),
  pageRole("/studio/review", 3, "collab", ["검수와 수정", "Review & corrections"],
    ["원고 버전별 피드백 핀과 수정 요청을 한곳에서 확인·반영하는 검수 화면", "Inspect versioned feedback pins and resolve revisions cleanly"],
    ["수정 지시와 승인 이력을 원고 버전 단위로 남기는 검수 전용 공간입니다", "Version-pinned feedback and approval history"],
    [
      nextStep("/production", "분업 보드로 이동", "Production OS", "수정 완료 후 다음 공정 넘기기", "Hand off to next stage", "collab"),
      nextStep("/studio/versions", "이전 버전 비교", "Version history", "수정 전·후 체크포인트 대조", "Compare prior snapshots", "support"),
      nextStep("/studio/publish", "승인 후 내보내기", "Export approved", "최종 승인본 플랫폼 규격 출력", "Export final approved episode", "creation"),
    ]),
  pageRole("/studio/projects", 3, "collab", ["내 제작 작업", "My production tasks"],
    ["내게 배정된 회차 공정과 검수 마감 순서를 한눈에 모아 보는 작업함", "Track assigned episode tasks and upcoming review deadlines"],
    ["전체 팀 현황(/production) 중 내가 맡은 작업만 추려 보여줍니다", "Your personal task queue filtered from team Production OS"],
    [
      nextStep("/studio", "담당 원고 열기", "Open canvas", "배정된 회차 바로 그리기", "Draw assigned episode", "creation"),
      nextStep("/production", "전체 팀 분업 보드", "Production OS", "다른 파트 진행률·일정 확인", "See full team schedule", "collab"),
      nextStep("/studio/review", "검수 요청 확인", "Review inbox", "피드백 도착한 컷 먼저 처리", "Check feedback pins", "collab"),
    ]),
  pageRole("/studio/share", 3, "collab", ["공유 관리", "Sharing"],
    ["외부 편집자·클라이언트에게 보낸 열람 링크의 권한과 만료일을 통제하는 화면", "Control permissions and expiration on every shared review link"],
    ["원고 원본 유출 없이 외부 검수·열람 권한만 안전하게 관리합니다", "Safe external link governance without exposing source files"],
    [
      nextStep("/studio/review", "들어온 의견 보기", "View feedback", "공유 링크로 받은 검수 코멘트 확인", "Check reviewer comments", "collab"),
      nextStep("/production", "분업 관제로 이동", "Production OS", "승인 상태 팀 보드에 반영", "Update team production board", "collab"),
      nextStep("/settings", "보안·계정 설정", "Security settings", "접근 보호·계정 환경 점검", "Review security preferences", "support"),
    ]),
  pageRole("/studio/space", 3, "collab", ["가상 스튜디오", "Virtual studio"],
    ["내 캐릭터로 걸어 다니며 팀원과 실시간 소통·공동 작업하는 공간", "Walk as your character and collaborate live with your team"],
    ["혼자 그리는 2D 캔버스(/studio)와 달리 팀과 함께 모이는 공간입니다", "Shared live presence space — distinct from solo drawing"],
    [
      nextStep("/production", "분업 보드 열기", "Production OS", "회의한 내용을 공정·담당에 바로 반영", "Turn live sync into assigned tasks", "collab"),
      nextStep("/team", "팀원·권한 관리", "Team & roles", "가상 스튜디오 초대·역할 설정", "Invite teammates and set roles", "collab"),
      nextStep("/studio", "내 원고 캔버스", "Return to studio", "논의 후 내 원고 그리기로 복귀", "Jump back to drawing", "creation"),
    ]),
  pageRole("/team", 3, "collab", ["팀 · 권한", "Team & roles"],
    ["함께 작업할 팀원 초대, 공정별 담당 역할과 접근 권한을 설정하는 화면", "Invite collaborators and assign role-based permissions cleanly"],
    ["새 구인 공고(/collaborate)가 아니라 이미 합류한 내 팀 관리 화면입니다", "Manage your active team — use /collaborate to recruit new staff"],
    [
      nextStep("/production", "회차 분업 배정", "Production OS", "초대한 팀원에게 공정·마감 할당", "Assign episode stages to members", "collab"),
      nextStep("/collaborate", "팀원·어시스트 모집", "Recruit staff", "부족한 파트 구인·작업 의뢰 올리기", "Post openings or commissions", "collab"),
      nextStep("/studio/space", "가상 스튜디오 모임", "Virtual studio", "팀원과 실시간 작업실 접속", "Meet live in virtual studio", "collab"),
    ]),
  pageRole("/collaborate", 3, "collab", ["구인·의뢰", "Collaborate"],
    ["웹툰 어시스트·팀원 모집과 외주 작업 의뢰를 연결하는 협업 매칭 공간", "Recruit webtoon assistants, commission stages or share your portfolio"],
    ["새로운 협업 파트너를 찾는 공개 장터입니다(합류 후 /team·/production 연결)", "Public recruitment & commission board before onboarding to /team"],
    [
      nextStep("/team", "내 팀에 합류 등록", "Add to team", "매칭된 작업자 팀 권한 부여", "Onboard matched collaborator", "collab"),
      nextStep("/production", "분업 공정 시작", "Start pipeline", "외주·팀 회차 일정과 정산 연결", "Track milestones & settlements", "collab"),
      nextStep("/community", "창작자 커뮤니티", "Community", "작업 팁·후기 소통하기", "Discuss with fellow creators", "collab"),
    ]),
  pageRole("/community", 3, "collab", ["커뮤니티", "Community"],
    ["창작 노하우·작업 고민·작품 감상을 작가와 독자가 함께 나누는 광장", "Share craft tips, questions and reader conversations together"],
    ["소통·질문 중심 공간이며, 완성작 감상은 /showcase, 구인은 /collaborate입니다", "Discussion & tips hub — distinct from /showcase & /collaborate"],
    [
      nextStep("/showcase", "창작 갤러리 보기", "Creator showcase", "다른 작가의 완성작·제작 흐름 감상", "Explore finished creator works", "collab"),
      nextStep("/collaborate", "함께할 팀원 찾기", "Find teammates", "어시스트 모집·작업 의뢰 보기", "Browse recruitment & commissions", "collab"),
      nextStep("/opportunities", "공모전·지원사업", "Opportunities", "마감 임박 공모전·데뷔 기회 확인", "Check open contests & grants", "collab"),
    ]),
  pageRole("/showcase", 3, "collab", ["창작 갤러리", "Showcase"],
    ["다른 창작자의 완성작과 컷 연출·제작 과정을 살펴보고 영감을 얻는 전시관", "Explore published creator works and behind-the-scenes process"],
    ["독자용 전체 카탈로그(/discover)와 달리 창작자 제작 흐름에 초점을 둡니다", "Creator-made showcase with craft breakdowns, distinct from /discover"],
    [
      nextStep("/studio", "영감 받아 바로 그리기", "Draw in studio", "내 캔버스 열어 연출 시도하기", "Try techniques in your canvas", "creation"),
      nextStep("/market", "비슷한 소재 찾기", "Asset market", "원하는 분위기의 브러시·3D 찾기", "Find matching brushes & 3D sets", "market"),
      nextStep("/community", "작가와 감상 나누기", "Community", "피드백·제작 질의응답 참여", "Join creator discussions", "collab"),
    ]),
  pageRole("/reviews", 3, "collab", ["리뷰", "Reviews"],
    ["작품의 연출·스토리·작화를 깊이 읽고 감상 기록을 나누는 리뷰 공간", "Read and write thoughtful reviews on storytelling and craft"],
    ["작품 감상·비평 기록 전용 공간입니다", "Dedicated to deep reading reflections and critique"],
    [
      nextStep("/discover", "다음 읽을 작품 찾기", "Discover works", "취향 맞는 신작·인기작 탐색", "Find your next read", "market"),
      nextStep("/ranking", "인기 랭킹 확인", "Rankings", "기간·지표별 주목 작품 보기", "Check trending charts", "market"),
      nextStep("/community", "커뮤니티 대화", "Community", "다른 독자·작가와 이야기 나누기", "Join the conversation", "collab"),
    ]),
  pageRole("/opportunities", 3, "collab", ["창작 기회", "Opportunities"],
    ["웹툰 공모전·지원사업·연재 데뷔 기회를 마감일 순으로 확인하는 보드", "Track webtoon contests, public grants and debut programs"],
    ["외부·공식 데뷔 및 지원 기회를 놓치지 않고 챙기는 전용 일정판입니다", "Curated contests, grants and publishing calls"],
    [
      nextStep("/creator-support", "신인·학생 지원 신청", "Creator support", "ToonStudio 공식 신인·학생 지원 확인", "Apply for creator support", "support"),
      nextStep("/studio/present", "제출용 피치 정리", "Prepare pitch", "공모전 기획서·미리보기 꾸리기", "Build your pitch deck", "creation"),
      nextStep("/studio/publish", "제출 규격 출력", "Export entry", "심사 규격에 맞춰 원고 내보내기", "Export contest-ready files", "creation"),
    ]),

  // ── ④ 탐색·마켓·에셋 ──
  pageRole("/research/materials", 4, "market", ["통합 소재 검색 · 도감", "Unified Asset Search"],
    ["3D 배경·브러시·텍스처·포즈·효과음을 라이선스 검증과 함께 1클릭 투입하는 소재 허브", "Search verified 3D scenes, brushes, textures, poses and SFX for one-click canvas use"],
    ["CC0·상업 무료 소재 통합 검색 허브(/research/materials)이며, 유료 거래는 /market입니다", "Unified CC0 & commercial-safe material search hub — pair with /market"],
    [
      nextStep("/studio/bg3d", "3D 배경 스테이지 적용", "Open in 3D stage", "찾은 3D 배경·텍스처를 투시·잉크선과 합성", "Stage matched 3D scenes and textures", "three-d"),
      nextStep("/market", "에셋 마켓 더 보기", "Browse market", "로판·무협·서울 프리미엄 상업 소재 탐색", "Explore commercial genre asset packs", "market"),
      nextStep("/studio", "스튜디오 캔버스 복귀", "Return to studio", "고른 소재를 원고 컷에 바로 배치", "Drop picked materials into your canvas", "creation"),
    ]),
  pageRole("/market", 4, "market", ["소재 찾기 · 에셋 마켓", "Asset market"],
    ["3D 배경·브러시·효과 소재를 상업 라이선스·호환성과 함께 찾는 에셋 마켓", "Find 3D backdrops, brushes and effects with clear commercial rights"],
    ["새 소재를 탐색·확보하는 마켓(/market)이며, 담은 소재는 /studio/assets에 모입니다", "Discover & license new assets — your owned items live in /studio/assets"],
    [
      nextStep("/studio/assets", "내 작품 재료함", "My work materials", "받은 소재 호환성·라이선스 확인", "Inspect downloaded assets", "three-d"),
      nextStep("/studio/bg3d", "3D 배경에 바로 쓰기", "Use in 3D stage", "받은 3D 모델 카메라·조명 맞추기", "Stage your 3D asset right away", "three-d"),
      nextStep("/studio", "원고 캔버스에서 사용", "Draw with asset", "브러시·소재 바로 캔버스에 적용", "Paint directly in studio", "creation"),
    ]),
  pageRole("/hub", 4, "market", ["둘러보기 허브", "Explore hub"],
    ["작품 탐색·에셋 마켓·학습으로 빠르게 갈라지는 워크스페이스 분기 허브", "Jump quickly between discovery, asset market and learning"],
    ["작업 중 참고 자료·소재·강좌를 찾으러 나갈 때 쓰는 중간 관문입니다", "Fast launchpad for references, assets and tutorials"],
    [
      nextStep("/market", "에셋 마켓", "Asset market", "3D 배경·브러시·효과 소재 탐색", "Browse 3D & brush assets", "market"),
      nextStep("/discover", "작품 탐색", "Discover stories", "장르·취향별 작품 찾아보기", "Browse stories by taste", "market"),
      nextStep("/learn", "단계별 배우기", "Learn", "첫 3컷부터 3D·분업까지 학습", "Follow guided tutorials", "market"),
    ]),
  pageRole("/discover", 4, "market", ["작품 찾기", "Discover works"],
    ["검색·장르·취향 추천으로 다음 볼 작품과 작화 레퍼런스를 찾는 탐색 홈", "Discover webtoons and visual references by search, genre or taste"],
    ["작품 감상·레퍼런스 탐색용 화면입니다(제작 소재는 /market)", "Story & reference discovery — use /market for 3D & brush assets"],
    [
      nextStep("/ranking", "인기 랭킹 보기", "View rankings", "투명한 지표별 인기 흐름 확인", "Explore transparent rankings", "market"),
      nextStep("/market", "에셋 마켓 이동", "Asset market", "마음에 든 장르의 3D·브러시 찾기", "Find matching 3D & brushes", "market"),
      nextStep("/studio", "직접 작품 그리기", "Create in studio", "레퍼런스 참고해 내 원고 시작", "Start drawing your own work", "creation"),
    ]),
  pageRole("/explore", 4, "market", ["장르 탐색", "Browse genres"],
    ["장르·태그·플랫폼 조건을 좁혀 원하는 작품만 정확히 걸러내는 화면", "Filter stories precisely by genre, tag and platform"],
    ["세부 필터로 작품을 좁히는 탐색 화면입니다", "Structured genre & tag filter view"],
    [
      nextStep("/discover", "탐색 홈으로", "Discover hub", "추천·검색 전체 흐름 보기", "Return to discovery hub", "market"),
      nextStep("/recommend", "맞춤 추천 받기", "Recommendations", "내 취향 기반 추천 리스트", "See tailored picks", "market"),
      nextStep("/library", "내 서재 보기", "My library", "저장해 둔 작품 이어 읽기", "Open saved reading list", "support"),
    ]),
  pageRole("/ranking", 4, "market", ["랭킹", "Rankings"],
    ["기간·지표별 인기 작품 흐름과 투명한 순위 산정 기준을 함께 보는 순위표", "Explore transparent popularity charts with visible ranking criteria"],
    ["광고 슬롯과 투명 순위를 분리해 시장 흐름을 정확히 읽는 화면입니다", "Transparent ranking signals strictly separate from sponsorships"],
    [
      nextStep("/insights", "장르 트렌드 분석", "Trend insights", "장르·플랫폼 데이터 흐름 확인", "Read genre & platform analytics", "market"),
      nextStep("/discover", "조건별 작품 찾기", "Discover works", "관심 장르 작품 더 찾아보기", "Filter more stories", "market"),
      nextStep("/calendar", "연재 캘린더", "Release calendar", "요일별 신작 공개 일정 확인", "Check weekly release schedule", "market"),
    ]),
  pageRole("/calendar", 4, "market", ["연재 캘린더", "Release calendar"],
    ["요일별 신작 공개와 연재 일정을 한눈에 챙기는 일정표", "Track daily webtoon releases and new serial launches"],
    ["요일별 작품 공개 흐름 확인 전용 화면입니다", "Day-by-day release tracker"],
    [
      nextStep("/library", "내 서재 확인", "My library", "찜한 연재작 새 회차 바로 보기", "Read saved series updates", "support"),
      nextStep("/notifications", "연재 알림 보기", "Notifications", "놓친 업데이트 알림 확인", "Check release alerts", "support"),
      nextStep("/discover", "작품 더 찾기", "Discover works", "다른 요일·장르 작품 탐색", "Explore more genres", "market"),
    ]),
  pageRole("/recommend", 4, "market", ["맞춤 추천", "Recommendations"],
    ["읽은 기록과 선호 장르를 바탕으로 지금 딱 맞는 작품을 제안받는 화면", "Get story recommendations tuned to your reading taste"],
    ["취향 맞춤 제안 전용 공간입니다", "Personalized discovery feed"],
    [
      nextStep("/library", "내 서재에 정리", "My library", "마음에 든 작품 보관·관리", "Manage saved titles", "support"),
      nextStep("/reviews", "리뷰 살펴보기", "Read reviews", "독자 감상·연출 평 확인", "Read community reviews", "collab"),
      nextStep("/discover", "전체 탐색으로", "All discovery", "검색·필터로 넓게 찾기", "Browse full catalog", "market"),
    ]),
  pageRole("/research", 4, "market", ["리서치 데스크", "Research desk"],
    ["출처가 검증된 배경 자료·폰트·트렌드를 창작 기획으로 정리하는 자료실", "Turn verified references, fonts and trends into story research"],
    ["기획·자료 조사 전용 데스크이며, 바로 쓸 소재는 /market에서 받습니다", "Reference & planning desk — use /market for downloadable assets"],
    [
      nextStep("/market", "관련 에셋 찾기", "Asset market", "조사한 시대·장소에 맞는 3D·브러시", "Find matching 3D & brushes", "market"),
      nextStep("/studio", "기획 바탕으로 제작", "Open studio", "정리한 자료 들고 원고 시작", "Start drawing with research", "creation"),
      nextStep("/learn", "제작 기법 배우기", "Learn", "배경·연출 실전 레시피 확인", "Follow craft recipes", "market"),
    ]),
  pageRole("/learn", 4, "market", ["배우기", "Learn"],
    ["첫 3컷 그리기부터 3D 배경·분업 노하우까지 단계별로 익히는 아카데미", "Learn step by step from your first 3 panels to 3D and team workflows"],
    ["초보자 튜토리얼·강좌 공간이며, 오류 해결은 /studio/support AI 상담이 빠릅니다", "Guided lessons — use /studio/support AI chat for instant fixes"],
    [
      nextStep("/studio/comic", "배운 내용 바로 그리기", "Practice on canvas", "튜토리얼 본 직후 웹툰 컷 실습", "Try it directly on the canvas", "creation"),
      nextStep("/studio/bg3d", "3D 배경 따라하기", "Try 3D stage", "카메라·조명·잉크선 실습", "Practice 3D staging", "three-d"),
      nextStep("/studio/support", "막힌 부분 AI 질문", "Ask AI support", "1:1 채팅으로 이해 안 되는 기능 질문", "Ask 1:1 AI chat anytime", "support"),
    ]),
  pageRole("/insights", 4, "market", ["트렌드", "Trends"],
    ["장르별 독자 선호와 플랫폼 연재 흐름을 데이터로 읽는 인사이트 화면", "Read genre momentum and platform trends backed by data"],
    ["신작 기획·연재 전략 수립용 데이터 보드입니다", "Data-backed trend analysis for planning new series"],
    [
      nextStep("/research", "리서치 데스크", "Research desk", "트렌드를 구체적 소재·자료로 연결", "Collect sourced references", "market"),
      nextStep("/create", "새 기획 시작하기", "Start new work", "잡은 방향으로 첫 프로젝트 생성", "Launch a new draft", "creation"),
      nextStep("/opportunities", "공모전 확인", "Opportunities", "트렌드에 맞는 공모전 찾기", "Match with open contests", "collab"),
    ]),
  pageRole("/about/technology", 4, "three-d", ["제작 기술", "Engineering"],
    ["로컬 우선 저장·3D·AI·오픈소스 아키텍처와 적용 가이드를 공개한 기술 안내", "Inspect ToonStudio's local-first storage, 3D, AI and open architecture"],
    ["제품 구조와 성능 원리를 투명하게 확인하는 기술 문서입니다", "Transparent engineering overview and open-source guide"],
    [
      nextStep("/studio", "스튜디오 체험하기", "Try studio", "직접 캔버스·3D·AI 성능 써보기", "Test the canvas live", "creation"),
      nextStep("/learn", "사용법 배우기", "Learn", "실전 제작 가이드 따라하기", "Read step-by-step guides", "market"),
      nextStep("/studio/support", "기술 문의 AI 상담", "Tech AI chat", "브라우저·GPU·저장소 환경 진단", "Diagnose environment with AI", "support"),
    ]),
  pageRole("/play", 4, "market", ["놀이터", "Playground"],
    ["작업 중간에 가볍게 아이디어를 환기하는 인터랙티브 창작 놀이 공간", "Take a playful interactive break between drawing sessions"],
    ["휴식·아이디어 환기용 공간입니다", "Light interactive break away from heavy production"],
    [
      nextStep("/now", "오늘의 영감", "Daily prompt", "가벼운 아이디어 한 줄 받기", "Grab a quick creative prompt", "creation"),
      nextStep("/create", "새 작품 시작", "Start a work", "떠오른 장면 바로 스케치", "Sketch your fresh idea", "creation"),
      nextStep("/home", "작업 홈 복귀", "Back to home", "내 프로젝트로 돌아가기", "Return to your workspace", "creation"),
    ]),
  pageRole("/fortune", 4, "market", ["운세", "Fortune"],
    ["오늘의 운세·타로·독서 처방으로 가볍게 쉬어가는 휴식 화면", "Unwind with daily fortune, tarot and reading prescriptions"],
    ["작업 부담 없이 쉬어가는 전용 휴식 공간입니다", "Dedicated light break away from work"],
    [
      nextStep("/discover", "처방 작품 읽기", "Discover stories", "추천받은 분위기 작품 둘러보기", "Browse matched stories", "market"),
      nextStep("/now", "오늘의 영감", "Daily prompt", "가벼운 창작 주제 보기", "Pick a light drawing prompt", "creation"),
      nextStep("/home", "작업 홈 복귀", "Workspace home", "충전 후 내 작업실로 돌아가기", "Return to workspace", "creation"),
    ]),

  // ── ⑤ 내 공간·AI 고객센터·설정 ──
  pageRole("/studio/support", 5, "support", ["AI 고객센터 · 1:1 채팅상담", "AI Support · 1:1 Chat"],
    ["1:1 실시간 AI 채팅상담으로 오류 해결·원고 복구·기능 안내를 즉시 받는 창구", "Get real-time 1:1 AI chat help for fixes, recovery and workflows"],
    ["작가 전용 실시간 AI 1:1 채팅·지원 브리프 자동 작성 창구입니다", "Real-time creator AI support chat with automatic ticket handoff"],
    [
      nextStep("/studio/versions", "원고 버전 복구", "Restore version", "자동 저장 체크포인트로 안전 복구", "Roll back to a clean snapshot", "support"),
      nextStep("/creator-support", "신인·학생 창작자 지원", "Creator programs", "멘토링·제작 지원 프로그램 신청", "Explore mentorship & grants", "support"),
      nextStep("/studio", "해결 후 원고로 복귀", "Return to studio", "바로 작업하던 캔버스 열기", "Continue creating in studio", "creation"),
    ]),
  pageRole("/support", 5, "support", ["고객센터 · 1:1 AI 상담·복구", "Support · 1:1 AI Chat & Recovery"],
    ["원고 복구·계정·결제 문제 진단과 1:1 AI 채팅상담을 바로 여는 고객지원 센터", "Diagnose recovery, account or billing issues and open 1:1 AI chat"],
    ["일반 학습(/learn)이 아니라 실제 문제 해결·복구·1:1 상담 전용입니다", "Active problem resolution, diagnostics & 1:1 AI chat — not tutorials"],
    [
      nextStep("/studio/support", "작가 AI 채팅상담실", "Creator AI chat", "스튜디오·3D·브러시 특화 1:1 AI 상담", "Open studio-specific AI chat", "support"),
      nextStep("/help", "증상별 도움말", "Help guides", "자주 묻는 해결 경로 검색", "Search troubleshooting guides", "support"),
      nextStep("/settings", "환경·계정 점검", "Check settings", "저장소·언어·계정 환경 확인", "Review account & storage settings", "support"),
    ]),
  pageRole("/creator-support", 5, "support", ["신인·학생 창작자 지원", "Creator support program"],
    ["신인·학생 창작자 멘토링·제작 지원·프로그램 신청을 한곳에서 진행하는 화면", "Apply for new & student creator mentorship and production support"],
    ["기술 문의(/studio/support)와 별도로 창작자 성장 지원 프로그램을 신청합니다", "Mentorship & grant applications — pair with /studio/support for AI chat"],
    [
      nextStep("/studio/support", "AI 고객센터 1:1 채팅", "AI 1:1 chat", "신청·제작 궁금증 즉시 AI 질문", "Ask AI support chat right away", "support"),
      nextStep("/opportunities", "공모전·지원사업", "Opportunities", "진행 중인 외부 공모전 함께 확인", "Browse open contests & grants", "collab"),
      nextStep("/studio", "지원작 스튜디오 시작", "Start in studio", "제출용 작품 캔버스에서 제작", "Build your submission in studio", "creation"),
    ]),
  pageRole("/studio/versions", 5, "support", ["변경 기록 · 복구", "Version history"],
    ["원고 스냅샷과 자동 저장 체크포인트를 비교하고 원하는 시점으로 복구하는 화면", "Compare manuscript snapshots and restore any safe checkpoint"],
    ["작업이 꼬였거나 실수로 지웠을 때 안전하게 되돌리는 타임머신입니다", "Safe rollback timeline whenever a draft needs recovery"],
    [
      nextStep("/studio", "복구한 원고 열기", "Open restored draft", "되돌린 버전에서 바로 이어 그리기", "Resume on restored version", "creation"),
      nextStep("/studio/review", "변경 내용 검수", "Review changes", "복구본 이상 여부 확인", "Verify restored episode", "collab"),
      nextStep("/studio/support", "복구 막힐 때 AI 상담", "Recovery AI chat", "로컬 저장·동기화 문제 1:1 진단", "Troubleshoot sync with AI chat", "support"),
    ]),
  pageRole("/studio/ai-settings", 5, "support", ["AI 사용 설정", "AI settings"],
    ["로컬·외부 AI 기능 범위와 원고 데이터 비전송 보호 규칙을 정하는 화면", "Configure local/cloud AI scope and artwork data privacy rules"],
    ["원고 원본 보호 원칙과 AI 자동 채우기 허용 범위를 직접 통제합니다", "Direct control over AI boundaries and artwork privacy"],
    [
      nextStep("/studio", "스튜디오로 돌아가기", "Back to studio", "변경한 AI 설정으로 바로 작업", "Create with updated AI settings", "creation"),
      nextStep("/settings", "전체 환경 설정", "All settings", "테마·언어·단축키 설정", "Adjust display & language", "support"),
      nextStep("/studio/support", "AI 설정 문의", "AI support chat", "로컬 AI 환경·호환성 1:1 질문", "Ask AI support about setup", "support"),
    ]),
  pageRole("/help", 5, "support", ["도움말", "Help"],
    ["작업 중 막힌 문제나 궁금한 기능을 증상별로 빠르게 찾아 해결하는 안내서", "Find task-based answers and troubleshooting steps fast"],
    ["문서로 빠르게 찾는 도움말이며, 대화형 해결은 /studio/support AI 채팅으로 이어집니다", "Self-serve guides that hand off directly to 1:1 AI chat"],
    [
      nextStep("/studio/support", "1:1 AI 채팅상담 열기", "Open 1:1 AI chat", "문서로 안 풀리면 AI가 단계별 해결", "Let 1:1 AI chat guide you live", "support"),
      nextStep("/support", "고객센터 · 복구 진단", "Support & recovery", "진단 정보 복사·비공개 문의", "Run diagnostics & private chat", "support"),
      nextStep("/learn", "기초부터 배우기", "Learn basics", "첫 3컷 튜토리얼로 차근차근 익히기", "Follow beginner tutorials", "market"),
    ]),
  pageRole("/my", 5, "support", ["내 정보", "My account"],
    ["내 작품·활동 기록·프로필·멤버십과 계정 상태를 한곳에서 관리하는 공간", "Manage your profile, activity history, membership and account"],
    ["계정·프로필 중심 공간입니다(작업 시작은 /home, 환경 조정은 /settings)", "Profile & account hub — distinct from /home and /settings"],
    [
      nextStep("/home", "작업 홈 이동", "Workspace home", "최근 작업하던 프로젝트 바로 열기", "Jump back to your projects", "creation"),
      nextStep("/settings", "화면·언어 설정", "Preferences", "테마·언어·데이터 저장소 맞추기", "Adjust theme, language & storage", "support"),
      nextStep("/studio/support", "AI 고객센터 상담", "AI support chat", "계정·이용 관련 1:1 실시간 문의", "Ask AI support about your account", "support"),
    ]),
  pageRole("/library", 5, "support", ["내 서재", "My library"],
    ["저장해 둔 작품과 이어 읽던 회차를 한곳에서 꺼내 보는 개인 서재", "Keep saved works and in-progress reading lists in one shelf"],
    ["읽기 보관함(/library)이며, 내 제작 원고는 /studio에 있습니다", "Your reading shelf — your own manuscripts live in /studio"],
    [
      nextStep("/discover", "새 작품 더 찾기", "Discover works", "취향 맞는 신작 추가하기", "Find more stories to save", "market"),
      nextStep("/calendar", "연재 요일 확인", "Release calendar", "오늘 올라온 새 회차 챙기기", "Check today's updates", "market"),
      nextStep("/studio", "내 원고 그리기", "Draw in studio", "영감 받아 내 작품 작업하기", "Open your studio projects", "creation"),
    ]),
  pageRole("/notifications", 5, "support", ["알림 센터", "Notifications"],
    ["연재 소식·팀 검수 요청·시스템 안내를 놓치지 않고 확인하는 알림함", "Review release alerts, team review requests and system updates"],
    ["도착한 작업·연재 알림을 확인하고 해당 화면으로 즉시 이동합니다", "Unified inbox routing straight into action"],
    [
      nextStep("/production", "팀 검수·분업 처리", "Production OS", "도착한 분업·검수 요청 바로 확인", "Handle pending team reviews", "collab"),
      nextStep("/studio", "내 작업 열기", "Open studio", "관련 프로젝트 바로 편집하기", "Open related manuscript", "creation"),
      nextStep("/settings", "알림 수신 설정", "Notification settings", "원하는 알림만 골라 받기", "Tune alert preferences", "support"),
    ]),
  pageRole("/settings", 5, "support", ["환경 설정", "Settings"],
    ["테마·언어·단축키·로컬 저장소와 AI 연결 환경을 내 방식대로 맞추는 화면", "Tailor theme, language, shortcuts, storage and AI preferences"],
    ["앱 전체 환경 제어판입니다(원고별 설정은 각 프로젝트 안에서 변경)", "Global app preferences — per-work settings live inside projects"],
    [
      nextStep("/studio/ai-settings", "AI 상세 설정", "AI settings", "로컬·외부 AI 동작 범위 세밀 조정", "Fine-tune AI privacy & scope", "support"),
      nextStep("/studio/support", "설정 막힐 때 AI 상담", "AI support chat", "환경 최적화·오류 1:1 안내", "Get setup help via AI chat", "support"),
      nextStep("/home", "작업 홈으로 복귀", "Workspace home", "맞춘 환경으로 작업 이어가기", "Return to workspace home", "creation"),
    ]),
  pageRole("/sitemap", 5, "support", ["전체 메뉴", "All menu"],
    ["ToonStudio의 모든 기능을 5단계 창작 여정과 목적별 지도로 찾는 전체 지도", "Browse every ToonStudio tool along the 5-stage creation journey"],
    ["메뉴 이름을 몰라도 하고 싶은 일 기준으로 1클릭 이동하는 디렉터리입니다", "Task-first directory across all 5 journey stages"],
    [
      nextStep("/create", "새 작품 바로 시작", "Start a work", "지금 바로 첫 캔버스 열기", "Open a fresh canvas now", "creation"),
      nextStep("/studio", "스튜디오 열기", "Open studio", "원고·3D·AI 제작 허브 이동", "Go to main studio hub", "three-d"),
      nextStep("/studio/support", "AI 고객센터 1:1 채팅", "AI 1:1 support", "원하는 기능 못 찾을 때 AI 안내", "Ask AI to guide you anywhere", "support"),
    ]),
]);

const DEFAULT_FALLBACK_ENTRY: PageRoleJourneyEntry = PAGE_ROLE_JOURNEY_ENTRIES[0]!;
const VIRTUAL_PROJECT_SPACE_PATTERN = /^\/studio\/p\/[^/]+\/space(?:\/|$)/u;
const WORK_SUBROUTE_PATTERN = /^\/studio\/(?:work|remix)\/[^/]+\/(review|versions|present|assets)(?:\/|$)/u;

/** 현재 경로에 가장 구체적으로 일치하는 페이지 역할·여정 메타데이터를 반환한다. */
export function resolvePageRoleJourney(pathname: string): PageRoleJourneyEntry {
  const rawPath = canonicalSitePath(pathname);
  const workSubroute = WORK_SUBROUTE_PATTERN.exec(rawPath);
  const path = VIRTUAL_PROJECT_SPACE_PATTERN.test(rawPath)
    ? "/studio/space"
    : workSubroute
      ? `/studio/${workSubroute[1]!}`
      : rawPath;
  let best: PageRoleJourneyEntry | null = null;
  let bestLength = -1;

  for (const candidate of PAGE_ROLE_JOURNEY_ENTRIES) {
    const pattern = candidate.pathPattern === "/"
      ? "/"
      : candidate.pathPattern.endsWith("/")
        ? candidate.pathPattern
        : canonicalSitePath(candidate.pathPattern);

    const matched = candidate.exact
      ? path === pattern
      : pattern.endsWith("/")
        ? path.startsWith(pattern)
        : path === pattern || path.startsWith(`${pattern}/`);

    if (matched && pattern.length > bestLength) {
      best = candidate;
      bestLength = pattern.length;
    }
  }

  return best ?? DEFAULT_FALLBACK_ENTRY;
}

/** 단계 번호(1~5)에 대응하는 정본 여정 메타데이터를 반환한다. */
export function journeyStageForNumber(
  stageNumber: JourneyStageNumber,
): CreatorJourneyStage {
  return STAGE_BY_NUMBER[stageNumber];
}

/** 7대 목적 그룹 ID(`discover`·`create`·`grow`·`publish`·`connect`·`rest`·`personal`)를 5단계 여정에 매핑한다. */
export function journeyStageForNavigationGroupId(
  groupId: string,
): CreatorJourneyStage {
  const stageNumber = GROUP_TO_STAGE_NUMBER[groupId] ?? 1;
  return STAGE_BY_NUMBER[stageNumber];
}
