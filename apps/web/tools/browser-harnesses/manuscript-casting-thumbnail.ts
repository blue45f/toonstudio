import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const SIZE = 800;

function bonePosition(vrm: VRM, name: VRMHumanBoneName): THREE.Vector3 {
  const bone = vrm.humanoid.getRawBoneNode(name);
  if (!bone) throw new Error(`캐스팅 카드에 필요한 관절이 없습니다 (${name}).`);
  return bone.getWorldPosition(new THREE.Vector3());
}

function updatePose(vrm: VRM): void {
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
}

function lowerArms(vrm: VRM, angle: number): void {
  for (const side of ["left", "right"] as const) {
    const arm = vrm.humanoid.getNormalizedBoneNode(`${side}UpperArm`);
    if (!arm) throw new Error("상완 관절을 찾을 수 없습니다.");
    // VRM 판본마다 로컬 축 방향이 달라 실제 팔꿈치가 내려가는 부호를 고른다.
    arm.rotation.z = angle;
    updatePose(vrm);
    const first = bonePosition(vrm, `${side}LowerArm`).y;
    arm.rotation.z = -angle;
    updatePose(vrm);
    if (first < bonePosition(vrm, `${side}LowerArm`).y) arm.rotation.z = angle;
    updatePose(vrm);
  }
}

function posedBounds(vrm: VRM): THREE.Box3 {
  const bounds = new THREE.Box3();
  const v = new THREE.Vector3();
  vrm.scene.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.frustumCulled = false;
    if (object instanceof THREE.SkinnedMesh) object.skeleton.update();
    const count = object.geometry.getAttribute("position").count;
    const stride = Math.max(1, Math.floor(count / 15_000));
    for (let i = 0; i < count; i += stride) {
      bounds.expandByPoint(object.getVertexPosition(i, v).applyMatrix4(object.matrixWorld));
    }
  });
  return bounds;
}

function castingCamera(vrm: VRM, id: string): THREE.OrthographicCamera {
  const bounds = posedBounds(vrm);
  const head = bonePosition(vrm, "head");
  const neck = vrm.humanoid.getRawBoneNode("neck")?.getWorldPosition(new THREE.Vector3()) ?? head;
  const leftEye = vrm.humanoid.getRawBoneNode("leftEye")?.getWorldPosition(new THREE.Vector3());
  const rightEye = vrm.humanoid.getRawBoneNode("rightEye")?.getWorldPosition(new THREE.Vector3());
  const eye = leftEye && rightEye && leftEye.y > neck.y
    ? leftEye.lerp(rightEye, 0.5)
    : head.clone().lerp(new THREE.Vector3(head.x, bounds.max.y, head.z), 0.46);
  const shoulders = bonePosition(vrm, "leftUpperArm").distanceTo(bonePosition(vrm, "rightUpperArm"));
  // 아리시아의 큰 리본까지 담되 얼굴과 의상이 다른 카드보다 지나치게 작아지지 않게 한다.
  const eyeTop = id === "alicia" ? 0.442 : 0.37;
  const span = Math.max((bounds.max.y - eye.y) / (eyeTop - 0.052), shoulders * 1.21, (bounds.max.y - head.y) * 1.65);
  const center = new THREE.Vector3(eye.x, eye.y - (0.5 - eyeTop) * span, (head.z + eye.z) / 2);
  const half = span / 2;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 100);
  camera.position.copy(center).add(new THREE.Vector3(0.14, 0.018, 3.3));
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  return camera;
}

/** 원본 모델과 MToon을 WebGL2로 그린 뒤 동일한 배경 위에 합성한다. */
export function createManuscriptCastingRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setSize(SIZE, SIZE);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xfffaf5, 0.67));
  for (const [color, strength, x, y, z] of [
    [0xfff8ed, 1.38, -2.4, 4, 3.6], [0xe5efff, 0.48, 3.2, 2.3, 2.1], [0xffeddc, 0.8, 1.7, 3.4, -3.2],
  ] as const) {
    const light = new THREE.DirectionalLight(color, strength);
    light.position.set(x, y, z);
    scene.add(light);
  }
  const loader = new GLTFLoader().register((parser) => new VRMLoaderPlugin(parser));
  const output = document.createElement("canvas");
  output.width = SIZE;
  output.height = SIZE;
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("캐스팅 카드 합성 캔버스를 만들 수 없습니다.");
  const backdrop = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  backdrop.addColorStop(0, "#d8d3d2");
  backdrop.addColorStop(0.55, "#d2d0d4");
  backdrop.addColorStop(1, "#bfc6ce");

  return async ({ id, url }: { id: string; url: string }) => {
    const gltf = await loader.loadAsync(url);
    const vrm: VRM | undefined = gltf.userData.vrm;
    if (!vrm) throw new Error(`캐스팅 카드의 VRM을 읽을 수 없습니다 (${id}).`);
    try {
      if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
      scene.add(vrm.scene);
      updatePose(vrm);
      lowerArms(vrm, id.startsWith("ts-vrm-hero-v1-") ? 1.08 : 1.23);
      const camera = castingCamera(vrm, id);
      await renderer.compileAsync(scene, camera);
      renderer.render(scene, camera);
      if (renderer.getContext().isContextLost() || renderer.info.render.triangles === 0) {
        throw new Error(`캐스팅 카드에 모델을 그리지 못했습니다 (${id}).`);
      }
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.drawImage(renderer.domElement, 0, 0);
      return output.toDataURL("image/webp", 0.94);
    } finally {
      scene.remove(vrm.scene);
      VRMUtils.deepDispose(vrm.scene);
      renderer.renderLists.dispose();
    }
  };
}
