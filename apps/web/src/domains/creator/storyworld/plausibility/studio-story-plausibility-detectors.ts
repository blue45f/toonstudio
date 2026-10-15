/**
 * 기존 탐지기에 없는 개연성 규칙 세 가지: 우연에 기댄 해결, 동기 공백, 나이·연도 산술.
 *
 * 설계 원칙
 * - 입력된 데이터로 확정할 수 있는 것만 판정한다. 작가가 답하지 않은 칸은 판정하지 않고
 *   커버리지에서 "점검 불가"로 센다. 빈 데이터에서 경고를 만들지 않는다.
 * - 부재(앞 장면에 언급이 없음)로 판정하는 규칙은 바로 앞 장면들이 모두 입력되어 있을 때만 쓴다.
 *   입력이 비어 있는 장면 때문에 "없다"를 "입력하지 않았다"와 구별하지 못하기 때문이다.
 * - 소품·부상·의상 상태 끊김은 새로 만들지 않는다. 사실로 모델링하면 전제·효과 규칙이 잡고,
 *   캔버스 쪽은 연속성 린트가 잡는다(docs/features/story-plausibility-review.md 1절).
 * - 같은 입력이면 항상 같은 발견이 나온다. 시각·난수에 의존하지 않는다.
 */
import type { StoryworldScene } from "../studio-storyworld-causality";
import {
  createPlausibilityFinding,
  optionAnswerQuestion,
  optionOpenSettings,
  type PlausibilityContext,
} from "./studio-story-plausibility-context";
import { josa, listNames, subjectJosa, topicJosa } from "./studio-story-plausibility-text";
import type { PlausibilityFinding } from "./studio-story-plausibility-types";

/** 해결 장면 바로 앞에서 입력이 모두 있어야 하는 장면 수. */
export const PLAUSIBILITY_RECENT_WINDOW = 6;
/** 마지막 언급이 이만큼 이상 앞이면 독자가 잊었을 수 있다고 본다. */
export const PLAUSIBILITY_REMINDER_GAP = 8;
/** 나이 계산은 생일 때문에 한 살까지 어긋날 수 있다. 두 살 이상 어긋날 때만 모순으로 본다. */
export const PLAUSIBILITY_AGE_TOLERANCE = 1;

function touchedFactIds(scene: StoryworldScene): Set<string> {
  const ids = new Set<string>();
  for (const predicate of scene.preconditions ?? []) ids.add(predicate.factId);
  for (const mutation of scene.effects ?? []) ids.add(mutation.factId);
  for (const use of scene.knowledgeUses ?? []) ids.add(use.factId);
  for (const reveal of scene.reveals ?? []) ids.add(reveal.factId);
  return ids;
}

function isFactModeled(scene: StoryworldScene): boolean {
  return touchedFactIds(scene).size > 0
    || (scene.setupIds?.length ?? 0) > 0
    || (scene.payoffIds?.length ?? 0) > 0;
}

interface ResolutionDependency {
  readonly factId: string;
  readonly via: "precondition" | "knowledge";
  readonly characterId?: string;
}

