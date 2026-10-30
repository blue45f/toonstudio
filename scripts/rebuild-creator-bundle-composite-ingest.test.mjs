import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { buildThemePacks } from "./generate-creator-bundle-theme-packs.mjs";
import { loadPackRightsLedger } from "./lib/creator-bundle-pack-rights.mjs";
import { dispatchCompositeIngestCli } from "./rebuild-creator-bundle-local-ingest.mjs";
import { BASE_CONFIG_PATH, BASE_REVISION, COMPOSITE_CONFIG_PATH, COMPOSITE_SCHEMA, PROJECTION_PATH, assertBaseProjectionPreserved, assertCompositePlanCurrent, buildCompositeIngestPlan, parseCompositeArgs, readPinnedBase, validateCompositeConfig, writeCompositeIngest } from "./rebuild-creator-bundle-composite-ingest.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const sha = (body) => createHash("sha256").update(body).digest("hex");
const stamp = "2026-10-30T00:00:00.000Z";
const baseId = "cbv1-ingest-local-cute-park", derivedId = "cbv1-ingest-007-030-nature-godot";
function put(path, body) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body); return path; }
const bytes = (value) => Buffer.from(JSON.stringify(value) + "\n");
const state = (path) => { const body = readFileSync(path); return { bytes: body.length, sha256: sha(body) }; };
function glb(name, { overBudget = false } = {}) {
  const document = { asset: { version: "2.0", extras: { name } }, buffers: [{ byteLength: 44 }],
    bufferViews: [{ buffer: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }, { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: Array.from({ length: overBudget ? 257 : 1 }, () => ({ mesh: 0 })), scenes: [{ nodes: [0] }], scene: 0 };
  const json = Buffer.from(JSON.stringify(document)), padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20), binaryHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + padded.length + 8 + 44, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binaryHeader.writeUInt32LE(44, 0); binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binaryHeader, Buffer.alloc(44)]);
}
function descriptor(ingestId, name, body, suffix) {
  return { id: `${ingestId}-${suffix}`, packId: ingestId, role: "runtime", format: "glb", sourcePath: name,
    files: [{ kind: "primary", path: `${ingestId}/native/${name}`, bytes: body.length, sha256: sha(body) }] };
}

