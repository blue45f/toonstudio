import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef } from "react";

import {
  getStageMeta,
  type CrecoPinFeedback,
  type FeedbackImportance,
  type FeedbackStatus,
  type RedlinePoint,
  type RedlineTone,
  type ToonStudioCanvasJumpPayload,
} from "./creco-version-compare-engine";

export interface StudioCrecoPinFeedbackSectionProps {
  readonly feedbacks: readonly CrecoPinFeedback[];
  readonly activeCutIndex: number;
  readonly pinModeActive: boolean;
  readonly privateDraftCount: number;
  readonly pinImportance: FeedbackImportance;
  readonly pinTone: RedlineTone;
  readonly pinDraftBody: string;
  readonly pinCoords: RedlinePoint;
  readonly draftRedlinePoints: readonly RedlinePoint[];
  readonly lastCanvasJump: ToonStudioCanvasJumpPayload | null;
  readonly onTogglePinMode: () => void;
  readonly onPublishDrafts: () => void;
  readonly onChangeImportance: (value: FeedbackImportance) => void;
  readonly onChangeTone: (value: RedlineTone) => void;
  readonly onChangeDraftBody: (value: string) => void;
  readonly onChangePinCoords: (pt: RedlinePoint) => void;
  readonly onUpdateDraftStroke: (points: readonly RedlinePoint[]) => void;
  readonly onPlacePinFeedback: () => void;
  readonly onCanvasJump: (feedbackId: string) => void;
  readonly onToggleResolve: (feedbackId: string, nextStatus: FeedbackStatus) => void;
}

const REDLINE_STROKE_VAR: Readonly<Record<RedlineTone, string>> = {
  crimson: "var(--ccv-redline-crimson)",
  amber: "var(--ccv-redline-amber)",
  cobalt: "var(--ccv-redline-cobalt)",
};

const IMPORTANCE_LABEL: Readonly<Record<FeedbackImportance, string>> = {
  required: "필수",
  recommended: "권장",
  suggestion: "제안",
};

const STATUS_LABEL: Readonly<Record<FeedbackStatus, string>> = {
  open: "열림",
  "in-progress": "수정 중",
  resolved: "해결됨",
};

function pointsToPolyline(points: readonly RedlinePoint[]): string {
  return points.map((pt) => `${pt.xPct},${pt.yPct}`).join(" ");
}

