/**
 * 캐릭터 키트 검증기 — 키트 v2(`toonstudio.character-kit/2`) 전용 규칙(2026-10-23, WP B-1, 설계 `apps/character-lab/docs/art-style-customization-design-20261023.md` §9).
 *
 * `scripts/verify-character-kit.mjs`가 manifest의 `schema`가 v2일 때만 부른다. v1 키트의 결과는 이 모듈과 무관하게 그대로다.
 *
 * 기존 규칙의 v2 확장(같은 검사 id로 보고):
 * - V2  머리 영역 마스크 파일(존재·크기·SHA-256), V3 형태 키 용량(변형당 이름 ≤ 8, 메시당 타깃 = 필수 morph + 2×형태 ≤ 96)
 * - V8  강체 소품(`skinned: false`): 스킨 바인딩·JOINTS_0/WEIGHTS_0 없음
 * - V9  `shape:<이름>:±`은 변형 `shapes`에 선언한 이름만, ± 쌍이 모두 있고 서로 다르며, 최대 델타 > 0.08 m는 경고(설계 제안값 — 스킨 웨이트와
 *       어긋날 위험), > 0.15 m(체형 morph 상한과 같음)는 오류, 변형의 모든 메시에서 델타가 0인 형태는 오류
 * - V13 마스크 PNG의 선언 크기 일치, V14 헤어 흐름 UV1(`uv1: hair-flow`): TEXCOORD_1 존재·[0, 1] 범위·가닥 단조·뿌리 0·끝 1·방향(뿌리가 두피 쪽)
 * - V16 층 호환(층 변형만 있는 프리셋 경고, 슬롯 변형과 층 변형의 채널 구성이 `LAYER_CHANNEL_MAP`으로 대응하는지 경고)
 * - V17 커스텀 능력 일관(변형 앵커가 베이스 앵커 표에 있는지, 형태 키·UV1 목적이 슬롯에 맞는지, 한 변형 안 UV1 선언 일관) + 증거 수치
 * 신규:
 * - V21 형태 키 ±1에서 몸(TS_Head+TS_Body) 관통 0, V22 층 간격(inner·legwear ≥ 1.5 mm, outer ≥ 4 mm — 1% 분위수 오류, 최솟값 경고),
 *   V23 헤어 UV0.v 가닥 단조(중간 극값 없음) + UV1 흐름이 있으면 같은 방향, V24 패턴 UV1 밀도 균일(선형 배율 5~95% ∈ [0.85, 1.15], 중앙값 ±10 %)
 * 임계값은 실측(2026-10-23 forge_hair v2 7종 × 2베이스 + 부속 32파일)으로 오탐이 없는지 확인했다. 수치는 [제안]이며 소유자 결정 대상이다.
 */
import { createHash } from "node:crypto";

import {
  KIT_BODY_NODE,
  KIT_BUDGET,
  KIT_HEAD_NODE,
  KIT_MORPH_COVERAGE,
  KIT_PART_SLOTS,
  KIT_V2_BUDGET,
  WARDROBE_LAYER_ROLE,
  WARDROBE_LAYERS,
  layerChannel,
  parseExtendedMorphName,
} from "../../apps/character-lab/src/contracts/index.ts";

import { analyzeStrandField, closestOnSurface, createSurface, measureUvDensity, quantile, signedDistances } from "./character-kit-geometry.mjs";
import { primsOf, viewOf } from "./character-kit-glb-model.mjs";

export const V2_CHECKS = Object.freeze([
  { id: "V21", title: "형태 키 ±1 몸 관통" },
  { id: "V22", title: "층 간격" },
  { id: "V23", title: "헤어 UV0 뿌리→끝 단조" },
  { id: "V24", title: "패턴 UV1 밀도 균일" },
]);

