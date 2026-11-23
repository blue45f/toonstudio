/**
 * 툰스튜디오 아카데미 커리큘럼 · 레이어 X-Ray 원고 해부실 · 목적별 역색인 처방전 · 단축키 리듬 트레이너.
 *
 * - 6단계 비주얼 스킬 트리(`ACADEMY_SKILL_TRACKS`) + 선행 트랙 해금/진도 계산기
 * - 8층 레이어 X-Ray 원고 해부실(`XRAY_MANUSCRIPT_LAYERS`) + 실시간 가시 레이어 스택 요약
 * - 목적별 역색인 처방전 8종(`GOAL_FIRST_RECIPES`) + 키워드/직군 즉시 매칭 검색기
 * - 단축키 리듬 트레이너 4종(`SHORTCUT_RHYTHM_DRILLS`) + BPM·콤보 평가기
 */

import {
  ACADEMY_ROLES_SPRITE_PATHS,
  type ShortcutMigrationPresetId,
  type StudioCreatorRoleId,
} from "./studio-role-catalog";
import type { PipelineStageId } from "./studio-governance-catalog";

export interface AcademySkillTrack {
  readonly id: string;
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly titleKo: string;
  readonly subtitleKo: string;
  readonly estimatedMinutes: number;
  readonly prerequisiteTrackIds: readonly string[];
  readonly targetRoles: readonly StudioCreatorRoleId[];
  readonly spritePath: string;
  readonly missionsKo: readonly string[];
  readonly unlockedCapabilityKo: string;
}

