/**
 * Wave 40F — 절차적 2.5D 온보딩 디오라마 · 60초 첫 컷 체험 · 창작자 성향 맞춤 스타터 엔진.
 *
 * - 4장(Chapter) 인터랙티브 온보딩 디오라마 상태기계 (실존 `/assets/atelier/` WebP 자산 연결)
 * - 2.5D 포인터 틸트 패럴랙스 솔버 (`prefers-reduced-motion` 시 0deg/0px 완전 고정)
 * - 60초 첫 컷 체험 시뮬레이터 (4단계 × 15초 작화 스프린트)
 * - 창작자 성향 4문항(장르·목표·기기·선호 화구) 맞춤 스타터 처방 매처
 *
 * 순수 함수형 모듈: Web Storage · BigInt 리터럴 · private Map store 미사용.
 */

export type DioramaChapterId = "first-cut-desk" | "character-sculpt" | "virtual-collab" | "episode-publish";
export type DioramaDepthLayer = "background" | "midground" | "foreground";

export interface DioramaHotspotSpec {
  readonly hotspotId: string;
  readonly xPct: number;
  readonly yPct: number;
  readonly depthLayer: DioramaDepthLayer;
  readonly labelKo: string; readonly labelEn: string;
  readonly detailKo: string; readonly detailEn: string;
}

export interface DioramaDepthProfile {
  readonly perspectivePx: number; readonly tiltMaxDeg: number;
  readonly backgroundShiftPx: number; readonly midgroundShiftPx: number;
  readonly foregroundShiftPx: number; readonly jewelLiftPx: number;
}

export interface DioramaChapterSpec {
  readonly id: DioramaChapterId;
  readonly chapterNumber: 1 | 2 | 3 | 4;
  readonly badgeKo: string; readonly badgeEn: string;
  readonly titleKo: string; readonly titleEn: string;
  readonly subtitleKo: string; readonly subtitleEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly dioramaImageSrc: string;
  readonly jewelImageSrc: string;
  readonly ambientPaperSrc: string;
  readonly recommendedRoute: string;
  readonly ctaLabelKo: string; readonly ctaLabelEn: string;
  readonly capabilityChipsKo: readonly [string, string, string];
  readonly capabilityChipsEn: readonly [string, string, string];
  readonly depthProfile: DioramaDepthProfile;
  readonly hotspots: readonly DioramaHotspotSpec[];
}

export interface DioramaState {
  readonly activeChapterId: DioramaChapterId; readonly activeIndex: number;
  readonly visitedChapterIds: readonly DioramaChapterId[];
  readonly selectedHotspotId: string | null; readonly autoPlayEnabled: boolean;
  readonly transitionCount: number; readonly completedAllChapters: boolean; readonly completionRatio: number;
}

export type DioramaTransitionAction =
  | { readonly type: "select"; readonly chapterId: DioramaChapterId }
  | { readonly type: "next"; readonly wrap?: boolean }
  | { readonly type: "prev"; readonly wrap?: boolean }
  | { readonly type: "select-hotspot"; readonly hotspotId: string | null }
  | { readonly type: "toggle-autoplay"; readonly enabled?: boolean }
  | { readonly type: "reset" };

export interface DioramaPointerRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number; }
export interface DioramaParallaxInput {
  readonly normalizedX: number; readonly normalizedY: number;
  readonly prefersReducedMotion: boolean; readonly isPointerActive?: boolean;
  readonly depthProfile?: Partial<DioramaDepthProfile>;
}
export interface DioramaLayerOffset { readonly translateXPx: number; readonly translateYPx: number; readonly scale: number; readonly depthFactor: number; }

export interface DioramaParallaxSolution {
  readonly reducedMotionApplied: boolean; readonly clampedX: number; readonly clampedY: number;
  readonly perspectivePx: number; readonly rotateXDeg: number; readonly rotateYDeg: number;
  readonly background: DioramaLayerOffset; readonly midground: DioramaLayerOffset;
  readonly foreground: DioramaLayerOffset; readonly jewel: DioramaLayerOffset;
  readonly stageTransformCss: string; readonly backgroundTransformCss: string;
  readonly midgroundTransformCss: string; readonly foregroundTransformCss: string; readonly jewelTransformCss: string;
  readonly specularShiftPct: { readonly x: number; readonly y: number };
}

export type FirstCutStepId = "frame-rough" | "ink-lineart" | "paper-mood" | "balloon-save";
export type FirstCutCanvasPreset = "scroll-9-16" | "page-3-4" | "square-1-1";

export interface FirstCutSprintStepSpec {
  readonly id: FirstCutStepId; readonly order: 1 | 2 | 3 | 4;
  readonly windowStartSec: number; readonly windowEndSec: number; readonly durationSec: number;
  readonly titleKo: string; readonly titleEn: string;
  readonly guideKo: string; readonly guideEn: string;
  readonly actionLabelKo: string; readonly actionLabelEn: string;
}

export interface FirstCutSprintState {
  readonly status: "idle" | "running" | "completed"; readonly totalBudgetSec: 60;
  readonly elapsedSec: number; readonly remainingSec: number; readonly activeStepIndex: number;
  readonly completedStepIds: readonly FirstCutStepId[]; readonly strokeCount: number;
  readonly balloonDraftKo: string; readonly canvasPreset: FirstCutCanvasPreset;
  /** 이 계산 예제는 원고 저장을 실행하지 않으며 항상 false다. */
  readonly savedToLocalDraft: boolean; readonly progressPercent: number;
  readonly paceRating: "ready" | "ahead" | "on-track" | "overtime";
}

export type FirstCutSprintAction =
  | { readonly type: "start" }
  | { readonly type: "tick"; readonly deltaSec: number }
  | { readonly type: "complete-step"; readonly stepId?: FirstCutStepId; readonly spentSec?: number }
  | { readonly type: "add-stroke"; readonly count?: number }
  | { readonly type: "set-balloon"; readonly text: string }
  | { readonly type: "set-canvas-preset"; readonly preset: FirstCutCanvasPreset }
  | { readonly type: "complete-all-instant" }
  | { readonly type: "reset" };

export interface FirstCutSprintSummary {
  readonly scope: "example-only"; readonly timeBasis: "synthetic-budget"; readonly savedToLocalDraft: false;
  readonly completed: boolean; readonly elapsedSec: number; readonly completedCount: number;
  readonly totalSteps: number; readonly strokeCount: number; readonly canvasPreset: FirstCutCanvasPreset;
  readonly summaryKo: string; readonly summaryEn: string;
}

export type CreatorGenreChoice = "romance-campus" | "fantasy-action" | "urban-thriller" | "slice-of-life";
export type CreatorGoalChoice = "first-webtoon-episode" | "character-turnaround" | "team-collab-workflow" | "motion-reels-publish";
export type CreatorDeviceChoice = "desktop-pen-tablet" | "ipad-stylus" | "laptop-mouse-trackpad" | "mobile-thumb";
export type CreatorMediumChoice = "gpen-ink" | "watercolor-sable" | "oil-impasto" | "graphite-pencil" | "alcohol-marker" | "charcoal-pastel";

export interface CreatorMatcherAnswers { readonly genre: CreatorGenreChoice; readonly goal: CreatorGoalChoice; readonly device: CreatorDeviceChoice; readonly medium: CreatorMediumChoice; }
export interface MatcherOptionSpec<T extends string> { readonly id: T; readonly labelKo: string; readonly labelEn: string; readonly hintKo: string; readonly hintEn: string; }

