import assert from "node:assert/strict";

import { isStudioSpecialistRuntimeEntry } from "./studio-specialist-bundle-boundary.mjs";

// 저장소 Node 검사와 전체 Vitest 수집에서 같은 회귀를 실행한다.
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const source = "src/domains/creator/bg3d/studio-bg3d-three-webgpu-entry.ts";
const renderer = "src/domains/creator/bg3d/studio-bg3d-three-webgpu-renderer.ts";
const identity = { runtimeEntrySource: source, runtimeChunkName: "studio-bg3d-three-webgpu" };
const productionEntries = {
  [source]: { src: source, file: "assets/studio-bg3d-three-webgpu-entry-DZKwzkLy.js", isDynamicEntry: true,
    imports: [renderer, "_three.webgpu-wzicJUmi.js", "_three.tsl-DuJQA6j-.js"] },
  [renderer]: { src: renderer, file: "assets/studio-bg3d-three-webgpu-renderer-DaIwdFWS.js", isDynamicEntry: true,
    imports: ["_three.webgpu-wzicJUmi.js"] },
  "_three.webgpu-wzicJUmi.js": { file: "assets/three.webgpu-wzicJUmi.js" },
  "_three.tsl-DuJQA6j-.js": { file: "assets/three.tsl-DuJQA6j-.js" },
};
const select = (manifest, policy = identity) => Object.entries(manifest)
  .filter(([key, entry]) => isStudioSpecialistRuntimeEntry(key, entry, policy))
  .map(([key]) => key);

test("실제 manifest의 entry·renderer helper·vendor를 canonical source entry 하나로 식별한다", () => {
  const legacy = Object.entries(productionEntries).filter(([key, entry]) =>
    key.includes(identity.runtimeChunkName) || entry.file.includes(identity.runtimeChunkName));
  assert.equal(legacy.length, 2);
  assert.deepEqual(select(productionEntries), [source]);
});

test("helper만 있거나 runtime 이름만 흉내 낸 출력은 누락된 source entry를 대체하지 않는다", () => {
  const withoutSource = Object.fromEntries(Object.entries(productionEntries).filter(([key]) => key !== source));
  withoutSource["_opaque.js"] = { name: identity.runtimeChunkName, file: "assets/studio-bg3d-three-webgpu-HASH.js" };
  assert.deepEqual(select(withoutSource), []);
});

test("같은 source의 manifest entry가 중복되면 두 개를 유지해 기존 단일 entry 검사가 거부한다", () => {
  assert.deepEqual(select({ ...productionEntries, "_duplicate.js": { ...productionEntries[source] } }), [source, "_duplicate.js"]);
});

test("동일 접두사의 다른 source는 canonical entry가 아니다", () => {
  for (const suffix of ["renderer.ts", "entry-helper.ts", "entry.ts.backup", "entry.tsx"]) {
    const other = `src/domains/creator/bg3d/studio-bg3d-three-webgpu-${suffix}`;
    assert.equal(isStudioSpecialistRuntimeEntry(other, { src: other, file: "assets/studio-bg3d-three-webgpu-entry-HASH.js" }, identity), false);
  }
});

test("Vite source key 또는 src의 정확한 정체성을 쓰고 출력 해시 이름에 의존하지 않는다", () => {
  assert.equal(isStudioSpecialistRuntimeEntry(source, { file: "assets/opaque-HASH.js" }, identity), true);
  assert.equal(isStudioSpecialistRuntimeEntry("_opaque.js", { src: source, file: "assets/opaque-HASH.js" }, identity), true);
});

test("수동 Babylon runtime 청크의 기존 식별과 0·1·2개 판정 입력을 유지한다", () => {
  const name = "studio-bg3d-babylon-runtime";
  const policy = { runtimeChunkName: name };
  assert.deepEqual(select({ "entry.ts": { file: "assets/entry-HASH.js" } }, policy), []);
  const one = { [`_${name}-FIRST.js`]: { file: `assets/${name}-FIRST.js` } };
  assert.deepEqual(select(one, policy), [`_${name}-FIRST.js`]);
  assert.equal(select({ ...one, "_opaque.js": { file: `assets/${name}-SECOND.js` } }, policy).length, 2);
});
