import { useEffect, useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  balloonFontCssUrl,
  recommendBalloonFonts,
  type AiBalloonFont,
} from "./ai-balloon-fonts";
import {
  estimateBalloonSize,
  guessBalloonKind,
  recommendBalloonPlacement,
  type AiBalloonKind,
} from "./ai-balloon-placement";
import {
  isLocalFontAccessSupported,
  listLocalFontFamilies,
  loadLocalFontFace,
  localFontFamilyStack,
} from "./studio-local-fonts";

const VIEW_W = 320;
const VIEW_H = 260;

const KIND_OPTIONS: readonly { value: AiBalloonKind; ko: string; en: string }[] = [
  { value: "speech", ko: "일반 대사", en: "Speech" },
  { value: "thought", ko: "생각", en: "Thought" },
  { value: "shout", ko: "외침", en: "Shout" },
  { value: "whisper", ko: "속삭임", en: "Whisper" },
  { value: "narration", ko: "나레이션", en: "Narration" },
];

/** 말풍선 타입별 외형 — SVG 패스 */
function BalloonShape({ kind, x, y, w, h }: { kind: AiBalloonKind; x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const stroke = "#1a1a2e";
  const sw = 3;
  if (kind === "narration") {
    return <rect x={x} y={y} width={w} height={h} rx={4} fill="#fffbe8" stroke={stroke} strokeWidth={sw} />;
  }
  if (kind === "shout") {
    // 뾰족한 폭발형 — 타원 둘레에 지그재그
    const spikes = 14;
    const pts: string[] = [];
    for (let i = 0; i < spikes; i += 1) {
      const a1 = (i / spikes) * Math.PI * 2;
      const a2 = ((i + 0.5) / spikes) * Math.PI * 2;
      const r1x = (w / 2) * 1.08;
      const r1y = (h / 2) * 1.08;
      const r2x = (w / 2) * 0.86;
      const r2y = (h / 2) * 0.86;
      pts.push(`${cx + Math.cos(a1) * r1x},${cy + Math.sin(a1) * r1y}`);
      pts.push(`${cx + Math.cos(a2) * r2x},${cy + Math.sin(a2) * r2y}`);
    }
    return <polygon points={pts.join(" ")} fill="#ffffff" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />;
  }
  if (kind === "thought") {
    // 구름형 — 여러 원 겹치기
    return (
      <g fill="#ffffff" stroke={stroke} strokeWidth={sw}>
        <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} />
        <circle cx={x + w * 0.15} cy={y + h * 0.2} r={h * 0.28} fill="#ffffff" stroke="none" />
        <circle cx={x + w * 0.85} cy={y + h * 0.75} r={h * 0.24} fill="#ffffff" stroke="none" />
      </g>
    );
  }
  const dashed = kind === "whisper" ? { strokeDasharray: "7 5" } : {};
  return <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill="#ffffff" stroke={stroke} strokeWidth={sw} {...dashed} />;
}

/**
 * AI 말풍선 스튜디오 — 위치·타입·폰트 자동 추천.
 *
 * 사용성 (10초 규칙):
 * 1. "화자 위치를 클릭 → 대사 입력" 두 단계만
 * 2. 타입은 AI가 자동 추측, 폰트는 타입에 맞게 3개 추천
 * 3. 미리보기는 실제 말풍선 모양 SVG로
 */
