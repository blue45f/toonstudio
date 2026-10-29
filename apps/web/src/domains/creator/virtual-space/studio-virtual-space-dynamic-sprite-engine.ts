/**
 * 다채로운 소두(5.5~6등신) 다중 프레임 캐릭터 스프라이트 · 10종 표정 · 10종 역동적 동작 ·
 * 8종 화려한 특수효과(VFX) 및 실용적 웹툰/3D 업무 협업 스튜디오 엔진.
 *
 * 정적인 단일 이미지 대신 실시간 8프레임 스프라이트 시트와 프로시저럴 관절·머리카락·망토·무기·VFX 레이어를
 * 결합해 작은 얼굴(소두) 비율의 개성 넘치는 8인 크리에이터 캐릭터가 살아 움직이며 실무 협업을 수행한다.
 */
import type { IllustratedCreatorPersonaId } from "./studio-virtual-office-nextgen-engine-data";
import {
  DYNAMIC_SPRITE_EXPRESSIONS,
  DYNAMIC_SPRITE_VFX_PRESETS,
  getDynamicCreatorPersonaSpec,
  type DynamicSpriteActionId,
  type DynamicSpriteExpressionId,
  type DynamicSpriteFrameKinematics,
  type DynamicSpriteVfxId,
  type PracticalCanvasPinNote,
  type PracticalCollabZoneId,
  type PracticalCollaboratorLiveUnit,
  type PracticalSpriteWorkspaceState,
} from "./studio-virtual-space-dynamic-sprite-catalog";

export * from "./studio-virtual-space-dynamic-sprite-catalog";

/**
 * 8프레임(0~7) 스프라이트 시트의 프레임별 소두(5.5~6.5등신) 인체 관절·망토·무기·표정·VFX 역학을 계산한다.
 */
