/**
 * Practical Daily Production Workbench Model for ToonStudio Virtual Studio.
 * Connects avatar desks, Pomodoro focus sprints, DCC file/layer quality checklists,
 * live retake instructions, and daily shift handoff reports for real production work.
 */

import {
  PIPELINE_STAGE_LABELS_KO,
  type NextGenVirtualStudioEngineState,
} from "./studio-virtual-office-nextgen-engine-data";

export type StudioPracticalWorkModeId =
  | "deep-focus-dnd"
  | "open-critique"
  | "pair-drawing"
  | "coffee-break";

export interface StudioPracticalWorkModeSpec {
  readonly id: StudioPracticalWorkModeId;
  readonly labelKo: string;
  readonly badgeKo: string;
  readonly dndShieldActive: boolean;
  readonly descriptionKo: string;
}

export interface StudioDeskQualityChecklistItem {
  readonly id: string;
  readonly labelKo: string;
  readonly checked: boolean;
}

export interface StudioDeskRetakeNote {
  readonly id: string;
  readonly authorKo: string;
  readonly noteKo: string;
  readonly resolved: boolean;
}

export interface StudioPracticalDeskWorkbenchSpec {
  readonly deskId: string;
  readonly dccFileName: string;
  readonly dccAppBadge: string;
  readonly nextDepartmentKo: string;
  readonly checklist: readonly StudioDeskQualityChecklistItem[];
  readonly checklistCompletionPercent: number;
  readonly retakeNotes: readonly StudioDeskRetakeNote[];
  readonly handoffCount: number;
}

export interface StudioPomodoroSprintState {
  readonly isRunning: boolean;
  readonly sprintDurationMinutes: number;
  readonly remainingMinutes: number;
  readonly completedSprintsCount: number;
  readonly todayCompletedCuts: number;
  readonly todayTargetCuts: number;
  readonly deadlineHoursRemaining: number;
}

export interface StudioPracticalWorkbenchState {
  readonly workModeId: StudioPracticalWorkModeId;
  readonly pomodoro: StudioPomodoroSprintState;
  readonly deskWorkbenches: Readonly<Record<string, StudioPracticalDeskWorkbenchSpec>>;
  readonly lastGeneratedHandoffMarkdown: string;
}

export const STUDIO_PRACTICAL_WORK_MODES: readonly StudioPracticalWorkModeSpec[] = [
  {
    id: "deep-focus-dnd",
    labelKo: "초집중 작화 (DND)",
    badgeKo: "방해금지 · 긴급 노크만 허용",
    dndShieldActive: true,
    descriptionKo: "외부 음성 호출을 자동 차단하고 펜 ASMR과 마감 타이머에 집중합니다.",
  },
  {
    id: "open-critique",
    labelKo: "합평·질문 환영",
    badgeKo: "근접 음성 즉시 연결",
    dndShieldActive: false,
    descriptionKo: "PD 및 동료 작가가 데스크 반경 내 접근 시 즉시 원고 합평을 시작합니다.",
  },
  {
    id: "pair-drawing",
    labelKo: "듀얼 공동 작화",
    badgeKo: "와콤 화면·레이어 동기화",
    dndShieldActive: false,
    descriptionKo: "선화·배경·채색 작가가 동일 컷 캔버스를 실시간 페어링으로 함께 작업합니다.",
  },
  {
    id: "coffee-break",
    labelKo: "라운지 리프레시",
    badgeKo: "타이머 일시정지 · 휴식",
    dndShieldActive: false,
    descriptionKo: "에스프레소 바 및 마스코트 고양이 라운지에서 손목 스트레칭 및 휴식을 취합니다.",
  },
];

function computeChecklistPercent(
  items: readonly StudioDeskQualityChecklistItem[],
): number {
  if (items.length === 0) return 100;
  const doneCount = items.filter((item) => item.checked).length;
  return Math.round((doneCount / items.length) * 100);
}

