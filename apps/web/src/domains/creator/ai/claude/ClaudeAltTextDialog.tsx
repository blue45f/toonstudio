/**
 * AI 대체 텍스트 도우미 — 컷·페이지 이미지를 올리면 이미지를 볼 수 없는 독자를 위한 한 줄 대체 텍스트·상세 설명·컷별 설명을
 * 만들어 주는 대화상자.
 *
 * 이 화면이 지키는 것
 * - 사용자 결제 키로 이미지를 Anthropic에 직접 보내므로, 실행 전에 처리 경로·전송 내용·**비용 상한**·실패 정책을 보여 준다
 *   (스튜디오 AI 어시스트 허브의 "실행 전 확인"과 같은 어휘). 세션 예산을 넘을 수 있으면 사용자가 확인하기 전에는 보내지 않는다.
 * - 보내는 이미지는 이 브라우저에서 줄여 만든 바이트 그대로 미리보기에 쓴다. 결과의 한 줄 대체 텍스트는 곧바로 미리보기 이미지의
 *   `alt`가 되어, 화면 읽기 도구 사용자가 듣게 될 말을 만드는 사람이 같은 화면에서 확인한다.
 * - 자동 재시도·모델 대체가 없다. 중단은 즉시 요청을 취소하고, 닫으면 진행 중인 요청도 취소한다.
 * - 결과는 메모리에만 두고 저장하지 않는다. 사용자가 복사해 붙여 넣어야 작품에 닿는다.
 */
import "@/shared/ai/claude/claude-assist-i18n";

import { Accessibility, LoaderCircle, RefreshCw, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState, type ClipboardEvent } from "react";
import { Link } from "react-router-dom";

import { CLAUDE_PRESET_IDS, resolveClaudePreset, type ClaudePresetId } from "@/shared/ai/claude/claude-effort-presets";
import { resolveClaudeRoute } from "@/shared/ai/claude/claude-route";
import { CLAUDE_BUTTON, CLAUDE_PRIMARY_BUTTON } from "@/shared/ai/claude/claude-ui";
import { formatClaudeUsd } from "@/shared/ai/claude/claude-usage-meter";
import { ClaudePreflight } from "@/shared/ai/claude/ClaudePreflight";
import { useClaudeBudgetGuard } from "@/shared/ai/claude/use-claude-budget-guard";
import { useClaudeRoute } from "@/shared/ai/claude/use-claude-route";
import { useI18n, useT } from "@/shared/lib/i18n";

import { estimateAltTextCostCapUsd, type AltTextContext } from "./claude-alt-text";
import { initialAltTextForm, type AltTextForm } from "./claude-alt-text-form";
import { runAltText, type AltTextRunResult } from "./claude-alt-text-run";
import { firstImageFile, pickDroppedFile } from "./claude-image-files";
import { ClaudeAltTextResult } from "./ClaudeAltTextResult";
import { ClaudeAltTextSetup } from "./ClaudeAltTextSetup";
import { ClaudeDialogFrame, ClaudeShortcutHint } from "./ClaudeDialogFrame";
import { ClaudeImageInputPane } from "./ClaudeImageInputPane";
import { ClaudeTaskStatus } from "./ClaudeTaskStatus";
import { useArtDirectorImage } from "./use-art-director-image";
import { useClaudeTask } from "./use-claude-task";
import { useRevealOnChange } from "./use-reveal-on-change";
import { useRunFocus } from "./use-run-focus";

/** 구간마다 따로 만든 결과와, 사용자가 그 위에 고쳐 쓴 글. */
interface AltTextDraft {
  readonly run: AltTextRunResult;
  readonly short: string;
  readonly long: string;
}

const OUTPUT_KEY = {
  brief: "claudeAssist.altText.preflightOutputBrief",
  standard: "claudeAssist.altText.preflightOutputStandard",
  detailed: "claudeAssist.altText.preflightOutputDetailed",
} as const;

export interface ClaudeAltTextDialogProps {
  readonly onClose: () => void;
}

