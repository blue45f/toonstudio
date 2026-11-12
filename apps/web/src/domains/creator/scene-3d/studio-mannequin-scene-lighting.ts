/**
 * Studio 3D 데생 인형 — 라이팅 릭 Three.js 마운트·스냅샷 계층.
 *
 * `resolveStudioMannequinLightingPlan`의 순수 계획을 실제 THREE 조명 객체로 생성·교체·실측한다.
 * WebGL 렌더러 없이도 동작하므로 단위 테스트에서 실제 조명 전파를 직접 검증할 수 있다.
 */

import * as THREE from "three";

import type {
  StudioMannequinLightingPlan,
  StudioMannequinSceneLightPlan,
} from "./studio-mannequin-lighting";
import type { StudioMannequinVec3 } from "./studio-mannequin-model";

/** 마운트된 조명 1개의 실측 스냅샷(계획 스냅샷과 같은 모양). */
export interface StudioMannequinMountedLightSnapshot {
  readonly kind: StudioMannequinSceneLightPlan["kind"];
  readonly intensity: number;
  /** 16진 색상 문자열(#rrggbb, 소문자). */
  readonly color: string;
  readonly position: StudioMannequinVec3;
  readonly angle?: number;
  readonly penumbra?: number;
  readonly distance?: number;
  readonly castShadow: boolean;
}

/** 마운트된 라이팅 전체의 실측 스냅샷 — 캡처 결과의 lighting 필드와 같은 모양. */
export interface StudioMannequinLightingSnapshot {
  readonly hemisphere: {
    readonly skyColor: string;
    readonly groundColor: string;
    readonly intensity: number;
  } | null;
  readonly lights: readonly StudioMannequinMountedLightSnapshot[];
  readonly shadowsEnabled: boolean;
  readonly isDefault: boolean;
}

interface StudioMannequinLightingGroupUserData {
  studioMannequinShadowsEnabled?: boolean;
  studioMannequinIsDefault?: boolean;
}

/** 계획을 스냅샷으로 변환한다(순수). 실측 스냅샷과 대조하는 기준값이다. */
export function snapshotStudioMannequinLightingPlan(
  plan: StudioMannequinLightingPlan,
): StudioMannequinLightingSnapshot {
  return {
    hemisphere: plan.hemisphere ? { ...plan.hemisphere } : null,
    lights: plan.lights.map((light) => ({
      kind: light.kind,
      intensity: light.intensity,
      color: light.color.toLowerCase(),
      position: [light.position[0], light.position[1], light.position[2]] as const,
      ...(light.angle !== undefined ? { angle: light.angle } : {}),
      ...(light.penumbra !== undefined ? { penumbra: light.penumbra } : {}),
      ...(light.distance !== undefined ? { distance: light.distance } : {}),
      castShadow: light.castShadow,
    })),
    shadowsEnabled: plan.shadowsEnabled,
    isDefault: plan.isDefault,
  };
}

function configureStudioMannequinShadow(
  light: THREE.DirectionalLight | THREE.SpotLight,
): void {
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = 12;
  if (light instanceof THREE.DirectionalLight) {
    light.shadow.camera.left = -2.6;
    light.shadow.camera.right = 2.6;
    light.shadow.camera.top = 3.2;
    light.shadow.camera.bottom = -0.4;
  }
  light.shadow.bias = -0.0002;
  light.shadow.normalBias = 0.018;
}

/** 계획 조명 1개를 실제 THREE 조명 객체로 만든다. */
export function createStudioMannequinLightingObject(
  spec: StudioMannequinSceneLightPlan,
): THREE.Light {
  let light: THREE.Light;
  if (spec.kind === "spot") {
    const spot = new THREE.SpotLight(
      spec.color,
      spec.intensity,
      spec.distance ?? 0,
      spec.angle ?? 0.5,
      spec.penumbra ?? 0.45,
    );
    if (spec.castShadow) configureStudioMannequinShadow(spot);
    light = spot;
  } else if (spec.kind === "point") {
    light = new THREE.PointLight(spec.color, spec.intensity, spec.distance ?? 0);
  } else {
    const directional = new THREE.DirectionalLight(spec.color, spec.intensity);
    if (spec.castShadow) configureStudioMannequinShadow(directional);
    light = directional;
  }
  light.position.set(spec.position[0], spec.position[1], spec.position[2]);
  light.name = `studio-mannequin-light:${spec.kind}`;
  return light;
}

