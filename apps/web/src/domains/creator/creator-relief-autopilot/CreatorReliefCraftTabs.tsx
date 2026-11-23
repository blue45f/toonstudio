import { Copy } from "lucide-react";
import { useId } from "react";

import {
  BALLOON_STYLE_LABELS,
  CHARACTER_BASE_COLOR_PRESETS,
  MAX_BALLOON_CHARS,
  SHADING_LIGHTING_MOOD_IDS,
  SHADING_LIGHTING_MOOD_LABELS,
  formatRgbToHex,
  pickLocaleText,
  type AutoBalloonLayoutResult,
  type BilingualLabel,
  type CreatorReliefLocale,
  type RgbColor,
  type ShadingLightingMoodId,
  type ShadingRampStop,
  type Webtoon5ToneShadingRamp,
} from "./creator-relief-engine";

function t(locale: CreatorReliefLocale, ko: string, en: string): string {
  return locale === "ko" ? ko : en;
}

function rgbCss(rgb: RgbColor): string {
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
}

/* ============================================================================
 * 탭 3: 캐릭터 1클릭 5-톤 웹툰 음영 팔레트 뷰
 * ============================================================================ */

export interface ShadingRampTabProps {
  readonly locale: CreatorReliefLocale;
  readonly baseRgb: RgbColor;
  readonly lightingMood: ShadingLightingMoodId;
  readonly ramp: Webtoon5ToneShadingRamp;
  readonly onBaseRgbChange: (rgb: RgbColor) => void;
  readonly onLightingMoodChange: (mood: ShadingLightingMoodId) => void;
  readonly onCopySwatch: (stop: ShadingRampStop) => void;
}

