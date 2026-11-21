/**
 * 다중프레임 소두(5.5~6.5등신) 한국 웹툰 캐릭터 스프라이트 고디테일 SVG 파츠 렌더러.
 *
 * - 선명한 웹툰 잉크 윤곽선 · 헤어 하이라이트 엔젤링 · 15종 헤어/헤드기어 실루엣 ·
 *   15종 다층 의상 레이어 · 11종 시그니처 소품 · 3종 반려 마스코트/드론 동행 ·
 *   10종 눈/입 표정 · 8종 기본 VFX + 20종 드라마틱 VFX(체조·댄스·장르 연출 + reduced-motion 감쇠)를 합성한다.
 */
import {
  getStudioDramaticVfxSpec,
  resolveDramaticVfxRenderPlan,
  type StudioDramaticVfxId,
} from "./studio-virtual-space-dramatic-vfx-catalog";
import type {
  DynamicCreatorPersonaSpriteSpec,
  DynamicSpriteExtendedActionId,
  DynamicSpriteExpressionSpec,
  DynamicSpriteFrameKinematics,
  DynamicSpriteVfxId,
  DynamicSpriteVfxSpec,
} from "./studio-virtual-space-dynamic-sprite-catalog";

export function renderDynamicSpriteEyesSvg(
  persona: DynamicCreatorPersonaSpriteSpec,
  expr: DynamicSpriteExpressionSpec,
  k: DynamicSpriteFrameKinematics,
  headCenterY: number,
): string {
  const ink = persona.inkOutlineHex ?? persona.hairHex;
  if (k.isBlinkFrame || expr.eyeStyle === "closed-zen") {
    return `
      <g data-part="eyes-blink">
        <path d="M -5.4 ${headCenterY - 0.5} Q -3.3 ${headCenterY + 1.5} -1.1 ${headCenterY - 0.5}" stroke="${ink}" stroke-width="1.65" fill="none" stroke-linecap="round"/>
        <path d="M 1.1 ${headCenterY - 0.5} Q 3.3 ${headCenterY + 1.5} 5.4 ${headCenterY - 0.5}" stroke="${ink}" stroke-width="1.65" fill="none" stroke-linecap="round"/>
      </g>
    `;
  }
  switch (expr.eyeStyle) {
    case "wink-happy":
      return `
        <path d="M -5.5 ${headCenterY - 0.2} Q -3.2 ${headCenterY - 2.6} -1.0 ${headCenterY - 0.2}" stroke="${ink}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
        <ellipse cx="3.3" cy="${headCenterY - 0.4}" rx="2.2" ry="2.6" fill="${persona.eyeHex}" stroke="${ink}" stroke-width="0.65"/>
        <ellipse cx="3.3" cy="${headCenterY - 1.0}" rx="1.6" ry="1.1" fill="${ink}" opacity="0.32"/>
        <circle cx="2.6" cy="${headCenterY - 1.3}" r="0.95" fill="#ffffff"/>
        <circle cx="3.9" cy="${headCenterY + 0.7}" r="0.5" fill="#ffffff" opacity="0.88"/>
      `;
    case "star-pupil":
      return `
        <ellipse cx="-3.3" cy="${headCenterY - 0.4}" rx="2.35" ry="2.65" fill="${persona.eyeHex}" stroke="${ink}" stroke-width="0.7"/>
        <ellipse cx="3.3" cy="${headCenterY - 0.4}" rx="2.35" ry="2.65" fill="${persona.eyeHex}" stroke="${ink}" stroke-width="0.7"/>
        <polygon points="-3.3,${headCenterY - 2.5} -2.7,${headCenterY - 0.9} -1.2,${headCenterY - 0.4} -2.7,${headCenterY + 0.2} -3.3,${headCenterY + 1.7} -3.9,${headCenterY + 0.2} -5.4,${headCenterY - 0.4} -3.9,${headCenterY - 0.9}" fill="#fef08a"/>
        <polygon points="3.3,${headCenterY - 2.5} 3.9,${headCenterY - 0.9} 5.4,${headCenterY - 0.4} 3.9,${headCenterY + 0.2} 3.3,${headCenterY + 1.7} 2.7,${headCenterY + 0.2} 1.2,${headCenterY - 0.4} 2.7,${headCenterY - 0.9}" fill="#fef08a"/>
        <circle cx="-3.8" cy="${headCenterY - 1.4}" r="0.6" fill="#ffffff"/>
        <circle cx="2.8" cy="${headCenterY - 1.4}" r="0.6" fill="#ffffff"/>
      `;
    case "heart-glow":
      return `
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="2.35" fill="#ec4899" stroke="${ink}" stroke-width="0.65"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="2.35" fill="#ec4899" stroke="${ink}" stroke-width="0.65"/>
        <path d="M -3.3 ${headCenterY + 1.0} L -4.6 ${headCenterY - 0.4} A 0.75 0.75 0 0 1 -3.3 ${headCenterY - 1.2} A 0.75 0.75 0 0 1 -2.0 ${headCenterY - 0.4} Z" fill="#fdf2f8"/>
        <path d="M 3.3 ${headCenterY + 1.0} L 2.0 ${headCenterY - 0.4} A 0.75 0.75 0 0 1 3.3 ${headCenterY - 1.2} A 0.75 0.75 0 0 1 4.6 ${headCenterY - 0.4} Z" fill="#fdf2f8"/>
      `;
    case "fierce-slant":
      return `
        <path d="M -5.8 ${headCenterY - 2.8} L -1.1 ${headCenterY - 1.5}" stroke="${ink}" stroke-width="1.55" stroke-linecap="round"/>
        <path d="M 5.8 ${headCenterY - 2.8} L 1.1 ${headCenterY - 1.5}" stroke="${ink}" stroke-width="1.55" stroke-linecap="round"/>
        <ellipse cx="-3.3" cy="${headCenterY - 0.2}" rx="2.15" ry="2.25" fill="${persona.eyeHex}" stroke="${ink}" stroke-width="0.65"/>
        <ellipse cx="3.3" cy="${headCenterY - 0.2}" rx="2.15" ry="2.25" fill="${persona.eyeHex}" stroke="${ink}" stroke-width="0.65"/>
        <circle cx="-3.7" cy="${headCenterY - 0.9}" r="0.9" fill="#fef08a"/>
        <circle cx="2.9" cy="${headCenterY - 0.9}" r="0.9" fill="#fef08a"/>
      `;
    case "smug-half":
      return `
        <ellipse cx="-3.3" cy="${headCenterY - 0.1}" rx="2.15" ry="1.85" fill="${persona.eyeHex}" stroke="${ink}" stroke-width="0.6"/>
        <ellipse cx="3.3" cy="${headCenterY - 0.1}" rx="2.15" ry="1.85" fill="${persona.eyeHex}" stroke="${ink}" stroke-width="0.6"/>
        <line x1="-5.7" y1="${headCenterY - 1.4}" x2="-0.9" y2="${headCenterY - 1.1}" stroke="${ink}" stroke-width="1.75" stroke-linecap="round"/>
        <line x1="0.9" y1="${headCenterY - 1.1}" x2="5.7" y2="${headCenterY - 1.4}" stroke="${ink}" stroke-width="1.75" stroke-linecap="round"/>
        <circle cx="-2.8" cy="${headCenterY - 0.5}" r="0.8" fill="#ffffff"/>
        <circle cx="3.8" cy="${headCenterY - 0.5}" r="0.8" fill="#ffffff"/>
      `;
    case "wide-shock":
      return `
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="2.55" fill="#ffffff" stroke="${ink}" stroke-width="1.05"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="2.55" fill="#ffffff" stroke="${ink}" stroke-width="1.05"/>
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="1.15" fill="${persona.eyeHex}"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="1.15" fill="${persona.eyeHex}"/>
        <circle cx="-3.7" cy="${headCenterY - 0.9}" r="0.45" fill="#ffffff"/>
        <circle cx="2.9" cy="${headCenterY - 0.9}" r="0.45" fill="#ffffff"/>
      `;
    case "neon-ring":
      return `
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="2.45" fill="#0f172a"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="2.45" fill="#0f172a"/>
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="1.6" fill="none" stroke="#fef08a" stroke-width="0.95"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="1.6" fill="none" stroke="#fef08a" stroke-width="0.95"/>
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="0.7" fill="#38bdf8"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="0.7" fill="#38bdf8"/>
      `;
    case "panic-spiral":
      return `
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="2.35" fill="#ffffff" stroke="${persona.eyeHex}" stroke-width="1.15"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="2.35" fill="#ffffff" stroke="${persona.eyeHex}" stroke-width="1.15"/>
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="0.95" fill="none" stroke="${persona.eyeHex}" stroke-width="0.95" stroke-dasharray="2 1"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="0.95" fill="none" stroke="${persona.eyeHex}" stroke-width="0.95" stroke-dasharray="2 1"/>
      `;
    default:
      return `
        <path d="M -5.5 ${headCenterY - 2.3} Q -3.3 ${headCenterY - 3.2} -1.2 ${headCenterY - 2.2}" stroke="${ink}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        <path d="M 1.2 ${headCenterY - 2.2} Q 3.3 ${headCenterY - 3.2} 5.5 ${headCenterY - 2.3}" stroke="${ink}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        <ellipse cx="-3.3" cy="${headCenterY - 0.4}" rx="2.15" ry="2.55" fill="${persona.eyeHex}" stroke="${ink}" stroke-width="0.65"/>
        <ellipse cx="3.3" cy="${headCenterY - 0.4}" rx="2.15" ry="2.55" fill="${persona.eyeHex}" stroke="${ink}" stroke-width="0.65"/>
        <ellipse cx="-3.3" cy="${headCenterY - 1.0}" rx="1.5" ry="1.0" fill="${ink}" opacity="0.28"/>
        <ellipse cx="3.3" cy="${headCenterY - 1.0}" rx="1.5" ry="1.0" fill="${ink}" opacity="0.28"/>
        <circle cx="-3.9" cy="${headCenterY - 1.35}" r="0.98" fill="#ffffff"/>
        <circle cx="2.7" cy="${headCenterY - 1.35}" r="0.98" fill="#ffffff"/>
        <circle cx="-2.7" cy="${headCenterY + 0.75}" r="0.48" fill="#ffffff" opacity="0.82"/>
        <circle cx="3.9" cy="${headCenterY + 0.75}" r="0.48" fill="#ffffff" opacity="0.82"/>
      `;
  }
}

