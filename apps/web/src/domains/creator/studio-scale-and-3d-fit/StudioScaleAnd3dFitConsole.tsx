import { useMemo, useState } from "react";
import {
  ArrowRight,
  Cpu,
  Flame,
  LampDesk,
  Lock,
  Monitor,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import {
  buildWebtoon3dGenPipelinePlan,
  computeCharacterItemAutoFit,
  type ItemRigidity,
  type Webtoon3dAssetKind,
} from "./character-3d-item-autofit-engine";
import {
  advancePomodoroWorkdeskPhase,
  createMonitorPresetScreens,
  createVirtualWorkdeskSession,
  planMultiMonitorLayout,
  probeMultiMonitorEnvironment,
  triggerVirtualCameraShutter,
  updateWebcamMirrorBoothState,
  type MonitorTopologyId,
  type VirtualWorkdeskSession,
  type WorkdeskLightingPresetId,
} from "./multi-monitor-and-virtual-workdesk";
import {
  AutoFitAndWebtoon3dTabView,
  MultiMonitorPopoutTabView,
  VirtualWorkdeskTabView,
} from "./StudioScaleAnd3dFitDetailTabs";
import { STUDIO_SCALE_FIT_SPRITE_PATHS } from "./vrm-autofit-socket-registry";
import {
  STUDIO_TEAM_SCALE_ORDER,
  STUDIO_TEAM_SCALE_PRESETS,
  buildOutsourceCutSandboxPackage,
  computeDeadlineBottleneckHeatmap,
  createBatonTouchHandoff,
  distributeParallelRenderQueue,
  resolveTeamScaleWorkspaceConfig,
  type RelayLaneDefinition,
  type TeamScaleTierId,
} from "./team-scale-adaptive-mode";

import "./studio-scale-and-3d-fit.css";

export interface StudioScaleAnd3dFitConsoleProps {
  readonly initialScaleTier?: TeamScaleTierId;
  readonly initialTab?: "team-scale" | "autofit-3d" | "multi-monitor" | "virtual-workdesk";
  readonly projectTitleKo?: string;
}

type ConsoleTabId = "team-scale" | "autofit-3d" | "multi-monitor" | "virtual-workdesk";

const SAMPLE_STAGE_WORKLOADS = [
  { stageKo: "선화", queuedCuts: 18, activeArtists: 2, avgMinutesPerCut: 24, hoursUntilDeadline: 6 },
  { stageKo: "밑색", queuedCuts: 22, activeArtists: 2, avgMinutesPerCut: 18, hoursUntilDeadline: 4 },
  { stageKo: "명암·채색", queuedCuts: 28, activeArtists: 2, avgMinutesPerCut: 30, hoursUntilDeadline: 5 },
  { stageKo: "3D 배경", queuedCuts: 10, activeArtists: 1, avgMinutesPerCut: 20, hoursUntilDeadline: 6 },
] as const;

const SAMPLE_BOM_ASSETS = [
  {
    assetId: "font-pretendard",
    titleKo: "상업용 본문 폰트",
    kind: "font" as const,
    licenseCleared: true,
    allowOutsourceRedistribution: true,
  },
  {
    assetId: "bg3d-rooftop",
    titleKo: "옥상 3D 스테이지",
    kind: "3d-bg" as const,
    licenseCleared: true,
    allowOutsourceRedistribution: true,
  },
] as const;

const SAMPLE_RENDER_JOBS = [
  { jobId: "cut-01-3d", titleKo: "1컷 옥상 3층 패스", estimatedSeconds: 42, priority: "urgent" as const },
  { jobId: "cut-08-3d", titleKo: "8컷 차량 추격 3층 패스", estimatedSeconds: 55, priority: "urgent" as const },
  { jobId: "cut-14-3d", titleKo: "14컷 복도 3층 패스", estimatedSeconds: 28, priority: "normal" as const },
  { jobId: "cut-21-3d", titleKo: "21컷 클라이맥스 렌더", estimatedSeconds: 36, priority: "batch" as const },
] as const;

export function StudioScaleAnd3dFitConsole({
  initialScaleTier = "solo",
  initialTab = "team-scale",
  projectTitleKo = "툰스튜디오 실무 통합 콘솔",
}: StudioScaleAnd3dFitConsoleProps) {
  const [activeTab, setActiveTab] = useState<ConsoleTabId>(initialTab);
  const [scaleTier, setScaleTier] = useState<TeamScaleTierId>(initialScaleTier);
  const [relayLaneId, setRelayLaneId] = useState<RelayLaneDefinition["id"]>("story-lineart");
  const [batonNoticeKo, setBatonNoticeKo] = useState<string | null>(null);

  // 3D 자연 밀착 & 웹툰 3D 생성 상태
  const [selectedSocketId, setSelectedSocketId] = useState<string>("head-nose-bridge");
  const [rigidity, setRigidity] = useState<ItemRigidity>("semi-flexible");
  const [antiClipOffsetMm, setAntiClipOffsetMm] = useState<number>(2.0);
  const [curveWrapStrength, setCurveWrapStrength] = useState<number>(0.65);
  const [scaleMultiplier, setScaleMultiplier] = useState<number>(1.0);
  const [poseBendDeg, setPoseBendDeg] = useState<number>(25);
  const [genAssetKind, setGenAssetKind] = useState<Webtoon3dAssetKind>("character");

  // 멀티 모니터 팝아웃 상태
  const [monitorTopology, setMonitorTopology] = useState<MonitorTopologyId>("dual-monitor");

  // 가상 스튜디오 화실 상태
  const [workdeskSession, setWorkdeskSession] = useState<VirtualWorkdeskSession>(() =>
    createVirtualWorkdeskSession({ episodeTitleKo: `${projectTitleKo} · 제14화` }),
  );

  const scaleConfig = useMemo(() => resolveTeamScaleWorkspaceConfig(scaleTier), [scaleTier]);
  const heatmapCells = useMemo(() => computeDeadlineBottleneckHeatmap(SAMPLE_STAGE_WORKLOADS), []);
  const sandboxPackage = useMemo(
    () =>
      buildOutsourceCutSandboxPackage({
        episodeId: "ep14",
        cutIds: ["cut-11", "cut-12", "cut-13", "cut-14"],
        recipientId: "partner-color-02",
        expiresInHours: 48,
        bomAssets: SAMPLE_BOM_ASSETS,
      }),
    [],
  );
  const renderQueuePlan = useMemo(
    () => distributeParallelRenderQueue(SAMPLE_RENDER_JOBS, ["gpu-node-A", "gpu-node-B", "gpu-node-C"]),
    [],
  );

  const fitResult = useMemo(
    () =>
      computeCharacterItemAutoFit({
        socketId: selectedSocketId,
        itemNameKo: "3D 착용 아이템",
        itemCategory: "glasses",
        rigidity,
        body: {
          heightCm: 172,
          shoulderWidthRatio: 1.04,
          torsoDepthRatio: 1.0,
          limbThicknessRatio: 1.0,
          clothLayerThicknessMm: 1.8,
          poseBendDeg,
        },
        userAntiClipOffsetMm: antiClipOffsetMm,
        userCurveWrapStrength: curveWrapStrength,
        userScaleMultiplier: scaleMultiplier,
      }),
    [selectedSocketId, rigidity, poseBendDeg, antiClipOffsetMm, curveWrapStrength, scaleMultiplier],
  );

  const genPlan = useMemo(
    () =>
      buildWebtoon3dGenPipelinePlan({
        assetKind: genAssetKind,
        assetTitleKo: genAssetKind === "character" ? "주인공 VRM 3D" : genAssetKind === "background" ? "옥상 3D 배경" : "커스텀 소품",
        inputSource: "single-sketch",
        celBands: 3,
      }),
    [genAssetKind],
  );

  const monitorScreens = useMemo(() => createMonitorPresetScreens(monitorTopology), [monitorTopology]);
  const monitorLayout = useMemo(
    () => planMultiMonitorLayout({ screens: monitorScreens, includeReaderMobilePreview: true }),
    [monitorScreens],
  );
  const monitorProbe = useMemo(() => probeMultiMonitorEnvironment(), []);

  const handleApplyAutoCorrection = () => {
    setAntiClipOffsetMm(fitResult.suggestedPatch.antiClipOffsetMm);
    setCurveWrapStrength(fitResult.suggestedPatch.curveWrapStrength);
    setScaleMultiplier(fitResult.suggestedPatch.scaleMultiplier);
  };

  const handleBatonTouch = () => {
    const result = createBatonTouchHandoff(relayLaneId, "메인 작가", "11~20컷");
    setBatonNoticeKo(result.statusMessageKo);
    if (result.toLane) {
      setRelayLaneId(result.toLane.id);
    } else {
      setRelayLaneId("story-lineart");
    }
  };

  const handleSelectLighting = (lightingId: WorkdeskLightingPresetId) => {
    setWorkdeskSession((prev) => ({
      ...prev,
      pomodoroRhythm: {
        ...prev.pomodoroRhythm,
        lightingPresetId: lightingId,
        activeLighting: advancePomodoroWorkdeskPhase(prev, lightingId).pomodoroRhythm.activeLighting,
      },
    }));
  };

  return (
    <section
      className="ts-scale-fit"
      data-testid="studio-scale-and-3d-fit-console"
      aria-label="규모별 적응 모드 · 3D 자연 밀착 · 멀티 모니터 · 가상 화실 콘솔"
    >
      <header className="ts-scale-fit__header">
        <div className="ts-scale-fit__hero-id">
          <img
            src={STUDIO_SCALE_FIT_SPRITE_PATHS.production}
            alt=""
            aria-hidden="true"
            className="ts-scale-fit__emblem"
            width={52}
            height={52}
          />
          <div>
            <h2 className="ts-scale-fit__title">{projectTitleKo}</h2>
            <p className="ts-scale-fit__subtitle">
              1인~30인+ 자동 적응 · 42-소켓 Anti-Clip 자연 밀착 · 멀티 모니터 팝아웃 · 50/10 가상 화실
            </p>
          </div>
        </div>
        <div className="ts-scale-fit__badge-row">
          <span className="ts-scale-fit__pill" data-tone="accent" data-testid="active-scale-pill">
            {scaleConfig.preset.labelKo}
          </span>
          <span className="ts-scale-fit__pill" data-tone="good">
            캔버스 {scaleConfig.canvasViewportTargetPct}%
          </span>
          <span className="ts-scale-fit__pill">
            숨김 크롬 {scaleConfig.hiddenClutterCount}개
          </span>
        </div>
      </header>

      <div className="ts-scale-fit__tablist" role="tablist" aria-label="실무 혁신 기능 영역">
        {(
          [
            ["team-scale", "규모별 적응 모드", Users],
            ["autofit-3d", "3D 자연 밀착 · 3층 생성", Sparkles],
            ["multi-monitor", "멀티 모니터 팝아웃", Monitor],
            ["virtual-workdesk", "가상 화실 · 포모도로", LampDesk],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className="ts-scale-fit__tab"
            data-testid={`scale-fit-tab-${id}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {activeTab === "team-scale" ? (
        <div className="ts-scale-fit__card" data-testid="team-scale-panel">
          <div className="ts-scale-fit__grid-4" role="group" aria-label="창작 인원 규모 4단계 전환">
            {STUDIO_TEAM_SCALE_ORDER.map((tierId) => {
              const preset = STUDIO_TEAM_SCALE_PRESETS[tierId];
              return (
                <button
                  key={tierId}
                  type="button"
                  className="ts-scale-fit__scale-btn"
                  aria-pressed={scaleTier === tierId}
                  data-testid={`scale-tier-btn-${tierId}`}
                  onClick={() => {
                    setScaleTier(tierId);
                    setBatonNoticeKo(null);
                  }}
                >
                  {preset.labelKo}
                </button>
              );
            })}
          </div>

          <p className="ts-scale-fit__meta" data-testid="scale-tier-tagline">
            {scaleConfig.preset.taglineKo}
          </p>

          <div className="ts-scale-fit__grid-2">
            <section className="ts-scale-fit__card" aria-label="활성화된 작업 모듈">
              <div className="ts-scale-fit__card-head">
                <h3 className="ts-scale-fit__card-title">자동 활성화 모듈</h3>
                <span className="ts-scale-fit__pill" data-tone="good">
                  {scaleConfig.activeModuleCount}개 활성
                </span>
              </div>
              <ul className="ts-scale-fit__list">
                {scaleConfig.preset.activeHighlightsKo.map((item) => (
                  <li key={item} className="ts-scale-fit__list-item">
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {scaleConfig.preset.hiddenClutterKo.length > 0 ? (
                <p className="ts-scale-fit__meta" data-testid="hidden-clutter-summary">
                  자동 숨김: {scaleConfig.preset.hiddenClutterKo.join(" · ")}
                </p>
              ) : null}
            </section>

            <section className="ts-scale-fit__card" aria-label="규모별 특화 제어">
              {scaleTier === "solo" ? (
                <>
                  <h3 className="ts-scale-fit__card-title">1인 작가 AI 멀티 어시스턴트 도크</h3>
                  <p className="ts-scale-fit__meta">
                    결재·배정 UI를 0%로 숨기고 캔버스 {scaleConfig.canvasViewportTargetPct}%와
                    AI 밑색·3D 배경·식자 어시스턴트를 전면에 배치했습니다.
                  </p>
                </>
              ) : null}

              {scaleTier === "small-team" ? (
                <>
                  <div className="ts-scale-fit__card-head">
                    <h3 className="ts-scale-fit__card-title">2~3인 3레인 릴레이 &amp; 바통 터치</h3>
                    <span className="ts-scale-fit__pill" data-tone="accent">
                      <Lock size={13} aria-hidden="true" /> 레이어 자동 잠금
                    </span>
                  </div>
                  <ul className="ts-scale-fit__list">
                    {scaleConfig.preset.relayLanes.map((lane) => (
                      <li key={lane.id} className="ts-scale-fit__list-item">
                        <span>{lane.labelKo}</span>
                        <span>{relayLaneId === lane.id ? "작업 중" : "대기/잠금"}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="ts-scale-fit__btn ts-scale-fit__btn--primary"
                    data-testid="baton-touch-btn"
                    onClick={handleBatonTouch}
                  >
                    <ArrowRight size={15} aria-hidden="true" />
                    1클릭 바통 터치 인계
                  </button>
                  {batonNoticeKo ? (
                    <p className="ts-scale-fit__notice" role="status">
                      {batonNoticeKo}
                    </p>
                  ) : null}
                </>
              ) : null}

              {scaleTier === "production-team" ? (
                <>
                  <div className="ts-scale-fit__card-head">
                    <h3 className="ts-scale-fit__card-title">
                      <Flame size={15} aria-hidden="true" /> 마감 병목 히트맵 &amp; 바이블 락
                    </h3>
                    <span className="ts-scale-fit__pill" data-tone="good">
                      바이블·팔레트 강제 동기화
                    </span>
                  </div>
                  <ul className="ts-scale-fit__list">
                    {heatmapCells.map((cell) => (
                      <li key={cell.stageKo} className="ts-scale-fit__list-item">
                        <span>
                          <strong>{cell.stageKo}</strong> ({cell.queuedCuts}컷 · 예상{" "}
                          {cell.estimatedHoursRemaining}h)
                        </span>
                        <span
                          className="ts-scale-fit__pill"
                          data-tone={
                            cell.severity === "critical"
                              ? "bad"
                              : cell.severity === "bottleneck"
                                ? "warn"
                                : "good"
                          }
                        >
                          {cell.severity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {scaleTier === "enterprise-studio" ? (
                <>
                  <div className="ts-scale-fit__card-head">
                    <h3 className="ts-scale-fit__card-title">
                      <ShieldCheck size={15} aria-hidden="true" /> 외주 컷 샌드박스 · 병렬 렌더 큐
                    </h3>
                    <span className="ts-scale-fit__pill" data-tone="good">
                      <Cpu size={13} aria-hidden="true" /> {renderQueuePlan.speedupFactor}x 병렬
                    </span>
                  </div>
                  <p className="ts-scale-fit__meta">{sandboxPackage.auditSummaryKo}</p>
                  <ul className="ts-scale-fit__list">
                    {renderQueuePlan.workers.map((worker) => (
                      <li key={worker.workerId} className="ts-scale-fit__list-item">
                        <span>
                          {worker.workerId} ({worker.assignedJobIds.length}작업)
                        </span>
                        <span className="ts-scale-fit__num">{worker.totalEstimatedSeconds}초</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === "autofit-3d" ? (
        <AutoFitAndWebtoon3dTabView
          selectedSocketId={selectedSocketId}
          onSelectSocketId={setSelectedSocketId}
          rigidity={rigidity}
          onSelectRigidity={setRigidity}
          antiClipOffsetMm={antiClipOffsetMm}
          onChangeAntiClipOffsetMm={setAntiClipOffsetMm}
          curveWrapStrength={curveWrapStrength}
          onChangeCurveWrapStrength={setCurveWrapStrength}
          scaleMultiplier={scaleMultiplier}
          onChangeScaleMultiplier={setScaleMultiplier}
          poseBendDeg={poseBendDeg}
          onChangePoseBendDeg={setPoseBendDeg}
          fitResult={fitResult}
          onApplyAutoCorrection={handleApplyAutoCorrection}
          genAssetKind={genAssetKind}
          onSelectGenAssetKind={setGenAssetKind}
          genPlan={genPlan}
        />
      ) : null}

      {activeTab === "multi-monitor" ? (
        <MultiMonitorPopoutTabView
          topology={monitorTopology}
          onSelectTopology={setMonitorTopology}
          screens={monitorScreens}
          layoutPlan={monitorLayout}
          envProbe={monitorProbe}
        />
      ) : null}

      {activeTab === "virtual-workdesk" ? (
        <VirtualWorkdeskTabView
          session={workdeskSession}
          onSelectLighting={handleSelectLighting}
          onAdvancePomodoro={() =>
            setWorkdeskSession((prev) => advancePomodoroWorkdeskPhase(prev))
          }
          onTriggerShutter={() =>
            setWorkdeskSession((prev) =>
              triggerVirtualCameraShutter(prev, {
                cutNumber: prev.reviewTable.activeCutNumber + 1,
                cameraPresetKo: "로우앵글 액션 35mm",
                focalLengthMm: 35,
                includeThreeLayerPasses: true,
              }),
            )
          }
          onToggleWebcamMirror={() =>
            setWorkdeskSession((prev) =>
              updateWebcamMirrorBoothState(prev, {
                enabled: !prev.webcamMirrorBooth.enabled,
              }),
            )
          }
        />
      ) : null}
    </section>
  );
}

export default StudioScaleAnd3dFitConsole;
