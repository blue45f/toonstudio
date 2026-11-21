/* eslint-disable shadcn/no-raw-colors -- R3F 단면 캡 보조 메시는 three.js 재질 데이터이며 DOM CSS 토큰 대상이 아니다. */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { registerStudioBg3dCaptureExcludedObject } from "./studio-bg3d-capture-exclusion";
import type { StudioBg3dSectionPlaneState } from "./studio-bg3d-section-plane";
import {
  evaluateStudioBg3dSectionCapCoordination,
  type StudioBg3dSectionCapSummary,
} from "./studio-bg3d-section-cap-coordination";
import {
  createBg3dWallCutawayRuntime,
  type Bg3dWallCutawayConfig,
  type Bg3dWallCutawayRuntime,
} from "./studio-bg3d-wall-cutaway-runtime";

export interface StudioBg3dWallCutawayControllerProps {
  readonly cutawayConfig: Bg3dWallCutawayConfig;
  readonly sectionPlane: StudioBg3dSectionPlaneState;
  readonly target: readonly [number, number, number];
  readonly onSummaryChange?: (summary: StudioBg3dSectionCapSummary) => void;
}

/**
 * 실시간 3D 장면에서 가림 벽 자동 투명화(Auto-Hide Occluding Walls)와
 * 단면 절단 캡(Solid Section Cap) 보조 메시를 함께 구동하고 GPU 자원을 `try/finally`로 해제한다.
 */
export function StudioBg3dWallCutawayController({
  cutawayConfig,
  sectionPlane,
  target,
  onSummaryChange,
}: StudioBg3dWallCutawayControllerProps) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const runtimeRef = useRef<Bg3dWallCutawayRuntime | null>(null);
  const hiddenWallCountRef = useRef<number>(0);

  useEffect(() => {
    const runtime = createBg3dWallCutawayRuntime(scene, cutawayConfig);
    runtimeRef.current = runtime;
    return () => {
      try {
        runtime.reset();
      } finally {
        runtimeRef.current = null;
      }
    };
  }, [scene, cutawayConfig]);

  useFrame(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (!cutawayConfig.enabled) {
      if (hiddenWallCountRef.current !== 0) {
        runtime.reset();
        hiddenWallCountRef.current = 0;
      }
      return;
    }
    const evaluation = runtime.update({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target,
    });
    hiddenWallCountRef.current = evaluation.hiddenWalls.length;
  });

  const coordination = useMemo(
    () => evaluateStudioBg3dSectionCapCoordination(sectionPlane, cutawayConfig),
    [sectionPlane, cutawayConfig],
  );

  useEffect(() => {
    onSummaryChange?.(coordination.summary);
  }, [coordination.summary, onSummaryChange]);

  const capGeometry = useMemo(() => {
    if (!coordination.capPositions || !coordination.capIndices || coordination.capIndices.length === 0) {
      return null;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(coordination.capPositions, 3));
    if (coordination.capNormals && coordination.capNormals.length === coordination.capPositions.length) {
      geometry.setAttribute("normal", new THREE.BufferAttribute(coordination.capNormals, 3));
    } else {
      geometry.computeVertexNormals();
    }
    geometry.setIndex(new THREE.BufferAttribute(coordination.capIndices, 1));
    return geometry;
  }, [coordination.capIndices, coordination.capNormals, coordination.capPositions]);

  useEffect(() => {
    return () => {
      if (!capGeometry) return;
      try {
        capGeometry.dispose();
      } finally {
        // 단면 캡 지오메트리 GPU 버퍼 해제 보장
      }
    };
  }, [capGeometry]);

  if (!capGeometry) return null;

  return (
    <group ref={registerStudioBg3dCaptureExcludedObject} name="studio-bg3d-section-cap-preview">
      <mesh geometry={capGeometry} raycast={() => null}>
        <meshStandardMaterial
          color="#f59e0b"
          opacity={0.28}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
