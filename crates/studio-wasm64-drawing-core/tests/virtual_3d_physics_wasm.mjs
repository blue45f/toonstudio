/** CPU WASM 실행 검증. 브라우저·오디오 장치·GPU·VRM 장면 통합 증거가 아니다. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const crate = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(crate, "../..");
async function load(path) {
  const bytes = readFileSync(path);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return { e: instance.exports, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}
function floats(e, values) {
  const ptr = e.wasm_alloc(values.length * 4);
  assert.ok(ptr > 0);
  new Float32Array(e.memory.buffer, ptr, values.length).set(values);
  return ptr;
}
function view(e, ptr, count) { return Array.from(new Float32Array(e.memory.buffer, ptr, count)); }
const checked = await load(resolve(root, "apps/web/public/wasm/studio-wasm64-drawing-core.wasm"));
const qPath = process.argv[2];
if (qPath) assert.equal(checked.sha256, (await load(qPath)).sha256);
const current = {};
for (const mode of ["default", "extended", "physics"]) {
  const item = await load(resolve(crate, `target/wave58a-${mode}.optimized.wasm`));
  current[mode] = item;
  assert.equal(item.e.wasm_drawing_core_abi_version(), 1);
  assert.equal(item.e.wasm_hotpath_capabilities(), 127);
  for (const key of Object.keys(checked.e)) assert.ok(key in item.e, `${mode}: base export ${key}`);
}
assert.ok(current.default.bytes < 48 * 1024);
assert.deepEqual(Object.keys(current.default.e).sort(), Object.keys(checked.e).sort());
for (const ratio of [0, 0.25, 0.5, 1]) {
  const args = [0xff123456, 0xffefcdab, ratio];
  assert.equal(current.default.e.wasm_mix_pigments_km_packed(...args), checked.e.wasm_mix_pigments_km_packed(...args));
}
assert.equal(current.extended.e.wasm_extended_3d_capabilities(), 7);
assert.equal(current.physics.e.wasm_extended_3d_capabilities(), 63);
for (const name of ["wasm_encode_morton_2d_u32", "wasm_encode_morton_3d_u32", "wasm_skin_vrm_mesh_4bone_soa", "wasm_extract_lt_lineart_from_gbuffer"]) {
  assert.ok(name in current.extended.e && name in current.physics.e);
  assert.ok(!(name in current.default.e));
}
for (const name of ["wasm_step_verlet_spring_chains_soa", "wasm_solve_finger_fabrik_chain", "wasm_render_foley_biquad_block"]) {
  assert.ok(name in current.physics.e);
  assert.ok(!(name in current.extended.e) && !(name in current.default.e));
}
const e = current.physics.e;
const allocations = [];
function alloc(values) { const ptr = floats(e, values); allocations.push([ptr, values.length * 4]); return ptr; }
const pos = alloc([0, 1, 0]); const prev = alloc([0, 1, 0]);
const mass = alloc([1]); const rest = alloc([0]);
assert.equal(e.wasm_step_verlet_spring_chains_soa(pos, prev, mass, rest, 0, 1, 0, 4, 0), 1);
assert.ok(view(e, pos, 3).every(Number.isFinite));
assert.ok(view(e, pos, 3)[1] < 1);
assert.equal(e.wasm_step_verlet_spring_chains_soa(pos, pos, mass, rest, 0, 1, 0, 4, 0), -1);
assert.equal(e.wasm_step_verlet_spring_chains_soa(0, 0, 0, 0, 0, 65537, 0, 4, 0), -3);
const joints = alloc(Array(12).fill(0)); const lengths = alloc([0.04, 0.03, 0.02]); const target = alloc([0, -0.04, 0.05]);
assert.ok(e.wasm_solve_finger_fabrik_chain(joints, lengths, target, 24, 0) >= 0);
const solved = view(e, joints, 12);
assert.ok(solved.every(Number.isFinite));
for (let i = 0; i < 3; i++) {
  const distance = Math.hypot(...[0, 1, 2].map((axis) => solved[3 * (i + 1) + axis] - solved[3 * i + axis]));
  assert.ok(Math.abs(distance - [0.04, 0.03, 0.02][i]) < 1e-4);
}
new Float32Array(e.memory.buffer, lengths, 3).set([0.04, 0, 0.02]);
assert.equal(e.wasm_solve_finger_fabrik_chain(joints, lengths, target, 24, 0), -3);
assert.deepEqual(view(e, joints, 12), solved);
const mono = alloc(Array.from({ length: 128 }, (_, i) => Math.sin(2 * Math.PI * i / 32) * 0.5));
const left = alloc(Array(128).fill(0)); const right = alloc(Array(128).fill(0)); const state = alloc([0, 0, 0, 0, 1]);
assert.equal(e.wasm_render_foley_biquad_block(mono, left, right, state, 128, 0, 0), 128);
assert.ok([...view(e, left, 128), ...view(e, right, 128)].every((v) => Number.isFinite(v) && Math.abs(v) <= 0.95));
assert.ok(view(e, left, 128).some((v) => Math.abs(v) > 0.01));
assert.equal(e.wasm_render_foley_biquad_block(mono, left, left, state, 128, 0, 0), -1);
new Float32Array(e.memory.buffer, mono, 128).fill(3e38);
new Float32Array(e.memory.buffer, state, 5).fill(3e38);
assert.equal(e.wasm_render_foley_biquad_block(mono, left, right, state, 128, 0, 0), 128);
assert.ok([...view(e, left, 128), ...view(e, right, 128), ...view(e, state, 5)].every(Number.isFinite));
const invalidParams = alloc([48000, 2400, 0.707, 0, 0, 0.95, 50, -24, NaN]);
const stateBefore = view(e, state, 5);
assert.equal(e.wasm_render_foley_biquad_block(0, 0, 0, state, 0, 0, invalidParams), -3);
assert.deepEqual(view(e, state, 5), stateBefore);
assert.equal(e.wasm_render_foley_biquad_block(0, 0, 0, 0, 65537, 0, 0), -3);
for (const [ptr, size] of allocations) e.wasm_free(ptr, size);
const report = { qCompared: Boolean(qPath), verified: "node-cpu-wasm32-only", checked: { bytes: checked.bytes, sha256: checked.sha256 }, configurations: Object.fromEntries(Object.entries(current).map(([name, value]) => [name, { bytes: value.bytes, sha256: value.sha256, exports: Object.keys(value.e).sort() }])), status: "PASS" };
const json = JSON.stringify(report, null, 2);
writeFileSync(resolve(crate, "target/wave58a-wasm-validation.log"), `${json}\n`);
console.log(json);
