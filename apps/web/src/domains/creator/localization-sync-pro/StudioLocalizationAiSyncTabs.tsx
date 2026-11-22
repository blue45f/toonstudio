import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Cpu,
  Film,
  Globe,
  MapPin,
  MonitorUp,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useT } from "@/shared/lib/i18n";
import { OFFLINE_SYNC_COPY } from "./studio-offline-sync-storage-copy";

import {
  BYOK_PROVIDER_IDS,
  COMFYUI_CONTROLNET_MODES,
  CONTROLNET_PRESETS,
  type ByokProviderId,
  type CharacterDnaLock,
  type ComfyUiBridgeResult,
  type ComfyUiControlNetMode,
  type WebNovel3dBlockingSheet,
} from "./comfyui-manyfast-bridge";
import {
  LOCALIZATION_LANGUAGE_SPECS,
  PRINT_ICC_PROFILES,
  PRINT_TRIM_PRESETS,
  SUPPORTED_LOCALIZATION_LANGS,
  type CmykColorSample,
  type GlossaryTermEntry,
  type MantraLetrPipelineResult,
  type PdfX1aPrintPackage,
  type PrintIccProfileId,
  type PrintTrimPresetId,
  type ReadingFlowMode,
  type SupportedLocalizationLang,
  type TategakiCompositionResult,
} from "./mantra-letr-localization-engine";
import {
  SYNC_STUDIO_SURFACES,
  SYNC_SURFACE_DESCRIPTORS,
  type OfflineSyncSnapshotDocument,
  type ProximityChannelEvaluation,
  type ProximityReviewTableState,
  type ScreenShareSignalState,
  type SyncCycleResult,
  type SyncNetworkStatus,
  type SyncStudioSurface,
} from "./studio-offline-first-sync-bridge";

import { cn } from "@/shared/lib/utils";

const BTN_BASE =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3.5 py-2 text-xs font-bold text-fg transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 [word-break:keep-all] motion-reduce:transition-none";
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-accent bg-accent-soft/25 px-3.5 py-2 text-xs font-bold text-fg transition-colors hover:bg-accent-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 [word-break:keep-all] motion-reduce:transition-none";
const INPUT_BASE =
  "min-h-11 w-full rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function badgeTone(status: "passed" | "pass" | "warning" | "blocked" | "fail" | "error"): string {
  if (status === "passed" || status === "pass") return "border-success/35 bg-success-soft/15 text-success";
  if (status === "warning") return "border-warning/35 bg-warning-soft/15 text-warning";
  return "border-danger/35 bg-danger-soft/15 text-danger";
}

// ---------------------------------------------------------------------------
// 탭 1: 글로벌 식자·현지화 (Mantra · LETR 6단계)
// ---------------------------------------------------------------------------

export interface LocalizationSixStageTabProps {
  readonly targetLang: SupportedLocalizationLang;
  readonly onChangeTargetLang: (lang: SupportedLocalizationLang) => void;
  readonly readingFlow: ReadingFlowMode;
  readonly onChangeReadingFlow: (flow: ReadingFlowMode) => void;
  readonly glossary: readonly GlossaryTermEntry[];
  readonly newSourceTerm: string;
  readonly newTargetTerm: string;
  readonly onChangeNewSourceTerm: (value: string) => void;
  readonly onChangeNewTargetTerm: (value: string) => void;
  readonly onAddGlossaryTerm: () => void;
  readonly pipelineResult: MantraLetrPipelineResult;
}

