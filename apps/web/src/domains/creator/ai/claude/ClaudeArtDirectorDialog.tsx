/**
 * AI 아트 디렉터 — 컷·페이지 이미지를 올려 Claude에게 위치가 붙은 피드백을 받는 대화상자.
 *
 * 이 화면이 지키는 것
 * - 사용자 결제 키로 이미지를 Anthropic에 직접 보내므로, 실행 전에 처리 경로·전송 내용·**비용 상한**·실패 정책을 보여 준다
 *   (스튜디오 AI 어시스트 허브의 "실행 전 확인"과 같은 어휘). 세션 예산을 넘을 수 있으면 사용자가 확인하기 전에는 보내지 않는다.
 * - 보내는 이미지는 이 브라우저에서 줄여 만든 바이트 그대로 미리보기에 쓴다(좌표가 어긋나지 않는다).
 * - 자동 재시도·모델 대체가 없다. 중단은 즉시 요청을 취소하고, 닫으면 진행 중인 요청도 취소한다.
 * - 결과는 메모리에만 두고 저장하지 않는다.
 */
import "@/shared/ai/claude/claude-assist-i18n";

import { LoaderCircle, RefreshCw, Sparkles, Square } from "lucide-react";
import { useCallback, useMemo, useState, type ClipboardEvent } from "react";
import { Link } from "react-router-dom";

import { CLAUDE_BUTTON, CLAUDE_PRIMARY_BUTTON } from "@/shared/ai/claude/claude-ui";
import { formatClaudeUsd } from "@/shared/ai/claude/claude-usage-meter";
import { CLAUDE_PRESET_IDS, resolveClaudePreset, type ClaudePresetId } from "@/shared/ai/claude/claude-effort-presets";
import { resolveClaudeRoute } from "@/shared/ai/claude/claude-route";
import { ClaudePreflight } from "@/shared/ai/claude/ClaudePreflight";
import { useClaudeBudgetGuard } from "@/shared/ai/claude/use-claude-budget-guard";
import { useClaudeRoute } from "@/shared/ai/claude/use-claude-route";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { estimateArtDirectorCostCapUsd } from "./claude-art-director";
import { runArtDirectorReview, type ArtDirectorRunResult } from "./claude-art-director-run";
import { DEFAULT_ART_DIRECTOR_FORM, type ArtDirectorForm, type ArtDirectorPresetCaps } from "./claude-art-director-form";
import { firstImageFile } from "./claude-image-files";
import { ClaudeArtDirectorPreview, type ArtDirectorHighlight } from "./ClaudeArtDirectorPreview";
import { ClaudeArtDirectorResult } from "./ClaudeArtDirectorResult";
import { ClaudeArtDirectorSetup } from "./ClaudeArtDirectorSetup";
import { ClaudeDialogFrame, ClaudeShortcutHint } from "./ClaudeDialogFrame";
import { ClaudeImageInputPane } from "./ClaudeImageInputPane";
import { useArtDirectorImage } from "./use-art-director-image";
import { useClaudeTask } from "./use-claude-task";
import { useRevealOnChange } from "./use-reveal-on-change";

export interface ClaudeArtDirectorDialogProps {
  readonly onClose: () => void;
}