export interface MatchedBrushSpec {
  readonly id: CreatorMediumChoice; readonly labelKo: string; readonly labelEn: string;
  readonly imageSrc: string; readonly tipSizePx: number; readonly stabilizationPct: number;
  readonly pressureNoteKo: string; readonly pressureNoteEn: string;
}
export interface MatchedPaperSpec {
  readonly id: "manga-kent" | "cold-press-watercolor" | "linen-canvas" | "korean-hanji";
  readonly labelKo: string; readonly labelEn: string; readonly imageSrc: string;
  readonly grainStrengthPct: number; readonly feelNoteKo: string; readonly feelNoteEn: string;
}
export interface MatchedBackgroundSpec {
  readonly id: "bg-school-hallway" | "bg-fantasy-courtyard" | "bg-seoul-crosswalk" | "bg-rainy-bookstore";
  readonly labelKo: string; readonly labelEn: string; readonly imageSrc: string;
  readonly moodLabelKo: string; readonly moodLabelEn: string;
}
export interface MatchedSpaceSpec {
  readonly id: "wood-atelier" | "fantasy-guild-hall" | "midnight-manga-cafe" | "rooftop-terrace";
  readonly labelKo: string; readonly labelEn: string; readonly imageSrc: string;
}
export interface MatchedWorkspaceRoute {
  readonly path: string; readonly fullHref: string; readonly labelKo: string; readonly labelEn: string;
  readonly ctaKo: string; readonly ctaEn: string; readonly queryParams: Readonly<Record<string, string>>;
}

export interface CreatorStarterPrescription {
  readonly archetypeId: string; readonly archetypeTitleKo: string; readonly archetypeTitleEn: string;
  readonly rationaleKo: string; readonly rationaleEn: string; readonly fitScorePct: number;
  readonly brush: MatchedBrushSpec; readonly paper: MatchedPaperSpec;
  readonly background: MatchedBackgroundSpec; readonly space: MatchedSpaceSpec;
  readonly recommendedChapterId: DioramaChapterId; readonly workspaceRoute: MatchedWorkspaceRoute;
  readonly deviceOptimizationKo: string; readonly deviceOptimizationEn: string;
  readonly estimatedFirstCutSec: number;
  readonly checklistKo: readonly [string, string, string];
  readonly checklistEn: readonly [string, string, string];
}

export const DEFAULT_DIORAMA_DEPTH_PROFILE: DioramaDepthProfile = Object.freeze({
  perspectivePx: 960,
  tiltMaxDeg: 7.5,
  backgroundShiftPx: -12,
  midgroundShiftPx: 8,
  foregroundShiftPx: 18,
  jewelLiftPx: 24,
});