export const V2_LIMITS = Object.freeze({
  /** V9 형태 키 델타: 경고(설계 제안값)·오류(체형 morph 상한과 같음) */
  shapeMorphWarnM: 0.08,
  shapeMorphMaxM: 0.15,
  /** V21: 이보다 깊이 들어가면 관통(측정 잡음 여유) */
  penetrationToleranceM: 0.00025,
  /** V21·V22: 몸 표면을 찾는 반경(V9 따라가기와 같은 6 cm) */
  bodySearchRadiusM: 0.06,
  /** V22 층별 최소 간격과 분위수 */
  layerGapM: Object.freeze({ inner: 0.0015, outer: 0.004, legwear: 0.0015 }),
  layerGapQuantile: 0.01,
  /** V14·V23: v 값이 같다고 보는 차(정규화 UNSIGNED_SHORT 양자화 1.5e-5의 여유) */
  strandEpsilon: 1e-4,
  /** V14: 흐름 UV1 뿌리·끝 허용 오차와 범위 여유, 방향 판정(뿌리·끝의 머리 표면 거리 중앙값) 여유와 탐색 반경 */
  hairFlowEndTolerance: 0.02,
  uvRangeMargin: 0.001,
  flowDirectionSlackM: 0.001,
  scalpSearchRadiusM: 0.4,
  /** V24 */
  uvDensityBand: Object.freeze([0.85, 1.15]),
  uvDensityMedianTolerance: 0.1,
  uvAnisotropyP95: 1.3,
});

const SHAPE_SCOPE_SLOTS = new Set(["hair", "top", "bottom", "shoes", "accessory"]);
const PATTERN_SLOTS = new Set(["top", "bottom", "shoes", "accessory"]);

function fmt(value, digits = 4) {
  return Number.isFinite(value) ? String(Number(value.toFixed(digits))) : String(value);
}

function listFew(items, limit = 5) {
  return items.length <= limit ? items.join(", ") : `${items.slice(0, limit).join(", ")} 외 ${items.length - limit}개`;
}

function whereOf(file, node) {
  return node === undefined ? file.path : `${file.path}:${node}`;
}

function rolesOf(declaration) {
  return declaration.role !== undefined ? [declaration.role] : (declaration.primitiveRoles ?? []);
}

function materialsOf(declaration) {
  return declaration.material !== undefined ? [declaration.material] : (declaration.primitiveMaterials ?? []);
}

/** 변형마다 (베이스, 층|null, 변형) 목록 */
export function variantsOf(part) {
  const out = [];
  for (const [baseId, variant] of Object.entries(part.variants ?? {})) if (variant !== undefined) out.push({ baseId, layer: null, variant });
  for (const [baseId, layered] of Object.entries(part.layerVariants ?? {})) {
    for (const [layer, variant] of Object.entries(layered ?? {})) if (variant !== undefined) out.push({ baseId, layer, variant });
  }
  return out;
}

/** 파일 사양에서 허용하는 형태 morph 이름(`shape:<이름>:±`) */
export function allowedShapeMorphs(file) {
  const names = new Set();
  for (const shape of file.shapes ?? []) {
    names.add(`shape:${shape}:+`);
    names.add(`shape:${shape}:-`);
  }
  return names;
}

// ---------------------------------------------------------------- manifest 수준

/** V3: 형태 키 용량 */
export function checkShapeCapacityV2(manifest, baseIds, report) {
  for (const part of manifest.parts) {
    for (const { baseId, layer, variant } of variantsOf(part)) {
      if (!baseIds.includes(baseId)) continue;
      const where = `kit.json:${part.id}@${baseId}${layer === null ? "" : `#${layer}`}`;
      if (variant.shapes.length > KIT_V2_BUDGET.maxShapesPerVariant) report.error("V3", where, `형태 키 이름 ${variant.shapes.length}개가 변형당 한도 ${KIT_V2_BUDGET.maxShapesPerVariant}개를 넘습니다.`);
      for (const mesh of variant.meshes) {
        const required = new Set(mesh.skinned === false ? [] : rolesOf(mesh).flatMap((role) => KIT_MORPH_COVERAGE[role] ?? []));
        const shapeTargets = mesh.morphs.filter((name) => parseExtendedMorphName(name)?.kind === "shape").length;
        if (required.size + shapeTargets > KIT_BUDGET.maxMorphTargetsPerMesh) {
          report.error("V3", `${where}:${mesh.node}`, `필수 morph ${required.size}개 + 형태 타깃 ${shapeTargets}개가 메시당 한도 ${KIT_BUDGET.maxMorphTargetsPerMesh}개를 넘습니다.`);
        }
      }
    }
  }
}

function channelsOfVariant(variant, materials) {
  const channels = new Set();
  for (const mesh of variant.meshes) for (const name of materialsOf(mesh)) {
    const channel = materials[name]?.channel;
    if (channel !== undefined) channels.add(channel);
  }
  return channels;
}