function resolutionDependencies(scene: StoryworldScene): readonly ResolutionDependency[] {
  const dependencies: ResolutionDependency[] = [];
  const seen = new Set<string>();
  for (const predicate of scene.preconditions ?? []) {
    const comparator = predicate.comparator ?? "equals";
    if (comparator === "not-exists" || comparator === "not-equals") continue;
    if (seen.has(`p:${predicate.factId}`)) continue;
    seen.add(`p:${predicate.factId}`);
    dependencies.push({ factId: predicate.factId, via: "precondition" });
  }
  for (const use of scene.knowledgeUses ?? []) {
    const key = `k:${use.characterId}:${use.factId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dependencies.push({ factId: use.factId, via: "knowledge", characterId: use.characterId });
  }
  return dependencies;
}

/**
 * 이 해결 장면이 "앞에서 준비했다"고 작가가 직접 밝혔는가: 단서 장면을 지정했거나,
 * 복선 계약의 회수 장면이다. 이 경우 준비 여부는 엔진의 복선 규칙(orphan-payoff)이 본다.
 */
function declaredAsPrepared(scene: StoryworldScene): boolean {
  const coincidence = scene.plausibility?.coincidence;
  if (coincidence?.clue === "foreshadowed" && (coincidence.clueSceneIds?.length ?? 0) > 0) return true;
  return (scene.payoffIds?.length ?? 0) > 0;
}

/**
 * 해결 장면이 앞에서 한 번도 보이지 않은 사실에 기대는 경우.
 *
 * 판정 조건(모두 만족할 때만):
 * 1. 작가가 장면 성격을 "해결"로 답했다.
 * 2. 해결 장면 바로 앞 PLAUSIBILITY_RECENT_WINDOW개 장면에 사실 입력이 모두 있다(입력 누락과 구별).
 * 3. 해결이 기대는 사실(전제·지식 사용)이 처음 상태나 인물의 처음 지식 덕에 조용히 성립하고,
 *    앞선 어떤 장면에도 그 사실을 다룬 흔적(전제·효과·지식 사용·공개)이 없다.
 * 4. 작가가 단서 장면을 지정하지 않았고, 복선 회수 장면도 아니며, 사실이 정본(canonical) 설정이 아니다.
 * 마지막 언급이 PLAUSIBILITY_REMINDER_GAP장면 이상 앞이면 경고가 아니라 "상기 제안"만 낸다.
 */
export function detectUnpreparedResolutions(ctx: PlausibilityContext): readonly PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];
  const scenes = ctx.activeScenes;
  /** 앞선 장면에서 각 사실을 마지막으로 다룬 장면의 위치. 해결 장면에 닿았을 때 "그 앞까지"의 상태다. */
  const lastTouchIndex = new Map<string, number>();

  scenes.forEach((scene, index) => {
    if (index > 0 && scene.plausibility?.roles?.includes("resolution")) {
      findings.push(...evaluateResolution(ctx, scenes, index, lastTouchIndex));
    }
    for (const factId of touchedFactIds(scene)) lastTouchIndex.set(factId, index);
  });
  return findings;
}

function evaluateResolution(
  ctx: PlausibilityContext,
  scenes: readonly StoryworldScene[],
  index: number,
  lastTouchIndex: ReadonlyMap<string, number>,
): readonly PlausibilityFinding[] {
  const scene = scenes[index];
  if (!scene) return [];
  const windowScenes = scenes.slice(Math.max(0, index - PLAUSIBILITY_RECENT_WINDOW), index);
  if (windowScenes.length === 0 || !windowScenes.every(isFactModeled)) return [];
  if (declaredAsPrepared(scene)) return [];

  const unprepared: ResolutionDependency[] = [];
  const stale: { readonly dependency: ResolutionDependency; readonly gap: number }[] = [];
  for (const dependency of resolutionDependencies(scene)) {
    const fact = ctx.fact(dependency.factId);
    if (!fact || fact.canonical === true) continue;
    // 처음 상태나 인물의 처음 지식 덕에 조용히 성립하는 사실만 본다. 그 밖의 부재는
    // 엔진의 전제·지식 규칙(missing-precondition, knowledge-leak)이 이미 오류로 잡는다.
    const silentlyTrue = dependency.via === "precondition"
      ? Object.prototype.hasOwnProperty.call(fact, "initialValue")
      : dependency.characterId !== undefined
        && (ctx.character(dependency.characterId)?.initialFactIds ?? []).includes(dependency.factId);
    if (!silentlyTrue) continue;
    const last = lastTouchIndex.get(dependency.factId);
    if (last === undefined) {
      unprepared.push(dependency);
    } else if (index - last >= PLAUSIBILITY_REMINDER_GAP) {
      stale.push({ dependency, gap: index - last });
    }
  }

  const findings: PlausibilityFinding[] = [];
  if (unprepared.length > 0) {
    const names = listNames(unprepared.map((item) => `‘${ctx.factLabel(item.factId)}’`));
    findings.push(createPlausibilityFinding(ctx, {
      source: { module: "plausibility", code: "unprepared-resolution" },
      idParts: ["unprepared-resolution", scene.id, ...unprepared.map((item) => item.factId).sort()],
      category: "coincidence",
      severity: "warning",
      confidence: "heuristic",
      title: "해결이 앞에서 준비되지 않은 일에 기대요",
      message: `‘${scene.title}’에서 문제가 풀리는데, 그 근거인 ${names.text}${josa(names.last, "이", "가")} 이 장면 앞 어디에도 나오지 않았어요. 독자에게는 갑자기 나온 우연으로 읽힐 수 있어요.`,
      question: "이 근거를 앞 장면 어디에 미리 보여 줄 수 있나요? 이미 보여 준 장면이 있다면 질문지에서 알려 주세요.",
      evidence: [
        ctx.sceneEvidence(scene.id, "해결 장면으로 표시됨"),
        ...unprepared.slice(0, 4).map((item) => ctx.factEvidence(item.factId, "이 장면 앞에서 한 번도 다루지 않음")),
      ],
      options: [
        optionAnswerQuestion(scene.id, "coincidence", "질문지에서 단서 장면 알려 주기", "이미 앞에 단서가 있다면 어느 장면인지 지정합니다. 지정하면 이 경고가 사라집니다."),
        ...unprepared.slice(0, 2).map((item) => optionOpenSettings("fact", item.factId, `설정에서 ‘${ctx.factLabel(item.factId)}’ 열기`, "사실의 설명을 확인하고 앞 장면에 넣을 단서를 정리합니다.")),
      ],
      sceneIds: [scene.id],
    }));
  }
  if (stale.length > 0) {
    const names = listNames(stale.map((item) => `‘${ctx.factLabel(item.dependency.factId)}’(${item.gap}장면 전)`));
    findings.push(createPlausibilityFinding(ctx, {
      source: { module: "plausibility", code: "stale-preparation" },
      idParts: ["stale-preparation", scene.id, ...stale.map((item) => item.dependency.factId).sort()],
      category: "coincidence",
      severity: "suggestion",
      confidence: "heuristic",
      title: "해결의 근거가 오래전에 나온 뒤 다시 안 나와요",
      message: `‘${scene.title}’의 해결이 기대는 ${names.text}${josa(names.last, "은", "는")} 마지막으로 나온 지 ${PLAUSIBILITY_REMINDER_GAP}장면 넘게 지났어요. 독자가 잊었을 수 있어요.`,
      question: "해결 직전에 짧게 다시 보여 주는 컷을 넣을까요?",
      evidence: [
        ctx.sceneEvidence(scene.id, "해결 장면으로 표시됨"),
        ...stale.slice(0, 4).map((item) => ctx.factEvidence(item.dependency.factId, `마지막 언급 ${item.gap}장면 전`)),
      ],
      options: [optionAnswerQuestion(scene.id, "coincidence", "질문지에서 단서 확인", "상기 장면이 이미 있다면 단서 장면으로 지정합니다.")],
      sceneIds: [scene.id],
    }));
  }
  return findings;
}

/** 작가가 우연이라고 답한 장면: 단서 없음·모름·잘못된 단서 지정. */
export function detectDeclaredCoincidences(ctx: PlausibilityContext): readonly PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];
  for (const scene of ctx.activeScenes) {
    const coincidence = scene.plausibility?.coincidence;
    if (!coincidence) continue;
    const isResolution = scene.plausibility?.roles?.includes("resolution") === true;
    const evidence = [ctx.sceneEvidence(scene.id, isResolution ? "해결 장면" : undefined)];
    const answerOption = optionAnswerQuestion(scene.id, "coincidence", "질문지에서 단서 답하기", "앞 장면에 단서를 심었다면 그 장면을 지정하고, 없다면 심을 위치를 정합니다.");
    if (coincidence.clue === "none") {
      findings.push(createPlausibilityFinding(ctx, {
        source: { module: "plausibility", code: "coincidence-without-clue" },
        idParts: ["coincidence-without-clue", scene.id],
        category: "coincidence",
        ...(isResolution
          ? { severity: "warning" as const, confidence: "certain" as const }
          : { severity: "suggestion" as const, confidence: "certain" as const }),
        title: isResolution ? "해결이 단서 없는 우연에 기대요" : "단서 없는 우연이 일어나요",
        message: isResolution
          ? `‘${scene.title}’의 해결은 우연에 기대는데, 앞에 단서가 없다고 답하셨어요.`
          : `‘${scene.title}’${josa(scene.title, "은", "는")} 우연에 기대는데, 앞에 단서가 없다고 답하셨어요.`,
        question: "앞 장면에 단서를 한 컷 심을 수 있을까요? 의도한 우연이라면 처리 기록으로 남겨 주세요.",
        evidence,
        options: [answerOption],
        sceneIds: [scene.id],
      }));
    } else if (coincidence.clue === "unknown") {
      findings.push(createPlausibilityFinding(ctx, {
        source: { module: "plausibility", code: "coincidence-undecided" },
        idParts: ["coincidence-undecided", scene.id],
        category: "coincidence",
        severity: "suggestion",
        confidence: "certain",
        title: "우연인지 단서가 있는지 아직 정하지 않았어요",
        message: `‘${scene.title}’의 사건이 우연인지, 앞에 단서가 있는지 아직 모른다고 답하셨어요.`,
        question: "앞 장면 중 이 사건의 단서가 될 만한 곳이 있나요?",
        evidence,
        options: [answerOption],
        sceneIds: [scene.id],
      }));
    } else {
      const clueIds = coincidence.clueSceneIds ?? [];
      const myIndex = ctx.indexOf(scene.id);
      const invalid = clueIds.filter((id) => {
        const index = ctx.indexOf(id);
        return index < 0 || index >= myIndex;
      });
      if (clueIds.length === 0 || invalid.length > 0) {
        const invalidNames = listNames(invalid.map((id) => ctx.sceneTitle(id)));
        findings.push(createPlausibilityFinding(ctx, {
          source: { module: "plausibility", code: "coincidence-clue-order" },
          idParts: ["coincidence-clue-order", scene.id, ...invalid],
          category: "coincidence",
          severity: "error",
          confidence: "certain",
          title: "단서로 지정한 장면이 맞지 않아요",
          message: clueIds.length === 0
            ? `‘${scene.title}’에 앞에 단서가 있다고 답했지만 단서 장면이 지정되지 않았어요.`
            : `‘${scene.title}’의 단서로 지정한 ‘${invalidNames.text}’${josa(invalidNames.last, "은", "는")} 이 장면보다 뒤에 있거나 사용하지 않는 장면이에요.`,
          question: "단서가 실제로 놓인 앞 장면은 어디인가요?",
          evidence: [...evidence, ...invalid.slice(0, 3).map((id) => ctx.sceneEvidence(id, "단서로 지정됨"))],
          options: [answerOption],
          sceneIds: [scene.id, ...invalid],
        }));
      }
    }
  }
  return findings;
}

/** 결정 장면의 동기 공백과 동기 근거의 앞뒤 문제. */
export function detectMotiveGaps(ctx: PlausibilityContext): readonly PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];
  for (const scene of ctx.activeScenes) {
    const plausibility = scene.plausibility;
    if (!plausibility) continue;
    const isDecision = plausibility.roles?.includes("decision") === true;
    const motives = plausibility.motives ?? [];
    const myIndex = ctx.indexOf(scene.id);
    const answerOption = optionAnswerQuestion(scene.id, "motive", "질문지에서 동기 답하기", "인물이 왜 그렇게 행동했는지 바라는 것, 앞선 사건, 감정 중에서 고릅니다.");

    if (isDecision) {
      const unknownMotives = motives.filter((motive) => motive.basis === "unknown");
      const wholeUnknown = plausibility.answers?.motive === "unknown" && motives.every((motive) => motive.basis === "unknown");
      if (unknownMotives.length > 0 || wholeUnknown) {
        const names = unknownMotives.map((motive) => ctx.characterName(motive.characterId));
        findings.push(createPlausibilityFinding(ctx, {
          source: { module: "plausibility", code: "motive-gap" },
          idParts: ["motive-gap", scene.id, ...unknownMotives.map((motive) => motive.characterId).sort()],
          category: "motive",
          severity: "suggestion",
          confidence: "certain",
          title: "중요한 선택의 이유를 아직 모르겠다고 하셨어요",
          message: names.length > 0
            ? `‘${scene.title}’에서 ${listNames(names).text}${josa(listNames(names).last, "이", "가")} 중요한 선택을 하는데, 왜 그렇게 하는지 아직 정하지 않았다고 답하셨어요.`
            : `‘${scene.title}’의 중요한 선택에 이유가 있는지 아직 정하지 않았다고 답하셨어요.`,
          question: "이 선택은 인물이 바라는 것, 앞선 사건, 감정 중 무엇에서 나오나요?",
          evidence: [
            ctx.sceneEvidence(scene.id, "결정 장면"),
            ...unknownMotives.slice(0, 3).map((motive) => ctx.characterEvidence(motive.characterId, "동기를 아직 모름")),
          ],
          options: [answerOption],
          sceneIds: [scene.id],
        }));
      }
    }

    for (const motive of motives) {
      if (motive.basis === "event" && motive.causeSceneId !== undefined) {
        const causeIndex = ctx.indexOf(motive.causeSceneId);
        if (causeIndex < 0 || causeIndex >= myIndex) {
          findings.push(createPlausibilityFinding(ctx, {
            source: { module: "plausibility", code: "motive-source-after" },
            idParts: ["motive-source-after", scene.id, motive.characterId, motive.causeSceneId],
            category: "motive",
            severity: "error",
            confidence: "certain",
            title: "동기가 되는 사건이 이 장면보다 뒤에 있어요",
            message: `‘${scene.title}’에서 ${subjectJosa(ctx.characterName(motive.characterId))} 움직이는 동기로 지정한 ‘${ctx.sceneTitle(motive.causeSceneId)}’${josa(ctx.sceneTitle(motive.causeSceneId), "은", "는")} ${causeIndex < 0 ? "사용하지 않는 장면이에요" : "이 장면보다 뒤에 나와요"}.`,
            question: "동기가 된 사건은 이 장면보다 앞 어디에 있나요?",
            evidence: [ctx.sceneEvidence(scene.id), ctx.sceneEvidence(motive.causeSceneId, "동기로 지정됨"), ctx.characterEvidence(motive.characterId)],
            options: [answerOption],
            sceneIds: [scene.id, motive.causeSceneId],
          }));
        }
      }
      if (motive.basis === "goal") {
        const goal = ctx.character(motive.characterId)?.goal?.trim();
        if (!goal) {
          findings.push(createPlausibilityFinding(ctx, {
            source: { module: "plausibility", code: "motive-goal-missing" },
            idParts: ["motive-goal-missing", scene.id, motive.characterId],
            category: "motive",
            severity: "suggestion",
            confidence: "certain",
            title: "‘바라는 것’이 동기라고 했는데 적혀 있지 않아요",
            message: `‘${scene.title}’에서 ${subjectJosa(ctx.characterName(motive.characterId))} 바라는 것 때문에 움직인다고 답하셨는데, 인물 설정에 바라는 것이 비어 있어요.`,
            question: `${topicJosa(ctx.characterName(motive.characterId))} 무엇을 바라나요? 인물 설정에 적어 둘까요?`,
            evidence: [ctx.sceneEvidence(scene.id), ctx.characterEvidence(motive.characterId, "바라는 것이 비어 있음")],
            options: [optionOpenSettings("character", motive.characterId, "설정에서 인물 열기", "인물의 '바라는 것'을 적습니다.")],
            sceneIds: [scene.id],
          }));
        }
      }
    }
  }
  return findings;
}

/**
 * 나이·연도 산술 모순. 인물의 태어난 해(birthYear), 장면의 이야기 속 연도(storyYear),
 * 장면에서 언급한 나이(statedAges)가 모두 있는 칸만 계산한다. 하나라도 비면 판정하지 않는다.
 */
export function detectAgeArithmetic(ctx: PlausibilityContext): readonly PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];
  const mentions = new Map<string, { scene: StoryworldScene; year: number; age: number }[]>();

  for (const scene of ctx.activeScenes) {
    const year = scene.storyYear;
    if (year === undefined) continue;
    for (const stated of scene.statedAges ?? []) {
      const character = ctx.character(stated.characterId);
      if (!character) continue;
      const list = mentions.get(stated.characterId) ?? [];
      list.push({ scene, year, age: stated.age });
      mentions.set(stated.characterId, list);
      if (character.birthYear !== undefined) {
        const expected = year - character.birthYear;
        if (Math.abs(stated.age - expected) > PLAUSIBILITY_AGE_TOLERANCE) {
          findings.push(createPlausibilityFinding(ctx, {
            source: { module: "plausibility", code: "age-mismatch" },
            idParts: ["age-mismatch", scene.id, stated.characterId, stated.age],
            category: "character-consistency",
            severity: "error",
            confidence: "certain",
            title: "나이와 연도가 맞지 않아요",
            message: `‘${scene.title}’에서 ${topicJosa(character.name)} ${stated.age}살이라고 했는데, 태어난 해(${character.birthYear})와 이 장면의 해(${year})로 계산하면 약 ${expected}살이에요.`,
            question: "나이, 태어난 해, 장면의 연도 중 어느 값이 틀렸나요?",
            evidence: [
              ctx.sceneEvidence(scene.id, `이야기 속 ${year}년`),
              ctx.characterEvidence(stated.characterId, `태어난 해 ${character.birthYear}`),
            ],
            options: [
              optionOpenSettings("character", stated.characterId, "설정에서 인물 열기", "태어난 해를 확인합니다."),
              optionOpenSettings("scene", scene.id, "설정에서 장면 열기", "장면의 연도와 언급한 나이를 확인합니다."),
            ],
            sceneIds: [scene.id],
          }));
        }
      }
    }
    if (year !== undefined) {
      for (const participantId of scene.participantIds ?? []) {
        const character = ctx.character(participantId);
        if (character?.birthYear !== undefined && year < character.birthYear) {
          findings.push(createPlausibilityFinding(ctx, {
            source: { module: "plausibility", code: "appears-before-birth" },
            idParts: ["appears-before-birth", scene.id, participantId],
            category: "character-consistency",
            severity: "warning",
            confidence: "certain",
            title: "태어나기 전 해의 장면에 등장해요",
            message: `${topicJosa(character.name)} ${character.birthYear}년생인데, ${year}년의 ‘${scene.title}’ 장면에 등장해요.`,
            question: "장면의 연도가 틀렸나요, 아니면 태어난 해가 틀렸나요? 환상이나 회상이라면 의도된 설정으로 남겨 주세요.",
            evidence: [ctx.sceneEvidence(scene.id, `이야기 속 ${year}년`), ctx.characterEvidence(participantId, `${character.birthYear}년생`)],
            options: [optionOpenSettings("character", participantId, "설정에서 인물 열기", "태어난 해를 확인합니다.")],
            sceneIds: [scene.id],
          }));
        }
      }
    }
  }

  for (const [characterId, list] of mentions) {
    const sorted = [...list].sort((a, b) => a.year - b.year || a.scene.order - b.scene.order);
    for (let index = 1; index < sorted.length; index += 1) {
      const earlier = sorted[index - 1];
      const later = sorted[index];
      if (!earlier || !later) continue;
      const yearGap = later.year - earlier.year;
      const ageGap = later.age - earlier.age;
      if (Math.abs(ageGap - yearGap) > PLAUSIBILITY_AGE_TOLERANCE) {
        const name = ctx.characterName(characterId);
        findings.push(createPlausibilityFinding(ctx, {
          source: { module: "plausibility", code: "age-progression" },
          idParts: ["age-progression", characterId, earlier.scene.id, later.scene.id],
          category: "character-consistency",
          severity: "error",
          confidence: "certain",
          title: "해가 흐른 만큼 나이가 변하지 않았어요",
          message: `${name}의 나이가 ‘${earlier.scene.title}’(${earlier.year}년)에서 ${earlier.age}살, ‘${later.scene.title}’(${later.year}년)에서 ${later.age}살인데, ${yearGap}년이 지났으니 약 ${earlier.age + yearGap}살이어야 해요.`,
          question: "두 장면의 연도와 나이 중 어느 값이 틀렸나요?",
          evidence: [
            ctx.sceneEvidence(earlier.scene.id, `${earlier.year}년 · ${earlier.age}살`),
            ctx.sceneEvidence(later.scene.id, `${later.year}년 · ${later.age}살`),
            ctx.characterEvidence(characterId),
          ],
          options: [
            optionOpenSettings("scene", earlier.scene.id, "설정에서 앞 장면 열기", "장면의 연도와 언급한 나이를 확인합니다."),
            optionOpenSettings("scene", later.scene.id, "설정에서 뒤 장면 열기", "장면의 연도와 언급한 나이를 확인합니다."),
          ],
          sceneIds: [earlier.scene.id, later.scene.id],
        }));
      }
    }
  }
  return findings;
}

export function detectPlausibilityIssues(ctx: PlausibilityContext): readonly PlausibilityFinding[] {
  return [
    ...detectUnpreparedResolutions(ctx),
    ...detectDeclaredCoincidences(ctx),
    ...detectMotiveGaps(ctx),
    ...detectAgeArithmetic(ctx),
  ];
}
