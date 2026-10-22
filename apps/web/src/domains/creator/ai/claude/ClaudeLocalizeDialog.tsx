/**
 * AI 번역 도우미 — 말풍선 대사를 줄마다 번호를 지켜 번역하고, 말풍선 폭·용어집 준수를 점검하는 대화상자.
 *
 * 이 화면이 지키는 것
 * - 사용자 결제 키로 입력한 글을 Anthropic에 직접 보내므로, 실행 전에 처리 경로·전송 내용·**비용 상한**·실패 정책을 보여 준다
 *   (스튜디오 AI 어시스트 허브의 "실행 전 확인"과 같은 어휘). 세션 예산을 넘을 수 있으면 사용자가 확인하기 전에는 보내지 않는다.
 * - 줄 수·줄 길이 한도를 넘으면 조용히 자르지 않고 어디가 문제인지 알려 준다.
 * - 자동 재시도·모델 대체가 없다. 중단은 즉시 요청을 취소하고, 닫으면 진행 중인 요청도 취소한다.
 * - 원문은 저장하거나 바꾸지 않는다. 결과는 메모리에만 두고, 사용자가 복사해야 작품에 닿는다.
 */
import "@/shared/ai/claude/claude-assist-i18n";

import { Languages, LoaderCircle, RefreshCw, Sparkles, Square } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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

