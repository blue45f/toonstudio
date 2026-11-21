import {
  getTooningBackground,
  getTooningCamera,
  getTooningCharacter,
  getTooningPose,
  getTooningSfx,
  TOONING_EXPRESSIONS,
  type TooningBackgroundId,
  type TooningBubbleStyleId,
  type TooningCutSpec,
  type TooningLocale,
} from "./tooning-plus-allinone-engine";

interface TooningPlusCutStagePreviewProps {
  readonly cut: TooningCutSpec;
  readonly locale: TooningLocale;
  readonly previewScopeId: string;
  readonly compact?: boolean;
  readonly showOverlays?: boolean;
}

const VIEW_W = 320;
const VIEW_H = 240;

function wrapDialogueLines(text: string, maxCharsPerLine: number): readonly string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxCharsPerLine) {
    return [trimmed];
  }
  const words = trimmed.split(/\s+/u);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.length > maxCharsPerLine ? `${word.slice(0, maxCharsPerLine - 1)}…` : word;
    }
    if (lines.length === 2) break;
  }
  if (current && lines.length < 2) {
    lines.push(current);
  }
  if (lines.length === 2 && trimmed.length > maxCharsPerLine * 2 + 2) {
    const second = lines[1] ?? "";
    lines[1] = second.endsWith("…") ? second : `${second.slice(0, Math.max(4, maxCharsPerLine - 1))}…`;
  }
  return lines;
}

function buildShoutPolygonPoints(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const spikes = 16;
  const points: string[] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = (Math.PI * i) / spikes;
    const radialScale = i % 2 === 0 ? 1.12 : 0.88;
    const px = cx + Math.cos(angle) * rx * radialScale;
    const py = cy + Math.sin(angle) * ry * radialScale;
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return points.join(" ");
}

