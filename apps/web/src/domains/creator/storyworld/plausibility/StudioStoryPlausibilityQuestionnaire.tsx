/**
 * 장면별 개연성 질문지.
 *
 * 장면마다 여섯 가지(성격·동기·원인·정보·우연의 단서·결과)를 묻는다. 답은 문서의 기존 필드에 기록되어 인과
 * 점검이 그대로 쓰고, 답하지 않은 칸은 ‘점검 불가’로 남는다. 진행률, 건너뛰기, 임시 저장(저장하지 않은 입력은
 * 장면을 옮겨도 남아 있다), 키보드 이동을 지원한다.
 *
 * 키보드: 장면 목록 ↑/↓/Home/End, 질문 단계 ←/→/Home/End(탭 목록처럼 동작), 폼 어디서나 Ctrl+Enter로
 * ‘저장하고 다음’. 브라우저 기본 단축키(Alt+←/→, Ctrl+PageUp/Down)는 쓰지 않는다.
 */
import { ArrowLeft, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { StoryworldProject, StoryworldQuestionId, StoryworldSceneRole } from "../studio-storyworld-causality";
import {
  CauseForm,
  CoincidenceForm,
  ConsequenceForm,
  InformationForm,
  MotiveForm,
  RolesForm,
} from "./StudioStoryPlausibilityQuestionForms";
import {
  applyCauseDraft,
  applyCoincidenceDraft,
  applyConsequenceDraft,
  applyInformationRows,
  applyMotiveRows,
  applyRolesDraft,
  causeDraftFromScene,
  coincidenceDraftFromScene,
  coincidenceFormIssue,
  consequenceDraftFromScene,
  informationRowsFromScene,
  motiveFormIssue,
  motiveRowsFromScene,
  rolesDraftFromScene,
  type CauseDraft,
  type CoincidenceDraft,
  type ConsequenceDraft,
  type InformationRowDraft,
  type MotiveRowDraft,
} from "./studio-story-plausibility-question-drafts";
import {
  PLAUSIBILITY_QUESTIONS,
  markQuestion,
  plausibilityQuestionnaireProgress,
  plausibilitySceneProgress,
  skipScene,
} from "./studio-story-plausibility-questions";
import type { PlausibilityQuestionStatus } from "./studio-story-plausibility-status";

export interface QuestionnaireProps {
  readonly project: StoryworldProject;
  readonly readOnly: boolean;
  readonly initialSceneId: string | null;
  readonly initialQuestion: StoryworldQuestionId | null;
  /** 답을 문서에 쓴다. 호출한 쪽이 되돌리기 항목을 쌓고 저장한다. */
  readonly onApply: (next: StoryworldProject, label: string) => void;
  readonly onClose: () => void;
}

interface SceneDrafts {
  readonly roles?: readonly StoryworldSceneRole[];
  readonly motive?: readonly MotiveRowDraft[];
  readonly cause?: CauseDraft;
  readonly information?: readonly InformationRowDraft[];
  readonly coincidence?: CoincidenceDraft;
  readonly consequence?: ConsequenceDraft;
}

const STATUS_LABELS: Readonly<Record<PlausibilityQuestionStatus, string>> = {
  answered: "답함",
  "not-applicable": "해당 없음",
  unknown: "모름",
  skipped: "건너뜀",
  unanswered: "아직",
};

function focusSoon(element: HTMLElement | null) {
  if (element) queueMicrotask(() => element.focus());
}

export function StudioStoryPlausibilityQuestionnaire(props: QuestionnaireProps) {
  const { project, readOnly } = props;
  const scenes = useMemo(
    () => project.scenes.filter((scene) => scene.disabled !== true).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [project.scenes],
  );
  const progress = useMemo(() => plausibilityQuestionnaireProgress(project), [project]);
  const [sceneId, setSceneId] = useState<string | null>(props.initialSceneId ?? progress.nextSceneId ?? scenes[0]?.id ?? null);
  const [question, setQuestion] = useState<StoryworldQuestionId>(props.initialQuestion ?? "roles");
  const [drafts, setDrafts] = useState<Readonly<Record<string, SceneDrafts>>>({});
  const [message, setMessage] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sceneListRef = useRef<HTMLUListElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** 창 단위 Ctrl+Enter 처리기가 항상 최신 저장 함수를 부르게 한다. */
  const saveAndNextRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
      const panel = panelRef.current;
      if (!panel || !(event.target instanceof Node) || !panel.contains(event.target)) return;
      event.preventDefault();
      saveAndNextRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const scene = scenes.find((candidate) => candidate.id === sceneId) ?? scenes[0];
  if (!scene) {
    return (
      <div className="plausibility-hub">
        <div className="plausibility-empty">
          <h3>질문할 장면이 아직 없어요</h3>
          <p>장면이 있어야 질문할 수 있어요. 원고로 시작하거나 설정 관리에서 장면을 만들어 주세요.</p>
          <div className="plausibility-empty__actions">
            <button className="storyworld-button" onClick={props.onClose} type="button"><ArrowLeft aria-hidden size={14} /> 리포트로 돌아가기</button>
          </div>
        </div>
      </div>
    );
  }

  const sceneIndex = scenes.indexOf(scene);
  const sceneProgress = plausibilitySceneProgress(scene);
  const questionIndex = PLAUSIBILITY_QUESTIONS.findIndex((item) => item.id === question);
  const definition = PLAUSIBILITY_QUESTIONS[questionIndex] ?? PLAUSIBILITY_QUESTIONS[0];
  const sceneDrafts: SceneDrafts = drafts[scene.id] ?? {};
  const dirty = (id: StoryworldQuestionId): boolean => sceneDrafts[id] !== undefined;

  const patchDrafts = (patch: SceneDrafts) => setDrafts((previous) => ({ ...previous, [scene.id]: { ...previous[scene.id], ...patch } }));
  const clearDraft = (id: StoryworldQuestionId) => setDrafts((previous) => {
    const current = previous[scene.id];
    if (!current) return previous;
    const { [id]: _removed, ...rest } = current;
    return { ...previous, [scene.id]: rest };
  });

  const rolesValue = sceneDrafts.roles ?? rolesDraftFromScene(scene);
  const motiveValue = sceneDrafts.motive ?? motiveRowsFromScene(project, scene);
  const causeValue = sceneDrafts.cause ?? causeDraftFromScene(scene);
  const informationValue = sceneDrafts.information ?? informationRowsFromScene(project, scene);
  const coincidenceValue = sceneDrafts.coincidence ?? coincidenceDraftFromScene(scene);
  const consequenceValue = sceneDrafts.consequence ?? consequenceDraftFromScene(project, scene);

  const issue: string | null = question === "motive"
    ? motiveFormIssue(motiveValue)
    : question === "coincidence"
      ? coincidenceFormIssue(coincidenceValue)
      : null;

  const goToQuestion = (index: number) => {
    const next = PLAUSIBILITY_QUESTIONS[Math.max(0, Math.min(PLAUSIBILITY_QUESTIONS.length - 1, index))];
    if (next) setQuestion(next.id);
  };
  const goToScene = (index: number) => {
    const next = scenes[Math.max(0, Math.min(scenes.length - 1, index))];
    if (!next) return;
    setSceneId(next.id);
    setQuestion("roles");
    setMessage(`장면 ${next.order}. ${next.title}로 옮겼어요.`);
    focusSoon(headingRef.current);
  };
  const advance = () => {
    if (questionIndex < PLAUSIBILITY_QUESTIONS.length - 1) goToQuestion(questionIndex + 1);
    else if (sceneIndex < scenes.length - 1) goToScene(sceneIndex + 1);
    else setMessage("마지막 장면의 마지막 질문이에요. 리포트로 돌아가 결과를 확인해 보세요.");
  };

  const commitCurrent = (): StoryworldProject | null => {
    if (readOnly || issue !== null) return null;
    switch (question) {
      case "roles": return applyRolesDraft(project, scene.id, rolesValue);
      case "motive": return applyMotiveRows(project, scene.id, motiveValue);
      case "cause": return applyCauseDraft(project, scene.id, causeValue);
      case "information": return applyInformationRows(project, scene.id, informationValue);
      case "coincidence": return applyCoincidenceDraft(project, scene.id, coincidenceValue);
      case "consequence": return applyConsequenceDraft(project, scene.id, consequenceValue);
    }
  };
  const save = (moveNext: boolean) => {
    const next = commitCurrent();
    if (next === null) {
      if (issue !== null) setMessage(issue);
      return;
    }
    if (next !== project) props.onApply(next, `‘${scene.title}’의 ${definition?.label ?? ""} 답을 저장했어요.`);
    clearDraft(question);
    setMessage(`‘${definition?.label ?? ""}’ 답을 저장했어요.`);
    if (moveNext) advance();
  };
  const mark = (state: "not-applicable" | "unknown" | "skipped") => {
    if (readOnly) return;
    const next = markQuestion(project, scene.id, question, state);
    if (next !== project) {
      props.onApply(next, `‘${scene.title}’의 ${definition?.label ?? ""}을(를) ‘${state === "unknown" ? "모름" : state === "skipped" ? "건너뜀" : "해당 없음"}’으로 표시했어요.`);
    }
    clearDraft(question);
    advance();
  };
  const skipWholeScene = () => {
    if (readOnly) return;
    const next = skipScene(project, scene.id);
    if (next !== project) props.onApply(next, `‘${scene.title}’의 남은 질문을 건너뛰었어요.`);
    if (sceneIndex < scenes.length - 1) goToScene(sceneIndex + 1);
  };

  saveAndNextRef.current = () => save(true);

  const onStepKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? PLAUSIBILITY_QUESTIONS.length - 1
      : event.key === "ArrowRight" ? Math.min(PLAUSIBILITY_QUESTIONS.length - 1, questionIndex + 1)
      : Math.max(0, questionIndex - 1);
    goToQuestion(nextIndex);
    queueMicrotask(() => stepsRef.current?.querySelectorAll<HTMLElement>("[role=tab]")[nextIndex]?.focus());
  };
  const onSceneKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(sceneListRef.current?.querySelectorAll<HTMLElement>("button[data-scene-id]") ?? []);
    const index = buttons.indexOf(event.currentTarget);
    if (index < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? buttons.length - 1
      : event.key === "ArrowDown" ? Math.min(buttons.length - 1, index + 1)
      : Math.max(0, index - 1);
    buttons[nextIndex]?.focus();
  };

  const statusFor = (id: StoryworldQuestionId): PlausibilityQuestionStatus => sceneProgress.statuses[id];

  return (
    <div className="plausibility-hub">
      <div className="plausibility-hub__header">
        <div className="plausibility-hub__intro">
          <h2>개연성 질문지</h2>
          <p>
            완료한 장면 {progress.completeScenes}/{progress.totalScenes} ({progress.percent}%)
            {readOnly ? " · 예시 이야기에서는 답을 저장하지 않아요" : " · 답한 칸은 인과 점검이 바로 쓰고, 건너뛴 칸은 ‘점검 불가’로 남아요"}
          </p>
        </div>
        <div className="plausibility-hub__actions">
          {progress.nextSceneId !== null && progress.nextSceneId !== scene.id ? (
            <button className="storyworld-button" onClick={() => goToScene(scenes.findIndex((candidate) => candidate.id === progress.nextSceneId))} type="button">
              다음 안 끝난 장면으로
            </button>
          ) : null}
          <button className="storyworld-button" onClick={props.onClose} type="button"><ArrowLeft aria-hidden size={14} /> 리포트로 돌아가기</button>
        </div>
      </div>
      <p aria-live="polite" className="plausibility-live" role="status">{message}</p>

      <div className="plausibility-qn">
        <nav aria-label="장면 목록" className="plausibility-card">
          <div
            aria-label={`질문지 진행률 ${progress.percent}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress.percent}
            className="plausibility-meter"
            role="meter"
          >
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <ul className="plausibility-qn__scenes" ref={sceneListRef}>
            {scenes.map((candidate) => {
              const item = progress.scenes.find((entry) => entry.sceneId === candidate.id);
              return (
                <li key={candidate.id}>
                  <button
                    aria-current={candidate.id === scene.id ? "true" : undefined}
                    className="plausibility-qn__scene"
                    data-scene-id={candidate.id}
                    onClick={() => { setSceneId(candidate.id); setQuestion("roles"); }}
                    onKeyDown={onSceneKeyDown}
                    tabIndex={candidate.id === scene.id ? 0 : -1}
                    type="button"
                  >
                    <span>{candidate.order}. {candidate.title}</span>
                    <small>{item ? `${item.handled}/${item.total}` : ""}{item?.complete ? " ✓" : ""}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section aria-labelledby="pl-qn-title" className="plausibility-card">
          <h3 id="pl-qn-title" ref={headingRef} tabIndex={-1}>장면 {scene.order}. {scene.title}</h3>
          <p className="plausibility-hint">
            이 장면의 질문 {sceneProgress.handled}/{sceneProgress.total}개를 다뤘어요 · 장면 {sceneIndex + 1}/{scenes.length}
          </p>
          <div aria-label="질문 단계" className="plausibility-steps" ref={stepsRef} role="tablist">
            {PLAUSIBILITY_QUESTIONS.map((item, index) => (
              <button
                aria-controls="pl-qn-panel"
                aria-selected={item.id === question}
                id={`pl-qn-tab-${item.id}`}
                key={item.id}
                onClick={() => setQuestion(item.id)}
                onKeyDown={onStepKeyDown}
                role="tab"
                tabIndex={item.id === question ? 0 : -1}
                type="button"
              >
                {index + 1}. {item.label} · {dirty(item.id) ? "저장 안 됨" : STATUS_LABELS[statusFor(item.id)]}
              </button>
            ))}
          </div>

          <div aria-labelledby={`pl-qn-tab-${question}`} id="pl-qn-panel" ref={panelRef} role="tabpanel">
            <h4>{definition?.prompt}</h4>
            <p className="plausibility-hint">{definition?.help}</p>
            {question === "roles" ? <RolesForm onChange={(roles) => patchDrafts({ roles })} project={project} readOnly={readOnly} scene={scene} value={rolesValue} /> : null}
            {question === "motive" ? <MotiveForm onChange={(motive) => patchDrafts({ motive })} project={project} readOnly={readOnly} scene={scene} value={motiveValue} /> : null}
            {question === "cause" ? <CauseForm onChange={(cause) => patchDrafts({ cause })} project={project} readOnly={readOnly} scene={scene} value={causeValue} /> : null}
            {question === "information" ? <InformationForm onChange={(information) => patchDrafts({ information })} project={project} readOnly={readOnly} scene={scene} value={informationValue} /> : null}
            {question === "coincidence" ? <CoincidenceForm onChange={(coincidence) => patchDrafts({ coincidence })} project={project} readOnly={readOnly} scene={scene} value={coincidenceValue} /> : null}
            {question === "consequence" ? <ConsequenceForm onChange={(consequence) => patchDrafts({ consequence })} project={project} readOnly={readOnly} scene={scene} value={consequenceValue} /> : null}
            {issue !== null ? <p className="plausibility-hint" id="pl-qn-issue" role="note">{issue}</p> : null}
          </div>

          <div className="plausibility-qn__actions">
            <button className="storyworld-button storyworld-button--primary" disabled={readOnly || issue !== null} onClick={() => save(true)} type="button">
              <Check aria-hidden size={14} /> 저장하고 다음
            </button>
            <button className="storyworld-button" disabled={readOnly || issue !== null} onClick={() => save(false)} type="button">임시 저장</button>
            <button className="storyworld-button" disabled={readOnly} onClick={() => mark("not-applicable")} type="button">해당 없음</button>
            <button className="storyworld-button" disabled={readOnly} onClick={() => mark("unknown")} type="button">모르겠어요</button>
            <button className="storyworld-button" disabled={readOnly} onClick={() => mark("skipped")} type="button">건너뛰기</button>
            <span className="plausibility-spacer" />
            <button className="storyworld-button" disabled={sceneIndex === 0} onClick={() => goToScene(sceneIndex - 1)} type="button"><ChevronLeft aria-hidden size={14} /> 이전 장면</button>
            <button className="storyworld-button" disabled={sceneIndex >= scenes.length - 1} onClick={() => goToScene(sceneIndex + 1)} type="button">다음 장면 <ChevronRight aria-hidden size={14} /></button>
            <button className="storyworld-button" disabled={readOnly} onClick={skipWholeScene} type="button">이 장면 건너뛰기</button>
          </div>
          <p className="plausibility-hint">
            Ctrl+Enter: 저장하고 다음 · 질문 단계에서 ←/→ · 장면 목록에서 ↑/↓. 저장하지 않은 입력은 장면을 옮겨도 남아 있어요.
          </p>
        </section>
      </div>
    </div>
  );
}
