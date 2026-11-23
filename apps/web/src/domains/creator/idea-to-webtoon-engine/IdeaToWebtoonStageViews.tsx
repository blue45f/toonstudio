/**
 * 아이디어 → 완성 웹툰 워크벤치 하위 뷰:
 * - Stage 2: 캐릭터 DNA 락 카드
 * - Stage 3: 세로 스크롤 호흡 & 컷 연출 미리보기
 * - Stage 5: 감정 곡선 연동 적응형 OST SVG 그래프 & 큐 카드
 */

import { Film, Music2, ShieldCheck, Users } from "lucide-react";

import {
  SPEECH_REGISTER_LABELS,
  STORY_ACT_LABELS,
  TIME_OF_DAY_LABELS,
} from "./idea-to-episode-catalog";
import type {
  AdaptiveOstEmotionCue,
  CharacterDnaLock,
  GeneratedPanelBlueprint,
  IdeaPipelineLocale,
  ScrollTempoId,
} from "./idea-to-episode-types";

const SWATCH_CLASS_MAP: Readonly<Record<string, string>> = {
  accent: "i2w-swatch-dot--accent",
  cool: "i2w-swatch-dot--cool",
  good: "i2w-swatch-dot--good",
  warn: "i2w-swatch-dot--warn",
  bad: "i2w-swatch-dot--bad",
  raised: "i2w-swatch-dot--raised",
  "fg-muted": "i2w-swatch-dot--fg-muted",
};

const ROLE_LABELS = {
  protagonist: { ko: "주연", en: "Protagonist" },
  deuteragonist: { ko: "핵심 조연", en: "Deuteragonist" },
  antagonist: { ko: "대립 축", en: "Antagonist" },
} as const;

const TEMPO_LABELS: Readonly<Record<ScrollTempoId, { readonly ko: string; readonly en: string }>> = {
  "compressed-action": { ko: "액션 압축 여백", en: "Compressed Action Gutter" },
  "steady-dialogue": { ko: "대사 호흡 여백", en: "Steady Dialogue Gutter" },
  "expanded-tension": { ko: "긴장 확장 여백", en: "Expanded Tension Gutter" },
  "cliffhanger-drop": { ko: "클리프행어 정적 드롭", en: "Cliffhanger Silence Drop" },
};

