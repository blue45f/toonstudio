import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { countDetectedVrmHairMeshes, StudioVrmAvatarForge } from "../../apps/web/src/domains/creator/vrm/StudioVrmAvatarForge";
import { StudioVrmPropAttachment, StudioVrmRuntimeCommit } from "../../apps/web/src/domains/creator/vrm/StudioVrmWardrobePropsProjection";
import { applyAvatarForgeHairStyleRecipe, createAvatarForgeState } from "../../apps/web/src/domains/creator/vrm/studio-vrm-avatar-forge";
import { createStudioVrmAvatarForgeFaceController } from "../../apps/web/src/domains/creator/vrm/studio-vrm-avatar-forge-face-controller";
import { buildStudioVrmHairGeometryIdentity } from "../../apps/web/src/domains/creator/vrm/studio-vrm-hair-transition";
import { measureStudioVrmHeadFit } from "../../apps/web/src/domains/creator/vrm/studio-vrm-head-measure";
import { measureVrmPropRigMetrics } from "../../apps/web/src/domains/creator/vrm/studio-vrm-prop-rig";
import { createPropInstance } from "../../apps/web/src/domains/creator/vrm/studio-vrm-props";
import { captureHairStack } from "./measure.mjs";

const models = { sample: "/vrm/sample.vrm", shion: "/vrm/Sendagaya_Shibu.vrm" };
const viewAngles = { front: 0, side: 90, back: 180 };
const api = { ready: false, frames: 0, statuses: {}, model: null, identity: null };
window.studioHairStack = api;

function Subject({ fixture }) {
  const { vrm, head, neck } = fixture;
  const { camera, gl, scene } = useThree();
  const [state, setState] = useState(() => createAvatarForgeState());
  const committed = useRef(state);
  useLayoutEffect(() => { committed.current = state; }, [state]);
  const metrics = useMemo(() => measureVrmPropRigMetrics(vrm), [vrm]);
  const faceController = useMemo(createStudioVrmAvatarForgeFaceController, []);
  const items = useMemo(() => ["cap", "sunglasses"].map(id => createPropInstance(id)), []);
  const onStatus = useCallback((_uid, id, status) => { api.statuses[id] = status; }, []);
  const headBase = useMemo(() => head.quaternion.clone(), [head]);
  const neckBase = useMemo(() => neck.quaternion.clone(), [neck]);
  const inspect = useMemo(() => captureHairStack({ fixture, camera, gl, scene }), [fixture, camera, gl, scene]);

  useLayoutEffect(() => {
    api.model = fixture.model;
    api.style = (style, tailHeight) => {
      const recipe = applyAvatarForgeHairStyleRecipe(createAvatarForgeState(), style);
      recipe.hair = { ...recipe.hair, replaceOriginal: true, ...(tailHeight == null ? {} : { tailHeight }) };
      api.identity = buildStudioVrmHairGeometryIdentity(recipe.hair);
      api.frames = 0;
      setState(recipe);
    };
    api.pose = (turned) => {
      head.quaternion.copy(headBase);
      neck.quaternion.copy(neckBase);
      if (turned) {
        const rad = THREE.MathUtils.degToRad;
        neck.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(6), rad(12), 0, "YXZ")));
        head.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rad(22), rad(-12), "YXZ")));
      }
      vrm.update(0);
      vrm.scene.updateMatrixWorld(true);
      api.frames = 0;
    };
    api.view = (view, tieCloseup = false) => {
      const { frontYaw } = fixture.camera;
      const { center, distance } = tieCloseup ? fixture.camera.tie : fixture.camera;
      const yaw = frontYaw + THREE.MathUtils.degToRad(viewAngles[view]);
      camera.position.set(center.x + distance * Math.sin(yaw), center.y, center.z + distance * Math.cos(yaw));
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      api.frames = 0;
    };
    api.inspect = spec => inspect(spec, committed.current);
    api.settled = () => {
      const forge = vrm.scene.getObjectByName("ToonStudioAvatarForge");
      return api.frames >= 3 && forge?.userData.toonSpectrumAvatarForgeHairIdentity === api.identity
        && api.statuses.cap === "ready" && api.statuses.sunglasses === "ready";
    };
    api.view("front");
    return () => { api.model = null; };
  }, [camera, fixture, head, headBase, inspect, neck, neckBase, vrm]);
  useFrame(() => { api.frames += 1; });

  return <>
    <primitive object={vrm.scene} dispose={null} />
    <StudioVrmAvatarForge vrm={vrm} state={state} rigRevision={0} faceController={faceController} />
    {items.map(item => <group key={item.uid} name={`review-${item.propId}`}>
      <StudioVrmPropAttachment vrm={vrm} instance={item} metrics={metrics} onAttachmentStatus={onStatus} />
    </group>)}
    <StudioVrmRuntimeCommit vrm={vrm} physicsPreview={false} webcamActive={false} />
  </>;
}

function App() {
  const [fixture, setFixture] = useState(null);
  useLayoutEffect(() => {
    api.load = async model => {
      if (!Object.hasOwn(models, model)) throw new Error(`Unknown model ${model}`);
      const loader = new GLTFLoader().register(parser => new VRMLoaderPlugin(parser));
      const vrm = (await loader.loadAsync(models[model])).userData.vrm;
      if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
      vrm.update(0);
      vrm.scene.updateMatrixWorld(true);
      const head = vrm.humanoid.getNormalizedBoneNode("head");
      const neck = vrm.humanoid.getNormalizedBoneNode("neck");
      if (!head || !neck) throw new Error(`Missing head/neck in ${model}`);
      const { fit, sampleCount } = measureStudioVrmHeadFit(vrm, head);
      const nativeMeshes = [];
      vrm.scene.traverseVisible(node => { if (node.isMesh) nativeMeshes.push(node); });
      const center = head.localToWorld(new THREE.Vector3(...fit.center));
      center.y -= fit.radiusY * 1.2;
      const forward = new THREE.Vector3(0, 0, fit.frontSign).transformDirection(head.matrixWorld);
      const frontYaw = Math.atan2(forward.x, forward.z);
      const unitDistance = Math.max(fit.radiusY, fit.radiusX, fit.radiusZ) / Math.tan(THREE.MathUtils.degToRad(35 / 2));
      const tieCenter = head.localToWorld(new THREE.Vector3(
        fit.center[0], fit.center[1], fit.center[2] - fit.frontSign * fit.radiusZ,
      ));
      api.statuses = {};
      setFixture({ model, vrm, head, neck, fit, sampleCount, nativeMeshes,
        detectedHair: countDetectedVrmHairMeshes(vrm), camera: { center, frontYaw, distance: 4.1 * unitDistance, tie: { center: tieCenter, distance: 1.55 * unitDistance } } });
    };
    api.ready = true;
  }, []);
  return <Canvas dpr={1} camera={{ fov: 35, near: 0.01, far: 40 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
    <color attach="background" args={["#e4e6ea"]} />
    <hemisphereLight args={["#ffffff", "#747b85", 1.5]} />
    <directionalLight position={[2, 4, 4]} intensity={2.1} />
    <directionalLight position={[-3, 2, -3]} intensity={1.4} />
    {fixture && <Subject key={fixture.model} fixture={fixture} />}
  </Canvas>;
}

createRoot(document.getElementById("root")).render(<App />);