function fixture({ overBudget = false, gltf = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "composite-ingest-test-"))), repo = join(root, "repo"), library = join(root, "library"), input = join(root, "prepared");
  const baseBody = glb("기존 원본"), derivedBody = glb("파생본", { overBudget });
  const baseAsset = descriptor(baseId, "Bench_1_1.glb", baseBody, "base"), derivedAsset = descriptor(derivedId, "Farm Plants/Lettuce_C.glb", derivedBody, "derived");
  const librarySource = "01-city/cute-park-pack/models/mixed/gLTF";
  const source = put(join(library, librarySource, baseAsset.sourcePath), baseBody);
  const originalName = "Farm Plants/Lettuce_C." + (gltf ? "gltf" : "glb");
  const atlasSource = put(join(library, "03-nature/nature-megapack-extended/Models", originalName), gltf
    ? bytes({ asset: { version: "2.0" }, buffers: [{ uri: "Lettuce_C.bin", byteLength: 4 }], images: [{ uri: "../../Textures/atlas.png" }] })
    : Buffer.from("외부 Atlas 원본 합성 입력"));
  const atlasBinary = gltf ? put(join(dirname(atlasSource), "Lettuce_C.bin"), Buffer.from("BIN!")) : undefined;
  const atlasImage = put(join(library, "03-nature/nature-megapack-extended/Textures/atlas.png"), Buffer.from("합성 Atlas"));
  for (const [asset, body] of [[baseAsset, baseBody], [derivedAsset, derivedBody]]) put(join(input, asset.files[0].path), body);
  const baseManifest = { kind: "toonstudio.asset-bundle.v2", version: 2, inServiceOnly: true, downloadable: false,
    generatedAt: "2026-10-29T09:32:32.491Z", totals: { assets: 1 }, assets: [baseAsset] };
  const manifest = { ...structuredClone(baseManifest), generatedAt: stamp, totals: { assets: 2 }, assets: [baseAsset, derivedAsset] };
  const ledger = loadPackRightsLedger(), ledgerPath = put(join(repo, "config/creator-bundle-pack-rights.json"), bytes(ledger));
  const themes = { themes: [] };
  put(join(repo, "apps/web/public/assets/3d/environments/bundle-v1/manifest.json"), bytes(themes));
  const baseProjection = buildThemePacks({ manifestV2: baseManifest, themesDoc: themes, assetRoot: input, ledger }).output;
  const projection = buildThemePacks({ manifestV2: manifest, themesDoc: themes, assetRoot: input, ledger }).output;
  const projectionBytes = bytes(projection), pinnedProjectionBytes = bytes(baseProjection);
  put(join(repo, PROJECTION_PATH), projectionBytes);
  const pinnedConfig = { schema: "toonstudio.creator-bundle-local-ingest.v1", projection: PROJECTION_PATH, projectionSha256: sha(pinnedProjectionBytes),
    snapshotGeneratedAt: baseManifest.generatedAt, copyPolicy: "copy-only-no-hardlinks", expected: { files: 1, bytes: baseBody.length },
    packs: [{ catalogId: "cbv1-008-cute-park-pack", ingestId: baseId, librarySource, files: 1, bytes: baseBody.length }] };
  const recipe = { schema: "toonstudio.creator-bundle-atlas-intake.v1", version: 1, generatedAt: stamp, packs: [{
    catalogId: "cbv1-030-nature-megapack-extended", ingestId: derivedId, packRoot: "03-nature/nature-megapack-extended", sourceDirectory: "Models", imagePaths: { "../../Textures/atlas.png": "Textures/atlas.png" },
    ...(gltf ? { sourceFormat: "gltf" } : {}) }] };
  const recipePath = put(join(repo, "config/creator-bundle-atlas-intake.json"), bytes(recipe));
  const proof = { schema: "toonstudio.creator-bundle-atlas-intake.v1-proof", productApplied: false, studioRuntimeVerified: false };
  if (gltf) proof.assets = [{ catalogId: recipe.packs[0].catalogId, sourcePath: derivedAsset.sourcePath,
    outputPath: derivedAsset.files[0].path, source: state(atlasSource), derived: { bytes: derivedBody.length, sha256: sha(derivedBody) },
    sourceFormat: "gltf", originalSourcePath: originalName, sourceBuffer: { path: "Models/Farm Plants/Lettuce_C.bin", ...state(atlasBinary) },
    normalization: { geometryBytesPreserved: true, externalImageUrisRemaining: 0,
      embeddedTextures: [{ uri: "../../Textures/atlas.png", ...state(atlasImage) }] } }];
  const proofPath = put(join(input, "preparation-proof.json"), bytes(proof));
  const manifestPath = put(join(input, "manifest-v2.json"), bytes(manifest));
  for (const file of ["prepare-creator-bundle-atlas-intake.py", "normalize_studio_asset_glb.py"]) put(join(repo, "scripts", file), "# 합성 코드 fingerprint\n");
  const config = { schema: COMPOSITE_SCHEMA, version: 1, copyPolicy: "copy-only-no-hardlinks",
    base: { revision: BASE_REVISION, configPath: BASE_CONFIG_PATH, configSha256: sha(bytes(pinnedConfig)), projectionPath: PROJECTION_PATH, projectionSha256: sha(pinnedProjectionBytes) },
    atlas: { recipe: "config/creator-bundle-atlas-intake.json", recipeSha256: sha(bytes(recipe)), preparationProofSha256: sha(bytes(proof)) },
    projection: PROJECTION_PATH, projectionSha256: sha(projectionBytes), snapshotGeneratedAt: stamp,
    expected: { baseAssets: 1, derivedAssets: 1, files: 2, bytes: baseBody.length + derivedBody.length } };
  const configPath = put(join(repo, BASE_CONFIG_PATH), bytes(config));
  const readPinned = () => readPinnedBase(config, { readGit: (args) => args[1].endsWith(":" + BASE_CONFIG_PATH) ? bytes(pinnedConfig) : pinnedProjectionBytes });
  const verifyDerived = () => ({ mode: "verify-derived", persistentOutputWritten: false,
    summary: { derivedAssets: 1, derivedBytes: derivedBody.length, inputUnchanged: true, targetUnchanged: true },
    controls: { recipe: state(recipePath), rights: state(ledgerPath), projection: { bytes: pinnedProjectionBytes.length, sha256: sha(pinnedProjectionBytes) } },
    targetManifest: state(manifestPath), assets: [structuredClone(derivedAsset)],
    inputFiles: [recipePath, ledgerPath, atlasSource, atlasImage, ...(gltf ? [atlasBinary] : [])].map((path) => ({ path, ...state(path) })),
    ...(gltf ? { sourceInputs: [{ packId: derivedId, sourcePath: derivedAsset.sourcePath, originalSourcePath: originalName, sourceFormat: "gltf" }] } : {}) });
  const args = { libraryRoot: library, inputRoot: input, config, configPath, ledgerPath, repoRoot: repo };
  return { root, repo, library, input, source, atlasSource, atlasBinary, atlasImage, recipe, recipePath, proof, ledger, themes,
    config, configPath, manifest, manifestPath, proofPath, baseProjection,
    baseAsset, derivedAsset, pinnedConfig, pinnedProjectionBytes, args, dependencies: { readPinned, verifyDerived },
    plan: (overrides = {}) => buildCompositeIngestPlan(args, { readPinned, verifyDerived, ...overrides }) };
}
function withFixture(run, options) { const f = fixture(options); try { run(f); } finally { rmSync(f.root, { recursive: true, force: true }); } }

