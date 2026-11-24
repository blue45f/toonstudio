/**
 * Wave 33 Track B — VRM 자연 리깅(쇄골 연동 · 트위스트 핀치 방지 · 시선/손가락 · 소품 밀착/헤어 충돌) 진단 패널.
 * Calm Atelier / Studio 시맨틱 토큰 전용 · 원시 색상(hex/rgb/hsl) 0건 · Web Storage 0건 · 전 props 선택형 · KO/EN.
 */

import { Activity, CheckCircle2, Eye, Hand, RotateCcw, ShieldCheck, Sliders, Sparkles } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  evaluateVrmNaturalRigPipeline,
  type NaturalRigGazeOverride,
  type NaturalRigHeadPropId,
  type NaturalRigPosePresetId,
  type VrmNaturalRigDiagnosticReport,
} from "./vrm-natural-rig-solver";

export interface StudioVrmNaturalRigPanelProps {
  readonly initialPresetId?: NaturalRigPosePresetId;
  readonly initialPropId?: NaturalRigHeadPropId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onReportChange?: (report: VrmNaturalRigDiagnosticReport) => void;
}

interface AuditScenario {
  readonly id: string;
  readonly presetId: NaturalRigPosePresetId;
  readonly propId: NaturalRigHeadPropId;
  readonly ko: string;
  readonly en: string;
}

const SCENARIOS: readonly AuditScenario[] = [
  { id: "wave-beret", presetId: "xp_wave_greeting", propId: "beret", ko: "손들어 인사 · 베레모", en: "Wave Greet · Beret" },
  { id: "phone-glasses", presetId: "xp_phone_look", propId: "glasses", ko: "스마트폰 보기 · 안경", en: "Phone Look · Glasses" },
  { id: "idle-sunglasses", presetId: "ni_weight_left", propId: "sunglasses", ko: "자연 대기 · 선글라스", en: "Natural Idle · Sunglasses" },
  { id: "banzai-beret", presetId: "xp_banzai", propId: "beret", ko: "만세 · 베레모", en: "Banzai · Beret" },
];

const GAZE_OPTIONS: readonly { readonly id: NaturalRigGazeOverride; readonly ko: string; readonly en: string }[] = [
  { id: "auto", ko: "자동(포즈 의도)", en: "Auto (Pose Intent)" },
  { id: "camera", ko: "카메라 응시", en: "Camera Contact" },
  { id: "hands", ko: "손·소품 주시", en: "Hands / Prop" },
  { id: "forward", ko: "정면 자연", en: "Forward Neutral" },
];

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_CHOICE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

