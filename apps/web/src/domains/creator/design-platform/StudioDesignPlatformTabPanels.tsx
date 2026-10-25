/**
 * StudioDesignPlatformTabPanels.tsx — 브랜드 셔플·가드레일 탭(Tab 3) 및
 * 벌크 생성·굿즈 목업·프리플라이트 탭(Tab 4) 패널 컴포넌트.
 */

import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Package,
  Palette,
  Plus,
  RefreshCw,
  ShieldCheck,
  Table,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";

import {
  DESIGN_PLATFORM_GOODS_MOCKUPS,
  DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS,
  type BrandGuardrailAuditResult,
  type BulkEpisodeGenerationResult,
  type BulkEpisodeRow,
  type CollaboratorRole,
  type DesignPlatformStyleShufflePack,
  type DesignPreflightAuditReport,
  type GoodsMockupComputedSpec,
  type GoodsMockupPresetId,
  type StyleShufflePackId,
  type TeamPermissionFlag,
} from "./design-platform-brand-bulk-engine";

export interface BrandShuffleTabPanelProps {
  readonly currentStylePack: DesignPlatformStyleShufflePack;
  readonly contrastRatio: number;
  readonly onShuffleNextStylePack: () => void;
  readonly onSelectStylePackId: (id: StyleShufflePackId) => void;
  readonly onApplyStylePackToSeriesKit?: (pack: DesignPlatformStyleShufflePack) => void;
  readonly permissionFlag: TeamPermissionFlag;
  readonly onChangePermissionFlag: (flag: TeamPermissionFlag) => void;
  readonly collaboratorRole: CollaboratorRole;
  readonly onChangeCollaboratorRole: (role: CollaboratorRole) => void;
  readonly titleLogoMoved: boolean;
  readonly onToggleTitleLogoMoved: () => void;
  readonly proposedColorHex: string;
  readonly onChangeProposedColorHex: (hex: string) => void;
  readonly guardrailEval: BrandGuardrailAuditResult;
}

