"""HBM 몸 메시의 해부학 분할(face set)에서 키트 68 joint 위치를 계산한다 (A-포즈 원본, glTF 좌표).

규칙은 분할 사이의 경계 루프 중심(팔꿈치·손목·무릎·발목 등)과 인체 비례 오프셋으로 정한다. 키트는 joint 노드가 이동만 갖는
(회전 항등) 구조라 위치만 정하면 된다. 좌우는 +x = 캐릭터 왼쪽이며 한쪽을 계산해 거울(x 부호)로 복제하지 않고 양쪽 경계에서
각각 구한다(메시가 좌우 대칭이라 값이 거의 같다).
"""

from __future__ import annotations

import numpy as np

from . import hbm

LEFT, RIGHT = 1, -1
SIDE_NAME = {LEFT: "Left", RIGHT: "Right"}
FINGER_NAMES = ("Thumb", "Index", "Middle", "Ring", "Pinky")
MIXAMO = "mixamorig:"

# 손가락 분할(번호 4개씩 한 손가락) 순서: +x 손은 소지→엄지(64..83), -x 손은 엄지→소지(84..103)
LEFT_FINGER_SETS = {"Pinky": (64, 65, 66, 67), "Ring": (68, 69, 70, 71), "Middle": (72, 73, 74, 75), "Index": (76, 77, 78, 79), "Thumb": (80, 81, 82, 83)}
RIGHT_FINGER_SETS = {"Thumb": (84, 85, 86, 87), "Index": (88, 89, 90, 91), "Middle": (92, 93, 94, 95), "Ring": (96, 97, 98, 99), "Pinky": (100, 101, 102, 103)}
# 마디 위치(손가락 길이를 1로 했을 때 MCP=0 에서의 비율): PIP, DIP
_PHALANX_FRACTIONS = (0.0, 0.43, 0.72, 1.0)


class BodyIndex:
    """분할 번호/좌우로 면·정점을 고르는 도우미."""

    def __init__(self, body: hbm.Body) -> None:
        self.body = body
        self.positions = body.positions
        self.faces = body.faces
        self.face_set = body.face_set
        self.side = np.where(body.face_center[:, 0] >= 0, LEFT, RIGHT)  # type: ignore[index]

    def mask(self, sets, side: int | None = None) -> np.ndarray:
        selected = np.isin(self.face_set, list(sets))
        if side is not None:
            selected &= self.side == side
        return selected

    def vertices(self, face_mask: np.ndarray) -> np.ndarray:
        return np.unique(self.faces[face_mask].ravel())

    def boundary(self, mask_a: np.ndarray, mask_b: np.ndarray) -> np.ndarray:
        """두 면 그룹이 공유하는 정점(경계 루프)."""
        return np.intersect1d(self.vertices(mask_a), self.vertices(mask_b))

    def center(self, vertices: np.ndarray) -> np.ndarray:
        if len(vertices) == 0:
            raise ValueError("경계 정점이 비어 있어 중심을 구할 수 없습니다.")
        return self.positions[vertices].mean(axis=0)


