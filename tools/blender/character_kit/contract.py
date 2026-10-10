"""`scripts/blender/dump-kit-contract.mjs`가 덤프한 계약 상수(JSON)를 읽는 얇은 래퍼.

상수를 파이썬에 복제하지 않는다. 계약이 바뀌면 덤프를 다시 만들고 이 모듈은 그대로 쓴다.
덤프: pnpm exec tsx scripts/blender/dump-kit-contract.mjs --out <contract.json>
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Contract:
    raw: dict[str, Any]

    @property
    def joints(self) -> list[str]:
        return list(self.raw["skeleton"]["joints"])

    @property
    def parents(self) -> dict[str, str | None]:
        return dict(self.raw["skeleton"]["parents"])

    @property
    def bone_map(self) -> dict[str, str]:
        return dict(self.raw["skeleton"]["boneMap"])

    @property
    def end_bones(self) -> list[str]:
        return list(self.raw["skeleton"]["endBones"])

    @property
    def morph_names(self) -> list[str]:
        return list(self.raw["morph"]["names"])

    @property
    def body_keys(self) -> list[str]:
        return list(self.raw["morph"]["bodyKeys"])

    @property
    def face_keys(self) -> list[str]:
        return list(self.raw["morph"]["faceKeys"])

    @property
    def facs_units(self) -> list[str]:
        return list(self.raw["morph"]["facsUnits"])

    def coverage(self, role: str) -> list[str]:
        """역할이 반드시 가져야 하는 morph 이름 목록(계약의 `KIT_MORPH_COVERAGE`)."""
        return list(self.raw["morph"]["coverageByRole"][role])

    @property
    def required_joint_offset_morphs(self) -> list[str]:
        return list(self.raw["morph"]["requiredJointOffsetMorphs"])

    @property
    def region_ids(self) -> list[str]:
        return list(self.raw["regions"]["all"])

    @property
    def hideable_region_ids(self) -> list[str]:
        return list(self.raw["regions"]["hideable"])

    @property
    def budget(self) -> dict[str, Any]:
        return dict(self.raw["budget"])

    @property
    def required_presets(self) -> list[str]:
        return list(self.raw["requiredPresets"])


def load(path: str | Path) -> Contract:
    with open(path, encoding="utf-8") as handle:
        return Contract(json.load(handle))
