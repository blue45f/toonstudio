import "./precision-3d-craft.css";

import { CheckCircle2, Layers, Lightbulb, PenTool, ShieldCheck, Sliders, Wrench } from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  GLB_BUDGET_PROFILES,
  PRECISION_ASSET_ARCHETYPES,
  PRECISION_LIGHTING_PRESETS,
  PRECISION_PBR_MATERIAL_PRESETS,
  applyPrecisionTopologyAutoSnap,
  generateCustomPrecisionAssetSpec,
  type CustomPrecisionAssetSpec,
  type GlbBudgetProfileId,
  type PrecisionAssetArchetypeId,
  type PrecisionLightingPresetId,
  type PrecisionMeshTopologyInput,
  type PrecisionPbrMaterialId,
} from "./precision-3d-mesh-quality-engine";

export interface StudioPrecision3dCraftPanelProps {
  readonly initialArchetypeId?: PrecisionAssetArchetypeId;
  readonly initialProfile?: GlbBudgetProfileId;
  /** 외부 3D 메시의 토폴로지 결함을 진단할 때 주입한다(미전달 시 정밀 빌더 실시간 결과 사용). */
  readonly inspectedMeshOverride?: Partial<PrecisionMeshTopologyInput>;
  readonly onApplySpec?: (spec: CustomPrecisionAssetSpec) => void;
  readonly className?: string;
}

const MATERIAL_IDS: readonly PrecisionPbrMaterialId[] = Object.freeze([
  "ceramic-glaze",
  "satin-wood",
  "brushed-brass",
  "matte-fabric",
]);

const LIGHTING_IDS: readonly PrecisionLightingPresetId[] = Object.freeze([
  "morning-north-window",
  "golden-hour-rim",
  "rofan-candle-warm",
  "studio-neutral-ao",
]);

const SUBD_LEVELS: readonly (0 | 1 | 2 | 3)[] = Object.freeze([0, 1, 2, 3]);
const BEVEL_SEGMENTS: readonly (1 | 2)[] = Object.freeze([1, 2]);
const BUDGET_PROFILES: readonly GlbBudgetProfileId[] = Object.freeze(["desktop-hero@1", "mobile-hero@1"]);

/**
 * 최정밀 커스텀 3D 모델링 품질 스튜디오 패널 (`tool-bg3d.webp` 스프라이트 기반).
 * - 매니폴드 0 품질 신호등(비매니폴드 0 · 루즈 버텍스 0 · 0면적 삼각형 0 · 바닥 접지 Y=0 · 미터 단위 1.0=1m)
 * - 마이크로 베벨(1–2 세그먼트) · Catmull-Clark SubD · Weighted Normal 챔퍼
 * - 이진 금속도(0/1) 물리 PBR 4종 재질 + 조명 프리셋 + 웹툰 NPR 윤곽선/크리스 가중치
 * - 커스텀 리깅 소켓 조립 검증 & GLB 경량 예산(`desktop-hero@1` / `mobile-hero@1`)
 */
