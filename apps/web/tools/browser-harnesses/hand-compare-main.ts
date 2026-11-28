/**
 * Dev-only hand comparison page. Open /tools/browser-harnesses/hand-compare.html via Vite.
 * Applies the same natural-idle path as StudioVrmPoser and renders 4 views.
 */
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshBVH, StaticGeometryGenerator } from "three-mesh-bvh";

import { handReviewDirection } from "./vrm-hand-review-camera";

import { pickNaturalIdlePose } from "@/domains/creator/studio-pose-presets";
import {
  applyPoseToVrm,
  estimateVrmPalmNormal,
  type PoseBoneMap,
} from "@/domains/creator/vrm/studio-vrm-poser-utils";
import { retargetStudioVrmPresetTorso } from "@/domains/creator/vrm/studio-vrm-preset-torso";

const statusEl = document.getElementById("status")!;

function setStatus(text: string) {
  statusEl.textContent = text;
}

type HandSide = "left" | "right";
type HandDirections = Readonly<Record<HandSide, THREE.Vector3>>;
const handBoneSet = {
  left: [
    "leftHand",
    "leftMiddleProximal",
    "leftMiddleIntermediate",
    "leftMiddleDistal",
    "leftIndexProximal",
    "leftIndexIntermediate",
    "leftIndexDistal",
    "leftThumbProximal",
    "leftThumbIntermediate",
    "leftThumbDistal",
    "leftRingProximal",
    "leftRingIntermediate",
    "leftRingDistal",
    "leftLittleProximal",
    "leftLittleIntermediate",
    "leftLittleDistal",
  ],
  right: [
    "rightHand",
    "rightMiddleProximal",
    "rightMiddleIntermediate",
    "rightMiddleDistal",
    "rightIndexProximal",
    "rightIndexIntermediate",
    "rightIndexDistal",
    "rightThumbProximal",
    "rightThumbIntermediate",
    "rightThumbDistal",
    "rightRingProximal",
    "rightRingIntermediate",
    "rightRingDistal",
    "rightLittleProximal",
    "rightLittleIntermediate",
    "rightLittleDistal",
  ],
} as const;

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function collectHandPoints(vrm: VRM, side: HandSide) {
  const humanoid = vrm.humanoid;
  if (!humanoid) return [];
  return handBoneSet[side].map((boneName) => humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName))
    .filter((node): node is THREE.Object3D => node != null).map((node) => {
    const value = node.getWorldPosition(new THREE.Vector3());
    if (Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)) {
      return value;
    }
    return null;
  }).filter((value): value is THREE.Vector3 => value !== null);
}

/** 실제 자세의 옷·몸 표면이 손끝을 가리면 같은 손의 뒤쪽·아래쪽으로 카메라를 옮긴다. */
function idleHandDirections(vrm: VRM): HandDirections {
  const generator = new StaticGeometryGenerator(vrm.scene);
  generator.attributes = ["position"];
  const geometry = generator.generate();
  try {
    const surface = new MeshBVH(geometry);
    function choose(side: HandSide) {
      const first = handReviewDirection(vrm, side, 80, -24);
      const wrist = vrm.humanoid.getNormalizedBoneNode(`${side}Hand`)?.getWorldPosition(new THREE.Vector3());
      const tips = (["Thumb", "Index", "Middle", "Ring", "Little"] as const).flatMap(digit => {
        const tip = vrm.humanoid.getNormalizedBoneNode(`${side}${digit}Distal`);
        return tip ? [tip.getWorldPosition(new THREE.Vector3())] : [];
      });
      if (!wrist || !tips.length) return first;
      const handLength = Math.max(0.02, ...tips.map(tip => tip.distanceTo(wrist)));
      const distance = handLength * 4;
      let best = first;
      let mostVisible = -1;
      for (const direction of [first, handReviewDirection(vrm, side, 120, -64), handReviewDirection(vrm, side, 40, -75)]) {
        const visible = tips.filter(tip => {
          const ray = new THREE.Ray(tip.clone().addScaledVector(direction, distance), direction.clone().negate());
          const surfaceHit = surface.raycastFirst(ray, THREE.FrontSide, 0, distance);
          // 손끝 본은 피부 내부에 있어 손 길이의 1/8까지는 해당 손가락 표면으로 본다.
          return !surfaceHit || distance - surfaceHit.distance <= handLength / 8;
        }).length;
        if (visible > mostVisible) {
          best = direction;
          mostVisible = visible;
        }
        if (visible === tips.length) break;
      }
      return best;
    }
    return { left: choose("left"), right: choose("right") };
  } finally {
    geometry.dispose();
  }
}

function frameByPoints(
  camera: THREE.PerspectiveCamera,
  points: readonly THREE.Vector3[],
  offset: THREE.Vector3,
) {
  if (points.length === 0) return false;
  const mid = new THREE.Vector3();
  for (const point of points) {
    mid.add(point);
  }
  mid.divideScalar(points.length);
  let radius = 0.03;
  for (const point of points) {
    radius = Math.max(radius, point.distanceTo(mid));
  }
  const distance = clamp(radius / Math.tan((camera.fov * Math.PI) / 360) + 0.12, 0.14, 1.6);
  const normalizedOffset = offset.clone().normalize();
  camera.position.copy(mid).addScaledVector(normalizedOffset, distance);
  camera.lookAt(mid.x, mid.y + radius * 0.05, mid.z);
  return true;
}

