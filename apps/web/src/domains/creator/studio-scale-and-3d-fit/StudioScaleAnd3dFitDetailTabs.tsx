import {
  Camera, CheckCircle2, Eye, LampDesk, Layers, Monitor, Moon, ShieldAlert, Sparkles, Sun, Sunset, Users, Wand2,
} from "lucide-react";

import {
  ANTI_CLIP_OFFSET_RANGE_MM,
  VRM_AUTO_FIT_SOCKETS,
  VRM_AUTO_FIT_SOCKET_COUNT,
  VRM_SOCKET_GROUP_LABELS,
  type CharacterItemAutoFitResult,
  type ItemRigidity,
  type VrmSocketGroupId,
  type Webtoon3dAssetKind,
  type Webtoon3dGenPipelinePlan,
} from "./character-3d-item-autofit-engine";
import { STUDIO_SCALE_FIT_SPRITE_PATHS } from "./vrm-autofit-socket-registry";
import {
  VIRTUAL_WORKDESK_LIGHTING_ORDER,
  VIRTUAL_WORKDESK_LIGHTING_PRESETS,
  type DisplayScreenDescriptor,
  type MonitorTopologyId,
  type MultiMonitorEnvironmentProbe,
  type MultiMonitorLayoutPlan,
  type VirtualWorkdeskSession,
  type WorkdeskLightingPresetId,
} from "./multi-monitor-and-virtual-workdesk";

export interface AutoFit3dTabProps {
  readonly selectedSocketId: string;
  readonly onSelectSocketId: (socketId: string) => void;
  readonly rigidity: ItemRigidity;
  readonly onSelectRigidity: (rigidity: ItemRigidity) => void;
  readonly antiClipOffsetMm: number;
  readonly onChangeAntiClipOffsetMm: (value: number) => void;
  readonly curveWrapStrength: number;
  readonly onChangeCurveWrapStrength: (value: number) => void;
  readonly scaleMultiplier: number;
  readonly onChangeScaleMultiplier: (value: number) => void;
  readonly poseBendDeg: number;
  readonly onChangePoseBendDeg: (value: number) => void;
  readonly fitResult: CharacterItemAutoFitResult;
  readonly onApplyAutoCorrection: () => void;
  readonly genAssetKind: Webtoon3dAssetKind;
  readonly onSelectGenAssetKind: (kind: Webtoon3dAssetKind) => void;
  readonly genPlan: Webtoon3dGenPipelinePlan;
}

const SOCKET_GROUPS: readonly VrmSocketGroupId[] = [
  "head", "neck", "chest", "leftHand", "rightHand", "hips", "back", "feet",
];

function scoreTone(grade: CharacterItemAutoFitResult["fitGrade"]): "good" | "warn" | "bad" {
  if (grade === "seamless" || grade === "good") return "good";
  if (grade === "needs-tweak") return "warn";
  return "bad";
}