export const ACADEMY_SKILL_TRACKS: readonly AcademySkillTrack[] = Object.freeze([
  {
    id: "track-1-first-cut",
    level: 1,
    titleKo: "Lv.1 첫 웹툰 컷 30분 완주",
    subtitleKo: "캔버스 열기 → G펜 한 획 → 참조 채우기 → 말풍선까지 한 번에 익힙니다.",
    estimatedMinutes: 30,
    prerequisiteTrackIds: [],
    targetRoles: ["storyboard", "lineart", "lettering"],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemStudio,
    missionsKo: [
      "필압 커브 3초 보정 후 인물 실루엣 한 획 그리기",
      "참조 레이어 지정 뒤 원클릭 밑색 채우기",
      "말풍선 1개 배치하고 세로 스크롤 미리보기 확인",
    ],
    unlockedCapabilityKo: "1인 솔로 빠른 시작 프리셋 & 첫 컷 즉시 내보내기",
  },
  {
    id: "track-2-line-and-form",
    level: 2,
    titleKo: "Lv.2 벡터 선화 · 닫힌 영역 마스터",
    subtitleKo: "교차 선 정리, 강약 리듬, 밑색이 새지 않는 0틈새 선화를 훈련합니다.",
    estimatedMinutes: 45,
    prerequisiteTrackIds: ["track-1-first-cut"],
    targetRoles: ["lineart", "character3d"],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolGpen,
    missionsKo: [
      "벡터 교차 지우개로 삐져나온 선 10초 클린업",
      "열린 선화 틈새 자동 하이라이트로 0건 봉합 통과",
      "캐릭터 근경/중경/원경 3단계 선 굵기 대비 적용",
    ],
    unlockedCapabilityKo: "선화→밑색 원클릭 바통 터치 게이트 자동 통과",
  },
  {
    id: "track-3-color-and-light",
    level: 3,
    titleKo: "Lv.3 바이블 팔레트 · 키라이트 채색",
    subtitleKo: "캐릭터 바이블 컬러 고정, 클리핑 셀 명암, 수채 글레이징 입체감을 익힙니다.",
    estimatedMinutes: 50,
    prerequisiteTrackIds: ["track-2-line-and-form"],
    targetRoles: ["flatting", "shading", "vfx"],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolWatercolor,
    missionsKo: [
      "캐릭터 바이블 팔레트 스포이드로 밑색 95%+ 일치",
      "곱하기(Multiply) 그림자 + 림라이트 역광 2단 분리",
      "장면 시간대(낮/노을/야경) 색온도 필터 일괄 통일",
    ],
    unlockedCapabilityKo: "캐릭터 바이블 자동 색감 검증 & 시퀀스 팔레트 동기화",
  },
  {
    id: "track-4-bg3d-vrm-stage",
    level: 4,
    titleKo: "Lv.4 3D 배경 · VRM 무대 연출",
    subtitleKo: "3D 건축 소실점, LT 배경 선화 추출, VRM 42-소켓 자연 밀착을 실전 적용합니다.",
    estimatedMinutes: 55,
    prerequisiteTrackIds: ["track-2-line-and-form"],
    targetRoles: ["stage3d", "character3d"],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolBg3d,
    missionsKo: [
      "콘티 컷 앵글에 맞춰 3D 카메라 화각·Z-Depth 안개 설정",
      "LT 추출 선 굵기를 캐릭터 본선화와 동일 비율로 정렬",
      "VRM 42-소켓에 소품·의상 Anti-Clip 밀착 배치",
    ],
    unlockedCapabilityKo: "3D 배경→2D 선화 원고 일체화 파이프라인 해금",
  },
  {
    id: "track-5-scroll-sfx-loc",
    level: 5,
    titleKo: "Lv.5 세로 리듬 · 식자 · 글로벌 번역 · 숏폼",
    subtitleKo: "모바일 390px 시선 동선, 곡선 의성어, 다국어 슬롯, Remotion 15초 예고편까지 완주합니다.",
    estimatedMinutes: 45,
    prerequisiteTrackIds: ["track-3-color-and-light"],
    targetRoles: ["lettering", "localization", "video"],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolBubbleSfx,
    missionsKo: [
      "모바일 16pt+ 말풍선 계층과 인물 시선 회피 배치",
      "한국어 원고를 EN/JP 비파괴 번역 슬롯으로 전환·넘침 0건",
      "명장면 5컷으로 9:16 Remotion 세로 숏폼 예고편 생성",
    ],
    unlockedCapabilityKo: "글로벌 동시 연재 슬롯 & 숏폼 프로모션 자동 패키징",
  },
  {
    id: "track-6-studio-pipeline",
    level: 6,
    titleKo: "Lv.6 8단계 팀 분업 · 바통 터치 · Rights BOM",
    subtitleKo: "스튜디오 8단계 바통 터치, 외주 3~5컷 샌드박스, SLA 병목 해소 및 정산 원장을 마스터합니다.",
    estimatedMinutes: 60,
    prerequisiteTrackIds: ["track-4-bg3d-vrm-stage", "track-5-scroll-sfx-loc"],
    targetRoles: ["producer", "story"],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemProduction,
    missionsKo: [
      "5대 검수 게이트 통과 후 이전 공정 Read-Only 잠금 바통 터치 실행",
      "외주 4컷 샌드박스 워터마크 반출 및 반입 BOM 0누락 검증",
      "마감 SLA 병목 경보 확인 후 컷 재배치·원고료 정산 원장 확정",
    ],
    unlockedCapabilityKo: "스튜디오·에이전시·연합 룸 프로덕션 컨트롤 타워 마스터",
  },
]);

export interface AcademySkillTreeProgress {
  readonly completedCount: number;
  readonly totalTracks: number;
  readonly completionPercent: number;
  readonly unlockedTrackIds: readonly string[];
  readonly nextRecommendedTrackId: string | null;
  readonly totalRemainingMinutes: number;
}

