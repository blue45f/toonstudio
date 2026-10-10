"""키트용 GLB 2.0 작성기 (numpy만 사용, bpy 불필요).

Blender 내보내기에 기대지 않고 키트 계약에 필요한 구조를 정확히 쓰려고 직접 작성한다.

- 노드: `Armature` 루트(항등) 아래 joint 노드(이동만, 회전 항등)와, 장면 루트에 놓인 항등 변환의 스킨 메시 노드.
- 정점 속성: POSITION·NORMAL·TEXCOORD_0·JOINTS_0(UNSIGNED_BYTE)·WEIGHTS_0(FLOAT)·`_REGION`(UNSIGNED_BYTE 스칼라, 4바이트 간격)·COLOR_0(선택).
- morph: `mesh.extras.targetNames`와 프리미티브 `targets`. 0이 아닌 정점이 적으면 sparse accessor로 쓴다.
- 이미지는 bufferView에 임베드한다(JPEG/PNG).
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass, field
from typing import Any

import numpy as np

# glTF 상수
_FLOAT = 5126
_UBYTE = 5121
_USHORT = 5123
_UINT = 5125
_ARRAY_BUFFER = 34962
_ELEMENT_ARRAY_BUFFER = 34963
_TRIANGLES = 4

_COMPONENT_TYPE = {np.dtype(np.float32): _FLOAT, np.dtype(np.uint8): _UBYTE, np.dtype(np.uint16): _USHORT, np.dtype(np.uint32): _UINT}
_TYPE_NAME = {1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4", 16: "MAT4"}

# 이 비율보다 0이 아닌 정점이 적으면 morph 타깃을 sparse로 쓴다.
SPARSE_THRESHOLD = 0.6


def _pad4(data: bytes, pad: bytes = b"\x00") -> bytes:
    remainder = len(data) % 4
    return data if remainder == 0 else data + pad * (4 - remainder)


@dataclass
class MorphTarget:
    """morph 타깃 하나: 위치 델타 (N,3) float32와 선택 법선 델타."""

    name: str
    position: np.ndarray
    normal: np.ndarray | None = None


@dataclass
class Primitive:
    positions: np.ndarray  # (N,3) float32
    indices: np.ndarray  # (M,3) 또는 (3M,) 정수
    normals: np.ndarray | None = None
    uvs: np.ndarray | None = None
    joints: np.ndarray | None = None  # (N,4) uint8/uint16
    weights: np.ndarray | None = None  # (N,4) float32
    region: np.ndarray | None = None  # (N,) uint8
    color0: np.ndarray | None = None  # (N,4) float32 0..1
    material: int | None = None
    targets: list[MorphTarget] = field(default_factory=list)


class GlbWriter:
    """GLB 한 개를 조립한다. 메서드는 만든 요소의 인덱스를 돌려준다."""

    def __init__(self, generator: str = "toonstudio character_kit") -> None:
        self._json: dict[str, Any] = {"asset": {"version": "2.0", "generator": generator}}
        self._bin = bytearray()
        self._joint_nodes: list[int] = []
        self._scene_nodes: list[int] = []
        self._skin: int | None = None

    # ---- 낮은 수준: 버퍼 --------------------------------------------------------------
    def _list(self, key: str) -> list[Any]:
        return self._json.setdefault(key, [])

    def add_buffer_view(self, data: bytes, target: int | None = None, byte_stride: int | None = None) -> int:
        offset = len(self._bin)
        self._bin += data
        self._bin += b"\x00" * ((-len(self._bin)) % 4)
        view: dict[str, Any] = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        if byte_stride is not None:
            view["byteStride"] = byte_stride
        views = self._list("bufferViews")
        views.append(view)
        return len(views) - 1

    def add_accessor(
        self,
        array: np.ndarray,
        *,
        target: int | None = None,
        normalized: bool = False,
        with_bounds: bool = False,
        byte_stride: int | None = None,
        name: str | None = None,
    ) -> int:
        """조밀 accessor. `array`는 (N,) 또는 (N,k) 또는 (N,4,4)."""
        array = np.ascontiguousarray(array)
        component = _COMPONENT_TYPE[array.dtype]
        if array.ndim == 1:
            width = 1
        elif array.ndim == 2:
            width = array.shape[1]
        else:
            width = int(np.prod(array.shape[1:]))
        flat = array.reshape(array.shape[0], width)
        raw = flat
        if byte_stride is not None:
            element = width * array.dtype.itemsize
            if byte_stride < element:
                raise ValueError("byteStride가 요소 크기보다 작습니다.")
            padded = np.zeros((flat.shape[0], byte_stride), dtype=np.uint8)
            padded[:, :element] = flat.view(np.uint8).reshape(flat.shape[0], element)
            raw = padded
        view = self.add_buffer_view(raw.tobytes(), target=target, byte_stride=byte_stride)
        accessor: dict[str, Any] = {"bufferView": view, "componentType": component, "count": int(array.shape[0]), "type": _TYPE_NAME[width]}
        if normalized:
            accessor["normalized"] = True
        if with_bounds and array.shape[0] > 0:
            accessor["min"] = [float(v) for v in flat.min(axis=0)]
            accessor["max"] = [float(v) for v in flat.max(axis=0)]
        if name:
            accessor["name"] = name
        accessors = self._list("accessors")
        accessors.append(accessor)
        return len(accessors) - 1

    def add_morph_accessor(self, delta: np.ndarray, *, sparse_threshold: float = SPARSE_THRESHOLD) -> int:
        """morph 델타 (N,3) float32. 0이 아닌 정점이 적으면 sparse, 전부 0이면 bufferView 없는 0 accessor."""
        delta = np.ascontiguousarray(delta, dtype=np.float32)
        count = int(delta.shape[0])
        nonzero = np.flatnonzero(np.any(delta != 0.0, axis=1))
        accessor: dict[str, Any] = {"componentType": _FLOAT, "count": count, "type": "VEC3"}
        if count > 0:
            accessor["min"] = [float(v) for v in delta.min(axis=0)]
            accessor["max"] = [float(v) for v in delta.max(axis=0)]
        if nonzero.size == 0:
            pass
        elif nonzero.size / max(count, 1) < sparse_threshold:
            index_dtype = np.uint16 if count <= 0xFFFF else np.uint32
            indices = nonzero.astype(index_dtype)
            index_view = self.add_buffer_view(indices.tobytes())
            value_view = self.add_buffer_view(np.ascontiguousarray(delta[nonzero]).tobytes())
            accessor["sparse"] = {
                "count": int(nonzero.size),
                "indices": {"bufferView": index_view, "componentType": _COMPONENT_TYPE[np.dtype(index_dtype)]},
                "values": {"bufferView": value_view},
            }
        else:
            accessor["bufferView"] = self.add_buffer_view(delta.tobytes(), target=_ARRAY_BUFFER)
        accessors = self._list("accessors")
        accessors.append(accessor)
        return len(accessors) - 1

    # ---- 이미지·재질 -----------------------------------------------------------------
    def add_texture(self, data: bytes, mime_type: str, name: str | None = None) -> int:
        if mime_type not in ("image/png", "image/jpeg"):
            raise ValueError(f"허용되지 않는 이미지 형식: {mime_type}")
        view = self.add_buffer_view(data)
        images = self._list("images")
        image: dict[str, Any] = {"bufferView": view, "mimeType": mime_type}
        if name:
            image["name"] = name
        images.append(image)
        samplers = self._list("samplers")
        if not samplers:
            samplers.append({"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497})
        textures = self._list("textures")
        textures.append({"source": len(images) - 1, "sampler": 0})
        return len(textures) - 1

    def add_material(
        self,
        name: str,
        *,
        base_color_texture: int | None = None,
        base_color_factor: tuple[float, float, float, float] = (1.0, 1.0, 1.0, 1.0),
        alpha_mode: str = "OPAQUE",
        alpha_cutoff: float | None = None,
        double_sided: bool = False,
        metallic: float = 0.0,
        roughness: float = 0.8,
        extras: dict[str, Any] | None = None,
    ) -> int:
        pbr: dict[str, Any] = {"baseColorFactor": [float(v) for v in base_color_factor], "metallicFactor": float(metallic), "roughnessFactor": float(roughness)}
        if base_color_texture is not None:
            pbr["baseColorTexture"] = {"index": base_color_texture}
        material: dict[str, Any] = {"name": name, "pbrMetallicRoughness": pbr}
        if alpha_mode != "OPAQUE":
            material["alphaMode"] = alpha_mode
        if alpha_mode == "MASK" and alpha_cutoff is not None:
            material["alphaCutoff"] = float(alpha_cutoff)
        if double_sided:
            material["doubleSided"] = True
        if extras:
            material["extras"] = extras
        materials = self._list("materials")
        materials.append(material)
        return len(materials) - 1

    # ---- 스켈레톤·메시 ---------------------------------------------------------------
    def add_skeleton(
        self,
        joint_names: list[str],
        parents: dict[str, str | None],
        world_positions: np.ndarray,
        root_name: str = "Armature",
    ) -> None:
        """joint 노드(회전 항등, 이동 = 부모 기준 로컬)와 inverseBindMatrices를 쓴다.

        `world_positions` (J,3)은 T-포즈 레스트의 월드 위치이며 `joint_names` 순서이다.
        """
        if self._joint_nodes:
            raise RuntimeError("스켈레톤은 한 번만 추가할 수 있습니다.")
        index_of = {name: i for i, name in enumerate(joint_names)}
        nodes = self._list("nodes")
        root_index = len(nodes)
        nodes.append({"name": root_name})
        first_joint = len(nodes)
        children: dict[int, list[int]] = {root_index: []}
        for i, name in enumerate(joint_names):
            parent = parents[name]
            local = world_positions[i] - (world_positions[index_of[parent]] if parent is not None else np.zeros(3))
            node: dict[str, Any] = {"name": name}
            if np.any(local != 0.0):
                node["translation"] = [float(v) for v in local]
            nodes.append(node)
        self._joint_nodes = [first_joint + i for i in range(len(joint_names))]
        for i, name in enumerate(joint_names):
            parent = parents[name]
            parent_node = root_index if parent is None else first_joint + index_of[parent]
            children.setdefault(parent_node, []).append(first_joint + i)
        for parent_node, kids in children.items():
            if kids:
                nodes[parent_node]["children"] = kids
        # inverseBindMatrices: 회전 항등이므로 -world 이동. glTF는 열 우선이다.
        ibm = np.tile(np.eye(4, dtype=np.float32), (len(joint_names), 1, 1))
        ibm[:, 3, :3] = -world_positions.astype(np.float32)  # 열 우선 저장에서 마지막 열 = 이동
        accessor = self.add_accessor(ibm.reshape(len(joint_names), 16), name="inverseBindMatrices")
        skins = self._list("skins")
        skins.append({"inverseBindMatrices": accessor, "joints": list(self._joint_nodes), "skeleton": root_index, "name": root_name})
        self._skin = len(skins) - 1
        self._scene_nodes.append(root_index)

    def add_mesh_node(self, name: str, primitives: list[Primitive], skinned: bool = True) -> int:
        """항등 변환의 메시 노드를 장면 루트에 추가한다. morph 타깃 이름은 모든 프리미티브가 같아야 한다."""
        if not primitives:
            raise ValueError("프리미티브가 없습니다.")
        target_names = [t.name for t in primitives[0].targets]
        mesh_prims: list[dict[str, Any]] = []
        for prim in primitives:
            if [t.name for t in prim.targets] != target_names:
                raise ValueError(f"{name}: 프리미티브 사이 morph 타깃 이름/순서가 다릅니다.")
            count = int(prim.positions.shape[0])
            attributes: dict[str, int] = {}
            attributes["POSITION"] = self.add_accessor(np.ascontiguousarray(prim.positions, dtype=np.float32), target=_ARRAY_BUFFER, with_bounds=True)
            if prim.normals is not None:
                attributes["NORMAL"] = self.add_accessor(np.ascontiguousarray(prim.normals, dtype=np.float32), target=_ARRAY_BUFFER)
            if prim.uvs is not None:
                attributes["TEXCOORD_0"] = self.add_accessor(np.ascontiguousarray(prim.uvs, dtype=np.float32), target=_ARRAY_BUFFER)
            if prim.color0 is not None:
                attributes["COLOR_0"] = self.add_accessor(np.ascontiguousarray(prim.color0, dtype=np.float32), target=_ARRAY_BUFFER)
            if skinned:
                if prim.joints is None or prim.weights is None:
                    raise ValueError(f"{name}: 스킨 메시는 JOINTS_0/WEIGHTS_0이 필요합니다.")
                joints = np.ascontiguousarray(prim.joints)
                if joints.dtype not in (np.uint8, np.uint16):
                    joints = joints.astype(np.uint8 if int(joints.max(initial=0)) < 256 else np.uint16)
                attributes["JOINTS_0"] = self.add_accessor(joints, target=_ARRAY_BUFFER)
                attributes["WEIGHTS_0"] = self.add_accessor(np.ascontiguousarray(prim.weights, dtype=np.float32), target=_ARRAY_BUFFER)
            if prim.region is not None:
                region = np.ascontiguousarray(prim.region, dtype=np.uint8)
                attributes["_REGION"] = self.add_accessor(region, target=_ARRAY_BUFFER, byte_stride=4)
            flat_indices = np.asarray(prim.indices).reshape(-1)
            index_dtype = np.uint16 if count <= 0xFFFF else np.uint32
            index_accessor = self.add_accessor(flat_indices.astype(index_dtype), target=_ELEMENT_ARRAY_BUFFER)
            mesh_prim: dict[str, Any] = {"attributes": attributes, "indices": index_accessor, "mode": _TRIANGLES}
            if prim.material is not None:
                mesh_prim["material"] = prim.material
            if prim.targets:
                morph_list = []
                for target in prim.targets:
                    entry = {"POSITION": self.add_morph_accessor(target.position)}
                    if target.normal is not None:
                        entry["NORMAL"] = self.add_morph_accessor(target.normal)
                    morph_list.append(entry)
                mesh_prim["targets"] = morph_list
            mesh_prims.append(mesh_prim)
        mesh: dict[str, Any] = {"name": name, "primitives": mesh_prims}
        if target_names:
            mesh["extras"] = {"targetNames": target_names}
        meshes = self._list("meshes")
        meshes.append(mesh)
        nodes = self._list("nodes")
        node: dict[str, Any] = {"name": name, "mesh": len(meshes) - 1}
        if skinned:
            if self._skin is None:
                raise RuntimeError("add_skeleton()을 먼저 호출해야 합니다.")
            node["skin"] = self._skin
        nodes.append(node)
        self._scene_nodes.append(len(nodes) - 1)
        return len(nodes) - 1

    # ---- 출력 -----------------------------------------------------------------------
    def to_bytes(self) -> bytes:
        document = dict(self._json)
        document["scene"] = 0
        document["scenes"] = [{"name": "Scene", "nodes": list(self._scene_nodes)}]
        document["buffers"] = [{"byteLength": len(self._bin)}]
        text = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        json_chunk = _pad4(text, b" ")
        bin_chunk = _pad4(bytes(self._bin))
        total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
        out = bytearray()
        out += struct.pack("<4sII", b"glTF", 2, total)
        out += struct.pack("<I4s", len(json_chunk), b"JSON") + json_chunk
        out += struct.pack("<I4s", len(bin_chunk), b"BIN\x00") + bin_chunk
        return bytes(out)

    def write(self, path: str) -> int:
        data = self.to_bytes()
        with open(path, "wb") as handle:
            handle.write(data)
        return len(data)