export function AutoFitAndWebtoon3dTabView({
  selectedSocketId,
  onSelectSocketId,
  rigidity,
  onSelectRigidity,
  antiClipOffsetMm,
  onChangeAntiClipOffsetMm,
  curveWrapStrength,
  onChangeCurveWrapStrength,
  scaleMultiplier,
  onChangeScaleMultiplier,
  poseBendDeg,
  onChangePoseBendDeg,
  fitResult,
  onApplyAutoCorrection,
  genAssetKind,
  onSelectGenAssetKind,
  genPlan,
}: AutoFit3dTabProps) {
  const tone = scoreTone(fitResult.fitGrade);

  return (
    <div className="ts-scale-fit__grid-2" data-testid="scale-fit-3d-panel">
      <section className="ts-scale-fit__card" aria-labelledby="sf-autofit-heading">
        <div className="ts-scale-fit__card-head">
          <div className="ts-scale-fit__hero-id">
            <img
              src={STUDIO_SCALE_FIT_SPRITE_PATHS.vrm}
              alt=""
              aria-hidden="true"
              className="ts-scale-fit__sprite-sm"
              width={28}
              height={28}
            />
            <h3 id="sf-autofit-heading" className="ts-scale-fit__card-title">
              42-소켓 VRM 자연 밀착 &amp; Anti-Clip
            </h3>
          </div>
          <span className="ts-scale-fit__pill" data-tone={tone} data-testid="fit-confidence-badge">
            {fitResult.isSkinSafe ? (
              <CheckCircle2 size={14} aria-hidden="true" />
            ) : (
              <ShieldAlert size={14} aria-hidden="true" />
            )}
            밀착도 {fitResult.fitConfidenceScore}점
          </span>
        </div>

        <p className="ts-scale-fit__meta">
          정본 {VRM_AUTO_FIT_SOCKET_COUNT}개 소켓 중{" "}
          <span className="ts-scale-fit__num">{fitResult.socket.vrmBone}</span> 본에 자동 스냅 ·
          피부 뚫림 방지 권장 {ANTI_CLIP_OFFSET_RANGE_MM.min}~{ANTI_CLIP_OFFSET_RANGE_MM.max}mm
        </p>

        <div className="ts-scale-fit__field">
          <label htmlFor="sf-socket-select" className="ts-scale-fit__label">
            <span>VRM 본 소켓 선택 (42종)</span>
            <span className="ts-scale-fit__num">{fitResult.socket.id}</span>
          </label>
          <select
            id="sf-socket-select"
            className="ts-scale-fit__select"
            value={selectedSocketId}
            onChange={(event) => onSelectSocketId(event.target.value)}
          >
            {SOCKET_GROUPS.map((group) => (
              <optgroup key={group} label={VRM_SOCKET_GROUP_LABELS[group]}>
                {VRM_AUTO_FIT_SOCKETS.filter((entry) => entry.group === group).map((socket) => (
                  <option key={socket.id} value={socket.id}>
                    {socket.labelKo} ({socket.vrmBone})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="ts-scale-fit__badge-row" role="group" aria-label="아이템 강성 선택">
          {(
            [
              ["rigid", "강체 (안경·검)"],
              ["semi-flexible", "반유연 (갑주·가방끈)"],
              ["soft-cloth", "유연 천 (스카프·망토)"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="ts-scale-fit__btn"
              data-active={rigidity === id ? "true" : "false"}
              aria-pressed={rigidity === id}
              onClick={() => onSelectRigidity(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ts-scale-fit__field">
          <label htmlFor="sf-anticlip-range" className="ts-scale-fit__label">
            <span>Anti-Clip 피부 밀착 오프셋</span>
            <span className="ts-scale-fit__num" data-testid="anticlip-offset-value">
              {antiClipOffsetMm.toFixed(1)}mm (안전 최소 {fitResult.minimumSafeOffsetMm.toFixed(1)}mm)
            </span>
          </label>
          <input
            id="sf-anticlip-range"
            type="range"
            min={0.5}
            max={5.5}
            step={0.1}
            value={antiClipOffsetMm}
            onChange={(event) => onChangeAntiClipOffsetMm(Number(event.target.value))}
            className="ts-scale-fit__range"
          />
        </div>

        <div className="ts-scale-fit__field">
          <label htmlFor="sf-curvewrap-range" className="ts-scale-fit__label">
            <span>체형 곡면 감싸기 (curveWrap)</span>
            <span className="ts-scale-fit__num">
              {Math.round(curveWrapStrength * 100)}% · {fitResult.curveWrap.wrapAngleDeg}°
            </span>
          </label>
          <input
            id="sf-curvewrap-range"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={curveWrapStrength}
            onChange={(event) => onChangeCurveWrapStrength(Number(event.target.value))}
            className="ts-scale-fit__range"
          />
        </div>

        <div className="ts-scale-fit__grid-2">
          <div className="ts-scale-fit__field">
            <label htmlFor="sf-scale-range" className="ts-scale-fit__label">
              <span>케이지 배율</span>
              <span className="ts-scale-fit__num">{Math.round(scaleMultiplier * 100)}%</span>
            </label>
            <input
              id="sf-scale-range"
              type="range"
              min={0.75}
              max={1.35}
              step={0.05}
              value={scaleMultiplier}
              onChange={(event) => onChangeScaleMultiplier(Number(event.target.value))}
              className="ts-scale-fit__range"
            />
          </div>
          <div className="ts-scale-fit__field">
            <label htmlFor="sf-bend-range" className="ts-scale-fit__label">
              <span>관절 굽힘 각도</span>
              <span className="ts-scale-fit__num">{poseBendDeg}°</span>
            </label>
            <input
              id="sf-bend-range"
              type="range"
              min={0}
              max={95}
              step={5}
              value={poseBendDeg}
              onChange={(event) => onChangePoseBendDeg(Number(event.target.value))}
              className="ts-scale-fit__range"
            />
          </div>
        </div>

        <div className="ts-scale-fit__meter" aria-hidden="true">
          <div
            className="ts-scale-fit__meter-fill"
            data-tone={tone}
            style={{ width: `${fitResult.fitConfidenceScore}%` }}
          />
        </div>

        <ul className="ts-scale-fit__list" aria-label="스킨 웨이트 자동 전사 결과">
          {fitResult.weightTransfer.bindings.map((binding) => (
            <li key={binding.boneName} className="ts-scale-fit__list-item">
              <span>
                본 전사 · <strong>{binding.boneName}</strong>
              </span>
              <span className="ts-scale-fit__num">{Math.round(binding.weight * 100)}%</span>
            </li>
          ))}
        </ul>

        <p className="ts-scale-fit__meta">{fitResult.autoCorrectionsKo[0]}</p>

        <button
          type="button"
          className="ts-scale-fit__btn ts-scale-fit__btn--primary"
          data-testid="apply-autofit-correction-btn"
          onClick={onApplyAutoCorrection}
        >
          <Wand2 size={16} aria-hidden="true" />
          자동 밀착 보정 적용 ({fitResult.suggestedPatch.antiClipOffsetMm.toFixed(1)}mm)
        </button>
      </section>

      <section className="ts-scale-fit__card" aria-labelledby="sf-webtoon3d-heading">
        <div className="ts-scale-fit__card-head">
          <div className="ts-scale-fit__hero-id">
            <img
              src={STUDIO_SCALE_FIT_SPRITE_PATHS.bg3d}
              alt=""
              aria-hidden="true"
              className="ts-scale-fit__sprite-sm"
              width={28}
              height={28}
            />
            <h3 id="sf-webtoon3d-heading" className="ts-scale-fit__card-title">
              웹툰 특화 3D 생성 · 3층 분리 출력
            </h3>
          </div>
          <span className="ts-scale-fit__pill" data-tone="accent">
            비매니폴드 {genPlan.topologyContract.nonManifoldEdges}
          </span>
        </div>

        <div className="ts-scale-fit__badge-row" role="group" aria-label="3D 에셋 종류">
          {(
            [
              ["character", "3D 캐릭터 (VRM 52)"],
              ["background", "3D 배경 스테이지"],
              ["prop", "3D 소품 (42-소켓)"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className="ts-scale-fit__btn"
              data-active={genAssetKind === kind ? "true" : "false"}
              aria-pressed={genAssetKind === kind}
              onClick={() => onSelectGenAssetKind(kind)}
            >
              {label}
            </button>
          ))}
        </div>

        <ul className="ts-scale-fit__list" aria-label="웹툰 3D 생성 5단계 파이프라인">
          {genPlan.stages.map((stage) => (
            <li key={stage.id} className="ts-scale-fit__list-item">
              <span>
                <strong>
                  {stage.stepNumber}. {stage.titleKo}
                </strong>
                <br />
                {stage.qualityGateKo}
              </span>
            </li>
          ))}
        </ul>

        <div className="ts-scale-fit__badge-row" aria-label="3층 분리 출력 레이어">
          {genPlan.threeLayerOutputs.map((layer) => (
            <span key={layer.id} className="ts-scale-fit__pill" data-tone="good">
              <Layers size={13} aria-hidden="true" />
              {layer.labelKo}
            </span>
          ))}
        </div>

        <p className="ts-scale-fit__meta">{genPlan.executionBoundaryNoteKo}</p>
      </section>
    </div>
  );
}

export interface MultiMonitorTabProps {
  readonly topology: MonitorTopologyId;
  readonly onSelectTopology: (topology: MonitorTopologyId) => void;
  readonly screens: readonly DisplayScreenDescriptor[];
  readonly layoutPlan: MultiMonitorLayoutPlan;
  readonly envProbe: MultiMonitorEnvironmentProbe;
}

export function MultiMonitorPopoutTabView({
  topology,
  onSelectTopology,
  screens,
  layoutPlan,
  envProbe,
}: MultiMonitorTabProps) {
  return (
    <section className="ts-scale-fit__card" data-testid="multi-monitor-panel">
      <div className="ts-scale-fit__card-head">
        <div className="ts-scale-fit__hero-id">
          <img
            src={STUDIO_SCALE_FIT_SPRITE_PATHS.character}
            alt=""
            aria-hidden="true"
            className="ts-scale-fit__sprite-sm"
            width={28}
            height={28}
          />
          <h3 className="ts-scale-fit__card-title">멀티 모니터 팝아웃 오케스트레이터</h3>
        </div>
        <span
          className="ts-scale-fit__pill"
          data-tone={envProbe.windowManagementApiSupported ? "good" : "warn"}
        >
          <Monitor size={14} aria-hidden="true" />
          {envProbe.windowManagementApiSupported
            ? "getScreenDetails 감지됨"
            : "단일 화면 안전 폴백"}
        </span>
      </div>

      <div className="ts-scale-fit__grid-4" role="group" aria-label="디스플레이 구성 프리셋">
        {(
          [
            ["single-monitor", "1모니터 (86% 캔버스)"],
            ["dual-monitor", "2모니터 팝아웃"],
            ["triple-monitor", "3모니터 콕핏"],
            ["pen-display-plus-monitor", "액정타블렛 + 보조"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="ts-scale-fit__scale-btn"
            aria-pressed={topology === id}
            onClick={() => onSelectTopology(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="ts-scale-fit__meta" data-testid="multi-monitor-summary">
        {layoutPlan.layoutSummaryKo}
      </p>

      <div className="ts-scale-fit__monitor-stage" aria-label="실시간 모니터 배치도">
        {screens.map((screen) => {
          const isPrimaryCanvas = screen.id === layoutPlan.primaryCanvasScreenId;
          const assignedPopouts = layoutPlan.popoutWindows.filter(
            (win) => win.targetScreenId === screen.id,
          );
          return (
            <article
              key={screen.id}
              className="ts-scale-fit__monitor-box"
              data-primary={isPrimaryCanvas ? "true" : "false"}
            >
              <div className="ts-scale-fit__card-head">
                <strong>{screen.labelKo}</strong>
                <span className="ts-scale-fit__pill" data-tone={isPrimaryCanvas ? "accent" : "good"}>
                  {isPrimaryCanvas
                    ? `캔버스 ${layoutPlan.primaryCanvasViewportPct}%`
                    : `팝아웃 ${assignedPopouts.length}창`}
                </span>
              </div>
              <p className="ts-scale-fit__meta">
                해상도 {screen.width}×{screen.height}
                {screen.isPenDisplay ? " · 펜 전용 무방해 캔버스" : ""}
              </p>
              {assignedPopouts.length > 0 ? (
                <ul className="ts-scale-fit__list">
                  {assignedPopouts.map((popout) => (
                    <li key={popout.id} className="ts-scale-fit__list-item">
                      <span>{popout.titleKo}</span>
                      <span className="ts-scale-fit__num">{popout.targetSyncLatencyMs}ms</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ts-scale-fit__meta">
                  주 드로잉 캔버스 집중 영역 · 독자 모바일 {layoutPlan.readerPreviewLatencyMs}ms 동기화
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export interface VirtualWorkdeskTabProps {
  readonly session: VirtualWorkdeskSession;
  readonly onSelectLighting: (lightingId: WorkdeskLightingPresetId) => void;
  readonly onAdvancePomodoro: () => void;
  readonly onTriggerShutter: () => void;
  readonly onToggleWebcamMirror: () => void;
}

export function VirtualWorkdeskTabView({
  session,
  onSelectLighting,
  onAdvancePomodoro,
  onTriggerShutter,
  onToggleWebcamMirror,
}: VirtualWorkdeskTabProps) {
  const activeLighting = session.pomodoroRhythm.activeLighting;

  return (
    <div
      className="ts-scale-fit__workdesk"
      data-workdesk-lighting={session.pomodoroRhythm.lightingPresetId}
      data-testid="virtual-workdesk-panel"
    >
      <div className="ts-scale-fit__card-head">
        <div className="ts-scale-fit__hero-id">
          <LampDesk size={22} aria-hidden="true" />
          <div>
            <h3 className="ts-scale-fit__card-title">{session.roomTitleKo}</h3>
            <p className="ts-scale-fit__meta">
              {activeLighting.labelKo} · {activeLighting.timeOfDayLabelKo} ·{" "}
              {activeLighting.colorTempKelvin}K · {activeLighting.spatialAudioProfileKo}
            </p>
          </div>
        </div>
        <span
          className="ts-scale-fit__pill"
          data-tone={session.pomodoroRhythm.phase === "focus" ? "accent" : "good"}
          data-testid="pomodoro-phase-badge"
        >
          {session.pomodoroRhythm.phase === "focus"
            ? `집중 ${session.pomodoroRhythm.focusMinutes}분`
            : `휴식 ${session.pomodoroRhythm.breakMinutes}분`}
        </span>
      </div>

      <div className="ts-scale-fit__badge-row" role="group" aria-label="포모도로 조명 시간대 프리셋">
        {VIRTUAL_WORKDESK_LIGHTING_ORDER.map((presetId) => {
          const preset = VIRTUAL_WORKDESK_LIGHTING_PRESETS[presetId];
          const Icon =
            presetId === "morning-sunlight"
              ? Sun
              : presetId === "sunset-atelier"
                ? Sunset
                : Moon;
          return (
            <button
              key={presetId}
              type="button"
              className="ts-scale-fit__btn"
              data-active={session.pomodoroRhythm.lightingPresetId === presetId ? "true" : "false"}
              aria-pressed={session.pomodoroRhythm.lightingPresetId === presetId}
              onClick={() => onSelectLighting(presetId)}
            >
              <Icon size={15} aria-hidden="true" />
              {preset.labelKo}
            </button>
          );
        })}
        <button
          type="button"
          className="ts-scale-fit__btn ts-scale-fit__btn--primary"
          data-testid="advance-pomodoro-btn"
          onClick={onAdvancePomodoro}
        >
          <Sparkles size={15} aria-hidden="true" />
          50/10 포모도로 다음 단계
        </button>
      </div>

      {session.pomodoroRhythm.breakGuidanceKo ? (
        <p className="ts-scale-fit__notice" role="status">
          {session.pomodoroRhythm.breakGuidanceKo}
        </p>
      ) : null}

      <div className="ts-scale-fit__grid-2">
        <section className="ts-scale-fit__card" aria-label="공동 원고 리뷰 테이블">
          <div className="ts-scale-fit__card-head">
            <h4 className="ts-scale-fit__card-title">
              <Users size={15} aria-hidden="true" /> 공동 원고 리뷰 테이블
            </h4>
            <span className="ts-scale-fit__pill">
              {session.reviewTable.episodeTitleKo} · #{session.reviewTable.activeCutNumber}컷
            </span>
          </div>
          <ul className="ts-scale-fit__list">
            {session.reviewTable.participants.map((person) => (
              <li key={person.id} className="ts-scale-fit__list-item">
                <span>
                  <strong>{person.nameKo}</strong> ({person.roleKo})
                </span>
                <span className="ts-scale-fit__num">#{person.focusedCutNumber}컷 열람</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="ts-scale-fit__card" aria-label="가상 카메라 셔터 및 웹캠 거울 부스">
          <div className="ts-scale-fit__card-head">
            <h4 className="ts-scale-fit__card-title">가상 카메라 셔터 &amp; 웹캠 거울 부스</h4>
            <span className="ts-scale-fit__pill" data-tone="good">
              삽입 {session.capturedCuts.length}컷
            </span>
          </div>
          <div className="ts-scale-fit__badge-row">
            <button
              type="button"
              className="ts-scale-fit__btn ts-scale-fit__btn--primary"
              data-testid="virtual-shutter-btn"
              onClick={onTriggerShutter}
            >
              <Camera size={15} aria-hidden="true" />
              셔터 → 2D 컷 즉시 삽입
            </button>
            <button
              type="button"
              className="ts-scale-fit__btn"
              data-active={session.webcamMirrorBooth.enabled ? "true" : "false"}
              aria-pressed={session.webcamMirrorBooth.enabled}
              data-testid="webcam-mirror-toggle-btn"
              onClick={onToggleWebcamMirror}
            >
              <Eye size={15} aria-hidden="true" />
              {session.webcamMirrorBooth.enabled ? "웹캠 거울 부스 켜짐 (로컬)" : "웹캠 거울 부스 켜기"}
            </button>
          </div>
          <p className="ts-scale-fit__meta">{session.webcamMirrorBooth.privacyNoticeKo}</p>
          {session.capturedCuts.length > 0 ? (
            <p className="ts-scale-fit__notice" data-testid="latest-shutter-capture">
              {session.capturedCuts[0].summaryKo}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
