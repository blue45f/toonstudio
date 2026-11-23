/**
 * Wave 26B — 스펙트럼 실드·유출 역추적 DMCA·3초 모션 포스터 · 2nd-Screen QR 무선 보조화면 ·
 * CP 50작품 Fleet QA 레이더 & 독자 반응 히트맵 통합 패널.
 * Calm Atelier 시맨틱 토큰 전용 · 460줄 이하 · 원시 색상 미사용 · 명시적 transition 속성만 사용 · 모든 props 선택형 · KO/EN.
 */

import {
  Activity, AlertTriangle, CheckCircle2, Film, Flame, Layers, QrCode, Radar, RotateCw, ShieldCheck, Smartphone, Sparkles,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  correlateReaderReactionToCuts, createDemoReaderReactionEpisode, createDemoStudioFleet50Series,
  evaluateStudioFleetQaRadar,
  type CorrelateReaderHeatmapInput, type EvaluateFleetQaRadarInput, type FleetRiskTier, type HeatmapSemanticTone,
} from "./fleet-qa-radar-and-reader-heatmap";
import {
  applyAdversarialSpectralShield, buildDmcaTakedownPackage, buildMotionPosterLoopPlan,
  createDemoArtworkBuffer, createDemoLeakTraceMetadata, createSecondScreenCompanionSession,
  dispatchCompanionCommand, embedLeakTraceForensicPayload, extractLeakTraceForensicPayload,
  type CompanionCommandDispatchResult, type DmcaTakedownPackage, type RgbaImageBuffer,
  type SecondScreenCompanionSession, type SpectralShieldStrength,
} from "./spectral-shield-motion-companion";

export type StudioFleetShieldTabId = "shield-motion" | "companion-qr" | "fleet-heatmap";
type FleetFilterId = "all" | "critical" | "rights-30d" | "overload";

