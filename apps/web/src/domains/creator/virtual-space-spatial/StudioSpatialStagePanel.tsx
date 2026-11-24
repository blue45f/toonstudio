/**
 * 가상 스튜디오 3D HRTF 바이노럴 공간 음향 스테이지 · 공간 컴퓨팅 데스크 패널.
 *
 * - Props 없이 단독 렌더 가능하며 Calm Atelier 시맨틱 토큰만 사용한다.
 * - 4종 음향 구역 전환, 인터랙티브 2D 탑다운 스테이지 맵, 동료별 L/R 패닝·거리 감쇄·벽체 차음 시각화,
 *   공중 플로팅 라이트박스 스토리보드 및 3D 공간 고정 피드백 스티커 제어를 제공한다.
 */

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Compass,
  Headphones,
  Layers,
  RotateCcw,
  RotateCw,
  Shield,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { SpatialAcousticMapSvg } from "./SpatialAcousticMapSvg";
import { SpatialLightboxDeskSection } from "./SpatialLightboxDeskSection";
import {
  createSafeSpatialAudioGraph,
  type SpatialBinauralAudioGraph,
} from "./spatial-binaural-graph";
import {
  ACOUSTIC_ZONE_LIST,
  ACTIVITY_LABEL_KO,
  clampNumber,
  createDefaultListenerState,
  createDefaultPeerSources,
  createDefaultStudioWalls,
  evaluateAcousticStageMix,
  formatStereoPanKo,
  type AcousticWallSegment,
  type AcousticZoneId,
  type SpatialListenerState,
  type SpatialPeerAudioSource,
} from "./spatial-binaural-stage";
import {
  computeLightboxCutPose,
  createDefaultSpatialDeskMachine,
  probeSpatialComputingRuntime,
  type FeedbackStickerCategory,
  type LightboxLayoutMode,
  type SpatialRuntimeCapability,
} from "./spatial-computing-desk";