export function createInitialPracticalWorkbenchState(): StudioPracticalWorkbenchState {
  const deskC04Checklist: readonly StudioDeskQualityChecklistItem[] = [
    { id: "chk-c04-1", labelKo: "선화 벡터 레이어 및 펜선 굵기 분리 완료", checked: true },
    { id: "chk-c04-2", labelKo: "참격 궤적 이펙트 가이드 폴더 분리", checked: true },
    { id: "chk-c04-3", labelKo: "600dpi 해상도 및 세로 스크롤 여백 규격 확인", checked: false },
  ];
  const deskC19Checklist: readonly StudioDeskQualityChecklistItem[] = [
    { id: "chk-c19-1", labelKo: "3점 투시 카메라 화각(FOV 28mm) 고정", checked: true },
    { id: "chk-c19-2", labelKo: "언리얼 볼류메트릭 포그 패스 분리 추출", checked: true },
    { id: "chk-c19-3", labelKo: "선화/그림자 Z-Depth 채널 정합성 검수", checked: false },
  ];
  const deskC37Checklist: readonly StudioDeskQualityChecklistItem[] = [
    { id: "chk-c37-1", labelKo: "청록 마력 글로우 Add(발광) 레이어 분리", checked: true },
    { id: "chk-c37-2", labelKo: "역광 림라이트 클리핑 마스크 무결성 확인", checked: true },
    { id: "chk-c37-3", labelKo: "D65 색표준 모니터 색수차 1.5px 검수", checked: true },
  ];
  const deskC52Checklist: readonly StudioDeskQualityChecklistItem[] = [
    { id: "chk-c52-1", labelKo: "모바일 세로 스크롤 여백(800px) 가독성 검증", checked: true },
    { id: "chk-c52-2", labelKo: "클리프행어 효과음(콰아앙) 외곽선 레이어 분리", checked: true },
    { id: "chk-c52-3", labelKo: "최종 연재 업로드용 무손실 WebP/PNG 추출", checked: true },
  ];

  return {
    workModeId: "deep-focus-dnd",
    pomodoro: {
      isRunning: true,
      sprintDurationMinutes: 25,
      remainingMinutes: 19,
      completedSprintsCount: 4,
      todayCompletedCuts: 14,
      todayTargetCuts: 18,
      deadlineHoursRemaining: 6.5,
    },
    deskWorkbenches: {
      "desk-ep43-c04": {
        deskId: "desk-ep43-c04",
        dccFileName: "EP43_C04_Action_Slash_v3.clip",
        dccAppBadge: "CLIP STUDIO EX",
        nextDepartmentKo: "수석 채색·VFX 파트 (윤채린)",
        checklist: deskC04Checklist,
        checklistCompletionPercent: computeChecklistPercent(deskC04Checklist),
        retakeNotes: [
          {
            id: "rt-c04-1",
            authorKo: "박서준 PD",
            noteKo: "참격 궤적 각도를 15도 더 가파르게 올리면 각성 타격감이 극대화됩니다.",
            resolved: false,
          },
        ],
        handoffCount: 1,
      },
      "desk-ep43-c19": {
        deskId: "desk-ep43-c19",
        dccFileName: "EP43_C19_ThroneHall_Render_v2.blend",
        dccAppBadge: "Blender 4.2 + Unreal 5.4",
        nextDepartmentKo: "메인 선화·콘티 파트 (한소율)",
        checklist: deskC19Checklist,
        checklistCompletionPercent: computeChecklistPercent(deskC19Checklist),
        retakeNotes: [
          {
            id: "rt-c19-1",
            authorKo: "한소율 작가",
            noteKo: "대성당 기둥 그림자가 캐릭터 얼굴을 가리지 않도록 주광 각도 +10도 보정 요청",
            resolved: true,
          },
        ],
        handoffCount: 2,
      },
      "desk-ep43-c37": {
        deskId: "desk-ep43-c37",
        dccFileName: "EP43_C37_Awakening_Glow_v4.psd",
        dccAppBadge: "Photoshop + After Effects",
        nextDepartmentKo: "식자·음향효과 파트 (조하늘)",
        checklist: deskC37Checklist,
        checklistCompletionPercent: computeChecklistPercent(deskC37Checklist),
        retakeNotes: [
          {
            id: "rt-c37-1",
            authorKo: "박서준 PD",
            noteKo: "안광 하이라이트 채도를 10% 높여 마력 폭발 대비를 강조해 주세요.",
            resolved: false,
          },
        ],
        handoffCount: 1,
      },
      "desk-ep43-c52": {
        deskId: "desk-ep43-c52",
        dccFileName: "EP43_C52_Finale_Typeset_v5.clip",
        dccAppBadge: "CLIP STUDIO 식자·감리",
        nextDepartmentKo: "총괄 편집장 최종 업로드 큐 (박서준)",
        checklist: deskC52Checklist,
        checklistCompletionPercent: computeChecklistPercent(deskC52Checklist),
        retakeNotes: [
          {
            id: "rt-c52-1",
            authorKo: "서유진 스토리작가",
            noteKo: "엔딩 독백 말풍선 자간을 -2% 조여 긴장감 호흡 반영 완료",
            resolved: true,
          },
        ],
        handoffCount: 3,
      },
    },
    lastGeneratedHandoffMarkdown: "",
  };
}

export function setPracticalWorkMode(
  state: StudioPracticalWorkbenchState,
  modeId: StudioPracticalWorkModeId,
): StudioPracticalWorkbenchState {
  return {
    ...state,
    workModeId: modeId,
    pomodoro: {
      ...state.pomodoro,
      isRunning: modeId === "coffee-break" ? false : state.pomodoro.isRunning,
    },
  };
}

export function togglePomodoroSprintRunning(
  state: StudioPracticalWorkbenchState,
): StudioPracticalWorkbenchState {
  return {
    ...state,
    pomodoro: {
      ...state.pomodoro,
      isRunning: !state.pomodoro.isRunning,
    },
  };
}

export function completePomodoroSprintAndCut(
  state: StudioPracticalWorkbenchState,
): StudioPracticalWorkbenchState {
  return {
    ...state,
    pomodoro: {
      ...state.pomodoro,
      completedSprintsCount: state.pomodoro.completedSprintsCount + 1,
      todayCompletedCuts: Math.min(
        state.pomodoro.todayTargetCuts + 10,
        state.pomodoro.todayCompletedCuts + 1,
      ),
      remainingMinutes: state.pomodoro.sprintDurationMinutes,
    },
  };
}