/** V16: 층 호환 */
export function checkLayersV2(manifest, baseIds, report) {
  for (const part of manifest.parts) {
    for (const baseId of baseIds) {
      const layered = part.layerVariants?.[baseId] ?? {};
      const regular = part.variants[baseId];
      for (const layer of WARDROBE_LAYERS) {
        const variant = layered[layer];
        if (variant === undefined) continue;
        const where = `kit.json:${part.id}@${baseId}#${layer}`;
        if (regular === undefined) {
          report.warn("V16", where, `${layer} 층 변형만 있고 ${part.slot} 슬롯 변형이 없습니다(그 베이스에서는 층으로만 입을 수 있습니다).`);
          continue;
        }
        const expected = [...channelsOfVariant(regular, manifest.materials)].map((channel) => layerChannel(layer, channel)).sort();
        const actual = [...channelsOfVariant(variant, manifest.materials)].sort();
        if (expected.join(",") !== actual.join(",")) {
          report.warn("V16", where, `층 변형의 채널(${actual.join("·") || "없음"})이 슬롯 변형 채널을 ${layer} 층으로 옮긴 것(${expected.join("·") || "없음"})과 다릅니다(LAYER_CHANNEL_MAP). 같은 옷인데 층에 입히면 칠할 수 있는 영역이 달라집니다.`);
        }
      }
    }
  }
}

/** V17: 커스텀 능력 일관 + 증거 수치(베이스별 채널·형태·층·앵커·UV1) */
export function checkCustomConsistencyV2(manifest, baseIds, report) {
  const evidence = {};
  for (const baseId of baseIds) {
    const base = manifest.bases[baseId];
    const anchors = new Set(Object.keys(base.anchors ?? {}));
    const record = { channels: new Set(), shapes: {}, layers: new Set(), anchors: [...anchors].sort(), patternUv: false, hairFlow: false };
    for (const mesh of base.meshes) {
      if (mesh.uv1 !== undefined) report.error("V17", `kit.json:bases.${baseId}:${mesh.node}`, `베이스 메시에는 uv1 목적을 둘 수 없습니다(패턴·헤어 흐름은 파츠 전용).`);
      for (const name of materialsOf(mesh)) if (manifest.materials[name]?.channel !== undefined) record.channels.add(manifest.materials[name].channel);
    }
    for (const part of manifest.parts) {
      for (const { baseId: variantBase, layer, variant } of variantsOf(part)) {
        if (variantBase !== baseId) continue;
        const where = `kit.json:${part.id}@${baseId}${layer === null ? "" : `#${layer}`}`;
        for (const channel of channelsOfVariant(variant, manifest.materials)) record.channels.add(channel);
        if (layer !== null) record.layers.add(layer);
        if (variant.anchor !== undefined && !anchors.has(variant.anchor)) {
          report.error("V17", where, `기본 앵커 ${variant.anchor}가 베이스 ${baseId}의 anchors 표에 없습니다(로더가 소품을 붙일 joint를 모릅니다).`);
        }
        if (variant.shapes.length > 0) {
          if (!SHAPE_SCOPE_SLOTS.has(part.slot)) report.error("V17", where, `슬롯 ${part.slot}에는 형태 키 범위(PartScope)가 없어 shapes를 둘 수 없습니다.`);
          const scope = layer ?? part.slot;
          record.shapes[scope] = [...new Set([...(record.shapes[scope] ?? []), ...variant.shapes])].sort();
        }
        const purposes = variant.meshes.map((mesh) => mesh.uv1?.purpose ?? null);
        for (const [index, purpose] of purposes.entries()) {
          if (purpose === "hair-flow" && part.slot !== "hair") report.error("V17", `${where}:${variant.meshes[index].node}`, "uv1 hair-flow는 헤어 슬롯 메시에만 둘 수 있습니다.");
          if (purpose === "pattern" && (!PATTERN_SLOTS.has(part.slot) || part.slot === "hair")) report.error("V17", `${where}:${variant.meshes[index].node}`, `uv1 pattern은 의상·신발·소품 메시에만 둘 수 있습니다(슬롯 ${part.slot}).`);
        }
        const declared = purposes.filter((purpose) => purpose !== null);
        if (declared.length > 0 && declared.length < purposes.length) {
          const level = part.slot === "hair" ? "error" : "warn";
          report[level]("V17", where, `메시 ${purposes.length}개 중 ${declared.length}개만 uv1을 선언했습니다${part.slot === "hair" ? "(LOD를 바꾸면 헤어 흐름 커스텀이 사라집니다)" : "(일부 메시에만 무늬가 그려집니다)"}.`);
        }
        if (declared.includes("hair-flow")) record.hairFlow = true;
        if (declared.includes("pattern")) record.patternUv = true;
      }
    }
    evidence[baseId] = { ...record, channels: [...record.channels].sort(), layers: [...record.layers].sort() };
  }
  report.metric("customEvidence", evidence);
}

