/**
 * 툰스튜디오 12대 풀 직군 카탈로그 정본.
 *
 * - 실제 웹툰 스튜디오 풀 직군 12종(`story` ~ `producer`) 정의
 * - 각 직군별 우선 도구(실물 WebP 스프라이트), 기본 레이어, 빈자리 AI 팀원, 출고 체크리스트 포함
 */

import {
  MIGRATION_SHORTCUT_PRESETS,
  ROLE_COMBO_QUICK_PRESETS,
  type RoleComboQuickPreset,
  type ShortcutBindingItem,
  type ShortcutMigrationPreset,
  type ShortcutMigrationPresetId,
} from "./studio-role-shortcuts-catalog";

export { MIGRATION_SHORTCUT_PRESETS, ROLE_COMBO_QUICK_PRESETS };
export type {
  RoleComboQuickPreset,
  ShortcutBindingItem,
  ShortcutMigrationPreset,
  ShortcutMigrationPresetId,
};

export type StudioCreatorRoleId =
  | "story"
  | "storyboard"
  | "stage3d"
  | "character3d"
  | "lineart"
  | "flatting"
  | "shading"
  | "vfx"
  | "lettering"
  | "localization"
  | "video"
  | "producer";

/** 구 6직군 약칭(`coloring`) 입력 시 밑색+명암 직군으로 안전 정규화하기 위한 입력 타입. */
export type StudioCreatorRoleInputId = StudioCreatorRoleId | "coloring";

export type RoleDomainCategory = "planning" | "spatial-3d" | "art-2d" | "finishing" | "publish-ops";

export const ACADEMY_ROLES_SPRITE_PATHS = Object.freeze({
  emblemProduction: "/assets/studio/vibrant-sprites/emblem-production.webp",
  emblemGuideMap: "/assets/studio/vibrant-sprites/emblem-guide-map.webp",
  emblemStudio: "/assets/studio/vibrant-sprites/emblem-studio.webp",
  emblemCharacter: "/assets/studio/vibrant-sprites/emblem-character.webp",
  emblemBg3d: "/assets/studio/vibrant-sprites/emblem-bg3d-stage.webp",
  techRemotion: "/assets/studio/vibrant-sprites/tech-remotion.webp",
  toolAiCompass: "/assets/studio/vibrant-sprites/tool-ai-compass.webp",
  toolBg3d: "/assets/studio/vibrant-sprites/tool-bg3d.webp",
  toolBubbleSfx: "/assets/studio/vibrant-sprites/tool-bubble-sfx.webp",
  toolEraser: "/assets/studio/vibrant-sprites/tool-eraser.webp",
  toolEyedropper: "/assets/studio/vibrant-sprites/tool-eyedropper.webp",
  toolFill: "/assets/studio/vibrant-sprites/tool-fill.webp",
  toolGpen: "/assets/studio/vibrant-sprites/tool-gpen.webp",
  toolLasso: "/assets/studio/vibrant-sprites/tool-lasso.webp",
  toolLayers: "/assets/studio/vibrant-sprites/tool-layers.webp",
  toolMarker: "/assets/studio/vibrant-sprites/tool-marker.webp",
  toolRuler: "/assets/studio/vibrant-sprites/tool-ruler.webp",
  toolScreentone: "/assets/studio/vibrant-sprites/tool-screentone.webp",
  toolVector: "/assets/studio/vibrant-sprites/tool-vector.webp",
  toolVrm: "/assets/studio/vibrant-sprites/tool-vrm.webp",
  toolWand: "/assets/studio/vibrant-sprites/tool-wand.webp",
  toolWatercolor: "/assets/studio/vibrant-sprites/tool-watercolor.webp",
} as const);

const S = ACADEMY_ROLES_SPRITE_PATHS;

export interface RoleToolSlotSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly shortcutHint: string;
  readonly spritePath: string;
  readonly priority: number;
  readonly roleId: StudioCreatorRoleId;
}

export interface RoleLayerSpec {
  readonly id: string;
  readonly name: string;
  readonly stageOrder: number;
  readonly blendMode: "normal" | "multiply" | "screen" | "overlay";
  readonly purposeKo: string;
  readonly ownerRoleId: StudioCreatorRoleId;
  readonly exportIncluded: boolean;
}

