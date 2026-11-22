import {
  AlertTriangle,
  Check,
  Compass,
  Copy,
  Download,
  FileJson,
  Upload,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  defaultStudioShortcuts,
  formatStudioShortcutChord,
  type StudioShortcutActionId,
} from "../studio-app-settings";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  RADIAL_DIAL_CONTEXT_IDS,
  RADIAL_DIAL_CONTEXT_META,
  type RadialDialContextId,
} from "./studio-radial-quick-dial-engine";
import {
  BUILTIN_SHORTCUT_AND_DIAL_PROFILES,
  autoResolveShortcutProfileConflicts,
  createDefaultShortcutAndDialProfile,
  detectShortcutProfileConflicts,
  diffShortcutProfiles,
  dispatchShortcutProfileApplied,
  exportShortcutProfileToJson,
  importShortcutProfileFromJson,
  normalizeProfileShortcutChord,
  type StudioShortcutAndDialProfile,
} from "./studio-shortcut-profile-engine";
import { StudioRadialQuickDialOverlay } from "./StudioRadialQuickDialOverlay";
import { cn } from "@/shared/lib/utils";

export interface StudioShortcutProfileManagerSectionProps {
  readonly shortcuts?: Partial<Record<StudioShortcutActionId, string>>;
  readonly initialProfile?: StudioShortcutAndDialProfile;
  readonly defaultOpen?: boolean;
  readonly onApplyProfile?: (profile: StudioShortcutAndDialProfile) => void;
  readonly onApplyShortcuts?: (shortcuts: Record<StudioShortcutActionId, string>) => void;
}

function buildSyncedProfile(
  base: StudioShortcutAndDialProfile,
  externalShortcuts: Partial<Record<StudioShortcutActionId, string>> | undefined,
): StudioShortcutAndDialProfile {
  if (!externalShortcuts) return base;
  return {
    ...base,
    shortcuts: {
      ...defaultStudioShortcuts(),
      ...base.shortcuts,
      ...externalShortcuts,
    },
  };
}

/**
 * 커스텀 단축키 프로필 · 충돌 진단 · JSON 내보내기/가져오기 · 8방향 퀵 다이얼 설정 섹션.
 *
 * `StudioAppSettingsEditor`(단축키 탭)와 `ShortcutCustomizer`(도움말 허브)에 공통 마운트된다.
 */
