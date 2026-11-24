/**
 * 3D 다이내믹 시네마 렌즈 & 180° 액션 축 연속성 스토리보드 연출 스튜디오 패널.
 *
 * - Props 없이 단독 렌더 가능하며 탑뷰(Top-Down) 2D 스테이지 플로어플랜 SVG,
 *   180° 액션 라인·카메라 프러스텀·이탈 경고·원클릭 자동 교정·Three.js 리그 JSON 내보내기를 제공한다.
 * - Calm Atelier 시맨틱 토큰 전용(원시 색상 0건 · 명시적 transition 속성만 사용 · Web Storage 비의존).
 */

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Compass,
  Copy,
  Download,
  FlipVertical2,
  RotateCcw,
  SlidersHorizontal,
  Wand2,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  CAMERA_BLOCKING_PRESETS,
  CINEMA_FOCAL_LENGTHS,
  LENS_CHARACTER_KO,
  analyzeCameraBlocking,
  autoFixAxisViolations,
  exportThreeJsCameraRig,
  findCameraBlockingPresetById,
  mirrorCameraAcrossAxis,
  serializeThreeJsCameraRig,
} from "./camera-lens-blocking-engine";
import type { CameraCutSpec, CinemaFocalLengthMm, CutOpticalAnalysis, StageActor } from "./types";

export interface StudioCameraLensBlockingPanelProps {
  readonly initialPresetId?: string;
  readonly className?: string;
}

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_CHIP_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

const STAGE_SVG_W = 460;
const STAGE_SVG_H = 380;
const WORLD_X_MIN = -5.5;
const WORLD_X_MAX = 5.5;
const WORLD_Z_MIN = -4.5;
const WORLD_Z_MAX = 6.2;

function toSvgX(worldX: number): number {
  return Math.round(((worldX - WORLD_X_MIN) / (WORLD_X_MAX - WORLD_X_MIN)) * STAGE_SVG_W * 10) / 10;
}

function toSvgY(worldZ: number): number {
  return Math.round(((worldZ - WORLD_Z_MIN) / (WORLD_Z_MAX - WORLD_Z_MIN)) * STAGE_SVG_H * 10) / 10;
}

function buildFrustumPolygonPoints(
  cut: CameraCutSpec,
  subject: StageActor,
  analysis: CutOpticalAnalysis,
  rayMeters: number,
): string {
  const cx = cut.cameraPosition.x;
  const cz = cut.cameraPosition.z;
  const baseAngle = Math.atan2(subject.position.z - cz, subject.position.x - cx);
  const halfFovRad = ((analysis.horizontalFovDeg * Math.PI) / 180) / 2;

  const leftX = cx + Math.cos(baseAngle - halfFovRad) * rayMeters;
  const leftZ = cz + Math.sin(baseAngle - halfFovRad) * rayMeters;
  const rightX = cx + Math.cos(baseAngle + halfFovRad) * rayMeters;
  const rightZ = cz + Math.sin(baseAngle + halfFovRad) * rayMeters;

  return `${toSvgX(cx)},${toSvgY(cz)} ${toSvgX(leftX)},${toSvgY(leftZ)} ${toSvgX(rightX)},${toSvgY(rightZ)}`;
}

