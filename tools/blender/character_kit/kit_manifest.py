"""`kit.json` 작성기 — 키트 폴더의 GLB를 읽어 manifest를 만든다 (bpy 불필요, 표준 라이브러리만).

만드는 것은 계약 `apps/character-lab/src/contracts/character-kit.ts`의 `kitManifestSchema`를 통과하고 검증기
(`scripts/verify-character-kit.mjs`)가 읽는 `kit.json`이다. 상수(joint 68개, 프리셋 어휘, 예산, 기본값, 역할별 틴트)는
파이썬에 복제하지 않고 `contract.json`(`scripts/blender/dump-kit-contract.mjs` 덤프)을 읽는다.
슬롯 능력(`slotCapabilities`)은 규칙 함수 `deriveKitCapabilities`(TS)를 node로 그대로 불러 계산한다 — 검증기 V17이 같은 함수의
결과(사유 문구까지)와 선언을 대조하기 때문이다.

파츠 레지스트리
----------------
파츠 GLB는 `parts/<base>/<슬롯>/<이름>.glb` 위치에 두면 자동으로 찾아 `<슬롯>/<이름>`(= 프리셋 id) 파츠로 등록한다. 몸에서 숨길 영역
(`hides`)처럼 GLB에서 알 수 없는 값은 선택 JSON 파일(`--parts-json`)로 준다(키트 폴더 밖에 둘 것 — 검증기 V2가 모르는 파일을 막는다)::

    { "top/tee": { "female": { "hides": ["torso", "upperArm.L", "upperArm.R"] } } }

등록된 파츠 GLB는 자동으로 검사한다: joint 이름 배열이 계약과 같은 순서로 같은지, 메시 노드 이름이 슬롯 규칙에 맞는지, 슬롯이 허용하는
역할뿐인지·필수 역할이 있는지, `hides`가 숨길 수 있는 영역인지. 어긋나면 `ManifestError`(한글 사유)로 멈춘다.
검사에서 채우는 값은 메시·재질·삼각형·정점·morph 목록·`skinned`·`doubleSided`·바이트 수·SHA-256이다.

베이스가 만든 값(영역 인덱스 범위 `bodyRegions`, 관절 오프셋 `jointOffsets`)은 `build_base.py`가 키트 폴더 밖에 쓰는
`base_meta_<base>.json` 사이드카에서 읽는다.

Hyper3D 파생 파츠의 출처
------------------------
의상·헤어 파츠 일부는 Hyper3D(Rodin) 생성물을 리타깃·재베이크한 파생물이다. 그 출처 표는 `hyper3d_sources.json`
(`build_kit_json.py --hyper3d-sources`)이고 형식은 아래와 같다(`load_hyper3d_sources`가 검사한다)::

    { "schema": "toonstudio.hyper3d-sources/1",
      "recordDoc": "apps/character-lab/docs/hyper3d-terms-record.md",      # 약관 반입 기록(저장소에 있어야 한다)
      "sources": { "top/tee": { "generationId": "<uuid>", "displayUrl": "https://...", "tier": "Gen-2.5-Medium",
                                "rawSha256": "<64hex>", "changesKo": "..." }, ... } }       # 키 = 프리셋 id

키트에 **실제로 등록된** 파츠 가운데 이 표에 키가 있는 것마다 `provenance.sources`에 항목 하나를 더한다(없는 파츠는 넣지 않는다):
`id = hyper3d-<슬롯>-<이름>`, `license = hyper3d-rodin-output`, `derivative = true`, `version = tier`, `url = displayUrl`,
`zipSha256 = rawSha256`(원본 GLB의 SHA-256), `generationId`, `evidenceDoc = recordDoc`. 계약(`kitSourceSchema`·`manifestIssues`)과
검증기 V4가 요구하는 값과 같다. **이 license 값은 법적 허용을 뜻하지 않는다** — 약관상 닫히지 않은 점은 `recordDoc`에 있다.
`provenance.summaryKo`와 `NOTICE.md`도 Hyper3D 파생 파츠가 있을 때 그 사실을 적는다(원본 GLB는 저장소에 없다).

파츠가 morph를 따라가는지 재는 척도 (리타깃 작업이 같은 기준으로 자체 검증하는 법)
---------------------------------------------------------------------------------
검증기 V9 "따라가기"는 `scripts/verify-character-kit.mjs`의 `checkFollow` → `verifyMorphFollow({subject, reference, names, quantile, radius})`다.
대상 정점마다 기준 메시(상의·하의·신발·속옷은 `TS_Body`, 속눈썹·눈썹은 `TS_Head`)에서 **가장 가까운 정점**(공간 해시, 반경 6 cm; 반경 밖 정점은
비교하지 않고 개수만 센다)을 찾고, 역할의 필수 morph(`KIT_MORPH_COVERAGE[role]` 중 양쪽 메시에 다 있는 이름)마다
`|Δ대상(v) − Δ기준(가장 가까운 정점)|`(m)을 잰다. 통계량은 `--follow-quantile`(기본 1 = 최댓값)이고, 경고 5 mm·오류 15 mm다.
같은 척도를 파이썬으로 옮긴 함수가 `base_assembly.follow_deviation(...)`이므로 리타깃은 GLB를 쓰기 전에 그것으로 먼저 잴 수 있다.
몸 가림 규약: `hides`는 `KIT_HIDEABLE_REGION_IDS`(15개: neck, torso, pelvis, upperArm.L/R, forearm.L/R, hand.L/R, thigh.L/R, calf.L/R, foot.L/R)의
부분집합이며 그 영역을 **전부** 덮을 때만 선언한다(헤어·홍채 슬롯은 숨길 수 없다). 영역 삼각형 범위는 베이스 `bodyRegions`가 정한다.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import re
import shutil
import struct
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from . import contract as contract_mod

#: 고정색 재질(눈·치아·혀·속옷·캐치라이트)의 `tint.hex`. 텍스처가 색을 나르고 이 값은 거의 흰색의 곱이다.
FIXED_TINT_HEX = "#f4f4f6"
KIT_NOTICE_FILE = "NOTICE.md"
MANIFEST_FILE = "kit.json"
ROOT_JOINT = "Armature"

HAIR_PATTERN = re.compile(r"^TS_AuthoredHair_(?P<style>[a-z0-9-]+)_LOD(?P<lod>\d+)$")
GARMENT_PREFIX = {"top": "TS_Top", "bottom": "TS_Bottom", "shoes": "TS_Shoes", "accessory": "TS_Accessory"}
IRIS_PREFIX = {"iris": "TS_Iris", "eye-highlight": "TS_Highlight", "pupil": "TS_Pupil"}

#: 계약 `KIT_ALLOWED_LICENSES`·`KIT_HYPER3D_EVIDENCE_PREFIX`의 사본이다(`contract.json` 덤프에는 들어 있지 않다). 어긋나면
#: `tests/test_kit_manifest.py`가 `character-kit.ts`를 읽어 잡아낸다.
HYPER3D_LICENSE = "hyper3d-rodin-output"
HYPER3D_EVIDENCE_PREFIX = "apps/character-lab/docs/"
HYPER3D_SOURCES_SCHEMA = "toonstudio.hyper3d-sources/1"
HYPER3D_SOURCE_NAME = "Hyper3D(Rodin Gen-2.5) 생성물"
HYPER3D_SOURCES_FILE = Path(__file__).resolve().parent / "hyper3d_sources.json"
_UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
_HANGUL_PATTERN = re.compile(r"[가-힣]")

REQUIRED_REASON_KO = "필수 파츠인데 아직 만들어 넣지 못했습니다(Hyper3D 생성물의 리타깃 단계를 기다리는 중입니다)."
OPTIONAL_REASON_KO = "이번 키트 빌드에서는 제작하지 않았습니다(필수 파츠 5종 이후 과제)."
MALE_SKIPPED_NOTE_KO = "남성 베이스(male)는 이번 빌드에서 만들지 않아 kit.json에 넣지 않았습니다(계약은 여성 베이스만 필수입니다)."


class ManifestError(ValueError):
    """키트 파일이 계약에 어긋나 manifest를 만들 수 없을 때(한글 사유)."""


# ---------------------------------------------------------------- GLB 읽기(구조만)


def parse_glb(data: bytes) -> tuple[dict[str, Any], bytes]:
    """GLB 컨테이너의 JSON 청크와 BIN 청크를 돌려준다."""
    if len(data) < 20:
        raise ManifestError("GLB 헤더(20바이트)보다 짧습니다.")
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ManifestError("glTF 2.0 GLB가 아닙니다.")
    if length != len(data):
        raise ManifestError(f"GLB 헤더 길이({length})가 파일 크기({len(data)})와 다릅니다.")
    offset = 12
    document: dict[str, Any] | None = None
    binary = b""
    while offset + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        body = data[offset + 8 : offset + 8 + chunk_length]
        if chunk_type == b"JSON":
            document = json.loads(body.decode("utf-8"))
        elif chunk_type == b"BIN\x00":
            binary = body
        offset += 8 + chunk_length
    if document is None:
        raise ManifestError("GLB에 JSON 청크가 없습니다.")
    return document, binary


@dataclass
class PrimInfo:
    material: str | None
    vertices: int
    triangles: int
    has_joints: bool
    has_weights: bool
    target_count: int


@dataclass
class MeshInfo:
    node: str
    prims: list[PrimInfo]
    morphs: list[str]
    skin_joint_count: int | None

    @property
    def vertices(self) -> int:
        return sum(prim.vertices for prim in self.prims)

    @property
    def triangles(self) -> int:
        return sum(prim.triangles for prim in self.prims)

    @property
    def skinned(self) -> bool:
        return self.skin_joint_count is not None and all(prim.has_joints and prim.has_weights for prim in self.prims)


@dataclass
class MaterialInfo:
    name: str
    double_sided: bool
    alpha_mode: str
    has_base_color_texture: bool


@dataclass
class GlbInfo:
    path: str
    joints: list[str]
    joint_parents: dict[str, str | None]
    meshes: list[MeshInfo]
    materials: dict[str, MaterialInfo]
    bounds_min: list[float]
    bounds_max: list[float]
    extensions_used: list[str]
    transformed_mesh_nodes: list[str] = field(default_factory=list)

    def mesh(self, node: str) -> MeshInfo | None:
        return next((mesh for mesh in self.meshes if mesh.node == node), None)


def inspect_glb(data: bytes, path: str = "(memory)") -> GlbInfo:
    """GLB를 구조만 읽어 메시·재질·morph 목록·경계를 돌려준다(정점 데이터는 읽지 않는다 — accessor 개수와 min/max만 쓴다)."""
    document, _ = parse_glb(data)
    nodes = document.get("nodes", [])
    accessors = document.get("accessors", [])
    skins = document.get("skins", [])
    joints: list[str] = []
    joint_parents: dict[str, str | None] = {}
    if skins:
        joint_indices = skins[0].get("joints", [])
        joints = [nodes[index].get("name", "") for index in joint_indices]
        parent_of: dict[int, int] = {}
        for index, node in enumerate(nodes):
            for child in node.get("children", []):
                parent_of[child] = index
        for index in joint_indices:
            parent = parent_of.get(index)
            joint_parents[nodes[index].get("name", "")] = None if parent is None else nodes[parent].get("name", "")
    materials_json = document.get("materials", [])
    materials: dict[str, MaterialInfo] = {}
    for material in materials_json:
        name = material.get("name", "")
        base = material.get("pbrMetallicRoughness", {})
        materials[name] = MaterialInfo(
            name=name,
            double_sided=bool(material.get("doubleSided", False)),
            alpha_mode=material.get("alphaMode", "OPAQUE"),
            has_base_color_texture="baseColorTexture" in base,
        )
    meshes: list[MeshInfo] = []
    bounds_min = [float("inf")] * 3
    bounds_max = [float("-inf")] * 3
    transformed: list[str] = []
    for node in nodes:
        mesh_index = node.get("mesh")
        if mesh_index is None:
            continue
        name = node.get("name", "")
        if any(key in node for key in ("translation", "rotation", "scale", "matrix")):
            transformed.append(name)
        mesh = document["meshes"][mesh_index]
        prims: list[PrimInfo] = []
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            position = accessors[attributes["POSITION"]]
            for axis in range(3):
                if "min" in position:
                    bounds_min[axis] = min(bounds_min[axis], position["min"][axis])
                if "max" in position:
                    bounds_max[axis] = max(bounds_max[axis], position["max"][axis])
            index_count = accessors[primitive["indices"]]["count"] if "indices" in primitive else position["count"]
            material_index = primitive.get("material")
            prims.append(
                PrimInfo(
                    material=None if material_index is None else materials_json[material_index].get("name", ""),
                    vertices=int(position["count"]),
                    triangles=int(index_count) // 3,
                    has_joints="JOINTS_0" in attributes,
                    has_weights="WEIGHTS_0" in attributes,
                    target_count=len(primitive.get("targets", [])),
                )
            )
        morphs = list(mesh.get("extras", {}).get("targetNames", []))
        skin_joints = None if "skin" not in node else len(skins[node["skin"]].get("joints", []))
        meshes.append(MeshInfo(node=name, prims=prims, morphs=morphs, skin_joint_count=skin_joints))
    return GlbInfo(
        path=path,
        joints=joints,
        joint_parents=joint_parents,
        meshes=meshes,
        materials=materials,
        bounds_min=bounds_min,
        bounds_max=bounds_max,
        extensions_used=list(document.get("extensionsUsed", [])),
        transformed_mesh_nodes=transformed,
    )


# ---------------------------------------------------------------- 레지스트리


@dataclass(frozen=True)
class PartEntry:
    """키트 폴더 안 파츠 GLB 하나(프리셋 id와 베이스, 상대 경로, 숨길 영역)."""

    preset_id: str
    base: str
    path: str
    hides: tuple[str, ...] = ()

    @property
    def slot(self) -> str:
        return self.preset_id.split("/", 1)[0]

    @property
    def name(self) -> str:
        return self.preset_id.split("/", 1)[1]


def discover_parts(kit_dir: Path, bases: list[str], hides_table: dict[str, dict[str, dict[str, Any]]] | None = None) -> list[PartEntry]:
    """`parts/<base>/<슬롯>/<이름>.glb`를 찾아 파츠 항목으로 만든다. `hides_table`은 `--parts-json`의 내용이다."""
    hides_table = hides_table or {}
    entries: list[PartEntry] = []
    for base in bases:
        root = kit_dir / "parts" / base
        if not root.is_dir():
            continue
        for glb in sorted(root.glob("*/*.glb")):
            slot = glb.parent.name
            preset_id = f"{slot}/{glb.stem}"
            relative = glb.relative_to(kit_dir).as_posix()
            hides = tuple(hides_table.get(preset_id, {}).get(base, {}).get("hides", ()))
            entries.append(PartEntry(preset_id=preset_id, base=base, path=relative, hides=hides))
    return entries


# ---------------------------------------------------------------- 메시·재질 선언


def _role_of_part_node(slot: str, name: str, preset_name: str) -> tuple[str, int | None]:
    """슬롯 규칙으로 파츠 메시 노드의 (역할, LOD)를 정한다. 규칙 밖이면 ManifestError."""
    if slot == "hair":
        match = HAIR_PATTERN.match(name)
        if match is None or match.group("style") != preset_name:
            raise ManifestError(f"헤어 메시 이름은 TS_AuthoredHair_{preset_name}_LOD<n> 형식이어야 합니다: {name}")
        return "hair", int(match.group("lod"))
    if slot in GARMENT_PREFIX:
        expected = f"{GARMENT_PREFIX[slot]}_{preset_name}"
        if name != expected:
            raise ManifestError(f"{slot} 파츠의 메시 이름은 {expected} 이어야 합니다: {name}")
        return slot, None
    if slot == "irises":
        for role, prefix in IRIS_PREFIX.items():
            if name in (f"{prefix}_L", f"{prefix}_R"):
                return role, None
        raise ManifestError(f"홍채 파츠의 메시 이름은 TS_Iris_L/R, TS_Highlight_L/R, TS_Pupil_L/R 중 하나여야 합니다: {name}")
    raise ManifestError(f"알 수 없는 파츠 슬롯입니다: {slot}")


def _mesh_declaration(info: MeshInfo, role: str, material: str, lod: int | None) -> dict[str, Any]:
    declaration: dict[str, Any] = {
        "node": info.node,
        "role": role,
        "material": material,
        "triangles": info.triangles,
        "vertices": info.vertices,
        "skinned": True,
        "morphs": list(info.morphs),
    }
    if lod is not None:
        declaration["lod"] = lod
    return declaration


def _single_material(info: MeshInfo) -> str:
    names = {prim.material for prim in info.prims}
    if len(names) != 1 or None in names:
        raise ManifestError(f"{info.node}: 프리미티브 재질이 하나가 아닙니다({sorted(str(name) for name in names)}).")
    return str(next(iter(names)))


def _check_skin(info: GlbInfo, contract: contract_mod.Contract, label: str) -> None:
    if info.joints != contract.joints:
        diff = next((i for i, (a, b) in enumerate(zip(info.joints, contract.joints, strict=False)) if a != b), min(len(info.joints), len(contract.joints)))
        raise ManifestError(f"{label}: skin.joints({len(info.joints)}개)가 계약 joint 배열({len(contract.joints)}개)과 같은 순서로 같지 않습니다(첫 차이 {diff}번째).")
    for joint, parent in info.joint_parents.items():
        expected = contract.parents.get(joint)
        expected = ROOT_JOINT if expected is None else expected
        if parent != expected:
            raise ManifestError(f"{label}: joint {joint}의 부모가 {parent}입니다. 기대 {expected}.")
    for mesh in info.meshes:
        if not mesh.skinned:
            raise ManifestError(f"{label}:{mesh.node}: 스킨에 바인딩되지 않았거나 JOINTS_0/WEIGHTS_0이 없습니다.")
        if mesh.skin_joint_count != len(contract.joints):
            raise ManifestError(f"{label}:{mesh.node}: skin joint 수가 {mesh.skin_joint_count}입니다.")
    if info.transformed_mesh_nodes:
        raise ManifestError(f"{label}: 스킨 메시 노드에 변환이 있습니다(항등이어야 함): {', '.join(info.transformed_mesh_nodes)}")


def _tint_for(role: str, contract: contract_mod.Contract) -> dict[str, Any]:
    rule = contract.raw["roleTintRules"].get(role)
    if rule is None:
        return {"mode": "fixed", "hex": "#101014"}  # pupil: 계약이 제약하지 않는다
    if rule["mode"] == "recolor":
        return {"mode": "recolor", "colorKey": rule["colorKey"]}
    return {"mode": "fixed", "hex": FIXED_TINT_HEX}


def _register_material(materials: dict[str, dict[str, Any]], info: GlbInfo, name: str, role: str, contract: contract_mod.Contract) -> None:
    glb_material = info.materials.get(name)
    if glb_material is None:
        raise ManifestError(f"{info.path}: 재질 '{name}'이 GLB에 없습니다.")
    entry = {"role": role, "tint": _tint_for(role, contract), "doubleSided": glb_material.double_sided}
    previous = materials.get(name)
    if previous is not None and previous != entry:
        raise ManifestError(f"재질 '{name}'이 파일마다 다르게 정의되었습니다({previous} ≠ {entry}).")
    materials[name] = entry


def base_mesh_declarations(info: GlbInfo, contract: contract_mod.Contract, materials: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """베이스 GLB의 메시 9개를 계약 `baseMeshSpecs`에 맞춰 선언한다."""
    declarations: list[dict[str, Any]] = []
    for spec in contract.raw["baseMeshSpecs"]:
        mesh = info.mesh(spec["node"])
        if mesh is None:
            raise ManifestError(f"{info.path}: 베이스 메시 {spec['node']}가 GLB에 없습니다.")
        if "primitiveRoles" in spec:
            actual = [prim.material for prim in mesh.prims]
            if actual != spec["primitiveMaterials"]:
                raise ManifestError(f"{spec['node']}: 프리미티브 재질 {actual}이 계약 {spec['primitiveMaterials']}과 다릅니다.")
            declaration = {
                "node": mesh.node,
                "primitiveRoles": list(spec["primitiveRoles"]),
                "primitiveMaterials": list(spec["primitiveMaterials"]),
                "triangles": mesh.triangles,
                "vertices": mesh.vertices,
                "skinned": True,
                "morphs": list(mesh.morphs),
            }
            for role, material in zip(spec["primitiveRoles"], spec["primitiveMaterials"], strict=True):
                _register_material(materials, info, material, role, contract)
        else:
            material = _single_material(mesh)
            if material != spec["material"]:
                raise ManifestError(f"{spec['node']}: 재질 '{material}'이 계약 '{spec['material']}'과 다릅니다.")
            declaration = _mesh_declaration(mesh, spec["role"], material, None)
            _register_material(materials, info, material, spec["role"], contract)
        declarations.append(declaration)
    extra = [mesh.node for mesh in info.meshes if mesh.node not in {spec["node"] for spec in contract.raw["baseMeshSpecs"]}]
    if extra:
        raise ManifestError(f"{info.path}: 계약에 없는 베이스 메시가 있습니다: {', '.join(extra)}")
    return declarations


def part_mesh_declarations(info: GlbInfo, entry: PartEntry, contract: contract_mod.Contract, materials: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """파츠 GLB의 메시를 슬롯 규칙으로 선언하고 슬롯 허용·필수 역할을 점검한다."""
    declarations: list[dict[str, Any]] = []
    present: set[str] = set()
    for mesh in sorted(info.meshes, key=lambda item: item.node):
        role, lod = _role_of_part_node(entry.slot, mesh.node, entry.name)
        material = _single_material(mesh)
        declarations.append(_mesh_declaration(mesh, role, material, lod))
        _register_material(materials, info, material, role, contract)
        present.add(role)
    allowed = contract.raw["partSlotRoles"][entry.slot]
    required = contract.raw["partSlotRequiredRoles"][entry.slot]
    for role in present:
        if role not in allowed:
            raise ManifestError(f"{entry.preset_id}: 슬롯 {entry.slot}에 허용되지 않는 역할 {role}입니다(허용: {', '.join(allowed)}).")
    for role in required:
        if role not in present:
            raise ManifestError(f"{entry.preset_id}: 필수 역할 {role} 메시가 없습니다.")
    if entry.slot in ("hair", "irises") and entry.hides:
        raise ManifestError(f"{entry.preset_id}: 슬롯 {entry.slot}은 몸 영역을 숨길 수 없습니다.")
    unknown = [region for region in entry.hides if region not in contract.hideable_region_ids]
    if unknown:
        raise ManifestError(f"{entry.preset_id}: 숨길 수 없는 영역입니다: {', '.join(unknown)}")
    return declarations


# ---------------------------------------------------------------- 능력 계산(TS 규칙을 그대로 호출)

def derive_capabilities(manifest: dict[str, Any], repo_root: Path) -> dict[str, Any]:
    """`deriveKitCapabilities`(TS)를 node+tsx로 호출해 베이스별 15슬롯 능력을 돌려준다."""
    repo_root = Path(repo_root).resolve()
    node = shutil.which("node")
    if node is None:
        raise ManifestError("node를 찾지 못해 deriveKitCapabilities를 호출할 수 없습니다.")
    capability_module = (repo_root / "apps/character-lab/src/domains/authored/kit-capability.ts").as_posix()
    script = (
        'import { readFileSync } from "node:fs";'
        f'const {{ deriveKitCapabilities }} = await import({json.dumps(capability_module)});'
        'const manifest = JSON.parse(readFileSync(process.argv[1], "utf8"));'
        "const out = {};"
        'for (const id of ["female", "male"]) if (manifest.bases[id] !== undefined) out[id] = deriveKitCapabilities(manifest, id);'
        "process.stdout.write(JSON.stringify(out));"
    )
    with tempfile.TemporaryDirectory() as temp:
        manifest_path = Path(temp) / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        result = subprocess.run(
            [node, "--import", "tsx", "--input-type=module", "-e", script, manifest_path.as_posix()],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=False,
        )
    if result.returncode != 0:
        raise ManifestError(f"deriveKitCapabilities 호출에 실패했습니다: {result.stderr.strip()[-600:]}")
    return json.loads(result.stdout)


# ---------------------------------------------------------------- manifest 만들기


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _file_entry(kit_dir: Path, relative: str) -> tuple[dict[str, Any], bytes]:
    data = (kit_dir / relative).read_bytes()
    return {"path": relative, "bytes": len(data), "sha256": sha256_of(data)}, data


@dataclass(frozen=True)
class Hyper3dSources:
    """`hyper3d_sources.json`의 내용(형식 검사를 마친 것). `sources`의 키는 프리셋 id다."""

    record_doc: str
    sources: dict[str, dict[str, Any]]


def load_hyper3d_sources(path: Path, repo_root: Path) -> Hyper3dSources:
    """Hyper3D 출처 표를 읽어 형식과 반입 기록 문서의 존재를 검사한다(항목별 값 검사는 파츠가 등록될 때 `hyper3d_source_entry`가 한다)."""
    try:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ManifestError(f"Hyper3D 출처 표를 읽지 못했습니다({path}): {error}") from error
    if not isinstance(document, dict) or document.get("schema") != HYPER3D_SOURCES_SCHEMA:
        raise ManifestError(f"Hyper3D 출처 표의 schema가 {HYPER3D_SOURCES_SCHEMA}가 아닙니다({path}).")
    record_doc = document.get("recordDoc")
    if not isinstance(record_doc, str) or not record_doc.startswith(HYPER3D_EVIDENCE_PREFIX) or ".." in record_doc or "\\" in record_doc:
        raise ManifestError(f"Hyper3D 출처 표의 recordDoc는 {HYPER3D_EVIDENCE_PREFIX} 아래의 상대 경로여야 합니다: {record_doc!r}")
    if not (Path(repo_root) / record_doc).is_file():
        raise ManifestError(f"Hyper3D 반입 기록 문서가 저장소에 없습니다: {record_doc}")
    sources = document.get("sources")
    if not isinstance(sources, dict):
        raise ManifestError("Hyper3D 출처 표에 sources 객체가 없습니다.")
    return Hyper3dSources(record_doc=record_doc, sources=sources)


def hyper3d_source_entry(preset_id: str, record: dict[str, Any], record_doc: str) -> dict[str, Any]:
    """파츠 하나의 `provenance.sources[]` 항목을 만든다. 계약(`manifestIssues`)·검증기 V4가 요구하는 값이 모자라면 ManifestError."""
    base_key, _, base_id = preset_id.partition("@")  # `슬롯/이름@베이스`: 그 베이스만 다른 생성물을 쓸 때(남성 전용 헤어·의상)
    if "/" not in base_key or ("@" in preset_id and not base_id):
        raise ManifestError(f"Hyper3D 출처 표의 키가 슬롯/이름[@베이스] 형식이 아닙니다: {preset_id}")
    if not isinstance(record, dict):
        raise ManifestError(f"{preset_id}: Hyper3D 출처 표 항목이 객체가 아닙니다.")

    def text(key: str, valid: Any, expectation: str) -> str:
        value = record.get(key)
        if not isinstance(value, str) or not valid(value):
            raise ManifestError(f"{preset_id}: Hyper3D 출처 표의 {key}가 올바르지 않습니다({expectation}): {value!r}")
        return value

    slot, name = base_key.split("/", 1)
    return {
        "id": f"hyper3d-{slot}-{name}" + (f"-{base_id}" if base_id else ""),
        "name": f"{HYPER3D_SOURCE_NAME} {preset_id}",
        "version": text("tier", bool, "비어 있지 않은 문자열"),
        "url": text("displayUrl", lambda value: value.startswith("https://"), "https URL"),
        "zipSha256": text("rawSha256", _SHA256_PATTERN.match, "원본 GLB의 SHA-256, 소문자 64자리 hex"),
        "license": HYPER3D_LICENSE,
        "derivative": True,
        "changesKo": text("changesKo", _HANGUL_PATTERN.search, "한글 변경 내용"),
        "generationId": text("generationId", _UUID_PATTERN.match, "소문자 uuid"),
        "evidenceDoc": record_doc,
    }


def hyper3d_provenance_sources(hyper3d: Hyper3dSources | None, registered_ids: Iterable[str]) -> list[tuple[str, dict[str, Any]]]:
    """키트에 **등록된** 파츠 중 출처 표에 키가 있는 것의 (프리셋 id, 출처 항목). 등록되지 않은 파츠는 넣지 않는다."""
    if hyper3d is None:
        return []
    registered = list(registered_ids)
    keys = [key for key in registered if key in hyper3d.sources]
    # `슬롯/이름@베이스` 항목은 기본 파츠가 등록돼 있을 때만 넣는다(그 베이스 변형이 키트에 있다는 뜻)
    keys += [key for key in hyper3d.sources if "@" in key and key.partition("@")[0] in registered]
    return [(key, hyper3d_source_entry(key, hyper3d.sources[key], hyper3d.record_doc)) for key in keys]


def provenance_summary_ko(derived: list[tuple[str, dict[str, Any]]]) -> str:
    """`provenance.summaryKo`. Hyper3D 파생 파츠가 있으면 그 사실과 한계를 적는다."""
    base = "Blender Foundation Human Base Meshes Bundle v1.4.1(CC0)을 가공한 파생물과 이 저장소에서 절차 생성한 원본 디자인"
    if not derived:
        return f"{base}입니다."
    record_docs = sorted({entry["evidenceDoc"] for _, entry in derived})
    return (
        f"{base}, 그리고 Hyper3D(Rodin Gen-2.5) 생성물을 리타깃·재베이크한 파생 파츠 {len(derived)}종({', '.join(preset_id for preset_id, _ in derived)})입니다. "
        f"Hyper3D 파츠의 license 값({HYPER3D_LICENSE})은 법적 허용을 뜻하지 않습니다. 약관상 닫히지 않은 점은 {', '.join(record_docs)}에 있고 "
        "파츠별 생성 id는 provenance.sources[].generationId에 있습니다. Hyper3D 원본 GLB는 저장소에 없습니다."
    )


def provenance_block(
    contract: contract_mod.Contract,
    hyper3d: Hyper3dSources | None = None,
    registered_ids: Iterable[str] = (),
) -> dict[str, Any]:
    """출처·라이선스: Human Base Meshes(CC0), 이 저장소의 절차 생성 원본, 그리고 키트에 등록된 Hyper3D 파생 파츠(출처 표에 있는 것만)."""
    del contract
    derived = hyper3d_provenance_sources(hyper3d, registered_ids)
    return {
        "summaryKo": provenance_summary_ko(derived),
        "noticeFile": KIT_NOTICE_FILE,
        "sources": [
            {
                "id": "hbm-1.4.1",
                "name": "Blender Foundation Human Base Meshes Bundle",
                "version": "1.4.1",
                "url": "https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip",
                "zipSha256": "811f43accbb31a88266d932f8f5563b2d13586fca0ba2693aad1f5fe582b3515",
                "license": "CC0-1.0",
                "derivative": True,
                "changesKo": (
                    "GEO-body_female_realistic 사용. 멀티레스 레벨 1 적용, 목에서 몸/머리 분할, A-포즈에서 T-포즈로 변환, 68 joint 리깅과 스킨 웨이트, "
                    "UV 재전개와 텍스처 새로 제작, 체형·얼굴·표정 morph 추가, 속옷·구강 내부(치아·혀)·속눈썹·눈썹 추가, 눈 메시 재구성(공막과 홍채 분리)."
                ),
            },
            {
                "id": "toonstudio-original",
                "name": "ToonStudio 원본 디자인(속옷·구강 내부·속눈썹·눈썹·홍채 5종·안경·귀걸이·텍스처)",
                "license": "original",
                "derivative": False,
                "changesKo": "tools/blender/character_kit 로 절차 생성한 원본 지오메트리와 텍스처입니다. 안경·귀걸이는 베이스의 눈·귀 위치에서 계산해 만들었고 외부 에셋을 쓰지 않았습니다.",
            },
            *(entry for _, entry in derived),
        ],
    }


def default_unavailable_reason(preset_id: str, contract: contract_mod.Contract) -> str:
    return REQUIRED_REASON_KO if preset_id in contract.required_presets else OPTIONAL_REASON_KO


def _base_block(kit_dir: Path, contract: contract_mod.Contract, base_path: str, base_meta: dict[str, Any], materials: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """베이스 GLB 하나를 검사해 manifest의 `bases[<id>]` 블록을 만든다."""
    base_file, base_data = _file_entry(kit_dir, base_path)
    base_info = inspect_glb(base_data, base_path)
    _check_skin(base_info, contract, base_path)
    base_meshes = base_mesh_declarations(base_info, contract, materials)
    body_nodes = [mesh for mesh in base_info.meshes if mesh.node in ("TS_Body", "TS_Head")]
    if len(body_nodes) != 2:
        raise ManifestError("베이스에 TS_Body와 TS_Head가 모두 있어야 합니다.")
    # 높이 = TS_Body+TS_Head 의 y 범위. 두 메시의 경계를 따로 모으려면 정점이 필요하므로 사이드카의 값을 쓴다.
    height = float(base_meta["heightM"])
    bounds = base_meta.get("boundsM") or {"min": base_info.bounds_min, "max": base_info.bounds_max}
    return {
        "file": base_file,
        "heightM": round(height, 4),
        "boundsM": {"min": [round(float(v), 4) for v in bounds["min"]], "max": [round(float(v), 4) for v in bounds["max"]]},
        "meshes": base_meshes,
        "bodyRegions": base_meta["bodyRegions"],
    }


def build_manifest(
    *,
    kit_dir: Path,
    contract: contract_mod.Contract,
    base_id: str,
    base_path: str,
    base_meta: dict[str, Any],
    parts: list[PartEntry],
    repo_root: Path,
    generator_command: list[str],
    blender_version: str,
    unavailable_reasons: dict[str, str] | None = None,
    hyper3d_sources: Hyper3dSources | None = None,
    now: datetime.date | None = None,
    extra_bases: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """키트 폴더의 GLB들을 검사해 `kit.json` 내용을 만든다. `hyper3d_sources`는 등록된 파츠 가운데 출처 표에 있는 것의 출처 항목을 더한다.

    `extra_bases`는 기본 베이스(`base_id`) 말고 더 넣을 베이스들 `[{"base_id", "base_path", "base_meta"}]`(예: 남성). 파츠 항목은 베이스마다 `variants[<베이스>]`를 갖고,
    그 베이스용 GLB가 없으면 `unavailable[<베이스>]`에 한글 사유를 적는다(`unavailable_reasons`는 프리셋 id 또는 `프리셋id@베이스`로 지정).
    """
    kit_dir = Path(kit_dir)
    unavailable_reasons = unavailable_reasons or {}
    materials: dict[str, dict[str, Any]] = {}

    all_bases = [{"base_id": base_id, "base_path": base_path, "base_meta": base_meta}, *(extra_bases or [])]
    base_ids = [item["base_id"] for item in all_bases]
    if len(set(base_ids)) != len(base_ids):
        raise ManifestError(f"베이스 id가 중복되었습니다: {base_ids}")
    bases_block = {item["base_id"]: _base_block(kit_dir, contract, item["base_path"], item["base_meta"], materials) for item in all_bases}

    entries_by_id: dict[str, dict[str, PartEntry]] = {}
    for entry in parts:
        if entry.base not in base_ids:
            raise ManifestError(f"{entry.preset_id}: 이 빌드의 베이스는 {', '.join(base_ids)}뿐입니다({entry.base}).")
        group = entries_by_id.setdefault(entry.preset_id, {})
        if entry.base in group:
            raise ManifestError(f"파츠 id가 중복되었습니다: {entry.preset_id}({entry.base})")
        group[entry.base] = entry

    vocabulary: dict[str, list[str]] = contract.raw["presetVocabulary"]
    part_blocks: list[dict[str, Any]] = []
    for slot in contract.raw["partSlots"]:
        for name in vocabulary[slot]:
            preset_id = f"{slot}/{name}"
            group = entries_by_id.pop(preset_id, {})
            variants: dict[str, Any] = {}
            unavailable: dict[str, str] = {}
            for each_base in base_ids:
                entry = group.get(each_base)
                if entry is None:
                    unavailable[each_base] = unavailable_reasons.get(f"{preset_id}@{each_base}") or unavailable_reasons.get(preset_id) or default_unavailable_reason(preset_id, contract)
                    continue
                file_entry, data = _file_entry(kit_dir, entry.path)
                info = inspect_glb(data, entry.path)
                _check_skin(info, contract, entry.path)
                declarations = part_mesh_declarations(info, entry, contract, materials)
                variants[each_base] = {"file": file_entry, "meshes": declarations, "hides": list(entry.hides)}
            part_blocks.append({"id": preset_id, "slot": slot, "variants": variants, "unavailable": unavailable})
    if entries_by_id:
        raise ManifestError(f"프리셋 어휘에 없는 파츠가 등록되었습니다: {', '.join(sorted(entries_by_id))}")

    manifest: dict[str, Any] = {
        "schema": contract.raw["schema"],
        "kitId": contract.raw["kitId"],
        "kitVersion": contract.raw["kitVersion"],
        "displayName": "ToonStudio 캐릭터 키트 v1",
        "generatedAt": (now or datetime.date.today()).isoformat(),
        "generator": {"tool": "tools/blender/character_kit", "blender": blender_version, "command": generator_command},
        "coordinateSystem": {"up": "+Y", "forward": "+Z", "unit": "m", "handedness": "right", "rest": "T-pose", "rootScale": 1},
        "provenance": provenance_block(contract, hyper3d_sources, [part["id"] for part in part_blocks if part["variants"]]),
        "skeleton": {
            "root": ROOT_JOINT,
            "joints": contract.joints,
            "parents": contract.parents,
            "boneMap": contract.bone_map,
            "endBones": contract.end_bones,
        },
        "materials": materials,
        "jointOffsets": base_meta["jointOffsets"],
        "bases": bases_block,
        "parts": part_blocks,
        "defaults": {"base": contract.raw["defaultBase"], "slots": contract.raw["defaultSlots"], "colors": contract.raw["defaultColors"]},
        "slotCapabilities": {},
        "physics": {"mode": "static", "chains": [], "colliders": []},
        "budgets": contract.budget,
    }
    manifest["slotCapabilities"] = derive_capabilities(manifest, repo_root)
    return manifest


def write_manifest(manifest: dict[str, Any], path: Path) -> None:
    Path(path).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def hyper3d_notice_section(entries: list[dict[str, Any]]) -> str:
    """`NOTICE.md`의 Hyper3D 파생 파츠 절. `kit.json`의 출처 항목에서만 만든다(없으면 빈 문자열)."""
    if not entries:
        return ""
    record_docs = ", ".join(f"`{doc}`" for doc in sorted({entry["evidenceDoc"] for entry in entries}))
    lines = [
        "## 원천 3 — Hyper3D(Rodin Gen-2.5) 생성물의 파생 파츠 (license: hyper3d-rodin-output)",
        "",
        f"- 이 파츠 {len(entries)}종은 Hyper3D(Rodin) 구독 플랜으로 생성한 결과물을 이 저장소에서 리타깃·재베이크한 **파생물**이다.",
        f"- **`{HYPER3D_LICENSE}` 값은 법적 허용을 뜻하지 않는다.** 구독 약관의 상업 이용·소유권·수정·공개 호스팅 조항과 약관상 닫히지 않은 점은",
        f"  반입 기록 {record_docs}에 있다. 이 값은 그 기록과 생성 id 없이는 반입하지 못하게 하는 장치일 뿐이다(계약 `KIT_ALLOWED_LICENSES`).",
        "- Hyper3D가 돌려준 **원본 GLB는 저장소에 없다**(커밋하지 않았다). 아래 SHA-256은 그 원본 파일의 해시이고, 결과 페이지가 계속 열리는지는 확인하지 않았다.",
        "",
    ]
    for entry in entries:
        lines += [
            f"### {entry['name'].removeprefix(HYPER3D_SOURCE_NAME + ' ')} (`{entry['id']}`)",
            "",
            f"- 생성 id: `{entry['generationId']}`",
            f"- 결과 페이지: {entry['url']}",
            f"- 등급: {entry.get('version', '미기재')}",
            f"- 원본 GLB SHA-256: `{entry['zipSha256']}`",
            f"- 가공 내용: {entry['changesKo']}",
            "",
        ]
    return "\n".join(lines) + "\n"


def notice_text(contract: contract_mod.Contract, manifest: dict[str, Any]) -> str:
    """`NOTICE.md`(사람용 출처·라이선스 요약). 기준은 `kit.json`의 provenance다."""
    hbm = next(source for source in manifest["provenance"]["sources"] if source["id"] == "hbm-1.4.1")
    hyper3d_entries = [source for source in manifest["provenance"]["sources"] if source["license"] == HYPER3D_LICENSE]
    parts_present = sorted(part["id"] for part in manifest["parts"] if part["variants"])
    if hyper3d_entries:
        not_used = (
            "- 상용 제품 에셋과 라이선스가 불명확한 에셋은 이 키트에 들어 있지 않다. Hyper3D(Rodin) 생성물은 위 원천 3에 적은 파생 파츠만 들어 있다.\n"
            f"  이 키트에 쓰인 라이선스 값은 `CC0-1.0`, `original`, `{HYPER3D_LICENSE}`이다(마지막 값은 법적 허용을 뜻하지 않는다)."
        )
    else:
        not_used = (
            "- Hyper3D(Rodin) 생성물, 상용 제품 에셋, 라이선스가 불명확한 에셋은 이 키트에 들어 있지 않다. 이 키트에 쓰인 라이선스 값은\n"
            f"  `CC0-1.0`과 `original`뿐이다(계약은 `{HYPER3D_LICENSE}`도 허용하지만 이 키트에는 그 출처의 파츠가 없다)."
        )
    return f"""# ToonStudio 캐릭터 키트 v1 — 출처와 라이선스 고지

