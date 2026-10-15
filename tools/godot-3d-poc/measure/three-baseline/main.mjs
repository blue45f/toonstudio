/**
 * Three.js 최소 베이스라인 — Godot PoC 와 같은 GLB·카메라·툰 + 외곽선 조건으로 렌더해 상대 비교한다.
 * 측정 하네스(run.mjs)가 Vite 라이브러리 빌드로 한 파일 번들(bundle.js)을 만들어 서빙한다. 저장소 앱에는 연결되어 있지 않다.
 * 소프트웨어 GL(SwiftShader)에서는 절대 FPS 가 대표성이 없다: 값은 같은 조건의 Godot 결과와의 상대 비교에만 쓴다.
 */
import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const marks = { timeOrigin: performance.timeOrigin, t: {} };
const mark = (name) => {
  if (!(name in marks.t)) marks.t[name] = performance.now();
};
mark("bundle-start");

const WIDTH = 960;
const HEIGHT = 540;
const FOV = 40;
const YAW = 30;
const PITCH = 15;
const OUTLINE_PX = 2;
const BANDS = 3;

let renderer;
let scene;
let camera;
let canvas;

function ensureRenderer() {
  if (renderer) return;
  canvas = document.getElementById("c");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.setClearColor(0xebebeb, 1);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, WIDTH / HEIGHT, 0.05, 200);
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(-4, 6, 6);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  mark("renderer-ready");
}

