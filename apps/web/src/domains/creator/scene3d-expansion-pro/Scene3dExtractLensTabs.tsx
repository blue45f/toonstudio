import { useId, useMemo, useState } from "react";

import {
  buildSampleWebtoonDepthNormalBuffer,
  evaluateFaceSdfAndEyeLookAt,
  evaluateHeroPerspectiveLens,
  extractThreeLayerWebtoonInkAndTone,
  MULTI_CHARACTER_SNAP_PRESETS,
  solveMultiCharacterInteractionSnap,
  WEBTOON_EXTRACT_SCENE_PRESETS,
  type EyeLookAtTargetMode,
  type ExtractedLayerId,
  type MultiCharacterSnapPreset,
  type WebtoonExtractScenePreset,
} from "./scene3d-webtoon-extract-lens-engine";

export type ExtractLensTabId =
  | "webtoon-3layer"
  | "hero-lens"
  | "couple-snap"
  | "face-sdf-lookat";

const EYE_TARGETS: Record<
  EyeLookAtTargetMode,
  { readonly labelKo: string; readonly position: { readonly x: number; readonly y: number; readonly z: number } }
> = {
  camera: { labelKo: "카메라 렌즈 응시", position: { x: 0.24, y: 1.58, z: 1.65 } },
  "partner-character": { labelKo: "상대 캐릭터 응시", position: { x: -0.78, y: 1.48, z: 0.55 } },
  "custom-point": { labelKo: "극단 측면 대상 (한계 검증)", position: { x: 2.2, y: 2.4, z: 0.15 } },
};

