/**
 * 기존 탐지기의 결과를 작가의 말 범주로 옮기는 어댑터(인과 엔진, 연속성 검사).
 * 복선 장부·약속 장부·회차 타임라인·설정 검증·고유명사 검사 어댑터는
 * studio-story-plausibility-adapters-planning.ts에 있다.
 *
 * 탐지기를 새로 만들지 않는다. 이미 낸 결과를 받아 범주·심각도·신뢰 유형·작가용 설명·질문·해결
 * 선택지로 바꾼다. 개연성이 아닌 축(제작·현지화·접근성·권리)은 이 리포트에 넣지 않는다.
 *
 * 처리 기록은 원래 이슈 id를 열쇠로 그대로 쓴다. 그래서 모순·위험 탭에서 처리한 항목은
 * 점검 허브에서도 처리된 것으로 보이고, 반대도 같다.
 */
import type {
  StoryworldAnalysisResult,
  StoryworldIssue,
  StoryworldPrimitive,
} from "../studio-storyworld-causality";
import type { StoryworldContinuityIssue } from "../studio-storyworld-continuity";
import { directionJosa, josa, subjectJosa, topicJosa } from "./studio-story-plausibility-text";
import {
  createPlausibilityFinding,
  optionAnswerQuestion,
  optionCopyAdvice,
  optionInfo,
  optionOpenSettings,
  type PlausibilityContext,
} from "./studio-story-plausibility-context";
import type {
  PlausibilityEvidence,
  PlausibilityFinding,
} from "./studio-story-plausibility-types";

/** 개연성 리포트가 다루는 엔진 축. 제작·현지화·접근성·권리는 출시 위험이라 제외한다. */
const PLAUSIBILITY_ENGINE_AXES: ReadonlySet<StoryworldIssue["axis"]> = new Set([
  "canon",
  "character-knowledge",
  "setup-payoff",
  "spoiler-safety",
  "emotional-continuity",
]);

const COMPARATOR_LABELS: Readonly<Record<string, string>> = {
  exists: "이미 있어야 함",
  "not-exists": "없어야 함",
  equals: "같아야 함",
  "not-equals": "달라야 함",
  "greater-than": "보다 커야 함",
  "less-than": "보다 작아야 함",
};

const FAMILY_LABELS: Readonly<Record<string, string>> = {
  character: "인물",
  fact: "사실",
  scene: "장면",
  setup: "복선",
  motif: "모티프",
};

function formatValue(value: StoryworldPrimitive | undefined): string {
  if (value === null || value === undefined) return "없음";
  if (typeof value === "boolean") return value ? "예(참)" : "아니오(거짓)";
  return String(value);
}

function evidenceText(issue: StoryworldIssue, key: string): string | undefined {
  const value = issue.evidence?.[key];
  return value === undefined || value === null ? undefined : String(value);
}

function evidenceNumber(issue: StoryworldIssue, key: string): number | undefined {
  const value = issue.evidence?.[key];
  return typeof value === "number" ? value : undefined;
}

function unpaidSetupMessage(setupName: string, issue: StoryworldIssue): string {
  const due = evidenceText(issue, "dueByOrder") ?? "?";
  const actual = evidenceNumber(issue, "actualPayoffCount") ?? 0;
  const required = evidenceText(issue, "requiredPayoffCount") ?? "1";
  const done = actual === 0 ? "아직 한 번도 거두지 않았어요" : `${actual}번만 거두었어요`;
  return `‘${setupName}’ 복선을 순서 ${due}까지 거두기로 했는데 ${done} (필요 ${required}번).`;
}

// ── 인과 엔진 ────────────────────────────────────────────────────────

export function adaptCausalityIssues(
  ctx: PlausibilityContext,
  analysis: StoryworldAnalysisResult,
): readonly PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];
  for (const issue of analysis.issues) {
    if (!PLAUSIBILITY_ENGINE_AXES.has(issue.axis)) continue;
    const finding = adaptCausalityIssue(ctx, issue);
    if (finding) findings.push(finding);
  }
  return findings;
}