export function computeAcademySkillTreeProgress(
  completedTrackIds: readonly string[],
): AcademySkillTreeProgress {
  const completed = new Set(completedTrackIds);
  const unlockedTrackIds: string[] = [];
  let totalRemainingMinutes = 0;

  for (const track of ACADEMY_SKILL_TRACKS) {
    const prereqsMet = track.prerequisiteTrackIds.every((id) => completed.has(id));
    if (prereqsMet) unlockedTrackIds.push(track.id);
    if (!completed.has(track.id)) totalRemainingMinutes += track.estimatedMinutes;
  }

  const completedCount = ACADEMY_SKILL_TRACKS.filter((t) => completed.has(t.id)).length;
  const nextRecommendedTrack =
    ACADEMY_SKILL_TRACKS.find(
      (track) => !completed.has(track.id) && unlockedTrackIds.includes(track.id),
    ) ?? null;

  return {
    completedCount,
    totalTracks: ACADEMY_SKILL_TRACKS.length,
    completionPercent: Math.round((completedCount / ACADEMY_SKILL_TRACKS.length) * 100),
    unlockedTrackIds,
    nextRecommendedTrackId: nextRecommendedTrack?.id ?? null,
    totalRemainingMinutes,
  };
}

export interface XrayManuscriptLayer {
  readonly id: string;
  readonly floorNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly layerCode: string;
  readonly titleKo: string;
  readonly ownerStageId: PipelineStageId;
  readonly blendMode: "normal" | "multiply" | "screen" | "overlay";
  readonly defaultOpacityPercent: number;
  readonly exportIncluded: boolean;
  readonly anatomyInsightKo: string;
  readonly commonMistakeKo: string;
  readonly spritePath: string;
}

