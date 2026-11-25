/**
 * 홈 라이브 아틀리에 쇼케이스 2차 연출 순수 상태·데이터 엔진 (Wave 49B).
 *
 * - 4단계 라인→완성 커튼 모델 (0~25% 러프 콘티 · 25~50% G펜 선화 · 50~75% 베이스·수채 채색 · 75~100% 조명·말풍선 완성)
 * - 5대 탈-바이올렛 도메인 안료 라이브 스위처 (draw 28° · 3d 245° · character 72° · market 158° · collab 198°)
 * - 첫 방문자 3버튼 맞춤 작업실 필터 (혼자 연재 · 팀 분업 · 3D 배경 중심)
 *
 * 모든 색상은 OKLCH 스펙트럼 안료 토큰만 참조하며 원시 hex/rgb/hsl 및 바이올렛 휴(270~320°)를 배제한다.
 */

export type CurtainStageId = "rough" | "ink" | "color" | "finish";
export type HomePigmentMoodId = "draw" | "3d" | "character" | "market" | "collab";
export type StudioTailorModeId = "solo" | "team" | "scene3d";

export interface PipelineCurtainStage {
  readonly id: CurtainStageId;
  readonly index: 0 | 1 | 2 | 3;
  readonly stepCode: "01" | "02" | "03" | "04";
  readonly minPercent: number;
  readonly maxPercent: number;
  readonly snapPercent: number;
  readonly rangeLabel: string;
  readonly moodId: HomePigmentMoodId;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly routeHref: string;
  readonly routeLabelKo: string;
  readonly routeLabelEn: string;
}

export interface CurtainStageResolution {
  readonly percent: number;
  readonly stage: PipelineCurtainStage;
  readonly stageIndex: 0 | 1 | 2 | 3;
  readonly inkLayerOpacity: number;
  readonly colorLayerOpacity: number;
  readonly finishLayerOpacity: number;
}

export interface HomePigmentMood {
  readonly id: HomePigmentMoodId;
  readonly hueDeg: number;
  readonly pigmentVar: string;
  readonly softVar: string;
  readonly borderVar: string;
  readonly onVar: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly domainKo: string;
  readonly domainEn: string;
  readonly noteKo: string;
  readonly noteEn: string;
  readonly ctaHref: string;
  readonly ctaLabelKo: string;
  readonly ctaLabelEn: string;
}

export interface StudioTailorTool {
  readonly id: string;
  readonly domain: HomePigmentMoodId;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly shortcutKo: string;
  readonly shortcutEn: string;
  readonly href: string;
}

export interface StudioTailorMode {
  readonly id: StudioTailorModeId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly taglineKo: string;
  readonly taglineEn: string;
  readonly highlightMood: HomePigmentMoodId;
  readonly tools: readonly [StudioTailorTool, StudioTailorTool, StudioTailorTool];
}

export const DEFAULT_CURTAIN_PERCENT = 62;
export const CURTAIN_KEYBOARD_STEP = 5;
export const CURTAIN_KEYBOARD_LARGE_STEP = 25;
export const DEFAULT_HOME_PIGMENT_MOOD: HomePigmentMoodId = "draw";
export const DEFAULT_STUDIO_TAILOR_MODE: StudioTailorModeId = "solo";