function adaptCausalityIssue(ctx: PlausibilityContext, issue: StoryworldIssue): PlausibilityFinding | null {
  const source = { module: "causality" as const, code: issue.code, originalId: issue.id };
  const sceneId = issue.sceneId;
  const scene = sceneId ? ctx.scene(sceneId) : undefined;
  const sceneName = sceneId ? ctx.sceneTitle(sceneId) : "";
  const factId = issue.factId;
  const factName = factId ? ctx.factLabel(factId) : "";
  const characterId = issue.characterId;
  const characterName = characterId ? ctx.characterName(characterId) : "";
  const base = { source, dispositionKey: issue.id, idParts: [issue.id] };
  const sceneEvidence = sceneId ? [ctx.sceneEvidence(sceneId)] : [];
  const sceneSettings = sceneId
    ? [optionOpenSettings("scene", sceneId, "설정에서 이 장면 열기", "장면의 제목·순서·시간·장소·선행 장면을 고칩니다.")]
    : [];

  switch (issue.code) {
    case "missing-precondition": {
      if (!sceneId || !factId) return null;
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "cause-effect",
        severity: "error",
        confidence: "certain",
        title: "필요한 일이 아직 일어나지 않았어요",
        message: `‘${sceneName}’ 장면은 ‘${factName}’${josa(factName, "이", "가")} 먼저 성립해 있어야 하는데, 이 장면 앞에서는 그 일이 한 번도 일어나지 않았어요.`,
        question: `‘${factName}’${josa(factName, "은", "는")} 어느 장면에서 일어나나요? 앞 장면에 넣을까요, 아니면 이 장면의 조건을 바꿀까요?`,
        evidence: [...sceneEvidence, ctx.factEvidence(factId, `필요한 상태: ${COMPARATOR_LABELS[evidenceText(issue, "comparator") ?? "equals"] ?? "성립"} ${formatValue(issue.evidence?.expected)}`)],
        options: [
          optionAnswerQuestion(sceneId, "cause", "질문지에서 원인 답하기", "이 장면이 무엇 때문에 일어나는지 앞 장면이나 사실로 이어 줍니다."),
          ...sceneSettings,
          optionOpenSettings("fact", factId, "설정에서 사실 열기", "이 사실의 처음 값을 정하거나 라벨을 확인합니다."),
        ],
        sceneIds: [sceneId],
      });
    }
    case "contradicted-precondition": {
      if (!sceneId || !factId) return null;
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "setting-rules",
        severity: "warning",
        confidence: "certain",
        title: "장면이 기대하는 상태가 앞 이야기와 달라요",
        message: `‘${sceneName}’ 장면이 기대하는 ‘${factName}’의 상태가 지금까지 이야기와 달라요. (필요한 값: ${COMPARATOR_LABELS[evidenceText(issue, "comparator") ?? "equals"] ?? "같아야 함"} ${formatValue(issue.evidence?.expected)} · 지금 값: ${formatValue(issue.evidence?.actual)})`,
        question: "장면의 조건이 틀렸나요, 아니면 앞에서 이 사실이 바뀌어야 하나요?",
        evidence: [...sceneEvidence, ctx.factEvidence(factId, `지금 값 ${formatValue(issue.evidence?.actual)}`)],
        options: [
          ...sceneSettings,
          optionOpenSettings("fact", factId, "설정에서 사실 열기", "사실의 처음 값과 설명을 확인합니다."),
        ],
        sceneIds: [sceneId],
      });
    }
    case "dependency-order": {
      if (!sceneId) return null;
      const dependencyId = evidenceText(issue, "dependencyId");
      const dependencyName = dependencyId ? ctx.sceneTitle(dependencyId) : "선행 장면";
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "cause-effect",
        severity: "error",
        confidence: "certain",
        title: "원인 장면이 결과 장면보다 뒤에 있어요",
        message: `‘${sceneName}’의 원인으로 적은 ‘${dependencyName}’ 장면이 결과 장면보다 뒤에 놓여 있어요.`,
        question: "두 장면의 순서가 바뀌었나요, 아니면 원인 장면을 잘못 지정했나요?",
        evidence: [...sceneEvidence, ...(dependencyId ? [ctx.sceneEvidence(dependencyId, "원인으로 지정됨")] : [])],
        options: sceneSettings,
        sceneIds: dependencyId ? [sceneId, dependencyId] : [sceneId],
      });
    }
    case "dependency-cycle": {
      const cycleText = evidenceText(issue, "cycle") ?? "";
      const cycleIds = cycleText.split(" -> ").filter((id) => id.length > 0);
      const names = cycleIds.map((id) => ctx.sceneTitle(id));
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "cause-effect",
        severity: "error",
        confidence: "certain",
        title: "원인이 서로를 가리키며 돌고 있어요",
        message: `장면의 원인이 순환해요: ${names.map((name) => `‘${name}’`).join(" → ")}`,
        question: "어느 장면이 진짜 처음 원인인가요?",
        evidence: cycleIds.slice(0, 6).map((id) => ctx.sceneEvidence(id)),
        options: cycleIds[0] ? [optionOpenSettings("scene", cycleIds[0], "설정에서 장면 열기", "선행 장면 지정을 고칩니다.")] : [],
        sceneIds: cycleIds,
      });
    }
    case "inactive-dependency": {
      if (!sceneId) return null;
      const dependencyId = evidenceText(issue, "dependencyId");
      const dependencyName = dependencyId ? ctx.sceneTitle(dependencyId) : "선행 장면";
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "cause-effect",
        severity: "error",
        confidence: "certain",
        title: "사용하지 않기로 한 장면이 원인으로 걸려 있어요",
        message: `쓰고 있는 ‘${sceneName}’ 장면이, 사용하지 않기로 한 ‘${dependencyName}’ 장면에 기대고 있어요.`,
        question: "그 장면을 다시 쓸까요, 아니면 원인 지정을 풀까요?",
        evidence: [...sceneEvidence, ...(dependencyId ? [ctx.sceneEvidence(dependencyId, "사용 안 함")] : [])],
        options: sceneSettings,
        sceneIds: dependencyId ? [sceneId, dependencyId] : [sceneId],
      });
    }
    case "invalid-mutation": {
      if (!sceneId || !factId) return null;
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "setting-rules",
        severity: "error",
        confidence: "certain",
        title: "숫자가 아닌 사실을 더하거나 뺐어요",
        message: `‘${sceneName}’ 장면이 숫자가 아닌 ‘${factName}’에 더하기·빼기를 하려 해요.`,
        question: "이 사실은 숫자인가요, 아니면 '성립/해제'로 바꿔야 하나요?",
        evidence: [...sceneEvidence, ctx.factEvidence(factId)],
        options: [optionOpenSettings("fact", factId, "설정에서 사실 열기", "사실의 종류와 처음 값을 확인합니다.")],
        sceneIds: [sceneId],
      });
    }
    case "dangling-reference": {
      const missingId = factId ?? characterId ?? evidenceText(issue, "dependencyId") ?? "알 수 없음";
      const kind = factId ? "사실" : characterId ? "인물" : "선행 장면";
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "setting-rules",
        severity: "error",
        confidence: "certain",
        title: "없는 항목을 가리키고 있어요",
        message: sceneId
          ? `‘${sceneName}’ 장면이 만들어 두지 않은 ${kind}(${missingId})을 가리키고 있어요.`
          : `만들어 두지 않은 ${kind}(${missingId})을 가리키는 항목이 있어요.`,
        question: `${kind}${josa(kind, "을", "를")} 새로 만들까요, 아니면 참조를 지울까요?`,
        evidence: [...sceneEvidence, { kind: "note", id: missingId, label: `없는 ${kind}: ${missingId}` }],
        options: sceneSettings,
        sceneIds: sceneId ? [sceneId] : [],
      });
    }
    case "duplicate-id": {
      const family = FAMILY_LABELS[evidenceText(issue, "family") ?? ""] ?? "항목";
      const duplicateId = evidenceText(issue, "duplicateId") ?? "";
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "setting-rules",
        severity: "error",
        confidence: "certain",
        title: "같은 이름표가 두 번 쓰였어요",
        message: `${family}의 이름표(id) ‘${duplicateId}’가 두 번 쓰였어요. 하나는 다른 이름표로 바꿔야 해요.`,
        question: "어느 쪽이 원래 항목인가요?",
        evidence: [{ kind: "note", id: duplicateId, label: `중복된 ${family} id: ${duplicateId}` }],
        options: [optionInfo("duplicate-id", "설정 파일에서 id 바꾸기", "설정 파일 탭에서 중복된 id 하나를 새 값으로 바꿉니다.")],
        sceneIds: [],
      });
    }
    case "knowledge-leak": {
      if (!sceneId || !factId || !characterId) return null;
      const purpose = evidenceText(issue, "purpose");
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "information",
        severity: "error",
        confidence: "certain",
        title: "아직 모르는 일을 아는 것처럼 행동해요",
        message: `‘${sceneName}’ 장면에서 ${subjectJosa(characterName)} ‘${factName}’${josa(factName, "을", "를")} 아는 것처럼 행동하지만, 그 앞에서 ${subjectJosa(characterName)} 이 사실을 알게 되는 장면이 없어요.${purpose && purpose !== "unspecified" ? ` (행동: ${purpose})` : ""}`,
        question: `${topicJosa(characterName)} 이 사실을 어떻게 알았나요? 처음부터 알았나요, 앞 장면에서 알게 되나요?`,
        evidence: [...sceneEvidence, ctx.characterEvidence(characterId), ctx.factEvidence(factId)],
        options: [
          optionAnswerQuestion(sceneId, "information", "질문지에서 정보 경로 답하기", "누가 어느 장면에서 알게 되는지, 또는 처음부터 알던 일인지 정합니다."),
          optionOpenSettings("character", characterId, "설정에서 인물 열기", "처음부터 알던 사실에 추가합니다."),
          ...sceneSettings,
        ],
        sceneIds: [sceneId],
      });
    }
    case "premature-reader-reveal": {
      if (!sceneId || !factId) return null;
      const intended = evidenceNumber(issue, "intendedOrder");
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "information",
        severity: "warning",
        confidence: "certain",
        title: "독자에게 계획보다 일찍 알려져요",
        message: `‘${factName}’${josa(factName, "은", "는")} 순서 ${intended ?? "?"}에 알리기로 했는데, 순서 ${scene?.order ?? "?"}의 ‘${sceneName}’에서 독자에게 먼저 알려져요.`,
        question: "독자가 이 사실을 지금 알아도 되나요? 아니면 이 장면에서 감춰야 하나요?",
        evidence: [...sceneEvidence, ctx.factEvidence(factId, `공개 예정 순서 ${intended ?? "?"}`)],
        options: [
          optionOpenSettings("fact", factId, "설정에서 사실 열기", "공개 예정 순서를 확인합니다."),
          ...sceneSettings,
        ],
        sceneIds: [sceneId],
      });
    }
    case "reader-reveal-missed": {
      if (!factId) return null;
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "information",
        severity: "warning",
        confidence: "certain",
        title: "독자에게 알리기로 한 일을 아직 안 보여 줬어요",
        message: `‘${factName}’${josa(factName, "은", "는")} 순서 ${evidenceText(issue, "intendedOrder") ?? "?"}까지 독자에게 알리기로 했지만 알리는 장면이 없어요.`,
        question: "어느 장면에서 독자에게 알려 줄까요?",
        evidence: [ctx.factEvidence(factId)],
        options: [optionOpenSettings("fact", factId, "설정에서 사실 열기", "공개 예정 순서를 바꾸거나 해제합니다.")],
        sceneIds: [],
      });
    }
    case "orphan-payoff": {
      if (!sceneId) return null;
      const setupName = issue.setupId ? ctx.setupLabel(issue.setupId) : "복선";
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "foreshadowing",
        severity: "error",
        confidence: "certain",
        title: "심기 전에 거두는 복선이에요",
        message: `‘${setupName}’ 복선을 ‘${sceneName}’에서 거두지만, 심은 장면이 없거나 이 장면보다 뒤에 있어요.`,
        question: "이 복선은 어느 장면에서 심었나요? 앞에 단서를 넣을까요?",
        evidence: [...sceneEvidence, ...(issue.setupId ? [{ kind: "setup" as const, id: issue.setupId, label: setupName }] : [])],
        options: [
          optionAnswerQuestion(sceneId, "coincidence", "질문지에서 단서 장면 정하기", "이 장면의 단서가 어느 앞 장면에 있는지 정합니다."),
          ...sceneSettings,
        ],
        sceneIds: [sceneId],
      });
    }
    case "unpaid-setup": {
      const setupName = issue.setupId ? ctx.setupLabel(issue.setupId) : "복선";
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "foreshadowing",
        severity: "error",
        confidence: "certain",
        title: "심어 둔 복선을 아직 거두지 않았어요",
        message: unpaidSetupMessage(setupName, issue),
        question: "이 복선은 어디서 거둘까요? 더 끌고 갈 복선이면 기한을 늘릴까요?",
        evidence: [...sceneEvidence, ...(issue.setupId ? [{ kind: "setup" as const, id: issue.setupId, label: setupName }] : [])],
        options: sceneSettings,
        sceneIds: sceneId ? [sceneId] : [],
      });
    }
    case "motif-underused":
    case "motif-gap": {
      const motifId = issue.motifId ?? "";
      const label = analysisMotifLabel(ctx, motifId);
      const under = issue.code === "motif-underused";
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "foreshadowing",
        severity: "warning",
        confidence: "certain",
        title: under ? "되풀이하기로 한 모티프가 적게 나와요" : "모티프가 너무 오래 건너뛰어요",
        message: under
          ? `모티프 ‘${label}’${josa(label, "은", "는")} 최소 ${evidenceText(issue, "minimum") ?? "?"}번 나오기로 했는데 ${evidenceText(issue, "actual") ?? "0"}번만 나와요.`
          : `모티프 ‘${label}’${josa(label, "이", "가")} ${evidenceText(issue, "largestGapScenes") ?? "?"}장면이나 건너뛰어요 (최대 ${evidenceText(issue, "maximum") ?? "?"}장면).`,
        question: "이 모티프를 더 자주 보여 줄 장면이 있나요? 아니면 기준을 조정할까요?",
        evidence: [{ kind: "note", id: motifId, label: `모티프: ${label}` }],
        options: [optionInfo("motif", "복선 약속 탭에서 모티프 확인", "복선 약속 탭의 반복 모티프 목록에서 등장 장면을 봅니다.")],
        sceneIds: [],
      });
    }
    case "time-regression": {
      if (!sceneId) return null;
      if (scene?.plausibility?.roles?.includes("flashback")) return null;
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "time-place",
        severity: "warning",
        confidence: "certain",
        title: "시간이 거꾸로 가요",
        message: `‘${sceneName}’의 시간 값(${evidenceText(issue, "currentTimeIndex") ?? "?"})이 바로 앞 장면의 시간 값(${evidenceText(issue, "previousTimeIndex") ?? "?"})보다 앞서요. 회상이라면 회상 장면으로 표시해 주세요.`,
        question: "이 장면은 과거를 보여 주는 회상인가요? 아니면 시간 값이 잘못 들어갔나요?",
        evidence: sceneEvidence,
        options: [
          optionAnswerQuestion(sceneId, "roles", "질문지에서 회상 장면으로 표시", "회상 장면으로 표시하면 이 경고가 사라집니다."),
          ...sceneSettings,
        ],
        sceneIds: [sceneId],
      });
    }
    case "impossible-travel": {
      if (!sceneId) return null;
      const shared = (evidenceText(issue, "sharedCharacters") ?? "").split(",").filter((id) => id.length > 0);
      const names = shared.map((id) => ctx.characterName(id)).join(", ");
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "time-place",
        severity: "warning",
        confidence: "certain",
        title: "같은 시간에 두 곳에 있어요",
        message: `${subjectJosa(names || "인물")} 같은 시간에 ${evidenceText(issue, "from") ?? "?"}에서 ${directionJosa(evidenceText(issue, "to") ?? "?")} 옮겨 가요. 이동 시간이 필요해요.`,
        question: "두 장면 사이에 시간이 흘렀나요? 시간 값을 나눠 적을까요?",
        evidence: [...sceneEvidence, ...shared.slice(0, 3).map((id) => ctx.characterEvidence(id))],
        options: sceneSettings,
        sceneIds: [sceneId],
      });
    }
    case "emotional-whiplash": {
      if (!sceneId || !characterId) return null;
      return createPlausibilityFinding(ctx, {
        ...base,
        category: "emotion",
        severity: "warning",
        confidence: "heuristic",
        title: "감정이 설명 없이 크게 바뀌어요",
        message: `‘${sceneName}’에서 ${characterName}의 감정이 연결 장면 없이 크게 바뀌어요.`,
        question: "무엇 때문에 감정이 바뀌었나요? 표정, 행동, 침묵 같은 연결 장면이 필요할까요?",
        evidence: [...sceneEvidence, ctx.characterEvidence(characterId, `변화 크기 ${evidenceText(issue, "distance") ?? "?"}`)],
        options: [
          optionOpenSettings("scene", sceneId, "설정에서 장면 열기", "감정 변화에 연결 근거가 있다면 설정 파일에서 '전환 근거 있음'으로 표시합니다."),
          optionCopyAdvice(`whiplash:${issue.id}`, "연결 장면 안내문 복사", `‘${sceneName}’ 앞에 ${characterName}의 감정이 바뀌는 이유를 보여 주는 표정·행동·침묵 컷을 한 장면 넣어 보세요.`),
        ],
        sceneIds: [sceneId],
      });
    }
    default:
      return null;
  }
}

