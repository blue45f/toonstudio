/**
 * Dev-only prop attachment comparison page. Open /tools/browser-harnesses/props-compare.html via Vite.
 * 원고 포저의 몸통 보정, 손가락·손바닥 자세, 의상 접촉 회피, 소품 추종과 손끝 접점을 차례로 적용한다.
 * 정면, 양손 바깥쪽, 오른손 뒤·아래를 같은 자세에서 비교한다.
 */
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { handReviewDirection } from "./vrm-hand-review-camera";
import { measureReviewPropPixels, type ReviewPropPixelCount } from "./vrm-prop-review-visibility";

import { pickNaturalIdlePose } from "@/domains/creator/studio-pose-presets";
import { resolveStudioVrmFingerAuthority } from "@/domains/creator/vrm/studio-vrm-auto-grip-authority";
import { resolveStudioVrmHeldPropContacts } from "@/domains/creator/vrm/studio-vrm-held-prop-contacts";
import { createIdleGripBodyClearance, idleGripClearanceItems } from "@/domains/creator/vrm/studio-vrm-idle-grip-body-clearance";
import { extractStudioVrmFingerRotations } from "@/domains/creator/vrm/studio-vrm-poser-helpers";
import {
  applyFingerRotations,
  applyPoseToVrm,
  correctVrmHangingHandPalmTwist,
  estimateVrmPalmNormal,
  stripFingerBones,
  type PoseBoneMap,
} from "@/domains/creator/vrm/studio-vrm-poser-utils";
import { retargetStudioVrmPresetTorso } from "@/domains/creator/vrm/studio-vrm-preset-torso";
import { acquireStudioVrmPropAsset } from "@/domains/creator/vrm/studio-vrm-prop-asset-runtime";
import {
  createAutoGripFingerOverrides,
  measureVrmPropRigMetrics,
  resolvePropAttachment,
  resolveSecondaryPropTarget,
  type VrmPropRigMetrics,
} from "@/domains/creator/vrm/studio-vrm-prop-rig";
import {
  buildPropObject,
  createPropInstance,
  propDefById,
  type PropInstance,
} from "@/domains/creator/vrm/studio-vrm-props";
import { createStudioVrmGripContactPasses } from "@/domains/creator/vrm/StudioVrmGripContactRefine";

const statusEl = document.getElementById("status")!;

function setStatus(text: string) {
  statusEl.textContent = text;
}

type HandSide = "left" | "right";

type VisualHandMetric = {
  readonly palmNormal: readonly [number, number, number] | null;
  readonly wristKinkDeg: number | null;
  readonly handFromHips: readonly [number, number, number] | null;
};

type PropsCompareWindow = Window & {
  __propsCompareReady?: boolean;
  __propsCompareName?: string;
  __measurePropsCompareVisibility?: () => Record<"rightMug" | "leftBook" | "closeMug", ReviewPropPixelCount>;
  __propsCompareMetrics?: {
    readonly characterId: string;
    readonly characterName: string;
    readonly left: VisualHandMetric;
    readonly right: VisualHandMetric;
  };
};

function tuple(vector: THREE.Vector3 | null): readonly [number, number, number] | null {
  return vector ? [vector.x, vector.y, vector.z] : null;
}

function wristKinkDegrees(vrm: VRM, side: HandSide): number | null {
  const humanoid = vrm.humanoid;
  const lower = humanoid?.getNormalizedBoneNode(`${side}LowerArm`);
  const hand = humanoid?.getNormalizedBoneNode(`${side}Hand`);
  const middle = humanoid?.getNormalizedBoneNode(`${side}MiddleProximal`)
    ?? humanoid?.getNormalizedBoneNode(`${side}MiddleDistal`);
  if (!lower || !hand || !middle) return null;
  const lowerPos = lower.getWorldPosition(new THREE.Vector3());
  const handPos = hand.getWorldPosition(new THREE.Vector3());
  const middlePos = middle.getWorldPosition(new THREE.Vector3());
  const forearm = handPos.clone().sub(lowerPos);
  const handAxis = middlePos.clone().sub(handPos);
  if (forearm.lengthSq() < 1e-8 || handAxis.lengthSq() < 1e-8) return null;
  const dot = THREE.MathUtils.clamp(forearm.normalize().dot(handAxis.normalize()), -1, 1);
  return THREE.MathUtils.radToDeg(Math.acos(dot));
}

