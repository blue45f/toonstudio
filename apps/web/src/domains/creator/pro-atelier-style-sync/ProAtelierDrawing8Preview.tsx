import {
  formatOklchCss,
  type FrameSliceAndSpeechTailResult,
  type PigmentMixToneResult,
  type ProDrawingToolId,
  type PuppetMeshWarpResult,
  type ReferenceLayerFillResult,
  type SpecialtyRulerSnapResult,
  type TeamBrushDecodeResult,
  type ValueFlipSubViewResult,
  type VectorStrokeSculptResult,
} from "./pro-drawing-8-tools-engine";

export interface ProAtelierDrawing8PreviewProps {
  readonly activeTool: ProDrawingToolId;
  readonly demoReferenceMask: Uint8Array;
  readonly fillResult: ReferenceLayerFillResult;
  readonly vectorResult: VectorStrokeSculptResult;
  readonly pigmentResult: PigmentMixToneResult;
  readonly pigmentVsMasterDeltaE: number;
  readonly warpResult: PuppetMeshWarpResult;
  readonly subViewResult: ValueFlipSubViewResult;
  readonly sliceTailResult: FrameSliceAndSpeechTailResult;
  readonly encodedBrushCode: string;
  readonly decodedBrushResult: TeamBrushDecodeResult;
  readonly rulerResult: SpecialtyRulerSnapResult;
}

