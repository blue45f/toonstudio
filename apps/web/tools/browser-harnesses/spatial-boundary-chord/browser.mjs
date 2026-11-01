/** 수동으로 실행하며 실제 UI 입력·전용 Worker·기존 저장/열기 경로를 대체하지 않는다. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  assert(process.argv[index]?.startsWith("--") && process.argv[index + 1], "CLI 인자는 --key value 쌍이어야 합니다.");
  args.set(process.argv[index], process.argv[index + 1]);
}
const rootInput = args.get("--root");
assert(rootInput, "--root 입력이 필요합니다.");
const root = path.resolve(rootInput);
const expectedHead = args.get("--expected-head"), origin = args.get("--origin"), endpoint = args.get("--cdp");
const output = args.get("--out"), lane = args.get("--gpu-lane") ?? "metal-webgl";
assert(/^[a-f0-9]{40}$/u.test(expectedHead ?? "") && origin && endpoint && output);
assert(["metal-webgl", "swiftshader-webgl"].includes(lane));
const base = new URL(origin); assert(base.protocol === "http:" && base.hostname === "127.0.0.1" && base.port);
assert(path.isAbsolute(output) && !existsSync(output), "OUT는 아직 없는 절대 경로여야 합니다.");
mkdirSync(output, { mode: 0o700 });
const qa = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(path.join(root, "package.json"));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const git = (...parts) => execFileSync("git", ["--no-pager", ...parts], { cwd: root, encoding: "utf8", timeout: 5000 }).trim();
const checkpoint = () => {
  const modified = execFileSync("git", ["--no-pager", "ls-files", "--modified", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", timeout: 5000 }).split("\0");
  const staged = execFileSync("git", ["--no-pager", "diff", "--name-only", "-z", "HEAD"],
    { cwd: root, encoding: "utf8", timeout: 5000 }).split("\0");
  const dirty = [...modified, ...staged].filter(Boolean)
    .filter((name) => /\.(?:[cm]?[jt]sx?|md|json|ya?ml)$/u.test(name) && !/(?:^|\/)(?:node_modules|\.env|secrets?)(?:\/|\.|$)/iu.test(name));
  const files = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "apps/web/vite.config.ts",
    ...dirty, ...["spatial-boundary-chord-proof.tsx", "spatial-boundary-chord-proof.html", "server.mjs", "browser.mjs", "README.md"].map((name) => path.join(qa, name)),
    require.resolve("playwright"), require.resolve("playwright/package.json"), require.resolve("react"), require.resolve("react-dom/client"),
    require.resolve("three"), path.join(path.dirname(require.resolve("three")), "three.module.js"),
    path.join(path.dirname(require.resolve("three")), "three.core.js"), require.resolve("@react-three/fiber"),
    path.join(path.dirname(require.resolve("@react-three/fiber/package.json")), "dist/react-three-fiber.esm.js"),
    require.resolve("@react-three/fiber/package.json"), require.resolve("@react-three/drei/core/OrbitControls.js"),
    path.join(path.dirname(require.resolve("three-stdlib")), "controls/OrbitControls.js")];
  const rows = [...new Set(files.map((name) => path.resolve(root, name)))].sort().map((name) => {
    if (!existsSync(name)) return { path: name, missing: true };
    const info = statSync(name); assert(info.isFile() && info.size <= 8 * 1024 * 1024, "고정할 텍스트 입력이 예상 범위를 벗어났습니다.");
    return { path: name, realpath: realpathSync(name), bytes: info.size, mode: info.mode & 0o777, sha256: sha(readFileSync(name)) };
  });
  return { head: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"), dirty: [...new Set(dirty)].sort(), rows };
};
const events = [], workers = [], errors = [], warnings = [], stages = [], screenshots = [];
const requests = new Map();
const workerRecords = new Map();
let documentEpoch = 0;
const deadline = Date.now() + 180_000;
let phase = "input", before = null, browser, context, page, failure = null, initialGate, finalGate, result = null, cleanup = [];
const left = () => { const value = deadline - Date.now(); assert(value > 0, "180초 cooperative 기한을 넘었습니다."); return Math.min(15_000, value); };
const safeUrl = (value) => { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return "<invalid-url>"; } };
const nativeGate = (value) => {
  assert(value.origin === origin && value.secureContext && value.backend === "webgl2" && !value.contextLost);
  assert(typeof value.debugRenderer === "string" && value.debugRenderer.length > 0, "실제 debug renderer 증거가 없습니다.");
  if (lane === "metal-webgl") {
    assert(/Metal/u.test(value.debugRenderer) && !/SwiftShader|llvmpipe|software/iu.test(value.debugRenderer), "선언한 Metal lane과 실제 Canvas renderer가 다릅니다.");
  } else assert(/SwiftShader/iu.test(value.debugRenderer), "선언한 SwiftShader lane과 실제 Canvas renderer가 다릅니다.");
  assert(value.calls > 0 && value.width > 0 && value.height > 0);
  return value;
};
const observe = () => page.evaluate(() => window.__boundaryChordQa.observe());
const points = (faceId) => page.evaluate((id) => window.__boundaryChordQa.targets(id), faceId);
const waitFrames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const count = (value) => page.locator('[data-studio-hybrid-dcc-boundary-chord="true"]').getByText(`선택한 경계점 ${value}/2`, { exact: true }).waitFor({ timeout: left() });
const waitAuthority = (hash) => page.waitForFunction((wanted) => window.__boundaryChordQa.observe().authority.meshHash === wanted, hash, { timeout: left() });
async function click(point) {
  assert(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === "CANVAS", point), "실제 Canvas 클릭점이 UI에 가려졌습니다.");
  await page.mouse.click(point.x, point.y);
}
async function shot(name, marker) {
  const canvas = page.locator('canvas[aria-label="편집 메시 3D 렌더"]');
  await canvas.scrollIntoViewIfNeeded({ timeout: left() }); await waitFrames();
  if (marker) {
    const actual = await page.evaluate(() => window.__boundaryChordQa.markers());
    marker = actual.find((value) => JSON.stringify(value.local) === JSON.stringify(marker.local));
    assert(marker, "스크린샷 시점에 같은 실제 marker가 없습니다.");
  }
  const file = path.join(output, `${name}.png`), bytes = await canvas.screenshot({ path: file, timeout: left() });
  const pixels = await page.evaluate(({ encoded, point }) => window.__boundaryChordQa.inspectScreenshot(encoded, point),
    { encoded: bytes.toString("base64"), point: marker ? { x: marker.x, y: marker.y } : undefined });
  assert(pixels.width > 100 && pixels.height > 100 && pixels.distinctColors > 16, "실제 Canvas screenshot이 비어 있거나 단색입니다.");
  if (marker) {
    assert(/^[a-f0-9]{6}$/u.test(marker.colorSrgb));
    const color = [0, 2, 4].map((index) => Number.parseInt(marker.colorSrgb.slice(index, index + 2), 16));
    assert(pixels.patch.some((rgba) => rgba[3] === 255 && color.every((value, index) => Math.abs(value - rgba[index]) <= 4)),
      "첫 marker 위치의 실제 screenshot 픽셀이 marker sRGB 색을 확인하지 못했습니다.");
  }
  const entry = { name, file, sha256: sha(bytes), bytes: bytes.length, pixels };
  screenshots.push(entry); return entry;
}

const segmentKey = (a, b) => [JSON.stringify(a), JSON.stringify(b)].sort().join("|");
const faceEdges = (face) => face.map((vertex, index) => [vertex, face[(index + 1) % face.length]]);
function canonicalChord(original, committed, faceId, mode, expectedVertexIds) {
  const old = new Set(original.mesh.faces.flatMap(faceEdges).map(([a, b]) => segmentKey([a], [b])));
  const retained = committed.mesh.faces[faceId], appended = committed.mesh.faces.at(-1);
  assert(retained && appended);
  const nextEdges = new Set(faceEdges(appended).map(([a, b]) => segmentKey([a], [b])));
  const shared = faceEdges(retained).filter(([a, b]) => nextEdges.has(segmentKey([a], [b])) && !old.has(segmentKey([a], [b])));
  assert.equal(shared.length, 1, "실제 두 결과 면의 새 공유 모서리가 하나가 아닙니다.");
  const ids = shared[0];
  assert.deepEqual([...ids].sort((a, b) => a - b), mode === "edge" ? [original.mesh.positions.length, original.mesh.positions.length + 1]
    : [...expectedVertexIds].sort((a, b) => a - b));
  return ids.map((id) => committed.mesh.positions[id]);
}
function checkUv(original, committed, faceId) {
  assert(original.mesh.uvLayer && committed.mesh.uvLayer && original.uvCorners && committed.uvCorners);
  const selected = original.uvCorners.filter((corner) => corner.faceId === faceId);
  assert.equal(selected.length, 4);
  assert.equal(new Set(selected.map(({ u, v }) => JSON.stringify([u, v]))).size, 4, "원본 UV가 상수나 1차원 fixture입니다.");
  assert.equal(original.mesh.uvLayer.topologyHash, original.uvTopologyHash);
  assert.equal(committed.mesh.uvLayer.topologyHash, committed.uvTopologyHash);
  assert.notEqual(committed.uvTopologyHash, original.uvTopologyHash);
  assert.equal(committed.uvCorners.length, original.uvCorners.length + 2);
  const corners = new Map(original.uvCorners.map((corner) => [`${corner.faceId}|${corner.vertexId}`, [corner.u, corner.v]]));
  for (const corner of committed.uvCorners) {
    const sourceFace = corner.faceId === original.mesh.faces.length ? faceId : corner.faceId;
    assert.deepEqual([corner.u, corner.v], corners.get(`${sourceFace}|${corner.vertexId}`), "실제 원본 face/origin UV 또는 seam 값이 바뀌었습니다.");
  }
}
function distance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
}
async function wireProof(name, baselineShot, changedShot, originalWire, actualWire, endpoints, presentAfter = true) {
  const expected = segmentKey(endpoints[0].map(Math.fround), endpoints[1].map(Math.fround));
  assert.equal(originalWire.segments.some(([a, b]) => segmentKey(a, b) === expected), !presentAfter, "검사할 선의 원본 wire 존재 여부가 다릅니다.");
  assert.equal(actualWire.segments.some(([a, b]) => segmentKey(a, b) === expected), presentAfter, "canonical 모서리의 결과 wire 존재 여부가 다릅니다.");
  assert.deepEqual(actualWire.camera, originalWire.camera, "선 비교 도중 실제 카메라가 바뀌었습니다.");
  assert.deepEqual(actualWire.matrixWorld, originalWire.matrixWorld);
  const current = await page.evaluate((line) => window.__boundaryChordQa.wire(line), endpoints);
  assert.deepEqual(current.camera, actualWire.camera); assert.deepEqual(current.matrixWorld, actualWire.matrixWorld);
  assert(current.probe);
  // 고정한 +Z 면의 기존 선과 겹치는 표본은 별도 선 가시성의 증거로 쓰지 않는다.
  assert.equal(current.rect.width, originalWire.rect.width); assert.equal(current.rect.height, originalWire.rect.height);
  const noSeamWire = presentAfter ? originalWire : actualWire;
  // toolbar 클릭으로 Canvas가 scroll돼도 이미지 내부의 같은 위치끼리 비교한다.
  const offset = { x: current.rect.left - noSeamWire.rect.left, y: current.rect.top - noSeamWire.rect.top };
  const oldFaceLines = noSeamWire.projectedSegments.filter(({ local }) => local.every((point) => point[2] === 0.5))
    .map(({ a, b }) => ({ a: { x: a.x + offset.x, y: a.y + offset.y }, b: { x: b.x + offset.x, y: b.y + offset.y } }));
  const probe = { ...current.probe, points: current.probe.points.filter((point) => oldFaceLines.every(({ a, b }) => distance(point, a, b) > 7)) };
  assert(probe.points.length >= 3, "다른 wire와 겹치지 않는 대상 선의 픽셀 표본이 부족합니다.");
  const pixels = await page.evaluate(({ before, after, probe }) => window.__boundaryChordQa.inspectWireScreenshots(before, after, probe), {
    before: readFileSync(baselineShot.file).toString("base64"), after: readFileSync(changedShot.file).toString("base64"), probe,
  });
  // 실패한 픽셀 표본도 원본 PNG와 함께 남겨 동일 입력의 재실행 없이 진단한다.
  stages.push({ name, endpoints, presentAfter, baseline: baselineShot.name, changed: changedShot.name, actualWire, probe, pixels });
  assert(pixels.qualifying >= 3, "대상 선 위치의 실제 PNG 변화와 양쪽 면의 불변을 세 지점에서 확인하지 못했습니다.");
}

function surfaceSamples(displayed) {
  return displayed.meshes.map((mesh) => {
    assert.equal(mesh.normals.length, mesh.positions.length); assert(mesh.uvs);
    assert.equal(mesh.uvs.length, mesh.positions.length / 3 * 2);
    const corners = [];
    for (let offset = 0; offset < mesh.positions.length; offset += 3) corners.push(JSON.stringify([
      ...mesh.positions.slice(offset, offset + 3), ...mesh.normals.slice(offset, offset + 3),
      ...mesh.uvs.slice(offset / 3 * 2, offset / 3 * 2 + 2),
    ]));
    return { matrixWorld: mesh.matrixWorld, corners: [...new Set(corners)].sort() };
  });
}
function checkHealing(source, healed, target) {
  const [keep, drop] = target.faceIds;
  const mappedFace = (id) => id === drop ? keep : id > drop ? id - 1 : id;
  assert.equal(healed.mesh.faces.length, 6); assert.equal(healed.halfEdgeCount, source.halfEdgeCount - 2);
  assert.deepEqual(healed.mesh.positions, source.mesh.positions); assert.deepEqual(healed.mesh.vertexCreases, source.mesh.vertexCreases);
  assert.deepEqual(healed.transform, source.transform);
  assert.equal(healed.commandCount, source.commandCount + 1); assert.equal(healed.undoDepth, source.undoDepth + 1); assert.equal(healed.redoDepth, 0);
  const attributes = new Map(source.mesh.faceAttributes.map((entry) => [entry.faceIndex, entry]));
  for (const entry of healed.mesh.faceAttributes) {
    const original = attributes.get(entry.faceIndex >= drop ? entry.faceIndex + 1 : entry.faceIndex);
    assert(original); assert.deepEqual(entry, { ...original, faceIndex: entry.faceIndex });
  }
  assert.deepEqual(attributes.get(keep), { ...attributes.get(drop), faceIndex: keep });
  const uv = new Map();
  for (const corner of source.uvCorners) {
    const key = `${mappedFace(corner.faceId)}|${corner.vertexId}`, value = [corner.u, corner.v];
    if (uv.has(key)) assert.deepEqual(uv.get(key), value, "원본 seam의 같은 origin UV가 연속적이지 않습니다.");
    uv.set(key, value);
  }
  assert.equal(healed.uvCorners.length, source.uvCorners.length - 2);
  for (const corner of healed.uvCorners) assert.deepEqual([corner.u, corner.v], uv.get(`${corner.faceId}|${corner.vertexId}`));
  assert.equal(healed.mesh.uvLayer.topologyHash, healed.uvTopologyHash); assert.notEqual(healed.uvTopologyHash, source.uvTopologyHash);
  const creases = new Map((source.mesh.halfEdgeCreases ?? []).map((entry) => [
    `${entry.faceIndex}|${source.mesh.faces[entry.faceIndex][entry.edgeIndex]}|${source.mesh.faces[entry.faceIndex][(entry.edgeIndex + 1) % source.mesh.faces[entry.faceIndex].length]}`, entry.crease,
  ]));
  const resultCreases = new Map((healed.mesh.halfEdgeCreases ?? []).map((entry) => [`${entry.faceIndex}|${entry.edgeIndex}`, entry.crease]));
  for (const [faceId, face] of healed.mesh.faces.entries()) for (const [edgeIndex, from] of face.entries()) {
    const to = face[(edgeIndex + 1) % face.length];
    const oldFace = source.mesh.faces.findIndex((ids, id) => mappedFace(id) === faceId
      && ids.some((value, index) => value === from && ids[(index + 1) % ids.length] === to));
    assert(oldFace >= 0, "명시한 seam 밖의 새 모서리가 생겼습니다.");
    assert.equal(resultCreases.get(`${faceId}|${edgeIndex}`) ?? 0, creases.get(`${oldFace}|${from}|${to}`) ?? 0);
  }
}
const modelingWorkers = () => workers.filter(({ kind }) => kind === "boundary-chord" || kind === "coplanar-edge-dissolve");
function workerInventory(expected) {
  assert(workers.every(({ kind }) => kind !== "unexpected"), "등록되지 않은 실제 Worker가 생성됐습니다.");
  const active = page.workers().map((worker) => {
    const item = workerRecords.get(worker);
    assert(item && !item.closed, "살아 있는 Worker의 관측 identity가 일치하지 않습니다.");
    return item;
  });
  const database = workers.filter(({ kind }) => kind === "local-database");
  for (let epoch = 1; epoch <= documentEpoch; epoch += 1) {
    const owned = database.filter((worker) => worker.documentEpoch === epoch);
    assert.equal(owned.length, 1, "각 문서의 실제 로컬 DB Worker는 정확히 하나여야 합니다.");
    if (epoch < documentEpoch) assert(owned[0].closed, "이전 문서의 로컬 DB Worker가 남았습니다.");
    else assert(!owned[0].closed && active.includes(owned[0]), "현재 문서의 로컬 DB Worker가 실제로 살아 있지 않습니다.");
  }
  assert.equal(active.filter(({ kind }) => kind === "local-database").length, 1);
  const modeling = modelingWorkers();
  assert(modeling.length <= expected, "예상보다 많은 계산 Worker가 생성됐습니다.");
  return { active, modeling };
}
async function settledWorkers(expected) {
  for (;;) {
    const { active, modeling } = workerInventory(expected);
    if (modeling.length === expected && modeling.every((worker) => worker.closed)
      && active.every(({ kind }) => kind === "local-database")) return;
    left(); await waitFrames();
  }
}
async function healingScenario(original, initialDisplay) {
  phase = "healing-baseline";
  assert.equal(original.mesh.faces.length, 7); await settledWorkers(2);
  await page.getByRole("button", { name: "면 선택 모드 (3)", exact: true }).click({ timeout: left() });
  await page.locator('canvas[aria-label="편집 메시 3D 렌더"]').scrollIntoViewIfNeeded({ timeout: left() }); await waitFrames();
  let target = await page.evaluate(() => window.__boundaryChordQa.healingTargets());
  await click(target.faceTargets[0].point);
  await page.keyboard.down("Shift");
  try { await click(target.faceTargets[1].point); } finally { await page.keyboard.up("Shift"); }
  await page.waitForFunction(() => window.__boundaryChordQa.observe().selectedElements === 2, null, { timeout: left() });
  await stableCamera();
  const baselineWire = await page.evaluate(() => window.__boundaryChordQa.wire()), baselineShot = await shot("healing-before-seam-removal");
  assert.deepEqual((await observe()).authority, original);
  const selectSeam = async () => {
    await page.getByRole("button", { name: "모서리 선택 모드 (2)", exact: true }).click({ timeout: left() });
    const selectionToggle = page.getByRole("region", { name: "메시 선택 작업대", exact: true }).getByRole("button", { name: "메시 선택 · 연결 영역 · 경계 · 최단 경로", exact: true });
    if (await selectionToggle.getAttribute("aria-expanded") !== "true") await selectionToggle.click({ timeout: left() });
    await page.getByRole("region", { name: "메시 선택 작업대", exact: true }).getByRole("button", { name: "선택 해제", exact: true }).click({ timeout: left() });
    await page.locator('canvas[aria-label="편집 메시 3D 렌더"]').scrollIntoViewIfNeeded({ timeout: left() }); await waitFrames();
    target = await page.evaluate(() => window.__boundaryChordQa.healingTargets());
    await click(target.edge); await waitFrames();
    const key = segmentKey(...target.endpoints.map((point) => point.map(Math.fround)));
    await page.waitForFunction((wanted) => window.__boundaryChordQa.observe().selectionMode === "edge"
      && window.__boundaryChordQa.observe().selectedElements === 1
      && window.__boundaryChordQa.selectedEdges().some(([a, b]) => [JSON.stringify(a), JSON.stringify(b)].sort().join("|") === wanted), key, { timeout: left() });
    assert.deepEqual((await observe()).authority, original);
  };
  const section = page.locator('[data-studio-coplanar-edge-heal="true"]');
  const prepare = section.getByRole("button", { name: "선택 모서리 미리보기", exact: true });
  const apply = section.getByRole("button", { name: "치유 적용", exact: true });
  const ready = async () => page.waitForFunction(() => Array.from(document.querySelector('[data-studio-coplanar-edge-heal="true"]')?.querySelectorAll("button") ?? [])
    .some((button) => button.textContent === "치유 적용" && !button.disabled), null, { timeout: left() });
  await selectSeam(); phase = "healing-ready-cancel-prepare"; await prepare.click({ timeout: left() }); await ready(); await settledWorkers(3);
  assert.deepEqual((await observe()).authority, original, "치유 preview가 원본/history를 바꿨습니다.");
  await page.waitForFunction((signature) => { try { return window.__boundaryChordQa.wire().signature !== signature; } catch { return false; } }, baselineWire.signature, { timeout: left() });
  await waitFrames();
  const firstPreview = await page.evaluate(() => window.__boundaryChordQa.display());
  assert.deepEqual(surfaceSamples(firstPreview), surfaceSamples(initialDisplay), "치유 preview의 실제 위치/법선/UV가 원본 cube와 다릅니다.");
  const firstWire = await page.evaluate(() => window.__boundaryChordQa.wire()), firstShot = await shot("healing-ready-before-cancel");
  await wireProof("healing-ready-removes-seam-geometry-and-pixels", baselineShot, firstShot, baselineWire, firstWire, target.endpoints, false);
  phase = "healing-ready-preview-cancel"; await section.getByRole("button", { name: "치유 취소", exact: true }).click({ timeout: left() });
  await page.waitForFunction((signature) => { try { return window.__boundaryChordQa.wire().signature === signature; } catch { return false; } }, baselineWire.signature, { timeout: left() });
  assert.deepEqual((await observe()).authority, original); assert.equal(await apply.isEnabled(), false);
  stages.push({ name: "healing-ready-preview-cancel", authority: original, target, firstPreview, workerPhase: "Worker 완료·종료 뒤 ready preview 취소" });
  await selectSeam(); phase = "healing-apply-prepare"; await prepare.click({ timeout: left() }); await ready(); await settledWorkers(4);
  assert.deepEqual((await observe()).authority, original);
  await page.waitForFunction((signature) => { try { return window.__boundaryChordQa.wire().signature !== signature; } catch { return false; } }, baselineWire.signature, { timeout: left() });
  await waitFrames();
  const preview = await page.evaluate(() => window.__boundaryChordQa.display());
  const previewWire = await page.evaluate(() => window.__boundaryChordQa.wire()), previewShot = await shot("healing-preview-before-apply");
  phase = "healing-apply"; await apply.click({ timeout: left() });
  await page.waitForFunction((hash) => window.__boundaryChordQa.observe().authority.meshHash !== hash, original.meshHash, { timeout: left() });
  const healed = (await observe()).authority; checkHealing(original, healed, target);
  await page.waitForFunction((signature) => { try { return window.__boundaryChordQa.wire().signature === signature; } catch { return false; } }, previewWire.signature, { timeout: left() });
  await waitFrames(); const shown = await page.evaluate(() => window.__boundaryChordQa.display());
  assert.deepEqual(shown.meshes, preview.meshes); assert.deepEqual(surfaceSamples(shown), surfaceSamples(initialDisplay));
  const committedWire = await page.evaluate(() => window.__boundaryChordQa.wire()), committedShot = await shot("healing-committed-seam-removed");
  await wireProof("healing-committed-removes-seam-geometry-and-pixels", baselineShot, committedShot, baselineWire, committedWire, target.endpoints, false);
  stages.push({ name: "healing-single-commit", original, healed, target, preview, displayed: shown, previewWire, previewShot: previewShot.name });
  phase = "healing-undo-redo";
  await page.getByRole("button", { name: "마지막 3D 편집 되돌리기", exact: true }).click({ timeout: left() }); await waitAuthority(original.meshHash);
  assert.deepEqual((await observe()).authority.mesh, original.mesh); assert.equal((await observe()).authority.mesh.faces.length, 7);
  await page.getByRole("button", { name: "되돌린 3D 편집 다시 실행", exact: true }).click({ timeout: left() }); await waitAuthority(healed.meshHash);
  const redone = (await observe()).authority;
  assert.deepEqual(redone.mesh, healed.mesh); assert.deepEqual(redone.uvCorners, healed.uvCorners); assert.deepEqual(redone.transform, healed.transform);
  assert.equal(redone.mesh.faces.length, 6); assert.equal(redone.undoDepth, healed.undoDepth); assert.equal(redone.redoDepth, 0);
  return redone;
}

async function stableCamera() {
  const startedAt = Date.now(), cameraDeadline = startedAt + left();
  const samples = [];
  let previous = JSON.stringify(await page.evaluate(() => window.__boundaryChordQa.gpu().camera)), unchanged = 0, sampleCount = 0;
  try {
    while (unchanged < 3) {
      const remaining = cameraDeadline - Date.now();
      assert(remaining > 0, "실제 카메라 프레임이 원래 기한 안에 안정되지 않았습니다.");
      const sample = await page.evaluate((timeoutMs) => window.__boundaryChordQa.sampleDemandCameraFrame(timeoutMs), remaining);
      assert(Date.now() <= cameraDeadline, "실제 카메라 표본이 원래 기한을 넘었습니다.");
      assert(sample.frame > sample.beforeFrame, "실제 렌더 프레임이 진행되지 않았습니다.");
      const current = JSON.stringify(sample.camera);
      unchanged = current === previous ? unchanged + 1 : 0; previous = current;
      sampleCount++; samples.push({ ...sample, unchanged }); if (samples.length > 12) samples.shift();
    }
  } finally {
    events.push({ phase, cameraSynchronization: { startedAt, deadline: cameraDeadline, finishedAt: Date.now(), sampleCount, unchanged, samples } });
  }
  assert(Date.now() <= cameraDeadline, "카메라 안정화 판정이 원래 기한을 넘었습니다.");
}
async function selectFace() {
  await page.getByRole("button", { name: "면 선택 모드 (3)", exact: true }).click({ timeout: left() });
  try {
    await page.waitForFunction((frame) => {
      if (!frame.requested) {
        frame.requested = true;
        requestAnimationFrame(() => requestAnimationFrame(() => { frame.ready = true; }));
      }
      if (!frame.ready) return false;
      try { window.__boundaryChordQa.targets(); return true; }
      catch (error) {
        if (error instanceof Error && error.message.startsWith("실제 원본 표면의 재질·위치 수·TRS 식별 조건이 일치하지 않습니다. {")) return false;
        throw error;
      }
    }, { requested: false, ready: false }, { polling: "raf", timeout: left() });
  } catch (error) {
    // 기한이 끝나면 기존 관측기로 현재의 엄격 판정과 후보 진단을 남긴 뒤 실패한다.
    if (error instanceof Error && error.name === "TimeoutError") await points();
    throw error;
  }
  const target = await points(); await click(target.center);
  await page.waitForFunction(() => window.__boundaryChordQa.observe().selectedElements === 1, null, { timeout: left() });
  return target.faceId;
}
async function scenario(mode, original) {
  phase = mode;
  assert.equal((await observe()).fixture, mode === "edge" ? "edge" : "affine-uv");
  const originalAttributes = original.mesh.faceAttributes;
  assert(originalAttributes?.every(({ smooth }) => smooth === false));
  if (mode === "edge") {
    assert.equal(original.mesh.uvLayer, undefined);
    assert.deepEqual(original.mesh.vertexCreases ?? [], [], "기본 edge 문서의 정점 crease가 모두 0이어야 합니다.");
    assert.deepEqual(original.mesh.halfEdgeCreases ?? [], [], "기본 edge 문서의 모서리 crease가 모두 0이어야 합니다.");
    assert(originalAttributes.every(({ materialSlot }) => materialSlot === 0), "기본 edge 문서의 면 재질 slot이 바뀌었습니다.");
  } else {
    assert(original.mesh.uvLayer, "vertex 문서의 affine UV가 없습니다.");
    assert(original.mesh.vertexCreases?.some(({ crease }) => crease !== 0), "vertex 문서의 정점 crease가 모두 0입니다.");
    assert(original.mesh.halfEdgeCreases?.some(({ crease }) => crease !== 0), "vertex 문서의 모서리 crease가 모두 0입니다.");
    assert(new Set(originalAttributes.map(({ materialSlot }) => materialSlot)).size > 1);
  }
  const faceId = await selectFace();
  await page.getByRole("button", { name: mode === "edge" ? "모서리에서 선택" : "꼭짓점에서 선택", exact: true }).click({ timeout: left() });
  await page.locator('canvas[aria-label="편집 메시 3D 렌더"]').scrollIntoViewIfNeeded({ timeout: left() }); await waitFrames();
  const target = await points(faceId);
  await click(target.blank); await count(0);
  assert.deepEqual((await observe()).authority, original, "빈 공간 클릭이 실제 문서를 바꿨습니다.");
  await shot(`${mode}-before-marker`);
  await click(mode === "edge" ? target.edgeStart : target.vertexStart); await count(1); await waitFrames();
  const markers = await page.evaluate(() => window.__boundaryChordQa.markers());
  assert.equal(markers.length, 1, "실제 첫 marker가 하나가 아닙니다.");
  const first = markers[0]; assert.equal(first.depthTest, false);
  await shot(`${mode}-first-marker`, first);
  assert.deepEqual((await observe()).authority, original, "첫 endpoint 수집이 문서나 이력을 바꿨습니다.");
  if (mode === "edge") {
    const camera = await page.evaluate(() => window.__boundaryChordQa.gpu().camera);
    const drag = await points(faceId);
    await page.mouse.move(drag.center.x, drag.center.y); await page.mouse.down();
    await page.mouse.move(drag.center.x + 24, drag.center.y + 10, { steps: 8 }); await page.mouse.up();
    await count(1); assert.deepEqual((await observe()).authority, original);
    await page.waitForFunction((prior) => JSON.stringify(window.__boundaryChordQa.gpu().camera) !== JSON.stringify(prior), camera, { timeout: left() });
    // 기존 제품 suppress 120ms와 Orbit damping을 관측한다. PMREM/성능 시간으로 해석하지 않는다.
    await page.waitForTimeout(400); await count(1);
    const moved = await page.evaluate(() => window.__boundaryChordQa.markers());
    assert.equal(moved.length, 1); assert.deepEqual(moved[0].local, first.local);
    stages.push({ name: "native-orbit-kept-first-endpoint", cameraBefore: camera, cameraAfter: await page.evaluate(() => window.__boundaryChordQa.gpu().camera) });
  }
  await stableCamera();
  const originalWire = await page.evaluate(() => window.__boundaryChordQa.wire());
  const beforeWireShot = await shot(`${mode}-before-split-wire`);
  const next = await points(faceId);
  await click(mode === "edge" ? next.edgeEnd : next.vertexEnd);
  const apply = page.getByRole("button", { name: "면 나누기 적용", exact: true });
  await apply.waitFor({ timeout: left() });
  await page.waitForFunction(() => {
    const section = document.querySelector('[data-studio-hybrid-dcc-boundary-chord="true"]');
    return Array.from(section?.querySelectorAll("button") ?? []).some((button) => button.textContent === "면 나누기 적용" && !button.disabled);
  }, null, { timeout: left() });
  await count(2); assert.deepEqual((await observe()).authority, original, "preview가 원본/이력을 먼저 확정했습니다.");
  await page.waitForFunction((signature) => {
    try { return window.__boundaryChordQa.wire().signature !== signature; } catch { return false; }
  }, originalWire.signature, { timeout: left() });
  await waitFrames();
  const preview = await page.evaluate(() => window.__boundaryChordQa.display());
  const previewWire = await page.evaluate(() => window.__boundaryChordQa.wire());
  const previewShot = await shot(`${mode}-preview-split-wire`);
  await apply.click({ timeout: left() });
  await page.waitForFunction((hash) => window.__boundaryChordQa.observe().authority.meshHash !== hash, original.meshHash, { timeout: left() });
  const committed = (await observe()).authority;
  assert.equal(committed.mesh.faces.length, original.mesh.faces.length + 1);
  assert.equal(committed.mesh.positions.length, original.mesh.positions.length + (mode === "edge" ? 2 : 0));
  assert.equal(committed.undoDepth, original.undoDepth + 1); assert.equal(committed.redoDepth, 0);
  assert.equal(committed.commandCount, original.commandCount + 1); assert.deepEqual(committed.transform, original.transform);
  assert.deepEqual(committed.mesh.positions.slice(0, original.mesh.positions.length), original.mesh.positions,
    "기존 dense ID 정점의 f64 위치가 바뀌었습니다.");
  assert.deepEqual(committed.mesh.vertexCreases, original.mesh.vertexCreases, "현재 fixture의 정점 crease가 바뀌었습니다.");
  assert.deepEqual(committed.mesh.halfEdgeCreases, original.mesh.halfEdgeCreases, "현재 fixture의 모서리 crease가 바뀌었습니다.");
  if (mode === "edge") {
    assert.deepEqual(committed.mesh.vertexCreases ?? [], [], "기본 edge 분할 결과의 정점 crease가 모두 0이어야 합니다.");
    assert.deepEqual(committed.mesh.halfEdgeCreases ?? [], [], "기본 edge 분할 결과의 모서리 crease가 모두 0이어야 합니다.");
  }
  for (const attributes of committed.mesh.faceAttributes ?? []) {
    const sourceIndex = attributes.faceIndex === original.mesh.faces.length ? faceId : attributes.faceIndex;
    const expected = originalAttributes.find(({ faceIndex }) => faceIndex === sourceIndex);
    assert(expected); assert.deepEqual(attributes, { ...expected, faceIndex: attributes.faceIndex }, "면 재질 slot 또는 hard-surface 속성이 바뀌었습니다.");
  }
  assert.equal(committed.mesh.faceAttributes?.length, originalAttributes.length + 1);
  const chord = canonicalChord(original, committed, faceId, mode, next.expectedVertexIds);
  if (mode === "vertex") checkUv(original, committed, faceId);
  else assert.equal(committed.mesh.uvLayer, undefined);
  if (mode === "edge") assert(committed.mesh.positions.slice(original.mesh.positions.length)
    .some((position) => position.every((value, index) => value === first.local[index])),
  "확정한 새 f64 정점이 실제 첫 marker anchor와 다릅니다.");
  await page.waitForFunction((signature) => {
    try { return window.__boundaryChordQa.wire().signature === signature; } catch { return false; }
  }, previewWire.signature, { timeout: left() });
  await waitFrames();
  const rendered = await page.evaluate(() => window.__boundaryChordQa.display());
  const committedWire = await page.evaluate(() => window.__boundaryChordQa.wire());
  assert.deepEqual(rendered.meshes, preview.meshes, "확정 화면이 실제 preview 표면과 다릅니다.");
  const committedShot = await shot(`${mode}-committed-split-wire`);
  await wireProof(`${mode}-preview-wire-geometry-and-pixels`, beforeWireShot, previewShot, originalWire, previewWire, chord);
  await wireProof(`${mode}-committed-wire-geometry-and-pixels`, beforeWireShot, committedShot, originalWire, committedWire, chord);
  stages.push({ name: `${mode}-preview-commit`, firstMarker: first, preview, committed });
  return committed;
}
try {
  before = checkpoint(); assert.equal(before.head, expectedHead);
  writeFileSync(path.join(output, "input-before.json"), `${JSON.stringify(before, null, 2)}\n`);
  const { chromium } = require("playwright");
  phase = "connect";
  browser = await chromium.connectOverCDP(endpoint, { timeout: left() });
  context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2,
    colorScheme: "dark", locale: "ko-KR", acceptDownloads: true, serviceWorkers: "block" });
  context.on("request", (request) => requests.set(request, { url: safeUrl(request.url()), type: request.resourceType(), startedAt: Date.now(), finishedAt: null }));
  const finishedRequest = (request, failed) => { const entry = requests.get(request); if (entry) Object.assign(entry, { finishedAt: Date.now(), failed, timing: request.timing() }); };
  context.on("requestfinished", (request) => finishedRequest(request, false)); context.on("requestfailed", (request) => finishedRequest(request, true));
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && ["http:", "blob:"].includes(url.protocol)) return route.continue();
    errors.push({ kind: "blocked-origin", phase, url: safeUrl(url.href) }); await route.abort("blockedbyclient");
  });
  context.on("requestfailed", (request) => errors.push({ kind: "request", phase, url: safeUrl(request.url()), message: request.failure()?.errorText }));
  context.on("response", (response) => { if (response.status() >= 400) errors.push({ kind: "http", phase, status: response.status(), url: safeUrl(response.url()) }); });
  page = await context.newPage(); page.setDefaultTimeout(15_000);
  await page.addInitScript(() => {
    window.__boundaryNative = { trusted: {}, untrusted: {}, last: null };
    for (const type of ["pointerdown", "pointermove", "pointerup", "click", "keydown"]) window.addEventListener(type, (event) => {
      const bucket = event.isTrusted ? window.__boundaryNative.trusted : window.__boundaryNative.untrusted;
      bucket[type] = (bucket[type] ?? 0) + 1; window.__boundaryNative.last = { type, trusted: event.isTrusted };
    }, true);
  });
  page.on("pageerror", (error) => errors.push({ kind: "page", phase, message: error.message }));
  page.on("crash", () => errors.push({ kind: "crash", phase }));
  page.on("console", (message) => { if (message.type() === "error") errors.push({ kind: "console", phase, message: message.text() });
    if (message.type() === "warning") warnings.push({ phase, message: message.text() }); });
  page.on("worker", (worker) => {
    const url = safeUrl(worker.url());
    const address = new URL(url);
    const paths = new Map([
      ["/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-boundary-chord.worker.ts", "boundary-chord"],
      ["/src/domains/creator/hybrid-dcc/studio-hybrid-dcc-coplanar-edge-dissolve.worker.ts", "coplanar-edge-dissolve"],
      ["/src/domains/creator/studio-local-database.worker.ts", "local-database"],
    ]);
    const kind = address.origin === origin ? paths.get(address.pathname) ?? "unexpected" : "unexpected";
    const item = { id: workers.length + 1, kind, url, documentEpoch, createdPhase: phase, closed: false, closedPhase: null };
    workers.push(item); workerRecords.set(worker, item);
    if (kind === "unexpected") errors.push({ kind: "unexpected-worker", phase, url });
    worker.on("close", () => { item.closed = true; item.closedPhase = phase; });
  });
  phase = "initial";
  documentEpoch += 1;
  await page.goto(`${origin}/tools/browser-harnesses/spatial-boundary-chord-proof.html`, { waitUntil: "load", timeout: left() });
  await page.waitForFunction(() => { try { return window.__boundaryChordQa.gpu().calls > 0; } catch { return false; } }, null, { timeout: left() });
  await page.locator('canvas[aria-label="편집 메시 3D 렌더"]').scrollIntoViewIfNeeded({ timeout: left() });
  initialGate = nativeGate(await page.evaluate(() => window.__boundaryChordQa.gpu()));
  await settledWorkers(0);
  const original = (await observe()).authority;
  assert.equal((await observe()).fixture, "edge");
  assert.equal(original.mesh.uvLayer, undefined);
  assert.equal(original.mesh.positions.length, 8); assert.equal(original.mesh.faces.length, 6);
  assert.deepEqual(original.transform, { revision: 1, position: [0.35, 0.2, -0.1], rotationEulerRad: [0.12, -0.2, 0.06], scale: [1.2, 0.9, 1.1] });
  // 첫 점 전·첫 점 뒤의 실제 Escape는 Worker를 만들지 않고 모드와 marker만 해제해야 한다.
  phase = "native-escape";
  const escapeFace = await selectFace();
  const start = page.getByRole("button", { name: "모서리에서 선택", exact: true });
  await start.click({ timeout: left() }); await page.keyboard.press("Escape");
  assert.equal(await start.getAttribute("aria-pressed"), "false");
  assert.equal((await observe()).selectedElements, 1);
  await page.evaluate(() => window.__boundaryChordQa.beginPointerTrace());
  await start.click({ timeout: left() });
  await page.locator('canvas[aria-label="편집 메시 3D 렌더"]').scrollIntoViewIfNeeded({ timeout: left() }); await waitFrames();
  const escapeTarget = await points(escapeFace);
  await click(escapeTarget.edgeStart); await count(1); await waitFrames();
  const escapeMarkers = await page.evaluate(() => window.__boundaryChordQa.markers()); assert.equal(escapeMarkers.length, 1);
  await shot("escape-first-marker", escapeMarkers[0]);
  await page.keyboard.press("Escape");
  // DOM과 별도 Canvas 커밋의 완료를 원래 한 단계 기한 안에서 함께 관측한다.
  const escapeSyncStartedAt = Date.now(), escapeSyncDeadline = escapeSyncStartedAt + left();
  try {
    const remaining = escapeSyncDeadline - Date.now();
    assert(remaining > 0, "취소 동기화의 원래 단계 기한이 지났습니다.");
    await page.waitForFunction(() => {
      const section = document.querySelector('[data-studio-hybrid-dcc-boundary-chord="true"]');
      const domZero = Array.from(section?.querySelectorAll("p") ?? []).some((item) => item.textContent?.trim() === "선택한 경계점 0/2");
      return domZero && section?.querySelector('[role="status"]')?.textContent?.trim() === "Cancelled"
        && section?.querySelector('[data-studio-boundary-start="edge"]')?.getAttribute("aria-pressed") === "false"
        && window.__boundaryChordQa.markers().length === 0;
    }, null, { timeout: remaining });
  } finally {
    const observation = await page.evaluate(() => {
      const section = document.querySelector('[data-studio-hybrid-dcc-boundary-chord="true"]');
      return { observedAtMs: performance.now(),
        domZero: Array.from(section?.querySelectorAll("p") ?? []).some((item) => item.textContent?.trim() === "선택한 경계점 0/2"),
        notice: section?.querySelector('[role="status"]')?.textContent?.trim(),
        ariaPressed: section?.querySelector('[data-studio-boundary-start="edge"]')?.getAttribute("aria-pressed"),
        sceneMarkerCount: window.__boundaryChordQa.markers().length };
    }).catch((cause) => ({ observationError: cause instanceof Error ? cause.message : String(cause) }));
    events.push({ phase, escapeSynchronization: { startedAt: escapeSyncStartedAt, deadline: escapeSyncDeadline,
      finishedAt: Date.now(), observation } });
  }
  assert(Date.now() <= escapeSyncDeadline, "취소 상태와 장면이 원래 단계 기한 안에 확인되지 않았습니다.");
  assert(await page.locator('[data-studio-hybrid-dcc-boundary-chord="true"]').getByText("선택한 경계점 0/2", { exact: true }).isVisible(),
    "취소한 경계점 0/2 안내가 실제로 보이지 않습니다.");
  assert.equal(await start.getAttribute("aria-pressed"), "false");
  assert.equal((await page.evaluate(() => window.__boundaryChordQa.markers())).length, 0);
  assert(Date.now() <= escapeSyncDeadline, "취소의 마지막 확인이 원래 단계 기한을 넘었습니다.");
  assert.deepEqual((await observe()).authority, original); await settledWorkers(0);
  stages.push({ name: "native-escape-before-and-after-first-endpoint", authority: original });
  const edge = await scenario("edge", original);
  phase = "edge-undo";
  await page.getByRole("button", { name: "마지막 3D 편집 되돌리기", exact: true }).click({ timeout: left() }); await waitAuthority(original.meshHash);
  assert.deepEqual((await observe()).authority.mesh, original.mesh); assert.deepEqual((await observe()).authority.transform, original.transform);
  await page.getByRole("button", { name: "되돌린 3D 편집 다시 실행", exact: true }).click({ timeout: left() }); await waitAuthority(edge.meshHash);
  assert.deepEqual((await observe()).authority.mesh, edge.mesh);
  await page.getByRole("button", { name: "마지막 3D 편집 되돌리기", exact: true }).click({ timeout: left() }); await waitAuthority(original.meshHash);
  const nativeBeforeFixtureChange = await page.evaluate(() => ({ ...window.__boundaryNative, pointerTrace: window.__boundaryChordQa.pointerTrace() }));
  events.push({ phase, pointerTrace: nativeBeforeFixtureChange.pointerTrace });
  assert(nativeBeforeFixtureChange.trusted.keydown > 0);
  await settledWorkers(1);
  phase = "affine-uv-fixture";
  documentEpoch += 1;
  // 별도 초기 문서는 공개 geometry.commit으로 준비한 실제 Panel이다. 런타임 편집 포트로 데이터를 주입하지 않는다.
  await page.goto(`${origin}/tools/browser-harnesses/spatial-boundary-chord-proof.html?fixture=affine-uv`, { waitUntil: "load", timeout: left() });
  await page.waitForFunction(() => { try { return window.__boundaryChordQa.gpu().calls > 0; } catch { return false; } }, null, { timeout: left() });
  const vertexInitialGate = nativeGate(await page.evaluate(() => window.__boundaryChordQa.gpu()));
  const vertexOriginal = (await observe()).authority;
  await page.waitForFunction(() => { try { return window.__boundaryChordQa.display().meshes.length === 1; } catch { return false; } }, null, { timeout: left() });
  const vertexOriginalDisplay = await page.evaluate(() => window.__boundaryChordQa.display());
  assert.equal((await observe()).fixture, "affine-uv");
  assert.notEqual(vertexOriginal.documentId, original.documentId); assert.notEqual(vertexOriginal.assetId, original.assetId);
  assert.notEqual(vertexOriginal.meshHash, original.meshHash); assert(vertexOriginal.mesh.uvLayer);
  stages.push({ name: "independent-affine-uv-document", authority: vertexOriginal, vertexInitialGate, nativeBeforeFixtureChange });
  const vertexCommitted = await scenario("vertex", vertexOriginal);
  phase = "vertex-undo-redo";
  await page.getByRole("button", { name: "마지막 3D 편집 되돌리기", exact: true }).click({ timeout: left() }); await waitAuthority(vertexOriginal.meshHash);
  assert.deepEqual((await observe()).authority.mesh, vertexOriginal.mesh);
  assert.deepEqual((await observe()).authority.uvCorners, vertexOriginal.uvCorners);
  assert.deepEqual((await observe()).authority.transform, vertexOriginal.transform);
  await page.getByRole("button", { name: "되돌린 3D 편집 다시 실행", exact: true }).click({ timeout: left() }); await waitAuthority(vertexCommitted.meshHash);
  const vertex = (await observe()).authority;
  assert.deepEqual(vertex.mesh, vertexCommitted.mesh); assert.deepEqual(vertex.uvCorners, vertexCommitted.uvCorners);
  assert.deepEqual(vertex.transform, vertexCommitted.transform);
  stages.push({ name: "affine-uv-undo-redo", before: vertexOriginal, committed: vertexCommitted, restored: vertex });
  const healed = await healingScenario(vertex, vertexOriginalDisplay), finalAuthority = healed;
  await settledWorkers(4);
  phase = "save";
  const downloadEvent = page.waitForEvent("download", { timeout: left() });
  await page.getByRole("button", { name: "작업파일 저장", exact: true }).click({ timeout: left() });
  const download = await downloadEvent; assert(download.suggestedFilename().endsWith(".toon3d"));
  const file = path.join(output, "boundary-result.toon3d"); await download.saveAs(file); assert.equal(await download.failure(), null);
  const nativeBeforeReload = await page.evaluate(() => window.__boundaryNative);
  assert(nativeBeforeReload.trusted.pointerdown > 0 && nativeBeforeReload.trusted.pointerup > 0 && nativeBeforeReload.trusted.click > 0);
  assert(nativeBeforeFixtureChange.trusted.pointerdown > 0 && nativeBeforeFixtureChange.trusted.pointerup > 0
    && nativeBeforeFixtureChange.trusted.click > 0 && nativeBeforeFixtureChange.trusted.keydown > 0);
  const saved = { file, sha256: sha(readFileSync(file)), bytes: statSync(file).size, nativeBeforeReload }; assert(saved.bytes > 0);
  assert.deepEqual((await observe()).authority, finalAuthority, "실제 작업파일 저장이 원본 문서를 바꿨습니다.");
  await settledWorkers(4);
  assert.equal(modelingWorkers().filter(({ kind }) => kind === "boundary-chord").length, 2);
  assert.equal(modelingWorkers().filter(({ kind }) => kind === "coplanar-edge-dissolve").length, 2);
  phase = "reopen";
  documentEpoch += 1;
  await page.reload({ waitUntil: "load", timeout: left() });
  await page.waitForFunction(() => { try { return window.__boundaryChordQa.gpu().calls > 0; } catch { return false; } }, null, { timeout: left() });
  await page.getByLabel("열 .toon3d 작업파일 선택", { exact: true }).setInputFiles(file, { timeout: left() });
  await page.getByRole("button", { name: "현재 작업을 교체하고 열기", exact: true }).click({ timeout: left() }); await waitAuthority(finalAuthority.meshHash);
  const reopened = (await observe()).authority;
  assert.deepEqual(reopened.mesh, finalAuthority.mesh); assert.deepEqual(reopened.transform, finalAuthority.transform);
  assert.deepEqual(reopened.uvCorners, finalAuthority.uvCorners); assert.equal(reopened.uvTopologyHash, finalAuthority.uvTopologyHash);
  assert.equal(reopened.undoDepth, finalAuthority.undoDepth); assert.equal(reopened.redoDepth, finalAuthority.redoDepth);
  // 파일 열기는 object 선택으로 시작한다. 실제 face 모드의 원본 wire overlay를 다시 켜서 저장한다.
  await page.getByRole("button", { name: "면 선택 모드 (3)", exact: true }).click({ timeout: left() });
  await page.locator('canvas[aria-label="편집 메시 3D 렌더"]').scrollIntoViewIfNeeded({ timeout: left() });
  await shot("reopened-healed-wire"); finalGate = nativeGate(await page.evaluate(() => window.__boundaryChordQa.gpu()));
  const reopenedDisplay = await page.evaluate(() => window.__boundaryChordQa.display());
  assert.deepEqual(surfaceSamples(reopenedDisplay), surfaceSamples(vertexOriginalDisplay));
  assert.equal(reopened.stateHash, finalAuthority.stateHash); assert.equal(reopened.commandCount, finalAuthority.commandCount);
  assert.equal(reopened.meshRevision, finalAuthority.meshRevision); assert.equal(reopened.halfEdgeCount, finalAuthority.halfEdgeCount);
  const native = await page.evaluate(() => window.__boundaryNative);
  assert(native.trusted.pointerdown > 0 && native.trusted.pointerup > 0 && native.trusted.click > 0);
  await settledWorkers(4); assert.equal(errors.length, 0);
  result = { original, edge, vertexOriginal, vertexCommitted, vertex, healed, reopened, reopenedDisplay, saved, nativeBeforeFixtureChange, native };
} catch (error) {
  failure = { name: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message : String(error), phase };
  events.push({ phase, requests: [...requests.values()].map((entry) => ({ ...entry })) });
  if (page && !page.isClosed()) try {
    events.push({ phase, failureDocument: await page.evaluate(() => ({ readyState: document.readyState,
      text: document.body?.innerText.slice(0, 3000), resources: performance.getEntriesByType("resource").slice(-40)
        .map((entry) => ({ url: new URL(entry.name).pathname, duration: entry.duration })) })) });
    await page.screenshot({ path: path.join(output, "failure-page.png"), timeout: 5000 });
  } catch (diagnosticError) { events.push({ phase, diagnosticError: String(diagnosticError) }); }
}
finally {
  phase = "cleanup";
  if (page && !page.isClosed()) {
    try { events.push({ phase, partial: await observe(), native: await page.evaluate(() => window.__boundaryNative),
      pointerTrace: await page.evaluate(() => window.__boundaryChordQa.pointerTrace()) }); }
    catch (error) { cleanup.push({ step: "partial-observation", error: String(error) }); }
  }
  try { if (context) await context.close(); cleanup.push({ step: "context-close", ok: true }); } catch (error) { cleanup.push({ step: "context-close", error: String(error) }); }
  try { if (browser) await browser.close(); cleanup.push({ step: "cdp-close", ok: true }); } catch (error) { cleanup.push({ step: "cdp-close", error: String(error) }); }
  try {
    assert(workers.every(({ closed }) => closed), "context 정리 뒤 관측 Worker가 남았습니다.");
    cleanup.push({ step: "all-observed-workers-closed", ok: true });
  } catch (error) { cleanup.push({ step: "all-observed-workers-closed", error: String(error) }); }
  if (!failure) try {
    const modeling = modelingWorkers(), database = workers.filter(({ kind }) => kind === "local-database");
    assert(workers.every(({ kind }) => kind !== "unexpected"));
    assert.equal(modeling.length, 4);
    assert.equal(modeling.filter(({ kind }) => kind === "boundary-chord").length, 2);
    assert.equal(modeling.filter(({ kind }) => kind === "coplanar-edge-dissolve").length, 2);
    assert(modeling.every(({ createdPhase, closedPhase }) => createdPhase !== "cleanup" && closedPhase !== "cleanup"),
      "context 정리로 계산 Worker의 생성·종료 조건을 맞출 수 없습니다.");
    assert.equal(documentEpoch, 3); assert.equal(database.length, 3);
    for (let epoch = 1; epoch <= documentEpoch; epoch += 1) {
      assert.equal(database.filter((worker) => worker.documentEpoch === epoch).length, 1);
    }
    cleanup.push({ step: "final-worker-counts-and-lifetimes", ok: true });
  } catch (error) { cleanup.push({ step: "final-worker-counts-and-lifetimes", error: String(error) }); }
  let after = null;
  try { after = checkpoint(); assert(before); assert.deepEqual(after, before); } catch (error) { failure ??= { name: "source-changed-or-unverified", message: String(error), phase }; }
  if (errors.length || cleanup.some((item) => item.error) || !initialGate || !finalGate) failure ??= { name: "final-evidence", message: "초기/최종 GPU gate 또는 cleanup/진단/입력 불변 증거가 완전하지 않습니다.", phase };
  const receipt = { ok: failure === null, scope: "actual-panel-native-pointer-split-heal-workers-history-toon3d", executed: true,
    lane, initialGate, finalGate, cScope: { browserCancellation: "ready preview에서만", pendingWorkerCancellation: false,
      unitCasesDefined: { hook: 16, worker: 22 }, unitExecutionByThisDriver: false }, expectedWorkers: 4, expectedWorkersScope: "B/C 계산 Worker만 집계; DB Worker도 관측·문서별 singleton·최종 close 검사",
    expectedWorkerKinds: { "boundary-chord": 2, "coplanar-edge-dissolve": 2 }, documentEpochs: documentEpoch,
    modelingWorkerCount: modelingWorkers().length, databaseWorkerCount: workers.filter(({ kind }) => kind === "local-database").length,
    workers, screenshots, stages, result, failure, errors, warnings, cleanup, events,
    before, after, processOwnership: "CDP/Vite 프로세스의 상한·PID/PG/port 회수는 별도 외부 owner가 검증해야 합니다.",
    limits: ["C 취소는 Worker 완료 뒤 ready preview에서만 검사합니다. pending Worker 취소·ABA·modifier 대기 취소는 이 브라우저 범위 밖이며 단위 소스/실행 근거와 분리합니다.", "스크린샷 native 디코딩은 GPU 작업이 아닙니다.", "프레임 성능·OS 가상 키보드·타 기기 품질을 검증하지 않습니다."] };
  writeFileSync(path.join(output, "browser-result.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ ok: receipt.ok, output: path.join(output, "browser-result.json"), workers: workers.length }));
  process.exitCode = receipt.ok ? 0 : 1;
}