function repinRecipe(f) {
  put(f.recipePath, bytes(f.recipe)); f.config.atlas.recipeSha256 = sha(bytes(f.recipe)); put(f.configPath, bytes(f.config));
}
function repinProof(f) {
  put(f.proofPath, bytes(f.proof)); f.config.atlas.preparationProofSha256 = sha(bytes(f.proof)); put(f.configPath, bytes(f.config));
}
function addLegacyDerived(f) {
  const id = "cbv1-ingest-231-lumagrovewonkywoods", body = glb("혼합 GLB 파생본"), asset = descriptor(id, "Tree.glb", body, "legacy");
  const original = put(join(f.library, "03-nature/lumagrove-wonky-woods/Models/Tree.glb"), body);
  const image = put(join(f.library, "03-nature/lumagrove-wonky-woods/Textures/atlas.png"), "혼합 합성 atlas");
  put(join(f.input, asset.files[0].path), body); f.manifest.assets.push(asset); f.manifest.totals.assets += 1;
  put(f.manifestPath, bytes(f.manifest));
  f.recipe.packs.push({ catalogId: "cbv1-028-lumagrove-wonky-woods", ingestId: id,
    packRoot: "03-nature/lumagrove-wonky-woods", sourceDirectory: "Models", imagePaths: { "../Textures/atlas.png": "Textures/atlas.png" } });
  repinRecipe(f);
  f.proof.assets.push({ catalogId: "cbv1-028-lumagrove-wonky-woods", sourcePath: asset.sourcePath,
    outputPath: asset.files[0].path, source: state(original), derived: { bytes: body.length, sha256: sha(body) }, normalization: {} });
  repinProof(f);
  const projection = buildThemePacks({ manifestV2: f.manifest, themesDoc: f.themes, assetRoot: f.input, ledger: f.ledger }).output;
  put(join(f.repo, PROJECTION_PATH), bytes(projection)); f.config.projectionSha256 = sha(bytes(projection));
  f.config.expected.derivedAssets += 1; f.config.expected.files += 1; f.config.expected.bytes += body.length;
  put(f.configPath, bytes(f.config));
  return () => {
    const result = f.dependencies.verifyDerived(); result.assets.push(structuredClone(asset));
    result.summary.derivedAssets += 1; result.summary.derivedBytes += body.length;
    result.inputFiles.push(...[original, image].map((path) => ({ path, ...state(path) })));
    result.sourceInputs.push({ packId: id, sourcePath: asset.sourcePath, originalSourcePath: asset.sourcePath, sourceFormat: "glb" });
    return result;
  };
}

