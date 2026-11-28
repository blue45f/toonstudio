/** Review-only page. runtime.mjs is built from the exact checkout's production components. */
import * as R from "./runtime/runtime.mjs";
import { createMicGripMeasurement } from "./studio-wearable-motion-grip.mjs";

const { THREE: T, React, createRoot, Canvas, useFrame, useThree } = R;
const h = React.createElement;
const root = createRoot(document.getElementById("root"));
const reviewModels = new Map([
  ["sample", { url: "/vrm/sample.vrm", poseId: "sample-vrm" }],
  ["shion", { url: "/vrm/Sendagaya_Shibu.vrm", poseId: "shion" }],
]);
const cache = new Map();
const reviewPropGroup = React.createRef();
let selectState = null;
let generation = 0;
let active = null;
const api = {
  status: "initializing", frames: 0, receipt: null, errors: [],
  catalogue: { models: [...reviewModels.keys()], wardrobe: R.WARDROBE_ITEMS.map(({id,slot,geometrySource})=>({id,slot,geometrySource})), props: R.VRM_PROPS.map(({id,category,geometrySource})=>({id,category,geometrySource})) },
};
window.studioWearableQA = api;
window.addEventListener("error", (event)=>api.errors.push(event.message));
window.addEventListener("unhandledrejection", (event)=>api.errors.push(String(event.reason)));

async function avatar(url) {
  if (cache.has(url)) return cache.get(url);
  const loader = new R.GLTFLoader(); loader.register((parser)=>new R.VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url); const vrm = gltf.userData.vrm;
  if (!vrm?.humanoid) throw new Error(`No humanoid in ${url}`);
  if (vrm.meta.metaVersion === "0") R.VRMUtils.rotateVRM0(vrm);
  vrm.update(0); vrm.scene.updateMatrixWorld(true);
  const value = { vrm, costume: R.collectStudioVrmCostumeMeshes(vrm), rest: vrm.humanoid.getNormalizedPose() };
  cache.set(url, value); return value;
}
const tick = ()=>new Promise((resolve)=>requestAnimationFrame(resolve));
api.select = async ({ type="wardrobe", id, model="sample", angle=30, crop="full", color=null, assetUrl=null }={})=>{ // NOSONAR javascript:S3776
  if (!selectState) throw new Error("Review root not ready");
  api.turnAttachment = null;
  api.measureAttachment = null;
  const token = ++generation; api.status="loading"; api.frames=0; api.receipt=null;
  selectState(null); await tick(); await tick();
  if(type==="asset") {
    if(!assetUrl?.startsWith("/assets/3d/"))throw new Error("Only same-origin review assets are accepted");
    const object=(await new R.GLTFLoader().loadAsync(assetUrl)).scene;
    active={type,id,object,angle,crop,token}; selectState(active);return;
  }
  const fixture = reviewModels.get(model);
  if (!fixture) throw new Error(`착용 검토 모델을 찾을 수 없습니다: ${model}`);
  const entry=await avatar(fixture.url); const {vrm,costume}=entry;
  vrm.humanoid.setNormalizedPose(entry.rest); vrm.update(0); vrm.scene.updateMatrixWorld(true);
  R.applyStudioVrmCostumeState(costume,{hidden:[],recolor:{}});
  const wardrobeMetrics=R.measureStudioVrmWardrobeMetrics(vrm);
  const idle=R.pickNaturalIdlePose(fixture.poseId);
  R.applyPoseToVrm(vrm,R.retargetStudioVrmPresetTorso(vrm,R.stripFingerBones(idle.bones)),idle.yOffset??0,undefined,{skipPalmCorrect:true});
  const metrics=R.measureVrmPropRigMetrics(vrm);
  let instance=null; let equip=null; let slot=null; let effectiveFit=1;
  if(type==="prop") {
    const def=R.propDefById(id); if(!def)throw new Error(`Unknown prop ${id}`);
    instance=R.createPropInstance(id, "review-" + token + "-" + id);
    if(color)instance={...instance,color};
    const fingers=R.createAutoGripFingerOverrides([instance],R.propDefById,metrics);
    const authored=Object.fromEntries(R.POSER_FINGER_BONES.filter((name)=>idle.bones[name]?.rotation)
      .map((name)=>[name,idle.bones[name].rotation]));
    R.applyFingerRotations(vrm,R.resolveStudioVrmFingerAuthority(authored,fingers));
  } else if(type==="wardrobe") {
    const def=R.wardrobeItemById(id); if(!def)throw new Error(`Unknown garment ${id}`);
    equip=R.createWardrobeEquip(id);slot=def.slot;
    if(color)equip={...equip,color};
    const state=R.mergeWardrobeCostumeVisibility({hidden:[],recolor:{}},{[slot]:equip},costume,true);
    R.applyStudioVrmCostumeState(costume,state);
    effectiveFit=R.inspectStudioVrmGarmentFit({[slot]:equip},wardrobeMetrics).slots[slot]?.effectiveFit??equip.fit;
  }
  R.correctVrmHangingHandPalmTwist(vrm);vrm.humanoid.update();vrm.update(0);vrm.scene.updateMatrixWorld(true);
  active={type,id,model,vrm,instance,equip,slot,metrics,wardrobeMetrics,effectiveFit,angle,crop,token,idlePoseId:idle.id,idlePose:vrm.humanoid.getNormalizedPose()};
  selectState(active);
};
api.view = (angle,crop=active?.crop??"full")=>{
  if (!active) return;
  active = {...active, angle, crop};
  api.frames = 0;
  selectState(active);
};
api.pose = (kind)=>{
  const vrm = active?.vrm;
  if (!vrm) return;
  if (kind === "arms-up") {
    const leftArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
    const rightArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
    if (leftArm) leftArm.rotation.z = 0.40;
    if (rightArm) rightArm.rotation.z = -0.40;
  } else if (kind === "bent-knees") {
    for (const side of ["left", "right"]) {
      const thigh = vrm.humanoid.getNormalizedBoneNode(`${side}UpperLeg`);
      const knee = vrm.humanoid.getNormalizedBoneNode(`${side}LowerLeg`);
      if (thigh) thigh.rotation.x = -1.05;
      if (knee) knee.rotation.x = 1.35;
    }
  }
  vrm.humanoid.update();
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  api.frames = 0;
};