export const ONBOARDING_DIORAMA_CHAPTERS: readonly DioramaChapterSpec[] = Object.freeze([
  {
    id: "first-cut-desk",
    chapterNumber: 1,
    badgeKo: "1장 · 첫 컷",
    badgeEn: "Ch.1 · First Cut",
    titleKo: "첫 컷 데스크",
    titleEn: "First Cut Desk",
    subtitleKo: "첫 선화·말풍선·저장 확인 순서를 소개하는 삽화예요",
    subtitleEn: "An illustration introducing ink, dialogue and save checks",
    summaryKo: "컷 작업 순서를 살펴보는 안내예요. 아래 시간은 합성 예산이며 실제 원고를 그리거나 OPFS에 저장하지 않아요.",
    summaryEn: "Explore a sample cut workflow. Times are synthetic budgets; no manuscript is drawn or saved to OPFS here.",
    dioramaImageSrc: "/assets/atelier/onboarding/first-cut-desk.webp",
    jewelImageSrc: "/assets/atelier/jewels/jewel-drawing-nib.webp",
    ambientPaperSrc: "/assets/atelier/papers/manga-kent.webp",
    recommendedRoute: "/studio/new?lane=blank",
    ctaLabelKo: "빈 컷에서 바로 그리기",
    ctaLabelEn: "Start Drawing Now",
    capabilityChipsKo: ["게스트 즉시 진입", "로컬 OPFS 저장", "82%+ 캔버스 시야"],
    capabilityChipsEn: ["Instant Guest Entry", "Local OPFS Save", "82%+ Canvas Focus"],
    depthProfile: DEFAULT_DIORAMA_DEPTH_PROFILE,
    hotspots: [
      { hotspotId: "desk-nib", xPct: 26, yPct: 62, depthLayer: "foreground", labelKo: "G펜 스틸 닙", labelEn: "G-Pen Steel Nib", detailKo: "필압과 기울기에 따라 선 강약과 닙 갈라짐을 자연스럽게 살립니다.", detailEn: "Responds to pressure and tilt for crisp line weight and nib split." },
      { hotspotId: "desk-kent-sheet", xPct: 54, yPct: 48, depthLayer: "midground", labelKo: "만화 켄트 원고지", labelEn: "Manga Kent Sheet", detailKo: "잉크 번짐이 적은 매끈한 켄트지 위에 컷 가이드와 말풍선을 얹습니다.", detailEn: "Crisp panel frames and balloons over smooth manga kent paper." },
      { hotspotId: "desk-opfs-lamp", xPct: 78, yPct: 30, depthLayer: "background", labelKo: "로컬 보관 안내", labelEn: "Local Storage Guide", detailKo: "저장 결과는 실제 편집기에서 저장 후 다시 열어 확인하세요. 이 예제는 입력 대사를 영구 보관하지 않아요.", detailEn: "Verify saving by reopening the actual editor. This example does not persist dialogue." },
    ],
  },
  {
    id: "character-sculpt",
    chapterNumber: 2,
    badgeKo: "2장 · 캐릭터",
    badgeEn: "Ch.2 · Character",
    titleKo: "캐릭터 조각",
    titleEn: "Character Sculpt",
    subtitleKo: "키·표정·의상 작업을 소개하는 캐릭터 삽화예요",
    subtitleEn: "An illustration introducing character height, expressions and outfits",
    summaryKo: "캐릭터 작업 항목과 관련 화면을 안내해요. 이 삽화는 실제 모델이나 컷을 바꾸지 않아요.",
    summaryEn: "Explore character workflow topics and a related route. This illustration does not change a model or cut.",
    dioramaImageSrc: "/assets/atelier/onboarding/character-sculpt.webp",
    jewelImageSrc: "/assets/atelier/jewels/jewel-character-bust.webp",
    ambientPaperSrc: "/assets/atelier/papers/linen-canvas.webp",
    recommendedRoute: "/studio/assets/characters/new",
    ctaLabelKo: "3D 캐릭터 셰이퍼 열기",
    ctaLabelEn: "Open 3D Character Shaper",
    capabilityChipsKo: ["cm 키 비율 동기화", "표정·포즈 프리셋", "배색 스와치 추출"],
    capabilityChipsEn: ["Metric cm Sync", "Pose & Face Presets", "Palette Extraction"],
    depthProfile: { perspectivePx: 980, tiltMaxDeg: 8, backgroundShiftPx: -13, midgroundShiftPx: 9, foregroundShiftPx: 19, jewelLiftPx: 26 },
    hotspots: [
      { hotspotId: "sculpt-bust", xPct: 48, yPct: 42, depthLayer: "midground", labelKo: "3D 헤드·체형 조각", labelEn: "3D Head & Body Sculpt", detailKo: "얼굴 각도와 실루엣을 돌려가며 컷에 맞는 앵글을 바로 찾습니다.", detailEn: "Orbit head and torso geometry to lock the exact panel camera angle." },
      { hotspotId: "sculpt-height", xPct: 24, yPct: 58, depthLayer: "foreground", labelKo: "실측 키 스케일", labelEn: "Real Height Scale", detailKo: "두 캐릭터의 키 차이와 시선 높이를 자동으로 바닥 접지(Y=0) 정렬합니다.", detailEn: "Aligns character height differentials and eye lines on the floor plane." },
      { hotspotId: "sculpt-swatch", xPct: 76, yPct: 64, depthLayer: "background", labelKo: "작화 배색 스와치", labelEn: "OKLCH Swatch Sync", detailKo: "머리카락·피부·의상 고유색을 2D 팔레트로 즉시 전달합니다.", detailEn: "Feeds hair, skin, and costume tokens directly into the 2D palette." },
    ],
  },
  {
    id: "virtual-collab",
    chapterNumber: 3,
    badgeKo: "3장 · 가상 공방",
    badgeEn: "Ch.3 · Collab Space",
    titleKo: "가상 협업 스튜디오",
    titleEn: "Virtual Collab Studio",
    subtitleKo: "콘티·선화·채색 협업 항목을 소개하는 삽화예요",
    subtitleEn: "An illustration introducing storyboard, ink and color collaboration",
    summaryKo: "가상 공방과 협업 작업 항목을 살펴봐요. 실제 팀 세션·잠금·원고 동기화는 연결하지 않았어요.",
    summaryEn: "Explore studio and collaboration topics. No live team session, lock or manuscript sync is connected.",
    dioramaImageSrc: "/assets/atelier/onboarding/virtual-collab.webp",
    jewelImageSrc: "/assets/atelier/jewels/jewel-studio-cube.webp",
    ambientPaperSrc: "/assets/atelier/papers/cold-press-watercolor.webp",
    recommendedRoute: "/studio/space",
    ctaLabelKo: "가상 협업 스튜디오 입장",
    ctaLabelEn: "Enter Virtual Collab Studio",
    capabilityChipsKo: ["Yjs CRDT 동시 편집", "컷 단계 잠금", "6테마 가상 공방"],
    capabilityChipsEn: ["Yjs CRDT Sync", "Cut Stage Locks", "6 Atelier Rooms"],
    depthProfile: { perspectivePx: 940, tiltMaxDeg: 7.5, backgroundShiftPx: -11, midgroundShiftPx: 8, foregroundShiftPx: 17, jewelLiftPx: 23 },
    hotspots: [
      { hotspotId: "collab-table", xPct: 50, yPct: 54, depthLayer: "midground", labelKo: "공유 작화 보드", labelEn: "Shared Cut Board", detailKo: "콘티·선화·밑색·식자 담당자를 컷 단위로 한눈에 확인합니다.", detailEn: "Track storyboard, lineart, flat color, and lettering per cut." },
      { hotspotId: "collab-cube", xPct: 74, yPct: 38, depthLayer: "foreground", labelKo: "공간 룸 프리셋", labelEn: "Spatial Room Presets", detailKo: "목재 공방·심야 만화 북카페·길드홀 등 작업 분위기에 맞춰 전환합니다.", detailEn: "Switch studio mood across Wood Atelier, Midnight Café, or Guild Hall." },
      { hotspotId: "collab-handoff", xPct: 26, yPct: 68, depthLayer: "background", labelKo: "인수인계 확인 항목", labelEn: "Handoff Checks", detailKo: "실제 협업 화면에서 담당자·잠금·저장 버전을 확인하세요. 이 안내는 충돌 예방을 보증하지 않아요.", detailEn: "Check members, locks and saved versions in the actual workspace. This guide does not guarantee conflict prevention." },
    ],
  },
  {
    id: "episode-publish",
    chapterNumber: 4,
    badgeKo: "4장 · 출고·릴스",
    badgeEn: "Ch.4 · Publish & Reels",
    titleKo: "회차 출고 · 릴스",
    titleEn: "Episode Publish & Reels",
    subtitleKo: "권리 점검·회차 분할·릴스 출력 확인 순서를 소개해요",
    subtitleEn: "Explore rights checks, episode slicing and reel output checks",
    summaryKo: "출고 관련 화면을 안내하는 삽화예요. 권리 감사나 파일 출력을 실행하지 않으며 이용 허가·분쟁 예방을 보증하지 않아요.",
    summaryEn: "This illustration links to publishing topics. It performs no rights audit or export and guarantees no usage permission or dispute prevention.",
    dioramaImageSrc: "/assets/atelier/onboarding/episode-publish.webp",
    jewelImageSrc: "/assets/atelier/jewels/jewel-reels-slate.webp",
    ambientPaperSrc: "/assets/atelier/papers/korean-hanji.webp",
    recommendedRoute: "/studio/motion-webtoon",
    ctaLabelKo: "출고 · 모션 릴스 열기",
    ctaLabelEn: "Open Publish & Reels",
    capabilityChipsKo: ["출고 전 Rights BOM", "연재 규격 슬라이스", "9:16 모션 릴스"],
    capabilityChipsEn: ["Pre-Export Rights BOM", "Episode Auto-Slice", "9:16 Motion Reels"],
    depthProfile: { perspectivePx: 960, tiltMaxDeg: 7, backgroundShiftPx: -10, midgroundShiftPx: 7, foregroundShiftPx: 16, jewelLiftPx: 22 },
    hotspots: [
      { hotspotId: "publish-bom", xPct: 30, yPct: 50, depthLayer: "midground", labelKo: "Rights BOM 사전 감사", labelEn: "Rights BOM Preflight", detailKo: "상업 연재에 필요한 폰트·브러시·에셋 라이선스 누락을 출고 전에 잡아냅니다.", detailEn: "Catches missing font, brush, or asset licenses before commercial export." },
      { hotspotId: "publish-slate", xPct: 68, yPct: 44, depthLayer: "foreground", labelKo: "9:16 모션 릴스 슬레이트", labelEn: "9:16 Motion Reels Slate", detailKo: "완성 컷의 전경·배경 레이어를 분리해 짧은 홍보 영상으로 바로 연출합니다.", detailEn: "Turns separated cut layers into short vertical promo reels." },
      { hotspotId: "publish-slice", xPct: 52, yPct: 72, depthLayer: "background", labelKo: "플랫폼 규격 패키징", labelEn: "Platform Spec Pack", detailKo: "세로 스크롤 분할, 단행본 여백, 썸네일 크롭까지 규격에 맞춰 출력합니다.", detailEn: "Exports sliced vertical episodes, print bleed, and thumbnails cleanly." },
    ],
  },
]);

export const FIRST_CUT_SPRINT_STEPS: readonly FirstCutSprintStepSpec[] = Object.freeze([
  { id: "frame-rough", order: 1, windowStartSec: 0, windowEndSec: 15, durationSec: 15, titleKo: "1단계 · 컷 틀 & 러프 가이드", titleEn: "Step 1 · Panel Frame & Rough", guideKo: "화면 비율을 고르고 인물 시선선과 구도 박스를 가볍게 잡습니다.", guideEn: "Pick the aspect ratio and lay down the eye-line and frame box.", actionLabelKo: "컷 구도 확정 (+15초)", actionLabelEn: "Lock Frame (+15s)" },
  { id: "ink-lineart", order: 2, windowStartSec: 15, windowEndSec: 30, durationSec: 15, titleKo: "2단계 · G펜 주선 & 안정화", titleEn: "Step 2 · G-Pen Lineart", guideKo: "손떨림 보정과 필압 곡선으로 깔끔한 인물 실루엣 주선을 따냅니다.", guideEn: "Trace crisp character outlines with pressure curves and stabilization.", actionLabelKo: "주선 1차 마감 (+15초)", actionLabelEn: "Finish Ink Pass (+15s)" },
  { id: "paper-mood", order: 3, windowStartSec: 30, windowEndSec: 45, durationSec: 15, titleKo: "3단계 · 종이 질감 & 시작 배경", titleEn: "Step 3 · Paper Grain & Backdrop", guideKo: "아틀리에 종이 질감과 배경 무드를 깔아 단번에 장면 공기를 만듭니다.", guideEn: "Drop in atelier paper grain and a matching scene backdrop.", actionLabelKo: "질감·배경 배치 (+15초)", actionLabelEn: "Apply Paper & Mood (+15s)" },
  { id: "balloon-save", order: 4, windowStartSec: 45, windowEndSec: 60, durationSec: 15, titleKo: "4단계 · 대사 예제 & 저장 확인 안내", titleEn: "Step 4 · Dialogue Example & Save Guide", guideKo: "입력 대사를 미리 봐요. 이 패널은 저장하지 않으므로 실제 편집기의 저장·재열기 결과를 따로 확인하세요.", guideEn: "Preview dialogue here; verify saving and reopening separately in the actual editor.", actionLabelKo: "저장 확인 항목 체크", actionLabelEn: "Check Save Guide" },
]);

