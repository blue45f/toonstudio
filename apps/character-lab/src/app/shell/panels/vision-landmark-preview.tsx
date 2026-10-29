import type { OverlayPlan } from "../../../domains/vision/landmark-overlay";

interface VisionLandmarkPreviewProps {
  readonly image: { readonly previewUrl: string | null; readonly label: string };
  readonly bodyOverlay: OverlayPlan | null;
  readonly handOverlays: readonly OverlayPlan[];
}

/** 실제 검출한 전신·손 랜드마크를 같은 입력 이미지 좌표에서 표시한다. */
export function VisionLandmarkPreview({ image, bodyOverlay, handOverlays }: VisionLandmarkPreviewProps) {
  const overlay = bodyOverlay ?? handOverlays[0];
  if (!overlay) return null;
  return (
          <div className="cl-vision-photo" style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
            {image.previewUrl ? <img className="cl-vision-preview" src={image.previewUrl} alt={`포즈 사진 ${image.label}`} style={{ display: "block", maxWidth: "100%" }} /> : null}
            <svg className="cl-vision-overlay" viewBox={overlay.viewBox} role="img" aria-label="랜드마크 오버레이" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid meet">
              {bodyOverlay?.segments.map((segment) => (
                <line key={`p${segment.from}-${segment.to}`} className="cl-vision-bone" x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} stroke={segment.visible ? "#36c" : "#c33"} strokeWidth={Math.max(1, overlay.width / 300)} strokeDasharray={segment.visible ? undefined : "4 4"} />
              ))}
              {bodyOverlay?.points.map((point) => (
                <circle key={`p${point.index}`} className="cl-vision-landmark" cx={point.x} cy={point.y} r={Math.max(2, overlay.width / 150)} fill={point.visible ? "#2a7" : "#c33"} opacity={0.35 + 0.65 * point.visibility}>
                  <title>
                    {point.name} ({(point.visibility * 100).toFixed(0)}%)
                  </title>
                </circle>
              ))}
              {handOverlays.map((plan, handIndex) => (
                <g key={`hand-${handIndex}`} className="cl-vision-hand">
                  {plan.segments.map((segment) => (
                    <line key={`h${handIndex}-${segment.from}-${segment.to}`} className="cl-vision-hand-bone" x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} stroke="#e8a" strokeWidth={Math.max(1, overlay.width / 400)} />
                  ))}
                  {plan.points.map((point) => (
                    <circle key={`h${handIndex}-${point.index}`} className="cl-vision-hand-landmark" cx={point.x} cy={point.y} r={Math.max(1.5, overlay.width / 250)} fill="#e8a" />
                  ))}
                </g>
              ))}
            </svg>
          </div>
  );
}
