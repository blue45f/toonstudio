/**
 * PhysicsPanel(outfit-physics): provider 라디오(builtin-pbd/rapier/havok) → `physics/set-provider` dispatch 1회,
 * provider 상태(active 버전·결정성 / unavailable 사유), settle 스텝 입력·실행(`engine.settle(steps)`),
 * 미리보기 재생(프레임마다 `engine.settle(1)` = 1스텝 진행).
 *
 * - 엔진이 없으면 settle·재생 버튼을 비활성화하고 사유를 보여준다(무음 대체 금지).
 * - 프레임 스케줄러는 주입 가능(`schedule`)하며 기본은 requestAnimationFrame이다. rAF가 없는 환경은 재생 불가 사유를 표시한다.
 * - 스타일 접두 `cl-physics-`(app/styles/character-lab.css, core 소유).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { PHYSICS_PROVIDER_IDS, PHYSICS_PROVIDER_LABELS_KO, SETTLE_DEFAULTS, isPhysicsProviderId } from "../../../contracts";
import { collideShaperDynamicBoneCapsule, stepShaperDynamicBoneParticle } from "../../../domains/outfit/shaper-hair";
import { PHYSICS_PROVIDER_CATALOG } from "../../../domains/physics/provider-factory";
import { useDispatch, useEngineSession, useLabState } from "../lab-store-context";

import type { PhysicsProviderId, PhysicsStatus, SettleReceipt } from "../../../contracts";
import type { ShaperDynamicBoneBoundMode } from "../../../domains/outfit/shaper-hair";
import type { PhysicsProviderDescriptor } from "../../../domains/physics/provider-factory";

/** 프레임마다 tick을 호출하는 스케줄러. 돌려주는 함수가 중지한다. */
export type FrameScheduler = (tick: () => void) => () => void;

const RAF_AVAILABLE = typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function";

const rafScheduler: FrameScheduler = (tick) => {
  let active = true;
  let handle = 0;
  const loop = (): void => {
    if (!active) return;
    tick();
    handle = requestAnimationFrame(loop);
  };
  handle = requestAnimationFrame(loop);
  return () => {
    active = false;
    cancelAnimationFrame(handle);
  };
};

export interface PhysicsPanelProps {
  /** 미리보기 재생 스케줄러(테스트 주입용). 기본 requestAnimationFrame */
  readonly schedule?: FrameScheduler;
}

const ROLE_LABELS_KO: Readonly<Record<PhysicsProviderDescriptor["role"], string>> = {
  primary: "1급(헤어·의상)",
  auxiliary: "보조(소품·접지)",
  unavailable: "미설치",
};

export function describePhysicsStatus(status: PhysicsStatus | null): { readonly text: string; readonly tone: "busy" | "ok" | "error" } {
  if (!status) return { text: "상태 없음: 엔진이 아직 물리 provider를 초기화하지 않았습니다.", tone: "busy" };
  if (status.status === "active") {
    return { text: `활성 · ${PHYSICS_PROVIDER_LABELS_KO[status.id]} · ${status.versionLabel} · ${status.deterministic ? "결정적" : "비결정적"}`, tone: "ok" };
  }
  return { text: `사용 불가(${PHYSICS_PROVIDER_LABELS_KO[status.id]}): ${status.reasonKo}`, tone: "error" };
}

function clampSteps(value: number): number {
  if (!Number.isFinite(value)) return SETTLE_DEFAULTS.defaultSteps;
  return Math.min(SETTLE_DEFAULTS.maxSteps, Math.max(0, Math.floor(value)));
}