export function toggleDeskQualityChecklistItem(
  state: StudioPracticalWorkbenchState,
  deskId: string,
  itemId: string,
): StudioPracticalWorkbenchState {
  const target = state.deskWorkbenches[deskId];
  if (!target) return state;

  const updatedChecklist = target.checklist.map((item) =>
    item.id === itemId ? { ...item, checked: !item.checked } : item,
  );

  return {
    ...state,
    deskWorkbenches: {
      ...state.deskWorkbenches,
      [deskId]: {
        ...target,
        checklist: updatedChecklist,
        checklistCompletionPercent: computeChecklistPercent(updatedChecklist),
      },
    },
  };
}

export function addDeskRetakeNote(
  state: StudioPracticalWorkbenchState,
  deskId: string,
  authorKo: string,
  noteKo: string,
): StudioPracticalWorkbenchState {
  const trimmed = noteKo.trim();
  const target = state.deskWorkbenches[deskId];
  if (!trimmed || !target) return state;

  const nextNote: StudioDeskRetakeNote = {
    id: `rt-${deskId}-${target.retakeNotes.length + 1}`,
    authorKo: authorKo.trim() || "총괄 PD",
    noteKo: trimmed,
    resolved: false,
  };

  return {
    ...state,
    deskWorkbenches: {
      ...state.deskWorkbenches,
      [deskId]: {
        ...target,
        retakeNotes: [nextNote, ...target.retakeNotes],
      },
    },
  };
}

export function toggleResolveDeskRetakeNote(
  state: StudioPracticalWorkbenchState,
  deskId: string,
  retakeId: string,
): StudioPracticalWorkbenchState {
  const target = state.deskWorkbenches[deskId];
  if (!target) return state;

  return {
    ...state,
    deskWorkbenches: {
      ...state.deskWorkbenches,
      [deskId]: {
        ...target,
        retakeNotes: target.retakeNotes.map((note) =>
          note.id === retakeId ? { ...note, resolved: !note.resolved } : note,
        ),
      },
    },
  };
}

export function handoffDeskToNextDepartment(
  state: StudioPracticalWorkbenchState,
  deskId: string,
): StudioPracticalWorkbenchState {
  const target = state.deskWorkbenches[deskId];
  if (!target) return state;

  return {
    ...state,
    deskWorkbenches: {
      ...state.deskWorkbenches,
      [deskId]: {
        ...target,
        handoffCount: target.handoffCount + 1,
      },
    },
  };
}

export function generateDailyStudioHandoffMarkdown(
  workbenchState: StudioPracticalWorkbenchState,
  engineState: NextGenVirtualStudioEngineState,
): StudioPracticalWorkbenchState {
  const activeTheme =
    engineState.themes.find((t) => t.id === engineState.activeThemeId) ??
    engineState.themes[0];
  const activePersona =
    engineState.personas.find((p) => p.id === engineState.activePersonaId) ??
    engineState.personas[0];
  const activeWorkMode =
    STUDIO_PRACTICAL_WORK_MODES.find((m) => m.id === workbenchState.workModeId) ??
    STUDIO_PRACTICAL_WORK_MODES[0];

  const deskLines = engineState.cutDesks.map((desk) => {
    const wb = workbenchState.deskWorkbenches[desk.deskId];
    const openRetakes = wb
      ? wb.retakeNotes.filter((r) => !r.resolved).length
      : 0;
    const stageKo = PIPELINE_STAGE_LABELS_KO[desk.stage];
    return `- [${desk.episodeCode} ${desk.cutNumber}] ${desk.cutTitleKo} | 파일: ${wb?.dccFileName ?? "-"} | 공정: ${stageKo}(${desk.progressPercent}%) | 레이어검수: ${wb?.checklistCompletionPercent ?? 100}% | 미해결 리테이크: ${openRetakes}건 | 다음 인계: ${wb?.nextDepartmentKo ?? "-"}`;
  });

  const quotaPct = Math.round(
    (workbenchState.pomodoro.todayCompletedCuts /
      Math.max(1, workbenchState.pomodoro.todayTargetCuts)) *
      100,
  );

  const markdown = [
    `# [툰스튜디오 일일 원고 마감·인수인계 브리핑]`,
    `- 스튜디오 테마: ${activeTheme.titleKo} (${engineState.lightingMoodId})`,
    `- 작성자 / 근무모드: ${activePersona.nameKo} · ${activeWorkMode.labelKo} (${activeWorkMode.badgeKo})`,
    `- 일일 컷 달성률: ${workbenchState.pomodoro.todayCompletedCuts}/${workbenchState.pomodoro.todayTargetCuts}컷 (${quotaPct}%) · 완료 뽀모도로 ${workbenchState.pomodoro.completedSprintsCount}회 · 마감 D-${workbenchState.pomodoro.deadlineHoursRemaining}h`,
    ...deskLines,
  ].join("\n");

  return {
    ...workbenchState,
    lastGeneratedHandoffMarkdown: markdown,
  };
}
