/** 실제 GLB 파일 UI와 일반 복제로 만든 두 인스턴스만 검사한다. import 자체로 실행하지 않는다. */
import assert from "node:assert/strict";
import { createMultiObjectScenario } from "./multi-object-scenario.mjs";

export const IMPORTED_CASE_ID = "imported-model-same-source-material-isolation";
export const IMPORTED_FIXTURE = Object.freeze({
  relativePath: "apps/web/public/assets/studio/cc0-20260906/assets/kenney-furniture/chair.glb",
  bytes: 10756, sha256: "c8a11eec93e89e31250ba91afc1b8d56c3bec7ae86640fd1239f595ff4180883",
  provenance: [
    { relativePath: "apps/web/public/assets/studio/cc0-20260906/assets/kenney-furniture/LICENSE-561.txt", bytes: 614,
      sha256: "bc0de1a0742cb490f9ed4bae0bd284286ebb27e23149b9917c7d8c0d590b8b29" },
    { relativePath: "apps/web/public/assets/studio/cc0-20260906/manifest.json", bytes: 2673556,
      sha256: "6ca5e148638d0e189d122e9474b0c381acdae037635fbb73da42a9c45244cc7b" },
  ],
  cardName: "chair 장면에 추가", sourceLinearColor: [0.8962264, 0.6015712, 0.3931559],
});

function originalSnapshot(entity) {
  const fields = ["materialType", "color", "roughness", "metalness", "normalMapType", "normalScale", "opacity",
    "transparent", "emissive", "emissiveIntensity", "wireframe", "materialSettings", "channels", "auxiliaryChannels"];
  return Object.fromEntries(fields.map((key) => [key, entity[key]]));
}
function originalReady(entity, baseline) {
  if (entity.entityKind !== "model" || entity.materialType !== "MeshStandardMaterial"
    || Object.values(entity.auxiliaryChannels).some((channel) => channel !== null)) return false;
  return !baseline || JSON.stringify(originalSnapshot(entity)) === JSON.stringify(baseline);
}
function assertOriginal(entity) {
  assert.equal(entity.entityKind, "model"); assert.equal(entity.materialType, "MeshStandardMaterial");
  assert.deepEqual(entity.color, IMPORTED_FIXTURE.sourceLinearColor, "GLB 원본의 linear baseColorFactor와 다릅니다.");
  assert.equal(entity.roughness, 1); assert.equal(entity.metalness, 0);
  assert.equal(entity.opacity, 1); assert.equal(entity.transparent, false);
  assert.deepEqual(entity.emissive, [0, 0, 0]); assert.equal(entity.emissiveIntensity, 1);
  assert.equal(entity.wireframe, false); assert.equal(entity.materialSettings.side, 0);
  assert(Object.values(entity.channels).every((channel) => channel === null));
  assert(Object.values(entity.auxiliaryChannels).every((channel) => channel === null));
}
function assertSeparateInstances(observation, A, B) {
  const a = observation.entities.filter((entry) => entry.entityId === A), b = observation.entities.filter((entry) => entry.entityId === B);
  assert.equal(a.length, 1); assert.equal(b.length, 1);
  assert.notEqual(a[0].meshUuid, b[0].meshUuid, "같은 mesh를 두 인스턴스로 세었습니다.");
  assert.equal(a[0].geometryUuid, b[0].geometryUuid, "같은 source cache의 geometry를 공유하지 않습니다.");
  assert.notEqual(a[0].materialUuid, b[0].materialUuid, "두 모델 인스턴스가 같은 mutable Material을 공유합니다.");
}

/**
 * 실제 카드의 committed owner props만 읽는다. 저장소·제품 callback·제품 accessor는 호출하지 않는다.
 * 이 결과는 UI render state다. durable 증거는 이후 reload → UI 목록 → 같은 카드 적용으로 분리한다.
 */