function analysisMotifLabel(ctx: PlausibilityContext, motifId: string): string {
  const motif = (ctx.project.motifs ?? []).find((item) => item.id === motifId);
  return motif?.label ?? motifId;
}

// ── 연속성 검사 ──────────────────────────────────────────────────────

const CHARACTER_NOTE_LABELS: ReadonlySet<string> = new Set(["장면 참여자", "지식 사용 인물", "공개 대상", "감정 비트 인물"]);

/** 연속성 검사가 남긴 근거 줄의 내부 id를 작가가 붙인 이름으로 바꾼다. 모르는 모양은 그대로 둔다. */
function humanizeContinuityNote(ctx: PlausibilityContext, line: string): string {
  const colon = line.indexOf(": ");
  if (colon > 0) {
    const label = line.slice(0, colon);
    const value = line.slice(colon + 2);
    if (CHARACTER_NOTE_LABELS.has(label)) {
      return `${label}: ${value.split(", ").map((token) => (token === "(없음)" ? "없음" : ctx.characterName(token))).join(", ")}`;
    }
    if (label === "사실") return `${label}: ${ctx.factLabel(value)}`;
    if (label === "주체") return `대상: ${ctx.characterName(value)}`;
    if (label === "속성 키") return `속성: ${value}`;
    return line;
  }
  const initial = /^(\S+) 초기값 (.+)$/u.exec(line);
  if (initial?.[1] !== undefined) return `${ctx.factLabel(initial[1])} · 처음 값 ${initial[2] ?? ""}`;
  const order = /^(\S+) · 순서 (.+)$/u.exec(line);
  if (order?.[1] !== undefined) return `${ctx.sceneTitle(order[1])} · 순서 ${order[2] ?? ""}`;
  return line;
}