function toneMap() {
  const data = new Uint8Array(BANDS);
  for (let i = 0; i < BANDS; i += 1) data[i] = Math.round(255 * (0.55 + (0.45 * i) / (BANDS - 1)));
  const texture = new THREE.DataTexture(data, BANDS, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/** 뒤집힌 껍질 외곽선: 정점을 화면 공간에서 법선 방향으로 밀어 일정한 픽셀 폭을 만든다(Godot outline.gdshader 와 같은 식). */
function outlineMaterial() {
  const material = new THREE.MeshToonMaterial({ color: 0x0a0a12, side: THREE.BackSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.outlinePx = { value: OUTLINE_PX };
    shader.uniforms.viewport = { value: new THREE.Vector2(WIDTH, HEIGHT) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float outlinePx;\nuniform vec2 viewport;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec3 nView = normalize(normalMatrix * objectNormal);
        vec2 dir = (projectionMatrix * vec4(nView, 0.0)).xy;
        float len = length(dir);
        dir = len > 1e-6 ? dir / len : vec2(0.0);
        gl_Position.xy += dir * (outlinePx * 2.0 / viewport) * gl_Position.w;`,
      );
    shader.fragmentShader = shader.fragmentShader.replace("#include <dithering_fragment>", "gl_FragColor = vec4(0.04, 0.04, 0.07, 1.0);");
  };
  return material;
}

function toonify(root) {
  const gradientMap = toneMap();
  const outline = outlineMaterial();
  const meshes = [];
  root.traverse((node) => {
    if (node.isMesh) meshes.push(node);
  });
  for (const mesh of meshes) {
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const toon = new THREE.MeshToonMaterial({ color: source.color ?? 0xffffff, map: source.map ?? null, gradientMap });
    mesh.material = toon;
    const hull = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(mesh.geometry, outline) : new THREE.Mesh(mesh.geometry, outline);
    if (mesh.isSkinnedMesh) hull.bind(mesh.skeleton, mesh.bindMatrix);
    hull.userData.isHull = true;
    hull.matrixAutoUpdate = false;
    hull.matrix = mesh.matrix;
    mesh.parent?.add(hull);
  }
  return meshes.length;
}

function frameBox(box) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 0.05);
  const distance = (radius / Math.sin((FOV * Math.PI) / 360)) * 1.15;
  camera.near = Math.max(distance * 0.01, 0.02);
  camera.far = distance + radius * 4;
  camera.updateProjectionMatrix();
  setCamera(center, distance);
  return { center: center.toArray(), distance, size: size.toArray() };
}

function setCamera(target, distance, yawDeg = YAW, pitchDeg = PITCH) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.lookAt(target);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { n: 0 };
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { n, min: sorted[0], max: sorted[n - 1], mean: sorted.reduce((a, b) => a + b, 0) / n, median, p95: sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)] };
}

async function renderFrames(frames, warmup) {
  const gl = renderer.getContext();
  const deltas = [];
  let last = performance.now();
  for (let i = 0; i < warmup + frames; i += 1) {
    await nextFrame();
    renderer.render(scene, camera);
    gl.finish();
    const now = performance.now();
    if (i >= warmup) deltas.push(now - last);
    last = now;
  }
  return summarize(deltas);
}

function heapMiB() {
  return performance.memory ? performance.memory.usedJSHeapSize / (1024 * 1024) : null;
}

function triangleCount(root) {
  let triangles = 0;
  let meshInstances = 0;
  root.traverse((node) => {
    if (node.isMesh && !node.userData.isHull) {
      meshInstances += 1;
      const index = node.geometry.index;
      triangles += (index ? index.count : node.geometry.attributes.position.count) / 3;
    }
  });
  return { triangles, meshInstances };
}

function createGltfLoader() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("/vendor/three/examples/jsm/libs/draco/gltf/");
  loader.setDRACOLoader(dracoLoader);
  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath("/vendor/three/examples/jsm/libs/basis/");
  ktx2Loader.detectSupport(renderer);
  loader.setKTX2Loader(ktx2Loader);
  return loader;
}

/** GLB 한 개를 받아 파싱하고 툰 + 외곽선 장면을 만든 뒤 첫 프레임과 이후 프레임 간격을 잰다. */
async function runModel({ url, frames = 20, warmup = 3, outline = true }) {
  ensureRenderer();
  mark("run-start");
  const t0 = performance.now();
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const tFetch = performance.now();
  const loader = createGltfLoader();
  const gltf = await new Promise((resolve, reject) => loader.parse(buffer, "", resolve, reject));
  const tParse = performance.now();
  const root = gltf.scene;
  scene.add(root);
  const toonSurfaces = toonify(root);
  if (!outline) {
    // 외곽선 껍질 제거(옵션)
    const hulls = [];
    root.traverse((node) => {
      if (node.isMesh && node.material?.side === THREE.BackSide) hulls.push(node);
    });
    hulls.forEach((hull) => hull.parent?.remove(hull));
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const framing = frameBox(box);
  const tBuilt = performance.now();
  const gl = renderer.getContext();
  renderer.render(scene, camera);
  gl.finish();
  const tFirst = performance.now();
  mark("first-frame");
  const stats = triangleCount(root);
  const frameMs = await renderFrames(frames, warmup);
  return {
    url,
    inputBytes: buffer.byteLength,
    fetchMs: tFetch - t0,
    parseMs: tParse - tFetch,
    buildMs: tBuilt - tParse,
    firstRenderMs: tFirst - tBuilt,
    toonSurfaces,
    ...stats,
    framing,
    frameMs,
    heapMiB: heapMiB(),
    info: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries },
    marks,
  };
}

/** Godot instance_bench.gd 와 같은 격자·색 규약의 InstancedMesh 벤치. */
async function runBench({ count, frames = 6, warmup = 2 }) {
  ensureRenderer();
  const t0 = performance.now();
  const n = Math.ceil(Math.cbrt(count));
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial(), count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const half = (n - 1) * 0.5;
  const d = Math.max(n - 1, 1);
  for (let i = 0; i < count; i += 1) {
    const x = i % n;
    const y = Math.floor(i / n) % n;
    const z = Math.floor(i / (n * n));
    dummy.position.set(x - half, y - half, z - half);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setRGB(x / d, y / d, z / d, THREE.LinearSRGBColorSpace);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  const setupMs = performance.now() - t0;
  const extent = n;
  camera.near = 0.1;
  camera.far = extent * 6;
  camera.updateProjectionMatrix();
  setCamera(new THREE.Vector3(0, 0, 0), extent * 1.9, 30, 20);
  const gl = renderer.getContext();
  const tFirst0 = performance.now();
  renderer.render(scene, camera);
  gl.finish();
  const firstFrameMs = performance.now() - tFirst0;
  const frameMs = await renderFrames(frames, warmup);
  const info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
  mesh.dispose();
  return { count, gridSide: n, setupMs, firstFrameMs, frameMs, info, heapMiB: heapMiB() };
}

/** 확장 GLB 호환성: 같은 픽스처를 Three(+Meshopt/Draco/KTX2 디코더)로 열어 본다. */
async function runExt({ urls }) {
  ensureRenderer();
  const loader = createGltfLoader();
  const results = [];
  for (const url of urls) {
    const t0 = performance.now();
    try {
      const buffer = await (await fetch(url)).arrayBuffer();
      const gltf = await new Promise((resolve, reject) => loader.parse(buffer, "", resolve, reject));
      const stats = triangleCount(gltf.scene);
      let textured = 0;
      gltf.scene.traverse((node) => {
        if (node.isMesh && node.material?.map) textured += 1;
      });
      results.push({ url, ok: true, ms: performance.now() - t0, ...stats, texturedMeshes: textured });
    } catch (error) {
      results.push({ url, ok: false, ms: performance.now() - t0, error: String(error?.message ?? error).slice(0, 200) });
    }
  }
  return results;
}

window.__three = { runModel, runBench, runExt, marks, version: THREE.REVISION };
window.__threeReady = true;
mark("api-ready");