function visualHandMetric(vrm: VRM, side: HandSide): VisualHandMetric {
  const humanoid = vrm.humanoid;
  const hand = humanoid?.getNormalizedBoneNode(`${side}Hand`);
  const hips = humanoid?.getNormalizedBoneNode("hips");
  const handPos = hand?.getWorldPosition(new THREE.Vector3()) ?? null;
  const hipsPos = hips?.getWorldPosition(new THREE.Vector3()) ?? null;
  const fromHips = handPos && hipsPos ? handPos.clone().sub(hipsPos) : null;
  return {
    palmNormal: tuple(estimateVrmPalmNormal(vrm, side)),
    wristKinkDeg: wristKinkDegrees(vrm, side),
    handFromHips: tuple(fromHips),
  };
}

function fmtMetric(metric: VisualHandMetric) {
  const palm = metric.palmNormal
    ? metric.palmNormal.map((value) => value.toFixed(2)).join(",")
    : "n/a";
  const kink = metric.wristKinkDeg === null ? "n/a" : `${metric.wristKinkDeg.toFixed(1)}°`;
  const hip = metric.handFromHips
    ? metric.handFromHips.map((value) => value.toFixed(2)).join(",")
    : "n/a";
  return `palm=(${palm}) wrist=${kink} hand-hips=(${hip})`;
}

async function loadVrm(url: string): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm as VRM;
  if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
  return vrm;
}

/** The projection's rigid follower math, applied once (pose is static here). */
async function attachProp(
  scene: THREE.Scene,
  vrm: VRM,
  item: PropInstance,
  metrics: VrmPropRigMetrics,
  correctIdleGrip: boolean,
): Promise<{ group: THREE.Group; release: () => void } | null> {
  const def = propDefById(item.propId);
  const boneNode = vrm.humanoid?.getNormalizedBoneNode(item.bone);
  if (!def || !boneNode) return null;
  const resolved = resolvePropAttachment(def, item, metrics);
  if (!resolved.usesSmartRig) return null;

  let object: THREE.Object3D;
  let release = () => {};
  if (def.geometrySource.kind === "gltf") {
    const lease = await acquireStudioVrmPropAsset(item.propId, def.geometrySource);
    object = lease.object;
    release = lease.release;
    if (correctIdleGrip) {
      try {
        createIdleGripBodyClearance(vrm, item, metrics, object, [])?.run();
        vrm.humanoid.update();
        vrm.scene.updateMatrixWorld(true);
      } catch (error) {
        release();
        throw error;
      }
    }
  } else {
    object = buildPropObject(
      THREE as unknown as Parameters<typeof buildPropObject>[0],
      def,
      item.color,
    ) as unknown as THREE.Object3D;
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.scale.setScalar(1);
  }

  const group = new THREE.Group();
  group.name = `prop:${item.propId}`;
  group.add(object);

  boneNode.updateWorldMatrix(true, false);
  const socketWorldPosition = new THREE.Vector3(...resolved.socketPosition);
  boneNode.localToWorld(socketWorldPosition);
  const boneWorldQuaternion = boneNode.getWorldQuaternion(new THREE.Quaternion());
  const localQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(resolved.rotationDeg[0]),
    THREE.MathUtils.degToRad(resolved.rotationDeg[1]),
    THREE.MathUtils.degToRad(resolved.rotationDeg[2]),
    "XYZ",
  ));
  group.quaternion.copy(boneWorldQuaternion).multiply(localQuaternion).normalize();
  group.scale.setScalar(resolved.scale);
  const anchorWorldOffset = new THREE.Vector3(...resolved.anchor.position)
    .multiplyScalar(resolved.scale)
    .applyQuaternion(group.quaternion);
  group.position.copy(socketWorldPosition).sub(anchorWorldOffset);
  scene.add(group);

  const secondary = resolveSecondaryPropTarget(def, item);
  if (secondary && secondary.influence > 0) {
    setStatus(`${item.propId}: secondary ${secondary.bone} influence ${secondary.influence}`);
  }
  return { group, release };
}

type ViewKind = "full" | "right-item" | "left-item" | "close";

class Panel {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly kind: ViewKind;
  readonly host: HTMLElement;

