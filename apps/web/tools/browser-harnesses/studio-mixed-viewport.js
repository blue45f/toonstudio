// QA-only observer, imported on demand by the browser benchmark in the real Studio Vite app.
import { _roots } from '@react-three/fiber';

function countObjects(scene) {
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
      if (count > 0) { staticMeshes++; staticVertices += count; }
    });
  }
  return { skinnedMeshes, staticMeshes, staticVertices, modelCount: modelRoots.size };
}

// The normal background editor renders its main view in an R3F portal. Observe the actual
// renderer invocation once during setup; the outer Canvas scene can legitimately be empty.
async function mixedView(canvas) {
  const state = _roots.get(canvas)?.store.getState();
  if (!state) return null;
  const renderer = state.gl;
  const render = renderer.render;
  let match = null;
  try {
    renderer.render = function(scene, camera, ...args) {
      if (!match && scene?.isScene) {
        const counts = countObjects(scene);
        if (counts.skinnedMeshes && counts.staticMeshes && counts.modelCount === 1) {
          const controls = scene.__r3f?.root?.getState().controls ?? state.controls;
          match = { scene, camera, controls: controls?.object === camera ? controls : null, invalidate: state.invalidate, counts };
        }
      }
      return render.call(this, scene, camera, ...args);
    };
    state.invalidate();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return match;
  } finally {
    renderer.render = render;
  }
}

export async function readMixedScene(canvas) {
  return (await mixedView(canvas))?.counts ?? { skinnedMeshes: 0, staticMeshes: 0, staticVertices: 0, modelCount: 0 };
}

/** Deltas between completed application render calls while its actual camera orbits. */
export async function measureMixedViewport(canvas) {
  const renderedView = await mixedView(canvas);
  if (!renderedView) throw new Error('Expected one committed GLB and live skinned VRM in the same rendered portal');
  const { scene, camera, controls, invalidate, counts } = renderedView;
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('Active Studio surface is not WebGL2');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const position = camera.position.clone();
  const orientation = camera.quaternion.clone();
  const target = controls?.target?.clone() ?? camera.getWorldDirection(position.clone()).multiplyScalar(5).add(position);
  const offset = position.clone().sub(target);
  const axis = position.clone().set(0, 1, 0);
  const view = [canvas.clientWidth, canvas.clientHeight];
  let buffer;
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
  let lastPaintTick = null;
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
        const tick = document.timeline.currentTime;
        if (renderedCamera !== camera || drawnStep === step || (tick !== null && tick === lastPaintTick)) return;
        drawnStep = step;
        lastPaintTick = tick;
        if (step === warmup - 1) {
          restoreMeshes();
          if (!drewSkin || !drewModel) { reject(new Error('Both the VRM and GLB must have drawn for the main camera')); return; }
        }
        if (step >= warmup) {
          const current = [gl.drawingBufferWidth, gl.drawingBufferHeight];
          if (!buffer) buffer = current;
          if (current[0] !== buffer[0] || current[1] !== buffer[1]) {
            reject(new Error('Adaptive resolution changed during the measured orbit: ' + buffer + ' → ' + current));
            return;
          }
          timestamps.push(performance.now());
        }
        if (timestamps.length >= sampleCount + 1) { resolve(); return; }
        // invalidate() during R3F's frame requests exactly the next app frame.
        step++;
        move();
      };
      timer = setTimeout(() => reject(new Error('Timed out waiting for actual application draws: ' + step)), 150000);
      move();
    });
  } finally {
    restoreMeshes();
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

/** 실제 휠 이벤트부터 확대 방향이 반영된 주 카메라의 렌더 제출까지 관찰한다. */
export async function createMixedWheelProbe(canvas) {
  const view = await mixedView(canvas);
  const viewport = canvas.closest('[data-testid="studio-bg3d-viewport"]');
  if (!view || !viewport) throw new Error('확대 입력을 측정할 캐릭터·배경 뷰포트를 찾지 못했습니다.');
  const { scene, camera } = view;

  return (deltaY) => {
    let before;
    const previous = scene.onAfterRender;
    const capture = (event) => {
      if (before || !event.isTrusted || event.deltaY !== deltaY || event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return;
      if (!event.composedPath().includes(viewport) || event.target?.closest?.('[data-bg3d-viewport-control],button')) return;
      before = { time: event.timeStamp, x: event.clientX, y: event.clientY, position: camera.position.clone(),
        forward: camera.getWorldDirection(camera.position.clone()), zoom: camera.zoom };
    };
    const result = new Promise((resolve) => {
      const finish = (value) => {
        clearTimeout(timer);
        window.removeEventListener('wheel', capture, true);
        scene.onAfterRender = previous;
        resolve(value);
      };
      const timer = setTimeout(() => finish({ error: before ? '휠 입력 후 같은 방향의 카메라 렌더 없음' : '뷰포트에서 휠 이벤트 미수신' }), 15000);
      window.addEventListener('wheel', capture, { capture: true, passive: true });
      scene.onAfterRender = function(renderer, renderedScene, renderedCamera, ...rest) {
        const submittedAt = performance.now();
        previous.call(this, renderer, renderedScene, renderedCamera, ...rest);
        if (!before || renderedScene !== scene || renderedCamera !== camera) return;
        const inward = camera.isOrthographicCamera ? camera.zoom - before.zoom :
          camera.position.clone().sub(before.position).dot(before.forward);
        if (!(-Math.sign(deltaY) * inward > 0.00001)) return;
        finish({ deltaY, elapsedMs: submittedAt - before.time, point: [before.x, before.y],
          cameraBefore: [...before.position.toArray(), before.zoom], cameraAfter: [...camera.position.toArray(), camera.zoom],
          buffer: [canvas.width, canvas.height] });
      };
    });
    return { result };
  };
}
