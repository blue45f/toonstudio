/**
 * Studio 3D 데생 인형 v3 — Three.js 유기 단면 로프트 메시 빌더 & 작화 보조선·무게중심(CoM) 오버레이.
 *
 * 순수 데이터 계층(`studio-mannequin-ecorche-anatomy.ts`, `studio-mannequin-pro-kinematics.ts`)이
 * 산출한 다중 단면 로프트 스펙, 루미스 두상 십자선, 단축법 등고선, 생체역학 무게중심 추선을
 * Three.js 지오메트리와 온디맨드 오버레이 그룹으로 변환·수명 관리한다.
 */

import * as THREE from "three";

import type { StudioMannequinLoftTubeSpec } from "./studio-mannequin-ecorche-anatomy";
import type { StudioMannequinJointId, StudioMannequinSpec } from "./studio-mannequin-model";
import type { StudioMannequinPose } from "./studio-mannequin-poses";
import {
  STUDIO_MANNEQUIN_DEFAULT_GUIDE_VISIBILITY,
  analyzeStudioMannequinBalance,
  buildStudioMannequinConstructionGuides,
  type StudioMannequinBalanceReport,
  type StudioMannequinGuideVisibility,
} from "./studio-mannequin-pro-kinematics";

/**
 * 슈퍼엘립스 타원 단면 열을 따라 닫힌 유기적 로프트 BufferGeometry를 생성한다.
 * Asaro 다면체 모드(`flatShaded: true`)에서는 비공유 평면 법선을 계산해 명암 경계선을 칼같이 살린다.
 */
export function buildStudioMannequinLoftGeometry(
  tube: StudioMannequinLoftTubeSpec,
): THREE.BufferGeometry {
  const ringCount = tube.sections.length;
  const segs = Math.max(6, tube.radialSegments);
  const exp = 2 / Math.max(0.8, tube.superellipsePower);

  const ringPoints: THREE.Vector3[][] = [];
  for (let i = 0; i < ringCount; i += 1) {
    const sec = tube.sections[i];
    if (!sec) continue;
    const prev = tube.sections[Math.max(0, i - 1)] ?? sec;
    const next = tube.sections[Math.min(ringCount - 1, i + 1)] ?? sec;
    const tangent = new THREE.Vector3(
      next.center[0] - prev.center[0],
      next.center[1] - prev.center[1],
      next.center[2] - prev.center[2],
    );
    if (tangent.lengthSq() < 1e-10) tangent.set(0, -1, 0);
    else tangent.normalize();

    const ref = Math.abs(tangent.z) < 0.92 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const axisX = new THREE.Vector3().crossVectors(tangent, ref).normalize();
    const axisZ = new THREE.Vector3().crossVectors(axisX, tangent).normalize();

    const ct = Math.cos(sec.twistRad);
    const st = Math.sin(sec.twistRad);
    const bx = axisX.clone().multiplyScalar(ct).addScaledVector(axisZ, st);
    const bz = axisZ.clone().multiplyScalar(ct).addScaledVector(axisX, -st);
    const center = new THREE.Vector3(sec.center[0], sec.center[1], sec.center[2]);

    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < segs; k += 1) {
      const th = (2 * Math.PI * k) / segs;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const sc = Math.sign(c) * Math.pow(Math.abs(c), exp);
      const ss = Math.sign(s) * Math.pow(Math.abs(s), exp);
      ring.push(
        center
          .clone()
          .addScaledVector(bx, sec.radiusX * sc)
          .addScaledVector(bz, sec.radiusZ * ss),
      );
    }
    ringPoints.push(ring);
  }

  const positions: number[] = [];
  const indices: number[] = [];

  for (const ring of ringPoints) {
    for (const pt of ring) {
      positions.push(pt.x, pt.y, pt.z);
    }
  }

  for (let r = 0; r < ringPoints.length - 1; r += 1) {
    const r0 = r * segs;
    const r1 = (r + 1) * segs;
    for (let k = 0; k < segs; k += 1) {
      const kn = (k + 1) % segs;
      indices.push(r0 + k, r1 + k, r1 + kn);
      indices.push(r0 + k, r1 + kn, r0 + kn);
    }
  }

  if (ringPoints.length >= 2) {
    const firstCenter = tube.sections[0]?.center ?? [0, 0, 0];
    const lastCenter = tube.sections[tube.sections.length - 1]?.center ?? [0, 0, 0];
    const startCapIdx = positions.length / 3;
    positions.push(firstCenter[0], firstCenter[1], firstCenter[2]);
    const endCapIdx = positions.length / 3;
    positions.push(lastCenter[0], lastCenter[1], lastCenter[2]);

    const lastRingBase = (ringPoints.length - 1) * segs;
    for (let k = 0; k < segs; k += 1) {
      const kn = (k + 1) % segs;
      indices.push(startCapIdx, kn, k);
      indices.push(endCapIdx, lastRingBase + k, lastRingBase + kn);
    }
  }

  const baseGeom = new THREE.BufferGeometry();
  baseGeom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  baseGeom.setIndex(indices);

  if (tube.flatShaded) {
    const nonIndexed = baseGeom.toNonIndexed();
    baseGeom.dispose();
    nonIndexed.computeVertexNormals();
    return nonIndexed;
  }

  baseGeom.computeVertexNormals();
  return baseGeom;
}

