import { useExampleCallback } from "./use-example-callback";

/**
 * 프로 단축키 리매핑(4대 도구 프리셋·OS 정규화·충돌 감지기) · 왼손/한손 태블릿 미러 레이아웃 ·
 * WCAG 2.2 AAA & 한국어 가독성 감사 3탭 마스터 패널 (Wave 41F).
 *
 * Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건) · Props 없이 단독 렌더링 지원 ·
 * 브라우저 스토리지 0건 · 모든 버튼 44px(min-h-11) 터치 타깃 및 [word-break:keep-all] 준수.
 */

import {
  Accessibility, AlertTriangle, CheckCircle2, Download, FlipHorizontal2, Hand,
  Keyboard, RotateCcw, ShieldCheck, Sparkles, Upload, Wrench,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { Switch } from "@/shared/components/ui/switch";
import { useI18n } from "@/shared/lib/i18n";

import {
  ACCESSIBILITY_AUDIT_PRESET_IDS, ACCESSIBILITY_AUDIT_PRESETS, applyAaaRemediation,
  auditStudioAccessibilityBudget, autoResolveShortcutConflicts, computeHandednessLayoutPlan,
  createShortcutBindingsFromPreset, detectShortcutConflicts, DOMINANT_HAND_MODES,
  exportShortcutProfileJson, importShortcutProfileJson, normalizeShortcutChord,
  remapShortcutCommand, SHORTCUT_COMMANDS, SHORTCUT_OS_PLATFORMS, SHORTCUT_PRESET_IDS,
  SHORTCUT_PRESETS, type AccessibilityAuditPresetId, type AccessibilityGrade,
  type DominantHandMode, type HandednessLayoutPlan, type ShortcutCommandCategory,
  type ShortcutCommandId, type ShortcutConflictReport, type ShortcutOsPlatform,
  type ShortcutPresetId, type StudioAccessibilityAuditInput,
  type StudioAccessibilityAuditReport, type StudioViewportDevice,
} from "./shortcut-ergonomics-engine";

export type ErgonomicsMasterTabId = "shortcuts" | "handedness" | "accessibility";

export interface StudioErgonomicsMasterPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialTab?: ErgonomicsMasterTabId;
  readonly initialPresetId?: ShortcutPresetId;
  readonly initialPlatform?: ShortcutOsPlatform;
  readonly initialHandMode?: DominantHandMode;
  readonly initialA11yPreset?: AccessibilityAuditPresetId;
  readonly onShortcutProfileChanged?: (
    presetId: ShortcutPresetId,
    bindings: Readonly<Record<ShortcutCommandId, string>>,
    report: ShortcutConflictReport,
  ) => void | Promise<void>;
  readonly onHandednessPlanChanged?: (plan: HandednessLayoutPlan) => void | Promise<void>;
  readonly onAccessibilityAudited?: (report: StudioAccessibilityAuditReport) => void | Promise<void>;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const PILL_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent-soft text-accent";
const IDLE_TONE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

const CATEGORY_OPTIONS: readonly { readonly id: "all" | ShortcutCommandCategory; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "all", labelKo: "전체 (20)", labelEn: "All (20)" },
  { id: "draw", labelKo: "드로잉", labelEn: "Draw" },
  { id: "edit", labelKo: "편집·변형", labelEn: "Edit" },
  { id: "view", labelKo: "캔버스 뷰", labelEn: "View" },
  { id: "panel", labelKo: "레이어·패널", labelEn: "Panels" },
];

const HAND_MODE_META: Readonly<Record<DominantHandMode, { readonly labelKo: string; readonly labelEn: string }>> = {
  "right-handed": { labelKo: "오른손 기본", labelEn: "Right-Handed" },
  "left-handed": { labelKo: "왼손잡이 미러", labelEn: "Left-Handed Mirror" },
  "one-hand-left-tablet": { labelKo: "한손 태블릿 (왼손)", labelEn: "One-Hand Left Tablet" },
  "one-hand-right-tablet": { labelKo: "한손 태블릿 (오른손)", labelEn: "One-Hand Right Tablet" },
};

const DEVICE_META: readonly { readonly id: StudioViewportDevice; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "desktop", labelKo: "데스크톱 1280×800", labelEn: "Desktop 1280×800" },
  { id: "tablet-landscape", labelKo: "태블릿 가로 1194×834", labelEn: "Tablet Landscape" },
  { id: "tablet-portrait", labelKo: "태블릿 세로 834×1194", labelEn: "Tablet Portrait" },
];

const PLATFORM_LABELS: Readonly<Record<ShortcutOsPlatform, string>> = {
  mac: "macOS (⌘)", windows: "Windows (Ctrl)", ipad: "iPadOS (⌘)",
};