export function ClaudeAltTextDialog({ onClose }: ClaudeAltTextDialogProps) {
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const route = useClaudeRoute();
  const task = useClaudeTask();

  const [form, setForm] = useState<AltTextForm>(() => initialAltTextForm(lang));
  const [drafts, setDrafts] = useState<ReadonlyMap<number, AltTextDraft>>(new Map());
  // 실행이 끝날 때마다 하나씩 올라가는 표식. 결과가 나오면 좁은 화면에서도 결과가 보이도록 스크롤한다.
  const [finishedRuns, setFinishedRuns] = useState(0);
  const resultRef = useRevealOnChange<HTMLDivElement>(finishedRuns);
  const hintId = `${useId()}-need-hint`;

  const { reset: resetTask } = task;
  const resetOutcome = useCallback(() => {
    resetTask();
    setDrafts(new Map());
  }, [resetTask]);

  const image = useArtDirectorImage({ onSourceChange: resetOutcome });
  const { rendered, source, segmentIndex } = image;
  const running = task.running;
  const { runRef, stopRef } = useRunFocus(running);
  const connectionModel = route?.model ?? "";

  const resolved = useMemo(
    () => resolveClaudePreset(form.presetId, connectionModel, { customModel: form.customModel, customDepth: form.customDepth }),
    [connectionModel, form.customDepth, form.customModel, form.presetId],
  );
  // 비용 상한은 실제 요청과 같은 글(언어·장르·메모)로 잰다.
  const costContext = useMemo(
    () => ({ language: form.language, genre: form.genre, notes: form.notes }),
    [form.genre, form.language, form.notes],
  );
  const caps = useMemo(() => {
    const entries = CLAUDE_PRESET_IDS.map((id: ClaudePresetId) => {
      if (!rendered) return [id, undefined] as const;
      const preset = resolveClaudePreset(id, connectionModel, { customModel: form.customModel, customDepth: form.customDepth });
      return [id, estimateAltTextCostCapUsd(preset.model, rendered.input, form.scope, costContext)] as const;
    });
    return Object.fromEntries(entries) as Record<ClaudePresetId, number | null | undefined>;
  }, [connectionModel, costContext, form.customDepth, form.customModel, form.scope, rendered]);
  // 이미지가 아직 없으면 계산할 수 없다(undefined). "단가를 모른다"(null)와 구분해야 입력 전에 가짜 경고가 뜨지 않는다.
  const capUsd = rendered ? caps[form.presetId] ?? null : undefined;
  const guard = useClaudeBudgetGuard(capUsd);

  const patchForm = useCallback((patch: Partial<AltTextForm>) => {
    setForm((previous) => ({ ...previous, ...patch }));
  }, []);

  const { load } = image;
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = firstImageFile(event.clipboardData?.files);
    if (!file || running) return;
    event.preventDefault();
    void load(file);
  };

  const canRun = Boolean(route && rendered && !image.preparing && !running && guard.allowed);

  // 이미지를 올리면 올리기 구역이 사라지며 포커스가 body로 떨어진다. 바로 실행할 수 있게 실행 버튼으로 옮긴다.
  const hasImage = Boolean(rendered);
  useEffect(() => {
    if (hasImage && document.activeElement === document.body) runRef.current?.focus({ preventScroll: true });
  }, [hasImage, runRef]);

  const run = async () => {
    if (!canRun || !rendered) return;
    const claudeRoute = resolveClaudeRoute();
    const index = rendered.segment.index;
    const input = rendered.input;
    const context: AltTextContext = { scope: form.scope, language: form.language, depth: resolved.depth, genre: form.genre, notes: form.notes };
    // 동의는 이 요청에 한 번만 쓴다. 보내기 전에 값을 읽어 전송 계층의 예산 판정에 넘기고 동의를 거둔다.
    const budgetOverride = guard.overridden;
    guard.consumeOverride();
    const outcome = await task.start(async (signal) => {
      if (!claudeRoute) throw new Error(t("claudeAssist.common.needConnection"));
      return runAltText(claudeRoute, input, context, { model: resolved.model, signal, budgetOverride });
    });
    if (!outcome) return;
    setDrafts((previous) => new Map(previous).set(index, { run: outcome, short: outcome.view.short, long: outcome.view.long }));
    setFinishedRuns((count) => count + 1);
  };

  const close = useCallback(() => {
    resetTask();
    onClose();
  }, [onClose, resetTask]);

  const draft = drafts.get(segmentIndex) ?? null;
  const editDraft = (patch: Partial<Pick<AltTextDraft, "short" | "long">>) => {
    setDrafts((previous) => {
      const current = previous.get(segmentIndex);
      return current ? new Map(previous).set(segmentIndex, { ...current, ...patch }) : previous;
    });
  };

  const sizeKb = rendered ? Math.max(1, Math.round(rendered.bytes / 1024)) : 0;
  const needHint = !route
    ? null
    : !rendered
      ? t("claudeAssist.altText.needImage")
      : !guard.allowed
        ? t("claudeAssist.art.needBudget")
        : null;

  const footer = (
    <div className="flex flex-wrap items-center gap-3">
      <button ref={runRef} type="button" className={CLAUDE_PRIMARY_BUTTON} disabled={!canRun} aria-describedby={needHint ? hintId : undefined} onClick={() => void run()}>
        {running ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : draft ? <RefreshCw size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
        {draft && !running ? t("claudeAssist.altText.rerun") : t("claudeAssist.altText.run")}
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
      activeKey="claude-alt-text"
      rootAttribute="data-claude-alt-text-root"
      icon={Accessibility}
      title={t("claudeAssist.altText.title")}
      description={t("claudeAssist.altText.description")}
      onClose={close}
      onPaste={onPaste}
      onDropFiles={(files) => { const file = pickDroppedFile(files); if (file && !running) void load(file); }}
      onPrimaryShortcut={() => void run()}
      footer={footer}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
          <ClaudeImageInputPane
            image={image}
            running={running}
            renderPreview={(current) => (
              <div className="flex justify-center rounded-xl border border-line bg-raised p-2">
                <img
                  src={current.previewUrl}
                  alt={draft?.short.trim() || t("claudeAssist.art.previewAlt")}
                  draggable={false}
                  className="block h-auto max-h-[70dvh] w-auto max-w-full rounded-md bg-white"
                />
              </div>
            )}
            belowPreview={draft ? <p className="text-xs text-fg-3">{t("claudeAssist.altText.previewNote")}</p> : null}
          />
        </div>

        <div className="min-w-0 space-y-4">
          {!route ? (
            <div className="space-y-2 rounded-xl border border-line bg-raised/50 p-3 text-sm">
              <p>{t("claudeAssist.common.needConnection")}</p>
              <Link to="/settings/ai?source=studio" className={CLAUDE_BUTTON} onClick={close}>{t("claudeAssist.common.openSettings")}</Link>
            </div>
          ) : null}

          <ClaudeAltTextSetup form={form} onChange={patchForm} disabled={running} connectionModel={connectionModel} caps={caps} />

          <ClaudePreflight
            model={resolved.model}
            capUsd={capUsd}
            guard={guard}
            summary={rendered
              ? t("claudeAssist.altText.preflightTransfer", { width: rendered.input.width, height: rendered.input.height, size: sizeKb })
              : t("claudeAssist.altText.preflightTransferNone")}
            rows={[
              {
                label: t("claudeAssist.preflight.transfer"),
                value: rendered
                  ? t("claudeAssist.altText.preflightTransfer", { width: rendered.input.width, height: rendered.input.height, size: sizeKb })
                  : t("claudeAssist.altText.preflightTransferNone"),
              },
              { label: t("claudeAssist.preflight.time"), value: t("claudeAssist.altText.preflightTime") },
              { label: t("claudeAssist.preflight.output"), value: t(OUTPUT_KEY[form.scope]) },
              { label: t("claudeAssist.preflight.protection"), value: t("claudeAssist.altText.preflightProtection") },
            ]}
          />

          <ClaudeTaskStatus
            running={running}
            elapsedSeconds={task.elapsedSeconds}
            runningText={t("claudeAssist.altText.running")}
            message={image.preparing
              ? t("claudeAssist.art.preparing")
              : task.state.status === "stopped"
                ? t("claudeAssist.altText.stopped")
                : task.state.status === "idle" && draft
                  ? t("claudeAssist.altText.done")
                  : null}
          />
          {task.state.status === "error" ? (
            <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
              {t("claudeAssist.altText.error", { message: task.state.message })}
            </p>
          ) : null}

          {draft ? (
            <div ref={resultRef}>
              <ClaudeAltTextResult
                run={draft.run}
                short={draft.short}
                long={draft.long}
                onShort={(short) => editDraft({ short })}
                onLong={(long) => editDraft({ long })}
              />
            </div>
          ) : rendered && task.state.status === "idle" ? (
            <p className="text-sm text-fg-3">
              {t(source && source.segments.length > 1 ? "claudeAssist.altText.notGeneratedSegment" : "claudeAssist.altText.notGenerated")}
            </p>
          ) : null}
        </div>
      </div>
    </ClaudeDialogFrame>
  );
}
