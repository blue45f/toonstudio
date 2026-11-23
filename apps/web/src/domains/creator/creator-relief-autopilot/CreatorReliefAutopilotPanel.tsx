import "./creator-relief-autopilot.css";

import {
  Copy,
  Download,
  FileCode2,
  LayoutGrid,
  MessageSquareText,
  Palette,
  Sparkles,
  Users,
} from "lucide-react";
import { useCallback, useId, useMemo, useState, type KeyboardEvent } from "react";

import { useI18n } from "@/shared/lib/i18n";

import { ScriptBalloonsTabView, ShadingRampTabView } from "./CreatorReliefCraftTabs";
import { CutCompositionTabView, PerspectiveCrowdTabView } from "./CreatorReliefVisualTabs";
import {
  CHARACTER_BASE_COLOR_PRESETS,
  autoLayoutScriptToBalloons,
  buildCutCompositionSvg,
  buildPerspectiveCrowdSvg,
  buildScriptBalloonsSvg,
  buildShadingRampSvg,
  deriveWebtoon5ToneShadingRamp,
  formatRgbToHex,
  generatePerspectiveCrowdSilhouettes,
  pickLocaleText,
  suggestCutCompositionsFromLine,
  type BilingualLabel,
  type CreatorReliefLocale,
  type CrowdSceneId,
  type CutMoodId,
  type RgbColor,
  type ShadingLightingMoodId,
  type ShadingRampStop,
} from "./creator-relief-engine";

export type CreatorReliefTabId = "composition" | "crowd" | "shading" | "script";

export interface CreatorReliefAutopilotPanelProps {
  readonly defaultTab?: CreatorReliefTabId;
  readonly className?: string;
  readonly onExportJson?: (tab: CreatorReliefTabId, payloadJson: string) => void;
  readonly onExportSvg?: (tab: CreatorReliefTabId, payloadSvg: string) => void;
}

const TAB_ORDER: readonly CreatorReliefTabId[] = ["composition", "crowd", "shading", "script"];

const TAB_LABELS: Readonly<Record<CreatorReliefTabId, BilingualLabel>> = {
  composition: { ko: "빈 컷 구도 추천", en: "Cut Composition" },
  crowd: { ko: "엑스트라 군중 1클릭", en: "1-Click Crowd" },
  shading: { ko: "5-톤 음영 팔레트", en: "5-Tone Shading" },
  script: { ko: "대본→말풍선 자동 배치", en: "Script to Balloons" },
};

const DEFAULT_DIALOGUE: BilingualLabel = {
  ko: "잠깐… 그 봉인을 네가 열었다고?!",
  en: "Wait... you were the one who broke that seal?!",
};

const DEFAULT_SCRIPT: BilingualLabel = {
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
};

const IDLE_STATUS: BilingualLabel = {
  ko: "4대 작화 자동화 엔진이 준비됐습니다. 대사·장면·밑색·대본을 입력하면 실시간으로 벡터 결과를 만듭니다.",
  en: "All 4 drawing autopilot engines are ready. Edit any input to generate live vector layouts.",
};