export function PhysicsPanel({ schedule = rafScheduler }: PhysicsPanelProps) {
  const state = useLabState();
  const dispatch = useDispatch();
  const session = useEngineSession();
  const ids = useId();
  const [steps, setSteps] = useState<number>(SETTLE_DEFAULTS.defaultSteps);
  const [receipt, setReceipt] = useState<SettleReceipt | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [previewSteps, setPreviewSteps] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [dbDamping, setDbDamping] = useState(0.15);
  const [dbElasticity, setDbElasticity] = useState(0.2);
  const [dbStiffness, setDbStiffness] = useState(0.1);
  const [dbInert, setDbInert] = useState(0.05);
  const [dbBoundMode, setDbBoundMode] = useState<ShaperDynamicBoneBoundMode>("outside");
  const inFlight = useRef(false);

  const shaperDynamicBonePreview = useMemo(() => {
    const stepped = stepShaperDynamicBoneParticle({
      position: [0.05, -0.35, 0.02],
      prevPosition: [0.01, -0.3, 0.0],
      restTargetPosition: [0.0, -0.4, 0.0],
      parentDisplacement: [0.02, 0.0, 0.0],
      damping: dbDamping,
      elasticity: dbElasticity,
      stiffness: dbStiffness,
      inert: dbInert,
      externalForce: [0, -0.0098, 0],
    });
    const collided = collideShaperDynamicBoneCapsule({
      particlePosition: stepped.position,
      particleRadius: 0.04,
      capsuleP0: [0, -0.5, 0],
      capsuleP1: [0, 0.1, 0],
      capsuleRadius: 0.12,
      bound: dbBoundMode,
    });
    return { stepped, collided };
  }, [dbBoundMode, dbDamping, dbElasticity, dbInert, dbStiffness]);

  const selected: PhysicsProviderId = state.recipe.physics.provider;
  const status = describePhysicsStatus(state.physics);
  const engineReady = state.engine.phase === "ready" && session.engine() !== null;
  const canPreview = schedule !== rafScheduler || RAF_AVAILABLE;

  const onSelect = useCallback(
    (provider: string) => {
      if (!isPhysicsProviderId(provider) || provider === selected) return;
      dispatch({ type: "physics/set-provider", provider });
    },
    [dispatch, selected],
  );

  const onSettle = useCallback(async () => {
    const engine = session.engine();
    if (!engine) {
      setSettleError("엔진이 준비되지 않아 정착을 실행할 수 없습니다.");
      return;
    }
    setBusy(true);
    setSettleError(null);
    try {
      setReceipt(await engine.settle(clampSteps(steps)));
    } catch (error) {
      setReceipt(null);
      setSettleError(`정착 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [session, steps]);

  useEffect(() => {
    if (!playing) return undefined;
    const engine = session.engine();
    if (!engine) {
      setPreviewError("엔진이 준비되지 않아 미리보기를 재생할 수 없습니다.");
      setPlaying(false);
      return undefined;
    }
    const stop = schedule(() => {
      if (inFlight.current) return;
      inFlight.current = true;
      engine
        .settle(1)
        .then(() => {
          setPreviewSteps((n) => n + 1);
        })
        .catch((error: unknown) => {
          setPreviewError(`미리보기 실패: ${error instanceof Error ? error.message : String(error)}`);
          setPlaying(false);
        })
        .finally(() => {
          inFlight.current = false;
        });
    });
    return () => {
      stop();
    };
  }, [playing, schedule, session]);

  return (
    <section className="cl-physics-panel" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className="cl-physics-title">
        물리
      </h2>
      <fieldset className="cl-physics-row">
        <legend>물리 provider</legend>
        {PHYSICS_PROVIDER_IDS.map((id) => {
          const descriptor = PHYSICS_PROVIDER_CATALOG.find((entry) => entry.id === id);
          return (
            <label key={id} title={descriptor?.noteKo}>
              <input type="radio" name={`${ids}-provider`} value={id} checked={selected === id} onChange={(event) => onSelect(event.target.value)} />
              {PHYSICS_PROVIDER_LABELS_KO[id]}
              {descriptor ? <span className="cl-physics-hint">({ROLE_LABELS_KO[descriptor.role]})</span> : null}
            </label>
          );
        })}
      </fieldset>
      <p className="cl-physics-status" role="status" data-tone={status.tone}>
        {status.text}
      </p>
      {state.physics && state.physics.status === "unavailable" ? <p className="cl-physics-reason">선택한 provider는 사용할 수 없습니다. 다른 provider를 직접 선택하세요(자동 대체 없음).</p> : null}
      <div className="cl-physics-row" role="group" aria-label="빠른 안정화 프리셋" data-testid="physics-step-presets">
        {(
          [
            { id: "quick-15", label: "빠른 확인 (15스텝)", value: 15 },
            { id: "standard-60", label: "표준 안정화 (60스텝)", value: 60 },
            { id: "full-120", label: "완전 정착 (120스텝)", value: 120 },
          ] as const
        ).map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="cl-preset-chip"
            aria-pressed={steps === preset.value}
            onClick={() => setSteps(clampSteps(preset.value))}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="cl-physics-row">
        <label htmlFor={`${ids}-steps`}>정착 스텝(최대 {SETTLE_DEFAULTS.maxSteps})</label>
        <input id={`${ids}-steps`} type="number" min={0} max={SETTLE_DEFAULTS.maxSteps} step={1} value={steps} onChange={(event) => setSteps(clampSteps(Number(event.target.value)))} />
        <span className="cl-physics-hint">
          dt 1/{Math.round(1 / SETTLE_DEFAULTS.dtSeconds)} s × 서브스텝 {SETTLE_DEFAULTS.substeps}
        </span>
      </div>
      <div className="cl-physics-actions">
        <button type="button" onClick={() => void onSettle()} disabled={!engineReady || busy}>
          {busy ? "정착 중…" : "정착 실행"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPreviewError(null);
            setPlaying((value) => !value);
          }}
          disabled={!engineReady || !canPreview}
          aria-pressed={playing}
        >
          {playing ? "미리보기 정지" : "미리보기 재생"}
        </button>
        {playing ? <span className="cl-physics-hint">재생 중 · {previewSteps} 스텝</span> : null}
      </div>
      {!engineReady ? <p className="cl-physics-hint">엔진이 준비되면 정착·미리보기를 실행할 수 있습니다.</p> : null}
      {!canPreview ? <p className="cl-physics-hint">이 환경에는 requestAnimationFrame이 없어 미리보기를 재생할 수 없습니다.</p> : null}
      {receipt ? (
        <p className="cl-physics-status" data-tone={receipt.settled ? "ok" : "busy"} data-testid="settle-receipt">
          {receipt.settled ? "정착 완료" : "상한 도달(미수렴)"} · {receipt.steps} 스텝 · 최대 속도 {receipt.maxVelocity.toExponential(2)} m/s
        </p>
      ) : null}
      {settleError ? (
        <p className="cl-physics-reason" role="alert">
          {settleError}
        </p>
      ) : null}
      {previewError ? (
        <p className="cl-physics-reason" role="alert">
          {previewError}
        </p>
      ) : null}

      <div
        className="cl-physics-shaper-dynamicbone"
        data-testid="shaper-physics-dynamicbone-section"
      >
        <h3>SHAPER DynamicBone · 캡슐 콜라이더 베를레 물리</h3>
        <div className="cl-physics-row" role="group" aria-label="DynamicBone 콜라이더 바운드 모드">
          {(
            [
              { id: "outside", label: "외부 밀어내기 (Outside)" },
              { id: "inside", label: "내부 구속 (Inside)" },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              className="cl-preset-chip"
              aria-pressed={dbBoundMode === mode.id}
              data-testid={`shaper-db-bound-${mode.id}`}
              onClick={() => setDbBoundMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div className="cl-physics-row">
          <label htmlFor={`${ids}-db-damping`}>감쇠 (m_Damping)</label>
          <input
            id={`${ids}-db-damping`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={dbDamping}
            onChange={(event) => setDbDamping(Number(event.target.value))}
          />
          <span className="cl-physics-hint">{dbDamping.toFixed(2)}</span>
        </div>
        <div className="cl-physics-row">
          <label htmlFor={`${ids}-db-elasticity`}>탄성 복원 (m_Elasticity)</label>
          <input
            id={`${ids}-db-elasticity`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={dbElasticity}
            onChange={(event) => setDbElasticity(Number(event.target.value))}
          />
          <span className="cl-physics-hint">{dbElasticity.toFixed(2)}</span>
        </div>
        <div className="cl-physics-row">
          <label htmlFor={`${ids}-db-stiffness`}>강성 한계 (m_Stiffness)</label>
          <input
            id={`${ids}-db-stiffness`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={dbStiffness}
            onChange={(event) => setDbStiffness(Number(event.target.value))}
          />
          <span className="cl-physics-hint">{dbStiffness.toFixed(2)}</span>
        </div>
        <div className="cl-physics-row">
          <label htmlFor={`${ids}-db-inert`}>부모 관성 추종 (m_Inert)</label>
          <input
            id={`${ids}-db-inert`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={dbInert}
            onChange={(event) => setDbInert(Number(event.target.value))}
          />
          <span className="cl-physics-hint">{dbInert.toFixed(2)}</span>
        </div>
        <p className="cl-physics-hint" data-testid="shaper-dynamicbone-readout">
          콜라이더 ({dbBoundMode}) 투영 좌표: (
          {shaperDynamicBonePreview.collided.map((v) => v.toFixed(3)).join(", ")}) · 속도 크기{" "}
          {Math.hypot(...shaperDynamicBonePreview.stepped.velocity).toFixed(4)}
        </p>
      </div>
    </section>
  );
}