test("고정 Git 객체는 인자 배열과 config/projection의 실제 SHA를 함께 대조한다", () => withFixture((f) => {
  const calls = [];
  const result = readPinnedBase(f.config, { readGit: (args) => { calls.push(args); return args[1].endsWith(":" + BASE_CONFIG_PATH) ? bytes(f.pinnedConfig) : f.pinnedProjectionBytes; } });
  assert.equal(result.config.expected.files, 1);
  assert.deepEqual(calls, [["show", `${BASE_REVISION}:${BASE_CONFIG_PATH}`], ["show", `${BASE_REVISION}:${PROJECTION_PATH}`]]);
  assert.throws(() => readPinnedBase(f.config, { readGit: () => Buffer.from("bad") }), /Git 객체/u);
}));

test("새 projection은 같은 디렉터리의 실제 SHA 파일명만 허용하고 고정 base 경로는 보존한다", () => withFixture((f) => {
  const original = f.config.projection;
  f.config.projection = original.replace(/\.json$/u, `.${f.config.projectionSha256}.json`);
  validateCompositeConfig(f.config);
  for (const projection of [original.replace(/\.json$/u, `.${"0".repeat(64)}.json`), "../theme-packs.json",
    "apps/web/public/other/theme-packs.json", "/" + f.config.projection, f.config.projection + "?version=1"]) {
    assert.throws(() => validateCompositeConfig({ ...f.config, projection }), /고정 기준/u);
  }
  f.config.base.projectionPath = f.config.projection;
  assert.throws(() => validateCompositeConfig(f.config), /고정 기준/u);
}));

test("현재 5,229 projection은 역사 1,929 전체를 보존하며 별도 config가 실제 원문 SHA를 고정한다", () => {
  const config = JSON.parse(readFileSync(new URL("../" + COMPOSITE_CONFIG_PATH, import.meta.url)));
  validateCompositeConfig(config);
  const legacyBody = readFileSync(new URL("../" + PROJECTION_PATH, import.meta.url));
  const currentBody = readFileSync(new URL("../" + config.projection, import.meta.url));
  assert.equal(sha(legacyBody), config.base.projectionSha256);
  assert.equal(sha(currentBody), config.projectionSha256);
  assert.notEqual(config.projection, PROJECTION_PATH);
  const legacy = JSON.parse(legacyBody), current = JSON.parse(currentBody);
  assert.equal(legacy.assets.length, 1929);
  assert.equal(current.assets.length, 5229);
  assertBaseProjectionPreserved(legacy, current);
  assert.equal(current.assets.filter((asset) => asset.path.startsWith(derivedId + "/native/")).length, 3300);
  assert.equal(current.assets.reduce((sum, asset) => sum + asset.bytes, 0), config.expected.bytes);
  assert.deepEqual(config.expected, { baseAssets: 1929, derivedAssets: 3300, files: 5229, bytes: 3985892748 });
});

test("읽기 검사는 실제 v1 원본 재현과 현재 generator를 사용하고 출력 파일을 만들지 않는다", () => withFixture((f) => {
  const plan = f.plan();
  assert.deepEqual(plan.summary, { baseAssets: 1, derivedAssets: 1, files: 2, bytes: f.config.expected.bytes });
  assert.deepEqual(plan.manifest.assets[0], f.baseAsset);
  assert.equal(existsSync(join(f.root, "output")), false);
  assert.deepEqual(JSON.parse(readFileSync(f.manifestPath)), f.manifest);
}));

test("기존 원본이 바뀌면 공개 해시나 개수만으로 통과하지 않는다", () => withFixture((f) => {
  writeFileSync(f.source, "변경");
  assert.throws(() => f.plan(), /SHA|크기|해시/u);
}));