export async function requireSavedSourceIdentity({ page, result, names, A, B, observation, templateButtonName, core, fixture = IMPORTED_FIXTURE }) {
  assert.equal(typeof templateButtonName, "string");
  assert.match(templateButtonName, /^내 소재 .+ 적용$/u);
  const cap = core.remaining(core.DOM_MS);
  const value = await core.bounded(page.evaluate(({ exactLabel, timeoutMs }) => {
    const deadline = performance.now() + timeoutMs;
    const fail = (message) => { throw new Error(message); };
    const withinBudget = () => {
      if (performance.now() >= deadline) fail("현재 UI 트리 관측 기한을 소진했습니다.");
    };
    // 값 접근 전에 own data descriptor를 확인한다. getter·toJSON·제품 함수를 실행하지 않는다.
    const own = (object, key) => {
      if (object === null || (typeof object !== "object" && typeof object !== "function")) {
        return fail("관측 대상이 own data property 소유자가 아닙니다.");
      }
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return fail("관측 필드가 없거나 accessor입니다: " + key);
      }
      return descriptor.value;
    };
    const optionalOwn = (object, key) => Object.getOwnPropertyDescriptor(object, key) === undefined ? null : own(object, key);
    const record = (object) => {
      if (object === null || typeof object !== "object" || Array.isArray(object)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(object))) fail("평면 UI 데이터가 아닙니다.");
      return object;
    };
    const array = (object, length) => {
      if (!Array.isArray(object) || own(object, "length") !== length) fail("fresh context의 UI 데이터 개수가 다릅니다.");
      return Array.from({ length }, (_, index) => own(object, String(index)));
    };
    const text = (object, key, maximum = 80) => {
      const value = own(record(object), key);
      if (typeof value !== "string" || value.length === 0 || value.length > maximum
        || value.trim() !== value || Array.from(value).some((character) =>
          character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f)) fail("유효한 UI 문자열이 아닙니다: " + key);
      return value;
    };
    const id = (object, key) => {
      const value = text(object, key);
      if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u.test(value)
        || ["constructor", "prototype", "__proto__"].includes(value.toLowerCase())) fail("유효한 canonical id가 아닙니다.");
      return value;
    };
    const vec3 = (object) => array(object, 3).map((number) => {
      if (typeof number !== "number" || !Number.isFinite(number)) fail("유한한 transform 성분이 아닙니다.");
      return number;
    });
    const unique = (values, label) => {
      if (values.length !== 1) fail("유일한 실제 UI 대상이 아닙니다: " + label);
      return values[0];
    };
    // 표준 DOM 읽기만 수행한다. 제품 이벤트·focus·click·스크롤·상태 setter를 호출하지 않는다.
    const visible = (element) => {
      if (!(element instanceof HTMLElement) || !document.documentElement.contains(element)
        || element.closest('[hidden], [inert], [aria-hidden="true"]') || element.getClientRects().length === 0) return false;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.getPropertyValue("display") === "none" || style.getPropertyValue("visibility") !== "visible"
          || style.getPropertyValue("content-visibility") === "hidden" || Number(style.getPropertyValue("opacity")) === 0) return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
        && rect.top < document.documentElement.clientHeight && rect.left < document.documentElement.clientWidth;
    };
    const dialog = unique(Array.from(document.querySelectorAll('[data-testid="studio-bg3d-dialog"]')), "BG3D dialog");
    const panel = unique(Array.from(document.querySelectorAll('section[aria-labelledby="bg3d-user-template-library-title"]')), "내 템플릿 panel");
    if (!dialog.contains(panel) || !visible(dialog) || !visible(panel)) fail("템플릿 panel이 실제 표시된 dialog에 없습니다.");
    const card = unique(Array.from(panel.querySelectorAll("article")), "fresh context template card");
    const button = unique(Array.from(panel.querySelectorAll("button[aria-label]"))
      .filter((element) => element.getAttribute("aria-label") === exactLabel), "정확한 template 적용 버튼");
    if (!visible(card) || !visible(button) || button.parentElement !== card
      || button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true") fail("유일한 활성 template 카드가 표시되지 않았습니다.");

    // 기존 passive-entry에는 DOM current resolver가 없다. attached fiber는 root 발견에만 사용한다.
    // stale attached fiber/alternate의 props는 읽지 않고 HostRoot.stateNode.current child 그래프만 탐색한다.
    const fiberKeys = [panel, card, button].map((element) => unique(Object.getOwnPropertyNames(element)
      .filter((key) => key.startsWith("__reactFiber$")), "React DOM backing key"));
    if (new Set(fiberKeys).size !== 1) fail("카드와 panel이 같은 React DOM renderer 소유가 아닙니다.");
    const attached = [panel, card, button].map((element, index) => own(element, fiberKeys[index]));
    const rootStateFor = (fiber) => {
      const visited = new Set();
      for (let depth = 0; depth < 512; depth++) {
        withinBudget();
        if (!fiber || typeof fiber !== "object" || visited.has(fiber)) fail("React root 경로가 유효하지 않습니다.");
        visited.add(fiber);
        const parent = own(fiber, "return");
        if (parent === null) {
          if (own(fiber, "tag") !== 3) fail("React DOM HostRoot를 확정할 수 없습니다.");
          const state = own(fiber, "stateNode"), current = own(state, "current");
          if (own(current, "tag") !== 3 || own(current, "stateNode") !== state
            || own(current, "return") !== null) fail("현재 committed HostRoot가 아닙니다.");
          return state;
        }
        fiber = parent;
      }
      return fail("React root 깊이 제한을 초과했습니다.");
    };
    const roots = attached.map(rootStateFor), rootState = roots[0];
    if (roots.some((root) => root !== rootState)) fail("template DOM 대상의 React root가 다릅니다.");
    const currentRoot = own(rootState, "current");
    const parents = new Map(), targets = new Map([[panel, []], [card, []], [button, []]]);
    const pending = [{ fiber: currentRoot, parent: null }];
    while (pending.length > 0) {
      withinBudget();
      const { fiber, parent } = pending.pop();
      if (!fiber || typeof fiber !== "object" || parents.has(fiber) || parents.size >= 100000) {
        fail("현재 React 트리의 중복·순환·크기 한도를 확인했습니다.");
      }
      parents.set(fiber, parent);
      const node = own(fiber, "stateNode");
      if (targets.has(node)) targets.get(node).push(fiber);
      const child = own(fiber, "child"), sibling = own(fiber, "sibling");
      if (sibling !== null) {
        if (parent === null) fail("HostRoot sibling은 허용하지 않습니다.");
        pending.push({ fiber: sibling, parent });
      }
      if (child !== null) pending.push({ fiber: child, parent: fiber });
    }
    const currentFibers = [panel, card, button].map((element, index) => {
      const fiber = unique(targets.get(element), "current DOM fiber");
      if (own(fiber, "tag") !== 5 || (fiber !== attached[index] && own(attached[index], "alternate") !== fiber)) {
        fail("DOM backing fiber가 현재 HostComponent와 일치하지 않습니다.");
      }
      for (let cursor = fiber; cursor !== null; cursor = parents.get(cursor)) {
        if (!parents.has(cursor)) fail("current 트리의 유일한 membership이 없습니다.");
        const derivedParent = parents.get(cursor), returnParent = own(cursor, "return");
        if (returnParent !== derivedParent) {
          // React slow path의 shared child list만 허용한다. owner는 계속 current map에서만 고른다.
          if (derivedParent === null || returnParent === null || own(derivedParent, "alternate") !== returnParent
            || own(returnParent, "alternate") !== derivedParent || own(derivedParent, "child") !== own(returnParent, "child")) {
            fail("current 부모 경로 또는 대칭 shared child list를 확정할 수 없습니다.");
          }
        }
        const alternate = own(cursor, "alternate");
        if (alternate !== null && (parents.has(alternate) || own(alternate, "alternate") !== cursor)) {
          fail("현재 경로와 stale alternate 경로를 구분할 수 없습니다.");
        }
      }
      return fiber;
    });
    const [panelFiber, cardFiber, buttonFiber] = currentFibers;
    const owner = parents.get(panelFiber), grid = parents.get(cardFiber);
    if (own(panelFiber, "type") !== "section" || own(cardFiber, "type") !== "article" || own(buttonFiber, "type") !== "button"
      || parents.get(buttonFiber) !== cardFiber || own(grid, "tag") !== 5 || own(grid, "type") !== "div"
      || parents.get(grid) !== panelFiber || own(owner, "tag") !== 0) fail("현재 panel owner → grid → card → button 구조가 다릅니다.");
    const ownerType = own(owner, "type"), ownerElementType = own(owner, "elementType");
    if (typeof ownerType !== "function" || own(ownerType, "name") !== "StudioBg3dUserTemplateLibraryPanel") {
      fail("실제 템플릿 panel의 현재 resolved owner를 확정하지 못했습니다.");
    }
    // 현재 제품은 React.lazy wrapper를 쓴다. 이미 resolved된 payload만 읽고 _init·then은 호출하지 않는다.
    if (own(record(ownerElementType), "$$typeof") !== Symbol.for("react.lazy")) fail("현재 제품의 lazy panel wrapper가 아닙니다.");
    const lazyPayload = record(own(ownerElementType, "_payload"));
    if (own(lazyPayload, "_status") !== 1 || own(record(own(lazyPayload, "_result")), "default") !== ownerType) {
      fail("이미 resolved된 lazy payload와 현재 panel owner type이 다릅니다.");
    }
    const props = own(owner, "memoizedProps"), panelProps = own(panelFiber, "memoizedProps"), buttonProps = own(buttonFiber, "memoizedProps");
    if (own(props, "status") !== "ready" || own(props, "isSaving") !== false || own(props, "applyingTemplateId") !== null
      || own(props, "applyDisabled") !== false || own(panelProps, "aria-labelledby") !== "bg3d-user-template-library-title"
      || own(buttonProps, "aria-label") !== exactLabel || own(buttonProps, "disabled") !== false) fail("현재 owner의 저장 완료·적용 가능 UI 상태가 아닙니다.");
    const entry = record(array(own(props, "entries"), 1)[0]);
    const templateId = id(entry, "id"), templateName = text(entry, "name");
    if (templateName + " 적용" !== exactLabel || own(cardFiber, "key") !== templateId) fail("exact template id/name과 실제 카드 key가 다릅니다.");

    const sceneDocument = record(own(entry, "document"));
    if (own(sceneDocument, "kind") !== "toonstudio.bg3d-scene" || own(sceneDocument, "version") !== 3) fail("현재 canonical entry document 버전이 아닙니다.");
    // 이름·id·변환·attachment identity만 새 평면 값으로 투영한다. raw payload·thumbnail·전체 entry는 반환하지 않는다.
    const nodes = array(own(sceneDocument, "nodes"), 2).map((raw) => {
      const node = record(raw), kind = own(node, "kind"), transform = record(own(node, "transform"));
      if (kind !== "model") fail("저장한 두 노드가 model이 아닙니다.");
      const linkedSourceId = optionalOwn(node, "linkedSourceId");
      if (linkedSourceId !== null) fail("일반 복제 대신 연결 복제 노드를 관측했습니다.");
      return { id: id(node, "id"), name: text(node, "name"), kind, attachmentId: id(node, "attachmentId"), linkedSourceId,
        transform: { position: vec3(own(transform, "position")), rotation: vec3(own(transform, "rotation")), scale: vec3(own(transform, "scale")) } };
    });
    const attachments = array(own(sceneDocument, "attachments"), 1).map((raw) => {
      const attachment = record(raw), hash = own(attachment, "hash"), byteSize = own(attachment, "byteSize"),
        mime = own(attachment, "mime"), source = own(attachment, "source");
      if (typeof hash !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(hash) || !Number.isSafeInteger(byteSize)
        || byteSize <= 0 || mime !== "model/gltf-binary" || source !== "local-library") fail("local-library canonical attachment identity가 아닙니다.");
      return { id: id(attachment, "id"), hash, byteSize, mime, source };
    });
    withinBudget();
    if (own(rootState, "current") !== currentRoot || !visible(panel) || !visible(card) || !visible(button)
      || button.getAttribute("aria-label") !== exactLabel) fail("관측 중 현재 UI 소유권이 바뀌었습니다.");
    return { template: { id: templateId, name: templateName }, nodes, attachments };
  }, { exactLabel: templateButtonName, timeoutMs: cap }), cap, "현재 template 카드의 읽기 전용 UI 관측 기한을 소진했습니다.");
  const { nodes, attachments, template } = value;
  assert.equal(nodes.length, 2); assert.equal(attachments.length, 1);
  assert.equal(template.name + " 적용", templateButtonName);
  const a = nodes.filter((node) => node.id === A && node.name === names.A);
  const b = nodes.filter((node) => node.id === B && node.name === names.B);
  assert.equal(a.length, 1); assert.equal(b.length, 1); assert.equal(a[0].kind, "model"); assert.equal(b[0].kind, "model");
  assert.equal(a[0].linkedSourceId, null); assert.equal(b[0].linkedSourceId, null, "연결 복제를 일반 복제로 대신할 수 없습니다.");
  for (const node of [a[0], b[0]]) {
    const matches = observation.entities.filter((entity) => entity.entityId === node.id);
    assert.equal(matches.length, 1);
    assert.deepEqual(node.transform.position, matches[0].ownerPosition, "현재 카드 문서의 위치와 실제 model owner 위치가 다릅니다.");
  }
  assert.equal(a[0].attachmentId, b[0].attachmentId, "두 인스턴스의 canonical source attachment가 다릅니다.");
  const attachment = attachments[0]; assert.equal(attachment.id, a[0].attachmentId);
  assert.equal(attachment.hash, "sha256:" + fixture.sha256);
  assert.equal(attachment.byteSize, fixture.bytes); assert.equal(attachment.mime, "model/gltf-binary");
  assert.equal(attachment.source, "local-library");
  result.sourceIdentity = { method: "actual-file-ui-once-ordinary-duplicate-and-committed-template-card-props",
    nodes, attachments, template, observationScope: "committed-ui-render-state", durableStorageProofObserved: false,
    runtimeModelIdObserved: false, canonicalAttachmentIdentityObserved: true };
}

