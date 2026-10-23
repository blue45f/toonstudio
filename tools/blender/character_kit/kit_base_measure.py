"""키트 v2 베이스 메타 측정 — 베이스 GLB에서 머리 높이(`headHeightM`)와 소품 앵커 14곳(`anchors`)을 잰다(numpy, bpy 불필요, 2026-10-23 WP B-1).

계약 `kitV2BaseSchema`: `headHeightM`(m, 정수리~턱, 두신 = heightM ÷ headHeightM)과 `anchors{앵커 → {joint, offsetM}}`(joint 로컬 오프셋).
값은 `build_kit_json.py --schema 2 --base-meta-v2 <json>`으로 덮어쓸 수 있다(측정 정의가 맞지 않는 베이스, 예: SD).

측정 정의(메시 정점만 쓴다, T-포즈 레스트, glTF 좌표 Y 위·+Z 앞·캐릭터 왼쪽 +X):

- 정수리 = `TS_Head` 정점의 최대 y.
- 턱끝 = 정중선(|x| ≤ 6 mm) `TS_Head` 정점 가운데 입 높이(`TS_Mouth` 평균 y ± 5 mm)의 가장 앞 z에서 15 mm 안쪽까지 앞으로 나온 정점의 최저 y.
  턱 아랫면에서 앞 깊이가 4 cm 넘게 떨어지므로(2026-10-23 실측: 여 1.443 m, 남 1.441 m) 목을 턱으로 잘못 잡지 않는다.
- 앵커 점(월드) → `ACCESSORY_ANCHOR_BONES`의 본에 해당하는 키트 joint 로컬 좌표로 바꾼다(`offsetM = R_jointᵀ (p − t_joint)`):
  head-top 정수리 정점 · hair 두개골 중심에서 뒤·위(0, 0.6, −0.8) 방향의 머리 지지점 · face 두 눈 joint 가운데 높이·폭의 얼굴 앞면 ·
  ear-l/r 눈 높이 −1 cm 띠의 좌우 끝 · neck 목 joint 높이의 목 앞면 · wrist-l/r 손 joint(아래팔에 붙임) · waist 척추(Spine) joint(골반에 붙임) ·
  back 윗가슴(Spine2) 높이의 등 표면 · hand-l/r 손 joint와 가운뎃손가락 첫 마디 joint의 가운데 · foot-l/r 발 joint(발목).
"""

from __future__ import annotations

import json
import struct
from typing import Any

import numpy as np

_COMPONENT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_NORMALIZE = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}
_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


