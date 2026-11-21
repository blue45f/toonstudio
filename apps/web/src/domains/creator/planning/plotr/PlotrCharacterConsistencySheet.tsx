/**
 * Plotr 캐릭터 일관성 바이블 시트 · 드리프트 자동 감지 · 원클릭 동기화 ·
 * 콘티 시트 클립보드 복사 & HTML5 Canvas 4컷 비주얼 콘티 PNG 다운로드 패널.
 */
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  ImageDown,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import {
  PLOTR_CHARACTER_PALETTE_PRESETS,
  PLOTR_EXPRESSION_LOCK_META,
  PLOTR_EXPRESSION_LOCK_ORDER,
  syncCharacterConsistencyAcrossCuts,
  updateCharacterBibleOnAsset,
  type PlotrCharacterBibleProfile,
  type PlotrCharacterConsistencyAudit,
} from "./plotr-character-sheet-model";
import {
  buildVisualContiSummaryText,
  downloadVisualStoryboardPng,
} from "./plotr-visual-canvas-export";
import type {
  PlotrCharacterPalette,
  PlotrDocumentState,
  PlotrExpressionLockId,
} from "./plotr-types";

export interface PlotrCharacterConsistencySheetProps {
  readonly document: PlotrDocumentState;
  readonly audit: PlotrCharacterConsistencyAudit;
  readonly onUpdateDocument: (
    updater: (prev: PlotrDocumentState) => PlotrDocumentState,
    noticeKo?: string,
  ) => void;
}

