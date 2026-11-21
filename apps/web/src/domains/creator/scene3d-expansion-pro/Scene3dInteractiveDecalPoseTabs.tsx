import { useId, useMemo, useState } from "react";

import {
  evaluateInteractiveSceneState,
  getSamplePhotoPosePreset,
  INTERACTIVE_ENVIRONMENT_PRESETS,
  PHOTO_POSE_PRESET_LIST,
  project2dDecalOnto3dSurface,
  reconstruct3dPoseAndCameraFromPhoto,
  type DecalKind,
  type InteractiveEnvironmentPreset,
  type PhotoPosePresetId,
} from "./scene3d-interactive-decal-pose-engine";

export type InteractiveDecalPoseTabId =
  | "scene-props-season"
  | "wall-decal-2d"
  | "photo-pose-clone";

const DECAL_KIND_LABELS: readonly { readonly id: DecalKind; readonly labelKo: string }[] = [
  { id: "korean-signboard", labelKo: "한글 간판" },
  { id: "poster", labelKo: "벽면 포스터" },
  { id: "graffiti-brush", labelKo: "2D 브러시 낙서" },
];

const SKELETON_BONE_PAIRS: readonly (readonly [
  keyof ReturnType<typeof reconstruct3dPoseAndCameraFromPhoto>["skeleton2dNormalized"],
  keyof ReturnType<typeof reconstruct3dPoseAndCameraFromPhoto>["skeleton2dNormalized"],
])[] = [
  ["nose", "neck"],
  ["neck", "leftShoulder"],
  ["neck", "rightShoulder"],
  ["leftShoulder", "leftElbow"],
  ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"],
  ["rightElbow", "rightWrist"],
  ["neck", "pelvis"],
  ["pelvis", "leftHip"],
  ["pelvis", "rightHip"],
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftAnkle"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightAnkle"],
];