export const PIPELINE_CURTAIN_STAGES: readonly [
  PipelineCurtainStage,
  PipelineCurtainStage,
  PipelineCurtainStage,
  PipelineCurtainStage,
] = [
  {
    id: "rough", index: 0, stepCode: "01", minPercent: 0, maxPercent: 25, snapPercent: 14, rangeLabel: "0–25%", moodId: "character",
    titleKo: "러프 콘티", titleEn: "Rough Storyboard",
    summaryKo: "파란 연필 구도와 컷 리듬으로 한 화의 흐름을 먼저 세워요.",
    summaryEn: "Block panel rhythm, eye flow, and blue-pencil gestures first.",
    routeHref: "/story-lab", routeLabelKo: "스토리·콘티 연구실 열기", routeLabelEn: "Open Story & Beat Lab",
  },
  {
    id: "ink", index: 1, stepCode: "02", minPercent: 25, maxPercent: 50, snapPercent: 38, rangeLabel: "25–50%", moodId: "draw",
    titleKo: "G펜 선화", titleEn: "G-Pen Inking",
    summaryKo: "탄성 필압과 선 보정으로 또렷한 먹선 강약을 뽑아내요.",
    summaryEn: "Draw crisp variable-width G-pen contours with natural nib taper.",
    routeHref: "/studio/canvas", routeLabelKo: "G펜 선화 캔버스 열기", routeLabelEn: "Open G-Pen Canvas",
  },
  {
    id: "color", index: 2, stepCode: "03", minPercent: 50, maxPercent: 75, snapPercent: 62, rangeLabel: "50–75%", moodId: "market",
    titleKo: "베이스·수채 채색", titleEn: "Base & Watercolor",
    summaryKo: "밑색과 감산 분광 수채를 겹쳐 탁함 없이 맑은 색층을 올려요.",
    summaryEn: "Layer flats and subtractive watercolor washes without muddy grays.",
    routeHref: "/studio/new?lane=blank", routeLabelKo: "수채 안료 캔버스 시작", routeLabelEn: "Start Watercolor Canvas",
  },
  {
    id: "finish", index: 3, stepCode: "04", minPercent: 75, maxPercent: 100, snapPercent: 92, rangeLabel: "75–100%", moodId: "3d",
    titleKo: "조명·말풍선 완성", titleEn: "Lighting & Balloons",
    summaryKo: "역광 글레이즈와 말풍선 식자까지 원고 한 컷을 바로 마감해요.",
    summaryEn: "Finish the panel with directional rim light and crisp balloons.",
    routeHref: "/studio/comic", routeLabelKo: "컷툰·말풍선 편집기 열기", routeLabelEn: "Open Comic & Balloon Editor",
  },
] as const;

function makeMood(
  id: HomePigmentMoodId,
  l: number,
  c: number,
  hueDeg: number,
  copy: Omit<HomePigmentMood, "id" | "hueDeg" | "pigmentVar" | "softVar" | "borderVar" | "onVar">,
): HomePigmentMood {
  const token = `--spectrum-pigment-${id}`;
  const oklch = `${l} ${c} ${hueDeg}`;
  return {
    id,
    hueDeg,
    pigmentVar: `var(${token}, oklch(${oklch}))`,
    softVar: `var(${token}-soft, oklch(${oklch} / 0.14))`,
    borderVar: `var(${token}-border, oklch(${oklch} / 0.38))`,
    onVar: `var(${token}-on, oklch(0.145 0.005 65))`,
    ...copy,
  };
}

export const HOME_PIGMENT_MOODS: readonly [
  HomePigmentMood,
  HomePigmentMood,
  HomePigmentMood,
  HomePigmentMood,
  HomePigmentMood,
] = [
  makeMood("draw", 0.715, 0.165, 28, {
    nameKo: "버밀리온 주홍", nameEn: "Vermilion Red", domainKo: "드로잉", domainEn: "Drawing",
    noteKo: "선화와 분광 수채 작업실의 시그니처 주홍 안료 톤",
    noteEn: "Signature vermilion pigment tuned for G-pen ink and spectral paint",
    ctaHref: "/studio/new?lane=blank", ctaLabelKo: "드로잉 캔버스 바로 열기", ctaLabelEn: "Open Drawing Canvas",
  }),
  makeMood("3d", 0.74, 0.135, 245, {
    nameKo: "코발트", nameEn: "Cobalt Blue", domainKo: "3D 배경", domainEn: "3D Sets",
    noteKo: "3D 투시·카메라 구도·시간대 조명을 잡는 울트라마린 톤",
    noteEn: "Cobalt ultramarine focus for 3D sets, camera angles, and lighting",
    ctaHref: "/studio/bg3d", ctaLabelKo: "3D 배경 스튜디오 바로 열기", ctaLabelEn: "Open 3D Set Studio",
  }),
  makeMood("character", 0.79, 0.158, 72, {
    nameKo: "앰버 골드", nameEn: "Amber Gold", domainKo: "캐릭터", domainEn: "Character",
    noteKo: "인물 표정·포즈·설정 시트에 온기를 더하는 앰버 골드 톤",
    noteEn: "Warm amber-gold palette for character sheets, expressions, and poses",
    ctaHref: "/studio/assets/characters/new", ctaLabelKo: "3D 캐릭터 제작 열기", ctaLabelEn: "Open 3D Character Builder",
  }),
  makeMood("market", 0.765, 0.155, 158, {
    nameKo: "비리디언 에메랄드", nameEn: "Viridian Emerald", domainKo: "소재/출고", domainEn: "Assets & Export",
    noteKo: "상업용 소재 탐색과 라이선스 출고 점검을 위한 에메랄드 톤",
    noteEn: "Viridian emerald tone for licensed assets and export preflight",
    ctaHref: "/market", ctaLabelKo: "소재 마켓·출고 둘러보기", ctaLabelEn: "Explore Asset Market",
  }),
  makeMood("collab", 0.78, 0.125, 198, {
    nameKo: "틸 시안", nameEn: "Teal Cyan", domainKo: "팀 검수", domainEn: "Team Review",
    noteKo: "어시스턴트 분업·핀 코멘트·마감 검수를 돕는 틸 시안 톤",
    noteEn: "Teal-cyan clarity for assistant handoffs and episode reviews",
    ctaHref: "/production", ctaLabelKo: "팀 제작·검수 허브 열기", ctaLabelEn: "Open Team Review Hub",
  }),
] as const;