export function Scene3dExtractLensTabs({ activeTab }: { readonly activeTab: ExtractLensTabId }) {
  const baseId = useId();

  // 1. 3계층 선화·톤 추출 상태
  const [scenePreset, setScenePreset] = useState<WebtoonExtractScenePreset>("character-closeup");
  const [visibleLayers, setVisibleLayers] = useState<Record<ExtractedLayerId, boolean>>({
    "outline-gpen": true,
    "detail-marupen": true,
    "cel-tone-2step": true,
  });

  // 2. 히어로 퍼스펙티브 상태
  const [exaggerationFactor, setExaggerationFactor] = useState<number>(1.38);
  const [heroFocalMm, setHeroFocalMm] = useState<number>(35);

  // 3. 2~4인 커플·액션 자석 포즈 스냅 상태
  const [snapPreset, setSnapPreset] = useState<MultiCharacterSnapPreset>("hug");
  const [heightRatio, setHeightRatio] = useState<number>(0.88);
  const [characterCount, setCharacterCount] = useState<2 | 3 | 4>(2);

  // 4. 얼굴 Face SDF & 시선 추적 상태
  const [lightAzimuthDeg, setLightAzimuthDeg] = useState<number>(48);
  const [lightElevationDeg, setLightElevationDeg] = useState<number>(28);
  const [targetMode, setTargetMode] = useState<EyeLookAtTargetMode>("camera");

  const extractResult = useMemo(() => {
    const sample = buildSampleWebtoonDepthNormalBuffer(scenePreset, 40, 30);
    return extractThreeLayerWebtoonInkAndTone({
      width: sample.width,
      height: sample.height,
      depthBuffer: sample.depthBuffer,
      normalBuffer: sample.normalBuffer,
    });
  }, [scenePreset]);

  const heroResult = useMemo(
    () => evaluateHeroPerspectiveLens({ exaggerationFactor, focalLengthMm: heroFocalMm }),
    [exaggerationFactor, heroFocalMm],
  );

  const snapResult = useMemo(
    () =>
      solveMultiCharacterInteractionSnap({
        preset: snapPreset,
        heightRatio,
        characterCount,
      }),
    [snapPreset, heightRatio, characterCount],
  );

  const faceResult = useMemo(
    () =>
      evaluateFaceSdfAndEyeLookAt({
        lightAzimuthDeg,
        lightElevationDeg,
        targetMode,
        targetPosition: EYE_TARGETS[targetMode].position,
      }),
    [lightAzimuthDeg, lightElevationDeg, targetMode],
  );

  if (activeTab === "webtoon-3layer") {
    const [outlineLayer, detailLayer, celLayer] = extractResult.layers;
    const toggleLayer = (id: ExtractedLayerId) => {
      setVisibleLayers((prev) => ({ ...prev, [id]: !prev[id] }));
    };
    return (
      <div className="s3e-panel" data-testid="s3e-tab-webtoon-3layer">
        <div className="s3e-card">
          <h3 className="s3e-card-title">1. 원클릭 3D → 한국 웹툰 3계층 선화·톤 추출</h3>
          <p className="s3e-card-desc">
            깊이·법선 버퍼에서 외곽선(G펜 2.4px), 내부 디테일선(마루펜 0.9px), 2단 셀 명암을
            독립 레이어로 분리합니다.
          </p>
          <div className="s3e-pill-row" role="group" aria-label="샘플 3D 씬 선택">
            {WEBTOON_EXTRACT_SCENE_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="s3e-btn"
                aria-pressed={scenePreset === item.id}
                onClick={() => setScenePreset(item.id)}
              >
                {item.labelKo}
              </button>
            ))}
          </div>
          <div className="s3e-pill-row" role="group" aria-label="추출 레이어 표시 토글">
            {extractResult.layers.map((layer) => (
              <button
                key={layer.id}
                type="button"
                className="s3e-btn"
                aria-pressed={visibleLayers[layer.id]}
                onClick={() => toggleLayer(layer.id)}
              >
                {layer.penLabelKo} ({visibleLayers[layer.id] ? "표시" : "숨김"})
              </button>
            ))}
          </div>
          <div className="s3e-metrics-grid">
            <div className="s3e-metric">
              <span className="s3e-metric-label">외곽선 (G펜)</span>
              <span className="s3e-metric-value" data-testid="s3e-outline-count">
                {outlineLayer.activePixelCount}px · {outlineLayer.strokeWidthPx}px
              </span>
            </div>
            <div className="s3e-metric">
              <span className="s3e-metric-label">내부선 (마루펜)</span>
              <span className="s3e-metric-value" data-testid="s3e-detail-count">
                {detailLayer.activePixelCount}px · {detailLayer.strokeWidthPx}px
              </span>
            </div>
            <div className="s3e-metric">
              <span className="s3e-metric-label">2단 셀 그림자</span>
              <span className="s3e-metric-value" data-testid="s3e-cel-count">
                중간 {extractResult.celBreakdown.midShadowCount} · 진함{" "}
                {extractResult.celBreakdown.deepShadowCount}
              </span>
            </div>
          </div>
        </div>
        <div className="s3e-card">
          <h4 className="s3e-card-title">독립 3계층 실시간 SVG 미리보기</h4>
          <div className="s3e-preview-stage">
            <svg
              className="s3e-svg"
              viewBox={`0 0 ${extractResult.width} ${extractResult.height}`}
              role="img"
              aria-label="3계층 선화 및 2단 셀 명암 미리보기"
            >
              {visibleLayers["cel-tone-2step"] ? (
                <g data-layer="cel-tone-2step">
                  <path
                    d={celLayer.svgPaths.join(" ")}
                    fill="var(--s3e-cel-deep)"
                    opacity={celLayer.opacity}
                  />
                </g>
              ) : null}
              {visibleLayers["detail-marupen"] ? (
                <g data-layer="detail-marupen">
                  <path
                    d={detailLayer.svgPaths.join(" ")}
                    fill="var(--s3e-ink-detail)"
                    opacity={detailLayer.opacity}
                  />
                </g>
              ) : null}
              {visibleLayers["outline-gpen"] ? (
                <g data-layer="outline-gpen">
                  <path d={outlineLayer.svgPaths.join(" ")} fill="var(--s3e-ink-outline)" />
                </g>
              ) : null}
            </svg>
            <span className="s3e-metric-label s3e-num">
              매니페스트 해시: {extractResult.manifestFingerprint} · 비용 ₩{extractResult.costKrw}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "hero-lens") {
    return (
      <div className="s3e-panel" data-testid="s3e-tab-hero-lens">
        <div className="s3e-card">
          <h3 className="s3e-card-title">2. 박력 과장 원근 렌즈 (히어로 퍼스펙티브)</h3>
          <p className="s3e-card-desc">
            카메라에 가까운 손·무기 정점만 1.0x~1.6x 비선형 과장 배율을 적용하고, 인물 몸통과
            얼굴 비율은 왜곡 없이 1.000x로 유지합니다.
          </p>
          <div className="s3e-field">
            <div className="s3e-field-head">
              <label htmlFor={`${baseId}-hero-scale`}>근접 손·무기 과장 배율</label>
              <span className="s3e-num" data-testid="s3e-hero-scale-value">
                {exaggerationFactor.toFixed(2)}x
              </span>
            </div>
            <input
              id={`${baseId}-hero-scale`}
              type="range"
              className="s3e-range"
              min={1.0}
              max={1.6}
              step={0.02}
              value={exaggerationFactor}
              onChange={(event) => setExaggerationFactor(Number(event.currentTarget.value))}
            />
          </div>
          <div className="s3e-field">
            <div className="s3e-field-head">
              <label htmlFor={`${baseId}-hero-focal`}>기준 렌즈 초점거리</label>
              <span className="s3e-num">{heroFocalMm}mm</span>
            </div>
            <input
              id={`${baseId}-hero-focal`}
              type="range"
              className="s3e-range"
              min={24}
              max={85}
              step={1}
              value={heroFocalMm}
              onChange={(event) => setHeroFocalMm(Number(event.currentTarget.value))}
            />
          </div>
          <div className="s3e-metrics-grid">
            <div className="s3e-metric">
              <span className="s3e-metric-label">최대 무기·손 과장</span>
              <span className="s3e-metric-value" data-testid="s3e-hero-max-scale">
                {heroResult.maxAppliedHeroScale.toFixed(2)}x
              </span>
            </div>
            <div className="s3e-metric">
              <span className="s3e-metric-label">몸통 왜곡 오차</span>
              <span className="s3e-metric-value s3e-status-ok" data-testid="s3e-torso-drift">
                {(heroResult.torsoDistortionRatio * 100).toFixed(2)}% (보존)
              </span>
            </div>
            <div className="s3e-metric">
              <span className="s3e-metric-label">체감 박력 화각</span>
              <span className="s3e-metric-value">{heroResult.effectiveDynamicFocalFeelMm}mm</span>
            </div>
          </div>
        </div>
        <div className="s3e-card">
          <h4 className="s3e-card-title">정점별 비선형 과장 대비표</h4>
          <ul className="s3e-list">
            {heroResult.vertices.map((vertex) => (
              <li key={vertex.id} className="s3e-list-item">
                <span>{vertex.labelKo}</span>
                <span className={vertex.bodyPreserved ? "s3e-status-ok s3e-num" : "s3e-num"}>
                  {vertex.bodyPreserved
                    ? "1.00x (몸통 보존)"
                    : `${vertex.appliedScale.toFixed(3)}x 과장`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (activeTab === "couple-snap") {
    return (
      <div className="s3e-panel" data-testid="s3e-tab-couple-snap">
        <div className="s3e-card">
          <h3 className="s3e-card-title">3. 2~4인 커플·액션 자석 포즈 스냅</h3>
          <p className="s3e-card-desc">
            포옹·손잡기·업기·검 맞대기·등 맞대기 자세에서 키 차이가 변해도 무릎·상체 각도를 자동
            보정해 손·어깨 접점 오차를 0.000m로 유지합니다.
          </p>
          <div className="s3e-pill-row" role="group" aria-label="커플·액션 자석 포즈 선택">
            {MULTI_CHARACTER_SNAP_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="s3e-btn"
                aria-pressed={snapPreset === preset.id}
                onClick={() => setSnapPreset(preset.id)}
              >
                {preset.labelKo}
              </button>
            ))}
          </div>
          <div className="s3e-pill-row" role="group" aria-label="참여 캐릭터 인원 선택">
            {([2, 3, 4] as const).map((count) => (
              <button
                key={count}
                type="button"
                className="s3e-btn"
                aria-pressed={characterCount === count}
                onClick={() => setCharacterCount(count)}
              >
                {count}인 구도
              </button>
            ))}
          </div>
          <div className="s3e-field">
            <div className="s3e-field-head">
              <label htmlFor={`${baseId}-height-ratio`}>상대 캐릭터 키 비율 (heightRatio)</label>
              <span className="s3e-num" data-testid="s3e-height-ratio-val">
                {heightRatio.toFixed(2)}x ({Math.round(178 * heightRatio)}cm)
              </span>
            </div>
            <input
              id={`${baseId}-height-ratio`}
              type="range"
              className="s3e-range"
              min={0.74}
              max={1.32}
              step={0.02}
              value={heightRatio}
              onChange={(event) => setHeightRatio(Number(event.currentTarget.value))}
            />
          </div>
          <div className="s3e-metrics-grid">
            <div className="s3e-metric">
              <span className="s3e-metric-label">최대 접점 오차</span>
              <span className="s3e-metric-value s3e-status-ok" data-testid="s3e-snap-error">
                {snapResult.formattedMaxError}
              </span>
            </div>
            <div className="s3e-metric">
              <span className="s3e-metric-label">스냅 완료 접점</span>
              <span className="s3e-metric-value">{snapResult.contacts.length}쌍</span>
            </div>
            <div className="s3e-metric">
              <span className="s3e-metric-label">참여 인원</span>
              <span className="s3e-metric-value">{snapResult.characterCount}명</span>
            </div>
          </div>
        </div>
        <div className="s3e-card">
          <h4 className="s3e-card-title">자석 접점 정렬 명세</h4>
          <p className="s3e-card-desc">{snapResult.postureNoticeKo}</p>
          <ul className="s3e-list">
            {snapResult.contacts.map((contact) => (
              <li key={contact.id} className="s3e-list-item">
                <span>{contact.labelKo}</span>
                <span className="s3e-status-ok s3e-num">
                  오차 {contact.errorMeters.toFixed(3)}m
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="s3e-panel" data-testid="s3e-tab-face-sdf">
      <div className="s3e-card">
        <h3 className="s3e-card-title">4. 얼굴 미형 툰 그림자(Face SDF) & 시선 자동 추적</h3>
        <p className="s3e-card-desc">
          광원 각도가 바뀌어도 코·광대의 지저분한 그림자를 차단하고, 눈동자가 해부학적 가동 한계
          안에서 카메라나 상대를 자연스럽게 응시합니다.
        </p>
        <div className="s3e-field">
          <div className="s3e-field-head">
            <label htmlFor={`${baseId}-sdf-az`}>광원 수평 각도 (Azimuth)</label>
            <span className="s3e-num">{lightAzimuthDeg}°</span>
          </div>
          <input
            id={`${baseId}-sdf-az`}
            type="range"
            className="s3e-range"
            min={-180}
            max={180}
            step={5}
            value={lightAzimuthDeg}
            onChange={(event) => setLightAzimuthDeg(Number(event.currentTarget.value))}
          />
        </div>
        <div className="s3e-field">
          <div className="s3e-field-head">
            <label htmlFor={`${baseId}-sdf-el`}>광원 고도 각도 (Elevation)</label>
            <span className="s3e-num">{lightElevationDeg}°</span>
          </div>
          <input
            id={`${baseId}-sdf-el`}
            type="range"
            className="s3e-range"
            min={-45}
            max={80}
            step={5}
            value={lightElevationDeg}
            onChange={(event) => setLightElevationDeg(Number(event.currentTarget.value))}
          />
        </div>
        <div className="s3e-pill-row" role="group" aria-label="시선 추적 대상 모드">
          {(Object.keys(EYE_TARGETS) as EyeLookAtTargetMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className="s3e-btn"
              aria-pressed={targetMode === mode}
              onClick={() => setTargetMode(mode)}
            >
              {EYE_TARGETS[mode].labelKo}
            </button>
          ))}
        </div>
      </div>
      <div className="s3e-card">
        <h4 className="s3e-card-title">미형 툰 그림자 & 안구 가동 검증</h4>
        <div className="s3e-metrics-grid">
          <div className="s3e-metric">
            <span className="s3e-metric-label">코·광대 잡그림자</span>
            <span className="s3e-metric-value s3e-status-ok" data-testid="s3e-sdf-clean">
              차단 완료 ({faceResult.faceSdf.artifactSuppressionScore}%)
            </span>
          </div>
          <div className="s3e-metric">
            <span className="s3e-metric-label">눈동자 Yaw / Pitch</span>
            <span className="s3e-metric-value" data-testid="s3e-eye-angles">
              {faceResult.eyeLookAt.clampedYawDeg}° / {faceResult.eyeLookAt.clampedPitchDeg}°
            </span>
          </div>
          <div className="s3e-metric">
            <span className="s3e-metric-label">해부학 한계 클램프</span>
            <span
              className={
                faceResult.eyeLookAt.clampedByAnatomy ? "s3e-status-warn" : "s3e-status-ok"
              }
            >
              {faceResult.eyeLookAt.clampedByAnatomy ? "한계 보호 작동" : "자연 시선 범위"}
            </span>
          </div>
        </div>
        <ul className="s3e-list">
          {faceResult.faceSdf.zones.slice(0, 4).map((zone) => (
            <li key={zone.zoneId} className="s3e-list-item">
              <span>{zone.labelKo}</span>
              <span className="s3e-num">밝기 {Math.round(zone.litFactor * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
