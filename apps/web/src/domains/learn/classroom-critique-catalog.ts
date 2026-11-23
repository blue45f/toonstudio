/**
 * 교실(/learn/classroom) 5축 실기 루브릭 카탈로그 · 타입 정의 · 합성 초기 제출 데이터.
 */

export type RubricAxisId =
  | "direction-composition"
  | "perspective-anatomy"
  | "lineart-pressure"
  | "balloon-readability"
  | "finish-polish";

export type RubricScoreValue = 1 | 2 | 3 | 4 | 5;
export type RubricGrade = "S" | "A" | "B" | "C";
export type ClassroomSubmissionStatus = "assigned" | "submitted" | "critiqued" | "revised" | "passed";
export type RubricScoreMap = Readonly<Record<RubricAxisId, RubricScoreValue>>;

export interface RubricAxisSpec {
  readonly id: RubricAxisId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortKo: string;
  readonly shortEn: string;
  readonly criteriaKo: string;
  readonly criteriaEn: string;
  readonly lowGuideKo: string;
  readonly lowGuideEn: string;
  readonly polishGuideKo: string;
  readonly polishGuideEn: string;
  readonly suggestedLessonId: string;
}

export interface RedlineVoiceNote {
  readonly durationSec: number;
  readonly transcriptKo: string;
  readonly transcriptEn: string;
  readonly recordedAtIso: string;
}

export interface RedlineCritiquePin {
  readonly id: string;
  readonly cutId: string;
  readonly xPct: number;
  readonly yPct: number;
  readonly axisId: RubricAxisId;
  readonly severity: "must-fix" | "polish";
  readonly noteKo: string;
  readonly noteEn: string;
  readonly checklistItemKo: string;
  readonly checklistItemEn: string;
  readonly voiceNote?: RedlineVoiceNote;
  readonly resolved: boolean;
  readonly resolvedAtIso?: string;
}

export interface ClassroomSubmissionRecord {
  readonly id: string;
  readonly assignmentId: string;
  readonly week: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly studentId: string;
  readonly studentNameKo: string;
  readonly studentNameEn: string;
  readonly instructorNameKo: string;
  readonly instructorNameEn: string;
  readonly cutLabel: string;
  readonly status: ClassroomSubmissionStatus;
  readonly submittedAtIso: string;
  readonly rubricScores: RubricScoreMap;
  readonly redlinePins: readonly RedlineCritiquePin[];
}

export const RUBRIC_AXIS_ORDER: readonly RubricAxisId[] = Object.freeze([
  "direction-composition",
  "perspective-anatomy",
  "lineart-pressure",
  "balloon-readability",
  "finish-polish",
]);

