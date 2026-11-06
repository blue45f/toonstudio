// character-lab 손상 스켈레톤·비유한 입력 픽스처, 공식 패키지 GLB 카탈로그 빌더, 실브라우저 Direct API 평가기 및 게이트 판정기.
import { createHash } from "node:crypto";

const SLOT_KINDS = [
  "face-shape", "eyes", "irises", "nose", "mouth", "ears", "hair", "body",
  "top", "bottom", "shoes", "accessory", "expression", "pose", "hand-pose",
];

const BASE_HUMANOID_SPEC = [
  ["hips", "Hips_Mapped", null, [0, 0.9, 0]],
  ["spine", "Spine_Mapped", "Hips_Mapped", [0, 0.12, 0]],
  ["chest", "Chest_Mapped", "Spine_Mapped", [0, 0.14, 0]],
  ["upperChest", "UpperChest_Mapped", "Chest_Mapped", [0, 0.1, 0]],
  ["neck", "Neck_Mapped", "UpperChest_Mapped", [0, 0.12, 0]],
  ["head", "Head_Mapped", "Neck_Mapped", [0, 0.1, 0]],
  ["leftShoulder", "LeftShoulder_Mapped", "UpperChest_Mapped", [-0.06, 0.08, 0]],
  ["leftUpperArm", "LeftUpperArm_Mapped", "LeftShoulder_Mapped", [-0.1, 0, 0]],
  ["leftLowerArm", "LeftLowerArm_Mapped", "LeftUpperArm_Mapped", [-0.24, 0, 0]],
  ["leftHand", "LeftHand_Mapped", "LeftLowerArm_Mapped", [-0.22, 0, 0]],
  ["rightShoulder", "RightShoulder_Mapped", "UpperChest_Mapped", [0.06, 0.08, 0]],
  ["rightUpperArm", "RightUpperArm_Mapped", "RightShoulder_Mapped", [0.1, 0, 0]],
  ["rightLowerArm", "RightLowerArm_Mapped", "RightUpperArm_Mapped", [0.24, 0, 0]],
  ["rightHand", "RightHand_Mapped", "RightLowerArm_Mapped", [0.22, 0, 0]],
  ["leftUpperLeg", "LeftUpperLeg_Mapped", "Hips_Mapped", [-0.1, -0.05, 0]],
  ["leftLowerLeg", "LeftLowerLeg_Mapped", "LeftUpperLeg_Mapped", [0, -0.42, 0]],
  ["leftFoot", "LeftFoot_Mapped", "LeftLowerLeg_Mapped", [0, -0.4, 0.04]],
  ["rightUpperLeg", "RightUpperLeg_Mapped", "Hips_Mapped", [0.1, -0.05, 0]],
  ["rightLowerLeg", "RightLowerLeg_Mapped", "RightUpperLeg_Mapped", [0, -0.42, 0]],
  ["rightFoot", "RightFoot_Mapped", "RightLowerLeg_Mapped", [0, -0.4, 0.04]],
].map(([vrm, node, parent, t]) => ({ vrm, node, parent, t }));

const Q_ID = [0, 0, 0, 1];
const mkBone = (name, parent, restTranslation, restRotation = Q_ID, auxiliary = false) =>
  auxiliary ? { name, parent, restTranslation, restRotation, auxiliary: true } : { name, parent, restTranslation, restRotation };

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function padBuffer(buf, padByte) {
  const rem = buf.byteLength % 4;
  return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem, padByte)]);
}

/** 결정론적 합성 스켈레톤 및 기형 입력 픽스처 라이브러리를 생성한다. */
export function createCorruptedSkeletonFixtures() {
  const nanRestSkeleton = { bones: [mkBone("hips", null, [0, 0.9, 0]), mkBone("spine", "hips", [Number.NaN, 0.2, 0]), mkBone("head", "spine", [0, 0.3, 0])] };
  const infRestSkeleton = { bones: [mkBone("hips", null, [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0]), mkBone("spine", "hips", [0, 0.2, 0])] };
  const parentCycleHumanoidSkeleton = { bones: [mkBone("hips", "spine", [0, 0.9, 0]), mkBone("spine", "hips", [0, 0.2, 0])] };
  const parentCycleSelfSkeleton = { bones: [mkBone("hips", "hips", [0, 0.9, 0])] };
  const parentCycleAuxSkeleton = {
    bones: [mkBone("hips", null, [0, 0.9, 0]), mkBone("aux_1", "aux_2", [0, 0.1, 0], Q_ID, true), mkBone("aux_2", "aux_1", [0, 0.1, 0], Q_ID, true), mkBone("spine", "aux_1", [0, 0.2, 0])],
  };
  const malformedShapeFixtures = {
    nullBones: { bones: null },
    shortRestTranslation: { bones: [mkBone("hips", null, [0, 1])] },
    invalidParentType: { bones: [mkBone("hips", 123, [0, 0.9, 0])] },
    nonFiniteRestRotation: { bones: [mkBone("hips", null, [0, 0.9, 0], [Number.NaN, 0, 0, 1])] },
    duplicateBoneMaskingCycle: { bones: [mkBone("hips", "spine", [0, 0, 0]), mkBone("spine", "hips", [0, 0.2, 0]), mkBone("hips", null, [0, 0.9, 0])] },
  };
  const normalEmptySkeleton = { bones: [] };
  const validHumanoidSkeleton = {
    bones: BASE_HUMANOID_SPEC.map((e) => mkBone(e.vrm, e.parent ? (BASE_HUMANOID_SPEC.find((b) => b.node === e.parent)?.vrm ?? null) : null, [...e.t])),
  };
  const cases = [
    { id: "nan-rest", category: "non-finite-rest", expectedCode: "skeleton-non-finite-rest", skeleton: nanRestSkeleton },
    { id: "inf-rest", category: "non-finite-rest", expectedCode: "skeleton-non-finite-rest", skeleton: infRestSkeleton },
    { id: "parent-cycle-humanoid", category: "parent-cycle", expectedCode: "skeleton-cycle", skeleton: parentCycleHumanoidSkeleton },
    { id: "parent-cycle-self", category: "parent-cycle", expectedCode: "skeleton-cycle", skeleton: parentCycleSelfSkeleton },
    { id: "parent-cycle-aux", category: "parent-cycle", expectedCode: "skeleton-cycle", skeleton: parentCycleAuxSkeleton },
    { id: "malformed-null-bones", category: "malformed-shape", expectedCode: "skeleton-invalid-input", skeleton: malformedShapeFixtures.nullBones },
    { id: "malformed-short-rest-translation", category: "malformed-shape", expectedCode: "skeleton-invalid-input", skeleton: malformedShapeFixtures.shortRestTranslation },
    { id: "malformed-invalid-parent-type", category: "malformed-shape", expectedCode: "skeleton-invalid-input", skeleton: malformedShapeFixtures.invalidParentType },
    { id: "malformed-non-finite-rest-rotation", category: "malformed-shape", expectedCode: "skeleton-invalid-input", skeleton: malformedShapeFixtures.nonFiniteRestRotation },
    { id: "malformed-duplicate-bone-masking-cycle", category: "malformed-shape", expectedCode: "skeleton-invalid-input", skeleton: malformedShapeFixtures.duplicateBoneMaskingCycle },
  ];
  return {
    nanRestSkeleton, infRestSkeleton, parentCycleHumanoidSkeleton, parentCycleSelfSkeleton,
    parentCycleAuxSkeleton, malformedShapeFixtures, normalEmptySkeleton, validHumanoidSkeleton, cases,
  };
}