/** V2·V13: 머리 영역 마스크 파일 */
export function checkHeadRegionMasksV2(manifest, baseIds, read, report, decodeImageInfo) {
  for (const baseId of baseIds) {
    const mask = manifest.bases[baseId]?.headRegionMask;
    if (mask === undefined) continue;
    const bytes = read(mask.file.path);
    if (bytes === null) {
      report.error("V2", mask.file.path, `머리 영역 마스크 파일이 없습니다(bases.${baseId}.headRegionMask).`);
      continue;
    }
    if (bytes.length !== mask.file.bytes) report.error("V2", mask.file.path, `파일 크기 ${bytes.length} B가 선언 ${mask.file.bytes} B와 다릅니다(kit-bytes-mismatch).`);
    if (createHash("sha256").update(bytes).digest("hex") !== mask.file.sha256) report.error("V2", mask.file.path, "SHA-256이 kit.json 선언과 다릅니다(kit-sha-mismatch).");
    const info = decodeImageInfo(bytes);
    if (info.format !== "png") report.error("V13", mask.file.path, "머리 영역 마스크는 PNG여야 합니다.");
    else if (info.width !== mask.width || info.height !== mask.height) report.error("V13", mask.file.path, `마스크 크기 ${info.width}×${info.height}가 선언 ${mask.width}×${mask.height}와 다릅니다.`);
  }
}

// ---------------------------------------------------------------- GLB 파일 하나

/** V8: 강체 메시(`skinned: false`) */
export function checkRigidMeshV2(ctx, file, meshNode) {
  const where = whereOf(file, meshNode.name);
  if (meshNode.skin !== null) ctx.report.error("V8", where, "강체(skinned: false)로 선언했지만 스킨에 바인딩되어 있습니다. 강체 소품은 앵커 본에 붙이므로 스킨이 없어야 합니다.");
  for (const prim of primsOf(meshNode)) {
    if (prim.joints !== null || prim.weights !== null) {
      ctx.report.error("V8", where, "강체 메시에 JOINTS_0/WEIGHTS_0가 있습니다(강체 소품은 스킨 없음 계약).");
      break;
    }
  }
}

/** V9: 형태 morph(선언 이름·± 쌍·크기·변형 전체의 비영) */
export function checkShapeMorphsV2(ctx, file, model) {
  const { report } = ctx;
  if ((file.shapes ?? []).length === 0) return;
  const maxima = new Map();
  for (const declaration of file.declared) {
    const meshNode = model.meshNodeByName.get(declaration.node);
    if (meshNode === undefined) continue;
    const view = viewOf(meshNode);
    const where = whereOf(file, declaration.node);
    for (const [name, delta] of view.targets) {
      const parsed = parseExtendedMorphName(name);
      if (parsed?.kind !== "shape") continue;
      let max = 0;
      for (let v = 0; v < delta.length; v += 3) max = Math.max(max, Math.hypot(delta[v], delta[v + 1], delta[v + 2]));
      maxima.set(name, Math.max(maxima.get(name) ?? 0, max));
      if (max > V2_LIMITS.shapeMorphMaxM) report.error("V9", where, `${name}의 최대 델타 ${fmt(max)} m가 상한 ${V2_LIMITS.shapeMorphMaxM} m를 넘습니다.`);
      else if (max > V2_LIMITS.shapeMorphWarnM) {
        report.warn("V9", where, `${name}의 최대 델타 ${fmt(max)} m가 설계 제안값 ${V2_LIMITS.shapeMorphWarnM} m를 넘습니다(스킨 웨이트는 휴지 위치 기준이라 많이 옮긴 정점은 자세에서 다른 본을 따라갈 수 있습니다 — 소유자 판단).`);
      }
      const opposite = view.targets.get(`shape:${parsed.name}:${parsed.sign === "+" ? "-" : "+"}`);
      if (parsed.sign === "+" && opposite !== undefined && delta.every((value, i) => Math.abs(value - opposite[i]) <= 1e-6)) {
        report.error("V9", where, `${name}와 shape:${parsed.name}:-의 델타가 같습니다. +/-는 서로 다른 형태여야 합니다.`);
      }
    }
  }
  for (const shape of file.shapes) {
    for (const sign of ["+", "-"]) {
      const name = `shape:${shape}:${sign}`;
      if (!maxima.has(name)) report.error("V9", file.path, `선언한 형태 ${shape}의 ${name} morph가 이 변형의 어느 메시에도 없습니다(슬라이더 한쪽이 움직이지 않습니다).`);
      else if (!(maxima.get(name) >= 1e-5)) report.error("V9", file.path, `${name}의 델타가 변형의 모든 메시에서 사실상 0입니다(움직이지 않는 형태 슬라이더).`);
    }
  }
}