// 화면에 장착된 GLB를 독립적인 변형(raw) 본 좌표에서 계측한다.
api.beginAttachmentMotion = (expectedBone) => {
  const { vrm, instance, metrics } = active ?? {};
  const asset = reviewPropGroup.current?.children[0]?.children[0];
  const definition = instance && R.propDefById(instance.propId);
  const bone = vrm?.humanoid.getNormalizedBoneNode(expectedBone);
  const rawBone = vrm?.humanoid.getRawBoneNode(expectedBone);
  if (api.status !== "ready" || instance?.bone !== expectedBone || definition?.geometrySource.kind !== "gltf" ||
      !bone || !rawBone || !asset) throw new Error(`실제 GLB 또는 장착 본을 찾지 못했습니다: ${expectedBone}`);
  const fit = R.resolvePropAttachment(definition, instance, metrics);
  if (!fit.usesSmartRig) throw new Error("소켓으로 장착한 모델만 동작을 비교할 수 있습니다.");
  let markerMesh;
  asset.traverse((node) => {
    if (!markerMesh && node.isMesh && node.geometry?.getAttribute("position")?.count) markerMesh = node;
  });
  if (!markerMesh) throw new Error("장착한 GLB에서 비교할 메시 정점을 찾지 못했습니다.");
  const measureGrip = instance.propId === "mic" ? createMicGripMeasurement(vrm, asset) : null;
  const anchorWorld = () => asset.localToWorld(new T.Vector3(...fit.anchor.position));
  const markerWorld = () => markerMesh.localToWorld(markerMesh.getVertexPosition(0, new T.Vector3()));
  const relativeRotation = () => rawBone.getWorldQuaternion(new T.Quaternion()).normalize().invert()
    .multiply(asset.getWorldQuaternion(new T.Quaternion()).normalize()).normalize();
  const baselineAnchor = rawBone.worldToLocal(anchorWorld());
  const baselineMarker = rawBone.worldToLocal(markerWorld());
  const baselineRotation = relativeRotation();
  const baselineBoneRotation = rawBone.getWorldQuaternion(new T.Quaternion()).normalize();
  const startingPose = bone.quaternion.clone();
  const axis = expectedBone === "head" ? new T.Vector3(0, 1, 0) : new T.Vector3(0, 0, 1);
  api.turnAttachment = (degrees) => {
    bone.quaternion.copy(startingPose).multiply(new T.Quaternion().setFromAxisAngle(axis, T.MathUtils.degToRad(degrees)));
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    api.frames = 0;
  };
  api.measureAttachment = () => {
    if (api.status !== "ready" || asset.parent?.parent !== reviewPropGroup.current) {
      throw new Error("측정 중 장착한 GLB가 교체되거나 분리되었습니다.");
    }
    const anchor = anchorWorld();
    return {
      bone: expectedBone,
      ...(measureGrip ? { grip: measureGrip() } : {}),
      vrmVersion: vrm.meta.metaVersion,
      actualTurnDeg: T.MathUtils.radToDeg(baselineBoneRotation.angleTo(rawBone.getWorldQuaternion(new T.Quaternion()).normalize())),
      socketGapMm: anchor.distanceTo(bone.localToWorld(new T.Vector3(...fit.socketPosition))) * 1000,
      anchorDriftMm: anchor.distanceTo(rawBone.localToWorld(baselineAnchor.clone())) * 1000,
      vertexDriftMm: markerWorld().distanceTo(rawBone.localToWorld(baselineMarker.clone())) * 1000,
      angularDriftDeg: T.MathUtils.radToDeg(baselineRotation.angleTo(relativeRotation())),
    };
  };
};

