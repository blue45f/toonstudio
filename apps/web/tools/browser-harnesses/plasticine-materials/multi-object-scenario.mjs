/**
 * 실제 UI의 복수 객체 재질 격리 시나리오. import만으로 실행하지 않는다.
 * 기존 core-3 준비·표면 판정 함수를 ID별 단일 관측 wrapper로 재사용한다.
 * 제품 상태·geometry·camera·renderer를 직접 변경하지 않는다.
 */
import assert from "node:assert/strict";

export function oneEntityObservation(observation, entityId) {
  const entities = observation.entities.filter((entity) => entity.entityId === entityId);
  assert.equal(entities.length, 1, `한 실제 entity mesh가 필요합니다: ${entityId}`);
  // 원본 관측값·geometry·camera·overlay를 변경하지 않는다. 배경이나 다른 객체를 ROI로 넣지 않는다.
  return { ...observation, entities };
}

export function createMultiObjectScenario(core, imported = null) {
  const { origin, DOM_MS, LOAD_MS, remaining, until, openEditor, showPicker, readObservation,
    materialReady, untexturedReady, screenshot, compareSurfaceAppearance, requireSameSurface, releaseObserverReader } = core;
  assert.equal(DOM_MS, 15_000); assert.equal(LOAD_MS, 120_000);
  assert.equal(typeof releaseObserverReader, "function", "reload 전 관측기 JSHandle 해제가 필요합니다.");
  const names = imported?.names ?? { A: "격리 검증 A", B: "격리 검증 B" };
  const originalById = new Map();
  const dialog = (page) => page.getByTestId("studio-bg3d-dialog");
  const dock = (page) => dialog(page).locator('[data-studio-bg3d-outliner="dock"]');
  const tree = (page) => dock(page).getByRole("tree", { name: "3D 장면 객체", exact: true });
  const viewport = (page) => dialog(page).getByTestId("studio-bg3d-viewport");
  const row = (page, name) => tree(page).getByRole("treeitem").filter({
    has: page.getByRole("button", { name, exact: true }),
  });
  const single = oneEntityObservation;
  function exactSet(observation, expected) {
    const ids = observation.entities.map((entity) => entity.entityId);
    if (imported && (!Array.isArray(observation.entityMeshes)
      || observation.entities.some((entity) => entity.entityKind !== "model"
        || Object.values(entity.auxiliaryChannels).some((channel) => channel !== null))
      || observation.entityMeshes.length !== expected.size
      || observation.entityMeshes.some((entry) => entry.entityKind !== "model"
        || !expected.has(entry.entityId) || entry.materialTypes.length !== 1 || entry.materialTypes[0] !== "MeshStandardMaterial"))) return false;
    return ids.length === expected.size && new Set(ids).size === ids.length
      && ids.every((id) => expected.has(id));
  }
  function readySet(observation, expected) {
    return exactSet(observation, expected) && [...expected].every(([id, item]) =>
      item ? materialReady(single(observation, id), item) : imported
        ? imported.originalReady(single(observation, id).entities[0], originalById.get(id))
          && (imported.templateOnly === true || untexturedReady(single(observation, id)))
        : untexturedReady(single(observation, id)));
  }
  async function waitNaturalSet(page, expected, initialFrame) {
    let lastNotReadyFrame = initialFrame;
    return until(async () => {
      const observation = await readObservation(page);
      if (!readySet(observation, expected)) {
        lastNotReadyFrame = Math.max(lastNotReadyFrame, observation.frame); return false;
      }
      return observation.frame > lastNotReadyFrame ? { observation, lastNotReadyFrame } : false;
    }, LOAD_MS, "ID별 원본 채널과 추가 입력 없는 자연 제품 프레임이 준비되지 않았습니다.");
  }
  async function quietWindow(page, expected) {
    // 제품 debounce 400ms보다 긴 기존 core의 500ms 관찰 구간. 전체 작업 상한을 늘리지 않는다.
    // 이 시간 자체가 history 성공 근거는 아니다. 뒤의 실제 UI Undo/Redo와 표면 비교가 근거다.
    const before = await readObservation(page); assert(readySet(before, expected));
    assert.equal(remaining(500), 500); await page.waitForTimeout(500); remaining();
    const after = await readObservation(page); assert(readySet(after, expected));
    for (const id of expected.keys()) {
      const a = single(before, id).entities[0], b = single(after, id).entities[0];
      assert.deepEqual(a.appearance, b.appearance, "관찰 중 geometry/camera/overlay가 바뀌었습니다.");
      assert.deepEqual(a.channels, b.channels, "관찰 중 실제 texture 상태가 바뀌었습니다.");
    }
  }
  async function selectOnly(page, name) {
    const target = row(page, name); assert.equal(await target.count(), 1);
    await target.getByRole("button", { name, exact: true }).click({ timeout: remaining() });
    await until(async () => await target.getAttribute("aria-selected") === "true"
      && await tree(page).locator('[role="treeitem"][aria-selected="true"]').count() === 1,
    DOM_MS, "장면 계층 UI의 단일 선택을 확인하지 못했습니다.");
  }
  async function moveSelectedX(page, id, x) {
    await page.locator("#bg3d-tab-shapes").first().click({ timeout: remaining() });
    const position = dialog(page).getByRole("spinbutton", { name: "위치 X", exact: true });
    assert.equal(await position.count(), 1);
    await position.fill(String(x), { timeout: remaining() }); await position.press("Tab", { timeout: remaining() });
    assert.equal(Number(await position.inputValue()), x);
    await until(async () => (imported ? single(await readObservation(page), id).entities[0].ownerPosition[0]
        : single(await readObservation(page), id).entities[0].appearance.meshMatrixWorld[12]) === x,
      DOM_MS, "위치 X 입력이 실제 선택 객체의 변환에 반영되지 않았습니다.");
  }
  async function renameSelected(page, label) {
    // 현재 선택 행의 실제 이름 변경 버튼과 native prompt를 쓴다.
    const selected = tree(page).locator('[role="treeitem"][aria-selected="true"]');
    assert.equal(await selected.count(), 1);
    await Promise.all([
      page.waitForEvent("dialog", { timeout: remaining() }).then(async (prompt) => {
        assert.equal(prompt.type(), "prompt"); assert.equal(prompt.message(), "새 이름을 입력하세요");
        await prompt.accept(label);
      }),
      selected.getByRole("button", { name: / 이름 변경$/u }).click({ timeout: remaining() }),
    ]);
    assert.equal(await row(page, label).count(), 1);
  }
  async function addBox(page, label, x, previousIds) {
    await page.locator("#bg3d-tab-shapes").first().click({ timeout: remaining() });
    await page.getByRole("button", { name: "상자 추가", exact: true }).first().click({ timeout: remaining() });
    const created = await until(async () => {
      const value = await readObservation(page), ids = value.entities.map((entity) => entity.entityId);
      const added = ids.filter((id) => !previousIds.includes(id));
      return ids.length === previousIds.length + 1 && new Set(ids).size === ids.length && added.length === 1
        && previousIds.every((id) => ids.includes(id)) ? added[0] : false;
    }, DOM_MS, "UI로 추가한 상자 ID를 유일하게 식별하지 못했습니다.");
    await renameSelected(page, label);
    await moveSelectedX(page, created, x);
    return created;
  }
  function separatedAndVisible(observation, ids) {
    const bounds = ids.map((id) => {
      const points = single(observation, id).entities[0].appearance.projectedTriangles.flat();
      assert(points.length > 0);
      return { left: Math.min(...points.map((p) => p.x)), right: Math.max(...points.map((p) => p.x)),
        top: Math.min(...points.map((p) => p.y)), bottom: Math.max(...points.map((p) => p.y)) };
    });
    const gap = 4 / (observation.canvas.width / observation.canvas.cssWidth);
    return bounds.every((b) => b.left >= gap && b.top >= gap
      && b.right <= observation.canvas.cssWidth - gap && b.bottom <= observation.canvas.cssHeight - gap)
      && (bounds[0].right + gap <= bounds[1].left || bounds[1].right + gap <= bounds[0].left
        || bounds[0].bottom + gap <= bounds[1].top || bounds[1].bottom + gap <= bounds[0].top);
  }
  async function capture(page, expected, name, result, pattern = true) {
    const before = await readObservation(page); assert(readySet(before, expected));
    const image = await screenshot(page, name), observation = await readObservation(page);
    assert(readySet(observation, expected));
    assert(separatedAndVisible(observation, [...expected.keys()]), "다른 객체·배경·클리핑이 표면 ROI에 들어올 수 있습니다.");
    const proof = {};
    for (const [id, item] of expected) {
      const delta = await compareSurfaceAppearance(page, image, image, single(before, id), single(observation, id));
      requireSameSurface(delta, "촬영 전후 실제 geometry/camera/material이 다릅니다.");
      if (pattern && item) for (const triangles of delta.patterns) assert(
        triangles.some((stats) => stats.chromaticPixels > 100 && stats.quantizedColors > 8),
        "기즈모를 제외한 객체 면 내부에 원본의 비회색 공간 무늬가 없습니다.");
      proof[id] = delta;
    }
    result.screenshots.push({ file: image.file, sha256: image.sha256 });
    // PNG Buffer는 아래 반환값을 통해 비교 중에만 사용한다. JSON 결과에는 메타와 읽기 관측값만 둔다.
    result.stages ??= [];
    result.stages.push({ image: { file: image.file, sha256: image.sha256 }, observation, proof });
    return { image, observation, proof };
  }
  async function sameObjects(page, before, after, pairs, label) {
    const comparisons = {};
    for (const [oldId, newId] of pairs) {
      const delta = await compareSurfaceAppearance(page, before.image, after.image,
        single(before.observation, oldId), single(after.observation, newId));
      requireSameSurface(delta, label); comparisons[oldId] = delta;
    }
    return comparisons;
  }
  function sameLiveTexture(before, after, id) {
    assert.equal(before.observation.observerEpoch, after.observation.observerEpoch,
      "같은 관측기 함수 인스턴스의 GPU 객체 토큰만 비교할 수 있습니다.");
    const a = single(before.observation, id).entities[0], b = single(after.observation, id).entities[0];
    if (imported) {
      assert.equal(b.materialUuid, a.materialUuid, "미선택 B의 인스턴스 전용 Material UUID가 바뀌었습니다.");
      assert.deepEqual(b.materialSettings, a.materialSettings);
      assert.deepEqual(b.auxiliaryChannels, a.auxiliaryChannels);
    }
    for (const channel of Object.keys(a.channels)) {
      if (a.channels[channel]) assert(Number.isSafeInteger(a.channels[channel].gpuIdentityToken)
        && a.channels[channel].gpuIdentityToken > 0, "B의 실제 WebGLTexture 객체 토큰이 없습니다.");
      assert.deepEqual(b.channels[channel], a.channels[channel], "미선택 B의 Texture UUID·업로드·alive 상태가 바뀌었습니다.");
    }
    // 토큰은 WebGLTexture JS 객체만 구분한다. 드라이버 내부 물리 저장소 보존은 주장하지 않는다.
  }
  async function apply(page, item, expected, pending, result) {
    const controls = await showPicker(page, item);
    await until(async () => pending() === 0 && await controls.card.locator("img").evaluateAll((images) =>
      images.length === 1 && images.every((image) => image.complete && image.naturalWidth > 0)),
    DOM_MS, "대상 원본 프리뷰 로딩이 끝나지 않았습니다.");
    const cursor = result.network.length;
    if (item.material.variants.length > 1) await controls.select.selectOption(item.variant.id, { timeout: remaining() });
    else { assert.equal(await controls.select.isDisabled(), true); assert.equal(await controls.select.inputValue(), item.variant.id); }
    assert.equal(await controls.select.inputValue(), item.variant.id);
    assert.equal(remaining(500), 500); await page.waitForTimeout(500); remaining();
    assert.equal(result.network.length, cursor, "원본 선택만으로 추가 PBR 요청이 발생했습니다.");
    const before = await readObservation(page);
    await controls.apply.click({ timeout: remaining() });
    const action = { action: "apply", variantId: item.variant.id, at: Date.now(), phase: "ui-requested" };
    result.actions.push(action);
    const ready = await waitNaturalSet(page, expected, before.frame);
    assert.equal(await controls.apply.getAttribute("aria-pressed"), "true");
    await until(() => pending() === 0, LOAD_MS, "원본 HTTP 요청이 완료되지 않았습니다.");
    for (const map of Object.values(item.variant.maps).filter(Boolean)) assert(
      result.network.some((entry) => entry.url === origin + map.url && entry.finished && !entry.failure && entry.status === 200),
      "실제 원본 요청 완료 또는 같은 세션 프리뷰/맵 캐시 근거가 없습니다.");
    Object.assign(action, { phase: "natural-ready", natural: ready });
    // 호출자는 이 다음에 촬영한다. 첫 readiness/무늬 증거 전에 선택·맞춤·다른 UI를 누르지 않는다.
  }
  async function history(page, name, expected, result, file) {
    const before = await readObservation(page);
    await viewport(page).getByRole("button", { name, exact: true }).click({ timeout: remaining() });
    const ready = await waitNaturalSet(page, expected, before.frame);
    result.actions.push({ action: name, natural: ready });
    const value = await capture(page, expected, file, result);
    await quietWindow(page, expected); return value;
  }

  async function run({ page, item01, item11, pending, result }) {
    assert.equal(item01.variant.id, "emaceart-plasticine-01-godot-2k");
    assert.equal(item11.variant.id, "emaceart-plasticine-11-godot-2k");
    await page.goto(origin + "/studio/bg3d", { waitUntil: "domcontentloaded", timeout: remaining() });
    await openEditor(page);
    assert.equal((await readObservation(page)).entities.length, 0, "새 guest context의 빈 장면이 필요합니다.");
    const { A, B } = imported
      ? await imported.createEntities({ page, result, readObservation, until, DOM_MS, remaining,
        renameSelected, moveSelectedX, row, tree, names })
      : { A: await addBox(page, names.A, -2.5, []), B: null };
    const secondId = imported ? B : await addBox(page, names.B, 2.5, [A]);
    return runPrepared({ page, A, B: secondId, item01, item11, pending, result });
  }
  async function runPrepared({ page, A, B, item01, item11, pending, result }) {
    const blank = new Map([[A, null], [B, null]]), sharedExpected = new Map([[A, item01], [B, item01]]);
    await until(async () => readySet(await readObservation(page), blank), DOM_MS, "두 객체의 실제 원본 shader가 준비되지 않았습니다.");
    // 템플릿은 카메라 복원 계약이 아니다. 기본 카메라를 유지하고 첫 재질 적용 전에만 위치를 정한다.
    // 확인 필요: 실제 dock 가시성·각 배치의 비가림/충분한 면 크기는 첫 actual 실행에서 판정한다.
    let chosenHalfSpread = null;
    for (const halfSpread of [2.5, 2, 1.5]) {
      if (halfSpread !== 2.5) {
        await selectOnly(page, names.A); await moveSelectedX(page, A, -halfSpread);
        await selectOnly(page, names.B); await moveSelectedX(page, B, halfSpread);
      }
      await selectOnly(page, names.A); await quietWindow(page, blank);
      const preflight = await readObservation(page);
      if (!separatedAndVisible(preflight, [A, B])) continue;
      const image = await screenshot(page, `multi-preflight-${halfSpread}.png`);
      let enough = true;
      for (const id of [A, B]) {
        const delta = await compareSurfaceAppearance(page, image, image, single(preflight, id), single(preflight, id));
        if (delta.comparedPixels <= 100) enough = false;
      }
      if (enough) { chosenHalfSpread = halfSpread; break; }
    }
    assert(chosenHalfSpread !== null, "기본 카메라에서 비가림·각 표면 >100px인 배치를 얻지 못했습니다. 별도 UI 맞춤 시나리오가 필요합니다.");
    result.placement = { halfSpread: chosenHalfSpread, cameraPolicy: "기본 카메라 고정; 재질 적용 전 위치만 UI로 결정" };
    const original = await capture(page, blank, "multi-blank.png", result, false);
    if (imported) {
      imported.assertSeparateInstances(original.observation, A, B);
      result.initialInstanceIdentity = original.observation.entities.map(({ entityId, meshUuid, geometryUuid, materialUuid }) =>
        ({ entityId, meshUuid, geometryUuid, materialUuid }));
    }
    if (imported) for (const id of [A, B]) {
      const entity = single(original.observation, id).entities[0];
      imported.assertOriginal(entity);
      originalById.set(id, imported.originalSnapshot(entity));
    }
    if (imported?.templateOnly) {
      // atlas 원본은 무맵으로 취급하지 않는다. Lettuce의 내 템플릿 왕복은 chair의 이력 사례와 분리한다.
      const aOnly = new Map([[A, item11], [B, null]]);
      await apply(page, item11, aOnly, pending, result);
      const firstA = await capture(page, aOnly, "lettuce-first-a.png", result);
      sameLiveTexture(original, firstA, B);
      result.bOriginalAfterA = await sameObjects(page, original, firstA, [[B, B]], "A 적용으로 B의 원본 atlas가 바뀌었습니다.");
      await quietWindow(page, aOnly); await selectOnly(page, names.B);
      const expected = new Map([[A, item11], [B, item01]]);
      await apply(page, item01, expected, pending, result);
      await capture(page, expected, "lettuce-first-b.png", result);
      await quietWindow(page, expected); await selectOnly(page, names.A); await quietWindow(page, expected);
      const restored = await capture(page, expected, "lettuce-before-save.png", result);
      imported.assertSeparateInstances(restored.observation, A, B);
      result.unavailableBundleTested = false;
      result.historyTested = false;
      return saveAndReopen({ page, A, B, item01, item11, pending, result, restored });
    }
    const aOnly = new Map([[A, item01], [B, null]]);
    await apply(page, item01, aOnly, pending, result);
    await capture(page, aOnly, "multi-first-a.png", result);
    await quietWindow(page, aOnly);
    await selectOnly(page, names.B);
    await apply(page, item01, sharedExpected, pending, result);
    await capture(page, sharedExpected, "multi-first-b.png", result);
    await quietWindow(page, sharedExpected);
    await selectOnly(page, names.A); await quietWindow(page, sharedExpected);
    const shared = await capture(page, sharedExpected, "multi-shared.png", result);
    for (const [channel, expected] of Object.entries(item01.variant.maps)) if (expected) assert.equal(
      single(shared.observation, A).entities[0].channels[channel].uuid,
      single(shared.observation, B).entities[0].channels[channel].uuid, "같은 원본의 Texture UUID를 공유하지 않습니다.");
    if (imported) imported.assertSeparateInstances(shared.observation, A, B);
    const changedExpected = new Map([[A, item11], [B, item01]]);
    await apply(page, item11, changedExpected, pending, result);
    const changed = await capture(page, changedExpected, "multi-a-changed.png", result);
    sameLiveTexture(shared, changed, B);
    result.bAfterChange = await sameObjects(page, shared, changed, [[B, B]], "A 변경으로 B 무늬가 바뀌었습니다.");
    await quietWindow(page, changedExpected);
    const undone = await history(page, "실행 취소", sharedExpected, result, "multi-change-undone.png");
    result.changeUndo = await sameObjects(page, shared, undone, [[A, A], [B, B]], "변경 Undo가 객체별 표면을 복원하지 못했습니다.");
    sameLiveTexture(shared, undone, B);
    const redone = await history(page, "다시 실행", changedExpected, result, "multi-change-redone.png");
    result.changeRedo = await sameObjects(page, changed, redone, [[A, A], [B, B]], "변경 Redo가 객체별 표면을 복원하지 못했습니다.");
    sameLiveTexture(shared, redone, B);
    const clearExpected = new Map([[A, null], [B, item01]]), beforeClear = await readObservation(page);
    let cleared;
    if (imported) {
      await imported.clearOriginal(page, remaining);
      await waitNaturalSet(page, clearExpected, beforeClear.frame);
      cleared = await capture(page, clearExpected, "multi-a-cleared.png", result);
      imported.assertOriginal(single(cleared.observation, A).entities[0]);
      assert.deepEqual(imported.originalSnapshot(single(cleared.observation, A).entities[0]), originalById.get(A),
        "A 원본 복원 뒤 GLB 고유 재질 수치가 초기 baseline과 다릅니다.");
      result.originalRestoration = await sameObjects(page, original, cleared, [[A, A]], "A 원본 복원 뒤 실제 고유 표면이 다릅니다.");
    } else {
      const sourceColor = dialog(page).getByLabel("색상(셰이딩 미리보기 전용)", { exact: true });
      result.clearSourceColor = { before: await sourceColor.inputValue({ timeout: remaining() }) };
      assert.equal(result.clearSourceColor.before, "#ffffff");
      await page.getByRole("button", { name: "표면 프리셋 해제", exact: true }).first().click({ timeout: remaining() });
      await waitNaturalSet(page, clearExpected, beforeClear.frame);
      cleared = await capture(page, clearExpected, "multi-a-cleared.png", result);
      result.clearSourceColor.after = await sourceColor.inputValue({ timeout: remaining() });
      assert.equal(result.clearSourceColor.after, result.clearSourceColor.before, "A 해제에서 제품 도형 색이 바뀌었습니다.");
      const clearedA = single(cleared.observation, A).entities[0];
      assert.deepEqual({ color: clearedA.color, roughness: clearedA.roughness, metalness: clearedA.metalness,
        opacity: clearedA.opacity, transparent: clearedA.transparent, emissive: clearedA.emissive,
        emissiveIntensity: clearedA.emissiveIntensity, wireframe: clearedA.wireframe },
      { color: [1, 1, 1], roughness: 1, metalness: 0, opacity: 1, transparent: false,
        emissive: [0, 0, 0], emissiveIntensity: 1, wireframe: false }, "A 해제 뒤 실제 기본 표면 값이 다릅니다.");
    }
    sameLiveTexture(shared, cleared, B);
    result.bAfterClear = await sameObjects(page, changed, cleared, [[B, B]], "A 해제로 B 무늬가 바뀌었습니다.");
    await quietWindow(page, clearExpected);
    let restored = await history(page, "실행 취소", changedExpected, result, "multi-clear-undone.png");
    result.clearUndo = await sameObjects(page, changed, restored, [[A, A], [B, B]], "해제 Undo가 객체별 표면을 복원하지 못했습니다.");
    sameLiveTexture(shared, restored, B);
    if (imported) {
      const clearRedone = await history(page, "다시 실행", clearExpected, result, "multi-clear-redone.png");
      imported.assertOriginal(single(clearRedone.observation, A).entities[0]);
      assert.deepEqual(imported.originalSnapshot(single(clearRedone.observation, A).entities[0]), originalById.get(A));
      result.clearRedo = await sameObjects(page, cleared, clearRedone, [[A, A], [B, B]], "원본 복원 Redo가 객체별 표면을 복원하지 못했습니다.");
      sameLiveTexture(shared, clearRedone, B);
      const reapplied = await history(page, "실행 취소", changedExpected, result, "multi-clear-redo-undone.png");
      result.clearRedoUndo = await sameObjects(page, restored, reapplied, [[A, A], [B, B]], "원본 복원 재실행의 Undo가 객체별 표면을 복원하지 못했습니다.");
      sameLiveTexture(shared, reapplied, B); restored = reapplied;
    }
    return saveAndReopen({ page, A, B, item01, item11, pending, result, restored });
  }
  async function saveAndReopen({ page, A, B, item01, item11, pending, result, restored }) {
    const templatesTab = dialog(page).locator("#bg3d-tab-templates");
    assert.equal(await templatesTab.count(), 1); await templatesTab.click({ timeout: remaining() });
    const library = dialog(page).locator('section[aria-labelledby="bg3d-user-template-library-title"]');
    assert.equal(await library.count(), 1);
    const save = library.getByRole("button", { name: "현재 장면을 내 템플릿으로 저장", exact: true });
    assert.equal(await save.count(), 1);
    await until(() => save.isEnabled(), DOM_MS, "템플릿 저장 UI가 준비되지 않았습니다.");
    await save.click({ timeout: remaining() });
    const saved = library.getByRole("button", { name: /^내 소재 .+ 적용$/u });
    await saved.waitFor({ state: "visible", timeout: remaining() }); assert.equal(await saved.count(), 1);
    if (imported) await saved.scrollIntoViewIfNeeded({ timeout: remaining() });
    const templateButtonName = await saved.getAttribute("aria-label"); assert(templateButtonName);
    if (imported) await imported.requireSavedSourceIdentity({ page, result, names, A, B, templateButtonName, observation: restored.observation });
    await releaseObserverReader(page);
    await page.reload({ waitUntil: "domcontentloaded", timeout: remaining() }); await openEditor(page);
    const empty = await readObservation(page); assert.equal(empty.entities.length, 0);
    const reopenedTab = dialog(page).locator("#bg3d-tab-templates");
    assert.equal(await reopenedTab.count(), 1); await reopenedTab.click({ timeout: remaining() });
    const reopenedCard = dialog(page).locator('section[aria-labelledby="bg3d-user-template-library-title"]')
      .getByRole("button", { name: templateButtonName, exact: true });
    assert.equal(await reopenedCard.count(), 1); await reopenedCard.click({ timeout: remaining() });
    // 템플릿은 ID를 재발급한다. material source로 대응시키면 잘못 적용된 객체끼리 바꿔치기할 수 있다.
    // 먼저 고정된 실제 위치/geometry로만 대응시키고, 그 새 ID의 materialReady를 별도로 검사한다.
    let reopenedIds, lastNotReadyFrame = empty.frame;
    await until(async () => {
      const value = await readObservation(page);
      if (value.entities.length !== 2) { lastNotReadyFrame = Math.max(lastNotReadyFrame, value.frame); return false; }
      const ids = [A, B].map((id) => {
        const old = single(restored.observation, id).entities[0].appearance;
        const matches = value.entities.filter((entity) => JSON.stringify(entity.appearance?.meshMatrixWorld) === JSON.stringify(old.meshMatrixWorld)
          && JSON.stringify(entity.appearance?.geometry) === JSON.stringify(old.geometry));
        return matches.length === 1 ? matches[0].entityId : null;
      });
      const expected = new Map([[ids[0], item11], [ids[1], item01]]);
      if (ids.some((id) => !id || id === A || id === B) || new Set(ids).size !== 2 || !readySet(value, expected)) {
        lastNotReadyFrame = Math.max(lastNotReadyFrame, value.frame); return false;
      }
      if (value.frame <= lastNotReadyFrame) return false;
      reopenedIds = ids; return true;
    }, LOAD_MS, "새 ID 두 객체의 원래 위치·geometry·자연 GPU 준비를 복원하지 못했습니다.");
    const [newA, newB] = reopenedIds, reopenedExpected = new Map([[newA, item11], [newB, item01]]);
    await until(() => pending() === 0, LOAD_MS, "재열기 원본 HTTP 요청이 완료되지 않았습니다.");
    // 선택 정규화가 첫 재표시를 살리지 못하게, 추가 UI 입력 전 두 실제 패턴을 먼저 증거로 남긴다.
    await capture(page, reopenedExpected, "multi-reopened-before-selection.png", result);
    await selectOnly(page, names.A); await quietWindow(page, reopenedExpected);
    const reopened = await capture(page, reopenedExpected, "multi-reopened.png", result);
    result.reopen = await sameObjects(page, restored, reopened, [[A, newA], [B, newB]], "재열기 뒤 위치별 실제 원본 무늬가 다릅니다.");
    if (imported) {
      imported.assertSeparateInstances(reopened.observation, newA, newB);
      result.representativeModelOnly = true;
      result.allImportedFormatsVerified = false;
    }
    result.durableStorageProof = { method: "reader-disposed-reload-empty-scene-exact-ui-card-apply-natural-render",
      templateButtonName, reloadedEmptyScene: true, exactCardApplied: true, naturalSurfacesMatched: true };
    result.ids = { before: { A, B }, reopened: { A: newA, B: newB } };
    result.textureEvidenceLimit = "같은 observe 함수·epoch에서 B의 Three Texture UUID와 native WebGLTexture JS 객체 토큰·업로드·alive·표면 보존을 확인. 드라이버 내부 물리 저장소와 재열기 handle 보존은 주장하지 않음.";
    // 최종 passed는 호출자의 page/console/network/source/cleanup gate까지 끝난 뒤에만 기록한다.
    result.scenarioCompleted = true;
  }
  return { run, oneEntityObservation: single };
}