이 파일은 `tools/blender/character_kit`가 `kit.json`과 함께 만든 사람용 요약입니다. 기준은 `kit.json`의 `provenance`입니다.
생성일 {manifest["generatedAt"]}, 도구 `{manifest["generator"]["tool"]}`, Blender(bpy) {manifest["generator"]["blender"]}.

## 원천 1 — Blender Foundation Human Base Meshes Bundle v{hbm["version"]} (CC0 1.0)

- 사용한 에셋: `GEO-body_female_realistic`(몸, 저자 Dan Ulrich)와 그 눈 구(`.eye.L/.eye.R`). 번들 `human_base_meshes_bundle.blend`에서 추출했다.
- 내려받기: {hbm["url"]}
- 번들 zip SHA-256: `{hbm["zipSha256"]}` (내려받은 파일과 일치함을 확인했다)
- 라이선스: CC0 1.0. 근거 — 번들 README("All provided assets are public domain under the CC0 license"), 번들 안 에셋 메타데이터
  25개 전부 `license = CC0`, Blender 공식 데모 파일 페이지의 라이선스 표기.
- **번들 안의 불일치 1건(그대로 적는다)**: 번들의 `License` 텍스트 데이터블록에는 "The Rain Rig is released under the Creative Commons
  Attribution 4.0 license"라는 문장이 있다. 번들에는 아마추어(리그) 오브젝트가 없고(오브젝트는 메시 382개와 카메라 25개뿐) 이름에
  `rain`/`rig`가 들어간 오브젝트도 없다. 그래서 이 문장은 이 번들에 들어 있지 않은 다른 배포물의 문구가 남은 것으로 **추정**한다
  (추정이며 확인하지 못했다). 이 키트는 Rain Rig를 쓰지 않는다 — 스켈레톤은 이 저장소에서 새로 만든 68 joint다.
