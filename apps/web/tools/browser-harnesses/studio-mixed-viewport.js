// QA-only observer, imported on demand by the browser benchmark in the real Studio Vite app.
import { _roots } from '@react-three/fiber';

function sceneFor(canvas) {
  const state = _roots.get(canvas)?.store.getState();
  if (!state || !state.gl || !state.camera) throw new Error('No active R3F Studio viewport');
  return state;
}

export function readMixedScene(canvas) {
  const { scene } = sceneFor(canvas);
  let skinnedMeshes = 0;
  let staticMeshes = 0;
  let staticVertices = 0;
  const modelRoots = new Set();
  scene.traverseVisible((object) => {
    if (object.isSkinnedMesh && object.skeleton?.bones.length) skinnedMeshes++;
    if (object.userData.studioBg3dEntityKind === 'model') modelRoots.add(object);
  });
  for (const root of modelRoots) {
    root.traverseVisible((object) => {
      if (!object.isMesh || object.isSkinnedMesh) return;
      const count = object.geometry?.attributes?.position?.count;
      if (count > 0) {
        staticMeshes++;
        staticVertices += count;
      }
    });
  }
  return { skinnedMeshes, staticMeshes, staticVertices, modelCount: modelRoots.size };
}

/** Deltas between completed application render calls while its actual camera orbits. */
export async function measureMixedViewport(canvas) {
  const { scene, camera, controls, invalidate } = sceneFor(canvas);
  const counts = readMixedScene(canvas);
  if (!counts.skinnedMeshes || !counts.staticMeshes || counts.modelCount !== 1) {
    throw new Error('Expected one committed GLB and live skinned VRM in the same scene');
  }
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('Active Studio surface is not WebGL2');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const position = camera.position.clone();
  const orientation = camera.quaternion.clone();
  const target = controls?.target?.clone() ?? camera.getWorldDirection(position.clone()).multiplyScalar(5).add(position);
  const offset = position.clone().sub(target);
  const axis = position.clone().set(0, 1, 0);
  const view = [canvas.clientWidth, canvas.clientHeight];
  const buffer = [gl.drawingBufferWidth, gl.drawingBufferHeight];
  // Capture actual submissions once, after which no per-mesh observers remain in timed frames.
  const restores = [];
  let drewSkin = false;
  let drewModel = false;
  scene.traverseVisible((object) => {
    if (!object.isMesh) return;
    let root = object;
    while (root && root.userData.studioBg3dEntityKind !== 'model') root = root.parent;
    if (!root && !object.isSkinnedMesh) return;
    const before = object.onBeforeRender;
    object.onBeforeRender = function(renderer, renderedScene, renderedCamera, ...rest) {
      before.call(this, renderer, renderedScene, renderedCamera, ...rest);
      if (renderedCamera !== camera || renderedScene !== scene) return;
      if (root) drewModel = true;
      if (object.isSkinnedMesh) drewSkin = true;
    };
    restores.push(() => { object.onBeforeRender = before; });
  });
  const restoreMeshes = () => { for (const restore of restores.splice(0)) restore(); };
  const previous = scene.onAfterRender;
  const warmup = 30;
  const sampleCount = 120;
  const timestamps = [];
  let step = 0;
  let drawnStep = -1;
  let frame = 0;
  let timer;
  try {
    await new Promise((resolve, reject) => {
      const move = () => {
        if (gl.isContextLost()) { reject(new Error('WebGL context lost')); return; }
        // One identical angular step per submitted frame, independent of wall clock.
        const angle = 0.30 * Math.sin(2 * Math.PI * step / 60);
        camera.position.copy(offset).applyAxisAngle(axis, angle).add(target);
        camera.lookAt(target);
        camera.updateMatrixWorld();
        invalidate();
      };
      scene.onAfterRender = function(renderer, renderedScene, renderedCamera, ...rest) {
        previous.call(this, renderer, renderedScene, renderedCamera, ...rest);
        if (renderedCamera !== camera || drawnStep === step) return;
        drawnStep = step;
        if (step === warmup - 1) {
          restoreMeshes();
          if (!drewSkin || !drewModel) { reject(new Error('Both the VRM and GLB must have drawn for the main camera')); return; }
        }
        if (step >= warmup) timestamps.push(performance.now());
        if (timestamps.length >= sampleCount + 1) { resolve(); return; }
        frame = requestAnimationFrame(() => { step++; move(); });
      };
      timer = setTimeout(() => reject(new Error('Timed out waiting for actual application draws: ' + step)), 150000);
      move();
    });
  } finally {
    restoreMeshes();
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    scene.onAfterRender = previous;
    camera.position.copy(position);
    camera.quaternion.copy(orientation);
    camera.updateMatrixWorld();
    invalidate();
  }
  const deltasMs = timestamps.slice(1).map((time, i) => time - timestamps[i]);
  if (deltasMs.some((ms) => !Number.isFinite(ms) || ms <= 0)) throw new Error('Invalid render frame intervals');
  const sorted = [...deltasMs].sort((a,b) => a-b);
  const percentile = (fraction) => sorted[Math.ceil(sorted.length * fraction) - 1];
  return { unit: 'ms', metric: 'wall-clock intervals between actual main-camera scene.onAfterRender callbacks during a scripted 0.30 radian orbit', warmup, sampleCount, deltasMs, p50: percentile(0.50), p95: percentile(0.95), counts, view, buffer, dpr: devicePixelRatio, cameraStart: position.toArray(), target: target.toArray(), gpu: { vendor: gl.getParameter(info?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR), renderer: gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), version: gl.getParameter(gl.VERSION) } };
}
