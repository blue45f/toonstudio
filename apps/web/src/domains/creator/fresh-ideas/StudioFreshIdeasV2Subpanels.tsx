/**
 * Subpanels for StudioFreshIdeasV2WorkbenchCard:
 * 1) Multi-Source Ingestion, Trigger Router, Cold-Start 3-Path Chooser & Pre-Lens Deconstruction Inspector
 * 2) Mode C Ecosystem Chaining (40/60 Hybrid Fusion, 1-to-3 OSMU, 5-Part Series, Idea Bank Status Manager)
 */

import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  GitMerge,
  Layers,
  SlidersHorizontal,
} from "lucide-react";

import {
  buildColdStartChooser,
  classifyFreshIdeasTriggerIntent,
  SOURCE_KIND_OPTIONS,
  type FreshIdeasSourceKind,
} from "./fresh-ideas-contracts";
import type {
  MultiSourceIngestionBundle,
  ThesisDeconstructionResult,
} from "./fresh-ideas-ingest-deconstruct";
import type {
  BlindSpotAxisFinding,
  BlindSpotAxisId,
  FreshIdeaLensCardV2,
} from "./fresh-ideas-lenses-engine";
import {
  fuseTwoLensAngles,
  type IdeaBankSpreadsheetRow,
  type ModeCEcosystemBundle,
} from "./fresh-ideas-quality-ecosystem";
import type { StoredIdeaBankRecord } from "./fresh-ideas-workspace-export-bridge";

const MOTION_BTN =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

const ROUTE_LABELS_KO: Record<ReturnType<typeof classifyFreshIdeasTriggerIntent>, string> = {
  "generate-fresh-ideas": "generate-fresh-ideas · 5각도 에디토리얼 리믹스",
  "plain-summary": "일반 요약 라우팅 (리믹스 제외 · 핵심 요약 권장)",
  "match-my-writing-style": "match-my-writing-style 라우팅 (문체 변환 전용)",
  "get-more-perspectives": "get-more-perspectives 라우팅 (5인 자문단 투표)",
  "prep-for-meetings": "prep-for-meetings 라우팅 (30초 회의 브리프)",
  "focus-my-energy": "focus-my-energy 라우팅 (에너지 기반 할 일 정렬)",
};

export interface CustomSourceDraftState {
  readonly enabled: boolean;
  readonly promptOrGoalKo: string;
  readonly kind: FreshIdeasSourceKind;
  readonly titleKo: string;
  readonly contentKo: string;
  readonly url: string;
  readonly secondDocTitleKo: string;
  readonly secondDocContentKo: string;
}