/** 8층 레이어 X-Ray 원고 해부실(하단 1층 배경 원판 → 최상단 8층 식자·번역). */
export const XRAY_MANUSCRIPT_LAYERS: readonly XrayManuscriptLayer[] = Object.freeze([
  {
    id: "xray-1-bg3d",
    floorNumber: 1,
    layerCode: "01_BG3D_STAGE_RENDER",
    titleKo: "1층 · 3D 배경 원판 & Z-Depth 안개",
    ownerStageId: "bg3d-vrm",
    blendMode: "normal",
    defaultOpacityPercent: 100,
    exportIncluded: true,
    anatomyInsightKo: "원근 깊이 안개(Z-Depth)를 미리 깔아 인물과 배경의 채도 분리를 확보합니다.",
    commonMistakeKo: "배경 채도를 인물만큼 높여 두면 모바일 스크롤에서 시선이 흩어집니다.",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolBg3d,
  },
  {
    id: "xray-2-bg-lt",
    floorNumber: 2,
    layerCode: "02_BG_LT_EXTRACTED_LINE",
    titleKo: "2층 · 3D→2D LT 추출 배경 선화",
    ownerStageId: "bg3d-vrm",
    blendMode: "multiply",
    defaultOpacityPercent: 82,
    exportIncluded: true,
    anatomyInsightKo: "3D 모서리를 0.7× 얇은 선으로 추출해 인물 선화보다 한 톤 부드럽게 안착시킵니다.",
    commonMistakeKo: "배경 외곽선을 순검정 100%로 두면 캐릭터보다 배경이 튀어나와 보입니다.",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolRuler,
  },
  {
    id: "xray-3-vrm-guide",
    floorNumber: 3,
    layerCode: "03_VRM_POSE_GUIDE",
    titleKo: "3층 · VRM 3D 포즈·투시 가이드",
    ownerStageId: "bg3d-vrm",
    blendMode: "normal",
    defaultOpacityPercent: 32,
    exportIncluded: false,
    anatomyInsightKo: "관절 비율·손 모양·소품 밀착 기준선으로 쓰며 출고 시 자동 비노출 처리됩니다.",
    commonMistakeKo: "가이드 레이어를 출력 포함 상태로 방치하면 최종본에 회색 인체선이 비칩니다.",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolVrm,
  },
  {
    id: "xray-4-char-line",
    floorNumber: 4,
    layerCode: "04_LINEART_CHAR_VEC",
    titleKo: "4층 · 캐릭터 벡터 본선화",
    ownerStageId: "lineart",
    blendMode: "normal",
    defaultOpacityPercent: 100,
    exportIncluded: true,
    anatomyInsightKo: "참조 레이어 지정 + 닫힌 영역 0틈새로 밑색 공정의 클릭 횟수를 절반 이하로 줄입니다.",
    commonMistakeKo: "머리카락·옷깃 끝 2px 틈새를 방치하면 밑색 채우기가 배경까지 새어 나갑니다.",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolGpen,
  },
  {
    id: "xray-5-flat-id",
    floorNumber: 5,
    layerCode: "05_FLAT_BIBLE_COLOR",
    titleKo: "5층 · 캐릭터 바이블 밑색 & 부위 ID",
    ownerStageId: "flatting",
    blendMode: "normal",
    defaultOpacityPercent: 100,
    exportIncluded: true,
    anatomyInsightKo: "피부·헤어·의상별 바이블 토큰으로 분리해 명암 어시가 1클릭 클리핑을 걸 수 있습니다.",
    commonMistakeKo: "회차마다 눈대중으로 색을 찍으면 10화 이후 캐릭터 피부·머리색이 흔들립니다.",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolFill,
  },
  {
    id: "xray-6-shade",
    floorNumber: 6,
    layerCode: "06_SHADE_KEYLIGHT_MUL",
    titleKo: "6층 · 곱하기(Multiply) 주광원 명암",
    ownerStageId: "shading",
    blendMode: "multiply",
    defaultOpacityPercent: 78,
    exportIncluded: true,
    anatomyInsightKo: "밑색 위 클리핑 마스크로 1차 그림자와 림라이트를 나눠 수정 요청 시 재작업이 빠릅니다.",
    commonMistakeKo: "밑색 레이어 위에 바로 명암을 덮어 그리면 의상 색 변경 요청 시 처음부터 다시 그려야 합니다.",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolWatercolor,
  },
  {
    id: "xray-7-vfx",
    floorNumber: 7,
    layerCode: "07_VFX_GLOW_TONE",
    titleKo: "7층 · 대기광 · 블룸 · 스크린톤 FX",
    ownerStageId: "post-fx",
    blendMode: "screen",
    defaultOpacityPercent: 64,
    exportIncluded: true,
    anatomyInsightKo: "인물과 배경 사이에 얇은 빛막을 얹어 역광 감정선과 공간 입체감을 마무리합니다.",
    commonMistakeKo: "블룸 강도를 과하게 올리면 대사 말풍선 주변 대비가 떨어져 눈이 피로해집니다.",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolScreentone,
  },
  {
    id: "xray-8-lettering",
    floorNumber: 8,
    layerCode: "08_LETTERING_SFX_LOC",
    titleKo: "8층 · 말풍선 · 의성어 · 글로벌 번역 슬롯",
    ownerStageId: "lettering-loc",
    blendMode: "normal",
    defaultOpacityPercent: 100,
    exportIncluded: true,
    anatomyInsightKo: "텍스트와 그림을 완전 분리해 영어·일본어 글로벌 연재판과 숏폼 자막을 비파괴 치환합니다.",
    commonMistakeKo: "말풍선을 그림 레이어와 병합하면 오타 1글자 수정이나 해외 번역 시 원고를 다시 칠해야 합니다.",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolBubbleSfx,
  },
]);

export interface XrayStackSummary {
  readonly visibleCount: number;
  readonly totalLayers: number;
  readonly exportableVisibleCount: number;
  readonly nonExportGuideVisibleCount: number;
  readonly activeStageIds: readonly PipelineStageId[];
}

