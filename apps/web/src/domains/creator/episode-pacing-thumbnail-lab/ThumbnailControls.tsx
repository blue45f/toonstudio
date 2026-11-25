import { CheckCircle2 } from "lucide-react";
import type { ReactElement } from "react";
import { MIN_THUMBNAIL_TITLE_PX, THUMBNAIL_TONE_PRESETS, getThumbnailTonePreset, type ThumbnailCandidateInput, type ThumbnailPlatformCandidateAudit, type ThumbnailTonePresetId, type WarningSeverity } from "./episode-pacing-thumbnail-engine";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const scoreTone = (score: number): string => (score >= 78 ? "text-good" : score >= 56 ? "text-warn" : "text-bad");
const severityTone = (severity: WarningSeverity): string => severity === "critical" ? "border-bad bg-bad-soft text-bad" : severity === "warn" ? "border-warn bg-warning-soft text-warn" : "border-cool bg-info-soft text-cool";

function surfaceBackdropClass(token: "dark" | "cool" | "paper" | "muted" | "accent"): string {
  if (token === "dark") return "text-fg";
  if (token === "cool") return "text-cool";
  if (token === "paper") return "text-canvas";
  if (token === "accent") return "text-accent";
  return "text-raised";
}

function surfaceTitleClass(token: "light" | "dark" | "accent"): string {
  if (token === "dark") return "text-fg";
  if (token === "accent") return "text-accent";
  return "text-canvas";
}

