import type { ReactElement } from "react";
import type { VisemeId, VrmBlendShapeWeights } from "./char-expression-pose-engine";

export function FaceExpressionMiniSvg(props: {
  readonly blendShapes: VrmBlendShapeWeights;
  readonly viseme: VisemeId;
  readonly eyebrowTiltDeg: number;
  readonly eyebrowLift: number;
  readonly gazeYaw: number;
  readonly gazePitch: number;
  readonly testId: string;
  readonly ariaLabel: string;
}): ReactElement {
  const { blendShapes, viseme, eyebrowTiltDeg, eyebrowLift, gazeYaw, gazePitch, testId, ariaLabel } = props;
  const browY = Math.round((31 - eyebrowLift * 5.5) * 10) / 10;
  const browDy = Math.round(Math.sin((eyebrowTiltDeg * Math.PI) / 180) * 6 * 10) / 10;
  const eyeRy = Math.max(1.4, Math.round((4.6 - blendShapes.blink * 3.1 + blendShapes.surprised * 1.4) * 10) / 10);
  const pupilDx = Math.round((gazeYaw / 24) * 3.2 * 10) / 10;
  const pupilDy = Math.round((-gazePitch / 18) * 2.2 * 10) / 10;
  const mouthSmile = (blendShapes.happy - blendShapes.sad - blendShapes.angry * 0.65) * 5.5;
  const mouthY = 66;

  let mouthEl: ReactElement;
  if (viseme === "aa") {
    mouthEl = <ellipse cx="56" cy={mouthY} rx="9.5" ry="7.2" fill="currentColor" fillOpacity={0.22} stroke="currentColor" strokeWidth="1.8" />;
  } else if (viseme === "ih") {
    mouthEl = <rect x="44" y={mouthY - 2.6} width="24" height="5.2" rx="2.6" fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth="1.7" />;
  } else if (viseme === "ou") {
    mouthEl = <circle cx="56" cy={mouthY} r="4.6" fill="currentColor" fillOpacity={0.22} stroke="currentColor" strokeWidth="1.8" />;
  } else if (viseme === "ee") {
    mouthEl = <ellipse cx="56" cy={mouthY} rx="10.5" ry="4.4" fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeWidth="1.7" />;
  } else if (viseme === "oh") {
    mouthEl = <ellipse cx="56" cy={mouthY} rx="6.5" ry="7.4" fill="currentColor" fillOpacity={0.22} stroke="currentColor" strokeWidth="1.8" />;
  } else {
    const ctrlY = Math.round((mouthY + mouthSmile) * 10) / 10;
    mouthEl = <path d={`M 45 ${mouthY} Q 56 ${ctrlY} 67 ${mouthY}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />;
  }

  return (
    <svg
      data-testid={testId}
      data-viseme={viseme}
      data-eyebrow-tilt={eyebrowTiltDeg}
      data-gaze-yaw={gazeYaw}
      data-gaze-pitch={gazePitch}
      viewBox="0 0 112 92"
      className="h-24 w-28 shrink-0 rounded-xl border border-line bg-canvas text-fg"
      role="img"
      aria-label={ariaLabel}
    >
      <path d="M 26 22 Q 56 8 86 22 L 88 54 Q 84 82 56 86 Q 28 82 24 54 Z" fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth="1.6" />
      <g className="text-fg">
        <line x1="33" y1={browY - browDy} x2="49" y2={browY + browDy} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="63" y1={browY + browDy} x2="79" y2={browY - browDy} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g className="text-fg">
        <ellipse cx="41" cy="46" rx="6.2" ry={eyeRy} fill="none" stroke="currentColor" strokeWidth="1.6" />
        <ellipse cx="71" cy="46" rx="6.2" ry={eyeRy} fill="none" stroke="currentColor" strokeWidth="1.6" />
      </g>
      <g className="text-accent">
        <circle cx={41 + pupilDx} cy={46 + pupilDy} r={Math.min(2.6, eyeRy * 0.65)} fill="currentColor" />
        <circle cx={71 + pupilDx} cy={46 + pupilDy} r={Math.min(2.6, eyeRy * 0.65)} fill="currentColor" />
      </g>
      <g className="text-accent">{mouthEl}</g>
    </svg>
  );
}