export function StudioDesignPlatformBrandTabPanel({
  currentStylePack,
  contrastRatio,
  onShuffleNextStylePack,
  onSelectStylePackId,
  onApplyStylePackToSeriesKit,
  permissionFlag,
  onChangePermissionFlag,
  collaboratorRole,
  onChangeCollaboratorRole,
  titleLogoMoved,
  onToggleTitleLogoMoved,
  proposedColorHex,
  onChangeProposedColorHex,
  guardrailEval,
}: BrandShuffleTabPanelProps) {
  const wcagPassAa = contrastRatio >= 4.5;
  const wcagPassAaa = contrastRatio >= 7;

  return (
    <div
      role="tabpanel"
      id="design-platform-panel-brand-shuffle"
      aria-labelledby="design-platform-tab-brand-shuffle"
      className="mt-4 grid gap-4 lg:grid-cols-2"
    >
      {/* 좌측: 미리캔버스/캔바 원클릭 스타일·폰트 페어링 셔플 */}
      <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
            <Palette size={15} className="text-accent" aria-hidden="true" />
            미리캔버스·캔바 원클릭 스타일·폰트 페어링 셔플
          </h3>
          <button
            type="button"
            onClick={onShuffleNextStylePack}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-bold text-on-accent transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <RefreshCw size={13} aria-hidden="true" />
            스타일 원클릭 셔플
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="장르 스타일 팩 선택">
          {DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS.map((pack) => {
            const selected = pack.id === currentStylePack.id;
            return (
              <button
                key={pack.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectStylePackId(pack.id)}
                className={cn(
                  "min-h-8 rounded-lg border px-2.5 text-xs font-bold transition-colors",
                  selected
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:text-fg",
                )}
              >
                {pack.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black text-fg">
                {currentStylePack.label} ({currentStylePack.moodTag})
              </p>
              <p className="text-[0.7rem] text-fg-3">
                타이틀: {currentStylePack.typography.displayFont} · 대사:{" "}
                {currentStylePack.typography.bodyFont}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold",
                wcagPassAa
                  ? "border-good/40 bg-good/10 text-fg"
                  : "border-warning/40 bg-warning/10 text-fg",
              )}
            >
              {wcagPassAa ? (
                <CheckCircle2 size={13} className="text-good" aria-hidden="true" />
              ) : (
                <AlertTriangle size={13} className="text-warning" aria-hidden="true" />
              )}
              WCAG 대비 {contrastRatio}:1 ({wcagPassAaa ? "AAA 통과" : wcagPassAa ? "AA 통과" : "점검 필요"})
            </span>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              { label: "배경", hex: currentStylePack.palette.canvasBg },
              { label: "서피스", hex: currentStylePack.palette.surfaceBg },
              { label: "프라이머리", hex: currentStylePack.palette.primaryText },
              { label: "강조", hex: currentStylePack.palette.accentPrimary },
            ].map((swatch) => (
              <div key={swatch.label} className="rounded-lg border border-line bg-panel p-2 text-center">
                <div
                  className="mx-auto h-7 w-full rounded border border-line/60"
                  style={{ backgroundColor: swatch.hex }}
                  aria-hidden="true"
                />
                <p className="mt-1 text-[0.65rem] font-bold text-fg">{swatch.label}</p>
                <p className="font-mono text-[0.62rem] text-fg-3">{swatch.hex}</p>
              </div>
            ))}
          </div>

          {onApplyStylePackToSeriesKit ? (
            <button
              type="button"
              onClick={() => onApplyStylePackToSeriesKit(currentStylePack)}
              className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-accent bg-accent-soft/40 px-3 text-xs font-black text-accent transition-colors hover:bg-accent-soft"
            >
              현재 Series Kit 색상·글자 스타일에 즉시 반영
            </button>
          ) : null}
        </div>
      </div>

      {/* 우측: 망고보드(777/774/770) & 어도비 익스프레스 브랜드 잠금 가드레일 */}
      <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
          <Lock size={15} className="text-accent" aria-hidden="true" />
          망고보드 권한 모드(777/774/770) & 어도비 익스프레스 브랜드 잠금 가드레일
        </h3>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-fg-2">
            팀 권한 플래그 (MangoBoard)
            <select
              aria-label="팀 권한 플래그"
              value={permissionFlag}
              onChange={(e) => onChangePermissionFlag(e.target.value as TeamPermissionFlag)}
              className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
            >
              <option value="777">777 (모든 팀원 보기·편집)</option>
              <option value="774">774 (팀원 보기·작성자만 편집)</option>
              <option value="770">770 (작성자만 보기·편집)</option>
            </select>
          </label>

          <label className="text-xs font-semibold text-fg-2">
            작업자 역할
            <select
              aria-label="작업자 역할"
              value={collaboratorRole}
              onChange={(e) => onChangeCollaboratorRole(e.target.value as CollaboratorRole)}
              className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
            >
              <option value="owner">대표 작가 (owner)</option>
              <option value="team-member">어시스턴트 팀원 (team-member)</option>
              <option value="guest">외부 검수 게스트 (guest)</option>
            </select>
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-fg">
            <input
              type="checkbox"
              checked={titleLogoMoved}
              onChange={onToggleTitleLogoMoved}
              className="size-4 accent-accent"
            />
            잠긴 시리즈 타이틀 로고 이동 시도
          </label>

          <label className="block text-xs font-semibold text-fg-2">
            사용 색상 HEX (팔레트 준수 검증)
            <input
              type="text"
              aria-label="사용 색상 HEX"
              value={proposedColorHex}
              onChange={(e) => onChangeProposedColorHex(e.target.value)}
              className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 font-mono text-xs text-fg"
            />
          </label>
        </div>

        <div
          className={cn(
            "rounded-xl border p-3",
            guardrailEval.compliant
              ? "border-good/35 bg-good/10"
              : "border-warning/40 bg-warning/10",
          )}
        >
          <p className="flex items-center gap-1.5 text-xs font-black text-fg">
            {guardrailEval.compliant ? (
              <CheckCircle2 size={15} className="text-good" aria-hidden="true" />
            ) : (
              <AlertTriangle size={15} className="text-warning" aria-hidden="true" />
            )}
            {guardrailEval.compliant
              ? `브랜드 가드레일 통과 (${guardrailEval.permissionLabel})`
              : `브랜드 가드레일 차단 (${guardrailEval.violations.length}건 위반)`}
          </p>
          {guardrailEval.violations.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-fg-2">
              {guardrailEval.violations.map((msg, idx) => (
                <li key={idx}>• {msg}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-fg-2">
              선택한 작업이 시리즈 브랜드 정책과 공동작업 권한 모드를 모두 만족합니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export interface BulkMockupTabPanelProps {
  readonly episodeRows: readonly BulkEpisodeRow[];
  readonly onAddEpisodeRow: () => void;
  readonly bulkManifest: BulkEpisodeGenerationResult;
  readonly selectedGoodsPresetId: GoodsMockupPresetId;
  readonly onChangeGoodsPresetId: (id: GoodsMockupPresetId) => void;
  readonly goodsSpec: GoodsMockupComputedSpec;
  readonly simulatePrintRisk: boolean;
  readonly onToggleSimulatePrintRisk: () => void;
  readonly preflightReport: DesignPreflightAuditReport;
}

export function StudioDesignPlatformBulkMockupTabPanel({
  episodeRows,
  onAddEpisodeRow,
  bulkManifest,
  selectedGoodsPresetId,
  onChangeGoodsPresetId,
  goodsSpec,
  simulatePrintRisk,
  onToggleSimulatePrintRisk,
  preflightReport,
}: BulkMockupTabPanelProps) {
  return (
    <div
      role="tabpanel"
      id="design-platform-panel-bulk-mockup"
      aria-labelledby="design-platform-tab-bulk-mockup"
      className="mt-4 grid gap-4 lg:grid-cols-3"
    >
      {/* 1. 캔바 Bulk Create + Polotno 다중 페이지 스키마 */}
      <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
            <Table size={15} className="text-accent" aria-hidden="true" />
            캔바 Bulk Create 회차 대량 생성기
          </h3>
          <button
            type="button"
            onClick={onAddEpisodeRow}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-accent px-2.5 text-xs font-bold text-on-accent"
          >
            <Plus size={13} aria-hidden="true" />
            회차 행 추가
          </button>
        </div>

        <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
          {episodeRows.map((row) => (
            <div key={row.episodeNumber} className="rounded-xl border border-line bg-card p-2.5 text-xs">
              <div className="flex items-center justify-between font-bold text-fg">
                <span>
                  {row.episodeNumber}화 · {row.episodeTitle}
                </span>
                <span className="font-mono text-[0.65rem] text-fg-3">{row.releaseDate}</span>
              </div>
              <p className="mt-0.5 text-[0.7rem] text-fg-2">
                주역: {row.featuredCharacter} ({row.ageRating})
              </p>
              <p className="mt-0.5 truncate text-[0.68rem] text-fg-3">“{row.hookCopy}”</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-line bg-card p-2.5 text-xs">
          <p className="font-bold text-fg">
            Polotno 호환 다중 페이지 JSON ({bulkManifest.totalGenerated}페이지 ·{" "}
            {bulkManifest.polotnoDocument.width}×{bulkManifest.polotnoDocument.height}px)
          </p>
          <p className="mt-1 text-[0.7rem] text-fg-3">
            총 생성 레이어 노드:{" "}
            {bulkManifest.polotnoDocument.pages.reduce((sum, p) => sum + p.children.length, 0)}개
          </p>
        </div>
      </div>

      {/* 2. 키틀(Kittl) · 미리캔버스 IP 굿즈 & 인쇄 목업 */}
      <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
          <Package size={15} className="text-accent" aria-hidden="true" />
          키틀·미리캔버스 IP 굿즈 & 칼선 목업
        </h3>

        <label className="block text-xs font-semibold text-fg-2">
          굿즈 품목 선택
          <select
            aria-label="굿즈 품목 선택"
            value={selectedGoodsPresetId}
            onChange={(e) => onChangeGoodsPresetId(e.target.value as GoodsMockupPresetId)}
            className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
          >
            {DESIGN_PLATFORM_GOODS_MOCKUPS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-xl border border-line bg-card p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-black text-fg">{goodsSpec.preset.label}</span>
            <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-[0.65rem] font-bold text-accent">
              {goodsSpec.preset.recommendedDpi}DPI
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-1.5 text-[0.7rem]">
            <div className="rounded-lg bg-panel p-2">
              <dt className="text-fg-3">인쇄 규격</dt>
              <dd className="font-bold text-fg">
                {goodsSpec.preset.trimWidthMm}×{goodsSpec.preset.trimHeightMm}mm (
                {goodsSpec.exportWidthPx}×{goodsSpec.exportHeightPx}px)
              </dd>
            </div>
            <div className="rounded-lg bg-panel p-2">
              <dt className="text-fg-3">재단·칼선 오프셋</dt>
              <dd className="font-bold text-fg">
                도련 {goodsSpec.preset.bleedMm}mm / 칼선 {goodsSpec.preset.dieCutMarginMm}mm
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[0.7rem] leading-4 text-fg-2">{goodsSpec.preset.productionNote}</p>
        </div>
      </div>

      {/* 3. 비스타크리에이트 · 미리캔버스 라이선스 & 인쇄 프리플라이트 감사 */}
      <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
          <ShieldCheck size={15} className="text-accent" aria-hidden="true" />
          상업 라이선스 & 300DPI 인쇄 프리플라이트
        </h3>

        <label className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-fg">
          <input
            type="checkbox"
            checked={simulatePrintRisk}
            onChange={onToggleSimulatePrintRisk}
            className="size-4 accent-accent"
          />
          인쇄 위험 시뮬레이션 (미검증 폰트·저해상도·워터마크 잔류)
        </label>

        <div
          className={cn(
            "rounded-xl border p-3 text-xs",
            preflightReport.overallStatus === "ready"
              ? "border-good/35 bg-good/10"
              : "border-danger/40 bg-danger-soft/15",
          )}
        >
          <p className="flex items-center gap-1.5 font-black text-fg">
            {preflightReport.overallStatus === "ready" ? (
              <CheckCircle2 size={15} className="text-good" aria-hidden="true" />
            ) : (
              <AlertTriangle size={15} className="text-danger" aria-hidden="true" />
            )}
            프리플라이트 점수 {preflightReport.score}점 ({preflightReport.overallStatus.toUpperCase()})
          </p>
          <ul className="mt-2 space-y-1 text-[0.7rem] text-fg-2">
            {preflightReport.checks.slice(0, 5).map((check) => (
              <li key={check.id}>
                • [{check.status.toUpperCase()}] {check.label}: {check.detail}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
