"""키트 v2(`toonstudio.character-kit/2`) manifest 작성기 — `build_kit_json.py --schema 2`가 부른다(2026-10-23, WP B-1).

계약은 `apps/character-lab/src/contracts/character-kit-v2.ts`(CORE-1)다. v2 상수(역할 채널 표·층·앵커·예산)는 파이썬에 복제하지 않고
node+tsx로 계약 모듈을 불러 읽고(`load_v2_contract`), 만든 manifest도 같은 방법으로 `parseKitManifestV2`에 넣어 **통과해야만** 돌려준다
(`validate_v2`). v1 manifest 작성기(`kit_manifest.build_manifest`)는 그대로이고, 공개 키트(`apps/character-lab/public/`)에는 v2를 쓰지 않는다.

키트 폴더 규약(v1 규약 + 층 폴더)::

    bases/<base>.glb                      베이스(v1과 같음). 있으면 bases/<base>-head-regions.png = 머리 영역 마스크(입술·볼 홍조)
    parts/<base>/<슬롯>/<이름>.glb         슬롯 변형(hair·top·bottom·shoes·accessory·irises)
    parts/<base>/<층>/<이름>.glb           층 변형(inner·outer = top/<이름>, legwear = bottom/<이름>) → parts[].layerVariants

GLB에서 읽어 채우는 v2 값:

- 메시 역할: 슬롯 규칙(헤어 `TS_AuthoredHair_<이름>_LOD<n>`, 홍채 `TS_Iris/Highlight/Pupil_L·R`) 또는 노드 접두 `TS_Top`·`TS_Bottom`·`TS_Shoes`·
  `TS_Accessory`·`TS_HairAccessory`(역할 hair-accessory)·`TS_Inner`·`TS_Outer`·`TS_Legwear` + `_<이름>` + 선택 채널 접미(`_Trim`·`_Accent` …).
  프리미티브가 여럿이면 `primitiveRoles`(모두 그 메시 역할)·`primitiveMaterials`.
- 재질 채널(`resolve_channel`): ① 레지스트리 `channels{재질: 채널}` ② 레지스트리 `materials{포지 역할: 재질}`(포지 역할 이름은 계약 채널 이름이다,
  camelCase `hairTip`도 받는다) ③ 재질 이름 규약 `ts_<…>_<접미>_<이름>`(접미 = 채널 끝 토큰: `ts_hair_tip_soft-bob` → hair-tip,
  `ts_hairacc_accent_bead-tie` → hair-accessory-accent) ④ 역할의 기본 채널. 채널이 없는 역할은 고정색(fixed, `FIXED_TINT_HEX`).
  한 파일에서 (역할, 채널)에 재질이 둘이면 멈춘다(계약 kit-material-multiple).
- `skinned`: 스킨 결합이면 true, 스킨·JOINTS가 없으면 강체(false — 액세서리 슬롯만, 기본 앵커 필요).
- `shapes`: morph 이름 `shape:<이름>:±`의 이름(레지스트리 `shapeKeys`가 있으면 GLB와 같아야 한다).
- `uv1`: 헤어는 모든 프리미티브에 TEXCOORD_1이 있으면 `hair-flow`(forge_hair 규약: V = 뿌리 0 → 끝 1). 의상·신발·소품은 레지스트리
  `uv1CmPerUnit`(또는 `uv1: {purpose: "pattern", cmPerUnit}`)가 있을 때만 `pattern`. 레지스트리 `uv1: null`이면 선언하지 않는다.
- `anchor`: 레지스트리 `anchor`(계약 앵커 14 또는 포지 앵커 이름 — `FORGE_ANCHOR_MAP`으로 옮긴다).
- 베이스: `headHeightM`·`anchors`는 `kit_base_measure`로 재고, `base_v2_meta[<base>]`(`--base-meta-v2`)가 있으면 그 값을 쓴다.

레지스트리(`--parts-json`)는 포지 `parts-registry.json`과 같은 꼴 `{프리셋: {베이스: {...}}}`이다. 층 변형 메타는 `{프리셋: {"<베이스>#<층>": {...}}}`로 준다.
"""