def _finger_chain(index: BodyIndex, sets: tuple[int, ...], palm_mask: np.ndarray, side: int, thumb: bool) -> list[np.ndarray]:
    """손가락 하나의 마디 머리 4개(MCP, PIP, DIP, 끝)를 돌려준다."""
    finger_mask = index.mask(sets)
    vertices = index.vertices(finger_mask)
    pts = index.positions[vertices]
    root_vertices = index.boundary(finger_mask, palm_mask)
    if len(root_vertices) == 0:
        # 손바닥과 직접 닿지 않으면(엄지 등) 손가락 정점 중 가장 높은 쪽 일부를 뿌리로 쓴다.
        order = np.argsort(-pts[:, 1])
        root = pts[order[: max(4, len(order) // 20)]].mean(axis=0)
    else:
        root = index.positions[root_vertices].mean(axis=0)
    # 끝: 뿌리에서 가장 먼 정점 몇 개의 평균
    distance = np.linalg.norm(pts - root, axis=1)
    far = np.argsort(-distance)[: max(4, len(distance) // 40)]
    tip = pts[far].mean(axis=0)
    chain = [root + (tip - root) * fraction for fraction in _PHALANX_FRACTIONS]
    return chain


def compute_a_pose_joints(body: hbm.Body) -> dict[str, np.ndarray]:
    """A-포즈 메시에 맞춘 68 joint 월드 위치(glTF 좌표)."""
    ix = BodyIndex(body)
    P = body.positions
    joints: dict[str, np.ndarray] = {}
    j = lambda name, value: joints.__setitem__(name, np.asarray(value, dtype=np.float64))  # noqa: E731

    head_mask = hbm.head_face_mask(body)
    neck_cut = ix.boundary(head_mask, ~head_mask)
    neck_center = ix.center(neck_cut)

    # --- 척추·목·머리(x=0). 몸통 단면 중심선과 목 절단 중심으로 정한다.
    j(MIXAMO + "Hips", (0.0, 0.892, 0.004))
    j(MIXAMO + "Spine", (0.0, 0.990, 0.022))
    j(MIXAMO + "Spine1", (0.0, 1.115, 0.030))
    j(MIXAMO + "Spine2", (0.0, 1.235, 0.018))
    j(MIXAMO + "Neck", (0.0, 1.365, -0.002))
    j(MIXAMO + "Head", (0.0, 1.455, 0.012))
    j(MIXAMO + "HeadTop_End", (0.0, float(P[:, 1].max()), 0.020))
    j("TS_Jaw", (0.0, 1.492, 0.040))
    for side, suffix in ((LEFT, "L"), (RIGHT, "R")):
        eye = body.eyes[suffix][0].mean(axis=0)
        j(f"TS_Eye.{suffix}", eye)

    for side in (LEFT, RIGHT):
        name = SIDE_NAME[side]
        sign = float(side)
        upper = ix.mask(hbm.UPPER_ARM_SETS, side)
        fore = ix.mask(hbm.FOREARM_SETS, side)
        palm = ix.mask(hbm.HAND_PALM_SETS, side)
        elbow = ix.center(ix.boundary(upper, fore))
        wrist = ix.center(ix.boundary(fore, palm))
        # 어깨(상완 관절): 상완 축 위쪽으로 인체 비례 위치. 팔구멍 중심에서 안쪽 위로 이동한 점이 상완골 머리다.
        armhole = ix.center(ix.boundary(upper, ix.mask({hbm.CHEST_SET})))
        axis = armhole - elbow
        axis /= np.linalg.norm(axis)
        gh = armhole + axis * 0.045 + np.array([sign * 0.018, 0.0, 0.0])
        j(MIXAMO + f"{name}Shoulder", (sign * 0.024, gh[1] + 0.018, 0.016))
        j(MIXAMO + f"{name}Arm", gh)
        j(MIXAMO + f"{name}ForeArm", elbow)
        j(MIXAMO + f"{name}Hand", wrist)

        finger_sets = LEFT_FINGER_SETS if side == LEFT else RIGHT_FINGER_SETS
        for finger in FINGER_NAMES:
            chain = _finger_chain(ix, finger_sets[finger], palm, side, finger == "Thumb")
            for k, position in enumerate(chain, start=1):
                j(MIXAMO + f"{name}Hand{finger}{k}", position)

        # 다리
        thigh = ix.mask(hbm.THIGH_SETS, side)
        calf = ix.mask(hbm.CALF_SETS, side)
        foot = ix.mask(hbm.FOOT_SETS, side)
        forefoot = ix.mask(hbm.FOREFOOT_SETS, side)
        toes = ix.mask(hbm.TOE_SETS, side)
        knee = ix.center(ix.boundary(thigh, calf))
        ankle_loop = ix.center(ix.boundary(calf, foot))
        thigh_top = ix.center(ix.boundary(thigh, ix.mask({hbm.PELVIS_SET})))
        # 대퇴골두: 허벅지 윗면 중심에서 위·안쪽으로
        hip = np.array([sign * 0.088, thigh_top[1] + 0.046, thigh_top[2] - 0.001])
        ankle = np.array([ankle_loop[0], 0.080, ankle_loop[2] + 0.003])
        ball = ix.center(ix.boundary(forefoot, toes))
        toe_vertices = ix.vertices(toes)
        toe_tip_z = float(P[toe_vertices, 2].max())
        j(MIXAMO + f"{name}UpLeg", hip)
        j(MIXAMO + f"{name}Leg", knee)
        j(MIXAMO + f"{name}Foot", ankle)
        j(MIXAMO + f"{name}ToeBase", (ball[0], ball[1], ball[2]))
        j(MIXAMO + f"{name}Toe_End", (ball[0] + sign * 0.002, ball[1] - 0.004, toe_tip_z))
    _ = neck_center
    return joints


def check_complete(joints: dict[str, np.ndarray], expected: list[str]) -> None:
    missing = [name for name in expected if name not in joints]
    extra = [name for name in joints if name not in expected]
    if missing or extra:
        raise ValueError(f"joint 이름 집합이 계약과 다릅니다. 없음={missing[:6]} 여분={extra[:6]}")