import { findLinesProblem, parseGlossary, parseLocalizeLines, LOCALIZE_LIMITS, type LocalizeInput } from "./claude-localize";
import { initialLocalizeForm, type LocalizeForm } from "./claude-localize-form";
import { estimateLocalizeCostCapUsd, runLocalize, type LocalizeRunResult } from "./claude-localize-run";
import { ClaudeDialogFrame, ClaudeShortcutHint } from "./ClaudeDialogFrame";
import { ClaudeLocalizeResult } from "./ClaudeLocalizeResult";
import { ClaudeLocalizeSetup } from "./ClaudeLocalizeSetup";
import { useRevealOnChange } from "./use-reveal-on-change";
import { useClaudeTask } from "./use-claude-task";

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
  // 실행이 끝날 때마다 하나씩 올라가는 표식. 결과가 나오면 좁은 화면에서도 결과가 보이도록 스크롤한다.
  const [finishedRuns, setFinishedRuns] = useState(0);
  const resultRef = useRevealOnChange<HTMLDivElement>(finishedRuns);

  const running = task.running;
  const connectionModel = route?.model ?? "";

  const parsed = useMemo(() => parseLocalizeLines(text), [text]);
  const problem = useMemo(() => findLinesProblem(parsed.lines), [parsed.lines]);
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
  const sendable = problem === null;
  const caps = useMemo(() => {
    const entries = CLAUDE_PRESET_IDS.map((id: ClaudePresetId) => {
      if (!sendable) return [id, undefined] as const;
      const preset = resolveClaudePreset(id, connectionModel, { customModel: form.customModel, customDepth: form.customDepth });
      return [id, estimateLocalizeCostCapUsd(preset.model, input, preset.depth)] as const;
    });
    return Object.fromEntries(entries) as Record<ClaudePresetId, number | null | undefined>;
  }, [connectionModel, form.customDepth, form.customModel, input, sendable]);
  const capUsd = sendable ? caps[form.presetId] ?? null : null;
  const guard = useClaudeBudgetGuard(capUsd);

  const patchForm = useCallback((patch: Partial<LocalizeForm>) => {
    setForm((previous) => ({ ...previous, ...patch }));
  }, []);

  const canRun = Boolean(route && sendable && !running && guard.allowed);

  const run = async () => {
    if (!canRun) return;
    const claudeRoute = resolveClaudeRoute();
    const runInput = input;
    guard.consumeOverride();
    const result = await task.start(async (signal) => {
      if (!claudeRoute) throw new Error(t("claudeAssist.common.needConnection"));
      return runLocalize(claudeRoute, runInput, { model: resolved.model, depth: resolved.depth, signal });
    });
    if (!result) return;
    setOutcome({ run: result, input: runInput });
    setEdits(new Map());
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

  const problemText = problem === null || problem.kind === "empty"
    ? null
    : problem.kind === "too-many"
      ? t("claudeAssist.localize.problemTooMany", { count: problem.count, max: LOCALIZE_LIMITS.maxLines })
      : t("claudeAssist.localize.problemTooLong", { line: problem.line, length: problem.length, max: LOCALIZE_LIMITS.maxLineChars });
  const needHint = !route
    ? null
    : problem?.kind === "empty"
      ? t("claudeAssist.localize.needLines")
      : !guard.allowed
        ? t("claudeAssist.art.needBudget")
        : null;
  const describedBy = needHint ? "claude-localize-need-hint" : problemText ? "claude-localize-problem" : undefined;

  const footer = (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={CLAUDE_PRIMARY_BUTTON} disabled={!canRun} aria-describedby={describedBy} onClick={() => void run()}>
        {running ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : hasResult ? <RefreshCw size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
        {hasResult && !running ? t("claudeAssist.localize.rerun") : t("claudeAssist.localize.run")}
      </button>
      {running ? (
        <button type="button" className={CLAUDE_BUTTON} onClick={task.stop}>
          <Square size={14} aria-hidden />
          {t("claudeAssist.common.stop")}
        </button>
      ) : null}
      {capUsd !== null && sendable ? (
        <span className="text-xs font-semibold text-fg-2" data-claude-footer-cap="true">
          {t("claudeAssist.preflight.capChip", { cost: formatClaudeUsd(capUsd) })}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-3">
        {needHint ? <span id="claude-localize-need-hint" className="text-xs text-fg-3">{needHint}</span> : null}
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
            <label htmlFor="claude-localize-lines" className="text-xs font-bold text-fg-2">{t("claudeAssist.localize.linesLabel")}</label>
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
            id="claude-localize-lines"
            data-claude-initial-focus
            className={cn(CLAUDE_INPUT, "min-h-56 resize-y font-medium leading-relaxed lg:min-h-80")}
            value={text}
            disabled={running}
            spellCheck={false}
            placeholder={t("claudeAssist.localize.linesPlaceholder")}
            aria-describedby="claude-localize-lines-hint"
            aria-invalid={problemText ? true : undefined}
            onChange={(event) => setText(event.target.value)}
          />
          <div id="claude-localize-lines-hint" className="space-y-0.5 text-xs text-fg-3">
            <p>{t("claudeAssist.localize.linesHint")}</p>
            <p data-claude-localize-count="true">{t("claudeAssist.localize.lineCount", { count: parsed.lines.length, max: LOCALIZE_LIMITS.maxLines })}</p>
            {parsed.lines.length > 0 && parsed.skippedEmpty > 0 ? <p>{t("claudeAssist.localize.skippedEmpty", { count: parsed.skippedEmpty })}</p> : null}
          </div>
          {problemText ? <p id="claude-localize-problem" role="status" className="text-xs font-semibold text-warn">{problemText}</p> : null}
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

          <div role="status" aria-live="polite" className={cn("min-h-5 text-sm text-fg-2", running && "font-semibold")}>
            {running ? `${t("claudeAssist.localize.running")} · ${t("claudeAssist.common.elapsed", { seconds: task.elapsedSeconds })}` : null}
            {task.state.status === "stopped" ? t("claudeAssist.localize.stopped") : null}
            {task.state.status === "idle" && outcome ? t("claudeAssist.localize.done") : null}
          </div>
          {task.state.status === "error" ? (
            <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
              {t("claudeAssist.localize.error", { message: task.state.message })}
            </p>
          ) : null}

          {outcome ? (
            <div ref={resultRef} className="space-y-3">
              {stale ? <p role="status" className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2">{t("claudeAssist.localize.stale")}</p> : null}
              <ClaudeLocalizeResult
                view={outcome.run.view}
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