export const CREATOR_GENRE_OPTIONS: readonly MatcherOptionSpec<CreatorGenreChoice>[] = Object.freeze([
  { id: "romance-campus", labelKo: "로맨스 · 학원", labelEn: "Romance · Campus", hintKo: "투명한 채광과 감정선 중심", hintEn: "Warm daylight & expressive close-ups" },
  { id: "fantasy-action", labelKo: "판타지 · 액션", labelEn: "Fantasy · Action", hintKo: "강한 명암과 역동적 원근 구도", hintEn: "Bold lighting & dynamic perspective" },
  { id: "urban-thriller", labelKo: "현대극 · 스릴러", labelEn: "Urban · Thriller", hintKo: "도시 야경과 날카로운 펜선 대비", hintEn: "Night cityscapes & high-contrast ink" },
  { id: "slice-of-life", labelKo: "일상 · 감성 에세이", labelEn: "Slice of Life · Essay", hintKo: "따뜻한 종이결과 부드러운 수채 톤", hintEn: "Tactile paper grain & soft washes" },
]);

export const CREATOR_GOAL_OPTIONS: readonly MatcherOptionSpec<CreatorGoalChoice>[] = Object.freeze([
  { id: "first-webtoon-episode", labelKo: "첫 컷 · 1화 바로 시작", labelEn: "Start First Cut / Ep.1", hintKo: "빈 컷이나 콘티 레인으로 즉시 착수", hintEn: "Jump into blank cut or storyboard" },
  { id: "character-turnaround", labelKo: "3D 캐릭터 시트 설계", labelEn: "Design 3D Character Sheet", hintKo: "주인공 체형·표정·의상 기준 확정", hintEn: "Lock protagonist scale, poses & look" },
  { id: "team-collab-workflow", labelKo: "어시·팀 가상 합작", labelEn: "Team Virtual Collab", hintKo: "가상 공방에서 컷 분업·실시간 검토", hintEn: "Split cuts cleanly inside Virtual Space" },
  { id: "motion-reels-publish", labelKo: "회차 출고 · 릴스 홍보", labelEn: "Episode Export & Reels", hintKo: "출고 검수와 9:16 홍보 영상 제작", hintEn: "Rights preflight + 9:16 promo reels" },
]);

export const CREATOR_DEVICE_OPTIONS: readonly MatcherOptionSpec<CreatorDeviceChoice>[] = Object.freeze([
  { id: "desktop-pen-tablet", labelKo: "데스크톱 · 펜 타블렛", labelEn: "Desktop + Pen Tablet", hintKo: "정밀 필압 · 단축키 중심 장시간 작화", hintEn: "Full pressure fidelity & shortcuts" },
  { id: "ipad-stylus", labelKo: "태블릿 · 스타일러스", labelEn: "Tablet + Stylus", hintKo: "기울기 음영 · 터치 제스처 드로잉", hintEn: "Tilt shading & touch gesture drawing" },
  { id: "laptop-mouse-trackpad", labelKo: "노트북 · 마우스/트랙패드", labelEn: "Laptop Mouse / Trackpad", hintKo: "선 안정화·QuickShape·3D 가이드 활용", hintEn: "Strong stabilizer, QuickShape & guides" },
  { id: "mobile-thumb", labelKo: "모바일 틈새 콘티", labelEn: "Mobile On-the-Go", hintKo: "한 손 엄지 도크·세로 스크롤 콘티", hintEn: "One-handed thumb dock & vertical cuts" },
]);

export const CREATOR_MEDIUM_OPTIONS: readonly MatcherOptionSpec<CreatorMediumChoice>[] = Object.freeze([
  { id: "gpen-ink", labelKo: "G펜 스틸 잉크", labelEn: "G-Pen Steel Ink", hintKo: "선명한 강약의 정통 웹툰 펜선", hintEn: "Crisp classic webtoon ink variation" },
  { id: "watercolor-sable", labelKo: "세이블 수채 붓", labelEn: "Sable Watercolor", hintKo: "맑은 물번짐과 투명 레이어 채색", hintEn: "Luminous washes & layered wet edges" },
  { id: "oil-impasto", labelKo: "유화 임파스토 나이프", labelEn: "Oil Impasto Knife", hintKo: "두터운 물감 질감과 묵직한 브러시", hintEn: "Rich paint ridge texture & bold strokes" },
  { id: "graphite-pencil", labelKo: "4B 흑연 연필", labelEn: "4B Graphite Pencil", hintKo: "종이결이 살아있는 스케치·콘티감", hintEn: "Tactile graphite grain for sketches" },
  { id: "alcohol-marker", labelKo: "알코올 마커", labelEn: "Alcohol Marker", hintKo: "선명한 셀 채색과 빠른 그라데이션", hintEn: "Clean cel shading & smooth blends" },
  { id: "charcoal-pastel", labelKo: "목탄 · 파스텔", labelEn: "Charcoal & Pastel", hintKo: "거친 입자감과 극적인 흑백 명암", hintEn: "Expressive dry tooth & dramatic tone" },
]);

export const DEFAULT_CREATOR_MATCHER_ANSWERS: CreatorMatcherAnswers = Object.freeze({
  genre: "romance-campus",
  goal: "first-webtoon-episode",
  device: "desktop-pen-tablet",
  medium: "gpen-ink",
});

const BRUSH_CATALOG: Readonly<Record<CreatorMediumChoice, Omit<MatchedBrushSpec, "tipSizePx" | "stabilizationPct"> & { readonly baseTipPx: number }>> = Object.freeze({
  "gpen-ink": { id: "gpen-ink", baseTipPx: 6, labelKo: "G펜 스틸 닙", labelEn: "G-Pen Steel Nib", imageSrc: "/assets/atelier/media/gpen-ink.webp", pressureNoteKo: "필압 15~85% 구간에서 선 굵기가 탄력 있게 벌어지는 정통 만화 닙 세팅", pressureNoteEn: "Classic nib curve opening cleanly across 15–85% stylus pressure" },
  "watercolor-sable": { id: "watercolor-sable", baseTipPx: 24, labelKo: "세이블 수채 붓", labelEn: "Sable Watercolor Brush", imageSrc: "/assets/atelier/media/watercolor-sable.webp", pressureNoteKo: "수분 머금기와 물감 번짐 경계를 살리는 투명 채색 세팅", pressureNoteEn: "Translucent pigment wash with controlled wet edge bloom" },
  "oil-impasto": { id: "oil-impasto", baseTipPx: 28, labelKo: "유화 임파스토 나이프", labelEn: "Oil Impasto Knife", imageSrc: "/assets/atelier/media/oil-impasto.webp", pressureNoteKo: "2.5D 물감 두께와 혼색 끌림을 강조하는 일러스트 페인팅 세팅", pressureNoteEn: "Thick 2.5D impasto ridges with physical pigment drag" },
  "graphite-pencil": { id: "graphite-pencil", baseTipPx: 8, labelKo: "4B 흑연 연필", labelEn: "4B Graphite Pencil", imageSrc: "/assets/atelier/media/graphite-pencil.webp", pressureNoteKo: "펜 기울기로 넓은 음영과 섬세한 스케치 선을 오가는 연필 세팅", pressureNoteEn: "Tilt-responsive shading paired with crisp graphite line tips" },
  "alcohol-marker": { id: "alcohol-marker", baseTipPx: 18, labelKo: "알코올 마커", labelEn: "Alcohol Marker", imageSrc: "/assets/atelier/media/alcohol-marker.webp", pressureNoteKo: "덧칠할수록 자연스럽게 짙어지는 빠른 셀·컬러 러프 세팅", pressureNoteEn: "Fast layered cel coloring with smooth alcohol blend transitions" },
  "charcoal-pastel": { id: "charcoal-pastel", baseTipPx: 16, labelKo: "목탄 · 파스텔", labelEn: "Charcoal & Pastel", imageSrc: "/assets/atelier/media/charcoal-pastel.webp", pressureNoteKo: "거친 종이 요철에 강하게 걸리는 극적 흑백·느와르 톤 세팅", pressureNoteEn: "High-tooth dry pigment ideal for atmospheric contrast" },
});