export function computeDynamicSpriteFrameKinematics(
  personaId: IllustratedCreatorPersonaId,
  actionId: DynamicSpriteActionId,
  expressionId: DynamicSpriteExpressionId,
  vfxId: DynamicSpriteVfxId,
  rawFrameIndex: number,
  headTallOverride?: number,
): DynamicSpriteFrameKinematics {
  const persona = getDynamicCreatorPersonaSpec(personaId);
  const frameIndex = ((Math.floor(rawFrameIndex) % 8) + 8) % 8;
  const phase = (frameIndex / 8) * Math.PI * 2;
  const sin = Math.sin(phase);
  const cos = Math.cos(phase);
  const sin2 = Math.sin(phase * 2);

  const headTallUnits = Math.max(5.0, Math.min(6.6, headTallOverride ?? persona.headTallUnits));
  const headToBodyRatio = Number((1 / headTallUnits).toFixed(3));
  // 전체 캐릭터 높이 116px 기준 소두 반지름 (작고 또렷한 얼굴: 반지름 9.5~11.5px)
  const headRadiusPx = Number((58 * headToBodyRatio).toFixed(2));

  let bodyOffsetY = sin * 2.2;
  let bodyLeanDeg = sin * 2;
  let headTiltDeg = cos * 2.5;
  let leftArmDeg = -22 + sin * 10;
  let rightArmDeg = 22 - sin * 10;
  let leftLegDeg = sin * 4;
  let rightLegDeg = -sin * 4;
  let capeWavePx = sin * 6;
  const weaponOrbitDeg = frameIndex * 45;
  let afterimageCount = 0;

  switch (actionId) {
    case "walk-stride":
      bodyOffsetY = -Math.abs(sin) * 5.5;
      bodyLeanDeg = 6 + sin * 3;
      leftArmDeg = sin * 38;
      rightArmDeg = -sin * 38;
      leftLegDeg = -sin * 34;
      rightLegDeg = sin * 34;
      capeWavePx = -8 + cos * 7;
      break;
    case "sprint-afterimage":
      bodyOffsetY = -Math.abs(sin2) * 7;
      bodyLeanDeg = 18 + sin * 4;
      headTiltDeg = -8 + cos * 3;
      leftArmDeg = 48 + sin * 42;
      rightArmDeg = -52 - sin * 42;
      leftLegDeg = -sin * 48;
      rightLegDeg = sin * 48;
      capeWavePx = -16 + sin2 * 9;
      afterimageCount = 3;
      break;
    case "tablet-combo-draw":
      bodyOffsetY = sin2 * 2.5;
      bodyLeanDeg = 9 + sin * 3;
      leftArmDeg = -45 + cos * 12;
      rightArmDeg = -65 + sin2 * 46;
      leftLegDeg = -8;
      rightLegDeg = 10;
      capeWavePx = sin2 * 8;
      afterimageCount = 1;
      break;
    case "dcc-3d-sculpt":
      bodyOffsetY = -3 + sin * 4;
      bodyLeanDeg = cos * 4;
      leftArmDeg = -58 + sin * 28;
      rightArmDeg = 58 + cos * 28;
      leftLegDeg = sin * 8;
      rightLegDeg = -sin * 8;
      capeWavePx = cos * 10;
      break;
    case "whiteboard-laser-pitch":
      bodyOffsetY = -Math.abs(sin) * 3.5;
      bodyLeanDeg = -4 + sin * 4;
      leftArmDeg = -18 + cos * 10;
      rightArmDeg = -82 + sin * 32;
      leftLegDeg = -12 + sin * 6;
      rightLegDeg = 12 - sin * 6;
      break;
    case "espresso-power-charge":
      bodyOffsetY = -Math.abs(sin2) * 4.5;
      headTiltDeg = -12 + sin * 8;
      leftArmDeg = -72 + Math.abs(sin) * 20;
      rightArmDeg = 35 + sin2 * 25;
      capeWavePx = sin2 * 11;
      break;
    case "victory-jump-cheer":
      bodyOffsetY = -12 - Math.abs(sin) * 10;
      bodyLeanDeg = sin * 6;
      headTiltDeg = -6 + cos * 6;
      leftArmDeg = -135 + sin * 22;
      rightArmDeg = 135 - sin * 22;
      leftLegDeg = -24 + cos * 18;
      rightLegDeg = 24 - cos * 18;
      capeWavePx = 12 + sin * 10;
      afterimageCount = 2;
      break;
    case "highfive-team-sync":
      bodyOffsetY = -Math.abs(sin) * 6;
      bodyLeanDeg = -8 + sin * 6;
      leftArmDeg = -30 + cos * 15;
      rightArmDeg = -115 + sin * 35;
      leftLegDeg = -14 + sin * 10;
      rightLegDeg = 16 - sin * 10;
      break;
    case "awakening-skill-burst":
      bodyOffsetY = -14 + sin * 6;
      bodyLeanDeg = sin * 5;
      headTiltDeg = cos * 4;
      leftArmDeg = -110 + sin * 28;
      rightArmDeg = 110 - sin * 28;
      leftLegDeg = -16 + cos * 10;
      rightLegDeg = 16 - cos * 10;
      capeWavePx = sin2 * 15;
      afterimageCount = 3;
      break;
    case "idle-breathe":
    default:
      break;
  }

  const isBlinkFrame = expressionId !== "zen-flow" && expressionId !== "joyful-wink" && frameIndex === 6;
  const mouthOpenRatio =
    expressionId === "collab-heart" || expressionId === "sparkle-star" || expressionId === "caffeine-overdrive"
      ? Number((0.35 + Math.abs(sin2) * 0.65).toFixed(2))
      : Number((0.2 + Math.abs(sin) * 0.35).toFixed(2));
  const vfxPulseScale = Number((0.88 + Math.abs(sin) * 0.28 + (vfxId === "prism-stardust-burst" ? 0.08 : 0)).toFixed(2));

  return {
    frameIndex,
    headToBodyRatio,
    headRadiusPx,
    bodyOffsetY: Number(bodyOffsetY.toFixed(2)),
    bodyLeanDeg: Number(bodyLeanDeg.toFixed(2)),
    headTiltDeg: Number(headTiltDeg.toFixed(2)),
    leftArmDeg: Number(leftArmDeg.toFixed(2)),
    rightArmDeg: Number(rightArmDeg.toFixed(2)),
    leftLegDeg: Number(leftLegDeg.toFixed(2)),
    rightLegDeg: Number(rightLegDeg.toFixed(2)),
    capeWavePx: Number(capeWavePx.toFixed(2)),
    hairBouncePx: Number((cos * 3.8).toFixed(2)),
    weaponOrbitDeg,
    isBlinkFrame,
    mouthOpenRatio,
    vfxPulseScale,
    afterimageCount,
  };
}

/**
 * 작은 얼굴(5.5~6.5등신) 비율 · 10종 표정 · 10종 다중프레임 동작 · 8종 특수효과(VFX)가 결합된
 * 고밀도 벡터 캐릭터 스프라이트 SVG 마크업을 생성한다.
 */