function ThumbnailCropPreviewSvg(props: {
  readonly candidate: ThumbnailCandidateInput;
  readonly audit: ThumbnailPlatformCandidateAudit;
  readonly showOverlays: boolean;
  readonly isEn: boolean;
}): ReactElement {
  const { candidate, audit, showOverlays, isEn } = props;
  const { platform, projectedFaceRect, projectedEyeBandRect, projectedTitleRect, badgePlacements, badgeCollisions } = audit;
  const tone = getThumbnailTonePreset(candidate.tonePresetId);
  const clipId = `thumb-clip-${candidate.id}-${platform.id}`;
  const eyeCollided = badgeCollisions.some((c) => c.target === "eyes");
  const titleCollided = badgeCollisions.some((c) => c.target === "title");
  const collidedBadges = new Set(badgeCollisions.map((c) => c.badge));
  const faceCx = projectedFaceRect.x + projectedFaceRect.width * 0.5;
  const faceCy = projectedFaceRect.y + projectedFaceRect.height * 0.5;
  const eyeY = projectedEyeBandRect.y + projectedEyeBandRect.height * 0.5;
  const safeM = platform.safeMarginPx;

  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-raised p-3">
      <div className="flex w-full items-center justify-between text-[11px] text-fg-3 tabular-nums">
        <span className="font-semibold text-fg-2">{isEn ? platform.labelEn : platform.labelKo}</span>
        <span>{`${platform.widthPx}×${platform.heightPx}px · ${audit.scaleFactor}×`}</span>
      </div>
      <svg
        data-testid={`thumb-preview-svg-${candidate.id}`}
        data-platform={platform.id}
        data-score={audit.totalScore}
        data-eye-clipped={audit.eyeClipped ? "true" : "false"}
        data-title-px={audit.scaledTitleFontPx}
        viewBox={`0 0 ${platform.widthPx} ${platform.heightPx}`}
        width={platform.widthPx}
        height={platform.heightPx}
        className="max-w-full rounded-lg border border-line-strong text-fg"
        role="img"
        aria-label={isEn ? `Candidate ${candidate.id} ${platform.labelEn} reduced crop preview` : `후보 ${candidate.id} ${platform.labelKo} 축소 크롭 프리뷰`}
      >
        <defs><clipPath id={clipId}><rect x="0" y="0" width={platform.widthPx} height={platform.heightPx} rx="4" /></clipPath></defs>
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="0" width={platform.widthPx} height={platform.heightPx} className={surfaceBackdropClass(tone.backdropSurfaceToken)} fill="currentColor" fillOpacity={tone.backdropSurfaceToken === "paper" ? 1 : 0.9} />
          <ellipse cx={faceCx} cy={projectedFaceRect.y + projectedFaceRect.height * 1.38} rx={projectedFaceRect.width * 0.85} ry={projectedFaceRect.height * 0.62} className="text-fg-2" fill="currentColor" fillOpacity={0.28} />
          <ellipse cx={faceCx} cy={faceCy} rx={Math.max(4, projectedFaceRect.width * 0.48)} ry={Math.max(5, projectedFaceRect.height * 0.5)} className={tone.backdropSurfaceToken === "paper" ? "text-fg-2" : "text-canvas"} fill="currentColor" fillOpacity={0.26} />
          <rect x={projectedFaceRect.x} y={projectedFaceRect.y} width={projectedFaceRect.width} height={projectedFaceRect.height} rx="4" className={audit.faceClipped ? "text-warn" : "text-good"} fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />
          <rect x={projectedEyeBandRect.x} y={projectedEyeBandRect.y} width={projectedEyeBandRect.width} height={projectedEyeBandRect.height} rx="2" className={audit.eyeClipped || eyeCollided ? "text-bad" : "text-good"} fill="currentColor" fillOpacity={audit.eyeClipped || eyeCollided ? 0.42 : 0.22} stroke="currentColor" strokeWidth="1" />
          <circle cx={faceCx - projectedFaceRect.width * 0.16} cy={eyeY} r={Math.max(1.8, Math.min(3.4, projectedFaceRect.width * 0.06))} className={audit.eyeClipped || eyeCollided ? "text-bad" : "text-fg"} fill="currentColor" />
          <circle cx={faceCx + projectedFaceRect.width * 0.16} cy={eyeY} r={Math.max(1.8, Math.min(3.4, projectedFaceRect.width * 0.06))} className={audit.eyeClipped || eyeCollided ? "text-bad" : "text-fg"} fill="currentColor" />

          {candidate.hasTitleScrim ? (
            <rect x={Math.max(0, projectedTitleRect.x - 4)} y={Math.max(0, projectedTitleRect.y - 2)} width={projectedTitleRect.width + 8} height={projectedTitleRect.height + 4} rx="3" className={tone.titleSurfaceToken === "dark" ? "text-canvas" : "text-fg"} fill="currentColor" fillOpacity={0.78} />
          ) : null}
          <rect x={projectedTitleRect.x} y={projectedTitleRect.y} width={projectedTitleRect.width} height={projectedTitleRect.height} rx="2" className={!audit.titleMeetsMinHeight || titleCollided ? "text-bad" : "text-accent"} fill="none" stroke="currentColor" strokeOpacity={0.75} strokeWidth="1" strokeDasharray={!audit.titleMeetsMinHeight || titleCollided ? "2 2" : undefined} />
          <text
            x={projectedTitleRect.x + projectedTitleRect.width * 0.5}
            y={projectedTitleRect.y + projectedTitleRect.height * 0.68}
            textAnchor="middle"
            fontSize={Math.max(7, Math.min(22, audit.scaledTitleFontPx))}
            fontWeight="800"
            className={surfaceTitleClass(tone.titleSurfaceToken)}
            fill="currentColor"
          >
            {candidate.titleText.trim() || (isEn ? "Title" : "작품명")}
          </text>

          {showOverlays ? (
            <g data-testid={`thumb-overlay-group-${candidate.id}`}>
              <rect x={safeM} y={safeM} width={platform.widthPx - safeM * 2} height={platform.heightPx - safeM * 2} rx="3" className="text-warn" fill="none" stroke="currentColor" strokeOpacity={0.65} strokeWidth="1" strokeDasharray="4 3" />
              {badgePlacements.map((p) => {
                const hit = collidedBadges.has(p.badge);
                return (
                  <g key={`${p.badge}-${p.corner}`} data-testid={`thumb-badge-${candidate.id}-${p.badge}`} data-collided={hit ? "true" : "false"}>
                    <rect x={p.rect.x} y={p.rect.y} width={p.rect.width} height={p.rect.height} rx="3" className={hit ? "text-bad" : p.badge === "19" ? "text-warn" : "text-accent"} fill="currentColor" fillOpacity={0.92} />
                    <text x={p.rect.x + p.rect.width * 0.5} y={p.rect.y + p.rect.height * 0.72} textAnchor="middle" fontSize="9" fontWeight="800" className="text-canvas" fill="currentColor">{p.badge}</text>
                    {hit ? <rect x={p.rect.x - 1.5} y={p.rect.y - 1.5} width={p.rect.width + 3} height={p.rect.height + 3} rx="4" className="text-bad" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" /> : null}
                  </g>
                );
              })}
            </g>
          ) : null}
        </g>
      </svg>
    </div>
  );
}