export interface StudioFleetShieldPanelProps {
  readonly initialTab?: StudioFleetShieldTabId; readonly locale?: "ko" | "en"; readonly className?: string;
  readonly artworkBuffer?: RgbaImageBuffer; readonly fleetInput?: EvaluateFleetQaRadarInput;
  readonly heatmapInput?: CorrelateReaderHeatmapInput;
  readonly onDmcaGenerated?: (pkg: DmcaTakedownPackage) => void;
  readonly onCompanionCommand?: (result: CompanionCommandDispatchResult) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_CHOICE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const TAB_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const TABS: readonly { readonly id: StudioFleetShieldTabId; readonly ko: string; readonly en: string }[] = [
  { id: "shield-motion", ko: "스펙트럼 실드 · 유출 역추적 · 모션 포스터", en: "Spectral Shield · Leak Trace · Motion Poster" },
  { id: "companion-qr", ko: "2nd-Screen QR 보조화면", en: "2nd-Screen QR Companion" },
  { id: "fleet-heatmap", ko: "CP 50작품 Fleet 레이더 · 독자 히트맵", en: "CP 50-Series Fleet Radar · Reader Heatmap" },
];
const STRENGTHS: readonly { readonly id: SpectralShieldStrength; readonly ko: string; readonly en: string }[] = [
  { id: "subtle", ko: "약함 (42dB+)", en: "Subtle (42dB+)" },
  { id: "balanced", ko: "균형 (39dB+)", en: "Balanced (39dB+)" },
  { id: "maximum", ko: "최대 (38dB+)", en: "Maximum (38dB+)" },
];
const RECIPIENTS: readonly string[] = ["NAVER-KR-DESK", "PARTNER-JP-04", "PRESS-EMB-01"];
const COLOR_PRESETS: readonly { readonly ko: string; readonly en: string; readonly hue: number; readonly chroma: number; readonly lightness: number }[] = [
  { ko: "테라코타 잉크", en: "Terracotta Ink", hue: 28, chroma: 0.15, lightness: 0.61 },
  { ko: "미드나잇 코발트", en: "Midnight Cobalt", hue: 252, chroma: 0.14, lightness: 0.48 },
  { ko: "세이지 섀도우", en: "Sage Shadow", hue: 148, chroma: 0.1, lightness: 0.56 },
];
const TIER_CLS: Record<FleetRiskTier, string> = {
  critical: "border-bad/40 bg-bad-soft text-bad", high: "border-warn/40 bg-warning-soft text-warn",
  watch: "border-line-strong bg-raised text-fg-2", healthy: "border-good/40 bg-good-soft text-good",
};
const HEAT_CLS: Record<HeatmapSemanticTone, string> = {
  good: "border-good/40 bg-good-soft text-good", accent: "border-line bg-canvas text-fg-2",
  warn: "border-warn/40 bg-warning-soft text-warn", bad: "border-bad/40 bg-bad-soft text-bad",
};

function MetricTile({ label, value, testId, tone = "default" }: {
  readonly label: string; readonly value: string; readonly testId?: string; readonly tone?: "default" | "good" | "warn" | "bad";
}): ReactElement {
  const cls = tone === "good" ? "border-good/40 bg-good-soft text-good"
    : tone === "warn" ? "border-warn/40 bg-warning-soft text-warn"
    : tone === "bad" ? "border-bad/40 bg-bad-soft text-bad" : "border-line bg-canvas text-fg";
  return (
    <div data-testid={testId} className={`rounded-lg border p-2.5 text-xs tabular-nums ${cls}`}>
      <div className="text-[11px] opacity-80">{label}</div>
      <div className="mt-0.5 text-sm font-bold">{value}</div>
    </div>
  );
}

export function StudioFleetShieldPanel({
  initialTab = "shield-motion", locale, className, artworkBuffer, fleetInput, heatmapInput,
  onDmcaGenerated, onCompanionCommand,
}: StudioFleetShieldPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<StudioFleetShieldTabId>(initialTab);
  const [shieldEnabled, setShieldEnabled] = useState<boolean>(true);
  const [shieldStrength, setShieldStrength] = useState<SpectralShieldStrength>("balanced");
  const [recipientId, setRecipientId] = useState<string>("NAVER-KR-DESK");
  const [motionPreset, setMotionPreset] = useState<"cinematic" | "calm">("cinematic");
  const [dmcaNoticeMsg, setDmcaNoticeMsg] = useState<string | null>(null);
  const [companionSession, setCompanionSession] = useState<SecondScreenCompanionSession>(() => createSecondScreenCompanionSession());
  const [companionNotice, setCompanionNotice] = useState<string | null>(null);
  const [fleetFilter, setFleetFilter] = useState<FleetFilterId>("all");

  const baseBuffer = useMemo(() => artworkBuffer ?? createDemoArtworkBuffer(64, 64), [artworkBuffer]);
  const shieldResult = useMemo(
    () => applyAdversarialSpectralShield(baseBuffer, { enabled: shieldEnabled, strength: shieldStrength, targetMinPsnrDb: 38 }),
    [baseBuffer, shieldEnabled, shieldStrength],
  );
  const leakMeta = useMemo(() => createDemoLeakTraceMetadata(recipientId), [recipientId]);
  const forensicEmbed = useMemo(() => embedLeakTraceForensicPayload(shieldResult.buffer, leakMeta), [leakMeta, shieldResult.buffer]);
  const forensicRecover = useMemo(
    () => extractLeakTraceForensicPayload(forensicEmbed.buffer, leakMeta.watermarkKey),
    [forensicEmbed.buffer, leakMeta.watermarkKey],
  );
  const dmcaPkg = useMemo(() => buildDmcaTakedownPackage({
    copyrightOwner: "ToonStudio Original Lab", studioName: "ToonStudio CP Division", contactEmail: "rights@toonstudio.cloud",
    workTitle: "별빛 회귀자", workId: leakMeta.workId, episodeNumber: leakMeta.episodeNumber,
    originalPublicationUrl: "https://www.toonstudio.cloud/series/ts-eclipse-2026/ep-42",
    infringingUrls: ["https://mirror-leak.example/raw/eclipse-42"], hostingProvider: "EdgeMirror CDN Abuse Desk",
    discoveredAtIso: "2026-11-23T11:45:00Z", forensicExtraction: forensicRecover,
    spectralShieldReceiptSha256: shieldResult.receiptSha256,
  }), [forensicRecover, leakMeta.episodeNumber, leakMeta.workId, shieldResult.receiptSha256]);

  const motionPlan = useMemo(() => buildMotionPosterLoopPlan({
    workTitle: "별빛 회귀자", cutId: "ep42-cut07", durationSeconds: 3, fps: 24,
    eyeBlinkIntensity: motionPreset === "cinematic" ? 0.92 : 0.7, hairSwayIntensity: motionPreset === "cinematic" ? 0.8 : 0.45,
    lightMotesIntensity: motionPreset === "cinematic" ? 0.85 : 0.4, microZoomIntensity: motionPreset === "cinematic" ? 0.72 : 0.35,
  }), [motionPreset]);

  const fleetReport = useMemo(() => evaluateStudioFleetQaRadar(fleetInput ?? createDemoStudioFleet50Series()), [fleetInput]);
  const heatmapReport = useMemo(() => correlateReaderReactionToCuts(heatmapInput ?? createDemoReaderReactionEpisode()), [heatmapInput]);
  const filteredFleet = useMemo(() => {
    if (fleetFilter === "critical") return fleetReport.priorityQueue.filter((s) => s.riskTier === "critical" || s.riskTier === "high");
    if (fleetFilter === "rights-30d") return fleetReport.priorityQueue.filter((s) => s.expiringRightsAssets30d.length > 0);
    if (fleetFilter === "overload") return fleetReport.priorityQueue.filter((s) => s.overloadedAssistantIds.length > 0);
    return fleetReport.priorityQueue;
  }, [fleetFilter, fleetReport.priorityQueue]);

  const handleGenerateDmca = (): void => {
    onDmcaGenerated?.(dmcaPkg);
    setDmcaNoticeMsg(pick(
      `DMCA 신고서(${dmcaPkg.caseId}) 생성 완료 · 출고처 ${dmcaPkg.attributedLeakSource?.recipientId ?? "미확인"} · SHA-256 ${dmcaPkg.evidenceSha256.slice(0, 12)}`,
      `DMCA ${dmcaPkg.caseId} ready · source ${dmcaPkg.attributedLeakSource?.recipientId ?? "unattributed"} · SHA-256 ${dmcaPkg.evidenceSha256.slice(0, 12)}`,
    ));
  };

  const runCompanionCmd = (
    payload:
      | { readonly type: "pair-device"; readonly deviceName: string; readonly deviceKind: "smartphone" | "tablet" }
      | { readonly type: "set-color-wheel"; readonly hueDeg: number; readonly chroma: number; readonly lightness: number; readonly label: string }
      | { readonly type: "adjust-brush-dial"; readonly sizePx?: number; readonly stabilizationPct?: number }
      | { readonly type: "rotate-canvas"; readonly deltaDeg?: number; readonly snapTo15Deg?: boolean }
      | { readonly type: "control-reference"; readonly grayscale?: boolean },
  ): void => {
    const result = dispatchCompanionCommand(companionSession, {
      ...payload, seq: companionSession.lastCommandSeq + 1, pairingToken: companionSession.pairingToken, atIso: "2026-11-23T11:30:30.000Z",
    });
    setCompanionSession(result.session);
    onCompanionCommand?.(result);
    setCompanionNotice(pick(result.appliedSummaryKo, result.appliedSummaryEn));
  };

  const qrCells = useMemo(() => {
    const cells: { readonly key: string; readonly x: number; readonly y: number }[] = [];
    companionSession.qrMatrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) cells.push({ key: `${x}-${y}`, x, y }); }));
    return cells;
  }, [companionSession.qrMatrix]);

  const peakPosterFrame = motionPlan.keyframes[36] ?? motionPlan.keyframes[0];

  return (
    <section
      aria-label={pick("스튜디오 IP 실드 · 2nd-Screen QR · CP 50작품 Fleet 관제 패널", "Studio IP Shield · 2nd-Screen QR · CP 50-Series Fleet Panel")}
      className={`rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="space-y-1 border-b border-line pb-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("IP 스타일 보호 · QR 무선 보조화면 · CP 50작품 관제", "IP Style Shield · Wireless QR Companion · 50-Series CP Fleet")}</span>
        </div>
        <h2 className="text-base font-bold text-fg">{pick("스튜디오 IP 실드 · 2nd-Screen · CP Fleet 관제실", "Studio IP Shield, 2nd-Screen & CP Fleet Control")}</h2>
        <p className="text-xs text-fg-2">{pick("스펙트럼 실드(PSNR 38dB+)·유출 역추적 DMCA·3초 모션 포스터·QR 보조화면·50작품 Fleet QA·독자 히트맵을 한 곳에서 실행합니다.", "Run spectral shield (PSNR >= 38dB), leak-trace DMCA, 3s motion posters, QR companion controls, and 50-series Fleet QA + heatmaps.")}</p>
      </header>

      <div role="tablist" aria-label={pick("스튜디오 확장 관제 탭", "Studio fleet and shield tabs")} className="mt-3 grid grid-cols-1 gap-1.5 rounded-xl border border-line bg-canvas p-1.5 sm:grid-cols-3">
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={`${TAB_BTN} ${selected ? "bg-accent text-on-accent" : "bg-transparent text-fg-2 hover:bg-raised hover:text-fg"}`}>
              <span>{pick(tab.ko, tab.en)}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "shield-motion" && (
        <div id={`${uid}-panel-shield-motion`} role="tabpanel" aria-labelledby={`${uid}-tab-shield-motion`} className="mt-4 space-y-3">
          <div className="rounded-xl border border-line bg-card p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg"><ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />{pick("옵트인 스타일 보호 스펙트럼 실드 & 포렌식 유출 역추적", "Opt-In Spectral Shield & Forensic Leak Trace")}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <label htmlFor={`${uid}-optin`} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 text-xs font-medium text-fg-2">
                  <input id={`${uid}-optin`} type="checkbox" checked={shieldEnabled} onChange={(e) => setShieldEnabled(e.target.checked)} className="accent-accent" />
                  <span>{pick("실드 활성", "Enable Shield")}</span>
                </label>
                {STRENGTHS.map((st) => (
                  <button key={st.id} type="button" aria-pressed={shieldStrength === st.id} onClick={() => setShieldStrength(st.id)} className={`${BTN_CHOICE} ${shieldStrength === st.id ? BTN_ACTIVE : BTN_IDLE}`}>{pick(st.ko, st.en)}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricTile testId="shield-psnr-tile" label={pick("육안 품질 PSNR", "Visual PSNR")} value={`${shieldResult.psnrDb.toFixed(2)} dB`} tone={shieldResult.psnrDb >= 38 ? "good" : "bad"} />
              <MetricTile testId="shield-disruption-tile" label={pick("중·고주파 위상 교란", "Spectral Disruption")} value={`${shieldResult.featureDisruptionScore} / 100`} />
              <MetricTile testId="forensic-recovery-tile" label={pick("유출 역추적 복원", "Leak-Trace Recovery")} value={forensicRecover.recovered ? `${forensicRecover.metadata?.recipientId} · Ep.${forensicRecover.metadata?.episodeNumber}` : pick("미검출", "Missing")} tone={forensicRecover.recovered ? "good" : "bad"} />
              <MetricTile label={pick("포렌식 PSNR / 중복도", "Forensic PSNR")} value={`${forensicEmbed.psnrDb.toFixed(2)} dB · ${forensicEmbed.redundancyFactor}x`} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {RECIPIENTS.map((rcp) => (
                  <button key={rcp} type="button" aria-pressed={recipientId === rcp} onClick={() => setRecipientId(rcp)} className={`${BTN_CHOICE} ${recipientId === rcp ? BTN_ACTIVE : BTN_IDLE}`}>{rcp}</button>
                ))}
              </div>
              <button type="button" onClick={handleGenerateDmca} className={BTN_PRIMARY}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("1클릭 DMCA 신고 패키지 생성", "Generate 1-Click DMCA Package")}</span>
              </button>
            </div>
            <div data-testid="dmca-summary-bar" className="rounded-lg border border-line bg-canvas px-3 py-2 text-[11px] text-fg-2 tabular-nums">
              {dmcaPkg.caseId} · {pick("법정 요건", "Statutory")} {dmcaPkg.statutoryChecklist.filter((c) => c.satisfied).length}/{dmcaPkg.statutoryChecklist.length} · SHA-256 {dmcaPkg.evidenceSha256.slice(0, 14)}
            </div>
            {dmcaNoticeMsg && <p role="status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-1.5 text-xs font-medium text-good">{dmcaNoticeMsg}</p>}
          </div>

          <div className="rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg"><Film className="h-4 w-4 text-accent" aria-hidden="true" />{pick("3초 루프 모션 포스터 · 24fps · 72프레임", "3s Seamless Motion Poster · 24fps · 72f")}</span>
              <div className="flex gap-1.5">
                <button type="button" aria-pressed={motionPreset === "cinematic"} onClick={() => setMotionPreset("cinematic")} className={`${BTN_CHOICE} ${motionPreset === "cinematic" ? BTN_ACTIVE : BTN_IDLE}`}>{pick("드라마틱 루프", "Cinematic")}</button>
                <button type="button" aria-pressed={motionPreset === "calm"} onClick={() => setMotionPreset("calm")} className={`${BTN_CHOICE} ${motionPreset === "calm" ? BTN_ACTIVE : BTN_IDLE}`}>{pick("잔잔한 숨결", "Subtle")}</button>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-3 items-center">
              <div className="flex items-center justify-center rounded-lg border border-line bg-canvas p-2 text-fg">
                <svg viewBox="0 0 120 130" className="h-24 w-20" role="img" aria-label={pick("3초 모션 포스터 프리뷰", "3s motion poster preview")}>
                  <rect x="10" y="8" width="100" height="114" rx="10" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" />
                  <circle cx="60" cy="54" r="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeOpacity="0.75" />
                  <ellipse cx="52" cy="54" rx="3.5" ry="3.5" fill="currentColor" /><ellipse cx="68" cy="54" rx="3.5" ry="3.5" fill="currentColor" />
                  <circle cx="28" cy="28" r="2.2" className="fill-current text-accent" /><circle cx="92" cy="88" r="2" className="fill-current text-accent" />
                </svg>
              </div>
              <div className="sm:col-span-2 space-y-2 text-xs tabular-nums">
                <div data-testid="motion-poster-metrics" className="flex flex-wrap gap-2 text-fg-2">
                  <span className="rounded-md border border-good/40 bg-good-soft px-2 py-0.5 font-bold text-good">{motionPlan.fps}fps · {motionPlan.totalFrames}f · {motionPlan.seamlessLoopVerified ? pick("무이음 OK", "Seamless OK") : "Drift"}</span>
                  <span className="rounded-md border border-line bg-canvas px-2 py-0.5">{pick("피크 줌", "Peak Zoom")} ×{peakPosterFrame?.zoomScale.toFixed(3)}</span>
                  <span className="rounded-md border border-line bg-canvas px-2 py-0.5"><Sparkles className="mr-1 inline h-3 w-3 text-accent" aria-hidden="true" />{pick("눈깜빡·머리카락·빛가루·줌", "Eye·Hair·Motes·Zoom")}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {motionPlan.exportManifests.map((m) => (
                    <div key={m.format} data-testid={`poster-manifest-${m.format}`} className="rounded-lg border border-line bg-canvas p-2">
                      <div className="font-bold uppercase text-fg">{m.format}</div>
                      <div className="text-[11px] text-fg-2">{(m.estimatedBytes / 1024).toFixed(0)} KiB · {m.frameDelayMs}ms</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "companion-qr" && (
        <div id={`${uid}-panel-companion-qr`} role="tabpanel" aria-labelledby={`${uid}-tab-companion-qr`} className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-line bg-card p-3 flex flex-col items-center gap-2 text-center">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg"><QrCode className="h-4 w-4 text-accent" aria-hidden="true" />{pick("1초 QR 무선 페어링", "1-Second QR Pairing")}</span>
            <svg viewBox="0 0 21 21" className="h-28 w-28 rounded-lg border border-line bg-canvas p-2 text-fg" role="img" aria-label={pick("보조화면 페어링 QR 코드", "Companion pairing QR matrix")}>
              {qrCells.map((c) => <rect key={c.key} x={c.x} y={c.y} width={1} height={1} fill="currentColor" />)}
            </svg>
            <div data-testid="companion-pairing-code" className="text-sm font-bold tracking-wider tabular-nums text-fg">{companionSession.pairingCode}</div>
            <div data-testid="companion-status-badge" className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${companionSession.status === "paired" ? "border-good/40 bg-good-soft text-good" : "border-warn/40 bg-warning-soft text-warn"}`}>
              {companionSession.status === "paired" ? `${companionSession.pairedDevice?.deviceName} (${companionSession.pairedDevice?.latencyMs}ms)` : pick(`스캔 대기 · TTL ${companionSession.ttlSeconds}초`, `Awaiting Scan · TTL ${companionSession.ttlSeconds}s`)}
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              <button type="button" onClick={() => runCompanionCmd({ type: "pair-device", deviceName: "iPad Pro 13 Companion", deviceKind: "tablet" })} className={BTN_PRIMARY}>
                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("태블릿 1초 페어링", "Pair Tablet (1s)")}</span>
              </button>
              <button type="button" onClick={() => { const f = createSecondScreenCompanionSession({ createdAtIso: "2026-11-23T11:31:00.000Z" }); setCompanionSession(f); setCompanionNotice(pick(`QR 재발급 (${f.pairingCode})`, `New QR (${f.pairingCode})`)); }} className={`${BTN_CHOICE} ${BTN_IDLE}`}>{pick("QR 재발급", "New QR")}</button>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-line bg-card p-3 space-y-2.5 text-xs">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricTile testId="companion-color-state" label={pick("색상환 (OKLCH)", "Color Wheel")} value={`${companionSession.colorWheel.label} (${companionSession.colorWheel.hueDeg}°)`} />
              <MetricTile testId="companion-brush-state" label={pick("브러시 다이얼", "Brush Dial")} value={`${companionSession.brushDial.sizePx}px · ${companionSession.brushDial.opacityPct}%`} />
              <MetricTile testId="companion-canvas-state" label={pick("캔버스 회전", "Canvas Rotate")} value={`${companionSession.canvasTransform.rotationDeg}° · ${companionSession.canvasTransform.flipHorizontal ? pick("반전", "Flip") : pick("정방향", "Normal")}`} />
              <MetricTile testId="companion-ref-state" label={pick("레퍼런스 보드", "Reference Pin")} value={companionSession.referencePin.grayscale ? pick("흑백 명암", "Grayscale") : pick("원본 컬러", "Color")} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button key={c.hue} type="button" onClick={() => runCompanionCmd({ type: "set-color-wheel", hueDeg: c.hue, chroma: c.chroma, lightness: c.lightness, label: pick(c.ko, c.en) })} className={`${BTN_CHOICE} ${BTN_IDLE}`}>{pick(c.ko, c.en)}</button>
              ))}
              <button type="button" onClick={() => runCompanionCmd({ type: "adjust-brush-dial", sizePx: companionSession.brushDial.sizePx + 6, stabilizationPct: 55 })} className={`${BTN_CHOICE} ${BTN_IDLE}`}>{pick("브러시 +6px", "Brush +6px")}</button>
              <button type="button" onClick={() => runCompanionCmd({ type: "rotate-canvas", deltaDeg: 15, snapTo15Deg: true })} className={`${BTN_CHOICE} ${BTN_IDLE}`}><RotateCw className="h-3.5 w-3.5" aria-hidden="true" />{pick("회전 +15°", "Rotate +15°")}</button>
              <button type="button" onClick={() => runCompanionCmd({ type: "control-reference", grayscale: !companionSession.referencePin.grayscale })} className={`${BTN_CHOICE} ${BTN_IDLE}`}><Layers className="h-3.5 w-3.5" aria-hidden="true" />{pick("레퍼런스 흑백 토글", "Toggle Ref Gray")}</button>
            </div>
            {companionNotice && <p role="status" className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${companionSession.status === "paired" ? "border-good/40 bg-good-soft text-good" : "border-warn/40 bg-warning-soft text-warn"}`}>{companionNotice}</p>}
            <ul className="space-y-1 text-[11px] text-fg-2 tabular-nums">
              {companionSession.commandLog.slice(0, 4).map((e) => (
                <li key={e.seq} className="flex items-center justify-between rounded-md border border-line bg-canvas px-2.5 py-1"><span>#{e.seq} · {pick(e.summaryKo, e.summaryEn)}</span><span className="text-fg-3">{e.type}</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === "fleet-heatmap" && (
        <div id={`${uid}-panel-fleet-heatmap`} role="tabpanel" aria-labelledby={`${uid}-tab-fleet-heatmap`} className="mt-4 space-y-3">
          <div className="rounded-xl border border-line bg-card p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg"><Radar className="h-4 w-4 text-accent" aria-hidden="true" />{pick(`CP ${fleetReport.totalSeriesCount}작품 통합 Fleet QA 레이더`, `CP ${fleetReport.totalSeriesCount}-Series Fleet QA Radar`)}</span>
              <div className="flex flex-wrap gap-1.5">
                {([["all", pick(`전체 ${fleetReport.totalSeriesCount}`, `All ${fleetReport.totalSeriesCount}`)], ["critical", pick("긴급·고위험", "Critical/High")], ["rights-30d", pick("Rights BOM 30일", "Rights <=30d")], ["overload", pick("어시 과부하", "Overload")]] as readonly (readonly [FleetFilterId, string])[]).map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={fleetFilter === id} onClick={() => setFleetFilter(id)} className={`${BTN_CHOICE} ${fleetFilter === id ? BTN_ACTIVE : BTN_IDLE}`}>{label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricTile testId="fleet-total-tile" label={pick("관제 연재작 / 긴급", "Series / Critical")} value={`${fleetReport.totalSeriesCount} · ${fleetReport.tierCounts.critical}`} />
              <MetricTile label={pick("평균 자동 QA 통과율", "Avg Auto-QA")} value={`${fleetReport.averageQaPassRatePct}%`} />
              <MetricTile testId="fleet-rights-tile" label={pick("Rights BOM 30일 만료", "Rights <=30d")} value={`${fleetReport.totalExpiringRightsAssets30d}${pick("건", " items")} (${fleetReport.expiredRightsAssetCount})`} tone="warn" />
              <MetricTile testId="fleet-overload-tile" label={pick("어시스턴트 과부하", "Overloaded Staff")} value={`${fleetReport.overloadedAssistantCount} / ${fleetReport.totalAssistantCount}`} tone="bad" />
            </div>
            <ul data-testid="fleet-priority-list" className="space-y-1.5 text-xs tabular-nums">
              {filteredFleet.slice(0, 5).map((s) => (
                <li key={s.seriesId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2">
                  <div>
                    <span className="font-bold text-fg">{s.seriesId} · {pick(s.titleKo, s.titleEn)}</span>
                    <span className="ml-2 text-[11px] text-fg-3">{s.platform} · Ep.{s.episodeNumber} · D-{s.hoursToDeadline}h · QA {s.qaPassRatePct}%</span>
                    <p className="mt-0.5 text-[11px] text-fg-2">{pick(s.recommendedActionKo, s.recommendedActionEn)}</p>
                  </div>
                  <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${TIER_CLS[s.riskTier]}`}>{s.compositePriorityScore}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-line bg-card p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-fg"><Flame className="h-4 w-4 text-accent" aria-hidden="true" />{pick("독자 반응·이탈 히트맵 원고 컷 역추적 오버레이", "Reader Reaction & Drop-Off Cut Overlay")}</span>
              <span data-testid="heatmap-kpi-badge" className="rounded-md border border-line bg-canvas px-2 py-0.5 text-[11px] font-bold tabular-nums text-fg">
                {pick(`초반3컷 ${heatmapReport.openingThreeCutRetentionPct}% · 완독 ${heatmapReport.endEpisodeRetentionPct}% · 폭주 ${heatmapReport.peakCommentCutId}`, `3-Cut ${heatmapReport.openingThreeCutRetentionPct}% · End ${heatmapReport.endEpisodeRetentionPct}% · Peak ${heatmapReport.peakCommentCutId}`)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <ul className="space-y-1 text-xs tabular-nums">
                {heatmapReport.cutOverlays.slice(0, 7).map((cut) => (
                  <li key={cut.cutId} data-testid={`heatmap-cut-${cut.cutId}`} className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${HEAT_CLS[cut.semanticTone]}`}>
                    <span className="font-semibold">#{cut.cutIndex} ({cut.yStartPx}–{cut.yEndPx}px)</span>
                    <span>{pick("댓글", "Cmt")} ×{cut.commentSurgeIndex} · {pick("이탈", "Drop")} {cut.dropOffRatePct}% · {cut.avgDwellSeconds}s</span>
                  </li>
                ))}
              </ul>
              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-fg"><Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("다음 회차 연출·대사 호흡 권고안", "Next-Episode Directing Recommendations")}</span>
                {heatmapReport.nextEpisodeRecommendations.map((rec) => (
                  <div key={rec.id} className="rounded-lg border border-line bg-canvas p-2 text-[11px] text-fg-2">
                    <div className="flex items-center gap-1 font-bold text-fg"><AlertTriangle className="h-3 w-3 text-warn" aria-hidden="true" /><span>{rec.metricEvidence}</span></div>
                    <p className="mt-0.5">{pick(rec.guidanceKo, rec.guidanceEn)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