export function summarizeXrayLayerStack(
  visibleLayerIds: readonly string[],
): XrayStackSummary {
  const visibleSet = new Set(visibleLayerIds);
  const visibleLayers = XRAY_MANUSCRIPT_LAYERS.filter((layer) => visibleSet.has(layer.id));
  const stageSet = new Set<PipelineStageId>(visibleLayers.map((layer) => layer.ownerStageId));

  return {
    visibleCount: visibleLayers.length,
    totalLayers: XRAY_MANUSCRIPT_LAYERS.length,
    exportableVisibleCount: visibleLayers.filter((l) => l.exportIncluded).length,
    nonExportGuideVisibleCount: visibleLayers.filter((l) => !l.exportIncluded).length,
    activeStageIds: [...stageSet],
  };
}

export interface GoalFirstRecipe {
  readonly id: string;
  readonly goalQuestionKo: string;
  readonly symptomsTagsKo: readonly string[];
  readonly estimatedMinutes: number;
  readonly relatedRoles: readonly StudioCreatorRoleId[];
  readonly recommendedTrackId: string;
  readonly spritePath: string;
  readonly stepsKo: readonly [string, string, string];
  readonly instantResultKo: string;
}

/** 목적별 역색인 처방전 8종 (메뉴 이름 대신 '지금 해결하고 싶은 문제'로 바로 찾기). */
export const GOAL_FIRST_RECIPES: readonly GoalFirstRecipe[] = Object.freeze([
  {
    id: "recipe-night-backlight",
    goalQuestionKo: "야경 · 역광 장면을 3분 안에 영화처럼 살리고 싶어요",
    symptomsTagsKo: ["야경", "역광", "조명", "분위기", "블룸", "후보정"],
    estimatedMinutes: 3,
    relatedRoles: ["shading", "vfx"],
    recommendedTrackId: "track-3-color-and-light",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolScreentone,
    stepsKo: [
      "6층 명암 레이어에 차가운 남색 Multiply(68%)를 클리핑 적용",
      "인물 외곽선 안쪽 4px에 따뜻한 주광 림라이트 스트로크 추가",
      "7층 FX 레이어(Screen 55%)로 광원 방향 블룸을 얹어 마무리",
    ],
    instantResultKo: "인물 실루엣이 어두운 배경에서 또렷하게 분리되며 시선 집중도가 즉시 올라갑니다.",
  },
  {
    id: "recipe-gap-fill-leak",
    goalQuestionKo: "선화 틈새 때문에 채우기(버킷)가 자꾸 새어 나가요",
    symptomsTagsKo: ["선화", "틈새", "채우기", "버킷", "밑색", "누수"],
    estimatedMinutes: 2,
    relatedRoles: ["lineart", "flatting"],
    recommendedTrackId: "track-2-line-and-form",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolFill,
    stepsKo: [
      "4층 선화 레이어의 '참조 레이어' 배지를 켜고 틈새 닫기(3px) 활성화",
      "닫힌 영역 자동 검사기로 열린 끝점 빨간 마커 위치 확인",
      "5층 밑색 레이어에서 영역 확장 +1px 옵션으로 원클릭 채우기",
    ],
    instantResultKo: "선화 경계 흰 틈새와 배경 누수가 사라져 컷당 밑색 시간이 절반 이하로 줄어듭니다.",
  },
  {
    id: "recipe-app-migration",
    goalQuestionKo: "클립스튜디오 · 프로크리에이트에서 넘어왔는데 단축키가 꼬여요",
    symptomsTagsKo: ["CSP", "클립스튜디오", "프로크리에이트", "포토샵", "단축키", "이주"],
    estimatedMinutes: 2,
    relatedRoles: ["storyboard", "lineart", "shading"],
    recommendedTrackId: "track-1-first-cut",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemStudio,
    stepsKo: [
      "멀티 직군 특화 탭에서 기존 사용 툴(CSP/Procreate/Photoshop) 프리셋 선택",
      "충돌 키(Ctrl+W 등) 자동 치환 가이드를 확인하고 8슬롯 도구 레일 고정",
      "아카데미 단축키 리듬 트레이너에서 4키 기본 루프를 30초 워밍업",
    ],
    instantResultKo: "기존 근육 기억을 거의 바꾸지 않고 첫날부터 평소 드로잉 속도를 회복합니다.",
  },
  {
    id: "recipe-3d-2d-blend",
    goalQuestionKo: "3D 배경과 내 캐릭터 선화가 따로 놀아 이질적이에요",
    symptomsTagsKo: ["3D", "배경", "LT", "이질감", "선 굵기", "채도"],
    estimatedMinutes: 4,
    relatedRoles: ["stage3d", "lineart", "vfx"],
    recommendedTrackId: "track-4-bg3d-vrm-stage",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolBg3d,
    stepsKo: [
      "2층 LT 배경 선화 굵기를 캐릭터 본선화의 0.7배·색상은 짙은 먹색(82%)으로 조정",
      "1층 3D 배경 원판에 Z-Depth 원경 안개 레이어를 추가해 채도를 낮춤",
      "인물 발밑 접지 그림자를 배경과 같은 광원 각도로 1층 위에 살짝 얹음",
    ],
    instantResultKo: "3D 모델의 기계적인 느낌을 덜어내고 손그림 캐릭터와 자연스럽게 융합됩니다.",
  },
  {
    id: "recipe-deadline-bottleneck",
    goalQuestionKo: "마감 6시간 전인데 채색·후보정 공정이 밀려 터질 것 같아요",
    symptomsTagsKo: ["마감", "병목", "지연", "SLA", "채색", "긴급"],
    estimatedMinutes: 3,
    relatedRoles: ["producer", "flatting", "shading"],
    recommendedTrackId: "track-6-studio-pipeline",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemProduction,
    stepsKo: [
      "거버넌스 탭 SLA 병목 감지기에서 지연 시간이 가장 큰 공정(Red/Amber) 확인",
      "밀린 컷 중 단순 반복 컷 3~5장을 외주 샌드박스로 즉시 분할 반출",
      "남은 컷의 밑색·1차 명암은 AI 팀원 자동 보완(초벌 모드)으로 병렬 가속",
    ],
    instantResultKo: "핵심 연출 컷 품질은 지키면서 마감 초과 위험을 즉시 분산시킵니다.",
  },
  {
    id: "recipe-outsource-safe",
    goalQuestionKo: "외주 어시에게 4컷만 안전하게 맡기고 권리 BOM까지 검수받고 싶어요",
    symptomsTagsKo: ["외주", "샌드박스", "보안", "워터마크", "BOM", "정산"],
    estimatedMinutes: 3,
    relatedRoles: ["producer", "lineart", "stage3d"],
    recommendedTrackId: "track-6-studio-pipeline",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemProduction,
    stepsKo: [
      "외주 샌드박스 생성기에서 담당 3~5컷만 선택해 타 컷 비공개 패키지 발급",
      "세션 워터마크와 상류 공정 Read-Only 잠금이 적용된 링크 전달",
      "반입 시 자동 검증기로 BOM 0누락·해상도·워터마크 통과 후 컷당 정산 원장 반영",
    ],
    instantResultKo: "미공개 회차 유출 우려 없이 외주 분업과 투명한 컷당 정산을 자동화합니다.",
  },
  {
    id: "recipe-global-loc",
    goalQuestionKo: "한국어 원고를 영어·일본어 글로벌 연재판으로 원클릭 변환하고 싶어요",
    symptomsTagsKo: ["번역", "글로벌", "영어", "일본어", "식자", "말풍선"],
    estimatedMinutes: 4,
    relatedRoles: ["lettering", "localization"],
    recommendedTrackId: "track-5-scroll-sfx-loc",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolBubbleSfx,
    stepsKo: [
      "8층 식자 레이어가 그림과 분리된 비파괴 벡터 상태인지 확인",
      "글로벌 번역 슬롯(EN/JP)을 추가해 용어집 고정 번역 초안 불러오기",
      "말풍선 넘침 경고 0건 및 의성어 현지화 스왑 확인 후 다국어 일괄 내보내기",
    ],
    instantResultKo: "원본 그림을 한 픽셀도 건드리지 않고 여러 언어 연재본을 동시에 생산합니다.",
  },
  {
    id: "recipe-remotion-shorts",
    goalQuestionKo: "완성한 회차를 15초 세로 숏폼(릴스·쇼츠) 예고편으로 뽑고 싶어요",
    symptomsTagsKo: ["숏폼", "릴스", "쇼츠", "영상", "Remotion", "홍보", "예고편"],
    estimatedMinutes: 5,
    relatedRoles: ["video", "producer", "vfx"],
    recommendedTrackId: "track-5-scroll-sfx-loc",
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.techRemotion,
    stepsKo: [
      "회차 하이라이트 5컷을 골라 1층 배경·4층 인물·8층 대사 패럴랙스 분리 확인",
      "Remotion 9:16 카메라 패닝 키프레임과 15초 비트 컷 전환 프리셋 적용",
      "상하단 플랫폼 UI 안전 영역·BGM Rights BOM 통과 후 MP4 렌더",
    ],
    instantResultKo: "별도 영상 편집 툴 없이 연재 업로드 직후 홍보용 숏폼 예고편까지 완성합니다.",
  },
]);