async function loadVrm(url: string): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm as VRM;
  if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
  return vrm;
}

function applyNaturalIdle(vrm: VRM, characterId: string) {
  const pose = pickNaturalIdlePose(characterId);
  // Single path: applyPoseToVrm already runs fingers + one palm pass (same as Studio).
  applyPoseToVrm(vrm, retargetStudioVrmPresetTorso(vrm, pose.bones as PoseBoneMap), pose.yOffset ?? 0);
  vrm.humanoid?.update();
  vrm.scene.updateMatrixWorld(true);
  return pose;
}

function fmt(v: THREE.Vector3 | null) {
  if (!v) return "null";
  return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
}

function metricsNote(vrm: VRM, name: string, poseId: string) {
  const left = estimateVrmPalmNormal(vrm, "left");
  const right = estimateVrmPalmNormal(vrm, "right");
  const h = vrm.humanoid;
  const lines = [
    `${name} · pose ${poseId}`,
    `palm L ${fmt(left)}`,
    `palm R ${fmt(right)}`,
  ];
  if (h) {
    for (const side of ["left", "right"] as const) {
      const hand = h.getNormalizedBoneNode(`${side}Hand`);
      const tip = h.getNormalizedBoneNode(`${side}MiddleDistal`)
        ?? h.getNormalizedBoneNode(`${side}MiddleProximal`);
      if (hand && tip) {
        const d = tip.getWorldPosition(new THREE.Vector3())
          .sub(hand.getWorldPosition(new THREE.Vector3()));
        if (d.lengthSq() > 1e-8) d.normalize();
        lines.push(`${side} fingerDir (${d.x.toFixed(2)}, ${d.y.toFixed(2)}, ${d.z.toFixed(2)})`);
      }
    }
  }
  return lines.join("\n");
}

type ViewKind = "full" | "hands" | "left" | "right";

class Panel {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly root = new THREE.Group();
  kind: ViewKind;
  host: HTMLElement;