async function copyTextSafely(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function triggerSvgDownload(filename: string, svgText: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) {
    return false;
  }
  try {
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 웹툰 작가의 4대 창작 부담(빈 캔버스 · 군중 엑스트라 · 5-톤 음영 · 대본→말풍선)을
 * 1클릭으로 덜어 주는 Calm Atelier 작화 오토파일럿 패널.
 */
export function CreatorReliefAutopilotPanel({
  defaultTab = "composition",
  className,
  onExportJson,
  onExportSvg,
}: CreatorReliefAutopilotPanelProps) {
  const lang = useI18n((state) => state.lang);
  const locale: CreatorReliefLocale = lang.toLowerCase().startsWith("ko") ? "ko" : "en";
  const baseId = useId();

  const [activeTab, setActiveTab] = useState<CreatorReliefTabId>(defaultTab);
  const [statusLabel, setStatusLabel] = useState<BilingualLabel>(IDLE_STATUS);

  // ① 빈 컷 구도 추천 상태
  const [customDialogue, setCustomDialogue] = useState<string | null>(null);
  const [cutMood, setCutMood] = useState<CutMoodId>("shock");
  const [selectedCompIndex, setSelectedCompIndex] = useState<0 | 1 | 2>(0);

  // ② 원근 군중 상태
  const [crowdScene, setCrowdScene] = useState<CrowdSceneId>("cafe");
  const [crowdCount, setCrowdCount] = useState<number>(10);
  const [crowdHorizonPct, setCrowdHorizonPct] = useState<number>(44);
  const [crowdSeed, setCrowdSeed] = useState<number>(42);

  // ③ 5-톤 음영 팔레트 상태
  const [baseRgb, setBaseRgb] = useState<RgbColor>(CHARACTER_BASE_COLOR_PRESETS[0].rgb);
  const [lightingMood, setLightingMood] = useState<ShadingLightingMoodId>("warm-day");

  // ④ 대본→말풍선 상태
  const [customScript, setCustomScript] = useState<string | null>(null);

  const activeDialogue = customDialogue ?? pickLocaleText(DEFAULT_DIALOGUE, locale);
  const activeScript = customScript ?? pickLocaleText(DEFAULT_SCRIPT, locale);

  const compositionCards = useMemo(
    () => suggestCutCompositionsFromLine(activeDialogue, cutMood),
    [activeDialogue, cutMood],
  );
  const selectedComposition = compositionCards[selectedCompIndex];

  const crowdResult = useMemo(
    () =>
      generatePerspectiveCrowdSilhouettes({
        scene: crowdScene,
        count: crowdCount,
        horizonPct: crowdHorizonPct,
        seed: crowdSeed,
      }),
    [crowdScene, crowdCount, crowdHorizonPct, crowdSeed],
  );

  const shadingRamp = useMemo(
    () => deriveWebtoon5ToneShadingRamp(baseRgb, lightingMood),
    [baseRgb, lightingMood],
  );

  const balloonLayout = useMemo(() => autoLayoutScriptToBalloons(activeScript), [activeScript]);

  const currentExportBundle = useMemo(() => {
    if (activeTab === "composition") {
      return {
        filename: `cut-composition-${selectedComposition.id}.svg`,
        json: JSON.stringify(selectedComposition, null, 2),
        svg: buildCutCompositionSvg(selectedComposition),
      };
    }
    if (activeTab === "crowd") {
      return {
        filename: `perspective-crowd-${crowdResult.scene}-${crowdResult.count}.svg`,
        json: JSON.stringify(crowdResult, null, 2),
        svg: buildPerspectiveCrowdSvg(crowdResult),
      };
    }
    if (activeTab === "shading") {
      return {
        filename: `shading-ramp-${shadingRamp.lightingMood}.svg`,
        json: JSON.stringify(shadingRamp, null, 2),
        svg: buildShadingRampSvg(shadingRamp),
      };
    }
    return {
      filename: `script-balloons-${balloonLayout.totalBalloons}.svg`,
      json: JSON.stringify(balloonLayout, null, 2),
      svg: buildScriptBalloonsSvg(balloonLayout),
    };
  }, [activeTab, selectedComposition, crowdResult, shadingRamp, balloonLayout]);

  const handleCopyJson = useCallback(async () => {
    onExportJson?.(activeTab, currentExportBundle.json);
    const copied = await copyTextSafely(currentExportBundle.json);
    setStatusLabel(
      copied
        ? {
            ko: `${TAB_LABELS[activeTab].ko} JSON 데이터를 클립보드에 복사했습니다.`,
            en: `Copied ${TAB_LABELS[activeTab].en} JSON data to clipboard.`,
          }
        : {
            ko: `${TAB_LABELS[activeTab].ko} JSON 내보내기 페이로드를 준비했습니다.`,
            en: `Prepared ${TAB_LABELS[activeTab].en} JSON export payload.`,
          },
    );
  }, [activeTab, currentExportBundle.json, onExportJson]);

  const handleCopySvg = useCallback(async () => {
    onExportSvg?.(activeTab, currentExportBundle.svg);
    const copied = await copyTextSafely(currentExportBundle.svg);
    setStatusLabel(
      copied
        ? {
            ko: `${TAB_LABELS[activeTab].ko} SVG 벡터를 클립보드에 복사했습니다.`,
            en: `Copied ${TAB_LABELS[activeTab].en} SVG vector to clipboard.`,
          }
        : {
            ko: `${TAB_LABELS[activeTab].ko} SVG 벡터 내보내기를 준비했습니다.`,
            en: `Prepared ${TAB_LABELS[activeTab].en} SVG vector export.`,
          },
    );
  }, [activeTab, currentExportBundle.svg, onExportSvg]);

  const handleDownloadSvg = useCallback(() => {
    const saved = triggerSvgDownload(currentExportBundle.filename, currentExportBundle.svg);
    onExportSvg?.(activeTab, currentExportBundle.svg);
    setStatusLabel(
      saved
        ? {
            ko: `${currentExportBundle.filename} 파일을 저장했습니다.`,
            en: `Saved ${currentExportBundle.filename}.`,
          }
        : {
            ko: `${currentExportBundle.filename} SVG 직렬화를 완료했습니다.`,
            en: `Serialized ${currentExportBundle.filename} SVG.`,
          },
    );
  }, [activeTab, currentExportBundle.filename, currentExportBundle.svg, onExportSvg]);

  const handleCopySwatch = useCallback(async (stop: ShadingRampStop) => {
    const hex = formatRgbToHex(stop.rgb);
    const payload = `${hex} | rgb(${stop.rgb.r}, ${stop.rgb.g}, ${stop.rgb.b}) | oklch(${stop.oklch.l} ${stop.oklch.c} ${stop.oklch.h})`;
    const copied = await copyTextSafely(payload);
    setStatusLabel(
      copied
        ? {
            ko: `${stop.label.ko} (${hex}) 색상을 복사했습니다.`,
            en: `Copied ${stop.label.en} (${hex}).`,
          }
        : {
            ko: `${stop.label.ko} (${hex}) 색상 값을 선택했습니다.`,
            en: `Selected ${stop.label.en} (${hex}).`,
          },
    );
  }, []);

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (currentIndex + delta + TAB_ORDER.length) % TAB_ORDER.length;
      setActiveTab(TAB_ORDER[nextIndex]);
    },
    [],
  );

  const renderTabIcon = (tabId: CreatorReliefTabId) => {
    if (tabId === "composition") return <LayoutGrid size={15} aria-hidden="true" />;
    if (tabId === "crowd") return <Users size={15} aria-hidden="true" />;
    if (tabId === "shading") return <Palette size={15} aria-hidden="true" />;
    return <MessageSquareText size={15} aria-hidden="true" />;
  };

  return (
    <section
      className={className ? `cra-shell ${className}` : "cra-shell"}
      aria-labelledby={`${baseId}-title`}
      data-testid="creator-relief-autopilot-panel"
    >
      <div className="cra-body">
        <header className="cra-header">
          <div>
            <span className="cra-kicker">
              <Sparkles size={14} aria-hidden="true" />
              <span>
                {locale === "ko" ? "웹툰 마감 오토파일럿 · 4대 작화 자동화" : "Webtoon Relief Autopilot · 4 Drawing Engines"}
              </span>
            </span>
            <h2 id={`${baseId}-title`} className="cra-title">
              {locale === "ko" ? "작화 부담 덜기 오토파일럿" : "Creator Relief Autopilot"}
            </h2>
            <p className="cra-subtitle">
              {locale === "ko"
                ? "빈 캔버스 막힘·배경 군중·5-톤 음영·말풍선 분절을 1클릭으로 바로 정리합니다."
                : "Relieve blank-canvas block, crowd extras, 5-tone shading, and script-to-balloon layout in one click."}
            </p>
          </div>

          <div className="cra-export-actions">
            <button
              type="button"
              className="cra-btn"
              data-testid="cra-export-json"
              onClick={() => {
                void handleCopyJson();
              }}
            >
              <FileCode2 size={15} aria-hidden="true" />
              <span>{locale === "ko" ? "JSON 복사" : "Copy JSON"}</span>
            </button>
            <button
              type="button"
              className="cra-btn"
              data-testid="cra-export-svg-copy"
              onClick={() => {
                void handleCopySvg();
              }}
            >
              <Copy size={15} aria-hidden="true" />
              <span>{locale === "ko" ? "SVG 복사" : "Copy SVG"}</span>
            </button>
            <button
              type="button"
              className="cra-btn cra-btn-primary"
              data-testid="cra-export-svg-download"
              onClick={handleDownloadSvg}
            >
              <Download size={15} aria-hidden="true" />
              <span>{locale === "ko" ? "SVG 저장" : "Download SVG"}</span>
            </button>
          </div>
        </header>

        <div
          className="cra-tablist"
          role="tablist"
          aria-label={locale === "ko" ? "작화 오토파일럿 4대 도구" : "Four Creator Relief Tools"}
        >
          {TAB_ORDER.map((tabId, idx) => (
            <button
              key={tabId}
              id={`${baseId}-tab-${tabId}`}
              type="button"
              role="tab"
              className="cra-tab"
              data-testid={`cra-tab-${tabId}`}
              aria-selected={activeTab === tabId}
              aria-controls={`${baseId}-tabpanel-${tabId}`}
              tabIndex={activeTab === tabId ? 0 : -1}
              onClick={() => setActiveTab(tabId)}
              onKeyDown={(event) => handleTabKeyDown(event, idx)}
            >
              {renderTabIcon(tabId)}
              <span>{pickLocaleText(TAB_LABELS[tabId], locale)}</span>
            </button>
          ))}
        </div>

        <div
          id={`${baseId}-tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${activeTab}`}
        >
          {activeTab === "composition" ? (
            <CutCompositionTabView
              locale={locale}
              dialogue={activeDialogue}
              mood={cutMood}
              cards={compositionCards}
              selectedIndex={selectedCompIndex}
              onDialogueChange={setCustomDialogue}
              onMoodChange={setCutMood}
              onSelectIndex={setSelectedCompIndex}
            />
          ) : null}

          {activeTab === "crowd" ? (
            <PerspectiveCrowdTabView
              locale={locale}
              scene={crowdScene}
              count={crowdCount}
              horizonPct={crowdHorizonPct}
              seed={crowdSeed}
              result={crowdResult}
              onSceneChange={setCrowdScene}
              onCountChange={setCrowdCount}
              onHorizonChange={setCrowdHorizonPct}
              onReshuffleSeed={() => setCrowdSeed((prev) => prev + 7)}
            />
          ) : null}

          {activeTab === "shading" ? (
            <ShadingRampTabView
              locale={locale}
              baseRgb={baseRgb}
              lightingMood={lightingMood}
              ramp={shadingRamp}
              onBaseRgbChange={setBaseRgb}
              onLightingMoodChange={setLightingMood}
              onCopySwatch={(stop) => {
                void handleCopySwatch(stop);
              }}
            />
          ) : null}

          {activeTab === "script" ? (
            <ScriptBalloonsTabView
              locale={locale}
              rawScript={activeScript}
              layout={balloonLayout}
              onScriptChange={setCustomScript}
            />
          ) : null}
        </div>

        <div className="cra-status-bar" role="status" aria-live="polite" data-testid="cra-status-bar">
          <span>{pickLocaleText(statusLabel, locale)}</span>
          <span className="cra-label-muted cra-num">
            {currentExportBundle.filename}
          </span>
        </div>
      </div>
    </section>
  );
}

export default CreatorReliefAutopilotPanel;
