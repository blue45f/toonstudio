import {
  ChevronDown,
  ChevronRight,
  Droplets,
  Gamepad2,
  HardDriveDownload,
  Palette,
  Play,
  Sliders,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import {
  METALLIC_PIGMENT_PRESETS,
  REBELLE_PAPER_PRESETS,
  runRebelleWatercolorMetallicPreview,
  type MetallicPigmentId,
  type RebellePaperPresetId,
  type RebelleWatercolorMetallicRenderResult,
} from "../brush/wet-paper/studio-rebelle-heightmap-metallic";
import {
  LEFT_HAND_HID_DEVICE_PROFILES,
  LEFT_HAND_STUDIO_ACTION_CATALOG,
  createSampleHidReportPacket,
  createWebHidLeftHandController,
  detectWebHidSupport,
  type LeftHandControlId,
  type LeftHandHidActionEvent,
  type LeftHandHidProfileId,
  type LeftHandKeymapPresetId,
  type WebHidProbeEnv,
} from "../drawing/studio-webhid-left-hand-device";
import {
  CMYK_PRINT_PROFILES,
  computeCmykSoftProofGamutOverlay,
  createDisplayP3TestChartBuffer,
  detectFileSystemAccessSupport,
  openLocalArtworkFile,
  saveLocalArtworkFile,
  type CmykPrintProfileId,
  type CmykSoftProofResult,
  type FileSystemAccessEnv,
  type OpenLocalArtworkResult,
  type SaveLocalArtworkResult,
} from "../export/studio-fs-access-native-save";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("ChromeProHardwareAndMediaSection", ko, en);

export type ProHardwareTabId = "rebelle-media" | "webhid-remote" | "fs-access" | "cmyk-proof";

export interface ChromeProHardwareEnv {
  readonly webHid?: WebHidProbeEnv;
  readonly fileSystem?: FileSystemAccessEnv;
}

export interface ChromeProHardwareAndMediaSectionProps {
  readonly env?: ChromeProHardwareEnv;
  readonly defaultExpanded?: boolean;
}

const PAPER_PRESET_IDS: readonly RebellePaperPresetId[] = ["cold-press", "hot-press", "linen-canvas"];
const METALLIC_IDS: readonly MetallicPigmentId[] = ["gold", "silver", "emerald", "rose-gold"];
const HID_PROFILE_IDS: readonly LeftHandHidProfileId[] = ["tourbox", "wacom-ekr", "xencelabs-quick-keys"];
const CMYK_PROFILE_IDS: readonly CmykPrintProfileId[] = [
  "japan-color-2011-coated",
  "fogra39-coated",
  "swop-v2-uncoated",
];
const KEYMAP_PRESET_OPTIONS: readonly { readonly id: LeftHandKeymapPresetId; readonly ko: string; readonly en: string }[] = [
  { id: "inking", ko: "펜선 기본", en: "Inking" },
  { id: "coloring", ko: "수채 채색", en: "Coloring" },
  { id: "retouch", ko: "마감 회전", en: "Retouch" },
];

function paintRgbaToCanvas(
  canvas: HTMLCanvasElement | null,
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): void {
  if (!canvas) return;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof ctx.createImageData !== "function") return;
    canvas.width = width;
    canvas.height = height;
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
  } catch {
    // 헤드리스 테스트 환경 등 2D 컨텍스트 미지원 시 미리보기 드로잉만 생략한다.
  }
}

/**
 * 프로 하드웨어 · 자연매체 제어 서브섹션 (`T-019 ~ T-022`).
 * `ChromeWasm64PerformancePanel` 내부에 지연 마운트되어 4종 기능을 1클릭으로 체험·진단한다.
 */