export function renderDynamicSpriteMouthSvg(
  expr: DynamicSpriteExpressionSpec,
  k: DynamicSpriteFrameKinematics,
  headCenterY: number,
): string {
  const mouthH = Math.max(1.2, k.mouthOpenRatio * 3.4);
  switch (expr.mouthStyle) {
    case "firm-line":
      return `<path d="M -2.2 ${headCenterY + 4.2} L 2.2 ${headCenterY + 3.9}" stroke="#9f1239" stroke-width="1.35" stroke-linecap="round"/>`;
    case "wavy-panic":
      return `<path d="M -2.8 ${headCenterY + 4.2} Q -1.4 ${headCenterY + 3.1} 0 ${headCenterY + 4.2} T 2.8 ${headCenterY + 4.2}" stroke="#9f1239" stroke-width="1.25" fill="none"/>`;
    case "cat-grin":
      return `<path d="M -2.8 ${headCenterY + 3.8} Q -1.4 ${headCenterY + 5.1} 0 ${headCenterY + 3.8} Q 1.4 ${headCenterY + 5.1} 2.8 ${headCenterY + 3.8}" stroke="#9f1239" stroke-width="1.35" fill="none" stroke-linecap="round"/>`;
    case "smirk":
      return `<path d="M -2.2 ${headCenterY + 4.3} Q 0.4 ${headCenterY + 4.5} 2.6 ${headCenterY + 3.3}" stroke="#9f1239" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
    case "calm-smile":
      return `<path d="M -2.2 ${headCenterY + 3.8} Q 0 ${headCenterY + 5.2} 2.2 ${headCenterY + 3.8}" stroke="#9f1239" stroke-width="1.35" fill="none" stroke-linecap="round"/>`;
    case "surprised-o":
      return `<ellipse cx="0" cy="${headCenterY + 4.3}" rx="1.65" ry="${Math.max(1.8, mouthH)}" fill="#9f1239" stroke="#4c0519" stroke-width="0.45"/>`;
    default:
      return `
        <ellipse cx="0" cy="${headCenterY + 4.2}" rx="2.35" ry="${mouthH}" fill="#e11d48" stroke="#881337" stroke-width="0.45"/>
        <path d="M -1.5 ${headCenterY + 3.5} L 1.5 ${headCenterY + 3.5}" stroke="#ffffff" stroke-width="0.75" stroke-linecap="round"/>
      `;
  }
}

/** 헤어 하이라이트 엔젤링 + 15종 헤어·헤드기어 실루엣 SVG 파츠. */
export function renderDynamicSpriteHeadgearSvg(
  persona: DynamicCreatorPersonaSpriteSpec,
  r: number,
  headCenterY: number,
  hairBouncePx: number,
): string {
  const ink = persona.inkOutlineHex ?? "#1e1b4b";
  const highlight = persona.hairHighlightHex ?? persona.accentHex;
  const angelRing = `<path data-part="hair-highlight-ring" d="M ${(-r * 0.72).toFixed(1)} ${(headCenterY - r * 0.56).toFixed(1)} Q 0 ${(headCenterY - r * 0.92).toFixed(1)} ${(r * 0.72).toFixed(1)} ${(headCenterY - r * 0.56).toFixed(1)}" fill="none" stroke="${highlight}" stroke-width="1.7" stroke-linecap="round" opacity="0.82"/>`;

  const accessory = (() => {
    switch (persona.hairSilhouette) {
      case "beret-spiky":
        return `
          <ellipse cx="-2" cy="${headCenterY - r - 1.5 + hairBouncePx * 0.3}" rx="${r * 0.98}" ry="3.9" fill="${persona.primaryHex}" stroke="${ink}" stroke-width="1.1" transform="rotate(-10, -2, ${headCenterY - r})"/>
          <circle cx="-6" cy="${headCenterY - r - 2.3}" r="1.5" fill="${persona.accentHex}" stroke="${ink}" stroke-width="0.6"/>
        `;
      case "cyber-ponytail":
        return `
          <path d="M ${r - 1} ${headCenterY - 4} Q ${r + 9.5} ${headCenterY - 8 + hairBouncePx} ${r + 7.5} ${headCenterY + 8 + hairBouncePx}" stroke="${persona.hairHex}" stroke-width="4.0" fill="none" stroke-linecap="round"/>
          <path d="M ${r + 1} ${headCenterY - 5} Q ${r + 8} ${headCenterY - 6 + hairBouncePx} ${r + 6.8} ${headCenterY + 4 + hairBouncePx}" stroke="${highlight}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.75"/>
          <circle cx="${r}" cy="${headCenterY - 4}" r="2.0" fill="${persona.accentHex}" stroke="${ink}" stroke-width="0.8"/>
        `;
      case "aurora-twintail":
        return `
          <path d="M ${-r} ${headCenterY - 2} Q ${-r - 7.5} ${headCenterY + 4} ${-r - 5.5} ${headCenterY + 14 + hairBouncePx}" stroke="${persona.hairHex}" stroke-width="3.6" fill="none" stroke-linecap="round"/>
          <path d="M ${r} ${headCenterY - 2} Q ${r + 7.5} ${headCenterY + 4} ${r + 5.5} ${headCenterY + 14 + hairBouncePx}" stroke="${persona.hairHex}" stroke-width="3.6" fill="none" stroke-linecap="round"/>
          <circle cx="${-r - 0.8}" cy="${headCenterY - 2}" r="1.8" fill="${persona.accentHex}" stroke="${ink}" stroke-width="0.6"/>
          <circle cx="${r + 0.8}" cy="${headCenterY - 2}" r="1.8" fill="${persona.accentHex}" stroke="${ink}" stroke-width="0.6"/>
        `;
      case "visor-undercut":
        return `
          <rect x="${-r * 0.9}" y="${headCenterY - 3.7}" width="${r * 1.8}" height="3.4" rx="1.6" fill="${persona.accentHex}" fill-opacity="0.78" stroke="#ffffff" stroke-width="0.7"/>
          <line x1="${r * 0.8}" y1="${headCenterY - 3.5}" x2="${r + 3}" y2="${headCenterY - 9}" stroke="${persona.primaryHex}" stroke-width="1.3" stroke-linecap="round"/>
          <circle cx="${r + 3}" cy="${headCenterY - 9.4}" r="1.4" fill="${persona.accentHex}"/>
        `;
      case "headphone-hood":
        return `
          <path d="M ${-r - 1.5} ${headCenterY - 1} A ${r + 2} ${r + 2.5} 0 0 1 ${r + 1.5} ${headCenterY - 1}" fill="none" stroke="${persona.primaryHex}" stroke-width="2.1"/>
          <rect x="${-r - 3.1}" y="${headCenterY - 2.6}" width="3.4" height="6.6" rx="1.6" fill="${persona.primaryHex}" stroke="${ink}" stroke-width="0.9"/>
          <rect x="${r - 0.3}" y="${headCenterY - 2.6}" width="3.4" height="6.6" rx="1.6" fill="${persona.primaryHex}" stroke="${ink}" stroke-width="0.9"/>
        `;
      case "astral-cat-halo":
        return `
          <polygon points="${-r},${headCenterY - r + 2} ${-r - 4.2},${headCenterY - r - 8.5} ${-r + 4.2},${headCenterY - r - 2}" fill="${persona.primaryHex}" stroke="${ink}" stroke-width="0.9"/>
          <polygon points="${r},${headCenterY - r + 2} ${r + 4.2},${headCenterY - r - 8.5} ${r - 4.2},${headCenterY - r - 2}" fill="${persona.primaryHex}" stroke="${ink}" stroke-width="0.9"/>
          <polygon points="${-r - 0.5},${headCenterY - r + 0.5} ${-r - 2.6},${headCenterY - r - 5.5} ${-r + 2},${headCenterY - r - 1.8}" fill="#fda4af"/>
          <polygon points="${r + 0.5},${headCenterY - r + 0.5} ${r + 2.6},${headCenterY - r - 5.5} ${r - 2},${headCenterY - r - 1.8}" fill="#fda4af"/>
        `;
      case "royal-tiara-curls":
        return `
          <path d="M ${-r - 1.5} ${headCenterY + 1} Q ${-r - 7} ${headCenterY + 10} ${-r - 2.5} ${headCenterY + 18 + hairBouncePx}" stroke="${persona.hairHex}" stroke-width="3.8" fill="none" stroke-linecap="round"/>
          <path d="M ${r + 1.5} ${headCenterY + 1} Q ${r + 7} ${headCenterY + 10} ${r + 2.5} ${headCenterY + 18 + hairBouncePx}" stroke="${persona.hairHex}" stroke-width="3.8" fill="none" stroke-linecap="round"/>
          <polygon points="-5.8,${headCenterY - r - 1} -3.5,${headCenterY - r - 6.8} -1.2,${headCenterY - r - 2.8} 0,${headCenterY - r - 8.4} 1.2,${headCenterY - r - 2.8} 3.5,${headCenterY - r - 6.8} 5.8,${headCenterY - r - 1}" fill="#fde047" stroke="${ink}" stroke-width="0.8"/>
          <circle cx="0" cy="${headCenterY - r - 4.2}" r="1.2" fill="#e11d48"/>
        `;
      case "imperial-crown-sweep":
        return `
          <path d="M ${-r} ${headCenterY - r + 1} Q 0 ${headCenterY - r - 7} ${r + 2} ${headCenterY - r + 2}" fill="${persona.hairHex}" stroke="${ink}" stroke-width="0.8"/>
          <polygon points="-4.5,${headCenterY - r - 2} -2.2,${headCenterY - r - 6.2} 0,${headCenterY - r - 3.4} 2.2,${headCenterY - r - 6.2} 4.5,${headCenterY - r - 2}" fill="#facc15" stroke="${ink}" stroke-width="0.75"/>
        `;
      case "hunter-spiky-aura":
        return `
          <path d="M ${-r - 2} ${headCenterY - 4} L ${-r - 5} ${headCenterY - r - 3} L ${-3} ${headCenterY - r - 5} L 0 ${headCenterY - r - 8.5} L 4 ${headCenterY - r - 4.5} L ${r + 5} ${headCenterY - r - 2.5} L ${r + 2} ${headCenterY - 4} Z" fill="${persona.hairHex}" stroke="${persona.accentHex}" stroke-width="0.85"/>
        `;
      case "academy-ribbon-long":
        return `
          <path d="M ${-r - 1} ${headCenterY} Q ${-r - 4} ${headCenterY + 12} ${-r - 1.5} ${headCenterY + 19 + hairBouncePx * 0.6}" stroke="${persona.hairHex}" stroke-width="3.6" fill="none" stroke-linecap="round"/>
          <path d="M ${r + 1} ${headCenterY} Q ${r + 4} ${headCenterY + 12} ${r + 1.5} ${headCenterY + 19 + hairBouncePx * 0.6}" stroke="${persona.hairHex}" stroke-width="3.6" fill="none" stroke-linecap="round"/>
          <polygon points="${-r + 1},${headCenterY - r + 1} ${-r - 4},${headCenterY - r - 3} ${-r - 3.5},${headCenterY - r + 3.5}" fill="${persona.accentHex}" stroke="${ink}" stroke-width="0.65"/>
          <polygon points="${-r + 1},${headCenterY - r + 1} ${-r + 5},${headCenterY - r - 2.5} ${-r + 4.5},${headCenterY - r + 3}" fill="${persona.accentHex}" stroke="${ink}" stroke-width="0.65"/>
        `;
      case "murim-topknot-ribbon":
        return `
          <ellipse cx="0" cy="${headCenterY - r - 4.5}" rx="3.8" ry="3.2" fill="${persona.hairHex}" stroke="${ink}" stroke-width="0.9"/>
          <line x1="-6.5" y1="${headCenterY - r - 4.5}" x2="6.5" y2="${headCenterY - r - 4.5}" stroke="${persona.accentHex}" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M 3 ${headCenterY - r - 4} Q ${r + 9} ${headCenterY - r + hairBouncePx} ${r + 11} ${headCenterY + 8 + hairBouncePx}" fill="none" stroke="${persona.accentHex}" stroke-width="1.9" stroke-linecap="round"/>
        `;
      case "barista-beret-bun":
        return `
          <circle cx="${r + 1.5}" cy="${headCenterY - 3}" r="3.4" fill="${persona.hairHex}" stroke="${ink}" stroke-width="0.8"/>
          <ellipse cx="-1" cy="${headCenterY - r - 1.8}" rx="${r * 1.02}" ry="3.8" fill="${persona.primaryHex}" stroke="${ink}" stroke-width="1.05" transform="rotate(-8, -1, ${headCenterY - r})"/>
          <circle cx="-1" cy="${headCenterY - r - 5.4}" r="1.2" fill="${persona.accentHex}"/>
        `;
      case "corgi-ears-hood":
        return `
          <ellipse cx="${-r + 1.5}" cy="${headCenterY - r - 4.2}" rx="3.4" ry="5.6" fill="#f59e0b" stroke="${ink}" stroke-width="0.9" transform="rotate(-22, ${-r + 1.5}, ${headCenterY - r - 4.2})"/>
          <ellipse cx="${r - 1.5}" cy="${headCenterY - r - 4.2}" rx="3.4" ry="5.6" fill="#f59e0b" stroke="${ink}" stroke-width="0.9" transform="rotate(22, ${r - 1.5}, ${headCenterY - r - 4.2})"/>
          <ellipse cx="${-r + 1.5}" cy="${headCenterY - r - 4.0}" rx="1.6" ry="3.2" fill="#fffbeb" transform="rotate(-22, ${-r + 1.5}, ${headCenterY - r - 4.0})"/>
          <ellipse cx="${r - 1.5}" cy="${headCenterY - r - 4.0}" rx="1.6" ry="3.2" fill="#fffbeb" transform="rotate(22, ${r - 1.5}, ${headCenterY - r - 4.0})"/>
        `;
      case "scholar-wave":
        return `
          <path d="M ${-r - 1} ${headCenterY + 1} Q ${-r - 3.8} ${headCenterY + 7} ${-r} ${headCenterY + 12 + hairBouncePx * 0.4}" stroke="${persona.hairHex}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
          <path d="M ${r + 1} ${headCenterY + 1} Q ${r + 3.8} ${headCenterY + 7} ${r} ${headCenterY + 12 + hairBouncePx * 0.4}" stroke="${persona.hairHex}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        `;
      case "executive-bob":
      default:
        return `
          <path d="M ${-r - 1.2} ${headCenterY - 1} Q ${-r - 2.6} ${headCenterY + 5} ${-r + 1.8} ${headCenterY + 9}" stroke="${persona.hairHex}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
          <path d="M ${r + 1.2} ${headCenterY - 1} Q ${r + 2.6} ${headCenterY + 5} ${r - 1.8} ${headCenterY + 9}" stroke="${persona.hairHex}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        `;
    }
  })();

  return `${angelRing}${accessory}`;
}

