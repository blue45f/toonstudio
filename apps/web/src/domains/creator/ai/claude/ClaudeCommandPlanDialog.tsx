/**
 * AI 명령 도우미 — 말로 요청하면 스튜디오 명령 순서를 제안하고(실행 계획), 방법을 물으면 설명과 관련 명령·단축키를 알려 주는(알려 줘)
 * 시트. 사용자가 확인한 단계만 실행한다.
 *
 * 이 화면이 지키는 것
 * - **제안과 실행을 나눈다.** Claude는 명령 id 순서만 돌려주고, 실행은 사용자가 단계를 고르고 눌렀을 때만 한다.
 * - 후보는 이미 검색에서 직접 실행해도 된다고 검토된 라이브 바인딩뿐이다. 새 실행기·새 허용 정책은 만들지 않는다.
 *   "알려 줘"는 카탈로그 전체를 근거로 답하되, 실행 버튼은 라이브 바인딩이 있는 명령에만 보인다.
 * - **Ctrl/⌘+Enter는 계획·답변을 만드는 데만 쓴다.** 스튜디오를 바꾸는 "선택한 단계 실행"은 단추를 직접 눌러야 하고, 계획이 준비된 뒤에는
 *   단축키가 아무것도 하지 않는다(습관적으로 누른 키가 요금도 스튜디오 변경도 일으키지 않게).
 * - 사용자 결제 키로 명령 목록을 Anthropic에 직접 보내므로, 실행 전에 처리 경로·전송 내용·비용 상한을 보여 주고 세션 예산을 지킨다.
 * - 배경은 투명하게 두어 실행하는 동안 캔버스에서 결과를 볼 수 있다. 배경 조작은 막아 둔다(실행 중 오조작 방지).
 */
import "@/shared/ai/claude/claude-assist-i18n";

import { ListChecks, LoaderCircle, RefreshCw, Sparkles, Square } from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";

import { CLAUDE_BUTTON, CLAUDE_PRIMARY_BUTTON } from "@/shared/ai/claude/claude-ui";
import { formatClaudeUsd } from "@/shared/ai/claude/claude-usage-meter";
import { ClaudeModelSelect } from "@/shared/ai/claude/ClaudeModelSelect";
import { ClaudePreflight } from "@/shared/ai/claude/ClaudePreflight";
import { resolveClaudeRoute } from "@/shared/ai/claude/claude-route";
import { useClaudeBudgetGuard } from "@/shared/ai/claude/use-claude-budget-guard";
import { useClaudeRoute } from "@/shared/ai/claude/use-claude-route";
import { useClaudeUsageText } from "@/shared/ai/claude/use-claude-usage-text";
import { useI18n, useT } from "@/shared/lib/i18n";

import { STUDIO_COMMAND_CATALOG } from "../../studio-command-catalog";
import {
  getStudioCommandExecutionBindings,
  subscribeStudioCommandExecutionBindings,
} from "../../studio-command-execution-registry";

import { clearRecentRequests, pushRecentRequest, recentRequests } from "./claude-assist-recents";
import { candidatesFromStudioBindings, knowledgeFromStudioCatalog } from "./claude-command-candidates";
import { executeCommandPlanSteps, type CommandStepResult } from "./claude-command-plan";
import {
  estimateCommandAnswerCostCapUsd,
  estimateCommandPlanCostCapUsd,
  runCommandAnswer,
  runCommandPlan,
  type CommandAnswerRunResult,
  type CommandPlanRunResult,
} from "./claude-command-plan-run";
import { ClaudeCommandAnswerResult } from "./ClaudeCommandAnswerResult";
import { ClaudeCommandPlanResult } from "./ClaudeCommandPlanResult";
import { ClaudeCommandRequestPanel, type ClaudeCommandMode } from "./ClaudeCommandRequestPanel";
import { ClaudeDialogFrame, ClaudeShortcutHint } from "./ClaudeDialogFrame";
import { ClaudeTaskStatus } from "./ClaudeTaskStatus";
import { useClaudeTask } from "./use-claude-task";
import { useRevealOnChange } from "./use-reveal-on-change";
import { useRunFocus } from "./use-run-focus";

type Outcome =
  | { readonly kind: "plan"; readonly value: CommandPlanRunResult; readonly request: string }
  | { readonly kind: "answer"; readonly value: CommandAnswerRunResult; readonly request: string };

const noWait = () => Promise.resolve();

