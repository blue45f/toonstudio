/**
 * 팀 화풍 · 커스텀 브러시 · WGSL 셰이더 팩 교환 패널 (`StudioStyleShaderPackExchangePanel`).
 *
 * - props 없이 단독 렌더 가능하며 Calm Atelier 시맨틱 토큰만 사용한다.
 * - 원시 색상 리터럴, 전속성 전환, 장식 반짝임 아이콘, 브라우저 Web Storage를 일절 사용하지 않는다.
 * - 3종 스튜디오 팀 팩 템플릿 전환, 실시간 FIPS 180-4 SHA-256 봉인 및 1비트 변조 시뮬레이션 검증,
 *   팩 간 DNA/브러시/셰이더/권리 BOM 델타 비교, 충돌 안전 불러오기 전략, `.tspack.json` 미리보기·복사·내보내기를 제공한다.
 */

import {
  AlertTriangle,
  Brush,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  FileJson2,
  GitCompareArrows,
  Layers,
  PackageCheck,
  RotateCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_STUDIO_EXISTING_PRESETS,
  TEAM_STYLE_PACK_TEMPLATE_META,
  TeamStylePackRegistry,
  diffTeamStylePacks,
  getBuiltInTeamStylePacks,
  parseTeamStylePackJson,
  planTeamStylePackImport,
  serializeTeamStylePackJson,
  simulateTeamStylePackTamper,
  verifyTeamStylePackIntegrity,
} from "./style-shader-pack-engine";
import {
  type ExistingStudioPresetIndex,
  type ImportConflictStrategy,
  type PackLicenseTier,
  type PackSectionKey,
  type SignedTeamStylePack,
  type StudioTargetUsageMode,
  type TamperSimulationTarget,
  type TeamStylePackImportPlan,
  type TeamStylePackTemplateId,
} from "./types";