export function StudioPrecision3dCraftPanel({
  initialArchetypeId = "cafe-espresso-bar",
  initialProfile = "mobile-hero@1",
  inspectedMeshOverride,
  onApplySpec,
  className = "",
}: StudioPrecision3dCraftPanelProps) {
  const inputId = useId();
  const [archetypeId, setArchetypeId] = useState<PrecisionAssetArchetypeId>(initialArchetypeId);
  const [materialPresetId, setMaterialPresetId] = useState<PrecisionPbrMaterialId>("satin-wood");
  const [lightingPresetId, setLightingPresetId] = useState<PrecisionLightingPresetId>("morning-north-window");
  const [microBevelSegments, setMicroBevelSegments] = useState<1 | 2>(1);
  const [microBevelWidthMm, setMicroBevelWidthMm] = useState<number>(1.8);
  const [subdLevel, setSubdLevel] = useState<0 | 1 | 2 | 3>(1);
  const [weightedNormalChamfer, setWeightedNormalChamfer] = useState<boolean>(true);
  const [nprOutlineWidthPx, setNprOutlineWidthPx] = useState<number>(1.6);
  const [nprCreaseAngleDeg, setNprCreaseAngleDeg] = useState<number>(38);
  const [nprCreaseWeight, setNprCreaseWeight] = useState<number>(0.72);
  const [targetProfile, setTargetProfile] = useState<GlbBudgetProfileId>(initialProfile);
  const [repairedOverride, setRepairedOverride] = useState<PrecisionMeshTopologyInput | null>(null);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);

  const effectiveTopologyOverride = repairedOverride ?? inspectedMeshOverride;

  const spec = useMemo(
    () =>
      generateCustomPrecisionAssetSpec(
        {
          archetypeId,
          materialPresetId,
          lightingPresetId,
          microBevelSegments,
          microBevelWidthMm,
          subdLevel,
          weightedNormalChamfer,
          nprOutlineWidthPx,
          nprCreaseAngleDeg,
          nprCreaseWeight,
          targetProfile,
        },
        effectiveTopologyOverride,
      ),
    [
      archetypeId,
      materialPresetId,
      lightingPresetId,
      microBevelSegments,
      microBevelWidthMm,
      subdLevel,
      weightedNormalChamfer,
      nprOutlineWidthPx,
      nprCreaseAngleDeg,
      nprCreaseWeight,
      targetProfile,
      effectiveTopologyOverride,
    ],
  );

  const manifoldTone = spec.topologyAudit.passed
    ? "good"
    : spec.topologyAudit.grade === "needs-repair"
      ? "warn"
      : "bad";
  const budgetTone = spec.glbBudget.passed
    ? spec.glbBudget.triangleUtilizationPercent >= 85
      ? "warn"
      : "good"
    : "bad";

  function handleSelectArchetype(nextId: PrecisionAssetArchetypeId) {
    const found = PRECISION_ASSET_ARCHETYPES.find((item) => item.id === nextId);
    setArchetypeId(nextId);
    if (found) {
      setMaterialPresetId(found.defaultMaterialId);
      setLightingPresetId(found.defaultLightingId);
    }
    setApplyNotice(null);
  }

  function handleAutoRepairTopology() {
    const currentInput: PrecisionMeshTopologyInput = {
      meshName: spec.topologyAudit.meshName,
      vertexCount: spec.geometry.estimatedVertices,
      triangleCount: spec.geometry.estimatedTriangles,
      quadRatio: weightedNormalChamfer ? 0.96 : 0.91,
      nonManifoldEdges: 0,
      boundaryEdges: 0,
      looseVertices: 0,
      zeroAreaTriangles: 0,
      minY: 0,
      unitScaleMeters: 1,
      boundingBoxMeters: spec.archetype.dimensionsMeters,
      ...effectiveTopologyOverride,
    };
    setRepairedOverride(applyPrecisionTopologyAutoSnap(currentInput));
    setApplyNotice("비매니폴드·루즈 버텍스·0면적 삼각형을 정리하고 바닥(Y=0)과 미터 단위(1.0=1m)에 맞췄어요.");
  }

  function handleApplySpec() {
    onApplySpec?.(spec);
    setApplyNotice(
      `${spec.archetype.labelKo} 정밀 스펙(${spec.material.labelKo} · SubD ${spec.geometry.subdLevel} · 베벨 ${spec.geometry.microBevelSegments}단)을 적용했어요.`,
    );
  }

  return (
    <section
      className={`p3d-craft-shell ${className}`.trim()}
      data-testid="studio-precision-3d-craft-panel"
      aria-label="최정밀 커스텀 3D 모델링 품질 도구"
    >
      <div className="p3d-craft-body">
        <header className="p3d-craft-header">
          <div className="p3d-craft-header-main">
            <span className="p3d-craft-sprite-frame" aria-hidden="true">
              <img
                src="/assets/studio/vibrant-sprites/tool-bg3d.webp"
                alt=""
                width={40}
                height={40}
                loading="lazy"
                decoding="async"
              />
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-black text-fg">최정밀 커스텀 3D 모델링 품질 엔진</h3>
                <span
                  className="p3d-craft-pill p3d-craft-num"
                  data-tone={manifoldTone}
                  data-testid="p3d-manifold-traffic-badge"
                >
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  {spec.topologyAudit.passed
                    ? `매니폴드 0 · 히어로 합격 (${spec.topologyAudit.score}점)`
                    : `정밀 보정 필요 (${spec.topologyAudit.score}점)`}
                </span>
              </div>
              <p className="text-xs leading-5 text-fg-2">
                Quad SubD · 마이크로 베벨 · 이진 금속도(0/1) PBR · 웹툰 NPR 선화 · GLB 경량 예산을 실시간으로 검수합니다.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!spec.topologyAudit.passed ? (
              <button
                type="button"
                data-testid="p3d-auto-repair-btn"
                data-variant="repair"
                className="p3d-craft-action-btn"
                onClick={handleAutoRepairTopology}
              >
                <Wrench className="size-4" aria-hidden="true" />
                자동 보정 · 바닥 접지(Y=0)
              </button>
            ) : null}
            <button
              type="button"
              data-testid="p3d-apply-spec-btn"
              data-variant="primary"
              className="p3d-craft-action-btn"
              onClick={handleApplySpec}
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              정밀 3D 스펙 적용
            </button>
          </div>
        </header>

        <section className="p3d-craft-section" aria-label="매니폴드 0 정밀 토폴로지 신호등">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-black text-fg">
              <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
              1. 매니폴드 무결성 & 접지 신호등
            </h4>
            <span className="p3d-craft-pill p3d-craft-num" data-tone={spec.rigAssembly.passed ? "good" : "bad"}>
              리깅 소켓 {spec.rigAssembly.socketCount}개 · {spec.rigAssembly.passed ? "조립 통과" : "조립 오류"}
            </span>
          </div>

          <div className="p3d-craft-check-grid" role="list" aria-label="토폴로지 정밀 검사 항목">
            {spec.topologyAudit.checks.map((check) => (
              <article
                key={check.id}
                role="listitem"
                className="p3d-craft-check-card"
                data-status={check.status}
                data-testid={`p3d-check-${check.id}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[0.7rem] font-bold text-fg-2">{check.labelKo}</span>
                  <span
                    className="p3d-craft-pill p3d-craft-num"
                    data-tone={check.status === "pass" ? "good" : check.status === "warn" ? "warn" : "bad"}
                  >
                    {check.actualLabel}
                  </span>
                </div>
                <span className="p3d-craft-num text-[0.6875rem] text-fg-3">기준: {check.targetLabel}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="p3d-craft-section" aria-label="커스텀 3D 소품 및 조명 프리셋">
          <h4 className="flex items-center gap-1.5 text-xs font-black text-fg">
            <Layers className="size-4 text-accent" aria-hidden="true" />
            2. 커스텀 3D 건축·소품 & 조명 프리셋
          </h4>

          <div className="p3d-craft-chip-grid" data-cols="5" role="group" aria-label="커스텀 3D 소품 프리셋 선택">
            {PRECISION_ASSET_ARCHETYPES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={archetypeId === item.id}
                data-testid={`p3d-archetype-${item.id}`}
                className="p3d-craft-btn"
                onClick={() => handleSelectArchetype(item.id)}
              >
                <span className="text-fg">{item.labelKo}</span>
                <span className="text-[0.6875rem] font-normal text-fg-3">{item.categoryKo}</span>
              </button>
            ))}
          </div>

          <div className="p3d-craft-chip-grid" data-cols="4" role="group" aria-label="3D 스튜디오 조명 프리셋 선택">
            {LIGHTING_IDS.map((lightId) => {
              const preset = PRECISION_LIGHTING_PRESETS[lightId];
              return (
                <button
                  key={lightId}
                  type="button"
                  aria-pressed={lightingPresetId === lightId}
                  data-testid={`p3d-lighting-${lightId}`}
                  className="p3d-craft-btn"
                  onClick={() => setLightingPresetId(lightId)}
                >
                  <span className="inline-flex items-center gap-1 text-fg">
                    <Lightbulb className="size-3.5 text-accent" aria-hidden="true" />
                    {preset.labelKo}
                  </span>
                  <span className="p3d-craft-num text-[0.6875rem] font-normal text-fg-3">
                    {preset.keyLightKelvin}K · AO {preset.ambientOcclusionRadiusMeters}m
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="p3d-craft-controls-grid">
          <section className="p3d-craft-section" aria-label="마이크로 베벨 및 Catmull-Clark SubD 설정">
            <h4 className="flex items-center gap-1.5 text-xs font-black text-fg">
              <Sliders className="size-4 text-accent" aria-hidden="true" />
              3. 마이크로 베벨 · Quad SubD · Weighted Normal
            </h4>

            <div className="flex flex-wrap gap-2" role="group" aria-label="마이크로 베벨 세그먼트">
              {BEVEL_SEGMENTS.map((seg) => (
                <button
                  key={seg}
                  type="button"
                  aria-pressed={microBevelSegments === seg}
                  data-testid={`p3d-bevel-seg-${seg}`}
                  className="p3d-craft-btn p3d-craft-num"
                  onClick={() => setMicroBevelSegments(seg)}
                >
                  베벨 {seg} 세그먼트
                </button>
              ))}
              <button
                type="button"
                aria-pressed={weightedNormalChamfer}
                data-testid="p3d-weighted-normal-toggle"
                className="p3d-craft-btn"
                onClick={() => setWeightedNormalChamfer((prev) => !prev)}
              >
                Weighted Normal 챔퍼: {weightedNormalChamfer ? "켜짐" : "꺼짐"}
              </button>
            </div>

            <label htmlFor={`${inputId}-bevel-width`} className="space-y-1 text-xs font-bold text-fg-2">
              <span className="p3d-craft-num">마이크로 베벨 폭: {spec.geometry.microBevelWidthMm.toFixed(1)}mm</span>
              <input
                id={`${inputId}-bevel-width`}
                type="range"
                min={0.4}
                max={6.0}
                step={0.2}
                value={microBevelWidthMm}
                onChange={(event) => setMicroBevelWidthMm(Number(event.target.value))}
                className="p3d-craft-range"
              />
            </label>

            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-fg-2">Catmull-Clark SubD 단계</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Catmull-Clark SubD 단계">
                {SUBD_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={subdLevel === level}
                    data-testid={`p3d-subd-${level}`}
                    className="p3d-craft-btn p3d-craft-num"
                    onClick={() => setSubdLevel(level)}
                  >
                    SubD {level}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="p3d-craft-section" aria-label="물리 PBR 재질 4종 및 웹툰 NPR 선화 제어">
            <h4 className="flex items-center gap-1.5 text-xs font-black text-fg">
              <PenTool className="size-4 text-accent" aria-hidden="true" />
              4. 물리 PBR 재질(이진 금속도 0/1) · 웹툰 NPR 선화
            </h4>

            <div className="p3d-craft-chip-grid" role="group" aria-label="물리 PBR 재질 프리셋 선택">
              {MATERIAL_IDS.map((matId) => {
                const mat = PRECISION_PBR_MATERIAL_PRESETS[matId];
                return (
                  <button
                    key={matId}
                    type="button"
                    aria-pressed={materialPresetId === matId}
                    data-testid={`p3d-material-${matId}`}
                    className="p3d-craft-btn"
                    onClick={() => setMaterialPresetId(matId)}
                  >
                    <span className="text-fg">{mat.labelKo}</span>
                    <span className="p3d-craft-num text-[0.6875rem] font-normal text-fg-3">
                      Metallic {mat.metallic} · Rough {mat.roughness.toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="p3d-craft-num rounded-lg border border-line bg-panel px-2.5 py-2 text-[0.7rem] leading-5 text-fg-2" data-testid="p3d-pbr-readout">
              Metallic {spec.material.metallic} · Roughness {spec.material.roughness.toFixed(2)} · Coat{" "}
              {spec.material.coat.toFixed(2)} · Sheen {spec.material.sheen.toFixed(2)} · Normal{" "}
              {spec.proceduralMaps.normalStrength.toFixed(2)} · AO {spec.proceduralMaps.aoStrength.toFixed(2)}
            </p>

            <label htmlFor={`${inputId}-npr-outline`} className="space-y-1 text-xs font-bold text-fg-2">
              <span className="p3d-craft-num">
                웹툰 NPR 선화 두께: {spec.nprPreset.outlineWidthPx.toFixed(1)}px ({spec.nprPreset.recommendedStyleKo})
              </span>
              <input
                id={`${inputId}-npr-outline`}
                data-testid="p3d-npr-outline-slider"
                type="range"
                min={0.5}
                max={4.5}
                step={0.1}
                value={nprOutlineWidthPx}
                onChange={(event) => setNprOutlineWidthPx(Number(event.target.value))}
                className="p3d-craft-range"
              />
            </label>

            <label htmlFor={`${inputId}-npr-crease`} className="space-y-1 text-xs font-bold text-fg-2">
              <span className="p3d-craft-num">
                크리스 가중치: {spec.nprPreset.creaseWeight.toFixed(2)} (각도 {spec.nprPreset.creaseAngleDeg}°)
              </span>
              <input
                id={`${inputId}-npr-crease`}
                data-testid="p3d-npr-crease-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={nprCreaseWeight}
                onChange={(event) => setNprCreaseWeight(Number(event.target.value))}
                className="p3d-craft-range"
              />
            </label>

            <label htmlFor={`${inputId}-npr-crease-angle`} className="space-y-1 text-xs font-bold text-fg-2">
              <span className="p3d-craft-num">크리스 검출 각도: {spec.nprPreset.creaseAngleDeg}°</span>
              <input
                id={`${inputId}-npr-crease-angle`}
                data-testid="p3d-npr-crease-angle-slider"
                type="range"
                min={15}
                max={75}
                step={1}
                value={nprCreaseAngleDeg}
                onChange={(event) => setNprCreaseAngleDeg(Number(event.target.value))}
                className="p3d-craft-range"
              />
            </label>
          </section>
        </div>

        <section className="p3d-craft-section" aria-label="GLB 경량 예산 검사">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="GLB 경량 예산 프로파일 선택">
              {BUDGET_PROFILES.map((profileId) => (
                <button
                  key={profileId}
                  type="button"
                  aria-pressed={targetProfile === profileId}
                  data-testid={`p3d-budget-profile-${profileId}`}
                  className="p3d-craft-btn"
                  onClick={() => setTargetProfile(profileId)}
                >
                  {GLB_BUDGET_PROFILES[profileId].labelKo}
                </button>
              ))}
            </div>

            <span className="p3d-craft-pill p3d-craft-num" data-tone={budgetTone} data-testid="p3d-glb-budget-badge">
              {spec.glbBudget.passed
                ? `GLB 예산 통과 · ${spec.glbBudget.score}점`
                : `예산 초과 · ${spec.glbBudget.triangleUtilizationPercent}%`}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-fg-2">
              <span className="p3d-craft-num font-bold">
                삼각형 {spec.glbMetrics.triangles.toLocaleString("ko-KR")} /{" "}
                {GLB_BUDGET_PROFILES[targetProfile].maxTriangles.toLocaleString("ko-KR")} (
                {spec.glbBudget.triangleUtilizationPercent}%)
              </span>
              <span className="p3d-craft-num">
                예상 용량 {(spec.glbMetrics.estimatedBytes / (1024 * 1024)).toFixed(2)}MiB · 드로우콜{" "}
                {spec.glbMetrics.drawCalls}회
              </span>
            </div>
            <div className="p3d-craft-bar-track" role="progressbar" aria-label="GLB 삼각형 예산 사용률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, spec.glbBudget.triangleUtilizationPercent)}>
              <div
                className="p3d-craft-bar-fill"
                data-tone={budgetTone}
                style={{ width: `${Math.min(100, spec.glbBudget.triangleUtilizationPercent)}%` }}
              />
            </div>
            {spec.glbBudget.violationsKo.length > 0 ? (
              <p role="alert" data-testid="p3d-glb-budget-alert" className="text-xs font-bold text-bad">
                {spec.glbBudget.violationsKo.join(" · ")} — {spec.glbBudget.optimizationHintsKo[0]}
              </p>
            ) : null}
          </div>
        </section>

        {applyNotice ? (
          <p role="status" data-testid="p3d-apply-status" className="rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-good">
            {applyNotice}
          </p>
        ) : null}
      </div>
    </section>
  );
}
