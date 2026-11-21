import {
  clampProportionAxes,
  PROP_ITEM_OPTIONS,
  type CharacterShaperUnifiedState,
} from "./character-shaper-unified-engine";

/** 8축 체형 비율·헤어 밀착·의상 실루엣·소품 소켓·바닥 접지(Y=0)를 실시간 시각화하는 SVG 스테이지. */
export function CharacterShaperSilhouettePreview({
  state,
  heightMeters,
}: {
  readonly state: CharacterShaperUnifiedState;
  readonly heightMeters: number;
}) {
  const safeAxes = clampProportionAxes(state.proportions);
  const headRadius = 15 + safeAxes.headScale * 4.5 + (7.5 - safeAxes.headRatio) * 1.4;
  const shoulderHalf = 22 + safeAxes.shoulderWidth * 8 + safeAxes.muscleVolume * 3;
  const waistHalf = 13 + safeAxes.waistTaper * 4.5 + safeAxes.muscleVolume * 2;
  const hipHalf = 16 + safeAxes.waistTaper * 2.5 + safeAxes.muscleVolume * 2.5;
  const legLength = 74 + safeAxes.legRatio * 18 + (safeAxes.headRatio - 6.5) * 6;
  const torsoHeight = 52 - safeAxes.legRatio * 6;
  const floorY = 222;
  const hipY = floorY - legLength;
  const shoulderY = hipY - torsoHeight;
  const headCy = Math.max(26, shoulderY - headRadius - 6);
  const eyeRadius = Math.max(1.5, 2.3 + safeAxes.eyeScale * 1.1);
  const jawWidth = Math.max(7, headRadius * (0.72 - safeAxes.jawSharpness * 0.14));
  const hairRadius = headRadius * state.hair.volumeScale + state.hair.scalpOffsetMm * 0.45;
  const activePropLabel =
    PROP_ITEM_OPTIONS.find((item) => item.id === state.propSocket.propId)?.labelKo ?? "소품 없음";

  return (
    <div className="csu-stage-frame" data-testid="csu-silhouette-stage">
      <svg
        className="csu-stage-svg"
        viewBox="0 0 220 240"
        role="img"
        aria-label={`${state.characterName} 3D 비율 미리보기 · ${safeAxes.headRatio.toFixed(1)}등신 · 신장 ${heightMeters.toFixed(2)}m`}
      >
        <line
          x1="18"
          y1={floorY}
          x2="202"
          y2={floorY}
          stroke="var(--csu-good)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        <text x="20" y={floorY + 13} fontSize="9" fill="var(--color-fg-2)">
          바닥 접지 Y=0.00m
        </text>
        <text x="148" y={floorY + 13} fontSize="9" fill="var(--color-fg-2)">
          {heightMeters.toFixed(2)}m (1.0m)
        </text>

        <line
          x1="192"
          y1={headCy - headRadius}
          x2="192"
          y2={floorY}
          stroke="var(--color-line)"
          strokeWidth="1.5"
        />
        <text x="164" y={Math.max(14, headCy - headRadius + 4)} fontSize="9" fill="var(--csu-p1)">
          {safeAxes.headRatio.toFixed(1)}등신
        </text>

        <circle cx="110" cy={headCy - 2} r={hairRadius} fill={state.hair.toneToken} opacity="0.92" />

        <path
          d={`M ${110 - headRadius * 0.85} ${headCy} Q ${110 - jawWidth} ${headCy + headRadius * 0.95} 110 ${headCy + headRadius * 1.05} Q ${110 + jawWidth} ${headCy + headRadius * 0.95} ${110 + headRadius * 0.85} ${headCy} A ${headRadius * 0.85} ${headRadius * 0.85} 0 1 0 ${110 - headRadius * 0.85} ${headCy}`}
          fill="var(--color-card)"
          stroke="var(--color-fg)"
          strokeWidth="1.4"
        />
        <circle cx={110 - headRadius * 0.34} cy={headCy + 1} r={eyeRadius} fill="var(--color-fg)" />
        <circle cx={110 + headRadius * 0.34} cy={headCy + 1} r={eyeRadius} fill="var(--color-fg)" />

        <polygon
          points={`${110 - shoulderHalf},${shoulderY} ${110 + shoulderHalf},${shoulderY} ${110 + waistHalf},${hipY - 8} ${110 + hipHalf},${hipY} ${110 - hipHalf},${hipY} ${110 - waistHalf},${hipY - 8}`}
          fill={state.outfit.accentToneToken}
          opacity="0.86"
          stroke="var(--color-fg)"
          strokeWidth="1.2"
        />

        <line
          x1={110 - shoulderHalf}
          y1={shoulderY + 3}
          x2={110 - shoulderHalf - 11}
          y2={hipY + 18}
          stroke="var(--color-fg)"
          strokeWidth={4 + safeAxes.muscleVolume * 1.4}
          strokeLinecap="round"
        />
        <line
          x1={110 + shoulderHalf}
          y1={shoulderY + 3}
          x2={110 + shoulderHalf + 11}
          y2={hipY + 18}
          stroke="var(--color-fg)"
          strokeWidth={4 + safeAxes.muscleVolume * 1.4}
          strokeLinecap="round"
        />

        <line
          x1={110 - hipHalf * 0.48}
          y1={hipY}
          x2={110 - hipHalf * 0.56}
          y2={floorY - 2}
          stroke="var(--color-fg)"
          strokeWidth={5 + safeAxes.muscleVolume * 1.5}
          strokeLinecap="round"
        />
        <line
          x1={110 + hipHalf * 0.48}
          y1={hipY}
          x2={110 + hipHalf * 0.56}
          y2={floorY - 2}
          stroke="var(--color-fg)"
          strokeWidth={5 + safeAxes.muscleVolume * 1.5}
          strokeLinecap="round"
        />

        {state.propSocket.propId !== "none" ? (
          <g>
            <circle
              cx={110 + shoulderHalf + 14}
              cy={hipY + 16}
              r={5 * state.propSocket.scale}
              fill="var(--csu-p3)"
            />
            <text x="16" y="18" fontSize="9" fill="var(--csu-p3)">
              소켓 장착: {activePropLabel}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