function normalize(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export interface ClaudeCommandPlanDialogProps {
  readonly onClose: () => void;
  readonly initialRequest?: string;
  readonly initialMode?: ClaudeCommandMode;
}

export function ClaudeCommandPlanDialog({ onClose, initialRequest = "", initialMode = "do" }: ClaudeCommandPlanDialogProps) {
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const route = useClaudeRoute();
  const usageOf = useClaudeUsageText();
  const bindings = useSyncExternalStore(
    subscribeStudioCommandExecutionBindings,
    getStudioCommandExecutionBindings,
    getStudioCommandExecutionBindings,
  );
  const locale = lang === "ko" ? "ko" : "en";
  const candidates = useMemo(() => candidatesFromStudioBindings(bindings, STUDIO_COMMAND_CATALOG, locale), [bindings, locale]);
  const knowledge = useMemo(() => knowledgeFromStudioCatalog(bindings, STUDIO_COMMAND_CATALOG, locale), [bindings, locale]);
  const usableCount = useMemo(() => candidates.filter((candidate) => !candidate.disabled).length, [candidates]);
  const shortcuts = useMemo(
    () => new Map(knowledge.flatMap((item) => (item.shortcut ? [[item.commandId, item.shortcut] as const] : []))),
    [knowledge],
  );

  const task = useClaudeTask();
  const execTask = useClaudeTask();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hintId = `${useId()}-need-hint`;

  const [mode, setMode] = useState<ClaudeCommandMode>(initialMode);
  const [request, setRequest] = useState(initialRequest);
  const [model, setModel] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [planResults, setPlanResults] = useState<readonly CommandStepResult[]>([]);
  const [answerResults, setAnswerResults] = useState<ReadonlyMap<string, CommandStepResult>>(new Map());
  const [notice, setNotice] = useState<string | null>(null);
  const [recents, setRecents] = useState<readonly string[]>(() => recentRequests(initialMode));
  // 계획·답변이 나올 때마다 하나씩 올라가는 표식. 결과가 나오면 좁은 화면에서도 결과가 보이도록 스크롤한다.
  const [finishedRuns, setFinishedRuns] = useState(0);
  const resultRef = useRevealOnChange<HTMLDivElement>(finishedRuns);

  const busy = task.running || execTask.running;
  const { runRef, stopRef } = useRunFocus(busy);
  const itemCount = mode === "do" ? usableCount : knowledge.length;
  const effectiveModel = model || route?.model || "";
  const trimmed = normalize(request);

  // 보낼 요청이 아직 없으면 계산할 수 없다(undefined). "단가를 모른다"(null)와 구분해야 입력 전에 가짜 경고가 뜨지 않는다.
  const capUsd = useMemo(() => {
    if (!effectiveModel || trimmed.length === 0 || itemCount === 0) return undefined;
    return mode === "do"
      ? estimateCommandPlanCostCapUsd(effectiveModel, trimmed, candidates)
      : estimateCommandAnswerCostCapUsd(effectiveModel, trimmed, knowledge);
  }, [candidates, effectiveModel, itemCount, knowledge, mode, trimmed]);
  const guard = useClaudeBudgetGuard(capUsd);

  const planFresh = outcome?.kind === "plan" && mode === "do" && outcome.request === trimmed;
  const readyToRun = Boolean(planFresh && outcome.value.plan.steps.length > 0 && planResults.length === 0 && !execTask.running);
  const paidReady = Boolean(route && trimmed.length > 0 && itemCount > 0 && !busy && guard.allowed);

  const switchMode = (next: ClaudeCommandMode) => {
    if (next === mode) return;
    setMode(next);
    setRecents(recentRequests(next));
    setNotice(null);
    task.reset();
  };

  const ask = async () => {
    if (!paidReady) return;
    const claudeRoute = resolveClaudeRoute();
    const asked = trimmed;
    const asking = mode;
    // 동의는 이 요청에 한 번만 쓴다. 보내기 전에 값을 읽어 전송 계층의 예산 판정에 넘기고 동의를 거둔다.
    const budgetOverride = guard.overridden;
    guard.consumeOverride();
    setNotice(null);
    const result = await task.start(async (signal): Promise<Outcome> => {
      if (!claudeRoute) throw new Error(t("claudeAssist.common.needConnection"));
      const options = { model: model || undefined, signal, budgetOverride };
      return asking === "do"
        ? { kind: "plan", value: await runCommandPlan(claudeRoute, asked, candidates, options), request: asked }
        : { kind: "answer", value: await runCommandAnswer(claudeRoute, asked, knowledge, options), request: asked };
    });
    if (!result) return;
    setOutcome(result);
    setPlanResults([]);
    setAnswerResults(new Map());
    setSelected(result.kind === "plan" ? new Set(result.value.plan.steps.map((step) => step.commandId)) : new Set());
    setRecents(pushRecentRequest(asking, asked));
    setFinishedRuns((count) => count + 1);
  };

  const runSteps = async () => {
    if (busy || outcome?.kind !== "plan") return;
    const steps = outcome.value.plan.steps.filter((step) => selected.has(step.commandId));
    if (steps.length === 0) {
      setNotice(t("claudeAssist.plan.noneSelected"));
      return;
    }
    setPlanResults([]);
    setNotice(null);
    const finished = await execTask.start((signal) => executeCommandPlanSteps(
      steps,
      (commandId) => getStudioCommandExecutionBindings().get(commandId),
      { signal, onStep: (result) => setPlanResults((previous) => [...previous, result]) },
    ));
    if (finished) setNotice(t("claudeAssist.plan.runDone", { count: finished.filter((result) => result.status === "executed").length }));
  };

  const runNow = async (commandId: string) => {
    if (busy) return;
    const label = knowledge.find((item) => item.commandId === commandId)?.label ?? commandId;
    setNotice(null);
    const finished = await execTask.start((signal) => executeCommandPlanSteps(
      [{ commandId, label, reason: "" }],
      (id) => getStudioCommandExecutionBindings().get(id),
      { signal, settle: noWait },
    ));
    const result = finished?.[0];
    if (result) setAnswerResults((previous) => new Map(previous).set(commandId, result));
  };

  const toggleStep = (commandId: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(commandId)) next.delete(commandId);
      else next.add(commandId);
      return next;
    });
  };

  const stop = () => {
    task.stop();
    execTask.stop();
  };

  const { reset: resetTask } = task;
  const { reset: resetExecTask } = execTask;
  const close = useCallback(() => {
    resetTask();
    resetExecTask();
    onClose();
  }, [onClose, resetExecTask, resetTask]);

  const examples = mode === "do"
    ? [t("claudeAssist.plan.exampleDo1"), t("claudeAssist.plan.exampleDo2"), t("claudeAssist.plan.exampleDo3")]
    : [t("claudeAssist.plan.exampleAsk1"), t("claudeAssist.plan.exampleAsk2"), t("claudeAssist.plan.exampleAsk3")];

  const needHint = !route
    ? null
    : trimmed.length === 0
      ? t("claudeAssist.plan.needRequest")
      : itemCount === 0
        ? t("claudeAssist.plan.noCandidates")
        : !guard.allowed
          ? t("claudeAssist.art.needBudget")
          : null;

  const transferText = t(mode === "do" ? "claudeAssist.plan.preflightTransferDo" : "claudeAssist.plan.preflightTransferAsk", { count: itemCount });
  const showPlanResult = outcome?.kind === "plan" && mode === "do";
  const showAnswerResult = outcome?.kind === "answer" && mode === "explain";
  const primary = readyToRun ? "run" : "ask";
  const askLabel = mode === "do"
    ? (outcome?.kind === "plan" ? t("claudeAssist.plan.remake") : t("claudeAssist.plan.make"))
    : (outcome?.kind === "answer" ? t("claudeAssist.plan.askAgain") : t("claudeAssist.plan.ask"));

  // 단축키는 계획·답변 만들기에만 쓴다. 계획이 준비돼 주 버튼이 "실행"인 동안에는 아무것도 하지 않는다.
  const shortcutAsk = primary === "ask" ? () => void ask() : undefined;

  const footer = (
    <div className="flex flex-wrap items-center gap-3">
      {primary === "run" ? (
        <>
          <button ref={runRef} type="button" className={CLAUDE_PRIMARY_BUTTON} disabled={busy || selected.size === 0} onClick={() => void runSteps()}>
            <Sparkles size={16} aria-hidden />
            {t("claudeAssist.plan.runSelectedCount", { count: selected.size })}
          </button>
          <button type="button" className={CLAUDE_BUTTON} disabled={!paidReady} onClick={() => void ask()}>
            <RefreshCw size={16} aria-hidden />
            {t("claudeAssist.plan.remake")}
          </button>
        </>
      ) : (
        <button ref={runRef} type="button" className={CLAUDE_PRIMARY_BUTTON} disabled={!paidReady} aria-describedby={needHint ? hintId : undefined} onClick={() => void ask()}>
          {task.running ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
          {askLabel}
        </button>
      )}
      {busy ? (
        <button ref={stopRef} type="button" className={CLAUDE_BUTTON} onClick={stop}>
          <Square size={14} aria-hidden />
          {t("claudeAssist.common.stop")}
        </button>
      ) : null}
      {typeof capUsd === "number" ? (
        <span className="text-xs font-semibold text-fg-2" data-claude-footer-cap="true">
          {t("claudeAssist.preflight.capChip", { cost: formatClaudeUsd(capUsd) })}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-3">
        {needHint ? <span id={hintId} data-claude-need-hint="true" className="text-xs text-fg-3">{needHint}</span> : null}
        {shortcutAsk ? <ClaudeShortcutHint action={t("claudeAssist.common.shortcutRun")} /> : null}
      </span>
    </div>
  );

  return (
    <ClaudeDialogFrame
      activeKey="claude-command-plan"
      rootAttribute="data-claude-command-plan-root"
      variant="sheet"
      icon={ListChecks}
      title={t("claudeAssist.plan.title")}
      description={t("claudeAssist.plan.description")}
      onClose={close}
      onPrimaryShortcut={shortcutAsk}
      footer={footer}
    >
      <div className="space-y-4">
        {!route ? (
          <div className="space-y-2 rounded-xl border border-line bg-raised/50 p-3 text-sm">
            <p>{t("claudeAssist.common.needConnection")}</p>
            <Link to="/settings/ai?source=studio" className={CLAUDE_BUTTON} onClick={close}>{t("claudeAssist.common.openSettings")}</Link>
          </div>
        ) : null}

        <ClaudeCommandRequestPanel
          mode={mode}
          onMode={switchMode}
          request={request}
          onRequest={setRequest}
          disabled={busy}
          examples={examples}
          recents={recents}
          onClearRecents={() => {
            clearRecentRequests(mode);
            setRecents([]);
          }}
          itemCount={itemCount}
          textareaRef={textareaRef}
        />

        <div className="sm:max-w-xs">
          <label htmlFor="claude-plan-model" className="mb-1 block text-xs font-bold text-fg-2">{t("claudeAssist.common.modelLabel")}</label>
          <ClaudeModelSelect id="claude-plan-model" value={model} onChange={setModel} defaultModel={route?.model ?? ""} disabled={busy} />
        </div>

        <ClaudePreflight
          model={effectiveModel}
          capUsd={capUsd}
          guard={guard}
          summary={transferText}
          rows={[
            { label: t("claudeAssist.preflight.transfer"), value: transferText },
            { label: t("claudeAssist.preflight.time"), value: t("claudeAssist.plan.preflightTime") },
            { label: t("claudeAssist.preflight.output"), value: t(mode === "do" ? "claudeAssist.plan.preflightOutputDo" : "claudeAssist.plan.preflightOutputAsk") },
            { label: t("claudeAssist.preflight.protection"), value: t(mode === "do" ? "claudeAssist.plan.preflightProtectionDo" : "claudeAssist.plan.preflightProtectionAsk") },
          ]}
        />

        <ClaudeTaskStatus
          running={busy}
          elapsedSeconds={execTask.running ? execTask.elapsedSeconds : task.elapsedSeconds}
          runningText={execTask.running ? t("claudeAssist.plan.running") : t(mode === "do" ? "claudeAssist.plan.planning" : "claudeAssist.plan.answering")}
          message={task.state.status === "stopped" ? t("claudeAssist.plan.stopped") : notice}
        />
        {task.state.status === "error" ? (
          <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
            {t("claudeAssist.plan.error", { message: task.state.message })}
          </p>
        ) : null}

        {showPlanResult || showAnswerResult ? (
          <div ref={resultRef} className="space-y-4">
            {showPlanResult && outcome?.kind === "plan" ? (
              <ClaudeCommandPlanResult
                outcome={outcome.value}
                stale={!planFresh}
                selected={selected}
                onToggle={toggleStep}
                onRun={() => void runSteps()}
                running={execTask.running}
                busy={busy}
                results={planResults}
                shortcuts={shortcuts}
                usageText={usageOf(outcome.value)}
              />
            ) : null}
            {showAnswerResult && outcome?.kind === "answer" ? (
              <ClaudeCommandAnswerResult
                outcome={outcome.value}
                canRunNow={(commandId) => {
                  const binding = bindings.get(commandId);
                  return Boolean(binding && !binding.disabled);
                }}
                onRunNow={(commandId) => void runNow(commandId)}
                runResults={answerResults}
                busy={busy}
                onFollowUp={(question) => {
                  setRequest(question);
                  textareaRef.current?.focus({ preventScroll: true });
                }}
                usageText={usageOf(outcome.value)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </ClaudeDialogFrame>
  );
}