function Camera({selection}) {
  const {camera,scene,gl}=useThree();
  React.useLayoutEffect(()=>{
    if(!selection)return;
    const object=selection.vrm?.scene??selection.object;
    object.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(object);const size=bounds.getSize(new T.Vector3());const center=bounds.getCenter(new T.Vector3());
    let radius=Math.max(size.y,size.x,size.z)*.5;
    if(selection.vrm&&selection.crop!=="full") {
      const humanoid=selection.vrm.humanoid;
      const head=humanoid.getNormalizedBoneNode("head").getWorldPosition(new T.Vector3());
      const hips=humanoid.getNormalizedBoneNode("hips").getWorldPosition(new T.Vector3());
      if(selection.crop==="head"){center.copy(head).add(new T.Vector3(0,.05,0));radius=.25;}
      if(selection.crop==="torso"){center.copy(hips).lerp(head,.55);radius=.39;}
      if(selection.crop==="shoes"){const foot=humanoid.getNormalizedBoneNode("leftFoot").getWorldPosition(new T.Vector3());center.set(0,foot.y+.035,foot.z);radius=.25;}
      if(selection.crop==="grip"){
        const wrist=humanoid.getNormalizedBoneNode("rightHand");
        const knuckle=humanoid.getNormalizedBoneNode("rightMiddleProximal");
        center.copy(wrist.getWorldPosition(new T.Vector3())).lerp(knuckle.getWorldPosition(new T.Vector3()),.85);
        radius=Math.max(.08,selection.metrics.rightHand*1.35);
      }
      if(selection.crop==="hand"){
        const bone=selection.instance?.bone??"rightHand";
        center.copy(humanoid.getNormalizedBoneNode(bone).getWorldPosition(new T.Vector3()));radius=.23;
      }
    }
    const angle=selection.angle*Math.PI/180;const distance=radius/Math.tan(T.MathUtils.degToRad(camera.fov/2))*1.22;
    camera.position.set(center.x+Math.sin(angle)*distance,center.y+distance*.09,center.z+Math.cos(angle)*distance);
    camera.lookAt(center);camera.near=Math.max(.001,radius/100);camera.far=100;camera.updateProjectionMatrix();
    scene.background=new T.Color("#e4e6ea");gl.outputColorSpace=T.SRGBColorSpace;gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=1;
    api.camera={position:camera.position.toArray(),target:center.toArray(),crop:selection.crop};
  },[camera,gl,scene,selection]);
  useFrame(()=>{if(selection)api.frames++;});
  return null;
}