function strandInput(meshNode, key) {
  const prims = primsOf(meshNode);
  if (!prims.every((prim) => prim[key] !== null)) return null;
  return prims.map((prim) => ({ positions: prim.positions, indices: prim.indices, values: Float32Array.from({ length: prim.count }, (_, v) => prim[key][v * 2 + 1]) }));
}

/** V14: 헤어 흐름 UV1 */
export function checkHairFlowV2(ctx, file, model) {
  const { report } = ctx;
  for (const declaration of file.declared) {
    if (declaration.uv1?.purpose !== "hair-flow") continue;
    const meshNode = model.meshNodeByName.get(declaration.node);
    if (meshNode === undefined) continue;
    const where = whereOf(file, declaration.node);
    const input = strandInput(meshNode, "uvs1");
    if (input === null) {
      report.error("V14", where, "uv1 hair-flow를 선언했지만 TEXCOORD_1이 없는 프리미티브가 있습니다.");
      continue;
    }
    let outside = 0;
    for (const prim of input) for (const value of prim.values) if (!(value >= -V2_LIMITS.uvRangeMargin && value <= 1 + V2_LIMITS.uvRangeMargin)) outside += 1;
    if (outside > 0) report.error("V14", where, `헤어 흐름 UV1.v 값 ${outside}개가 [0, 1] 밖입니다(뿌리 0 → 끝 1).`);
    const field = analyzeStrandField(input, { epsilon: V2_LIMITS.strandEpsilon });
    const interior = field.extrema.filter((entry) => entry.interior);
    const badRoots = field.extrema.filter((entry) => entry.kind === "min" && !entry.interior && entry.value > V2_LIMITS.hairFlowEndTolerance);
    const badTips = field.extrema.filter((entry) => entry.kind === "max" && !entry.interior && entry.value < 1 - V2_LIMITS.hairFlowEndTolerance);
    report.metric(`${where}.hairFlow`, { components: field.components.length, roots: field.extrema.filter((e) => e.kind === "min").length, tips: field.extrema.filter((e) => e.kind === "max").length, interior: interior.length });
    if (interior.length > 0) report.error("V14", where, `헤어 흐름 UV1.v가 가닥 중간에서 꺾이는 곳이 ${interior.length}군데 있습니다(뿌리→끝 단조가 아님, 예: v=${listFew(interior.map((e) => fmt(e.value, 3)))}).`);
    if (badRoots.length > 0) report.error("V14", where, `가닥 뿌리(국소 최소) ${badRoots.length}곳의 UV1.v가 0이 아닙니다(예: ${listFew(badRoots.map((e) => fmt(e.value, 3)))}). 흐름은 뿌리 0에서 시작해야 합니다.`);
    if (badTips.length > 0) report.error("V14", where, `가닥 끝(국소 최대) ${badTips.length}곳의 UV1.v가 1이 아닙니다(예: ${listFew(badTips.map((e) => fmt(e.value, 3)))}). 흐름은 끝 1에서 끝나야 합니다.`);
  }
}