  constructor(hostId: string, kind: ViewKind) {
    this.kind = kind;
    this.host = document.getElementById(hostId)!;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xfff0dd, 1.15);
    key.position.set(1.2, 2.2, 1.6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xaaccff, 0.35);
    fill.position.set(-1.5, 0.8, -0.6);
    this.scene.add(fill);
    this.scene.add(this.root);
    this.resize();
  }

  resize() {
    const w = Math.max(2, this.host.clientWidth);
    const h = Math.max(2, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(vrm: VRM, directions: HandDirections) {
    const humanoid = vrm.humanoid;
    if (!humanoid) {
      this.camera.position.set(0, 1.2, 2.4);
      this.camera.lookAt(0, 1.0, 0);
      return;
    }
    const hips = humanoid.getNormalizedBoneNode("hips");
    const head = humanoid.getNormalizedBoneNode("head");
    const leftHand = humanoid.getNormalizedBoneNode("leftHand");
    const rightHand = humanoid.getNormalizedBoneNode("rightHand");
    const mid = new THREE.Vector3(0, 1, 0);
    if (this.kind === "full") {
      if (hips && head) {
        const a = hips.getWorldPosition(new THREE.Vector3());
        const b = head.getWorldPosition(new THREE.Vector3());
        mid.copy(a).lerp(b, 0.55);
      }
      this.camera.position.set(mid.x, mid.y + 0.05, mid.z + 2.1);
      this.camera.lookAt(mid);
      return;
    }
    if (this.kind === "hands" && leftHand && rightHand) {
      const l = leftHand.getWorldPosition(new THREE.Vector3());
      const r = rightHand.getWorldPosition(new THREE.Vector3());
      mid.copy(l).lerp(r, 0.5);
      const handPoints = [...collectHandPoints(vrm, "left"), ...collectHandPoints(vrm, "right")];
      const framed = frameByPoints(this.camera, handPoints.length > 0 ? handPoints : [l, r], new THREE.Vector3(0, 0.22, 1));
      if (framed) return;
      // High-front three-quarter fallback when humanoid finger bones are partially missing.
      this.camera.position.set(mid.x, mid.y + 0.28, mid.z + 0.78);
      this.camera.lookAt(mid.x, mid.y - 0.04, mid.z);
      return;
    }
    if (this.kind === "left" || this.kind === "right") {
      const hand = this.kind === "left" ? leftHand : rightHand;
      if (!hand) return;
      const points = collectHandPoints(vrm, this.kind);
      frameByPoints(this.camera, points.length ? points : [hand.getWorldPosition(new THREE.Vector3())],
        directions[this.kind]);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

}

// Live rendering: one VRM scene, four cameras/renderers sharing via re-attach each frame.
const panels = {
  full: new Panel("full", "full"),
  hands: new Panel("hands", "hands"),
  left: new Panel("left", "left"),
  right: new Panel("right", "right"),
};

let current: { vrm: VRM; id: string; name: string; poseId: string; directions: HandDirections } | null = null;
let requestSequence = 0;
let isShotAllRunning = false;
let shotAllEpoch = 0;

function getVrmButtons() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("#bar button[data-id]"));
}

function getShotAllButton() {
  return document.getElementById("shot-all") as HTMLButtonElement | null;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function paintNotes(note: string) {
  for (const id of ["full-note", "hands-note", "left-note", "right-note"] as const) {
    const el = document.getElementById(id);
    if (el) el.textContent = note;
  }
}

/** 네 컷 모두 같은 정지 자세로 비교할 수 있게 선택·크기 변경 시에만 그린다. */
function renderCurrent() {
  if (!current) return;
  const { vrm, directions } = current;
  vrm.scene.updateMatrixWorld(true);
  for (const panel of Object.values(panels)) {
    while (panel.root.children.length) panel.root.remove(panel.root.children[0]!);
    panel.root.add(vrm.scene);
    panel.frame(vrm, directions);
    panel.render();
    panel.root.remove(vrm.scene);
  }
}

async function selectCharacter(id: string, url: string, name: string) {
  const request = ++requestSequence;
  (window as unknown as { __handCompareReady: boolean }).__handCompareReady = false;
  setStatus(`${name} 로딩…`);
  paintNotes(`${name} 로딩 중…`);
  getVrmButtons().forEach((btn) => {
    btn.classList.toggle("active", (btn as HTMLButtonElement).dataset.id === id);
  });
  let pendingVrm: VRM | null = null;
  try {
    const vrm = await loadVrm(url);
    pendingVrm = vrm;
    if (request !== requestSequence) return;
    const pose = applyNaturalIdle(vrm, id);
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    const directions = idleHandDirections(vrm);
    if (current) VRMUtils.deepDispose(current.vrm.scene);
    current = { vrm, id, name, poseId: pose.id, directions };
    pendingVrm = null;
    const note = metricsNote(vrm, name, pose.id);
    paintNotes(note);
    setStatus(`${name} 준비 · ${pose.id}`);
    // expose for screenshot tooling
    (window as unknown as { __handCompareReady: boolean; __handCompareName: string }).__handCompareReady = true;
    (window as unknown as { __handCompareName: string }).__handCompareName = name;
    renderCurrent();
  } catch (error) {
    if (request !== requestSequence) return;
    console.error(error);
    setStatus(`실패: ${error instanceof Error ? error.message : String(error)}`);
    paintNotes(String(error));
    (window as unknown as { __handCompareReady: boolean }).__handCompareReady = false;
  } finally {
    if (pendingVrm) VRMUtils.deepDispose(pendingVrm.scene);
  }
}

type VrmShotItem = {
  id: string;
  name: string;
  url: string;
};

function listVrmShotItems(): VrmShotItem[] {
  return getVrmButtons().map((button) => ({
    id: button.dataset.id ?? "",
    name: button.dataset.name ?? "",
    url: button.dataset.url ?? "",
  })).filter((entry) => entry.id && entry.url && entry.name);
}

function cancelShotAll() {
  if (!isShotAllRunning) return;
  isShotAllRunning = false;
  ++shotAllEpoch;
  getShotAllButton()?.classList.remove("active");
  setStatus("연속 감상 정지됨");
}

async function runShotAll() {
  if (isShotAllRunning) {
    cancelShotAll();
    return;
  }

  const items = listVrmShotItems();
  if (items.length === 0) {
    setStatus("순회할 캐릭터가 없습니다.");
    return;
  }

  isShotAllRunning = true;
  const token = ++shotAllEpoch;
  const shotButton = getShotAllButton();
  shotButton?.classList.add("active");

  try {
    for (let index = 0; index < items.length; index += 1) {
      if (!isShotAllRunning || token !== shotAllEpoch) break;
      const item = items[index];
      setStatus(`연속 감상 ${index + 1}/${items.length}: ${item.name}`);
      await selectCharacter(item.id, item.url, item.name);
      await wait(900);
    }
  } finally {
    isShotAllRunning = false;
    shotButton?.classList.remove("active");
    if (token === shotAllEpoch) {
      setStatus("연속 감상 완료");
    }
  }
}

document.querySelectorAll<HTMLButtonElement>("#bar button[data-id]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (isShotAllRunning) {
      cancelShotAll();
    }
    void selectCharacter(btn.dataset.id!, btn.dataset.url!, btn.dataset.name!);
  });
});

document.getElementById("shot-all")?.addEventListener("click", () => {
  void runShotAll();
});

window.addEventListener("resize", () => {
  for (const panel of Object.values(panels)) panel.resize();
  renderCurrent();
});

// Auto-load Lumi for immediate capture.
void selectCharacter("sample-vrm", "/vrm/sample.vrm", "루미");