/** 15종 의상 실루엣별 다층 레이어(칼라·리본·견장·한복 동정·코트 단·허리띠) SVG 파츠. */
export function renderDynamicSpriteOutfitDetailsSvg(
  persona: DynamicCreatorPersonaSpriteSpec,
  k: DynamicSpriteFrameKinematics,
  shoulderY: number,
  hipY: number,
  isBack: boolean,
): string {
  const ink = persona.inkOutlineHex ?? "#1e1b4b";
  const trim = persona.outfitTrimHex ?? persona.accentHex;
  const waistY = hipY - 4;
  if (isBack) {
    return `<path data-part="outfit-back-trim" d="M -10 ${waistY} L 10 ${waistY}" stroke="${trim}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>`;
  }
  switch (persona.outfitSilhouette) {
    case "rofan-ballgown-cape":
      return `
        <g data-part="outfit-detail-rofan">
          <path d="M -10.5 ${waistY} L 10.5 ${waistY} L 17 ${hipY + 19 + k.capeWavePx * 0.25} Q 0 ${hipY + 24} -17 ${hipY + 19 + k.capeWavePx * 0.25} Z" fill="${persona.primaryHex}" stroke="${ink}" stroke-width="1.2"/>
          <path d="M -15 ${hipY + 17} Q 0 ${hipY + 22} 15 ${hipY + 17}" fill="none" stroke="${trim}" stroke-width="1.6" stroke-dasharray="2.2 1.8"/>
          <polygon points="-4,${waistY} 0,${waistY - 3} 4,${waistY} 0,${waistY + 3}" fill="${trim}" stroke="${ink}" stroke-width="0.7"/>
          <path d="M -6 ${shoulderY + 1} Q 0 ${shoulderY + 7} 6 ${shoulderY + 1}" fill="none" stroke="${trim}" stroke-width="1.5"/>
        </g>
      `;
    case "imperial-uniform-mantle":
      return `
        <g data-part="outfit-detail-imperial">
          <rect x="-13.5" y="${shoulderY - 1}" width="5.5" height="3.2" rx="1.2" fill="${trim}" stroke="${ink}" stroke-width="0.8"/>
          <rect x="8" y="${shoulderY - 1}" width="5.5" height="3.2" rx="1.2" fill="${trim}" stroke="${ink}" stroke-width="0.8"/>
          <line x1="-8" y1="${shoulderY + 3}" x2="8" y2="${waistY}" stroke="${trim}" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="0" cy="${shoulderY + 10}" r="1.5" fill="${trim}"/>
          <circle cx="0" cy="${shoulderY + 16}" r="1.5" fill="${trim}"/>
          <rect x="-10" y="${waistY - 1}" width="20" height="3.4" rx="1" fill="${ink}" stroke="${trim}" stroke-width="0.8"/>
        </g>
      `;
    case "hunter-mana-coat":
      return `
        <g data-part="outfit-detail-hunter">
          <path d="M -11 ${shoulderY} L -4 ${shoulderY + 11} L -10 ${shoulderY + 14} Z" fill="${persona.secondaryHex}" stroke="${trim}" stroke-width="1.1"/>
          <path d="M 11 ${shoulderY} L 4 ${shoulderY + 11} L 10 ${shoulderY + 14} Z" fill="${persona.secondaryHex}" stroke="${trim}" stroke-width="1.1"/>
          <line x1="0" y1="${shoulderY + 4}" x2="0" y2="${hipY + 4}" stroke="${trim}" stroke-width="1.4" stroke-dasharray="3 2"/>
          <rect x="-9.5" y="${waistY}" width="19" height="3" rx="1" fill="${persona.secondaryHex}" stroke="${trim}" stroke-width="0.9"/>
        </g>
      `;
    case "seoul-academy-blazer":
      return `
        <g data-part="outfit-detail-academy">
          <polygon points="-5.5,${shoulderY} 0,${shoulderY + 12} 5.5,${shoulderY}" fill="#ffffff" stroke="${ink}" stroke-width="0.8"/>
          <polygon points="-3.6,${shoulderY + 4.5} 0,${shoulderY + 7.5} 3.6,${shoulderY + 4.5} 0,${shoulderY + 10.5}" fill="${persona.accentHex}" stroke="${ink}" stroke-width="0.6"/>
          <path d="M -9.5 ${waistY + 1} L 9.5 ${waistY + 1} L 13 ${hipY + 13} L -13 ${hipY + 13} Z" fill="${persona.secondaryHex}" stroke="${ink}" stroke-width="1.1"/>
          <line x1="-4" y1="${waistY + 2}" x2="-5" y2="${hipY + 12}" stroke="${trim}" stroke-width="0.8" opacity="0.55"/>
          <line x1="4" y1="${waistY + 2}" x2="5" y2="${hipY + 12}" stroke="${trim}" stroke-width="0.8" opacity="0.55"/>
        </g>
      `;
    case "murim-hanbok-robe":
      return `
        <g data-part="outfit-detail-murim">
          <path d="M -7 ${shoulderY} L 4 ${shoulderY + 15}" stroke="${trim}" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M 7 ${shoulderY} L -2 ${shoulderY + 11}" stroke="${trim}" stroke-width="2.4" stroke-linecap="round"/>
          <rect x="-10.5" y="${waistY - 1}" width="21" height="4" rx="1.2" fill="${persona.secondaryHex}" stroke="${persona.accentHex}" stroke-width="0.9"/>
          <path d="M 2 ${waistY + 2} Q ${6 + k.capeWavePx * 0.4} ${hipY + 12} ${4 + k.capeWavePx * 0.6} ${hipY + 22}" fill="none" stroke="${persona.accentHex}" stroke-width="2.2" stroke-linecap="round"/>
        </g>
      `;
    case "cafe-barista-apron":
    case "prism-atelier-apron":
      return `
        <g data-part="outfit-detail-apron">
          <rect x="-7.5" y="${shoulderY + 6}" width="15" height="${hipY - shoulderY - 1}" rx="2.4" fill="${trim}" stroke="${ink}" stroke-width="1.05" opacity="0.95"/>
          <rect x="-4.5" y="${waistY - 4}" width="9" height="5.5" rx="1.2" fill="${persona.primaryHex}" stroke="${ink}" stroke-width="0.7"/>
          <line x1="-6" y1="${shoulderY}" x2="-5.5" y2="${shoulderY + 7}" stroke="${trim}" stroke-width="1.6"/>
          <line x1="6" y1="${shoulderY}" x2="5.5" y2="${shoulderY + 7}" stroke="${trim}" stroke-width="1.6"/>
        </g>
      `;
    default:
      return `
        <g data-part="outfit-detail-studio">
          <path d="M -5 ${shoulderY} L 0 ${shoulderY + 16} L 5 ${shoulderY}" fill="${trim}" stroke="${ink}" stroke-width="0.7" opacity="0.9"/>
          <rect x="-9.5" y="${waistY}" width="19" height="3.1" rx="1" fill="${persona.secondaryHex}" stroke="${trim}" stroke-width="0.85"/>
          <rect x="-2.2" y="${waistY - 0.5}" width="4.4" height="4.1" rx="0.8" fill="${persona.accentHex}" stroke="${ink}" stroke-width="0.6"/>
        </g>
      `;
  }
}