export function FreshIdeasSourceAndDeconstructDrawer({
  disabled = false,
  draft,
  bundle,
  deconstruction,
  blindSpotAxes,
  selectedBlindSpotAxis,
  onChangeDraft,
  onSelectBlindSpotAxis,
}: {
  readonly disabled?: boolean;
  readonly draft: CustomSourceDraftState;
  readonly bundle: MultiSourceIngestionBundle;
  readonly deconstruction: ThesisDeconstructionResult;
  readonly blindSpotAxes: readonly BlindSpotAxisFinding[];
  readonly selectedBlindSpotAxis?: BlindSpotAxisId;
  readonly onChangeDraft: (next: CustomSourceDraftState) => void;
  readonly onSelectBlindSpotAxis: (axis: BlindSpotAxisId) => void;
}) {
  const [open, setOpen] = useState(false);
  const coldStartOptions = buildColdStartChooser();
  const routeDecision = classifyFreshIdeasTriggerIntent(
    draft.promptOrGoalKo || "이 원문을 새 각도로 리믹스해줘",
  );

  return (
    <div className="rounded-lg border border-line bg-panel p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          data-testid="fresh-ideas-source-drawer-toggle"
          onClick={() => setOpen((prev) => !prev)}
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-fg hover:bg-raised ${MOTION_BTN}`}
        >
          <FileText size={15} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span>원문 멀티소스 입력 · 사전 해체 · 5축 사각지대 점검</span>
        </button>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums text-fg-3">
          <span data-testid="fresh-ideas-density-badge">
            밀도: {bundle.densityTier} · 소스 {bundle.sourceCount}건
          </span>
          {bundle.regulatedDomain !== "none" && (
            <span className="rounded border border-warn/40 bg-warn/10 px-2 py-0.5 text-warn">
              안전선: {bundle.regulatedDomain}
            </span>
          )}
        </div>
      </div>

      {open && (
        <div
          data-testid="fresh-ideas-source-drawer-body"
          className="mt-3 flex flex-col gap-3 border-t border-line pt-3"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {coldStartOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                data-testid={`fresh-ideas-cold-start-${opt.id}`}
                onClick={() =>
                  onChangeDraft({
                    ...draft,
                    enabled: true,
                    kind: opt.sampleKind,
                    titleKo: opt.sampleTitleKo,
                    contentKo: opt.sampleContentKo,
                  })
                }
                className={`flex min-h-11 flex-col items-start justify-between gap-1 rounded-lg border border-line bg-card p-2.5 text-left hover:border-accent ${MOTION_BTN}`}
              >
                <span className="text-xs font-medium text-fg">{opt.labelKo}</span>
                <span className="line-clamp-2 text-[11px] leading-4 text-fg-3">
                  {opt.promptHintKo}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
            <label className="flex flex-col gap-1 sm:col-span-5">
              <span className="text-[11px] font-medium text-fg-2">요청 의도 · 트리거 라우터 점검</span>
              <input
                type="text"
                disabled={disabled}
                data-testid="fresh-ideas-trigger-input"
                value={draft.promptOrGoalKo}
                placeholder="예: 이 아티클 새 각도로 리믹스해줘 / 요약만 해줘"
                onChange={(e) => onChangeDraft({ ...draft, promptOrGoalKo: e.target.value })}
                className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg"
              />
              <span
                data-testid="fresh-ideas-trigger-route-readout"
                className="font-mono text-[11px] text-fg-3"
              >
                라우팅 판정: {ROUTE_LABELS_KO[routeDecision]}
              </span>
            </label>

            <label className="flex flex-col gap-1 sm:col-span-3">
              <span className="text-[11px] font-medium text-fg-2">원문 소스 유형 (11종)</span>
              <select
                disabled={disabled}
                data-testid="fresh-ideas-source-kind-select"
                value={draft.kind}
                onChange={(e) =>
                  onChangeDraft({
                    ...draft,
                    enabled: true,
                    kind: e.target.value as FreshIdeasSourceKind,
                  })
                }
                className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
              >
                {SOURCE_KIND_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.labelKo}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 sm:col-span-4">
              <span className="text-[11px] font-medium text-fg-2">출처 URL (전 구간 보존)</span>
              <input
                type="url"
                disabled={disabled}
                data-testid="fresh-ideas-source-url-input"
                value={draft.url}
                placeholder="https://example.com/report"
                onChange={(e) => onChangeDraft({ ...draft, enabled: true, url: e.target.value })}
                className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-fg-2">주 원문 제목 · 본문</span>
              <input
                type="text"
                disabled={disabled}
                data-testid="fresh-ideas-source-title-input"
                value={draft.titleKo}
                placeholder="리믹스할 문서·회차·릴리즈 제목"
                onChange={(e) => onChangeDraft({ ...draft, enabled: true, titleKo: e.target.value })}
                className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg"
              />
              <textarea
                rows={2}
                disabled={disabled}
                data-testid="fresh-ideas-source-content-input"
                value={draft.contentKo}
                placeholder="기사 문단, 유튜브 자막, 회의 메모, 시트 요약 수치를 붙여 넣으세요."
                onChange={(e) => onChangeDraft({ ...draft, enabled: true, contentKo: e.target.value })}
                className="rounded-lg border border-line bg-card p-2.5 text-xs leading-5 text-fg"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-fg-2">
                교차 비교용 보조 원문 (선택 · 다중 문서 충돌 추출)
              </span>
              <input
                type="text"
                disabled={disabled}
                data-testid="fresh-ideas-second-title-input"
                value={draft.secondDocTitleKo}
                placeholder="두 번째 문서·댓글·인터뷰 제목 (선택)"
                onChange={(e) => onChangeDraft({ ...draft, enabled: true, secondDocTitleKo: e.target.value })}
                className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg"
              />
              <textarea
                rows={2}
                disabled={disabled}
                data-testid="fresh-ideas-second-content-input"
                value={draft.secondDocContentKo}
                placeholder="두 번째 관점이나 현장 반론을 입력하면 합의·충돌·공통 사각지대를 합성합니다."
                onChange={(e) => onChangeDraft({ ...draft, enabled: true, secondDocContentKo: e.target.value })}
                className="rounded-lg border border-line bg-card p-2.5 text-xs leading-5 text-fg"
              />
            </label>
          </div>

          <div
            data-testid="fresh-ideas-deconstruction-summary"
            className="grid grid-cols-1 gap-2 rounded-lg border border-line bg-card p-3 sm:grid-cols-2"
          >
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                <SlidersHorizontal size={14} strokeWidth={1.5} className="text-fg-2" aria-hidden />
                <span>사전 논지 해체 (숨은 전제 · 논리 도약 · 2차 파급)</span>
              </span>
              <p className="text-fg-2">전제 1: {deconstruction.unspokenAssumptionsKo[0]}</p>
              <p className="text-fg-2">논리 도약: {deconstruction.logicalLeapKo}</p>
              <p className="text-fg-3">합의/충돌: {bundle.directClashKo}</p>
            </div>
            <div className="space-y-1.5">
              <span className="block font-medium text-fg">5축 사각지대 스캐너 (05번 렌즈 축 전환)</span>
              <div className="flex flex-wrap gap-1.5">
                {blindSpotAxes.map((item) => {
                  const active = (selectedBlindSpotAxis ?? "maintenance-debt") === item.axis;
                  return (
                    <button
                      key={item.axis}
                      type="button"
                      disabled={disabled}
                      data-testid={`fresh-ideas-blindspot-${item.axis}`}
                      onClick={() => onSelectBlindSpotAxis(item.axis)}
                      className={`min-h-9 rounded-lg border px-2.5 py-1 font-mono text-[11px] tabular-nums ${
                        active
                          ? "border-accent bg-raised font-medium text-fg"
                          : "border-line bg-panel text-fg-3 hover:bg-raised"
                      } ${MOTION_BTN}`}
                    >
                      {item.labelKo} {item.score100}
                    </button>
                  );
                })}
              </div>
              {bundle.preservedUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {bundle.preservedUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-accent underline"
                    >
                      <span>원문 링크 확인</span>
                      <ExternalLink size={11} strokeWidth={1.5} aria-hidden />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function FreshIdeasModeCEcosystemPanel({
  disabled = false,
  lenses,
  modeC,
  exportNoticeKo,
  bankError,
  onImportLegacyBank,
  onReopenBank,
  savedRecords,
  onSaveToIdeaBank,
  onCopyDocsMarkdown,
  onExportSheetsCsv,
  onExportStorySeed,
  onChangeRecordStatus,
}: {
  readonly disabled?: boolean;
  readonly lenses: readonly FreshIdeaLensCardV2[];
  readonly modeC: ModeCEcosystemBundle;
  readonly exportNoticeKo: string;
  readonly bankError: string;
  readonly onImportLegacyBank: () => void;
  readonly onReopenBank: () => void;
  readonly savedRecords: readonly StoredIdeaBankRecord[];
  readonly onSaveToIdeaBank: () => void;
  readonly onCopyDocsMarkdown: () => void;
  readonly onExportSheetsCsv: () => void;
  readonly onExportStorySeed?: () => void;
  readonly onChangeRecordStatus: (recordId: string, status: IdeaBankSpreadsheetRow["draftStatus"]) => void;
}) {
  const [fusionIdxA, setFusionIdxA] = useState(0);
  const [fusionIdxB, setFusionIdxB] = useState(2);
  const [osmuTab, setOsmuTab] = useState<"newsletter" | "linkedin" | "shorts">("linkedin");

  const lensA = lenses[fusionIdxA] ?? lenses[0]!;
  const lensB = lenses[fusionIdxB] ?? lenses[Math.min(2, lenses.length - 1)]!;
  const customFusion = fuseTwoLensAngles(lensA, lensB);
  const activeOsmuDraft =
    osmuTab === "newsletter"
      ? modeC.osmuPackage.longFormNewsletter
      : osmuTab === "shorts"
        ? modeC.osmuPackage.shortFormThreadsOrShorts
        : modeC.osmuPackage.linkedInFeedCut;

  return (
    <div data-testid="fresh-ideas-mode-c-panel" className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={disabled}
            data-testid="fresh-ideas-save-bank-btn"
            onClick={onSaveToIdeaBank}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent bg-raised px-3 py-1.5 text-xs font-medium text-fg ${MOTION_BTN}`}
          >
            <Database size={14} strokeWidth={1.5} className="shrink-0" aria-hidden />
            <span>아이디어 뱅크 5행 저장</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            data-testid="fresh-ideas-export-story-seed-btn"
            onClick={onExportStorySeed}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent bg-card px-3 py-1.5 text-xs font-medium text-fg hover:bg-raised ${MOTION_BTN}`}
          >
            <FileText size={14} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden />
            <span>스토리 컷 시드로 보내기</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onImportLegacyBank}
            className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg-2 hover:bg-raised"
          >
            이전 브라우저 기록 가져오기
          </button>
          <button
            type="button"
            disabled={disabled}
            data-testid="fresh-ideas-copy-docs-btn"
            onClick={onCopyDocsMarkdown}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs text-fg-2 hover:bg-raised ${MOTION_BTN}`}
          >
            <Copy size={14} strokeWidth={1.5} className="shrink-0" aria-hidden />
            <span>Docs 마크다운+4시드 복사</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            data-testid="fresh-ideas-export-csv-btn"
            onClick={onExportSheetsCsv}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs text-fg-2 hover:bg-raised ${MOTION_BTN}`}
          >
            <Download size={14} strokeWidth={1.5} className="shrink-0" aria-hidden />
            <span>Sheets 7열 CSV 복사</span>
          </button>
        </div>
        {exportNoticeKo && (
          <span role="status" data-testid="fresh-ideas-export-notice" className="font-mono text-xs text-fg-2">
            {exportNoticeKo}
          </span>
        )}
      </div>

      {bankError && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
          <p role="alert">{bankError}</p>
          <button type="button" disabled={disabled} onClick={onReopenBank}
            className="min-h-11 rounded-lg border border-line bg-card px-3 hover:bg-raised">
            아이디어 뱅크 다시 열기
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-medium text-fg">
              <GitMerge size={14} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
              <span>40/60 하이브리드 각도 결합 ({customFusion.combinedLabelKo})</span>
            </span>
            <div className="flex items-center gap-1.5">
              <select
                aria-label="상단 40% 훅 렌즈 선택"
                data-testid="fresh-ideas-fusion-select-a"
                value={fusionIdxA}
                onChange={(e) => setFusionIdxA(Number(e.target.value))}
                className="min-h-9 rounded border border-line bg-panel px-2 text-xs text-fg"
              >
                {lenses.map((l, idx) => (
                  <option key={l.id} value={idx}>
                    상단 40%: {l.indexTag} {l.labelKo}
                  </option>
                ))}
              </select>
              <select
                aria-label="하단 60% 전개 렌즈 선택"
                data-testid="fresh-ideas-fusion-select-b"
                value={fusionIdxB}
                onChange={(e) => setFusionIdxB(Number(e.target.value))}
                className="min-h-9 rounded border border-line bg-panel px-2 text-xs text-fg"
              >
                {lenses.map((l, idx) => (
                  <option key={l.id} value={idx}>
                    하단 60%: {l.indexTag} {l.labelKo}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 leading-5 text-fg-2">{customFusion.top40HookFrameKo}</p>
          <p className="mt-1 leading-5 text-fg-3">{customFusion.bottom60ProofResolutionKo}</p>
        </div>

        <div className="rounded-lg border border-line bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-medium text-fg">
              <Layers size={14} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
              <span>1-to-3 OSMU 멀티포맷 패키지</span>
            </span>
            <div className="flex gap-1">
              {(
                [
                  ["linkedin", "링크드인"],
                  ["newsletter", "뉴스레터"],
                  ["shorts", "60초 쇼츠"],
                ] as const
              ).map(([tabId, label]) => (
                <button
                  key={tabId}
                  type="button"
                  data-testid={`fresh-ideas-osmu-${tabId}`}
                  onClick={() => setOsmuTab(tabId)}
                  className={`min-h-9 rounded border px-2.5 py-1 text-xs ${
                    osmuTab === tabId
                      ? "border-accent bg-raised font-medium text-fg"
                      : "border-line bg-panel text-fg-3"
                  } ${MOTION_BTN}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 font-medium text-fg">
            {activeOsmuDraft.headlineVariants.directThesisKo}
          </p>
          <p className="mt-1 whitespace-pre-line leading-5 text-fg-2">
            {activeOsmuDraft.bodySectionsKo[0]}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-card p-3">
          <span className="font-medium text-fg">
            5부작 연재 커리큘럼 · 스킬 체이닝 ({modeC.serializedSeries.length}부작)
          </span>
          <ul className="mt-2 space-y-1 text-fg-2">
            {modeC.serializedSeries.map((ep) => (
              <li key={ep.partNumber} className="truncate">
                {ep.episodeTitleKo}
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-1 border-t border-line pt-2 font-mono text-[11px] text-fg-3">
            <p className="inline-flex items-center gap-1">
              <CheckCircle2 size={12} strokeWidth={1.5} className="shrink-0 text-good" aria-hidden />
              {modeC.voiceChainingHintKo}
            </p>
            <p>{modeC.stressTestAdvisorPromptKo}</p>
            <p>{modeC.meetingAgendaBriefKo}</p>
            <p>{modeC.energyTaggingSummaryKo}</p>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-card p-3">
          <span className="font-medium text-fg">
            로컬 아이디어 뱅크 상태 관리 ({savedRecords.length}건 저장됨)
          </span>
          {savedRecords.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {savedRecords.slice(0, 5).map((rec) => (
                <li
                  key={rec.id}
                  className="flex items-center justify-between gap-2 rounded border border-line bg-panel px-2.5 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-fg-2">
                    <strong className="font-mono text-fg">{rec.lensId}</strong> · {rec.headlineKo}
                  </span>
                  <select
                    aria-label={`${rec.lensId} 진행 상태`}
                    data-testid={`fresh-ideas-bank-status-${rec.id}`}
                    value={rec.draftStatus}
                    onChange={(e) =>
                      onChangeRecordStatus(
                        rec.id,
                        e.target.value as IdeaBankSpreadsheetRow["draftStatus"],
                      )
                    }
                    className="min-h-9 rounded border border-line bg-card px-2 font-mono text-[11px] text-fg"
                  >
                    <option value="Seed">Seed</option>
                    <option value="Drafted">Drafted</option>
                    <option value="Published">Published</option>
                  </select>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-fg-3">
              상단 [아이디어 뱅크 5행 저장] 버튼을 누르면 7열 메타데이터 시드가 브라우저에 보관됩니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
