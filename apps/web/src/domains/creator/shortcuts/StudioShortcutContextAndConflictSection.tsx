import { AlertTriangle, RotateCcw, Settings2, WandSparkles } from "lucide-react";
import { useMemo, type ReactElement } from "react";

import {
  STUDIO_SHORTCUT_ACTIONS,
  formatStudioShortcutChord,
  type StudioAppSettings,
  type StudioShortcutActionId,
} from "../studio-app-settings";
import { studioSearchTextMatches, tokenizeStudioSearchQuery } from "../studio-search-text";
import {
  STUDIO_SHORTCUT_CONTEXT_RULES,
  autoResolveStudioShortcutConflicts,
  resolveStudioShortcutConflictDetails,
  resolveStudioShortcutRowConflictStatus,
} from "./studio-shortcut-conflict-guide";
import { StudioShortcutProfileManagerSection } from "./StudioShortcutProfileManagerSection";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export function StudioShortcutConflictBanner({
  shortcuts,
  isKo = true,
  onAutoResolve,
  onOpenShortcutSettings,
}: {
  shortcuts: Partial<Record<StudioShortcutActionId, string>> | Record<string, string> | undefined;
  isKo?: boolean;
  onAutoResolve?: () => void;
  onOpenShortcutSettings?: () => void;
}): ReactElement | null {
  const conflicts = useMemo(
    () => resolveStudioShortcutConflictDetails(shortcuts),
    [shortcuts],
  );
  if (conflicts.length === 0) return null;

  return (
    <section
      role="status"
      aria-live="polite"
      data-studio-shortcut-conflict-banner="true"
      className="mb-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs text-fg"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <div className="min-w-0">
            <p className="font-bold text-fg">
              {isKo
                ? `단축키 충돌 ${conflicts.length}건 · 실제 실행 동작과 대체 경로 안내`
                : `${conflicts.length} shortcut conflict${conflicts.length === 1 ? "" : "s"} · active winner & alternative path`}
            </p>
            <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-2">
              {isKo
                ? "같은 키에 여러 기능이 배정되면 우선순위가 앞선 기능만 실행됩니다. 가려진 기능은 아래 보이는 메뉴·도구막대·⌘K 명령 검색으로 바로 실행하거나 중복을 해제하세요."
                : "When two actions share one chord, only the higher-priority action runs. Trigger shadowed actions from the visible toolbar/menu/⌘K search below or clear the duplicate."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {onAutoResolve ? (
            <button
              type="button"
              data-testid="studio-shortcut-conflict-autoresolve"
              onClick={onAutoResolve}
              className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-xl border border-warn/40 bg-card px-3 py-2 text-xs font-semibold text-fg hover:bg-raised"
            >
              <WandSparkles className="size-3.5 text-warn" aria-hidden />
              {isKo ? "중복 자동 정리" : "Auto-resolve duplicates"}
            </button>
          ) : null}
          {onOpenShortcutSettings ? (
            <button
              type="button"
              data-testid="studio-shortcut-conflict-open-settings"
              onClick={onOpenShortcutSettings}
              className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg"
            >
              <Settings2 className="size-3.5" aria-hidden />
              {isKo ? "단축키 설정에서 변경" : "Edit in Shortcut Settings"}
            </button>
          ) : null}
        </div>
      </div>

      <ul className="mt-2.5 space-y-1.5">
        {conflicts.map((group) => (
          <li
            key={group.chordKey}
            data-studio-shortcut-conflict-chord={group.chordKey}
            className="rounded-lg border border-warn/25 bg-panel/90 px-2.5 py-2"
          >
            <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem]">
              <kbd className="rounded border border-warn/45 bg-canvas px-1.5 py-0.5 font-mono text-[0.66rem] font-bold text-fg">
                {group.formattedChord}
              </kbd>
              <span className="rounded bg-good/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-good">
                {isKo ? "우선 실행" : "Runs"}
              </span>
              <span className="font-semibold text-fg">{group.winner.label}</span>
            </div>
            {group.shadowed.map((shadowed) => (
              <div
                key={shadowed.actionId}
                className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[0.66rem] leading-relaxed text-fg-2"
              >
                <span className="rounded bg-warn/20 px-1.5 py-0.5 text-[0.6rem] font-semibold text-fg">
                  {isKo ? "충돌로 가려짐" : "Shadowed"}
                </span>
                <span className="font-semibold text-fg">{shadowed.label}</span>
                <span className="text-fg-3">
                  → {isKo ? "보이는 대체 경로:" : "Visible path:"}{" "}
                  <strong className="font-medium text-fg-2">
                    {isKo ? shadowed.visibleAlternativeKo : shadowed.visibleAlternativeEn}
                  </strong>
                </span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StudioShortcutContextComparisonSection({
  isKo = true,
  searchQuery = "",
  compact = false,
}: {
  isKo?: boolean;
  searchQuery?: string;
  compact?: boolean;
}): ReactElement | null {
  const searching = tokenizeStudioSearchQuery(searchQuery).length > 0;
  const visibleRules = useMemo(
    () =>
      STUDIO_SHORTCUT_CONTEXT_RULES.filter((rule) =>
        !searching
          ? true
          : studioSearchTextMatches(searchQuery, [
              rule.keysLabelKo,
              rule.canvasBehaviorKo,
              rule.canvasBehaviorEn,
              rule.textEditBehaviorKo,
              rule.textEditBehaviorEn,
              rule.visibleAlternativeKo,
              rule.visibleAlternativeEn,
              ...rule.searchAliases,
            ]),
      ),
    [searchQuery, searching],
  );

  if (visibleRules.length === 0) return null;

  return (
    <section
      aria-labelledby="studio-shortcut-context-guide-title"
      data-studio-shortcut-context-guide="true"
      className={cn(
        "rounded-xl border border-line/80 bg-card/65 p-3",
        compact ? "mb-2" : "mt-3",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="studio-shortcut-context-guide-title" className="text-xs font-bold text-fg">
          {isKo
            ? "캔버스 조작 vs 텍스트·말풍선 편집 중 같은 키의 실제 동작"
            : "Same key behavior: Canvas mode vs Text / Balloon editing"}
        </h3>
        <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.62rem] font-semibold text-fg-2">
          {isKo ? "충돌 방지 · 대체 경로" : "Context & fallback"}
        </span>
      </div>
      <p className="mt-1 text-[0.66rem] leading-relaxed text-fg-3">
        {isKo
          ? "대사·텍스트를 편집하는 동안에는 단일 문자 도구 키가 글자로 입력되어 오작동을 막습니다. 도구 단축키로 돌아가려면 ⌘Enter(완료)·Esc(취소) 또는 상단 편집 바 버튼을 누르세요."
          : "While editing dialogue or text, single-key tool shortcuts type characters instead of switching tools. Press ⌘Enter (Finish), Esc (Cancel), or the visible top edit bar buttons to return to canvas tools."}
      </p>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {visibleRules.map((rule) => (
          <article
            key={rule.id}
            data-studio-shortcut-context-rule={rule.id}
            className="rounded-lg border border-line/70 bg-panel/90 px-2.5 py-2 text-[0.66rem]"
          >
            <div className="flex items-center justify-between gap-2">
              <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[0.62rem] font-semibold text-accent">
                {isKo ? rule.keysLabelKo : rule.keysLabelEn}
              </kbd>
            </div>
            <dl className="mt-1.5 space-y-1 leading-snug">
              <div className="flex gap-1.5">
                <dt className="shrink-0 font-semibold text-fg-2">
                  {isKo ? "캔버스:" : "Canvas:"}
                </dt>
                <dd className="text-fg">{isKo ? rule.canvasBehaviorKo : rule.canvasBehaviorEn}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 font-semibold text-accent">
                  {isKo ? "텍스트 편집:" : "Text edit:"}
                </dt>
                <dd className="text-fg">{isKo ? rule.textEditBehaviorKo : rule.textEditBehaviorEn}</dd>
              </div>
              <div className="flex gap-1.5 text-fg-3">
                <dt className="shrink-0 font-semibold">
                  {isKo ? "보이는 경로:" : "Visible UI:"}
                </dt>
                <dd>{isKo ? rule.visibleAlternativeKo : rule.visibleAlternativeEn}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

export function StudioShortcutSettingsTabContent({
  settings,
  isKo,
  recordingAction,
  setRecordingAction,
  onPatchShortcuts,
}: {
  settings: StudioAppSettings;
  isKo: boolean;
  recordingAction: StudioShortcutActionId | null;
  setRecordingAction: (next: StudioShortcutActionId | null) => void;
  onPatchShortcuts: (nextShortcuts: StudioAppSettings["shortcuts"]) => void;
}): ReactElement {
  const t = useT();
  const conflicts = useMemo(
    () => resolveStudioShortcutConflictDetails(settings.shortcuts),
    [settings.shortcuts],
  );

  return (
    <>
      <h3 className="text-[0.7rem] font-bold uppercase tracking-wider text-fg-3">
        {t("studio.settings.section.shortcuts")}
      </h3>
      <p className="text-[0.68rem] leading-relaxed text-fg-3">
        {t("studio.settings.shortcuts.recordingHint")}
      </p>

      <StudioShortcutConflictBanner
        shortcuts={settings.shortcuts}
        isKo={isKo}
        onAutoResolve={
          conflicts.length > 0
            ? () => onPatchShortcuts(autoResolveStudioShortcutConflicts(settings.shortcuts))
            : undefined
        }
      />

      <StudioShortcutContextComparisonSection isKo={isKo} compact />

      <StudioShortcutProfileManagerSection
        shortcuts={settings.shortcuts}
        onApplyShortcuts={onPatchShortcuts}
      />

      <ul className="divide-y divide-line/60 rounded-xl border border-line">
        {STUDIO_SHORTCUT_ACTIONS.map((action) => {
          const chord = settings.shortcuts[action.id] ?? "";
          const recording = recordingAction === action.id;
          const rowConflict = resolveStudioShortcutRowConflictStatus(settings.shortcuts, action.id);
          const hasConflict = rowConflict !== null;
          const peerLabels = rowConflict ? rowConflict.peerLabels.join(", ") : "";
          return (
            <li key={action.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 text-xs text-fg">
                <span className="block font-medium">{action.label}</span>
                {rowConflict ? (
                  <span
                    className="mt-0.5 block text-[0.62rem] leading-relaxed text-warn"
                    title={
                      peerLabels
                        ? t("studio.settings.shortcuts.conflictPeers").replace("{peers}", peerLabels)
                        : t("studio.settings.shortcuts.noConflictHint")
                    }
                  >
                    <strong className="font-semibold">
                      {rowConflict.role === "winner"
                        ? isKo
                          ? "중복 · 우선 실행됨"
                          : "Conflict · Runs first"
                        : isKo
                          ? `중복 · ${rowConflict.winnerLabel}에 가려짐`
                          : `Conflict · Shadowed by ${rowConflict.winnerLabel}`}
                    </strong>
                    {peerLabels ? ` (${peerLabels})` : ""}
                    {" · "}
                    {isKo
                      ? `대체 경로: ${rowConflict.visibleAlternativeKo}`
                      : `Fallback: ${rowConflict.visibleAlternativeEn}`}
                  </span>
                ) : null}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {rowConflict ? (
                  <>
                    {rowConflict.canRestoreDefaultWithoutConflict &&
                    chord !== rowConflict.defaultKeys ? (
                      <button
                        type="button"
                        className={cn(
                          buttonClass({ size: "sm", variant: "quiet" }),
                          "min-h-11 text-[0.65rem] sm:min-h-8 pointer-coarse:min-h-11",
                        )}
                        onClick={() =>
                          onPatchShortcuts({
                            ...settings.shortcuts,
                            [action.id]: rowConflict.defaultKeys,
                          })
                        }
                      >
                        {isKo
                          ? `기본키(${rowConflict.formattedDefaultChord})`
                          : `Default (${rowConflict.formattedDefaultChord})`}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={cn(
                        buttonClass({ size: "sm", variant: "quiet" }),
                        "min-h-11 text-[0.65rem] text-warn sm:min-h-8 pointer-coarse:min-h-11",
                      )}
                      onClick={() =>
                        onPatchShortcuts({
                          ...settings.shortcuts,
                          [action.id]: "",
                        })
                      }
                    >
                      {isKo ? "키 비우기" : "Unbind"}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className={cn(
                    buttonClass({ size: "sm", variant: recording ? "outline" : "quiet" }),
                    "min-h-11 min-w-[5.5rem] font-mono text-[0.7rem] sm:min-h-8 pointer-coarse:min-h-11",
                    recording && "ring-2 ring-accent/40",
                    hasConflict && !recording && "ring-1 ring-warn/50",
                  )}
                  onClick={() => setRecordingAction(recording ? null : action.id)}
                >
                  {recording
                    ? t("studio.settings.shortcuts.recordingState")
                    : formatStudioShortcutChord(chord)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className={cn(
          buttonClass({ size: "sm", variant: "quiet" }),
          "min-h-11 sm:min-h-8 pointer-coarse:min-h-11",
        )}
        onClick={() =>
          onPatchShortcuts(
            Object.fromEntries(
              STUDIO_SHORTCUT_ACTIONS.map((a) => [a.id, a.defaultKeys]),
            ) as StudioAppSettings["shortcuts"],
          )
        }
      >
        <RotateCcw className="size-3.5" aria-hidden />
        {t("studio.settings.shortcuts.reset")}
      </button>
    </>
  );
}