test("Python 증거의 대상·권리·입력 불변·전수 개수·입력 fingerprint를 대조한다", () => withFixture((f) => {
  for (const mutate of [(r) => { r.summary.inputUnchanged = false; }, (r) => { r.summary.targetUnchanged = false; },
    (r) => { r.targetManifest.sha256 = "0".repeat(64); }, (r) => { r.controls.projection.sha256 = "0".repeat(64); },
    (r) => { r.summary.derivedAssets = 2; }, (r) => { r.summary.derivedBytes += 1; }, (r) => { r.inputFiles = []; },
    (r) => { r.inputFiles.push(r.inputFiles[0]); }]) {
    assert.throws(() => f.plan({ verifyDerived: () => { const r = f.dependencies.verifyDerived(); mutate(r); return r; } }), /Python|fingerprint/u);
  }
}));

test("실제 payload·manifest·준비 증거·불명확 sidecar는 모두 거부한다", () => withFixture((f) => {
  const path = join(f.input, f.derivedAsset.files[0].path), old = readFileSync(path);
  writeFileSync(path, "변조"); assert.throws(() => f.plan(), /바이트|SHA/u); writeFileSync(path, old);
  const original = readFileSync(f.manifestPath), changed = structuredClone(f.manifest); changed.assets[0].id += "-changed";
  writeFileSync(f.manifestPath, bytes(changed)); assert.throws(() => f.plan(), /manifest/u); writeFileSync(f.manifestPath, original);
  put(join(f.input, "unknown.json"), "{}"); assert.throws(() => f.plan(), /sidecar/u);
}));

test("현재 generator의 모바일 예산 탈락을 기대 개수 수정으로 숨기지 않는다", () => withFixture((f) => {
  assert.throws(() => f.plan(), /전수 권리·모바일/u);
}, { overBudget: true }));

test("현재 공개 projection 내용과 역사 ID map 불변을 모두 대조한다", () => withFixture((f) => {
  const current = structuredClone(f.baseProjection); current.assets.reverse(); assertBaseProjectionPreserved(f.baseProjection, current);
  current.assets[0].tris += 1;
  assert.throws(() => assertBaseProjectionPreserved(f.baseProjection, current), /역사 에셋/u);
  assert.throws(() => f.plan({ generate: (args) => { const result = buildThemePacks(args); result.output.assets[0].tris += 1; return result; } }), /공개 projection/u);
}));

test("계획 뒤 recipe·원장·Atlas·코드 변경은 쓰기 전에 거부한다", () => withFixture((f) => {
  const plan = f.plan();
  writeFileSync(f.atlasImage, "계획 이후 변경");
  assert.throws(() => assertCompositePlanCurrent(plan), /변경/u);
  assert.throws(() => writeCompositeIngest(plan, join(f.root, "new")), /변경/u);
  assert.equal(existsSync(join(f.root, "new")), false);
}));

test("Python 검증 뒤 새 Atlas GLB가 생기면 기존 목록 성공으로 게시하지 않는다", () => withFixture((f) => {
  const plan = f.plan();
  put(join(dirname(f.atlasSource), "new.glb"), "추가 원본");
  assert.throws(() => assertCompositePlanCurrent(plan), /목록이 변경/u);
}));

test("glTF 원본과 출력 GLB를 분리하고 BIN·이미지 fingerprint와 형식별 목록을 보존한다", () => withFixture((f) => {
  const plan = f.plan(), directory = join(f.library, f.recipe.packs[0].packRoot, "Models");
  assert.deepEqual(plan.sourceTrees.get(directory), [f.atlasSource]);
  assert.equal(plan.sourceFormats.get(directory), "gltf");
  for (const path of [f.atlasSource, f.atlasBinary, f.atlasImage]) assert.deepEqual(plan.states.get(path), state(path));
  assert.equal(plan.manifest.assets[1].sourcePath, "Farm Plants/Lettuce_C.glb");
  put(join(dirname(f.atlasSource), "late.gltf"), readFileSync(f.atlasSource));
  assert.throws(() => assertCompositePlanCurrent(plan), /GLTF 목록이 변경/u);
}, { gltf: true }));