export function StudioShortcutProfileManagerSection({
  shortcuts,
  initialProfile,
  defaultOpen = false,
  onApplyProfile,
  onApplyShortcuts,
}: StudioShortcutProfileManagerSectionProps): ReactElement {
  const [profile, setProfile] = useState<StudioShortcutAndDialProfile>(
    () => initialProfile ?? createDefaultShortcutAndDialProfile(),
  );
  const [previewContext, setPreviewContext] = useState<RadialDialContextId>("drawing");
  const [previewDialOpen, setPreviewDialOpen] = useState(false);
  const [jsonBuffer, setJsonBuffer] = useState("");
  const [jsonEditorOpen, setJsonEditorOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedJson, setCopiedJson] = useState(false);

  const effectiveProfile = useMemo(
    () => buildSyncedProfile(profile, shortcuts),
    [profile, shortcuts],
  );

  const conflictReport = useMemo(
    () => detectShortcutProfileConflicts(effectiveProfile),
    [effectiveProfile],
  );

  const commitProfile = (next: StudioShortcutAndDialProfile, message: string) => {
    setProfile(next);
    setErrorMessage("");
    setStatusMessage(message);
    onApplyProfile?.(next);
    onApplyShortcuts?.({ ...next.shortcuts });
    dispatchShortcutProfileApplied(next);
  };

  const handleSelectBuiltinProfile = (preset: StudioShortcutAndDialProfile) => {
    commitProfile(preset, `「${preset.name}」 단축키·8방향 다이얼 프로필을 적용했어요.`);
  };

  const handleAutoResolve = () => {
    const resolved = autoResolveShortcutProfileConflicts(effectiveProfile);
    commitProfile(resolved, "중복 단축키와 퀵 다이얼 호출키 충돌을 정리했어요.");
  };

  const handleExportJson = () => {
    const serialized = exportShortcutProfileToJson(effectiveProfile, { pretty: true });
    setJsonBuffer(serialized);
    setJsonEditorOpen(true);
    setErrorMessage("");
    setStatusMessage("현재 단축키·8방향 다이얼 프로필을 JSON으로 내보냈어요.");
  };

  const handleCopyJson = async () => {
    const serialized = jsonBuffer.trim() || exportShortcutProfileToJson(effectiveProfile, { pretty: true });
    setJsonBuffer(serialized);
    setJsonEditorOpen(true);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(serialized);
      }
      setCopiedJson(true);
      setStatusMessage("프로필 JSON을 클립보드에 복사했어요.");
      globalThis.setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      setStatusMessage("아래 JSON 텍스트 상자에서 직접 복사해 주세요.");
    }
  };

  const handleDownloadJson = () => {
    const serialized = exportShortcutProfileToJson(effectiveProfile, { pretty: true });
    setJsonBuffer(serialized);
    if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      setStatusMessage("프로필 JSON을 생성했어요.");
      return;
    }
    const blob = new Blob([serialized], { type: "application/json;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${effectiveProfile.id || "toonstudio-shortcut-profile"}.json`;
    link.click();
    URL.revokeObjectURL(objectUrl);
    setStatusMessage("프로필 JSON 파일을 내려받았어요.");
  };

  const handleImportJson = () => {
    const result = importShortcutProfileFromJson(jsonBuffer);
    if (!result.ok) {
      setErrorMessage(result.errorMessageKo);
      setStatusMessage("");
      return;
    }
    const diff = diffShortcutProfiles(effectiveProfile, result.profile);
    const warningSuffix =
      result.warnings.length > 0 ? ` (자동 보정 ${result.warnings.length}건)` : "";
    const conflictSuffix =
      result.conflicts.errorCount > 0 ? ` · 충돌 ${result.conflicts.errorCount}건 확인 필요` : "";
    commitProfile(
      result.profile,
      `「${result.profile.name}」 프로필을 적용했어요 · 변경 ${diff.totalChanges}건${warningSuffix}${conflictSuffix}`,
    );
  };

  return (
    <details
      open={defaultOpen || undefined}
      data-studio-shortcut-profile-manager="true"
      className="rounded-xl border border-line bg-card/65 p-3 [word-break:keep-all]"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-fg select-none">
        <span className="inline-flex items-center gap-2">
          <FileJson size={15} className="shrink-0 text-accent" aria-hidden="true" />
          <span>8방향 퀵 다이얼 · 단축키 프로필 관리 (JSON 가져오기/내보내기)</span>
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold",
            conflictReport.errorCount > 0
              ? "border-warn/50 bg-warn/15 text-fg"
              : "border-line bg-panel text-fg-2",
          )}
        >
          {conflictReport.errorCount > 0
            ? `충돌 ${conflictReport.errorCount}건`
            : effectiveProfile.name}
        </span>
      </summary>

      <div className="mt-3 space-y-3 border-t border-line/60 pt-3">
        {/* 기본 제공 프로필 프리셋 */}
        <div className="space-y-1.5">
          <p className="text-[0.7rem] font-semibold text-fg-2">프로필 프리셋</p>
          <div className="grid gap-1.5 sm:grid-cols-3" role="group" aria-label="단축키·퀵 다이얼 프로필 프리셋">
            {BUILTIN_SHORTCUT_AND_DIAL_PROFILES.map((preset) => {
              const selected = effectiveProfile.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  data-shortcut-profile-preset={preset.id}
                  onClick={() => handleSelectBuiltinProfile(preset)}
                  className={cn(
                    "flex min-h-11 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors duration-150 motion-reduce:transition-none",
                    selected
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-line bg-panel text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg",
                    STUDIO_FOCUS_RING,
                  )}
                >
                  <span className="text-xs font-semibold text-fg">{preset.name}</span>
                  <span className="mt-0.5 line-clamp-2 text-[0.66rem] leading-snug text-fg-3">
                    {preset.descriptionKo}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 실시간 충돌 감지기 */}
        {conflictReport.items.length > 0 ? (
          <div
            role="alert"
            data-shortcut-profile-conflicts="true"
            className="rounded-xl border border-warn/40 bg-warn/10 p-2.5 text-xs text-fg"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <AlertTriangle size={14} className="shrink-0 text-warn" aria-hidden="true" />
                <span>
                  단축키 충돌 {conflictReport.errorCount}건 · 브라우저 주의 {conflictReport.warningCount}건
                </span>
              </span>
              {conflictReport.errorCount > 0 ? (
                <button
                  type="button"
                  data-shortcut-profile-autoresolve="true"
                  onClick={handleAutoResolve}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-warn/45 bg-card px-3 text-xs font-semibold text-fg hover:bg-raised",
                    STUDIO_FOCUS_RING,
                  )}
                >
                  <WandSparkles size={13} className="text-warn" aria-hidden="true" />
                  <span>충돌 자동 정리</span>
                </button>
              ) : null}
            </div>
            <ul className="mt-2 space-y-1 text-[0.68rem] text-fg-2">
              {conflictReport.items.map((item) => (
                <li key={`${item.severity}-${item.chordKey}`} className="flex flex-wrap items-baseline gap-1.5">
                  <kbd className="rounded border border-line-strong bg-panel px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold text-fg">
                    {item.displayChord}
                  </kbd>
                  <span className="font-semibold text-fg">
                    {item.entries.map((entry) => entry.labelKo).join(" · ")}
                  </span>
                  <span className="text-fg-3">— {item.reasonKo}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded-xl border border-line bg-panel/70 px-3 py-2 text-[0.7rem] text-fg-2">
            현재 단축키와 8방향 다이얼 호출키({formatStudioShortcutChord(effectiveProfile.dialTriggerShortcut)})에 충돌이 없습니다.
          </p>
        )}

        {/* 8방향 퀵 다이얼 제스처·상황별 프리셋 설정 */}
        <div className="rounded-xl border border-line bg-panel/70 p-2.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-fg">상황별 8방향 퀵 다이얼 설정</p>
              <p className="text-[0.68rem] text-fg-3">
                드로잉·선화·3D 배경·식자·검수 5개 상황마다 8방향 슬롯과 데드존 반경을 조정합니다.
              </p>
            </div>
            <button
              type="button"
              data-shortcut-profile-open-dial-preview="true"
              onClick={() => setPreviewDialOpen(true)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-accent bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover motion-reduce:transition-none",
                STUDIO_FOCUS_RING,
              )}
            >
              <Compass size={14} aria-hidden="true" />
              <span>8방향 다이얼 시험·편집</span>
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block rounded-lg border border-line bg-card px-2.5 py-2 text-[0.68rem] text-fg-2">
              <span className="font-semibold text-fg">호출 단축키</span>
              <input
                type="text"
                aria-label="8방향 퀵 다이얼 호출 단축키"
                value={effectiveProfile.dialTriggerShortcut}
                onChange={(event) => {
                  const nextTrigger = normalizeProfileShortcutChord(event.target.value);
                  commitProfile(
                    { ...effectiveProfile, dialTriggerShortcut: nextTrigger },
                    "8방향 퀵 다이얼 호출 단축키를 바꿨어요.",
                  );
                }}
                className={cn(
                  "mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-panel px-2.5 font-mono text-xs text-fg",
                  STUDIO_FOCUS_RING,
                )}
              />
            </label>

            <label className="block rounded-lg border border-line bg-card px-2.5 py-2 text-[0.68rem] text-fg-2">
              <span className="flex items-center justify-between font-semibold text-fg">
                <span>데드존 반경</span>
                <span className="tabular-nums text-accent">{effectiveProfile.dialDeadzonePx}px</span>
              </span>
              <input
                type="range"
                min={12}
                max={40}
                step={2}
                aria-label="8방향 퀵 다이얼 데드존 반경"
                value={effectiveProfile.dialDeadzonePx}
                onChange={(event) => {
                  const nextDeadzone = Number(event.target.value);
                  commitProfile(
                    { ...effectiveProfile, dialDeadzonePx: nextDeadzone },
                    `데드존 반경을 ${nextDeadzone}px로 설정했어요.`,
                  );
                }}
                className="mt-3 w-full accent-accent"
              />
            </label>

            <label className="block rounded-lg border border-line bg-card px-2.5 py-2 text-[0.68rem] text-fg-2">
              <span className="flex items-center justify-between font-semibold text-fg">
                <span>경계 떨림 보정</span>
                <span className="tabular-nums text-accent">±{effectiveProfile.dialHysteresisDeg}°</span>
              </span>
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                aria-label="8방향 퀵 다이얼 경계 떨림 보정 각도"
                value={effectiveProfile.dialHysteresisDeg}
                onChange={(event) => {
                  const nextHysteresis = Number(event.target.value);
                  commitProfile(
                    { ...effectiveProfile, dialHysteresisDeg: nextHysteresis },
                    `섹터 경계 떨림 보정 각도를 ±${nextHysteresis}°로 설정했어요.`,
                  );
                }}
                className="mt-3 w-full accent-accent"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="미리보기 작업 상황 선택">
            {RADIAL_DIAL_CONTEXT_IDS.map((ctxId) => {
              const meta = RADIAL_DIAL_CONTEXT_META[ctxId];
              const active = previewContext === ctxId;
              return (
                <button
                  key={ctxId}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPreviewContext(ctxId)}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-xl border px-3 text-xs font-semibold transition-colors motion-reduce:transition-none",
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                    STUDIO_FOCUS_RING,
                  )}
                >
                  {meta.labelKo}
                </button>
              );
            })}
          </div>
        </div>

        {/* JSON 직렬화 내보내기 / 가져오기 */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-shortcut-profile-export-json="true"
              onClick={handleExportJson}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg hover:bg-raised",
                STUDIO_FOCUS_RING,
              )}
            >
              <FileJson size={14} aria-hidden="true" />
              <span>JSON 내보내기</span>
            </button>
            <button
              type="button"
              data-shortcut-profile-copy-json="true"
              onClick={() => {
                void handleCopyJson();
              }}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg",
                STUDIO_FOCUS_RING,
              )}
            >
              {copiedJson ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              <span>{copiedJson ? "복사됨" : "JSON 복사"}</span>
            </button>
            <button
              type="button"
              data-shortcut-profile-download-json="true"
              onClick={handleDownloadJson}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg",
                STUDIO_FOCUS_RING,
              )}
            >
              <Download size={14} aria-hidden="true" />
              <span>파일 저장</span>
            </button>
            <button
              type="button"
              data-shortcut-profile-toggle-import="true"
              onClick={() => setJsonEditorOpen((open) => !open)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg",
                STUDIO_FOCUS_RING,
              )}
            >
              <Upload size={14} aria-hidden="true" />
              <span>{jsonEditorOpen ? "JSON 편집기 접기" : "JSON 가져오기"}</span>
            </button>
          </div>

          {jsonEditorOpen ? (
            <div className="space-y-2 rounded-xl border border-line bg-panel p-2.5">
              <label className="block text-[0.7rem] font-semibold text-fg-2">
                <span>단축키·8방향 다이얼 프로필 JSON</span>
                <textarea
                  rows={6}
                  aria-label="단축키 프로필 JSON 입력"
                  value={jsonBuffer}
                  onChange={(event) => setJsonBuffer(event.target.value)}
                  placeholder='{"schemaVersion": 1, "name": "내 단축키 프로필", ...}'
                  className={cn(
                    "mt-1.5 w-full rounded-lg border border-line-strong bg-card p-2 font-mono text-[0.7rem] text-fg",
                    STUDIO_FOCUS_RING,
                  )}
                />
              </label>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  data-shortcut-profile-apply-import="true"
                  onClick={handleImportJson}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-semibold text-on-accent hover:bg-accent-hover",
                    STUDIO_FOCUS_RING,
                  )}
                >
                  <Upload size={14} aria-hidden="true" />
                  <span>JSON 검증 후 적용</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {errorMessage ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs font-medium text-fg"
          >
            {errorMessage}
          </p>
        ) : null}

        <p
          role="status"
          aria-live="polite"
          className={cn("text-[0.7rem] text-fg-2", !statusMessage && "sr-only")}
        >
          {statusMessage}
        </p>
      </div>

      <StudioRadialQuickDialOverlay
        open={previewDialOpen}
        contextId={previewContext}
        contextSlots={effectiveProfile.dialContexts}
        deadzonePx={effectiveProfile.dialDeadzonePx}
        hysteresisDeg={effectiveProfile.dialHysteresisDeg}
        triggerShortcutLabel={effectiveProfile.dialTriggerShortcut}
        onContextChange={setPreviewContext}
        onContextSlotsChange={(nextContexts) => {
          commitProfile(
            { ...effectiveProfile, dialContexts: nextContexts },
            "상황별 8방향 퀵 다이얼 슬롯을 저장했어요.",
          );
        }}
        onSelectAction={(_actionId, slot, ctxId) => {
          setStatusMessage(
            `[${RADIAL_DIAL_CONTEXT_META[ctxId].labelKo}] ${slot.directionLabelKo} 「${slot.action.labelKo}」 동작을 확인했어요.`,
          );
        }}
        onClose={() => setPreviewDialOpen(false)}
      />
    </details>
  );
}
