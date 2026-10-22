import { LESSONS } from "./learning-content";
import type { LearningProgress, Lesson } from "./learning-model";

export const LEARNING_LEVELS = ["starter", "growing", "advanced"] as const;
export type LearningLevel = (typeof LEARNING_LEVELS)[number];

export const LEARNING_GOALS = ["first-episode", "story", "visual", "studio", "publish"] as const;
export type LearningGoal = (typeof LEARNING_GOALS)[number];

export const SKILL_IDS = ["story", "direction", "drawing", "color", "lettering", "workflow"] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export interface SkillDefinition {
  id: SkillId;
  label: string;
  description: string;
}

export interface LessonMeta {
  level: LearningLevel;
  skills: readonly SkillId[];
  outcome: string;
  format: "concept-lab" | "studio-practice";
}

export interface LearningPath {
  id: string;
  title: string;
  summary: string;
  outcome: string;
  level: LearningLevel;
  lessonIds: readonly string[];
  recommendedGoals: readonly LearningGoal[];
}

export interface PathStats {
  total: number;
  started: number;
  completed: number;
  percent: number;
  totalMinutes: number;
  remainingMinutes: number;
}

export type LessonState = "not-started" | "in-progress" | "completed";

export const SKILLS: readonly SkillDefinition[] = [
  { id: "story", label: "이야기 설계", description: "로그라인과 장면의 목표를 컷으로 바꾸는 힘" },
  { id: "direction", label: "컷 연출", description: "시선, 호흡, 카메라와 정보 순서를 설계하는 힘" },
  { id: "drawing", label: "드로잉", description: "형태, 실루엣, 투시와 선의 역할을 통제하는 힘" },
  { id: "color", label: "채색", description: "명도, 밑색, 음영과 합성 범위를 구분하는 힘" },
  { id: "lettering", label: "대사·말풍선", description: "대화의 순서와 읽기 편한 글자 공간을 만드는 힘" },
  { id: "workflow", label: "제작 워크플로", description: "레이어, 원본, 내보내기와 검수를 안전하게 잇는 힘" },
];