export interface StudioSpatialStagePanelProps {
  readonly initialZoneId?: AcousticZoneId;
  readonly className?: string;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_OUTLINE = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_ACTIVE_CHIP = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

const MOVE_STEP_M = 0.8;

export function StudioSpatialStagePanel({
  initialZoneId = "wood-atelier",
  className,
}: StudioSpatialStagePanelProps = {}): ReactElement {
  const uid = useId();
  const [zoneId, setZoneId] = useState<AcousticZoneId>(initialZoneId);
  const [listener, setListener] = useState<SpatialListenerState>(() =>
    createDefaultListenerState(),
  );
  const [peers, setPeers] = useState<readonly SpatialPeerAudioSource[]>(() =>
    createDefaultPeerSources(),
  );
  const [walls, setWalls] = useState<readonly AcousticWallSegment[]>(() =>
    createDefaultStudioWalls(),
  );
  const [asmrLevelPct, setAsmrLevelPct] = useState<number>(72);
  const [runtimeCap, setRuntimeCap] = useState<SpatialRuntimeCapability>({
    mode: "desktop-3d-workbench",
    supportsImmersiveAr: false,
    supportsImmersiveVr: false,
    supportsSpatialAnchors: false,
    recommendedTableHeightM: 0.92,
    viewingRadiusM: 1.45,
    summaryKo: "데스크톱 3D 공간 라이트박스 시뮬레이션 모드",
  });

  const deskMachineRef = useRef(createDefaultSpatialDeskMachine());
  const audioGraphRef = useRef<SpatialBinauralAudioGraph | null>(null);

  const [deskSnapshot, setDeskSnapshot] = useState(() => deskMachineRef.current.getSnapshot());
  const [selectedCutId, setSelectedCutId] = useState<string>(
    () => deskMachineRef.current.getSnapshot().cuts[0]?.cutId ?? "",
  );
  const [stickerCategory, setStickerCategory] = useState<FeedbackStickerCategory>("composition");
  const [stickerDraft, setStickerDraft] = useState<string>("");
  const [statusNotice, setStatusNotice] = useState<string>("");

  const mixReport = useMemo(
    () =>
      evaluateAcousticStageMix(zoneId, listener, peers, walls, {
        ambientAsmrLevel: asmrLevelPct / 100,
      }),
    [zoneId, listener, peers, walls, asmrLevelPct],
  );

  useEffect(() => {
    let active = true;
    void probeSpatialComputingRuntime().then((cap) => {
      if (active) setRuntimeCap(cap);
    });

    const graph = createSafeSpatialAudioGraph();
    audioGraphRef.current = graph;
    return () => {
      active = false;
      graph.dispose();
      audioGraphRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioGraphRef.current?.syncStageMix(mixReport, peers);
  }, [mixReport, peers]);

  const moveListenerBy = (dx: number, dz: number): void => {
    setListener((prev) => ({
      ...prev,
      position: {
        ...prev.position,
        x: Math.round(clampNumber(prev.position.x + dx, -5.6, 5.6) * 10) / 10,
        z: Math.round(clampNumber(prev.position.z + dz, -4.1, 4.1) * 10) / 10,
      },
    }));
  };

  const moveListenerTo = (worldX: number, worldZ: number): void => {
    setListener((prev) => ({
      ...prev,
      position: { ...prev.position, x: worldX, z: worldZ },
    }));
  };

  const rotateListenerBy = (deltaYawDeg: number): void => {
    setListener((prev) => ({
      ...prev,
      yawDeg: ((prev.yawDeg + deltaYawDeg + 540) % 360) - 180,
    }));
  };

  const handleResetAcousticStage = (): void => {
    setListener(createDefaultListenerState());
    setWalls(createDefaultStudioWalls());
    setPeers(createDefaultPeerSources());
    setAsmrLevelPct(72);
    setStatusNotice("리스너 위치·벽체 차음·동료 믹스를 기본 배치로 되돌렸습니다.");
  };

  const handleToggleWall = (wallId: string): void => {
    setWalls((prev) =>
      prev.map((wall) => (wall.id === wallId ? { ...wall, active: !wall.active } : wall)),
    );
  };

  const handleTogglePeerMute = (peerId: string): void => {
    setPeers((prev) =>
      prev.map((peer) => (peer.peerId === peerId ? { ...peer, muted: !peer.muted } : peer)),
    );
  };

  const syncDeskSnapshot = (notice?: string): void => {
    setDeskSnapshot(deskMachineRef.current.getSnapshot());
    if (notice) setStatusNotice(notice);
  };

  const handleArrangeLightbox = (layoutMode: LightboxLayoutMode): void => {
    deskMachineRef.current.arrangeAllCuts(layoutMode);
    syncDeskSnapshot(
      layoutMode === "curved-arc"
        ? "미고정 컷을 시선 중심 곡면 아크(1.45m)로 재배치했습니다."
        : "미고정 컷을 2열 평면 라이트박스 그리드로 정렬했습니다.",
    );
  };

  const handleAddFloatingCut = (): void => {
    const machine = deskMachineRef.current;
    const current = machine.getSnapshot();
    const nextNum = current.cuts.reduce((maxNum, cut) => Math.max(maxNum, cut.cutNumber), 0) + 1;
    const cutId = `cut-${String(nextNum).padStart(2, "0")}`;
    const pose = computeLightboxCutPose(current.cuts.length, current.cuts.length + 1, current.layoutMode);
    machine.upsertCut({
      cutId,
      cutNumber: nextNum,
      titleKo: `${nextNum}컷 · 신규 공간 스토리보드`,
      sceneTagKo: "신규 배치 · 35mm",
      stage: "rough",
      pose,
      pinned: false,
      layerCount: 4,
    });
    setSelectedCutId(cutId);
    syncDeskSnapshot(`${nextNum}컷을 공중 라이트박스에 추가했습니다.`);
  };

  const handleToggleCutPin = (cutId: string): void => {
    deskMachineRef.current.toggleCutPin(cutId);
    syncDeskSnapshot();
  };

  const handleAdvanceCutStage = (cutId: string): void => {
    deskMachineRef.current.advanceCutStage(cutId);
    syncDeskSnapshot();
  };

  const handleAttachSticker = (): void => {
    const body = stickerDraft.trim();
    if (!body) return;
    const targetCut =
      deskSnapshot.cuts.find((cut) => cut.cutId === selectedCutId) ?? deskSnapshot.cuts[0];
    const anchor = targetCut
      ? {
          x: targetCut.pose.position.x,
          y: targetCut.pose.position.y + 0.08,
          z: targetCut.pose.position.z + 0.05,
        }
      : { x: 0, y: 1.35, z: -1.4 };

    const stickerId = `sticker-${String(deskSnapshot.stickers.length + 1).padStart(2, "0")}-${deskSnapshot.lamportClock + 1}`;
    deskMachineRef.current.attachFeedbackSticker({
      stickerId,
      cutId: targetCut?.cutId ?? null,
      authorNameKo: "나",
      category: stickerCategory,
      bodyKo: body,
      anchorPosition: anchor,
    });
    setStickerDraft("");
    syncDeskSnapshot("3D 공간 피드백 스티커를 선택한 컷에 고정했습니다.");
  };

  const handleToggleStickerResolved = (stickerId: string): void => {
    deskMachineRef.current.toggleStickerResolved(stickerId);
    syncDeskSnapshot();
  };

  const selectedCut =
    deskSnapshot.cuts.find((cut) => cut.cutId === selectedCutId) ?? deskSnapshot.cuts[0] ?? null;

  const visibleStickers = useMemo(() => {
    if (!selectedCut) return deskSnapshot.stickers;
    return deskSnapshot.stickers.filter(
      (sticker) => sticker.cutId === selectedCut.cutId || sticker.cutId === null,
    );
  }, [deskSnapshot.stickers, selectedCut]);

  return (
    <section
      aria-labelledby={`${uid}-heading`}
      className={`flex flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <h3 id={`${uid}-heading`} className="text-base font-bold text-fg">
              가상 스튜디오 3D HRTF 공간 음향 · 공간 컴퓨팅 데스크
            </h3>
          </div>
          <p className="text-xs text-fg-2">
            4종 음향 구역 물리 잔향(RT60)·벽체 차음(dB)·동료 연필 ASMR 바이노럴 믹스와
            공중 플로팅 라이트박스 CRDT 동기화를 제어합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-good/40 bg-good/15 px-2.5 py-1 font-semibold tabular-nums text-good">
            <Compass className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>HRTF 3D · RT60 {mixReport.zone.rt60Sec.toFixed(2)}s</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1 font-medium text-fg-2">
            <Layers className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span>{runtimeCap.summaryKo}</span>
          </span>
        </div>
      </header>

      {/* 4종 음향 구역 선택기 */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg">스튜디오 음향 구역 (4종)</span>
          <span className="text-xs tabular-nums text-fg-3">
            바닥: {mixReport.zone.floorSurfaceKo} · 초기 반사 {mixReport.zone.earlyReflectionMs}ms ·
            잔향 비중 {Math.round(mixReport.zone.reverbWetMix * 100)}%
          </span>
        </div>

        <div
          role="group"
          aria-label="가상 스튜디오 음향 구역 선택"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          {ACOUSTIC_ZONE_LIST.map((zone) => {
            const selected = zone.id === zoneId;
            return (
              <button
                key={zone.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setZoneId(zone.id);
                  setStatusNotice(
                    `${zone.nameKo}(RT60 ${zone.rt60Sec.toFixed(2)}s) 음향 구역으로 전환했습니다.`,
                  );
                }}
                className={`flex min-h-11 cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                  selected
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className={`text-xs font-bold ${selected ? "text-accent" : "text-fg"}`}>
                    {zone.nameKo}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-fg-3">
                    RT60 {zone.rt60Sec.toFixed(2)}s
                  </span>
                </div>
                <span className="text-[11px] text-fg-3">{zone.subtitleKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {statusNotice ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2"
        >
          {statusNotice}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,1.15fr)_minmax(0,1fr)]">
        {/* 좌측: 2D 탑다운 공간 음향 스테이지 + 동료 믹스 */}
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-line bg-canvas p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-fg">
                2D 탑다운 공간 음향 스테이지 (12m × 9m · 클릭해 리스너 이동)
              </span>
              <span className="tabular-nums text-fg-3">
                위치 ({listener.position.x.toFixed(1)}m, {listener.position.z.toFixed(1)}m) ·
                시선 {listener.yawDeg}°
              </span>
            </div>

            <SpatialAcousticMapSvg
              listener={listener}
              peers={peers}
              peerMixes={mixReport.peerMixes}
              walls={walls}
              onMoveListenerTo={moveListenerTo}
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="리스너 이동 및 회전" className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-label="리스너 왼쪽 이동"
                  onClick={() => moveListenerBy(-MOVE_STEP_M, 0)}
                  className={BTN_OUTLINE}
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>좌</span>
                </button>
                <button
                  type="button"
                  aria-label="리스너 앞쪽 이동"
                  onClick={() => moveListenerBy(0, -MOVE_STEP_M)}
                  className={BTN_OUTLINE}
                >
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>전</span>
                </button>
                <button
                  type="button"
                  aria-label="리스너 뒤쪽 이동"
                  onClick={() => moveListenerBy(0, MOVE_STEP_M)}
                  className={BTN_OUTLINE}
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>후</span>
                </button>
                <button
                  type="button"
                  aria-label="리스너 오른쪽 이동"
                  onClick={() => moveListenerBy(MOVE_STEP_M, 0)}
                  className={BTN_OUTLINE}
                >
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>우</span>
                </button>
                <button
                  type="button"
                  aria-label="시선 우측 45도 회전"
                  onClick={() => rotateListenerBy(45)}
                  className={BTN_OUTLINE}
                >
                  <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>+45°</span>
                </button>
                <button type="button" onClick={handleResetAcousticStage} className={BTN_OUTLINE}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>초기화</span>
                </button>
              </div>

              <label className="flex items-center gap-2 text-xs text-fg-2">
                <span>연필 ASMR 감도</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={asmrLevelPct}
                  aria-label="원거리 연필 ASMR 및 발소리 감도"
                  onChange={(e) => setAsmrLevelPct(Number(e.target.value))}
                  className="w-24 accent-accent"
                />
                <span className="w-8 text-right font-semibold tabular-nums text-fg">
                  {asmrLevelPct}%
                </span>
              </label>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-fg-3">벽체 차음:</span>
              {walls.map((wall) => (
                <button
                  key={wall.id}
                  type="button"
                  aria-pressed={wall.active}
                  onClick={() => handleToggleWall(wall.id)}
                  className={wall.active ? BTN_ACTIVE_CHIP : BTN_OUTLINE}
                >
                  <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {wall.labelKo} ({wall.active ? `-${wall.occlusionDb}dB` : "개방"})
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-card px-3 py-2">
              <div className="text-[11px] text-fg-3">가청 동료</div>
              <div className="mt-0.5 text-xs font-bold tabular-nums text-fg">
                {mixReport.audiblePeerCount} / {peers.length}명
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card px-3 py-2">
              <div className="text-[11px] text-fg-3">ASMR·발소리 활성</div>
              <div className="mt-0.5 text-xs font-bold tabular-nums text-good">
                {mixReport.activeAsmrSourceCount}채널
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card px-3 py-2">
              <div className="text-[11px] text-fg-3">최대 벽체 차음</div>
              <div className="mt-0.5 text-xs font-bold tabular-nums text-warn">
                -{mixReport.maxOcclusionDb.toFixed(1)} dB
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card px-3 py-2">
              <div className="text-[11px] text-fg-3">평균 로우패스</div>
              <div className="mt-0.5 text-xs font-bold tabular-nums text-accent">
                {(mixReport.averageEffectiveLowpassHz / 1000).toFixed(1)} kHz
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {peers.map((peer, idx) => {
              const mix = mixReport.peerMixes[idx];
              if (!mix) return null;
              const panBarOffsetPct = Math.round(((mix.stereoPan + 1) / 2) * 100);
              return (
                <div
                  key={peer.peerId}
                  className="flex flex-col gap-1.5 rounded-xl border border-line bg-card p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-fg">{peer.displayNameKo}</span>
                      <span className="rounded-md bg-raised px-2 py-0.5 text-[11px] text-fg-2">
                        {ACTIVITY_LABEL_KO[peer.activity]}
                      </span>
                      {mix.occlusionDb > 0 ? (
                        <span className="rounded-md bg-bad/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-bad">
                          벽체 차음 -{mix.occlusionDb}dB
                        </span>
                      ) : (
                        <span className="rounded-md bg-good/15 px-2 py-0.5 text-[11px] font-semibold text-good">
                          직달 음선
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      aria-label={`${peer.displayNameKo} 음소거 전환`}
                      aria-pressed={peer.muted}
                      onClick={() => handleTogglePeerMute(peer.peerId)}
                      className={BTN_OUTLINE}
                    >
                      {peer.muted ? (
                        <VolumeX className="h-3.5 w-3.5 text-bad" aria-hidden="true" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5 text-good" aria-hidden="true" />
                      )}
                      <span>{peer.muted ? "음소거" : "청취 중"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[120px_1fr]">
                    <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-fg-3">
                      <span>L</span>
                      <div className="relative h-2 flex-1 rounded-full bg-raised">
                        <span
                          className="absolute top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-accent"
                          style={{ left: `${panBarOffsetPct}%` }}
                        />
                      </div>
                      <span>R</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-fg-2">
                      <span>팬 {formatStereoPanKo(mix.stereoPan)}</span>
                      <span>
                        거리 {mix.distanceM.toFixed(1)}m ({mix.distanceAttenuationDb}dB)
                      </span>
                      <span>LPF {mix.effectiveLowpassHz}Hz</span>
                      <span>ITD {mix.itdUs}µs</span>
                      <span>잔향 {Math.round(mix.reverbSendGain * 100)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 우측: 공간 컴퓨팅 플로팅 라이트박스 & 3D 피드백 스티커 */}
        <SpatialLightboxDeskSection
          deskSnapshot={deskSnapshot}
          selectedCut={selectedCut}
          visibleStickers={visibleStickers}
          stickerCategory={stickerCategory}
          stickerDraft={stickerDraft}
          onSelectCut={setSelectedCutId}
          onArrangeLightbox={handleArrangeLightbox}
          onAddFloatingCut={handleAddFloatingCut}
          onToggleCutPin={handleToggleCutPin}
          onAdvanceCutStage={handleAdvanceCutStage}
          onChangeStickerCategory={setStickerCategory}
          onChangeStickerDraft={setStickerDraft}
          onAttachSticker={handleAttachSticker}
          onToggleStickerResolved={handleToggleStickerResolved}
        />
      </div>
    </section>
  );
}
