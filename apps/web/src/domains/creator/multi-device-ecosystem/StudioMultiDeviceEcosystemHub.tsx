/**
 * 멀티 디바이스 생태계 통합 제어 · 라이브 체험 허브 (`StudioMultiDeviceEcosystemHub`).
 *
 * - 10단계 반응형 폼팩터 분류 · 왼손/오른손잡이 반전 · 폴더블 힌지 회피
 * - 6종 `device-*.webp` 컬러 스프라이트 셀렉터 · 실시간 브라우저 하드웨어 신호등
 * - 필압 시필 · 외부 컨트롤러(WebHID/MIDI/게임패드/풋페달) · 스마트워치/스마트 TV · 웹캠/AR/WebXR 탭
 * - BroadcastChannel 크로스-디바이스 실시간 동기화 피드
 */

import "./multi-device-ecosystem.css";

import { Hand, Layers, Radio, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";

import {
  DEVICE_FORM_FACTOR_ORDER,
  DEVICE_FORM_FACTOR_PROFILES,
  MULTI_DEVICE_SPRITE_PATHS,
  classifyDeviceFormFactor,
  computeFoldableHingeAvoidance,
  createMultiDeviceSyncBridge,
  readBrowserViewportMetrics,
  resolveHandednessLayout,
  type BrowserViewportProbeEnv,
  type DeviceFormFactorId,
  type DeviceHandedness,
  type MultiDeviceSyncBridge,
  type MultiDeviceSyncEnvelope,
} from "./device-form-factor-engine";
import {
  detectBrowserHardwareAndNextGenCapabilities,
  type BrowserHardwareProbeEnv,
} from "./peripheral-input-orchestrator";
import {
  StudioExternalControllersSection,
  StudioSpatialNextGenSection,
} from "./StudioPeripheralAndSpatialPanels";
import { StudioSmartTvModeView } from "./StudioSmartTvModeView";
import { StudioSmartwatchCompanionView } from "./StudioSmartwatchCompanionView";
import { StudioStylusTouchTestPanel } from "./StudioStylusTouchTestPanel";

export type MultiDeviceHubTabId = "stylus-touch" | "controllers" | "watch-tv" | "spatial-nextgen";

export interface StudioMultiDeviceEcosystemHubProps {
  readonly initialTab?: MultiDeviceHubTabId;
  readonly initialHandedness?: DeviceHandedness;
  readonly hardwareProbeEnv?: BrowserHardwareProbeEnv;
  readonly viewportProbeEnv?: BrowserViewportProbeEnv;
  readonly syncBridge?: MultiDeviceSyncBridge;
}

interface SpriteShortcutCard {
  readonly id: string;
  readonly labelKo: string;
  readonly metaKo: string;
  readonly spritePath: string;
  readonly targetTab: MultiDeviceHubTabId;
}

const ECOSYSTEM_SPRITE_CARDS: readonly SpriteShortcutCard[] = Object.freeze([
  Object.freeze({
    id: "digitizer",
    labelKo: "디지타이저 · 펜슬",
    metaKo: "필압·기울기·테이퍼",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.digitizer,
    targetTab: "stylus-touch",
  }),
  Object.freeze({
    id: "dial-pad",
    labelKo: "WebHID · MIDI · 패드",
    metaKo: "TourBox·조이콘·페달",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.dialPad,
    targetTab: "controllers",
  }),
  Object.freeze({
    id: "watch",
    labelKo: "스마트워치 크라운",
    metaKo: "200–260px · 3초 콘티",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.watch,
    targetTab: "watch-tv",
  }),
  Object.freeze({
    id: "tv",
    labelKo: "스마트 TV 10ft",
    metaKo: "D-Pad · 4K 미러링",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.tv,
    targetTab: "watch-tv",
  }),
  Object.freeze({
    id: "ar-glasses",
    labelKo: "웹캠 HUD · AR 글라스",
    metaKo: "옵트인 시선 · 투시",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.arGlasses,
    targetTab: "spatial-nextgen",
  }),
  Object.freeze({
    id: "vr-headset",
    labelKo: "WebXR VR 360°",
    metaKo: "무대 디렉터 · 공간 리본",
    spritePath: MULTI_DEVICE_SPRITE_PATHS.vrHeadset,
    targetTab: "spatial-nextgen",
  }),
]);

const HUB_TABS: readonly { readonly id: MultiDeviceHubTabId; readonly labelKo: string }[] = Object.freeze([
  Object.freeze({ id: "stylus-touch", labelKo: "입력 · 필압 시필" }),
  Object.freeze({ id: "controllers", labelKo: "WebHID · MIDI · 게임패드 · 풋페달" }),
  Object.freeze({ id: "watch-tv", labelKo: "스마트워치 · 스마트 TV" }),
  Object.freeze({ id: "spatial-nextgen", labelKo: "웹캠 HUD · AR · WebXR" }),
]);

function summarizeSyncEnvelope(envelope: MultiDeviceSyncEnvelope): string {
  const p = envelope.payload;
  switch (p.kind) {
    case "brush.delta":
      return `브러시 ${p.sizePx}px (${p.colorTokenId})`;
    case "canvas.zoom":
      return `줌 ${p.zoomPercent}% · ${p.rotationDeg}°`;
    case "canvas.undo":
      return `실행 취소 (${p.reasonKo})`;
    case "canvas.redo":
      return `다시 실행 (${p.reasonKo})`;
    case "voice.bubble":
      return `음성 말풍선 "${p.text}"`;
    case "tv.mirror":
      return `TV ${p.mode} · 컷 #${p.panelIndex + 1} (${p.pairingCode})`;
    case "handedness.sync":
      return p.handedness === "left" ? "왼손잡이 반전 동기화" : "오른손 기본 동기화";
    case "peripheral.command":
      return `${p.deviceKind} · ${p.actionId} (${p.value})`;
    case "device.hello":
      return `${p.labelKo} 연결됨`;
    case "device.goodbye":
      return "장치 연결 종료";
  }
}

export function StudioMultiDeviceEcosystemHub({
  initialTab = "stylus-touch",
  initialHandedness = "right",
  hardwareProbeEnv,
  viewportProbeEnv,
  syncBridge: externalBridge,
}: StudioMultiDeviceEcosystemHubProps): ReactElement {
  const detectedClassification = useMemo(
    () => classifyDeviceFormFactor(readBrowserViewportMetrics(viewportProbeEnv)),
    [viewportProbeEnv],
  );
  const capabilityReport = useMemo(
    () => detectBrowserHardwareAndNextGenCapabilities(hardwareProbeEnv),
    [hardwareProbeEnv],
  );

  const [activeTab, setActiveTab] = useState<MultiDeviceHubTabId>(initialTab);
  const [handedness, setHandedness] = useState<DeviceHandedness>(initialHandedness);
  const [selectedFormFactor, setSelectedFormFactor] = useState<DeviceFormFactorId>(
    detectedClassification.formFactor,
  );
  const [foldPreviewMode, setFoldPreviewMode] = useState<"none" | "vertical" | "horizontal">("none");
  const [gestureStatusKo, setGestureStatusKo] = useState<string>(
    "시필 패드에 선을 긋거나 트랙패드·터치 제스처 버튼을 눌러 실시간 반응을 확인하세요.",
  );

  const [internalBridge, setInternalBridge] = useState<MultiDeviceSyncBridge | null>(null);
  const [syncFeed, setSyncFeed] = useState<readonly string[]>([]);

  useEffect(() => {
    if (externalBridge) {
      return externalBridge.subscribe((envelope) => {
        setSyncFeed((prev) => [summarizeSyncEnvelope(envelope), ...prev.slice(0, 5)]);
      });
    }

    const created = createMultiDeviceSyncBridge({
      formFactor: detectedClassification.formFactor,
      handedness: initialHandedness,
    });
    setInternalBridge(created);
    const unsubscribe = created.subscribe((envelope) => {
      setSyncFeed((prev) => [summarizeSyncEnvelope(envelope), ...prev.slice(0, 5)]);
    });
    created.announceHello(initialHandedness);
    return () => {
      unsubscribe();
      created.close();
      setInternalBridge(null);
    };
  }, [externalBridge, detectedClassification.formFactor, initialHandedness]);

  const activeBridge = externalBridge ?? internalBridge;
  const activeProfile = DEVICE_FORM_FACTOR_PROFILES[selectedFormFactor];
  const handednessLayout = resolveHandednessLayout(selectedFormFactor, handedness);

  const hingePlan = useMemo(() => {
    const vp = activeProfile.previewViewport;
    if (foldPreviewMode === "vertical") {
      return computeFoldableHingeAvoidance(vp, {
        x: Math.round(vp.width / 2) - 16,
        y: 0,
        width: 32,
        height: vp.height,
      });
    }
    if (foldPreviewMode === "horizontal") {
      return computeFoldableHingeAvoidance(vp, {
        x: 0,
        y: Math.round(vp.height / 2) - 16,
        width: vp.width,
        height: 32,
      });
    }
    return computeFoldableHingeAvoidance(vp, null);
  }, [activeProfile.previewViewport, foldPreviewMode]);

  const handleToggleHandedness = (next: DeviceHandedness): void => {
    setHandedness(next);
    activeBridge?.publish({ kind: "handedness.sync", handedness: next });
  };

  return (
    <section
      data-testid="studio-multidevice-ecosystem-hub"
      data-mde-handedness={handedness}
      aria-label="멀티 디바이스 생태계 통합 허브"
      className="mde-shell"
    >
      <header className="mde-header">
        <div>
          <p className="mde-kicker">
            <Sparkles className="size-3.5" aria-hidden="true" />
            MULTI-DEVICE ECOSYSTEM · 10-FORM-FACTOR &amp; NEXT-GEN I/O
          </p>
          <h2 className="mde-title">멀티 디바이스 · 주변기기 라이브 체험 허브</h2>
          <p className="mde-subtitle">{handednessLayout.summaryKo}</p>
        </div>

        <div className="mde-actions-row" role="group" aria-label="주사용 손 방향 전환">
          <button
            type="button"
            data-testid="mde-handedness-right"
            className="mde-btn"
            aria-pressed={handedness === "right"}
            onClick={() => handleToggleHandedness("right")}
          >
            <Hand className="size-4" aria-hidden="true" />
            오른손 기본
          </button>
          <button
            type="button"
            data-testid="mde-handedness-left"
            className="mde-btn"
            aria-pressed={handedness === "left"}
            onClick={() => handleToggleHandedness("left")}
          >
            <Hand className="size-4" aria-hidden="true" />
            왼손잡이 반전
          </button>
        </div>
      </header>

      <div className="mde-sprite-grid" role="group" aria-label="6종 멀티 디바이스 카테고리">
        {ECOSYSTEM_SPRITE_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            data-testid={`mde-sprite-card-${card.id}`}
            className="mde-sprite-card"
            aria-pressed={activeTab === card.targetTab}
            onClick={() => setActiveTab(card.targetTab)}
          >
            <img
              src={card.spritePath}
              alt={card.labelKo}
              width={48}
              height={48}
              className="mde-sprite-img"
              loading="lazy"
            />
            <span className="mde-sprite-name">{card.labelKo}</span>
            <span className="mde-sprite-meta">{card.metaKo}</span>
          </button>
        ))}
      </div>

      <section className="mde-panel-surface" aria-label="10단계 반응형 폼팩터 및 폴더블 힌지 회피">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-bold text-fg">10단계 폼팩터: {activeProfile.labelKo}</h3>
          </div>
          <span className="mde-badge" data-tone="ready">
            캔버스 시야 <span className="mde-num">{activeProfile.canvasBudgetPercent}%+</span> · 터치{" "}
            <span className="mde-num">{activeProfile.minTouchTargetPx}px</span>
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="10단계 폼팩터 선택">
          {DEVICE_FORM_FACTOR_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className="mde-chip"
              aria-pressed={selectedFormFactor === id}
              onClick={() => setSelectedFormFactor(id)}
            >
              {DEVICE_FORM_FACTOR_PROFILES[id].shortLabelKo}
            </button>
          ))}
        </div>

        <div className="mde-divider-block">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-fg-2">
              {activeProfile.recommendedLayoutKo} ({hingePlan.summaryKo})
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="폴더블 힌지 시뮬레이션">
              {(
                [
                  ["none", "단일 연속"],
                  ["vertical", "세로 책 펼침"],
                  ["horizontal", "가로 테이블탑"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className="mde-chip"
                  aria-pressed={foldPreviewMode === mode}
                  onClick={() => setFoldPreviewMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mde-panel-surface" aria-label="실시간 브라우저 하드웨어 신호등">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-fg">브라우저 하드웨어 · 차세대 API 실시간 신호등</h3>
          <div className="mde-actions-row">
            <span className="mde-badge" data-tone="ready">
              <span className="mde-dot" aria-hidden="true" />
              준비 완료 <span className="mde-num">{capabilityReport.readyCount}</span>
            </span>
            <span className="mde-badge" data-tone="opt-in">
              <span className="mde-dot" aria-hidden="true" />
              옵트인 <span className="mde-num">{capabilityReport.optInCount}</span>
            </span>
            <span className="mde-badge" data-tone="fallback">
              <span className="mde-dot" aria-hidden="true" />
              안전 폴백 <span className="mde-num">{capabilityReport.fallbackCount}</span>
            </span>
          </div>
        </div>

        <div className="mde-capability-grid" data-testid="mde-hardware-traffic-lights">
          {capabilityReport.items.map((item) => (
            <div key={item.id} className="mde-capability-row">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-fg">{item.labelKo}</span>
                <span className="mde-badge" data-tone={item.status}>
                  <span className="mde-dot" aria-hidden="true" />
                  {item.status === "ready" ? "준비" : item.status === "opt-in" ? "옵트인" : "폴백"}
                </span>
              </div>
              <p className="text-[0.7rem] text-fg-3">{item.detailKo}</p>
            </div>
          ))}
        </div>
      </section>

      <div role="tablist" aria-label="멀티 디바이스 체험 탭" className="mde-actions-row">
        {HUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className="mde-tab"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.labelKo}
          </button>
        ))}
      </div>

      {activeTab === "stylus-touch" ? (
        <StudioStylusTouchTestPanel
          statusMessageKo={gestureStatusKo}
          onStatusChange={setGestureStatusKo}
        />
      ) : null}

      {activeTab === "controllers" ? (
        <StudioExternalControllersSection
          syncBridge={activeBridge}
          onCommandFeedback={setGestureStatusKo}
        />
      ) : null}

      {activeTab === "watch-tv" ? (
        <div data-testid="mde-watch-tv-panel" className="mde-split-grid">
          <StudioSmartwatchCompanionView
            handedness={handedness}
            syncBridge={activeBridge}
            onActionFeedback={setGestureStatusKo}
          />
          <StudioSmartTvModeView
            syncBridge={activeBridge}
            onActionFeedback={setGestureStatusKo}
          />
        </div>
      ) : null}

      {activeTab === "spatial-nextgen" ? (
        <StudioSpatialNextGenSection
          syncBridge={activeBridge}
          onCommandFeedback={setGestureStatusKo}
        />
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-fg-2">
        <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
          <Radio className="size-3.5 text-accent" aria-hidden="true" />
          크로스-디바이스 실시간 브릿지 (
          {activeBridge?.transportMode === "broadcast-channel" ? "BroadcastChannel" : "로컬 루프백"})
        </span>
        <span data-testid="mde-sync-feed-latest" className="mde-num text-fg-3">
          {syncFeed[0]
            ? `최근 동기화: ${syncFeed[0]}`
            : "워치·TV·컨트롤러 조작 시 실시간 동기화 이벤트가 기록됩니다."}
        </span>
      </footer>
    </section>
  );
}
