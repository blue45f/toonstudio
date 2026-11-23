import type { ComparisonModeId } from "./flagship-showcase-data";
import "./flagship-comparison.css";

/**
 * 3모드 Before / After 비교 시각 무대(순수 SVG + CSS OKLCH 시맨틱 클래스).
 * 컴포넌트 인라인 색상 하드코딩 없이 모든 해상도와 테마에서 선명하게 비교를 표현한다.
 */
export function FlagshipComparisonVisual({
  mode,
  variant,
}: {
  readonly mode: ComparisonModeId;
  readonly variant: "before" | "after";
}) {
  if (mode === "brush") {
    return variant === "before" ? (
      <svg viewBox="0 0 520 220" className="fsh-compare-svg" aria-hidden="true">
        <rect width="520" height="220" className="fsh-svg-paper-flat" />
        <path d="M 52 152 Q 165 62 290 124 T 462 96" className="fsh-svg-flat-blue" strokeWidth="30" strokeLinecap="round" />
        <path d="M 68 84 Q 204 166 320 112 T 468 148" className="fsh-svg-flat-yellow" strokeWidth="28" strokeLinecap="round" />
        <ellipse cx="242" cy="118" rx="56" ry="26" className="fsh-svg-muddy-mix" />
        <path d="M 70 184 L 450 184" className="fsh-svg-flat-pencil" strokeWidth="7" strokeLinecap="round" />
      </svg>
    ) : (
      <svg viewBox="0 0 520 220" className="fsh-compare-svg" aria-hidden="true">
        <rect width="520" height="220" className="fsh-svg-paper-tooth" />
        <g opacity="0.28">
          <line x1="0" y1="36" x2="520" y2="36" className="fsh-svg-tooth-guide" strokeDasharray="3 5" />
          <line x1="0" y1="92" x2="520" y2="92" className="fsh-svg-tooth-guide" strokeDasharray="2 6" />
          <line x1="0" y1="148" x2="520" y2="148" className="fsh-svg-tooth-guide" strokeDasharray="4 4" />
        </g>
        <path d="M 52 152 Q 165 62 290 124 T 462 96" className="fsh-svg-km-blue" strokeWidth="34" strokeLinecap="round" />
        <path d="M 68 84 Q 204 166 320 112 T 468 148" className="fsh-svg-km-yellow" strokeWidth="30" strokeLinecap="round" />
        <ellipse cx="242" cy="118" rx="64" ry="29" className="fsh-svg-km-emerald" />
        <path d="M 70 184 Q 210 176 340 186 T 452 180" className="fsh-svg-pencil-core" strokeWidth="7.5" strokeDasharray="6 2 3 1.5" strokeLinecap="round" />
        <path d="M 74 189 Q 214 182 344 191 T 448 185" className="fsh-svg-pencil-grain" strokeWidth="3" strokeDasharray="2 3" />
      </svg>
    );
  }

  if (mode === "npr3d") {
    return variant === "before" ? (
      <svg viewBox="0 0 520 220" className="fsh-compare-svg" aria-hidden="true">
        <rect width="520" height="220" className="fsh-svg-mesh-bg" />
        <polygon points="88,186 248,142 432,186 254,208" className="fsh-svg-mesh-floor" strokeWidth="1" />
        <polygon points="116,54 248,38 248,142 116,174" className="fsh-svg-mesh-wall-l" strokeWidth="1" />
        <polygon points="248,38 408,58 408,176 248,142" className="fsh-svg-mesh-wall-r" strokeWidth="1" />
        <line x1="116" y1="54" x2="248" y2="142" className="fsh-svg-mesh-wire" strokeWidth="0.9" />
        <line x1="248" y1="38" x2="408" y2="176" className="fsh-svg-mesh-wire" strokeWidth="0.9" />
        <rect x="284" y="76" width="68" height="58" className="fsh-svg-mesh-win" strokeWidth="1" />
      </svg>
    ) : (
      <svg viewBox="0 0 520 220" className="fsh-compare-svg" aria-hidden="true">
        <rect width="520" height="220" className="fsh-svg-npr-bg" />
        <polygon points="88,186 248,142 432,186 254,208" className="fsh-svg-npr-floor" />
        <polygon points="116,54 248,38 248,142 116,174" className="fsh-svg-npr-wall-l" />
        <polygon points="248,38 408,58 408,176 248,142" className="fsh-svg-npr-wall-r" />
        <rect x="284" y="76" width="68" height="58" className="fsh-svg-npr-win" strokeWidth="2.8" />
        <polygon points="284,134 352,134 268,188 188,178" className="fsh-svg-npr-light" />
        <path d="M 116 54 L 248 38 L 408 58 L 408 176" className="fsh-svg-npr-ink" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 116 54 L 116 174 L 248 142 L 408 176" className="fsh-svg-npr-ink" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="248" y1="38" x2="248" y2="142" className="fsh-svg-npr-ink" strokeWidth="2.6" />
      </svg>
    );
  }

  return variant === "before" ? (
    <svg viewBox="0 0 520 220" className="fsh-compare-svg" aria-hidden="true">
      <rect width="520" height="220" className="fsh-svg-paper-flat" />
      <rect x="74" y="28" width="372" height="164" className="fsh-svg-qa-frame" strokeWidth="2.4" />
      <path d="M 164 192 Q 192 84 260 76 Q 328 84 356 192 Z" className="fsh-svg-qa-char" strokeWidth="2.6" />
      <circle cx="212" cy="134" r="6" className="fsh-svg-qa-pinhole" />
      <circle cx="212" cy="134" r="14" className="fsh-svg-qa-warn" strokeWidth="2.2" strokeDasharray="3 2" />
      <circle cx="308" cy="158" r="5" className="fsh-svg-qa-pinhole" />
      <circle cx="308" cy="158" r="13" className="fsh-svg-qa-warn" strokeWidth="2.2" strokeDasharray="3 2" />
      <path d="M 432 94 L 478 102" className="fsh-svg-qa-bleed" strokeWidth="14" strokeLinecap="round" />
      <rect x="438" y="80" width="48" height="36" rx="6" className="fsh-svg-qa-warn" strokeWidth="2.2" strokeDasharray="4 2" />
    </svg>
  ) : (
    <svg viewBox="0 0 520 220" className="fsh-compare-svg" aria-hidden="true">
      <rect width="520" height="220" className="fsh-svg-paper-tooth" />
      <rect x="64" y="18" width="392" height="184" className="fsh-svg-qa-safe" strokeWidth="1.4" strokeDasharray="5 4" />
      <rect x="74" y="28" width="372" height="164" className="fsh-svg-qa-frame-clean" strokeWidth="2.6" />
      <path d="M 164 192 Q 192 84 260 76 Q 328 84 356 192 Z" className="fsh-svg-qa-char" strokeWidth="2.8" />
      <circle cx="412" cy="58" r="16" className="fsh-svg-qa-pass" />
      <path d="M 405 58 L 410 63 L 420 52" className="fsh-svg-qa-check" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
