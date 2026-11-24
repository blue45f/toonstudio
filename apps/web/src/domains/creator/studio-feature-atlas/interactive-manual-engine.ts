/**
 * 역할별 10분 인터랙티브 실습 매뉴얼 진행률 엔진 · 한국어/초성/단축키 통합 검색기 · 맥락별 FAQ 필터.
 *
 * - 브라우저 영구 저장소 없이 순수 메모리 상태로만 체크리스트 진행률을 계산한다.
 * - 일상 한국어, 초성(예: "ㅁㅍㅅ", "ㅅㄸ"), 영문·단축키 조합(예: "Shift+T", "Alt+C")을 함께 검색한다.
 */

import {
  CONTEXTUAL_TROUBLESHOOTING_FAQS,
  CREATOR_ROLE_MANUALS,
  type ContextualTroubleshootingFaq,
  type CreatorRoleId,
  type CreatorRoleManual,
  type ManualPracticeStep,
} from "./interactive-manual-data";
import {
  DIFFERENTIATOR_SHOWCASE_CARDS,
  STUDIO_FEATURE_AXES,
  STUDIO_SHORTCUT_CHEATSHEET,
  getAllStudioFeatures,
  type DifferentiatorShowcaseCard,
  type FeatureAxisId,
  type StudioFeatureItem,
  type StudioShortcutEntry,
} from "./studio-feature-catalog";

export {
  CONTEXTUAL_TROUBLESHOOTING_FAQS,
  CREATOR_ROLE_MANUALS,
  type ContextualTroubleshootingFaq,
  type CreatorRoleId,
  type CreatorRoleManual,
  type ManualPracticeStep,
};

export interface RoleManualProgress {
  readonly roleId: CreatorRoleId;
  readonly completedCount: number;
  readonly totalCount: number;
  readonly completionPct: number;
  readonly completedMinutes: number;
  readonly remainingMinutes: number;
  readonly isAllDone: boolean;
  readonly completedStepIds: readonly string[];
  readonly nextStep: ManualPracticeStep | null;
}

export interface OverallManualProgress {
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly completionPct: number;
  readonly completedRoles: number;
  readonly totalRoles: number;
}

export interface UnifiedAtlasSearchResult {
  readonly query: string;
  readonly normalizedQuery: string;
  readonly differentiators: readonly DifferentiatorShowcaseCard[];
  readonly features: readonly StudioFeatureItem[];
  readonly shortcuts: readonly StudioShortcutEntry[];
  readonly faqs: readonly ContextualTroubleshootingFaq[];
  readonly totalCount: number;
}

const HANGUL_SYLLABLE_BASE = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const HANGUL_CHOSEONG_LIST: readonly string[] = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const CHOSEONG_SET = new Set<string>(HANGUL_CHOSEONG_LIST);

/** 한글 문자열에서 초성 시퀀스를 추출한다(예: "말풍선" -> "ㅁㅍㅅ"). */
export function extractHangulChoseong(input: string): string {
  let result = "";
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_SYLLABLE_BASE && code <= HANGUL_SYLLABLE_END) {
      const idx = Math.floor((code - HANGUL_SYLLABLE_BASE) / 588);
      result += HANGUL_CHOSEONG_LIST[idx] ?? ch;
    } else if (CHOSEONG_SET.has(ch)) {
      result += ch;
    }
  }
  return result;
}

function isPureChoseongQuery(normalized: string): boolean {
  if (normalized.length === 0) return false;
  for (const ch of normalized) {
    if (!CHOSEONG_SET.has(ch)) return false;
  }
  return true;
}