export function CandidateControlCard(props: {
  readonly candidate: ThumbnailCandidateInput;
  readonly audit: ThumbnailPlatformCandidateAudit;
  readonly allPrescriptionsCount: number;
  readonly showOverlays: boolean;
  readonly isWinner: boolean;
  readonly isEn: boolean;
  readonly uid: string;
  readonly onChange: (patch: Partial<ThumbnailCandidateInput>) => void;
  readonly onSelectTone: (toneId: ThumbnailTonePresetId) => void;
}): ReactElement {
  const { candidate, audit, allPrescriptionsCount, showOverlays, isWinner, isEn, uid, onChange, onSelectTone } = props;
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const titleId = `${uid}-title-${candidate.id}`;
  const toneId = `${uid}-tone-${candidate.id}`;
  const fxId = `${uid}-fx-${candidate.id}`;
  const fyId = `${uid}-fy-${candidate.id}`;
  const zoomId = `${uid}-zoom-${candidate.id}`;
  const fontId = `${uid}-font-${candidate.id}`;

  return (
    <div data-testid={`thumb-candidate-card-${candidate.id}`} className={`space-y-3 rounded-xl border p-4 ${isWinner ? "border-accent bg-card" : "border-line bg-canvas"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${isWinner ? "bg-accent text-on-accent" : "bg-raised text-fg"}`}>
            {pick(`후보 ${candidate.id}`, `Candidate ${candidate.id}`)}
          </span>
          <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? candidate.labelEn : candidate.labelKo}</span>
        </div>
        <span data-testid={`thumb-platform-score-${candidate.id}`} className={`text-sm font-bold tabular-nums ${scoreTone(audit.totalScore)}`}>
          {`${audit.totalScore} / 100`}
        </span>
      </div>

      <ThumbnailCropPreviewSvg candidate={candidate} audit={audit} showOverlays={showOverlays} isEn={isEn} />

      <div className="grid grid-cols-2 gap-2 text-[11px] tabular-nums sm:grid-cols-4">
        <div className="rounded-lg border border-line bg-raised px-2.5 py-1.5">
          <div className="text-fg-3">{pick("축소 타이틀", "Scaled Title")}</div>
          <div data-testid={`thumb-title-px-${candidate.id}`} className={`font-bold ${audit.titleMeetsMinHeight ? "text-good" : "text-bad"}`}>
            {`${audit.scaledTitleFontPx}px ${audit.titleMeetsMinHeight ? "OK" : `<${MIN_THUMBNAIL_TITLE_PX}`}`}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-raised px-2.5 py-1.5">
          <div className="text-fg-3">{pick("WCAG · APCA", "WCAG · APCA")}</div>
          <div data-testid={`thumb-contrast-${candidate.id}`} className={`font-bold ${audit.contrast.grade === "fail" ? "text-bad" : audit.contrast.grade === "borderline" ? "text-warn" : "text-good"}`}>
            {`${audit.contrast.wcagContrastRatio}:1 · Lc ${audit.contrast.apcaAbsLc}`}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-raised px-2.5 py-1.5">
          <div className="text-fg-3">{pick("눈·얼굴 노출", "Eye / Face")}</div>
          <div className={`font-bold ${audit.eyeClipped ? "text-bad" : audit.faceClipped ? "text-warn" : "text-good"}`}>
            {`${Math.round(audit.eyeVisibleRatio * 100)}% / ${Math.round(audit.faceVisibleRatio * 100)}%`}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-raised px-2.5 py-1.5">
          <div className="text-fg-3">{pick("배지 충돌", "Badge Hits")}</div>
          <div data-testid={`thumb-badge-hits-${candidate.id}`} className={`font-bold ${audit.badgeCollisions.length > 0 ? "text-bad" : "text-good"}`}>
            {pick(`${audit.badgeCollisions.length}건`, `${audit.badgeCollisions.length}`)}
          </div>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={titleId} className="block text-[11px] font-medium text-fg-2">{pick("타이틀 문구", "Title Text")}</label>
          <input id={titleId} data-testid={`thumb-title-input-${candidate.id}`} type="text" maxLength={4096} value={candidate.titleText} onChange={(e) => onChange({ titleText: e.target.value })} className={`min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg ${FOCUS_RING}`} />
        </div>
        <div className="space-y-1">
          <label htmlFor={toneId} className="block text-[11px] font-medium text-fg-2">{pick("배경·타이틀 톤 (OKLCH)", "Tone Preset (OKLCH)")}</label>
          <select id={toneId} data-testid={`thumb-tone-select-${candidate.id}`} value={candidate.tonePresetId} onChange={(e) => onSelectTone(e.target.value as ThumbnailTonePresetId)} className={`min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg ${FOCUS_RING}`}>
            {THUMBNAIL_TONE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{isEn ? preset.labelEn : preset.labelKo}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]"><label htmlFor={fxId} className="text-fg-2">{pick("크롭 초점 X", "Focal X")}</label><span className="font-semibold tabular-nums">{candidate.focalX.toFixed(2)}</span></div>
          <input id={fxId} data-testid={`thumb-focal-x-${candidate.id}`} type="range" min={0.1} max={0.9} step={0.02} value={candidate.focalX} onChange={(e) => onChange({ focalX: Number(e.target.value) })} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]"><label htmlFor={fyId} className="text-fg-2">{pick("크롭 초점 Y", "Focal Y")}</label><span className="font-semibold tabular-nums">{candidate.focalY.toFixed(2)}</span></div>
          <input id={fyId} data-testid={`thumb-focal-y-${candidate.id}`} type="range" min={0.1} max={0.9} step={0.02} value={candidate.focalY} onChange={(e) => onChange({ focalY: Number(e.target.value) })} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]"><label htmlFor={zoomId} className="text-fg-2">{pick("확대 줌", "Zoom")}</label><span className="font-semibold tabular-nums">{`${candidate.zoom.toFixed(2)}×`}</span></div>
          <input id={zoomId} data-testid={`thumb-zoom-${candidate.id}`} type="range" min={1} max={2} step={0.04} value={candidate.zoom} onChange={(e) => onChange({ zoom: Number(e.target.value) })} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]"><label htmlFor={fontId} className="text-fg-2">{pick("원본 타이틀 폰트", "Source Font")}</label><span className="font-semibold tabular-nums">{`${candidate.sourceTitleFontPx}px`}</span></div>
          <input id={fontId} data-testid={`thumb-font-${candidate.id}`} type="range" min={36} max={120} step={2} value={candidate.sourceTitleFontPx} onChange={(e) => onChange({ sourceTitleFontPx: Number(e.target.value) })} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" data-testid={`thumb-scrim-toggle-${candidate.id}`} aria-pressed={candidate.hasTitleScrim} onClick={() => onChange({ hasTitleScrim: !candidate.hasTitleScrim })} className={candidate.hasTitleScrim ? BTN_ACTIVE : BTN_OUTLINE}>
          {candidate.hasTitleScrim ? pick("타이틀 스크림 ON", "Title Scrim ON") : pick("타이틀 스크림 OFF", "Title Scrim OFF")}
        </button>
        <span className="text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">
          {pick(`3규격 누적 개선 처방 ${allPrescriptionsCount}건`, `${allPrescriptionsCount} prescriptions across 3 specs`)}
        </span>
      </div>

      <div data-testid={`thumb-prescriptions-${candidate.id}`} className="space-y-1.5">
        {audit.prescriptions.length === 0 ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-good bg-good-soft px-3 py-2 text-xs font-medium text-good [word-break:keep-all]">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{pick("이 예제 모델의 안전영역·타이틀·대비 조건을 충족합니다. 공식 규격·저작권 확인은 별도입니다.", "Passes this example model. Official specifications and rights are not verified.")}</span>
          </div>
        ) : (
          audit.prescriptions.map((rx) => (
            <div key={rx.id} className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${severityTone(rx.severity)}`}>
              {isEn ? rx.messageEn : rx.messageKo}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