const BTN =
  "plotr-btn-tactile inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function MiniPortraitSvg({
  profile,
}: {
  readonly profile: PlotrCharacterBibleProfile;
}) {
  const expr = PLOTR_EXPRESSION_LOCK_META[profile.expressionLock];
  const skin = "oklch(0.91 0.03 68)";
  const ink = "oklch(0.2 0.03 255)";
  const mouthY = 47;
  const mouthCtrlY = mouthY + expr.mouthCurve * 0.7;

  return (
    <svg
      role="img"
      aria-label={`${profile.name} 캐릭터 바이블 아바타 — ${expr.labelKo} 표정`}
      viewBox="0 0 72 72"
      className="size-16 shrink-0 rounded-xl border border-line bg-panel"
    >
      <rect x={0} y={0} width={72} height={72} fill="var(--plotr-svg-avatar-tint, var(--color-panel))" />
      {/* 대표 의상 어깨 */}
      <path
        d="M 10 72 C 14 55, 24 50, 36 50 C 48 50, 58 55, 62 72 Z"
        fill={profile.palette.outfitOklch}
      />
      {/* 뒷머리 */}
      <circle cx={36} cy={31} r={20} fill={profile.palette.hairOklch} />
      {/* 얼굴 */}
      <ellipse cx={36} cy={34} rx={14} ry={16} fill={skin} stroke={ink} strokeWidth={1} />
      {/* 앞머리 */}
      <path
        d="M 20 31 C 22 14, 50 14, 52 31 C 45 25, 39 28, 36 25 C 31 28, 26 25, 20 31 Z"
        fill={profile.palette.hairOklch}
      />
      {/* 눈썹 */}
      <line
        x1={27}
        y1={30 - expr.browTilt * 0.2}
        x2={33}
        y2={30 + expr.browTilt * 0.25}
        stroke={ink}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <line
        x1={39}
        y1={30 + expr.browTilt * 0.25}
        x2={45}
        y2={30 - expr.browTilt * 0.2}
        stroke={ink}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* 눈동자 (고정 눈색 OKLCH) */}
      <ellipse cx={30} cy={35} rx={2.5} ry={2.7 * expr.eyeScaleY} fill={profile.palette.eyeOklch} />
      <ellipse cx={42} cy={35} rx={2.5} ry={2.7 * expr.eyeScaleY} fill={profile.palette.eyeOklch} />
      {/* 입 */}
      <path
        d={`M 32 ${mouthY} Q 36 ${mouthCtrlY} 40 ${mouthY}`}
        fill="none"
        stroke={ink}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlotrCharacterConsistencySheet({
  document,
  audit,
  onUpdateDocument,
}: PlotrCharacterConsistencySheetProps) {
  const [sheetNoticeKo, setSheetNoticeKo] = useState<string | null>(null);

  const handleSyncAllCuts = () => {
    const synced = syncCharacterConsistencyAcrossCuts(document);
    const notice =
      synced.fixedIssueCount > 0 ||
      synced.addedCharacterCount > 0 ||
      synced.linkedCutCount > 0
        ? `전 컷 일관성을 동기화했어요 (불일치 ${synced.fixedIssueCount}건 해소 · 참조 연결 ${synced.linkedCutCount}컷 · 일관성 ${synced.auditAfter.consistencyScore}%).`
        : "모든 컷의 인물 이름과 참조가 이미 100% 일치해요.";
    onUpdateDocument(() => synced.nextDocument, notice);
    setSheetNoticeKo(notice);
  };

  const handleCopyContiSummary = async () => {
    const summary = buildVisualContiSummaryText(document, audit);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
        setSheetNoticeKo("비주얼 콘티 & 캐릭터 바이블 요약을 클립보드에 복사했어요.");
        return;
      }
    } catch {
      // 클립보드 권한이 제한된 환경에서도 실패 없이 안내한다.
    }
    setSheetNoticeKo(
      `콘티 요약 ${summary.split("\n").length}줄을 준비했어요. 브라우저 클립보드 권한을 허용하면 바로 복사됩니다.`,
    );
  };

  const handleDownloadVisualPng = () => {
    const result = downloadVisualStoryboardPng(document, audit);
    setSheetNoticeKo(result.messageKo);
  };

  const handleSelectPalette = (assetId: string, palette: PlotrCharacterPalette) => {
    onUpdateDocument(
      (prev) => ({
        ...prev,
        assets: updateCharacterBibleOnAsset(prev.assets, assetId, { palette }),
      }),
      `인물 대표 3색 팔레트를 '${palette.presetLabelKo}'로 잠갔어요.`,
    );
  };

  const handleSelectExpression = (
    assetId: string,
    expressionLock: PlotrExpressionLockId,
  ) => {
    const label = PLOTR_EXPRESSION_LOCK_META[expressionLock].labelKo;
    onUpdateDocument(
      (prev) => ({
        ...prev,
        assets: updateCharacterBibleOnAsset(prev.assets, assetId, { expressionLock }),
      }),
      `표정 락을 '${label}' 상태로 전환해 비주얼 컷에 반영했어요.`,
    );
  };

  const hasIssues = audit.issues.length > 0;

  return (
    <section
      aria-label="캐릭터 일관성 바이블 시트"
      data-testid="plotr-character-consistency-sheet"
      className="space-y-3 rounded-xl border border-line bg-panel p-3.5"
    >
      {/* 상단 감사 요약 + 원클릭 동기화 / 복사 / PNG 저장 */}
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
              <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
              <span>캐릭터 일관성 바이블 &amp; 드리프트 감사</span>
            </h3>
            <span
              data-testid="plotr-consistency-score"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${
                hasIssues
                  ? "border-warn/50 bg-warn/10 text-warn"
                  : "border-good/50 bg-good/10 text-good"
              }`}
            >
              {hasIssues ? (
                <AlertTriangle className="size-3" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-3" aria-hidden="true" />
              )}
              <span>일관성 {audit.consistencyScore}%</span>
            </span>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">{audit.summaryKo}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="plotr-sync-character-consistency-btn"
            disabled={document.cuts.length === 0 && audit.profiles.length === 0}
            title={
              document.cuts.length === 0 && audit.profiles.length === 0
                ? "먼저 아이디어나 샘플로 컷을 만들어 주세요"
                : undefined
            }
            onClick={handleSyncAllCuts}
            className={`${BTN} ${
              hasIssues
                ? "plotr-spectrum-cta"
                : "border-accent/50 bg-accent-soft text-accent"
            } disabled:opacity-40`}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            <span>전 컷 일관성 동기화</span>
          </button>

          <button
            type="button"
            data-testid="plotr-copy-conti-summary-btn"
            disabled={document.cuts.length === 0}
            title={document.cuts.length === 0 ? "먼저 컷을 만들어 주세요" : undefined}
            onClick={() => void handleCopyContiSummary()}
            className={`${BTN} border-line bg-card text-fg hover:bg-raised disabled:opacity-40`}
          >
            <ClipboardCopy className="size-3.5" aria-hidden="true" />
            <span>콘티 시트 복사</span>
          </button>

          <button
            type="button"
            data-testid="plotr-download-visual-png-btn"
            disabled={document.cuts.length === 0}
            title={document.cuts.length === 0 ? "먼저 컷을 만들어 주세요" : undefined}
            onClick={handleDownloadVisualPng}
            className={`${BTN} border-line bg-card text-fg hover:bg-raised disabled:opacity-40`}
          >
            <ImageDown className="size-3.5" aria-hidden="true" />
            <span>4컷 콘티 PNG 저장</span>
          </button>
        </div>
      </div>

      {/* 일관성 진척 바 */}
      <div
        aria-hidden="true"
        className="h-1.5 w-full overflow-hidden rounded-full bg-card"
      >
        <div
          className="plotr-meter-fill h-full rounded-full"
          style={{
            width: `${audit.consistencyScore}%`,
            backgroundColor: hasIssues ? "var(--color-warn)" : "var(--color-good)",
          }}
        />
      </div>

      {sheetNoticeKo ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="plotr-consistency-sheet-notice"
          className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg"
        >
          {sheetNoticeKo}
        </p>
      ) : null}

      {/* 드리프트 자동 감지 알림 목록 */}
      {hasIssues ? (
        <div
          role="alert"
          data-testid="plotr-consistency-drift-panel"
          className="space-y-1.5 rounded-xl border border-warn/45 bg-warn/10 p-3 text-xs text-warn"
        >
          <p className="font-bold tabular-nums">
            자동 감지된 캐릭터 일관성 드리프트 ({audit.issues.length}건)
          </p>
          <ul className="space-y-1">
            {audit.issues.slice(0, 5).map((issue) => (
              <li key={issue.id} className="leading-relaxed [word-break:keep-all]">
                · {issue.messageKo}
              </li>
            ))}
          </ul>
          {audit.issues.length > 5 ? (
            <p className="text-[11px] tabular-nums">
              외 {audit.issues.length - 5}건 더 있음 — ‘전 컷 일관성 동기화’로 한 번에 해결할 수 있어요.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 등록 인물별 일관성 바이블 카드 */}
      {audit.profiles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-card px-4 py-5 text-center text-xs text-fg-2">
          등록된 인물 바이블이 아직 없어요. 위 1문장 아이디어 생성기나 장르 샘플을 누르면 인물 3색 팔레트·표정 락이 자동 구성돼요.
        </p>
      ) : (
        <div
          data-testid="plotr-character-bible-grid"
          className="grid gap-3 md:grid-cols-2"
        >
          {audit.profiles.map((profile, idx) => {
            const isClean = profile.consistencyScore === 100;
            return (
              <article
                key={profile.assetId}
                data-testid={`plotr-character-bible-card-${profile.assetId}`}
                style={{
                  ["--plotr-index" as string]: idx,
                  ["--char-hair" as string]: profile.palette.hairOklch,
                  ["--char-outfit" as string]: profile.palette.outfitOklch,
                }}
                className="plotr-bible-card plotr-stagger-card space-y-2.5 rounded-xl p-3"
              >
                <div className="flex items-start gap-3">
                  <MiniPortraitSvg profile={profile} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <h4 className="text-sm font-bold text-fg">{profile.name}</h4>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                          isClean
                            ? "border-good/45 bg-good/10 text-good"
                            : "border-warn/45 bg-warn/10 text-warn"
                        }`}
                      >
                        {isClean
                          ? "일관성 통과"
                          : `누락 ${profile.missingReferenceCutIds.length}컷`}
                      </span>
                    </div>
                    <p className="text-[11px] text-fg-2 tabular-nums">
                      등장 컷:{" "}
                      {profile.appearanceCutLabels.length > 0
                        ? profile.appearanceCutLabels.join(" · ")
                        : "미배정"}
                    </p>
                    {/* 대표 3색 팔레트 스와치 */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-2">
                      <span className="inline-flex items-center gap-1">
                        <span
                          aria-hidden="true"
                          className="size-3 rounded-full border border-line"
                          style={{ backgroundColor: profile.palette.hairOklch }}
                        />
                        <span>머리색</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span
                          aria-hidden="true"
                          className="size-3 rounded-full border border-line"
                          style={{ backgroundColor: profile.palette.eyeOklch }}
                        />
                        <span>눈색</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span
                          aria-hidden="true"
                          className="size-3 rounded-full border border-line"
                          style={{ backgroundColor: profile.palette.outfitOklch }}
                        />
                        <span>의상색</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* 대표 3색 팔레트 프리셋 빠른 교체 */}
                <div
                  role="group"
                  aria-label={`${profile.name} 대표 3색 팔레트 선택`}
                  className="flex flex-wrap gap-1"
                >
                  {PLOTR_CHARACTER_PALETTE_PRESETS.slice(0, 4).map((preset, pIdx) => {
                    const active =
                      profile.palette.hairOklch === preset.hairOklch &&
                      profile.palette.outfitOklch === preset.outfitOklch;
                    return (
                      <button
                        key={preset.presetLabelKo}
                        type="button"
                        aria-pressed={active}
                        data-testid={`plotr-char-palette-${profile.assetId}-${pIdx}`}
                        onClick={() => handleSelectPalette(profile.assetId, preset)}
                        className={`plotr-btn-tactile inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          active
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-line bg-panel text-fg-2 hover:text-fg"
                        }`}
                      >
                        <span className="inline-flex items-center -space-x-1" aria-hidden="true">
                          <span
                            className="size-2.5 rounded-full border border-card"
                            style={{ backgroundColor: preset.hairOklch }}
                          />
                          <span
                            className="size-2.5 rounded-full border border-card"
                            style={{ backgroundColor: preset.eyeOklch }}
                          />
                          <span
                            className="size-2.5 rounded-full border border-card"
                            style={{ backgroundColor: preset.outfitOklch }}
                          />
                        </span>
                        <span>{preset.presetLabelKo.split(" · ")[0]}</span>
                      </button>
                    );
                  })}
                </div>

                {/* 4종 표정 락 (평온 · 긴장 · 분노 · 미소) */}
                <div
                  role="group"
                  aria-label={`${profile.name} 표정 락 선택`}
                  className="grid grid-cols-4 gap-1"
                >
                  {PLOTR_EXPRESSION_LOCK_ORDER.map((exprId) => {
                    const meta = PLOTR_EXPRESSION_LOCK_META[exprId];
                    const active = profile.expressionLock === exprId;
                    return (
                      <button
                        key={exprId}
                        type="button"
                        aria-pressed={active}
                        data-testid={`plotr-char-expr-${profile.assetId}-${exprId}`}
                        onClick={() => handleSelectExpression(profile.assetId, exprId)}
                        className={`plotr-btn-tactile inline-flex min-h-11 items-center justify-center rounded-lg border px-2 text-[11px] font-semibold [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          active
                            ? "border-accent bg-accent text-on-accent"
                            : "border-line bg-panel text-fg-2 hover:text-fg"
                        }`}
                      >
                        {meta.labelKo}
                      </button>
                    );
                  })}
                </div>

                {/* 시그니처 소품 / 실루엣 규칙 */}
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <label className="block text-[11px] font-semibold text-fg-3">
                    시그니처 소품
                    <input
                      type="text"
                      value={profile.signatureProp}
                      data-testid={`plotr-char-prop-${profile.assetId}`}
                      onChange={(e) =>
                        onUpdateDocument((prev) => ({
                          ...prev,
                          assets: updateCharacterBibleOnAsset(prev.assets, profile.assetId, {
                            signatureProp: e.target.value,
                          }),
                        }))
                      }
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs font-normal text-fg"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-fg-3">
                    실루엣 고정 규칙
                    <input
                      type="text"
                      value={profile.silhouetteRule}
                      data-testid={`plotr-char-silhouette-${profile.assetId}`}
                      onChange={(e) =>
                        onUpdateDocument((prev) => ({
                          ...prev,
                          assets: updateCharacterBibleOnAsset(prev.assets, profile.assetId, {
                            silhouetteRule: e.target.value,
                          }),
                        }))
                      }
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs font-normal text-fg"
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default PlotrCharacterConsistencySheet;
