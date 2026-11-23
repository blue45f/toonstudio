/**
 * 멀티 디바이스 생태계 허브의 외부 컨트롤러(WebHID·게임패드·WebMIDI·풋페달) 및
 * 차세대 공간 입력(웹캠 옵트인 HUD·AR 스마트글라스·WebXR VR 360°/리본 스케치) 체험 섹션.
 */

import { Eye, Footprints, Gamepad2, Glasses, Sliders, Sparkles } from "lucide-react";
import { useId, useRef, useState, type ReactElement } from "react";

import {
  MULTI_DEVICE_SPRITE_PATHS,
  type MultiDeviceSyncBridge,
} from "./device-form-factor-engine";
import {
  FOOT_PEDAL_MAPPINGS,
  GAMEPAD_LEFT_HAND_MAPPINGS,
  WEBHID_CONTROLLER_PRESETS,
  WEBMIDI_CC_BINDINGS,
  appendSpatialRibbonPoint,
  createArSmartGlassTracingState,
  createWebXrDirectorSession,
  createWebcamQuickHudAdapter,
  interpretGamepadSnapshot,
  interpretMidiControlChange,
  resolveFootPedalEvent,
  resolveWebHidPresetCommand,
  setWebXrDirectorMode,
  updateArTracingState,
  type FootPedalSlot,
  type WebHidControllerPresetId,
} from "./peripheral-input-orchestrator";

export interface StudioExternalControllersSectionProps {
  readonly syncBridge: MultiDeviceSyncBridge | null;
  readonly onCommandFeedback: (messageKo: string) => void;
}