/** 전문가 드로잉 8선 우측 실시간 시각화 · 수치 검증 뷰 */
export function ProAtelierDrawing8Preview({
  activeTool,
  demoReferenceMask,
  fillResult,
  vectorResult,
  pigmentResult,
  pigmentVsMasterDeltaE,
  warpResult,
  subViewResult,
  sliceTailResult,
  encodedBrushCode,
  decodedBrushResult,
  rulerResult,
}: ProAtelierDrawing8PreviewProps) {
  const maxHistBin = Math.max(1, ...subViewResult.histogram16);

  return (
    <div className="pas-stage-box" data-testid="pas-tool-live-preview">
      {activeTool === "reference-fill" ? (
        <>
          <div className="pas-control-row">
            <span className="pas-badge" data-tone="good">
              {fillResult.boundarySafe ? "경계 안전 검증 통과" : "경계 이탈"}
            </span>
            <span className="pas-card-desc pas-num">
              내부 {fillResult.baseFilledPixels}px + 확장 {fillResult.expandedPixels}px = 총{" "}
              {fillResult.totalFilledPixels}px
            </span>
          </div>
          <div className="pas-pixel-grid" aria-label="참조 레이어 채우기 12×12 픽셀 마스크 미리보기">
            {Array.from(fillResult.filledMask).map((filled, idx) => {
              const alpha = demoReferenceMask[idx];
              const kind =
                filled === 1 && alpha >= 16
                  ? "expanded"
                  : filled === 1
                    ? "base"
                    : alpha >= 16
                      ? "line"
                      : "empty";
              return <span key={idx} className="pas-pixel-cell" data-kind={kind} />;
            })}
          </div>
        </>
      ) : null}

      {activeTool === "vector-width" ? (
        <>
          <svg viewBox="0 0 260 120" className="pas-svg-preview" aria-label="벡터 선폭 보정 프리뷰">
            {vectorResult.points.slice(0, -1).map((pt, idx) => {
              const next = vectorResult.points[idx + 1];
              return (
                <line
                  key={idx}
                  x1={pt.x}
                  y1={pt.y}
                  x2={next.x}
                  y2={next.y}
                  stroke="currentColor"
                  strokeWidth={Math.max(1, (pt.width + next.width) * 0.5)}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          <p className="pas-card-desc pas-num">
            제거 제어점 {vectorResult.removedPointCount}개 · 최대 오차 {vectorResult.maxDeviationPx}px ·
            영향 제어점 {vectorResult.affectedPointCount}개
          </p>
        </>
      ) : null}

      {activeTool === "pigment-mix" ? (
        <div className="pas-swatch-row">
          <div className="pas-swatch-card">
            <div className="pas-swatch-chip" style={{ backgroundColor: pigmentResult.mixedCssOklch }} />
            <strong className="pas-card-desc">KM 감산 혼색</strong>
            <span className="pas-metric-label pas-num">
              H {pigmentResult.mixedOklch.h}° · C {pigmentResult.mixedOklch.c}
            </span>
          </div>
          <div className="pas-swatch-card">
            <div className="pas-swatch-chip" style={{ backgroundColor: pigmentResult.adjustedCssOklch }} />
            <strong className="pas-card-desc">온도·명도 보정</strong>
            <span className="pas-metric-label pas-num">{formatOklchCss(pigmentResult.adjustedOklch)}</span>
          </div>
          <div className="pas-swatch-card">
            <div className="pas-swatch-chip" style={{ backgroundColor: pigmentResult.naiveAdditiveCssOklch }} />
            <strong className="pas-card-desc">일반 RGB 비교</strong>
            <span className="pas-metric-label pas-num">마스터 의상 ΔE {pigmentVsMasterDeltaE}</span>
          </div>
        </div>
      ) : null}

      {activeTool === "puppet-mesh" ? (
        <svg viewBox="0 0 260 160" className="pas-svg-preview" aria-label="4×4 메쉬 퍼펫 변형 프리뷰">
          {warpResult.vertices.map((pt, idx) => (
            <circle key={idx} cx={pt.x} cy={pt.y} r={3.5} fill="currentColor" />
          ))}
        </svg>
      ) : null}

      {activeTool === "value-flip" ? (
        <>
          <div className="pas-histogram" aria-label="Rec.709 16구간 명도 히스토그램">
            {subViewResult.histogram16.map((count, binIdx) => (
              <div
                key={binIdx}
                className="pas-histogram-bar"
                style={{ height: `${Math.max(8, Math.round((count / maxHistBin) * 100))}%` }}
              />
            ))}
          </div>
          <p className="pas-code-output pas-num">
            transform: {subViewResult.cssTransform} · filter: {subViewResult.cssFilter}
          </p>
        </>
      ) : null}

      {activeTool === "frame-slice-tail" ? (
        <>
          <svg
            viewBox="0 0 260 160"
            className="pas-svg-preview"
            aria-label="1획 컷 분할 및 말풍선 꼬리 추적 프리뷰"
          >
            <polygon
              points={sliceTailResult.firstFrame.vertices.map((v) => `${v.x},${v.y}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            />
            <polygon
              points={sliceTailResult.secondFrame.vertices.map((v) => `${v.x},${v.y}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            />
            <polygon
              points={`${sliceTailResult.speechTail.baseLeft.x},${sliceTailResult.speechTail.baseLeft.y} ${sliceTailResult.speechTail.tip.x},${sliceTailResult.speechTail.tip.y} ${sliceTailResult.speechTail.baseRight.x},${sliceTailResult.speechTail.baseRight.y}`}
              fill="currentColor"
              opacity={0.35}
            />
          </svg>
          <p className="pas-card-desc pas-num">
            분할 상태: {sliceTailResult.didSplit ? "2컷 분할 완료" : "미분할"} · 꼬리 각도{" "}
            {sliceTailResult.speechTail.angleDeg}° · 길이 {sliceTailResult.speechTail.tailLengthPx}px
          </p>
        </>
      ) : null}

      {activeTool === "brush-share-code" ? (
        <>
          <p className="pas-metric-label">생성된 팀 공유 코드 (URL-safe 1줄)</p>
          <div className="pas-code-output" data-testid="pas-brush-share-code-output">
            {encodedBrushCode}
          </div>
          <div className="pas-control-row">
            <span
              className="pas-badge"
              data-tone={decodedBrushResult.ok ? "good" : "bad"}
              data-testid="pas-brush-decode-status"
            >
              {decodedBrushResult.ok
                ? `무결성 검증 통과 (${decodedBrushResult.checksum})`
                : decodedBrushResult.messageKo}
            </span>
          </div>
        </>
      ) : null}

      {activeTool === "specialty-ruler" ? (
        <div className="pas-metrics-grid">
          <div className="pas-metric-box">
            <span className="pas-metric-label">스냅 좌표</span>
            <strong className="pas-metric-value pas-num" data-testid="pas-ruler-snapped-coord">
              ({rulerResult.snapped.x}, {rulerResult.snapped.y})
            </strong>
          </div>
          <div className="pas-metric-box">
            <span className="pas-metric-label">이동 거리 · 기준 각도</span>
            <strong className="pas-metric-value pas-num">
              {rulerResult.snapDistancePx}px · {rulerResult.lockedAngleDeg}°
            </strong>
          </div>
          {rulerResult.panoramaMetadata ? (
            <div className="pas-metric-box">
              <span className="pas-metric-label">경도·위도 · 왜곡 배율</span>
              <strong className="pas-metric-value pas-num">
                {rulerResult.panoramaMetadata.longitudeDeg}° /{" "}
                {rulerResult.panoramaMetadata.latitudeDeg}° (×
                {rulerResult.panoramaMetadata.equirectangularStretch})
              </strong>
            </div>
          ) : (
            <div className="pas-metric-box">
              <span className="pas-metric-label">격자 인덱스 (U, V)</span>
              <strong className="pas-metric-value pas-num">
                ({rulerResult.gridCoord.u}, {rulerResult.gridCoord.v})
              </strong>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