export function renderDynamicCreatorSpriteSvg(input: {
  readonly personaId: IllustratedCreatorPersonaId;
  readonly actionId: DynamicSpriteActionId;
  readonly expressionId: DynamicSpriteExpressionId;
  readonly vfxId: DynamicSpriteVfxId;
  readonly frameIndex: number;
  readonly headTallUnits?: number;
  readonly showVfx?: boolean;
}): string {
  const persona = getDynamicCreatorPersonaSpec(input.personaId);
  const expr =
    DYNAMIC_SPRITE_EXPRESSIONS.find((item) => item.id === input.expressionId) ??
    DYNAMIC_SPRITE_EXPRESSIONS[0];
  const vfx =
    DYNAMIC_SPRITE_VFX_PRESETS.find((item) => item.id === input.vfxId) ??
    DYNAMIC_SPRITE_VFX_PRESETS[0];
  const k = computeDynamicSpriteFrameKinematics(
    input.personaId,
    input.actionId,
    input.expressionId,
    input.vfxId,
    input.frameIndex,
    input.headTallUnits,
  );

  const r = k.headRadiusPx;
  const headCenterY = 34;
  const shoulderY = headCenterY + r + 3;
  const hipY = shoulderY + 34;
  const showVfx = input.showVfx ?? true;

  let eyesSvg: string;
  if (k.isBlinkFrame || expr.eyeStyle === "closed-zen") {
    eyesSvg = `
      <path d="M -5.2 ${headCenterY - 0.5} Q -3.2 ${headCenterY + 1.4} -1.2 ${headCenterY - 0.5}" stroke="${persona.hairHex}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M 1.2 ${headCenterY - 0.5} Q 3.2 ${headCenterY + 1.4} 5.2 ${headCenterY - 0.5}" stroke="${persona.hairHex}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    `;
  } else if (expr.eyeStyle === "wink-happy") {
    eyesSvg = `
      <path d="M -5.4 ${headCenterY - 0.3} Q -3.2 ${headCenterY - 2.4} -1.1 ${headCenterY - 0.3}" stroke="${persona.hairHex}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <ellipse cx="3.3" cy="${headCenterY - 0.4}" rx="2.1" ry="2.5" fill="${persona.eyeHex}"/>
      <circle cx="2.7" cy="${headCenterY - 1.3}" r="0.9" fill="#ffffff"/>
    `;
  } else if (expr.eyeStyle === "star-pupil") {
    eyesSvg = `
      <ellipse cx="-3.3" cy="${headCenterY - 0.4}" rx="2.3" ry="2.6" fill="${persona.eyeHex}"/>
      <ellipse cx="3.3" cy="${headCenterY - 0.4}" rx="2.3" ry="2.6" fill="${persona.eyeHex}"/>
      <polygon points="-3.3,${headCenterY - 2.4} -2.7,${headCenterY - 0.9} -1.3,${headCenterY - 0.4} -2.7,${headCenterY + 0.2} -3.3,${headCenterY + 1.6} -3.9,${headCenterY + 0.2} -5.3,${headCenterY - 0.4} -3.9,${headCenterY - 0.9}" fill="#fef08a"/>
      <polygon points="3.3,${headCenterY - 2.4} 3.9,${headCenterY - 0.9} 5.3,${headCenterY - 0.4} 3.9,${headCenterY + 0.2} 3.3,${headCenterY + 1.6} 2.7,${headCenterY + 0.2} 1.3,${headCenterY - 0.4} 2.7,${headCenterY - 0.9}" fill="#fef08a"/>
    `;
  } else if (expr.eyeStyle === "heart-glow") {
    eyesSvg = `
      <circle cx="-3.3" cy="${headCenterY - 0.4}" r="2.3" fill="#ec4899"/>
      <circle cx="3.3" cy="${headCenterY - 0.4}" r="2.3" fill="#ec4899"/>
      <circle cx="-3.8" cy="${headCenterY - 1.2}" r="0.9" fill="#fbcfe8"/>
      <circle cx="2.8" cy="${headCenterY - 1.2}" r="0.9" fill="#fbcfe8"/>
    `;
  } else {
    eyesSvg = `
      <ellipse cx="-3.3" cy="${headCenterY - 0.4}" rx="2.1" ry="2.5" fill="${persona.eyeHex}"/>
      <ellipse cx="3.3" cy="${headCenterY - 0.4}" rx="2.1" ry="2.5" fill="${persona.eyeHex}"/>
      <circle cx="-3.9" cy="${headCenterY - 1.3}" r="0.95" fill="#ffffff"/>
      <circle cx="2.7" cy="${headCenterY - 1.3}" r="0.95" fill="#ffffff"/>
    `;
  }

  const mouthH = Math.max(1.2, k.mouthOpenRatio * 3.4);
  const mouthSvg =
    expr.mouthStyle === "firm-line"
      ? `<path d="M -2.2 ${headCenterY + 4.2} L 2.2 ${headCenterY + 3.9}" stroke="#9f1239" stroke-width="1.3" stroke-linecap="round"/>`
      : expr.mouthStyle === "wavy-panic"
        ? `<path d="M -2.8 ${headCenterY + 4.2} Q -1.4 ${headCenterY + 3.1} 0 ${headCenterY + 4.2} T 2.8 ${headCenterY + 4.2}" stroke="#9f1239" stroke-width="1.2" fill="none"/>`
        : `<ellipse cx="0" cy="${headCenterY + 4.2}" rx="2.2" ry="${mouthH}" fill="#fb7185"/>`;

  const vfxLayerSvg = showVfx
    ? `
      <g class="sprite-vfx-layer" transform="translate(80, 92) scale(${k.vfxPulseScale})">
        <ellipse cx="0" cy="40" rx="46" ry="14" fill="none" stroke="${vfx.primaryColorHex}" stroke-width="2" stroke-dasharray="6 4" opacity="0.85"/>
        <ellipse cx="0" cy="40" rx="34" ry="9" fill="${vfx.secondaryColorHex}" fill-opacity="0.22" stroke="${vfx.secondaryColorHex}" stroke-width="1.2"/>
        <g transform="rotate(${k.weaponOrbitDeg})">
          <circle cx="0" cy="-20" r="42" fill="none" stroke="${vfx.primaryColorHex}" stroke-width="1.3" stroke-dasharray="4 8" opacity="0.65"/>
          <polygon points="0,-66 4,-56 -4,-56" fill="${vfx.primaryColorHex}"/>
          <polygon points="58,-20 48,-16 48,-24" fill="${vfx.secondaryColorHex}"/>
          <polygon points="-58,-20 -48,-16 -48,-24" fill="${vfx.secondaryColorHex}"/>
        </g>
        ${
          input.vfxId === "manga-speedlines"
            ? `<g stroke="${vfx.primaryColorHex}" stroke-width="1.6" opacity="0.75">
                <line x1="-68" y1="-58" x2="-38" y2="-32"/>
                <line x1="68" y1="-58" x2="38" y2="-32"/>
                <line x1="-72" y1="0" x2="-42" y2="-6"/>
                <line x1="72" y1="0" x2="42" y2="-6"/>
              </g>`
            : ""
        }
        ${
          input.vfxId === "holo-floating-monitors"
            ? `<g opacity="0.9">
                <rect x="-64" y="-46" width="24" height="16" rx="3" fill="#0f172a" fill-opacity="0.8" stroke="${vfx.primaryColorHex}" stroke-width="1.4"/>
                <rect x="40" y="-42" width="24" height="16" rx="3" fill="#0f172a" fill-opacity="0.8" stroke="${vfx.secondaryColorHex}" stroke-width="1.4"/>
              </g>`
            : ""
        }
        ${
          input.vfxId === "crimson-ink-slash" || input.actionId === "tablet-combo-draw"
            ? `<path d="M -56 -12 Q 0 -68 58 6" fill="none" stroke="${vfx.primaryColorHex}" stroke-width="4" stroke-linecap="round" opacity="0.82"/>`
            : ""
        }
      </g>
    `
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" data-persona="${persona.personaId}" data-action="${input.actionId}" data-expression="${input.expressionId}" data-vfx="${input.vfxId}" data-frame="${k.frameIndex}">
    ${vfxLayerSvg}
    <g transform="translate(80, ${18 + k.bodyOffsetY}) rotate(${k.bodyLeanDeg}, 0, ${hipY})">
      <path d="M -13 ${shoulderY + 2} Q ${-24 + k.capeWavePx} ${hipY + 18} ${-18 + k.capeWavePx * 1.3} ${hipY + 42} L ${18 + k.capeWavePx * 1.3} ${hipY + 42} Q ${24 + k.capeWavePx} ${hipY + 18} 13 ${shoulderY + 2} Z" fill="${persona.secondaryHex}" stroke="${persona.primaryHex}" stroke-width="1.4" opacity="0.92"/>
      <g transform="translate(-5.5, ${hipY}) rotate(${k.leftLegDeg})">
        <rect x="-3.4" y="0" width="6.8" height="36" rx="3.4" fill="${persona.secondaryHex}" stroke="${persona.accentHex}" stroke-width="1"/>
        <ellipse cx="0" cy="37" rx="5.2" ry="3.2" fill="${persona.primaryHex}"/>
      </g>
      <g transform="translate(5.5, ${hipY}) rotate(${k.rightLegDeg})">
        <rect x="-3.4" y="0" width="6.8" height="36" rx="3.4" fill="${persona.secondaryHex}" stroke="${persona.accentHex}" stroke-width="1"/>
        <ellipse cx="0" cy="37" rx="5.2" ry="3.2" fill="${persona.primaryHex}"/>
      </g>
      <path d="M -11.5 ${shoulderY} L 11.5 ${shoulderY} L 9.5 ${hipY + 3} L -9.5 ${hipY + 3} Z" fill="${persona.primaryHex}" stroke="${persona.accentHex}" stroke-width="1.2"/>
      <path d="M -4 ${shoulderY} L 0 ${shoulderY + 18} L 4 ${shoulderY}" fill="${persona.accentHex}" opacity="0.85"/>
      <g transform="translate(-12, ${shoulderY + 3}) rotate(${k.leftArmDeg})">
        <rect x="-3" y="0" width="6" height="27" rx="3" fill="${persona.primaryHex}" stroke="${persona.accentHex}" stroke-width="1"/>
        <circle cx="0" cy="28.5" r="3.2" fill="${persona.skinHex}"/>
      </g>
      <g transform="translate(12, ${shoulderY + 3}) rotate(${k.rightArmDeg})">
        <rect x="-3" y="0" width="6" height="27" rx="3" fill="${persona.primaryHex}" stroke="${persona.accentHex}" stroke-width="1"/>
        <circle cx="0" cy="28.5" r="3.2" fill="${persona.skinHex}"/>
        <line x1="0" y1="28" x2="18" y2="-10" stroke="${persona.accentHex}" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="19" cy="-12" r="4.2" fill="${vfx.primaryColorHex}"/>
      </g>
      <g transform="rotate(${k.headTiltDeg}, 0, ${headCenterY})">
        <ellipse cx="0" cy="${headCenterY - 1 + k.hairBouncePx * 0.4}" rx="${r + 3.2}" ry="${r + 2.8}" fill="${persona.hairHex}"/>
        ${
          persona.personaId === "studio-cat-mascot" || persona.hairSilhouette === "headphone-hood"
            ? `<polygon points="${-r},${headCenterY - r + 2} ${-r - 4},${headCenterY - r - 8} ${-r + 4},${headCenterY - r - 2}" fill="${persona.primaryHex}"/>
               <polygon points="${r},${headCenterY - r + 2} ${r + 4},${headCenterY - r - 8} ${r - 4},${headCenterY - r - 2}" fill="${persona.primaryHex}"/>`
            : ""
        }
        <ellipse cx="0" cy="${headCenterY}" rx="${r}" ry="${r * 0.96}" fill="${persona.skinHex}" stroke="${persona.hairHex}" stroke-width="0.9"/>
        <ellipse cx="-5.2" cy="${headCenterY + 2.1}" rx="2.2" ry="1.1" fill="#fb7185" opacity="${expr.blushOpacity}"/>
        <ellipse cx="5.2" cy="${headCenterY + 2.1}" rx="2.2" ry="1.1" fill="#fb7185" opacity="${expr.blushOpacity}"/>
        ${eyesSvg}
        ${mouthSvg}
        ${
          expr.sweatDrop
            ? `<path d="M ${r - 1.5} ${headCenterY - 3} Q ${r + 1.5} ${headCenterY + 1} ${r - 1.5} ${headCenterY + 2.5} Q ${r - 4.5} ${headCenterY + 1} ${r - 1.5} ${headCenterY - 3} Z" fill="#38bdf8"/>`
            : ""
        }
        <path d="M ${-r - 1} ${headCenterY - 2} Q 0 ${headCenterY - r - 5} ${r + 1} ${headCenterY - 2} Q ${r * 0.5} ${headCenterY - r + 3} 0 ${headCenterY - 3} Q ${-r * 0.5} ${headCenterY - r + 3} ${-r - 1} ${headCenterY - 2} Z" fill="${persona.hairHex}"/>
        <ellipse cx="0" cy="${headCenterY - r - 2.5}" rx="${r * 0.85}" ry="2.2" fill="none" stroke="${persona.accentHex}" stroke-width="1.3"/>
      </g>
    </g>
  </svg>`;
}

export function renderDynamicCreatorSpriteDataUri(input: {
  readonly personaId: IllustratedCreatorPersonaId;
  readonly actionId: DynamicSpriteActionId;
  readonly expressionId: DynamicSpriteExpressionId;
  readonly vfxId: DynamicSpriteVfxId;
  readonly frameIndex: number;
  readonly headTallUnits?: number;
  readonly showVfx?: boolean;
}): string {
  const svg = renderDynamicCreatorSpriteSvg(input).replace(/\s+/g, " ").trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createInitialPracticalSpriteWorkspaceState(): PracticalSpriteWorkspaceState {
  const collaborators: readonly PracticalCollaboratorLiveUnit[] = [
    {
      personaId: "line-artist",
      zoneId: "zone-line-atelier",
      xPct: 18,
      yPct: 26,
      expressionId: "focused-flame",
      actionId: "tablet-combo-draw",
      vfxId: "crimson-ink-slash",
      headTallUnits: 5.8,
      taskCode: "EP43-C04",
      taskTitleKo: "주인공 각성 검기 펜터치 & 집중선",
      dccToolBadge: "5K Cintiq · 벡터 선화",
      taskStatus: "in-progress",
      progressPercent: 78,
      pairedWithPersonaId: "studio-cat-mascot",
      statusBubbleKo: "0.1mm 칼선 콤보 작화 중!",
    },
    {
      personaId: "studio-cat-mascot",
      zoneId: "zone-line-atelier",
      xPct: 36,
      yPct: 29,
      expressionId: "bright-smile",
      actionId: "espresso-power-charge",
      vfxId: "biophilic-sakura-wind",
      headTallUnits: 5.5,
      taskCode: "EP43-C05",
      taskTitleKo: "AI 밑색 플랫 채우기 & 레이어 정리",
      dccToolBadge: "AI 코파일럿 드론",
      taskStatus: "review-ready",
      progressPercent: 92,
      pairedWithPersonaId: "line-artist",
      statusBubbleKo: "밑색 레이어 자동 분리 완료냥!",
    },
    {
      personaId: "cgi-director",
      zoneId: "zone-3d-blender-sketchup",
      xPct: 64,
      yPct: 25,
      expressionId: "smug-grin",
      actionId: "dcc-3d-sculpt",
      vfxId: "holo-floating-monitors",
      headTallUnits: 5.9,
      taskCode: "EP43-C12",
        taskTitleKo: "황궁 대성당 사진 맞춤 공간 모델링 & 블렌더 라인아트",
      dccToolBadge: "공간 모델러 + Blender 5.2",
      taskStatus: "in-progress",
      progressPercent: 85,
      pairedWithPersonaId: "action-mocap-actor",
      statusBubbleKo: "3점 투시 소실점 락 완료!",
    },
    {
      personaId: "action-mocap-actor",
      zoneId: "zone-3d-blender-sketchup",
      xPct: 84,
      yPct: 28,
      expressionId: "caffeine-overdrive",
      actionId: "sprint-afterimage",
      vfxId: "fever-lightning-flames",
      headTallUnits: 6.0,
      taskCode: "EP43-C14",
      taskTitleKo: "공중 회전 베기 VRM 본 리깅 & 액션 포즈 캡처",
      dccToolBadge: "VRM Mocap + Rig",
      taskStatus: "in-progress",
      progressPercent: 74,
      pairedWithPersonaId: "cgi-director",
      statusBubbleKo: "공중 3회전 카메라 궤적 동기화!",
    },
    {
      personaId: "colorist",
      zoneId: "zone-color-sound-stage",
      xPct: 18,
      yPct: 72,
      expressionId: "sparkle-star",
      actionId: "awakening-skill-burst",
      vfxId: "prism-stardust-burst",
      headTallUnits: 5.7,
      taskCode: "EP43-C19",
      taskTitleKo: "노을 역광 EEVEE 툰셰이더 & 오로라 입자 후보정",
      dccToolBadge: "EEVEE NPR + 컴포지터",
      taskStatus: "review-ready",
      progressPercent: 95,
      pairedWithPersonaId: "sound-letterer",
      statusBubbleKo: "림라이트 블룸 수치 120% 최적화!",
    },
    {
      personaId: "sound-letterer",
      zoneId: "zone-color-sound-stage",
      xPct: 36,
      yPct: 75,
      expressionId: "joyful-wink",
      actionId: "victory-jump-cheer",
      vfxId: "neon-magic-circle",
      headTallUnits: 5.7,
      taskCode: "EP43-C22",
      taskTitleKo: "클라이맥스 타격 효과음 타이포 & 공간 BGM 싱크",
      dccToolBadge: "3D 식자 · HRTF 오디오",
      taskStatus: "approved",
      progressPercent: 100,
      pairedWithPersonaId: "colorist",
      statusBubbleKo: "타격 의성어 3D 곡면 배치 완료!",
    },
    {
      personaId: "story-writer",
      zoneId: "zone-pd-storyboard-warroom",
      xPct: 64,
      yPct: 72,
      expressionId: "shocked-eureka",
      actionId: "whiteboard-laser-pitch",
      vfxId: "manga-speedlines",
      headTallUnits: 5.8,
      taskCode: "EP44-C01",
      taskTitleKo: "다음 화 엔딩 훅 콘티 동선 & 대사 톤앤매너 피칭",
      dccToolBadge: "스토리보드 · 스크롤",
      taskStatus: "in-progress",
      progressPercent: 80,
      pairedWithPersonaId: "chief-pd",
      statusBubbleKo: "엔딩 반전 연출 컷 분할 브리핑 중!",
    },
    {
      personaId: "chief-pd",
      zoneId: "zone-pd-storyboard-warroom",
      xPct: 84,
      yPct: 74,
      expressionId: "collab-heart",
      actionId: "highfive-team-sync",
      vfxId: "collab-tether-beam",
      headTallUnits: 6.0,
      taskCode: "EP43-ALL",
      taskTitleKo: "EP.43 전 컷 최종 검수 승인 & 글로벌 동시 연재 송출",
      dccToolBadge: "마스터 칸반 · QA",
      taskStatus: "review-ready",
      progressPercent: 90,
      pairedWithPersonaId: "story-writer",
      statusBubbleKo: "전 파트 실시간 합평 페어링 가동 중!",
    },
  ];

  return {
    selectedPersonaId: "line-artist",
    selectedZoneId: "zone-line-atelier",
    globalFps: 12,
    animationPaused: false,
    teamComboCount: 24,
    feverAwakeningActive: false,
    collaborators,
    canvasPins: [
      {
        id: "pin-ep43-c04",
        zoneId: "zone-line-atelier",
        authorPersonaId: "chief-pd",
        targetTaskCode: "EP43-C04",
        noteKo: "검기 궤적에 크림슨 네온 글로우 레이어 15% 추가하면 완벽합니다!",
        resolved: false,
      },
      {
        id: "pin-ep43-c12",
        zoneId: "zone-3d-blender-sketchup",
        authorPersonaId: "cgi-director",
        targetTaskCode: "EP43-C12",
        noteKo: "공간 모델러 성채 아치 단면도와 블렌더 그리즈펜슬 외곽선 두께 동기화 완료.",
        resolved: true,
      },
    ],
    lastCollabEventKo:
      "8인 소두(5.8등신) 다중프레임 캐릭터 스프라이트 & 4대 실무 협업 존 실시간 가동 중",
  };
}

export function updateCollaboratorSpriteConfig(
  state: PracticalSpriteWorkspaceState,
  personaId: IllustratedCreatorPersonaId,
  patch: Partial<
    Pick<
      PracticalCollaboratorLiveUnit,
      "expressionId" | "actionId" | "vfxId" | "headTallUnits" | "zoneId" | "statusBubbleKo"
    >
  >,
): PracticalSpriteWorkspaceState {
  const persona = getDynamicCreatorPersonaSpec(personaId);
  const collaborators = state.collaborators.map((unit) =>
    unit.personaId === personaId ? { ...unit, ...patch } : unit,
  );
  return {
    ...state,
    selectedPersonaId: personaId,
    selectedZoneId: patch.zoneId ?? state.selectedZoneId,
    teamComboCount: state.teamComboCount + 1,
    collaborators,
    lastCollabEventKo: `[스프라이트 전환] ${persona.characterNameKo} — 표정/동작/특수효과(VFX) 실시간 반영`,
  };
}

export function triggerCollaboratorTaskAction(
  state: PracticalSpriteWorkspaceState,
  personaId: IllustratedCreatorPersonaId,
  actionType: "advance-progress" | "request-review" | "approve-cut",
): PracticalSpriteWorkspaceState {
  const persona = getDynamicCreatorPersonaSpec(personaId);
  const collaborators = state.collaborators.map((unit): PracticalCollaboratorLiveUnit => {
    if (unit.personaId !== personaId) return unit;
    if (actionType === "approve-cut") {
      return {
        ...unit,
        taskStatus: "approved",
        progressPercent: 100,
        expressionId: "sparkle-star",
        actionId: "victory-jump-cheer",
        vfxId: "prism-stardust-burst",
        statusBubbleKo: `${unit.taskCode} 최종 승인 완료! 만세! 🎉`,
      };
    }
    if (actionType === "request-review") {
      return {
        ...unit,
        taskStatus: "review-ready",
        progressPercent: Math.max(90, unit.progressPercent),
        expressionId: "joyful-wink",
        actionId: "highfive-team-sync",
        vfxId: "collab-tether-beam",
        statusBubbleKo: `${unit.taskCode} 합평 검수 요청 발신!`,
      };
    }
    const nextPct = Math.min(100, unit.progressPercent + 15);
    return {
      ...unit,
      taskStatus: nextPct >= 100 ? "review-ready" : "in-progress",
      progressPercent: nextPct,
      expressionId: "focused-flame",
      actionId: persona.defaultActionId,
      statusBubbleKo: `${unit.taskCode} 공정 ${nextPct}% 돌파!`,
    };
  });

  return {
    ...state,
    teamComboCount: state.teamComboCount + (actionType === "approve-cut" ? 5 : 2),
    collaborators,
    lastCollabEventKo: `[실무 협업 액션] ${persona.characterNameKo} 담당 컷(${actionType}) 처리 및 환호 VFX 발동!`,
  };
}

export function toggleCollaboratorSynergyPair(
  state: PracticalSpriteWorkspaceState,
  sourcePersonaId: IllustratedCreatorPersonaId,
  targetPersonaId: IllustratedCreatorPersonaId,
): PracticalSpriteWorkspaceState {
  if (sourcePersonaId === targetPersonaId) return state;
  const collaborators = state.collaborators.map((unit): PracticalCollaboratorLiveUnit => {
    if (unit.personaId === sourcePersonaId) {
      const nextPartner = unit.pairedWithPersonaId === targetPersonaId ? null : targetPersonaId;
      return {
        ...unit,
        pairedWithPersonaId: nextPartner,
        expressionId: nextPartner ? "collab-heart" : unit.expressionId,
        actionId: nextPartner ? "highfive-team-sync" : unit.actionId,
        vfxId: nextPartner ? "collab-tether-beam" : unit.vfxId,
        statusBubbleKo: nextPartner ? "실시간 페어링 시너지 연결!" : "단독 집중 모드 전환",
      };
    }
    if (unit.personaId === targetPersonaId) {
      return {
        ...unit,
        pairedWithPersonaId: sourcePersonaId,
        expressionId: "collab-heart",
        vfxId: "collab-tether-beam",
      };
    }
    return unit;
  });
  return {
    ...state,
    teamComboCount: state.teamComboCount + 3,
    collaborators,
    lastCollabEventKo: `[실시간 협업 페어링] ${sourcePersonaId} ↔ ${targetPersonaId} 시너지 레이저 빔 연결!`,
  };
}

export function triggerWorkspaceFeverAwakening(
  state: PracticalSpriteWorkspaceState,
): PracticalSpriteWorkspaceState {
  const nextFever = !state.feverAwakeningActive;
  const collaborators = state.collaborators.map((unit): PracticalCollaboratorLiveUnit => ({
    ...unit,
    expressionId: nextFever ? "caffeine-overdrive" : getDynamicCreatorPersonaSpec(unit.personaId).defaultExpressionId,
    actionId: nextFever ? "awakening-skill-burst" : getDynamicCreatorPersonaSpec(unit.personaId).defaultActionId,
    vfxId: nextFever ? "prism-stardust-burst" : getDynamicCreatorPersonaSpec(unit.personaId).defaultVfxId,
    statusBubbleKo: nextFever ? "⚡ 전 팀원 마감 각성 버스트 가동!!" : "표준 실무 협업 모드 복귀",
  }));
  return {
    ...state,
    feverAwakeningActive: nextFever,
    globalFps: nextFever ? 24 : 12,
    teamComboCount: state.teamComboCount + (nextFever ? 10 : 1),
    collaborators,
    lastCollabEventKo: nextFever
      ? "🔥 [전 팀원 마감 피버 각성] 8인 전원 24fps 궁극기 동작 & 프리즘 스타더스트 VFX 폭발!"
      : "[마감 피버 해제] 표준 12fps 실무 협업 스튜디오 모드로 전환했습니다.",
  };
}

export function addPracticalCollabPinNote(
  state: PracticalSpriteWorkspaceState,
  zoneId: PracticalCollabZoneId,
  authorPersonaId: IllustratedCreatorPersonaId,
  targetTaskCode: string,
  noteKo: string,
): PracticalSpriteWorkspaceState {
  const trimmed = noteKo.trim();
  if (!trimmed) return state;
  const nextPin: PracticalCanvasPinNote = {
    id: `pin-${Date.now()}-${state.canvasPins.length + 1}`,
    zoneId,
    authorPersonaId,
    targetTaskCode,
    noteKo: trimmed,
    resolved: false,
  };
  return {
    ...state,
    teamComboCount: state.teamComboCount + 2,
    canvasPins: [nextPin, ...state.canvasPins],
    lastCollabEventKo: `📌 [캔버스 합평 핀 등록] ${targetTaskCode}: "${trimmed}"`,
  };
}