/** 캐릭터 시그니처 소품(스타일러스 펜·태블릿·장미 깃펜·마나 검·청강검·커피 드리퍼 등) SVG 파츠. */
export function renderDynamicSpritePropSvg(
  persona: DynamicCreatorPersonaSpriteSpec,
  actionId: DynamicSpriteExtendedActionId,
  vfx: DynamicSpriteVfxSpec,
): string {
  const ink = persona.inkOutlineHex ?? "#1e1b4b";
  if (actionId === "espresso-power-charge" || persona.propKind === "coffee-dripper") {
    return `
      <g data-part="signature-prop">
        <rect x="-4" y="22" width="8" height="9" rx="2" fill="#fef3c7" stroke="#78350f" stroke-width="1.1"/>
        <path d="M 4 24.5 Q 7 26.5 4 28.5" fill="none" stroke="#78350f" stroke-width="1.1"/>
        <path d="M -1.5 20 Q 0 17 -1.2 15 M 1.8 20 Q 3.2 17 2 15" fill="none" stroke="#fbcfe8" stroke-width="1.1" stroke-linecap="round"/>
      </g>
    `;
  }
  switch (persona.propKind) {
    case "tablet-deck":
    case "sketchbook":
      return `
        <g data-part="signature-prop" transform="translate(2, 24) rotate(-18)">
          <rect x="-6.5" y="-4.5" width="13" height="9.5" rx="1.6" fill="#0f172a" stroke="${persona.accentHex}" stroke-width="1.2"/>
          <rect x="-4.8" y="-3" width="9.6" height="6.5" rx="0.8" fill="${vfx.primaryColorHex}" opacity="0.45"/>
          <line x1="-3.5" y1="-1" x2="3.5" y2="-1" stroke="#ffffff" stroke-width="0.9"/>
          <line x1="-3.5" y1="1.3" x2="1.5" y2="1.3" stroke="${persona.accentHex}" stroke-width="0.9"/>
        </g>
      `;
    case "rose-quill":
      return `
        <g data-part="signature-prop">
          <line x1="0" y1="28" x2="15" y2="-4" stroke="#fde68a" stroke-width="2" stroke-linecap="round"/>
          <path d="M 10 4 Q 21 -4 18 -13 Q 11 -10 10 4 Z" fill="#fb7185" stroke="${ink}" stroke-width="0.8"/>
          <circle cx="15" cy="-6" r="2.2" fill="#fff1f2"/>
        </g>
      `;
    case "mana-blade":
    case "murim-sword":
      return `
        <g data-part="signature-prop">
          <line x1="-2" y1="30" x2="20" y2="-12" stroke="${persona.accentHex}" stroke-width="3.2" stroke-linecap="round"/>
          <line x1="0" y1="26" x2="19" y2="-10" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="-4" y1="24" x2="6" y2="29" stroke="${persona.outfitTrimHex ?? "#fde047"}" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="20" cy="-12" r="2.6" fill="${vfx.primaryColorHex}"/>
        </g>
      `;
    case "holo-gizmo":
      return `
        <g data-part="signature-prop" transform="translate(8, 22)">
          <polygon points="0,-7 6.5,-3 6.5,4 0,8 -6.5,4 -6.5,-3" fill="${vfx.primaryColorHex}" fill-opacity="0.32" stroke="${persona.accentHex}" stroke-width="1.3"/>
          <circle cx="0" cy="0.5" r="2.2" fill="#ffffff"/>
        </g>
      `;
    default:
      return `
        <g data-part="signature-prop">
          <line x1="0" y1="28" x2="18" y2="-10" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/>
          <line x1="0" y1="28" x2="18" y2="-10" stroke="${persona.accentHex}" stroke-width="2.0" stroke-linecap="round"/>
          <circle cx="19" cy="-12" r="3.4" fill="${vfx.primaryColorHex}" stroke="#ffffff" stroke-width="0.8"/>
        </g>
      `;
  }
}