test("glTF 원본 BIN URI의 ASCII 제어 문자를 거부한다", () => {
  for (const control of ["\u0000", "\u001f", "\u007f"]) withFixture((f) => {
    const source = JSON.parse(readFileSync(f.atlasSource, "utf8"));
    source.buffers[0].uri = "Lettuce" + control + "_C.bin";
    put(f.atlasSource, bytes(source));
    f.proof.assets[0].source = state(f.atlasSource);
    repinProof(f);
    assert.throws(() => f.plan(), /소유 팩의 명시적 로컬 URI/u);
  }, { gltf: true });
});

test("GLB 전용 결과는 sourceFormats를 추가하지 않고 sourceInputs 혼합을 거부한다", () => withFixture((f) => {
  assert.equal(Object.hasOwn(f.plan(), "sourceFormats"), false);
  assert.throws(() => f.plan({ verifyDerived: () => ({ ...f.dependencies.verifyDerived(), sourceInputs: [] }) }), /GLB 전용/u);
}));

test("glTF sourceInputs의 누락·중복·잉여·잘못된 형식과 원본 stem을 거부한다", () => withFixture((f) => {
  const changes = [(r) => { delete r.sourceInputs; }, (r) => { r.sourceInputs = []; },
    (r) => { r.sourceInputs.push(r.sourceInputs[0]); }, (r) => { r.sourceInputs[0].extra = true; },
    (r) => { r.sourceInputs[0].packId = "cbv1-ingest-unknown"; }, (r) => { r.sourceInputs[0].sourceFormat = "glb"; },
    (r) => { r.sourceInputs[0].originalSourcePath = r.sourceInputs[0].sourcePath; },
    (r) => { r.sourceInputs[0].originalSourcePath = "Farm Plants/Other.gltf"; }];
  for (const change of changes) assert.throws(() => f.plan({ verifyDerived: () => {
    const result = f.dependencies.verifyDerived(); change(result); return result;
  } }), /sourceInputs|필드/u);
}, { gltf: true }));

test("glTF·BIN·이미지 fingerprint 중 하나라도 빠지면 sourceInputs만으로 통과하지 않는다", () => withFixture((f) => {
  for (const missing of [f.atlasSource, f.atlasBinary, f.atlasImage]) assert.throws(() => f.plan({ verifyDerived: () => {
    const result = f.dependencies.verifyDerived(); result.inputFiles = result.inputFiles.filter((item) => item.path !== missing); return result;
  } }), /fingerprint/u);
}, { gltf: true }));

test("고정한 준비 증거에서도 glTF 원본·BIN·이미지의 위조 출처를 거부한다", () => withFixture((f) => {
  const original = structuredClone(f.proof);
  put(join(dirname(f.atlasBinary), "Other.bin"), readFileSync(f.atlasBinary));
  const changes = [(record) => { record.originalSourcePath = "Other.gltf"; },
    (record) => { record.source.sha256 = "0".repeat(64); },
    (record) => { record.sourceBuffer.path = "Models/Farm Plants/Other.bin"; },
    (record) => { record.sourceBuffer.sha256 = "0".repeat(64); },
    (record) => { record.sourceBuffer.bytes += 1; },
    (record) => { record.normalization.embeddedTextures[0].sha256 = "0".repeat(64); }];
  for (const change of changes) {
    f.proof.assets = structuredClone(original.assets); change(f.proof.assets[0]); repinProof(f);
    assert.throws(() => f.plan(), /출처|fingerprint|BIN/u);
  }
}, { gltf: true }));

