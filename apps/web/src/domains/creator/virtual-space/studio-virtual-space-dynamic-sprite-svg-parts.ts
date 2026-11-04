/**
 * 다중프레임 소두(5.5~6.5등신) 캐릭터 스프라이트 SVG 파츠 렌더러.
 *
 * - 10종 눈 스타일(eyeStyle), 10종 입 스타일(mouthStyle), 8종 헤어·헤드기어 실루엣(hairSilhouette),
 *   8종 특수효과(DynamicSpriteVfxId)를 빠짐없이 고밀도 벡터 레이어로 합성한다.
 */
import type {
  DynamicCreatorPersonaSpriteSpec,
  DynamicSpriteActionId,
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
  if (k.isBlinkFrame || expr.eyeStyle === "closed-zen") {
    return `
      <path d="M -5.2 ${headCenterY - 0.5} Q -3.2 ${headCenterY + 1.4} -1.2 ${headCenterY - 0.5}" stroke="${persona.hairHex}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M 1.2 ${headCenterY - 0.5} Q 3.2 ${headCenterY + 1.4} 5.2 ${headCenterY - 0.5}" stroke="${persona.hairHex}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    `;
  }
  switch (expr.eyeStyle) {
    case "wink-happy":
      return `
        <path d="M -5.4 ${headCenterY - 0.3} Q -3.2 ${headCenterY - 2.4} -1.1 ${headCenterY - 0.3}" stroke="${persona.hairHex}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <ellipse cx="3.3" cy="${headCenterY - 0.4}" rx="2.1" ry="2.5" fill="${persona.eyeHex}"/>
        <circle cx="2.7" cy="${headCenterY - 1.3}" r="0.9" fill="#ffffff"/>
        <circle cx="3.8" cy="${headCenterY + 0.6}" r="0.45" fill="#ffffff" opacity="0.8"/>
      `;
    case "star-pupil":
      return `
        <ellipse cx="-3.3" cy="${headCenterY - 0.4}" rx="2.3" ry="2.6" fill="${persona.eyeHex}"/>
        <ellipse cx="3.3" cy="${headCenterY - 0.4}" rx="2.3" ry="2.6" fill="${persona.eyeHex}"/>
        <polygon points="-3.3,${headCenterY - 2.4} -2.7,${headCenterY - 0.9} -1.3,${headCenterY - 0.4} -2.7,${headCenterY + 0.2} -3.3,${headCenterY + 1.6} -3.9,${headCenterY + 0.2} -5.3,${headCenterY - 0.4} -3.9,${headCenterY - 0.9}" fill="#fef08a"/>
        <polygon points="3.3,${headCenterY - 2.4} 3.9,${headCenterY - 0.9} 5.3,${headCenterY - 0.4} 3.9,${headCenterY + 0.2} 3.3,${headCenterY + 1.6} 2.7,${headCenterY + 0.2} 1.3,${headCenterY - 0.4} 2.7,${headCenterY - 0.9}" fill="#fef08a"/>
      `;
    case "heart-glow":
      return `
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="2.3" fill="#ec4899"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="2.3" fill="#ec4899"/>
        <path d="M -3.3 ${headCenterY + 0.9} L -4.5 ${headCenterY - 0.4} A 0.7 0.7 0 0 1 -3.3 ${headCenterY - 1.1} A 0.7 0.7 0 0 1 -2.1 ${headCenterY - 0.4} Z" fill="#fdf2f8"/>
        <path d="M 3.3 ${headCenterY + 0.9} L 2.1 ${headCenterY - 0.4} A 0.7 0.7 0 0 1 3.3 ${headCenterY - 1.1} A 0.7 0.7 0 0 1 4.5 ${headCenterY - 0.4} Z" fill="#fdf2f8"/>
      `;
    case "fierce-slant":
      return `
        <path d="M -5.6 ${headCenterY - 2.6} L -1.2 ${headCenterY - 1.5}" stroke="${persona.hairHex}" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M 5.6 ${headCenterY - 2.6} L 1.2 ${headCenterY - 1.5}" stroke="${persona.hairHex}" stroke-width="1.4" stroke-linecap="round"/>
        <ellipse cx="-3.3" cy="${headCenterY - 0.2}" rx="2.1" ry="2.2" fill="${persona.eyeHex}"/>
        <ellipse cx="3.3" cy="${headCenterY - 0.2}" rx="2.1" ry="2.2" fill="${persona.eyeHex}"/>
        <circle cx="-3.7" cy="${headCenterY - 0.9}" r="0.85" fill="#fef08a"/>
        <circle cx="2.9" cy="${headCenterY - 0.9}" r="0.85" fill="#fef08a"/>
      `;
    case "smug-half":
      return `
        <ellipse cx="-3.3" cy="${headCenterY - 0.1}" rx="2.1" ry="1.8" fill="${persona.eyeHex}"/>
        <ellipse cx="3.3" cy="${headCenterY - 0.1}" rx="2.1" ry="1.8" fill="${persona.eyeHex}"/>
        <line x1="-5.6" y1="${headCenterY - 1.3}" x2="-1.0" y2="${headCenterY - 1.1}" stroke="${persona.hairHex}" stroke-width="1.6" stroke-linecap="round"/>
        <line x1="1.0" y1="${headCenterY - 1.1}" x2="5.6" y2="${headCenterY - 1.3}" stroke="${persona.hairHex}" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="-2.8" cy="${headCenterY - 0.5}" r="0.75" fill="#ffffff"/>
        <circle cx="3.8" cy="${headCenterY - 0.5}" r="0.75" fill="#ffffff"/>
      `;
    case "wide-shock":
      return `
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="2.5" fill="#ffffff" stroke="${persona.hairHex}" stroke-width="0.9"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="2.5" fill="#ffffff" stroke="${persona.hairHex}" stroke-width="0.9"/>
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="1.15" fill="${persona.eyeHex}"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="1.15" fill="${persona.eyeHex}"/>
      `;
    case "neon-ring":
      return `
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="2.4" fill="#0f172a"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="2.4" fill="#0f172a"/>
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="1.55" fill="none" stroke="#fef08a" stroke-width="0.9"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="1.55" fill="none" stroke="#fef08a" stroke-width="0.9"/>
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="0.65" fill="#38bdf8"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="0.65" fill="#38bdf8"/>
      `;
    case "panic-spiral":
      return `
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="2.3" fill="#ffffff" stroke="${persona.eyeHex}" stroke-width="1.1"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="2.3" fill="#ffffff" stroke="${persona.eyeHex}" stroke-width="1.1"/>
        <circle cx="-3.3" cy="${headCenterY - 0.4}" r="0.9" fill="none" stroke="${persona.eyeHex}" stroke-width="0.9" stroke-dasharray="2 1"/>
        <circle cx="3.3" cy="${headCenterY - 0.4}" r="0.9" fill="none" stroke="${persona.eyeHex}" stroke-width="0.9" stroke-dasharray="2 1"/>
      `;
    default:
      return `
        <ellipse cx="-3.3" cy="${headCenterY - 0.4}" rx="2.1" ry="2.5" fill="${persona.eyeHex}"/>
        <ellipse cx="3.3" cy="${headCenterY - 0.4}" rx="2.1" ry="2.5" fill="${persona.eyeHex}"/>
        <circle cx="-3.9" cy="${headCenterY - 1.3}" r="0.95" fill="#ffffff"/>
        <circle cx="2.7" cy="${headCenterY - 1.3}" r="0.95" fill="#ffffff"/>
        <circle cx="-2.7" cy="${headCenterY + 0.7}" r="0.45" fill="#ffffff" opacity="0.75"/>
        <circle cx="3.9" cy="${headCenterY + 0.7}" r="0.45" fill="#ffffff" opacity="0.75"/>
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
      return `<path d="M -2.2 ${headCenterY + 4.2} L 2.2 ${headCenterY + 3.9}" stroke="#9f1239" stroke-width="1.3" stroke-linecap="round"/>`;
    case "wavy-panic":
      return `<path d="M -2.8 ${headCenterY + 4.2} Q -1.4 ${headCenterY + 3.1} 0 ${headCenterY + 4.2} T 2.8 ${headCenterY + 4.2}" stroke="#9f1239" stroke-width="1.2" fill="none"/>`;
    case "cat-grin":
      return `<path d="M -2.8 ${headCenterY + 3.8} Q -1.4 ${headCenterY + 5.1} 0 ${headCenterY + 3.8} Q 1.4 ${headCenterY + 5.1} 2.8 ${headCenterY + 3.8}" stroke="#9f1239" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    case "smirk":
      return `<path d="M -2.2 ${headCenterY + 4.3} Q 0.4 ${headCenterY + 4.5} 2.6 ${headCenterY + 3.3}" stroke="#9f1239" stroke-width="1.35" fill="none" stroke-linecap="round"/>`;
    case "calm-smile":
      return `<path d="M -2.2 ${headCenterY + 3.8} Q 0 ${headCenterY + 5.2} 2.2 ${headCenterY + 3.8}" stroke="#9f1239" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    case "surprised-o":
      return `<ellipse cx="0" cy="${headCenterY + 4.3}" rx="1.65" ry="${Math.max(1.8, mouthH)}" fill="#9f1239"/>`;
    default:
      return `
        <ellipse cx="0" cy="${headCenterY + 4.2}" rx="2.3" ry="${mouthH}" fill="#e11d48"/>
        <path d="M -1.5 ${headCenterY + 3.5} L 1.5 ${headCenterY + 3.5}" stroke="#ffffff" stroke-width="0.7" stroke-linecap="round"/>
      `;
  }
}

export function renderDynamicSpriteHeadgearSvg(
  persona: DynamicCreatorPersonaSpriteSpec,
  r: number,
  headCenterY: number,
  hairBouncePx: number,
): string {
  switch (persona.hairSilhouette) {
    case "beret-spiky":
      return `
        <ellipse cx="-2" cy="${headCenterY - r - 1.5 + hairBouncePx * 0.3}" rx="${r * 0.95}" ry="3.8" fill="${persona.primaryHex}" transform="rotate(-10, -2, ${headCenterY - r})"/>
        <circle cx="-6" cy="${headCenterY - r - 2.2}" r="1.4" fill="${persona.accentHex}"/>
      `;
    case "cyber-ponytail":
      return `
        <path d="M ${r - 1} ${headCenterY - 4} Q ${r + 9} ${headCenterY - 8 + hairBouncePx} ${r + 7} ${headCenterY + 7 + hairBouncePx}" stroke="${persona.hairHex}" stroke-width="3.6" fill="none" stroke-linecap="round"/>
        <circle cx="${r}" cy="${headCenterY - 4}" r="1.8" fill="${persona.accentHex}"/>
      `;
    case "aurora-twintail":
      return `
        <path d="M ${-r} ${headCenterY - 2} Q ${-r - 7} ${headCenterY + 4} ${-r - 5} ${headCenterY + 13 + hairBouncePx}" stroke="${persona.hairHex}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
        <path d="M ${r} ${headCenterY - 2} Q ${r + 7} ${headCenterY + 4} ${r + 5} ${headCenterY + 13 + hairBouncePx}" stroke="${persona.hairHex}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      `;
    case "visor-undercut":
      return `<rect x="${-r * 0.85}" y="${headCenterY - 3.6}" width="${r * 1.7}" height="3.2" rx="1.6" fill="${persona.accentHex}" fill-opacity="0.72" stroke="#ffffff" stroke-width="0.6"/>`;
    case "headphone-hood":
      return `
        <rect x="${-r - 2.8}" y="${headCenterY - 2.5}" width="3.2" height="6.2" rx="1.5" fill="${persona.primaryHex}" stroke="${persona.accentHex}" stroke-width="0.8"/>
        <rect x="${r - 0.4}" y="${headCenterY - 2.5}" width="3.2" height="6.2" rx="1.5" fill="${persona.primaryHex}" stroke="${persona.accentHex}" stroke-width="0.8"/>
      `;
    case "astral-cat-halo":
      return `
        <polygon points="${-r},${headCenterY - r + 2} ${-r - 4},${headCenterY - r - 8} ${-r + 4},${headCenterY - r - 2}" fill="${persona.primaryHex}"/>
        <polygon points="${r},${headCenterY - r + 2} ${r + 4},${headCenterY - r - 8} ${r - 4},${headCenterY - r - 2}" fill="${persona.primaryHex}"/>
      `;
    case "scholar-wave":
    case "executive-bob":
    default:
      return "";
  }
}