export function CharacterDnaSection({
  characters,
  locale,
}: {
  readonly characters: readonly CharacterDnaLock[];
  readonly locale: IdeaPipelineLocale;
}) {
  const t = (ko: string, en: string) => (locale === "ko" ? ko : en);

  return (
    <section className="i2w-section" aria-labelledby="i2w-dna-heading" data-testid="i2w-character-dna-section">
      <div className="i2w-section-head">
        <h3 id="i2w-dna-heading" className="i2w-section-title">
          <Users size={16} aria-hidden="true" />
          <span>{t("2단계 · 캐릭터 바이블 & 장기 일관성 DNA 락", "Stage 2 · Character Bible & Long-Term DNA Lock")}</span>
        </h3>
        <span className="i2w-pill i2w-pill--cool i2w-num">
          {t(`잠금 캐스트 ${characters.length}인`, `${characters.length} Locked Cast`)}
        </span>
      </div>

      <div className="i2w-dna-grid">
        {characters.map((character) => (
          <article key={character.id} className="i2w-dna-card" data-testid={`i2w-dna-card-${character.id}`}>
            <div className="i2w-dna-head">
              <div>
                <h4 className="i2w-dna-name">{character.name[locale]}</h4>
                <span className="i2w-dna-hash">{character.consistencyHash}</span>
              </div>
              <div className="i2w-header-meta">
                <span className="i2w-pill i2w-pill--accent">{ROLE_LABELS[character.role][locale]}</span>
                <span className="i2w-pill">{SPEECH_REGISTER_LABELS[character.speechRegister][locale]}</span>
              </div>
            </div>

            <div className="i2w-step-summary">
              <strong>{t("고정 의상", "Locked Outfit")}:</strong> {character.lockedOutfitLabel[locale]}
            </div>
            <div className="i2w-step-summary">
              <strong>{t("말투 규칙", "Speech Rule")}:</strong> {character.speechRegisterRule[locale]}
            </div>

            <div className="i2w-swatch-row" aria-label={t("시그니처 팔레트 토큰", "Signature Palette Tokens")}>
              {character.signaturePaletteTokens.map((token) => (
                <span key={`${character.id}-${token.role.en}`} className="i2w-swatch-chip">
                  <span
                    className={`i2w-swatch-dot ${SWATCH_CLASS_MAP[token.swatchId] ?? "i2w-swatch-dot--raised"}`}
                    aria-hidden="true"
                  />
                  <span>{token.role[locale]}</span>
                </span>
              ))}
            </div>

            <ul className="i2w-dna-list">
              {character.appearanceAnchors.map((anchor) => (
                <li key={anchor.en}>{anchor[locale]}</li>
              ))}
              <li>
                <strong>{t("소품", "Props")}:</strong>{" "}
                {character.propsInventory.map((item) => item[locale]).join(" · ")}
              </li>
              {character.relationships.map((edge) => (
                <li key={`${character.id}-${edge.targetCharacterId}`}>
                  <strong>{edge.targetName[locale]}:</strong> {edge.summary[locale]}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ScrollPanelDirectionSection({
  panels,
  totalStripHeightPx,
  locale,
}: {
  readonly panels: readonly GeneratedPanelBlueprint[];
  readonly totalStripHeightPx: number;
  readonly locale: IdeaPipelineLocale;
}) {
  const t = (ko: string, en: string) => (locale === "ko" ? ko : en);

  return (
    <section className="i2w-section" aria-labelledby="i2w-panels-heading" data-testid="i2w-scroll-panels-section">
      <div className="i2w-section-head">
        <h3 id="i2w-panels-heading" className="i2w-section-title">
          <Film size={16} aria-hidden="true" />
          <span>{t("3단계 · 세로 스크롤 호흡 & 컷별 연출 미리보기", "Stage 3 · Vertical Scroll Pacing & Panel Direction")}</span>
        </h3>
        <span className="i2w-pill i2w-num">
          {t(
            `${panels.length}컷 · 총 스트립 ${totalStripHeightPx.toLocaleString("ko-KR")}px`,
            `${panels.length} panels · ${totalStripHeightPx.toLocaleString("en-US")}px strip`,
          )}
        </span>
      </div>

      <div className="i2w-strip-scroll" data-testid="i2w-panel-strip-list">
        {panels.map((panel) => {
          const gutterModifier =
            panel.scrollTempo === "cliffhanger-drop" || panel.scrollTempo === "expanded-tension"
              ? "i2w-gutter-bar--expanded"
              : panel.scrollTempo === "compressed-action"
                ? "i2w-gutter-bar--compressed"
                : "";

          return (
            <div key={panel.panelId}>
              {panel.gutterBeforePx > 0 && (
                <div className={`i2w-gutter-bar ${gutterModifier} i2w-num`}>
                  <span>{TEMPO_LABELS[panel.scrollTempo][locale]}</span>
                  <span>·</span>
                  <span>{panel.gutterBeforePx}px</span>
                </div>
              )}

              <article
                className={`i2w-panel-card ${panel.isCliffhangerPanel ? "i2w-panel-card--cliff" : ""}`}
                data-testid={`i2w-panel-card-${panel.panelIndex}`}
              >
                <div className="i2w-panel-meta">
                  <span className="i2w-pill i2w-pill--accent i2w-num">
                    {t(`컷 #${panel.panelIndex}`, `Panel #${panel.panelIndex}`)}
                  </span>
                  <span className="i2w-pill">{STORY_ACT_LABELS[panel.act][locale]}</span>
                  <span className="i2w-pill i2w-pill--cool">{panel.cameraShot}</span>
                  <span className="i2w-pill i2w-num">
                    {panel.panelWidthPx}×{panel.panelHeightPx}px
                  </span>
                  <span className="i2w-pill">{TIME_OF_DAY_LABELS[panel.timeOfDay][locale]}</span>
                  <span className="i2w-pill i2w-num">
                    {t(`긴장도 ${panel.tensionScore}`, `Tension ${panel.tensionScore}`)}
                  </span>
                  <span className="i2w-pill i2w-pill--warn">SFX: {panel.sfx[locale]}</span>
                  {panel.isCliffhangerPanel && (
                    <span className="i2w-pill i2w-pill--good">
                      <ShieldCheck size={12} aria-hidden="true" />
                      {t("엔딩 클리프행어", "Cliffhanger")}
                    </span>
                  )}
                </div>

                <div className="i2w-step-summary">
                  <strong>3D BG:</strong> {panel.bg3dPresetLabel[locale]} — {panel.visualDirection[locale]}
                </div>

                <div className="i2w-dialogue-list">
                  {panel.dialogues.map((bubble) => (
                    <div key={bubble.id} className="i2w-bubble">
                      <span className="i2w-bubble-speaker">{bubble.speakerName[locale]}</span>
                      <span>{bubble.text[locale]}</span>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function AdaptiveOstCurveSection({
  panels,
  ostCues,
  locale,
}: {
  readonly panels: readonly GeneratedPanelBlueprint[];
  readonly ostCues: readonly AdaptiveOstEmotionCue[];
  readonly locale: IdeaPipelineLocale;
}) {
  const t = (ko: string, en: string) => (locale === "ko" ? ko : en);

  const svgWidth = 680;
  const svgHeight = 200;
  const padLeft = 42;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 34;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const coords = panels.map((panel, index) => {
    const ratioX = panels.length <= 1 ? 0.5 : index / (panels.length - 1);
    const x = Math.round(padLeft + ratioX * plotW);
    const y = Math.round(padTop + ((100 - panel.tensionScore) / 100) * plotH);
    return { x, y, panel };
  });

  const polylinePoints = coords.map((pt) => `${pt.x},${pt.y}`).join(" ");

  return (
    <section className="i2w-section" aria-labelledby="i2w-ost-heading" data-testid="i2w-ost-section">
      <div className="i2w-section-head">
        <h3 id="i2w-ost-heading" className="i2w-section-title">
          <Music2 size={16} aria-hidden="true" />
          <span>{t("5단계 · 감정 곡선 연동 적응형 OST & 사운드 큐", "Stage 5 · Adaptive Emotion-Curve OST & Sound Cues")}</span>
        </h3>
        <span className="i2w-pill i2w-pill--cool i2w-num">
          {t(`악장 큐 ${ostCues.length}개`, `${ostCues.length} Audio Cues`)}
        </span>
      </div>

      <div className="i2w-ost-svg-wrap">
        <svg
          className="i2w-ost-svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label={t(
            `컷별 감정 긴장도 및 적응형 OST 크로스페이드 곡선 (${panels.length}컷)`,
            `Panel emotion tension curve and adaptive OST crossfade markers (${panels.length} panels)`,
          )}
          data-testid="i2w-ost-emotion-svg"
        >
          {[25, 50, 75, 100].map((level) => {
            const y = Math.round(padTop + ((100 - level) / 100) * plotH);
            return (
              <g key={level}>
                <line x1={padLeft} y1={y} x2={svgWidth - padRight} y2={y} className="i2w-ost-grid-line" />
                <text x={8} y={y + 4} className="i2w-ost-label">
                  {level}
                </text>
              </g>
            );
          })}

          {ostCues.map((cue) => {
            const entryPt = coords.find((pt) => pt.panel.panelIndex === cue.crossfadeEntryPanel);
            if (!entryPt) return null;
            return (
              <g key={cue.cueId}>
                <line
                  x1={entryPt.x}
                  y1={padTop}
                  x2={entryPt.x}
                  y2={svgHeight - padBottom}
                  className="i2w-ost-crossfade"
                />
                <text x={entryPt.x + 4} y={svgHeight - 10} className="i2w-ost-label">
                  {cue.bpm} BPM
                </text>
              </g>
            );
          })}

          {coords.length > 1 && <polyline points={polylinePoints} className="i2w-ost-curve" />}

          {coords.map(({ x, y, panel }) => (
            <circle
              key={panel.panelId}
              cx={x}
              cy={y}
              r={panel.isCliffhangerPanel ? 6 : 4}
              className={panel.isCliffhangerPanel ? "i2w-ost-point--cliff" : "i2w-ost-point"}
            >
              <title>
                {locale === "ko"
                  ? `컷 ${panel.panelIndex}: 긴장도 ${panel.tensionScore}`
                  : `Panel ${panel.panelIndex}: Tension ${panel.tensionScore}`}
              </title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="i2w-ost-cue-grid">
        {ostCues.map((cue) => (
          <article key={cue.cueId} className="i2w-ost-cue-card" data-testid={`i2w-ost-cue-${cue.cueId}`}>
            <div className="i2w-step-top i2w-num">
              <span>
                {t(
                  `컷 ${cue.startPanelIndex}–${cue.endPanelIndex}`,
                  `Panels ${cue.startPanelIndex}-${cue.endPanelIndex}`,
                )}
              </span>
              <span>
                {cue.bpm} BPM · {cue.musicalKey}
              </span>
            </div>
            <div className="i2w-step-title">{cue.emotionTag[locale]}</div>
            <div className="i2w-step-summary i2w-num">
              {t(
                `평균 긴장도 ${cue.averageTension} · 크로스페이드 ${cue.crossfadeDurationSec}초`,
                `Avg Tension ${cue.averageTension} · Crossfade ${cue.crossfadeDurationSec}s`,
              )}
            </div>
            <div className="i2w-step-summary">
              {cue.instrumentLayers.map((inst) => inst[locale]).join(" + ")}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