export function disposeStudioMannequinLightObject(object: THREE.Object3D): void {
  if (
    object instanceof THREE.DirectionalLight
    || object instanceof THREE.SpotLight
    || object instanceof THREE.PointLight
  ) {
    object.shadow.map?.dispose();
    object.shadow.map = null;
  }
}

/**
 * 그룹 안의 조명을 계획대로 통째로 교체한다. 기존 조명의 섀도맵은 반납하고,
 * 그룹 userData에 계획 메타(shadowsEnabled/isDefault)를 남겨 실측 때 돌려준다.
 */
export function replaceStudioMannequinLightingGroup(
  group: THREE.Group,
  plan: StudioMannequinLightingPlan,
): void {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeStudioMannequinLightObject(child);
  }
  if (plan.hemisphere) {
    const hemisphere = new THREE.HemisphereLight(
      plan.hemisphere.skyColor,
      plan.hemisphere.groundColor,
      plan.hemisphere.intensity,
    );
    hemisphere.name = "studio-mannequin-light:hemisphere";
    group.add(hemisphere);
  }
  for (const spec of plan.lights) group.add(createStudioMannequinLightingObject(spec));
  const userData = group.userData as StudioMannequinLightingGroupUserData;
  userData.studioMannequinShadowsEnabled = plan.shadowsEnabled;
  userData.studioMannequinIsDefault = plan.isDefault;
}

/** 계획으로 라이팅 그룹을 새로 만든다(씬 마운트·테스트 공용 진입점). */
export function mountStudioMannequinLightingGroup(
  plan: StudioMannequinLightingPlan,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "studio-mannequin-lighting-rig";
  replaceStudioMannequinLightingGroup(group, plan);
  return group;
}

function toHexColor(color: THREE.Color): string {
  return `#${color.getHexString()}`;
}

/** 마운트된 그룹에서 실제 조명 값을 읽어낸다 — 계획이 아니라 객체가 진실이다. */
export function readStudioMannequinLightingSnapshot(
  group: THREE.Group,
): StudioMannequinLightingSnapshot {
  let hemisphere: StudioMannequinLightingSnapshot["hemisphere"] = null;
  const lights: StudioMannequinMountedLightSnapshot[] = [];
  for (const child of group.children) {
    if (child instanceof THREE.HemisphereLight) {
      hemisphere = {
        skyColor: toHexColor(child.color),
        groundColor: toHexColor(child.groundColor),
        intensity: child.intensity,
      };
      continue;
    }
    if (!(child instanceof THREE.Light)) continue;
    const position = child.position.toArray();
    const base = {
      intensity: child.intensity,
      color: toHexColor(child.color),
      position: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0] as const,
      castShadow: child.castShadow,
    };
    if (child instanceof THREE.SpotLight) {
      lights.push({
        ...base,
        kind: "spot",
        angle: child.angle,
        penumbra: child.penumbra,
        distance: child.distance,
      });
    } else if (child instanceof THREE.PointLight) {
      lights.push({ ...base, kind: "point", distance: child.distance });
    } else if (child instanceof THREE.DirectionalLight) {
      lights.push({ ...base, kind: "directional" });
    }
  }
  const userData = group.userData as StudioMannequinLightingGroupUserData;
  return {
    hemisphere,
    lights,
    shadowsEnabled: userData.studioMannequinShadowsEnabled ?? true,
    isDefault: userData.studioMannequinIsDefault ?? false,
  };
}
