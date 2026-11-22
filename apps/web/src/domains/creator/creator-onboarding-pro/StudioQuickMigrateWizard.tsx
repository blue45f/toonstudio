/**
 * 신규 작가 30초 정착 위자드 (비차단 게스트 친화 3단계 플로우).
 *
 * - 1단계 (10초): 기존 사용 툴 선택(CSP · Procreate · Photoshop · Krita) → 단축키 자동 매핑 미리보기
 * - 2단계 (10초): `.abr`/`.sut`/`.kpp`/`.brush` 드래그·선택 또는 1클릭 예시 → 7밴드 분광 정본 브러시 추천
 * - 3단계 (10초): 7밴드 분광 · 종이 결 추천 확인 + 60fps(16.6ms) 가드 · 옵트인 마찰음(기본 OFF) 적용
 *
 * 디자인 계약:
 * - Calm Atelier 5~9 컨트롤 예산, 모든 인터랙티브 요소 `min-h-11`(>= 44px), `[word-break:keep-all]`
 * - OKLCH 의미 토큰 전용(원시 색상 0건, 중첩 카드 0건, 회전 스피너 0건, browser-KV 직접 호출 0건)
 */

import { ArrowLeft, ArrowRight, Check, FileUp, Sparkles, Upload, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import {
  PAPER_TOOTH_PRESETS,
  type PaperToothPresetId,
} from "../imaging-pro/brush-texture-max";
import {
  TEXTURE_MAX_FRAME_BUDGET_MS,
  buildTextureMaxPipelineBadges,
  createTextureMax60fpsBudgetGuard,
  getTextureMaxInspectorPreset,
  normalizeTextureMaxInspectorConfig,
  type EffectiveTextureMaxPlan,
  type TextureMaxInspectorConfig,
} from "./brush-texture-max-inspector-bridge";
import {
  STUDIO_QUICK_MIGRATE_APPLIED_EVENT,
  buildMigratedShortcutPlan,
  buildSampleBrushInputsForTool,
  dispatchMigratedShortcutProfile,
  getToolMigratorProfile,
  listToolMigratorProfiles,
  recommendSpectralBrushesForBatch,
  type ImportedBrushFileInput,
  type MigratedShortcutPlan,
  type MigratorSourceToolId,
  type SpectralBrushRecommendation,
} from "./tool-migrator-preset";

import { Switch } from "@/shared/components/ui/switch";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export type QuickMigrateWizardStep = 1 | 2 | 3;

export interface QuickMigrateAppliedBundle {
  readonly toolId: MigratorSourceToolId;
  readonly shortcutPlan: MigratedShortcutPlan;
  readonly brushRecommendations: readonly SpectralBrushRecommendation[];
  readonly textureConfig: TextureMaxInspectorConfig;
  readonly effectiveTexturePlan: EffectiveTextureMaxPlan;
}

export interface StudioQuickMigrateWizardProps {
  readonly open: boolean;
  readonly initialToolId?: MigratorSourceToolId;
  readonly onClose: () => void;
  readonly onApply?: (bundle: QuickMigrateAppliedBundle) => void;
  readonly className?: string;
}

const PAPER_PRESET_ORDER: readonly PaperToothPresetId[] = Object.freeze([
  "hot-press",
  "cold-press",
  "rough-watercolor",
  "hanji",
  "charcoal-laid",
]);

const HEADER_PEEK_BYTES = 4096;

async function readFileHeaderBytes(file: File): Promise<Uint8Array | undefined> {
  try {
    if (typeof file.slice === "function") {
      const slice = file.slice(0, HEADER_PEEK_BYTES);
      if (typeof slice.arrayBuffer === "function") {
        const buffer = await slice.arrayBuffer();
        return new Uint8Array(buffer);
      }
    }
    if (typeof file.arrayBuffer === "function") {
      const buffer = await file.arrayBuffer();
      return new Uint8Array(buffer.slice(0, HEADER_PEEK_BYTES));
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function StudioQuickMigrateWizard({
  open,
  initialToolId = "clip-studio",
  onClose,
  onApply,
  className,
}: StudioQuickMigrateWizardProps): ReactElement | null {
  const bt = useBilingual("StudioQuickMigrateWizard");
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const toolButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const paperButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [step, setStep] = useState<QuickMigrateWizardStep>(1);
  const [selectedToolId, setSelectedToolId] = useState<MigratorSourceToolId>(initialToolId);
  const [importedFiles, setImportedFiles] = useState<readonly ImportedBrushFileInput[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedPaperId, setSelectedPaperId] = useState<PaperToothPresetId>(
    () => getToolMigratorProfile(initialToolId).defaultPaperPresetId,
  );
  const [frictionAudioOptIn, setFrictionAudioOptIn] = useState(false);

  const toolProfiles = useMemo(() => listToolMigratorProfiles(), []);
  const activeProfile = useMemo(() => getToolMigratorProfile(selectedToolId), [selectedToolId]);
  const shortcutPlan = useMemo(() => buildMigratedShortcutPlan(selectedToolId), [selectedToolId]);

  const brushRecommendations = useMemo(() => {
    if (importedFiles.length === 0) return [] as readonly SpectralBrushRecommendation[];
    return recommendSpectralBrushesForBatch(importedFiles);
  }, [importedFiles]);

  const recommendedTexturePresetId = useMemo(() => {
    const firstMapped = brushRecommendations[0]?.primary;
    return firstMapped ? firstMapped.texturePresetId : activeProfile.defaultTexturePresetId;
  }, [activeProfile.defaultTexturePresetId, brushRecommendations]);

  const textureConfig = useMemo<TextureMaxInspectorConfig>(() => {
    const presetBase = getTextureMaxInspectorPreset(recommendedTexturePresetId).config;
    const firstMapped = brushRecommendations[0]?.primary;
    return normalizeTextureMaxInspectorConfig({
      ...presetBase,
      paperPresetId: selectedPaperId,
      frictionMediumId: firstMapped ? firstMapped.frictionMediumId : presetBase.frictionMediumId,
      granulationPresetId: firstMapped?.granulationPresetId ?? presetBase.granulationPresetId,
      frictionAudioOptIn,
    });
  }, [brushRecommendations, frictionAudioOptIn, recommendedTexturePresetId, selectedPaperId]);

  const effectiveTexturePlan = useMemo(() => {
    const guard = createTextureMax60fpsBudgetGuard({ initialTier: "high" });
    return guard.resolveEffectivePlan(textureConfig);
  }, [textureConfig]);

  const pipelineBadges = useMemo(
    () => buildTextureMaxPipelineBadges(effectiveTexturePlan),
    [effectiveTexturePlan],
  );

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frameId = requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener("keydown", onKeyDown, true);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  const selectTool = useCallback((toolId: MigratorSourceToolId) => {
    setSelectedToolId(toolId);
    const profile = getToolMigratorProfile(toolId);
    setSelectedPaperId(profile.defaultPaperPresetId);
  }, []);

  const ingestFileList = useCallback(
    async (list: FileList | readonly File[] | null) => {
      if (!list || list.length === 0) return;
      const files = Array.from(list).slice(0, 8);
      const parsed: ImportedBrushFileInput[] = await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          byteLength: file.size,
          headerBytes: await readFileHeaderBytes(file),
          sourceToolHint: selectedToolId,
        })),
      );
      setImportedFiles(parsed);
      const recs = recommendSpectralBrushesForBatch(parsed);
      const topPaper = recs[0]?.primary.paperPresetId;
      if (topPaper) setSelectedPaperId(topPaper);
    },
    [selectedToolId],
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      void ingestFileList(event.target.files);
      event.target.value = "";
    },
    [ingestFileList],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      void ingestFileList(event.dataTransfer?.files ?? null);
    },
    [ingestFileList],
  );

  const handleLoadSamplePack = useCallback(() => {
    const samples = buildSampleBrushInputsForTool(selectedToolId);
    setImportedFiles(samples);
    const recs = recommendSpectralBrushesForBatch(samples);
    const topPaper = recs[0]?.primary.paperPresetId;
    if (topPaper) setSelectedPaperId(topPaper);
  }, [selectedToolId]);

  const handleToolRadioKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIdx = -1;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIdx = (index + 1) % toolProfiles.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIdx = (index - 1 + toolProfiles.length) % toolProfiles.length;
      } else if (event.key === "Home") {
        nextIdx = 0;
      } else if (event.key === "End") {
        nextIdx = toolProfiles.length - 1;
      }
      if (nextIdx < 0) return;
      event.preventDefault();
      const targetProfile = toolProfiles[nextIdx];
      if (!targetProfile) return;
      selectTool(targetProfile.id);
      toolButtonRefs.current[nextIdx]?.focus();
    },
    [selectTool, toolProfiles],
  );

  const handlePaperRadioKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIdx = -1;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIdx = (index + 1) % PAPER_PRESET_ORDER.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIdx = (index - 1 + PAPER_PRESET_ORDER.length) % PAPER_PRESET_ORDER.length;
      } else if (event.key === "Home") {
        nextIdx = 0;
      } else if (event.key === "End") {
        nextIdx = PAPER_PRESET_ORDER.length - 1;
      }
      if (nextIdx < 0) return;
      event.preventDefault();
      const targetPaper = PAPER_PRESET_ORDER[nextIdx];
      if (!targetPaper) return;
      setSelectedPaperId(targetPaper);
      paperButtonRefs.current[nextIdx]?.focus();
    },
    [],
  );

  const handleApply = useCallback(() => {
    dispatchMigratedShortcutProfile(shortcutPlan);
    const bundle: QuickMigrateAppliedBundle = {
      toolId: selectedToolId,
      shortcutPlan,
      brushRecommendations,
      textureConfig,
      effectiveTexturePlan,
    };
    if (typeof window !== "undefined" && typeof CustomEvent === "function") {
      window.dispatchEvent(
        new CustomEvent(STUDIO_QUICK_MIGRATE_APPLIED_EVENT, { detail: bundle }),
      );
    }
    onApply?.(bundle);
    onClose();
  }, [
    brushRecommendations,
    effectiveTexturePlan,
    onApply,
    onClose,
    selectedToolId,
    shortcutPlan,
    textureConfig,
  ]);

  if (!open || typeof document === "undefined") return null;

  const stepTitles: Readonly<Record<QuickMigrateWizardStep, string>> = {
    1: bt("1단계 · 쓰던 툴 단축키 그대로 맞추기", "Step 1 · Match your previous tool shortcuts"),
    2: bt("2단계 · 브러시 파일 올려 정본 분광 매핑", "Step 2 · Drop brush files for 7-band mapping"),
    3: bt("3단계 · 7밴드 분광 · 종이 결 추천 적용", "Step 3 · Apply 7-band spectral & paper tooth"),
  };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={-1}
      data-studio-quick-migrate-wizard="true"
      data-step={step}
      className={cn(
        "fixed bottom-5 right-5 z-[10050] flex w-[min(32rem,calc(100vw-1.5rem))] max-h-[calc(100vh-2.5rem)] flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel text-fg shadow-2xl focus:outline-none",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-accent">
            <Sparkles size={14} aria-hidden="true" />
            <span className="tabular-nums">
              {bt(`30초 정착 위자드 · ${step}/3`, `30s Quick Setup · ${step}/3`)}
            </span>
          </div>
          <h2 id={titleId} className="mt-1 text-lg font-semibold leading-snug text-fg [word-break:keep-all]">
            {stepTitles[step]}
          </h2>
          <p id={descId} className="mt-1 text-xs text-fg-2 [word-break:keep-all]">
            {bt(
              "로그인 없이 바로 적용되며 캔버스 작업은 막히지 않습니다.",
              "Applies locally for guests without blocking the canvas.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={bt("30초 정착 위자드 닫기", "Close quick setup wizard")}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-raised text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {step === 1 ? (
          <div className="space-y-4">
            <div
              role="radiogroup"
              aria-label={bt("기존에 사용하던 드로잉 툴 선택", "Choose your previous drawing tool")}
              className="grid grid-cols-2 gap-2.5"
            >
              {toolProfiles.map((profile, index) => {
                const selected = profile.id === selectedToolId;
                return (
                  <button
                    key={profile.id}
                    ref={(node) => {
                      toolButtonRefs.current[index] = node;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    data-migrate-tool={profile.id}
                    onClick={() => selectTool(profile.id)}
                    onKeyDown={(event) => handleToolRadioKeyDown(event, index)}
                    className={cn(
                      "flex min-h-11 flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none [word-break:keep-all]",
                      selected
                        ? "border-accent bg-accent-soft text-fg"
                        : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised",
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-fg [word-break:keep-all]">
                        {bt(profile.nameKo, profile.nameEn)}
                      </span>
                      <span className="rounded-md bg-raised px-1.5 py-0.5 text-[11px] font-semibold tracking-wider text-fg-2">
                        {profile.badgeText}
                      </span>
                    </div>
                    <span className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                      {bt(profile.taglineKo, profile.taglineEn)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-line pt-3.5">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span className="font-medium text-fg [word-break:keep-all]">
                  {bt("바로 바뀌는 핵심 단축키", "Core mapped shortcuts")}
                </span>
                <span className="tabular-nums text-good">
                  {bt(
                    `${shortcutPlan.changedEntries.length}개 자동 적용 · 충돌 ${shortcutPlan.conflictChords.length}건`,
                    `${shortcutPlan.changedEntries.length} mapped · ${shortcutPlan.conflictChords.length} conflicts`,
                  )}
                </span>
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {activeProfile.highlights.map((item) => (
                  <div key={item.actionId} className="flex items-center justify-between gap-2 border-b border-line/60 pb-1.5">
                    <dt className="text-fg-2 [word-break:keep-all]">{bt(item.labelKo, item.labelEn)}</dt>
                    <dd className="rounded bg-raised px-2 py-0.5 font-mono text-xs font-semibold text-fg">
                      {item.keys}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              data-brush-dropzone="true"
              data-drag-active={dragActive ? "true" : "false"}
              className={cn(
                "rounded-xl border border-dashed px-4 py-4 transition-colors motion-reduce:transition-none",
                dragActive ? "border-accent bg-accent-soft" : "border-line-strong bg-card",
              )}
            >
              <div className="flex items-start gap-3">
                <Upload size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg [word-break:keep-all]">
                    {bt(
                      ".abr · .sut · .kpp 브러시를 끌어다 놓으세요",
                      "Drop .abr, .sut, or .kpp brush files here",
                    )}
                  </p>
                  <p className="mt-1 text-xs text-fg-2 [word-break:keep-all]">
                    {bt(
                      "서버 전송 없이 브라우저 안에서 헤더·파일명만 읽어 7밴드 정본 브러시로 대응합니다.",
                      "Inspects header bytes and filenames locally with zero uploads.",
                    )}
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".abr,.sut,.kpp,.brush,.brushset"
                aria-label={bt("브러시 파일 선택", "Select brush files")}
                onChange={handleFileInputChange}
                className="sr-only"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-raised px-3.5 text-xs font-medium text-fg transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none [word-break:keep-all]"
                >
                  <FileUp size={15} aria-hidden="true" />
                  <span>{bt("브러시 파일 고르기", "Choose brush files")}</span>
                </button>
                <button
                  type="button"
                  onClick={handleLoadSamplePack}
                  data-load-sample-brushes="true"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3.5 text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none [word-break:keep-all]"
                >
                  <span>
                    {bt(`${activeProfile.badgeText} 예시 브러시 미리보기`, `Preview ${activeProfile.badgeText} sample pack`)}
                  </span>
                </button>
              </div>
            </div>

            <div className="border-t border-line pt-3">
              {brushRecommendations.length > 0 ? (
                <ul className="divide-y divide-line" aria-label={bt("추천 정본 브러시 매핑 목록", "Recommended canonical brush mappings")}>
                  {brushRecommendations.map((rec) => (
                    <li key={rec.fileName} className="py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-fg-2">{rec.fileName}</span>
                        <span className="shrink-0 text-[11px] font-medium tabular-nums text-good">
                          {Math.round(rec.confidence01 * 100)}%
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <strong className="text-sm font-semibold text-fg [word-break:keep-all]">
                          {bt(rec.primary.nameKo, rec.primary.nameEn)}
                        </strong>
                        <span className="text-[11px] text-cool [word-break:keep-all]">
                          {rec.headerInspection.formatVersionLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-fg-2 [word-break:keep-all]">
                        {bt(rec.primary.spectralNoteKo, rec.primary.spectralNoteEn)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                  {bt(
                    `파일을 올리지 않아도 바로 넘어갈 수 있습니다. 기본으로 ${activeProfile.nameKo} 작가용 7밴드 분광 브러시 세트가 준비됩니다.`,
                    `You can continue without uploading. A 7-band spectral starter set for ${activeProfile.nameEn} is ready by default.`,
                  )}
                </p>
              )}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-fg [word-break:keep-all]">
                  {bt("3-주파수 절차적 종이 결 추천", "Recommended 3-frequency paper tooth")}
                </span>
                <span className="tabular-nums text-good">
                  {bt(`60fps 가드 ≤ ${TEXTURE_MAX_FRAME_BUDGET_MS}ms`, `60fps guard ≤ ${TEXTURE_MAX_FRAME_BUDGET_MS}ms`)}
                </span>
              </div>
              <div
                role="radiogroup"
                aria-label={bt("종이 질감 프리셋 선택", "Choose paper tooth preset")}
                className="mt-2.5 flex flex-wrap gap-2"
              >
                {PAPER_PRESET_ORDER.map((paperId, index) => {
                  const spec = PAPER_TOOTH_PRESETS[paperId];
                  const active = selectedPaperId === paperId;
                  return (
                    <button
                      key={paperId}
                      ref={(node) => {
                        paperButtonRefs.current[index] = node;
                      }}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      tabIndex={active ? 0 : -1}
                      data-paper-preset={paperId}
                      onClick={() => setSelectedPaperId(paperId)}
                      onKeyDown={(event) => handlePaperRadioKeyDown(event, index)}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none [word-break:keep-all]",
                        active
                          ? "border-accent bg-accent-soft text-fg"
                          : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                      )}
                    >
                      {spec.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line pt-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg [word-break:keep-all]">
                  {bt("종이 마찰음 합성기 (옵트인)", "Procedural brush friction audio (Opt-in)")}
                </p>
                <p className="mt-0.5 text-xs text-fg-2 [word-break:keep-all]">
                  {bt(
                    "기본 꺼짐 · 켰을 때도 청력 보호 볼륨 상한(0.25)을 넘지 않습니다.",
                    "Off by default · hearing-safe output ceiling (0.25) always enforced.",
                  )}
                </p>
              </div>
              <Switch
                checked={frictionAudioOptIn}
                onCheckedChange={setFrictionAudioOptIn}
                aria-label={bt("종이 마찰음 옵트인 전환", "Toggle opt-in brush friction audio")}
              />
            </div>

            <div className="border-t border-line pt-3">
              <div className="flex items-center justify-between text-xs text-fg-2">
                <span className="font-medium text-fg [word-break:keep-all]">
                  {bt("활성 WebGPU 7대 질감 파이프라인", "Active WebGPU 7-pipeline status")}
                </span>
                <span className="tabular-nums text-fg-2">
                  {bt(`${effectiveTexturePlan.activePipelineCount}/7 활성`, `${effectiveTexturePlan.activePipelineCount}/7 active`)}
                </span>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs">
                {pipelineBadges.map((badge) => (
                  <li key={badge.id} className="flex items-center justify-between gap-2">
                    <span className={cn("[word-break:keep-all]", badge.active ? "text-fg" : "text-fg-3")}>
                      {bt(badge.labelKo, badge.labelEn)}
                    </span>
                    <span className="truncate text-[11px] text-fg-2 [word-break:keep-all]">
                      {bt(badge.detailKo, badge.detailEn)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-line px-5 py-3.5">
        {step === 1 ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4 text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none [word-break:keep-all]"
          >
            {bt("나중에 설정", "Skip for now")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((current) => (current === 3 ? 2 : 1))}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-4 text-xs font-medium text-fg transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none [word-break:keep-all]"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>{bt("이전", "Back")}</span>
          </button>
        )}

        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep((current) => (current === 1 ? 2 : 3))}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none [word-break:keep-all]"
          >
            <span>
              {step === 1
                ? bt("다음 · 브러시 매핑", "Next · Brush mapping")
                : bt("다음 · 7밴드 질감 확인", "Next · Review 7-band texture")}
            </span>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleApply}
            data-quick-migrate-apply="true"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none [word-break:keep-all]"
          >
            <Check size={15} aria-hidden="true" />
            <span>{bt("30초 설정 바로 적용", "Apply 30s setup")}</span>
          </button>
        )}
      </footer>
    </div>,
    document.body,
  );
}
