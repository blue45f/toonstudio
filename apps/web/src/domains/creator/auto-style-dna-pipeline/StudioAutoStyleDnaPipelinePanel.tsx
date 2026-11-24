/**
 * Wave 33 Track D 통합 스튜디오 패널:
 * 완전 자동화 로컬 스타일 DNA 화풍 유지 + 대본→3D 자동 스테이징 +
 * 다국어 말풍선 자동 조판·4권역 심의 린터 + WebCrypto AES-GCM 암호화 샌드박스 컨테이너.
 *
 * Calm Atelier 시맨틱 토큰 전용 (원시 색상 0건 · Web Storage 미사용 · 명시적 전이 속성만 사용 ·
 * 모든 props 선택형 · 800줄 이하 · KO/EN).
 */

import {
  AlertTriangle,
  Box,
  Camera,
  CheckCircle2,
  History,
  Languages,
  Layers,
  Lock,
  Palette,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  autoHarmonizeFrameToStyleDna,
  createSyntheticStyleFrame,
  detectStyleDrift,
  LocalStyleDnaLibrary,
  type StyleHarmonizationResult,
  type SyntheticStylePresetId,
} from "./auto-style-dna-library";
import {
  DEMO_MULTILINGUAL_DIALOGUES,
  detectCrossBrowserCryptoCapabilities,
  lintGlobalContentRating,
  SandboxedVfsContainer,
  typesetBalloonAcrossLanguages,
  type BalloonGeometryShape,
  type EpisodeRatingAuditInput,
  type RatingTargetTier,
} from "./global-balloon-rating-linter";
import {
  DEMO_WEBTOON_SCRIPTS,
  generateEpisode3dStagingPlan,
  type Episode3dStagingPlan,
} from "./script-to-3d-staging-engine";

export type AutoStyleDnaPipelineTabId = "style-dna" | "script-3d" | "balloon-rating" | "crypto-vfs";
export type RatingScenarioPresetId = "safe-daily" | "action-blood" | "gamble-strobe";

export interface CryptoRoundtripVerificationReport {
  readonly sealedBytes: number;
  readonly entryCount: number;
  readonly losslessVerified: boolean;
  readonly tamperRejected: boolean;
  readonly algorithm: string;
  readonly kdf: string;
  readonly errorMessage: string | null;
}