/** V23: 헤어 UV0.v 가닥 단조(+ UV1 흐름과 같은 방향) */
export function checkHairUv0V2(ctx, file, model) {
  const { report } = ctx;
  if (file.slot !== "hair") return;
  for (const declaration of file.declared) {
    const meshNode = model.meshNodeByName.get(declaration.node);
    if (meshNode === undefined) continue;
    const where = whereOf(file, declaration.node);
    const input = strandInput(meshNode, "uvs");
    if (input === null) {
      report.error("V23", where, "헤어 메시에 TEXCOORD_0이 없는 프리미티브가 있습니다(UV 램프 규약: v = 뿌리 → 끝).");
      continue;
    }
    const field = analyzeStrandField(input, { epsilon: V2_LIMITS.strandEpsilon });
    const interior = field.extrema.filter((entry) => entry.interior);
    let against = 0;
    let compared = 0;
    if (declaration.uv1?.purpose === "hair-flow") {
      for (const prim of primsOf(meshNode)) {
        if (prim.uvs === null || prim.uvs1 === null) continue;
        const count = prim.indices === null ? prim.count : prim.indices.length;
        for (let t = 0; t + 2 < count; t += 3) {
          const corner = (k) => (prim.indices === null ? t + k : prim.indices[t + k]);
          for (const [a, b] of [[corner(0), corner(1)], [corner(1), corner(2)], [corner(2), corner(0)]]) {
            const flow = prim.uvs1[b * 2 + 1] - prim.uvs1[a * 2 + 1];
            const ramp = prim.uvs[b * 2 + 1] - prim.uvs[a * 2 + 1];
            if (Math.abs(flow) <= V2_LIMITS.strandEpsilon) continue;
            compared += 1;
            if (Math.abs(ramp) > V2_LIMITS.strandEpsilon && Math.sign(ramp) !== Math.sign(flow)) against += 1;
          }
        }
      }
    }
    report.metric(`${where}.uv0Strands`, { components: field.components.length, interior: interior.length, comparedEdges: compared, againstFlow: against });
    if (interior.length > 0) report.error("V23", where, `UV0.v가 가닥 중간에서 꺾이는 곳이 ${interior.length}군데 있습니다(밝기 램프가 뿌리→끝으로 단조가 아님, 예: v=${listFew(interior.map((e) => fmt(e.value, 3)))}).`);
    if (against > 0) report.error("V23", where, `UV0.v가 헤어 흐름 UV1.v와 반대로 가는 변이 ${against}/${compared}개입니다(램프 방향이 뿌리→끝이 아님).`);
  }
}

/** V24: 패턴 UV1 밀도 균일 */
export function checkPatternUvV2(ctx, file, model) {
  const { report } = ctx;
  for (const declaration of file.declared) {
    if (declaration.uv1?.purpose !== "pattern") continue;
    const meshNode = model.meshNodeByName.get(declaration.node);
    if (meshNode === undefined) continue;
    const where = whereOf(file, declaration.node);
    for (const prim of primsOf(meshNode)) {
      if (prim.uvs1 === null) {
        report.error("V24", where, `uv1 pattern을 선언했지만 프리미티브 ${prim.index}에 TEXCOORD_1이 없습니다.`);
        continue;
      }
      const density = measureUvDensity({ positions: prim.positions, indices: prim.indices, uvs: prim.uvs1, cmPerUnit: declaration.uv1.cmPerUnit });
      report.metric(`${where}#${prim.index}.uv1Density`, { cmPerUnit: declaration.uv1.cmPerUnit, p05: fmt(density.scaleP05, 3), p50: fmt(density.scaleP50, 3), p95: fmt(density.scaleP95, 3), anisotropyP95: fmt(density.anisotropyP95, 3), skipped: density.skipped });
      if (density.triangles === 0) {
        report.error("V24", where, "UV1 밀도를 잴 수 있는 삼각형이 없습니다(UV1이 모두 퇴화).");
        continue;
      }
      const [low, high] = V2_LIMITS.uvDensityBand;
      if (Math.abs(density.scaleP50 - 1) > V2_LIMITS.uvDensityMedianTolerance) {
        report.error("V24", where, `UV1 밀도 중앙값이 선언(1 UV = ${declaration.uv1.cmPerUnit} cm)의 ${fmt(density.scaleP50, 3)}배입니다(±${V2_LIMITS.uvDensityMedianTolerance * 100}% 밖). 무늬 실제 크기가 어긋납니다.`);
      }
      if (density.scaleP05 < low || density.scaleP95 > high) {
        report.error("V24", where, `UV1 밀도가 균일하지 않습니다: 면적 가중 5~95% 배율 ${fmt(density.scaleP05, 3)}~${fmt(density.scaleP95, 3)}(허용 ${low}~${high}). 무늬 크기가 부위마다 달라집니다.`);
      }
      if (density.anisotropyP95 > V2_LIMITS.uvAnisotropyP95) report.warn("V24", where, `UV1 이방성 95%가 ${fmt(density.anisotropyP95, 3)}입니다(${V2_LIMITS.uvAnisotropyP95} 초과 — 무늬가 한 방향으로 늘어납니다).`);
    }
  }
}

// ---------------------------------------------------------------- 베이스와 맞대는 검사