export const LESSON_META: Readonly<Record<string, LessonMeta>> = {
  "story-board": { level: "starter", skills: ["story", "direction"], outcome: "상황·변화·반응이 분명한 3컷 콘티", format: "concept-lab" },
  "scroll-rhythm": { level: "starter", skills: ["direction"], outcome: "의도에 맞는 두 가지 스크롤 호흡안", format: "concept-lab" },
  "camera-perspective": { level: "growing", skills: ["direction", "drawing"], outcome: "아이레벨과 소실점이 일관된 공간 초안", format: "concept-lab" },
  "character-silhouette": { level: "growing", skills: ["drawing", "color"], outcome: "작게 보아도 행동과 초점이 읽히는 한 컷", format: "concept-lab" },
  inking: { level: "growing", skills: ["drawing", "workflow"], outcome: "선 굵기의 이유가 드러나는 비교 시트", format: "concept-lab" },
  "color-layers": { level: "growing", skills: ["color", "workflow"], outcome: "밑색·음영·클리핑이 분리된 채색 구조", format: "concept-lab" },
  lettering: { level: "starter", skills: ["lettering", "direction"], outcome: "대화 순서가 한눈에 읽히는 말풍선 배치", format: "concept-lab" },
  "publish-check": { level: "advanced", skills: ["color", "lettering", "workflow"], outcome: "원본과 게시본을 분리한 최종 검수 기록", format: "concept-lab" },
  "studio-first-page": { level: "starter", skills: ["story", "direction", "workflow"], outcome: "툰스튜디오에서 만든 첫 3컷 러프", format: "studio-practice" },
  "studio-layer-practice": { level: "growing", skills: ["drawing", "color", "workflow"], outcome: "수정 가능한 레이어 원본과 확인된 내보내기", format: "studio-practice" },
  "episode-arc": { level: "growing", skills: ["story", "direction"], outcome: "질문·고조·답이 대응하는 한 회차 구조표", format: "concept-lab" },
  "character-consistency": { level: "growing", skills: ["drawing", "color"], outcome: "비율·표정·기준색이 정리된 캐릭터 시트 한 장", format: "concept-lab" },
  "background-scene": { level: "growing", skills: ["direction", "drawing"], outcome: "장소와 시간대가 읽히는 배경 설계안", format: "concept-lab" },
  "tone-effects": { level: "growing", skills: ["color", "drawing"], outcome: "표면마다 명도와 패턴이 구분된 한 컷", format: "concept-lab" },
  "feedback-revision": { level: "advanced", skills: ["story", "workflow"], outcome: "수정 지시문과 전후 비교 기록이 있는 수정본", format: "concept-lab" },
  "studio-background-practice": { level: "growing", skills: ["direction", "drawing", "workflow"], outcome: "인물과 배경이 한 공간에 있는 배경 컷", format: "studio-practice" },
  "studio-lettering-practice": { level: "growing", skills: ["lettering", "direction", "workflow"], outcome: "축소 검수를 마친 대화 장면 한 컷", format: "studio-practice" },
  "studio-episode-assembly": { level: "advanced", skills: ["story", "direction", "workflow"], outcome: "조립과 검수를 마친 한 회차 조립본", format: "studio-practice" },  "serial-schedule": { level: "growing", skills: ["workflow", "story"], outcome: "게시일에서 거꾸로 계산한 단계별 마감 계획표", format: "concept-lab" },
  "studio-serial-calendar": { level: "growing", skills: ["workflow", "direction"], outcome: "게시일과 제작 일정이 함께 배치된 연재 캘린더", format: "studio-practice" },
  "hiatus-notice-ops": { level: "growing", skills: ["workflow", "lettering"], outcome: "사유·기간·복귀 회차가 담긴 공지문과 복귀 일정", format: "concept-lab" },
  "reader-data-reading": { level: "advanced", skills: ["workflow", "story"], outcome: "지표 근거와 다음 회차 반영 가설이 적힌 운영 메모", format: "concept-lab" },
  "team-roles-permissions": { level: "growing", skills: ["workflow"], outcome: "작업 단위별 책임자·결정자·권한이 정리된 분담표", format: "concept-lab" },
  "studio-co-drawing": { level: "growing", skills: ["drawing", "workflow"], outcome: "영역 분담과 병합 검수를 마친 공동 제작 컷", format: "studio-practice" },
  "review-approval-flow": { level: "advanced", skills: ["workflow", "direction"], outcome: "검수 범위와 결정 이유가 남는 검수·승인 기록 양식", format: "concept-lab" },
  "outsourcing-communication": { level: "advanced", skills: ["workflow", "lettering"], outcome: "산출물·규격·일정·수정 범위가 합의된 외주 메모", format: "concept-lab" },
  "classroom-operations": { level: "growing", skills: ["workflow", "story"], outcome: "복습 주차와 진단 과제가 포함된 교실 운영 계획", format: "concept-lab" },
  "assignment-design": { level: "growing", skills: ["workflow", "direction"], outcome: "목표·규격·기한·피드백이 한 장에 담긴 과제 안내문", format: "concept-lab" },
  "studio-classroom-practice": { level: "growing", skills: ["workflow", "story"], outcome: "주차마다 강좌와 과제가 연결된 교실 과정안", format: "studio-practice" },
  "assessment-rubric": { level: "advanced", skills: ["workflow", "color"], outcome: "수준 설명이 관찰 가능한 평가 루브릭 한 장", format: "concept-lab" },
  "season-arc-design": { level: "advanced", skills: ["story", "direction"], outcome: "큰 질문·전환점·답과 비용이 정해진 시즌 아크 표", format: "concept-lab" },
  "color-script": { level: "advanced", skills: ["color", "direction"], outcome: "장면 전환과 색 전환이 맞는 회차 컬러 스크립트", format: "concept-lab" },
  "studio-bg3d-practice": { level: "advanced", skills: ["direction", "drawing", "workflow"], outcome: "3D 배치와 카메라를 기준으로 완성한 배경 컷", format: "studio-practice" },
  "studio-mannequin-pose": { level: "growing", skills: ["drawing", "direction", "workflow"], outcome: "마네킹 구조에 캐릭터 비율을 얹은 포즈 컷", format: "studio-practice" },
  "studio-ai-coloring": { level: "growing", skills: ["color", "workflow"], outcome: "후보 검수와 수정을 거쳐 확정된 채색 컷", format: "studio-practice" },
  "studio-compare-review": { level: "advanced", skills: ["workflow", "color"], outcome: "전후 비교 검수와 확정 결정이 기록된 수정본", format: "studio-practice" },
};

const FALLBACK_META: LessonMeta = {
  level: "starter",
  skills: ["workflow"],
  outcome: "학습 내용을 적용한 제작 결과물",
  format: "concept-lab",
};