const PAPER_CATALOG: Readonly<Record<MatchedPaperSpec["id"], MatchedPaperSpec>> = Object.freeze({
  "manga-kent": { id: "manga-kent", labelKo: "만화 켄트지", labelEn: "Manga Kent Sheet", imageSrc: "/assets/atelier/papers/manga-kent.webp", grainStrengthPct: 14, feelNoteKo: "잉크 번짐을 억제해 G펜·마커 선명도를 극대화하는 매끈한 원고지", feelNoteEn: "Smooth low-tooth sheet keeping G-Pen and marker edges razor sharp" },
  "cold-press-watercolor": { id: "cold-press-watercolor", labelKo: "수채 황목지", labelEn: "Cold-Press Cotton Paper", imageSrc: "/assets/atelier/papers/cold-press-watercolor.webp", grainStrengthPct: 58, feelNoteKo: "적당한 요철 골에 물감과 흑연이 자연스럽게 고이는 감성 수채지", feelNoteEn: "Balanced cotton tooth catching washes and pencil grain" },
  "linen-canvas": { id: "linen-canvas", labelKo: "벨기에 린넨 캔버스", labelEn: "Belgian Linen Canvas", imageSrc: "/assets/atelier/papers/linen-canvas.webp", grainStrengthPct: 72, feelNoteKo: "직조 결이 임파스토 붓질과 극적 명암에 회화적 깊이를 더하는 캔버스", feelNoteEn: "Woven linen grain giving painterly depth to impasto lighting" },
  "korean-hanji": { id: "korean-hanji", labelKo: "전통 한지", labelEn: "Korean Hanji Paper", imageSrc: "/assets/atelier/papers/korean-hanji.webp", grainStrengthPct: 46, feelNoteKo: "따뜻한 섬유 결과 은은한 번짐으로 서정적 여백을 살리는 한지", feelNoteEn: "Organic warm mulberry fibers for poetic tone and soft edges" },
});

const BACKGROUND_BY_GENRE: Readonly<Record<CreatorGenreChoice, MatchedBackgroundSpec>> = Object.freeze({
  "romance-campus": { id: "bg-school-hallway", labelKo: "햇살 교실 복도", labelEn: "Sunlit School Hallway", imageSrc: "/assets/atelier/backgrounds/bg-school-hallway.webp", moodLabelKo: "오후 역광 · 청량 로맨스", moodLabelEn: "Afternoon Backlight · Romance" },
  "fantasy-action": { id: "bg-fantasy-courtyard", labelKo: "판타지 성곽 중정", labelEn: "Fantasy Castle Courtyard", imageSrc: "/assets/atelier/backgrounds/bg-fantasy-courtyard.webp", moodLabelKo: "석조 원근 · 장엄 액션", moodLabelEn: "Stone Perspective · Action" },
  "urban-thriller": { id: "bg-seoul-crosswalk", labelKo: "서울 횡단보도 야경", labelEn: "Seoul Crosswalk Night", imageSrc: "/assets/atelier/backgrounds/bg-seoul-crosswalk.webp", moodLabelKo: "도시 네온 · 현대 스릴러", moodLabelEn: "Urban Neon · Thriller" },
  "slice-of-life": { id: "bg-rainy-bookstore", labelKo: "비 오는 골목 서점", labelEn: "Rainy Alley Bookstore", imageSrc: "/assets/atelier/backgrounds/bg-rainy-bookstore.webp", moodLabelKo: "빗방울 난광 · 일상 감성", moodLabelEn: "Warm Rain Glow · Essay" },
});

const SPACE_BY_GENRE: Readonly<Record<CreatorGenreChoice, MatchedSpaceSpec>> = Object.freeze({
  "romance-campus": { id: "rooftop-terrace", labelKo: "노을 루프탑 테라스", labelEn: "Rooftop Terrace", imageSrc: "/assets/atelier/spaces/rooftop-terrace.webp" },
  "fantasy-action": { id: "fantasy-guild-hall", labelKo: "판타지 길드홀", labelEn: "Fantasy Guild Hall", imageSrc: "/assets/atelier/spaces/fantasy-guild-hall.webp" },
  "urban-thriller": { id: "midnight-manga-cafe", labelKo: "심야 만화 북카페", labelEn: "Midnight Manga Café", imageSrc: "/assets/atelier/spaces/midnight-manga-cafe.webp" },
  "slice-of-life": { id: "wood-atelier", labelKo: "목재 웹툰 공방", labelEn: "Wood Atelier", imageSrc: "/assets/atelier/spaces/wood-atelier.webp" },
});

const DEVICE_TUNING: Readonly<Record<CreatorDeviceChoice, { readonly stabilizationPct: number; readonly tipDeltaPx: number; readonly firstCutSec: number; readonly noteKo: string; readonly noteEn: string }>> = Object.freeze({
  "desktop-pen-tablet": { stabilizationPct: 38, tipDeltaPx: 0, firstCutSec: 45, noteKo: "펜 필압 4096단계와 단축키 휠을 활성화해 빠른 선화 리듬을 맞춥니다.", noteEn: "Enables full pen pressure fidelity and rapid shortcut wheel rhythm." },
  "ipad-stylus": { stabilizationPct: 48, tipDeltaPx: 1, firstCutSec: 48, noteKo: "스타일러스 기울기 음영과 2손가락 실행취소·듀얼 휠 UI를 우선 배치합니다.", noteEn: "Prioritizes stylus tilt shading with two-finger undo and dual wheel UI." },
  "laptop-mouse-trackpad": { stabilizationPct: 78, tipDeltaPx: 2, firstCutSec: 54, noteKo: "선 안정화 78%와 QuickShape·3D 투시 가이드를 켜 마우스 작화 부담을 줄입니다.", noteEn: "Raises stabilizer to 78% with QuickShape and 3D guides for pointer drawing." },
  "mobile-thumb": { stabilizationPct: 72, tipDeltaPx: 2, firstCutSec: 50, noteKo: "엄지 도크와 9:16 세로 컷 템플릿, 음성 말풍선 메모 모드로 즉시 전환합니다.", noteEn: "Switches to one-handed thumb dock, 9:16 vertical cuts, and quick balloon notes." },
});

const sanitizeFinite = (value: number, fallback = 0): number => (Number.isFinite(value) ? value : fallback);
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, sanitizeFinite(value, 0)));
const cleanZero = (value: number): number => (value === 0 ? 0 : value);
const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return cleanZero(Math.round(sanitizeFinite(value, 0) * factor) / factor);
};

/** 챕터 ID로 정본 온보딩 디오라마 스펙을 조회한다. */
export function getDioramaChapterById(chapterId: DioramaChapterId): DioramaChapterSpec {
  return ONBOARDING_DIORAMA_CHAPTERS.find((chapter) => chapter.id === chapterId) ?? ONBOARDING_DIORAMA_CHAPTERS[0]!;
}