export function StudioExternalControllersSection({
  syncBridge,
  onCommandFeedback,
}: StudioExternalControllersSectionProps): ReactElement {
  const midiSliderId = useId();
  const [hidPresetId, setHidPresetId] = useState<WebHidControllerPresetId>("tourbox-neo-elite");
  const [selectedMidiCc, setSelectedMidiCc] = useState<number>(1);
  const [midiRawValue, setMidiRawValue] = useState<number>(64);
  const [voicePedalMode, setVoicePedalMode] = useState<boolean>(false);
  const [lastControllerLog, setLastControllerLog] = useState<string>(
    "TourBox · Loupedeck · 게임패드 · MIDI 노브 · 풋페달 버튼을 눌러 실시간 매핑을 테스트하세요.",
  );

  const hidPreset = WEBHID_CONTROLLER_PRESETS[hidPresetId];
  const midiResult = interpretMidiControlChange(selectedMidiCc, midiRawValue);

  const emitPeripheral = (deviceKind: string, actionId: string, value: number, labelKo: string): void => {
    setLastControllerLog(labelKo);
    syncBridge?.publish({
      kind: "peripheral.command",
      deviceKind,
      actionId,
      value,
    });
    onCommandFeedback(labelKo);
  };

  return (
    <div data-testid="mde-controllers-panel" className="mde-split-grid">
      <section className="mde-panel-surface" aria-label="WebHID 및 조이콘 게임패드 제어">
        <div className="flex items-center gap-2.5">
          <img
            src={MULTI_DEVICE_SPRITE_PATHS.dialPad}
            alt="WebHID 왼손 다이얼 패드 아이콘"
            width={40}
            height={40}
            className="mde-sprite-img"
            loading="lazy"
          />
          <div>
            <h3 className="text-sm font-bold text-fg">TourBox · Loupedeck WebHID 프리셋</h3>
            <p className="text-xs text-fg-2">{hidPreset.descriptionKo}</p>
          </div>
        </div>

        <div className="mde-actions-row" role="group" aria-label="WebHID 장치 선택">
          {(["tourbox-neo-elite", "loupedeck-ct-live"] as const).map((presetId) => (
            <button
              key={presetId}
              type="button"
              className="mde-chip"
              aria-pressed={hidPresetId === presetId}
              onClick={() => setHidPresetId(presetId)}
            >
              {WEBHID_CONTROLLER_PRESETS[presetId].displayName}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {hidPreset.bindings.map((binding) => (
            <button
              key={binding.controlId}
              type="button"
              className="mde-chip"
              onClick={() => {
                const resolved = resolveWebHidPresetCommand(hidPresetId, binding.controlId);
                if (!resolved) return;
                emitPeripheral(
                  hidPresetId,
                  resolved.actionId,
                  resolved.stepValue,
                  `${hidPreset.displayName} [${resolved.controlLabelKo}] → ${resolved.actionLabelKo}`,
                );
              }}
            >
              {binding.controlLabelKo} · {binding.actionLabelKo}
            </button>
          ))}
        </div>

        <div className="mde-divider-block">
          <h4 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
            <Gamepad2 className="size-4 text-accent" aria-hidden="true" />
            조이콘 · 게임패드 왼손 단축키 매핑
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {GAMEPAD_LEFT_HAND_MAPPINGS.slice(2, 6).map((item) => (
              <button
                key={item.inputKey}
                type="button"
                className="mde-chip"
                onClick={() => {
                  const cmd = interpretGamepadSnapshot({ pressedButtons: [item.inputKey] });
                  emitPeripheral("gamepad", item.actionId, 1, `${item.labelKo} → ${cmd.summaryKo}`);
                }}
              >
                {item.labelKo}: {item.actionLabelKo}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mde-panel-surface" aria-label="WebMIDI 노브 및 USB 풋페달 제어">
        <div className="flex items-center gap-2">
          <Sliders className="size-4 text-accent" aria-hidden="true" />
          <h3 className="text-sm font-bold text-fg">WebMIDI 노브 바인딩 (CC 0–127)</h3>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="MIDI CC 채널 선택">
          {WEBMIDI_CC_BINDINGS.map((item) => (
            <button
              key={item.ccNumber}
              type="button"
              className="mde-chip"
              aria-pressed={selectedMidiCc === item.ccNumber}
              onClick={() => setSelectedMidiCc(item.ccNumber)}
            >
              CC {item.ccNumber} · {item.targetLabelKo}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor={midiSliderId} className="block text-xs font-semibold text-fg-2">
            노브 실시간 값:{" "}
            <span className="mde-num font-bold text-fg">
              {midiResult?.formattedLabelKo ?? `${midiRawValue}`}
            </span>
          </label>
          <input
            id={midiSliderId}
            type="range"
            min={0}
            max={127}
            value={midiRawValue}
            onChange={(event) => {
              const nextRaw = Number(event.target.value);
              setMidiRawValue(nextRaw);
              const mapped = interpretMidiControlChange(selectedMidiCc, nextRaw);
              if (mapped) {
                emitPeripheral(
                  "webmidi",
                  mapped.binding.targetParam,
                  mapped.mappedValue,
                  `WebMIDI ${mapped.binding.knobLabelKo} → ${mapped.formattedLabelKo}`,
                );
              }
            }}
            className="mde-range"
          />
        </div>

        <div className="mde-divider-block">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
              <Footprints className="size-4 text-accent" aria-hidden="true" />
              USB 3단 풋페달 매핑
            </h4>
            <button
              type="button"
              className="mde-chip"
              aria-pressed={voicePedalMode}
              onClick={() => setVoicePedalMode((prev) => !prev)}
            >
              우측 페달: {voicePedalMode ? "음성 말풍선 녹음" : "손바닥 이동"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["left", "center", "right"] as readonly FootPedalSlot[]).map((slot) => (
              <button
                key={slot}
                type="button"
                className="mde-btn"
                onClick={() => {
                  const evt = resolveFootPedalEvent(slot, true, voicePedalMode);
                  emitPeripheral("foot-pedal", evt.actionId, 1, evt.labelKo);
                }}
              >
                {FOOT_PEDAL_MAPPINGS[slot].labelKo} ({FOOT_PEDAL_MAPPINGS[slot].actionLabelKo})
              </button>
            ))}
          </div>
        </div>

        <p role="status" aria-live="polite" className="text-xs text-fg-2">
          {lastControllerLog}
        </p>
      </section>
    </div>
  );
}

export interface StudioSpatialNextGenSectionProps {
  readonly syncBridge: MultiDeviceSyncBridge | null;
  readonly onCommandFeedback: (messageKo: string) => void;
}

export function StudioSpatialNextGenSection({
  syncBridge,
  onCommandFeedback,
}: StudioSpatialNextGenSectionProps): ReactElement {
  const arOpacityId = useId();
  const webcamAdapterRef = useRef(createWebcamQuickHudAdapter());
  const [webcamState, setWebcamState] = useState(() => webcamAdapterRef.current.getState());
  const [arState, setArState] = useState(() => createArSmartGlassTracingState());
  const [xrSession, setXrSession] = useState(() => createWebXrDirectorSession("director-360"));

  const handleWebcamConsentToggle = (): void => {
    const next = webcamAdapterRef.current.setOptInConsent(!webcamState.optInConsented);
    setWebcamState(next);
    onCommandFeedback(next.lastTriggeredActionKo);
  };

  const handleWebcamTest = (
    signal: Parameters<ReturnType<typeof createWebcamQuickHudAdapter>["processSignal"]>[0],
  ): void => {
    const next = webcamAdapterRef.current.processSignal(signal);
    setWebcamState(next);
    onCommandFeedback(next.lastTriggeredActionKo);
  };

  const handleAddRibbonPoint = (): void => {
    const idx = xrSession.ribbonPoints.length + 1;
    const next = appendSpatialRibbonPoint(xrSession, {
      x: Math.cos(idx * 0.7) * 1.2,
      y: 1.4 + Math.sin(idx * 0.5) * 0.35,
      z: -1.8 + idx * 0.12,
      widthCm: 2.4,
    });
    setXrSession(next);
    syncBridge?.publish({
      kind: "peripheral.command",
      deviceKind: "webxr-vr",
      actionId: "spatial-ribbon.append",
      value: next.ribbonPoints.length,
    });
    onCommandFeedback(next.statusKo);
  };

  return (
    <div data-testid="mde-spatial-panel" className="mde-split-grid">
      <section className="mde-panel-surface" aria-label="웹캠 표정 시선 HUD 및 AR 스마트글라스">
        <div className="flex items-center gap-2.5">
          <img
            src={MULTI_DEVICE_SPRITE_PATHS.arGlasses}
            alt="AR 스마트글라스 투시 트레이싱 아이콘"
            width={40}
            height={40}
            className="mde-sprite-img"
            loading="lazy"
          />
          <div>
            <h3 className="text-sm font-bold text-fg">웹캠 표정·손·시선 퀵 HUD (옵트인) · AR 글라스</h3>
            <p className="text-xs text-fg-2">{webcamState.privacyNoticeKo}</p>
          </div>
        </div>

        <div className="mde-actions-row">
          <button
            type="button"
            data-testid="webcam-optin-toggle"
            className="mde-btn"
            aria-pressed={webcamState.optInConsented}
            onClick={handleWebcamConsentToggle}
          >
            <Eye className="size-4" aria-hidden="true" />
            {webcamState.optInConsented ? "웹캠 퀵 HUD 동의됨 (활성)" : "웹캠 퀵 HUD 옵트인 켜기"}
          </button>
          <span className="mde-badge" data-tone={webcamState.active ? "ready" : "opt-in"}>
            {webcamState.lastTriggeredActionKo}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="mde-chip"
            disabled={!webcamState.optInConsented}
            onClick={() => handleWebcamTest({ kind: "expression", expression: "brow-raise" })}
          >
            눈썹 올림 → 퀵 HUD
          </button>
          <button
            type="button"
            className="mde-chip"
            disabled={!webcamState.optInConsented}
            onClick={() => handleWebcamTest({ kind: "gaze", zone: "left-rail" })}
          >
            좌측 시선 → 도구 강조
          </button>
          <button
            type="button"
            className="mde-chip"
            disabled={!webcamState.optInConsented}
            onClick={() => handleWebcamTest({ kind: "hand", gesture: "open-palm" })}
          >
            손바닥 → 레퍼런스 토글
          </button>
        </div>

        <div className="mde-divider-block">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
              <Glasses className="size-4 text-accent" aria-hidden="true" />
              AR 스마트글라스 종이 투시 트레이싱
            </h4>
            <button
              type="button"
              className="mde-chip"
              aria-pressed={arState.anchorLocked}
              onClick={() => setArState((prev) => updateArTracingState(prev, { active: true, anchorLocked: !prev.anchorLocked }))}
            >
              {arState.anchorLocked ? "3점 투시 앵커 고정됨" : "3점 투시 앵커 고정"}
            </button>
          </div>
          <label htmlFor={arOpacityId} className="block text-xs text-fg-2">
            투시 오버레이 불투명도:{" "}
            <span className="mde-num font-bold text-fg">{Math.round(arState.overlayOpacity * 100)}%</span>
          </label>
          <input
            id={arOpacityId}
            type="range"
            min={15}
            max={85}
            value={Math.round(arState.overlayOpacity * 100)}
            onChange={(event) =>
              setArState((prev) =>
                updateArTracingState(prev, { active: true, overlayOpacity: Number(event.target.value) / 100 }),
              )
            }
            className="mde-range"
          />
        </div>
      </section>

      <section className="mde-panel-surface" aria-label="WebXR VR 360도 디렉터 및 공간 리본 스케치">
        <div className="flex items-center gap-2.5">
          <img
            src={MULTI_DEVICE_SPRITE_PATHS.vrHeadset}
            alt="WebXR VR 헤드셋 아이콘"
            width={40}
            height={40}
            className="mde-sprite-img"
            loading="lazy"
          />
          <div>
            <h3 className="text-sm font-bold text-fg">WebXR VR 360° 디렉터 · 공간 리본 스케치</h3>
            <p className="text-xs text-fg-2">{xrSession.statusKo}</p>
          </div>
        </div>

        <div className="mde-actions-row" role="group" aria-label="WebXR 세션 모드">
          <button
            type="button"
            className="mde-chip"
            aria-pressed={xrSession.mode === "director-360"}
            onClick={() => setXrSession((prev) => setWebXrDirectorMode(prev, "director-360", true))}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            360° 무대 디렉터
          </button>
          <button
            type="button"
            className="mde-chip"
            aria-pressed={xrSession.mode === "spatial-ribbon-sketch"}
            onClick={() => setXrSession((prev) => setWebXrDirectorMode(prev, "spatial-ribbon-sketch", true))}
          >
            6DoF 공간 리본 스케치
          </button>
        </div>

        <div className="mde-actions-row">
          <button
            type="button"
            data-testid="webxr-append-ribbon-point"
            className="mde-btn"
            onClick={handleAddRibbonPoint}
          >
            공간 리본 3D 좌표 추가 ({xrSession.ribbonPoints.length}점)
          </button>
        </div>

        <p className="text-xs text-fg-2">
          WebXR 미지원 데스크톱·태블릿에서도 360° 카메라 각도와 공간 리본 궤적을 미리보기로 검증할 수 있습니다.
        </p>
      </section>
    </div>
  );
}