test("glTF recipe의 잘못된 형식·중복 팩·위조 이미지 매핑을 거부한다", () => withFixture((f) => {
  const original = structuredClone(f.recipe);
  f.recipe.packs[0].sourceFormat = "glb"; repinRecipe(f);
  assert.throws(() => f.plan(), /sourceFormat/u);
  f.recipe.packs = [...structuredClone(original.packs), ...structuredClone(original.packs)]; repinRecipe(f);
  assert.throws(() => f.plan(), /중복/u);
  f.recipe.packs = structuredClone(original.packs);
  put(join(dirname(f.atlasImage), "other.png"), readFileSync(f.atlasImage));
  f.recipe.packs[0].imagePaths["../../Textures/atlas.png"] = "Textures/other.png"; repinRecipe(f);
  assert.throws(() => f.plan(), /매핑/u);
}, { gltf: true }));

test("혼합 recipe는 GLB 행까지 유일한 sourceInputs가 필요하며 기존 목록 형식을 유지한다", () => withFixture((f) => {
  const verifyDerived = addLegacyDerived(f), plan = f.plan({ verifyDerived });
  const legacyDirectory = join(f.library, "03-nature/lumagrove-wonky-woods/Models");
  assert.equal(plan.sourceFormats.has(legacyDirectory), false);
  assert.deepEqual(plan.sourceTrees.get(legacyDirectory), [join(legacyDirectory, "Tree.glb")]);
  for (const change of [(r) => { r.sourceInputs.pop(); }, (r) => { r.sourceInputs[1] = r.sourceInputs[0]; },
    (r) => { r.sourceInputs[1].sourceFormat = "gltf"; }]) assert.throws(() => f.plan({ verifyDerived: () => {
    const result = verifyDerived(); change(result); return result;
  } }), /sourceInputs/u);
  put(join(legacyDirectory, "late.glb"), "늦은 GLB");
  assert.throws(() => assertCompositePlanCurrent(plan), /GLB 목록이 변경/u);
}, { gltf: true }));

test("glTF 계획 뒤 BIN·이미지 내용 변경은 재생성 영수증과 별개로 게시를 막는다", () => {
  for (const kind of ["atlasBinary", "atlasImage"]) withFixture((f) => {
    const plan = f.plan(); writeFileSync(f[kind], "계획 이후 변경");
    assert.throws(() => assertCompositePlanCurrent(plan), /변경/u);
    assert.throws(() => writeCompositeIngest(plan, join(f.root, "output")), /변경/u);
    assert.equal(existsSync(join(f.root, "output")), false);
  }, { gltf: true });
});

test("쓰기는 전체 입력을 한 번 복사하고 별도 sidecar 없이 독립 inode로 게시한다", () => withFixture((f) => {
  const output = join(f.root, "output"), plan = f.plan(), result = writeCompositeIngest(plan, output);
  assert.equal(result.inputRoot, join(output, "input"));
  for (const asset of f.manifest.assets) {
    const path = asset.files[0].path, source = join(f.input, path), copy = join(result.inputRoot, path);
    assert.deepEqual(readFileSync(copy), readFileSync(source));
    assert.notEqual(statSync(copy).ino, statSync(source).ino);
  }
  assert.equal(existsSync(join(result.inputRoot, "composite-origins.json")), false);
  assert.throws(() => writeCompositeIngest(plan, output), /새 디렉터리/u);
}));

test("복사 중 입력 변경 또는 하드링크는 게시하지 않고 원본을 보존한다", () => withFixture((f) => {
  const plan = f.plan(), output = join(f.root, "output");
  assert.throws(() => writeCompositeIngest(plan, output, { copyFile: (a, b) => linkSync(a, b) }), /하드링크/u);
  assert.equal(existsSync(output), false); assert.equal(existsSync(f.source), true);
  assert.throws(() => writeCompositeIngest(plan, output, { copyFile: (a, b, mode) => {
    assert.equal(mode, constants.COPYFILE_EXCL); copyFileSync(a, b, mode); writeFileSync(f.atlasImage, "중간 변경");
  } }), /변경/u);
  assert.equal(existsSync(output), false);
}));