export const STUDIO_TAILOR_MODES: readonly [StudioTailorMode, StudioTailorMode, StudioTailorMode] = [
  {
    id: "solo", labelKo: "혼자 연재", labelEn: "Solo creator", highlightMood: "draw",
    taglineKo: "콘티부터 선화·채색·말풍선까지 한 작업실에서 끊김 없이 끝내는 1인 연재 동선",
    taglineEn: "One seamless browser desk from rough beats through ink, color, and balloons",
    tools: [
      { id: "solo-canvas", domain: "draw", titleKo: "G펜 · 분광 수채 캔버스", titleEn: "G-Pen & Spectral Canvas", detailKo: "설치 없이 바로 선을 긋고 감산 수채로 채색해요.", detailEn: "Start drawing immediately with G-pen pressure and subtractive paint.", shortcutKo: "단축 동선 · 새 캔버스", shortcutEn: "Fast track · Blank canvas", href: "/studio/new?lane=blank" },
      { id: "solo-story", domain: "character", titleKo: "스토리 · 콘티 연구실", titleEn: "Story & Beat Lab", detailKo: "화별 사건과 대사 호흡을 컷 단위로 정리해요.", detailEn: "Shape episode beats and dialogue pacing cut by cut.", shortcutKo: "단축 동선 · 1화 콘티", shortcutEn: "Fast track · Ep. 1 beats", href: "/story-lab" },
      { id: "solo-comic", domain: "market", titleKo: "컷툰 · 출고 마감", titleEn: "Comic & Export Finish", detailKo: "말풍선 식자와 연재 규격 내보내기를 한 번에 마쳐요.", detailEn: "Letter balloons and export episode strips in one pass.", shortcutKo: "단축 동선 · 마감 편집", shortcutEn: "Fast track · Comic editor", href: "/studio/comic" },
    ],
  },
  {
    id: "team", labelKo: "팀 분업", labelEn: "Team workflow", highlightMood: "collab",
    taglineKo: "선화·밑색·배경·검수 담당자가 한 회차 보드에서 마감과 수정 핀을 나누는 동선",
    taglineEn: "Coordinate line art, flats, sets, and review pins on one shared board",
    tools: [
      { id: "team-production", domain: "collab", titleKo: "협업 제작 허브", titleEn: "Team Production Hub", detailKo: "담당자 배정·회차 일정·검수 상태를 한눈에 정리해요.", detailEn: "Track owners, deadlines, and review handoffs per episode.", shortcutKo: "단축 동선 · 분업 보드", shortcutEn: "Fast track · Team board", href: "/production" },
      { id: "team-space", domain: "3d", titleKo: "가상 협업 스튜디오", titleEn: "Virtual Co-Work Studio", detailKo: "팀원과 같은 공간에서 원고 시안을 보며 피드백해요.", detailEn: "Gather in a shared studio space to review pages live.", shortcutKo: "단축 동선 · 스튜디오 입장", shortcutEn: "Fast track · Enter room", href: "/studio/space" },
      { id: "team-sample", domain: "market", titleKo: "샘플 분업 프로젝트", titleEn: "Sample Team Project", detailKo: "실제 연재 팀의 단계별 핸드오프 보드를 먼저 살펴봐요.", detailEn: "Explore a live multi-role episode board before setup.", shortcutKo: "단축 동선 · 샘플 보기", shortcutEn: "Fast track · Live sample", href: "/production/projects/sample-project/overview" },
    ],
  },
  {
    id: "scene3d", labelKo: "3D 배경 중심", labelEn: "3D sets & poses", highlightMood: "3d",
    taglineKo: "까다로운 투시와 반복 배경·인물 포즈를 3D 앵글로 잡고 선화로 뽑는 동선",
    taglineEn: "Block complex angles and character poses in 3D, then extract clean lines",
    tools: [
      { id: "scene3d-bg", domain: "3d", titleKo: "3D 배경 스튜디오", titleEn: "3D Background Studio", detailKo: "카메라 구도·시간대 조명·선화 추출을 한곳에서 다뤄요.", detailEn: "Frame cameras, tune daylight moods, and bake clean line art.", shortcutKo: "단축 동선 · 배경 구도", shortcutEn: "Fast track · Frame set", href: "/studio/bg3d" },
      { id: "scene3d-character", domain: "character", titleKo: "3D 캐릭터 만들기", titleEn: "3D Character Builder", detailKo: "프리셋 인물로 표정과 의상 실루엣을 빠르게 맞춰요.", detailEn: "Shape preset character faces, outfits, and silhouettes fast.", shortcutKo: "단축 동선 · 인물 설정", shortcutEn: "Fast track · Build cast", href: "/studio/assets/characters/new" },
      { id: "scene3d-poser", domain: "draw", titleKo: "3D 포즈 스튜디오", titleEn: "3D Pose Studio", detailKo: "컷별 역동적 동세와 시선 각도를 관절로 미세 조율해요.", detailEn: "Fine-tune dynamic gestures and gaze angles on a 3D rig.", shortcutKo: "단축 동선 · 포즈 조율", shortcutEn: "Fast track · Pose rig", href: "/studio/poser" },
    ],
  },
] as const;