/** 실제 파일 UI 한 번과 일반 복제로 같은 원본의 두 모델을 만든다. */
export function createImportedEntities(core, fixtureUpload, fixture = IMPORTED_FIXTURE) {
  return async function createEntities({ page, result, readObservation, until, DOM_MS, remaining, renameSelected, moveSelectedX, row, tree, names }) {
    const dialog = page.getByTestId("studio-bg3d-dialog");
    const tab = page.locator("#bg3d-tab-models"); assert.equal(await tab.count(), 1);
    await tab.click({ timeout: remaining() });
    const library = dialog.locator('section[aria-labelledby="bg3d-asset-library-title"]');
    await library.waitFor({ state: "visible", timeout: remaining() }); assert.equal(await library.count(), 1);
    const rights = library.locator("details").filter({ has: page.locator("summary").filter({ hasText: "이용 권리 기록" }) });
    assert.equal(await rights.count(), 1);
    if (await rights.getAttribute("open") === null) await rights.locator(":scope > summary").click({ timeout: remaining() });
    await rights.getByRole("radio", { name: /^공개 이용/u }).click({ timeout: remaining() });
    await rights.getByRole("checkbox", { name: "상업 작품에 사용할 수 있음", exact: true }).check({ timeout: remaining() });
    const upload = library.getByRole("button", { name: "3D 모델 및 연결 파일 가져오기", exact: true });
    await until(() => upload.isEnabled(), DOM_MS, "원본 권리 폼이 준비되지 않았습니다.");
    // 실제 파일 선택 UI에 원본 GLB를 한 번 전달한다. 제품 document/cache에 값을 직접 쓰지 않는다.
    const input = library.getByLabel("3D 모델 및 연결 파일 선택", { exact: true }); assert.equal(await input.count(), 1);
    await input.setInputFiles(fixtureUpload, { timeout: remaining() });
    const A = await until(async () => {
      const observation = await readObservation(page);
      return observation.entities.length === 1 && observation.entityMeshes.length === 1
        && observation.entities[0].entityKind === "model" ? observation.entities[0].entityId : false;
    }, core.LOAD_MS, "실제 파일 가져오기가 한 모델 인스턴스를 만들지 못했습니다.");
    const search = library.getByRole("searchbox", { name: "3D 모델 라이브러리 검색", exact: true });
    assert.equal(await search.count(), 1);
    const basename = fixtureUpload.name.replace(/\.glb$/iu, "");
    await search.fill(basename, { timeout: remaining() });
    assert.equal(await search.inputValue(), basename);
    const card = library.getByRole("button", { name: fixture.cardName, exact: true });
    await card.waitFor({ state: "visible", timeout: remaining() });
    assert.equal(await card.count(), 1); await until(() => card.isEnabled(), DOM_MS, "검증된 원본 카드가 준비되지 않았습니다.");
    await renameSelected(page, names.A); await moveSelectedX(page, A, -2.5);
    const a = row(page, names.A); assert.equal(await a.count(), 1);
    await a.getByRole("button", { name: names.A + " 복제", exact: true }).click({ timeout: remaining() });
    const B = await until(async () => {
      const observation = await readObservation(page), ids = observation.entities.map((entry) => entry.entityId);
      const added = ids.filter((id) => id !== A);
      return observation.entityMeshes.length === 2 && ids.length === 2 && ids.includes(A) && added.length === 1 ? added[0] : false;
    }, DOM_MS, "일반 복제 UI가 같은 원본의 별도 인스턴스를 만들지 못했습니다.");
    assert.equal(await tree(page).locator('[role="treeitem"][aria-selected="true"]').count(), 1);
    await renameSelected(page, names.B); await moveSelectedX(page, B, 2.5);
    result.importUi = { fileSelections: 1, fixture, createB: "outliner ordinary duplicate", linkedDuplicate: false, librarySearch: basename };
    return { A, B };
  };
}