- 가공 내용: {hbm["changesKo"]}

## 원천 2 — ToonStudio 원본 (license: original)

- 속옷·구강 내부(치아·잇몸·혀)·속눈썹·눈썹·홍채·캐치라이트의 지오메트리와 몸 쪽 텍스처(피부·눈·치아·혀·속옷·속눈썹·눈썹·홍채)는
  `tools/blender/character_kit`가 절차 생성했다. 이 항목들에는 외부 이미지·스캔·사진을 쓰지 않았다.

{hyper3d_notice_section(hyper3d_entries)}## 쓰지 않은 것

{not_used}

## 들어 있는 파일

- 베이스: `bases/female.glb` (남성 베이스는 이번 빌드에서 만들지 않았다.)
- 파츠: {", ".join(parts_present) if parts_present else "없음(필수 파츠 5종은 아직 만들어 넣지 못했다)"}
- 아직 없는 프리셋은 `kit.json`의 `parts[].unavailable`에 한글 사유가 있다.

## 재현

```text
pnpm exec tsx scripts/blender/dump-kit-contract.mjs --out <contract.json>
<venv>/bin/python -I tools/blender/character_kit/build_base.py --contract <contract.json> ...
<venv>/bin/python -I tools/blender/character_kit/build_irises.py ...
<venv>/bin/python -I tools/blender/character_kit/build_kit_json.py ...
pnpm exec tsx scripts/verify-character-kit.mjs --root <키트 폴더> --base female
```
"""