const MOOD_BY_ID: Readonly<Record<HomePigmentMoodId, HomePigmentMood>> = {
  draw: HOME_PIGMENT_MOODS[0],
  "3d": HOME_PIGMENT_MOODS[1],
  character: HOME_PIGMENT_MOODS[2],
  market: HOME_PIGMENT_MOODS[3],
  collab: HOME_PIGMENT_MOODS[4],
};

const TAILOR_BY_ID: Readonly<Record<StudioTailorModeId, StudioTailorMode>> = {
  solo: STUDIO_TAILOR_MODES[0],
  team: STUDIO_TAILOR_MODES[1],
  scene3d: STUDIO_TAILOR_MODES[2],
};

export function clampCurtainPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CURTAIN_PERCENT;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

export function resolveCurtainStage(rawPercent: number): CurtainStageResolution {
  const percent = clampCurtainPercent(rawPercent);
  const stageIndex: 0 | 1 | 2 | 3 = percent < 25 ? 0 : percent < 50 ? 1 : percent < 75 ? 2 : 3;
  const stage = PIPELINE_CURTAIN_STAGES[stageIndex];
  return {
    percent,
    stage,
    stageIndex,
    inkLayerOpacity: percent <= 4 ? 0 : clampUnit((percent - 4) / 22),
    colorLayerOpacity: percent < 35 ? 0 : clampUnit((percent - 35) / 25),
    finishLayerOpacity: percent < 65 ? 0 : clampUnit((percent - 65) / 20),
  };
}

export function stepCurtainPercent(currentPercent: number, key: string, shiftKey = false): number | null {
  const current = clampCurtainPercent(currentPercent);
  const delta = shiftKey ? CURTAIN_KEYBOARD_LARGE_STEP : CURTAIN_KEYBOARD_STEP;
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return clampCurtainPercent(current - delta);
    case "ArrowRight":
    case "ArrowUp":
      return clampCurtainPercent(current + delta);
    case "PageDown":
      return clampCurtainPercent(current - CURTAIN_KEYBOARD_LARGE_STEP);
    case "PageUp":
      return clampCurtainPercent(current + CURTAIN_KEYBOARD_LARGE_STEP);
    case "Home":
      return 0;
    case "End":
      return 100;
    default:
      return null;
  }
}

export function resolveHomePigmentMood(id: HomePigmentMoodId): HomePigmentMood {
  return MOOD_BY_ID[id];
}

export function buildPigmentMoodStyle(id: HomePigmentMoodId): Readonly<Record<string, string>> {
  const mood = resolveHomePigmentMood(id);
  return {
    "--hwow-active-pigment": mood.pigmentVar,
    "--hwow-active-pigment-soft": mood.softVar,
    "--hwow-active-pigment-border": mood.borderVar,
    "--hwow-active-pigment-on": mood.onVar,
  };
}

export function resolveStudioTailorMode(id: StudioTailorModeId): StudioTailorMode {
  return TAILOR_BY_ID[id];
}