export const FIVE_AXIS_RUBRIC_SPECS: readonly RubricAxisSpec[] = Object.freeze([
  {
    id: "direction-composition",
    labelKo: "연출 · 구성",
    labelEn: "Direction & Composition",
    shortKo: "연출",
    shortEn: "Direction",
    criteriaKo: "세로 스크롤 호흡, 컷 간 여백, 시선 유도 흐름",
    criteriaEn: "Vertical scroll pacing, gutter rhythm, and visual flow",
    lowGuideKo: "컷 간 여백을 넓히고 핵심 감정 컷의 크기를 대비시켜 스크롤 리듬을 확보하세요.",
    lowGuideEn: "Widen panel gutters and vary beat scale to clarify vertical scroll rhythm.",
    polishGuideKo: "전환 컷 직전에 짧은 휴지 여백을 두면 임팩트가 더 선명해집니다.",
    polishGuideEn: "Add a brief beat of negative space before reveal panels for stronger impact.",
    suggestedLessonId: "scroll-rhythm",
  },
  {
    id: "perspective-anatomy",
    labelKo: "투시 · 인체",
    labelEn: "Perspective & Anatomy",
    shortKo: "투시/인체",
    shortEn: "Perspective",
    criteriaKo: "아이레벨·소실점 정합성, 인체 비율과 동세 실루엣",
    criteriaEn: "Eye-level vanishing alignment, body proportions, and gesture",
    lowGuideKo: "아이레벨 기준선을 먼저 고정하고 캐릭터 발밑과 배경 소실점을 일치시키세요.",
    lowGuideEn: "Lock the eye-level horizon first and ground character feet to vanishing lines.",
    polishGuideKo: "과장된 앵글 컷에서 손·어깨 단축 투시를 한 번 더 점검하면 밀도가 올라갑니다.",
    polishGuideEn: "Double-check foreshortened hands and shoulders in extreme camera angles.",
    suggestedLessonId: "camera-perspective",
  },
  {
    id: "lineart-pressure",
    labelKo: "선화 · 필압",
    labelEn: "Lineart & Pen Pressure",
    shortKo: "선화",
    shortEn: "Lineart",
    criteriaKo: "외곽·내부 선 강약, 닫힌 외곽선 정리, 떨림 최소화",
    criteriaEn: "Outer/inner line weight contrast, closed contours, clean strokes",
    lowGuideKo: "인물 외곽선은 굵게, 내부선은 얇게 분리하고 열린 틈새를 봉합하세요.",
    lowGuideEn: "Separate thicker outer silhouettes from thinner interior lines and seal open gaps.",
    polishGuideKo: "광원 반대편 그림자 쪽 선 굵기를 보강하면 입체감이 살아납니다.",
    polishGuideEn: "Add subtle weight along shadow-side contours to enhance form depth.",
    suggestedLessonId: "inking",
  },
  {
    id: "balloon-readability",
    labelKo: "말풍선 · 가독성",
    labelEn: "Balloons & Readability",
    shortKo: "말풍선",
    shortEn: "Lettering",
    criteriaKo: "모바일 360px 기준 대사 줄바꿈, 시선 순서, 꼬리 방향",
    criteriaEn: "Mobile line breaks, reading order, and clear tail direction",
    lowGuideKo: "한 말풍선 대사를 2~3줄 이내로 줄이고 상단 좌→우 시선 순서로 재배치하세요.",
    lowGuideEn: "Trim each balloon to 2-3 lines and align reading order top-to-bottom.",
    polishGuideKo: "말풍선 안쪽 여백을 균일하게 맞추고 꼬리가 화자 입 방향을 향하게 다듬으세요.",
    polishGuideEn: "Balance inner balloon padding and aim tails cleanly toward the speaker.",
    suggestedLessonId: "lettering",
  },
  {
    id: "finish-polish",
    labelKo: "마감 · 완성도",
    labelEn: "Finish & Polish",
    shortKo: "마감",
    shortEn: "Polish",
    criteriaKo: "레이어 정리, 색 번짐 누락, 800px/1600px 최종 출고 품질",
    criteriaEn: "Layer hygiene, clean fills, and mobile/print delivery readiness",
    lowGuideKo: "채색 삐져나옴·임시 레이어를 정리하고 모바일 축소 미리보기로 검수하세요.",
    lowGuideEn: "Clean stray color bleed and temp layers, then verify in mobile preview.",
    polishGuideKo: "최종 출고 전 비출력 가이드 레이어 숨김과 해상도 기준을 재확인하세요.",
    polishGuideEn: "Confirm non-print guide layers are hidden and export resolution meets spec.",
    suggestedLessonId: "publish-check",
  },
]);