export function ChromeProHardwareAndMediaSection({
  env,
  defaultExpanded = true,
}: ChromeProHardwareAndMediaSectionProps = {}) {
  useBilingualI18nRevision();

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<ProHardwareTabId>("rebelle-media");
  const [paperPreset, setPaperPreset] = useState<RebellePaperPresetId>("cold-press");
  const [metallicPigment, setMetallicPigment] = useState<MetallicPigmentId>("gold");
  const [rebelleResult, setRebelleResult] = useState<RebelleWatercolorMetallicRenderResult | null>(null);
  const rebelleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [hidProfile, setHidProfile] = useState<LeftHandHidProfileId>("tourbox");
  const [keymapPreset, setKeymapPreset] = useState<LeftHandKeymapPresetId>("inking");
  const [hidMessage, setHidMessage] = useState<string | null>(null);
  const [hidConnectedName, setHidConnectedName] = useState<string | null>(null);
  const [lastHidEvent, setLastHidEvent] = useState<LeftHandHidActionEvent | null>(null);
  const [hidSimIndex, setHidSimIndex] = useState(0);

  const webHidSupport = useMemo(() => detectWebHidSupport(env?.webHid), [env?.webHid]);
  const hidController = useMemo(
    () =>
      createWebHidLeftHandController({
        env: env?.webHid,
        keymapPreset: "inking",
        onAction: (actionEvent) => setLastHidEvent(actionEvent),
      }),
    [env?.webHid],
  );

  useEffect(() => () => {
    void hidController.disconnect();
  }, [hidController]);

  const fsSupport = useMemo(() => detectFileSystemAccessSupport(env?.fileSystem), [env?.fileSystem]);
  const [fsSaveResult, setFsSaveResult] = useState<SaveLocalArtworkResult | null>(null);
  const [fsOpenResult, setFsOpenResult] = useState<OpenLocalArtworkResult | null>(null);
  const [fsBusy, setFsBusy] = useState(false);

  const [cmykProfile, setCmykProfile] = useState<CmykPrintProfileId>("japan-color-2011-coated");
  const [cmykResult, setCmykResult] = useState<CmykSoftProofResult | null>(null);
  const cmykCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (rebelleResult) paintRgbaToCanvas(rebelleCanvasRef.current, rebelleResult.width, rebelleResult.height, rebelleResult.rgba);
  }, [rebelleResult]);

  useEffect(() => {
    if (cmykResult) paintRgbaToCanvas(cmykCanvasRef.current, cmykResult.width, cmykResult.height, cmykResult.overlayRgba);
  }, [cmykResult]);

  const handleRunRebellePreview = useCallback(() => {
    setRebelleResult(runRebelleWatercolorMetallicPreview({ presetId: paperPreset, metallicPigment, width: 48, height: 48, steps: 10 }));
  }, [metallicPigment, paperPreset]);

  const handleSelectKeymapPreset = useCallback(
    (preset: LeftHandKeymapPresetId) => {
      setKeymapPreset(preset);
      hidController.setKeymapPreset(preset);
    },
    [hidController],
  );

  const handleConnectWebHid = useCallback(async () => {
    const res = await hidController.connect(hidProfile);
    setHidMessage(res.message);
    setHidConnectedName(res.status === "connected" ? res.deviceName : null);
  }, [hidController, hidProfile]);

  const handleSimulateHidPacket = useCallback(() => {
    const controls: readonly LeftHandControlId[] =
      hidProfile === "xencelabs-quick-keys"
        ? ["wheel.cw", "wheel.ccw", "button.1", "button.2", "button.3"]
        : ["dial.cw", "dial.ccw", "button.1", "button.2", "button.3"];
    const control = controls[hidSimIndex % controls.length] ?? "button.1";
    setHidSimIndex((prev) => prev + 1);

    if (hidProfile === "wacom-ekr" && (control === "dial.cw" || control === "dial.ccw")) {
      hidController.simulateReport("wacom-ekr", LEFT_HAND_HID_DEVICE_PROFILES["wacom-ekr"].defaultReportId, new Uint8Array([0x80, 0, 0, 0]));
    }
    const packet = createSampleHidReportPacket(hidProfile, control);
    const parsed = hidController.simulateReport(hidProfile, packet.reportId, packet.bytes);
    if (parsed.events.length === 0) {
      const releaseBytes =
        hidProfile === "tourbox"
          ? new Uint8Array([(packet.bytes[0] ?? 0) | 0x80, 0])
          : hidProfile === "wacom-ekr"
            ? new Uint8Array([0, 0, 0, 0])
            : new Uint8Array([0xf0, 0x01, 0, 0, 0, 0, 0, 0]);
      hidController.simulateReport(hidProfile, packet.reportId, releaseBytes);
      hidController.simulateReport(hidProfile, packet.reportId, packet.bytes);
    }
    setHidMessage(
      bi(
        `${LEFT_HAND_HID_DEVICE_PROFILES[hidProfile].displayName} 바이너리 패킷 해석 완료`,
        `Decoded binary report for ${LEFT_HAND_HID_DEVICE_PROFILES[hidProfile].displayName}`,
      ),
    );
  }, [hidController, hidProfile, hidSimIndex]);

  const handleTestFsSave = useCallback(async () => {
    setFsBusy(true);
    try {
      const samplePayload = JSON.stringify({ format: "toonstudio-native-save-probe", version: 1, savedAt: "2026-11-21", colorSpace: "display-p3" });
      setFsSaveResult(
        await saveLocalArtworkFile({
          suggestedName: "toonstudio-sample-manuscript.toonstudio",
          data: samplePayload,
          mimeType: "application/x-toonstudio-project",
          env: env?.fileSystem,
        }),
      );
    } finally {
      setFsBusy(false);
    }
  }, [env?.fileSystem]);

  const handleTestFsOpen = useCallback(async () => {
    setFsBusy(true);
    try {
      setFsOpenResult(await openLocalArtworkFile({ env: env?.fileSystem }));
    } finally {
      setFsBusy(false);
    }
  }, [env?.fileSystem]);

  const handleRunCmykProof = useCallback(() => {
    setCmykResult(
      computeCmykSoftProofGamutOverlay({
        width: 64,
        height: 32,
        rgba: createDisplayP3TestChartBuffer(64, 32),
        sourceColorSpace: "display-p3",
        profileId: cmykProfile,
        highlightMode: "warning-overlay",
      }),
    );
  }, [cmykProfile]);

  const activeKeymap = hidController.getSnapshot().keymap;
  const activeProfileDescriptor = LEFT_HAND_HID_DEVICE_PROFILES[hidProfile];
  const tabs: readonly { readonly id: ProHardwareTabId; readonly label: string; readonly icon: typeof Droplets }[] = [
    { id: "rebelle-media", label: bi("물리 수채화 · 메탈릭", "Fluid Watercolor & Metallic"), icon: Droplets },
    { id: "webhid-remote", label: bi("WebHID 왼손 리모컨", "WebHID Left-Hand Remote"), icon: Gamepad2 },
    { id: "fs-access", label: bi("로컬 디스크 저장", "Local Disk Save"), icon: HardDriveDownload },
    { id: "cmyk-proof", label: bi("Display-P3 · CMYK 프루프", "Display-P3 · CMYK Proof"), icon: Palette },
  ];

  return (
    <div className="mt-4 rounded-xl border border-line bg-card/80 p-4" data-testid="chrome-pro-hardware-media-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls="pro-hardware-media-body"
          data-testid="pro-hardware-media-toggle"
          className="inline-flex min-h-9 items-center gap-2 text-left text-xs font-bold text-fg"
        >
          {expanded ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
          <Sliders size={14} aria-hidden className="text-accent" />
          <span className="[word-break:keep-all]">
            {bi(
              "프로 자연매체 · WebHID 리모컨 · 로컬 디스크 · 인쇄 소프트 프루프",
              "Pro Natural Media · WebHID Remote · Local Disk · Print Soft Proof",
            )}
          </span>
        </button>
        <span className="wasm64-pill wasm64-pill--turbo">{bi("지연 로드 4종 모듈", "4 Lazy Pro Modules")}</span>
      </div>

      {expanded ? (
        <div id="pro-hardware-media-body" className="mt-3">
          <div
            role="tablist"
            aria-label={bi("프로 하드웨어 및 자연매체 기능 선택", "Pro hardware and media features")}
            className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  data-testid={`pro-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold [word-break:keep-all] ${
                    selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg-2 hover:text-fg"
                  }`}
                >
                  <Icon size={13} aria-hidden className="shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {activeTab === "rebelle-media" ? (
            <div role="tabpanel" className="mt-3 space-y-3 rounded-xl border border-line bg-panel/70 p-3.5" data-testid="pro-panel-rebelle-media">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-[0.72rem] font-semibold text-fg-2">
                    {bi("물리 종이 높이맵", "Paper Heightmap")}
                    <select
                      value={paperPreset}
                      onChange={(e) => setPaperPreset(e.target.value as RebellePaperPresetId)}
                      data-testid="pro-rebelle-paper-select"
                      className="min-h-9 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
                    >
                      {PAPER_PRESET_IDS.map((id) => (
                        <option key={id} value={id}>{REBELLE_PAPER_PRESETS[id].label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[0.72rem] font-semibold text-fg-2">
                    {bi("메탈릭 피그먼트", "Metallic Pigment")}
                    <select
                      value={metallicPigment}
                      onChange={(e) => setMetallicPigment(e.target.value as MetallicPigmentId)}
                      data-testid="pro-rebelle-metallic-select"
                      className="min-h-9 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
                    >
                      {METALLIC_IDS.map((id) => (
                        <option key={id} value={id}>{METALLIC_PIGMENT_PRESETS[id].label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" onClick={handleRunRebellePreview} data-testid="pro-rebelle-run-btn" className="wasm64-turbo-cta shrink-0">
                  <Play size={14} aria-hidden />
                  {bi("수채화 · 메탈릭 미리보기 실행", "Run Watercolor & Metallic")}
                </button>
              </div>
              <p className="text-[0.72rem] leading-relaxed text-fg-3 [word-break:keep-all]">{REBELLE_PAPER_PRESETS[paperPreset].description}</p>
              {rebelleResult ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center" data-testid="pro-rebelle-results">
                  <canvas
                    ref={rebelleCanvasRef}
                    width={rebelleResult.width}
                    height={rebelleResult.height}
                    aria-label={bi("물리 수채화 메탈릭 미리보기 캔버스", "Physical watercolor metallic preview")}
                    className="size-24 shrink-0 rounded-lg border border-line bg-card [image-rendering:pixelated]"
                  />
                  <div className="grid flex-1 gap-2 sm:grid-cols-3">
                    <div className="wasm64-metric-card">
                      <p className="text-[0.7rem] font-semibold text-fg-3">{bi("계곡 침강 비율", "Valley Granulation")}</p>
                      <p className="mt-0.5 text-sm font-bold text-fg tabular-nums" data-testid="pro-rebelle-valley-ratio">
                        {`${rebelleResult.valleyToPeakGranulationRatio.toFixed(2)}×`}
                      </p>
                    </div>
                    <div className="wasm64-metric-card">
                      <p className="text-[0.7rem] font-semibold text-fg-3">{bi("경계 물감 띠 대비", "Edge Band Ratio")}</p>
                      <p className="mt-0.5 text-sm font-bold text-fg tabular-nums" data-testid="pro-rebelle-edge-ratio">
                        {`${rebelleResult.edgeRingContrastRatio.toFixed(2)}×`}
                      </p>
                    </div>
                    <div className="wasm64-metric-card">
                      <p className="text-[0.7rem] font-semibold text-fg-3">{bi("메탈릭 반사광 평균", "Metallic Specular")}</p>
                      <p className="mt-0.5 text-sm font-bold text-good tabular-nums" data-testid="pro-rebelle-specular">
                        {`+${(rebelleResult.metallicSpecularHighlightMean * 100).toFixed(1)}%`}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-fg-2 [word-break:keep-all]">
                  {bi(
                    "버튼을 누르면 48×48 절차적 종이 높이맵 위에서 10스텝 유체 수채화 침강과 메탈릭 스펙큘러 합성을 직접 계산합니다.",
                    "Click the button to run 10-step fluid watercolor valley granulation and metallic specular shading on a 48×48 procedural heightmap.",
                  )}
                </p>
              )}
            </div>
          ) : null}

          {activeTab === "webhid-remote" ? (
            <div role="tabpanel" className="mt-3 space-y-3 rounded-xl border border-line bg-panel/70 p-3.5" data-testid="pro-panel-webhid-remote">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-fg [word-break:keep-all]">
                  {`${activeProfileDescriptor.displayName} (VID 0x${activeProfileDescriptor.vendorId.toString(16).padStart(4, "0")})`}
                </p>
                <span data-testid="pro-webhid-support-pill" className={webHidSupport.supported ? "wasm64-pill wasm64-pill--active" : "wasm64-pill wasm64-pill--unsupported"}>
                  {webHidSupport.supported ? bi("WebHID 연결 가능", "WebHID Ready") : bi("WebHID 미지원 · 파서 테스트 가능", "No WebHID · Parser Ready")}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[0.72rem] font-semibold text-fg-2">
                  {bi("왼손 리모컨 프로파일", "Left-Hand Profile")}
                  <select
                    value={hidProfile}
                    onChange={(e) => setHidProfile(e.target.value as LeftHandHidProfileId)}
                    data-testid="pro-webhid-profile-select"
                    className="min-h-9 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
                  >
                    {HID_PROFILE_IDS.map((id) => (
                      <option key={id} value={id}>{LEFT_HAND_HID_DEVICE_PROFILES[id].displayName}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[0.72rem] font-semibold text-fg-2">
                  {bi("단축키 키맵 프리셋", "Keymap Preset")}
                  <select
                    value={keymapPreset}
                    onChange={(e) => handleSelectKeymapPreset(e.target.value as LeftHandKeymapPresetId)}
                    data-testid="pro-webhid-keymap-select"
                    className="min-h-9 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
                  >
                    {KEYMAP_PRESET_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{bi(opt.ko, opt.en)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void handleConnectWebHid()} data-testid="pro-webhid-connect-btn" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent">
                  <Gamepad2 size={14} aria-hidden />
                  {hidConnectedName ? bi(`연결됨: ${hidConnectedName}`, `Connected: ${hidConnectedName}`) : bi("WebHID 장치 연결 요청", "Connect WebHID Device")}
                </button>
                <button type="button" onClick={handleSimulateHidPacket} data-testid="pro-webhid-simulate-btn" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-fg">
                  <Play size={13} aria-hidden />
                  {bi("리포트 파싱 테스트", "Test HID Report Parser")}
                </button>
              </div>
              {hidMessage ? <p className="text-xs font-medium text-fg-2 [word-break:keep-all]" data-testid="pro-webhid-status-message">{hidMessage}</p> : null}
              {lastHidEvent ? (
                <div className="wasm64-metric-card flex flex-wrap items-center justify-between gap-2" data-testid="pro-webhid-last-event">
                  <span className="text-xs font-bold text-fg">{`${lastHidEvent.control} → ${lastHidEvent.action} (${lastHidEvent.label})`}</span>
                  <span className="text-[0.72rem] text-fg-3 tabular-nums">{`Δ ${lastHidEvent.delta} · HEX ${lastHidEvent.rawHex}`}</span>
                </div>
              ) : null}
              <div className="grid gap-1.5 text-[0.7rem] text-fg-3 sm:grid-cols-3">
                <span>{`Dial CW: ${LEFT_HAND_STUDIO_ACTION_CATALOG[activeKeymap["dial.cw"]].shortLabel}`}</span>
                <span>{`Btn 1: ${LEFT_HAND_STUDIO_ACTION_CATALOG[activeKeymap["button.1"]].shortLabel}`}</span>
                <span>{`Btn 3: ${LEFT_HAND_STUDIO_ACTION_CATALOG[activeKeymap["button.3"]].shortLabel}`}</span>
              </div>
            </div>
          ) : null}

          {activeTab === "fs-access" ? (
            <div role="tabpanel" className="mt-3 space-y-3 rounded-xl border border-line bg-panel/70 p-3.5" data-testid="pro-panel-fs-access">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-fg [word-break:keep-all]">{fsSupport.detail}</p>
                <span
                  data-testid="pro-fs-mode-pill"
                  className={
                    fsSupport.mode === "native-fs-access"
                      ? "wasm64-pill wasm64-pill--active"
                      : fsSupport.mode === "download-fallback"
                        ? "wasm64-pill wasm64-pill--partial"
                        : "wasm64-pill wasm64-pill--unsupported"
                  }
                >
                  {fsSupport.mode === "native-fs-access"
                    ? bi("로컬 디스크 직결 활성", "Direct Disk Access")
                    : fsSupport.mode === "download-fallback"
                      ? bi("안전 다운로드 폴백", "Safe Download Fallback")
                      : bi("미지원", "Unavailable")}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={fsBusy} onClick={() => void handleTestFsSave()} data-testid="pro-fs-save-btn" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent">
                  <HardDriveDownload size={14} aria-hidden />
                  {bi("샘플 원고 로컬 저장", "Save Sample Manuscript")}
                </button>
                <button type="button" disabled={fsBusy} onClick={() => void handleTestFsOpen()} data-testid="pro-fs-open-btn" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-fg">
                  {bi("로컬 원고 파일 열기", "Open Local Manuscript")}
                </button>
              </div>
              {fsSaveResult ? (
                <div className="wasm64-metric-card" data-testid="pro-fs-save-result">
                  <p className="text-xs font-bold text-fg">{fsSaveResult.message}</p>
                  <p className="mt-0.5 text-[0.7rem] text-fg-3 tabular-nums">{`${fsSaveResult.status} · ${fsSaveResult.method} · ${fsSaveResult.bytesWritten} B`}</p>
                </div>
              ) : null}
              {fsOpenResult ? (
                <div className="wasm64-metric-card" data-testid="pro-fs-open-result">
                  <p className="text-xs font-bold text-fg">{fsOpenResult.message}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "cmyk-proof" ? (
            <div role="tabpanel" className="mt-3 space-y-3 rounded-xl border border-line bg-panel/70 p-3.5" data-testid="pro-panel-cmyk-proof">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
                <label className="flex flex-col gap-1 text-[0.72rem] font-semibold text-fg-2">
                  {bi("단행본 인쇄 CMYK 프로파일", "Print CMYK Profile")}
                  <select
                    value={cmykProfile}
                    onChange={(e) => setCmykProfile(e.target.value as CmykPrintProfileId)}
                    data-testid="pro-cmyk-profile-select"
                    className="min-h-9 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
                  >
                    {CMYK_PROFILE_IDS.map((id) => (
                      <option key={id} value={id}>{CMYK_PRINT_PROFILES[id].label}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={handleRunCmykProof} data-testid="pro-cmyk-run-btn" className="wasm64-turbo-cta shrink-0">
                  <Palette size={14} aria-hidden />
                  {bi("CMYK 색역 이탈 시뮬레이션", "Run CMYK Soft Proof")}
                </button>
              </div>
              <p className="text-[0.72rem] text-fg-3 [word-break:keep-all]">{CMYK_PRINT_PROFILES[cmykProfile].description}</p>
              {cmykResult ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center" data-testid="pro-cmyk-results">
                  <canvas
                    ref={cmykCanvasRef}
                    width={cmykResult.width}
                    height={cmykResult.height}
                    aria-label={bi("CMYK 색역 이탈 소프트 프루프 차트", "CMYK gamut soft proof chart")}
                    className="h-16 w-32 shrink-0 rounded-lg border border-line bg-card [image-rendering:pixelated]"
                  />
                  <div className="grid flex-1 gap-2 sm:grid-cols-3">
                    <div className="wasm64-metric-card">
                      <p className="text-[0.7rem] font-semibold text-fg-3">{bi("색역 이탈 픽셀", "Out-of-Gamut")}</p>
                      <p className="mt-0.5 text-sm font-bold text-warn tabular-nums" data-testid="pro-cmyk-oog-ratio">
                        {`${(cmykResult.outOfGamutRatio * 100).toFixed(1)}% (${cmykResult.outOfGamutPixelCount}/${cmykResult.totalOpaquePixels})`}
                      </p>
                    </div>
                    <div className="wasm64-metric-card">
                      <p className="text-[0.7rem] font-semibold text-fg-3">{bi("최대 OKLab 색차", "Max OKLab ΔE")}</p>
                      <p className="mt-0.5 text-sm font-bold text-fg tabular-nums" data-testid="pro-cmyk-max-delta">{cmykResult.maxDeltaE.toFixed(1)}</p>
                    </div>
                    <div className="wasm64-metric-card">
                      <p className="text-[0.7rem] font-semibold text-fg-3">{bi("TAC 초과 픽셀", "TAC Exceeded")}</p>
                      <p className="mt-0.5 text-sm font-bold text-fg tabular-nums">{`${cmykResult.tacExceededPixelCount} px`}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-fg-2 [word-break:keep-all]">
                  {bi(
                    "버튼을 누르면 Display-P3 표준 테스트 차트(좌측 인쇄 안전 피부·회색톤 / 우측 광색역 네온 원색)의 CMYK 색역 이탈 영역을 즉시 검출합니다.",
                    "Click the button to detect CMYK out-of-gamut regions on a Display-P3 test chart (print-safe neutrals on left, wide-gamut primaries on right).",
                  )}
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