class GlbArrays:
    """GLB의 JSON·BIN을 읽어 노드 이름별 정점 위치와 노드 월드 행렬을 돌려준다(sparse 정점 위치는 다루지 않는다)."""

    def __init__(self, data: bytes) -> None:
        offset = 12
        self.doc: dict[str, Any] = {}
        self.binary = b""
        while offset + 8 <= len(data):
            length, kind = struct.unpack_from("<I4s", data, offset)
            body = data[offset + 8 : offset + 8 + length]
            if kind == b"JSON":
                self.doc = json.loads(body.decode("utf-8"))
            elif kind == b"BIN\x00":
                self.binary = body
            offset += 8 + length
        self._world: dict[int, np.ndarray] = {}
        parents: dict[int, int] = {}
        for index, node in enumerate(self.doc.get("nodes", [])):
            for child in node.get("children", []):
                parents[child] = index
        self._parents = parents

    def accessor(self, index: int) -> np.ndarray:
        acc = self.doc["accessors"][index]
        width = _WIDTH[acc["type"]]
        dtype = np.dtype(_COMPONENT[acc["componentType"]])
        view = self.doc["bufferViews"][acc["bufferView"]]
        stride = view.get("byteStride", width * dtype.itemsize)
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        raw = np.frombuffer(self.binary, dtype=np.uint8, count=stride * (acc["count"] - 1) + width * dtype.itemsize, offset=start)
        rows = np.lib.stride_tricks.as_strided(raw, shape=(acc["count"], width * dtype.itemsize), strides=(stride, 1)).copy()
        values = rows.view(dtype).reshape(acc["count"], width).astype(np.float64)
        if acc.get("normalized") and acc["componentType"] in _NORMALIZE:
            values = np.maximum(values / _NORMALIZE[acc["componentType"]], -1.0)
        return values

    def positions(self, node_name: str) -> np.ndarray:
        node = next((n for n in self.doc.get("nodes", []) if n.get("name") == node_name and "mesh" in n), None)
        if node is None:
            raise KeyError(f"메시 노드 {node_name}가 GLB에 없습니다.")
        prims = self.doc["meshes"][node["mesh"]]["primitives"]
        return np.concatenate([self.accessor(prim["attributes"]["POSITION"]) for prim in prims])

    def _local(self, node: dict[str, Any]) -> np.ndarray:
        if "matrix" in node:
            return np.array(node["matrix"], dtype=np.float64).reshape(4, 4).T
        x, y, z, w = node.get("rotation", [0.0, 0.0, 0.0, 1.0])
        rotation = np.array(
            [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
        )
        matrix = np.eye(4)
        matrix[:3, :3] = rotation * np.array(node.get("scale", [1.0, 1.0, 1.0]))
        matrix[:3, 3] = node.get("translation", [0.0, 0.0, 0.0])
        return matrix

    def world(self, node_name: str) -> np.ndarray:
        index = next((i for i, n in enumerate(self.doc.get("nodes", [])) if n.get("name") == node_name), None)
        if index is None:
            raise KeyError(f"노드 {node_name}가 GLB에 없습니다.")
        if index not in self._world:
            parent = self._parents.get(index)
            local = self._local(self.doc["nodes"][index])
            self._world[index] = local if parent is None else self.world(self.doc["nodes"][parent]["name"]) @ local
        return self._world[index]


def measure_head_height(glb: GlbArrays) -> dict[str, float]:
    """정수리·턱끝 y와 머리 높이(m)."""
    head = glb.positions("TS_Head")
    mouth = glb.positions("TS_Mouth")
    crown = float(head[:, 1].max())
    midline = head[np.abs(head[:, 0]) <= 0.006]
    mouth_y = float(mouth[:, 1].mean())
    lips = midline[np.abs(midline[:, 1] - mouth_y) <= 0.005]
    if len(lips) == 0:
        raise ValueError("입 높이의 정중선 머리 정점을 찾지 못해 턱끝을 잴 수 없습니다.")
    front = midline[midline[:, 2] >= float(lips[:, 2].max()) - 0.015]
    chin = float(front[:, 1].min())
    return {"crownY": round(crown, 4), "chinY": round(chin, 4), "headHeightM": round(crown - chin, 4)}


def _support(points: np.ndarray, origin: np.ndarray, direction: np.ndarray) -> np.ndarray:
    """origin에서 direction 방향으로 가장 멀리 있는 점(지지점)."""
    direction = direction / np.linalg.norm(direction)
    return points[int(np.argmax((points - origin) @ direction))]


def compute_anchors(glb: GlbArrays, anchor_bones: dict[str, str], bone_map: dict[str, str]) -> dict[str, dict[str, Any]]:
    """앵커 14곳 → {joint, offsetM}. `anchor_bones` = 계약 ACCESSORY_ANCHOR_BONES(앵커 → 휴머노이드 본), `bone_map` = 키트 joint → 휴머노이드 본."""
    joint_of_bone = {bone: joint for joint, bone in bone_map.items()}
    head = glb.positions("TS_Head")
    body = glb.positions("TS_Body")
    skin = np.concatenate([head, body])
    position = lambda joint: glb.world(joint)[:3, 3]  # noqa: E731
    height = measure_head_height(glb)
    eye_mid = (position("TS_Eye.L") + position("TS_Eye.R")) / 2
    skull = np.array([0.0, (height["crownY"] + height["chinY"]) / 2, float(head[head[:, 1] > eye_mid[1], 2].mean())])

    def band(points: np.ndarray, center: np.ndarray, axes: tuple[int, ...], half: float) -> np.ndarray:
        mask = np.ones(len(points), dtype=bool)
        for axis in axes:
            mask &= np.abs(points[:, axis] - center[axis]) <= half
        return points[mask]

    ear_band = band(head, eye_mid - np.array([0, 0.01, 0]), (1,), 0.015)
    neck = position(joint_of_bone["neck"])
    chest = position(joint_of_bone["upperChest"])
    points = {
        "head-top": head[int(np.argmax(head[:, 1]))],
        "hair": _support(head, skull, np.array([0.0, 0.6, -0.8])),
        "face": _support(band(head, eye_mid, (0, 1), 0.01), eye_mid, np.array([0.0, 0.0, 1.0])),
        "ear-l": _support(ear_band, skull, np.array([1.0, 0.0, 0.0])),
        "ear-r": _support(ear_band, skull, np.array([-1.0, 0.0, 0.0])),
        "neck": _support(band(skin, neck, (0, 1), 0.01), neck, np.array([0.0, 0.0, 1.0])),
        "wrist-l": position(joint_of_bone["leftHand"]),
        "wrist-r": position(joint_of_bone["rightHand"]),
        "waist": position(joint_of_bone["spine"]),
        "back": _support(band(body, chest, (0, 1), 0.01), chest, np.array([0.0, 0.0, -1.0])),
        "hand-l": (position(joint_of_bone["leftHand"]) + position(joint_of_bone["leftMiddleProximal"])) / 2,
        "hand-r": (position(joint_of_bone["rightHand"]) + position(joint_of_bone["rightMiddleProximal"])) / 2,
        "foot-l": position(joint_of_bone["leftFoot"]),
        "foot-r": position(joint_of_bone["rightFoot"]),
    }
    anchors: dict[str, dict[str, Any]] = {}
    for anchor, bone in anchor_bones.items():
        joint = joint_of_bone[bone]
        world = glb.world(joint)
        rotation = world[:3, :3] / np.linalg.norm(world[:3, :3], axis=0)
        offset = rotation.T @ (np.asarray(points[anchor], dtype=np.float64) - world[:3, 3])
        anchors[anchor] = {"joint": joint, "offsetM": [round(float(value), 4) for value in offset]}
    return anchors
