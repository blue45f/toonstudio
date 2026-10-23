/**
 * AI 번역 도우미 — 말풍선 대사를 줄마다 번호를 지켜 번역하고, 말풍선 폭·용어집 준수를 점검하는 대화상자.
 *
 * 이 화면이 지키는 것
 * - 사용자 결제 키로 입력한 글을 Anthropic에 직접 보내므로, 실행 전에 처리 경로·전송 내용·**비용 상한**·실패 정책을 보여 준다
 *   (스튜디오 AI 어시스트 허브의 "실행 전 확인"과 같은 어휘). 세션 예산을 넘을 수 있으면 사용자가 확인하기 전에는 보내지 않는다.
 * - 줄 수·줄 길이 한도를 넘으면 조용히 자르지 않고 어디가 문제인지 알려 준다.
 * - 25줄을 넘으면 묶음으로 나눠 차례로 보낸다(응답이 길어져 잘리는 것을 막는다). 묶음마다 예산 판정을 받고, 끝난 묶음은 바로 보여 주며,
 *   중간에 멈추거나 실패해도 이미 번역된 줄은 남기고 번역하지 못한 줄을 표시한다.
 * - 자동 재시도·모델 대체가 없다. 중단은 즉시 요청을 취소하고, 닫으면 진행 중인 요청도 취소한다.
 * - 원문은 저장하거나 바꾸지 않는다. 결과는 메모리에만 두고, 사용자가 복사해야 작품에 닿는다.
 */
import "@/shared/ai/claude/claude-assist-i18n";

import { Languages, LoaderCircle, RefreshCw, Sparkles, Square } from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { CLAUDE_PRESET_IDS, resolveClaudePreset, type ClaudePresetId } from "@/shared/ai/claude/claude-effort-presets";
import { resolveClaudeRoute } from "@/shared/ai/claude/claude-route";
import { CLAUDE_BUTTON, CLAUDE_INPUT, CLAUDE_PRIMARY_BUTTON, CLAUDE_QUIET_BUTTON } from "@/shared/ai/claude/claude-ui";
import { formatClaudeUsd } from "@/shared/ai/claude/claude-usage-meter";
import { ClaudePreflight } from "@/shared/ai/claude/ClaudePreflight";
import { useClaudeBudgetGuard } from "@/shared/ai/claude/use-claude-budget-guard";
import { useClaudeRoute } from "@/shared/ai/claude/use-claude-route";
import { useClaudeUsageText } from "@/shared/ai/claude/use-claude-usage-text";
import { useI18n, useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  findLinesProblem,
  LOCALIZE_CHUNK_LINES,
  LOCALIZE_LIMITS,
  parseGlossary,
  parseLocalizeLines,
  planLocalizeChunks,
  withMissingLocalizeLines,
  type LocalizeInput,
} from "./claude-localize";
import { initialLocalizeForm, type LocalizeForm } from "./claude-localize-form";
import { estimateLocalizeCostCapUsd, runLocalize, type LocalizeRunResult } from "./claude-localize-run";
import { ClaudeDialogFrame, ClaudeShortcutHint } from "./ClaudeDialogFrame";
import { ClaudeLocalizeResult } from "./ClaudeLocalizeResult";
import { ClaudeLocalizeSetup } from "./ClaudeLocalizeSetup";
import { ClaudeTaskStatus } from "./ClaudeTaskStatus";
import { useClaudeTask } from "./use-claude-task";
import { useRevealOnChange } from "./use-reveal-on-change";
import { useRunFocus } from "./use-run-focus";

interface LocalizeOutcome {
  readonly run: LocalizeRunResult;
  /** 이 결과를 만든 입력. 화면의 입력이 바뀌어도 결과는 이 입력 기준으로 점검한다. */
  readonly input: LocalizeInput;
}

export interface ClaudeLocalizeDialogProps {
  readonly onClose: () => void;
}

function sameLines(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, index) => line === b[index]);
}