function normalizeSearchText(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function compactShortcutText(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function scoreTextMatch(haystacks: readonly string[], query: string): number {
  const normalized = normalizeSearchText(query);
  if (!normalized) return 0;
  const compactQuery = compactShortcutText(normalized);
  const pureChoseong = isPureChoseongQuery(compactQuery);
  const tokens = normalized.split(" ").filter(Boolean);

  let bestScore = 0;
  for (const rawField of haystacks) {
    const field = normalizeSearchText(rawField);
    const compactField = compactShortcutText(rawField);
    if (compactField === compactQuery) {
      bestScore = Math.max(bestScore, 120);
      continue;
    }
    if (field.startsWith(normalized)) {
      bestScore = Math.max(bestScore, 95);
      continue;
    }
    if (field.includes(normalized) || compactField.includes(compactQuery)) {
      bestScore = Math.max(bestScore, 75);
      continue;
    }
    if (pureChoseong) {
      const choseong = extractHangulChoseong(rawField);
      if (choseong.includes(compactQuery)) {
        bestScore = Math.max(bestScore, 68);
        continue;
      }
    }
  }

  if (bestScore === 0 && tokens.length > 1) {
    const joined = normalizeSearchText(haystacks.join(" "));
    if (tokens.every((token) => joined.includes(token))) {
      bestScore = 60;
    }
  }
  return bestScore;
}

export function getRoleManualById(roleId: CreatorRoleId): CreatorRoleManual | undefined {
  return CREATOR_ROLE_MANUALS.find((manual) => manual.roleId === roleId);
}

/** 특정 역할의 체크리스트 완료율·남은 시간·다음 단계를 순수 함수로 계산한다. */
export function computeRoleManualProgress(
  roleId: CreatorRoleId,
  completedStepIds: ReadonlySet<string> | readonly string[],
): RoleManualProgress {
  const manual = getRoleManualById(roleId);
  if (!manual) {
    return {
      roleId,
      completedCount: 0,
      totalCount: 0,
      completionPct: 0,
      completedMinutes: 0,
      remainingMinutes: 0,
      isAllDone: false,
      completedStepIds: [],
      nextStep: null,
    };
  }

  const completedSet = completedStepIds instanceof Set ? completedStepIds : new Set(completedStepIds);
  const validCompletedIds: string[] = [];
  let completedMinutes = 0;
  let nextStep: ManualPracticeStep | null = null;

  for (const step of manual.steps) {
    if (completedSet.has(step.id)) {
      validCompletedIds.push(step.id);
      completedMinutes += step.durationMinutes;
    } else if (nextStep === null) {
      nextStep = step;
    }
  }

  const totalCount = manual.steps.length;
  const completedCount = validCompletedIds.length;
  const completionPct = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const remainingMinutes = Math.max(0, manual.totalMinutes - completedMinutes);

  return {
    roleId,
    completedCount,
    totalCount,
    completionPct,
    completedMinutes,
    remainingMinutes,
    isAllDone: totalCount > 0 && completedCount === totalCount,
    completedStepIds: validCompletedIds,
    nextStep,
  };
}

/** 4대 역할 전체의 누적 실습 진행률을 계산한다. */
export function computeOverallManualProgress(
  completedByRole: Readonly<Partial<Record<CreatorRoleId, readonly string[] | ReadonlySet<string>>>>,
): OverallManualProgress {
  let completedSteps = 0;
  let totalSteps = 0;
  let completedRoles = 0;

  for (const manual of CREATOR_ROLE_MANUALS) {
    const progress = computeRoleManualProgress(manual.roleId, completedByRole[manual.roleId] ?? []);
    completedSteps += progress.completedCount;
    totalSteps += progress.totalCount;
    if (progress.isAllDone) {
      completedRoles += 1;
    }
  }

  const completionPct = totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100);
  return {
    completedSteps,
    totalSteps,
    completionPct,
    completedRoles,
    totalRoles: CREATOR_ROLE_MANUALS.length,
  };
}

/** 순수 메모리 전용 역할별 실습 체크리스트 상태 추적기 (브라우저 영구 저장소 비사용). */
export class ManualProgressTracker {
  private readonly completedByRole = new Map<CreatorRoleId, Set<string>>();

  constructor(initial?: Readonly<Partial<Record<CreatorRoleId, readonly string[]>>>) {
    for (const manual of CREATOR_ROLE_MANUALS) {
      const seed = initial?.[manual.roleId] ?? [];
      const validIds = new Set(manual.steps.map((step) => step.id));
      const initialSet = new Set<string>();
      for (const id of seed) {
        if (validIds.has(id)) {
          initialSet.add(id);
        }
      }
      this.completedByRole.set(manual.roleId, initialSet);
    }
  }

  public toggleStep(roleId: CreatorRoleId, stepId: string): RoleManualProgress {
    const set = this.getOrInitRoleSet(roleId);
    const manual = getRoleManualById(roleId);
    if (manual?.steps.some((step) => step.id === stepId)) {
      if (set.has(stepId)) {
        set.delete(stepId);
      } else {
        set.add(stepId);
      }
    }
    return computeRoleManualProgress(roleId, set);
  }

  public setStepCompleted(roleId: CreatorRoleId, stepId: string, completed: boolean): RoleManualProgress {
    const set = this.getOrInitRoleSet(roleId);
    const manual = getRoleManualById(roleId);
    if (manual?.steps.some((step) => step.id === stepId)) {
      if (completed) {
        set.add(stepId);
      } else {
        set.delete(stepId);
      }
    }
    return computeRoleManualProgress(roleId, set);
  }

  public resetRole(roleId: CreatorRoleId): RoleManualProgress {
    this.completedByRole.set(roleId, new Set<string>());
    return computeRoleManualProgress(roleId, []);
  }

  public resetAll(): void {
    for (const manual of CREATOR_ROLE_MANUALS) {
      this.completedByRole.set(manual.roleId, new Set<string>());
    }
  }

  public getRoleProgress(roleId: CreatorRoleId): RoleManualProgress {
    return computeRoleManualProgress(roleId, this.getOrInitRoleSet(roleId));
  }

  public getOverallProgress(): OverallManualProgress {
    const snapshot: Partial<Record<CreatorRoleId, ReadonlySet<string>>> = {};
    for (const manual of CREATOR_ROLE_MANUALS) {
      snapshot[manual.roleId] = this.getOrInitRoleSet(manual.roleId);
    }
    return computeOverallManualProgress(snapshot);
  }

  private getOrInitRoleSet(roleId: CreatorRoleId): Set<string> {
    let existing = this.completedByRole.get(roleId);
    if (!existing) {
      existing = new Set<string>();
      this.completedByRole.set(roleId, existing);
    }
    return existing;
  }
}

/** 한국어 일상어 · 초성 · 단축키로 8대 차별화 카드, 7대 기능 축, 단축키, FAQ를 통합 검색한다. */
export function searchAtlasAndShortcuts(query: string): UnifiedAtlasSearchResult {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return {
      query,
      normalizedQuery: "",
      differentiators: [],
      features: [],
      shortcuts: [],
      faqs: [],
      totalCount: 0,
    };
  }

  const differentiators = DIFFERENTIATOR_SHOWCASE_CARDS.map((card) => ({
    card,
    score: scoreTextMatch(
      [
        card.titleKo,
        card.headlineKo,
        card.summaryKo,
        card.creatorBenefitKo,
        card.badgeKo,
        ...card.specHighlightsKo,
        ...card.keywords,
      ],
      normalizedQuery,
    ),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.card.order - b.card.order)
    .map((entry) => entry.card);

  const axisTitles = new Map<FeatureAxisId, string>(
    STUDIO_FEATURE_AXES.map((axis) => [axis.id, axis.titleKo]),
  );

  const features = getAllStudioFeatures()
    .map((feature) => ({
      feature,
      score: scoreTextMatch(
        [
          feature.titleKo,
          feature.summaryKo,
          feature.badgeKo,
          axisTitles.get(feature.axisId) ?? "",
          ...feature.shortcuts,
          ...feature.keywords,
        ],
        normalizedQuery,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.feature);

  const shortcuts = STUDIO_SHORTCUT_CHEATSHEET.map((shortcut) => ({
    shortcut,
    score: scoreTextMatch(
      [
        shortcut.keys,
        shortcut.actionKo,
        shortcut.tipKo,
        shortcut.categoryLabelKo,
        ...shortcut.keywords,
      ],
      normalizedQuery,
    ),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.shortcut);

  const faqs = CONTEXTUAL_TROUBLESHOOTING_FAQS.map((faq) => ({
    faq,
    score: scoreTextMatch(
      [
        faq.questionKo,
        faq.symptomTagKo,
        ...faq.quickFixStepsKo,
        ...faq.keywords,
      ],
      normalizedQuery,
    ),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.faq);

  return {
    query,
    normalizedQuery,
    differentiators,
    features,
    shortcuts,
    faqs,
    totalCount: differentiators.length + features.length + shortcuts.length + faqs.length,
  };
}

/** 역할 또는 기능 축 맥락에 맞는 빠른 문제 해결 FAQ 목록을 반환한다. */
export function getTroubleshootingFaqsForContext(filter?: {
  readonly roleId?: CreatorRoleId;
  readonly axisId?: FeatureAxisId;
}): readonly ContextualTroubleshootingFaq[] {
  if (!filter || (!filter.roleId && !filter.axisId)) {
    return CONTEXTUAL_TROUBLESHOOTING_FAQS;
  }
  return CONTEXTUAL_TROUBLESHOOTING_FAQS.filter((faq) => {
    const roleMatch = !filter.roleId || faq.roleIds.includes(filter.roleId);
    const axisMatch = !filter.axisId || faq.axisId === filter.axisId;
    return roleMatch && axisMatch;
  });
}