function gradeBadgeClass(grade: AccessibilityGrade): string {
  if (grade === "AAA") return "border-good bg-good-soft text-good";
  if (grade === "AA") return "border-warn bg-warning-soft text-warn";
  return "border-bad bg-bad-soft text-bad";
}

function slotFillClass(slotId: string, inThumbZone: boolean): string {
  if (slotId === "orbitalWheel") return "fill-accent/20 stroke-accent";
  return inThumbZone ? "fill-info-soft stroke-cool" : "fill-raised stroke-line-strong";
}

/** 4대 도구 단축키 리매핑 · 왼손/한손 태블릿 미러 · WCAG 2.2 AAA 접근성 마스터 패널 */
export function StudioErgonomicsMasterPanel(props: StudioErgonomicsMasterPanelProps): ReactElement {
  const {
    locale, className, initialTab = "shortcuts", initialPresetId = "toonstudio",
    initialPlatform = "mac", initialHandMode = "right-handed", initialA11yPreset = "atelier-aaa",
    onShortcutProfileChanged, onHandednessPlanChanged, onAccessibilityAudited,
  } = props;

  const action = useExampleCallback();
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<ErgonomicsMasterTabId>(initialTab);
  const [presetId, setPresetId] = useState<ShortcutPresetId>(initialPresetId);
  const [platform, setPlatform] = useState<ShortcutOsPlatform>(initialPlatform);
  const [categoryFilter, setCategoryFilter] = useState<"all" | ShortcutCommandCategory>("all");
  const [bindings, setBindings] = useState<Record<ShortcutCommandId, string>>(() => createShortcutBindingsFromPreset(initialPresetId));
  const [selectedCommandId, setSelectedCommandId] = useState<ShortcutCommandId>("brush");
  const [draftChord, setDraftChord] = useState<string>(() => SHORTCUT_PRESETS[initialPresetId].bindings.brush);
  const [profileName, setProfileName] = useState(`${SHORTCUT_PRESETS[initialPresetId].labelEn} Custom`);
  const [jsonBuffer, setJsonBuffer] = useState<string>("");
  const [jsonNotice, setJsonNotice] = useState<{ readonly tone: "good" | "bad"; readonly text: string } | null>(null);

  const [handMode, setHandMode] = useState<DominantHandMode>(initialHandMode);
  const [device, setDevice] = useState<StudioViewportDevice>("tablet-landscape");
  const [palmMarginPx, setPalmMarginPx] = useState<number>(28);
  const [compactChrome, setCompactChrome] = useState<boolean>(false);

  const [a11yPresetId, setA11yPresetId] = useState<AccessibilityAuditPresetId>(initialA11yPreset);
  const [auditInput, setAuditInput] = useState<StudioAccessibilityAuditInput>(() => ACCESSIBILITY_AUDIT_PRESETS[initialA11yPreset].input);

  const conflictReport = useMemo<ShortcutConflictReport>(() => detectShortcutConflicts(bindings, platform), [bindings, platform]);
  const visibleCommands = useMemo(
    () => (categoryFilter === "all" ? SHORTCUT_COMMANDS : SHORTCUT_COMMANDS.filter((cmd) => cmd.category === categoryFilter)),
    [categoryFilter],
  );
  const handednessPlan = useMemo<HandednessLayoutPlan>(
    () => computeHandednessLayoutPlan({ handMode, device, palmRejectionMarginPx: palmMarginPx, compactChrome }),
    [handMode, device, palmMarginPx, compactChrome],
  );
  const auditReport = useMemo<StudioAccessibilityAuditReport>(() => auditStudioAccessibilityBudget(auditInput), [auditInput]);

  const emitShortcutChange = (nextPreset: ShortcutPresetId, nextBindings: Readonly<Record<ShortcutCommandId, string>>, nextOs: ShortcutOsPlatform): void | Promise<void> => {
    return onShortcutProfileChanged?.(nextPreset, nextBindings, detectShortcutConflicts(nextBindings, nextOs));
  };

  const handleSelectPreset = (nextPreset: ShortcutPresetId): void => {
    const nextBindings = createShortcutBindingsFromPreset(nextPreset);
    action.run([() => emitShortcutChange(nextPreset, nextBindings, platform)], () => {
      setPresetId(nextPreset);
      setProfileName(`${SHORTCUT_PRESETS[nextPreset].labelEn} Custom`);
      setBindings(nextBindings);
      setDraftChord(nextBindings[selectedCommandId]);
      setJsonNotice(null);
    });
  };

  const handleSelectPlatform = (nextOs: ShortcutOsPlatform): void => {
    action.run([() => emitShortcutChange(presetId, bindings, nextOs)], () => setPlatform(nextOs));
  };

  const handleSelectCommand = (cmdId: ShortcutCommandId): void => {
    setSelectedCommandId(cmdId);
    setDraftChord(bindings[cmdId]);
  };

  const handleApplyDraftChord = (): void => {
    const nextBindings = remapShortcutCommand(bindings, selectedCommandId, draftChord, platform);
    action.run([() => emitShortcutChange(presetId, nextBindings, platform)], () => {
      setBindings(nextBindings);
      setDraftChord(nextBindings[selectedCommandId]);
    });
  };

  const handleAutoResolveConflicts = (): void => {
    const resolved = autoResolveShortcutConflicts(bindings, presetId, platform);
    action.run([() => emitShortcutChange(presetId, resolved, platform)], () => {
      setBindings(resolved);
      setDraftChord(resolved[selectedCommandId]);
    });
  };

  const handleExportJson = (): void => {
    const serialized = exportShortcutProfileJson({
      format: "toonstudio.ergonomics.shortcuts.v1", schemaVersion: 1,
      profileName, presetId, platform, exportedAtIso: new Date().toISOString(), bindings,
    });
    setJsonBuffer(serialized);
    setJsonNotice({ tone: "good", text: pick("현재 20종 단축키 프로필을 v1 JSON으로 직렬화했습니다.", "Exported 20 commands as v1 profile JSON.") });
  };

  const handleImportJson = (): void => {
    const result = importShortcutProfileJson(jsonBuffer, platform);
    if (!result.ok) {
      setJsonNotice({ tone: "bad", text: isKo ? result.messageKo : result.messageEn });
      return;
    }
    const nextBindings = { ...result.profile.bindings };
    action.run([() => onShortcutProfileChanged?.(result.profile.presetId, nextBindings, result.conflicts)], () => {
      setPresetId(result.profile.presetId);
      setProfileName(result.profile.profileName);
      setPlatform(result.profile.platform);
      setBindings(nextBindings);
      setDraftChord(nextBindings[selectedCommandId]);
      setJsonNotice({
        tone: "good",
        text: pick(
          `프로필 "${result.profile.profileName}" 예제 가져오기 완료 (충돌 ${result.conflicts.errorCount}건 · 경고 ${result.warnings.length}건)`,
          `Imported example "${result.profile.profileName}" (${result.conflicts.errorCount} errors · ${result.warnings.length} warnings)`,
        ),
      });
    });
  };

  const updateHandedness = (nextMode: DominantHandMode, nextDevice: StudioViewportDevice, nextPalm: number, nextCompact: boolean): void => {
    const plan = computeHandednessLayoutPlan({ handMode: nextMode, device: nextDevice, palmRejectionMarginPx: nextPalm, compactChrome: nextCompact });
    action.run([() => onHandednessPlanChanged?.(plan)], () => {
      setHandMode(nextMode);
      setDevice(nextDevice);
      setPalmMarginPx(nextPalm);
      setCompactChrome(nextCompact);
    });
  };

  const updateAuditInput = (nextInput: StudioAccessibilityAuditInput, nextPreset?: AccessibilityAuditPresetId): void => {
    action.run([() => onAccessibilityAudited?.(auditStudioAccessibilityBudget(nextInput))], () => {
      setAuditInput(nextInput);
      if (nextPreset) setA11yPresetId(nextPreset);
    });
  };

  const handleSelectA11yPreset = (nextId: AccessibilityAuditPresetId): void => {
    updateAuditInput(ACCESSIBILITY_AUDIT_PRESETS[nextId].input, nextId);
  };

  const handleApplyAaaFix = (): void => {
    updateAuditInput(applyAaaRemediation(auditInput), "atelier-aaa");
  };

  const tabs: readonly { readonly id: ErgonomicsMasterTabId; readonly label: string; readonly shortLabel: string; readonly icon: ReactElement }[] = [
    { id: "shortcuts", label: pick("4대 단축키 리매핑·충돌", "4-Tool Shortcuts & Conflicts"), shortLabel: pick("단축키", "Shortcuts"), icon: <Keyboard className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" /> },
    { id: "handedness", label: pick("왼손·한손 태블릿 미러", "Left-Hand & Tablet Mirror"), shortLabel: pick("도구 배치", "Layout"), icon: <Hand className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" /> },
    { id: "accessibility", label: pick("접근성 입력값 예제", "Accessibility Input Examples"), shortLabel: pick("가독성", "Readability"), icon: <Accessibility className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" /> },
  ];

  const selectedCommandSpec = SHORTCUT_COMMANDS.find((c) => c.id === selectedCommandId) ?? SHORTCUT_COMMANDS[0];
  const minTargetPx = auditReport.touchTargetSummary.minWidthPx;

  return (
    <section
      data-testid="ergonomics-shortcut-master-panel"
      aria-label={pick("단축키·왼손 배치·가독성 입력 예제", "Shortcut, Handedness Layout & Readability Examples")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <p data-testid="ergonomics-example-scope" className="text-xs text-fg-2">
        {pick("독립 예제 · OS·기기를 탐지하지 않으며 실제 단축키·앱 설정·손바닥 방지를 변경하지 않습니다. DOM 접근성 검사와 의료·난독 진단이 아닙니다. 입력은 닫으면 사라지므로 필요한 JSON은 복사해 주세요.", "Standalone example. No OS/device detection or real shortcuts, app settings, or palm rejection changes. This is not a DOM accessibility or medical assessment. Closing discards inputs; copy any JSON you need.")}
      </p>
      <fieldset disabled={action.pending || action.error !== null} aria-busy={action.pending} className="min-w-0 space-y-4 border-0 p-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("단축키·배치·가독성 입력 예제", "Shortcut, Layout & Readability Input Examples")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "도구별 단축키 예제를 정규화하고, 고정 화면 크기와 타이포그래피 입력값으로 배치·가독성 규칙을 비교합니다.",
              "Normalize example keymaps and compare layout and readability rules using fixed viewport and typography inputs.",
            )}
          </p>
        </div>
        <span data-testid="badge-ergonomics-grade" className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${gradeBadgeClass(auditReport.grade)}`}>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {pick(`입력 예제 ${auditReport.grade} · ${auditReport.overallScore}점`, `Example ${auditReport.grade} · ${auditReport.overallScore}/100`)}
        </span>
      </header>

      <div role="tablist" aria-label={pick("인체공학 마스터 기능 탭", "Ergonomics master feature tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id} type="button" role="tab" id={`${uid}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id} aria-label={`${tab.shortLabel}: ${tab.label}`} title={tab.label} aria-controls={`${uid}-panel-${tab.id}`}
            data-testid={`tab-${tab.id}`} onClick={() => setActiveTab(tab.id)}
            className={`${TAB_BTN} ${activeTab === tab.id ? ACTIVE_TONE : IDLE_TONE}`}
          >
            {tab.icon}<span>{tab.shortLabel}</span>
          </button>
        ))}
      </div>

      {activeTab === "shortcuts" && (
        <div role="tabpanel" id={`${uid}-panel-shortcuts`} aria-labelledby={`${uid}-tab-shortcuts`} data-testid="panel-shortcuts" className="space-y-4">
          <div className="space-y-3 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg">{pick("4대 업계 단축키 프로필 · OS 주 수정키 정규화", "4 Industry Keymap Presets & OS Normalization")}</h3>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("운영체제 선택", "Select OS Platform")}>
                {SHORTCUT_OS_PLATFORMS.map((osId) => (
                  <button key={osId} type="button" data-testid={`os-btn-${osId}`} onClick={() => handleSelectPlatform(osId)} className={`${PILL_BTN} ${platform === osId ? ACTIVE_TONE : IDLE_TONE}`}>
                    {PLATFORM_LABELS[osId]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {SHORTCUT_PRESET_IDS.map((pid) => (
                <button key={pid} type="button" data-testid={`preset-btn-${pid}`} onClick={() => handleSelectPreset(pid)} className={`${PILL_BTN} ${presetId === pid ? ACTIVE_TONE : IDLE_TONE}`}>
                  {isKo ? SHORTCUT_PRESETS[pid].labelKo : SHORTCUT_PRESETS[pid].labelEn}
                </button>
              ))}
            </div>
            <p className="text-xs text-fg-2">{isKo ? SHORTCUT_PRESETS[presetId].summaryKo : SHORTCUT_PRESETS[presetId].summaryEn}</p>
          </div>

          <div
            data-testid="shortcut-conflict-banner"
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs ${
              conflictReport.hasBlockingConflicts ? "border-bad bg-bad-soft text-bad" : conflictReport.warningCount > 0 ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold tabular-nums">
              {conflictReport.hasBlockingConflicts ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>
                {conflictReport.hasBlockingConflicts
                  ? pick(`차단 충돌 ${conflictReport.errorCount}건 감지됨 · 즉시 자동 정리 가능`, `${conflictReport.errorCount} blocking shortcut conflicts detected`)
                  : pick(`예제 충돌 0건 · ${conflictReport.boundCount}/${conflictReport.totalCommands} 명령 매핑 완료 (${PLATFORM_LABELS[platform]})`, `0 example conflicts · ${conflictReport.boundCount}/${conflictReport.totalCommands} commands bound (${PLATFORM_LABELS[platform]})`)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="btn-auto-resolve-conflicts" onClick={handleAutoResolveConflicts} className={`${PILL_BTN} ${IDLE_TONE}`}>
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" />{pick("충돌 자동 정리", "Auto-Resolve")}
              </button>
              <button type="button" data-testid="btn-reset-preset" onClick={() => handleSelectPreset(presetId)} className={`${PILL_BTN} ${IDLE_TONE}`}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{pick("프리셋 복원", "Reset Preset")}
              </button>
            </div>
          </div>

          <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[200px] flex-1 space-y-1">
                <label htmlFor={`${uid}-chord-input`} className="block text-xs font-semibold text-fg">
                  {pick(`선택 명령 리매핑: ${selectedCommandSpec ? selectedCommandSpec.labelKo : selectedCommandId}`, `Remap Command: ${selectedCommandSpec ? selectedCommandSpec.labelEn : selectedCommandId}`)}
                </label>
                <input
                  id={`${uid}-chord-input`} data-testid="input-shortcut-chord" type="text"
                  value={draftChord} onChange={(e) => setDraftChord(e.target.value)}
                  placeholder="Mod+Shift+Z, Alt+Q, B..."
                  className={`min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-xs font-mono text-fg ${FOCUS_RING}`}
                />
              </div>
              <button type="button" data-testid="btn-apply-chord" onClick={handleApplyDraftChord} className={`${PILL_BTN} ${ACTIVE_TONE}`}>
                {pick("예제 단축키 변경", "Change Example Chord")}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map((cat) => (
                <button key={cat.id} type="button" data-testid={`cat-btn-${cat.id}`} onClick={() => setCategoryFilter(cat.id)} className={`${PILL_BTN} ${categoryFilter === cat.id ? ACTIVE_TONE : IDLE_TONE}`}>
                  {isKo ? cat.labelKo : cat.labelEn}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="shortcut-command-grid">
              {visibleCommands.map((cmd) => {
                const norm = normalizeShortcutChord(bindings[cmd.id] ?? "", platform);
                const isConflicted = conflictReport.conflictedCommandIds.includes(cmd.id);
                return (
                  <button
                    key={cmd.id} type="button" data-testid={`cmd-row-${cmd.id}`} onClick={() => handleSelectCommand(cmd.id)}
                    className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                      isConflicted ? "border-bad bg-bad-soft text-fg" : selectedCommandId === cmd.id ? ACTIVE_TONE : "border-line bg-raised text-fg hover:border-line-strong"
                    }`}
                  >
                    <span className="truncate font-medium">{isKo ? cmd.labelKo : cmd.labelEn}</span>
                    <kbd data-testid={`cmd-kbd-${cmd.id}`} className="shrink-0 rounded border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] font-semibold text-fg tabular-nums">
                      {norm.displayLabel}
                    </kbd>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`${uid}-json-box`} className="text-xs font-semibold text-fg">
                {pick("단축키 프로필 JSON 직렬화 · 역직렬화 검증", "Shortcut Profile JSON Export & Validation")}
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" data-testid="btn-export-json" onClick={handleExportJson} className={`${PILL_BTN} ${IDLE_TONE}`}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />{pick("JSON 내보내기", "Export JSON")}
                </button>
                <button type="button" data-testid="btn-import-json" onClick={handleImportJson} className={`${PILL_BTN} ${ACTIVE_TONE}`}>
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />{pick("JSON 가져오기 검증", "Validate & Import")}
                </button>
              </div>
            </div>
            <textarea
              id={`${uid}-json-box`} data-testid="textarea-shortcut-json" rows={4}
              value={jsonBuffer} onChange={(e) => setJsonBuffer(e.target.value)}
              placeholder={pick("JSON 내보내기를 눌러 프로필을 생성하거나 외부 프로필 JSON을 붙여넣으세요.", "Click Export JSON or paste a v1 shortcut profile JSON here.")}
              className={`w-full rounded-lg border border-line bg-canvas p-2.5 font-mono text-[11px] text-fg ${FOCUS_RING}`}
            />
            {jsonNotice ? <p data-testid="json-import-notice" className={`text-xs font-medium ${jsonNotice.tone === "good" ? "text-good" : "text-bad"}`}>{jsonNotice.text}</p> : null}
          </div>
        </div>
      )}

      {activeTab === "handedness" && (
        <div role="tabpanel" id={`${uid}-panel-handedness`} aria-labelledby={`${uid}-tab-handedness`} data-testid="panel-handedness" className="space-y-4">
          <div className="space-y-3 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <FlipHorizontal2 className="h-4 w-4 text-accent" aria-hidden="true" />
                <h3 className="text-xs font-semibold text-fg">{pick("주 사용 손 · 한손 태블릿 크롬 미러 솔버", "Dominant Hand & One-Hand Tablet Mirror Solver")}</h3>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor={`${uid}-compact-chrome`} className="text-xs font-medium text-fg-2">{pick("슬림 크롬 모드", "Compact Chrome")}</label>
                <Switch id={`${uid}-compact-chrome`} data-testid="switch-compact-chrome" checked={compactChrome} onCheckedChange={(checked) => updateHandedness(handMode, device, palmMarginPx, checked)} aria-label={pick("슬림 크롬 모드 전환", "Toggle compact chrome")} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {DOMINANT_HAND_MODES.map((mode) => (
                <button key={mode} type="button" data-testid={`hand-mode-${mode}`} onClick={() => updateHandedness(mode, device, palmMarginPx, compactChrome)} className={`${PILL_BTN} ${handMode === mode ? ACTIVE_TONE : IDLE_TONE}`}>
                  {isKo ? HAND_MODE_META[mode].labelKo : HAND_MODE_META[mode].labelEn}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-2.5">
              <div className="flex flex-wrap gap-1.5">
                {DEVICE_META.map((dev) => (
                  <button key={dev.id} type="button" data-testid={`device-btn-${dev.id}`} onClick={() => updateHandedness(handMode, dev.id, palmMarginPx, compactChrome)} className={`${PILL_BTN} ${device === dev.id ? ACTIVE_TONE : IDLE_TONE}`}>
                    {isKo ? dev.labelKo : dev.labelEn}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <label htmlFor={`${uid}-palm-margin`} className="text-fg-2 tabular-nums">{pick(`손바닥 보호 여백: ${palmMarginPx}px`, `Palm Guard: ${palmMarginPx}px`)}</label>
                <input id={`${uid}-palm-margin`} data-testid="slider-palm-margin" type="range" min={8} max={48} step={2} value={palmMarginPx} onChange={(e) => updateHandedness(handMode, device, Number(e.target.value), compactChrome)} className="w-28 accent-accent" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("가정식 엄지 도달 비율", "Model Thumb Coverage")}</div>
              <div data-testid="metric-thumb-coverage" className="mt-1 text-lg font-bold text-accent tabular-nums">{handednessPlan.thumbReachCoveragePct.toFixed(1)}%</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("예제 캔버스 면적", "Example Canvas Share")}</div>
              <div data-testid="metric-canvas-share" className={`mt-1 text-lg font-bold tabular-nums ${handednessPlan.meetsCanvasBudget ? "text-good" : "text-warn"}`}>{handednessPlan.canvasViewportSharePct.toFixed(1)}%</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("가정식 오터치 지수", "Model Palm Index")}</div>
              <div data-testid="metric-palm-risk" className="mt-1 text-lg font-bold text-cool tabular-nums">{handednessPlan.palmCollisionRiskPct.toFixed(1)}%</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("좌우 미러 상태", "Mirror Orientation")}</div>
              <div data-testid="metric-mirror-state" className="mt-1 text-sm font-bold text-fg">
                {handednessPlan.mirroredHorizontally ? pick("우측 배치 예제", "Example: Mirrored Right") : pick("좌측 조작 표준", "Standard Left")}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-line bg-card p-3">
              <div className="text-xs font-semibold text-fg">{pick("스튜디오 크롬 배치 & 엄지 도달 호 미리보기", "Studio Chrome & Thumb Reach Arc")}</div>
              <svg data-testid="handedness-layout-svg" viewBox="0 0 320 200" role="img" aria-label={pick("스튜디오 크롬 좌우 반전과 엄지 도달 범위 미리보기", "Studio chrome mirror and thumb arc preview")} className="h-48 w-full rounded-lg border border-line bg-canvas">
                <rect x={Math.round(handednessPlan.canvasRect.xRatio * 320)} y={Math.round(handednessPlan.canvasRect.yRatio * 200)} width={Math.round(handednessPlan.canvasRect.widthRatio * 320)} height={Math.round(handednessPlan.canvasRect.heightRatio * 200)} rx={6} className="fill-panel stroke-line" strokeWidth={1} />
                <circle cx={Math.round(handednessPlan.thumbZone.anchorXRatio * 320)} cy={Math.round(handednessPlan.thumbZone.anchorYRatio * 200)} r={Math.round(handednessPlan.thumbZone.maxReachRadiusRatio * 200)} className="fill-accent/10 stroke-accent/40" strokeDasharray="4 3" strokeWidth={1} />
                <circle cx={Math.round(handednessPlan.thumbZone.anchorXRatio * 320)} cy={Math.round(handednessPlan.thumbZone.anchorYRatio * 200)} r={Math.round(handednessPlan.thumbZone.comfortableRadiusRatio * 200)} className="fill-good/15 stroke-good/60" strokeWidth={1.2} />
                {handednessPlan.slots.map((slot) => (
                  <rect key={slot.id} data-testid={`svg-slot-${slot.id}`} x={Math.round(slot.xRatio * 320)} y={Math.round(slot.yRatio * 200)} width={Math.max(10, Math.round(slot.widthRatio * 320))} height={Math.max(10, Math.round(slot.heightRatio * 200))} rx={4} className={slotFillClass(slot.id, slot.inThumbZone)} strokeWidth={1.2} />
                ))}
              </svg>
            </div>

            <div className="space-y-2 rounded-lg border border-line bg-card p-3">
              <div className="text-xs font-semibold text-fg">{pick("슬롯 도킹 좌표 · 미러 판정", "Slot Dock Edges & Thumb Fit")}</div>
              <ul className="space-y-1.5 text-xs" data-testid="handedness-slot-list">
                {handednessPlan.slots.map((slot) => (
                  <li key={slot.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-1.5">
                    <span className="font-medium text-fg">{isKo ? slot.labelKo : slot.labelEn}</span>
                    <span className="font-mono text-[11px] text-fg-2 tabular-nums">
                      {slot.dockEdge} · {slot.inThumbZone ? pick("엄지권 내", "In Arc") : pick("보조영역", "Far")}
                    </span>
                  </li>
                ))}
              </ul>
              <ul className="space-y-1 pt-1 text-[11px] text-fg-2">
                {(isKo ? handednessPlan.recommendationsKo : handednessPlan.recommendationsEn).map((tip) => (<li key={tip}>• {tip}</li>))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === "accessibility" && (
        <div role="tabpanel" id={`${uid}-panel-accessibility`} aria-labelledby={`${uid}-tab-accessibility`} data-testid="panel-accessibility" className="space-y-4">
          <div className="space-y-3 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg">{pick("가독성 기준 입력 프리셋", "Readability Input Presets")}</h3>
              <button type="button" data-testid="btn-apply-aaa-remediation" onClick={handleApplyAaaFix} className={`${PILL_BTN} ${ACTIVE_TONE}`}>
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{pick("예제 입력값 보정", "Adjust Example Inputs")}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {ACCESSIBILITY_AUDIT_PRESET_IDS.map((pid) => (
                <button key={pid} type="button" data-testid={`a11y-preset-${pid}`} onClick={() => handleSelectA11yPreset(pid)} className={`${PILL_BTN} ${a11yPresetId === pid ? ACTIVE_TONE : IDLE_TONE}`}>
                  {isKo ? ACCESSIBILITY_AUDIT_PRESETS[pid].labelKo : ACCESSIBILITY_AUDIT_PRESETS[pid].labelEn}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-line/60 pt-3 sm:grid-cols-2">
              <div className="space-y-1 text-xs">
                <label htmlFor={`${uid}-target-size`} className="flex justify-between text-fg-2 tabular-nums">
                  <span>{pick("최소 터치 타깃 크기", "Min Touch Target")}</span>
                  <span className="font-semibold text-fg">{Math.round(minTargetPx)}×{Math.round(minTargetPx)}px</span>
                </label>
                <input
                  id={`${uid}-target-size`} data-testid="slider-target-size" type="range" min={22} max={56} step={2} value={Math.round(minTargetPx)}
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    updateAuditInput({ ...auditInput, touchTargets: auditInput.touchTargets.map((t) => ({ ...t, widthPx: size, heightPx: size })) });
                  }}
                  className="w-full accent-accent"
                />
              </div>

              <div className="space-y-1 text-xs">
                <label htmlFor={`${uid}-line-height`} className="flex justify-between text-fg-2 tabular-nums">
                  <span>{pick("한국어 본문 행간", "Korean Line-Height")}</span>
                  <span className="font-semibold text-fg">{auditInput.typography.lineHeightRatio.toFixed(2)}</span>
                </label>
                <input
                  id={`${uid}-line-height`} data-testid="slider-line-height" type="range" min={1.2} max={2.0} step={0.05} value={auditInput.typography.lineHeightRatio}
                  onChange={(e) => updateAuditInput({ ...auditInput, typography: { ...auditInput.typography, lineHeightRatio: Number(e.target.value) } })}
                  className="w-full accent-accent"
                />
              </div>

              <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-raised px-3 py-2">
                <label htmlFor={`${uid}-keep-all`} className="text-xs font-medium text-fg">{pick("한국어 어절 보호 (word-break: keep-all)", "Korean Word-Break (keep-all)")}</label>
                <Switch id={`${uid}-keep-all`} data-testid="switch-keep-all" checked={auditInput.typography.usesKeepAllWordBreak} onCheckedChange={(checked) => updateAuditInput({ ...auditInput, typography: { ...auditInput.typography, usesKeepAllWordBreak: checked } })} aria-label={pick("어절 단위 줄바꿈 전환", "Toggle keep-all word break")} />
              </div>

              <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-raised px-3 py-2">
                <label htmlFor={`${uid}-motion-reduce`} className="text-xs font-medium text-fg">{pick("모션 감소(prefers-reduced-motion) 존중", "Respect Reduced Motion")}</label>
                <Switch id={`${uid}-motion-reduce`} data-testid="switch-a11y-reduced-motion" checked={auditInput.typography.reducedMotionRespected} onCheckedChange={(checked) => updateAuditInput({ ...auditInput, typography: { ...auditInput.typography, reducedMotionRespected: checked } })} aria-label={pick("모션 감소 존중 전환", "Toggle reduced motion respect")} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-fg">{pick("참고 기준별 입력값 판정", "Input Checks Against Reference Rules")}</span>
                <span data-testid="a11y-grade-pill" className={`rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${gradeBadgeClass(auditReport.grade)}`}>
                  {auditReport.grade} · {auditReport.overallScore}/100
                </span>
              </div>
              <ul className="space-y-1.5 text-xs" data-testid="a11y-check-list">
                {auditReport.checks.map((check) => (
                  <li key={check.criterionCode} className={`flex items-start justify-between gap-2 rounded-md border px-2.5 py-2 ${check.passed ? "border-line bg-raised text-fg" : "border-bad bg-bad-soft text-fg"}`}>
                    <div className="space-y-0.5">
                      <div className="font-semibold">
                        <span className="mr-1.5 font-mono text-[10px] text-fg-3">{check.criterionCode}</span>
                        {isKo ? check.labelKo : check.labelEn}
                      </div>
                      <div className="text-[11px] text-fg-2 tabular-nums">{check.measuredText}</div>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${check.passed ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
                      {check.passed ? pick("통과", "PASS") : pick("보완", "FAIL")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-fg">{pick("한국어 난독 친화 타이포그래피 미리보기", "Korean Readability Live Sample")}</span>
                <span data-testid="kr-readability-score" className="font-bold text-accent tabular-nums">{auditReport.koreanReadabilityScore}/100</span>
              </div>
              <div
                data-testid="korean-typography-preview"
                style={{
                  fontSize: `${auditInput.typography.fontSizePx}px`,
                  lineHeight: auditInput.typography.lineHeightRatio,
                  letterSpacing: `${auditInput.typography.letterSpacingEm}em`,
                  wordSpacing: `${auditInput.typography.wordSpacingEm}em`,
                  wordBreak: auditInput.typography.usesKeepAllWordBreak ? "keep-all" : "break-all",
                }}
                className="rounded-lg border border-line bg-canvas p-3 text-fg"
              >
                {pick(
                  "한글 어절 줄바꿈과 글자 간격을 비교하는 예제입니다. 버튼 크기·포커스 링·모션 처리는 실제 화면에서 별도로 확인해야 합니다.",
                  "This sample compares Hangul wrapping and spacing. Target size, focus rings, and motion behavior require separate checks in the actual screen.",
                )}
              </div>
              {auditReport.remediationStepsKo.length > 0 ? (
                <div className="space-y-1 rounded-md border border-warn bg-warning-soft p-2.5 text-[11px] text-fg">
                  <div className="font-semibold text-warn">{pick("권장 보정 처방", "Recommended Remediations")}</div>
                  {(isKo ? auditReport.remediationStepsKo : auditReport.remediationStepsEn).map((step) => (<p key={step}>• {step}</p>))}
                </div>
              ) : (
                <div className="rounded-md border border-good bg-good-soft p-2.5 text-xs font-medium text-good">
                  {pick("입력한 예제 항목이 이 계산의 기준을 충족합니다. 앱 전체의 WCAG 준수나 의학적 효과를 인증하지 않습니다.", "The provided example fields meet these model rules. This does not certify app-wide WCAG compliance or medical effects.")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </fieldset>
      {action.pending && <p role="status">{pick("예제 콜백 응답을 기다리고 있어요.", "Waiting for the example callback.")}</p>}
      {action.error !== null && (
        <div role="alert" className="space-y-2 text-xs text-bad">
          <p>{pick("콜백을 완료하지 못했습니다. 입력과 이전 결과는 유지됩니다.", "The callback failed. Inputs and previous results are kept.")} {action.error}</p>
          <button type="button" onClick={action.retry} className={PILL_BTN}>{pick("같은 입력으로 다시 시도", "Retry Same Input")}</button>
          <button type="button" onClick={action.reset} className={PILL_BTN}>{pick("오류 닫고 수정", "Dismiss and Edit")}</button>
        </div>
      )}
    </section>
  );
}