/** 반려 고양이(치즈냥)·반려 강아지(웰시코기)·홀로 드론 동행 마스코트 SVG 파츠. */
export function renderDynamicSpriteCompanionSvg(
  persona: DynamicCreatorPersonaSpriteSpec,
  k: DynamicSpriteFrameKinematics,
): string {
  const bobY = Number((Math.sin((k.frameIndex / 8) * Math.PI * 2) * 2.4).toFixed(2));
  const tailWag = Number((Math.cos((k.frameIndex / 8) * Math.PI * 2) * 3.2).toFixed(2));
  switch (persona.companionKind) {
    case "cheese-cat":
      return `
        <g data-part="companion-mascot" data-companion="cheese-cat" transform="translate(118, ${126 + bobY})">
          <ellipse cx="0" cy="14" rx="10" ry="3" fill="#0f172a" opacity="0.22"/>
          <path d="M 7 6 Q ${14 + tailWag} -2 ${11 + tailWag} -8" fill="none" stroke="#f59e0b" stroke-width="2.8" stroke-linecap="round"/>
          <ellipse cx="0" cy="5" rx="8.5" ry="7.2" fill="#fbbf24" stroke="#78350f" stroke-width="1.1"/>
          <polygon points="-6.5,-1 -8,-9 -2,-4" fill="#f59e0b" stroke="#78350f" stroke-width="0.9"/>
          <polygon points="6.5,-1 8,-9 2,-4" fill="#f59e0b" stroke="#78350f" stroke-width="0.9"/>
          <circle cx="-3" cy="3.5" r="1.2" fill="#1e293b"/>
          <circle cx="3" cy="3.5" r="1.2" fill="#1e293b"/>
          <ellipse cx="-5" cy="5.8" rx="1.4" ry="0.8" fill="#fb7185" opacity="0.7"/>
          <ellipse cx="5" cy="5.8" rx="1.4" ry="0.8" fill="#fb7185" opacity="0.7"/>
          <path d="M -1.5 5.5 Q 0 7 1.5 5.5" fill="none" stroke="#78350f" stroke-width="0.9" stroke-linecap="round"/>
        </g>
      `;
    case "welsh-corgi":
      return `
        <g data-part="companion-mascot" data-companion="welsh-corgi" transform="translate(118, ${125 + bobY})">
          <ellipse cx="0" cy="15" rx="11.5" ry="3.2" fill="#0f172a" opacity="0.24"/>
          <circle cx="${9 + tailWag * 0.4}" cy="5" r="3" fill="#fffbeb" stroke="#78350f" stroke-width="0.9"/>
          <ellipse cx="0" cy="6" rx="9.5" ry="7.5" fill="#f59e0b" stroke="#78350f" stroke-width="1.15"/>
          <ellipse cx="0" cy="9" rx="6.5" ry="4.2" fill="#fffbeb"/>
          <ellipse cx="-6.8" cy="-4.5" rx="2.8" ry="5" fill="#f59e0b" stroke="#78350f" stroke-width="0.95" transform="rotate(-18, -6.8, -4.5)"/>
          <ellipse cx="6.8" cy="-4.5" rx="2.8" ry="5" fill="#f59e0b" stroke="#78350f" stroke-width="0.95" transform="rotate(18, 6.8, -4.5)"/>
          <circle cx="-3.1" cy="3.8" r="1.3" fill="#1e293b"/>
          <circle cx="3.1" cy="3.8" r="1.3" fill="#1e293b"/>
          <circle cx="0" cy="6" r="1.2" fill="#291509"/>
          <path d="M -1.5 8 Q 0 9.6 1.5 8" fill="none" stroke="#ef4444" stroke-width="1" stroke-linecap="round"/>
        </g>
      `;
    case "holo-drone":
      return `
        <g data-part="companion-mascot" data-companion="holo-drone" transform="translate(122, ${44 + bobY * 1.4})">
          <circle cx="0" cy="0" r="8" fill="#0f172a" stroke="#38bdf8" stroke-width="1.3"/>
          <circle cx="0" cy="0" r="3.4" fill="#22d3ee"/>
          <ellipse cx="0" cy="0" rx="12" ry="3.2" fill="none" stroke="#67e8f9" stroke-width="1" stroke-dasharray="3 2"/>
        </g>
      `;
    default:
      return "";
  }
}