/** 키워드(질문·증상 태그·결과)와 선택 직군으로 목적별 역색인 처방전을 검색한다. */
export function searchGoalFirstRecipes(
  query: string,
  roleFilter?: StudioCreatorRoleId | "all",
): readonly GoalFirstRecipe[] {
  const normalizedQuery = query.trim().toLowerCase();
  return GOAL_FIRST_RECIPES.filter((recipe) => {
    if (roleFilter && roleFilter !== "all" && !recipe.relatedRoles.includes(roleFilter)) {
      return false;
    }
    if (!normalizedQuery) return true;
    const haystack = [
      recipe.goalQuestionKo,
      recipe.instantResultKo,
      ...recipe.symptomsTagsKo,
      ...recipe.stepsKo,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export interface ShortcutRhythmStep {
  readonly order: number;
  readonly actionKo: string;
  readonly keyByPreset: Readonly<Record<ShortcutMigrationPresetId, string>>;
}

export interface ShortcutRhythmDrill {
  readonly id: string;
  readonly titleKo: string;
  readonly focusKo: string;
  readonly targetBpm: number;
  readonly spritePath: string;
  readonly steps: readonly ShortcutRhythmStep[];
}

export const SHORTCUT_RHYTHM_DRILLS: readonly ShortcutRhythmDrill[] = Object.freeze([
  {
    id: "drill-ink-loop",
    titleKo: "선화 클린업 4박자 루프",
    focusKo: "펜 → 지우개 → 실행취소 → 캔버스 이동",
    targetBpm: 96,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolGpen,
    steps: [
      { order: 1, actionKo: "G펜 그리기", keyByPreset: { csp: "P", procreate: "B", photoshop: "B", beginner: "1" } },
      { order: 2, actionKo: "지우개 정리", keyByPreset: { csp: "E", procreate: "E", photoshop: "E", beginner: "2" } },
      { order: 3, actionKo: "한 획 되돌리기", keyByPreset: { csp: "Ctrl+Z", procreate: "2-Finger", photoshop: "Ctrl+Z", beginner: "Ctrl+Z" } },
      { order: 4, actionKo: "손바닥 이동", keyByPreset: { csp: "Space", procreate: "Pinch", photoshop: "Space", beginner: "Space" } },
    ],
  },
  {
    id: "drill-flat-speed",
    titleKo: "밑색 스피드 채우기 4박자",
    focusKo: "스포이드 → 자동선택 → 참조채우기 → 레이어",
    targetBpm: 88,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolFill,
    steps: [
      { order: 1, actionKo: "바이블 스포이드", keyByPreset: { csp: "Alt", procreate: "Hold", photoshop: "I", beginner: "I" } },
      { order: 2, actionKo: "영역 자동선택", keyByPreset: { csp: "W", procreate: "S", photoshop: "W", beginner: "W" } },
      { order: 3, actionKo: "참조 채우기", keyByPreset: { csp: "G", procreate: "G", photoshop: "G", beginner: "3" } },
      { order: 4, actionKo: "클리핑 레이어", keyByPreset: { csp: "L", procreate: "L", photoshop: "F7", beginner: "L" } },
    ],
  },
  {
    id: "drill-3d-lt-sync",
    titleKo: "3D 배경 · VRM 전환 4박자",
    focusKo: "3D 무대 → VRM 포즈 → 투시 자 → 선화 복귀",
    targetBpm: 76,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolBg3d,
    steps: [
      { order: 1, actionKo: "3D 배경 카메라", keyByPreset: { csp: "3", procreate: "3", photoshop: "3", beginner: "5" } },
      { order: 2, actionKo: "VRM 관절 포즈", keyByPreset: { csp: "V", procreate: "V", photoshop: "V", beginner: "5" } },
      { order: 3, actionKo: "소실점 투시 자", keyByPreset: { csp: "U", procreate: "Q", photoshop: "U", beginner: "U" } },
      { order: 4, actionKo: "선화 펜 복귀", keyByPreset: { csp: "P", procreate: "B", photoshop: "B", beginner: "1" } },
    ],
  },
  {
    id: "drill-baton-review",
    titleKo: "식자 · 바통 터치 출고 4박자",
    focusKo: "말풍선 → 번역 슬롯 → 게이트 검사 → 다음 컷",
    targetBpm: 82,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemProduction,
    steps: [
      { order: 1, actionKo: "말풍선 배치", keyByPreset: { csp: "T", procreate: "T", photoshop: "T", beginner: "4" } },
      { order: 2, actionKo: "번역 슬롯 전환", keyByPreset: { csp: "Shift+L", procreate: "Shift+L", photoshop: "Shift+L", beginner: "Shift+L" } },
      { order: 3, actionKo: "5대 게이트 점검", keyByPreset: { csp: "Shift+G", procreate: "Shift+G", photoshop: "Shift+G", beginner: "Shift+G" } },
      { order: 4, actionKo: "원클릭 바통 인계", keyByPreset: { csp: "Ctrl+Shift+Enter", procreate: "Shift+Enter", photoshop: "Ctrl+Shift+Enter", beginner: "Shift+Enter" } },
    ],
  },
]);

export interface ShortcutRhythmEvaluation {
  readonly drillId: string;
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly measuredBpm: number;
  readonly targetBpm: number;
  readonly gradeKo: "리듬 마스터" | "실전 안정권" | "워밍업 진행 중";
}

export function evaluateShortcutRhythmDrill(
  drillId: string,
  completedSteps: number,
  elapsedMs: number,
): ShortcutRhythmEvaluation {
  const drill = SHORTCUT_RHYTHM_DRILLS.find((d) => d.id === drillId) ?? SHORTCUT_RHYTHM_DRILLS[0]!;
  const totalSteps = drill.steps.length;
  const clampedSteps = Math.max(0, Math.min(totalSteps, Math.round(completedSteps)));
  const safeElapsedMs = Math.max(400, elapsedMs);
  const measuredBpm =
    clampedSteps === 0 ? 0 : Math.min(240, Math.round((clampedSteps / (safeElapsedMs / 60_000))));
  const gradeKo =
    clampedSteps >= totalSteps && measuredBpm >= drill.targetBpm
      ? "리듬 마스터"
      : clampedSteps >= totalSteps
        ? "실전 안정권"
        : "워밍업 진행 중";

  return {
    drillId: drill.id,
    completedSteps: clampedSteps,
    totalSteps,
    measuredBpm,
    targetBpm: drill.targetBpm,
    gradeKo,
  };
}