export interface StudioStyleShaderPackExchangePanelProps {
  readonly locale?: "ko" | "en";
  readonly initialTemplateId?: TeamStylePackTemplateId;
  readonly existingPresets?: ExistingStudioPresetIndex;
  readonly className?: string;
  readonly onApplyImportPlan?: (pack: SignedTeamStylePack, plan: TeamStylePackImportPlan) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const CHIP_BASE = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const CHIP_ACTIVE = "border-accent bg-accent text-on-accent";
const CHIP_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const BTN_PRIMARY = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent [word-break:keep-all] transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_SECONDARY = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-card px-3.5 py-2 text-xs font-semibold text-fg [word-break:keep-all] transition-colors motion-reduce:transition-none hover:border-accent hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

const LICENSE_LABELS: Readonly<Record<PackLicenseTier, readonly [string, string]>> = Object.freeze({
  "commercial-team": ["상업 팀 라이선스", "Commercial Team"],
  "commercial-enterprise": ["상업 엔터프라이즈", "Commercial Enterprise"],
  "editorial-noncommercial": ["비상업 에디토리얼", "Editorial Non-Commercial"],
  "internal-draft-only": ["내부 검수 전용", "Internal Draft Only"],
});

const SECTION_SHORT_LABELS: Readonly<Record<PackSectionKey, readonly [string, string]>> = Object.freeze({
  metadata: ["메타", "Meta"],
  styleDna: ["화풍 DNA", "Style DNA"],
  brushes: ["브러시", "Brushes"],
  shaders: ["WGSL 셰이더", "WGSL Shaders"],
  rightsBom: ["권리 BOM", "Rights BOM"],
});

const TAMPER_TARGETS: readonly { readonly id: TamperSimulationTarget; readonly ko: string; readonly en: string }[] = [
  { id: "palette", ko: "팔레트 1비트 변조", en: "Tamper Palette" },
  { id: "brush", ko: "브러시 1비트 변조", en: "Tamper Brush" },
  { id: "wgsl", ko: "WGSL 1비트 변조", en: "Tamper WGSL" },
  { id: "license", ko: "라이선스 1비트 변조", en: "Tamper License" },
];

const CONFLICT_STRATEGIES: readonly { readonly id: ImportConflictStrategy; readonly ko: string; readonly en: string }[] = [
  { id: "fork-versioned", ko: "버전 분기 (안전)", en: "Fork Versioned" },
  { id: "keep-local", ko: "로컬 유지", en: "Keep Local" },
  { id: "overwrite", ko: "덮어쓰기", en: "Overwrite" },
];

const USAGE_MODES: readonly { readonly id: StudioTargetUsageMode; readonly ko: string; readonly en: string }[] = [
  { id: "commercial-publication", ko: "상업 연재", en: "Commercial" },
  { id: "editorial-noncommercial", ko: "비상업·편집", en: "Editorial" },
  { id: "internal-review", ko: "내부 검수", en: "Internal" },
];

function formatSignedDelta(value: number, unit: string): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value}${unit}`;
}

function defaultCompareTemplate(activeId: TeamStylePackTemplateId): TeamStylePackTemplateId {
  return activeId === "action-noir-ink" ? "romance-fantasy-watercolor-cel" : "action-noir-ink";
}

/**
 * 서명된 팀 화풍·브러시·WGSL 셰이더 팩(`.tspack.json`)을 검증·비교·충돌 안전 불러오기·내보내기하는 스튜디오 패널.
 */
export function StudioStyleShaderPackExchangePanel({
  locale,
  initialTemplateId = "romance-fantasy-watercolor-cel",
  existingPresets = DEFAULT_STUDIO_EXISTING_PRESETS,
  className,
  onApplyImportPlan,
}: StudioStyleShaderPackExchangePanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const builtInPacks = useMemo(() => getBuiltInTeamStylePacks(), []);
  const [selectedTemplateId, setSelectedTemplateId] = useState<TeamStylePackTemplateId>(initialTemplateId);
  const [compareTemplateId, setCompareTemplateId] = useState<TeamStylePackTemplateId>(() =>
    defaultCompareTemplate(initialTemplateId),
  );
  const [tamperTarget, setTamperTarget] = useState<TamperSimulationTarget | null>(null);
  const [customPackOverride, setCustomPackOverride] = useState<SignedTeamStylePack | null>(null);
  const [conflictStrategy, setConflictStrategy] = useState<ImportConflictStrategy>("fork-versioned");
  const [usageMode, setUsageMode] = useState<StudioTargetUsageMode>("commercial-publication");
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);
  const [ioNotice, setIoNotice] = useState<{ readonly kind: "ok" | "error"; readonly text: string } | null>(null);
  const [appliedPackCount, setAppliedPackCount] = useState(0);
  const [registryInstance] = useState(() => new TeamStylePackRegistry());

  const basePack = customPackOverride ?? builtInPacks[selectedTemplateId];
  const activePack = useMemo(
    () => (tamperTarget ? simulateTeamStylePackTamper(basePack, tamperTarget) : basePack),
    [basePack, tamperTarget],
  );
  const comparePack = builtInPacks[compareTemplateId];

  const integrity = useMemo(() => verifyTeamStylePackIntegrity(activePack), [activePack]);
  const packDiff = useMemo(() => diffTeamStylePacks(activePack, comparePack), [activePack, comparePack]);
  const importPlan = useMemo(
    () =>
      planTeamStylePackImport(activePack, {
        existingPresets,
        conflictStrategy,
        targetUsageMode: usageMode,
      }),
    [activePack, conflictStrategy, existingPresets, usageMode],
  );
  const serialized = useMemo(() => serializeTeamStylePackJson(activePack), [activePack]);
  const displayedJson = jsonDraft ?? serialized.json;

  const handleSelectTemplate = (templateId: TeamStylePackTemplateId): void => {
    setSelectedTemplateId(templateId);
    setCustomPackOverride(null);
    setTamperTarget(null);
    setJsonDraft(null);
    setIoNotice(null);
    if (compareTemplateId === templateId) {
      setCompareTemplateId(defaultCompareTemplate(templateId));
    }
  };

  const handleSimulateTamper = (target: TamperSimulationTarget): void => {
    setTamperTarget(target);
    setJsonDraft(null);
    setIoNotice(null);
  };

  const handleRestoreCleanSeal = (): void => {
    setTamperTarget(null);
    setJsonDraft(null);
    setIoNotice({
      kind: "ok",
      text: pick("원본 SHA-256 서명 상태로 복원했습니다.", "Restored original SHA-256 signed pack."),
    });
  };

  const handleCopyJson = (): void => {
    const payload = serialized.json;
    setJsonDraft(payload);
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(payload).catch(() => undefined);
    }
    setIoNotice({
      kind: "ok",
      text: pick(
        `${serialized.fileName} (${serialized.byteLength.toLocaleString()}B) JSON을 복사했습니다.`,
        `Copied ${serialized.fileName} (${serialized.byteLength.toLocaleString()}B) JSON.`,
      ),
    });
  };

  const handleExportPack = (): void => {
    setJsonDraft(serialized.json);
    if (
      typeof document !== "undefined" &&
      typeof window !== "undefined" &&
      !/jsdom/iu.test(window.navigator?.userAgent ?? "") &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function" &&
      typeof Blob !== "undefined"
    ) {
      try {
        const blob = new Blob([serialized.json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = serialized.fileName;
        link.click();
        if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
      } catch {
        // 헤드리스 환경에서는 미리보기 버퍼로 안전하게 폴백한다.
      }
    }
    setIoNotice({
      kind: "ok",
      text: pick(
        `${serialized.fileName} 내보내기 준비 완료 · 봉인 ${activePack.manifest.packSealSha256.slice(0, 12)}…`,
        `Ready to export ${serialized.fileName} · seal ${activePack.manifest.packSealSha256.slice(0, 12)}…`,
      ),
    });
  };

  const handleVerifyJsonInput = (): void => {
    const parsed = parseTeamStylePackJson(displayedJson);
    if (!parsed.ok) {
      setIoNotice({ kind: "error", text: isKo ? parsed.messageKo : parsed.messageEn });
      return;
    }
    setCustomPackOverride(parsed.pack);
    setTamperTarget(null);
    setIoNotice({
      kind: parsed.integrity.valid ? "ok" : "error",
      text: isKo ? parsed.integrity.summaryKo : parsed.integrity.summaryEn,
    });
  };

  const handleApplyImport = (): void => {
    if (!importPlan.canApply) {
      setIoNotice({
        kind: "error",
        text: isKo
          ? importPlan.blockingIssues[0]?.messageKo ?? "불러오기 조건을 충족하지 못했습니다."
          : importPlan.blockingIssues[0]?.messageEn ?? "Import preconditions failed.",
      });
      return;
    }
    registryInstance.register(activePack);
    setAppliedPackCount(registryInstance.size);
    onApplyImportPlan?.(activePack, importPlan);
    setIoNotice({
      kind: "ok",
      text: pick(
        `"${activePack.metadata.nameKo}" 불러오기 적용 완료 (신규 ${importPlan.counts.installNew} · 분기 ${importPlan.counts.forkVersioned} · 유지 ${importPlan.counts.keepLocal} · 덮어쓰기 ${importPlan.counts.overwrite}).`,
        `Applied "${activePack.metadata.nameEn}" import (new ${importPlan.counts.installNew} · fork ${importPlan.counts.forkVersioned} · keep ${importPlan.counts.keepLocal} · overwrite ${importPlan.counts.overwrite}).`,
      ),
    });
  };

  const licenseLabelPair = LICENSE_LABELS[activePack.rightsBom.licenseTier];

  return (
    <section
      aria-label={pick("팀 화풍 · WGSL 셰이더 팩 교환 허브", "Team Style & WGSL Shader Pack Exchange")}
      data-style-shader-pack-exchange="true"
      data-pack-id={activePack.metadata.packId}
      data-pack-seal-sha256={activePack.manifest.packSealSha256}
      data-pack-integrity-valid={String(integrity.valid)}
      className={`grid gap-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      {/* 헤더 및 서명 상태 요약 */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0 space-y-1">
          <h2 className="flex items-center gap-2 text-base font-bold text-fg">
            <PackageCheck size={18} className="shrink-0 text-accent" aria-hidden="true" />
            <span>{pick("팀 화풍 · WGSL 셰이더 팩 교환 (.tspack.json)", "Team Style & WGSL Shader Pack Exchange (.tspack.json)")}</span>
          </h2>
          <p className="text-xs text-fg-2">
            {pick(
              "화풍 DNA·커스텀 브러시·검증된 WGSL 셰이더·권리 BOM을 FIPS 180-4 SHA-256으로 봉인해 팀 간 충돌 없이 주고받습니다.",
              "Seal Style DNA, custom brushes, validated WGSL shaders, and Rights BOM with FIPS 180-4 SHA-256 for conflict-safe team exchange.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tabular-nums">
          <span
            data-testid="pack-seal-badge"
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 ${
              integrity.valid ? "bg-good-soft text-good" : "bg-bad-soft text-bad"
            }`}
          >
            {integrity.valid ? (
              <ShieldCheck size={14} aria-hidden="true" />
            ) : (
              <ShieldAlert size={14} aria-hidden="true" />
            )}
            <span>{integrity.valid ? pick("SHA-256 봉인 유효", "SHA-256 Sealed") : pick("변조 감지됨", "Tamper Detected")}</span>
          </span>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-accent">
            {isKo ? licenseLabelPair[0] : licenseLabelPair[1]}
          </span>
          {appliedPackCount > 0 ? (
            <span data-testid="registered-pack-count" className="rounded-full border border-line bg-card px-2.5 py-1 text-fg-2">
              {pick(`세션 등록 ${appliedPackCount}팩`, `${appliedPackCount} Registered`)}
            </span>
          ) : null}
        </div>
      </header>

      {/* 1. 팀 팩 템플릿 전환기 */}
      <div className="grid gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-fg-2">{pick("스튜디오 팀 팩 템플릿", "Studio Team Pack Templates")}</h3>
          <span className="text-xs text-fg-3 tabular-nums">
            {pick("외부 네트워크 0바이트 · 로컬 FIPS 180-4 SHA-256", "0 External Bytes · Local FIPS 180-4 SHA-256")}
          </span>
        </div>
        <div role="group" aria-label={pick("팀 팩 템플릿 선택", "Select team pack template")} className="grid gap-2 sm:grid-cols-3">
          {TEAM_STYLE_PACK_TEMPLATE_META.map((meta) => {
            const isActive = !customPackOverride && selectedTemplateId === meta.id;
            return (
              <button
                key={meta.id}
                type="button"
                aria-pressed={isActive}
                data-testid={`pack-template-${meta.id}`}
                onClick={() => handleSelectTemplate(meta.id)}
                className={`${CHIP_BASE} flex-col items-start text-left ${isActive ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                <span className="text-xs font-bold">{isKo ? meta.nameKo : meta.nameEn}</span>
                <span className={`text-xs ${isActive ? "text-on-accent" : "text-fg-3"}`}>
                  {isKo ? meta.genreKo : meta.genreEn} · {meta.teamHandle}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 활성 팩 4대 구성 요소 요약 */}
      <div className="grid gap-3 md:grid-cols-2">
        <article className="grid gap-2 rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Layers size={15} className="text-accent" aria-hidden="true" />
              <span>{pick("화풍 DNA · OKLCH 팔레트", "Style DNA & OKLCH Palette")}</span>
            </h3>
            <span className="text-xs text-fg-3 tabular-nums">
              v{activePack.styleDna.version} · {activePack.styleDna.sampleCount}컷
            </span>
          </div>
          <div className="flex items-center gap-1.5" aria-label={pick("OKLCH 마스터 팔레트", "OKLCH master palette")}>
            {activePack.styleDna.dominantPalette.map((swatch) => (
              <div
                key={`${swatch.role}-${swatch.H}`}
                title={`${swatch.role}: ${swatch.cssOklch}`}
                className="flex h-7 flex-1 items-end rounded-md border border-line p-1"
                style={{ backgroundColor: swatch.cssOklch }}
              />
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs tabular-nums">
            <div className="rounded-lg bg-canvas px-2.5 py-1.5">
              <dt className="text-fg-3">{pick("평균 선화 굵기", "Line Mean")}</dt>
              <dd className="font-semibold text-fg">{activePack.styleDna.linework.meanPx}px</dd>
            </div>
            <div className="rounded-lg bg-canvas px-2.5 py-1.5">
              <dt className="text-fg-3">{pick("그림자 색온도", "Shadow CCT")}</dt>
              <dd className="font-semibold text-fg">{activePack.styleDna.shadowTemperature.estimatedKelvin}K</dd>
            </div>
            <div className="rounded-lg bg-canvas px-2.5 py-1.5">
              <dt className="text-fg-3">{pick("명암 단계", "Tone Steps")}</dt>
              <dd className="font-semibold text-fg">{activePack.styleDna.contrast.detectedToneSteps}{pick("단계", " steps")}</dd>
            </div>
            <div className="rounded-lg bg-canvas px-2.5 py-1.5">
              <dt className="text-fg-3">{pick("스크린톤 밀도", "Screentone")}</dt>
              <dd className="font-semibold text-fg">
                {Math.round(activePack.styleDna.screentone.coverageRatio * 100)}% ({activePack.styleDna.screentone.estimatedLpiFrequency} LPI)
              </dd>
            </div>
          </dl>
        </article>

        <article className="grid gap-2 rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Brush size={15} className="text-accent" aria-hidden="true" />
              <span>{pick("브러시 번들 · WGSL 셰이더 · 권리 BOM", "Brushes · WGSL Shaders · Rights BOM")}</span>
            </h3>
            <span className="text-xs text-fg-3 tabular-nums">
              v{activePack.metadata.version}
            </span>
          </div>
          <ul className="grid gap-1.5 text-xs">
            {activePack.brushes.map((b) => (
              <li key={b.recipe.id} className="flex items-center justify-between gap-2 rounded-lg bg-canvas px-2.5 py-1.5">
                <span className="font-medium text-fg">
                  {isKo ? b.recipe.nameKo : b.recipe.nameEn}
                  <span className="ml-1.5 text-fg-3">({b.recipe.tipId})</span>
                </span>
                <span className="font-mono text-fg-3 tabular-nums">KM {Math.round(b.recipe.kmMixStrength01 * 100)}%</span>
              </li>
            ))}
            {activePack.shaders.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-canvas px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 font-medium text-fg">
                  <Cpu size={13} className="shrink-0 text-cool" aria-hidden="true" />
                  <span>{isKo ? s.nameKo : s.nameEn}</span>
                </span>
                <span className="font-mono text-fg-3 tabular-nums">@{s.stage} · {s.wgslSha256.slice(0, 8)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs tabular-nums">
            <span className="flex items-center gap-1.5 text-fg-2">
              <Scale size={13} className="text-accent" aria-hidden="true" />
              <span>{activePack.rightsBom.ownerTeamName}</span>
            </span>
            <span className={integrity.rightsTotalBps === 10_000 ? "font-semibold text-good" : "font-semibold text-bad"}>
              {pick("로열티 합계", "Royalty")} {integrity.rightsTotalBps.toLocaleString()} bps
            </span>
          </div>
        </article>
      </div>

      {/* 3. 실시간 SHA-256 매니페스트 봉인 & 1비트 변조 시뮬레이터 */}
      <section aria-label={pick("SHA-256 무결성 검증 및 변조 시뮬레이션", "SHA-256 Integrity & Tamper Simulation")} className="grid gap-2.5 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <ShieldCheck size={15} className="text-accent" aria-hidden="true" />
            <span>{pick("SHA-256 매니페스트 봉인 · 1비트 변조 탐지", "SHA-256 Manifest Seal & 1-Bit Tamper Verifier")}</span>
          </h3>
          <span className="font-mono text-xs text-fg-3 tabular-nums" data-testid="pack-seal-hex">
            seal: {activePack.manifest.packSealSha256.slice(0, 16)}…
          </span>
        </div>

        <div
          role={integrity.valid ? "status" : "alert"}
          data-testid="integrity-status-banner"
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
            integrity.valid
              ? "border-line bg-good-soft text-good"
              : "border-bad bg-bad-soft text-bad"
          }`}
        >
          <span className="flex items-center gap-1.5">
            {integrity.valid ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
            <span>{isKo ? integrity.summaryKo : integrity.summaryEn}</span>
          </span>
          <span className="font-mono tabular-nums">
            {integrity.mismatchedSections.length}/5 {pick("불일치", "mismatched")}
          </span>
        </div>

        <div className="grid gap-1.5 sm:grid-cols-5">
          {integrity.sectionDiagnostics.map((diag) => {
            const labelPair = SECTION_SHORT_LABELS[diag.section];
            return (
              <div
                key={diag.section}
                data-testid={`section-diag-${diag.section}`}
                data-section-matched={String(diag.matched)}
                className={`rounded-lg border px-2.5 py-2 text-xs tabular-nums ${
                  diag.matched ? "border-line bg-canvas text-fg-2" : "border-bad bg-bad-soft text-bad"
                }`}
              >
                <div className="font-semibold">{isKo ? labelPair[0] : labelPair[1]}</div>
                <div className="mt-0.5 font-mono">{diag.actualSha256.slice(0, 10)}…</div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {TAMPER_TARGETS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tamperTarget === item.id}
              data-testid={`tamper-btn-${item.id}`}
              onClick={() => handleSimulateTamper(item.id)}
              className={`${CHIP_BASE} ${tamperTarget === item.id ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              {isKo ? item.ko : item.en}
            </button>
          ))}
          <button
            type="button"
            data-testid="tamper-reset-btn"
            onClick={handleRestoreCleanSeal}
            className={BTN_SECONDARY}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{pick("원본 봉인 복원", "Restore Seal")}</span>
          </button>
        </div>
      </section>

      {/* 4. 팩 델타 비교 뷰어 & 충돌 안전 불러오기 플래너 */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* 팩 델타 뷰어 */}
        <section aria-label={pick("팩 델타 비교 뷰어", "Pack Diff Viewer")} className="grid gap-2.5 rounded-xl border border-line bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <GitCompareArrows size={15} className="text-accent" aria-hidden="true" />
              <span>{pick("팩 델타 비교 (DNA · 브러시 · 셰이더 · BOM)", "Pack Diff (DNA · Brush · Shader · BOM)")}</span>
            </h3>
            <label htmlFor={`${uid}-compare-select`} className="sr-only">
              {pick("비교 대상 팩 선택", "Compare target pack")}
            </label>
            <select
              id={`${uid}-compare-select`}
              data-testid="diff-compare-select"
              value={compareTemplateId}
              onChange={(event) => setCompareTemplateId(event.currentTarget.value as TeamStylePackTemplateId)}
              className={`min-h-11 rounded-lg border border-line-strong bg-canvas px-2.5 text-xs font-medium text-fg ${FOCUS_RING}`}
            >
              {TEAM_STYLE_PACK_TEMPLATE_META.map((meta) => (
                <option key={meta.id} value={meta.id}>
                  {isKo ? meta.nameKo : meta.nameEn}
                </option>
              ))}
            </select>
          </div>
          <p data-testid="pack-diff-summary" className="rounded-lg bg-canvas px-2.5 py-2 text-xs text-fg-2 tabular-nums">
            {isKo ? packDiff.summaryKo : packDiff.summaryEn}
          </p>
          <dl className="grid grid-cols-2 gap-2 text-xs tabular-nums">
            <div className="rounded-lg border border-line bg-canvas px-2.5 py-1.5">
              <dt className="text-fg-3">{pick("선화 굵기 Δ / 그림자 ΔK", "Line Δ / Shadow ΔK")}</dt>
              <dd className="font-semibold text-fg">
                {formatSignedDelta(packDiff.styleDna.lineMeanPxDelta, "px")} / {formatSignedDelta(packDiff.styleDna.shadowKelvinDelta, "K")}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-canvas px-2.5 py-1.5">
              <dt className="text-fg-3">{pick("팔레트 평균 ΔE / 톤 단계", "Palette ΔE / Steps")}</dt>
              <dd className="font-semibold text-fg">
                ΔE {packDiff.styleDna.paletteMeanDeltaE} / {formatSignedDelta(packDiff.styleDna.toneStepsDelta, "")}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-canvas px-2.5 py-1.5">
              <dt className="text-fg-3">{pick("브러시 · 셰이더 변경", "Brush / Shader Delta")}</dt>
              <dd className="font-semibold text-fg">
                B +{packDiff.brushes.addedIds.length}/-{packDiff.brushes.removedIds.length}/~{packDiff.brushes.modified.length} · S +{packDiff.shaders.addedIds.length}/-{packDiff.shaders.removedIds.length}/~{packDiff.shaders.modified.length}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-canvas px-2.5 py-1.5">
              <dt className="text-fg-3">{pick("라이선스 등급 변화", "License Tier Delta")}</dt>
              <dd className="font-semibold text-fg">
                {packDiff.rightsBom.licenseTierChanged
                  ? `${packDiff.rightsBom.baseLicenseTier} → ${packDiff.rightsBom.targetLicenseTier}`
                  : pick("동일 등급", "Unchanged")}
              </dd>
            </div>
          </dl>
        </section>

        {/* 충돌 안전 불러오기 플래너 */}
        <section aria-label={pick("충돌 안전 불러오기 플래너", "Conflict-Safe Import Planner")} className="grid gap-2.5 rounded-xl border border-line bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg">{pick("충돌 안전 불러오기 · 권리 호환성", "Conflict-Safe Import & Rights Gate")}</h3>
            <span data-testid="import-collision-summary" className="text-xs font-semibold text-fg-2 tabular-nums">
              {pick(`충돌 ${importPlan.counts.collisions}건 / 전체 ${importPlan.counts.total}건`, `${importPlan.counts.collisions} collisions / ${importPlan.counts.total} assets`)}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("충돌 해결 전략", "Conflict resolution strategy")}>
            {CONFLICT_STRATEGIES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={conflictStrategy === item.id}
                data-testid={`strategy-btn-${item.id}`}
                onClick={() => setConflictStrategy(item.id)}
                className={`${CHIP_BASE} ${conflictStrategy === item.id ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                {isKo ? item.ko : item.en}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("사용 목적 라이선스 기준", "Target usage license mode")}>
            {USAGE_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={usageMode === item.id}
                data-testid={`usage-btn-${item.id}`}
                onClick={() => setUsageMode(item.id)}
                className={`${CHIP_BASE} ${usageMode === item.id ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                {isKo ? item.ko : item.en}
              </button>
            ))}
          </div>

          <div
            data-testid="import-rights-status"
            className={`rounded-lg border px-2.5 py-2 text-xs font-medium ${
              importPlan.canApply ? "border-line bg-good-soft text-good" : "border-bad bg-bad-soft text-bad"
            }`}
          >
            {importPlan.canApply
              ? isKo
                ? importPlan.rightsCompatibility.summaryKo
                : importPlan.rightsCompatibility.summaryEn
              : isKo
                ? importPlan.blockingIssues[0]?.messageKo ?? "불러오기가 차단되었습니다."
                : importPlan.blockingIssues[0]?.messageEn ?? "Import blocked."}
          </div>

          <ul className="grid gap-1 text-xs tabular-nums" data-testid="import-plan-list">
            {importPlan.items.map((item) => (
              <li
                key={`${item.domain}-${item.sourceId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas px-2.5 py-1.5"
              >
                <span className="font-medium text-fg">
                  {isKo ? item.labelKo : item.labelEn}
                  {item.collided ? (
                    <span className="ml-1.5 rounded bg-warning-soft px-1.5 py-0.5 text-warn">
                      {pick("충돌", "Collision")}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-fg-3">
                  {item.action} → {item.resolvedId}
                </span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            data-testid="apply-import-btn"
            disabled={!importPlan.canApply}
            onClick={handleApplyImport}
            className={BTN_PRIMARY}
          >
            <PackageCheck size={15} aria-hidden="true" />
            <span>{pick("충돌 안전 불러오기 적용", "Apply Conflict-Safe Import")}</span>
          </button>
        </section>
      </div>

      {/* 5. .tspack.json 미리보기 · 복사 · 내보내기 · 검증 불러오기 */}
      <section aria-label={pick(".tspack.json 직렬화 및 내보내기", ".tspack.json Preview & Export")} className="grid gap-2.5 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${uid}-json-preview`} className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <FileJson2 size={15} className="text-accent" aria-hidden="true" />
            <span>{serialized.fileName}</span>
            <span className="font-normal text-fg-3 tabular-nums">({serialized.byteLength.toLocaleString()}B)</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="copy-json-btn" onClick={handleCopyJson} className={BTN_SECONDARY}>
              <Copy size={14} aria-hidden="true" />
              <span>{pick("JSON 복사", "Copy JSON")}</span>
            </button>
            <button type="button" data-testid="export-pack-btn" onClick={handleExportPack} className={BTN_PRIMARY}>
              <Download size={14} aria-hidden="true" />
              <span>{pick(".tspack.json 내보내기", "Export .tspack.json")}</span>
            </button>
            <button type="button" data-testid="verify-json-btn" onClick={handleVerifyJsonInput} className={BTN_SECONDARY}>
              <ShieldCheck size={14} aria-hidden="true" />
              <span>{pick("JSON 검증 적용", "Verify JSON")}</span>
            </button>
          </div>
        </div>

        <textarea
          id={`${uid}-json-preview`}
          data-testid="tspack-json-textarea"
          value={displayedJson}
          onChange={(event) => setJsonDraft(event.currentTarget.value)}
          rows={7}
          spellCheck={false}
          aria-label={pick(".tspack.json 페이로드 미리보기", ".tspack.json payload preview")}
          className={`w-full rounded-lg border border-line bg-canvas p-2.5 font-mono text-xs text-fg ${FOCUS_RING}`}
        />

        {ioNotice ? (
          <div
            role={ioNotice.kind === "ok" ? "status" : "alert"}
            data-testid="pack-io-notice"
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              ioNotice.kind === "ok" ? "border-line bg-good-soft text-good" : "border-bad bg-bad-soft text-bad"
            }`}
          >
            {ioNotice.text}
          </div>
        ) : null}
      </section>
    </section>
  );
}