export function AiBalloonStudio() {
  const t = useBilingual("ai-assist");
  const [speaker, setSpeaker] = useState({ x: 90, y: 200 });
  const [text, setText] = useState(t("이게 정말 사실이야?", "Is that really true?"));
  const [kindOverride, setKindOverride] = useState<AiBalloonKind | "auto">("auto");
  const [fontName, setFontName] = useState<string | null>(null);
  // 로컬 폰트(Local Font Access) — 지원 브라우저에서만 열리는 추가 선택지.
  const [localFamilies, setLocalFamilies] = useState<readonly string[] | null>(null);
  const [localFamily, setLocalFamily] = useState<string | null>(null);
  const [localNote, setLocalNote] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const localFontSupported = useMemo(() => isLocalFontAccessSupported(), []);

  const kind: AiBalloonKind = kindOverride === "auto" ? guessBalloonKind(text) : kindOverride;
  const fonts = useMemo(() => recommendBalloonFonts(kind), [kind]);

  // 추천 폰트 로드 (Google Fonts — 무료)
  useEffect(() => {
    const url = balloonFontCssUrl(fonts);
    if (!url || typeof document === "undefined") return;
    const id = "ai-balloon-fonts";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = url;
  }, [fonts]);

  const activeFont: AiBalloonFont = fonts.find((f) => f.name === fontName) ?? fonts[0];
  const previewFontFamily = localFamily ? localFontFamilyStack(localFamily) : activeFont.family;

  // 로컬 폰트 열거는 권한이 걸려 있어 클릭 제스처 안에서만 부른다.
  const handleLoadLocalFonts = async (): Promise<void> => {
    if (localBusy) return;
    setLocalBusy(true);
    try {
      const result = await listLocalFontFamilies();
      if (result.kind === "ok") {
        setLocalFamilies(result.families);
        setLocalNote(
          result.families.length > 0
            ? t(`이 기기의 폰트 ${result.families.length}개를 불러왔어요.`, `Loaded ${result.families.length} fonts from this device.`)
            : t("이 기기에서 읽을 수 있는 폰트가 없어요.", "No readable fonts were found on this device."),
        );
      } else if (result.kind === "denied") {
        setLocalNote(
          t(
            "로컬 폰트 접근이 거부됐어요. 브라우저의 사이트 권한에서 폰트 접근을 허용해 주세요.",
            "Local font access was denied. Allow font access in the browser's site permissions.",
          ),
        );
      } else if (result.kind === "failed") {
        setLocalNote(t("로컬 폰트 목록을 읽지 못했어요.", "Couldn't read the local font list."));
      } else {
        setLocalNote(t("이 브라우저는 로컬 폰트를 지원하지 않아요.", "This browser doesn't support local fonts."));
      }
    } finally {
      setLocalBusy(false);
    }
  };

  const handleSelectLocalFont = async (family: string): Promise<void> => {
    setLocalFamily(family);
    const loaded = await loadLocalFontFace(family);
    setLocalNote(
      loaded
        ? null
        : t(
            `'${family}' 폰트 데이터를 불러오지 못해 미리보기가 기본 글꼴로 표시될 수 있어요.`,
            `Couldn't load the '${family}' font data — the preview may fall back to a default font.`,
          ),
    );
  };

  const placement = useMemo(
    () =>
      recommendBalloonPlacement({
        text: text.length > 0 ? text : "…",
        speaker,
        canvasWidth: VIEW_W,
        canvasHeight: VIEW_H,
        existing: [],
        kind,
      }),
    [text, speaker, kind],
  );

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    setSpeaker({
      x: Math.round(((e.clientX - rect.left) / rect.width) * VIEW_W),
      y: Math.round(((e.clientY - rect.top) / rect.height) * VIEW_H),
    });
  };

  const fontSize = kind === "shout" ? 17 : kind === "whisper" ? 13 : 15;
  const { width: estW, height: estH } = estimateBalloonSize(text.length > 0 ? text : "…", kind, fontSize);

  return (
    <section className="ai-studio" aria-label={t("AI 말풍선 배치", "AI balloon placement")}>
      <div className="ai-studio__workspace">
        <div className="ai-studio__canvas-wrap">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="ai-studio__canvas ai-studio__balloon-canvas"
            onClick={handleCanvasClick}
            aria-label={t("말풍선 미리보기 — 클릭해서 화자 위치 지정", "Balloon preview — click to set speaker position")}
          >
            <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#f4f2ff" />
            {/* 배경 캐릭터 실루엣 (화자 표시) */}
            <circle cx={speaker.x} cy={speaker.y} r="16" fill="#7c5cff" opacity="0.25" />
            <circle cx={speaker.x} cy={speaker.y} r="10" fill="none" stroke="#7c5cff" strokeWidth="2.5" />
            <circle cx={speaker.x - 3.5} cy={speaker.y - 1} r="1.8" fill="#7c5cff" />
            <circle cx={speaker.x + 3.5} cy={speaker.y - 1} r="1.8" fill="#7c5cff" />
            {/* 꼬리 */}
            {kind !== "narration" && (
              <line
                x1={placement.tailBase.x}
                y1={placement.tailBase.y}
                x2={placement.tailTip.x}
                y2={placement.tailTip.y}
                stroke="#1a1a2e"
                strokeWidth="3"
                strokeLinecap="round"
              />
            )}
            {kind === "thought" && (
              <g fill="#ffffff" stroke="#1a1a2e" strokeWidth="2">
                <circle cx={(placement.tailBase.x + speaker.x) / 2} cy={(placement.tailBase.y + speaker.y) / 2} r="6" />
                <circle cx={(speaker.x * 2 + placement.tailBase.x) / 3} cy={(speaker.y * 2 + placement.tailBase.y) / 3} r="4" />
              </g>
            )}
            <BalloonShape kind={kind} x={placement.x} y={placement.y} w={placement.width} h={placement.height} />
            <text
              x={placement.x + placement.width / 2}
              y={placement.y + placement.height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              fontFamily={previewFontFamily}
              fill="#1a1a2e"
            >
              {(text.length > 0 ? text : "…").slice(0, 28)}
            </text>
            <text x={8} y={VIEW_H - 8} fontSize="11" fill="#7c5cff">
              {t("클릭: 화자 위치", "Click: speaker")}
            </text>
          </svg>
          <p className="ai-studio__canvas-hint">
            {t("① 캔버스를 클릭해 화자 위치 지정 → ② 대사 입력", "① Click canvas for speaker → ② type dialogue")}
          </p>
        </div>

        <div className="ai-studio__controls">
          <div className="ai-studio__mood-row">
            <label className="ai-studio__field-label" htmlFor="ai-balloon-text">
              {t("대사", "Dialogue")}
            </label>
            <input
              id="ai-balloon-text"
              className="ai-studio__select ai-studio__text-input"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={60}
              placeholder={t("대사를 입력하세요", "Type dialogue")}
            />
          </div>

          <div className="ai-studio__mood-row" role="group" aria-label={t("말풍선 타입", "Balloon type")}>
            <label className="ai-studio__field-label" htmlFor="ai-balloon-kind">
              {t("말풍선 타입", "Type")}
            </label>
            <select
              id="ai-balloon-kind"
              className="ai-studio__select"
              value={kindOverride}
              onChange={(e) => setKindOverride(e.target.value as AiBalloonKind | "auto")}
            >
              <option value="auto">{t(`자동 (${KIND_OPTIONS.find((k) => k.value === kind)?.ko})`, `Auto (${kind})`)}</option>
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.ko === o.en ? o.ko : `${o.ko} · ${o.en}`}
                </option>
              ))}
            </select>
          </div>

          {/* 폰트 추천 — 타입에 맞는 3개 */}
          <div className="ai-studio__mood-row" role="group" aria-label={t("폰트 추천", "Font picks")}>
            <span className="ai-studio__field-label" id="ai-balloon-font-label">
              {t("폰트 추천", "Fonts")}
            </span>
            <div className="ai-studio__font-list" role="radiogroup" aria-labelledby="ai-balloon-font-label">
              {fonts.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  role="radio"
                  aria-checked={localFamily === null && activeFont.name === f.name}
                  className={`ai-studio__font-btn${localFamily === null && activeFont.name === f.name ? " ai-studio__font-btn--active" : ""}`}
                  onClick={() => {
                    setFontName(f.name);
                    setLocalFamily(null);
                  }}
                  title={f.reason.ko}
                >
                  <span className="ai-studio__font-sample" style={{ fontFamily: f.family }}>
                    {t("가", "Aa")}
                  </span>
                  <span className="ai-studio__font-name">{f.name}</span>
                </button>
              ))}
            </div>
            <p className="ai-studio__advanced-note">{activeFont.reason.ko}</p>
            {localFontSupported && (
              <>
                <button
                  type="button"
                  className="ai-studio__font-btn"
                  disabled={localBusy}
                  onClick={() => void handleLoadLocalFonts()}
                >
                  {localBusy ? t("불러오는 중…", "Loading…") : t("내 폰트 불러오기", "Load my fonts")}
                </button>
                {localFamilies !== null && localFamilies.length > 0 && (
                  <div className="ai-studio__font-list" role="listbox" aria-label={t("내 폰트", "My fonts")}>
                    {localFamilies.map((family) => (
                      <button
                        key={family}
                        type="button"
                        role="option"
                        aria-selected={localFamily === family}
                        className={`ai-studio__font-btn${localFamily === family ? " ai-studio__font-btn--active" : ""}`}
                        onClick={() => void handleSelectLocalFont(family)}
                      >
                        <span className="ai-studio__font-sample" style={{ fontFamily: localFontFamilyStack(family) }}>
                          {t("가", "Aa")}
                        </span>
                        <span className="ai-studio__font-name">{family}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {localNote && (
              <p className="ai-studio__advanced-note" role="status">
                {localNote}
              </p>
            )}
          </div>

          <details className="ai-studio__advanced">
            <summary className="ai-studio__advanced-summary">{t("측정 정보", "Metrics")}</summary>
            <p className="ai-studio__stat">
              {t(
                `추정 크기 ${estW}×${estH}px · 위치 (${Math.round(placement.x)}, ${Math.round(placement.y)})`,
                `Estimated ${estW}×${estH}px · at (${Math.round(placement.x)}, ${Math.round(placement.y)})`,
              )}
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