export interface StudioAutoStyleDnaPipelinePanelProps {
  readonly initialTab?: AutoStyleDnaPipelineTabId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialStylePreset?: SyntheticStylePresetId;
  readonly initialScriptText?: string;
  readonly onHarmonizeComplete?: (result: StyleHarmonizationResult) => void;
  readonly onStagingGenerated?: (plan: Episode3dStagingPlan) => void;
  readonly onCryptoVerified?: (report: CryptoRoundtripVerificationReport) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_CHOICE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

const TABS: readonly { readonly id: AutoStyleDnaPipelineTabId; readonly ko: string; readonly en: string }[] = [
  { id: "style-dna", ko: "자동 화풍 DNA", en: "Auto Style DNA" },
  { id: "script-3d", ko: "대본→3D 스테이징", en: "Script → 3D Staging" },
  { id: "balloon-rating", ko: "다국어 조판·심의", en: "Balloon & 4-Region Lint" },
  { id: "crypto-vfs", ko: "AES-GCM 샌드박스", en: "AES-GCM Sandbox" },
];

const RATING_SCENARIOS: Readonly<Record<RatingScenarioPresetId, Omit<EpisodeRatingAuditInput, "targetTier">>> = {
  "safe-daily": {
    episodeTitle: "EP.01 아틀리에의 오후",
    dialogues: [
      { language: "ko", text: "오늘 노을이 정말 예쁘다. 같이 커피 마실래?" },
      { language: "en", text: "The sunset looks calm today. Want to grab coffee?" },
    ],
    bloodLevel: 0,
    weaponProminence: 0,
    nudityExposure: 0,
    substanceUse: "none",
    gamblingDepiction: false,
    selfHarmTheme: false,
    flashingStrobeHz: 0,
  },
  "action-blood": {
    episodeTitle: "EP.12 옥상 추격전",
    dialogues: [
      { language: "ko", text: "젠장, 여기서 물러설 순 없어!" },
      { language: "en", text: "Damn, we cannot back down now!" },
    ],
    bloodLevel: 2,
    weaponProminence: 2,
    nudityExposure: 0,
    substanceUse: "none",
    gamblingDepiction: false,
    selfHarmTheme: false,
    flashingStrobeHz: 2,
  },
  "gamble-strobe": {
    episodeTitle: "EP.19 지하 네온 카지노",
    dialogues: [
      { language: "ko", text: "모든 판돈을 걸고 점멸등 속으로 뛰어든다." },
      { language: "en", text: "All chips on the table under strobing neon lights." },
    ],
    bloodLevel: 1,
    weaponProminence: 1,
    nudityExposure: 0,
    substanceUse: "smoking",
    gamblingDepiction: true,
    selfHarmTheme: false,
    flashingStrobeHz: 6,
  },
};

function buildInitialDnaLibrary(preset: SyntheticStylePresetId, extraIngests: number): LocalStyleDnaLibrary {
  const lib = new LocalStyleDnaLibrary();
  const seriesId = `series-${preset}`;
  const title = preset === "cool-noir-atelier" ? "자정의 아틀리에" : "노을빛 로맨스";
  lib.ingestCompletedFrame(
    seriesId,
    createSyntheticStyleFrame({ frameId: "ep01-cut01", episodeId: "ep-01", preset, variant: "master" }),
    { seriesTitle: title, artistName: "Studio Creator", note: "EP.01 기준 컷 자동 추출" },
  );
  for (let i = 0; i < extraIngests; i += 1) {
    lib.ingestCompletedFrame(
      seriesId,
      createSyntheticStyleFrame({
        frameId: `ep0${i + 2}-cut04`,
        episodeId: `ep-0${i + 2}`,
        preset,
        variant: i % 2 === 0 ? "aligned" : "master",
      }),
      { seriesTitle: title, artistName: "Studio Creator", note: `EP.0${i + 2} 완성 컷 자동 병합` },
    );
  }
  return lib;
}

/** 완전 자동화 로컬 스타일 DNA · 대본→3D 스테이징 · 다국어 조판·심의 · AES-GCM 샌드박스 스튜디오 패널. */
export function StudioAutoStyleDnaPipelinePanel({
  initialTab = "style-dna",
  locale,
  className,
  initialStylePreset = "cool-noir-atelier",
  initialScriptText,
  onHarmonizeComplete,
  onStagingGenerated,
  onCryptoVerified,
}: StudioAutoStyleDnaPipelinePanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<AutoStyleDnaPipelineTabId>(initialTab);
  const [stylePreset, setStylePreset] = useState<SyntheticStylePresetId>(initialStylePreset);
  const [extraIngests, setExtraIngests] = useState<number>(1);
  const [candidateVariant, setCandidateVariant] = useState<"drifted" | "aligned">("drifted");
  const [harmonizeStrength, setHarmonizeStrength] = useState<number>(0.92);
  const [harmonizeResult, setHarmonizeResult] = useState<StyleHarmonizationResult | null>(null);

  const [scriptText, setScriptText] = useState<string>(
    initialScriptText ?? DEMO_WEBTOON_SCRIPTS[0]?.scriptText ?? "",
  );
  const [selectedSceneIdx, setSelectedSceneIdx] = useState<number>(0);

  const [balloonShape, setBalloonShape] = useState<BalloonGeometryShape>("ellipse");
  const [balloonWidthPx, setBalloonWidthPx] = useState<number>(220);
  const [ratingTarget, setRatingTarget] = useState<RatingTargetTier>("12+");
  const [ratingScenario, setRatingScenario] = useState<RatingScenarioPresetId>("action-blood");

  const [vaultPassphrase, setVaultPassphrase] = useState<string>("atelier-dna-vault-2026");
  const [cryptoBusy, setCryptoBusy] = useState<boolean>(false);
  const [cryptoReport, setCryptoReport] = useState<CryptoRoundtripVerificationReport | null>(null);

  const seriesId = `series-${stylePreset}`;
  const dnaLibrary = useMemo(() => buildInitialDnaLibrary(stylePreset, extraIngests), [stylePreset, extraIngests]);
  const activeDna = useMemo(() => dnaLibrary.getLatestDna(seriesId), [dnaLibrary, seriesId]);
  const dnaHistory = useMemo(() => dnaLibrary.getVersionHistory(seriesId), [dnaLibrary, seriesId]);

  const candidateFrame = useMemo(
    () =>
      createSyntheticStyleFrame({
        frameId: candidateVariant === "drifted" ? "ep04-cut09-draft" : "ep04-cut09-aligned",
        episodeId: "ep-04",
        preset: stylePreset,
        variant: candidateVariant,
      }),
    [candidateVariant, stylePreset],
  );

  const liveDrift = useMemo(
    () => (activeDna ? detectStyleDrift(activeDna, candidateFrame) : null),
    [activeDna, candidateFrame],
  );

  const stagingPlan = useMemo(() => generateEpisode3dStagingPlan(scriptText), [scriptText]);
  const activeBlueprint = stagingPlan.blueprints[Math.min(selectedSceneIdx, Math.max(0, stagingPlan.blueprints.length - 1))];

  const balloonLayouts = useMemo(
    () =>
      typesetBalloonAcrossLanguages(DEMO_MULTILINGUAL_DIALOGUES, {
        shape: balloonShape,
        widthPx: balloonWidthPx,
        heightPx: 152,
        paddingPx: 14,
      }),
    [balloonShape, balloonWidthPx],
  );

  const ratingReport = useMemo(
    () => lintGlobalContentRating({ ...RATING_SCENARIOS[ratingScenario], targetTier: ratingTarget }),
    [ratingScenario, ratingTarget],
  );

  const cryptoCaps = useMemo(() => detectCrossBrowserCryptoCapabilities(), []);

  const handleSwitchPreset = (next: SyntheticStylePresetId): void => {
    setStylePreset(next);
    setHarmonizeResult(null);
  };

  const handleIngestNextCut = (): void => {
    setExtraIngests((prev) => Math.min(prev + 1, 6));
    setHarmonizeResult(null);
  };

  const handleAutoHarmonize = (): void => {
    if (!activeDna) return;
    const result = autoHarmonizeFrameToStyleDna(activeDna, candidateFrame, { strength: harmonizeStrength });
    setHarmonizeResult(result);
    onHarmonizeComplete?.(result);
  };

  const handleSelectDemoScript = (nextText: string): void => {
    setScriptText(nextText);
    setSelectedSceneIdx(0);
    onStagingGenerated?.(generateEpisode3dStagingPlan(nextText));
  };

  const handleVerifyCryptoContainer = async (): Promise<void> => {
    setCryptoBusy(true);
    try {
      const safePass = vaultPassphrase.trim().length >= 4 ? vaultPassphrase.trim() : "atelier-dna-vault-2026";
      const container = await SandboxedVfsContainer.create({ passphrase: safePass, pbkdf2Iterations: 4000 });
      const dnaJson = dnaLibrary.exportSnapshotJson();
      const blueprintJson = JSON.stringify(stagingPlan);
      await container.writeEntry("dna/series-style-dna.json", dnaJson, "application/json");
      await container.writeEntry("staging/episode-3d-blueprint.json", blueprintJson, "application/json");
      await container.writeEntry("scripts/current-episode.txt", scriptText, "text/plain");

      const sealed = await container.exportEncryptedArchive(safePass);
      const restored = await SandboxedVfsContainer.importEncryptedArchive(sealed, safePass);
      const restoredDna = new TextDecoder().decode(await restored.readEntry("dna/series-style-dna.json"));
      const restoredScript = new TextDecoder().decode(await restored.readEntry("scripts/current-episode.txt"));
      const losslessVerified = restoredDna === dnaJson && restoredScript === scriptText;

      // 1비트 변조 탐지 검증
      const tampered = new Uint8Array(sealed);
      const flipPos = tampered.byteLength - 1;
      tampered[flipPos] = (tampered[flipPos] ?? 0) ^ 0x01;
      let tamperRejected = false;
      try {
        await SandboxedVfsContainer.importEncryptedArchive(tampered, safePass);
      } catch {
        tamperRejected = true;
      }

      const stats = await restored.getStats();
      const report: CryptoRoundtripVerificationReport = {
        sealedBytes: sealed.byteLength,
        entryCount: stats.entryCount,
        losslessVerified,
        tamperRejected,
        algorithm: stats.algorithm,
        kdf: stats.kdf,
        errorMessage: null,
      };
      setCryptoReport(report);
      onCryptoVerified?.(report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AES-GCM verification failed";
      const report: CryptoRoundtripVerificationReport = {
        sealedBytes: 0,
        entryCount: 0,
        losslessVerified: false,
        tamperRejected: false,
        algorithm: "AES-256-GCM",
        kdf: "PBKDF2-SHA-256",
        errorMessage: msg,
      };
      setCryptoReport(report);
      onCryptoVerified?.(report);
    } finally {
      setCryptoBusy(false);
    }
  };

  return (
    <section
      aria-label={pick("자동 화풍 DNA · 대본 3D 스테이징 · 다국어 조판·심의 · 암호화 컨테이너 패널", "Auto Style DNA, Script-to-3D, Global Balloon & Crypto Sandbox Panel")}
      className={`flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <Palette className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("로컬 자동 화풍 DNA · 대본→3D · 5개국어 조판·심의 · AES-GCM", "Auto Style DNA · Script-to-3D · 5-Lang Balloon · AES-GCM")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">{pick("자동 화풍 유지 · 대본 3D 스테이징 · 글로벌 심의 파이프라인", "Automated Style DNA, Script-to-3D & Global Compliance Pipeline")}</h2>
          <p className="text-xs text-fg-2">
            {pick(
              "완성 컷에서 화풍 DNA를 자동 추출·버전 관리하고 새 컷 이탈을 원클릭 보정하며, 대본 3D 배치·다국어 말풍선·4권역 심의·AES-GCM 봉인을 로컬에서 끝까지 검증합니다.",
              "Auto-extract artist Style DNA from RGBA cuts, harmonize drift in one click, stage 3D sets from scripts, typeset 5-language balloons, lint 4 regions, and seal in AES-GCM.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold tabular-nums">
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">
            {activeDna ? `DNA v${activeDna.version}` : "DNA v0"}
          </span>
          <span className={`rounded-full px-2.5 py-1 ${ratingReport.allRegionsCompliant ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
            {ratingReport.allRegionsCompliant ? pick("4권역 통과", "4 Regions Pass") : pick(`${ratingReport.strictestRegion} 주의`, `${ratingReport.strictestRegion} Review`)}
          </span>
        </div>
      </header>

      <div role="tablist" aria-label={pick("자동 화풍 및 글로벌 파이프라인 탭", "Auto style and global pipeline tabs")} className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`${uid}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${uid}-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`${BTN_CHOICE} ${activeTab === tab.id ? BTN_ACTIVE : BTN_IDLE}`}
          >
            {pick(tab.ko, tab.en)}
          </button>
        ))}
      </div>

      {activeTab === "style-dna" && activeDna && liveDrift ? (
        <div id={`${uid}-panel-style-dna`} role="tabpanel" aria-labelledby={`${uid}-tab-style-dna`} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => handleSwitchPreset("cool-noir-atelier")} className={`${BTN_CHOICE} ${stylePreset === "cool-noir-atelier" ? BTN_ACTIVE : BTN_IDLE}`}>
                {pick("쿨 느와르 화풍", "Cool Noir Atelier")}
              </button>
              <button type="button" onClick={() => handleSwitchPreset("sunset-romance-pastel")} className={`${BTN_CHOICE} ${stylePreset === "sunset-romance-pastel" ? BTN_ACTIVE : BTN_IDLE}`}>
                {pick("노을 로맨스 화풍", "Sunset Romance")}
              </button>
            </div>
            <button type="button" onClick={handleIngestNextCut} className={`${BTN_CHOICE} ${BTN_IDLE}`}>
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              {pick(`완성 컷 추가 학습 (v${activeDna.version} → v${activeDna.version + 1})`, `Ingest Completed Cut (v${activeDna.version} → v${activeDna.version + 1})`)}
            </button>
          </div>

          <div data-testid="style-dna-metrics-grid" className="grid gap-2.5 rounded-xl border border-line bg-card p-3 sm:grid-cols-4 tabular-nums">
            <div>
              <p className="text-[11px] text-fg-3">{pick("선화 굵기 (평균 / p10~p90)", "Linework (Mean / p10–90)")}</p>
              <p className="text-sm font-bold text-fg">{activeDna.linework.meanPx.toFixed(2)}px ({activeDna.linework.p10Px.toFixed(1)}–{activeDna.linework.p90Px.toFixed(1)})</p>
            </div>
            <div>
              <p className="text-[11px] text-fg-3">{pick("그림자 색온도 · Hue", "Shadow Temp · Hue")}</p>
              <p className="text-sm font-bold text-fg">{activeDna.shadowTemperature.estimatedKelvin}K · {activeDna.shadowTemperature.meanHueDeg.toFixed(0)}°</p>
            </div>
            <div>
              <p className="text-[11px] text-fg-3">{pick("명암 레인지 · 톤 단계", "Contrast Range · Steps")}</p>
              <p className="text-sm font-bold text-fg">{(activeDna.contrast.dynamicRange * 100).toFixed(0)}% · {activeDna.contrast.detectedToneSteps}단계</p>
            </div>
            <div>
              <p className="text-[11px] text-fg-3">{pick("스크린톤 밀도 · 패턴", "Screentone · Pattern")}</p>
              <p className="text-sm font-bold text-fg">{(activeDna.screentone.coverageRatio * 100).toFixed(1)}% · {activeDna.screentone.patternKind}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas p-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-fg-2">{pick(`자동 추출 OKLCH 주조 팔레트 (${dnaHistory.length}개 버전 누적)`, `Auto-Extracted OKLCH Palette (${dnaHistory.length} version(s))`)}</p>
              <div className="flex flex-wrap items-center gap-2">
                {activeDna.dominantPalette.map((swatch, idx) => (
                  <div key={`${swatch.role}-${idx}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1 text-[11px] tabular-nums">
                    <span className="h-3.5 w-3.5 rounded-sm border border-line" style={{ backgroundColor: swatch.cssOklch }} aria-hidden="true" />
                    <span className="font-semibold text-fg">{swatch.role}</span>
                    <span className="text-fg-3">{Math.round(swatch.share * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => { setCandidateVariant("drifted"); setHarmonizeResult(null); }} className={`${BTN_CHOICE} ${candidateVariant === "drifted" ? BTN_ACTIVE : BTN_IDLE}`}>
                {pick("이탈 컷 (EP.04)", "Drifted Cut (EP.04)")}
              </button>
              <button type="button" onClick={() => { setCandidateVariant("aligned"); setHarmonizeResult(null); }} className={`${BTN_CHOICE} ${candidateVariant === "aligned" ? BTN_ACTIVE : BTN_IDLE}`}>
                {pick("일치 컷", "Aligned Cut")}
              </button>
            </div>
          </div>

          <div data-testid="style-drift-card" className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("실시간 화풍 이탈 감지 & 원클릭 자동 보정", "Live Style Drift Monitor & One-Click Harmonize")}
              </h3>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${liveDrift.severity === "aligned" ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
                {pick(`일치도 ${liveDrift.consistencyScore}점 · ΔE ${liveDrift.paletteDeltaE.toFixed(1)}`, `Score ${liveDrift.consistencyScore}/100 · ΔE ${liveDrift.paletteDeltaE.toFixed(1)}`)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label htmlFor={`${uid}-strength`} className="font-semibold text-fg-2">
                {pick(`보정 강도 ${Math.round(harmonizeStrength * 100)}%`, `Strength ${Math.round(harmonizeStrength * 100)}%`)}
              </label>
              <input
                id={`${uid}-strength`}
                type="range"
                min={30}
                max={100}
                step={5}
                value={Math.round(harmonizeStrength * 100)}
                onChange={(e) => setHarmonizeStrength(Number(e.target.value) / 100)}
                className="w-36 accent-accent"
              />
              <button type="button" onClick={handleAutoHarmonize} className={BTN_PRIMARY}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {pick("원클릭 자동 화풍 보정 실행", "Run One-Click Auto Harmonize")}
              </button>
            </div>

            {harmonizeResult ? (
              <div data-testid="harmonize-result-banner" role="status" aria-live="polite" className="grid gap-2 rounded-lg border border-good bg-good-soft p-2.5 text-xs text-fg sm:grid-cols-3 tabular-nums">
                <div><span className="text-fg-2">{pick("팔레트 ΔE 변화", "Palette ΔE")}</span><p className="font-bold text-good">{harmonizeResult.beforeDrift.paletteDeltaE.toFixed(1)} → {harmonizeResult.afterDrift.paletteDeltaE.toFixed(1)}</p></div>
                <div><span className="text-fg-2">{pick("그림자 ΔE 변화", "Shadow ΔE")}</span><p className="font-bold text-good">{harmonizeResult.beforeDrift.shadowDeltaE.toFixed(1)} → {harmonizeResult.afterDrift.shadowDeltaE.toFixed(1)}</p></div>
                <div><span className="text-fg-2">{pick("화풍 일치도 상승", "Consistency Gain")}</span><p className="font-bold text-good">{harmonizeResult.beforeDrift.consistencyScore} → {harmonizeResult.afterDrift.consistencyScore} (+{harmonizeResult.scoreImprovement})</p></div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === "script-3d" && activeBlueprint ? (
        <div id={`${uid}-panel-script-3d`} role="tabpanel" aria-labelledby={`${uid}-tab-script-3d`} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {DEMO_WEBTOON_SCRIPTS.map((sample) => (
              <button key={sample.id} type="button" onClick={() => handleSelectDemoScript(sample.scriptText)} className={`${BTN_CHOICE} ${scriptText === sample.scriptText ? BTN_ACTIVE : BTN_IDLE}`}>
                {pick(sample.titleKo, sample.titleEn)}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 rounded-xl border border-line bg-card p-3">
            <label htmlFor={`${uid}-script-input`} className="text-xs font-semibold text-fg">
              {pick("웹툰 대본 입력 (한국어/영어 자동 인식)", "Webtoon Script Input (KO / EN Auto-Detect)")}
            </label>
            <textarea
              id={`${uid}-script-input`}
              rows={3}
              value={scriptText}
              onChange={(e) => { setScriptText(e.target.value); setSelectedSceneIdx(0); }}
              className={`w-full rounded-lg border border-line bg-canvas p-2.5 text-xs text-fg ${FOCUS_RING}`}
            />
            {stagingPlan.blueprints.length > 1 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {stagingPlan.blueprints.map((bp, idx) => (
                  <button key={bp.parsed.sceneCode} type="button" onClick={() => setSelectedSceneIdx(idx)} className={`${BTN_CHOICE} ${idx === selectedSceneIdx ? BTN_ACTIVE : BTN_IDLE}`}>
                    {bp.parsed.sceneCode} · {pick(bp.backgroundPreset.labelKo, bp.backgroundPreset.labelEn)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div data-testid="staging-blueprint-summary" className="grid gap-2.5 rounded-xl border border-line bg-card p-3 sm:grid-cols-4 tabular-nums">
            <div><p className="text-[11px] text-fg-3">{pick("3D 배경 프리셋", "3D Backdrop Preset")}</p><p className="text-xs font-bold text-fg">{pick(activeBlueprint.backgroundPreset.labelKo, activeBlueprint.backgroundPreset.labelEn)}</p><p className="text-[11px] text-fg-3">{activeBlueprint.backgroundPreset.presetId}</p></div>
            <div><p className="text-[11px] text-fg-3">{pick("카메라 화각 (24~85mm)", "Camera Lens (24–85mm)")}</p><p className="text-sm font-bold text-accent">{activeBlueprint.camera.focalLengthMm}mm · FOV {activeBlueprint.camera.verticalFovDeg.toFixed(1)}°</p><p className="text-[11px] text-fg-3">{activeBlueprint.camera.shotScale}</p></div>
            <div><p className="text-[11px] text-fg-3">{pick("조명 색온도 (Key/Rim)", "Lighting Kelvin")}</p><p className="text-sm font-bold text-fg">{activeBlueprint.lighting.keyLightKelvin}K / {activeBlueprint.lighting.rimLightKelvin}K</p><p className="text-[11px] text-fg-3">{activeBlueprint.parsed.timeOfDay} · {activeBlueprint.parsed.emotion}</p></div>
            <div><p className="text-[11px] text-fg-3">{pick("배치 인물 · 충돌 검증", "Actors · Collisions")}</p><p className="text-sm font-bold text-good">{activeBlueprint.characters.length}{pick("인 · 겹침 ", " · Overlaps ")}{activeBlueprint.validation.overlapCount}</p><p className="text-[11px] text-fg-3">{pick(activeBlueprint.validation.allPropsGrounded ? "Y=0 바닥 접지 완료" : "접지 확인", activeBlueprint.validation.allPropsGrounded ? "Y=0 Grounded" : "Check Ground")}</p></div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {activeBlueprint.props.slice(0, 6).map((prop) => (
              <div key={prop.propId} className="flex items-center justify-between rounded-lg border border-line bg-canvas px-3 py-2 text-xs tabular-nums">
                <div className="inline-flex items-center gap-1.5">
                  <Box className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span className="font-semibold text-fg">{pick(prop.labelKo, prop.labelEn)}</span>
                  <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] text-fg-3">{prop.source === "script-triggered" ? pick("대본 소품", "Script") : pick("필수", "Preset")}</span>
                </div>
                <span className="text-[11px] text-fg-2">({prop.position[0]}, {prop.position[1]}, {prop.position[2]})m</span>
              </div>
            ))}
          </div>
          <p className="inline-flex items-center gap-1.5 text-xs text-fg-2">
            <Camera className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick(activeBlueprint.camera.framingNoteKo, activeBlueprint.camera.framingNoteEn)}
          </p>
        </div>
      ) : null}

      {activeTab === "balloon-rating" ? (
        <div id={`${uid}-panel-balloon-rating`} role="tabpanel" aria-labelledby={`${uid}-tab-balloon-rating`} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap gap-1.5">
              {(["ellipse", "rounded-rect", "shout-burst"] as const).map((shape) => (
                <button key={shape} type="button" onClick={() => setBalloonShape(shape)} className={`${BTN_CHOICE} ${balloonShape === shape ? BTN_ACTIVE : BTN_IDLE}`}>
                  <Languages className="h-3.5 w-3.5" aria-hidden="true" />
                  {shape}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs tabular-nums">
              <label htmlFor={`${uid}-balloon-width`} className="font-semibold text-fg-2">{pick(`말풍선 폭 ${balloonWidthPx}px`, `Width ${balloonWidthPx}px`)}</label>
              <input id={`${uid}-balloon-width`} type="range" min={160} max={320} step={10} value={balloonWidthPx} onChange={(e) => setBalloonWidthPx(Number(e.target.value))} className="w-28 accent-accent" />
            </div>
          </div>

          <div data-testid="multilingual-balloon-grid" className="grid gap-2 sm:grid-cols-5 tabular-nums">
            {balloonLayouts.map((layout) => (
              <div key={layout.language} className="space-y-1 rounded-xl border border-line bg-canvas p-2.5 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span className="uppercase text-accent">{layout.language}</span>
                  <span className={layout.overflow ? "text-bad" : "text-good"}>{layout.optimalFontSizePx.toFixed(1)}px</span>
                </div>
                <p className="text-[11px] text-fg-3">{layout.lines.length}{pick("줄 · 점유 ", " lines · ")}{Math.round(layout.areaFillRatio * 100)}%</p>
                <p className="line-clamp-3 text-[11px] leading-snug text-fg-2">{layout.lines.map((l) => l.text).join(" / ")}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("4개 권역(KR·JP·US·EU) 등급 심의 사전 린터", "4-Region (KR·JP·US·EU) Pre-Release Rating Linter")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "12+", "15+", "18+"] as const).map((tier) => (
                  <button key={tier} type="button" onClick={() => setRatingTarget(tier)} className={`${BTN_CHOICE} ${ratingTarget === tier ? BTN_ACTIVE : BTN_IDLE}`}>{tier}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                { id: "safe-daily", ko: "안전 일상 회차", en: "Safe Daily" },
                { id: "action-blood", ko: "액션·혈흔 회차", en: "Action & Blood" },
                { id: "gamble-strobe", ko: "도박·흡연·6Hz 점멸", en: "Gambling & 6Hz Strobe" },
              ] as const).map((sc) => (
                <button key={sc.id} type="button" onClick={() => setRatingScenario(sc.id)} className={`${BTN_CHOICE} ${ratingScenario === sc.id ? BTN_ACTIVE : BTN_IDLE}`}>
                  {pick(sc.ko, sc.en)}
                </button>
              ))}
            </div>
            <div data-testid="global-rating-grid" className="grid gap-2 sm:grid-cols-4">
              {ratingReport.assessments.map((item) => (
                <div key={item.region} className="space-y-1 rounded-lg border border-line bg-canvas p-2.5 text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-fg">{item.region}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${item.compliant ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
                      {item.compliant ? pick("적합", "PASS") : pick("보정필요", "BLOCK")}
                    </span>
                  </div>
                  <p className="font-semibold text-accent">{item.computedLabel}</p>
                  <p className="text-[11px] text-fg-2">
                    {item.findings[0] ? pick(item.findings[0].messageKo, item.findings[0].messageEn) : pick("지적 사항 없음", "No issues found")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "crypto-vfs" ? (
        <div id={`${uid}-panel-crypto-vfs`} role="tabpanel" aria-labelledby={`${uid}-tab-crypto-vfs`} className="space-y-3">
          <div className="grid gap-2.5 rounded-xl border border-line bg-card p-3 sm:grid-cols-3 text-xs tabular-nums">
            <div><p className="text-[11px] text-fg-3">{pick("암호화 엔진", "Cipher Engine")}</p><p className="font-bold text-fg">WebCrypto AES-256-GCM · PBKDF2</p></div>
            <div><p className="text-[11px] text-fg-3">{pick("Web Storage 격리", "Storage Isolation")}</p><p className="font-bold text-good">{pick("Web Storage 미사용 · 샌드박스 VFS", "Zero Web Storage · Sandboxed VFS")}</p></div>
            <div><p className="text-[11px] text-fg-3">{pick("런타임 WebCrypto", "Runtime WebCrypto")}</p><p className="font-bold text-fg">{cryptoCaps.hasWebCryptoSubtle ? "SubtleCrypto Ready" : "Unavailable"}</p></div>
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-card p-3">
            <div className="flex-1 space-y-1">
              <label htmlFor={`${uid}-vault-pass`} className="text-xs font-semibold text-fg">
                {pick("로컬 컨테이너 암호문 (AES-256-GCM 키 파생)", "Local Container Passphrase (AES-256-GCM)")}
              </label>
              <input
                id={`${uid}-vault-pass`}
                type="password"
                value={vaultPassphrase}
                onChange={(e) => setVaultPassphrase(e.target.value)}
                className={`w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg ${FOCUS_RING}`}
              />
            </div>
            <button type="button" disabled={cryptoBusy} onClick={() => { void handleVerifyCryptoContainer(); }} className={BTN_PRIMARY}>
              <Lock className="h-4 w-4" aria-hidden="true" />
              {cryptoBusy ? pick("암호화 검증 중...", "Verifying...") : pick("AES-GCM 봉인 · 무손실 왕복 검증", "Seal AES-GCM & Verify Roundtrip")}
            </button>
          </div>

          {cryptoReport ? (
            <div data-testid="crypto-vfs-report" role="status" aria-live="polite" className={`space-y-2 rounded-xl border p-3 text-xs tabular-nums ${cryptoReport.losslessVerified && cryptoReport.tamperRejected ? "border-good bg-good-soft" : "border-bad bg-bad-soft"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-fg">
                <span className="inline-flex items-center gap-1.5">
                  {cryptoReport.losslessVerified && cryptoReport.tamperRejected ? (
                    <CheckCircle2 className="h-4 w-4 text-good" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-bad" aria-hidden="true" />
                  )}
                  {cryptoReport.losslessVerified && cryptoReport.tamperRejected
                    ? pick("AES-256-GCM 무손실 왕복 · 1비트 변조 탐지 모두 통과", "AES-256-GCM Lossless Roundtrip & Tamper Rejection Passed")
                    : cryptoReport.errorMessage ?? pick("검증 실패", "Verification Failed")}
                </span>
                <span className="inline-flex items-center gap-1 text-fg-2">
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  {cryptoReport.entryCount} files · {cryptoReport.sealedBytes} B
                </span>
              </div>
              <p className="text-[11px] text-fg-2">
                {`${cryptoReport.algorithm} / ${cryptoReport.kdf} · lossless=${String(cryptoReport.losslessVerified)} · tamperRejected=${String(cryptoReport.tamperRejected)}`}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