function continuityNoteValue(issue: StoryworldContinuityIssue, label: string): string | undefined {
  const line = issue.evidence.find((item) => item.startsWith(`${label}: `));
  return line === undefined ? undefined : line.slice(label.length + 2);
}

/** 연속성 검사 결과를 점검 허브의 말투(해요체)와 작가가 붙인 이름으로 다시 쓴다. */
function continuityMessage(ctx: PlausibilityContext, issue: StoryworldContinuityIssue): string {
  const sceneName = issue.target.sceneId ? ctx.sceneTitle(issue.target.sceneId) : "";
  const personOf = (label: string): string => {
    const id = continuityNoteValue(issue, label);
    return id === undefined ? "그 인물" : ctx.characterName(id);
  };
  switch (issue.code) {
    case "fact-initial-value-conflict": {
      const fact = ctx.fact(issue.target.id);
      if (!fact) return issue.messageKo;
      const sameAttribute = ctx.project.facts.filter((item) => item.subjectId === fact.subjectId && item.key === fact.key).length;
      return `‘${fact.label}’ 등 ${Math.max(sameAttribute, 2)}개 설정이 ‘${ctx.characterName(fact.subjectId)}’의 같은 속성(${fact.key})에 서로 다른 처음 값을 적었어요.`;
    }
    case "knowledge-use-absent":
      return `‘${sceneName}’ 장면에서 ${subjectJosa(personOf("지식 사용 인물"))} 알고 있는 사실을 쓰지만, 장면 참여자에 들어 있지 않아요.`;
    case "reveal-to-absent": {
      const factId = continuityNoteValue(issue, "사실");
      const fact = factId === undefined ? "어떤 사실" : `‘${ctx.factLabel(factId)}’`;
      return `‘${sceneName}’ 장면에서 ${fact}${factId === undefined ? "이" : josa(ctx.factLabel(factId), "이", "가")} ${personOf("공개 대상")}에게 알려지는데, 그 인물이 장면 참여자에 없어요.`;
    }
    case "emotion-beat-absent":
      return `‘${sceneName}’ 장면에 ${personOf("감정 비트 인물")}의 감정이 적혀 있는데, 그 인물이 장면 참여자에 없어요.`;
    case "character-never-appears":
      return `‘${ctx.characterName(issue.target.id)}’${josa(ctx.characterName(issue.target.id), "은", "는")} 사용 중인 장면 ${continuityNoteValue(issue, "활성 장면 수") ?? "?"}개 어디에도 참여자로 나오지 않아요.`;
    case "fact-never-referenced":
      return `‘${ctx.factLabel(issue.target.id)}’ 설정이 어떤 장면·인물·복선에서도 쓰이지 않아요.`;
    case "scene-order-duplicate": {
      const titles = issue.evidence.map((line) => humanizeContinuityNote(ctx, line).split(" · ")[0] ?? line).map((title) => `‘${title}’`);
      const order = /순서 (\S+)$/u.exec(issue.evidence[0] ?? "")?.[1] ?? "?";
      return `사용 중인 장면 ${issue.evidence.length}개가 같은 순서(${order})를 쓰고 있어요: ${titles.join(", ")}. 순서가 겹치면 어느 장면이 먼저인지 알 수 없어요.`;
    }
  }
}