function renderBackgroundDecor(backgroundId: TooningBackgroundId, accentOklch: string) {
  switch (backgroundId) {
    case "imperial-hall":
      return (
        <g opacity="0.72">
          <rect x="26" y="18" width="20" height="150" rx="3" fill="var(--tp-svg-paper-glass)" />
          <rect x="274" y="18" width="20" height="150" rx="3" fill="var(--tp-svg-paper-glass)" />
          <path d="M90 165 V76 A70 54 0 0 1 230 76 V165 Z" fill="var(--tp-svg-paper-glass)" stroke={accentOklch} strokeWidth="2" />
          <circle cx="160" cy="34" r="14" fill={accentOklch} opacity="0.55" />
          <line x1="160" y1="0" x2="160" y2="22" stroke={accentOklch} strokeWidth="2" />
        </g>
      );
    case "school-rooftop":
      return (
        <g opacity="0.78">
          <circle cx="246" cy="64" r="24" fill={accentOklch} opacity="0.7" />
          <path d="M0 154 H320 M0 132 H320" stroke="var(--tp-svg-fence)" strokeWidth="2" />
          <path d="M32 132 V170 M88 132 V170 M144 132 V170 M200 132 V170 M256 132 V170 M302 132 V170" stroke="var(--tp-svg-fence)" strokeWidth="1.5" />
          <rect x="18" y="102" width="38" height="52" fill="var(--tp-svg-slate)" />
          <rect x="64" y="114" width="28" height="40" fill="var(--tp-svg-slate)" />
        </g>
      );
    case "city-night":
      return (
        <g opacity="0.82">
          <rect x="14" y="54" width="44" height="118" fill="var(--tp-svg-night)" />
          <rect x="66" y="80" width="36" height="92" fill="var(--tp-svg-night-mid)" />
          <rect x="228" y="48" width="46" height="124" fill="var(--tp-svg-night)" />
          <rect x="280" y="74" width="30" height="98" fill="var(--tp-svg-night-mid)" />
          <rect x="24" y="68" width="8" height="8" fill={accentOklch} />
          <rect x="38" y="84" width="8" height="8" fill="var(--tp-svg-neon-warm)" />
          <rect x="240" y="64" width="10" height="8" fill={accentOklch} />
          <rect x="256" y="82" width="10" height="8" fill="var(--tp-svg-neon-warm)" />
        </g>
      );
    case "cozy-cafe":
      return (
        <g opacity="0.78">
          <rect x="24" y="22" width="96" height="118" rx="10" fill="var(--tp-svg-paper-window)" stroke="var(--tp-svg-wood)" strokeWidth="3" />
          <line x1="72" y1="22" x2="72" y2="140" stroke="var(--tp-svg-wood)" strokeWidth="2.5" />
          <line x1="24" y1="80" x2="120" y2="80" stroke="var(--tp-svg-wood)" strokeWidth="2.5" />
          <circle cx="272" cy="144" r="24" fill={accentOklch} opacity="0.55" />
          <rect x="260" y="156" width="24" height="16" rx="4" fill="var(--tp-svg-wood)" />
        </g>
      );
    case "crystal-rift":
      return (
        <g opacity="0.85">
          <polygon points="18,172 44,74 74,172" fill="var(--tp-svg-crystal)" stroke={accentOklch} strokeWidth="1.5" />
          <polygon points="246,172 280,62 308,172" fill="var(--tp-svg-crystal)" stroke={accentOklch} strokeWidth="1.5" />
          <path d="M164 14 L144 68 L174 88 L152 152" fill="none" stroke={accentOklch} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case "bright-classroom":
      return (
        <g opacity="0.86">
          <rect x="34" y="28" width="252" height="104" rx="8" fill="var(--tp-svg-chalkboard)" stroke="var(--tp-svg-chalk-frame)" strokeWidth="5" />
          <line x1="56" y1="62" x2="162" y2="62" stroke="var(--tp-svg-chalk-line)" strokeWidth="3" strokeLinecap="round" />
          <line x1="56" y1="84" x2="132" y2="84" stroke="var(--tp-svg-chalk-line)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="240" cy="78" r="22" fill="none" stroke="var(--tp-svg-star)" strokeWidth="3" />
        </g>
      );
  }
}

function renderSpeechBubble(
  style: TooningBubbleStyleId,
  x: number,
  y: number,
  w: number,
  h: number,
  tailBase: readonly [number, number],
  tailTip: readonly [number, number],
) {
  const fill = style === "narration" ? "var(--tp-svg-narration-bg)" : "var(--tp-svg-bubble-bg)";
  const stroke = style === "shout" ? "var(--tp-svg-shout-stroke)" : "var(--tp-svg-ink)";

  if (style === "narration") {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx="5" fill={fill} stroke="var(--tp-svg-narration-rail)" strokeWidth="1.8" />
        <rect x={x} y={y} width="5" height={h} rx="2" fill="var(--tp-svg-narration-rail)" />
      </g>
    );
  }

  if (style === "shout") {
    return (
      <g>
        <polygon points={buildShoutPolygonPoints(x, y, w, h)} fill={fill} stroke={stroke} strokeWidth="2.2" />
        <polygon
          points={`${tailBase[0] - 6},${tailBase[1]} ${tailBase[0] + 6},${tailBase[1]} ${tailTip[0]},${tailTip[1]}`}
          fill={fill}
          stroke={stroke}
          strokeWidth="1.8"
        />
      </g>
    );
  }

  if (style === "thought") {
    const midX = (tailBase[0] + tailTip[0]) / 2;
    const midY = (tailBase[1] + tailTip[1]) / 2;
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={Math.min(h / 2, 18)} fill={fill} stroke={stroke} strokeWidth="1.8" strokeDasharray="5 3" />
        <circle cx={midX} cy={midY} r="4.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
        <circle cx={tailTip[0]} cy={tailTip[1]} r="2.8" fill={fill} stroke={stroke} strokeWidth="1.4" />
      </g>
    );
  }

  return (
    <g>
      <polygon
        points={`${tailBase[0] - 7},${tailBase[1] - 3} ${tailBase[0] + 7},${tailBase[1] - 3} ${tailTip[0]},${tailTip[1]}`}
        fill={fill}
        stroke={stroke}
        strokeWidth="1.8"
      />
      <rect x={x} y={y} width={w} height={h} rx={Math.min(h / 2, 16)} fill={fill} stroke={stroke} strokeWidth="1.9" />
    </g>
  );
}