function Subject({selection}) {
  const {token,instance,vrm}=selection;
  const items=React.useMemo(()=>instance?[instance]:[],[instance]);
  const statusRevision=React.useRef(0);
  const status=React.useCallback((uid,id,value)=>{
    if(generation!==token)return;
    const revision=++statusRevision.current;
    if(!instance||value!=="ready"){api.status=value;return;}
    api.status="loading";
    // 렌더용 소품이 본을 추종한 뒤에도 팔·손가락의 실제 맞춤은 여러 프레임에 걸쳐 진행될 수 있다.
    Promise.resolve().then(()=>R.waitForStudioVrmGripSettlement(vrm)).then(()=>{
      if(generation===token&&statusRevision.current===revision)api.status="ready";
    }).catch(error=>{
      if(generation!==token||statusRevision.current!==revision)return;
      api.errors.push(String(error));api.status="unavailable";
    });
  },[token,instance,vrm]);
  const receipt=React.useCallback((slot,value)=>{if(generation===token)api.receipt=value;},[token]);
  React.useEffect(()=>{if(selection.type==="asset"||selection.type==="native")api.status="ready";},[selection]);
  const children=[h("primitive",{key:"model",object:selection.vrm?.scene??selection.object,dispose:null})];
  if(selection.type==="wardrobe")children.push(h(R.StudioVrmWardrobeAttachment,{key:`garment-${token}`,vrm:selection.vrm,slot:selection.slot,equip:selection.equip,metrics:selection.wardrobeMetrics,effectiveFit:selection.effectiveFit,onSurfaceReceipt:receipt,onAttachmentStatus:status}));
  if(selection.type==="prop")children.push(h("group",{key:`prop-${token}`,ref:reviewPropGroup},
    h(R.StudioVrmPropAttachment,{vrm:selection.vrm,instance:selection.instance,metrics:selection.metrics,onAttachmentStatus:status})));
  if(instance)children.push(h(R.StudioVrmGripContactRefine,{key:`grip-${token}`,vrm,items,metrics:selection.metrics,idleGripPoseId:selection.idlePoseId}));
  if(selection.vrm)children.push(h(R.StudioVrmRuntimeCommit,{key:"commit",vrm:selection.vrm,physicsPreview:false,webcamActive:false}));
  children.push(h(Camera,{key:"camera",selection}));
  return h(React.Fragment,null,...children);
}
function App(){
  const [selection,setSelection]=React.useState(null);
  React.useLayoutEffect(()=>{selectState=setSelection;api.status="idle";return()=>{selectState=null;};},[]);
  return h(Canvas,{dpr:1,camera:{fov:35,position:[0,1,3]},gl:{antialias:true,preserveDrawingBuffer:true},style:{width:"100vw",height:"100vh"}},
    h("hemisphereLight",{args:["#ffffff","#747b85",1.5]}),
    h("directionalLight",{position:[2,4,4],intensity:2.1}),
    h("directionalLight",{position:[-3,2,-3],intensity:1.4}),
    selection?h(Subject,{key:selection.token,selection}):null);
}
root.render(h(App));
