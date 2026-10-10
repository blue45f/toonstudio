"""스켈레톤 정의와 A-포즈 → T-포즈 변환 행렬.

HBM 몸은 팔을 내린 A-포즈다. 키트 레스트는 T-포즈(팔 수평, 손바닥 아래, 엄지 앞)이므로 팔 사슬만 돌린다.
joint 노드는 회전이 항등이라 레스트에서는 월드 위치만 의미가 있고, 각 본의 "A→T 회전"은 메시를 옮기는 데만 쓴다.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MIXAMO = "mixamorig:"
FINGERS = ("Thumb", "Index", "Middle", "Ring", "Pinky")


def rotation_between(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """단위 벡터 a를 b로 옮기는 최소 회전 (3,3)."""
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if c < -1.0 + 1e-9:
        # 반대 방향: a에 수직인 임의 축으로 180도
        axis = np.cross(a, np.array([1.0, 0.0, 0.0]))
        if np.linalg.norm(axis) < 1e-6:
            axis = np.cross(a, np.array([0.0, 1.0, 0.0]))
        axis /= np.linalg.norm(axis)
        return 2.0 * np.outer(axis, axis) - np.eye(3)
    k = np.array([[0.0, -v[2], v[1]], [v[2], 0.0, -v[0]], [-v[1], v[0], 0.0]])
    return np.eye(3) + k + k @ k / (1.0 + c)


def _frame(axis: np.ndarray, across: np.ndarray) -> np.ndarray:
    """열이 (axis, across', axis×across')인 직교 기저."""
    axis = axis / np.linalg.norm(axis)
    across = across - np.dot(across, axis) * axis
    across = across / np.linalg.norm(across)
    return np.stack([axis, across, np.cross(axis, across)], axis=1)


@dataclass
class Rig:
    names: list[str]
    parents: dict[str, str | None]
    a_pose: np.ndarray  # (J,3) A-포즈 월드 위치
    t_pose: np.ndarray  # (J,3) T-포즈 월드 위치
    rotation: np.ndarray  # (J,3,3) 본마다 A→T 회전(A-포즈 피벗 기준)

    def index(self, name: str) -> int:
        return self.names.index(name)

    @property
    def translation(self) -> np.ndarray:
        """x' = R x + t 형태의 평행이동 (J,3)."""
        return self.t_pose - np.einsum("jik,jk->ji", self.rotation, self.a_pose)


def _rot_z(angle_deg: float) -> np.ndarray:
    a = np.radians(angle_deg)
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def build_rig(joints_a: dict[str, np.ndarray], names: list[str], parents: dict[str, str | None], clavicle_deg: float = 12.0) -> Rig:
    a = np.stack([joints_a[name] for name in names]).astype(np.float64)
    index = {name: i for i, name in enumerate(names)}
    t = a.copy()
    rotation = np.tile(np.eye(3), (len(names), 1, 1))

    for side, label in ((1.0, "Left"), (-1.0, "Right")):
        x_axis = np.array([side, 0.0, 0.0])
        arm, fore, hand = (index[f"{MIXAMO}{label}{n}"] for n in ("Arm", "ForeArm", "Hand"))
        # 어깨뼈(Shoulder)를 조금 들어 올려 승모근 선과 팔 윗면을 잇는다(실제 팔 벌림에서도 쇄골이 같이 올라간다).
        clavicle = index[f"{MIXAMO}{label}Shoulder"]
        r_clav = _rot_z(side * clavicle_deg)
        rotation[clavicle] = r_clav
        t[arm] = a[clavicle] + r_clav @ (a[arm] - a[clavicle])
        r_up = rotation_between(a[fore] - a[arm], x_axis)
        t[fore] = t[arm] + r_up @ (a[fore] - a[arm])
        r_fore = rotation_between(a[hand] - a[fore], x_axis)
        t[hand] = t[fore] + r_fore @ (a[hand] - a[fore])
        rotation[arm] = r_up
        rotation[fore] = r_fore
        # 손: 손목→중지 뿌리 방향을 ±x로, 엄지 쪽(검지-소지 방향)을 +z로 보내 손바닥이 아래를 보게 한다.
        middle1 = a[index[f"{MIXAMO}{label}HandMiddle1"]]
        index1 = a[index[f"{MIXAMO}{label}HandIndex1"]]
        pinky1 = a[index[f"{MIXAMO}{label}HandPinky1"]]
        frame_a = _frame(middle1 - a[hand], index1 - pinky1)
        frame_t = _frame(x_axis, np.array([0.0, 0.0, 1.0]))
        r_hand = frame_t @ frame_a.T
        rotation[hand] = r_hand
        for finger in FINGERS:
            for k in range(1, 5):
                j = index[f"{MIXAMO}{label}Hand{finger}{k}"]
                rotation[j] = r_hand
                t[j] = t[hand] + r_hand @ (a[j] - a[hand])
    return Rig(names=list(names), parents=dict(parents), a_pose=a, t_pose=t, rotation=rotation)