function renderDramaticVfxOverlaySvg(
  dramaticVfxId: StudioDramaticVfxId,
  k: DynamicSpriteFrameKinematics,
  reducedMotion: boolean,
): string {
  const plan = resolveDramaticVfxRenderPlan(dramaticVfxId, { reducedMotion });
  const spec = getStudioDramaticVfxSpec(dramaticVfxId);
  if (plan.reducedMotion) {
    return `
      <g data-part="dramatic-vfx-reduced" data-dramatic-vfx="${spec.id}" data-vfx-reduced="true" transform="translate(80, 92)">
        <ellipse cx="0" cy="40" rx="40" ry="11" fill="${plan.glowColorHex}" fill-opacity="${plan.glowOpacity}" stroke="${plan.glowColorHex}" stroke-width="1.3"/>
        <circle cx="48" cy="-54" r="11" fill="#0f172a" fill-opacity="0.72" stroke="${plan.glowColorHex}" stroke-width="1.2"/>
      </g>
    `;
  }
  const pulse = k.vfxPulseScale;
  const rot = k.weaponOrbitDeg;
  switch (dramaticVfxId) {
    case "rhythm-note-wave":
      return `
        <g data-part="dramatic-vfx" data-dramatic-vfx="rhythm-note-wave" transform="translate(80, 92) scale(${pulse})">
          <ellipse cx="0" cy="40" rx="50" ry="14" fill="none" stroke="${spec.primaryHex}" stroke-width="2.1" stroke-dasharray="7 4" opacity="0.86"/>
          <ellipse cx="0" cy="40" rx="34" ry="9" fill="none" stroke="${spec.secondaryHex}" stroke-width="1.6" opacity="0.8"/>
          <path d="M -56 -24 L -56 -42 L -44 -46 L -44 -28" fill="none" stroke="${spec.primaryHex}" stroke-width="2.2"/>
          <circle cx="-58" cy="-24" r="3.4" fill="${spec.accentHex}"/>
          <circle cx="-46" cy="-28" r="3.4" fill="${spec.secondaryHex}"/>
          <path d="M 48 -30 L 48 -48 L 58 -51 L 58 -33" fill="none" stroke="${spec.secondaryHex}" stroke-width="2.2"/>
          <circle cx="46" cy="-30" r="3.2" fill="${spec.primaryHex}"/>
          <circle cx="56" cy="-33" r="3.2" fill="${spec.accentHex}"/>
        </g>
      `;
    case "stage-spotlight-ring":
      return `
        <g data-part="dramatic-vfx" data-dramatic-vfx="stage-spotlight-ring" transform="translate(80, 92) scale(${pulse})">
          <polygon points="-14,-82 14,-82 44,44 -44,44" fill="${spec.primaryHex}" fill-opacity="0.16"/>
          <ellipse cx="0" cy="41" rx="52" ry="15" fill="${spec.primaryHex}" fill-opacity="0.2" stroke="${spec.primaryHex}" stroke-width="2.2"/>
          <ellipse cx="0" cy="41" rx="36" ry="10" fill="none" stroke="${spec.secondaryHex}" stroke-width="1.6" stroke-dasharray="5 3"/>
          <g transform="rotate(${rot})">
            <rect x="-52" y="-34" width="6" height="3.2" rx="1" fill="${spec.secondaryHex}"/>
            <rect x="46" y="-26" width="6" height="3.2" rx="1" fill="${spec.accentHex}"/>
            <polygon points="0,-64 3.5,-56 -3.5,-56" fill="${spec.primaryHex}"/>
          </g>
        </g>
      `;
    case "mint-healing-spark":
      return `
        <g data-part="dramatic-vfx" data-dramatic-vfx="mint-healing-spark" transform="translate(80, 92) scale(${pulse})">
          <ellipse cx="0" cy="40" rx="44" ry="12" fill="${spec.primaryHex}" fill-opacity="0.22" stroke="${spec.primaryHex}" stroke-width="1.8"/>
          <circle cx="0" cy="-14" r="40" fill="none" stroke="${spec.secondaryHex}" stroke-width="1.4" stroke-dasharray="6 5" opacity="0.72"/>
          <path d="M -48 -28 L -48 -18 M -53 -23 L -43 -23" stroke="${spec.accentHex}" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M 48 -36 L 48 -26 M 43 -31 L 53 -31" stroke="${spec.primaryHex}" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M 44 10 L 44 18 M 40 14 L 48 14" stroke="${spec.secondaryHex}" stroke-width="2" stroke-linecap="round"/>
        </g>
      `;
    case "team-harmony-wave":
      return `
        <g data-part="dramatic-vfx" data-dramatic-vfx="team-harmony-wave" transform="translate(80, 92) scale(${pulse})">
          <ellipse cx="0" cy="40" rx="54" ry="15" fill="none" stroke="${spec.primaryHex}" stroke-width="2.2" opacity="0.88"/>
          <ellipse cx="0" cy="40" rx="40" ry="11" fill="none" stroke="${spec.secondaryHex}" stroke-width="1.8" stroke-dasharray="6 3" opacity="0.86"/>
          <path d="M -64 -16 Q -32 -46 0 -16 T 64 -16" fill="none" stroke="${spec.secondaryHex}" stroke-width="2.2" stroke-linecap="round" opacity="0.82"/>
          <circle cx="-54" cy="-22" r="3.6" fill="${spec.accentHex}"/>
          <circle cx="54" cy="-22" r="3.6" fill="${spec.primaryHex}"/>
        </g>
      `;
    case "rofan-rose-petals":
      return `
        <g data-part="dramatic-vfx" data-dramatic-vfx="rofan-rose-petals" transform="translate(80, 92) scale(${pulse})">
          <ellipse cx="0" cy="40" rx="48" ry="13" fill="${spec.secondaryHex}" fill-opacity="0.2" stroke="${spec.accentHex}" stroke-width="1.6"/>
          <ellipse cx="-50" cy="-36" rx="5.5" ry="2.8" fill="${spec.primaryHex}" transform="rotate(-32 -50 -36)"/>
          <ellipse cx="52" cy="-28" rx="5.5" ry="2.8" fill="${spec.secondaryHex}" transform="rotate(28 52 -28)"/>
          <ellipse cx="-44" cy="10" rx="4.8" ry="2.4" fill="${spec.primaryHex}" transform="rotate(22 -44 10)"/>
          <ellipse cx="46" cy="14" rx="4.8" ry="2.4" fill="${spec.accentHex}" transform="rotate(-24 46 14)"/>
        </g>
      `;
    case "deadline-confetti-fireworks":
      return `
        <g data-part="dramatic-vfx" data-dramatic-vfx="deadline-confetti-fireworks" transform="translate(80, 92) scale(${pulse})">
          <g stroke="${spec.primaryHex}" stroke-width="1.8" stroke-linecap="round">
            <line x1="-44" y1="-52" x2="-58" y2="-66"/><line x1="44" y1="-52" x2="58" y2="-66"/>
            <line x1="-54" y1="-22" x2="-68" y2="-26"/><line x1="54" y1="-22" x2="68" y2="-26"/>
          </g>
          <rect x="-52" y="-44" width="6" height="3.2" fill="${spec.secondaryHex}" transform="rotate(25 -52 -44)"/>
          <rect x="46" y="-42" width="6" height="3.2" fill="${spec.accentHex}" transform="rotate(-28 46 -42)"/>
          <polygon points="0,-68 3.6,-58 12,-58 5,-52 8,-43 0,-48 -8,-43 -5,-52 -12,-58 -3.6,-58" fill="${spec.primaryHex}" opacity="0.88"/>
        </g>
      `;
    case "coffee-healing-steam":
      return `
        <g data-part="dramatic-vfx" data-dramatic-vfx="coffee-healing-steam" transform="translate(80, 92) scale(${pulse})">
          <path d="M -42 6 Q -48 -14 -38 -30 Q -32 -44 -42 -56" fill="none" stroke="${spec.accentHex}" stroke-width="2.2" stroke-linecap="round" opacity="0.8"/>
          <path d="M 42 4 Q 48 -16 38 -32 Q 32 -46 42 -58" fill="none" stroke="${spec.primaryHex}" stroke-width="2" stroke-linecap="round" opacity="0.72"/>
          <path d="M 46 -44 L 41 -49 A 2.6 2.6 0 0 1 46 -52 A 2.6 2.6 0 0 1 51 -49 Z" fill="${spec.secondaryHex}"/>
        </g>
      `;
    case "entrance-spotlight-beam":
      return `
        <g data-part="dramatic-vfx" data-dramatic-vfx="entrance-spotlight-beam" transform="translate(80, 92) scale(${pulse})">
          <polygon points="-16,-84 16,-84 42,44 -42,44" fill="${spec.primaryHex}" fill-opacity="0.18"/>
          <ellipse cx="0" cy="40" rx="44" ry="12" fill="${spec.primaryHex}" fill-opacity="0.24" stroke="${spec.secondaryHex}" stroke-width="1.6"/>
        </g>
      `;
    default:
      return `
        <g data-part="dramatic-vfx" data-dramatic-vfx="${spec.id}" transform="translate(80, 92) scale(${pulse})">
          <ellipse cx="0" cy="40" rx="48" ry="13" fill="none" stroke="${spec.primaryHex}" stroke-width="2" stroke-dasharray="7 4" opacity="0.84"/>
          <g transform="rotate(${rot})">
            <circle cx="-48" cy="-24" r="3.2" fill="${spec.secondaryHex}"/>
            <circle cx="48" cy="-20" r="3.2" fill="${spec.accentHex}"/>
          </g>
        </g>
      `;
  }
}