export function ClaudeArtDirectorDialog({ onClose }: ClaudeArtDirectorDialogProps) {
  const t = useT();
  const route = useClaudeRoute();
  const task = useClaudeTask();

  const [form, setForm] = useState<ArtDirectorForm>(DEFAULT_ART_DIRECTOR_FORM);
  const [results, setResults] = useState<ReadonlyMap<number, ArtDirectorRunResult>>(new Map());
  const [highlight, setHighlight] = useState<ArtDirectorHighlight | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  // 실행이 끝날 때마다 하나씩 올라가는 표식. 결과가 나오면 좁은 화면에서도 결과가 보이도록 스크롤한다.
  const [finishedRuns, setFinishedRuns] = useState(0);
  const resultRef = useRevealOnChange<HTMLDivElement>(finishedRuns);

  const { reset: resetTask } = task;
  const resetOutcome = useCallback(() => {
    resetTask();
    setResults(new Map());
    setHighlight(null);
  }, [resetTask]);

  const image = useArtDirectorImage({ onSourceChange: resetOutcome });
  const { rendered, segmentIndex } = image;
  const running = task.running;
  const connectionModel = route?.model ?? "";

  const resolved = useMemo(
    () => resolveClaudePreset(form.presetId, connectionModel, { customModel: form.customModel, customDepth: form.customDepth }),
    [connectionModel, form.customDepth, form.customModel, form.presetId],
  );
  const caps = useMemo<ArtDirectorPresetCaps>(() => {
    const entries = CLAUDE_PRESET_IDS.map((id: ClaudePresetId) => {
      if (!rendered) return [id, undefined] as const;
      const preset = resolveClaudePreset(id, connectionModel, { customModel: form.customModel, customDepth: form.customDepth });
      return [id, estimateArtDirectorCostCapUsd(preset.model, rendered.input)] as const;
    });
    return Object.fromEntries(entries) as ArtDirectorPresetCaps;
  }, [connectionModel, form.customDepth, form.customModel, rendered]);
  const capUsd = rendered ? caps[form.presetId] ?? null : null;
  const guard = useClaudeBudgetGuard(capUsd);

  const patchForm = useCallback((patch: Partial<ArtDirectorForm>) => {
    setForm((previous) => ({ ...previous, ...patch }));
  }, []);

  const { load } = image;
  const loadFile = useCallback((file: File | null) => {
    if (file) void load(file);
  }, [load]);

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = firstImageFile(event.clipboardData?.files);
    if (!file || running) return;
    event.preventDefault();
    loadFile(file);
  };

  const canRun = Boolean(route && rendered && !image.preparing && !running && guard.allowed);

  const run = async () => {
    if (!canRun || !rendered) return;
    const claudeRoute = resolveClaudeRoute();
    const index = rendered.segment.index;
    const input = rendered.input;
    guard.consumeOverride();
    setHighlight(null);
    const outcome = await task.start(async (signal) => {
      if (!claudeRoute) throw new Error(t("claudeAssist.common.needConnection"));
      return runArtDirectorReview(
        claudeRoute,
        input,
        { medium: form.medium, depth: resolved.depth, genre: form.genre, mood: form.mood, notes: form.notes },
        { model: resolved.model, signal },
      );
    });
    if (!outcome) return;
    setResults((previous) => new Map(previous).set(index, outcome));
    setFinishedRuns((count) => count + 1);
  };

  const close = useCallback(() => {
    resetTask();
    onClose();
  }, [onClose, resetTask]);

  const result = results.get(segmentIndex) ?? null;
  const sizeKb = rendered ? Math.max(1, Math.round(rendered.bytes / 1024)) : 0;
  const needHint = !route
    ? null
    : !rendered
      ? t("claudeAssist.art.needImage")
      : !guard.allowed
        ? t("claudeAssist.art.needBudget")
        : null;

  const footer = (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={CLAUDE_PRIMARY_BUTTON}
        disabled={!canRun}
        aria-describedby={needHint ? "claude-art-need-hint" : undefined}
        onClick={() => void run()}
      >
        {running ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : result ? <RefreshCw size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
        {result && !running ? t("claudeAssist.art.rerun") : t("claudeAssist.art.run")}
      </button>
      {running ? (
        <button type="button" className={CLAUDE_BUTTON} onClick={task.stop}>
          <Square size={14} aria-hidden />
          {t("claudeAssist.common.stop")}
        </button>
      ) : null}
      {capUsd !== null && rendered ? (
        <span className="text-xs font-semibold text-fg-2" data-claude-footer-cap="true">
          {t("claudeAssist.preflight.capChip", { cost: formatClaudeUsd(capUsd) })}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-3">
        {needHint ? <span id="claude-art-need-hint" className="text-xs text-fg-3">{needHint}</span> : null}
        <ClaudeShortcutHint action={t("claudeAssist.common.shortcutRun")} />
      </span>
    </div>
  );

  return (
    <ClaudeDialogFrame
      activeKey="claude-art-director"
      rootAttribute="data-claude-art-director-root"
      icon={Sparkles}
      title={t("claudeAssist.art.title")}
      description={t("claudeAssist.art.description")}
      onClose={close}
      onPaste={onPaste}
      onPrimaryShortcut={() => void run()}
      footer={footer}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
          <ClaudeImageInputPane
            image={image}
            running={running}
            renderPreview={(current) => (
              <ClaudeArtDirectorPreview url={current.previewUrl} review={result?.review ?? null} showOverlay={showOverlay} highlight={highlight} />
            )}
            belowPreview={result ? (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={showOverlay} onChange={(event) => setShowOverlay(event.target.checked)} />
                {t("claudeAssist.art.overlayToggle")}
              </label>
            ) : null}
          />
        </div>

        <div className="min-w-0 space-y-4">
          {!route ? (
            <div className="space-y-2 rounded-xl border border-line bg-raised/50 p-3 text-sm">
              <p>{t("claudeAssist.common.needConnection")}</p>
              <Link to="/settings/ai?source=studio" className={CLAUDE_BUTTON} onClick={close}>{t("claudeAssist.common.openSettings")}</Link>
            </div>
          ) : null}

          <ClaudeArtDirectorSetup form={form} onChange={patchForm} disabled={running} connectionModel={connectionModel} caps={caps} />

          <ClaudePreflight
            model={resolved.model}
            capUsd={capUsd}
            guard={guard}
            rows={[
              {
                label: t("claudeAssist.preflight.transfer"),
                value: rendered
                  ? t("claudeAssist.art.preflightTransfer", { width: rendered.input.width, height: rendered.input.height, size: sizeKb })
                  : t("claudeAssist.art.preflightTransferNone"),
              },
              { label: t("claudeAssist.preflight.time"), value: t("claudeAssist.art.preflightTime") },
              { label: t("claudeAssist.preflight.output"), value: t("claudeAssist.art.preflightOutput") },
              { label: t("claudeAssist.preflight.protection"), value: t("claudeAssist.art.preflightProtection") },
            ]}
          />

          <div role="status" aria-live="polite" className={cn("min-h-5 text-sm text-fg-2", running && "font-semibold")}>
            {image.preparing ? t("claudeAssist.art.preparing") : null}
            {running ? `${t("claudeAssist.art.running")} · ${t("claudeAssist.common.elapsed", { seconds: task.elapsedSeconds })}` : null}
            {task.state.status === "stopped" ? t("claudeAssist.art.stopped") : null}
            {task.state.status === "idle" && result ? t("claudeAssist.art.done") : null}
          </div>
          {task.state.status === "error" ? (
            <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
              {t("claudeAssist.art.error", { message: task.state.message })}
            </p>
          ) : null}

          {result ? (
            <div ref={resultRef}>
              <ClaudeArtDirectorResult result={result} highlight={highlight} onHighlight={setHighlight} />
            </div>
          ) : rendered && task.state.status === "idle" ? (
            <p className="text-sm text-fg-3">{t("claudeAssist.art.notReviewed")}</p>
          ) : null}
        </div>
      </div>
    </ClaudeDialogFrame>
  );
}