function downloadJsonFile(filename: string, content: string): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return;
  }
  const url = URL.createObjectURL(new Blob([`${content}\n`], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function StudioCameraLensBlockingPanel({
  initialPresetId,
  className,
}: StudioCameraLensBlockingPanelProps = {}): ReactElement {
  const uid = useId();
  const initialPreset = findCameraBlockingPresetById(initialPresetId);

  const [selectedPresetId, setSelectedPresetId] = useState<string>(initialPreset.id);
  const [cuts, setCuts] = useState<readonly CameraCutSpec[]>(initialPreset.cuts);
  const [selectedCutId, setSelectedCutId] = useState<string>(initialPreset.cuts[0]?.id ?? "");
  const [showRigJson, setShowRigJson] = useState<boolean>(false);
  const [noticeText, setNoticeText] = useState<string>("");

  const activePreset = findCameraBlockingPresetById(selectedPresetId);

  const report = useMemo(
    () =>
      analyzeCameraBlocking({
        sceneId: activePreset.id,
        actors: activePreset.actors,
        cuts,
        primaryAxisActorIds: activePreset.primaryAxisActorIds,
      }),
    [activePreset.actors, activePreset.id, activePreset.primaryAxisActorIds, cuts],
  );

  const threeRig = useMemo(
    () =>
      exportThreeJsCameraRig({
        sceneId: activePreset.id,
        sceneNameKo: activePreset.nameKo,
        actors: activePreset.actors,
        cuts,
        primaryAxisActorIds: activePreset.primaryAxisActorIds,
      }),
    [activePreset.actors, activePreset.id, activePreset.nameKo, activePreset.primaryAxisActorIds, cuts],
  );

  const serializedRig = useMemo(() => serializeThreeJsCameraRig(threeRig), [threeRig]);

  const selectedCut = useMemo(
    () => cuts.find((item) => item.id === selectedCutId) ?? cuts[0],
    [cuts, selectedCutId],
  );
  const selectedAnalysis = useMemo(
    () => report.cutAnalyses.find((item) => item.cutId === selectedCut?.id) ?? report.cutAnalyses[0],
    [report.cutAnalyses, selectedCut?.id],
  );

  const handleSelectPreset = (presetId: string): void => {
    const next = findCameraBlockingPresetById(presetId);
    setSelectedPresetId(next.id);
    setCuts(next.cuts);
    setSelectedCutId(next.cuts[0]?.id ?? "");
    setNoticeText(`"${next.nameKo}" 블로킹 씬을 불러왔습니다.`);
  };

  const handleAutoFixAxis = (): void => {
    const fixed = autoFixAxisViolations({
      actors: activePreset.actors,
      cuts,
      primaryAxisActorIds: activePreset.primaryAxisActorIds,
    });
    setCuts(fixed);
    setNoticeText("180° 액션 축 이탈 컷을 기준 반평면으로 대칭 교정했습니다.");
  };

  const handleReset = (): void => {
    setCuts(activePreset.cuts);
    setSelectedCutId(activePreset.cuts[0]?.id ?? "");
    setNoticeText("현재 프리셋의 초기 카메라 배치로 복원했습니다.");
  };

  const updateSelectedCut = (updater: (cut: CameraCutSpec) => CameraCutSpec): void => {
    if (!selectedCut) return;
    setCuts((prev) => prev.map((item) => (item.id === selectedCut.id ? updater(item) : item)));
  };

  const handleToggleAxisSideForSelected = (): void => {
    if (!selectedCut) return;
    const mirrored = mirrorCameraAcrossAxis(report.lineOfAction, selectedCut.cameraPosition);
    updateSelectedCut((cut) => ({ ...cut, cameraPosition: mirrored }));
    setNoticeText(`컷 ${selectedCut.cutNumber} 카메라를 180° 라인 반대편으로 이동했습니다.`);
  };

  const handleCopyRigJson = async (): Promise<void> => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(serializedRig);
        setNoticeText("Three.js PerspectiveCamera 리그 JSON을 클립보드에 복사했습니다.");
        return;
      }
    } catch {
      // 클립보드 권한이 없는 환경에서는 안내 메시지만 표시한다.
    }
    setNoticeText("Three.js 리그 JSON이 준비되었습니다. 저장 버튼으로 내려받을 수 있습니다.");
  };

  const handleDownloadRigJson = (): void => {
    downloadJsonFile(`threejs-camera-rig-${activePreset.id}.json`, serializedRig);
    setNoticeText(`threejs-camera-rig-${activePreset.id}.json 파일을 저장했습니다.`);
  };

  const actorA =
    activePreset.actors.find((a) => a.id === report.lineOfAction.actorAId) ?? activePreset.actors[0];
  const actorB =
    activePreset.actors.find((a) => a.id === report.lineOfAction.actorBId) ?? activePreset.actors[1];

  const axisP1X = (actorA?.position.x ?? -2) - report.lineOfAction.dirX * 3.8;
  const axisP1Z = (actorA?.position.z ?? 0) - report.lineOfAction.dirZ * 3.8;
  const axisP2X = (actorB?.position.x ?? 2) + report.lineOfAction.dirX * 3.8;
  const axisP2Z = (actorB?.position.z ?? 0) + report.lineOfAction.dirZ * 3.8;

  return (
    <section
      aria-labelledby={`${uid}-heading`}
      className={`rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${className ?? ""}`}
    >
      <header className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-accent">
            <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>3D 시네마 렌즈 & 180° 액션 축 연출 감독기</span>
          </div>
          <h2
            id={`${uid}-heading`}
            className="text-base font-bold tracking-tight text-fg [word-break:keep-all] md:text-lg"
          >
            멀티컷 시네마 화각 · 180° 연속성 검증 · Three.js 카메라 리그
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            24~135mm 풀프레임 프라임 렌즈별 샷 사이즈(ECU~WS), 180° 액션 라인 교차 위반,
            시선 일치 오차, 더치 앵글 긴장도를 실시간 계산하고 원클릭 교정 및 Three.js 리그를 출력합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAutoFixAxis}
            disabled={report.axisViolationCount === 0}
            className={BTN_PRIMARY}
          >
            <Wand2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>180° 축 위반 원클릭 교정</span>
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCopyRigJson();
            }}
            className={BTN_OUTLINE}
          >
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>리그 JSON 복사</span>
          </button>
          <button type="button" onClick={handleDownloadRigJson} className={BTN_OUTLINE}>
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>리그 저장</span>
          </button>
          <button type="button" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>초기화</span>
          </button>
        </div>
      </header>

      {/* 프리셋 선택 + 연속성 지표 */}
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="3D 블로킹 씬 프리셋" className="flex flex-wrap gap-2">
          {CAMERA_BLOCKING_PRESETS.map((preset) => {
            const isActive = preset.id === activePreset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleSelectPreset(preset.id)}
                className={isActive ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
              >
                <Compass className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{preset.nameKo}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-card px-3 py-2">
            <div className="text-[11px] text-fg-3">180° 축 이탈</div>
            <div
              className={`mt-0.5 flex items-center gap-1 text-xs font-bold tabular-nums ${
                report.axisViolationCount === 0 ? "text-good" : "text-bad"
              }`}
            >
              {report.axisViolationCount === 0 ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{report.axisViolationCount}건</span>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2">
            <div className="text-[11px] text-fg-3">평균 시선 오차</div>
            <div className="mt-0.5 text-xs font-bold tabular-nums text-fg">
              {report.averageEyelineErrorDeg.toFixed(1)}°
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2">
            <div className="text-[11px] text-fg-3">최대 더치 긴장도</div>
            <div className="mt-0.5 text-xs font-bold tabular-nums text-fg">
              {report.maxDutchTensionScore} / 100
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2">
            <div className="text-[11px] text-fg-3">연속성 점수</div>
            <div className="mt-0.5 text-xs font-bold tabular-nums text-accent">
              {report.continuityScore}점
            </div>
          </div>
        </div>
      </div>

      {noticeText ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 [word-break:keep-all]"
        >
          {noticeText}
        </p>
      ) : null}

      {/* 메인 2열: 좌측 2D 탑뷰 스테이지 플로어플랜 SVG / 우측 컷·렌즈·경고 인스펙터 */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(360px,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-canvas p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-fg">
                탑뷰(Top-Down) 2D 스테이지 플로어플랜 · 180° 액션 라인
              </span>
              <span className="tabular-nums text-fg-3">
                기준 반평면: {report.lineOfAction.referenceSide === "left" ? "하단(+Z)" : "상단(-Z)"}
              </span>
            </div>

            <svg
              role="img"
              aria-label="3D 카메라 블로킹 탑뷰 스테이지 플로어플랜 및 180도 액션 라인"
              viewBox={`0 0 ${STAGE_SVG_W} ${STAGE_SVG_H}`}
              className="block h-auto w-full rounded-lg border border-line bg-panel"
            >
              {/* 1m 메트릭 격자 */}
              {[-4, -2, 0, 2, 4].map((gx) => (
                <line
                  key={`gx-${gx}`}
                  x1={toSvgX(gx)}
                  y1={0}
                  x2={toSvgX(gx)}
                  y2={STAGE_SVG_H}
                  className="stroke-line"
                  strokeWidth={gx === 0 ? 1.4 : 0.8}
                />
              ))}
              {[-4, -2, 0, 2, 4, 6].map((gz) => (
                <line
                  key={`gz-${gz}`}
                  x1={0}
                  y1={toSvgY(gz)}
                  x2={STAGE_SVG_W}
                  y2={toSvgY(gz)}
                  className="stroke-line"
                  strokeWidth={gz === 0 ? 1.4 : 0.8}
                />
              ))}

              {/* 180도 라인 오브 액션 */}
              <line
                x1={toSvgX(axisP1X)}
                y1={toSvgY(axisP1Z)}
                x2={toSvgX(axisP2X)}
                y2={toSvgY(axisP2Z)}
                className="stroke-accent"
                strokeDasharray="8 6"
                strokeWidth={2.2}
              />
              <text
                x={toSvgX(0)}
                y={toSvgY(0) - 8}
                textAnchor="middle"
                className="fill-accent text-[11px] font-bold"
              >
                180° 액션 라인 ({report.lineOfAction.lengthM}m)
              </text>

              {/* 카메라 프러스텀(시야각 콘) 및 마커 */}
              {cuts.map((cut, index) => {
                const analysis = report.cutAnalyses[index];
                if (!analysis) return null;
                const subject =
                  activePreset.actors.find((a) => a.id === cut.primaryActorId) ??
                  activePreset.actors[0];
                if (!subject) return null;

                const isSelected = cut.id === selectedCut?.id;
                const isViolation = analysis.axisCrossedFromCutNumber !== null;
                const cx = toSvgX(cut.cameraPosition.x);
                const cy = toSvgY(cut.cameraPosition.z);
                const frustumPts = buildFrustumPolygonPoints(
                  cut,
                  subject,
                  analysis,
                  isSelected ? 2.1 : 1.45,
                );

                return (
                  <g key={cut.id}>
                    <polygon
                      points={frustumPts}
                      className={
                        isViolation
                          ? "fill-bad/20 stroke-bad"
                          : isSelected
                            ? "fill-accent/20 stroke-accent"
                            : "fill-cool/15 stroke-cool"
                      }
                      strokeWidth={isSelected ? 2 : 1.2}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 13 : 10.5}
                      className={`cursor-pointer ${
                        isViolation
                          ? "fill-bad stroke-canvas"
                          : isSelected
                            ? "fill-accent stroke-canvas"
                            : "fill-card stroke-fg"
                      }`}
                      strokeWidth={2}
                      onClick={() => setSelectedCutId(cut.id)}
                    />
                    <text
                      x={cx}
                      y={cy + 4}
                      textAnchor="middle"
                      className={`pointer-events-none select-none text-[10px] font-bold tabular-nums ${
                        isViolation || isSelected ? "fill-on-accent" : "fill-fg"
                      }`}
                    >
                      C{cut.cutNumber}
                    </text>
                  </g>
                );
              })}

              {/* 액터(캐릭터) 위치 및 시선 방향 */}
              {activePreset.actors.map((actor) => {
                const ax = toSvgX(actor.position.x);
                const ay = toSvgY(actor.position.z);
                const yawRad = (actor.facingYawDeg * Math.PI) / 180;
                const gx = toSvgX(actor.position.x + Math.cos(yawRad) * 0.85);
                const gy = toSvgY(actor.position.z + Math.sin(yawRad) * 0.85);
                return (
                  <g key={actor.id}>
                    <line
                      x1={ax}
                      y1={ay}
                      x2={gx}
                      y2={gy}
                      className="stroke-fg"
                      strokeWidth={2}
                    />
                    <circle
                      cx={ax}
                      cy={ay}
                      r={10}
                      className={
                        actor.role === "protagonist"
                          ? "fill-good stroke-canvas"
                          : "fill-warn stroke-canvas"
                      }
                      strokeWidth={2}
                    />
                    <text
                      x={ax}
                      y={ay + 24}
                      textAnchor="middle"
                      className="fill-fg text-[11px] font-semibold"
                    >
                      {actor.nameKo}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* 위반 경고 목록 */}
          <div className="rounded-xl border border-line bg-card p-3.5">
            <h3 className="text-xs font-semibold text-fg">
              연속성 진단 경고 ({report.violations.length}건)
            </h3>
            {report.violations.length === 0 ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-good [word-break:keep-all]">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>모든 컷이 180° 액션 축과 시선 일치 기준을 안정적으로 유지하고 있습니다.</span>
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {report.violations.map((violation) => (
                  <li
                    key={violation.id}
                    className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${
                      violation.severity === "critical"
                        ? "border-bad/40 bg-bad-soft text-bad"
                        : "border-warn/40 bg-warning-soft text-warn"
                    }`}
                  >
                    <div className="font-semibold">
                      컷 {violation.toCutNumber} ·{" "}
                      {violation.kind === "axis-crossing"
                        ? "180° 축 이탈"
                        : violation.kind === "eyeline-mismatch"
                          ? "시선 일치 불일치"
                          : "과도한 더치 앵글"}
                    </div>
                    <p className="mt-0.5 text-fg-2">{violation.messageKo}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 우측: 멀티컷 목록 + 선택 컷 렌즈/더치 제어 + Three.js JSON 프리뷰 */}
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-card p-3.5">
            <h3 className="text-xs font-semibold text-fg">
              스토리보드 컷 목록 ({cuts.length}컷 · {activePreset.genreKo})
            </h3>
            <div className="mt-2.5 grid gap-2">
              {cuts.map((cut, index) => {
                const analysis = report.cutAnalyses[index];
                const isSelected = cut.id === selectedCut?.id;
                const isAxisError = analysis?.axisCrossedFromCutNumber !== null;
                return (
                  <button
                    key={cut.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedCutId(cut.id)}
                    className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                      isSelected
                        ? "border-accent bg-accent-soft"
                        : isAxisError
                          ? "border-bad/50 bg-bad-soft"
                          : "border-line bg-panel hover:border-line-strong hover:bg-raised"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-fg [word-break:keep-all]">
                        C{cut.cutNumber}. {cut.labelKo}
                      </div>
                      <div className="mt-0.5 text-[11px] tabular-nums text-fg-2">
                        {cut.focalLengthMm}mm · {analysis?.shotSize ?? "MS"} · 거리{" "}
                        {analysis?.distanceToSubjectM.toFixed(1)}m · 시선오차{" "}
                        {analysis?.eyelineMatchErrorDeg.toFixed(1)}°
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                        isAxisError
                          ? "border-bad/40 bg-bad-soft text-bad"
                          : "border-line bg-card text-fg-2"
                      }`}
                    >
                      {isAxisError ? "축 이탈" : `더치 ${cut.dutchRollDeg}°`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedCut && selectedAnalysis ? (
            <div className="rounded-xl border border-line bg-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>컷 {selectedCut.cutNumber} 광학·축 제어</span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAxisSideForSelected}
                  className={BTN_OUTLINE}
                >
                  <FlipVertical2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>180° 반평면 반전</span>
                </button>
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1.5 text-xs font-medium text-fg-2">
                    시네마 프라임 렌즈 ({LENS_CHARACTER_KO[selectedCut.focalLengthMm]})
                  </div>
                  <div role="group" aria-label="시네마 프라임 초점거리 선택" className="flex flex-wrap gap-1.5">
                    {CINEMA_FOCAL_LENGTHS.map((mm: CinemaFocalLengthMm) => (
                      <button
                        key={mm}
                        type="button"
                        aria-pressed={selectedCut.focalLengthMm === mm}
                        onClick={() =>
                          updateSelectedCut((cut) => ({ ...cut, focalLengthMm: mm }))
                        }
                        className={selectedCut.focalLengthMm === mm ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
                      >
                        <span className="tabular-nums">{mm}mm</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor={`${uid}-dutch-roll`} className="font-medium text-fg-2">
                      더치 앵글 롤 기울기
                    </label>
                    <span className="font-semibold tabular-nums text-fg">
                      {selectedCut.dutchRollDeg > 0 ? "+" : ""}
                      {selectedCut.dutchRollDeg}° (긴장도 {selectedAnalysis.dutchTensionScore})
                    </span>
                  </div>
                  <input
                    id={`${uid}-dutch-roll`}
                    type="range"
                    min={-35}
                    max={35}
                    step={1}
                    value={selectedCut.dutchRollDeg}
                    onChange={(event) =>
                      updateSelectedCut((cut) => ({
                        ...cut,
                        dutchRollDeg: Number(event.target.value),
                      }))
                    }
                    className="w-full accent-accent"
                  />
                </div>

                <dl className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-panel p-2.5 text-[11px] sm:grid-cols-3">
                  <div>
                    <dt className="text-fg-3">샷 사이즈</dt>
                    <dd className="mt-0.5 font-bold text-fg">{selectedAnalysis.shotSizeLabelKo}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-3">수직/수평 화각</dt>
                    <dd className="mt-0.5 font-bold tabular-nums text-fg">
                      {selectedAnalysis.verticalFovDeg}° / {selectedAnalysis.horizontalFovDeg}°
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-3">가시 수직 높이</dt>
                    <dd className="mt-0.5 font-bold tabular-nums text-fg">
                      {selectedAnalysis.visibleVerticalHeightM.toFixed(2)}m
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-line bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg">
                Three.js PerspectiveCamera 리그 JSON ({threeRig.cameras.length}대)
              </span>
              <button
                type="button"
                aria-expanded={showRigJson}
                onClick={() => setShowRigJson((prev) => !prev)}
                className={BTN_OUTLINE}
              >
                <span>{showRigJson ? "JSON 접기" : "JSON 펼치기"}</span>
              </button>
            </div>
            {showRigJson ? (
              <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-2.5 text-[11px] leading-relaxed tabular-nums text-fg-2">
                {serializedRig}
              </pre>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