from __future__ import annotations

import datetime
import json
import re
import shutil
import struct
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import contract as contract_mod
from . import kit_base_measure as measure
from . import kit_manifest as km

#: 포지 도구의 앵커 이름 → 계약 앵커(`ACCESSORY_ANCHORS`). 헤어 부속 앵커는 모두 머리 본에 붙는 머리카락 위 지점이라 hair, 정수리는 head-top.
FORGE_ANCHOR_MAP = {
    "crown": "head-top",
    "back-crown": "hair",
    "temple-L": "hair",
    "temple-R": "hair",
    "near-twin-tie-L": "hair",
    "near-twin-tie-R": "hair",
    "pony-tie": "hair",
    "pony-tie-top": "hair",
    "twin-tie-L": "hair",
    "twin-tie-R": "hair",
}
NODE_PREFIX = {"top": "TS_Top", "bottom": "TS_Bottom", "shoes": "TS_Shoes", "accessory": "TS_Accessory", "inner": "TS_Inner", "outer": "TS_Outer", "legwear": "TS_Legwear"}
NODE_SUFFIX = re.compile(r"^(?:_[A-Z][A-Za-z0-9]*)?$")
HEAD_REGION_MASK = "bases/{base}-head-regions.png"
DEFAULT_MASK_CHANNELS = {"lip": "r", "blush": "g"}
_V2_CACHE: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------- 계약(TS)에서 읽기·검증


def _tsx(repo_root: Path) -> str:
    tsx = Path(repo_root) / "node_modules" / ".bin" / "tsx"
    if not tsx.exists():
        raise km.ManifestError(f"tsx를 찾지 못했습니다({tsx}). 저장소 루트에 node_modules가 있어야 계약을 읽을 수 있습니다.")
    return str(tsx)