export function ShadingRampTabView({
  locale,
  baseRgb,
  lightingMood,
  ramp,
  onBaseRgbChange,
  onLightingMoodChange,
  onCopySwatch,
}: ShadingRampTabProps) {
  const redId = useId();
  const greenId = useId();
  const blueId = useId();

  const monotonicOk =
    ramp.highlight.oklch.l > ramp.base.oklch.l &&
    ramp.base.oklch.l > ramp.shadow1.oklch.l &&
    ramp.shadow1.oklch.l > ramp.shadow2.oklch.l;

  return (
    <div className="cra-section" data-testid="cra-panel-shading">
      <div
        className="cra-controls-row"
        role="group"
        aria-label={t(locale, "조명 무드 선택", "Lighting Mood")}
      >
        {SHADING_LIGHTING_MOOD_IDS.map((moodId) => (
          <button
            key={moodId}
            type="button"
            className="cra-chip"
            data-testid={`cra-lighting-${moodId}`}
            aria-pressed={lightingMood === moodId}
            onClick={() => onLightingMoodChange(moodId)}
          >
            {pickLocaleText(SHADING_LIGHTING_MOOD_LABELS[moodId], locale)}
          </button>
        ))}
      </div>

      <div
        className="cra-controls-row"
        role="group"
        aria-label={t(locale, "캐릭터 기본색 프리셋", "Character Base Presets")}
      >
        {CHARACTER_BASE_COLOR_PRESETS.map((preset) => {
          const active =
            preset.rgb.r === baseRgb.r &&
            preset.rgb.g === baseRgb.g &&
            preset.rgb.b === baseRgb.b;
          return (
            <button
              key={preset.id}
              type="button"
              className="cra-preset-btn"
              data-testid={`cra-color-preset-${preset.id}`}
              aria-pressed={active}
              onClick={() => onBaseRgbChange(preset.rgb)}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  backgroundColor: rgbCss(preset.rgb),
                  border: "1px solid var(--color-line)",
                }}
              />
              <span>{pickLocaleText(preset.label, locale)}</span>
            </button>
          );
        })}
      </div>

      <div className="cra-rgb-sliders cra-num">
        <div className="cra-field">
          <label className="cra-label" htmlFor={redId}>
            <span>R</span>
            <span>{baseRgb.r}</span>
          </label>
          <input
            id={redId}
            type="range"
            className="cra-range"
            data-testid="cra-rgb-r"
            min={0}
            max={255}
            value={baseRgb.r}
            onChange={(event) => onBaseRgbChange({ ...baseRgb, r: Number(event.target.value) })}
          />
        </div>
        <div className="cra-field">
          <label className="cra-label" htmlFor={greenId}>
            <span>G</span>
            <span>{baseRgb.g}</span>
          </label>
          <input
            id={greenId}
            type="range"
            className="cra-range"
            data-testid="cra-rgb-g"
            min={0}
            max={255}
            value={baseRgb.g}
            onChange={(event) => onBaseRgbChange({ ...baseRgb, g: Number(event.target.value) })}
          />
        </div>
        <div className="cra-field">
          <label className="cra-label" htmlFor={blueId}>
            <span>B</span>
            <span>{baseRgb.b}</span>
          </label>
          <input
            id={blueId}
            type="range"
            className="cra-range"
            data-testid="cra-rgb-b"
            min={0}
            max={255}
            value={baseRgb.b}
            onChange={(event) => onBaseRgbChange({ ...baseRgb, b: Number(event.target.value) })}
          />
        </div>
      </div>

      <div className="cra-shading-layout">
        <div className="cra-shading-preview-card">
          <svg
            className="cra-shading-bust-svg"
            viewBox="0 0 160 160"
            role="img"
            aria-label={t(locale, "5-톤 셀 채색 구체 미리보기", "5-tone cel-shading preview sphere")}
          >
            <circle cx="80" cy="80" r="62" fill={rgbCss(ramp.shadow2.rgb)} />
            <circle cx="76" cy="76" r="59" fill={rgbCss(ramp.shadow1.rgb)} />
            <path
              d="M 32 48 A 60 60 0 0 1 128 52 C 118 98 84 114 36 108 A 60 60 0 0 1 32 48 Z"
              fill={rgbCss(ramp.base.rgb)}
            />
            <ellipse
              cx="60"
              cy="52"
              rx="22"
              ry="14"
              transform="rotate(-24 60 52)"
              fill={rgbCss(ramp.highlight.rgb)}
            />
            <path
              d="M 118 36 A 61 61 0 0 1 124 120"
              fill="none"
              stroke={rgbCss(ramp.rimLight.rgb)}
              strokeWidth="4.5"
              strokeLinecap="round"
            />
          </svg>
          <span className="cra-badge" data-tone={monotonicOk ? "good" : "warn"}>
            {monotonicOk
              ? t(locale, "명도 단조 감소 검증됨", "Monotonic Lightness OK")
              : t(locale, "극단 밝기 클램프 적용", "Extreme L Clamped")}
          </span>
          <span className="cra-label-muted cra-num">
            {t(locale, "기준", "Base")} {formatRgbToHex(ramp.base.rgb)}
          </span>
        </div>

        <div className="cra-ramp-grid">
          {ramp.stops.map((stop) => (
            <div key={stop.role} className="cra-swatch-card" data-testid={`cra-stop-${stop.role}`}>
              <div
                className="cra-swatch-color"
                style={{ backgroundColor: rgbCss(stop.rgb) }}
                aria-hidden="true"
              />
              <div className="cra-swatch-name">{pickLocaleText(stop.label, locale)}</div>
              <div className="cra-swatch-meta cra-num">
                <div>
                  RGB ({stop.rgb.r}, {stop.rgb.g}, {stop.rgb.b})
                </div>
                <div>
                  OKLCH ({stop.oklch.l.toFixed(2)}, {stop.oklch.c.toFixed(2)},{" "}
                  {stop.oklch.h.toFixed(0)}°)
                </div>
                <div>
                  {t(locale, "색조 시프트", "Hue Shift")}: {stop.hueShiftDeg >= 0 ? "+" : ""}
                  {stop.hueShiftDeg}° · {stop.blendModeHint}
                </div>
              </div>
              <button
                type="button"
                className="cra-btn"
                data-testid={`cra-copy-stop-${stop.role}`}
                onClick={() => onCopySwatch(stop)}
              >
                <Copy size={14} aria-hidden="true" />
                <span className="cra-num">{formatRgbToHex(stop.rgb)}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 탭 4: 대본 붙여넣기 → 말풍선 자동 분절·호흡 오토파일럿 뷰
 * ============================================================================ */

export interface ScriptBalloonsTabProps {
  readonly locale: CreatorReliefLocale;
  readonly rawScript: string;
  readonly layout: AutoBalloonLayoutResult;
  readonly onScriptChange: (value: string) => void;
}

const SAMPLE_SCRIPTS: readonly {
  readonly id: string;
  readonly label: BilingualLabel;
  readonly text: BilingualLabel;
}[] = [
  {
    id: "rofan",
    label: { ko: "로판 고백씬 예시", en: "Romance Scene Sample" },
    text: {
      ko: [
        "[나레이션] 빗소리가 잦아든 회랑 끝에서 두 사람의 발걸음이 멈췄다.",
        "세라: 정말 여기서 끝낼 생각이에요? 지난 3년 동안 우리가 지켜온 약속을 전부 잊어버리고 돌아설 수 있나요?",
        "카엘: (아니, 사실은 단 한 순간도 너를 놓아줄 자신이 없었어...)",
        "카엘: 가지 마! 이번엔 내가 먼저 잡을게!",
      ].join("\n"),
      en: [
        "[Narration] At the end of the quiet rain-soaked corridor, both footsteps came to a sudden halt.",
        "Sera: Are you really going to walk away here after every single promise we kept alive for three years?",
        "Kael: (No, the truth is I never once had the courage to let you go...)",
        "Kael: Don't go! This time I will hold on first!",
      ].join("\n"),
    },
  },
  {
    id: "action",
    label: { ko: "액션 대치씬 예시", en: "Action Clash Sample" },
    text: {
      ko: [
        "[나레이션] 붉은 경고등이 켜지자 옥상 철문이 거칠게 열렸다.",
        "지훈: 거기 서! 그 데이터 코어를 넘기지 않으면 이 구역 전체가 30초 안에 무너진다고!",
        "하린: (시간이 없어... 왼쪽 난간을 타고 뛰어내려야 해.)",
        "하린: 그렇다면 막아 보든가?",
      ].join("\n"),
      en: [
        "[Narration] Red emergency beacons flickered as the rooftop steel door slammed wide open.",
        "Jihun: Freeze right there! Hand over that core now or this entire sector collapses in thirty seconds!",
        "Harin: (No time left... I have to vault over the left railing right now.)",
        "Harin: Then try stopping me?",
      ].join("\n"),
    },
  },
];

export function ScriptBalloonsTabView({
  locale,
  rawScript,
  layout,
  onScriptChange,
}: ScriptBalloonsTabProps) {
  const textareaId = useId();
  const longestBalloon = layout.items.reduce((max, item) => Math.max(max, item.charCount), 0);

  return (
    <div className="cra-section" data-testid="cra-panel-script">
      <div className="cra-field">
        <label className="cra-label" htmlFor={textareaId}>
          <span>{t(locale, "대본 붙여넣기 (화자: 대사)", "Paste Script (Speaker: Line)")}</span>
          <span className="cra-label-muted cra-num">
            {t(
              locale,
              `한도 ${MAX_BALLOON_CHARS}자 자동 분절`,
              `Auto-split <= ${MAX_BALLOON_CHARS} chars`,
            )}
          </span>
        </label>
        <textarea
          id={textareaId}
          className="cra-textarea"
          data-testid="cra-script-textarea"
          value={rawScript}
          placeholder={t(
            locale,
            "[나레이션] 비가 내렸다.\n주인공: 멈춰! 거기 서!",
            "[Narration] Rain began to fall.\nHero: Stop right there!",
          )}
          onChange={(event) => onScriptChange(event.target.value)}
        />
      </div>

      <div className="cra-controls-row">
        {SAMPLE_SCRIPTS.map((sample) => (
          <button
            key={sample.id}
            type="button"
            className="cra-preset-btn"
            data-testid={`cra-script-sample-${sample.id}`}
            onClick={() => onScriptChange(pickLocaleText(sample.text, locale))}
          >
            {pickLocaleText(sample.label, locale)}
          </button>
        ))}
      </div>

      <div className="cra-metrics-strip cra-num">
        <div className="cra-metric-box">
          <span className="cra-metric-label">{t(locale, "총 말풍선", "Balloons")}</span>
          <span className="cra-metric-value">{layout.totalBalloons}</span>
        </div>
        <div className="cra-metric-box">
          <span className="cra-metric-label">{t(locale, "자동 분절", "Auto Splits")}</span>
          <span className="cra-metric-value">{layout.splitCount}</span>
        </div>
        <div className="cra-metric-box">
          <span className="cra-metric-label">{t(locale, "최대 글자 수", "Max Chars")}</span>
          <span className="cra-metric-value">
            {longestBalloon} / {layout.maxCharsPerBalloon}
          </span>
        </div>
        <div className="cra-metric-box">
          <span className="cra-metric-label">{t(locale, "예상 스크롤", "Est. Scroll")}</span>
          <span className="cra-metric-value">{layout.estimatedScrollHeightPx}px</span>
        </div>
      </div>

      <div className="cra-balloon-strip" data-testid="cra-balloon-strip">
        {layout.items.length === 0 ? (
          <p className="cra-empty">
            {t(
              locale,
              "대본을 붙여넣으면 말풍선 스타일과 호흡 여백이 자동으로 계산됩니다.",
              "Paste dialogue lines above to generate webtoon balloons and vertical gutters.",
            )}
          </p>
        ) : (
          layout.items.map((item) => (
            <div key={item.id} className="cra-balloon-row" data-side={item.side}>
              <div className="cra-balloon-meta cra-num">
                <span>{item.speaker ?? t(locale, "나레이션", "Narration")}</span>
                <span className="cra-badge" data-tone={item.style === "shout" ? "warn" : undefined}>
                  {pickLocaleText(BALLOON_STYLE_LABELS[item.style], locale)}
                </span>
                <span>
                  {item.charCount}/{layout.maxCharsPerBalloon}
                </span>
                {item.isSplitContinuation ? (
                  <span className="cra-badge" data-tone="good">
                    {t(locale, "분절 이어짐", "Split Cont.")}
                  </span>
                ) : null}
              </div>

              <div
                className="cra-balloon-bubble"
                data-style={item.style}
                data-testid={`cra-balloon-item-${item.sequenceIndex}`}
              >
                {item.lines.map((line, lineIdx) => (
                  <p key={`${item.id}-l-${lineIdx}`} className="cra-balloon-line">
                    {line}
                  </p>
                ))}
              </div>

              <div className="cra-gutter-indicator cra-num">
                <span>
                  ↕ {item.gutterPx}px · {pickLocaleText(item.pacingNote, locale)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