export const LEARNING_PATHS: readonly LearningPath[] = [
  {
    id: "first-three-panels",
    title: "첫 3컷 완성",
    summary: "아이디어를 읽히는 세 컷으로 바꾸고 툰스튜디오에서 첫 러프까지 완성합니다.",
    outcome: "상황·변화·반응이 담긴 세 컷 러프와 개선 메모",
    level: "starter",
    lessonIds: ["story-board", "scroll-rhythm", "lettering", "studio-first-page"],
    recommendedGoals: ["first-episode", "story", "studio"],
  },
  {
    id: "story-direction",
    title: "스토리·연출 강화",
    summary: "장면의 목표, 스크롤 호흡, 카메라와 대사의 순서를 하나의 연출 흐름으로 연결합니다.",
    outcome: "공간과 읽는 순서가 설계된 장면 콘티",
    level: "growing",
    lessonIds: ["story-board", "scroll-rhythm", "camera-perspective", "lettering"],
    recommendedGoals: ["story", "visual", "first-episode"],
  },
  {
    id: "visual-finish",
    title: "그림 완성도 올리기",
    summary: "실루엣, 선화, 명도와 레이어 채색을 비교 실험하며 화면의 초점을 정리합니다.",
    outcome: "축소 화면에서도 초점과 수정 구조가 살아 있는 한 컷",
    level: "growing",
    lessonIds: ["character-silhouette", "inking", "color-layers", "studio-layer-practice"],
    recommendedGoals: ["visual", "publish"],
  },
  {
    id: "studio-quickstart",
    title: "툰스튜디오 빠른 시작",
    summary: "기획과 레이어 원리를 짧게 익힌 뒤 실제 작업 화면에서 안전한 제작 흐름을 연습합니다.",
    outcome: "세 컷 초안, 분리된 레이어 원본, 확인한 내보내기",
    level: "starter",
    lessonIds: ["story-board", "studio-first-page", "color-layers", "studio-layer-practice"],
    recommendedGoals: ["studio", "first-episode"],
  },
  {
    id: "publish-ready",
    title: "첫 회차 게시 준비",
    summary: "이야기와 대사, 채색 구조를 점검하고 실제 게시 크기의 결과물까지 검수합니다.",
    outcome: "수정 가능한 원본, 게시본, 체크리스트가 갖춰진 첫 회차",
    level: "advanced",
    lessonIds: ["story-board", "lettering", "color-layers", "publish-check"],
    recommendedGoals: ["publish", "first-episode"],
  },
  {
    id: "episode-production",
    title: "한 회차 제작 워크플로",
    summary: "회차 구조 설계부터 배경, 톤 마무리, 스튜디오 조립까지 실제 제작 순서를 따라갑니다.",
    outcome: "구조표와 조립 검수 기록이 갖춰진 한 회차 제작본",
    level: "growing",
    lessonIds: ["episode-arc", "background-scene", "tone-effects", "studio-episode-assembly"],
    recommendedGoals: ["first-episode", "publish"],
  },
  {
    id: "character-consistency-path",
    title: "캐릭터 일관성 다지기",
    summary: "캐릭터 시트로 기준을 세우고 실루엣과 배경 속에서도 같은 인물이 읽히게 연습합니다.",
    outcome: "기준이 정리된 캐릭터 시트와 배경 속 캐릭터 한 컷",
    level: "growing",
    lessonIds: ["character-consistency", "character-silhouette", "background-scene", "studio-background-practice"],
    recommendedGoals: ["visual", "story"],
  },
  {
    id: "review-and-finish",
    title: "리뷰·수정으로 완성도 올리기",
    summary: "피드백을 수정 지시로 바꾸고 대사와 조립을 검수하며 완성도를 끌어올립니다.",
    outcome: "수정 전후 비교와 검수를 마친 완성 회차",
    level: "advanced",
    lessonIds: ["feedback-revision", "tone-effects", "studio-lettering-practice", "studio-episode-assembly"],
    recommendedGoals: ["publish", "visual"],
  },  {
    id: "serial-operations",
    title: "연재 운영 루틴",
    summary: "단계별 마감 계획과 연재 캘린더, 공지 운영과 지표 읽기를 하나의 연재 리듬으로 연결합니다.",
    outcome: "일정·캘린더·공지·지표가 이어지는 연재 운영 기록",
    level: "growing",
    lessonIds: ["serial-schedule", "studio-serial-calendar", "hiatus-notice-ops", "reader-data-reading"],
    recommendedGoals: ["publish"],
  },
  {
    id: "collaboration-production",
    title: "협업 제작 파이프라인",
    summary: "역할과 권한을 정하고 동시 드로잉과 검수·승인, 외주 합의까지 팀 제작의 흐름을 만듭니다.",
    outcome: "분담표와 검수 기록이 갖춰진 팀 제작 한 회차",
    level: "advanced",
    lessonIds: ["team-roles-permissions", "studio-co-drawing", "review-approval-flow", "outsourcing-communication"],
    recommendedGoals: ["studio", "publish"],
  },
  {
    id: "classroom-teaching",
    title: "교실 운영과 과제 설계",
    summary: "교실 운영 계획과 과제 설계, 템플릿 과정안과 루브릭 평가로 가르치는 제작 과정을 설계합니다.",
    outcome: "운영 계획·과제 안내·과정안·루브릭이 갖춰진 한 과정",
    level: "growing",
    lessonIds: ["classroom-operations", "assignment-design", "studio-classroom-practice", "assessment-rubric"],
    recommendedGoals: ["first-episode", "story"],
  },
  {
    id: "advanced-craft",
    title: "심화 제작: 시즌·색·공간·검수",
    summary: "시즌 아크와 컬러 스크립트, 3D 배경과 마네킹, AI 채색 후보와 비교 검수로 완성도를 끌어올립니다.",
    outcome: "시즌 설계와 색 흐름, 공간 실습과 비교 검수를 거친 심화 회차",
    level: "advanced",
    lessonIds: ["season-arc-design", "color-script", "studio-bg3d-practice", "studio-mannequin-pose", "studio-ai-coloring", "studio-compare-review"],
    recommendedGoals: ["visual", "publish"],
  },
];