export function renderDynamicSpriteVfxLayerSvg(
  vfxId: DynamicSpriteVfxId,
  actionId: DynamicSpriteActionId,
  vfx: DynamicSpriteVfxSpec,
  k: DynamicSpriteFrameKinematics,
): string {
  const extraVfx = (() => {
    switch (vfxId) {
      case "manga-speedlines":
        return `<g stroke="${vfx.primaryColorHex}" stroke-width="1.6" opacity="0.78">
          <line x1="-68" y1="-58" x2="-38" y2="-32"/>
          <line x1="68" y1="-58" x2="38" y2="-32"/>
          <line x1="-72" y1="0" x2="-42" y2="-6"/>
          <line x1="72" y1="0" x2="42" y2="-6"/>
        </g>`;
      case "holo-floating-monitors":
        return `<g opacity="0.92">
          <rect x="-64" y="-46" width="24" height="16" rx="3" fill="#0f172a" fill-opacity="0.82" stroke="${vfx.primaryColorHex}" stroke-width="1.4"/>
          <rect x="40" y="-42" width="24" height="16" rx="3" fill="#0f172a" fill-opacity="0.82" stroke="${vfx.secondaryColorHex}" stroke-width="1.4"/>
          <line x1="-60" y1="-38" x2="-44" y2="-38" stroke="${vfx.secondaryColorHex}" stroke-width="1"/>
          <line x1="44" y1="-34" x2="60" y2="-34" stroke="${vfx.primaryColorHex}" stroke-width="1"/>
        </g>`;
      case "prism-stardust-burst":
        return `<g fill="${vfx.secondaryColorHex}" opacity="0.92">
          <polygon points="-52,-46 -49,-40 -43,-38 -49,-36 -52,-30 -55,-36 -61,-38 -55,-40"/>
          <polygon points="54,-42 57,-36 63,-34 57,-32 54,-26 51,-32 45,-34 51,-36"/>
          <circle cx="-46" cy="12" r="3" fill="${vfx.primaryColorHex}"/>
          <circle cx="48" cy="14" r="3" fill="${vfx.primaryColorHex}"/>
        </g>`;
      case "fever-lightning-flames":
        return `<g stroke="${vfx.primaryColorHex}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">
          <polyline points="-54,28 -44,4 -50,-4 -38,-32"/>
          <polyline points="54,28 44,4 50,-4 38,-32"/>
        </g>`;
      case "biophilic-sakura-wind":
        return `<g fill="${vfx.secondaryColorHex}" opacity="0.88">
          <ellipse cx="-50" cy="-28" rx="4.5" ry="2.2" transform="rotate(-25 -50 -28)"/>
          <ellipse cx="48" cy="-18" rx="4.5" ry="2.2" transform="rotate(30 48 -18)"/>
          <path d="M -58 10 Q 0 -18 58 14" fill="none" stroke="${vfx.primaryColorHex}" stroke-width="1.5" stroke-dasharray="5 4"/>
        </g>`;
      case "collab-tether-beam":
        return `<g stroke="${vfx.primaryColorHex}" fill="none" opacity="0.88">
          <path d="M -64 -8 C -28 -44, 28 -44, 64 -8" stroke-width="2" stroke-dasharray="4 3"/>
          <circle cx="-64" cy="-8" r="3.5" fill="${vfx.secondaryColorHex}"/>
          <circle cx="64" cy="-8" r="3.5" fill="${vfx.secondaryColorHex}"/>
        </g>`;
      default:
        return "";
    }
  })();

  const slashSvg =
    vfxId === "crimson-ink-slash" || actionId === "tablet-combo-draw"
      ? `<path d="M -56 -12 Q 0 -68 58 6" fill="none" stroke="${vfx.primaryColorHex}" stroke-width="4" stroke-linecap="round" opacity="0.84"/>`
      : "";

  return `
    <g class="sprite-vfx-layer" transform="translate(80, 92) scale(${k.vfxPulseScale})">
      <ellipse cx="0" cy="40" rx="46" ry="14" fill="none" stroke="${vfx.primaryColorHex}" stroke-width="2" stroke-dasharray="6 4" opacity="0.85"/>
      <ellipse cx="0" cy="40" rx="34" ry="9" fill="${vfx.secondaryColorHex}" fill-opacity="0.22" stroke="${vfx.secondaryColorHex}" stroke-width="1.2"/>
      <g transform="rotate(${k.weaponOrbitDeg})">
        <circle cx="0" cy="-20" r="42" fill="none" stroke="${vfx.primaryColorHex}" stroke-width="1.3" stroke-dasharray="4 8" opacity="0.65"/>
        <polygon points="0,-66 4,-56 -4,-56" fill="${vfx.primaryColorHex}"/>
        <polygon points="58,-20 48,-16 48,-24" fill="${vfx.secondaryColorHex}"/>
        <polygon points="-58,-20 -48,-16 -48,-24" fill="${vfx.secondaryColorHex}"/>
      </g>
      ${extraVfx}
      ${slashSvg}
    </g>
  `;
}