/** 교실 첨삭 워크벤치 체험용 합성 초기 제출 데이터(실제 학생 데이터 아님). */
export function createInitialClassroomSubmissions(): ClassroomSubmissionRecord[] {
  return [
    {
      id: "sub-w2-scroll", assignmentId: "asg-scroll-rhythm", week: 2,
      titleKo: "세로 스크롤 3컷 감정 전환 콘티", titleEn: "3-Panel Vertical Scroll Beat Storyboard",
      studentId: "stu-jiwoo", studentNameKo: "김지우", studentNameEn: "Jiwoo Kim",
      instructorNameKo: "박서진 강사", instructorNameEn: "Instructor Seojin Park",
      cutLabel: "CUT-02-03", status: "passed", submittedAtIso: "2026-11-18T14:20:00Z",
      rubricScores: { "direction-composition": 5, "perspective-anatomy": 4, "lineart-pressure": 5, "balloon-readability": 5, "finish-polish": 4 },
      redlinePins: [{
        id: "pin-01", cutId: "CUT-02-03", xPct: 68, yPct: 26, axisId: "balloon-readability", severity: "polish",
        noteKo: "말풍선 꼬리가 인물 시선과 겹치지 않게 오른쪽 상단으로 6% 이동",
        noteEn: "Shift balloon tail 6% up-right so it clears the character gaze line.",
        checklistItemKo: "말풍선 꼬리 각도 정리 및 모바일 360px 가독성 확인",
        checklistItemEn: "Adjust balloon tail angle and verify 360px mobile readability",
        voiceNote: { durationSec: 18, transcriptKo: "대사 리듬은 좋습니다. 꼬리만 살짝 올려 주세요.", transcriptEn: "Strong dialogue rhythm. Raise the final tail slightly.", recordedAtIso: "2026-11-19T09:10:00Z" },
        resolved: true, resolvedAtIso: "2026-11-20T11:00:00Z",
      }],
    },
    {
      id: "sub-w4-persp", assignmentId: "asg-perspective-action", week: 4,
      titleKo: "하이앵글 골목 추격 1컷 투시·선화", titleEn: "High-Angle Alley Chase Perspective & Lineart",
      studentId: "stu-jiwoo", studentNameKo: "김지우", studentNameEn: "Jiwoo Kim",
      instructorNameKo: "박서진 강사", instructorNameEn: "Instructor Seojin Park",
      cutLabel: "CUT-04-07", status: "critiqued", submittedAtIso: "2026-11-21T16:45:00Z",
      rubricScores: { "direction-composition": 4, "perspective-anatomy": 3, "lineart-pressure": 3, "balloon-readability": 4, "finish-polish": 3 },
      redlinePins: [
        {
          id: "pin-02", cutId: "CUT-04-07", xPct: 34, yPct: 62, axisId: "perspective-anatomy", severity: "must-fix",
          noteKo: "왼발 접지면이 소실점 기준선보다 12px 떠 있어 지면 접지 보정 필요",
          noteEn: "Left foot sits 12px above the vanishing ground plane; anchor heel to alley grid.",
          checklistItemKo: "소실점 가이드에 맞춰 발밑 그림자와 접지선 보정",
          checklistItemEn: "Align foot contact shadow and ground line to vanishing guide",
          voiceNote: { durationSec: 26, transcriptKo: "하이앵글 긴장감이 좋습니다. 왼발만 소실점 선에 붙여 주세요.", transcriptEn: "Strong high-angle tension. Ground the left foot to the vanishing line.", recordedAtIso: "2026-11-22T10:15:00Z" },
          resolved: false,
        },
        {
          id: "pin-03", cutId: "CUT-04-07", xPct: 76, yPct: 48, axisId: "lineart-pressure", severity: "must-fix",
          noteKo: "코트 소매 끝 선화 열린 틈새 2곳 봉합 필요 (밑색 누수 방지)",
          noteEn: "Seal 2 open contour gaps at coat cuff to prevent flatting color leaks.",
          checklistItemKo: "소매 외곽선 닫힌 영역 봉합 및 필압 강약 보강",
          checklistItemEn: "Close sleeve contour gaps and strengthen outer line weight",
          resolved: false,
        },
      ],
    },
    {
      id: "sub-w5-ink-draft", assignmentId: "asg-inking-draft", week: 5,
      titleKo: "역광 실내 대화 컷 선화 초안", titleEn: "Backlit Interior Dialogue Inking Draft",
      studentId: "stu-jiwoo", studentNameKo: "김지우", studentNameEn: "Jiwoo Kim",
      instructorNameKo: "박서진 강사", instructorNameEn: "Instructor Seojin Park",
      cutLabel: "CUT-05-02", status: "submitted", submittedAtIso: "2026-11-22T19:00:00Z",
      rubricScores: { "direction-composition": 3, "perspective-anatomy": 2, "lineart-pressure": 2, "balloon-readability": 3, "finish-polish": 2 },
      redlinePins: [{
        id: "pin-04", cutId: "CUT-05-02", xPct: 52, yPct: 40, axisId: "lineart-pressure", severity: "must-fix",
        noteKo: "역광 외곽선 강약이 균일해 실루엣이 뭉개짐 — 외곽 2배 강약 분리",
        noteEn: "Uniform stroke width flattens backlit silhouette; double outer contour contrast.",
        checklistItemKo: "역광 실루엣 외곽선 굵기 분리 후 재제출",
        checklistItemEn: "Separate backlit silhouette outer line weight and resubmit",
        resolved: false,
      }],
    },
  ];
}