/** 4장 온보딩 디오라마 상태기계 초기값을 생성한다. */
export function createInitialDioramaState(initialChapterId: DioramaChapterId = "first-cut-desk"): DioramaState {
  const chapter = getDioramaChapterById(initialChapterId);
  const activeIndex = ONBOARDING_DIORAMA_CHAPTERS.findIndex((item) => item.id === chapter.id);
  return {
    activeChapterId: chapter.id,
    activeIndex: activeIndex >= 0 ? activeIndex : 0,
    visitedChapterIds: [chapter.id],
    selectedHotspotId: chapter.hotspots[0]?.hotspotId ?? null,
    autoPlayEnabled: false,
    transitionCount: 0,
    completedAllChapters: false,
    completionRatio: 1 / ONBOARDING_DIORAMA_CHAPTERS.length,
  };
}

/** 4장 인터랙티브 온보딩 디오라마 상태기계를 순수 전이한다. */
export function transitionDioramaChapter(state: DioramaState, action: DioramaTransitionAction): DioramaState {
  const total = ONBOARDING_DIORAMA_CHAPTERS.length;
  if (action.type === "reset") return createInitialDioramaState("first-cut-desk");
  if (action.type === "toggle-autoplay") {
    return { ...state, autoPlayEnabled: typeof action.enabled === "boolean" ? action.enabled : !state.autoPlayEnabled };
  }
  if (action.type === "select-hotspot") {
    const activeChapter = getDioramaChapterById(state.activeChapterId);
    const valid = action.hotspotId !== null && activeChapter.hotspots.some((h) => h.hotspotId === action.hotspotId);
    return { ...state, selectedHotspotId: valid ? action.hotspotId : null };
  }

  let nextIndex = state.activeIndex;
  if (action.type === "select") {
    const idx = ONBOARDING_DIORAMA_CHAPTERS.findIndex((item) => item.id === action.chapterId);
    if (idx >= 0) nextIndex = idx;
  } else if (action.type === "next") {
    nextIndex = (action.wrap ?? true) ? (state.activeIndex + 1) % total : Math.min(total - 1, state.activeIndex + 1);
  } else if (action.type === "prev") {
    nextIndex = (action.wrap ?? true) ? (state.activeIndex - 1 + total) % total : Math.max(0, state.activeIndex - 1);
  }

  const nextChapter = ONBOARDING_DIORAMA_CHAPTERS[nextIndex]!;
  const visited = state.visitedChapterIds.includes(nextChapter.id)
    ? state.visitedChapterIds
    : [...state.visitedChapterIds, nextChapter.id];
  const changed = nextChapter.id !== state.activeChapterId;

  return {
    ...state,
    activeChapterId: nextChapter.id,
    activeIndex: nextIndex,
    visitedChapterIds: visited,
    selectedHotspotId: changed ? (nextChapter.hotspots[0]?.hotspotId ?? null) : state.selectedHotspotId,
    transitionCount: changed ? state.transitionCount + 1 : state.transitionCount,
    completedAllChapters: visited.length >= total,
    completionRatio: roundTo(visited.length / total, 4),
  };
}

/** 클라이언트 포인터 좌표를 컨테이너 기준 [-1, 1] 정규화 좌표로 변환한다. */
export function normalizePointerInRect(
  clientX: number,
  clientY: number,
  rect: DioramaPointerRect,
): { readonly normalizedX: number; readonly normalizedY: number } {
  const safeW = sanitizeFinite(rect.width, 0);
  const safeH = sanitizeFinite(rect.height, 0);
  if (safeW <= 0 || safeH <= 0) return { normalizedX: 0, normalizedY: 0 };
  const relX = (sanitizeFinite(clientX, rect.left) - sanitizeFinite(rect.left, 0)) / safeW;
  const relY = (sanitizeFinite(clientY, rect.top) - sanitizeFinite(rect.top, 0)) / safeH;
  return {
    normalizedX: roundTo(clamp(relX * 2 - 1, -1, 1), 4),
    normalizedY: roundTo(clamp(relY * 2 - 1, -1, 1), 4),
  };
}

function makeLayerOffset(x: number, y: number, shiftPx: number, scale: number, depthFactor: number): DioramaLayerOffset {
  return {
    translateXPx: roundTo(x * shiftPx, 2),
    translateYPx: roundTo(y * shiftPx * 0.85, 2),
    scale,
    depthFactor,
  };
}

const formatLayerCss = (layer: DioramaLayerOffset): string =>
  `translate3d(${layer.translateXPx}px, ${layer.translateYPx}px, 0px) scale(${layer.scale})`;

/**
 * 2.5D 포인터 틸트 패럴랙스 솔버.
 * - `prefersReducedMotion: true` 또는 비활성 포인터일 때는 회전 0deg, 모든 깊이 오프셋 0px로 완전 고정한다.
 */
export function computeDioramaParallax(input: DioramaParallaxInput): DioramaParallaxSolution {
  const profile: DioramaDepthProfile = { ...DEFAULT_DIORAMA_DEPTH_PROFILE, ...input.depthProfile };
  const perspectivePx = Math.max(320, roundTo(profile.perspectivePx, 0));
  const locked = input.prefersReducedMotion || !(input.isPointerActive ?? true);
  const clampedX = locked ? 0 : roundTo(clamp(input.normalizedX, -1, 1), 4);
  const clampedY = locked ? 0 : roundTo(clamp(input.normalizedY, -1, 1), 4);
  const tiltMax = locked ? 0 : clamp(profile.tiltMaxDeg, 0, 18);
  const rotateXDeg = locked ? 0 : roundTo(-clampedY * tiltMax, 2);
  const rotateYDeg = locked ? 0 : roundTo(clampedX * tiltMax, 2);

  const background = makeLayerOffset(clampedX, clampedY, profile.backgroundShiftPx, locked ? 1 : 1.04, -0.6);
  const midground = makeLayerOffset(clampedX, clampedY, profile.midgroundShiftPx, locked ? 1 : 1.015, 0.4);
  const foreground = makeLayerOffset(clampedX, clampedY, profile.foregroundShiftPx, locked ? 1 : 1.01, 1);
  const jewel = makeLayerOffset(clampedX, clampedY, profile.jewelLiftPx, locked ? 1 : 1.03, 1.35);

  return {
    reducedMotionApplied: input.prefersReducedMotion,
    clampedX,
    clampedY,
    perspectivePx,
    rotateXDeg,
    rotateYDeg,
    background,
    midground,
    foreground,
    jewel,
    stageTransformCss: `perspective(${perspectivePx}px) rotateX(${rotateXDeg}deg) rotateY(${rotateYDeg}deg)`,
    backgroundTransformCss: formatLayerCss(background),
    midgroundTransformCss: formatLayerCss(midground),
    foregroundTransformCss: formatLayerCss(foreground),
    jewelTransformCss: formatLayerCss(jewel),
    specularShiftPct: locked
      ? { x: 50, y: 50 }
      : { x: roundTo(50 + clampedX * 28, 1), y: roundTo(50 + clampedY * 24, 1) },
  };
}

function computeSprintPace(
  status: FirstCutSprintState["status"],
  elapsedSec: number,
  completedCount: number,
): FirstCutSprintState["paceRating"] {
  if (status === "idle") return "ready";
  if (elapsedSec > 60) return "overtime";
  if (completedCount > 0 && elapsedSec <= completedCount * 15 - 3) return "ahead";
  return "on-track";
}