export function ClaudeLocalizeDialog({ onClose }: ClaudeLocalizeDialogProps) {
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const route = useClaudeRoute();
  const task = useClaudeTask();
  const usageOf = useClaudeUsageText();

  const [text, setText] = useState("");
  const [form, setForm] = useState<LocalizeForm>(() => initialLocalizeForm(lang));
  const [outcome, setOutcome] = useState<LocalizeOutcome | null>(null);
  const [edits, setEdits] = useState<ReadonlyMap<number, string>>(new Map());
  // 묶음으로 나눠 보내는 동안의 진행(끝난 묶음 수 / 전체 묶음 수).
  const [progress, setProgress] = useState<{ readonly done: number; readonly total: number } | null>(null);
  // 실행이 끝날 때마다 하나씩 올라가는 표식. 결과가 나오면 좁은 화면에서도 결과가 보이도록 스크롤한다.
  const [finishedRuns, setFinishedRuns] = useState(0);
  const resultRef = useRevealOnChange<HTMLDivElement>(finishedRuns);
  const idBase = useId();

  const running = task.running;
  const { runRef, stopRef } = useRunFocus(running);
  const connectionModel = route?.model ?? "";

  const parsed = useMemo(() => parseLocalizeLines(text), [text]);
  const problem = useMemo(() => findLinesProblem(parsed.lines, parsed.lineNumbers), [parsed.lineNumbers, parsed.lines]);
  const glossary = useMemo(() => parseGlossary(form.glossaryText), [form.glossaryText]);
  const totalChars = useMemo(() => parsed.lines.reduce((sum, line) => sum + [...line].length, 0), [parsed.lines]);

  const input = useMemo<LocalizeInput>(() => ({
    lines: parsed.lines,
    sourceLang: form.sourceLang,
    targetLang: form.targetLang,
    tone: form.tone,
    budget: form.budget,
    glossary: glossary.entries,
    genre: form.genre,
    notes: form.notes,
  }), [form.budget, form.genre, form.notes, form.sourceLang, form.targetLang, form.tone, glossary.entries, parsed.lines]);

  const resolved = useMemo(
    () => resolveClaudePreset(form.presetId, connectionModel, { customModel: form.customModel, customDepth: form.customDepth }),
    [connectionModel, form.customDepth, form.customModel, form.presetId],
  );
  // 원문과 번역할 언어가 같으면 요금만 나가고 달라지는 것이 없다. 보내기 전에 막고 이유를 알린다.
  const sameLanguage = form.sourceLang !== "auto" && form.sourceLang === form.targetLang;
  const sendable = problem === null && !sameLanguage;
  const caps = useMemo(() => {
    const entries = CLAUDE_PRESET_IDS.map((id: ClaudePresetId) => {
      if (!sendable) return [id, undefined] as const;
      const preset = resolveClaudePreset(id, connectionModel, { customModel: form.customModel, customDepth: form.customDepth });
      return [id, estimateLocalizeCostCapUsd(preset.model, input, preset.depth)] as const;
    });
    return Object.fromEntries(entries) as Record<ClaudePresetId, number | null | undefined>;
  }, [connectionModel, form.customDepth, form.customModel, input, sendable]);
  // 보낼 수 있는 입력이 아직 없으면 계산할 수 없다(undefined). "단가를 모른다"(null)와 구분해야 입력 전에 가짜 경고가 뜨지 않는다.
  const capUsd = sendable ? caps[form.presetId] ?? null : undefined;
  const guard = useClaudeBudgetGuard(capUsd);

  const patchForm = useCallback((patch: Partial<LocalizeForm>) => {
    setForm((previous) => ({ ...previous, ...patch }));
  }, []);

  const canRun = Boolean(route && sendable && !running && guard.allowed);

  const run = async () => {
    if (!canRun) return;
    const claudeRoute = resolveClaudeRoute();
    const runInput = input;
    // 동의는 이 요청에 한 번만 쓴다. 보내기 전에 값을 읽어 전송 계층의 예산 판정에 넘기고 동의를 거둔다.
    const budgetOverride = guard.overridden;
    guard.consumeOverride();
    setProgress({ done: 0, total: planLocalizeChunks(runInput.lines.length).length });
    let started = false;
    const result = await task.start(async (signal) => {
      if (!claudeRoute) throw new Error(t("claudeAssist.common.needConnection"));
      return runLocalize(claudeRoute, runInput, {
        model: resolved.model,
        depth: resolved.depth,
        signal,
        budgetOverride,
        // 묶음이 끝날 때마다 그때까지의 결과를 보여 준다. 중단해도 끝난 묶음은 남는다.
        onProgress: (partial) => {
          if (!started) {
            started = true;
            setEdits(new Map());
          }
          setOutcome({ run: partial, input: runInput });
          setProgress({ done: partial.chunks.done, total: partial.chunks.total });
        },
      });
    });
    if (!result) return;
    setOutcome({ run: result, input: runInput });
    if (!started) setEdits(new Map());
    setFinishedRuns((count) => count + 1);
  };

  const { reset: resetTask } = task;
  const close = useCallback(() => {
    resetTask();
    onClose();
  }, [onClose, resetTask]);

  const editLine = useCallback((index: number, value: string) => {
    setEdits((previous) => new Map(previous).set(index, value));
  }, []);

  const stale = Boolean(outcome && !sameLines(outcome.input.lines, parsed.lines));
  const hasResult = outcome !== null;
  // 멈추거나 실패해 번역하지 못한 묶음이 남았는가. 남은 줄은 "빠졌어요"로 채워 어디까지 됐는지 보이게 한다.
  const incomplete = Boolean(outcome && !running && outcome.run.chunks.done < outcome.run.chunks.total);
  const resultView = outcome ? (incomplete ? withMissingLocalizeLines(outcome.run.view, outcome.input.lines) : outcome.run.view) : null;
  const chunked = progress !== null && progress.total > 1;

  const problemText = problem === null || problem.kind === "empty"
    ? null
    : problem.kind === "too-many"
      ? t("claudeAssist.localize.problemTooMany", { count: problem.count, max: LOCALIZE_LIMITS.maxLines })
      : t("claudeAssist.localize.problemTooLong", { line: problem.line, length: problem.length, max: LOCALIZE_LIMITS.maxLineChars });
  const needHint = !route
    ? null
    : problem?.kind === "empty"
      ? t("claudeAssist.localize.needLines")
      : sameLanguage
        ? t("claudeAssist.localize.sameLanguage")
        : !guard.allowed
          ? t("claudeAssist.art.needBudget")
          : null;
  const hintId = `${idBase}-need-hint`;
  const problemId = `${idBase}-problem`;
  const linesId = `${idBase}-lines`;
  const linesHintId = `${idBase}-lines-hint`;
  const describedBy = needHint ? hintId : problemText ? problemId : undefined;

  const footer = (
    <div className="flex flex-wrap items-center gap-3">
      <button ref={runRef} type="button" className={CLAUDE_PRIMARY_BUTTON} disabled={!canRun} aria-describedby={describedBy} onClick={() => void run()}>
        {running ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : hasResult ? <RefreshCw size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
        {hasResult && !running ? t("claudeAssist.localize.rerun") : t("claudeAssist.localize.run")}
      </button>
      {running ? (
        <button ref={stopRef} type="button" className={CLAUDE_BUTTON} onClick={task.stop}>
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
        <ClaudeShortcutHint action={t("claudeAssist.common.shortcutRun")} />
      </span>
    </div>
  );

  return (
    <ClaudeDialogFrame
      activeKey="claude-localize"
      rootAttribute="data-claude-localize-root"
      icon={Languages}
      title={t("claudeAssist.localize.title")}
      description={t("claudeAssist.localize.description")}
      onClose={close}
      onPrimaryShortcut={() => void run()}
      footer={footer}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 space-y-2 lg:sticky lg:top-0 lg:self-start">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={linesId} className="text-xs font-bold text-fg-2">{t("claudeAssist.localize.linesLabel")}</label>
            {text.length === 0 ? (
              <button type="button" className={cn(CLAUDE_QUIET_BUTTON, "min-h-11 px-2 text-xs")} disabled={running} onClick={() => setText(t("claudeAssist.localize.sampleText"))}>
                {t("claudeAssist.localize.sample")}
              </button>
            ) : (
              <button type="button" className={cn(CLAUDE_QUIET_BUTTON, "min-h-11 px-2 text-xs")} disabled={running} onClick={() => setText("")}>
                {t("claudeAssist.localize.clear")}
              </button>
            )}
          </div>
          <textarea
            id={linesId}
            data-claude-initial-focus
            className={cn(CLAUDE_INPUT, "min-h-56 resize-y font-medium leading-relaxed lg:min-h-80")}
            value={text}
            disabled={running}
            spellCheck={false}
            placeholder={t("claudeAssist.localize.linesPlaceholder")}
            aria-describedby={linesHintId}
            aria-invalid={problemText ? true : undefined}
            onChange={(event) => setText(event.target.value)}
          />
          <div id={linesHintId} className="space-y-0.5 text-xs text-fg-3">
            <p>{t("claudeAssist.localize.linesHint")}</p>
            <p data-claude-localize-count="true">{t("claudeAssist.localize.lineCount", { count: parsed.lines.length, max: LOCALIZE_LIMITS.maxLines })}</p>
            {parsed.lines.length > 0 && parsed.skippedEmpty > 0 ? <p>{t("claudeAssist.localize.skippedEmpty", { count: parsed.skippedEmpty })}</p> : null}
            {parsed.lines.length > LOCALIZE_CHUNK_LINES ? (
              <p data-claude-many-lines="true">
                {t("claudeAssist.localize.manyLinesHint", { count: parsed.lines.length, chunks: planLocalizeChunks(parsed.lines.length).length })}
              </p>
            ) : null}
          </div>
          {problemText ? <p id={problemId} role="status" className="text-xs font-semibold text-warn">{problemText}</p> : null}
        </div>

        <div className="min-w-0 space-y-4">
          {!route ? (
            <div className="space-y-2 rounded-xl border border-line bg-raised/50 p-3 text-sm">
              <p>{t("claudeAssist.common.needConnection")}</p>
              <Link to="/settings/ai?source=studio" className={CLAUDE_BUTTON} onClick={close}>{t("claudeAssist.common.openSettings")}</Link>
            </div>
          ) : null}

          <ClaudeLocalizeSetup form={form} onChange={patchForm} disabled={running} connectionModel={connectionModel} caps={caps} glossary={glossary} />

          <ClaudePreflight
            model={resolved.model}
            capUsd={capUsd}
            guard={guard}
            summary={parsed.lines.length > 0
              ? t("claudeAssist.localize.preflightTransfer", { count: parsed.lines.length, chars: totalChars, terms: glossary.entries.length })
              : t("claudeAssist.localize.preflightTransferNone")}
            rows={[
              {
                label: t("claudeAssist.preflight.transfer"),
                value: parsed.lines.length > 0
                  ? t("claudeAssist.localize.preflightTransfer", { count: parsed.lines.length, chars: totalChars, terms: glossary.entries.length })
                  : t("claudeAssist.localize.preflightTransferNone"),
              },
              { label: t("claudeAssist.preflight.time"), value: t("claudeAssist.localize.preflightTime") },
              { label: t("claudeAssist.preflight.output"), value: t("claudeAssist.localize.preflightOutput") },
              { label: t("claudeAssist.preflight.protection"), value: t("claudeAssist.localize.preflightProtection") },
            ]}
          />

          <ClaudeTaskStatus
            running={running}
            elapsedSeconds={task.elapsedSeconds}
            runningText={chunked && progress
              ? t("claudeAssist.localize.runningChunks", { done: progress.done, total: progress.total })
              : t("claudeAssist.localize.running")}
            message={task.state.status === "stopped"
              ? t("claudeAssist.localize.stopped")
              : task.state.status === "idle" && outcome && !incomplete
                ? t("claudeAssist.localize.done")
                : null}
          />
          {task.state.status === "error" ? (
            <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
              {t("claudeAssist.localize.error", { message: task.state.message })}
            </p>
          ) : null}

          {outcome && resultView ? (
            <div ref={resultRef} className="space-y-3">
              {stale ? <p role="status" className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2">{t("claudeAssist.localize.stale")}</p> : null}
              {incomplete ? (
                <div className="space-y-1 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2" data-claude-localize-partial="true">
                  <p role="status">{t("claudeAssist.localize.partialNotice", { done: outcome.run.chunks.done, total: outcome.run.chunks.total })}</p>
                  {outcome.run.chunks.error ? <p role="alert" className="font-semibold text-bad">{t("claudeAssist.localize.error", { message: outcome.run.chunks.error })}</p> : null}
                </div>
              ) : null}
              <ClaudeLocalizeResult
                view={resultView}
                edits={edits}
                onEdit={editLine}
                budget={outcome.input.budget}
                glossary={outcome.input.glossary}
                languages={{ source: outcome.input.sourceLang, target: outcome.input.targetLang }}
                usageText={usageOf(outcome.run)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </ClaudeDialogFrame>
  );
}