/** 베이스 모델의 피부 표면(머리+몸)과 몸 표면(층 간격용) — 베이스마다 한 번 만든다 */
export function baseSurfacesOf(ctx, baseModel, baseId) {
  ctx.surfaces ??= new Map();
  if (!ctx.surfaces.has(baseId)) {
    const meshOf = (name) => {
      const node = baseModel.meshNodeByName.get(name);
      return node === undefined ? [] : primsOf(node).map((prim) => ({ positions: prim.positions, indices: prim.indices, normals: prim.normals }));
    };
    const body = meshOf(KIT_BODY_NODE);
    const head = meshOf(KIT_HEAD_NODE);
    ctx.surfaces.set(baseId, body.length + head.length === 0 ? null : { skin: createSurface([...head, ...body]), body: body.length === 0 ? null : createSurface(body), scalp: head.length === 0 ? null : createSurface(head, { cell: 0.02 }) });
  }
  return ctx.surfaces.get(baseId);
}

/**
 * V14 흐름 방향: 메시 전체에서 뿌리(UV1.v ≤ 0.02) 정점의 머리 표면 거리 중앙값이 끝(≥ 0.98) 정점보다 1 mm 넘게 멀면 흐름이 거꾸로다.
 * 가닥마다 재면 묶음점에서 시작하는 꼬리(뿌리가 머리카락 위)·머리에 붙어 끝나는 짧은 가닥이 오탐이라 메시 전체 중앙값을 쓴다
 * (2026-10-23 forge_hair 84메시 실측: 끝 − 뿌리 ≥ +2.9 mm, 뒤집으면 ≤ −2.9 mm).
 */
export function checkHairFlowDirectionV2(ctx, file, model, surfaces, baseId) {
  if (file.slot !== "hair" || surfaces === null || surfaces.scalp === null) return;
  for (const declaration of file.declared) {
    if (declaration.uv1?.purpose !== "hair-flow") continue;
    const meshNode = model.meshNodeByName.get(declaration.node);
    if (meshNode === undefined) continue;
    const roots = [];
    const tips = [];
    for (const prim of primsOf(meshNode)) {
      if (prim.uvs1 === null) continue;
      for (let v = 0; v < prim.count; v += 1) {
        const value = prim.uvs1[v * 2 + 1];
        if (value > V2_LIMITS.hairFlowEndTolerance && value < 1 - V2_LIMITS.hairFlowEndTolerance) continue;
        const hit = closestOnSurface(surfaces.scalp, prim.positions[v * 3], prim.positions[v * 3 + 1], prim.positions[v * 3 + 2], V2_LIMITS.scalpSearchRadiusM);
        if (hit !== null) (value <= V2_LIMITS.hairFlowEndTolerance ? roots : tips).push(hit.distance);
      }
    }
    if (roots.length === 0 || tips.length === 0) continue;
    const rootMedian = quantile(roots, 0.5);
    const tipMedian = quantile(tips, 0.5);
    const where = `${whereOf(file, declaration.node)}@${baseId}`;
    ctx.report.metric(`${where}.hairFlowDirection`, { rootMedianMm: fmt(rootMedian * 1000, 2), tipMedianMm: fmt(tipMedian * 1000, 2) });
    if (rootMedian > tipMedian + V2_LIMITS.flowDirectionSlackM) {
      ctx.report.error("V14", where, `헤어 흐름 UV1이 거꾸로입니다: 뿌리(v≈0) 정점이 머리에서 ${fmt(rootMedian * 1000, 1)} mm, 끝(v≈1) 정점이 ${fmt(tipMedian * 1000, 1)} mm(중앙값) — 뿌리가 두피에 붙어야 합니다.`);
    }
  }
}

function lod0Declarations(file) {
  return file.declared.filter((declaration) => file.slot !== "hair" || declaration.lod === 0);
}