export function renderDynamicSpriteVfxLayerSvg(
  vfxId: DynamicSpriteVfxId,
  actionId: DynamicSpriteExtendedActionId,
  vfx: DynamicSpriteVfxSpec,
  k: DynamicSpriteFrameKinematics,
  options?: { readonly dramaticVfxId?: StudioDramaticVfxId; readonly reducedMotion?: boolean },
): string {
  if (options?.dramaticVfxId) {
    return renderDramaticVfxOverlaySvg(options.dramaticVfxId, k, Boolean(options.reducedMotion));
  }
  if (options?.reducedMotion) {
    return `
      <g class="sprite-vfx-layer" data-vfx-reduced="true" transform="translate(80, 92)">
        <ellipse cx="0" cy="40" rx="38" ry="11" fill="${vfx.secondaryColorHex}" fill-opacity="0.22" stroke="${vfx.primaryColorHex}" stroke-width="1.4" opacity="0.7"/>
      </g>
    `;
  }
  const extraVfx = (() => {
    switch (vfxId) {
      case "manga-speedlines":
        return `<g stroke="${vfx.primaryColorHex}" stroke-width="1.8" opacity="0.84" stroke-linecap="round">
          <line x1="-70" y1="-60" x2="-36" y2="-30"/>
          <line x1="70" y1="-60" x2="36" y2="-30"/>
          <line x1="-74" y1="0" x2="-40" y2="-6"/>
          <line x1="74" y1="0" x2="40" y2="-6"/>
          <line x1="-66" y1="34" x2="-38" y2="18" stroke="${vfx.secondaryColorHex}"/>
          <line x1="66" y1="34" x2="38" y2="18" stroke="${vfx.secondaryColorHex}"/>
        </g>`;
      case "holo-floating-monitors":
        return `<g opacity="0.94">
          <rect x="-66" y="-48" width="26" height="17" rx="3" fill="#0f172a" fill-opacity="0.86" stroke="${vfx.primaryColorHex}" stroke-width="1.5"/>
          <rect x="40" y="-44" width="26" height="17" rx="3" fill="#0f172a" fill-opacity="0.86" stroke="${vfx.secondaryColorHex}" stroke-width="1.5"/>
          <line x1="-61" y1="-40" x2="-45" y2="-40" stroke="${vfx.secondaryColorHex}" stroke-width="1.2"/>
          <line x1="-61" y1="-35" x2="-50" y2="-35" stroke="${vfx.primaryColorHex}" stroke-width="1"/>
          <line x1="45" y1="-36" x2="61" y2="-36" stroke="${vfx.primaryColorHex}" stroke-width="1.2"/>
          <line x1="45" y1="-31" x2="56" y2="-31" stroke="${vfx.secondaryColorHex}" stroke-width="1"/>
        </g>`;
      case "prism-stardust-burst":
        return `<g fill="${vfx.secondaryColorHex}" opacity="0.94">
          <polygon points="-52,-46 -49,-40 -43,-38 -49,-36 -52,-30 -55,-36 -61,-38 -55,-40"/>
          <polygon points="54,-42 57,-36 63,-34 57,-32 54,-26 51,-32 45,-34 51,-36"/>
          <circle cx="-46" cy="12" r="3.4" fill="${vfx.primaryColorHex}"/>
          <circle cx="48" cy="14" r="3.4" fill="${vfx.primaryColorHex}"/>
          <circle cx="0" cy="-64" r="2.6" fill="#fef08a"/>
        </g>`;
      case "fever-lightning-flames":
        return `<g stroke="${vfx.primaryColorHex}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.92">
          <polyline points="-54,28 -44,4 -50,-4 -38,-32"/>
          <polyline points="54,28 44,4 50,-4 38,-32"/>
          <polyline points="-40,36 -34,14 -39,8 -30,-16" stroke="${vfx.secondaryColorHex}" stroke-width="1.5"/>
        </g>`;
      case "biophilic-sakura-wind":
        return `<g fill="${vfx.secondaryColorHex}" opacity="0.9">
          <ellipse cx="-50" cy="-28" rx="4.8" ry="2.4" fill="${vfx.primaryColorHex}" transform="rotate(-25 -50 -28)"/>
          <ellipse cx="48" cy="-18" rx="4.8" ry="2.4" fill="${vfx.primaryColorHex}" transform="rotate(30 48 -18)"/>
          <circle cx="-38" cy="8" r="2.2" fill="${vfx.secondaryColorHex}"/>
          <circle cx="42" cy="-42" r="2.4" fill="#fef08a"/>
          <path d="M -58 10 Q 0 -18 58 14" fill="none" stroke="${vfx.primaryColorHex}" stroke-width="1.6" stroke-dasharray="5 4"/>
        </g>`;
      case "collab-tether-beam":
        return `<g stroke="${vfx.primaryColorHex}" fill="none" opacity="0.9">
          <path d="M -64 -8 C -28 -44, 28 -44, 64 -8" stroke-width="2.2" stroke-dasharray="4 3"/>
          <circle cx="-64" cy="-8" r="3.8" fill="${vfx.secondaryColorHex}"/>
          <circle cx="64" cy="-8" r="3.8" fill="${vfx.secondaryColorHex}"/>
        </g>`;
      default:
        return "";
    }
  })();

  const slashSvg =
    vfxId === "crimson-ink-slash" || actionId === "tablet-combo-draw"
      ? `<path d="M -56 -12 Q 0 -68 58 6" fill="none" stroke="${vfx.primaryColorHex}" stroke-width="4.2" stroke-linecap="round" opacity="0.86"/>
         <path d="M -52 -10 Q 0 -62 54 6" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" opacity="0.72"/>`
      : "";

  return `
    <g class="sprite-vfx-layer" transform="translate(80, 92) scale(${k.vfxPulseScale})">
      <ellipse cx="0" cy="40" rx="46" ry="14" fill="none" stroke="${vfx.primaryColorHex}" stroke-width="2.1" stroke-dasharray="6 4" opacity="0.86"/>
      <ellipse cx="0" cy="40" rx="34" ry="9" fill="${vfx.secondaryColorHex}" fill-opacity="0.24" stroke="${vfx.secondaryColorHex}" stroke-width="1.3"/>
      <g transform="rotate(${k.weaponOrbitDeg})">
        <circle cx="0" cy="-20" r="42" fill="none" stroke="${vfx.primaryColorHex}" stroke-width="1.4" stroke-dasharray="4 8" opacity="0.68"/>
        <polygon points="0,-66 4,-56 -4,-56" fill="${vfx.primaryColorHex}"/>
        <polygon points="58,-20 48,-16 48,-24" fill="${vfx.secondaryColorHex}"/>
        <polygon points="-58,-20 -48,-16 -48,-24" fill="${vfx.secondaryColorHex}"/>
      </g>
      ${extraVfx}
      ${slashSvg}
    </g>
  `;
}