const LEVEL_RANK: Readonly<Record<LearningLevel, number>> = { starter: 0, growing: 1, advanced: 2 };

export function getLessonMeta(lessonId: string): LessonMeta {
  return LESSON_META[lessonId] ?? FALLBACK_META;
}

export function getLessonState(progress: LearningProgress, lessonId: string): LessonState {
  const saved = progress.lessons[lessonId];
  if (saved?.completed) return "completed";
  if (saved && (saved.checks.length > 0 || saved.answer !== null || saved.notes.trim().length > 0)) return "in-progress";
  return "not-started";
}

/** Requirement progress is derived from valid unique checks and the correct answer, never from raw array length. */
export function getLessonRequirementProgress(lesson: Lesson, progress: LearningProgress): number {
  const saved = progress.lessons[lesson.id];
  if (!saved) return 0;
  if (saved.completed) return 100;
  const checked = new Set(saved.checks.filter((index) => Number.isInteger(index) && index >= 0 && index < lesson.checks.length)).size;
  const correct = saved.answer === lesson.quiz.answer ? 1 : 0;
  const total = Math.max(1, lesson.checks.length + 1);
  return Math.min(100, Math.round(((checked + correct) / total) * 100));
}

export function getPathLessons(path: LearningPath, lessons: readonly Lesson[] = LESSONS): Lesson[] {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  return path.lessonIds.map((id) => byId.get(id)).filter((lesson): lesson is Lesson => Boolean(lesson));
}

export function getPathStats(path: LearningPath, progress: LearningProgress): PathStats {
  const lessons = getPathLessons(path);
  const states = lessons.map((lesson) => getLessonState(progress, lesson.id));
  const completed = states.filter((state) => state === "completed").length;
  const started = states.filter((state) => state !== "not-started").length;
  const totalMinutes = lessons.reduce((sum, lesson) => sum + lesson.minutes, 0);
  const remainingMinutes = lessons.reduce((sum, lesson) => sum + (getLessonState(progress, lesson.id) === "completed" ? 0 : lesson.minutes), 0);
  return {
    total: lessons.length,
    started,
    completed,
    percent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
    totalMinutes,
    remainingMinutes,
  };
}

export function recommendLearningPath(goal: LearningGoal, level: LearningLevel): LearningPath {
  const ranked = LEARNING_PATHS.map((path, index) => {
    const goalIndex = path.recommendedGoals.indexOf(goal);
    const goalScore = goalIndex < 0 ? 0 : goalIndex === 0 ? 8 : 6;
    const distance = Math.abs(LEVEL_RANK[path.level] - LEVEL_RANK[level]);
    const levelScore = distance === 0 ? 3 : distance === 1 ? 1 : 0;
    return { path, index, score: goalScore + levelScore };
  });
  ranked.sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0].path;
}

/** Resume active work first, then continue untouched lessons in curriculum order within the time budget. */
export function buildSessionPlan(path: LearningPath, progress: LearningProgress, budgetMinutes: number): Lesson[] {
  const lessons = getPathLessons(path);
  const inProgress = lessons.filter((lesson) => getLessonState(progress, lesson.id) === "in-progress");
  const untouched = lessons.filter((lesson) => getLessonState(progress, lesson.id) === "not-started");
  const candidates = inProgress.length || untouched.length ? [...inProgress, ...untouched] : lessons;
  const budget = Number.isFinite(budgetMinutes) ? Math.max(5, Math.min(120, Math.round(budgetMinutes))) : 30;
  const selected: Lesson[] = [];
  let total = 0;
  for (const lesson of candidates) {
    if (selected.length === 0 || total + lesson.minutes <= budget) {
      selected.push(lesson);
      total += lesson.minutes;
    }
  }
  return selected;
}

export function getSkillProgress(progress: LearningProgress) {
  return SKILLS.map((skill) => {
    const lessons = LESSONS.filter((lesson) => getLessonMeta(lesson.id).skills.includes(skill.id));
    const completed = lessons.filter((lesson) => getLessonState(progress, lesson.id) === "completed").length;
    return {
      ...skill,
      completed,
      total: lessons.length,
      percent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
    };
  });
}