def _run_contract_script(repo_root: Path, body: str, payload: Any = None) -> Any:
    contracts = (Path(repo_root).resolve() / "apps/character-lab/src/contracts/index.ts").as_posix()
    script = f'import {{ readFileSync }} from "node:fs";\nconst C = await import({json.dumps(contracts)});\nconst input = JSON.parse(readFileSync(process.argv[2], "utf8"));\n{body}\n'
    with tempfile.TemporaryDirectory() as temp:
        script_path = Path(temp) / "contract-v2.mts"
        input_path = Path(temp) / "input.json"
        script_path.write_text(script, encoding="utf-8")
        input_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        result = subprocess.run([_tsx(repo_root), str(script_path), str(input_path)], cwd=repo_root, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise km.ManifestError(f"계약 모듈 호출에 실패했습니다: {result.stderr.strip()[-800:]}")
    return json.loads(result.stdout)


def load_v2_contract(repo_root: Path) -> dict[str, Any]:
    """v2 계약 상수(역할 채널·슬롯 역할·층·앵커·예산·형태 이름 규칙)를 TS에서 그대로 읽는다(프로세스 안 캐시)."""
    key = str(Path(repo_root).resolve())
    if key not in _V2_CACHE:
        _V2_CACHE[key] = _run_contract_script(
            repo_root,
            "process.stdout.write(JSON.stringify({ schema: C.KIT_V2_SCHEMA_ID, budget: C.KIT_V2_BUDGET, roleChannels: C.PART_ROLE_CHANNELS,"
            " slotRoles: C.KIT_V2_PART_SLOT_ROLES, slotLayers: C.KIT_V2_SLOT_LAYERS, layerRole: C.WARDROBE_LAYER_ROLE, layerSlot: C.WARDROBE_LAYER_SLOT,"
            " layers: C.WARDROBE_LAYERS, anchors: C.ACCESSORY_ANCHORS, anchorBones: C.ACCESSORY_ANCHOR_BONES, regionChannels: C.REGION_CHANNEL_KEYS,"
            " shapeNamePattern: C.SHAPE_NAME_PATTERN.source, shapeNameMax: C.SHAPE_NAME_MAX_LENGTH }));",
        )
    return _V2_CACHE[key]


def validate_v2(manifest: dict[str, Any], repo_root: Path) -> None:
    """만든 manifest를 계약 `parseKitManifestV2`로 파싱한다. 실패하면 첫 이슈들의 한글 사유로 ManifestError."""
    result = _run_contract_script(repo_root, "const parsed = C.parseKitManifestV2(input); process.stdout.write(JSON.stringify(parsed.ok ? { ok: true } : { ok: false, reason: parsed.failure.reasonKo }));", manifest)
    if not result["ok"]:
        raise km.ManifestError(f"계약 parseKitManifestV2를 통과하지 못했습니다: {result['reason']}")


# ---------------------------------------------------------------- 파츠 찾기


@dataclass(frozen=True)
class PartFileV2:
    """키트 폴더 안 v2 파츠 GLB 하나(프리셋 id·베이스·층(없으면 None)·상대 경로)."""

    preset_id: str
    base: str
    layer: str | None
    path: str

    @property
    def slot(self) -> str:
        return self.preset_id.split("/", 1)[0]

    @property
    def name(self) -> str:
        return self.preset_id.split("/", 1)[1]

    @property
    def registry_key(self) -> str:
        return self.base if self.layer is None else f"{self.base}#{self.layer}"


def discover_parts_v2(kit_dir: Path, bases: list[str], v2: dict[str, Any], slots: list[str]) -> list[PartFileV2]:
    """`parts/<base>/<슬롯|층>/<이름>.glb`. 층 폴더는 그 층이 입히는 슬롯의 프리셋이 된다(inner/shirt → top/shirt의 inner 층 변형)."""
    found: list[PartFileV2] = []
    for base in bases:
        root = Path(kit_dir) / "parts" / base
        if not root.is_dir():
            continue
        for glb in sorted(root.glob("*/*.glb")):
            folder = glb.parent.name
            relative = glb.relative_to(kit_dir).as_posix()
            if folder in slots:
                found.append(PartFileV2(f"{folder}/{glb.stem}", base, None, relative))
            elif folder in v2["layers"]:
                found.append(PartFileV2(f"{v2['layerSlot'][folder]}/{glb.stem}", base, folder, relative))
            else:
                raise km.ManifestError(f"알 수 없는 파츠 폴더입니다(슬롯·층 이름이어야 함): {relative}")
    return found


# ---------------------------------------------------------------- 재질 채널


def _kebab(name: str) -> str:
    return re.sub(r"(?<=[a-z0-9])([A-Z])", lambda match: "-" + match.group(1).lower(), name)


def resolve_channel(role: str, material: str, meta: dict[str, Any], v2: dict[str, Any]) -> str | None:
    """재질의 채널. 채널이 없는 역할(눈 하이라이트·치아·혀·속옷)은 None."""
    allowed: list[str] = v2["roleChannels"][role]
    if not allowed:
        return None
    explicit = (meta.get("channels") or {}).get(material)
    if explicit is None:
        by_material = {str(value): str(key) for key, value in (meta.get("materials") or {}).items()}
        explicit = by_material.get(material)
    if explicit is not None:
        name = _kebab(str(explicit))
        if name in allowed:
            return name
        if name == role:
            return allowed[0]
        raise km.ManifestError(f"재질 {material}의 채널 {explicit}가 역할 {role}의 계약 채널({'·'.join(allowed)}) 밖입니다(계약 PART_ROLE_CHANNELS 확장이 필요하면 core에 요청).")
    hits = [channel for channel in allowed[1:] if f"_{channel.rsplit('-', 1)[1]}_" in f"{material}_"]
    if len(hits) > 1:
        raise km.ManifestError(f"재질 이름 {material}에서 채널을 하나로 정할 수 없습니다({', '.join(hits)}). 레지스트리 channels로 지정하세요.")
    return hits[0] if hits else allowed[0]


def _material_entry(role: str, channel: str | None, double_sided: bool) -> dict[str, Any]:
    if channel is None:
        return {"role": role, "tint": {"mode": "fixed", "hex": km.FIXED_TINT_HEX}, "doubleSided": double_sided}
    return {"role": role, "channel": channel, "tint": {"mode": "recolor"}, "doubleSided": double_sided}


def _register(materials: dict[str, dict[str, Any]], name: str, entry: dict[str, Any]) -> None:
    previous = materials.get(name)
    if previous is not None and previous != entry:
        raise km.ManifestError(f"재질 '{name}'이 파일마다 다르게 정의되었습니다({previous} ≠ {entry}).")
    materials[name] = entry


# ---------------------------------------------------------------- 메시 선언


def _role_of_node(part: PartFileV2, node: str) -> tuple[str, int | None]:
    if part.slot == "hair" and part.layer is None:
        match = km.HAIR_PATTERN.match(node)
        if match is None or match.group("style") != part.name:
            raise km.ManifestError(f"헤어 메시 이름은 TS_AuthoredHair_{part.name}_LOD<n> 형식이어야 합니다: {node}")
        return "hair", int(match.group("lod"))
    if part.slot == "irises" and part.layer is None:
        for role, prefix in km.IRIS_PREFIX.items():
            if node in (f"{prefix}_L", f"{prefix}_R"):
                return role, None
        raise km.ManifestError(f"홍채 파츠의 메시 이름은 TS_Iris/TS_Highlight/TS_Pupil_L·R이어야 합니다: {node}")
    candidates = [(part.layer, part.layer)] if part.layer is not None else [("hair-accessory", "TS_HairAccessory"), (part.slot, NODE_PREFIX[part.slot])] if part.slot == "accessory" else [(part.slot, NODE_PREFIX[part.slot])]
    for role, prefix in candidates:
        prefix = NODE_PREFIX.get(prefix, prefix) if prefix in NODE_PREFIX else prefix
        head = f"{prefix}_{part.name}"
        if node.startswith(head) and NODE_SUFFIX.match(node[len(head) :]):
            return role, None
    expected = " 또는 ".join(f"{NODE_PREFIX.get(prefix, prefix)}_{part.name}" for _, prefix in candidates)
    raise km.ManifestError(f"{part.preset_id}{'' if part.layer is None else f'({part.layer} 층)'}: 메시 이름은 {expected}(+선택 채널 접미 _Trim 등)이어야 합니다: {node}")


def _shape_names(morphs: list[str], v2: dict[str, Any], label: str, vocabulary: set[str]) -> set[str]:
    pattern = re.compile(v2["shapeNamePattern"])
    shapes: set[str] = set()
    for name in morphs:
        if name in vocabulary:
            continue
        match = re.fullmatch(r"shape:(.+):([+-])", name)
        if match is None or not pattern.match(match.group(1)) or len(match.group(1)) > v2["shapeNameMax"]:
            raise km.ManifestError(f"{label}: morph 이름 {name}이 계약 어휘(param·facs·shape:<이름>:±) 밖입니다.")
        shapes.add(match.group(1))
    return shapes


def _uv1_of(part: PartFileV2, mesh: km.MeshInfo, meta: dict[str, Any]) -> dict[str, Any] | None:
    if "uv1" in meta and meta["uv1"] is None:
        return None
    declared = meta.get("uv1")
    if isinstance(declared, dict):
        return dict(declared)
    has_uv1 = all(prim.has_uv1 for prim in mesh.prims)
    if declared == "hair-flow" or (part.slot == "hair" and part.layer is None and has_uv1):
        return {"purpose": "hair-flow"} if has_uv1 else None
    cm = meta.get("uv1CmPerUnit")
    if cm is not None:
        if not has_uv1:
            raise km.ManifestError(f"{part.preset_id}:{mesh.node}: 레지스트리 uv1CmPerUnit이 있지만 TEXCOORD_1이 없습니다.")
        return {"purpose": "pattern", "cmPerUnit": float(cm)}
    return None


def part_variant_v2(kit_dir: Path, part: PartFileV2, contract: contract_mod.Contract, v2: dict[str, Any], meta: dict[str, Any], materials: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """파츠 GLB 하나 → v2 변형 블록(file·meshes·hides·shapes·anchor)."""
    file_entry, data = km._file_entry(Path(kit_dir), part.path)  # noqa: SLF001 — 같은 패키지의 파일 항목 도우미
    info = km.inspect_glb(data, part.path)
    skinned_meshes = [mesh for mesh in info.meshes if mesh.skin_joint_count is not None or any(prim.has_joints for prim in mesh.prims)]
    if skinned_meshes:
        km._check_skin(km.GlbInfo(**{**info.__dict__, "meshes": skinned_meshes}), contract, part.path)  # noqa: SLF001
    vocabulary = set(contract.morph_names)
    declarations: list[dict[str, Any]] = []
    shapes: set[str] = set()
    used: dict[tuple[str, str | None], str] = {}
    for mesh in sorted(info.meshes, key=lambda item: item.node):
        role, lod = _role_of_node(part, mesh.node)
        rigid = mesh not in skinned_meshes
        if rigid and part.slot != "accessory":
            raise km.ManifestError(f"{part.preset_id}:{mesh.node}: 스킨이 없는 강체 메시는 액세서리 슬롯에만 둘 수 있습니다.")
        prim_materials = [str(prim.material) for prim in mesh.prims]
        if None in [prim.material for prim in mesh.prims]:
            raise km.ManifestError(f"{part.preset_id}:{mesh.node}: 재질이 없는 프리미티브가 있습니다.")
        for material in dict.fromkeys(prim_materials):
            channel = resolve_channel(role, material, meta, v2)
            slot_key = (role, channel)
            if slot_key in used and used[slot_key] != material:
                raise km.ManifestError(f"{part.preset_id}: 역할 {role}·채널 {channel}에 재질이 둘 이상입니다('{used[slot_key]}', '{material}', kit-material-multiple).")
            used[slot_key] = material
            _register(materials, material, _material_entry(role, channel, info.materials[material].double_sided))
        declaration: dict[str, Any] = {"node": mesh.node}
        if len(mesh.prims) > 1:
            declaration.update({"primitiveRoles": [role] * len(mesh.prims), "primitiveMaterials": prim_materials})
        else:
            declaration.update({"role": role, "material": prim_materials[0]})
        if lod is not None:
            declaration["lod"] = lod
        declaration.update({"triangles": mesh.triangles, "vertices": mesh.vertices, "skinned": not rigid, "morphs": list(mesh.morphs)})
        uv1 = _uv1_of(part, mesh, meta)
        if uv1 is not None:
            declaration["uv1"] = uv1
        shapes |= _shape_names(list(mesh.morphs), v2, f"{part.preset_id}:{mesh.node}", vocabulary)
        declarations.append(declaration)
    declared_keys = meta.get("shapeKeys")
    glb_keys = {name for declaration in declarations for name in declaration["morphs"] if name.startswith("shape:")}
    if isinstance(declared_keys, list) and set(declared_keys) != glb_keys:
        raise km.ManifestError(f"{part.preset_id}: 레지스트리 shapeKeys와 GLB 형태 키가 다릅니다(레지스트리 {sorted(declared_keys)} · GLB {sorted(glb_keys)}).")
    variant: dict[str, Any] = {"file": file_entry, "meshes": declarations, "hides": list(meta.get("hides", [])), "shapes": sorted(shapes)}
    anchor = meta.get("anchor")
    if anchor is not None:
        mapped = anchor if anchor in v2["anchors"] else FORGE_ANCHOR_MAP.get(anchor)
        if mapped is None:
            raise km.ManifestError(f"{part.preset_id}: 앵커 {anchor!r}를 계약 앵커({', '.join(v2['anchors'])})로 옮길 수 없습니다.")
        variant["anchor"] = mapped
    if any(not declaration["skinned"] for declaration in declarations) and "anchor" not in variant:
        raise km.ManifestError(f"{part.preset_id}: 강체 소품에는 레지스트리 anchor가 필요합니다.")
    return variant


# ---------------------------------------------------------------- 베이스


def _png_size(data: bytes) -> tuple[int, int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise km.ManifestError("머리 영역 마스크는 PNG여야 합니다.")
    return struct.unpack(">II", data[16:24])


def base_block_v2(kit_dir: Path, contract: contract_mod.Contract, v2: dict[str, Any], base_id: str, base_path: str, base_meta: dict[str, Any], override: dict[str, Any], materials: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """v1 베이스 블록 + headHeightM·anchors(측정 또는 덮어쓰기)·headRegionMask(파일이 있을 때). 베이스 재질은 역할의 기본 채널(안구 = sclera)."""
    v1_materials: dict[str, dict[str, Any]] = {}
    block = km._base_block(Path(kit_dir), contract, base_path, base_meta, v1_materials)  # noqa: SLF001
    for name, entry in v1_materials.items():
        _register(materials, name, _material_entry(entry["role"], (v2["roleChannels"][entry["role"]] or [None])[0], entry["doubleSided"]))
    glb = measure.GlbArrays((Path(kit_dir) / base_path).read_bytes())
    block["headHeightM"] = float(override.get("headHeightM") or measure.measure_head_height(glb)["headHeightM"])
    block["anchors"] = override.get("anchors") or measure.compute_anchors(glb, v2["anchorBones"], contract.bone_map)
    mask_path = (override.get("headRegionMask") or {}).get("path") or HEAD_REGION_MASK.format(base=base_id)
    if (Path(kit_dir) / mask_path).is_file():
        file_entry, data = km._file_entry(Path(kit_dir), mask_path)  # noqa: SLF001
        width, height = _png_size(data)
        channels = (override.get("headRegionMask") or {}).get("channels") or DEFAULT_MASK_CHANNELS
        block["headRegionMask"] = {"file": file_entry, "width": width, "height": height, "channels": dict(channels)}
    return block


# ---------------------------------------------------------------- manifest


def build_manifest_v2(
    *,
    kit_dir: Path,
    contract: contract_mod.Contract,
    base_id: str,
    base_path: str,
    base_meta: dict[str, Any],
    repo_root: Path,
    generator_command: list[str],
    blender_version: str,
    registry: dict[str, dict[str, dict[str, Any]]] | None = None,
    base_v2_meta: dict[str, dict[str, Any]] | None = None,
    unavailable_reasons: dict[str, str] | None = None,
    hyper3d_sources: km.Hyper3dSources | None = None,
    extra_bases: list[dict[str, Any]] | None = None,
    preserved: km.PreservedRecords | None = None,
    registry_licenses: dict[str, str] | None = None,
    now: datetime.date | None = None,
    parts: list[Any] | None = None,
    validate: bool = True,
) -> dict[str, Any]:
    """키트 폴더의 GLB로 v2 manifest를 만든다. `parts`(v1 탐색 결과)는 받기만 하고 층 폴더까지 다시 찾는다. 계약 파싱을 통과해야 돌려준다."""
    del parts
    kit_dir = Path(kit_dir)
    v2 = load_v2_contract(repo_root)
    reasons = {**(unavailable_reasons or {}), **(preserved.unavailable if preserved else {})}
    table = km.merge_hides_table(preserved, registry)
    materials: dict[str, dict[str, Any]] = {}
    all_bases = [{"base_id": base_id, "base_path": base_path, "base_meta": base_meta}, *(extra_bases or [])]
    base_ids = [item["base_id"] for item in all_bases]
    bases = {item["base_id"]: base_block_v2(kit_dir, contract, v2, item["base_id"], item["base_path"], item["base_meta"], (base_v2_meta or {}).get(item["base_id"], {}), materials) for item in all_bases}

    files = discover_parts_v2(kit_dir, base_ids, v2, list(contract.raw["partSlots"]))
    by_id: dict[str, list[PartFileV2]] = {}
    for part in files:
        by_id.setdefault(part.preset_id, []).append(part)
    vocabulary: dict[str, list[str]] = contract.raw["presetVocabulary"]
    unknown = sorted(preset for preset in by_id if preset.split("/", 1)[1] not in vocabulary.get(preset.split("/", 1)[0], []))
    if unknown:
        raise km.ManifestError(f"프리셋 어휘에 없는 파츠가 등록되었습니다(계약 SLOT_PRESET_IDS 확장이 필요): {', '.join(unknown)}")
    part_blocks: list[dict[str, Any]] = []
    for slot in contract.raw["partSlots"]:
        for name in vocabulary[slot]:
            preset_id = f"{slot}/{name}"
            block: dict[str, Any] = {"id": preset_id, "slot": slot, "variants": {}, "unavailable": {}}
            for part in sorted(by_id.get(preset_id, []), key=lambda item: (base_ids.index(item.base), item.layer or "")):
                meta = dict((registry or {}).get(preset_id, {}).get(part.registry_key, {}))
                meta.setdefault("hides", table.get(preset_id, {}).get(part.registry_key, {}).get("hides", []))
                variant = part_variant_v2(kit_dir, part, contract, v2, meta, materials)
                if part.layer is None:
                    block["variants"][part.base] = variant
                else:
                    block.setdefault("layerVariants", {}).setdefault(part.base, {})[part.layer] = variant
            for each_base in base_ids:
                if each_base not in block["variants"]:
                    block["unavailable"][each_base] = reasons.get(f"{preset_id}@{each_base}") or reasons.get(preset_id) or km.default_unavailable_reason(preset_id, contract)
            part_blocks.append(block)

    manifest: dict[str, Any] = {
        "schema": v2["schema"],
        "kitId": contract.raw["kitId"],
        "kitVersion": contract.raw["kitVersion"],
        "displayName": "ToonStudio 캐릭터 키트 v1 (manifest v2)",
        "generatedAt": (now or datetime.date.today()).isoformat(),
        "generator": {"tool": "tools/blender/character_kit", "blender": blender_version, "command": [*generator_command, "--schema", "2"]},
        "coordinateSystem": {"up": "+Y", "forward": "+Z", "unit": "m", "handedness": "right", "rest": "T-pose", "rootScale": 1},
        "provenance": km.provenance_block(contract, hyper3d_sources, [part["id"] for part in part_blocks if part["variants"]], preserved=preserved, registry_licenses=registry_licenses),
        "skeleton": {"root": km.ROOT_JOINT, "joints": contract.joints, "parents": contract.parents, "boneMap": contract.bone_map, "endBones": contract.end_bones},
        "materials": materials,
        "jointOffsets": base_meta["jointOffsets"],
        "bases": bases,
        "parts": part_blocks,
        "defaults": {"base": contract.raw["defaultBase"], "slots": contract.raw["defaultSlots"], "colors": contract.raw["defaultColors"]},
        "slotCapabilities": {},
        "physics": {"mode": "static", "chains": [], "colliders": []},
        "budgets": v2["budget"],
    }
    manifest["slotCapabilities"] = km.derive_capabilities(manifest, repo_root)
    if validate:
        validate_v2(manifest, repo_root)
    return manifest


def stage_copy(source_kit: Path, stage: Path) -> Path:
    """공개 키트(v1)를 스테이지 폴더로 복사한다(대상이 있으면 지우고 다시 만든다). 공개 키트 밖에만 쓴다."""
    stage = Path(stage)
    if (Path(source_kit).resolve() / "kit.json").exists() and stage.resolve() == Path(source_kit).resolve():
        raise km.ManifestError("스테이지 폴더가 원본 키트와 같습니다.")
    if stage.exists():
        shutil.rmtree(stage)
    shutil.copytree(source_kit, stage)
    return stage