export function StudioCrecoPinFeedbackSection({
  feedbacks,
  activeCutIndex,
  pinModeActive,
  privateDraftCount,
  pinImportance,
  pinTone,
  pinDraftBody,
  pinCoords,
  draftRedlinePoints,
  lastCanvasJump,
  onTogglePinMode,
  onPublishDrafts,
  onChangeImportance,
  onChangeTone,
  onChangeDraftBody,
  onChangePinCoords,
  onUpdateDraftStroke,
  onPlacePinFeedback,
  onCanvasJump,
  onToggleResolve,
}: StudioCrecoPinFeedbackSectionProps) {
  const drawingActiveRef = useRef<boolean>(false);
  const activeCutFeedbacks = feedbacks.filter((fb) => fb.cutIndex === activeCutIndex);

  const toStagePercent = (event: ReactPointerEvent<SVGSVGElement>): RedlinePoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 100;
    const height = rect.height > 0 ? rect.height : 100;
    const xPct = Math.round(((event.clientX - rect.left) / width) * 1000) / 10;
    const yPct = Math.round(((event.clientY - rect.top) / height) * 1000) / 10;
    return {
      xPct: Math.min(100, Math.max(0, xPct)),
      yPct: Math.min(100, Math.max(0, yPct)),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    drawingActiveRef.current = true;
    const pt = toStagePercent(event);
    onChangePinCoords(pt);
    onUpdateDraftStroke([pt]);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawingActiveRef.current) return;
    const pt = toStagePercent(event);
    onUpdateDraftStroke([...draftRedlinePoints, pt]);
  };

  const handlePointerUp = () => {
    drawingActiveRef.current = false;
  };

  return (
    <section className="ccv-card" aria-label="뷰어 핀·레드라인 피드백 및 캔버스 직결 점프">
      <div className="ccv-card-head">
        <h3 className="ccv-card-title">
          뷰어 핀 · 벡터 레드라인 피드백 · 0.1초 캔버스 레이어 직결 점프
        </h3>
        <div className="ccv-badge-row">
          <button
            type="button"
            data-testid="ccv-pin-mode-toggle"
            className="ccv-btn"
            aria-pressed={pinModeActive}
            onClick={onTogglePinMode}
          >
            핀·레드라인 모드 (F): {pinModeActive ? "켜짐" : "꺼짐"}
          </button>
          {privateDraftCount > 0 ? (
            <button
              type="button"
              data-testid="ccv-publish-drafts-btn"
              className="ccv-btn"
              onClick={onPublishDrafts}
            >
              초안 일괄 발행 ({privateDraftCount})
            </button>
          ) : null}
        </div>
      </div>

      <div className="ccv-pin-stage" data-testid="ccv-pin-canvas-stage">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="ccv-redline-svg"
          role="img"
          aria-label="현재 컷 벡터 레드라인 드로잉 영역: 드래그하여 빨간 펜 보조선과 좌표를 지정할 수 있습니다"
          style={{ pointerEvents: "auto" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {activeCutFeedbacks.flatMap((fb) =>
            fb.strokes.map((stroke) => (
              <polyline
                key={stroke.id}
                fill="none"
                stroke={REDLINE_STROKE_VAR[stroke.tone]}
                strokeWidth={stroke.widthPx * 0.45}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pointsToPolyline(stroke.points)}
              />
            )),
          )}
          {draftRedlinePoints.length >= 2 ? (
            <polyline
              fill="none"
              stroke={REDLINE_STROKE_VAR[pinTone]}
              strokeWidth={1.6}
              strokeDasharray="2 1"
              points={pointsToPolyline(draftRedlinePoints)}
            />
          ) : null}
        </svg>

        {activeCutFeedbacks.map((fb, idx) => (
          <button
            key={fb.id}
            type="button"
            data-testid={`ccv-pin-marker-${fb.id}`}
            data-status={fb.status}
            className="ccv-pin-marker ccv-num"
            style={{ left: `${fb.xPct}%`, top: `${fb.yPct}%` }}
            aria-label={`피드백 핀 ${idx + 1}: ${fb.body} (클릭 시 캔버스 레이어 직결 점프)`}
            onClick={() => onCanvasJump(fb.id)}
          >
            #{idx + 1}
          </button>
        ))}
      </div>

      <div className="ccv-badge-row">
        <select
          aria-label="피드백 중요도"
          className="ccv-select"
          value={pinImportance}
          onChange={(event) => onChangeImportance(event.target.value as FeedbackImportance)}
        >
          <option value="required">필수 수정</option>
          <option value="recommended">권장 수정</option>
          <option value="suggestion">제안</option>
        </select>
        <select
          aria-label="레드라인 펜 색상"
          className="ccv-select"
          value={pinTone}
          onChange={(event) => onChangeTone(event.target.value as RedlineTone)}
        >
          <option value="crimson">크림슨 레드라인</option>
          <option value="amber">앰버 강조선</option>
          <option value="cobalt">코발트 구도선</option>
        </select>
        <input
          aria-label="핀 피드백 내용"
          data-testid="ccv-pin-body-input"
          className="ccv-input"
          placeholder="수정 의견을 입력하세요"
          value={pinDraftBody}
          onChange={(event) => onChangeDraftBody(event.target.value)}
        />
        <button
          type="button"
          data-testid="ccv-add-pin-btn"
          className="ccv-btn ccv-btn-primary"
          onClick={onPlacePinFeedback}
        >
          핀·레드라인 등록 ({pinCoords.xPct}%, {pinCoords.yPct}%)
        </button>
      </div>

      {lastCanvasJump ? (
        <div className="ccv-status-banner" data-testid="ccv-canvas-jump-banner">
          <strong>캔버스 직결 점프 ({lastCanvasJump.schema}):</strong>{" "}
          {lastCanvasJump.layerName} · 컷 {lastCanvasJump.cutIndex + 1} ({lastCanvasJump.xPct}%,{" "}
          {lastCanvasJump.yPct}%) · 응답 {lastCanvasJump.estimatedLatencyMs}ms · 외부 업로드{" "}
          {lastCanvasJump.requiresExternalUpload ? "필요" : "불필요"} ·{" "}
          <code>{lastCanvasJump.deepLinkUri}</code>
        </div>
      ) : null}

      <ul className="ccv-version-list" data-testid="ccv-feedback-list">
        {feedbacks.map((fb) => (
          <li key={fb.id} className="ccv-version-item">
            <div>
              <span className="ccv-pill ccv-pill-warn">{IMPORTANCE_LABEL[fb.importance]}</span>{" "}
              <strong>
                {getStageMeta(fb.stageId).shortLabel} · 컷 {fb.cutIndex + 1} ({fb.xPct}%, {fb.yPct}
                %)
              </strong>{" "}
              · 레드라인 {fb.strokes.length}획 · {STATUS_LABEL[fb.status]}
              <div className="ccv-subtitle">
                {fb.body} ({fb.authorName} → {fb.assigneeName})
              </div>
            </div>
            <div className="ccv-badge-row">
              <button
                type="button"
                data-testid={`ccv-jump-btn-${fb.id}`}
                className="ccv-btn ccv-btn-primary"
                onClick={() => onCanvasJump(fb.id)}
              >
                0.1초 캔버스 점프
              </button>
              <button
                type="button"
                data-testid={`ccv-resolve-btn-${fb.id}`}
                className="ccv-btn"
                onClick={() => onToggleResolve(fb.id, fb.status === "resolved" ? "open" : "resolved")}
              >
                {fb.status === "resolved" ? "다시 열기" : "해결 완료"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