/** V21: 형태 키 ±1에서 피부(머리+몸) 관통 */
export function checkShapePenetrationV2(ctx, file, model, surfaces, baseId) {
  const { report } = ctx;
  if ((file.shapes ?? []).length === 0 || surfaces === null) return;
  for (const declaration of lod0Declarations(file)) {
    const meshNode = model.meshNodeByName.get(declaration.node);
    if (meshNode === undefined) continue;
    const view = viewOf(meshNode);
    const where = `${whereOf(file, declaration.node)}@${baseId}`;
    const rest = signedDistances(surfaces.skin, view.positions, V2_LIMITS.bodySearchRadiusM);
    let restInside = 0;
    for (const value of rest.signed) if (value < -V2_LIMITS.penetrationToleranceM) restInside += 1;
    let worst = null;
    for (const shape of file.shapes) {
      for (const sign of ["+", "-"]) {
        const delta = view.targets.get(`shape:${shape}:${sign}`);
        if (delta === undefined) continue;
        const moved = new Float32Array(view.positions.length);
        for (let i = 0; i < moved.length; i += 1) moved[i] = view.positions[i] + delta[i];
        const result = signedDistances(surfaces.skin, moved, V2_LIMITS.bodySearchRadiusM);
        let inside = 0;
        for (const value of result.signed) if (value < -V2_LIMITS.penetrationToleranceM) inside += 1;
        const minimum = result.worstIndex < 0 ? Number.NaN : result.signed[result.worstIndex];
        if (worst === null || minimum < worst.minimum) worst = { name: `shape:${shape}:${sign}`, minimum, inside };
        if (inside > 0) report.error("V21", where, `shape:${shape}:${sign} = 1에서 정점 ${inside}개가 몸·머리 안으로 들어갑니다(최대 ${fmt(-minimum * 1000, 2)} mm${restInside > 0 ? `, 휴지 자세에서 이미 ${restInside}개` : ""}).`);
      }
    }
    report.metric(`${where}.shapeClearance`, { restInside, worst: worst?.name ?? null, minimumMm: worst === null ? null : fmt(worst.minimum * 1000, 2) });
  }
}

/** V22: 층 간격(층 변형이 몸에서 떨어진 거리) */
export function checkLayerGapV2(ctx, file, model, surfaces, baseId) {
  const { report } = ctx;
  if (file.layer === null || file.layer === undefined || surfaces === null || surfaces.body === null) return;
  const gap = V2_LIMITS.layerGapM[file.layer];
  for (const declaration of file.declared) {
    const meshNode = model.meshNodeByName.get(declaration.node);
    if (meshNode === undefined) continue;
    const where = `${whereOf(file, declaration.node)}@${baseId}`;
    const result = signedDistances(surfaces.body, viewOf(meshNode).positions, V2_LIMITS.bodySearchRadiusM);
    const matched = [...result.signed].filter((value) => !Number.isNaN(value));
    if (matched.length === 0) {
      report.warn("V22", where, `몸 표면 ${V2_LIMITS.bodySearchRadiusM * 100} cm 안에 정점이 없어 층 간격을 재지 못했습니다.`);
      continue;
    }
    const low = quantile(matched, V2_LIMITS.layerGapQuantile);
    const minimum = quantile(matched, 0);
    report.metric(`${where}.layerGap`, { layer: file.layer, requiredMm: gap * 1000, p01Mm: fmt(low * 1000, 2), minMm: fmt(minimum * 1000, 2), matched: matched.length, unmatched: result.unmatched });
    if (low < gap) report.error("V22", where, `${file.layer} 층의 몸 간격 1% 분위수가 ${fmt(low * 1000, 2)} mm입니다(최소 ${gap * 1000} mm). 아래 층·피부와 겹쳐 비칩니다.`);
    else if (minimum < gap) report.warn("V22", where, `${file.layer} 층에서 몸과 ${gap * 1000} mm보다 가까운 곳이 있습니다(최소 ${fmt(minimum * 1000, 2)} mm).`);
  }
}

// ---------------------------------------------------------------- 활성 삼각형(V11)

/**
 * v2 활성 최악 삼각형: 베이스 + 슬롯별 최대(헤어·상의·하의·신발·소품 1·홍채) + 층별 최대(이너·아우터·레그웨어). 소품 11개 추가(같은 소품 반복 포함)는 따로 센다.
 * @param {{baseTriangles: number, slotWorst: Record<string, number>, layerWorst: Record<string, number>, accessoryMax: number, extraAccessories?: number}} input
 */
export function activeWorstV2({ baseTriangles, slotWorst, layerWorst, accessoryMax, extraAccessories = 11 }) {
  const slots = KIT_PART_SLOTS.reduce((sum, slot) => sum + (slotWorst[slot] ?? 0), 0);
  const layers = WARDROBE_LAYERS.reduce((sum, layer) => sum + (layerWorst[layer] ?? 0), 0);
  const withLayers = baseTriangles + slots + layers;
  return { withLayers, withAccessories: withLayers + extraAccessories * accessoryMax, budget: KIT_BUDGET.triangles.activeWorst };
}

/** 층 변형 역할 → 그 층이 쓰는 슬롯 삼각형 예산 키 */
export function layerBudgetKey(layer) {
  return WARDROBE_LAYER_ROLE[layer] === "legwear" ? "bottom" : "top";
}