export interface StudioMannequinProOverlayController {
  readonly rootGroup: THREE.Group;
  setVisibility(next: Partial<StudioMannequinGuideVisibility>): void;
  getVisibility(): StudioMannequinGuideVisibility;
  rebuildFigureGuides(
    spec: StudioMannequinSpec,
    joints: ReadonlyMap<StudioMannequinJointId, THREE.Group>,
  ): void;
  syncBalanceOverlay(
    spec: StudioMannequinSpec,
    pose: StudioMannequinPose,
  ): StudioMannequinBalanceReport;
  setCaptureHidden(hidden: boolean): void;
  dispose(): void;
}

const BALANCE_COLORS = Object.freeze({
  balanced: 0x10b981,
  edge: 0xf59e0b,
  "off-balance": 0xef4444,
  airborne: 0x38bdf8,
});

export function createStudioMannequinProOverlayController(
  initialVisibility: Partial<StudioMannequinGuideVisibility> = STUDIO_MANNEQUIN_DEFAULT_GUIDE_VISIBILITY,
): StudioMannequinProOverlayController {
  let visibility: StudioMannequinGuideVisibility = {
    ...STUDIO_MANNEQUIN_DEFAULT_GUIDE_VISIBILITY,
    ...initialVisibility,
  };
  let captureHidden = false;

  const rootGroup = new THREE.Group();
  rootGroup.name = "studio-mannequin-pro-overlays";

  const loomisMaterial = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.78,
  });
  const centerlineMaterial = new THREE.LineBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.82,
  });
  const contourMaterial = new THREE.LineBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.56,
  });

  const plumbMaterial = new THREE.LineBasicMaterial({
    color: BALANCE_COLORS.balanced,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const bobMaterial = new THREE.MeshBasicMaterial({
    color: BALANCE_COLORS.balanced,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  });
  const bobGeometry = new THREE.OctahedronGeometry(0.022, 1);

  const plumbPositions = new Float32Array(6);
  const plumbGeometry = new THREE.BufferGeometry();
  plumbGeometry.setAttribute("position", new THREE.BufferAttribute(plumbPositions, 3));
  const plumbLine = new THREE.Line(plumbGeometry, plumbMaterial);
  plumbLine.renderOrder = 14;

  const plumbBob = new THREE.Mesh(bobGeometry, bobMaterial);
  plumbBob.renderOrder = 15;

  const ringPointsCount = 37;
  const ringPositions = new Float32Array(ringPointsCount * 3);
  const ringGeometry = new THREE.BufferGeometry();
  ringGeometry.setAttribute("position", new THREE.BufferAttribute(ringPositions, 3));
  const supportRing = new THREE.Line(ringGeometry, plumbMaterial);
  supportRing.renderOrder = 13;

  rootGroup.add(plumbLine, plumbBob, supportRing);

  let jointGuideLines: THREE.Line[] = [];

  function clearFigureGuides(): void {
    for (const line of jointGuideLines) {
      line.removeFromParent();
      line.geometry.dispose();
    }
    jointGuideLines = [];
  }

  function applyVisibilityFlags(): void {
    rootGroup.visible = !captureHidden && visibility.balancePlumbLine;
    for (const line of jointGuideLines) {
      const kind = line.userData.guideKind as "loomis" | "centerline" | "contour";
      if (captureHidden) {
        line.visible = false;
      } else if (kind === "loomis") {
        line.visible = visibility.loomisHead;
      } else if (kind === "centerline") {
        line.visible = visibility.torsoCenterline;
      } else {
        line.visible = visibility.limbCrossContours;
      }
    }
  }

  function rebuildFigureGuides(
    spec: StudioMannequinSpec,
    joints: ReadonlyMap<StudioMannequinJointId, THREE.Group>,
  ): void {
    clearFigureGuides();
    const polylines = buildStudioMannequinConstructionGuides(spec, {
      loomisHead: true,
      torsoCenterline: true,
      limbCrossContours: true,
      balancePlumbLine: true,
    });
    for (const poly of polylines) {
      const jointGroup = joints.get(poly.jointId);
      if (!jointGroup || poly.points.length < 2) continue;
      const buf = new Float32Array(poly.points.length * 3);
      poly.points.forEach((pt, idx) => {
        buf[idx * 3] = pt[0];
        buf[idx * 3 + 1] = pt[1];
        buf[idx * 3 + 2] = pt[2];
      });
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(buf, 3));
      const mat =
        poly.kind === "loomis"
          ? loomisMaterial
          : poly.kind === "centerline"
            ? centerlineMaterial
            : contourMaterial;
      const line = new THREE.Line(geom, mat);
      line.name = `studio-mannequin-guide:${poly.id}`;
      line.userData.guideKind = poly.kind;
      line.renderOrder = 8;
      jointGroup.add(line);
      jointGuideLines.push(line);
    }
    applyVisibilityFlags();
  }

  function syncBalanceOverlay(
    spec: StudioMannequinSpec,
    pose: StudioMannequinPose,
  ): StudioMannequinBalanceReport {
    const report = analyzeStudioMannequinBalance(spec, pose);
    const color = BALANCE_COLORS[report.state];
    plumbMaterial.color.setHex(color);
    bobMaterial.color.setHex(color);

    plumbPositions[0] = report.centerOfMass[0];
    plumbPositions[1] = report.centerOfMass[1];
    plumbPositions[2] = report.centerOfMass[2];
    plumbPositions[3] = report.groundProjection[0];
    plumbPositions[4] = 0.003;
    plumbPositions[5] = report.groundProjection[2];
    (plumbGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    plumbBob.position.set(report.groundProjection[0], 0.018, report.groundProjection[2]);

    const r = Math.max(0.08, report.supportRadiusM);
    for (let i = 0; i < ringPointsCount; i += 1) {
      const th = (2 * Math.PI * i) / (ringPointsCount - 1);
      ringPositions[i * 3] = report.supportCenter[0] + r * Math.cos(th);
      ringPositions[i * 3 + 1] = 0.003;
      ringPositions[i * 3 + 2] = report.supportCenter[2] + r * Math.sin(th);
    }
    (ringGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    applyVisibilityFlags();
    return report;
  }

  return {
    rootGroup,
    setVisibility(next) {
      visibility = { ...visibility, ...next };
      applyVisibilityFlags();
    },
    getVisibility() {
      return visibility;
    },
    rebuildFigureGuides,
    syncBalanceOverlay,
    setCaptureHidden(hidden) {
      captureHidden = hidden;
      applyVisibilityFlags();
    },
    dispose() {
      clearFigureGuides();
      plumbLine.removeFromParent();
      plumbBob.removeFromParent();
      supportRing.removeFromParent();
      plumbGeometry.dispose();
      bobGeometry.dispose();
      ringGeometry.dispose();
      loomisMaterial.dispose();
      centerlineMaterial.dispose();
      contourMaterial.dispose();
      plumbMaterial.dispose();
      bobMaterial.dispose();
      rootGroup.removeFromParent();
    },
  };
}