test("출력은 원본·검사 입력·저장소·public·dist 및 기존 경로를 덮어쓰지 않는다", () => withFixture((f) => {
  const plan = f.plan(); mkdirSync(join(f.root, "public"));
  for (const path of [join(f.library, "new"), join(f.input, "new"), join(f.repo, "new"), join(f.root, "public/new")]) assert.throws(() => writeCompositeIngest(plan, path), /새 디렉터리/u);
  const linked = join(f.root, "linked"); symlinkSync(f.input, linked);
  assert.throws(() => writeCompositeIngest(plan, linked), /새 디렉터리/u);
}));

test("복사한 payload가 정상이더라도 이후 원본 입력 변경과 새 sidecar는 게시를 막는다", () => {
  for (const change of ["payload", "sidecar"]) withFixture((f) => {
    const plan = f.plan(), output = join(f.root, "output");
    const firstPayload = join(f.input, f.baseAsset.files[0].path);
    assert.throws(() => writeCompositeIngest(plan, output, { copyFile: (source, destination, mode) => {
      copyFileSync(source, destination, mode);
      if (source === firstPayload) {
        if (change === "payload") writeFileSync(source, "복사 뒤 원본 입력 변경");
        else put(join(f.input, "unexpected.json"), "{}");
      }
    } }), /SHA256|등록하지 않은/u);
    assert.equal(existsSync(output), false);
    assert.equal(existsSync(f.source), true);
  });
});

test("명시 composite schema·SHA·합계와 CLI 모드를 엄격히 구분한다", () => withFixture((f) => {
  validateCompositeConfig(f.config);
  const bad = structuredClone(f.config); bad.base.revision = "0".repeat(40);
  assert.throws(() => validateCompositeConfig(bad), /고정 기준/u);
  const common = ["--library-root", "/library"];
  const legacy = parseCompositeArgs([...common, "--check", "--output-root", "/prepared"]);
  assert.equal(legacy["--input-root"], "/prepared"); assert.equal(legacy["--output-root"], undefined);
  assert.equal(parseCompositeArgs([...common, "--input-root", "/prepared", "--output-root", "/new"]).check, false);
  for (const argv of [[...common, "--check", "--input-root", "/a", "--output-root", "/b"], [...common, "--write", "--check"],
    [...common, "--check", "--check"], [...common, "--wat", "x"], [...common, "--write", "--output-root", "/new"]]) assert.throws(() => parseCompositeArgs(argv));
}));

test("기존 CLI 분기는 인자 배열·기존 별칭·동기 문자열 반환을 유지한다", () => {
  const argv = ["--check", "--output-root", "/prepared", "--library-root", "/library"];
  let invoked;
  const result = dispatchCompositeIngestCli(argv, { readConfig: () => ({ schema: COMPOSITE_SCHEMA }), invoke: (args) => { invoked = args; return '{"mode":"check"}\n'; } });
  assert.equal(result, '{"mode":"check"}'); assert.deepEqual(invoked.slice(1), argv);
  assert.equal(dispatchCompositeIngestCli(argv, { readConfig: () => ({ schema: "toonstudio.creator-bundle-local-ingest.v1" }), invoke: () => assert.fail("v1은 분기하지 않는다") }), null);
  assert.throws(() => dispatchCompositeIngestCli(["--config", "a", "--config", "b"]), /중복/u);
  assert.throws(() => dispatchCompositeIngestCli(argv, { readConfig: () => ({ schema: COMPOSITE_SCHEMA }), invoke: () => { throw new Error("합성 실패"); } }), /composite 재현/u);
});

test("CLI 분기는 잘못된 인자와 모드를 설정 파일 읽기 전에 거부한다", () => {
  const dependencies = { readConfig: () => assert.fail("잘못된 입력에서 설정을 읽지 않는다") };
  for (const argv of [["--publish"], ["--dry-run", "--dry-run"], ["--library-root", "unused", "--check", "--dry-run"],
    ["--library-root", "unused", "--config"], ["--check"]]) assert.throws(() => dispatchCompositeIngestCli(argv, dependencies), /인자|실행 모드/u);
  assert.equal(dispatchCompositeIngestCli(["--help"], dependencies), null);
});
