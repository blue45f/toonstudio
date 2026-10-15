/**
 * 추론 오버레이 — 뷰포트 안의 마커·툴팁·유도선.
 *
 * 규칙(모양·색·문구·점선 무늬)은 `buildStudioBg3dInferenceOverlayModel`이 정하고, 여기서는 그 모델을
 * R3F로 그리기만 한다. 모든 객체는 캡처(저장·내보내기)에서 제외되고 레이캐스트에 걸리지 않는다.
 * 마커 본체는 DOM(`StudioBg3dInferenceMarker`)이라 role=img·접근성 이름을 그대로 가진다.
 */

import { Html } from "@react-three/drei/web/Html.js";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";

import { StudioBg3dInferenceMarker } from "./StudioBg3dInferenceMarker";
import { registerStudioBg3dCaptureExcludedObject } from "./studio-bg3d-capture-exclusion";
import { STUDIO_BG3D_INFERENCE_RAYCAST_IGNORE_KEY } from "./studio-bg3d-inference-pointer";
import { buildStudioBg3dInferenceOverlayModel } from "./studio-bg3d-inference-overlay-model";

import type { StudioBg3dInferenceOverlayGuide } from "./studio-bg3d-inference-overlay-model";
import type { StudioBg3dInferenceService } from "./studio-bg3d-inference-service";

const IGNORE_USER_DATA = { [STUDIO_BG3D_INFERENCE_RAYCAST_IGNORE_KEY]: true } as const;

function GuideLine({ guide }: { readonly guide: StudioBg3dInferenceOverlayGuide }) {
  const [geometry] = useState(() => new THREE.BufferGeometry());
  const lineRef = useRef<THREE.LineSegments>(null);

  useLayoutEffect(() => {
    geometry.setFromPoints([new THREE.Vector3(...guide.from), new THREE.Vector3(...guide.to)]);
    geometry.computeBoundingSphere();
    // 점선 재질은 선분 누적 거리가 있어야 무늬가 그려진다.
    lineRef.current?.computeLineDistances();
  }, [geometry, guide.from, guide.to, guide.dashed]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments
      ref={lineRef}
      geometry={geometry}
      raycast={() => null}
      renderOrder={guide.renderOrder}
      frustumCulled={false}
      userData={IGNORE_USER_DATA}
    >
      {guide.dashed ? (
        <lineDashedMaterial
          color={guide.hex}
          dashSize={guide.dashSize}
          gapSize={guide.gapSize}
          depthTest={false}
          depthWrite={false}
          opacity={guide.opacity}
          transparent
        />
      ) : (
        <lineBasicMaterial
          color={guide.hex}
          depthTest={false}
          depthWrite={false}
          opacity={guide.opacity}
          transparent
        />
      )}
    </lineSegments>
  );
}

export interface StudioBg3dInferenceOverlayProps {
  readonly service: StudioBg3dInferenceService;
  /** 저장·내보내기 캡처 중에는 아무것도 그리지 않는다. */
  readonly capturing?: boolean;
}

export function StudioBg3dInferenceOverlay({ service, capturing = false }: StudioBg3dInferenceOverlayProps) {
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
  const model = buildStudioBg3dInferenceOverlayModel(snapshot, capturing);
  if (model.markers.length === 0 && model.guides.length === 0) return null;

  return (
    <group ref={registerStudioBg3dCaptureExcludedObject} userData={IGNORE_USER_DATA}>
      {model.guides.map((guide) => (
        <GuideLine key={guide.id} guide={guide} />
      ))}
      {model.markers.map((marker) => (
        <Html
          key={marker.id}
          center
          position={[...marker.point]}
          pointerEvents="none"
          zIndexRange={[72, 22]}
        >
          <StudioBg3dInferenceMarker
            kind={marker.kind}
            axis={marker.axis}
            label={marker.label}
            showLabel={marker.showLabel}
          />
        </Html>
      ))}
    </group>
  );
}