export function adaptContinuityIssues(
  ctx: PlausibilityContext,
  issues: readonly StoryworldContinuityIssue[],
): readonly PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];
  for (const issue of issues) {
    const source = { module: "continuity" as const, code: issue.code, originalId: issue.id };
    const base = { source, dispositionKey: issue.id, idParts: [issue.id], message: continuityMessage(ctx, issue) };
    const sceneId = issue.target.sceneId;
    const evidence: PlausibilityEvidence[] = [
      ...(sceneId ? [ctx.sceneEvidence(sceneId)] : []),
      ...issue.evidence.slice(0, 4).map((line, index): PlausibilityEvidence => ({ kind: "note", id: `${issue.id}:${index}`, label: humanizeContinuityNote(ctx, line) })),
    ];
    const settingsOption = optionOpenSettings(issue.target.kind, issue.target.id, "설정에서 고치기", "해당 요소의 설정 폼을 엽니다.");
    switch (issue.code) {
      case "fact-initial-value-conflict":
        findings.push(createPlausibilityFinding(ctx, {
          ...base,
          category: "setting-rules",
          severity: "error",
          confidence: "certain",
          title: "같은 설정이 서로 다른 값으로 적혀 있어요",
          question: "어느 쪽이 정본인가요? 나머지 정의는 지우거나 합쳐야 해요.",
          evidence,
          options: [settingsOption],
          sceneIds: [],
        }));
        break;
      case "knowledge-use-absent":
        findings.push(createPlausibilityFinding(ctx, {
          ...base,
          category: "information",
          severity: "warning",
          confidence: "certain",
          title: "장면에 없는 인물이 지식을 써요",
          question: "그 인물이 이 장면에 있나요? 있다면 참여자에 넣고, 아니면 지식 사용을 지워야 해요.",
          evidence,
          options: [settingsOption],
          sceneIds: sceneId ? [sceneId] : [],
        }));
        break;
      case "reveal-to-absent":
        findings.push(createPlausibilityFinding(ctx, {
          ...base,
          category: "information",
          severity: "warning",
          confidence: "certain",
          title: "장면에 없는 인물에게 사실이 알려져요",
          question: "그 인물은 이 장면에서 어떻게 알게 되나요?",
          evidence,
          options: [settingsOption],
          sceneIds: sceneId ? [sceneId] : [],
        }));
        break;
      case "emotion-beat-absent":
        findings.push(createPlausibilityFinding(ctx, {
          ...base,
          category: "emotion",
          severity: "warning",
          confidence: "certain",
          title: "장면에 없는 인물의 감정이 적혀 있어요",
          question: "그 인물이 장면에 나오나요? 아니면 감정 기록을 옮겨야 하나요?",
          evidence,
          options: [settingsOption],
          sceneIds: sceneId ? [sceneId] : [],
        }));
        break;
      case "character-never-appears":
        findings.push(createPlausibilityFinding(ctx, {
          ...base,
          category: "character-consistency",
          severity: "suggestion",
          confidence: "certain",
          title: "한 번도 나오지 않는 인물이 있어요",
          question: "이 인물은 아직 등장 전인가요, 아니면 지워도 되나요?",
          evidence,
          options: [settingsOption],
          sceneIds: [],
        }));
        break;
      case "fact-never-referenced":
        findings.push(createPlausibilityFinding(ctx, {
          ...base,
          category: "setting-rules",
          severity: "suggestion",
          confidence: "certain",
          title: "어디에도 쓰이지 않는 설정이 있어요",
          question: "이 설정은 이야기에서 쓸 건가요? 연결하거나 지울 수 있어요.",
          evidence,
          options: [settingsOption],
          sceneIds: [],
        }));
        break;
      case "scene-order-duplicate":
        findings.push(createPlausibilityFinding(ctx, {
          ...base,
          category: "time-place",
          severity: "warning",
          confidence: "certain",
          title: "장면 순서가 겹쳐요",
          question: "어느 장면이 먼저인가요? 순서 값을 나눠 주세요.",
          evidence,
          options: [settingsOption],
          sceneIds: sceneId ? [sceneId] : [],
        }));
        break;
    }
  }
  return findings;
}