export function TooningPlusCutStagePreview({
  cut,
  locale,
  previewScopeId,
  compact = false,
  showOverlays = true,
}: TooningPlusCutStagePreviewProps) {
  const ko = locale === "ko";
  const character = getTooningCharacter(cut.characterId);
  const pose = getTooningPose(cut.poseId);
  const expression = TOONING_EXPRESSIONS.find((item) => item.id === cut.expressionId) ?? TOONING_EXPRESSIONS[0];
  const camera = getTooningCamera(cut.cameraId);
  const background = getTooningBackground(cut.backgroundId);
  const sfx = getTooningSfx(cut.sfxId);

  const gradId = `tp-sky-${previewScopeId}-c${cut.cutNumber}`;
  const clipId = `tp-clip-${previewScopeId}-c${cut.cutNumber}`;

  const charCenterX = cut.speakerPosition === "left" ? 96 : cut.speakerPosition === "right" ? 224 : 160;
  const charBaseY = 148 + pose.bodyLiftY;
  const stageTransform = `translate(${VIEW_W / 2} ${VIEW_H / 2}) rotate(${camera.tiltDeg}) scale(${camera.zoom}) translate(${-VIEW_W / 2} ${-VIEW_H / 2 + camera.offsetY})`;

  const bubbleX = (cut.smartLayout.bubbleBox.x / 100) * VIEW_W;
  const bubbleY = (cut.smartLayout.bubbleBox.y / 100) * VIEW_H;
  const bubbleW = (cut.smartLayout.bubbleBox.width / 100) * VIEW_W;
  const bubbleH = (cut.smartLayout.bubbleBox.height / 100) * VIEW_H;
  const tailBase: readonly [number, number] = [
    (cut.smartLayout.tailBase[0] / 100) * VIEW_W,
    (cut.smartLayout.tailBase[1] / 100) * VIEW_H,
  ];
  const tailTip: readonly [number, number] = [
    (cut.smartLayout.tailTip[0] / 100) * VIEW_W,
    (cut.smartLayout.tailTip[1] / 100) * VIEW_H,
  ];

  const sfxX = ((cut.smartLayout.sfxBox.x + cut.smartLayout.sfxBox.width / 2) / 100) * VIEW_W;
  const sfxY = ((cut.smartLayout.sfxBox.y + cut.smartLayout.sfxBox.height / 2) / 100) * VIEW_H;

  const dialogue = ko ? cut.dialogueKo : cut.dialogueEn;
  const maxChars = cut.smartLayout.bubbleBox.width > 65 ? 24 : 14;
  const lines = wrapDialogueLines(dialogue, maxChars);

  const ariaLabel = ko
    ? `컷 ${cut.cutNumber} 실시간 프리뷰: ${character.nameKo}, ${pose.labelKo}, ${expression.labelKo}, ${camera.labelKo}, ${background.labelKo}`
    : `Panel ${cut.cutNumber} live preview: ${character.nameEn}, ${pose.labelEn}, ${expression.labelEn}, ${camera.labelEn}, ${background.labelEn}`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={ariaLabel}
      data-testid={`tooning-stage-svg-cut-${cut.cutNumber}`}
      className={compact ? "tp-stage-svg tp-stage-svg--compact" : "tp-stage-svg"}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={background.skyTopOklch} />
          <stop offset="100%" stopColor={background.skyBottomOklch} />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x="4" y="4" width={VIEW_W - 8} height={VIEW_H - 8} rx="10" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={`url(#${gradId})`} />
        <rect x="0" y="166" width={VIEW_W} height="74" fill={background.groundOklch} />
        {renderBackgroundDecor(background.id, background.accentOklch)}

        {camera.showSpeedlines ? (
          <g stroke="var(--tp-svg-speedline)" strokeWidth="1.5">
            <line x1="0" y1="20" x2="72" y2="86" />
            <line x1="0" y1="110" x2="54" y2="118" />
            <line x1="320" y1="24" x2="248" y2="88" />
            <line x1="320" y1="130" x2="258" y2="126" />
            <line x1="48" y1="240" x2="104" y2="182" />
            <line x1="274" y1="240" x2="218" y2="182" />
          </g>
        ) : null}

        <g transform={stageTransform}>
          <ellipse cx={charCenterX} cy="212" rx="34" ry="8" fill="var(--tp-svg-shadow)" />

          <g transform={`translate(${charCenterX} ${charBaseY}) rotate(${pose.torsoTiltDeg})`}>
            {character.hairStyle === "wave" || character.hairStyle === "ponytail" ? (
              <ellipse cx="0" cy="-22" rx="25" ry="30" fill={character.hairOklch} />
            ) : null}

            <line x1="-8" y1="28" x2={-8 - pose.legSpread * 0.5} y2="62" stroke="var(--tp-svg-trousers)" strokeWidth="9" strokeLinecap="round" />
            <line x1="8" y1="28" x2={8 + pose.legSpread * 0.5} y2="62" stroke="var(--tp-svg-trousers)" strokeWidth="9" strokeLinecap="round" />

            <g transform={`translate(-16 -4) rotate(${pose.leftArmDeg})`}>
              <line x1="0" y1="0" x2="-6" y2="30" stroke={character.outfitOklch} strokeWidth="8.5" strokeLinecap="round" />
              <circle cx="-6" cy="31" r="4.5" fill={character.skinOklch} />
            </g>

            <g transform={`translate(16 -4) rotate(${pose.rightArmDeg})`}>
              <line x1="0" y1="0" x2="6" y2="30" stroke={character.outfitOklch} strokeWidth="8.5" strokeLinecap="round" />
              <circle cx="6" cy="31" r="4.5" fill={character.skinOklch} />
              {pose.propKind === "sword" ? (
                <g transform="translate(6 31) rotate(-35)">
                  <line x1="0" y1="0" x2="0" y2="-46" stroke="var(--tp-svg-blade)" strokeWidth="4" strokeLinecap="round" />
                  <line x1="-7" y1="-6" x2="7" y2="-6" stroke={character.accentOklch} strokeWidth="3" strokeLinecap="round" />
                </g>
              ) : null}
            </g>

            <rect x="-18" y="-12" width="36" height="44" rx="12" fill={character.outfitOklch} />
            <path d="M-8 -12 L0 4 L8 -12 Z" fill={character.accentOklch} />

            <circle cx="0" cy="-34" r="20" fill={character.skinOklch} stroke="var(--tp-svg-ink-soft)" strokeWidth="1.2" />

            <path d="M-21 -36 C-22 -56 22 -56 21 -36 C14 -44 6 -44 0 -40 C-7 -44 -14 -44 -21 -36 Z" fill={character.hairOklch} />
            {character.hairStyle === "bun" ? <circle cx="0" cy="-56" r="8" fill={character.hairOklch} /> : null}
            {character.hairStyle === "spiky" ? (
              <path d="M-16 -48 L-8 -60 L0 -50 L9 -61 L16 -47" fill={character.hairOklch} />
            ) : null}

            {expression.browCurve === "angry" ? (
              <g stroke="var(--tp-svg-ink)" strokeWidth="2.2" strokeLinecap="round">
                <line x1="-11" y1="-41" x2="-4" y2="-38" />
                <line x1="11" y1="-41" x2="4" y2="-38" />
              </g>
            ) : expression.browCurve === "sad" ? (
              <g stroke="var(--tp-svg-ink)" strokeWidth="2" strokeLinecap="round">
                <line x1="-11" y1="-38" x2="-4" y2="-41" />
                <line x1="11" y1="-38" x2="4" y2="-41" />
              </g>
            ) : (
              <g stroke="var(--tp-svg-ink)" strokeWidth="1.8" strokeLinecap="round">
                <line x1="-11" y1="-40" x2="-4" y2="-40" />
                <line x1="4" y1="-40" x2="11" y2="-40" />
              </g>
            )}

            {expression.eyeShape === "smile" ? (
              <g fill="none" stroke="var(--tp-svg-ink)" strokeWidth="2.2" strokeLinecap="round">
                <path d="M-11 -33 Q-7 -37 -3 -33" />
                <path d="M3 -33 Q7 -37 11 -33" />
              </g>
            ) : expression.eyeShape === "wide" ? (
              <g>
                <circle cx="-7" cy="-33" r="4" fill="var(--tp-svg-paper)" stroke="var(--tp-svg-ink)" strokeWidth="1.6" />
                <circle cx="7" cy="-33" r="4" fill="var(--tp-svg-paper)" stroke="var(--tp-svg-ink)" strokeWidth="1.6" />
                <circle cx="-7" cy="-33" r="1.6" fill="var(--tp-svg-ink)" />
                <circle cx="7" cy="-33" r="1.6" fill="var(--tp-svg-ink)" />
              </g>
            ) : expression.eyeShape === "star" ? (
              <g fill="var(--tp-svg-star)">
                <polygon points="-7,-38 -5,-34 -1,-33 -5,-31 -7,-28 -9,-31 -13,-33 -9,-34" />
                <polygon points="7,-38 9,-34 13,-33 9,-31 7,-28 5,-31 1,-33 5,-34" />
              </g>
            ) : (
              <g fill="var(--tp-svg-ink)">
                <ellipse cx="-7" cy="-33" rx="2.4" ry="3.2" />
                <ellipse cx="7" cy="-33" rx="2.4" ry="3.2" />
                <circle cx="-6.3" cy="-34" r="0.9" fill="var(--tp-svg-paper)" />
                <circle cx="7.7" cy="-34" r="0.9" fill="var(--tp-svg-paper)" />
              </g>
            )}

            {character.hasGlasses ? (
              <g fill="none" stroke="var(--tp-svg-ink)" strokeWidth="1.4">
                <rect x="-13" y="-37" width="11" height="8" rx="2" />
                <rect x="2" y="-37" width="11" height="8" rx="2" />
                <line x1="-2" y1="-33" x2="2" y2="-33" />
              </g>
            ) : null}

            {expression.mouthShape === "grin" ? (
              <path d="M-6 -24 Q0 -18 6 -24" fill="none" stroke="var(--tp-svg-ink)" strokeWidth="2.2" strokeLinecap="round" />
            ) : expression.mouthShape === "open-o" ? (
              <ellipse cx="0" cy="-23" rx="3.5" ry="4.5" fill="var(--tp-svg-mouth-open)" />
            ) : expression.mouthShape === "grit" ? (
              <rect x="-6" y="-25" width="12" height="4.5" rx="1.5" fill="var(--tp-svg-paper)" stroke="var(--tp-svg-ink)" strokeWidth="1.3" />
            ) : expression.mouthShape === "smirk" ? (
              <path d="M-4 -23 Q3 -22 7 -26" fill="none" stroke="var(--tp-svg-ink)" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <line x1="-4.5" y1="-23" x2="4.5" y2="-23" stroke="var(--tp-svg-ink)" strokeWidth="2" strokeLinecap="round" />
            )}

            {expression.overlayFx === "blush" ? (
              <g fill="var(--tp-svg-blush)">
                <ellipse cx="-11" cy="-27" rx="4" ry="2.2" />
                <ellipse cx="11" cy="-27" rx="4" ry="2.2" />
              </g>
            ) : null}
            {expression.overlayFx === "tears" ? (
              <g fill="var(--tp-svg-tear)">
                <ellipse cx="-9" cy="-27" rx="1.8" ry="3.4" />
                <ellipse cx="9" cy="-27" rx="1.8" ry="3.4" />
              </g>
            ) : null}
            {expression.overlayFx === "sweat" ? (
              <path d="M16 -46 Q20 -39 16 -36 Q12 -39 16 -46 Z" fill="var(--tp-svg-tear)" />
            ) : null}
            {expression.overlayFx === "anger-vein" ? (
              <path d="M13 -49 L17 -45 M17 -49 L13 -45" stroke="var(--tp-svg-anger)" strokeWidth="2.2" strokeLinecap="round" />
            ) : null}
            {expression.overlayFx === "sparkle" ? (
              <g fill="var(--tp-svg-sparkle)">
                <polygon points="-24,-48 -22,-43 -17,-41 -22,-39 -24,-34 -26,-39 -31,-41 -26,-43" />
              </g>
            ) : null}

            {pose.propKind === "desk" ? (
              <g>
                <rect x="-34" y="18" width="68" height="10" rx="3" fill="var(--tp-svg-desk)" stroke="var(--tp-svg-wood)" strokeWidth="1.5" />
                <rect x="-12" y="6" width="24" height="12" rx="2" fill="var(--tp-svg-laptop)" stroke="var(--tp-svg-trousers)" strokeWidth="1.2" />
              </g>
            ) : null}
          </g>
        </g>

        {showOverlays ? (
          <g>
            {renderSpeechBubble(cut.bubbleStyle, bubbleX, bubbleY, bubbleW, bubbleH, tailBase, tailTip)}
            {lines.map((line, index) => (
              <text
                key={`${cut.cutNumber}-line-${index}`}
                x={bubbleX + bubbleW / 2}
                y={bubbleY + (lines.length === 1 ? bubbleH / 2 + 4 : bubbleH / 2 - 4 + index * 13)}
                textAnchor="middle"
                fontSize={compact ? "9.5" : "10.5"}
                fontWeight="700"
                fill={cut.bubbleStyle === "narration" ? "var(--tp-svg-badge-fg)" : "var(--tp-svg-ink)"}
              >
                {line}
              </text>
            ))}

            <g transform={`translate(${sfxX} ${sfxY}) rotate(${sfx.tiltDeg})`}>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={compact ? "14" : "17"}
                fontWeight="900"
                fill={sfx.fillOklch}
                stroke={sfx.strokeOklch}
                strokeWidth="3.2"
                paintOrder="stroke"
              >
                {ko ? sfx.textKo : sfx.textEn}
              </text>
            </g>
          </g>
        ) : null}

        <rect x="10" y={VIEW_H - 26} width="54" height="18" rx="6" fill="var(--tp-svg-badge-bg)" />
        <text x="37" y={VIEW_H - 14} textAnchor="middle" fontSize="9.5" fontWeight="800" fill="var(--tp-svg-badge-fg)">
          {`CUT 0${cut.cutNumber}`}
        </text>
      </g>

      <rect x="4" y="4" width={VIEW_W - 8} height={VIEW_H - 8} rx="10" fill="none" stroke="var(--tp-svg-frame)" strokeWidth="2.5" />
    </svg>
  );
}