/** 60초 첫 컷 체험 시뮬레이터 초기 상태를 생성한다. */
export function createInitialFirstCutSprint(
  initialBalloonKo = "지금, 내 첫 번째 컷이 시작된다!",
): FirstCutSprintState {
  return {
    status: "idle",
    totalBudgetSec: 60,
    elapsedSec: 0,
    remainingSec: 60,
    activeStepIndex: 0,
    completedStepIds: [],
    strokeCount: 0,
    balloonDraftKo: initialBalloonKo,
    canvasPreset: "scroll-9-16",
    savedToLocalDraft: false,
    progressPercent: 0,
    paceRating: "ready",
  };
}

/** 60초 첫 컷 체험 시뮬레이터 상태를 순수 전이한다. */
export function recordFirstCutAction(state: FirstCutSprintState, action: FirstCutSprintAction): FirstCutSprintState {
  const totalSteps = FIRST_CUT_SPRINT_STEPS.length;
  if (action.type === "reset") return { ...createInitialFirstCutSprint(state.balloonDraftKo), canvasPreset: state.canvasPreset };
  if (action.type === "start") {
    return state.status === "completed"
      ? state
      : { ...state, status: "running", paceRating: computeSprintPace("running", state.elapsedSec, state.completedStepIds.length) };
  }
  if (action.type === "set-canvas-preset") return { ...state, canvasPreset: action.preset };
  if (action.type === "set-balloon") return { ...state, balloonDraftKo: action.text };
  if (action.type === "add-stroke") {
    const inc = Math.max(1, Math.round(sanitizeFinite(action.count ?? 1, 1)));
    const nextStatus = state.status === "idle" ? "running" : state.status;
    return { ...state, status: nextStatus, strokeCount: state.strokeCount + inc, paceRating: computeSprintPace(nextStatus, state.elapsedSec, state.completedStepIds.length) };
  }
  if (action.type === "tick") {
    if (state.status === "completed") return state;
    const delta = Math.max(0, roundTo(sanitizeFinite(action.deltaSec, 0), 1));
    const nextElapsed = Math.min(60, roundTo(state.elapsedSec + delta, 1));
    const nextStatus = state.status === "idle" && delta > 0 ? "running" : state.status;
    return { ...state, status: nextStatus, elapsedSec: nextElapsed, remainingSec: Math.max(0, roundTo(60 - nextElapsed, 1)), paceRating: computeSprintPace(nextStatus, nextElapsed, state.completedStepIds.length) };
  }
  if (action.type === "complete-all-instant") {
    const allIds = FIRST_CUT_SPRINT_STEPS.map((s) => s.id);
    const nextElapsed = Math.min(60, Math.max(state.elapsedSec, 48));
    return {
      ...state,
      status: "completed",
      elapsedSec: nextElapsed,
      remainingSec: Math.max(0, roundTo(60 - nextElapsed, 1)),
      activeStepIndex: totalSteps - 1,
      completedStepIds: allIds,
      strokeCount: Math.max(state.strokeCount, 12),
      savedToLocalDraft: false,
      progressPercent: 100,
      paceRating: computeSprintPace("completed", nextElapsed, allIds.length),
    };
  }

  const targetStep =
    (action.stepId ? FIRST_CUT_SPRINT_STEPS.find((s) => s.id === action.stepId) : FIRST_CUT_SPRINT_STEPS[state.activeStepIndex]) ??
    FIRST_CUT_SPRINT_STEPS[0]!;
  const nextCompleted = state.completedStepIds.includes(targetStep.id)
    ? state.completedStepIds
    : [...state.completedStepIds, targetStep.id];
  const spentSec = clamp(roundTo(action.spentSec ?? 12, 1), 1, 20);
  const nextElapsed = Math.min(60, roundTo(state.elapsedSec + spentSec, 1));
  const isAllDone = nextCompleted.length >= totalSteps;
  const nextIncompleteIdx = FIRST_CUT_SPRINT_STEPS.findIndex((s) => !nextCompleted.includes(s.id));
  const nextStatus: FirstCutSprintState["status"] = isAllDone ? "completed" : "running";
  const addedStrokes = targetStep.id === "frame-rough" || targetStep.id === "ink-lineart" ? 4 : 1;

  return {
    ...state,
    status: nextStatus,
    elapsedSec: nextElapsed,
    remainingSec: Math.max(0, roundTo(60 - nextElapsed, 1)),
    activeStepIndex: nextIncompleteIdx >= 0 ? nextIncompleteIdx : totalSteps - 1,
    completedStepIds: nextCompleted,
    strokeCount: state.strokeCount + addedStrokes,
    savedToLocalDraft: false,
    progressPercent: Math.round((nextCompleted.length / totalSteps) * 100),
    paceRating: computeSprintPace(nextStatus, nextElapsed, nextCompleted.length),
  };
}

/** 원문은 제한 없이 보존하고, 지원되는 환경에서 화면상 글자 단위로 센다. */
export function countFirstCutDialogueGraphemes(text: string): number | null {
  if (typeof Intl.Segmenter !== "function") return null;
  return Array.from(new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text)).length;
}

/** 합성 시간 예산과 단계 체크를 요약한다. 실제 원고 완성·저장 결과가 아니다. */
export function summarizeFirstCutSprint(state: FirstCutSprintState): FirstCutSprintSummary {
  const totalSteps = FIRST_CUT_SPRINT_STEPS.length;
  const completedCount = state.completedStepIds.length;
  const completed = state.status === "completed" || completedCount >= totalSteps;
  return {
    scope: "example-only", timeBasis: "synthetic-budget", savedToLocalDraft: false,
    completed,
    elapsedSec: state.elapsedSec,
    completedCount,
    totalSteps,
    strokeCount: state.strokeCount,
    canvasPreset: state.canvasPreset,
    summaryKo: completed
      ? `예제 4단계 체크 · 합성 예산 ${state.elapsedSec}초 · 예제 펜선 ${state.strokeCount}획 · 실제 원고 미저장`
      : `예제 단계 체크 (${completedCount}/${totalSteps}단계 · 합성 예산 ${state.elapsedSec}초 · 실제 원고 미저장)`,
    summaryEn: completed
      ? `4 example steps checked · ${state.elapsedSec}s synthetic budget · ${state.strokeCount} sample strokes · no manuscript saved`
      : `Example steps (${completedCount}/${totalSteps} · ${state.elapsedSec}s synthetic budget · no manuscript saved)`,
  };
}

function resolvePaperForSelection(medium: CreatorMediumChoice, genre: CreatorGenreChoice): MatchedPaperSpec {
  if (medium === "watercolor-sable") return PAPER_CATALOG["cold-press-watercolor"];
  if (medium === "oil-impasto") return PAPER_CATALOG["linen-canvas"];
  if (medium === "charcoal-pastel") return genre === "slice-of-life" ? PAPER_CATALOG["korean-hanji"] : PAPER_CATALOG["linen-canvas"];
  if (medium === "graphite-pencil") return genre === "slice-of-life" ? PAPER_CATALOG["korean-hanji"] : PAPER_CATALOG["cold-press-watercolor"];
  return genre === "slice-of-life" ? PAPER_CATALOG["korean-hanji"] : PAPER_CATALOG["manga-kent"];
}