export function Scene3dInteractiveDecalPoseTabs({
  activeTab,
}: {
  readonly activeTab: InteractiveDecalPoseTabId;
}) {
  const baseId = useId();

  // 5. 배경 소품 & 계절·파괴 1클릭 전환 상태
  const [envPreset, setEnvPreset] = useState<InteractiveEnvironmentPreset>("spring-sakura");
  const [doorOpenDeg, setDoorOpenDeg] = useState<number>(35);
  const [lampIntensityPct, setLampIntensityPct] = useState<number>(68);
  const [curtainSwayPct, setCurtainSwayPct] = useState<number>(30);

  // 6. 3D 벽면·간판 2D 데칼 투영 상태
  const [decalText, setDecalText] = useState<string>("신림 24시 떡볶이");
  const [decalKind, setDecalKind] = useState<DecalKind>("korean-signboard");
  const [wallYawDeg, setWallYawDeg] = useState<number>(28);

  // 7. 사진 1장 → 3D 포즈 & 카메라 복제 상태
  const [photoPresetId, setPhotoPresetId] = useState<PhotoPosePresetId>("hero-landing");

  const sceneState = useMemo(
    () =>
      evaluateInteractiveSceneState({
        preset: envPreset,
        doorOpenDeg,
        lampIntensityPct,
        curtainSwayPct,
      }),
    [envPreset, doorOpenDeg, lampIntensityPct, curtainSwayPct],
  );

  const decalResult = useMemo(() => {
    const yawRad = (wallYawDeg * Math.PI) / 180;
    return project2dDecalOnto3dSurface({
      textKo: decalText,
      decalKind,
      decalBoundsUv: { uMin: 0.14, vMin: 0.2, uMax: 0.88, vMax: 0.78 },
      brushStrokesUv: [
        [
          { x: 0.18, y: 0.35 },
          { x: 0.5, y: 0.28 },
          { x: 0.82, y: 0.44 },
        ],
        [
          { x: 0.24, y: 0.64 },
          { x: 0.76, y: 0.62 },
        ],
      ],
      surface: {
        origin: { x: 0, y: 1.5, z: 0 },
        normal: { x: Math.sin(yawRad), y: 0, z: Math.cos(yawRad) },
        tangentU: { x: Math.cos(yawRad), y: 0, z: -Math.sin(yawRad) },
        widthMeters: 2.8,
        heightMeters: 1.7,
      },
    });
  }, [decalText, decalKind, wallYawDeg]);

  const photoSample = useMemo(() => getSamplePhotoPosePreset(photoPresetId), [photoPresetId]);
  const photoPoseResult = useMemo(
    () => reconstruct3dPoseAndCameraFromPhoto(photoSample.input),
    [photoSample],
  );

  if (activeTab === "scene-props-season") {
    const swatches = [
      { label: "하늘", color: sceneState.lighting.skyColorOklch },
      { label: "주광", color: sceneState.lighting.keyLightOklch },
      { label: "환경광", color: sceneState.lighting.ambientFillOklch },
      { label: "안개", color: sceneState.lighting.fogColorOklch },
      { label: "파티클", color: sceneState.lighting.accentParticleOklch },
    ];
    return (
      <div className="s3e-panel" data-testid="s3e-tab-scene-props">
        <div className="s3e-card">
          <h3 className="s3e-card-title">5. 배경 소품 상태 & 계절·파괴 1클릭 전환</h3>
          <p className="s3e-card-desc">{sceneState.moodSummaryKo}</p>
          <div className="s3e-pill-row" role="group" aria-label="계절 및 파괴 환경 프리셋">
            {INTERACTIVE_ENVIRONMENT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="s3e-btn"
                aria-pressed={envPreset === preset.id}
                onClick={() => setEnvPreset(preset.id)}
              >
                {preset.labelKo}
              </button>
            ))}
          </div>
          <div className="s3e-field">
            <div className="s3e-field-head">
              <label htmlFor={`${baseId}-door-open`}>문 열림 각도</label>
              <span className="s3e-num">{doorOpenDeg}°</span>
            </div>
            <input
              id={`${baseId}-door-open`}
              type="range"
              className="s3e-range"
              min={0}
              max={90}
              step={1}
              value={doorOpenDeg}
              onChange={(event) => setDoorOpenDeg(Number(event.currentTarget.value))}
            />
          </div>
          <div className="s3e-field">
            <div className="s3e-field-head">
              <label htmlFor={`${baseId}-lamp-pct`}>실내 조명 점등</label>
              <span className="s3e-num">{lampIntensityPct}%</span>
            </div>
            <input
              id={`${baseId}-lamp-pct`}
              type="range"
              className="s3e-range"
              min={0}
              max={100}
              step={1}
              value={lampIntensityPct}
              onChange={(event) => setLampIntensityPct(Number(event.currentTarget.value))}
            />
          </div>
          <div className="s3e-field">
            <div className="s3e-field-head">
              <label htmlFor={`${baseId}-curtain-sway`}>커튼 흔들림</label>
              <span className="s3e-num">
                기본 {curtainSwayPct}% → 연동 {sceneState.props.curtain.effectiveSwayPct}%
              </span>
            </div>
            <input
              id={`${baseId}-curtain-sway`}
              type="range"
              className="s3e-range"
              min={0}
              max={100}
              step={1}
              value={curtainSwayPct}
              onChange={(event) => setCurtainSwayPct(Number(event.currentTarget.value))}
            />
          </div>
        </div>
        <div className="s3e-card">
          <h4 className="s3e-card-title">OKLCH 조명·파티클 전환 상태</h4>
          <div className="s3e-env-swatch" data-testid="s3e-env-swatches">
            {swatches.map((swatch) => (
              <div key={swatch.label} className="s3e-swatch-chip">
                <span className="s3e-swatch-dot" style={{ backgroundColor: swatch.color }} />
                <span>{swatch.label}</span>
              </div>
            ))}
          </div>
          <div className="s3e-metrics-grid">
            <div className="s3e-metric">
              <span className="s3e-metric-label">활성 파티클</span>
              <span className="s3e-metric-value" data-testid="s3e-env-particle">
                {sceneState.particles.labelKo} ({sceneState.particles.count})
              </span>
            </div>
            <div className="s3e-metric">
              <span className="s3e-metric-label">노면 습기 / 파손률</span>
              <span className="s3e-metric-value">
                {Math.round(sceneState.lighting.surfaceWetness * 100)}% /{" "}
                {Math.round(sceneState.lighting.structuralDamageRatio * 100)}%
              </span>
            </div>
            <div className="s3e-metric">
              <span className="s3e-metric-label">실내 광속</span>
              <span className="s3e-metric-value">{sceneState.props.lamp.luminousFluxLm} lm</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "wall-decal-2d") {
    const centerPt = {
      x:
        (decalResult.screenCorners[0].x +
          decalResult.screenCorners[1].x +
          decalResult.screenCorners[2].x +
          decalResult.screenCorners[3].x) /
        4,
      y:
        (decalResult.screenCorners[0].y +
          decalResult.screenCorners[1].y +
          decalResult.screenCorners[2].y +
          decalResult.screenCorners[3].y) /
        4,
    };
    return (
      <div className="s3e-panel" data-testid="s3e-tab-wall-decal">
        <div className="s3e-card">
          <h3 className="s3e-card-title">6. 3D 벽면·간판 위 2D 브러시 직접 투영 데칼</h3>
          <p className="s3e-card-desc">
            한글 간판·포스터·2D 낙서를 3D 벽면 법선과 UV 평면에 투시 호모그래피로 밀착 투영하며,
            경계 클리핑과 사선 왜곡 보정을 자동 계산합니다.
          </p>
          <div className="s3e-field">
            <label htmlFor={`${baseId}-decal-text`}>투영할 한글 간판·문구</label>
            <input
              id={`${baseId}-decal-text`}
              type="text"
              className="s3e-input"
              value={decalText}
              onChange={(event) => setDecalText(event.currentTarget.value)}
            />
          </div>
          <div className="s3e-pill-row" role="group" aria-label="데칼 종류 선택">
            {DECAL_KIND_LABELS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="s3e-btn"
                aria-pressed={decalKind === item.id}
                onClick={() => setDecalKind(item.id)}
              >
                {item.labelKo}
              </button>
            ))}
          </div>
          <div className="s3e-field">
            <div className="s3e-field-head">
              <label htmlFor={`${baseId}-wall-yaw`}>3D 벽면 회전 각도</label>
              <span className="s3e-num">{wallYawDeg}°</span>
            </div>
            <input
              id={`${baseId}-wall-yaw`}
              type="range"
              className="s3e-range"
              min={-55}
              max={55}
              step={1}
              value={wallYawDeg}
              onChange={(event) => setWallYawDeg(Number(event.currentTarget.value))}
            />
          </div>
        </div>
        <div className="s3e-card">
          <h4 className="s3e-card-title">투시 호모그래피 투영 미리보기</h4>
          <div className="s3e-preview-stage">
            <svg
              className="s3e-svg"
              viewBox="0 0 320 200"
              role="img"
              aria-label="3D 벽면 투시 데칼 투영 미리보기"
            >
              <polygon
                points={decalResult.svgPolygonPoints}
                fill="var(--s3e-decal-fill)"
                stroke="var(--s3e-t6)"
                strokeWidth={2}
              />
              {decalResult.projectedStrokes.map((stroke, idx) => (
                <polyline
                  key={`stroke-${idx}`}
                  points={stroke.map((pt) => `${pt.x},${pt.y}`).join(" ")}
                  fill="none"
                  stroke="var(--s3e-ink-outline)"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                />
              ))}
              <text
                x={centerPt.x}
                y={centerPt.y}
                textAnchor="middle"
                fill="var(--s3e-ink-outline)"
                fontSize="12"
                fontWeight="700"
              >
                {decalResult.textKo}
              </text>
            </svg>
          </div>
          <div className="s3e-metrics-grid">
            <div className="s3e-metric">
              <span className="s3e-metric-label">호모그래피 오차</span>
              <span className="s3e-metric-value s3e-status-ok" data-testid="s3e-decal-error">
                {decalResult.homographyMaxErrorPx.toFixed(4)}px
              </span>
            </div>
            <div className="s3e-metric">
              <span className="s3e-metric-label">사선 보정 배율</span>
              <span className="s3e-metric-value">
                {decalResult.distortionCompensation.aspectCorrectionScale.toFixed(2)}x
              </span>
            </div>
            <div className="s3e-metric">
              <span className="s3e-metric-label">벽면 입사각</span>
              <span className="s3e-metric-value">
                {decalResult.distortionCompensation.obliqueAngleDeg}°
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const skel = photoPoseResult.skeleton2dNormalized;
  return (
    <div className="s3e-panel" data-testid="s3e-tab-photo-pose">
      <div className="s3e-card">
        <h3 className="s3e-card-title">7. 사진 1장 → 3D 전신·손 포즈 + 카메라 각도 복제</h3>
        <p className="s3e-card-desc">{photoSample.descriptionKo}</p>
        <div className="s3e-pill-row" role="group" aria-label="사진 포즈 샘플 선택">
          {PHOTO_POSE_PRESET_LIST.map((item) => (
            <button
              key={item.id}
              type="button"
              className="s3e-btn"
              aria-pressed={photoPresetId === item.id}
              onClick={() => setPhotoPresetId(item.id)}
            >
              {item.labelKo}
            </button>
          ))}
        </div>
        <div className="s3e-metrics-grid">
          <div className="s3e-metric">
            <span className="s3e-metric-label">복원 카메라 렌즈</span>
            <span className="s3e-metric-value" data-testid="s3e-photo-focal">
              {photoPoseResult.camera.focalLengthMm}mm
            </span>
          </div>
          <div className="s3e-metric">
            <span className="s3e-metric-label">피치 / 요 각도</span>
            <span className="s3e-metric-value" data-testid="s3e-photo-camera-angles">
              {photoPoseResult.camera.pitchDeg}° / {photoPoseResult.camera.yawDeg}°
            </span>
          </div>
          <div className="s3e-metric">
            <span className="s3e-metric-label">왼손 / 오른손 복원</span>
            <span className="s3e-metric-value" data-testid="s3e-photo-hands">
              {photoPoseResult.hands.left.gripLabelKo} · {photoPoseResult.hands.right.gripLabelKo}
            </span>
          </div>
        </div>
        <ul className="s3e-list">
          <li className="s3e-list-item">
            <span>카메라 구도 판정</span>
            <strong>{photoPoseResult.camera.shotLabelKo}</strong>
          </li>
          <li className="s3e-list-item">
            <span>척추 회전 (Pitch / Yaw / Roll)</span>
            <span className="s3e-num">
              {photoPoseResult.joints.spine.pitchDeg}° / {photoPoseResult.joints.spine.yawDeg}° /{" "}
              {photoPoseResult.joints.spine.rollDeg}°
            </span>
          </li>
          <li className="s3e-list-item">
            <span>복원 신뢰도 / 재투영 오차</span>
            <span className="s3e-status-ok s3e-num">
              {Math.round(photoPoseResult.confidence * 100)}% · {photoPoseResult.reprojectionErrorPx}px
            </span>
          </li>
        </ul>
      </div>
      <div className="s3e-card">
        <h4 className="s3e-card-title">2D 관절 랜드마크 → 3D 리깅 매핑</h4>
        <div className="s3e-preview-stage">
          <svg
            className="s3e-svg"
            viewBox="0 0 180 220"
            role="img"
            aria-label="사진에서 복원된 3D 관절 스켈레톤"
          >
            {SKELETON_BONE_PAIRS.map(([fromKey, toKey]) => {
              const a = skel[fromKey];
              const b = skel[toKey];
              return (
                <line
                  key={`${fromKey}-${toKey}`}
                  x1={a.x * 180}
                  y1={a.y * 220}
                  x2={b.x * 180}
                  y2={b.y * 220}
                  stroke="var(--s3e-t7)"
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              );
            })}
            {(Object.keys(skel) as (keyof typeof skel)[]).map((jointKey) => (
              <circle
                key={jointKey}
                cx={skel[jointKey].x * 180}
                cy={skel[jointKey].y * 220}
                r={3.5}
                fill="var(--s3e-ink-outline)"
              />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