export function LocalizationSixStageTab({
  targetLang,
  onChangeTargetLang,
  readingFlow,
  onChangeReadingFlow,
  glossary,
  newSourceTerm,
  newTargetTerm,
  onChangeNewSourceTerm,
  onChangeNewTargetTerm,
  onAddGlossaryTerm,
  pipelineResult,
}: LocalizationSixStageTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label htmlFor="loc-pro-target-lang" className="block text-xs font-bold text-fg-2 [word-break:keep-all]">
            번역 대상 언어 (7개국어)
          </label>
          <select
            id="loc-pro-target-lang"
            value={targetLang}
            onChange={(e) => onChangeTargetLang(e.target.value as SupportedLocalizationLang)}
            className={cn(INPUT_BASE, "mt-1.5")}
          >
            {SUPPORTED_LOCALIZATION_LANGS.map((code) => (
              <option key={code} value={code}>
                {LOCALIZATION_LANGUAGE_SPECS[code].labelKo} ({LOCALIZATION_LANGUAGE_SPECS[code].nativeName})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="loc-pro-reading-flow" className="block text-xs font-bold text-fg-2 [word-break:keep-all]">
            읽기 방향 · 말풍선 순서
          </label>
          <select
            id="loc-pro-reading-flow"
            value={readingFlow}
            onChange={(e) => onChangeReadingFlow(e.target.value as ReadingFlowMode)}
            className={cn(INPUT_BASE, "mt-1.5")}
          >
            <option value="vertical-webtoon">세로 스크롤 웹툰 (상→하)</option>
            <option value="manga-rtl">일본 단행본 (우→좌 · RTL)</option>
            <option value="comic-ltr">글로벌 코믹스 (좌→우 · LTR)</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-line bg-card px-3 py-2 text-center">
            <span className="block text-[0.68rem] font-semibold text-fg-3 [word-break:keep-all]">현지화 준비도</span>
            <strong className="mt-0.5 block text-lg font-black text-fg tabular-nums">
              {pipelineResult.readinessScore}점
            </strong>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2 text-center">
            <span className="block text-[0.68rem] font-semibold text-fg-3 [word-break:keep-all]">용어집 준수율</span>
            <strong className="mt-0.5 block text-lg font-black text-success tabular-nums">
              {pipelineResult.glossaryComplianceRate}%
            </strong>
          </div>
        </div>
      </div>

      {/* 6단계 파이프라인 진행 카드 */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="6단계 현지화 파이프라인 상태">
        {pipelineResult.stages.map((stage) => (
          <div key={stage.stageId} className="rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-fg [word-break:keep-all]">{stage.titleKo}</span>
              <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-bold [word-break:keep-all]", badgeTone(stage.status))}>
                {stage.status === "passed" ? "통과" : stage.status === "warning" ? "확인" : "차단"}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-fg-2 [word-break:keep-all]">{stage.summaryKo}</p>
          </div>
        ))}
      </div>

      {/* 식자 결과 목록 */}
      <div className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-black text-fg [word-break:keep-all]">
          <Globe className="size-3.5 text-accent" aria-hidden="true" />
          말풍선·효과음 자동 식자 결과 (<span className="tabular-nums">{pipelineResult.items.length}</span>건)
        </h4>
        <div className="grid gap-2 md:grid-cols-2">
          {pipelineResult.items.map((item) => (
            <article key={item.region.id} className="rounded-xl border border-line bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.7rem] font-bold text-accent tabular-nums">
                  #{item.region.readingOrder} · 컷 {item.region.cutNumber} ({item.region.kind})
                </span>
                <span className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-bold tabular-nums", badgeTone(item.fit.overflow ? "fail" : "pass"))}>
                  {item.fit.fontSizePx}px · {item.fit.lineCount}줄
                </span>
              </div>
              <p className="mt-1.5 text-xs text-fg-3 [word-break:keep-all]">원문: {item.region.sourceText}</p>
              <p className="mt-1 text-sm font-bold text-fg [word-break:keep-all]">
                {item.sfxVector ? `SFX 벡터: ${item.sfxVector.localizedSfx} (${item.sfxVector.warpCurve})` : item.translation.translatedText}
              </p>
              <p className="mt-1.5 text-[0.7rem] text-fg-3 tabular-nums [word-break:keep-all]">
                클린업: {item.cleanupMask.strategy} (여백 {item.cleanupMask.dilationPx}px · 과금 0원) · {item.fit.recommendationKo}
              </p>
            </article>
          ))}
        </div>
      </div>

      {/* 국가별 QA 결과 */}
      <div className="rounded-xl border border-line bg-card p-3">
        <h4 className="text-xs font-black text-fg [word-break:keep-all]">국가별 검열·읽기 방향 QA 점검</h4>
        <ul className="mt-2 space-y-1.5 text-xs text-fg-2">
          {pipelineResult.qaFindings.map((finding) => (
            <li key={finding.code} className="flex items-start gap-2 [word-break:keep-all]">
              <span className={cn("mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[0.62rem] font-bold", badgeTone(finding.severity))}>
                {finding.severity === "pass" ? "통과" : finding.severity === "warning" ? "주의" : "오류"}
              </span>
              <span>
                <strong className="text-fg">{finding.messageKo}</strong> — {finding.actionKo}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 점진적 공개: 고유명사 용어집 잠금 편집 */}
      <details className="rounded-xl border border-line bg-card p-3">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between text-xs font-bold text-fg [word-break:keep-all]">
          <span>고유명사 용어집(Glossary) 강제 잠금 관리 ({glossary.length}개 등록)</span>
          <span className="text-[0.7rem] text-fg-3">펼쳐서 추가</span>
        </summary>
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <div className="flex flex-wrap gap-1.5">
            {glossary.map((entry) => (
              <span key={entry.id} className="rounded-lg border border-line bg-panel px-2.5 py-1 text-xs text-fg [word-break:keep-all]">
                {entry.sourceTerm} → <strong>{entry.translations[targetLang]}</strong>
              </span>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label htmlFor="loc-pro-gloss-src" className="block text-[0.7rem] font-bold text-fg-3">원문 고유명사</label>
              <input id="loc-pro-gloss-src" value={newSourceTerm} onChange={(e) => onChangeNewSourceTerm(e.target.value)} placeholder="예: 마탑" className={cn(INPUT_BASE, "mt-1")} />
            </div>
            <div>
              <label htmlFor="loc-pro-gloss-dst" className="block text-[0.7rem] font-bold text-fg-3">고정 번역어 ({LOCALIZATION_LANGUAGE_SPECS[targetLang].labelKo})</label>
              <input id="loc-pro-gloss-dst" value={newTargetTerm} onChange={(e) => onChangeNewTargetTerm(e.target.value)} placeholder="예: Magic Tower" className={cn(INPUT_BASE, "mt-1")} />
            </div>
            <div className="flex items-end">
              <button type="button" onClick={onAddGlossaryTerm} className={BTN_PRIMARY}>용어 잠금 추가</button>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 탭 2: 일본 세로쓰기 · 단행본 CMYK 인쇄 (PDF/X-1a)
// ---------------------------------------------------------------------------

export interface JapanPrintExportTabProps {
  readonly jpInput: string;
  readonly onChangeJpInput: (value: string) => void;
  readonly autoTcy: boolean;
  readonly onToggleAutoTcy: (checked: boolean) => void;
  readonly tategaki: TategakiCompositionResult;
  readonly trimPresetId: PrintTrimPresetId;
  readonly onChangeTrimPresetId: (id: PrintTrimPresetId) => void;
  readonly iccProfileId: PrintIccProfileId;
  readonly onChangeIccProfileId: (id: PrintIccProfileId) => void;
  readonly bleedMm: number;
  readonly onChangeBleedMm: (value: number) => void;
  readonly dpi: number;
  readonly onChangeDpi: (value: number) => void;
  readonly printPkg: PdfX1aPrintPackage;
  readonly sampleCmyk: CmykColorSample;
}

export function JapanPrintExportTab({
  jpInput,
  onChangeJpInput,
  autoTcy,
  onToggleAutoTcy,
  tategaki,
  trimPresetId,
  onChangeTrimPresetId,
  iccProfileId,
  onChangeIccProfileId,
  bleedMm,
  onChangeBleedMm,
  dpi,
  onChangeDpi,
  printPkg,
  sampleCmyk,
}: JapanPrintExportTabProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 좌측: 일본 세로쓰기 + 루비 후리가나 + 세로 중 가로 */}
      <section className="space-y-3 rounded-2xl border border-line bg-card p-4" aria-label="일본 세로쓰기 조판기">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-black text-fg [word-break:keep-all]">
            <BookOpen className="size-4 text-accent" aria-hidden="true" />
            일본 세로쓰기(縦書き) · 루비 후리가나
          </h4>
          <span className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-[0.7rem] font-bold text-fg-2 tabular-nums">
            루비 {tategaki.rubyCount} · 세로중가로 {tategaki.tcyCount} · {tategaki.estimatedColumns}열
          </span>
        </div>

        <div>
          <label htmlFor="loc-pro-jp-text" className="block text-xs font-bold text-fg-2 [word-break:keep-all]">
            일본어 대사 입력 (루비 표기: 漢字(かんじ) 또는 ｜漢字《かんじ》)
          </label>
          <textarea
            id="loc-pro-jp-text"
            rows={3}
            value={jpInput}
            onChange={(e) => onChangeJpInput(e.target.value)}
            className={cn(INPUT_BASE, "mt-1.5 leading-6")}
          />
        </div>

        <label htmlFor="loc-pro-auto-tcy" className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs font-bold text-fg-2 [word-break:keep-all]">
          <input
            id="loc-pro-auto-tcy"
            type="checkbox"
            checked={autoTcy}
            onChange={(e) => onToggleAutoTcy(e.target.checked)}
          />
          1~2자리 숫자 · !? · 2글자 약어 자동 세로 중 가로(text-combine-upright) 적용
        </label>

        {/* 실시간 세로쓰기 미리보기 */}
        <div
          data-testid="jp-tategaki-preview"
          className="flex min-h-48 justify-end overflow-x-auto rounded-xl border border-line bg-panel p-4 text-base leading-8 text-fg"
          style={{
            writingMode: tategaki.cssStyle.writingMode,
            textOrientation: tategaki.cssStyle.textOrientation,
            lineBreak: tategaki.cssStyle.lineBreak,
          }}
        >
          {tategaki.tokens.map((token, idx) => {
            if (token.kind === "ruby") {
              return (
                <ruby key={`ruby-${idx}`}>
                  {token.base}
                  <rt className="text-[0.6em] text-fg-2">{token.rt}</rt>
                </ruby>
              );
            }
            if (token.kind === "tcy") {
              return (
                <span key={`tcy-${idx}`} data-tcy="true" style={{ textCombineUpright: "all" }} className="font-bold text-accent">
                  {token.value}
                </span>
              );
            }
            return <span key={`txt-${idx}`}>{token.value}</span>;
          })}
        </div>
        {tategaki.warnings.length > 0 ? (
          <p className="text-xs text-warning [word-break:keep-all]">{tategaki.warnings[0]}</p>
        ) : null}
      </section>

      {/* 우측: CMYK 3mm 도련 + 재단선 + ICC + 300 DPI PDF/X-1a 프리플라이트 */}
      <section className="space-y-3 rounded-2xl border border-line bg-card p-4" aria-label="단행본 인쇄 CMYK PDF/X-1a 검수">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-black text-fg [word-break:keep-all]">
            <Printer className="size-4 text-accent" aria-hidden="true" />
            단행본 CMYK · PDF/X-1a 프리플라이트
          </h4>
          <span className={cn("rounded-full border px-2.5 py-0.5 text-[0.7rem] font-bold [word-break:keep-all]", badgeTone(printPkg.passed ? "pass" : "fail"))}>
            {printPkg.passed ? "인쇄 출고 가능" : `보완 필요 ${printPkg.blockingCount}건`}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="loc-pro-trim" className="block text-[0.7rem] font-bold text-fg-2">단행본 판형</label>
            <select id="loc-pro-trim" value={trimPresetId} onChange={(e) => onChangeTrimPresetId(e.target.value as PrintTrimPresetId)} className={cn(INPUT_BASE, "mt-1")}>
              {Object.values(PRINT_TRIM_PRESETS).map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.labelKo}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="loc-pro-icc" className="block text-[0.7rem] font-bold text-fg-2">ICC 색 프로파일</label>
            <select id="loc-pro-icc" value={iccProfileId} onChange={(e) => onChangeIccProfileId(e.target.value as PrintIccProfileId)} className={cn(INPUT_BASE, "mt-1")}>
              {Object.values(PRINT_ICC_PROFILES).map((icc) => (
                <option key={icc.id} value={icc.id}>{icc.id} (잉크 ≤ {icc.maxTacPercent}%)</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="loc-pro-bleed" className="block text-[0.7rem] font-bold text-fg-2">도련 여백 (mm)</label>
            <input id="loc-pro-bleed" type="number" min={0} max={10} step={0.5} value={bleedMm} onChange={(e) => onChangeBleedMm(Number(e.target.value))} className={cn(INPUT_BASE, "mt-1 tabular-nums")} />
          </div>
          <div>
            <label htmlFor="loc-pro-dpi" className="block text-[0.7rem] font-bold text-fg-2">출력 해상도 (DPI)</label>
            <input id="loc-pro-dpi" type="number" min={72} max={600} step={50} value={dpi} onChange={(e) => onChangeDpi(Number(e.target.value))} className={cn(INPUT_BASE, "mt-1 tabular-nums")} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs tabular-nums">
          <div className="rounded-xl border border-line bg-panel p-2">
            <span className="block text-[0.65rem] text-fg-3">도련 포함 크기</span>
            <strong className="text-fg">{printPkg.bleedBoxMm.width}×{printPkg.bleedBoxMm.height}mm</strong>
          </div>
          <div className="rounded-xl border border-line bg-panel p-2">
            <span className="block text-[0.65rem] text-fg-3">인쇄 픽셀 ({printPkg.dpi} DPI)</span>
            <strong className="text-fg">{printPkg.pixelSizeAtDpi.widthPx}×{printPkg.pixelSizeAtDpi.heightPx}</strong>
          </div>
          <div className="rounded-xl border border-line bg-panel p-2">
            <span className="block text-[0.65rem] text-fg-3">책등 · 재단선</span>
            <strong className="text-fg">{printPkg.spineWidthMm}mm · {printPkg.cropMarks.length}선</strong>
          </div>
        </div>

        <ul className="space-y-1.5 text-xs">
          {printPkg.preflightChecks.map((check) => (
            <li key={check.code} className="flex items-start justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5">
              <span className="text-fg-2 [word-break:keep-all]">
                <strong className="text-fg">{check.labelKo}</strong> · {check.detailKo}
              </span>
              <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[0.62rem] font-bold", badgeTone(check.status))}>
                {check.status === "pass" ? "적합" : "부적합"}
              </span>
            </li>
          ))}
        </ul>

        <details className="rounded-xl border border-line bg-panel p-2.5 text-xs">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between font-bold text-fg [word-break:keep-all]">
            <span>PDF/X-1a:2001 메타데이터 · CMYK 잉크 총량(TAC) 상세</span>
            <span className="text-[0.68rem] text-fg-3 tabular-nums">TAC {sampleCmyk.tacPercent}%</span>
          </summary>
          <p className="mt-2 text-fg-2 tabular-nums">
            규격: {printPkg.pdfxVersion} ({printPkg.isoStandard}) · 색공간: {printPkg.colorSpace} · 제본: {printPkg.bindingDirection}
            <br />
            샘플 CMYK 분판: C {sampleCmyk.c}% · M {sampleCmyk.m}% · Y {sampleCmyk.y}% · K {sampleCmyk.k}% (합계 {sampleCmyk.tacPercent}%)
          </p>
        </details>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 탭 3: 소설→3D 자동 콘티 (ManyFast)
// ---------------------------------------------------------------------------

export interface NovelTo3dBlockingTabProps {
  readonly novelScript: string;
  readonly onChangeNovelScript: (value: string) => void;
  readonly onResetSampleScript: () => void;
  readonly blockingSheet: WebNovel3dBlockingSheet;
}

export function NovelTo3dBlockingTab({
  novelScript,
  onChangeNovelScript,
  onResetSampleScript,
  blockingSheet,
}: NovelTo3dBlockingTabProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="loc-pro-novel-input" className="flex items-center gap-1.5 text-sm font-black text-fg [word-break:keep-all]">
            <Film className="size-4 text-accent" aria-hidden="true" />
            한국어 웹소설·대본 원문 입력 (ManyFast 3D 자동 컷 블로킹)
          </label>
          <button type="button" onClick={onResetSampleScript} className={BTN_BASE}>
            예시 대본 불러오기
          </button>
        </div>
        <textarea
          id="loc-pro-novel-input"
          rows={5}
          value={novelScript}
          onChange={(e) => onChangeNovelScript(e.target.value)}
          className={cn(INPUT_BASE, "mt-2 leading-6")}
          placeholder='[장면 1 · 학교 옥상]&#10;서연: "현우야, 정말 갈 거야?"'
        />
        <div className="mt-3 flex flex-wrap gap-2 text-xs tabular-nums">
          <span className="rounded-lg border border-line bg-panel px-2.5 py-1 text-fg-2">자동 분할 컷: <strong className="text-fg">{blockingSheet.cuts.length}컷</strong></span>
          <span className="rounded-lg border border-line bg-panel px-2.5 py-1 text-fg-2">추출 인물(DNA 시드): <strong className="text-fg">{blockingSheet.cast.length}명</strong></span>
          <span className="rounded-lg border border-line bg-panel px-2.5 py-1 text-fg-2">매칭 3D 세트: <strong className="text-fg">{blockingSheet.matchedSets.length}종</strong></span>
          <span className="rounded-lg border border-line bg-panel px-2.5 py-1 text-fg-2">예상 세로 스크롤: <strong className="text-fg">{blockingSheet.totalEstimatedScrollPx.toLocaleString("ko-KR")}px</strong></span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {blockingSheet.cuts.map((cut) => (
          <article key={cut.cutNumber} className="rounded-2xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black text-accent tabular-nums">
                CUT #{cut.cutNumber} · {cut.cameraShot} ({cut.cameraAngle} · {cut.focalLengthMm}mm)
              </span>
              <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.68rem] font-bold text-fg-2 [word-break:keep-all]">
                {cut.emotionCue}
              </span>
            </div>
            <p className="mt-1 text-[0.7rem] font-semibold text-fg-3 [word-break:keep-all]">
              3D 배경: {cut.backgroundSet.nameKo} ({cut.backgroundSet.timeOfDay} · {cut.backgroundSet.lightingPreset})
            </p>
            {cut.dialogueText ? (
              <p className="mt-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-bold text-fg [word-break:keep-all]">
                {cut.speakerName ? `${cut.speakerName}: ` : ""}“{cut.dialogueText}”
              </p>
            ) : (
              <p className="mt-2 text-xs leading-5 text-fg-2 [word-break:keep-all]">{cut.actionNote}</p>
            )}
            {cut.characters.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[0.68rem] tabular-nums text-fg-3">
                {cut.characters.map((ch) => (
                  <span key={`${cut.cutNumber}-${ch.characterId}`} className="rounded-lg border border-line bg-panel px-2 py-0.5">
                    {ch.name} ({ch.position.x}m, y={ch.position.y}, z={ch.position.z}m · {ch.yawDeg}°) · 시드 {ch.seed}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 탭 4: 로컬 AI(ComfyUI/BYOK) · 오프라인 동기화 · 근접 합평 테이블
// ---------------------------------------------------------------------------

export interface LocalAiCollabSyncTabProps {
  readonly comfyMode: ComfyUiControlNetMode;
  readonly onChangeComfyMode: (mode: ComfyUiControlNetMode) => void;
  readonly byokProvider: ByokProviderId;
  readonly onChangeByokProvider: (provider: ByokProviderId) => void;
  readonly comfyPrompt: string;
  readonly onChangeComfyPrompt: (value: string) => void;
  readonly activeDna: CharacterDnaLock;
  readonly comfyBusy: boolean;
  readonly comfyResult: ComfyUiBridgeResult | null;
  readonly onRunComfyDryRun: () => void;
  readonly syncSnapshot: OfflineSyncSnapshotDocument;
  readonly lastSyncCycle: SyncCycleResult | null;
  readonly onToggleNetwork: (next: SyncNetworkStatus) => void;
  readonly onRecordDemoEdit: (surface: SyncStudioSurface) => void;
  readonly onRunOptimisticSync: () => void;
  readonly reviewTable: ProximityReviewTableState;
  readonly proximityEval: ProximityChannelEvaluation;
  readonly onMoveParticipantCloser: (participantId: string) => void;
  readonly onAddPinNote: () => void;
  readonly onTogglePinResolved: (pinId: string) => void;
  readonly screenShare: ScreenShareSignalState;
  readonly onAdvanceScreenShare: () => void;
  readonly onStopScreenShare: () => void;
}

export function LocalAiCollabSyncTab({
  comfyMode,
  onChangeComfyMode,
  byokProvider,
  onChangeByokProvider,
  comfyPrompt,
  onChangeComfyPrompt,
  activeDna,
  comfyBusy,
  comfyResult,
  onRunComfyDryRun,
  syncSnapshot,
  lastSyncCycle,
  onToggleNetwork,
  onRecordDemoEdit,
  onRunOptimisticSync,
  reviewTable,
  proximityEval,
  onMoveParticipantCloser,
  onAddPinNote,
  onTogglePinResolved,
  screenShare,
  onAdvanceScreenShare,
  onStopScreenShare,
}: LocalAiCollabSyncTabProps) {
  const t = useT();
  const pendingCount = syncSnapshot.queue.filter((q) => q.status === "pending" || q.status === "retrying").length;

  return (
    <div className="space-y-4">
      {/* 섹션 A: 과금 0원 로컬 ComfyUI + BYOK 브리지 */}
      <section className="space-y-3 rounded-2xl border border-line bg-card p-4" aria-label="로컬 ComfyUI 및 BYOK 브리지">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-black text-fg [word-break:keep-all]">
            <Cpu className="size-4 text-accent" aria-hidden="true" />
            과금 0원 로컬 ComfyUI (127.0.0.1:8188) · BYOK 브리지
          </h4>
          <span className="inline-flex items-center gap-1 rounded-full border border-success/35 bg-success-soft/15 px-2.5 py-0.5 text-[0.7rem] font-bold text-success [word-break:keep-all]">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            외부 유료 자동 호출 0건 보장
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label htmlFor="loc-pro-comfy-mode" className="block text-[0.7rem] font-bold text-fg-2">ControlNet 제어 방식</label>
            <select id="loc-pro-comfy-mode" value={comfyMode} onChange={(e) => onChangeComfyMode(e.target.value as ComfyUiControlNetMode)} className={cn(INPUT_BASE, "mt-1")}>
              {COMFYUI_CONTROLNET_MODES.map((m) => (
                <option key={m} value={m}>{CONTROLNET_PRESETS[m].labelKo}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="loc-pro-byok-provider" className="block text-[0.7rem] font-bold text-fg-2">실행 백엔드 (BYOK 정책)</label>
            <select id="loc-pro-byok-provider" value={byokProvider} onChange={(e) => onChangeByokProvider(e.target.value as ByokProviderId)} className={cn(INPUT_BASE, "mt-1")}>
              {BYOK_PROVIDER_IDS.map((p) => (
                <option key={p} value={p}>{p === "local-comfyui" ? "로컬 ComfyUI (127.0.0.1:8188 · 0원)" : `${p} (자동 유료 호출 차단)`}</option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border border-line bg-panel px-3 py-2 text-xs">
            <span className="block text-[0.68rem] text-fg-3">캐릭터 DNA 시드 잠금</span>
            <strong className="block text-fg tabular-nums">{activeDna.name} · #{activeDna.seed}</strong>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor="loc-pro-comfy-prompt" className="block text-[0.7rem] font-bold text-fg-2">컷 생성 프롬프트</label>
            <input id="loc-pro-comfy-prompt" value={comfyPrompt} onChange={(e) => onChangeComfyPrompt(e.target.value)} className={cn(INPUT_BASE, "mt-1")} />
          </div>
          <div className="flex items-end">
            <button type="button" disabled={comfyBusy} onClick={onRunComfyDryRun} className={BTN_PRIMARY}>
              <Sparkles className="size-3.5" aria-hidden="true" />
              {comfyBusy ? "확인 중..." : "로컬 연결 / Dry-Run 실행"}
            </button>
          </div>
        </div>

        {comfyResult ? (
          <div className="rounded-xl border border-line bg-panel p-3 text-xs">
            <p className="font-bold text-fg [word-break:keep-all]">{comfyResult.summaryKo}</p>
            <p className="mt-1 text-fg-3 [word-break:keep-all]">{comfyResult.guidanceKo}</p>
            <details className="mt-2">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between font-bold text-fg-2">
                <span>생성된 ComfyUI ControlNet 워크플로 JSON ({comfyResult.workflow.nodeCount}노드 · 예상 VRAM {comfyResult.workflow.estimatedVramGb}GB)</span>
                <span className="tabular-nums">외부 과금 {comfyResult.externalPaidAutoCallsCount}건</span>
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-line bg-card p-2 text-[0.68rem] text-fg-2">
                {JSON.stringify(comfyResult.workflow.prompt, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}
      </section>

      {/* 섹션 B: 4대 스튜디오 통합 오프라인 우선 동기화 + 섹션 C: 근접 합평 테이블 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl border border-line bg-card p-4" aria-label={t(OFFLINE_SYNC_COPY.title)}>
          <p className="text-xs text-fg-2">{t(OFFLINE_SYNC_COPY.session)}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-sm font-black text-fg [word-break:keep-all]">
              {syncSnapshot.networkStatus === "offline" ? <WifiOff className="size-4 text-warning" aria-hidden="true" /> : <Wifi className="size-4 text-success" aria-hidden="true" />}
              {t(OFFLINE_SYNC_COPY.title)}
            </h4>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => onToggleNetwork(syncSnapshot.networkStatus === "offline" ? "online" : "offline")}
                className={BTN_BASE}
              >
                {syncSnapshot.networkStatus === "offline" ? "온라인 복귀" : "오프라인 전환"}
              </button>
              <button type="button" onClick={onRunOptimisticSync} className={BTN_PRIMARY}>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {t(OFFLINE_SYNC_COPY.run)}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs tabular-nums">
            <div className="rounded-xl border border-line bg-panel p-2">
              <span className="block text-[0.65rem] text-fg-3">대기 큐</span>
              <strong className="text-fg">{pendingCount}건</strong>
            </div>
            <div className="rounded-xl border border-line bg-panel p-2">
              <span className="block text-[0.65rem] text-fg-3">{t(OFFLINE_SYNC_COPY.reflected)}</span>
              <strong className="text-success">{syncSnapshot.syncedOpCount}건</strong>
            </div>
            <div className="rounded-xl border border-line bg-panel p-2">
              <span className="block text-[0.65rem] text-fg-3">스토리지</span>
              <strong className="text-fg">{syncSnapshot.storageBackend}</strong>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {SYNC_STUDIO_SURFACES.map((surface) => (
              <button key={surface} type="button" onClick={() => onRecordDemoEdit(surface)} className={cn(BTN_BASE, "justify-start text-left")}>
                <span>+ {SYNC_SURFACE_DESCRIPTORS[surface].labelKo} {t(OFFLINE_SYNC_COPY.add)}</span>
              </button>
            ))}
          </div>

          {lastSyncCycle ? (
            <p role="status" className="rounded-xl border border-line bg-panel px-3 py-2 text-xs font-semibold text-fg-2 [word-break:keep-all]">
              {lastSyncCycle.summaryKo}
            </p>
          ) : null}
        </section>

        <section className="space-y-3 rounded-2xl border border-line bg-card p-4" aria-label="가상 스튜디오 근접 원고 합평 테이블">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-sm font-black text-fg [word-break:keep-all]">
              <MapPin className="size-4 text-accent" aria-hidden="true" />
              가상 스튜디오 근접 합평 테이블
            </h4>
            <span className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-[0.7rem] font-bold text-fg-2 tabular-nums">
              테이블 결합 {proximityEval.joinedTableIds.length}명 · 음성 {proximityEval.activeVoicePairCount}쌍
            </span>
          </div>

          <ul className="space-y-1.5 text-xs">
            {reviewTable.participants.map((p) => {
              const joined = proximityEval.joinedTableIds.includes(p.id);
              return (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2">
                  <span className="[word-break:keep-all]">
                    <strong className="text-fg">{p.name}</strong> ({p.roleKo}) ·{" "}
                    <span className="tabular-nums text-fg-3">({p.x}m, {p.y}m)</span>
                  </span>
                  {joined ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-success/35 bg-success-soft/15 px-2 py-0.5 text-[0.65rem] font-bold text-success">
                      <CheckCircle2 className="size-3" aria-hidden="true" /> 합평 결합
                    </span>
                  ) : (
                    <button type="button" onClick={() => onMoveParticipantCloser(p.id)} className={BTN_BASE}>
                      테이블로 이동
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel p-2.5 text-xs">
            <span className="flex items-center gap-1.5 font-bold text-fg [word-break:keep-all]">
              <MonitorUp className="size-3.5 text-accent" aria-hidden="true" />
              화면공유 시그널링: <code className="tabular-nums text-accent">{screenShare.status}</code>
            </span>
            <div className="flex gap-1.5">
              <button type="button" onClick={onAdvanceScreenShare} className={BTN_PRIMARY}>
                {screenShare.status === "streaming" ? "일시 정지" : screenShare.status === "paused" ? "재개" : "다음 단계"}
              </button>
              {screenShare.status !== "idle" ? (
                <button type="button" onClick={onStopScreenShare} className={BTN_BASE}>종료</button>
              ) : null}
            </div>
          </div>

          <details className="rounded-xl border border-line bg-panel p-2.5 text-xs">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between font-bold text-fg [word-break:keep-all]">
              <span>공동 컷 코멘트 핀 ({reviewTable.commentPins.length}건)</span>
              <span className="text-[0.68rem] text-fg-3">펼쳐서 관리</span>
            </summary>
            <div className="mt-2 space-y-1.5 border-t border-line pt-2">
              {reviewTable.commentPins.map((pin) => (
                <div key={pin.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5">
                  <span className={cn("text-fg-2 [word-break:keep-all]", pin.resolved && "line-through opacity-60")}>
                    [{pin.cutId}] {pin.body}
                  </span>
                  <button type="button" onClick={() => onTogglePinResolved(pin.id)} className={BTN_BASE}>
                    {pin.resolved ? "다시 열기" : "해결"}
                  </button>
                </div>
              ))}
              <button type="button" onClick={onAddPinNote} className={BTN_BASE}>
                <AlertTriangle className="size-3.5" aria-hidden="true" /> 현재 컷에 합평 핀 추가
              </button>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