function resolveWorkspaceRoute(
  goal: CreatorGoalChoice,
  device: CreatorDeviceChoice,
  genre: CreatorGenreChoice,
  medium: CreatorMediumChoice,
): { readonly chapterId: DioramaChapterId; readonly route: MatchedWorkspaceRoute } {
  if (goal === "character-turnaround") {
    return {
      chapterId: "character-sculpt",
      route: { path: "/studio/assets/characters/new", fullHref: `/studio/assets/characters/new?genre=${genre}&preset=${medium}`, labelKo: "3D 캐릭터 셰이퍼", labelEn: "3D Character Shaper", ctaKo: "맞춤 3D 캐릭터 시트 시작", ctaEn: "Open 3D Character Shaper", queryParams: { genre, preset: medium } },
    };
  }
  if (goal === "team-collab-workflow") {
    return {
      chapterId: "virtual-collab",
      route: { path: "/studio/space", fullHref: `/studio/space?genre=${genre}&device=${device}`, labelKo: "가상 협업 스튜디오", labelEn: "Virtual Collab Studio", ctaKo: "맞춤 가상 공방 입장", ctaEn: "Enter Virtual Collab Space", queryParams: { genre, device } },
    };
  }
  if (goal === "motion-reels-publish") {
    return {
      chapterId: "episode-publish",
      route: { path: "/studio/motion-webtoon", fullHref: `/studio/motion-webtoon?genre=${genre}&format=reels-9-16`, labelKo: "모션 웹툰 · 출고 릴스", labelEn: "Motion Webtoon & Reels", ctaKo: "출고·9:16 릴스 스튜디오 열기", ctaEn: "Open Publish & Reels Studio", queryParams: { genre, format: "reels-9-16" } },
    };
  }
  const lane = device === "mobile-thumb" || device === "laptop-mouse-trackpad" ? "storyboard" : "blank";
  return {
    chapterId: "first-cut-desk",
    route: {
      path: "/studio/new",
      fullHref: `/studio/new?lane=${lane}&genre=${genre}&brush=${medium}`,
      labelKo: lane === "storyboard" ? "스토리보드 · 콘티 레인" : "빈 컷 드로잉 레인",
      labelEn: lane === "storyboard" ? "Storyboard Lane" : "Blank Cut Drawing Lane",
      ctaKo: "처방 세팅으로 첫 컷 열기",
      ctaEn: "Launch First Cut With Preset",
      queryParams: { lane, genre, brush: medium },
    },
  };
}

function resolveArchetype(answers: CreatorMatcherAnswers): { readonly id: string; readonly titleKo: string; readonly titleEn: string } {
  if (answers.goal === "character-turnaround") return { id: "character-architect", titleKo: "입체 캐릭터 설계형 아틀리에", titleEn: "3D Character Architect Atelier" };
  if (answers.goal === "team-collab-workflow") return { id: "ensemble-director", titleKo: "팀 분업 프로덕션 디렉터", titleEn: "Ensemble Production Director" };
  if (answers.goal === "motion-reels-publish") return { id: "episode-showrunner", titleKo: "연재 출고 · 릴스 쇼러너", titleEn: "Episode & Reels Showrunner" };
  if (answers.genre === "fantasy-action") return { id: "kinetic-action-inker", titleKo: "역동 원근 액션 컷 빌더", titleEn: "Kinetic Action Cut Builder" };
  if (answers.genre === "urban-thriller") return { id: "noir-contrast-craftsman", titleKo: "고대비 도시 느와르 작화가", titleEn: "High-Contrast Urban Noir Crafter" };
  if (answers.genre === "slice-of-life") return { id: "tactile-essay-painter", titleKo: "손맛 종이결 감성 에세이 작가", titleEn: "Tactile Paper Essay Illustrator" };
  return { id: "luminous-romance-storyteller", titleKo: "채광 감정선 로맨스 스토리텔러", titleEn: "Luminous Romance Storyteller" };
}

/** 창작자 성향 4문항(장르·목표·기기·선호 화구)을 분석해 맞춤 스타터 처방을 생성한다. */
export function matchCreatorStarterPrescription(answers: CreatorMatcherAnswers): CreatorStarterPrescription {
  const { baseTipPx, ...brushMeta } = BRUSH_CATALOG[answers.medium];
  const paper = resolvePaperForSelection(answers.medium, answers.genre);
  const background = BACKGROUND_BY_GENRE[answers.genre];
  const space = SPACE_BY_GENRE[answers.genre];
  const tuning = DEVICE_TUNING[answers.device];
  const target = resolveWorkspaceRoute(answers.goal, answers.device, answers.genre, answers.medium);
  const archetype = resolveArchetype(answers);

  const brush: MatchedBrushSpec = {
    ...brushMeta,
    tipSizePx: baseTipPx + tuning.tipDeltaPx,
    stabilizationPct: tuning.stabilizationPct,
  };

  const genreMediumBonus =
    (answers.genre === "romance-campus" && (answers.medium === "gpen-ink" || answers.medium === "watercolor-sable")) ||
    (answers.genre === "fantasy-action" && (answers.medium === "oil-impasto" || answers.medium === "gpen-ink")) ||
    (answers.genre === "urban-thriller" && (answers.medium === "charcoal-pastel" || answers.medium === "gpen-ink")) ||
    (answers.genre === "slice-of-life" && (answers.medium === "watercolor-sable" || answers.medium === "graphite-pencil" || answers.medium === "alcohol-marker"))
      ? 8
      : 4;
  const deviceBonus = answers.device === "desktop-pen-tablet" || answers.device === "ipad-stylus" ? 4 : 2;
  const fitScorePct = Math.min(98, 86 + genreMediumBonus + deviceBonus);

  return {
    archetypeId: archetype.id,
    archetypeTitleKo: archetype.titleKo,
    archetypeTitleEn: archetype.titleEn,
    rationaleKo: `${background.labelKo} 무드에 ${brush.labelKo}(${brush.tipSizePx}px · 보정 ${brush.stabilizationPct}%)와 ${paper.labelKo} 질감을 조합했습니다. ${target.route.labelKo}로 진입하면 바로 첫 작업을 시작할 수 있습니다.`,
    rationaleEn: `Pairs ${brush.labelEn} (${brush.tipSizePx}px, ${brush.stabilizationPct}% stab.) and ${paper.labelEn} with ${background.labelEn}, launching directly into ${target.route.labelEn}.`,
    fitScorePct,
    brush,
    paper,
    background,
    space,
    recommendedChapterId: target.chapterId,
    workspaceRoute: target.route,
    deviceOptimizationKo: tuning.noteKo,
    deviceOptimizationEn: tuning.noteEn,
    estimatedFirstCutSec: tuning.firstCutSec,
    checklistKo: [
      `${brush.labelKo} ${brush.tipSizePx}px · 손떨림 보정 ${brush.stabilizationPct}% 자동 적용`,
      `${paper.labelKo}(요철 ${paper.grainStrengthPct}%) + ${background.labelKo} 레이어 준비`,
      `${target.route.labelKo}(${target.route.path}) 즉시 진입 및 OPFS 초안 활성화`,
    ],
    checklistEn: [
      `Auto-load ${brush.labelEn} (${brush.tipSizePx}px, ${brush.stabilizationPct}% stab.)`,
      `Stage ${paper.labelEn} (${paper.grainStrengthPct}% grain) + ${background.labelEn}`,
      `Open ${target.route.labelEn} (${target.route.path}) with local OPFS draft`,
    ],
  };
}

/** 온보딩 디오라마·매처가 참조하는 모든 실존 `/assets/atelier/` WebP 자산 경로를 수집한다. */
export function collectAllOnboardingAtelierAssetPaths(): readonly string[] {
  const uniquePaths = new Set<string>();
  for (const chapter of ONBOARDING_DIORAMA_CHAPTERS) {
    uniquePaths.add(chapter.dioramaImageSrc);
    uniquePaths.add(chapter.jewelImageSrc);
    uniquePaths.add(chapter.ambientPaperSrc);
  }
  for (const brush of Object.values(BRUSH_CATALOG)) uniquePaths.add(brush.imageSrc);
  for (const paper of Object.values(PAPER_CATALOG)) uniquePaths.add(paper.imageSrc);
  for (const bg of Object.values(BACKGROUND_BY_GENRE)) uniquePaths.add(bg.imageSrc);
  for (const space of Object.values(SPACE_BY_GENRE)) uniquePaths.add(space.imageSrc);
  return Array.from(uniquePaths);
}