function StatusBadge({ status, score, isKo }: {
  readonly status: VrmNaturalRigDiagnosticReport["overallStatus"];
  readonly score: number;
  readonly isKo: boolean;
}): ReactElement {
  const cls = status === "optimal"
    ? "border-good/40 bg-good-soft text-good"
    : status === "adjusted"
      ? "border-warn/40 bg-warning-soft text-warn"
      : "border-bad/40 bg-bad-soft text-bad";
  const label = status === "optimal"
    ? (isKo ? "자연 밀착 통과" : "Natural Fit Pass")
    : status === "adjusted"
      ? (isKo ? "보정 적용 중" : "Adjusted")
      : (isKo ? "보정 강화 필요" : "Needs Calibration");
  return (
    <span
      data-testid="vrm-natural-rig-status"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${cls}`}
    >
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label}</span>
      <span>{score}/100</span>
    </span>
  );
}

function StrengthSlider({
  id, label, valuePct, onChange, testId,
}: {
  readonly id: string;
  readonly label: string;
  readonly valuePct: number;
  readonly onChange: (nextPct: number) => void;
  readonly testId: string;
}): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} className="font-medium text-fg-2">{label}</label>
        <span className="font-semibold text-fg tabular-nums">{valuePct}%</span>
      </div>
      <input
        id={id}
        data-testid={testId}
        type="range"
        min={0}
        max={100}
        step={5}
        value={valuePct}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
      />
    </div>
  );
}

export function StudioVrmNaturalRigPanel({
  initialPresetId = "xp_wave_greeting",
  initialPropId = "beret",
  locale,
  className,
  onReportChange,
}: StudioVrmNaturalRigPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [presetId, setPresetId] = useState<NaturalRigPosePresetId>(initialPresetId);
  const [propId, setPropId] = useState<NaturalRigHeadPropId>(initialPropId);
  const [posePct, setPosePct] = useState<number>(95);
  const [propPct, setPropPct] = useState<number>(100);
  const [hairPct, setHairPct] = useState<number>(100);
  const [hairVolumeMm, setHairVolumeMm] = useState<number>(12);
  const [gazeOverride, setGazeOverride] = useState<NaturalRigGazeOverride>("auto");

  const report = useMemo(() => {
    const next = evaluateVrmNaturalRigPipeline({
      presetId,
      propId,
      gazeOverride,
      hairVolumeMm,
      weights: {
        poseNatural: posePct / 100,
        propSeat: propPct / 100,
        hairCollision: hairPct / 100,
      },
    });
    return next;
  }, [gazeOverride, hairPct, hairVolumeMm, posePct, presetId, propId, propPct]);

  const emitWith = (
    nextPreset: NaturalRigPosePresetId,
    nextProp: NaturalRigHeadPropId,
    nextPosePct: number,
    nextPropPct: number,
    nextHairPct: number,
    nextGaze: NaturalRigGazeOverride,
    nextHairVol: number,
  ): void => {
    if (!onReportChange) return;
    onReportChange(evaluateVrmNaturalRigPipeline({
      presetId: nextPreset,
      propId: nextProp,
      gazeOverride: nextGaze,
      hairVolumeMm: nextHairVol,
      weights: {
        poseNatural: nextPosePct / 100,
        propSeat: nextPropPct / 100,
        hairCollision: nextHairPct / 100,
      },
    }));
  };

  const handleReset = (): void => {
    setPresetId("xp_wave_greeting");
    setPropId("beret");
    setPosePct(95);
    setPropPct(100);
    setHairPct(100);
    setHairVolumeMm(12);
    setGazeOverride("auto");
    emitWith("xp_wave_greeting", "beret", 95, 100, 100, "auto", 12);
  };

  const primaryArm = report.rightClavicle.armElevationDeg >= report.leftClavicle.armElevationDeg
    ? report.rightClavicle
    : report.leftClavicle;
  const primaryGuard = report.candyWrapperRight.lbsPinchBeforePct >= report.candyWrapperLeft.lbsPinchBeforePct
    ? report.candyWrapperRight
    : report.candyWrapperLeft;

  return (
    <section
      data-testid="studio-vrm-natural-rig-panel"
      aria-label={pick("VRM 자연 리깅 및 소품 밀착 진단", "VRM Natural Rigging & Prop Surface-Seat Diagnostics")}
      className={`rounded-xl border border-line bg-raised p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2>{pick("3D 자연 리깅 · 소품 표면 밀착 진단", "3D Natural Rigging & Prop Surface-Seat")}</h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "쇄골 연동·트위스트 핀치 방지·시선/손가락 커브·두상 밀착 및 헤어 캡슐 반발을 실시간 점검합니다.",
              "Real-time clavicle sharing, twist pinch guard, eye gaze/10-finger curves, and skull prop/hair repulsion.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={report.overallStatus} score={report.overallScore} isKo={isKo} />
          <button
            type="button"
            data-testid="vrm-natural-rig-reset"
            onClick={handleReset}
            className={`${BTN_CHOICE} ${BTN_IDLE}`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("기본값", "Reset")}</span>
          </button>
        </div>
      </header>

      <div className="mt-3 space-y-3">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold text-fg-2">
            {pick("검증 포즈 · 소품 조합", "Audit Pose & Prop Preset")}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SCENARIOS.map((item) => {
              const active = presetId === item.presetId && propId === item.propId;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`vrm-rig-scenario-${item.id}`}
                  aria-pressed={active}
                  onClick={() => {
                    setPresetId(item.presetId);
                    setPropId(item.propId);
                    emitWith(item.presetId, item.propId, posePct, propPct, hairPct, gazeOverride, hairVolumeMm);
                  }}
                  className={`${BTN_CHOICE} ${active ? BTN_ACTIVE : BTN_IDLE}`}
                >
                  {pick(item.ko, item.en)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border border-line bg-canvas p-3 sm:grid-cols-3">
          <div className="space-y-2.5 sm:col-span-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Sliders className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("3축 자연 보정 강도", "3-Axis Natural Correction")}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StrengthSlider
                id={`${uid}-pose`}
                testId="vrm-rig-slider-pose"
                label={pick("포즈·쇄골·손가락", "Pose & Clavicle")}
                valuePct={posePct}
                onChange={(v) => {
                  setPosePct(v);
                  emitWith(presetId, propId, v, propPct, hairPct, gazeOverride, hairVolumeMm);
                }}
              />
              <StrengthSlider
                id={`${uid}-prop`}
                testId="vrm-rig-slider-prop"
                label={pick("소품 표면 밀착", "Prop Surface-Seat")}
                valuePct={propPct}
                onChange={(v) => {
                  setPropPct(v);
                  emitWith(presetId, propId, posePct, v, hairPct, gazeOverride, hairVolumeMm);
                }}
              />
              <StrengthSlider
                id={`${uid}-hair`}
                testId="vrm-rig-slider-hair"
                label={pick("헤어·어깨 반발", "Hair-Shoulder Repel")}
                valuePct={hairPct}
                onChange={(v) => {
                  setHairPct(v);
                  emitWith(presetId, propId, posePct, propPct, v, gazeOverride, hairVolumeMm);
                }}
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-line pt-2.5 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`${uid}-hair-vol`} className="font-semibold text-fg-2">
                {pick("헤어 볼륨 여유", "Hair Volume Loft")}
              </label>
              <span className="font-semibold text-fg tabular-nums">{hairVolumeMm}mm</span>
            </div>
            <input
              id={`${uid}-hair-vol`}
              data-testid="vrm-rig-slider-hair-volume"
              type="range"
              min={0}
              max={30}
              step={2}
              value={hairVolumeMm}
              onChange={(event) => {
                const v = Number(event.target.value);
                setHairVolumeMm(v);
                emitWith(presetId, propId, posePct, propPct, hairPct, gazeOverride, v);
              }}
              className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
            />
            <div className="pt-1">
              <div className="mb-1 text-[11px] font-semibold text-fg-2">{pick("시선 의도", "Eye Gaze Intent")}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {GAZE_OPTIONS.map((opt) => {
                  const active = gazeOverride === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`vrm-rig-gaze-${opt.id}`}
                      aria-pressed={active}
                      onClick={() => {
                        setGazeOverride(opt.id);
                        emitWith(presetId, propId, posePct, propPct, hairPct, opt.id, hairVolumeMm);
                      }}
                      className={`${BTN_CHOICE} px-2 text-[11px] ${active ? BTN_ACTIVE : BTN_IDLE}`}
                    >
                      {pick(opt.ko, opt.en)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
          <article data-testid="vrm-rig-card-clavicle" className="rounded-lg border border-line bg-canvas p-3 text-xs">
            <div className="flex items-center justify-between font-semibold text-fg">
              <span className="inline-flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("1. 쇄골-견갑골 자동 연동", "1. Clavicle-Scapula Auto-Share")}
              </span>
              <span className="text-fg-2 tabular-nums">
                {pick("상완 거상", "Raise")} {primaryArm.armElevationDeg.toFixed(1)}°
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 tabular-nums">
              <div className="rounded border border-line bg-raised p-2">
                <dt className="text-[11px] text-fg-2">{pick("쇄골 상승 · 전인", "Clavicle Lift / Protract")}</dt>
                <dd className="mt-0.5 font-bold text-fg">
                  +{primaryArm.shoulderElevationDeg.toFixed(1)}° / {primaryArm.clavicleProtractionDeg.toFixed(1)}°
                </dd>
              </div>
              <div className="rounded border border-line bg-raised p-2">
                <dt className="text-[11px] text-fg-2">{pick("어깨 핀치 위험", "Shoulder Pinch Risk")}</dt>
                <dd className="mt-0.5 font-bold text-good">
                  {Math.round(primaryArm.pinchRiskBefore * 100)}% → {Math.round(primaryArm.pinchRiskAfter * 100)}%
                </dd>
              </div>
              <div className="col-span-2 rounded border border-line bg-raised p-2 text-[11px] text-fg-2">
                {pick("콘트라포스토 보정", "Contrapposto")}:{" "}
                <span className="font-semibold text-fg">
                  {pick("골반", "Hips")} {primaryArm.contrappostoHint.hipsRollDeg}°,{" "}
                  {pick("척추", "Spine")} {primaryArm.contrappostoHint.spineCounterRollDeg}°,{" "}
                  {pick("흉추 회전", "Chest Yaw")} {primaryArm.contrappostoHint.chestYawDeg}°
                </span>
              </div>
            </dl>
          </article>

          <article data-testid="vrm-rig-card-twist" className="rounded-lg border border-line bg-canvas p-3 text-xs">
            <div className="flex items-center justify-between font-semibold text-fg">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("2. 듀얼 쿼터니언 핀치 방지", "2. Dual-Quat Candy-Wrapper Guard")}
              </span>
              <span className={primaryGuard.candyWrapperSafe ? "text-good" : "text-warn"}>
                {primaryGuard.candyWrapperSafe ? pick("안전", "Safe") : pick("주의", "Check")}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 tabular-nums">
              <div className="rounded border border-line bg-raised p-2">
                <dt className="text-[11px] text-fg-2">{pick("LBS 단면 붕괴", "LBS Collapse")}</dt>
                <dd className="mt-0.5 font-bold text-fg">
                  {primaryGuard.lbsPinchBeforePct.toFixed(1)}% → {primaryGuard.lbsPinchAfterPct.toFixed(1)}%
                </dd>
              </div>
              <div className="rounded border border-line bg-raised p-2">
                <dt className="text-[11px] text-fg-2">{pick("DQ 볼륨 보전", "DQ Retention")}</dt>
                <dd className="mt-0.5 font-bold text-good">{primaryGuard.dqVolumeRetentionPct.toFixed(1)}%</dd>
              </div>
              <div className="col-span-2 rounded border border-line bg-raised p-2 text-[11px] text-fg-2">
                {pick("전완 3구간 분산", "Forearm 3-Chain")}:{" "}
                <span className="font-semibold text-fg">
                  {primaryGuard.forearmChainDeg.lowerArm}° / {primaryGuard.forearmChainDeg.midForearm}° /{" "}
                  {primaryGuard.forearmChainDeg.wristResidual}°
                </span>
              </div>
            </dl>
          </article>

          <article data-testid="vrm-rig-card-gaze-hands" className="rounded-lg border border-line bg-canvas p-3 text-xs">
            <div className="flex items-center justify-between font-semibold text-fg">
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("3. 시선 의도 · 10손가락 커브", "3. Eye Gaze & 10-Finger Curve")}
              </span>
              <span className="inline-flex items-center gap-1 text-fg-2 tabular-nums">
                <Hand className="h-3.5 w-3.5" aria-hidden="true" />
                {report.tenFingers.boneCount} {pick("본", "bones")}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 tabular-nums">
              <div className="rounded border border-line bg-raised p-2">
                <dt className="text-[11px] text-fg-2">{pick("시선 피치 · 수렴", "Gaze Pitch / Vergence")}</dt>
                <dd className="mt-0.5 font-bold text-fg">
                  {report.eyeGaze.effectivePitchDeg}° / {report.eyeGaze.vergenceDeg}° ({report.eyeGaze.resolvedTarget})
                </dd>
              </div>
              <div className="rounded border border-line bg-raised p-2">
                <dt className="text-[11px] text-fg-2">{pick("역관절 · 손가락 교차", "Reverse / Crossing")}</dt>
                <dd className="mt-0.5 font-bold text-good">
                  {report.tenFingers.reverseJointCount} / {report.tenFingers.crossingPairCount}
                </dd>
              </div>
              <div className="col-span-2 rounded border border-line bg-raised p-2 text-[11px] text-fg-2">
                {pick("왼손/오른손 PIP 평균", "L/R Mean PIP")}:{" "}
                <span className="font-semibold text-fg">
                  {report.tenFingers.leftSummary.meanPipCurlDeg}° ({report.tenFingers.leftSummary.mode}) ·{" "}
                  {report.tenFingers.rightSummary.meanPipCurlDeg}° ({report.tenFingers.rightSummary.mode})
                </span>
              </div>
            </dl>
          </article>

          <article data-testid="vrm-rig-card-prop-hair" className="rounded-lg border border-line bg-canvas p-3 text-xs">
            <div className="flex items-center justify-between font-semibold text-fg">
              <span>{pick("4. 소품 표면 밀착 · 헤어 캡슐 반발", "4. Prop Surface-Seat & Hair Repulsion")}</span>
              <span className="text-fg-2 tabular-nums">{report.propSeat.propId}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 tabular-nums">
              <div className="rounded border border-line bg-raised p-2">
                <dt className="text-[11px] text-fg-2">{pick("소품 부양 오차", "Prop Float Gap")}</dt>
                <dd className="mt-0.5 font-bold text-good">
                  {report.propSeat.floatGapBeforeMm.toFixed(1)}mm → {report.propSeat.floatGapAfterMm.toFixed(1)}mm
                </dd>
              </div>
              <div className="rounded border border-line bg-raised p-2">
                <dt className="text-[11px] text-fg-2">{pick("헤어·어깨 잔여 관통", "Hair Penetration")}</dt>
                <dd className="mt-0.5 font-bold text-good">
                  {report.hairCollision.initialMaxPenetrationMm.toFixed(1)}mm →{" "}
                  {report.hairCollision.resolvedMaxPenetrationMm.toFixed(2)}mm
                </dd>
              </div>
              <div className="col-span-2 rounded border border-line bg-raised p-2 text-[11px] text-fg-2">
                {pick("소품 기울기 · 배율", "Prop Tilt / Scale")}:{" "}
                <span className="font-semibold text-fg">
                  [{report.propSeat.tiltDeg.join("°, ")}°] · ×{report.propSeat.recommendedScale.toFixed(2)} ·{" "}
                  {pick("길이 오차", "Length Drift")} {report.hairCollision.maxLengthDriftPct.toFixed(2)}%
                </span>
              </div>
            </dl>
          </article>
        </div>
      </div>
    </section>
  );
}