export interface RoleAiBackfillSpec {
  readonly partnerNameKo: string;
  readonly scopeKo: string;
  readonly defaultMode: "review-first" | "draft-assist";
  readonly estimatedWeeklySavedHours: number;
  readonly spritePath: string;
}

export interface StudioCreatorRoleSpec {
  readonly id: StudioCreatorRoleId;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly category: RoleDomainCategory;
  readonly pipelineStageId:
    | "conti"
    | "bg3d-vrm"
    | "lineart"
    | "flatting"
    | "shading"
    | "post-fx"
    | "lettering-loc"
    | "final-bom";
  readonly summaryKo: string;
  readonly spritePath: string;
  readonly tools: readonly RoleToolSlotSpec[];
  readonly defaultLayers: readonly RoleLayerSpec[];
  readonly aiBackfill: RoleAiBackfillSpec;
  readonly exportChecklist: readonly string[];
}

export const STUDIO_CREATOR_ROLE_ORDER: readonly StudioCreatorRoleId[] = Object.freeze([
  "story",
  "storyboard",
  "stage3d",
  "character3d",
  "lineart",
  "flatting",
  "shading",
  "vfx",
  "lettering",
  "localization",
  "video",
  "producer",
]);

export const STUDIO_CREATOR_ROLES: Readonly<Record<StudioCreatorRoleId, StudioCreatorRoleSpec>> =
  Object.freeze({
    story: {
      id: "story",
      labelKo: "글 · 스토리",
      shortLabelKo: "스토리",
      category: "planning",
      pipelineStageId: "conti",
      summaryKo: "회차 비트·대사 원고·캐릭터 바이블 설정 일관성을 설계합니다.",
      spritePath: S.emblemGuideMap,
      tools: [
        { id: "tool-script-beat", labelKo: "회차 대본·비트", shortcutHint: "Shift+S", spritePath: S.toolAiCompass, priority: 86, roleId: "story" },
        { id: "tool-story-bubble-draft", labelKo: "가대사 배치", shortcutHint: "T", spritePath: S.toolBubbleSfx, priority: 74, roleId: "story" },
      ],
      defaultLayers: [
        { id: "layer-script-notes", name: "00_SCRIPT_BEAT_NOTES", stageOrder: 10, blendMode: "normal", purposeKo: "회차 감정 곡선·가대사 메모(출력 제외)", ownerRoleId: "story", exportIncluded: false },
      ],
      aiBackfill: {
        partnerNameKo: "AI 스토리 비트 코파일럿",
        scopeKo: "캐릭터 바이블 설정 충돌 검사 · 대사 리듬 다듬기",
        defaultMode: "review-first",
        estimatedWeeklySavedHours: 3.5,
        spritePath: S.toolAiCompass,
      },
      exportChecklist: ["회차 결말 훅·복선 바이블 정합성 확인", "대사 화자 누락 0건 점검"],
    },
    storyboard: {
      id: "storyboard",
      labelKo: "콘티 · 연출",
      shortLabelKo: "콘티",
      category: "planning",
      pipelineStageId: "conti",
      summaryKo: "세로 스크롤 호흡, 컷 분할, 카메라 앵글과 시선 동선을 설계합니다.",
      spritePath: S.emblemStudio,
      tools: [
        { id: "tool-conti-marker", labelKo: "콘티 러프 마커", shortcutHint: "B", spritePath: S.toolMarker, priority: 95, roleId: "storyboard" },
        { id: "tool-perspective-ruler", labelKo: "구도·투시 자", shortcutHint: "U", spritePath: S.toolRuler, priority: 88, roleId: "storyboard" },
        { id: "tool-lasso-reframe", labelKo: "컷 구도 이동", shortcutHint: "M", spritePath: S.toolLasso, priority: 78, roleId: "storyboard" },
      ],
      defaultLayers: [
        { id: "layer-conti-rough", name: "01_CONTI_ROUGH_FLOW", stageOrder: 20, blendMode: "normal", purposeKo: "세로 스크롤 컷 분할 · 시선 동선 러프", ownerRoleId: "storyboard", exportIncluded: false },
      ],
      aiBackfill: {
        partnerNameKo: "AI 콘티·시선동선 어시",
        scopeKo: "대본→세로 스크롤 컷 분할 초안 · 여백 리듬 제안",
        defaultMode: "review-first",
        estimatedWeeklySavedHours: 4.5,
        spritePath: S.toolAiCompass,
      },
      exportChecklist: ["모바일 390px 스크롤 가독성·여백 호흡 검증", "컷 번호·장면 전환 순서 확정"],
    },
    stage3d: {
      id: "stage3d",
      labelKo: "3D 배경 · 소품",
      shortLabelKo: "3D 배경",
      category: "spatial-3d",
      pipelineStageId: "bg3d-vrm",
      summaryKo: "실내외 3D 무대 배치, 광원 시간대, LT 배경 선화·음영 추출을 담당합니다.",
      spritePath: S.emblemBg3d,
      tools: [
        { id: "tool-bg3d-stage", labelKo: "3D 배경 무대", shortcutHint: "3", spritePath: S.toolBg3d, priority: 96, roleId: "stage3d" },
        { id: "tool-bg3d-ruler", labelKo: "소실점·카메라 동기", shortcutHint: "U", spritePath: S.toolRuler, priority: 84, roleId: "stage3d" },
      ],
      defaultLayers: [
        { id: "layer-bg3d-base", name: "02_BG3D_STAGE_RENDER", stageOrder: 30, blendMode: "normal", purposeKo: "3D 배경 원판 + Z-Depth 안개 기준층", ownerRoleId: "stage3d", exportIncluded: true },
        { id: "layer-bg3d-lt-line", name: "02B_BG3D_LT_LINE", stageOrder: 35, blendMode: "multiply", purposeKo: "3D→2D LT 추출 배경 선화(굵기 통일)", ownerRoleId: "stage3d", exportIncluded: true },
      ],
      aiBackfill: {
        partnerNameKo: "AI 3D 배경·LT 추출 어시",
        scopeKo: "콘티 앵글 기반 3D 카메라 맞춤 · LT 배경 선화 자동 분리",
        defaultMode: "review-first",
        estimatedWeeklySavedHours: 5.0,
        spritePath: S.toolBg3d,
      },
      exportChecklist: ["3D 배경 소품 Rights BOM 상업 라이선스 0건 누락", "캐릭터 선화와 LT 배경 선 굵기 비율 점검"],
    },
    character3d: {
      id: "character3d",
      labelKo: "캐릭터 · VRM",
      shortLabelKo: "VRM",
      category: "spatial-3d",
      pipelineStageId: "bg3d-vrm",
      summaryKo: "VRM 인체 포즈, 42-소켓 의상·소품 밀착, 표정 블렌드셰입 가이드를 제작합니다.",
      spritePath: S.emblemCharacter,
      tools: [
        { id: "tool-vrm-poser", labelKo: "VRM 포즈·42소켓", shortcutHint: "V", spritePath: S.toolVrm, priority: 94, roleId: "character3d" },
        { id: "tool-vrm-layers", labelKo: "포즈 참조 레이어", shortcutHint: "L", spritePath: S.toolLayers, priority: 76, roleId: "character3d" },
      ],
      defaultLayers: [
        { id: "layer-vrm-pose-ref", name: "03_VRM_POSE_GUIDE", stageOrder: 40, blendMode: "normal", purposeKo: "VRM 포즈·비율 가이드(출력 제외)", ownerRoleId: "character3d", exportIncluded: false },
      ],
      aiBackfill: {
        partnerNameKo: "AI VRM 포즈·밀착 어시",
        scopeKo: "콘티 실루엣→VRM 관절 자동 포징 · 소품 Anti-Clip 밀착",
        defaultMode: "draft-assist",
        estimatedWeeklySavedHours: 3.0,
        spritePath: S.toolVrm,
      },
      exportChecklist: ["캐릭터 신장·두신 비율 시트 일치 확인", "VRM 참조 레이어 최종 출력 비노출 체크"],
    },
    lineart: {
      id: "lineart",
      labelKo: "선화 · 펜터치",
      shortLabelKo: "선화",
      category: "art-2d",
      pipelineStageId: "lineart",
      summaryKo: "벡터 G펜·강약 보정·닫힌 영역 마감으로 깔끔한 원고 선화를 완성합니다.",
      spritePath: S.toolGpen,
      tools: [
        { id: "tool-gpen-ink", labelKo: "G펜 · 강약 잉크", shortcutHint: "P", spritePath: S.toolGpen, priority: 100, roleId: "lineart" },
        { id: "tool-vector-ink", labelKo: "벡터 교차 지우개", shortcutHint: "N", spritePath: S.toolVector, priority: 92, roleId: "lineart" },
        { id: "tool-hard-eraser", labelKo: "정밀 지우개", shortcutHint: "E", spritePath: S.toolEraser, priority: 85, roleId: "lineart" },
      ],
      defaultLayers: [
        { id: "layer-char-lineart", name: "04_LINEART_CHAR_VEC", stageOrder: 50, blendMode: "normal", purposeKo: "캐릭터 본선화(참조 레이어 · 닫힌 영역 0틈새)", ownerRoleId: "lineart", exportIncluded: true },
      ],
      aiBackfill: {
        partnerNameKo: "AI 선화 클린업 어시",
        scopeKo: "러프→닫힌 선화 정리 · 미세 틈새 자동 봉합",
        defaultMode: "review-first",
        estimatedWeeklySavedHours: 6.0,
        spritePath: S.toolGpen,
      },
      exportChecklist: ["선화 닫힌 영역 열린 틈새 0건 검증", "선화 레이어 참조 속성 활성화 및 300DPI 이상 확인"],
    },
    flatting: {
      id: "flatting",
      labelKo: "밑색 · 플랫",
      shortLabelKo: "밑색",
      category: "art-2d",
      pipelineStageId: "flatting",
      summaryKo: "참조 레이어 원클릭 채우기와 캐릭터 바이블 팔레트로 부위별 밑색을 분리합니다.",
      spritePath: S.toolFill,
      tools: [
        { id: "tool-smart-fill", labelKo: "참조 틈새 채우기", shortcutHint: "G", spritePath: S.toolFill, priority: 97, roleId: "flatting" },
        { id: "tool-magic-wand", labelKo: "자동 영역 선택", shortcutHint: "W", spritePath: S.toolWand, priority: 89, roleId: "flatting" },
        { id: "tool-eyedropper-bible", labelKo: "바이블 스포이드", shortcutHint: "I", spritePath: S.toolEyedropper, priority: 83, roleId: "flatting" },
      ],
      defaultLayers: [
        { id: "layer-flat-color", name: "05_FLAT_BIBLE_COLOR", stageOrder: 60, blendMode: "normal", purposeKo: "캐릭터 바이블 팔레트 밑색 & 부위 ID 마스크", ownerRoleId: "flatting", exportIncluded: true },
      ],
      aiBackfill: {
        partnerNameKo: "AI 밑색 바이블 어시",
        scopeKo: "캐릭터 컬러 시트 기반 피부·헤어·의상 자동 밑색 채우기",
        defaultMode: "draft-assist",
        estimatedWeeklySavedHours: 5.5,
        spritePath: S.toolFill,
      },
      exportChecklist: ["캐릭터 바이블 팔레트 일치율 95% 이상 검증", "선화 경계 흰 틈새(안티앨리어싱 누락) 0건 확인"],
    },
    shading: {
      id: "shading",
      labelKo: "명암 · 채색",
      shortLabelKo: "명암",
      category: "art-2d",
      pipelineStageId: "shading",
      summaryKo: "클리핑 마스크 셀 명암, 수채 글레이징, 장면 키라이트로 입체감을 완성합니다.",
      spritePath: S.toolWatercolor,
      tools: [
        { id: "tool-watercolor-shade", labelKo: "수채·글레이징 브러시", shortcutHint: "C", spritePath: S.toolWatercolor, priority: 95, roleId: "shading" },
        { id: "tool-shade-layers", labelKo: "클리핑 명암 스택", shortcutHint: "L", spritePath: S.toolLayers, priority: 87, roleId: "shading" },
      ],
      defaultLayers: [
        { id: "layer-keylight-shade", name: "06_SHADE_MULTIPLY_KEY", stageOrder: 70, blendMode: "multiply", purposeKo: "장면 주광원 셀 그림자 · 앰비언트 오클루전", ownerRoleId: "shading", exportIncluded: true },
      ],
      aiBackfill: {
        partnerNameKo: "AI 광원·명암 채색 어시",
        scopeKo: "3D 키라이트 방향 연동 1차 셀 명암·림라이트 제안",
        defaultMode: "review-first",
        estimatedWeeklySavedHours: 5.0,
        spritePath: S.toolWatercolor,
      },
      exportChecklist: ["동일 시퀀스 광원 방향·색온도 일관성 확인", "밑색 클리핑 이탈 픽셀 0건 점검"],
    },
    vfx: {
      id: "vfx",
      labelKo: "후보정 · 이펙트",
      shortLabelKo: "후보정",
      category: "finishing",
      pipelineStageId: "post-fx",
      summaryKo: "대기 원근, 블룸, 스크린톤, 모션 블러 등 화면 최종 밀도와 분위기를 조율합니다.",
      spritePath: S.toolScreentone,
      tools: [
        { id: "tool-screentone-fx", labelKo: "스크린톤 · 대기 FX", shortcutHint: "F", spritePath: S.toolScreentone, priority: 91, roleId: "vfx" },
        { id: "tool-fx-layers", labelKo: "블렌드·색보정 스택", shortcutHint: "L", spritePath: S.toolLayers, priority: 82, roleId: "vfx" },
      ],
      defaultLayers: [
        { id: "layer-vfx-glow", name: "07_VFX_GLOW_TONE", stageOrder: 80, blendMode: "screen", purposeKo: "역광 블룸 · 파티클 · 스크린톤 마감 효과", ownerRoleId: "vfx", exportIncluded: true },
      ],
      aiBackfill: {
        partnerNameKo: "AI 대기광·후보정 어시",
        scopeKo: "장면 시간대별 색보정 LUT · 역광 블룸 자동 프리셋",
        defaultMode: "draft-assist",
        estimatedWeeklySavedHours: 2.5,
        spritePath: S.toolScreentone,
      },
      exportChecklist: ["대사 영역 휘도 대비(WCAG 가독성) 저해 여부 확인", "효과 브러시·텍스처 Rights BOM 기록 확인"],
    },
    lettering: {
      id: "lettering",
      labelKo: "식자 · SFX",
      shortLabelKo: "식자",
      category: "finishing",
      pipelineStageId: "lettering-loc",
      summaryKo: "말풍선 꼬리, 폰트 계층, 손글씨·곡선 의성어로 대사 몰입도를 극대화합니다.",
      spritePath: S.toolBubbleSfx,
      tools: [
        { id: "tool-bubble-sfx", labelKo: "말풍선 · 곡선 SFX", shortcutHint: "T", spritePath: S.toolBubbleSfx, priority: 98, roleId: "lettering" },
        { id: "tool-lettering-vector", labelKo: "벡터 말풍선 윤곽", shortcutHint: "N", spritePath: S.toolVector, priority: 81, roleId: "lettering" },
      ],
      defaultLayers: [
        { id: "layer-lettering-sfx", name: "08_LETTERING_SFX_KO", stageOrder: 90, blendMode: "normal", purposeKo: "말풍선·대사·의성어 비파괴 벡터 계층", ownerRoleId: "lettering", exportIncluded: true },
      ],
      aiBackfill: {
        partnerNameKo: "AI 식자·SFX 레이아웃 어시",
        scopeKo: "대본→말풍선 자동 흘림 · 캐릭터 얼굴 회피 배치",
        defaultMode: "review-first",
        estimatedWeeklySavedHours: 3.0,
        spritePath: S.toolBubbleSfx,
      },
      exportChecklist: ["모바일 최소 본문 크기(16pt+)·줄바꿈(keep-all) 검증", "사용 폰트 상업 라이선스 BOM 자동 통과"],
    },
    localization: {
      id: "localization",
      labelKo: "글로벌 번역",
      shortLabelKo: "번역",
      category: "finishing",
      pipelineStageId: "lettering-loc",
      summaryKo: "EN·JP·ZH 등 다국어 대사 슬롯과 의성어 비파괴 치환, 말풍선 자동 리플로우를 처리합니다.",
      spritePath: S.toolAiCompass,
      tools: [
        { id: "tool-loc-slot", labelKo: "다국어 슬롯 치환", shortcutHint: "Shift+L", spritePath: S.toolAiCompass, priority: 86, roleId: "localization" },
        { id: "tool-loc-bubble", labelKo: "번역 말풍선 리플로우", shortcutHint: "T", spritePath: S.toolBubbleSfx, priority: 80, roleId: "localization" },
      ],
      defaultLayers: [
        { id: "layer-loc-multi", name: "09_LOC_TRANSLATION_SLOTS", stageOrder: 95, blendMode: "normal", purposeKo: "영어·일본어·스페인어 비파괴 대사/SFX 오버레이", ownerRoleId: "localization", exportIncluded: true },
      ],
      aiBackfill: {
        partnerNameKo: "AI 다국어 현지화 어시",
        scopeKo: "용어집 고정 번역 초안 · 말풍선 넘침 자동 경고",
        defaultMode: "review-first",
        estimatedWeeklySavedHours: 4.0,
        spritePath: S.toolAiCompass,
      },
      exportChecklist: ["캐릭터 고유명사·말투 용어집 100% 일치 확인", "번역문 말풍선 넘침(Overflow) 0건 검증"],
    },
    video: {
      id: "video",
      labelKo: "Remotion 숏폼 · 영상",
      shortLabelKo: "숏폼",
      category: "publish-ops",
      pipelineStageId: "final-bom",
      summaryKo: "완성 컷 레이어를 분리해 9:16 릴스·쇼츠 패닝 예고편과 자막·음향 타이밍을 제작합니다.",
      spritePath: S.techRemotion,
      tools: [
        { id: "tool-remotion-cut", labelKo: "Remotion 숏폼 키프레임", shortcutHint: "R", spritePath: S.techRemotion, priority: 90, roleId: "video" },
        { id: "tool-video-layers", labelKo: "패럴랙스 레이어 분리", shortcutHint: "L", spritePath: S.toolLayers, priority: 77, roleId: "video" },
      ],
      defaultLayers: [
        { id: "layer-video-camera", name: "09B_REMOTION_CAM_KEY", stageOrder: 97, blendMode: "normal", purposeKo: "9:16 세로 숏폼 카메라 패닝·자막 안전 영역", ownerRoleId: "video", exportIncluded: false },
      ],
      aiBackfill: {
        partnerNameKo: "AI Remotion 예고편 디렉터",
        scopeKo: "하이라이트 5컷 자동 선별 · 15초 숏폼 패닝 템플릿 생성",
        defaultMode: "draft-assist",
        estimatedWeeklySavedHours: 3.0,
        spritePath: S.techRemotion,
      },
      exportChecklist: ["1080×1920 세로 안전 여백(상단·하단 UI 회피) 확인", "BGM·효과음 상업 라이선스 BOM 포함 검증"],
    },
    producer: {
      id: "producer",
      labelKo: "PD · AD · 마케터 · 검수",
      shortLabelKo: "PD·검수",
      category: "publish-ops",
      pipelineStageId: "final-bom",
      summaryKo: "8단계 마감 SLA, 컷 핀 검수, 외주 샌드박스 정산 및 최종 Rights BOM 출고를 승인합니다.",
      spritePath: S.emblemProduction,
      tools: [
        { id: "tool-bom-inspector", labelKo: "검수 게이트 · Rights BOM", shortcutHint: "Shift+G", spritePath: S.emblemProduction, priority: 93, roleId: "producer" },
        { id: "tool-review-layers", labelKo: "컷 버전·레이어 감사", shortcutHint: "L", spritePath: S.toolLayers, priority: 79, roleId: "producer" },
      ],
      defaultLayers: [
        { id: "layer-review-pins", name: "10_REVIEW_PINS_BOM", stageOrder: 100, blendMode: "normal", purposeKo: "PD·AD 좌표 핀 피드백 & 출고 승인 메타층(출력 제외)", ownerRoleId: "producer", exportIncluded: false },
      ],
      aiBackfill: {
        partnerNameKo: "AI 프로덕션·BOM 게이트 어시",
        scopeKo: "마감 SLA 병목 조기 경보 · Rights BOM 누락 자동 감사",
        defaultMode: "review-first",
        estimatedWeeklySavedHours: 3.5,
        spritePath: S.emblemProduction,
      },
      exportChecklist: ["전 컷 Rights BOM 상업 라이선스 누락 0건 확정", "플랫폼 규격(1600px/690px 슬라이스) 자동 검증 통과"],
    },
  });