/** Babylon glTF 2.0 로더가 파싱·마운트하는 유효한 최소 바이너리 GLB를 조립한다. */
export function buildSyntheticRigGlb({ skinned = true, extraJointNodes = [], rootRotationByNode = {} } = {}) {
  const positions = new Float32Array([-0.18, 0.0, 0.0, 0.18, 0.0, 0.0, 0.18, 1.65, 0.0, -0.18, 1.65, 0.0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 0, 0]);
  const jointSpecs = skinned
    ? [...BASE_HUMANOID_SPEC.map((e) => ({ name: e.node, parentName: e.parent, translation: e.t, rotation: rootRotationByNode[e.node] ?? Q_ID })), ...extraJointNodes]
    : [];
  const jointCount = jointSpecs.length;
  const joints0 = new Uint16Array(16);
  const weights0 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  const ibm = new Float32Array(Math.max(1, jointCount) * 16);
  for (let i = 0; i < Math.max(1, jointCount); i += 1) {
    ibm[i * 16] = 1;
    ibm[i * 16 + 5] = 1;
    ibm[i * 16 + 10] = 1;
    ibm[i * 16 + 15] = 1;
  }

  const rawChunks = [positions, normals, indices, ...(skinned ? [joints0, weights0, ibm] : [])].map((arr) => Buffer.from(arr.buffer));
  const binChunk = padBuffer(Buffer.concat(rawChunks), 0x00);
  let byteOffset = 0;
  const nextView = (byteLength, target) => {
    const view = { buffer: 0, byteOffset, byteLength, ...(target ? { target } : {}) };
    byteOffset += byteLength;
    return view;
  };
  const bufferViews = [nextView(positions.byteLength, 34962), nextView(normals.byteLength, 34962), nextView(12, 34963)];
  byteOffset += 4;
  if (skinned) bufferViews.push(nextView(joints0.byteLength, 34962), nextView(weights0.byteLength, 34962), nextView(ibm.byteLength));

  const accessors = [
    { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [-0.18, 0.0, 0.0], max: [0.18, 1.65, 0.0] },
    { bufferView: 1, componentType: 5126, count: 4, type: "VEC3" },
    { bufferView: 2, componentType: 5123, count: 6, type: "SCALAR" },
    ...(skinned
      ? [
          { bufferView: 3, componentType: 5123, count: 4, type: "VEC4" },
          { bufferView: 4, componentType: 5126, count: 4, type: "VEC4" },
          { bufferView: 5, componentType: 5126, count: jointCount, type: "MAT4" },
        ]
      : []),
  ];

  const nodes = [{ name: "Avatar_Orion_Body", mesh: 0, ...(skinned ? { skin: 0 } : {}) }];
  const firstIndexByName = new Map();
  jointSpecs.forEach((spec, i) => {
    const nodeIdx = i + 1;
    if (!firstIndexByName.has(spec.name)) firstIndexByName.set(spec.name, nodeIdx);
    nodes.push({ name: spec.name, translation: spec.translation, rotation: spec.rotation ?? Q_ID });
  });

  const rootNodeIndices = [0];
  jointSpecs.forEach((spec, i) => {
    const nodeIdx = i + 1;
    const parentIdx = spec.parentIndex !== undefined ? spec.parentIndex : spec.parentName ? firstIndexByName.get(spec.parentName) : null;
    if (parentIdx !== null && parentIdx !== undefined) {
      nodes[parentIdx].children = nodes[parentIdx].children ?? [];
      nodes[parentIdx].children.push(nodeIdx);
    } else {
      rootNodeIndices.push(nodeIdx);
    }
  });

  const gltf = {
    asset: { version: "2.0", generator: "toonstudio-corrupted-skeleton-fixtures" },
    scene: 0,
    scenes: [{ name: "Scene", nodes: rootNodeIndices }],
    nodes,
    meshes: [{ name: "Avatar_Orion_Body", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, ...(skinned ? { JOINTS_0: 3, WEIGHTS_0: 4 } : {}) }, indices: 2, material: 0 }] }],
    materials: [{ name: "BodyMat", pbrMetallicRoughness: { baseColorFactor: [0.85, 0.82, 0.78, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    ...(skinned ? { skins: [{ name: "Armature", inverseBindMatrices: 5, joints: jointSpecs.map((_, idx) => idx + 1) }] } : {}),
    buffers: [{ byteLength: binChunk.byteLength }],
    bufferViews,
    accessors,
  };

  const jsonChunk = padBuffer(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonChunk.byteLength + binChunk.byteLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.byteLength, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.byteLength, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return { glbBytes: new Uint8Array(Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk])), jointNames: jointSpecs.map((s) => s.name) };
}

function buildPackageEntry(characterId, displayName, baseUrl, glbSpec) {
  const { glbBytes, jointNames } = buildSyntheticRigGlb(glbSpec);
  const glbSha256 = sha256Hex(glbBytes);
  const capabilities = Object.fromEntries(
    SLOT_KINDS.map((slot) => [
      slot,
      { status: slot === "pose" && !glbSpec.skinned ? "unavailable" : "available", ...(slot === "pose" && !glbSpec.skinned ? { reasonKo: "스켈레톤이 없는 정적 메시입니다." } : {}) },
    ]),
  );
  const slotMapping = {
    schema: "toonstudio.character-lab.slot-mapping/1",
    characterId,
    capabilities,
    slots: SLOT_KINDS.map((slot) => ({ slot, status: capabilities[slot].status, mechanism: glbSpec.skinned ? "humanoid-rig" : "static-mesh" })),
  };
  const slotMappingBytes = Buffer.from(JSON.stringify(slotMapping), "utf8");
  const slotMappingSha256 = sha256Hex(slotMappingBytes);
  const manifest = {
    schema: "toonstudio.character-lab.authored-character/1",
    id: characterId,
    displayName,
    role: "probe-fixture",
    license: "CC0-1.0",
    generatedAt: "2026-11-06T00:00:00.000Z",
    generator: { pipeline: "corrupted-skeleton-fixtures pipelineVersion 1" },
    pipelineRun: { pipelineManifestConfigDigest: glbSha256.slice(0, 16), toonstudioPackageKind: "probe-fixture" },
    files: {
      glb: { path: `${characterId}.glb`, bytes: glbBytes.byteLength, sha256: glbSha256 },
      slotMapping: { path: "slot-mapping.json", bytes: slotMappingBytes.byteLength, sha256: slotMappingSha256 },
    },
    skeleton: {
      present: Boolean(glbSpec.skinned),
      rootNode: glbSpec.skinned ? "Hips_Mapped" : null,
      skins: glbSpec.skinned ? [{ name: "Armature", jointCount: jointNames.length, joints: jointNames }] : [],
      boneNaming: "custom",
    },
    humanoidBones: glbSpec.skinned ? BASE_HUMANOID_SPEC.map((e) => ({ vrm: e.vrm, node: e.node, presentInGlb: true })) : [],
    shapeKeys: [],
    partMeshes: [{ node: "Avatar_Orion_Body", part: "body", skinned: Boolean(glbSpec.skinned), triangles: 2 }],
    quality: { score: 96, passed: true, minimumScore: 70, issues: [] },
    gaps: [],
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
  const packageBaseUrl = `${baseUrl.replace(/\/+$/u, "")}/${characterId}`;
  return {
    characterId, id: characterId, displayName, baseUrl: packageBaseUrl, manifest, manifestJson: manifest,
    manifestBytes: new Uint8Array(manifestBytes), manifestSha256: sha256Hex(manifestBytes),
    slotMapping, slotMappingJson: slotMapping, slotMappingBytes: new Uint8Array(slotMappingBytes), slotMappingSha256,
    glbBytes, glbSha256,
    indexEntry: {
      id: characterId, characterId, displayName, baseUrl: packageBaseUrl,
      manifestPath: `${characterId}/manifest.json`, glbPath: `${characterId}/${characterId}.glb`,
      license: "CC0-1.0", quality: { score: 96, passed: true, minimumScore: 70 },
    },
  };
}

/** 공식 PackagePanel이 로드할 수 있는 4종의 합성 제작 패키지 카탈로그를 생성한다. */
export function buildOfficialFixturePackageCatalog(baseUrl = "/assets/characters/") {
  const cleanRoot = baseUrl.replace(/\/+$/u, "") || "/assets/characters";
  const baseJointCount = BASE_HUMANOID_SPEC.length;
  const maxD = 1.7976931348623157e308;
  const pkgDefs = [
    buildPackageEntry("valid-humanoid-rig", "정상 휴머노이드 리그 (복구 검증)", cleanRoot, { skinned: true }),
    buildPackageEntry("normal-empty-rig", "정상 빈 스켈레톤 정적 메시", cleanRoot, { skinned: false }),
    buildPackageEntry("corrupt-cycle-rig", "손상 부모 순환 스켈레톤 (hips <-> spine)", cleanRoot, {
      skinned: true,
      extraJointNodes: [
        { name: "spine", parentIndex: null, translation: [0, 0.9, 0], rotation: Q_ID },
        { name: "Hips_Mapped", parentIndex: baseJointCount + 1, translation: [0, 0.1, 0], rotation: Q_ID },
      ],
    }),
    buildPackageEntry("corrupt-nan-rest-rig", "손상 비유한 restTranslation 스켈레톤 (NaN)", cleanRoot, {
      skinned: true,
      extraJointNodes: [
        { name: "Nan_Root", parentIndex: null, translation: [maxD, maxD, maxD], rotation: Q_ID },
        { name: "Hips_Mapped", parentIndex: baseJointCount + 1, translation: [maxD, maxD, maxD], rotation: Q_ID },
      ],
    }),
  ];

  const indexJson = { schema: "toonstudio.character-lab.authored-character-index/1", generatedAt: "2026-11-06T00:00:00.000Z", characters: pkgDefs.map((p) => p.indexEntry) };
  const packages = {};
  const routes = { [`${cleanRoot}/index.json`]: { status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(indexJson) } };
  for (const pkg of pkgDefs) {
    packages[pkg.characterId] = pkg;
    routes[`${cleanRoot}/${pkg.characterId}/manifest.json`] = { status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(pkg.manifest) };
    routes[`${cleanRoot}/${pkg.characterId}/slot-mapping.json`] = { status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(pkg.slotMapping) };
    routes[`${cleanRoot}/${pkg.characterId}/${pkg.characterId}.glb`] = { status: 200, contentType: "model/gltf-binary", body: Buffer.from(pkg.glbBytes) };
  }
  return {
    baseUrl: `${cleanRoot}/`, indexJson, packages, packageList: pkgDefs, routes, byPath: new Map(Object.entries(routes)),
    resolveRoute(pathname) { return routes[pathname.replace(/^\/+/u, "/")] ?? null; },
  };
}

/** Chromium page.evaluate(runBrowserDirectApiProbe) 또는 Node/Vitest에서 실행 가능한 자기 완결형 Direct API 프로브. */
export async function runBrowserDirectApiProbe(arg = {}) {
  const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  const importMod = async (vitePath) => {
    if (typeof arg?.loadModule === "function") return await arg.loadModule(vitePath);
    return await import(isBrowser ? vitePath : vitePath.replace(/^\/src\//u, "../src/"));
  };
  const [guardMod, gizmoMod, cpMod, interMod, refSkelMod, storeMod, contractsMod, recipeFixturesMod] = await Promise.all([
    importMod("/src/app/shell/panels/skeleton-boundary-guard.ts"),
    importMod("/src/app/shell/panels/shaper-bone-gizmo.ts"),
    importMod("/src/app/shell/panels/shaper-control-points.ts"),
    importMod("/src/app/shell/panels/viewport-interactions.ts"),
    importMod("/src/animation/reference-skeleton.ts"),
    importMod("/src/state/lab-store.ts"),
    importMod("/src/contracts/index.ts"),
    importMod("/src/testing/recipe-fixtures.ts"),
  ]);

  const qId = [0, 0, 0, 1];
  const bone = (name, parent, restTranslation, restRotation = qId, auxiliary = false) =>
    auxiliary ? { name, parent, restTranslation, restRotation, auxiliary: true } : { name, parent, restTranslation, restRotation };
  const camera = { position: [0, 1.1, 2.6], forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], fovY: Math.PI / 4, width: 800, height: 600 };
  const validHandles = [
    { bone: "hips", screen: [400, 320], world: [0, 0.9, 0] },
    { bone: "spine", screen: [400, 280], world: [0, 1.1, 0] },
    { bone: "head", screen: [400, 180], world: [0, 1.5, 0] },
  ];
  const validPivot = { pivotBone: "leftUpperArm", pivotWorld: [-0.2, 1.35, 0] };
  const presetCatalog = contractsMod.createPresetCatalog(recipeFixturesMod.vocabularyCatalogEntries());
  const makeStore = () =>
    storeMod.createLabStore({
      catalog: presetCatalog,
      initial: contractsMod.createInitialLabState(contractsMod.createDefaultRecipe(), contractsMod.ALL_AVAILABLE_CAPABILITIES),
    });

  const canonicalFixtures = [
    ["nan-rest", "non-finite-rest", "skeleton-non-finite-rest", { bones: [bone("hips", null, [0, 0.9, 0]), bone("spine", "hips", [Number.NaN, 0.2, 0]), bone("head", "spine", [0, 0.3, 0])] }],
    ["inf-rest", "non-finite-rest", "skeleton-non-finite-rest", { bones: [bone("hips", null, [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0]), bone("spine", "hips", [0, 0.2, 0])] }],
    ["parent-cycle-humanoid", "parent-cycle", "skeleton-cycle", { bones: [bone("hips", "spine", [0, 0.9, 0]), bone("spine", "hips", [0, 0.2, 0])] }],
    ["parent-cycle-self", "parent-cycle", "skeleton-cycle", { bones: [bone("hips", "hips", [0, 0.9, 0])] }],
    ["parent-cycle-aux", "parent-cycle", "skeleton-cycle", { bones: [bone("hips", null, [0, 0.9, 0]), bone("aux_1", "aux_2", [0, 0.1, 0], qId, true), bone("aux_2", "aux_1", [0, 0.1, 0], qId, true), bone("spine", "aux_1", [0, 0.2, 0])] }],
    ["malformed-null-bones", "malformed-shape", "skeleton-invalid-input", { bones: null }],
    ["malformed-short-rest-translation", "malformed-shape", "skeleton-invalid-input", { bones: [bone("hips", null, [0, 1])] }],
    ["malformed-invalid-parent-type", "malformed-shape", "skeleton-invalid-input", { bones: [bone("hips", 123, [0, 0.9, 0])] }],
    ["malformed-non-finite-rest-rotation", "malformed-shape", "skeleton-invalid-input", { bones: [bone("hips", null, [0, 0.9, 0], [Number.NaN, 0, 0, 1])] }],
    ["malformed-duplicate-bone-masking-cycle", "malformed-shape", "skeleton-invalid-input", { bones: [bone("hips", "spine", [0, 0, 0]), bone("spine", "hips", [0, 0.2, 0]), bone("hips", null, [0, 0.9, 0])] }],
  ].map(([id, category, expectedCode, skeleton]) => ({ id, category, expectedCode, skeleton }));

  const runGuardedCalls = (skeleton) => {
    const diag = guardMod.diagnoseSkeletonData(skeleton);
    const fkF = [];
    const fkOut = guardMod.safeComputeWorldTransforms(skeleton, {}, { onFailure: (f) => fkF.push(f) });
    const pmF = [];
    const pmOut = gizmoMod.resolveDragPivotWithMode(skeleton, {}, "spine", "direct", { onFailure: (f) => pmF.push(f) });
    const lkF = [];
    const lkOut = gizmoMod.computeVisibleBoneLinks(validHandles, skeleton, { onFailure: (f) => lkF.push(f) });
    const cpF = [];
    const cpOut = cpMod.computeShaperControlPoints(skeleton, {}, camera, { onFailure: (f) => cpF.push(f) });
    const ikF = [];
    const ikOut = cpMod.computeShaperIkHandleDrag({
      skeleton, startPose: {}, handleBone: "head", camera, startPixel: [400, 180], currentPixel: [425, 165],
      symmetryEnabled: false, pivotMode: "direct", onFailure: (f) => ikF.push(f),
    });
    const pvF = [];
    const pvOut = interMod.resolveDragPivot(skeleton, {}, "head", { onFailure: (f) => pvF.push(f) });
    const jdF = [];
    const jdOut = interMod.computeJointDrag({
      skeleton, startPose: {}, pivot: { pivotBone: "spine", pivotWorld: [0, 1.0, 0] },
      camera, startPixel: [400, 280], currentPixel: [435, 250], onFailure: (f) => jdF.push(f),
    });
    return {
      diag,
      calls: [
        { api: "safeComputeWorldTransforms", ok: !fkOut.ok, count: fkF.length, code: fkF[0]?.code ?? null },
        { api: "resolveDragPivotWithMode", ok: pmOut === null, count: pmF.length, code: pmF[0]?.code ?? null },
        { api: "computeVisibleBoneLinks", ok: Array.isArray(lkOut) && lkOut.every((s) => Number.isFinite(s.x1) && Number.isFinite(s.y1)), count: lkF.length, code: lkF[0]?.code ?? null },
        { api: "computeShaperControlPoints", ok: Array.isArray(cpOut) && cpOut.length === 0, count: cpF.length, code: cpF[0]?.code ?? null },
        { api: "computeShaperIkHandleDrag", ok: ikOut === null, count: ikF.length, code: ikF[0]?.code ?? null },
        { api: "resolveDragPivot", ok: pvOut === null, count: pvF.length, code: pvF[0]?.code ?? null },
        { api: "computeJointDrag", ok: jdOut === null, count: jdF.length, code: jdF[0]?.code ?? null },
      ],
    };
  };

  const caseResults = canonicalFixtures.map((entry) => {
    const res = runGuardedCalls(entry.skeleton);
    const diagMatched = res.diag?.code === entry.expectedCode && typeof res.diag?.reasonKo === "string" && res.diag.reasonKo.length > 0;
    const allCallsMatched = res.calls.every((c) => c.ok && c.count === 1 && c.code === entry.expectedCode);
    return {
      id: entry.id, category: entry.category, expectedCode: entry.expectedCode, observedCode: res.diag?.code ?? null,
      reasonKo: res.diag?.reasonKo ?? null, callCount: res.calls.length,
      everyCallbackFiredOnce: res.calls.every((c) => c.count === 1), calls: res.calls, passed: diagMatched && allCallsMatched,
    };
  });

  const symBasePose = { leftUpperArm: [0, 0, 0, 1] };
  const symOut = gizmoMod.applySymmetryToPose(symBasePose, "leftUpperArm", [Number.NaN, 0, 0, 1], true);
  const validSkeleton = refSkelMod.createReferenceSkeleton();
  const validCps = cpMod.computeShaperControlPoints(validSkeleton, {}, camera);
  const defaultRecipe = contractsMod.createDefaultRecipe();
  const cpDragOut = cpMod.computeShaperControlPointDrag({
    controlPoint: validCps[0], startPixel: [Number.NaN, 200], currentPixel: [420, 210],
    renderWidth: 800, renderHeight: 600, baseFace: defaultRecipe.face, baseBody: defaultRecipe.body,
  });
  const scaleDragOut = cpMod.computeShaperBoneScaleDrag({
    handleBone: "head", startPixel: [400, 180], currentPixel: [Number.POSITIVE_INFINITY, 180],
    renderWidth: 800, renderHeight: 600, baseBody: defaultRecipe.body,
  });
  const ikPixelFailures = [];
  const ikPixelOut = cpMod.computeShaperIkHandleDrag({
    skeleton: validSkeleton, startPose: {}, handleBone: "leftHand", camera,
    startPixel: [Number.NaN, 180], currentPixel: [420, 180], onFailure: (f) => ikPixelFailures.push(f),
  });
  const jointPixelFailures = [];
  const jointPixelOut = interMod.computeJointDrag({
    skeleton: validSkeleton, startPose: {}, pivot: validPivot, camera,
    startPixel: [400, Number.NEGATIVE_INFINITY], currentPixel: [420, 200], onFailure: (f) => jointPixelFailures.push(f),
  });

  const nonFiniteDirectGuards = {
    applySymmetryToPose: JSON.stringify(symOut) === JSON.stringify(symBasePose) && !("rightUpperArm" in symOut),
    computeShaperControlPointDrag: cpDragOut.changes.length === 0,
    computeShaperBoneScaleDrag: Number.isFinite(scaleDragOut.value) && scaleDragOut.value === 0,
    computeShaperIkHandleDragPixelGuard: ikPixelOut === null && ikPixelFailures.length === 1 && ikPixelFailures[0]?.code === "skeleton-invalid-input",
    computeJointDragPixelGuard: jointPixelOut === null && jointPixelFailures.length === 1 && jointPixelFailures[0]?.code === "skeleton-invalid-input",
  };
  nonFiniteDirectGuards.passed = Object.values(nonFiniteDirectGuards).every(Boolean);

  const emptyFailures = [];
  const emptySkel = { bones: [] };
  const emptyDiag = guardMod.diagnoseSkeletonData(emptySkel);
  const emptyFk = guardMod.safeComputeWorldTransforms(emptySkel, {}, { onFailure: (f) => emptyFailures.push(f) });
  const emptyLinks = gizmoMod.computeVisibleBoneLinks([], emptySkel, { onFailure: (f) => emptyFailures.push(f) });
  const emptyCps = cpMod.computeShaperControlPoints(emptySkel, {}, camera, { onFailure: (f) => emptyFailures.push(f) });
  const emptyPivot = interMod.resolveDragPivot(emptySkel, {}, "head", { onFailure: (f) => emptyFailures.push(f) });
  const normalEmpty = {
    id: "normal-empty", diagnoseResult: emptyDiag, fkOk: emptyFk.ok, transformCount: emptyFk.ok ? emptyFk.transforms.size : -1,
    linkCount: emptyLinks.length, controlPointCount: emptyCps.length, pivotResult: emptyPivot, failureCount: emptyFailures.length,
    passed: emptyDiag === null && emptyFk.ok && emptyFk.transforms.size === 0 && emptyLinks.length === 0 && emptyCps.length === 0 && emptyPivot === null && emptyFailures.length === 0,
  };

  const bugFailures = [];
  const throwingPose = {};
  Object.defineProperty(throwingPose, "hips", { enumerable: true, get() { throw new TypeError("unexpected-programming-bug"); } });
  let rethrew = false;
  let thrownName = null;
  let thrownMessage = null;
  try {
    interMod.computeJointDrag({
      skeleton: validSkeleton, startPose: throwingPose, pivot: validPivot,
      camera, startPixel: [360, 240], currentPixel: [410, 210], onFailure: (f) => bugFailures.push(f),
    });
  } catch (error) {
    rethrew = error instanceof TypeError;
    thrownName = error?.name ?? null;
    thrownMessage = error?.message ?? null;
  }
  const unexpectedProgrammingError = {
    id: "unexpected-programming-error", rethrew, thrownName, thrownMessage, failureCount: bugFailures.length,
    passed: rethrew && thrownMessage === "unexpected-programming-bug" && bugFailures.length === 0,
  };

  const store = makeStore();
  store.dispatch({ type: "slot/apply", slot: "hair", presetId: "hair/twin-tail" });
  const baselineDragOut = interMod.computeJointDrag({
    skeleton: validSkeleton, startPose: store.getState().recipe.pose, pivot: validPivot, camera, startPixel: [350, 250], currentPixel: [410, 215],
  });
  store.dispatch({ type: "pose/set", pose: baselineDragOut.pose, scope: "full", labelKo: "기준선 포즈" });
  const poseBeforeCorrupt = JSON.stringify(store.getState().recipe.pose);
  const slotBeforeCorrupt = store.getState().recipe.slots.hair;
  const undoDepthBeforeCorrupt = store.getState().history.depth;

  for (const fixture of canonicalFixtures) {
    const failedFailures = [];
    const failedDrag = interMod.computeJointDrag({
      skeleton: fixture.skeleton, startPose: store.getState().recipe.pose, pivot: { pivotBone: "spine", pivotWorld: [0, 1.0, 0] },
      camera, startPixel: [400, 280], currentPixel: [450, 240], onFailure: (f) => failedFailures.push(f),
    });
    if (failedDrag) store.dispatch({ type: "pose/set", pose: failedDrag.pose, scope: "full", labelKo: "오염된 포즈" });
    for (const f of failedFailures) store.applyEvent({ type: "failure", failure: f });
  }

  const poseAfterCorrupt = JSON.stringify(store.getState().recipe.pose);
  const slotAfterCorrupt = store.getState().recipe.slots.hair;
  const undoDepthAfterCorrupt = store.getState().history.depth;
  const postedFailureCount = store.getState().failures.length;

  const recoveryDragOut = interMod.computeJointDrag({
    skeleton: validSkeleton, startPose: store.getState().recipe.pose, pivot: { pivotBone: "rightUpperArm", pivotWorld: [0.2, 1.35, 0] },
    camera, startPixel: [450, 250], currentPixel: [390, 210],
  });
  if (recoveryDragOut) store.dispatch({ type: "pose/set", pose: recoveryDragOut.pose, scope: "full", labelKo: "복구 드래그" });
  const undoDepthAfterRecovery = store.getState().history.depth;
  const poseAfterRecovery = JSON.stringify(store.getState().recipe.pose);

  store.dispatch({ type: "history/undo" });
  const poseAfterUndo = JSON.stringify(store.getState().recipe.pose);
  const undoDepthAfterUndo = store.getState().history.depth;

  store.dispatch({ type: "history/redo" });
  const poseAfterRedo = JSON.stringify(store.getState().recipe.pose);
  const undoDepthAfterRedo = store.getState().history.depth;

  const atomicityAndRecovery = {
    posePreserved: poseBeforeCorrupt === poseAfterCorrupt,
    selectionPreserved: slotBeforeCorrupt === slotAfterCorrupt && slotAfterCorrupt === "hair/twin-tail",
    historyDepthPreserved: undoDepthBeforeCorrupt === undoDepthAfterCorrupt,
    postedFailureCount,
    recoverySucceeded: Boolean(recoveryDragOut) && undoDepthAfterRecovery === undoDepthBeforeCorrupt + 1 && poseAfterRecovery !== poseBeforeCorrupt,
    undoRedoSucceeded:
      poseAfterUndo === poseBeforeCorrupt && undoDepthAfterUndo === undoDepthBeforeCorrupt &&
      poseAfterRedo === poseAfterRecovery && undoDepthAfterRedo === undoDepthAfterRecovery,
  };
  atomicityAndRecovery.passed =
    atomicityAndRecovery.posePreserved && atomicityAndRecovery.selectionPreserved && atomicityAndRecovery.historyDepthPreserved &&
    atomicityAndRecovery.postedFailureCount === canonicalFixtures.length && atomicityAndRecovery.recoverySucceeded && atomicityAndRecovery.undoRedoSucceeded;

  const passed =
    caseResults.every((c) => c.passed) && nonFiniteDirectGuards.passed &&
    normalEmpty.passed && unexpectedProgrammingError.passed && atomicityAndRecovery.passed;
  return { executionPath: "DIRECT_API_CALL", cases: caseResults, nonFiniteDirectGuards, normalEmpty, unexpectedProgrammingError, atomicityAndRecovery, passed, ok: passed };
}

const REQUIRED_DIRECT_CASE_IDS = [
  "nan-rest", "inf-rest", "parent-cycle-humanoid", "parent-cycle-self", "parent-cycle-aux",
  "malformed-null-bones", "malformed-short-rest-translation", "malformed-invalid-parent-type",
  "malformed-non-finite-rest-rotation", "malformed-duplicate-bone-masking-cycle",
];

/** 프로브 리포트(표준 모드 / --strict-app-defects 모드)를 검증하고 종료 코드(0 또는 1)를 판정한다. */
export function evaluateCorruptedSkeletonProbeReport(report, options = {}) {
  const strictAppDefects = Boolean(options.strictAppDefects ?? report?.strictAppDefects);
  const reasons = [];
  const direct = report?.directApiCall ?? report?.tracks?.trackA?.directApiCall;
  const synthetic = report?.syntheticInjection ?? report?.tracks?.trackA?.syntheticInjection;
  const pointer = report?.realDomPointer ?? report?.tracks?.trackA?.realDomPointer;
  const audit = report?.liveAppCallerDefectAudit ?? report?.tracks?.trackB;

  if (!direct || !direct.passed) reasons.push("Track A DIRECT_API_CALL 검증이 통과하지 못했습니다.");
  const observedCaseMap = new Map((direct?.cases ?? []).map((c) => [c.id, c]));
  for (const reqId of REQUIRED_DIRECT_CASE_IDS) {
    const item = observedCaseMap.get(reqId);
    if (!item || !item.passed || !item.everyCallbackFiredOnce) reasons.push(`DIRECT_API_CALL 필수 케이스 실패 또는 누락: ${reqId}`);
  }
  if (!direct?.nonFiniteDirectGuards?.passed) reasons.push("DIRECT_API_CALL 비유한 회전·픽셀 직접 가드 검증이 실패했습니다.");
  if (!direct?.normalEmpty?.passed || direct?.normalEmpty?.failureCount !== 0) {
    reasons.push("정상 빈 스켈레톤(normal-empty)이 실패로 오분류되었거나 통과하지 못했습니다.");
  }
  if (!direct?.unexpectedProgrammingError?.passed || !direct?.unexpectedProgrammingError?.rethrew || direct?.unexpectedProgrammingError?.failureCount !== 0) {
    reasons.push("예기치 않은 프로그래밍 오류(TypeError)가 다시 던져지지 않고 삼켜졌습니다.");
  }
  if (
    !direct?.atomicityAndRecovery?.passed || !direct?.atomicityAndRecovery?.posePreserved ||
    !direct?.atomicityAndRecovery?.selectionPreserved || !direct?.atomicityAndRecovery?.historyDepthPreserved ||
    !direct?.atomicityAndRecovery?.recoverySucceeded || !direct?.atomicityAndRecovery?.undoRedoSucceeded
  ) {
    reasons.push("손상 입력 드래그 원자성(포즈·선택·히스토리 보존) 또는 즉시 복구·Undo/Redo 검증이 실패했습니다.");
  }
  if (!synthetic?.passed || !synthetic?.normalEmptyRig?.passed || !synthetic?.corruptCycleRig?.passed || !synthetic?.corruptNanRestRig?.passed) {
    reasons.push("Track A SYNTHETIC_INJECTION(공식 PackagePanel 손상·정상 패키지 주입) 검증이 실패했습니다.");
  }
  if (
    !pointer?.passed || !pointer?.baselineProceduralDrag?.depthIncremented ||
    !pointer?.corruptedPointerAttempts?.cycleDepthUnchanged || !pointer?.corruptedPointerAttempts?.nanDepthUnchanged ||
    !pointer?.recoveryValidHumanoidDrag?.passed
  ) {
    reasons.push("Track A REAL_DOM_POINTER(실제 포인터 드래그 원자성 및 복구 후 드래그·실행 취소) 검증이 실패했습니다.");
  }

  const defects = audit?.defects ?? report?.reproducedDefects ?? [];
  if (!audit || audit.officialEntryOnly !== true || !Array.isArray(defects) || defects.length === 0) {
    reasons.push("Track B 라이브 앱 호출부 결함 감사(LIVE_APP_CALLER_DEFECT_AUDIT) 기록이 누락되었습니다.");
  } else {
    for (const defect of defects) {
      if (defect.reproduced && defect.classification !== "REPRODUCED_DEFECT") {
        reasons.push(`재현된 라이브 앱 결함(${defect.id})은 반드시 REPRODUCED_DEFECT로 분류되어야 합니다(현재: ${String(defect.classification)}).`);
      }
    }
  }

  const reproducedDefects = defects.filter((d) => d.reproduced || d.status === "REPRODUCED_DEFECT");
  if (strictAppDefects && reproducedDefects.length > 0) {
    reasons.push(`--strict-app-defects 모드에서 미해결 라이브 앱 호출부 결함 ${reproducedDefects.length}건이 존재합니다: ${reproducedDefects.map((d) => d.id).join(", ")}`);
  }

  const ok = reasons.length === 0;
  return {
    ok, passed: ok, exitCode: ok ? 0 : 1, mode: strictAppDefects ? "strict-app-defects" : "standard",
    reproducedDefectIds: reproducedDefects.map((d) => d.id), reasons,
  };
}

/** 기준선 통과 리포트를 생성하고 6종의 음성 대조군 변이가 모두 exitCode === 1로 거부되는지 검증한다. */
export async function runNegativeControlSuite(options = {}) {
  const evaluate = options.evaluateReport ?? evaluateCorruptedSkeletonProbeReport;
  let directApiCall = options.directApiCall;
  if (!directApiCall) {
    try {
      directApiCall = await runBrowserDirectApiProbe();
    } catch {
      directApiCall = {
        executionPath: "DIRECT_API_CALL",
        cases: REQUIRED_DIRECT_CASE_IDS.map((id) => ({ id, passed: true, everyCallbackFiredOnce: true, callCount: 7 })),
        nonFiniteDirectGuards: { passed: true },
        normalEmpty: { id: "normal-empty", failureCount: 0, passed: true },
        unexpectedProgrammingError: { id: "unexpected-programming-error", rethrew: true, failureCount: 0, passed: true },
        atomicityAndRecovery: {
          posePreserved: true,
          selectionPreserved: true,
          historyDepthPreserved: true,
          postedFailureCount: REQUIRED_DIRECT_CASE_IDS.length,
          recoverySucceeded: true,
          undoRedoSucceeded: true,
          passed: true,
        },
        passed: true,
        ok: true,
      };
    }
  }
  const baselineReport = {
    schema: "character-lab-corrupted-skeleton-probe/v1",
    strictAppDefects: false,
    directApiCall,
    syntheticInjection: {
      executionPath: "SYNTHETIC_INJECTION",
      normalEmptyRig: { characterId: "normal-empty-rig", handleCount: 0, noticeShown: true, pageErrorCount: 0, passed: true },
      corruptCycleRig: { characterId: "corrupt-cycle-rig", controlPointCount: 0, viewportPageErrorCount: 0, atomicityPreserved: true, passed: true },
      corruptNanRestRig: { characterId: "corrupt-nan-rest-rig", controlPointCount: 0, viewportPageErrorCount: 0, atomicityPreserved: true, passed: true },
      passed: true,
    },
    realDomPointer: {
      executionPath: "REAL_DOM_POINTER",
      baselineProceduralDrag: { depthIncremented: true },
      corruptedPointerAttempts: { cycleDepthUnchanged: true, nanDepthUnchanged: true },
      recoveryValidHumanoidDrag: { handlesFinite: true, controlPointCount: 13, controlPointsFinite: true, dragIncremented: true, undoRestored: true, pageErrorCount: 0, passed: true },
      passed: true,
    },
    liveAppCallerDefectAudit: {
      track: "LIVE_APP_CALLER_DEFECT_AUDIT",
      officialEntryOnly: true,
      reproducedDefectCount: 3,
      defects: [
        { id: "viewport-pane-onfailure-unwired", classification: "REPRODUCED_DEFECT", status: "REPRODUCED_DEFECT", reproduced: true },
        { id: "pose-panel-direct-fk-cycle-crash", classification: "REPRODUCED_DEFECT", status: "REPRODUCED_DEFECT", reproduced: true },
        { id: "pose-panel-direct-fk-nan-rest-crash", classification: "REPRODUCED_DEFECT", status: "REPRODUCED_DEFECT", reproduced: true },
      ],
    },
  };

  const baselineEvaluation = evaluate(baselineReport, { strictAppDefects: false });
  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const mutations = [
    ["missing-nan-rest-case", "비유한 restTranslation(nan-rest) 가드 누락 시 실패", (r) => { r.directApiCall.cases = r.directApiCall.cases.filter((c) => c.id !== "nan-rest"); }, { strictAppDefects: false }],
    ["normal-empty-false-positive", "정상 빈 스켈레톤(normal-empty) 오분류(failureCount > 0) 시 실패", (r) => { r.directApiCall.normalEmpty.failureCount = 1; }, { strictAppDefects: false }],
    ["swallowed-programming-error", "예기치 않은 TypeError가 삼켜지면(rethrew=false) 실패", (r) => { r.directApiCall.unexpectedProgrammingError.rethrew = false; }, { strictAppDefects: false }],
    ["broken-atomicity", "손상 드래그 실패 후 기존 포즈·히스토리 상태 오염 시 실패", (r) => { r.directApiCall.atomicityAndRecovery.posePreserved = false; }, { strictAppDefects: false }],
    ["failed-dom-recovery", "손상 입력 이후 실제 DOM 포인터 복구 드래그·Undo 실패 시 거부", (r) => { r.realDomPointer.recoveryValidHumanoidDrag.passed = false; }, { strictAppDefects: false }],
    ["strict-mode-unresolved-app-defect", "--strict-app-defects 모드에서 미해결 REPRODUCED_DEFECT 존재 시 실패", () => undefined, { strictAppDefects: true }],
  ].map(([id, descriptionKo, mutate, evalOptions]) => ({ id, descriptionKo, mutate, evalOptions }));

  const cases = mutations.map((m) => {
    const copy = clone(baselineReport);
    m.mutate(copy);
    const evaluation = evaluate(copy, m.evalOptions);
    const rejected = evaluation.ok === false && evaluation.exitCode === 1;
    return { id: m.id, descriptionKo: m.descriptionKo, rejected, observedExitCode: evaluation.exitCode, reasons: evaluation.reasons };
  });

  const allRejected = baselineEvaluation.ok === true && baselineEvaluation.exitCode === 0 && cases.every((c) => c.rejected);
  return { ok: allRejected, allRejected, baselinePassed: baselineEvaluation.ok === true && baselineEvaluation.exitCode === 0, exitCode: 1, cases };
}