  constructor(hostId: string, kind: ViewKind) {
    this.kind = kind;
    this.host = document.getElementById(hostId)!;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
    this.resize();
  }

  resize() {
    const w = Math.max(2, this.host.clientWidth);
    const h = Math.max(2, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(vrm: VRM, groups: ReadonlyMap<string, THREE.Group>) {
    const humanoid = vrm.humanoid;
    if (!humanoid) return;
    const handOf = (side: HandSide) =>
      humanoid.getNormalizedBoneNode(`${side}Hand`)?.getWorldPosition(new THREE.Vector3()) ?? null;
    const right = handOf("right");
    const left = handOf("left");
    if (this.kind === "full") {
      const hips = humanoid.getNormalizedBoneNode("hips")?.getWorldPosition(new THREE.Vector3());
      const head = humanoid.getNormalizedBoneNode("head")?.getWorldPosition(new THREE.Vector3());
      const mid = hips && head ? hips.clone().lerp(head, 0.55) : new THREE.Vector3(0, 1, 0);
      this.camera.position.set(mid.x, mid.y + 0.05, mid.z + 2.2);
      this.camera.lookAt(mid);
      return;
    }
    const focus = this.kind === "right-item" || this.kind === "close" ? right : left;
    if (!focus) return;
    const side: HandSide = this.kind === "right-item" || this.kind === "close" ? "right" : "left";
    const bounds = new THREE.Box3().setFromPoints([focus]);
    for (const digit of ["Thumb", "Index", "Middle", "Ring", "Little"] as const) {
      const tip = humanoid.getNormalizedBoneNode(`${side}${digit}Distal`);
      if (tip) bounds.expandByPoint(tip.getWorldPosition(new THREE.Vector3()));
    }
    const prop = groups.get(side === "right" ? "mug" : "book");
    if (prop) bounds.expandByObject(prop, true);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const close = this.kind === "close";
    const direction = handReviewDirection(vrm, side, close ? 125 : 78, close ? -30 : -18);
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * Math.min(1, this.camera.aspect));
    const distance = Math.max(0.025, sphere.radius) * (close ? 1.15 : 1.5) / Math.sin(halfFov);
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.camera.lookAt(sphere.center);
  }

  render(scene: THREE.Scene) {
    this.renderer.render(scene, this.camera);
  }
}

const panels = {
  full: new Panel("full", "full"),
  rightItem: new Panel("right-item", "right-item"),
  leftItem: new Panel("left-item", "left-item"),
  close: new Panel("close", "close"),
};

let currentScene: THREE.Scene | null = null;
let currentVrm: VRM | null = null;
let requestSequence = 0;
let currentGroups = new Map<string, THREE.Group>();
let currentReleases: (() => void)[] = [];

function renderAll() {
  if (!currentScene || !currentVrm) return;
  currentVrm.scene.updateMatrixWorld(true);
  for (const panel of Object.values(panels)) {
    panel.frame(currentVrm, currentGroups);
    panel.render(currentScene);
  }
}

// 자세와 소품이 고정된 검수 화면은 선택·크기 변경 시 실제 정점을 한 번만 측정한다.
window.addEventListener("resize", () => {
  for (const panel of Object.values(panels)) panel.resize();
  renderAll();
});

async function selectCharacter(id: string, url: string, name: string) {
  const request = ++requestSequence;
  const auditWindow = window as PropsCompareWindow;
  auditWindow.__propsCompareReady = false;
  auditWindow.__measurePropsCompareVisibility = undefined;
  setStatus(`${name} 로딩…`);
  const releases: (() => void)[] = [];
  let pendingVrm: VRM | null = null;
  try {
    const vrm = await loadVrm(url);
    pendingVrm = vrm;
    if (request !== requestSequence) return;
    const pose = pickNaturalIdlePose(id);
    const bones = pose.bones as PoseBoneMap;

    // Production order: stripped body pose → metrics → auto-grip → finger authority → palm twist.
    applyPoseToVrm(vrm, retargetStudioVrmPresetTorso(vrm, stripFingerBones(bones)), pose.yOffset ?? 0, undefined, {
      skipPalmCorrect: true,
    });
    const metrics = measureVrmPropRigMetrics(vrm);

    const mug = createPropInstance("mug", `${id}-mug`);
    const book = createPropInstance("book", `${id}-book`);
    if (!mug || !book) throw new Error("검수용 머그와 책을 카탈로그에서 찾지 못했습니다.");
    const items = resolveStudioVrmHeldPropContacts([mug, book], metrics);
    const autoGrip = createAutoGripFingerOverrides(items, propDefById, metrics);
    const effective = resolveStudioVrmFingerAuthority(extractStudioVrmFingerRotations(bones), autoGrip);
    applyFingerRotations(vrm, effective);
    correctVrmHangingHandPalmTwist(vrm);
    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const scene = new THREE.Scene();
    scene.add(vrm.scene);
    const keyLight = new THREE.DirectionalLight(0xfff0dd, 1.4);
    keyLight.position.set(1.2, 2.2, 1.6);
    scene.add(keyLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));

    const eligible = idleGripClearanceItems(items, metrics, pose.id);
    const groups = new Map<string, THREE.Group>();
    for (const item of items) {
      const attached = await attachProp(scene, vrm, item, metrics, eligible.includes(item));
      if (!attached) throw new Error(`${item.propId}의 장착 본 또는 자동 장착 정보를 찾지 못했습니다.`);
      groups.set(item.propId, attached.group);
      releases.push(attached.release);
      if (request !== requestSequence) return;
    }
    const contactPasses = createStudioVrmGripContactPasses(vrm, items, metrics, []);
    contactPasses.forEach(pass => pass.run());
    vrm.humanoid.update();
    const gripLeft = Object.keys(autoGrip).filter((key) => key.startsWith("left")).length;
    const gripRight = Object.keys(autoGrip).filter((key) => key.startsWith("right")).length;
    const resolvedInfo = items.map((item) => {
      const def = propDefById(item.propId)!;
      const resolved = resolvePropAttachment(def, item, metrics);
      return `${item.propId}@${item.bone}: anchor=${resolved.anchorId} src=${resolved.socketSource} fit=${resolved.fit.kind} scale=${resolved.scale.toFixed(2)}`;
    }).join("\n");

    vrm.scene.updateMatrixWorld(true);
    currentReleases.forEach(release => release());
    if (currentVrm) VRMUtils.deepDispose(currentVrm.scene);
    currentReleases = releases.splice(0);
    currentGroups = groups;
    currentScene = scene;
    currentVrm = vrm;
    pendingVrm = null;
    renderAll();

    const left = visualHandMetric(vrm, "left");
    const right = visualHandMetric(vrm, "right");
    const note =
      `${name} · mug(오른손 handle) + book(왼손 flat)\n` +
      `autoGrip L=${gripLeft} R=${gripRight} contactPasses=${contactPasses.length} attached=${groups.size}/2\n` +
      `L ${fmtMetric(left)}\nR ${fmtMetric(right)}\n` +
      resolvedInfo;
    for (const id2 of ["full-note", "right-note", "left-note", "close-note"] as const) {
      const el = document.getElementById(id2);
      if (el) el.textContent = note;
    }
    function visibleIn(panel: Panel, propId: string) {
      const group = groups.get(propId);
      if (!group) throw new Error(`${propId}의 실물 렌더를 찾을 수 없습니다.`);
      return measureReviewPropPixels(panel.renderer, panel.camera, scene, vrm.scene, group);
    }
    auditWindow.__measurePropsCompareVisibility = () => ({
      rightMug: visibleIn(panels.rightItem, "mug"),
      leftBook: visibleIn(panels.leftItem, "book"),
      closeMug: visibleIn(panels.close, "mug"),
    });
    auditWindow.__propsCompareName = name;
    auditWindow.__propsCompareMetrics = { characterId: id, characterName: name, left, right };
    auditWindow.__propsCompareReady = true;
    setStatus(`${name} 준비`);
  } catch (error) {
    if (request !== requestSequence) return;
    console.error(error);
    (window as PropsCompareWindow).__propsCompareReady = false;
    setStatus(`실패: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    releases.forEach(release => release());
    if (pendingVrm) VRMUtils.deepDispose(pendingVrm.scene);
  }
}

document.querySelectorAll<HTMLButtonElement>("#bar button[data-id]").forEach((button) => {
  button.addEventListener("click", () => {
    void selectCharacter(button.dataset.id!, button.dataset.url!, button.dataset.name!);
  });
});

// Auto-load Lumi for immediate capture.
void selectCharacter("sample-vrm", "/vrm/sample.vrm", "루미");