export function createImportedMaterialScenario(core, fixtureUpload) {
  assert.equal(typeof core.bounded, "function");
  assert.equal(fixtureUpload.name, "chair.glb"); assert.equal(fixtureUpload.mimeType, "model/gltf-binary");
  assert(Buffer.isBuffer(fixtureUpload.buffer)); assert.equal(fixtureUpload.buffer.byteLength, IMPORTED_FIXTURE.bytes);
  return createMultiObjectScenario(core, {
    names: { A: "가져온 격리 A", B: "가져온 격리 B" }, originalReady, originalSnapshot, assertOriginal,
    assertSeparateInstances, requireSavedSourceIdentity: (args) => requireSavedSourceIdentity({ ...args, core }),
    async clearOriginal(page, remaining) {
      const dialog = page.getByTestId("studio-bg3d-dialog");
      const restore = dialog.getByRole("button", { name: "원본 복원", exact: true });
      assert.equal(await restore.count(), 1); await restore.click({ timeout: remaining() });
      const instanceEdit = dialog.getByRole("checkbox", { name: "인스턴스 재질 편집", exact: true });
      assert.equal(await instanceEdit.count(), 1);
      await core.until(async () => await instanceEdit.isChecked() === false, core.DOM_MS,
        "원본 복원 UI의 인스턴스 재질 편집 해제가 반영되지 않았습니다.");
    },
    createEntities: createImportedEntities(core, fixtureUpload),
  });
}
