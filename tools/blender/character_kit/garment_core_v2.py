"""ToonStudio Character Kit v2 — 고품질 다채널 의상 제작 코어 엔진 (Blender 5.3 헤드리스).

단순 바디 정점 오프셋 방식을 전면 폐기하고, 실제 v2 베이스 GLB(`bases/<archetype>.glb`)의
영역별 BVH와 해부학 랜드마크 위에 **폐곡면 솔리드·베벨 재단 토폴로지**를 직접 구축한다.

핵심 불변 규격:
- 0-결함 `bmesh`: `true_nonmanifold == 0`, `boundary_edges == 0` (폐곡면 솔리드),
  `loose_verts == 0`, `wire_edges == 0`, `zero_area == 0`, `scale == (1,1,1)`.
- UV0 (`TEXCOORD_0`): `[0.004, 0.996]` 비중첩 전개 (아일랜드 마진 >= 0.015).
- UV1 (`TEXCOORD_1`): 실제 cm 균일 패턴 스케일 (`50 cm / UV1 unit` = `2.0 UV/m`, 주름·자락 연속 전개).
- 재질: `toonstudio.character-kit/2` 다채널 규약 (`1~3` 채널: 본체·트림·액센트),
  고휘도 절차 원단 텍스처(재색상 호환, `>= 0.80` 휘도) + 장르 기본 `baseColorFactor`,
  이진 `metallic` (`0.0` 직물/가죽/실크 또는 `1.0` 금속 하드웨어).
- 스키닝·변형: 68본 스켈레톤 + 영역 인식 스킨 전사 + 강체 하드웨어(단추·버클·보석) 단일 앵커 스키닝 +
  18 체형 morph (`param:*:±`) + 파츠 형태 morph (`shape:*:±`), `KHR_mesh_quantization` 단독
  (Draco/meshopt/KTX2/WebP 전면 금지, raw SHORT 정수 min/max 바운드).
- 간격 & 관통 검증: `inner/top/bottom/legwear >= 1.5 mm`, `outer >= 4.0 mm` (바디 기준) +
  레이어 중첩 비관통 + 85° 어깨 거상 / 45° A-포즈 LBS 관통 자동 보정 및 검증.
"""

from __future__ import annotations

import hashlib
import math
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

_THIS_DIR = Path(__file__).resolve().parent
_BLENDER_TOOLS_DIR = _THIS_DIR.parent
if str(_BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_BLENDER_TOOLS_DIR))

from character_kit import build_base_v2 as bb2  # noqa: E402
from character_kit import build_expressions_v2 as expr  # noqa: E402
from character_kit import glbwriter, skin, uvtools  # noqa: E402
from character_kit import qa_character_gate as qa  # noqa: E402
from character_kit.surface import vertex_normals  # noqa: E402

UV1_CM_PER_UNIT = 50.0
UV1_METERS_PER_UNIT = UV1_CM_PER_UNIT / 100.0  # 0.50 m = 1.0 UV1 unit

FORBIDDEN_EXTENSIONS: frozenset[str] = frozenset(
    {
        "KHR_draco_mesh_compression",
        "EXT_meshopt_compression",
        "KHR_texture_basisu",
        "EXT_texture_webp",
    }
)


# ---------------------------------------------------------------------------
# 좌표 변환 & 색 유틸리티
# ---------------------------------------------------------------------------


def b2g(p: np.ndarray) -> np.ndarray:
    """Blender (x, y, z; +Z up, -Y fwd) → glTF (x, z, -y; +Y up, +Z fwd)."""
    return bb2.b2g(p)


def g2b(p: np.ndarray) -> np.ndarray:
    """glTF (x, y, z; +Y up, +Z fwd) → Blender (x, -z, y; +Z up, -Y fwd)."""
    arr = np.asarray(p, dtype=np.float64)
    if arr.ndim == 1:
        return np.array([arr[0], -arr[2], arr[1]], dtype=np.float64)
    return np.stack([arr[:, 0], -arr[:, 2], arr[:, 1]], axis=-1)


def srgb_hex_to_linear_rgba(hex_str: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    """sRGB `#rrggbb` → glTF `baseColorFactor`용 linear RGBA."""
    s = hex_str.lstrip("#")
    vals = [int(s[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in vals]
    return (float(lin[0]), float(lin[1]), float(lin[2]), float(alpha))


def smoothstep_f(e0: float, e1: float, x: float) -> float:
    if abs(e1 - e0) < 1e-12:
        return 1.0 if x >= e1 else 0.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


# ---------------------------------------------------------------------------
# 베이스 바디 로드 & 영역별 BVH 오라클
# ---------------------------------------------------------------------------


@dataclass
class BaseBodyContext:
    """v2 베이스 GLB에서 추출한 실측 메시·영역 BVH·68본 스켈레톤·체형 필드."""

    archetype_id: str
    glb_path: Path
    plan: bb2.ArchetypePlan
    reader: qa.GlbReader
    # glTF 좌표
    body_pos_g: np.ndarray
    body_nrm_g: np.ndarray
    body_tris: np.ndarray
    body_joints: np.ndarray  # (N, 4)
    body_weights: np.ndarray  # (N, 4)
    body_weights_dense: np.ndarray  # (N, 68)
    body_region: np.ndarray  # (N,) uint8
    head_pos_g: np.ndarray
    head_tris: np.ndarray
    joints_g: np.ndarray  # (68, 3)
    # Blender 좌표
    body_pos_b: np.ndarray
    body_nrm_b: np.ndarray
    head_pos_b: np.ndarray
    joints_b: np.ndarray  # (68, 3)
    # BVH
    body_bvh: BVHTree
    head_bvh: BVHTree
    torso_bvh: BVHTree
    arm_l_bvh: BVHTree
    arm_r_bvh: BVHTree
    leg_l_bvh: BVHTree
    leg_r_bvh: BVHTree
    foot_l_bvh: BVHTree
    foot_r_bvh: BVHTree
    # 영역별 정점 인덱스 (스키닝 전사용)
    zone_body_indices: dict[str, np.ndarray]
    # 체형 18 morph 필드
    body_fields: expr.ArchetypeBodyFields
    # 발 실측 바운드 (Blender 좌표)
    foot_bounds_l: tuple[np.ndarray, np.ndarray]
    foot_bounds_r: tuple[np.ndarray, np.ndarray]
    # 캐시된 포즈 바디 BVH (85° 어깨 거상 등)
    posed_body_cache: dict[str, tuple[np.ndarray, np.ndarray, BVHTree]] = field(default_factory=dict)

    def joint_b(self, name: str) -> np.ndarray:
        return self.joints_b[bb2.JOINT_INDEX[name]]

    def _torso_y_center(self, z: float) -> float:
        p = self.plan
        if z >= p.z_neck_base:
            return 0.006
        if z >= p.z_chest:
            return 0.010
        return 0.010

    def sample_torso_radius(self, z: float, theta: float) -> tuple[float, float, float]:
        """높이 z, 방위각 theta(0=앞 -Y, pi/2=좌 +X, pi=뒤 +Y)에서 몸통 표면 (x, y, r)."""
        yc = self._torso_y_center(z)
        dx = math.sin(theta)
        dy = -math.cos(theta)
        origin = Vector((dx * 0.45, yc + dy * 0.45, z))
        direction = Vector((-dx, -dy, 0.0))
        hit, _, _, _ = self.torso_bvh.ray_cast(origin, direction, 0.45)
        if hit is not None:
            r = math.hypot(hit.x, hit.y - yc)
            if r > 0.018:
                return float(hit.x), float(hit.y), float(r)
        # 폴백: 해석적 프로필
        fx, fy = bb2._eval_torso_profile(self.plan, z, theta)  # noqa: SLF001
        return float(fx), float(fy), float(math.hypot(fx, fy - yc))

    def sample_torso_ring(
        self,
        z: float,
        n_seg: int,
        ease: float | Callable[[float], float],
        *,
        theta_start: float = 0.0,
        theta_end: float = 2.0 * math.pi,
        closed: bool = True,
    ) -> np.ndarray:
        """몸통 단면 링 (n_seg, 3)을 샘플링하고 방위각별 여유 `ease`를 더한다."""
        yc = self._torso_y_center(z)
        thetas = (
            np.linspace(theta_start, theta_end, n_seg, endpoint=False)
            if closed
            else np.linspace(theta_start, theta_end, n_seg, endpoint=True)
        )
        pts = np.empty((n_seg, 3), dtype=np.float64)
        for j, th in enumerate(thetas):
            _, _, r = self.sample_torso_radius(z, float(th))
            e = float(ease(float(th))) if callable(ease) else float(ease)
            rr = r + e
            pts[j] = (rr * math.sin(th), yc - rr * math.cos(th), z)
        return pts

    def arm_axis_pt(self, side: int, x_abs: float) -> np.ndarray:
        """팔 중심축 점 (Blender 좌표). side=+1(Left), -1(Right)."""
        lab = "Left" if side > 0 else "Right"
        j_arm = self.joint_b(f"{bb2.MIXAMO}{lab}Arm")
        j_elb = self.joint_b(f"{bb2.MIXAMO}{lab}ForeArm")
        j_hnd = self.joint_b(f"{bb2.MIXAMO}{lab}Hand")
        xa, xe, xh = abs(float(j_arm[0])), abs(float(j_elb[0])), abs(float(j_hnd[0]))
        if x_abs <= xe:
            t = max(0.0, min(1.0, (x_abs - xa) / max(xe - xa, 1e-5)))
            p = j_arm * (1.0 - t) + j_elb * t
        else:
            t = max(0.0, min(1.0, (x_abs - xe) / max(xh - xe, 1e-5)))
            p = j_elb * (1.0 - t) + j_hnd * t
        return np.array([side * x_abs, float(p[1]), float(p[2])], dtype=np.float64)

    def sample_arm_ring(
        self,
        side: int,
        x_abs: float,
        n_seg: int,
        ease: float | Callable[[float], float],
        *,
        min_radius: float = 0.0,
    ) -> np.ndarray:
        """팔 단면 링 (n_seg, 3): phi=0 앞(-Y), pi/2 위(+Z), pi 뒤(+Y), -pi/2 아래(-Z)."""
        axis = self.arm_axis_pt(side, x_abs)
        bvh = self.arm_l_bvh if side > 0 else self.arm_r_bvh
        s = self.plan.spec
        lab = "Left" if side > 0 else "Right"
        xa = abs(float(self.joint_b(f"{bb2.MIXAMO}{lab}Arm")[0]))
        xh = abs(float(self.joint_b(f"{bb2.MIXAMO}{lab}Hand")[0]))
        t_arm = max(0.0, min(1.0, (x_abs - xa) / max(xh - xa, 1e-5)))
        fallback_r = s.arm_r * (1.0 - t_arm) + s.wrist_r * t_arm
        phis = np.linspace(0.0, 2.0 * math.pi, n_seg, endpoint=False)
        pts = np.empty((n_seg, 3), dtype=np.float64)
        for j, ph in enumerate(phis):
            dy = -math.cos(ph)
            dz = math.sin(ph)
            origin = Vector((axis[0], axis[1] + dy * 0.25, axis[2] + dz * 0.25))
            direction = Vector((0.0, -dy, -dz))
            hit, _, _, _ = bvh.ray_cast(origin, direction, 0.25)
            r = math.hypot(hit.y - axis[1], hit.z - axis[2]) if hit is not None else fallback_r
            # 어깨 접합부에서 몸통이 걸려 반지름이 비정상적으로 커지는 것을 제한
            r = min(max(r, fallback_r * 0.78), fallback_r * 1.48)
            e = float(ease(float(ph))) if callable(ease) else float(ease)
            rr = max(r + e, min_radius)
            pts[j] = (axis[0], axis[1] + dy * rr, axis[2] + dz * rr)
        return pts

    def leg_axis_pt(self, side: int, z: float) -> np.ndarray:
        """다리 중심축 점 (Blender 좌표). side=+1(Left), -1(Right)."""
        lab = "Left" if side > 0 else "Right"
        j_up = self.joint_b(f"{bb2.MIXAMO}{lab}UpLeg")
        j_kn = self.joint_b(f"{bb2.MIXAMO}{lab}Leg")
        j_ft = self.joint_b(f"{bb2.MIXAMO}{lab}Foot")
        zu, zk, zf = float(j_up[2]), float(j_kn[2]), float(j_ft[2])
        if z >= zk:
            t = max(0.0, min(1.0, (z - zk) / max(zu - zk, 1e-5)))
            p = j_kn * (1.0 - t) + j_up * t
        else:
            t = max(0.0, min(1.0, (z - zf) / max(zk - zf, 1e-5)))
            p = j_ft * (1.0 - t) + j_kn * t
        return np.array([float(p[0]), float(p[1]), z], dtype=np.float64)

    def sample_leg_ring(
        self,
        side: int,
        z: float,
        n_seg: int,
        ease: float | Callable[[float], float],
        *,
        min_radius: float = 0.0,
        clamp_midline: bool = True,
    ) -> np.ndarray:
        """다리 단면 링 (n_seg, 3). `clamp_midline=True`면 내측 가랑이 교차를 방지한다."""
        axis = self.leg_axis_pt(side, z)
        bvh = self.leg_l_bvh if side > 0 else self.leg_r_bvh
        s = self.plan.spec
        p = self.plan
        t_leg = max(0.0, min(1.0, (z - p.z_ankle) / max(p.z_crotch - p.z_ankle, 1e-5)))
        fallback_r = s.ankle_r * (1.0 - t_leg) + s.thigh_r * t_leg
        thetas = np.linspace(0.0, 2.0 * math.pi, n_seg, endpoint=False)
        pts = np.empty((n_seg, 3), dtype=np.float64)
        for j, th in enumerate(thetas):
            dx = math.sin(th)
            dy = -math.cos(th)
            origin = Vector((axis[0] + dx * 0.25, axis[1] + dy * 0.25, z))
            direction = Vector((-dx, -dy, 0.0))
            hit, _, _, _ = bvh.ray_cast(origin, direction, 0.25)
            r = math.hypot(hit.x - axis[0], hit.y - axis[1]) if hit is not None else fallback_r
            r = min(max(r, fallback_r * 0.72), fallback_r * 1.45)
            e = float(ease(float(th))) if callable(ease) else float(ease)
            rr = max(r + e, min_radius)
            px = axis[0] + dx * rr
            py = axis[1] + dy * rr
            if clamp_midline:
                # 좌/우 바지 가랑이 내측이 정중앙(X=0)을 과도하게 넘지 않되, 절대 다리 피부(r + 2.6mm) 안쪽으로는 밀지 않는다!
                body_x = axis[0] + dx * (r + 0.0028)
                if side > 0:
                    px = max(px, min(0.002, body_x)) if px < 0.002 else px
                    if px < body_x:
                        px = body_x
                else:
                    px = min(px, max(-0.002, body_x)) if px > -0.002 else px
                    if px > body_x:
                        px = body_x
            pts[j] = (px, py, z)
        return pts

    def posed_body(self, pose_name: str, pose_euler_deg: dict[str, tuple[float, float, float]]) -> tuple[np.ndarray, np.ndarray, BVHTree]:
        """포즈 적용된 `TS_Body` (glTF pos, glTF normals, glTF BVHTree)를 캐시해 돌려준다."""
        if pose_name not in self.posed_body_cache:
            smats, _ = qa.eval_skin_matrices(self.reader, pose_euler_deg)
            p_g = qa.apply_lbs(self.body_pos_g, self.body_joints, self.body_weights, smats)
            n_g = vertex_normals(p_g, self.body_tris)
            bvh = BVHTree.FromPolygons(p_g.tolist(), self.body_tris.tolist())
            self.posed_body_cache[pose_name] = (p_g, n_g, bvh)
        return self.posed_body_cache[pose_name]


def _make_sub_bvh(pos_b: np.ndarray, tris: np.ndarray, tri_mask: np.ndarray) -> BVHTree:
    sel = tris[tri_mask]
    if len(sel) == 0:
        sel = tris
    return BVHTree.FromPolygons(pos_b.tolist(), sel.tolist())


def load_base_context(archetype_id: str, bases_dir: Path) -> BaseBodyContext:
    """v2 베이스 GLB를 로드하고 영역별 BVH와 체형 필드를 준비한다."""
    glb_path = bases_dir / f"{archetype_id}.glb"
    if not glb_path.is_file():
        raise FileNotFoundError(f"v2 베이스 GLB가 없습니다: {glb_path}")
    reader = qa.GlbReader(glb_path)
    plan = bb2.compute_archetype_plan(bb2.ARCHETYPES[archetype_id])

    body = reader.mesh_prim("TS_Body")
    head = reader.mesh_prim("TS_Head")
    ni = reader.node_by_name["TS_Body"]
    prim = reader.doc["meshes"][reader.doc["nodes"][ni]["mesh"]]["primitives"][0]
    body_region = reader.read_accessor(prim["attributes"]["_REGION"], dequantize=False).astype(np.uint8)

    body_pos_g = body["positions"]
    body_nrm_g = body["normals"] if body["normals"] is not None else vertex_normals(body_pos_g, body["indices"])
    body_tris = body["indices"]
    body_joints = body["joints"]
    body_weights = body["weights"]

    # 밀집 (N, 68) 스킨 웨이트 테이블
    w_dense = np.zeros((len(body_pos_g), len(bb2.SKELETON_JOINTS)), dtype=np.float32)
    rows = np.arange(len(body_pos_g))
    for k in range(4):
        w_dense[rows, body_joints[:, k]] += body_weights[:, k].astype(np.float32)

    _, joints_g = qa.eval_skin_matrices(reader, {})
    body_pos_b = g2b(body_pos_g)
    body_nrm_b = g2b(body_nrm_g)
    head_pos_b = g2b(head["positions"])
    joints_b = g2b(joints_g)

    # 영역별 삼각형 필터링 → BVH 분리 (팔/몸통/다리 간 광선 간섭 원천 차단)
    tri_reg = body_region[body_tris]  # (T, 3)
    tri_cx = body_pos_b[body_tris, 0].mean(axis=1)
    sh_x = plan.spec.shoulder_half_w

    R = bb2.REGION_INDEX
    torso_regs = [R["neck"], R["torso"], R["pelvis"]]
    is_torso = np.isin(tri_reg, torso_regs).all(axis=1) | (
        np.isin(tri_reg, torso_regs).any(axis=1) & (np.abs(tri_cx) < sh_x * 0.96)
    )
    arm_l_regs = [R["upperArm.L"], R["forearm.L"], R["hand.L"]]
    arm_r_regs = [R["upperArm.R"], R["forearm.R"], R["hand.R"]]
    is_arm_l = np.isin(tri_reg, arm_l_regs).any(axis=1) | ((tri_reg == R["torso"]).any(axis=1) & (tri_cx > sh_x * 0.58))
    is_arm_r = np.isin(tri_reg, arm_r_regs).any(axis=1) | ((tri_reg == R["torso"]).any(axis=1) & (tri_cx < -sh_x * 0.58))

    leg_l_regs = [R["thigh.L"], R["calf.L"], R["foot.L"]]
    leg_r_regs = [R["thigh.R"], R["calf.R"], R["foot.R"]]
    is_leg_l = np.isin(tri_reg, leg_l_regs).any(axis=1) | ((tri_reg == R["pelvis"]).any(axis=1) & (tri_cx > -0.015))
    is_leg_r = np.isin(tri_reg, leg_r_regs).any(axis=1) | ((tri_reg == R["pelvis"]).any(axis=1) & (tri_cx < +0.015))
    is_foot_l = np.isin(tri_reg, [R["calf.L"], R["foot.L"]]).any(axis=1)
    is_foot_r = np.isin(tri_reg, [R["calf.R"], R["foot.R"]]).any(axis=1)

    body_bvh = BVHTree.FromPolygons(body_pos_b.tolist(), body_tris.tolist())
    head_bvh = BVHTree.FromPolygons(head_pos_b.tolist(), head["indices"].tolist())

    # 스키닝 전사용 영역별 정점 인덱스 풀
    px = body_pos_b[:, 0]
    pz = body_pos_b[:, 2]
    zone_indices = {
        "torso": np.flatnonzero(
            np.isin(body_region, torso_regs)
            | (np.isin(body_region, [R["upperArm.L"], R["upperArm.R"]]) & (np.abs(px) < sh_x * 1.12))
        ),
        "arm.L": np.flatnonzero(
            np.isin(body_region, arm_l_regs)
            | ((body_region == R["torso"]) & (px > sh_x * 0.48) & (pz > plan.z_waist))
        ),
        "arm.R": np.flatnonzero(
            np.isin(body_region, arm_r_regs)
            | ((body_region == R["torso"]) & (px < -sh_x * 0.48) & (pz > plan.z_waist))
        ),
        "leg.L": np.flatnonzero(np.isin(body_region, leg_l_regs) | ((body_region == R["pelvis"]) & (px > -0.015))),
        "leg.R": np.flatnonzero(np.isin(body_region, leg_r_regs) | ((body_region == R["pelvis"]) & (px < +0.015))),
        "foot.L": np.flatnonzero(np.isin(body_region, [R["calf.L"], R["foot.L"]])),
        "foot.R": np.flatnonzero(np.isin(body_region, [R["calf.R"], R["foot.R"]])),
    }

    # 체형 18 morph 필드 (build_base_v2.py와 100% 동일 랜드마크)
    m = lambda s: f"{bb2.MIXAMO}{s}"
    spec = plan.spec
    body_lm = expr.BodyFieldLandmarks(
        height_m=spec.height_m,
        hip_y=float(joints_g[bb2.JOINT_INDEX[m("Hips")], 1]),
        arm_x=float(abs(joints_g[bb2.JOINT_INDEX[m("LeftArm")], 0])),
        arm_y=float(joints_g[bb2.JOINT_INDEX[m("LeftArm")], 1]),
        chest_y=float(plan.z_chest),
        waist_y=float(plan.z_waist),
        hip_center_y=float(plan.z_hips + 0.015),
        neck_base_y=float(plan.z_neck_base),
        neck_seam_y=float(plan.z_neck_cut),
        head_pivot=b2g(np.array([0.0, 0.008, plan.z_chin + plan.head_h * 0.14])),
        foot_z=float(joints_g[bb2.JOINT_INDEX[m("LeftFoot")], 2]),
        chest_z=float(joints_g[bb2.JOINT_INDEX[m("Spine2")], 2]),
        waist_z=float(joints_g[bb2.JOINT_INDEX[m("Spine")], 2]),
        pelvis_z=float(joints_g[bb2.JOINT_INDEX[m("Hips")], 2]),
        torso_half_w=spec.chest_rx,
    )
    body_fields = expr.ArchetypeBodyFields(body_lm)

    # 좌/우 발 실측 바운드 (Blender 좌표)
    fl_pts = body_pos_b[body_region == R["foot.L"]]
    fr_pts = body_pos_b[body_region == R["foot.R"]]
    foot_bounds_l = (fl_pts.min(axis=0), fl_pts.max(axis=0))
    foot_bounds_r = (fr_pts.min(axis=0), fr_pts.max(axis=0))

    return BaseBodyContext(
        archetype_id=archetype_id,
        glb_path=glb_path,
        plan=plan,
        reader=reader,
        body_pos_g=body_pos_g,
        body_nrm_g=body_nrm_g,
        body_tris=body_tris,
        body_joints=body_joints,
        body_weights=body_weights,
        body_weights_dense=w_dense,
        body_region=body_region,
        head_pos_g=head["positions"],
        head_tris=head["indices"],
        joints_g=joints_g,
        body_pos_b=body_pos_b,
        body_nrm_b=body_nrm_b,
        head_pos_b=head_pos_b,
        joints_b=joints_b,
        body_bvh=body_bvh,
        head_bvh=head_bvh,
        torso_bvh=_make_sub_bvh(body_pos_b, body_tris, is_torso),
        arm_l_bvh=_make_sub_bvh(body_pos_b, body_tris, is_arm_l),
        arm_r_bvh=_make_sub_bvh(body_pos_b, body_tris, is_arm_r),
        leg_l_bvh=_make_sub_bvh(body_pos_b, body_tris, is_leg_l),
        leg_r_bvh=_make_sub_bvh(body_pos_b, body_tris, is_leg_r),
        foot_l_bvh=_make_sub_bvh(body_pos_b, body_tris, is_foot_l),
        foot_r_bvh=_make_sub_bvh(body_pos_b, body_tris, is_foot_r),
        zone_body_indices=zone_indices,
        body_fields=body_fields,
        foot_bounds_l=foot_bounds_l,
        foot_bounds_r=foot_bounds_r,
    )


# ---------------------------------------------------------------------------
# 재질 채널 & 고휘도 절차 원단 텍스처 라이브러리 (recolor 호환 >= 0.80 휘도)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ChannelMaterialSpec:
    channel_key: str  # "main" | "trim" | "accent" (or shoes-sole / shoes-lace)
    material_name: str  # ts_<role>[_<suffix>]_<part>
    v2_channel: str  # e.g., "top", "top-trim", "top-accent", "outer", ...
    default_hex: str  # 기본 장르 시연색 (#rrggbb)
    fabric_kind: str  # wool_twill | cotton_poplin | tartan_pleat | denim_knit | silk_brocade | tech_ripstop | leather_metal
    metallic: float = 0.0  # 엄격히 0.0 또는 1.0
    roughness: float = 0.80


def bake_fabric_textures(size: int = 512) -> dict[str, bytes]:
    """7종 고휘도(평균 휘도 >= 0.88) 절차 원단 텍스처를 512² 베이스라인 JPEG로 굽는다."""
    yy, xx = np.mgrid[0:size, 0:size]
    u = (xx + 0.5) / size
    v = (yy + 0.5) / size
    rng = np.random.default_rng(20261120)

    def _to_jpg(gray: np.ndarray, tint: tuple[float, float, float] = (1.0, 1.0, 1.0), quality: int = 88) -> bytes:
        g = np.clip(gray, 0.72, 1.0).astype(np.float32)
        m = float(g.mean())
        if m < 0.88:
            g = 1.0 - (1.0 - g) * ((1.0 - 0.90) / max(1.0 - m, 1e-4))
        rgb = np.stack([g * tint[0], g * tint[1], g * tint[2]], axis=-1)
        return bb2.encode_baseline_jpeg_bpy(np.clip(rgb, 0.0, 1.0), quality=quality)

    textures: dict[str, bytes] = {}

    # 1) wool_twill: 정장·블레이저·코트 미세 사선 직조 (지브라 줄무늬 없이 깔끔한 웹툰 원단)
    twill = 0.945 + 0.016 * np.sin((u * 160.0 + v * 160.0) * 2.0 * math.pi)
    textures["wool_twill"] = _to_jpg(twill + rng.normal(0.0, 0.009, (size, size)))

    # 2) cotton_poplin: 셔츠·티·도복 평직
    weave = 0.960 + 0.012 * np.sin(u * 192.0 * 2.0 * math.pi) * np.sin(v * 192.0 * 2.0 * math.pi)
    textures["cotton_poplin"] = _to_jpg(weave + rng.normal(0.0, 0.006, (size, size)))

    # 3) tartan_pleat: 학원 교복 플리츠 스커트용 톤온톤 체크 직조(recolor 호환!)
    cx = np.abs(((u * 6.0) % 1.0) - 0.5)
    cy = np.abs(((v * 6.0) % 1.0) - 0.5)
    broad = ((cx < 0.14).astype(np.float32) + (cy < 0.14).astype(np.float32)) * 0.075
    pin = ((np.abs(cx - 0.30) < 0.018).astype(np.float32) + (np.abs(cy - 0.30) < 0.018).astype(np.float32)) * 0.090
    tartan = 0.975 - broad - pin + rng.normal(0.0, 0.006, (size, size))
    textures["tartan_pleat"] = _to_jpg(tartan)

    # 4) denim_knit: 데님/니트 부드러운 미세 결 (줄무늬 아티팩트 제거)
    slub = 0.935 + 0.015 * np.sin(u * 180.0 * 2.0 * math.pi) + 0.012 * np.sin((u * 140.0 + v * 140.0) * 2.0 * math.pi)
    textures["denim_knit"] = _to_jpg(slub + rng.normal(0.0, 0.014, (size, size)))

    # 5) silk_brocade: 로판/무협 비단·은은한 광택 다마스크
    damask = 0.955 + 0.022 * np.sin(u * 14.0 * 2.0 * math.pi) * np.sin(v * 14.0 * 2.0 * math.pi)
    textures["silk_brocade"] = _to_jpg(damask + rng.normal(0.0, 0.005, (size, size)))

    # 6) tech_ripstop: 테크웨어 미세 방탄 립스톱 격자
    gx = ((u * 48.0) % 1.0 < 0.08).astype(np.float32)
    gy = ((v * 48.0) % 1.0 < 0.08).astype(np.float32)
    ripstop = 0.945 - 0.038 * np.maximum(gx, gy) + rng.normal(0.0, 0.008, (size, size))
    textures["tech_ripstop"] = _to_jpg(ripstop)

    # 7) leather_metal: 가죽/메탈 미세 브러시드 질감
    brush = 0.955 + 0.014 * np.sin(u * 140.0 * 2.0 * math.pi) + rng.normal(0.0, 0.009, (size, size))
    textures["leather_metal"] = _to_jpg(brush)

    return textures


# ---------------------------------------------------------------------------
# 폐곡면 솔리드·베벨 의상 메쉬 빌더 (0-defect + UV1 cm 밀도 + 영역 태그)
# ---------------------------------------------------------------------------


@dataclass
class MeshChunk:
    """단일 폐곡면 솔리드 파트(Blender 좌표, 쿼드/삼각, UV1, 스킨 존)."""

    channel: str
    positions: np.ndarray  # (V, 3) float64 Blender coords
    faces: list[tuple[int, ...]]  # list of 3- or 4-tuples
    uv1: np.ndarray  # (V, 2) float64 (1.0 = 50cm)
    skin_zone: str
    rigid_anchor: np.ndarray | None = None  # 단추·버클 등 강체 단일 스킨 기준점
    is_detail: bool = False  # 외곽 여유 푸시 시 셸과 함께 유지할지 여부
    part_tag: str = "body"  # shape morph 대상 태깅용 (e.g., "hem", "sleeve", "collar", "lapel", "cape", "skirt")


class GarmentBuilder:
    """0-결함 폐곡면 의상 지오메트리 빌더."""

    def __init__(self, ctx: BaseBodyContext) -> None:
        self.ctx = ctx
        self.chunks: list[MeshChunk] = []

    def _finalize_bmesh_chunk(
        self,
        bm: bmesh.types.BMesh,
        *,
        channel: str,
        skin_zone: str,
        uv1_arr: np.ndarray | None = None,
        rigid_anchor: np.ndarray | None = None,
        is_detail: bool = False,
        part_tag: str = "body",
    ) -> MeshChunk:
        """bmesh를 검증·정규화해 MeshChunk로 변환한다."""
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()

        # 0-defect 즉시 어설션
        loose = sum(1 for v in bm.verts if len(v.link_edges) == 0)
        wire = sum(1 for e in bm.edges if len(e.link_faces) == 0)
        true_nm = sum(1 for e in bm.edges if len(e.link_faces) > 2 or (len(e.link_faces) == 2 and not e.is_contiguous))
        zero_a = sum(1 for f in bm.faces if f.calc_area() <= 1e-10)
        if loose or wire or true_nm or zero_a:
            bm.free()
            raise RuntimeError(
                f"GarmentBuilder 청크 결함({channel}/{part_tag}): loose={loose}, wire={wire}, nm={true_nm}, zeroA={zero_a}"
            )

        pts = np.array([[v.co.x, v.co.y, v.co.z] for v in bm.verts], dtype=np.float64)
        faces = [tuple(v.index for v in f.verts) for f in bm.faces]
        if uv1_arr is None or len(uv1_arr) != len(pts):
            # 실제 미터 기준 triplanar UV1 (50 cm / UV1 unit)
            v_nrms = np.array([[v.normal.x, v.normal.y, v.normal.z] for v in bm.verts], dtype=np.float64)
            uv1 = self._metric_triplanar_uv1(pts, v_nrms)
        else:
            uv1 = np.asarray(uv1_arr, dtype=np.float64)
        bm.free()

        chunk = MeshChunk(
            channel=channel,
            positions=pts,
            faces=faces,
            uv1=uv1,
            skin_zone=skin_zone,
            rigid_anchor=None if rigid_anchor is None else np.asarray(rigid_anchor, dtype=np.float64),
            is_detail=is_detail,
            part_tag=part_tag,
        )
        self.chunks.append(chunk)
        return chunk

    @staticmethod
    def _metric_triplanar_uv1(pts: np.ndarray, normals: np.ndarray) -> np.ndarray:
        """일관된 연속 미터 UV1 투영 (1 UV1 = 0.50 m = 50 cm, 축 경계 찢어짐 방지)."""
        _ = normals
        inv = 1.0 / UV1_METERS_PER_UNIT
        # 청크 바운드의 가장 넓은 두 축으로 연속 투영해 삼각형 왜곡/축 전환 점프 제거!
        span = pts.max(axis=0) - pts.min(axis=0)
        axes = np.argsort(span)  # 오름차순: axes[1], axes[2]가 주된 2축
        return np.stack([pts[:, int(axes[2])] * inv, pts[:, int(axes[1])] * inv], axis=1)

    @staticmethod
    def _grid_arc_uv1(grid: np.ndarray, closed_u: bool) -> np.ndarray:
        """(M, N, 3) 곡면 그리드의 실제 미터 호길이 기반 UV1 (M, N, 2) (1.0 = 50cm)."""
        m, n, _ = grid.shape
        uv = np.zeros((m, n, 2), dtype=np.float64)
        inv = 1.0 / UV1_METERS_PER_UNIT
        # 수평(u) 호길이
        if n > 1:
            du = np.linalg.norm(grid[:, 1:, :] - grid[:, :-1, :], axis=2)
            uv[:, 1:, 0] = np.cumsum(du, axis=1) * inv
        # 수직/축방향(v) 호길이
        if m > 1:
            dv = np.linalg.norm(grid[1:, :, :] - grid[:-1, :, :], axis=2)
            uv[1:, :, 1] = np.cumsum(dv, axis=0) * inv
        _ = closed_u
        return uv

    def add_thick_shell(
        self,
        outer_grid: np.ndarray,
        inner_grid: np.ndarray,
        *,
        closed_u: bool = True,
        channel: str = "main",
        skin_zone: str = "torso",
        bevel_rim: bool = True,
        part_tag: str = "body",
        is_detail: bool = False,
    ) -> MeshChunk:
        """외피 `(M, N, 3)` + 내피 `(M, N, 3)`를 베벨 테두리로 봉합한 100% 폐곡면 의상 셸."""
        outer = np.asarray(outer_grid, dtype=np.float64)
        inner = np.asarray(inner_grid, dtype=np.float64)
        m, n, _ = outer.shape
        assert inner.shape == outer.shape and m >= 2 and n >= 3

        uv_grid = self._grid_arc_uv1(outer, closed_u=closed_u)
        bm = bmesh.new()

        o_v = [[bm.verts.new(outer[i, j].tolist()) for j in range(n)] for i in range(m)]
        i_v = [[bm.verts.new(inner[i, j].tolist()) for j in range(n)] for i in range(m)]
        uv_list: list[tuple[float, float]] = []
        for i in range(m):
            for j in range(n):
                uv_list.append((float(uv_grid[i, j, 0]), float(uv_grid[i, j, 1])))
        for i in range(m):
            for j in range(n):
                uv_list.append((float(uv_grid[i, j, 0]), float(uv_grid[i, j, 1])))

        j_range = range(n) if closed_u else range(n - 1)

        # 외피 & 내피 쿼드
        for i in range(m - 1):
            for j in j_range:
                jn = (j + 1) % n
                bm.faces.new((o_v[i][j], o_v[i][jn], o_v[i + 1][jn], o_v[i + 1][j]))
                bm.faces.new((i_v[i][jn], i_v[i][j], i_v[i + 1][j], i_v[i + 1][jn]))

        def _bridge_edge_strip(
            a_verts: list[bmesh.types.BMVert],
            b_verts: list[bmesh.types.BMVert],
            a_uvs: list[tuple[float, float]],
            b_uvs: list[tuple[float, float]],
            out_dirs: list[np.ndarray],
            is_loop: bool,
        ) -> list[bmesh.types.BMVert]:
            k_len = len(a_verts)
            rng = range(k_len) if is_loop else range(k_len - 1)
            mid_v: list[bmesh.types.BMVert] = []
            if bevel_rim:
                for idx in range(k_len):
                    pa = np.array(a_verts[idx].co, dtype=np.float64)
                    pb = np.array(b_verts[idx].co, dtype=np.float64)
                    th = float(np.linalg.norm(pa - pb))
                    d = out_dirs[idx]
                    dn = float(np.linalg.norm(d))
                    d_unit = d / dn if dn > 1e-8 else np.zeros(3)
                    pm = 0.5 * (pa + pb) + d_unit * min(0.0022, 0.35 * th)
                    mid_v.append(bm.verts.new(pm.tolist()))
                    uv_list.append((0.5 * (a_uvs[idx][0] + b_uvs[idx][0]), 0.5 * (a_uvs[idx][1] + b_uvs[idx][1])))
                for idx in rng:
                    idxn = (idx + 1) % k_len
                    bm.faces.new((a_verts[idx], mid_v[idx], mid_v[idxn], a_verts[idxn]))
                    bm.faces.new((mid_v[idx], b_verts[idx], b_verts[idxn], mid_v[idxn]))
            else:
                for idx in rng:
                    idxn = (idx + 1) % k_len
                    bm.faces.new((a_verts[idx], b_verts[idx], b_verts[idxn], a_verts[idxn]))
            return mid_v

        # 하단 림 (i = 0)
        bot_dirs = [outer[0, j] - outer[1, j] for j in range(n)]
        bot_uvs = [(float(uv_grid[0, j, 0]), float(uv_grid[0, j, 1])) for j in range(n)]
        bot_mid = _bridge_edge_strip(o_v[0], i_v[0], bot_uvs, bot_uvs, bot_dirs, closed_u)

        # 상단 림 (i = m - 1)
        top_dirs = [outer[-1, j] - outer[-2, j] for j in range(n)]
        top_uvs = [(float(uv_grid[-1, j, 0]), float(uv_grid[-1, j, 1])) for j in range(n)]
        top_mid = _bridge_edge_strip(i_v[-1], o_v[-1], top_uvs, top_uvs, top_dirs, closed_u)

        # 열린 의상(앞트임 블레이저·코트·케이프·도포 등) 좌·우 수직 경계 봉합 + 4코너 명시 밀봉
        if not closed_u:
            left_o = [o_v[i][0] for i in range(m)]
            left_i = [i_v[i][0] for i in range(m)]
            for i in range(m - 1):
                bm.faces.new((left_i[i], left_o[i], left_o[i + 1], left_i[i + 1]))
            right_o = [o_v[i][-1] for i in range(m)]
            right_i = [i_v[i][-1] for i in range(m)]
            for i in range(m - 1):
                bm.faces.new((right_o[i], right_i[i], right_i[i + 1], right_o[i + 1]))
            if bevel_rim and bot_mid and top_mid:
                bm.faces.new((o_v[0][0], i_v[0][0], bot_mid[0]))
                bm.faces.new((i_v[0][-1], o_v[0][-1], bot_mid[-1]))
                bm.faces.new((i_v[-1][0], o_v[-1][0], top_mid[0]))
                bm.faces.new((o_v[-1][-1], i_v[-1][-1], top_mid[-1]))

        return self._finalize_bmesh_chunk(
            bm,
            channel=channel,
            skin_zone=skin_zone,
            uv1_arr=np.array(uv_list[: len(bm.verts)], dtype=np.float64) if len(uv_list) == len(bm.verts) else None,
            is_detail=is_detail,
            part_tag=part_tag,
        )

    def add_offset_panel(
        self,
        surface_grid: np.ndarray,
        thickness: float,
        *,
        outward_dir: np.ndarray | None = None,
        channel: str = "main",
        skin_zone: str = "torso",
        part_tag: str = "detail",
        is_detail: bool = True,
    ) -> MeshChunk:
        """곡면 그리드 `(M, N, 3)`를 법선 방향으로 `thickness`만큼 두께화한 폐곡면 3D 패널(칼라·라펠·포켓·플랩·견장·벨트)."""
        grid = np.asarray(surface_grid, dtype=np.float64)
        m, n, _ = grid.shape
        # 국소 법선 계산
        nrms = np.zeros_like(grid)
        for i in range(m):
            i0, i1 = max(0, i - 1), min(m - 1, i + 1)
            for j in range(n):
                j0, j1 = max(0, j - 1), min(n - 1, j + 1)
                du = grid[i, j1] - grid[i, j0]
                dv = grid[i1, j] - grid[i0, j]
                c = np.cross(du, dv)
                cn = float(np.linalg.norm(c))
                nrms[i, j] = c / cn if cn > 1e-9 else np.array([0.0, -1.0, 0.0])
        if outward_dir is not None:
            ref = np.asarray(outward_dir, dtype=np.float64)
            if float(np.dot(nrms.mean(axis=(0, 1)), ref)) < 0.0:
                nrms = -nrms

        outer = grid + nrms * thickness
        inner = grid
        return self.add_thick_shell(
            outer,
            inner,
            closed_u=False,
            channel=channel,
            skin_zone=skin_zone,
            bevel_rim=False,
            part_tag=part_tag,
            is_detail=is_detail,
        )

    def add_beveled_box(
        self,
        center: np.ndarray | tuple[float, float, float],
        size: tuple[float, float, float],
        *,
        rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
        bevel_width: float = 0.0018,
        bevel_segments: int = 1,
        channel: str = "accent",
        skin_zone: str = "torso",
        rigid: bool = True,
        part_tag: str = "hardware",
    ) -> MeshChunk:
        """베벨 처리된 폐곡면 3D 박스 (버클·포켓·몰리 파우치·무릎 패드·굽·타이블럭)."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        sx, sy, sz = size
        for v in bm.verts:
            v.co.x *= sx
            v.co.y *= sy
            v.co.z *= sz
        bw = min(bevel_width, min(sx, sy, sz) * 0.28)
        if bw > 1e-5:
            bmesh.ops.bevel(
                bm,
                geom=list(bm.edges),
                offset=bw,
                segments=bevel_segments,
                affect="EDGES",
                clamp_overlap=True,
            )
        mat = Matrix.Translation(Vector(center)) @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
        return self._finalize_bmesh_chunk(
            bm,
            channel=channel,
            skin_zone=skin_zone,
            rigid_anchor=np.asarray(center, dtype=np.float64) if rigid else None,
            is_detail=True,
            part_tag=part_tag,
        )

    def add_beveled_cylinder(
        self,
        p0: np.ndarray | tuple[float, float, float],
        p1: np.ndarray | tuple[float, float, float],
        r0: float,
        r1: float | None = None,
        *,
        segs: int = 12,
        bevel_frac: float = 0.22,
        channel: str = "accent",
        skin_zone: str = "torso",
        rigid: bool = True,
        part_tag: str = "button",
    ) -> MeshChunk:
        """양 끝단 베벨 마감된 폐곡면 실린더/디스크 (단추·아일렛·리벳·브로치·옥패)."""
        a = np.asarray(p0, dtype=np.float64)
        b = np.asarray(p1, dtype=np.float64)
        if r1 is None:
            r1 = r0
        axis = b - a
        length = float(np.linalg.norm(axis))
        if length < 1e-6:
            axis = np.array([0.0, -1.0, 0.0])
            length = 0.002
        z_dir = axis / length
        up = np.array([0.0, 0.0, 1.0]) if abs(z_dir[2]) < 0.92 else np.array([1.0, 0.0, 0.0])
        x_dir = np.cross(up, z_dir)
        x_dir /= max(float(np.linalg.norm(x_dir)), 1e-9)
        y_dir = np.cross(z_dir, x_dir)

        bm = bmesh.new()
        bf = max(0.05, min(0.35, bevel_frac))
        # 4개 링으로 양 끝단 챔퍼 베벨 구성 + 중심 정점 팬 (100% 폐곡면)
        ring_specs = [
            (0.0, r0 * (1.0 - bf * 0.45)),
            (bf * 0.5, r0),
            (1.0 - bf * 0.5, r1),
            (1.0, r1 * (1.0 - bf * 0.45)),
        ]
        rings: list[list[bmesh.types.BMVert]] = []
        for t, rad in ring_specs:
            c = a + axis * t
            ring = []
            for k in range(segs):
                ang = 2.0 * math.pi * (k / segs)
                pt = c + (x_dir * math.cos(ang) + y_dir * math.sin(ang)) * rad
                ring.append(bm.verts.new(pt.tolist()))
            rings.append(ring)
        for ri in range(len(rings) - 1):
            for k in range(segs):
                kn = (k + 1) % segs
                bm.faces.new((rings[ri][k], rings[ri][kn], rings[ri + 1][kn], rings[ri + 1][k]))
        c0 = bm.verts.new(a.tolist())
        c1 = bm.verts.new(b.tolist())
        for k in range(segs):
            kn = (k + 1) % segs
            bm.faces.new((c0, rings[0][kn], rings[0][k]))
            bm.faces.new((c1, rings[-1][k], rings[-1][kn]))

        mid = 0.5 * (a + b)
        return self._finalize_bmesh_chunk(
            bm,
            channel=channel,
            skin_zone=skin_zone,
            rigid_anchor=mid if rigid else None,
            is_detail=True,
            part_tag=part_tag,
        )

    def add_swept_tube(
        self,
        curve_pts: np.ndarray,
        radii: float | np.ndarray,
        *,
        n_prof: int = 8,
        closed_curve: bool = False,
        channel: str = "accent",
        skin_zone: str = "torso",
        rigid: bool = False,
        part_tag: str = "cord",
    ) -> MeshChunk:
        """3D 곡선 `(M, 3)`을 따라 원형 단면을 스윕한 폐곡면 튜브 (끈·체인·파이핑·신발끈·티아라 아치)."""
        pts = np.asarray(curve_pts, dtype=np.float64)
        m = len(pts)
        assert m >= 2
        if np.ndim(radii) == 0:
            r_arr = np.full(m, float(radii), dtype=np.float64)
        else:
            r_arr = np.asarray(radii, dtype=np.float64)

        # 병렬 수송 프레임 (비틀림 없음)
        tangents = np.zeros_like(pts)
        for i in range(m):
            if closed_curve:
                t = pts[(i + 1) % m] - pts[(i - 1) % m]
            elif i == 0:
                t = pts[1] - pts[0]
            elif i == m - 1:
                t = pts[-1] - pts[-2]
            else:
                t = pts[i + 1] - pts[i - 1]
            tn = float(np.linalg.norm(t))
            tangents[i] = t / tn if tn > 1e-9 else np.array([0.0, 0.0, 1.0])

        ref = np.array([0.0, 0.0, 1.0]) if abs(tangents[0, 2]) < 0.9 else np.array([1.0, 0.0, 0.0])
        n0 = np.cross(tangents[0], ref)
        n0 /= max(float(np.linalg.norm(n0)), 1e-9)
        normals = np.zeros_like(pts)
        binormals = np.zeros_like(pts)
        normals[0] = n0
        binormals[0] = np.cross(tangents[0], n0)
        for i in range(1, m):
            # 이전 법선을 새 접선에 수직 투영
            ni = normals[i - 1] - tangents[i] * float(np.dot(normals[i - 1], tangents[i]))
            nn = float(np.linalg.norm(ni))
            if nn < 1e-6:
                ref = np.array([0.0, 0.0, 1.0]) if abs(tangents[i, 2]) < 0.9 else np.array([1.0, 0.0, 0.0])
                ni = np.cross(tangents[i], ref)
                nn = max(float(np.linalg.norm(ni)), 1e-9)
            normals[i] = ni / nn
            binormals[i] = np.cross(tangents[i], normals[i])

        bm = bmesh.new()
        rings: list[list[bmesh.types.BMVert]] = []
        uv_list: list[tuple[float, float]] = []
        inv = 1.0 / UV1_METERS_PER_UNIT
        arc_s = np.zeros(m, dtype=np.float64)
        if m > 1:
            arc_s[1:] = np.cumsum(np.linalg.norm(pts[1:] - pts[:-1], axis=1))
        for i in range(m):
            r = float(r_arr[i])
            ring = []
            for k in range(n_prof):
                ang = 2.0 * math.pi * (k / n_prof)
                pt = pts[i] + (normals[i] * math.cos(ang) + binormals[i] * math.sin(ang)) * r
                ring.append(bm.verts.new(pt.tolist()))
                uv_list.append((float(arc_s[i] * inv), float((r * ang) * inv)))
            rings.append(ring)

        i_range = range(m) if closed_curve else range(m - 1)
        for i in i_range:
            inxt = (i + 1) % m
            for k in range(n_prof):
                kn = (k + 1) % n_prof
                bm.faces.new((rings[i][k], rings[i][kn], rings[inxt][kn], rings[inxt][k]))

        if not closed_curve:
            c0 = bm.verts.new((pts[0] - tangents[0] * (r_arr[0] * 0.45)).tolist())
            c1 = bm.verts.new((pts[-1] + tangents[-1] * (r_arr[-1] * 0.45)).tolist())
            uv_list.append((0.0, 0.0))
            uv_list.append((float(arc_s[-1] * inv), 0.0))
            for k in range(n_prof):
                kn = (k + 1) % n_prof
                bm.faces.new((c0, rings[0][kn], rings[0][k]))
                bm.faces.new((c1, rings[-1][k], rings[-1][kn]))

        return self._finalize_bmesh_chunk(
            bm,
            channel=channel,
            skin_zone=skin_zone,
            uv1_arr=np.array(uv_list, dtype=np.float64),
            rigid_anchor=pts.mean(axis=0) if rigid else None,
            is_detail=True,
            part_tag=part_tag,
        )

    def add_gem_or_bead(
        self,
        center: np.ndarray | tuple[float, float, float],
        radii: tuple[float, float, float],
        *,
        segs: int = 3,
        channel: str = "accent",
        skin_zone: str = "torso",
        rigid: bool = True,
        part_tag: str = "gem",
    ) -> MeshChunk:
        """올-쿼드 큐브 투영 보석·진주·옥패 (극점 핀치 0)."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=2.0)
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=max(1, segs - 1), use_grid_fill=True)
        cx, cy, cz = center
        rx, ry, rz = radii
        for v in bm.verts:
            d = v.co.normalized()
            v.co = Vector((cx + d.x * rx, cy + d.y * ry, cz + d.z * rz))
        return self._finalize_bmesh_chunk(
            bm,
            channel=channel,
            skin_zone=skin_zone,
            rigid_anchor=np.asarray(center, dtype=np.float64) if rigid else None,
            is_detail=True,
            part_tag=part_tag,
        )


# ---------------------------------------------------------------------------
# 공통 의상 패턴 빌더 (몸통·소매·칼라·라펠·바지·치마·신발)
# ---------------------------------------------------------------------------


def smooth_drape_radii(r_mat: np.ndarray, *, vertical_passes: int = 3, angular_passes: int = 2, closed_u: bool = True, hang_slope: float = 0.0) -> np.ndarray:
    """의상 단면 반지름 행렬 `(M, N)`에 원단 드레이프·평활을 적용해 바디 밀착 찰흙 느낌을 제거한다.

    - `hang_slope > 0`: 위에서 아래로 내려올 때 천이 안으로 꺼지지 않게 직선 드레이프 엔벨로프 강제.
    """
    r = r_mat.copy()
    m, n = r.shape
    if hang_slope > 0.0:
        # 위(m-1)에서 아래(0)로 내려오며 반지름 급감을 제한 (가슴·견갑골에서 곧게 떨어지는 재킷/후디)
        for i in range(m - 2, -1, -1):
            r[i] = np.maximum(r[i], r[i + 1] - hang_slope)
    for _ in range(angular_passes):
        if closed_u:
            r = 0.25 * np.roll(r, 1, axis=1) + 0.50 * r + 0.25 * np.roll(r, -1, axis=1)
        elif n >= 3:
            mid = 0.25 * r[:, :-2] + 0.50 * r[:, 1:-1] + 0.25 * r[:, 2:]
            r[:, 1:-1] = mid
    for _ in range(vertical_passes):
        if m >= 3:
            r[1:-1] = 0.25 * r[:-2] + 0.50 * r[1:-1] + 0.25 * r[2:]
    return np.maximum(r, r_mat - 0.001)  # 원본 바디 최소 여유를 침범하지 않음


def build_torso_grid(
    ctx: BaseBodyContext,
    z_stops: np.ndarray,
    n_seg: int,
    ease_fn: Callable[[float, float], float],
    *,
    theta_start: float = 0.0,
    theta_end: float = 2.0 * math.pi,
    closed_u: bool = True,
    hang_slope: float = 0.0,
    flare_below_z: float | None = None,
    flare_rate: float = 0.0,
    pleat_count: int = 0,
    pleat_depth_fn: Callable[[float], float] | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """몸통·상하의 외피 그리드 `(M, N, 3)`와 내향 단위법선(두께 방향)용 중심 `(M, 3)`을 생성한다."""
    m = len(z_stops)
    thetas = (
        np.linspace(theta_start, theta_end, n_seg, endpoint=False)
        if closed_u
        else np.linspace(theta_start, theta_end, n_seg, endpoint=True)
    )
    r_raw = np.empty((m, n_seg), dtype=np.float64)
    ycs = np.empty(m, dtype=np.float64)
    for i, z in enumerate(z_stops):
        ycs[i] = ctx._torso_y_center(float(z))  # noqa: SLF001
        for j, th in enumerate(thetas):
            _, _, r_body = ctx.sample_torso_radius(float(z), float(th))
            e = float(ease_fn(float(z), float(th)))
            r_raw[i, j] = r_body + e

    r_drape = smooth_drape_radii(r_raw, vertical_passes=3, angular_passes=2, closed_u=closed_u, hang_slope=hang_slope)

    # 치마/코트/도포 하단 플레어 + 실제 3D 칼주름/웨이브
    if flare_below_z is not None and abs(flare_rate) > 1e-6:
        for i, z in enumerate(z_stops):
            if z < flare_below_z:
                drop = flare_below_z - float(z)
                r_drape[i] = np.maximum(r_drape[i], r_drape[i] + drop * flare_rate)

    if pleat_count > 0 and pleat_depth_fn is not None:
        for i, z in enumerate(z_stops):
            depth = float(pleat_depth_fn(float(z)))
            if depth <= 1e-6:
                continue
            for j, th in enumerate(thetas):
                # 톱니형 칼주름 (sawtooth-knife pleat: 완만한 외면 + 급격한 안쪽 접힘!)
                phase = ((float(th) / (2.0 * math.pi)) * pleat_count) % 1.0
                if phase < 0.72:
                    wave = phase / 0.72
                else:
                    wave = 1.0 - (phase - 0.72) / 0.28
                r_drape[i, j] += depth * wave

    grid = np.empty((m, n_seg, 3), dtype=np.float64)
    centers = np.zeros((m, 3), dtype=np.float64)
    for i, z in enumerate(z_stops):
        centers[i] = (0.0, ycs[i], float(z))
        for j, th in enumerate(thetas):
            rr = r_drape[i, j]
            grid[i, j] = (rr * math.sin(th), ycs[i] - rr * math.cos(th), float(z))
    return grid, centers


def offset_grid_radial(grid: np.ndarray, centers: np.ndarray, delta_r: float) -> np.ndarray:
    """중심축 `centers (M, 3)` 기준으로 그리드를 방사 방향으로 `delta_r`만큼 오프셋한다."""
    vec = grid - centers[:, None, :]
    vec[:, :, 2] = 0.0
    norm = np.maximum(np.linalg.norm(vec, axis=2, keepdims=True), 1e-6)
    return grid + (vec / norm) * delta_r


def add_tailored_sleeves(
    gb: GarmentBuilder,
    *,
    x_start_frac: float = 0.78,
    x_end_frac: float = 0.94,
    ease_fn: Callable[[float, float], float],
    thickness: float = 0.0026,
    n_rings: int = 12,
    n_seg: int = 20,
    channel: str = "main",
    cuff_channel: str | None = "trim",
    cuff_len: float = 0.042,
    cuff_step: float = 0.0022,
    wide_hang_fn: Callable[[float], float] | None = None,
    part_tag: str = "sleeve",
) -> None:
    """좌/우 맞춤 소매 (어깨 관절 내부 12mm 중첩 캡 + 선택 소매 커프스/시보리 단차)."""
    ctx = gb.ctx
    p = ctx.plan
    for side, lab in ((+1, "Left"), (-1, "Right")):
        x_sh = abs(float(ctx.joint_b(f"{bb2.MIXAMO}{lab}Arm")[0]))
        x_hand = abs(float(ctx.joint_b(f"{bb2.MIXAMO}{lab}Hand")[0]))
        x0 = x_sh * x_start_frac
        x1 = x_sh + (x_hand - x_sh) * x_end_frac
        if cuff_channel is not None and cuff_len > 0.005:
            x_body_end = max(x0 + 0.04, x1 - cuff_len)
        else:
            x_body_end = x1

        xs = np.linspace(x0, x_body_end, n_rings)
        inner_g = np.empty((n_rings, n_seg, 3), dtype=np.float64)
        outer_g = np.empty((n_rings, n_seg, 3), dtype=np.float64)
        phis = np.linspace(0.0, 2.0 * math.pi, n_seg, endpoint=False)

        for i, xa in enumerate(xs):
            t_along = (float(xa) - x0) / max(x1 - x0, 1e-5)
            axis = ctx.arm_axis_pt(side, float(xa))
            # 어깨 삽입 시작 링(t_along ~ 0)은 살짝 둥글게 감싸 몸통 암홀 내부에 안착
            ring_in = ctx.sample_arm_ring(
                side,
                float(xa),
                n_seg,
                lambda ph, ta=t_along: float(ease_fn(ta, ph)),
            )
            if wide_hang_fn is not None:
                hang = float(wide_hang_fn(t_along))
                if hang > 1e-5:
                    for j, ph in enumerate(phis):
                        # 아래쪽(-Z, sin(ph) < 0)으로만 우아하게 처지는 무협 광수 / 로판 퍼프
                        down = max(0.0, -math.sin(ph))
                        ring_in[j, 2] -= hang * (down ** 1.15)
                        # 광수 밑단 폭 살짝 확장
                        ring_in[j, 1] += -math.cos(ph) * hang * 0.22 * (down ** 0.7)
            # 외피는 축 기준 바깥쪽으로 thickness만큼
            rad_v = ring_in - axis[None, :]
            rad_v[:, 0] = 0.0
            rn = np.maximum(np.linalg.norm(rad_v, axis=1, keepdims=True), 1e-6)
            ring_out = ring_in + (rad_v / rn) * thickness
            inner_g[i] = ring_in
            outer_g[i] = ring_out

        # 좌/우 모두 양수 부피 감김이 유지되도록 outer/inner 구성
        gb.add_thick_shell(
            outer_g,
            inner_g,
            closed_u=True,
            channel=channel,
            skin_zone=f"arm.{lab[0]}",
            bevel_rim=True,
            part_tag=part_tag,
        )

        # 소매 커프스/시보리 단차 링 (별도 trim 채널)
        if cuff_channel is not None and cuff_len > 0.005:
            c_xs = np.linspace(x_body_end - 0.006, x1, 4)
            c_in = np.empty((4, n_seg, 3), dtype=np.float64)
            c_out = np.empty((4, n_seg, 3), dtype=np.float64)
            for i, xa in enumerate(c_xs):
                t_along = (float(xa) - x0) / max(x1 - x0, 1e-5)
                axis = ctx.arm_axis_pt(side, float(xa))
                r_base = ctx.sample_arm_ring(
                    side,
                    float(xa),
                    n_seg,
                    lambda ph, ta=t_along: float(ease_fn(ta, ph)) + cuff_step * 0.4,
                )
                if wide_hang_fn is not None:
                    hang = float(wide_hang_fn(t_along))
                    if hang > 1e-5:
                        for j, ph in enumerate(phis):
                            down = max(0.0, -math.sin(ph))
                            r_base[j, 2] -= hang * (down ** 1.15)
                            r_base[j, 1] += -math.cos(ph) * hang * 0.22 * (down ** 0.7)
                rad_v = r_base - axis[None, :]
                rad_v[:, 0] = 0.0
                rn = np.maximum(np.linalg.norm(rad_v, axis=1, keepdims=True), 1e-6)
                c_in[i] = r_base
                c_out[i] = r_base + (rad_v / rn) * (thickness + cuff_step)
            gb.add_thick_shell(
                c_out,
                c_in,
                closed_u=True,
                channel=cuff_channel,
                skin_zone=f"arm.{lab[0]}",
                bevel_rim=True,
                part_tag="cuff",
                is_detail=True,
            )


def add_stand_or_folded_collar(
    gb: GarmentBuilder,
    *,
    z_base: float,
    stand_h: float = 0.026,
    fold_drop: float = 0.036,
    flare_out: float = 0.014,
    ease: float = 0.0055,
    thickness: float = 0.0026,
    front_gap_rad: float = 0.28,
    channel: str = "main",
    trim_edge_channel: str | None = None,
    folded: bool = True,
) -> None:
    """입체 스탠드 칼라 또는 접힌 셔츠/블레이저 칼라 (실제 3D 두께 접힘)."""
    ctx = gb.ctx
    n_seg = 24
    thetas = np.linspace(front_gap_rad, 2.0 * math.pi - front_gap_rad, n_seg)

    if folded:
        # 5단 프로파일: 목 하단 → 스탠드 상단 → 접힘 정점 → 바깥 꺾임 → 칼라 날개 끝 (앞쪽 뾰족 연장)
        profile = [
            (0.0, 0.0),
            (stand_h * 0.65, 0.0015),
            (stand_h, 0.0055),
            (stand_h - fold_drop * 0.45, 0.0095 + flare_out * 0.55),
            (stand_h - fold_drop, 0.011 + flare_out),
        ]
    else:
        # 높은 스탠드/만다린/테크웨어 펀넬 칼라
        profile = [
            (0.0, 0.0),
            (stand_h * 0.35, flare_out * 0.25),
            (stand_h * 0.72, flare_out * 0.65),
            (stand_h, flare_out),
        ]

    m = len(profile)
    grid = np.empty((m, n_seg, 3), dtype=np.float64)
    yc = ctx._torso_y_center(z_base)  # noqa: SLF001
    for i, (dz, dr) in enumerate(profile):
        z_cur = z_base + dz
        for j, th in enumerate(thetas):
            _, _, r_neck = ctx.sample_torso_radius(min(ctx.plan.z_neck_cut - 0.002, max(ctx.plan.z_shoulder + 0.01, z_base)), float(th))
            # 앞쪽 칼라 포인트(th가 front_gap_rad 근처)는 살짝 더 길게 내려오는 셔츠 칼라 실루엣
            point_ext = 0.0
            if folded and i == m - 1:
                near_front = math.exp(-((min(th, 2.0 * math.pi - th) - front_gap_rad) / 0.38) ** 2)
                point_ext = -0.014 * near_front
            rr = r_neck + ease + dr
            grid[i, j] = (rr * math.sin(th), yc - rr * math.cos(th), z_cur + point_ext)

    gb.add_offset_panel(
        grid,
        thickness,
        outward_dir=np.array([0.0, 0.0, 1.0]) if not folded else np.array([0.0, -0.3, 0.9]),
        channel=channel,
        skin_zone="torso",
        part_tag="collar",
        is_detail=True,
    )

    if trim_edge_channel is not None:
        # 칼라 외곽 파이핑 튜브
        gb.add_swept_tube(
            grid[-1] + np.array([0.0, 0.0, 0.0012]),
            0.0020,
            n_prof=6,
            channel=trim_edge_channel,
            skin_zone="torso",
            part_tag="collar_trim",
        )


def add_tailored_lapels(
    gb: GarmentBuilder,
    *,
    z_top: float,
    z_button: float,
    base_ease: float,
    lapel_width: float = 0.048,
    thickness: float = 0.0032,
    peaked: bool = False,
    channel: str = "main",
    piping_channel: str | None = None,
) -> None:
    """좌/우 입체 접힌 노치드·피크드 재킷 라펠 (실제 3D 두께·고지 노치·파이핑)."""
    ctx = gb.ctx
    m = 10
    n = 5
    for side in (+1.0, -1.0):
        grid = np.empty((m, n, 3), dtype=np.float64)
        for i in range(m):
            t = i / (m - 1)  # 0=단추 V끝, 1=어깨/목 칼라 접합부
            z = z_button + (z_top - z_button) * t
            # V-프런트 안쪽 개구선 → 바깥 라펠 엣지
            x_in = side * (0.012 + 0.052 * (t ** 0.85))
            # 노치드 / 피크드 라펠 폭 프로파일
            if peaked:
                w_prof = math.sin(t * math.pi * 0.90) * (1.0 + 0.32 * math.exp(-(((t - 0.68) / 0.14) ** 2)))
            else:
                # 노치 오목 홈 (t ~ 0.78)
                notch = 1.0 - 0.28 * math.exp(-(((t - 0.78) / 0.07) ** 2))
                w_prof = math.sin(min(1.0, t * 1.15) * math.pi * 0.82) * notch
            w_cur = max(0.010, lapel_width * w_prof)
            for j in range(n):
                u = j / (n - 1)  # 0=안쪽 V엣지, 1=바깥 라펠 끝
                x = x_in + side * w_cur * u
                # 해당 x, z의 전면 몸통 표면 Y 조회
                yc = ctx._torso_y_center(z)  # noqa: SLF001
                th = math.atan2(x, 0.11)
                _, y_surf, _ = ctx.sample_torso_radius(z, th)
                # 라펠은 본체 위에서 앞으로 3~5mm 접혀 떠 있는 입체감
                lift = base_ease + 0.0038 + 0.0035 * math.sin(u * math.pi * 0.85)
                y = y_surf - lift
                grid[i, j] = (x, y, z)
        gb.add_offset_panel(
            grid,
            thickness,
            outward_dir=np.array([0.0, -1.0, 0.0]),
            channel=channel,
            skin_zone="torso",
            part_tag="lapel",
            is_detail=True,
        )
        if piping_channel is not None:
            # 라펠 바깥선 + 앞여밈선 파이핑 튜브
            edge_pts = grid[:, -1] + np.array([0.0, -thickness - 0.0005, 0.0])
            gb.add_swept_tube(edge_pts, 0.0019, n_prof=6, channel=piping_channel, skin_zone="torso", part_tag="lapel_trim")


def add_necktie_or_ribbon(
    gb: GarmentBuilder,
    *,
    z_collar: float,
    z_tip: float,
    base_ease: float,
    style: str = "necktie",  # "necktie" | "ribbon"
    channel: str = "accent",
    trim_channel: str | None = None,
) -> None:
    """입체 3D 넥타이 (윈저 매듭 + 테이퍼 블레이드 + 타이바) 또는 학원 리본 보우."""
    ctx = gb.ctx
    _, y_top, _ = ctx.sample_torso_radius(z_collar, 0.0)
    y_knot = y_top - base_ease - 0.008

    if style == "ribbon":
        # 중앙 매듭
        gb.add_beveled_box((0.0, y_knot - 0.004, z_collar - 0.012), (0.018, 0.012, 0.016), bevel_width=0.003, channel=channel, skin_zone="torso", part_tag="ribbon")
        # 좌/우 리본 날개 + 아래로 늘어지는 제비꼬리 테일 2가닥
        for side in (+1.0, -1.0):
            wing = np.empty((4, 5, 3), dtype=np.float64)
            for i in range(4):
                v = (i / 3.0) - 0.5  # -0.5 .. +0.5
                for j in range(5):
                    u = j / 4.0
                    x = side * (0.007 + 0.048 * u)
                    h_w = 0.010 + 0.022 * (u ** 0.7)
                    z = (z_collar - 0.012) + v * h_w - 0.008 * (u ** 1.4)
                    y = y_knot - 0.006 * math.sin(u * math.pi) + 0.004 * u
                    wing[i, j] = (x, y, z)
            gb.add_offset_panel(wing, 0.0032, outward_dir=np.array([0.0, -1.0, 0.0]), channel=channel, skin_zone="torso", part_tag="ribbon")

            # 제비꼬리 테일
            tail = np.empty((6, 3, 3), dtype=np.float64)
            for i in range(6):
                t = i / 5.0
                z = (z_collar - 0.018) - t * 0.095
                _, ys, _ = ctx.sample_torso_radius(z, side * 0.14 * t)
                xc = side * (0.012 + 0.024 * t)
                w = 0.012 + 0.010 * t
                for j in range(3):
                    u = (j - 1.0)
                    tail[i, j] = (xc + u * w, ys - base_ease - 0.008 - 0.003 * t, z)
            gb.add_offset_panel(tail, 0.0024, outward_dir=np.array([0.0, -1.0, 0.0]), channel=channel, skin_zone="torso", part_tag="ribbon")
        return

    # 윈저 매듭 (역사다리꼴 베벨 블록)
    gb.add_beveled_box(
        (0.0, y_knot - 0.004, z_collar - 0.016),
        (0.026, 0.014, 0.024),
        rot_euler=(0.12, 0.0, 0.0),
        bevel_width=0.0035,
        channel=channel,
        skin_zone="torso",
        part_tag="tie_knot",
    )
    # 넥타이 블레이드
    m = 10
    grid = np.empty((m, 3, 3), dtype=np.float64)
    for i in range(m):
        t = i / (m - 1)  # 0=매듭 아래, 1=뾰족 끝
        z = (z_collar - 0.024) + (z_tip - (z_collar - 0.024)) * t
        _, ys, _ = ctx.sample_torso_radius(z, 0.0)
        if t < 0.85:
            hw = 0.011 + 0.016 * (t / 0.85)
        else:
            hw = 0.027 * max(0.08, 1.0 - (t - 0.85) / 0.15)
        for j in range(3):
            u = j - 1.0
            crest = -0.0022 if j == 1 else 0.0
            grid[i, j] = (u * hw, ys - base_ease - 0.0075 + crest, z)
    gb.add_offset_panel(grid, 0.0032, outward_dir=np.array([0.0, -1.0, 0.0]), channel=channel, skin_zone="torso", part_tag="tie")

    # 메탈 타이바 클립
    if trim_channel is not None:
        z_bar = z_collar - (z_collar - z_tip) * 0.56
        _, yb, _ = ctx.sample_torso_radius(z_bar, 0.0)
        gb.add_beveled_box((0.004, yb - base_ease - 0.0115, z_bar), (0.036, 0.004, 0.005), bevel_width=0.001, channel=trim_channel, skin_zone="torso", part_tag="tie_clip")


def add_trouser_legs_and_pelvis(
    gb: GarmentBuilder,
    *,
    z_waist: float,
    z_hem: float,
    waist_ease: float,
    hip_ease: float,
    thigh_ease: float,
    calf_ease: float,
    thickness: float = 0.0028,
    front_crease: float = 0.0,
    channel: str = "main",
    waistband_channel: str | None = "trim",
    waistband_h: float = 0.036,
    belt_loops: bool = True,
    belt_buckle_channel: str | None = None,
    cuff_turnup_h: float = 0.0,
    cuff_channel: str | None = None,
    baggy_gather_ankle: bool = False,
) -> None:
    """맞춤 바지/슬랙스/데님/반바지: 골반 요크 + 좌/우 독립 다리통(가랑이 중첩 밀봉) + 허리밴드 + 벨트 고리."""
    ctx = gb.ctx
    p = ctx.plan
    z_pelvis_bot = p.z_crotch - 0.015

    # 1) 골반/허리통 (z_pelvis_bot .. z_waist — 가랑이 하단까지 넉넉히 내려 빈틈 0 보장)
    z_pelvis_bot = p.z_crotch - 0.024
    z_p = np.linspace(z_pelvis_bot, z_waist, 9)
    pelv_in, pelv_c = build_torso_grid(
        ctx,
        z_p,
        32,
        lambda z, th: waist_ease + (hip_ease - waist_ease) * smoothstep_f(z_waist, p.z_hips, z),
        closed_u=True,
        hang_slope=0.0,
    )
    pelv_out = offset_grid_radial(pelv_in, pelv_c, thickness)
    gb.add_thick_shell(pelv_out, pelv_in, closed_u=True, channel=channel, skin_zone="torso", bevel_rim=True, part_tag="pelvis")

    # 2) 좌/우 독립 바지통 (z_hem .. z_hips + 12mm, 골반통 내측까지 자연스럽게 연결해 가랑이 틈 0!)
    z_leg_top = p.z_hips + 0.010
    n_rings = max(8, int(round((z_leg_top - z_hem) / 0.045)) + 2)
    z_legs = np.linspace(z_hem, z_leg_top, n_rings)
    n_seg = 24
    thetas = np.linspace(0.0, 2.0 * math.pi, n_seg, endpoint=False)

    for side, lab in ((+1, "Left"), (-1, "Right")):
        leg_in = np.empty((n_rings, n_seg, 3), dtype=np.float64)
        leg_out = np.empty((n_rings, n_seg, 3), dtype=np.float64)
        for i, z in enumerate(z_legs):
            t_up = (float(z) - z_hem) / max(z_leg_top - z_hem, 1e-5)
            # 골반~가랑이 상단은 hip_ease로 매끈하게 맞춤 → 허벅지 아래로 thigh_ease/calf_ease 전개
            ease_cur = calf_ease * (1.0 - t_up) + thigh_ease * t_up
            if float(z) > p.z_crotch - 0.03:
                t_hip = smoothstep_f(p.z_crotch - 0.03, z_leg_top, float(z))
                ease_cur = ease_cur * (1.0 - t_hip) + hip_ease * t_hip
            if baggy_gather_ankle:
                gather = smoothstep_f(p.z_ankle + 0.05, p.z_knee - 0.02, float(z))
                ease_cur = 0.008 + (ease_cur - 0.008) * gather
            axis = ctx.leg_axis_pt(side, float(z))
            ring = ctx.sample_leg_ring(
                side,
                float(z),
                n_seg,
                lambda th, ec=ease_cur: ec + (front_crease * math.exp(-((th if th <= math.pi else th - 2 * math.pi) / 0.18) ** 2)),
                clamp_midline=(float(z) < p.z_crotch - 0.018),
            )
            if float(z) > p.z_crotch + 0.004:
                t_in = smoothstep_f(p.z_crotch + 0.004, z_leg_top, float(z))
                ring[:, :2] = axis[:2] + (ring[:, :2] - axis[:2]) * (1.0 - 0.10 * t_in)
            rad = ring - axis[None, :]
            rad[:, 2] = 0.0
            rn = np.maximum(np.linalg.norm(rad, axis=1, keepdims=True), 1e-6)
            leg_in[i] = ring
            leg_out[i] = ring + (rad / rn) * thickness

        gb.add_thick_shell(leg_out, leg_in, closed_u=True, channel=channel, skin_zone=f"leg.{lab[0]}", bevel_rim=True, part_tag="leg")

        # 밑단 롤업 커프스 (와이드 데님 / 슬랙스 턴업)
        if cuff_turnup_h > 0.005:
            zc_arr = np.linspace(z_hem - 0.003, z_hem + cuff_turnup_h, 4)
            c_in = np.empty((4, n_seg, 3), dtype=np.float64)
            c_out = np.empty((4, n_seg, 3), dtype=np.float64)
            for i, z in enumerate(zc_arr):
                axis = ctx.leg_axis_pt(side, float(z))
                ring = ctx.sample_leg_ring(side, float(z), n_seg, calf_ease + thickness + 0.0012, clamp_midline=True)
                rad = ring - axis[None, :]
                rad[:, 2] = 0.0
                rn = np.maximum(np.linalg.norm(rad, axis=1, keepdims=True), 1e-6)
                c_in[i] = ring
                c_out[i] = ring + (rad / rn) * (thickness + 0.0022)
            gb.add_thick_shell(
                c_out,
                c_in,
                closed_u=True,
                channel=cuff_channel or channel,
                skin_zone=f"leg.{lab[0]}",
                bevel_rim=True,
                part_tag="cuff",
                is_detail=True,
            )

    # 3) 구조화된 허리밴드 + 5개 솔리드 벨트 고리 + 벨트 버클
    if waistband_channel is not None:
        z_wb = np.linspace(z_waist - waistband_h, z_waist + 0.004, 4)
        wb_in, wb_c = build_torso_grid(ctx, z_wb, 32, lambda z, th: waist_ease + thickness + 0.0012, closed_u=True)
        wb_out = offset_grid_radial(wb_in, wb_c, 0.0042)
        gb.add_thick_shell(wb_out, wb_in, closed_u=True, channel=waistband_channel, skin_zone="torso", bevel_rim=True, part_tag="waistband", is_detail=True)

        if belt_loops:
            z_mid = z_waist - waistband_h * 0.48
            for th in (0.45, 1.55, math.pi, -1.55, -0.45):
                x, y, _ = ctx.sample_torso_radius(z_mid, th)
                off = waist_ease + thickness + 0.0068
                dx, dy = math.sin(th), -math.cos(th)
                gb.add_beveled_box(
                    (x + dx * off, y + dy * off, z_mid),
                    (0.011, 0.0055, waistband_h * 1.15),
                    rot_euler=(0.0, 0.0, th),
                    bevel_width=0.0012,
                    channel=waistband_channel,
                    skin_zone="torso",
                    part_tag="belt_loop",
                )
        if belt_buckle_channel is not None:
            z_mid = z_waist - waistband_h * 0.48
            _, yf, _ = ctx.sample_torso_radius(z_mid, 0.0)
            y_b = yf - (waist_ease + thickness + 0.0075)
            # 버클 프레임 4면 (중앙이 뚫린 입체 직사각 버클!)
            bw, bh, bt = 0.042, waistband_h * 0.92, 0.0065
            gb.add_beveled_box((0.0, y_b, z_mid + bh * 0.42), (bw, bt, 0.006), bevel_width=0.0012, channel=belt_buckle_channel, skin_zone="torso", part_tag="buckle")
            gb.add_beveled_box((0.0, y_b, z_mid - bh * 0.42), (bw, bt, 0.006), bevel_width=0.0012, channel=belt_buckle_channel, skin_zone="torso", part_tag="buckle")
            gb.add_beveled_box((-bw * 0.44, y_b, z_mid), (0.006, bt, bh), bevel_width=0.0012, channel=belt_buckle_channel, skin_zone="torso", part_tag="buckle")
            gb.add_beveled_box((+bw * 0.44, y_b, z_mid), (0.006, bt, bh), bevel_width=0.0012, channel=belt_buckle_channel, skin_zone="torso", part_tag="buckle")
            gb.add_beveled_box((0.004, y_b - 0.0015, z_mid), (0.018, 0.004, 0.004), bevel_width=0.0008, channel=belt_buckle_channel, skin_zone="torso", part_tag="buckle")


def add_sculpted_footwear(
    gb: GarmentBuilder,
    *,
    shaft_height: float,
    sole_thick: float = 0.016,
    heel_height: float = 0.022,
    toe_upturn: float = 0.0,
    lugged_sole: bool = False,
    lace_rows: int = 0,
    penny_strap: bool = False,
    ankle_buckle: bool = False,
    top_cuff_band: bool = False,
    channel_upper: str = "main",
    channel_sole: str = "sole",
    channel_lace: str = "lace",
) -> None:
    """실측 발 바운드에 완벽 접지(`Z = 0.000`)되는 맞춤형 입체 신발/부츠/스니커즈/로퍼."""
    ctx = gb.ctx
    p = ctx.plan

    for side, lab, fbounds in ((+1, "Left", ctx.foot_bounds_l), (-1, "Right", ctx.foot_bounds_r)):
        fmin, fmax = fbounds
        cx = 0.5 * (float(fmin[0]) + float(fmax[0]))
        y_toe = float(fmin[1]) - 0.012  # 앞코 (-Y)
        y_heel = float(fmax[1]) + 0.010  # 뒤꿈치 (+Y)
        hw = 0.5 * (float(fmax[0]) - float(fmin[0])) + 0.0085
        foot_len = y_heel - y_toe
        z_instep = max(float(fmax[2]) * 0.62, p.z_ankle * 0.85)
        zone = f"foot.{lab[0]}"

        # 1) 아웃솔 + 굽 (바닥 Z = 0.000 엄수!)
        n_y = 14
        n_ang = 16
        # 아웃솔: 발바닥 Z=0.000에서 Z=sole_thick까지 폐곡면 타원 솔
        bm_sole = bmesh.new()
        sole_bot: list[bmesh.types.BMVert] = []
        sole_mid: list[bmesh.types.BMVert] = []
        sole_top: list[bmesh.types.BMVert] = []
        # 2D 신발 외곽 윤곽선(22점, 시계/반시계 폐곡선)
        n_out = 22
        contour_xy: list[tuple[float, float, float]] = []  # (x, y, t_front0_heel1)
        for k in range(n_out):
            ang = 2.0 * math.pi * (k / n_out)
            ct = math.cos(ang)  # +1 앞코, -1 뒤꿈치
            st = math.sin(ang)
            t_fh = 0.5 * (1.0 - ct)  # 0=앞코, 1=뒤꿈치
            # 발 앞볼은 넓고 아치는 잘록하며 뒤꿈치는 단단한 실제 구두 라스트 윤곽!
            width_mod = 0.92 + 0.16 * math.sin(t_fh * math.pi) - 0.12 * math.exp(-(((t_fh - 0.62) / 0.16) ** 2))
            if t_fh < 0.12:
                width_mod *= 0.80 + 0.20 * (t_fh / 0.12)
            x = cx + st * hw * width_mod
            y = y_toe + t_fh * foot_len
            contour_xy.append((x, y, t_fh))

        for x, y, t_fh in contour_xy:
            z_b = 0.0 + (toe_upturn * max(0.0, (0.22 - t_fh) / 0.22) ** 1.6 if toe_upturn > 0 else 0.0)
            # 굽 구간(t_fh > 0.66)은 heel_height, 앞발은 sole_thick
            h_cur = sole_thick + max(0.0, heel_height - sole_thick) * smoothstep_f(0.58, 0.72, t_fh)
            sole_bot.append(bm_sole.verts.new((x, y, z_b)))
            sole_mid.append(bm_sole.verts.new((cx + (x - cx) * 1.03, y, z_b + h_cur * 0.52)))
            sole_top.append(bm_sole.verts.new((x, y, z_b + h_cur)))

        for k in range(n_out):
            kn = (k + 1) % n_out
            bm_sole.faces.new((sole_bot[k], sole_bot[kn], sole_mid[kn], sole_mid[k]))
            bm_sole.faces.new((sole_mid[k], sole_mid[kn], sole_top[kn], sole_top[k]))
        c_bot = bm_sole.verts.new((cx, 0.5 * (y_toe + y_heel), 0.0))
        c_top = bm_sole.verts.new((cx, 0.5 * (y_toe + y_heel), sole_thick))
        for k in range(n_out):
            kn = (k + 1) % n_out
            bm_sole.faces.new((c_bot, sole_bot[kn], sole_bot[k]))
            bm_sole.faces.new((c_top, sole_top[k], sole_top[kn]))
        gb._finalize_bmesh_chunk(bm_sole, channel=channel_sole, skin_zone=zone, part_tag="sole")

        # 컴뱃 부츠/스니커즈 러그 트레드 돌기
        if lugged_sole:
            for ti in range(5):
                t_fh = 0.14 + ti * 0.17
                yl = y_toe + t_fh * foot_len
                gb.add_beveled_box(
                    (cx, yl, 0.0045),
                    (hw * 1.75, 0.015, 0.009),
                    bevel_width=0.0018,
                    channel=channel_sole,
                    skin_zone=zone,
                    rigid=False,
                    part_tag="sole_lug",
                )

        # 2) 발등 어퍼 돔 (앞코~발목, 폐곡면 솔리드)
        bm_up = bmesh.new()
        u_rings: list[list[bmesh.types.BMVert]] = []
        n_u_layers = 6
        for li in range(n_u_layers):
            lv = li / (n_u_layers - 1)  # 0=솔 상단, 1=발목 개구
            ring: list[bmesh.types.BMVert] = []
            for x, y, t_fh in contour_xy:
                h_sole = sole_thick + max(0.0, heel_height - sole_thick) * smoothstep_f(0.58, 0.72, t_fh)
                # 앞코는 낮게 둥글고 발목/뒤꿈치로 갈수록 발목 링에 수렴
                t_back = smoothstep_f(0.28, 0.76, t_fh)
                z_lo = h_sole - 0.002
                z_hi = z_lo + 0.022 + (z_instep - z_lo + 0.014) * t_back
                # 위층으로 갈수록 발목 중심(axis)으로 매끄럽게 수렴
                ax_ankle = ctx.leg_axis_pt(side, p.z_ankle)
                shrink = lv ** 1.35
                tx = x * (1.0 - shrink * 0.42) + float(ax_ankle[0]) * (shrink * 0.42)
                ty = y * (1.0 - shrink * (1.0 - t_back) * 0.78) + float(ax_ankle[1]) * (shrink * (1.0 - t_back) * 0.78)
                tz = z_lo + (z_hi - z_lo) * math.sin(lv * math.pi * 0.5)
                if lv > 0.85 and toe_upturn > 0:
                    tz += toe_upturn * 0.25 * (1.0 - t_fh)
                ring.append(bm_up.verts.new((tx, ty, tz)))
            u_rings.append(ring)

        for li in range(n_u_layers - 1):
            for k in range(n_out):
                kn = (k + 1) % n_out
                bm_up.faces.new((u_rings[li][k], u_rings[li][kn], u_rings[li + 1][kn], u_rings[li + 1][k]))
        c_u0 = bm_up.verts.new((cx, 0.5 * (y_toe + y_heel), sole_thick))
        c_u1 = bm_up.verts.new((float(ctx.leg_axis_pt(side, p.z_ankle)[0]), float(ctx.leg_axis_pt(side, p.z_ankle)[1]), z_instep + 0.008))
        for k in range(n_out):
            kn = (k + 1) % n_out
            bm_up.faces.new((c_u0, u_rings[0][kn], u_rings[0][k]))
            bm_up.faces.new((c_u1, u_rings[-1][k], u_rings[-1][kn]))
        gb._finalize_bmesh_chunk(bm_up, channel=channel_upper, skin_zone=zone, part_tag="shoe_upper")

        # 3) 발목/종아리 부츠 샤프트 (shaft_height > z_instep + 0.02일 때 폐곡면 두꺼운 튜브!)
        z_shaft_top = max(z_instep + 0.018, shaft_height)
        n_sh = max(5, int(round((z_shaft_top - z_instep) / 0.04)) + 2)
        z_sh_arr = np.linspace(z_instep - 0.012, z_shaft_top, n_sh)
        n_sseg = 20
        sh_in = np.empty((n_sh, n_sseg, 3), dtype=np.float64)
        sh_out = np.empty((n_sh, n_sseg, 3), dtype=np.float64)
        for i, z in enumerate(z_sh_arr):
            axis = ctx.leg_axis_pt(side, float(z))
            ease_b = 0.0065 + 0.0030 * (i / max(n_sh - 1, 1))
            ring = ctx.sample_leg_ring(side, float(z), n_sseg, ease_b, clamp_midline=True)
            rad = ring - axis[None, :]
            rad[:, 2] = 0.0
            rn = np.maximum(np.linalg.norm(rad, axis=1, keepdims=True), 1e-6)
            sh_in[i] = ring
            sh_out[i] = ring + (rad / rn) * 0.0035
        gb.add_thick_shell(sh_out, sh_in, closed_u=True, channel=channel_upper, skin_zone=zone, bevel_rim=True, part_tag="boot_shaft")

        # 4) 페니 로퍼 안장 스트랩
        if penny_strap:
            y_strap = y_toe + foot_len * 0.42
            gb.add_beveled_box(
                (cx, y_strap, z_instep * 0.68),
                (hw * 1.85, 0.028, 0.012),
                rot_euler=(0.35, 0.0, 0.0),
                bevel_width=0.002,
                channel=channel_upper,
                skin_zone=zone,
                rigid=False,
                part_tag="strap",
            )
            gb.add_beveled_box(
                (cx, y_strap - 0.004, z_instep * 0.72),
                (0.022, 0.008, 0.005),
                rot_euler=(0.35, 0.0, 0.0),
                bevel_width=0.001,
                channel=channel_lace,
                skin_zone=zone,
                rigid=False,
                part_tag="penny_bar",
            )

        # 5) 3D 교차 신발끈 (스니커즈·더비·레이스업 부츠·컴뱃 부츠)
        if lace_rows > 0:
            y_l0 = y_toe + foot_len * 0.34
            y_l1 = y_toe + foot_len * 0.56
            z_l0 = sole_thick + 0.036
            z_l1 = max(z_instep + 0.010, z_shaft_top - 0.022) if shaft_height > 0.14 else z_instep + 0.010
            for ri in range(lace_rows):
                t = ri / max(lace_rows - 1, 1)
                z_r = z_l0 + (z_l1 - z_l0) * t
                if z_r > z_instep + 0.015:
                    ax = ctx.leg_axis_pt(side, z_r)
                    ring_f = ctx.sample_leg_ring(side, z_r, 8, 0.0115)
                    y_r = float(ring_f[0, 1])
                    xw = hw * 0.48
                else:
                    y_r = y_l0 + (y_l1 - y_l0) * t - 0.006
                    xw = hw * (0.56 - 0.10 * t)
                p_l = np.array([cx - xw, y_r, z_r])
                p_m = np.array([cx, y_r - 0.0045, z_r + 0.002])
                p_r = np.array([cx + xw, y_r, z_r])
                gb.add_swept_tube(np.stack([p_l, p_m, p_r]), 0.0024, n_prof=6, channel=channel_lace, skin_zone=zone, part_tag="lace")

        # 6) 상단 커프 밴드 / 버클 스트랩 (컴뱃 부츠 · 무협 부츠)
        if top_cuff_band or ankle_buckle:
            z_b = z_shaft_top - 0.018
            zb_arr = np.linspace(z_b - 0.012, z_b + 0.012, 3)
            b_in = np.empty((3, n_sseg, 3), dtype=np.float64)
            b_out = np.empty((3, n_sseg, 3), dtype=np.float64)
            for i, z in enumerate(zb_arr):
                axis = ctx.leg_axis_pt(side, float(z))
                ring = ctx.sample_leg_ring(side, float(z), n_sseg, 0.0125, clamp_midline=True)
                rad = ring - axis[None, :]
                rad[:, 2] = 0.0
                rn = np.maximum(np.linalg.norm(rad, axis=1, keepdims=True), 1e-6)
                b_in[i] = ring
                b_out[i] = ring + (rad / rn) * 0.0038
            gb.add_thick_shell(b_out, b_in, closed_u=True, channel=channel_lace, skin_zone=zone, bevel_rim=True, part_tag="boot_band", is_detail=True)
            if ankle_buckle:
                ax = ctx.leg_axis_pt(side, z_b)
                r_side = ctx.sample_leg_ring(side, z_b, 8, 0.018)
                pt_out = r_side[2] if side > 0 else r_side[6]
                gb.add_beveled_box(pt_out, (0.007, 0.022, 0.024), bevel_width=0.0015, channel=channel_lace, skin_zone=zone, rigid=False, part_tag="boot_buckle")


# ---------------------------------------------------------------------------
# 스키닝 전사 · 간격 강제 · 85° 어깨 거상 관통 보정 · UV0 전개 · Quantized GLB 출력
# ---------------------------------------------------------------------------


def _transfer_weights_knn(
    query_pts_b: np.ndarray,
    ref_pts_b: np.ndarray,
    ref_weights_dense: np.ndarray,
    k: int = 6,
    sigma: float = 0.028,
) -> np.ndarray:
    """청크 단위 k-NN 가우시안 역거리 가중 스킨 전사 (N, 68)."""
    n = len(query_pts_b)
    n_ref = len(ref_pts_b)
    kk = min(k, n_ref)
    out = np.zeros((n, ref_weights_dense.shape[1]), dtype=np.float32)
    inv_2s2 = 1.0 / max(2.0 * sigma * sigma, 1e-8)
    chunk = 256
    for i in range(0, n, chunk):
        pts = query_pts_b[i : i + chunk]
        d2 = np.sum((pts[:, None, :] - ref_pts_b[None, :, :]) ** 2, axis=2)
        idx = np.argpartition(d2, kk - 1, axis=1)[:, :kk]
        d2_k = np.take_along_axis(d2, idx, axis=1)
        d2_min = d2_k.min(axis=1, keepdims=True)
        w = np.exp(-(d2_k - d2_min) * inv_2s2)
        w /= np.maximum(w.sum(axis=1, keepdims=True), 1e-12)
        out[i : i + chunk] = np.einsum("nk,nkb->nb", w, ref_weights_dense[idx])
    return out


def compute_chunk_skin_weights(ctx: BaseBodyContext, chunk: MeshChunk) -> tuple[np.ndarray, np.ndarray]:
    """영역 인식 스키닝 계산 (강체 하드웨어는 단일 앵커 웨이트로 형태 찌그러짐 방지)."""
    n = len(chunk.positions)
    j_count = len(bb2.SKELETON_JOINTS)
    J = bb2.JOINT_INDEX
    m = lambda s: f"{bb2.MIXAMO}{s}"
    zone = chunk.skin_zone
    pts = chunk.positions

    def _eval_pts(q: np.ndarray) -> np.ndarray:
        if zone == "head":
            w = np.zeros((len(q), j_count), dtype=np.float32)
            w[:, J[m("Head")]] = 1.0
            return w

        if zone == "cape":
            # 케이프는 Spine2 + 어깨(0.25)만 추종하고 UpperArm 영향 0 → 85° 팔 거상 시 등 관통/비틀림 0!
            p = ctx.plan
            w = np.zeros((len(q), j_count), dtype=np.float32)
            pz = q[:, 2]
            px = q[:, 0]
            t_hi = expr.smoothstep(p.z_chest - 0.04, p.z_shoulder + 0.02, pz)
            t_mid = expr.smoothstep(p.z_hips, p.z_waist + 0.05, pz)
            w_sp2 = t_hi
            w_sp1 = (1.0 - t_hi) * t_mid
            w_hip = (1.0 - t_hi) * (1.0 - t_mid)
            sh_l = expr.smoothstep(0.05, p.spec.shoulder_half_w * 0.95, px) * t_hi * 0.25
            sh_r = expr.smoothstep(0.05, p.spec.shoulder_half_w * 0.95, -px) * t_hi * 0.25
            w[:, J[m("Spine2")]] = np.maximum(0.0, w_sp2 - sh_l - sh_r)
            w[:, J[m("LeftShoulder")]] = sh_l
            w[:, J[m("RightShoulder")]] = sh_r
            w[:, J[m("Spine1")]] = w_sp1
            w[:, J[m("Hips")]] = w_hip
            return w

        if zone == "skirt":
            # 치마/코트 자락/도포 자락: 허리는 Hips, 아래로 내려갈수록 좌/우 허벅지·종아리로 부드럽게 분배
            p = ctx.plan
            w = np.zeros((len(q), j_count), dtype=np.float32)
            pz = q[:, 2]
            px = q[:, 0]
            t_leg = 1.0 - expr.smoothstep(p.z_crotch - 0.14, p.z_hips + 0.02, pz)
            t_knee = 1.0 - expr.smoothstep(p.z_knee - 0.08, p.z_knee + 0.08, pz)
            left_frac = expr.smoothstep(-0.055, +0.055, px)
            w[:, J[m("Hips")]] = 1.0 - t_leg * 0.85
            w[:, J[m("LeftUpLeg")]] = t_leg * 0.85 * left_frac * (1.0 - 0.55 * t_knee)
            w[:, J[m("RightUpLeg")]] = t_leg * 0.85 * (1.0 - left_frac) * (1.0 - 0.55 * t_knee)
            w[:, J[m("LeftLeg")]] = t_leg * 0.85 * left_frac * (0.55 * t_knee)
            w[:, J[m("RightLeg")]] = t_leg * 0.85 * (1.0 - left_frac) * (0.55 * t_knee)
            return w

        if zone == "waist_sash":
            # 허리띠/사시: Hips + Spine 중심
            p = ctx.plan
            w = np.zeros((len(q), j_count), dtype=np.float32)
            t_sp = expr.smoothstep(p.z_hips, p.z_waist + 0.04, q[:, 2])
            w[:, J[m("Spine")]] = t_sp
            w[:, J[m("Hips")]] = 1.0 - t_sp
            return w

        # 해부학 영역별 k-NN 전사 (몸통/팔/다리/발)
        pool = ctx.zone_body_indices.get(zone)
        if pool is None or len(pool) == 0:
            pool = np.arange(len(ctx.body_pos_b))
        w = _transfer_weights_knn(q, ctx.body_pos_b[pool], ctx.body_weights_dense[pool], k=8, sigma=0.032)
        return w

    if chunk.rigid_anchor is not None:
        w1 = _eval_pts(chunk.rigid_anchor.reshape(1, 3))
        w_full = np.repeat(w1, n, axis=0)
    else:
        w_full = _eval_pts(pts)
        # 메시 토폴로지 기준 4회 라플라시안 스무딩(웨이트 절벽 제거)
        tris = _polys_to_tris_simple(chunk.faces)
        if len(tris) > 0:
            ptr, nbr = skin.vertex_adjacency(tris, n)
            counts = np.diff(ptr)
            owner = np.repeat(np.arange(n), counts)
            safe = np.maximum(counts, 1)[:, None].astype(np.float32)
            for _ in range(4):
                acc = np.zeros_like(w_full)
                np.add.at(acc, owner, w_full[nbr])
                w_full = 0.65 * w_full + 0.35 * (acc / safe)

    return skin.top_influences(w_full, limit=4, cutoff=0.002)


def _polys_to_tris_simple(faces: list[tuple[int, ...]]) -> np.ndarray:
    tris: list[tuple[int, int, int]] = []
    for f in faces:
        if len(f) == 3:
            tris.append((f[0], f[1], f[2]))
        elif len(f) == 4:
            tris.append((f[0], f[1], f[2]))
            tris.append((f[0], f[2], f[3]))
        else:
            for k in range(1, len(f) - 1):
                tris.append((f[0], f[k], f[k + 1]))
    return np.array(tris, dtype=np.int64) if tris else np.zeros((0, 3), dtype=np.int64)


def signed_distance_to_bvh(points: np.ndarray, bvh: BVHTree, ref_normals: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """점 배열 `(N, 3)`의 BVH 표면 부호 거리(양수=바깥, 음수=관통)와 바깥 법선 `(N, 3)`."""
    n = len(points)
    sd = np.empty(n, dtype=np.float64)
    out_n = np.empty((n, 3), dtype=np.float64)
    _ = ref_normals
    for i in range(n):
        pt = Vector((float(points[i, 0]), float(points[i, 1]), float(points[i, 2])))
        loc, nrm, _, dist = bvh.find_nearest(pt)
        if loc is None or nrm is None:
            sd[i] = 1.0
            out_n[i] = (0.0, 0.0, 1.0)
            continue
        nv = nrm.normalized() if nrm.length > 1e-8 else Vector((0.0, 0.0, 1.0))
        diff = pt - loc
        sign = 1.0 if diff.dot(nv) >= 0.0 else -1.0
        sd[i] = sign * float(dist)
        out_n[i] = (float(nv.x), float(nv.y), float(nv.z))
    return sd, out_n


def underlayer_outer_clearance(
    points_b: np.ndarray,
    body_bvh: BVHTree,
    underlayer_bvh: BVHTree,
) -> tuple[np.ndarray, np.ndarray]:
    """하위 의상(폐곡면 두꺼운 셸) 외벽 기준 부호 거리(양수=하위 의상 바깥, 음수=하위 의상 안/관통)와 바깥 법선.

    `find_nearest`만 쓰면 두꺼운 셸의 내벽 법선이 안쪽을 향하는 함정이 있으므로,
    바디 바깥 법선 방향 `n_out`을 따라 **외부에서 안쪽으로 광선 투영**해 하위 의상의 최외곽 표면 높이를 정확히 잰다!
    """
    n = len(points_b)
    gap = np.full(n, 1.0, dtype=np.float64)
    out_dirs = np.empty((n, 3), dtype=np.float64)
    for i in range(n):
        pt = Vector((float(points_b[i, 0]), float(points_b[i, 1]), float(points_b[i, 2])))
        loc_b, nrm_b, _, _ = body_bvh.find_nearest(pt)
        if loc_b is None or nrm_b is None:
            out_dirs[i] = (0.0, -1.0, 0.0)
            continue
        nv = (pt - loc_b)
        if nv.length > 1e-6:
            nv = nv.normalized()
        else:
            nv = nrm_b.normalized() if nrm_b.length > 1e-6 else Vector((0.0, -1.0, 0.0))
        if nv.dot(nrm_b) < 0.0:
            nv = nrm_b.normalized()
        out_dirs[i] = (float(nv.x), float(nv.y), float(nv.z))

        # 바깥쪽 18cm 지점에서 몸 쪽(-nv)으로 광선을 쏘아 하위 의상의 최외곽(outer wall) 교점을 찾는다!
        ray_orig = pt + nv * 0.18
        hit, _, _, dist_from_far = underlayer_bvh.ray_cast(ray_orig, -nv, 0.24)
        if hit is not None:
            # dist_from_far < 0.18 이면 하위 의상 외벽이 pt보다 바깥에 있음 → 관통(음수)!
            # dist_from_far > 0.18 이면 pt가 하위 의상 외벽 바깥에 있음 → 여유(양수)!
            gap[i] = float(dist_from_far - 0.18)
    return gap, out_dirs


def _zone_signed_distance(ctx: BaseBodyContext, pos_b: np.ndarray, zones: list[str] | None) -> tuple[np.ndarray, np.ndarray]:
    """각 정점의 소속 영역에 맞는 바디 BVH 부호 거리 (`leg.L`/`leg.R`은 반대쪽 허벅지 자가접촉 간섭을 제외)."""
    if zones is None:
        return signed_distance_to_bvh(pos_b, ctx.body_bvh)
    z_arr = np.array(zones)
    sd = np.empty(len(pos_b), dtype=np.float64)
    out_n = np.empty((len(pos_b), 3), dtype=np.float64)
    leg_l = z_arr == "leg.L"
    leg_r = z_arr == "leg.R"
    other = ~(leg_l | leg_r)
    if leg_l.any():
        sd[leg_l], out_n[leg_l] = signed_distance_to_bvh(pos_b[leg_l], ctx.leg_l_bvh)
    if leg_r.any():
        sd[leg_r], out_n[leg_r] = signed_distance_to_bvh(pos_b[leg_r], ctx.leg_r_bvh)
    if other.any():
        sd[other], out_n[other] = signed_distance_to_bvh(pos_b[other], ctx.body_bvh)
    return sd, out_n


def enforce_clearance_and_85_pose(
    ctx: BaseBodyContext,
    positions_b: np.ndarray,
    tris: np.ndarray,
    joints: np.ndarray,
    weights: np.ndarray,
    *,
    min_body_clearance_m: float,
    is_shoes: bool = False,
    underlayer_bvh_b: BVHTree | None = None,
    min_underlayer_gap_m: float = 0.0016,
    check_85_shoulder: bool = True,
    zones: list[str] | None = None,
) -> tuple[np.ndarray, dict[str, Any]]:
    """레스트 바디 간격 + 하위 의상 최외곽 층 간격 + 85° 어깨 거상 / 45° A-포즈 비관통 보정 및 계측."""
    pos_b = positions_b.copy()
    z_floor_lock = is_shoes

    # 1) 레스트 T-포즈 바디 간격 보정 (최대 5회, 소속 영역 바디 바깥 법선 방향으로만 전진)
    for _ in range(5):
        sd, out_n = _zone_signed_distance(ctx, pos_b, zones)
        check_mask = (pos_b[:, 2] >= 0.014) if is_shoes else np.ones(len(pos_b), dtype=bool)
        need = check_mask & (sd < min_body_clearance_m)
        if not need.any():
            break
        push = (min_body_clearance_m + 0.0006 - sd[need])[:, None] * out_n[need]
        pos_b[need] += push
        if z_floor_lock:
            pos_b[:, 2] = np.maximum(pos_b[:, 2], 0.0)

    # 2) 하위 레이어(예: 아우터 위 이너) 최외곽 표면 기준 바깥 방향 보정 (내벽 반전 원천 방지!)
    underlayer_min_mm: float | None = None
    if underlayer_bvh_b is not None:
        for _ in range(4):
            gap_u, out_nu = underlayer_outer_clearance(pos_b, ctx.body_bvh, underlayer_bvh_b)
            need_u = gap_u < min_underlayer_gap_m
            if not need_u.any():
                break
            push_u = np.clip(min_underlayer_gap_m + 0.0008 - gap_u[need_u], 0.0005, 0.025)[:, None] * out_nu[need_u]
            pos_b[need_u] += push_u
        gap_u_fin, _ = underlayer_outer_clearance(pos_b, ctx.body_bvh, underlayer_bvh_b)
        underlayer_min_mm = round(float(gap_u_fin.min() * 1000.0), 3)

    # 3) 85° 어깨 거상 & 45° A-포즈 LBS 관통 검증 및 자동 보정 (최대 6회)
    m = lambda s: f"{bb2.MIXAMO}{s}"
    poses_to_check: dict[str, dict[str, tuple[float, float, float]]] = {}
    if check_85_shoulder:
        poses_to_check = {
            "a_pose_45": {
                m("LeftShoulder"): (0, 0, -8.0),
                m("LeftArm"): (0, 0, -45.0),
                m("RightShoulder"): (0, 0, +8.0),
                m("RightArm"): (0, 0, +45.0),
            },
            "raise_85_deg": {
                m("LeftShoulder"): (0, 0, +21.25),
                m("LeftArm"): (0, 0, +63.75),
                m("RightShoulder"): (0, 0, -21.25),
                m("RightArm"): (0, 0, -63.75),
            },
        }

    if poses_to_check:
        for _iter in range(6):
            any_pen = False
            for pname, pdict in poses_to_check.items():
                smats, _ = qa.eval_skin_matrices(ctx.reader, pdict)
                _, _, pbvh = ctx.posed_body(pname, pdict)
                posed_g = qa.apply_lbs(b2g(pos_b), joints, weights, smats)
                sd_p, _ = signed_distance_to_bvh(posed_g, pbvh)
                pen = sd_p < 0.0005
                if pen.any():
                    any_pen = True
                    _, rest_out_n = signed_distance_to_bvh(pos_b[pen], ctx.body_bvh)
                    delta = np.clip(0.0016 - sd_p[pen], 0.0006, 0.015)[:, None] * rest_out_n
                    pos_b[pen] += delta
            if not any_pen:
                break

    # 4) 미세 퇴화 삼각형(zero_area <= 1e-10) 방지 가드
    if len(tris) > 0:
        a, b, c = pos_b[tris[:, 0]], pos_b[tris[:, 1]], pos_b[tris[:, 2]]
        areas = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
        deg_tris = np.flatnonzero(areas <= 2e-10)
        for ti in deg_tris:
            v0, v1, v2 = tris[ti]
            pos_b[v2] += np.array([0.0004, 0.0003, 0.0005])

    # 최종 수치 실측 리포트
    sd_rest, _ = _zone_signed_distance(ctx, pos_b, zones)
    if is_shoes:
        mask_rest = pos_b[:, 2] >= 0.014
        rest_min_mm = float(sd_rest[mask_rest].min() * 1000.0) if mask_rest.any() else 0.0
    else:
        rest_min_mm = float(sd_rest.min() * 1000.0)
    if underlayer_bvh_b is not None:
        gap_u_fin, _ = underlayer_outer_clearance(pos_b, ctx.body_bvh, underlayer_bvh_b)
        underlayer_min_mm = round(float(gap_u_fin.min() * 1000.0), 3)

    pose_report: dict[str, Any] = {}
    for pname, pdict in poses_to_check.items():
        smats, _ = qa.eval_skin_matrices(ctx.reader, pdict)
        _, _, pbvh = ctx.posed_body(pname, pdict)
        posed_g = qa.apply_lbs(b2g(pos_b), joints, weights, smats)
        sd_p, _ = signed_distance_to_bvh(posed_g, pbvh)
        pose_report[pname] = {
            "minSignedDistMm": round(float(sd_p.min() * 1000.0), 3),
            "penetratingVerts": int((sd_p < 0.0).sum()),
        }

    metrics = {
        "restMinClearanceMm": round(rest_min_mm, 3),
        "underlayerMinGapMm": underlayer_min_mm,
        "poses": pose_report,
    }
    return pos_b, metrics


# ---------------------------------------------------------------------------
# UV0 비중첩 전개 (마진 >= 0.015, [0.004, 0.996]) + UV1 cm 밀도 검증
# ---------------------------------------------------------------------------


def unwrap_uv0_clean_mixed(
    positions_b: np.ndarray,
    faces: list[tuple[int, ...]],
    margin: float = 0.018,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """쿼드/삼각 혼합 메쉬를 Blender 5.3 `smart_project`로 비중첩 UV0 전개하고 정점을 분할한다.

    반환: `(origin_vert_idx (V2,), uv0 (V2,2), triangles (T,3), overlap_ratio)`.
    """
    mesh = bpy.data.meshes.new("_ts_garment_uv0")
    mesh.from_pydata(positions_b.astype(np.float32).tolist(), [], [list(f) for f in faces])
    mesh.update()
    obj = bpy.data.objects.new("_ts_garment_uv0", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        # 아일랜드 간격 >= 0.020으로 비중첩 전개
        bpy.ops.uv.smart_project(
            angle_limit=math.radians(54.0),
            island_margin=max(margin, 0.020),
            area_weight=0.0,
            correct_aspect=True,
            scale_to_bounds=True,
        )
        bpy.ops.object.mode_set(mode="OBJECT")
        uv_layer = mesh.uv_layers.active
        # 루프별 (orig_v, uv)를 수집하면서 폴리곤을 삼각형화
        tri_orig_v: list[int] = []
        tri_uv: list[tuple[float, float]] = []
        for poly in mesh.polygons:
            ls = poly.loop_start
            lt = poly.loop_total
            v_ids = [mesh.loops[ls + k].vertex_index for k in range(lt)]
            uvs = [tuple(uv_layer.data[ls + k].uv) for k in range(lt)]
            for k in range(1, lt - 1):
                for idx_c in (0, k, k + 1):
                    tri_orig_v.append(v_ids[idx_c])
                    tri_uv.append(uvs[idx_c])
    finally:
        if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        bpy.data.objects.remove(obj)
        bpy.data.meshes.remove(mesh)

    orig_flat = np.array(tri_orig_v, dtype=np.int64)
    uv_flat = np.array(tri_uv, dtype=np.float64)
    # glTF UV v-축 규약 + 안전한 [0.015, 0.985] 보더 마진 확보
    uv_flat[:, 1] = 1.0 - uv_flat[:, 1]
    u_lo, u_hi = float(uv_flat[:, 0].min()), float(uv_flat[:, 0].max())
    v_lo, v_hi = float(uv_flat[:, 1].min()), float(uv_flat[:, 1].max())
    span = max(u_hi - u_lo, v_hi - v_lo, 1e-6)
    uv_flat[:, 0] = 0.018 + (uv_flat[:, 0] - u_lo) / span * 0.964
    uv_flat[:, 1] = 0.018 + (uv_flat[:, 1] - v_lo) / span * 0.964
    uv_flat = np.clip(uv_flat, 0.015, 0.985)

    # (orig_v, rounded_uv) 키로 정점 분할
    key = np.concatenate([orig_flat[:, None].astype(np.float64), np.round(uv_flat * 1e5)], axis=1)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    origin_v = orig_flat[first]
    uv_out = uv_flat[first].astype(np.float32)
    tris = inv.reshape(-1, 3).astype(np.int64)
    ov, _, _ = uvtools.overlap_ratio(uv_out, tris, 512)
    return origin_v, uv_out, tris, float(ov)


def measure_uv1_cm_density(positions_g: np.ndarray, uv1: np.ndarray, tris: np.ndarray) -> dict[str, float]:
    """UV1 패턴 밀도(실제 cm / UV1 unit)의 중앙값과 균일도를 계측한다."""
    if len(tris) == 0:
        return {"medianCmPerUnit": UV1_CM_PER_UNIT, "p10CmPerUnit": UV1_CM_PER_UNIT, "p90CmPerUnit": UV1_CM_PER_UNIT}
    a, b, c = positions_g[tris[:, 0]], positions_g[tris[:, 1]], positions_g[tris[:, 2]]
    area_3d = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    ua, ub, uc = uv1[tris[:, 0]], uv1[tris[:, 1]], uv1[tris[:, 2]]
    area_uv = 0.5 * np.abs((ub[:, 0] - ua[:, 0]) * (uc[:, 1] - ua[:, 1]) - (ub[:, 1] - ua[:, 1]) * (uc[:, 0] - ua[:, 0]))
    valid = (area_3d > 1e-8) & (area_uv > 1e-8)
    if not valid.any():
        return {"medianCmPerUnit": UV1_CM_PER_UNIT, "p10CmPerUnit": UV1_CM_PER_UNIT, "p90CmPerUnit": UV1_CM_PER_UNIT}
    # sqrt(area_3d / area_uv) = m / UV1 unit → * 100 = cm / UV1 unit
    cm_per_unit = np.sqrt(area_3d[valid] / area_uv[valid]) * 100.0
    return {
        "medianCmPerUnit": round(float(np.median(cm_per_unit)), 2),
        "p10CmPerUnit": round(float(np.quantile(cm_per_unit, 0.10)), 2),
        "p90CmPerUnit": round(float(np.quantile(cm_per_unit, 0.90)), 2),
    }


# ---------------------------------------------------------------------------
# TEXCOORD_1 지원 QuantizedGlbWriterV2 (KHR_mesh_quantization 단독)
# ---------------------------------------------------------------------------


@dataclass
class GarmentPrimitive(glbwriter.Primitive):
    uv1s: np.ndarray | None = None  # (N, 2) float32 metric pattern UV1


class GarmentGlbWriterV2(expr.QuantizedGlbWriterV2):
    """`TEXCOORD_1` + `KHR_mesh_quantization` + raw SHORT morph 바운드 지원 GLB 작성기."""

    def add_garment_mesh_node(self, name: str, primitives: list[GarmentPrimitive], skinned: bool = True, extras: dict[str, Any] | None = None) -> int:
        if not primitives:
            raise ValueError("프리미티브가 없습니다.")
        target_names = [t.name for t in primitives[0].targets]
        mesh_prims: list[dict[str, Any]] = []
        for prim in primitives:
            if [t.name for t in prim.targets] != target_names:
                raise ValueError(f"{name}: 프리미티브 사이 morph 타깃 순서 불일치")
            count = int(prim.positions.shape[0])
            attrs: dict[str, int] = {}
            attrs["POSITION"] = self.add_accessor(np.ascontiguousarray(prim.positions, dtype=np.float32), target=34962, with_bounds=True)
            if prim.normals is not None:
                attrs["NORMAL"] = self.add_accessor(np.ascontiguousarray(prim.normals, dtype=np.float32), target=34962)
            if prim.uvs is not None:
                attrs["TEXCOORD_0"] = self.add_accessor(np.ascontiguousarray(prim.uvs, dtype=np.float32), target=34962)
            if prim.uv1s is not None:
                attrs["TEXCOORD_1"] = self.add_accessor(np.ascontiguousarray(prim.uv1s, dtype=np.float32), target=34962)
            if prim.color0 is not None:
                attrs["COLOR_0"] = self.add_accessor(np.ascontiguousarray(prim.color0, dtype=np.float32), target=34962)
            if skinned:
                joints = np.ascontiguousarray(prim.joints)
                if joints.dtype not in (np.uint8, np.uint16):
                    joints = joints.astype(np.uint8)
                attrs["JOINTS_0"] = self.add_accessor(joints, target=34962)
                attrs["WEIGHTS_0"] = self.add_accessor(np.ascontiguousarray(prim.weights, dtype=np.float32), target=34962)
            flat_idx = np.asarray(prim.indices).reshape(-1)
            idx_dtype = np.uint16 if count <= 0xFFFF else np.uint32
            idx_acc = self.add_accessor(flat_idx.astype(idx_dtype), target=34963)
            mp: dict[str, Any] = {"attributes": attrs, "indices": idx_acc, "mode": 4}
            if prim.material is not None:
                mp["material"] = prim.material
            if prim.targets:
                mp["targets"] = [
                    {"POSITION": self.add_morph_accessor(t.position)}
                    if t.normal is None
                    else {"POSITION": self.add_morph_accessor(t.position), "NORMAL": self.add_morph_accessor(t.normal)}
                    for t in prim.targets
                ]
            mesh_prims.append(mp)

        mesh_d: dict[str, Any] = {"name": name, "primitives": mesh_prims}
        mesh_extras: dict[str, Any] = {}
        if target_names:
            mesh_extras["targetNames"] = target_names
        if extras:
            mesh_extras.update(extras)
        if mesh_extras:
            mesh_d["extras"] = mesh_extras

        meshes = self._list("meshes")
        meshes.append(mesh_d)
        nodes = self._list("nodes")
        node_d: dict[str, Any] = {"name": name, "mesh": len(meshes) - 1}
        if skinned:
            if self._skin is None:
                raise RuntimeError("add_skeleton()을 먼저 호출해야 합니다.")
            node_d["skin"] = self._skin
        nodes.append(node_d)
        self._scene_nodes.append(len(nodes) - 1)
        return len(nodes) - 1


# ---------------------------------------------------------------------------
# 파츠별 형태 Morph (`shape:*:±`) 생성기
# ---------------------------------------------------------------------------


def eval_shape_morph_delta_b(
    shape_name: str,
    pos_b: np.ndarray,
    part_tags: list[str],
    ctx: BaseBodyContext,
) -> np.ndarray:
    """파츠 형태 슬라이더 (`shape:<name>:+`) 변위 (Blender 좌표, m). `-`는 부호 반전."""
    p = ctx.plan
    n = len(pos_b)
    d = np.zeros((n, 3), dtype=np.float64)
    px, py, pz = pos_b[:, 0], pos_b[:, 1], pos_b[:, 2]
    tags = np.array(part_tags)

    if shape_name in ("skirt-length", "hem-length"):
        # 하단(허리/가슴 아래)을 아래로 부드럽게 연장 (+ = 더 길게, - = 더 짧게)
        z_hi = p.z_waist if pz.min() < p.z_hips else p.z_chest
        z_lo = float(pz.min())
        w = 1.0 - expr.smoothstep(z_lo, z_hi, pz)
        d[:, 2] = -0.055 * w

    elif shape_name == "blazer-open":
        # 앞여밈 좌/우 벌어짐 (+ = 더 넓게 열림)
        front = expr.smoothstep(0.02, -0.04, py)
        below_neck = 1.0 - expr.smoothstep(p.z_chest, p.z_shoulder + 0.02, pz)
        side = np.where(px >= 0.0, 1.0, -1.0)
        d[:, 0] = side * 0.022 * front * below_neck
        d[:, 1] = -0.008 * front * below_neck

    elif shape_name == "sleeve-roll":
        # 소매 끝단 길이를 팔꿈치 쪽으로 롤업 (+ = 짧게 걷음)
        sh_x = p.spec.shoulder_half_w
        ax = np.abs(px)
        w_arm = expr.smoothstep(sh_x + 0.08, sh_x + 0.36, ax)
        side = np.where(px >= 0.0, 1.0, -1.0)
        d[:, 0] = -side * 0.065 * w_arm

    elif shape_name in ("coat-flare", "skirt-volume", "pleat-flare", "robe-flow", "cape-billow"):
        # 하단 실루엣이 우아하게 퍼지는 플레어/볼륨 확장
        z_hi = p.z_hips if shape_name in ("skirt-volume", "pleat-flare") else p.z_waist
        z_lo = float(pz.min())
        w = (1.0 - expr.smoothstep(z_lo, z_hi, pz)) ** 1.25
        rad_xy = np.stack([px, py - 0.01], axis=1)
        rn = np.maximum(np.linalg.norm(rad_xy, axis=1, keepdims=True), 1e-4)
        amp = 0.075 if shape_name in ("skirt-volume", "cape-billow", "robe-flow") else 0.045
        d[:, :2] = (rad_xy / rn) * (amp * w[:, None])
        if shape_name in ("cape-billow", "robe-flow"):
            d[:, 1] += 0.035 * w  # 뒤로 흩날림

    elif shape_name == "collar-up":
        # 칼라 높이 상향
        is_col = (tags == "collar") | (tags == "collar_trim") | (pz > p.z_neck_base - 0.02)
        w = is_col.astype(np.float64) * expr.smoothstep(p.z_shoulder, p.z_neck_base + 0.03, pz)
        d[:, 2] = 0.022 * w

    elif shape_name == "collar-open":
        # 셔츠/도복 앞깃 열림
        front = expr.smoothstep(0.01, -0.04, py)
        neck_z = expr.smoothstep(p.z_chest, p.z_neck_base + 0.02, pz)
        side = np.where(px >= 0.0, 1.0, -1.0)
        d[:, 0] = side * 0.012 * front * neck_z
        d[:, 2] = -0.010 * front * neck_z

    elif shape_name == "leg-width":
        # 바지통 폭 확장
        below_hip = 1.0 - expr.smoothstep(p.z_crotch - 0.08, p.z_hips + 0.02, pz)
        for s_val in (+1, -1):
            sel = (px >= 0.0) if s_val > 0 else (px < 0.0)
            if not sel.any():
                continue
            cx = float(ctx.joint_b(f"{bb2.MIXAMO}{'Left' if s_val > 0 else 'Right'}UpLeg")[0])
            rv = np.stack([px[sel] - cx, py[sel]], axis=1)
            rn = np.maximum(np.linalg.norm(rv, axis=1, keepdims=True), 1e-4)
            d[sel, :2] = (rv / rn) * (0.024 * below_hip[sel, None])

    elif shape_name == "puff-volume":
        # 로판 퍼프 소매 볼륨
        sh_x = p.spec.shoulder_half_w
        ax = np.abs(px)
        w = expr.smoothstep(sh_x * 0.85, sh_x + 0.04, ax) * (1.0 - expr.smoothstep(sh_x + 0.14, sh_x + 0.24, ax))
        rad_yz = np.stack([py - 0.008, pz - p.z_shoulder], axis=1)
        rn = np.maximum(np.linalg.norm(rad_yz, axis=1, keepdims=True), 1e-4)
        d[:, 1:] = (rad_yz / rn) * (0.026 * w[:, None])

    elif shape_name in ("shoulder-pad", "waist-cinch", "hip-ease", "rig-tightness", "sash-flow", "sock-height", "heel-height", "sole-height", "crown-height"):
        if shape_name == "shoulder-pad":
            w = expr.smoothstep(p.z_chest, p.z_shoulder + 0.03, pz) * expr.smoothstep(p.spec.neck_rx * 1.2, p.spec.shoulder_half_w * 0.95, np.abs(px))
            d[:, 2] = 0.014 * w
            d[:, 0] = np.sign(px) * 0.012 * w
        elif shape_name == "waist-cinch":
            w = np.exp(-(((pz - p.z_waist) / 0.06) ** 2))
            d[:, 0] = -px * 0.08 * w
            d[:, 1] = -(py - 0.01) * 0.08 * w
        elif shape_name == "hip-ease":
            w = np.exp(-(((pz - p.z_hips) / 0.08) ** 2))
            d[:, 0] = px * 0.10 * w
            d[:, 1] = (py - 0.01) * 0.10 * w
        elif shape_name == "rig-tightness":
            d[:, 1] = np.sign(py - 0.01) * 0.006
        elif shape_name == "sash-flow":
            w = 1.0 - expr.smoothstep(float(pz.min()), p.z_hips, pz)
            d[:, 0] = 0.028 * w
            d[:, 1] = -0.020 * w
        elif shape_name == "sock-height":
            w = expr.smoothstep(p.z_ankle + 0.05, float(pz.max()), pz)
            d[:, 2] = 0.045 * w
        elif shape_name in ("heel-height", "sole-height"):
            w = expr.smoothstep(0.006, 0.04, pz)
            d[:, 2] = 0.010 * w
        elif shape_name == "crown-height":
            w = expr.smoothstep(float(pz.min()), float(pz.max()), pz)
            d[:, 2] = 0.018 * w

    return expr.clamp_delta_magnitude(d, 0.12)


# ---------------------------------------------------------------------------
# 단일 의상 파츠 어셈블리 + GLB 익스포트 + 자동 QA 게이트
# ---------------------------------------------------------------------------


@dataclass
class GarmentExportResult:
    preset_id: str
    genre: str
    slot: str
    layer: str | None
    node_name: str
    target_base: str
    glb_path: Path
    bytes: int
    sha256: str
    materials: list[dict[str, Any]]
    hides: list[str]
    shapes: list[str]
    triangles: int
    vertices: int
    uv0_overlap: float
    uv1_density: dict[str, float]
    clearance: dict[str, Any]
    bmesh_audit: dict[str, Any]
    gltf_validator: dict[str, Any]
    passed: bool
    errors: list[str]
    # 하위 레이어 검사용 최종 메시 BVH (Blender 좌표)
    final_bvh_b: BVHTree | None = None


def assemble_and_export_garment(
    *,
    ctx: BaseBodyContext,
    gb: GarmentBuilder,
    preset_id: str,
    genre: str,
    slot: str,
    layer: str | None,
    channel_specs: list[ChannelMaterialSpec],
    hides: list[str],
    shape_names: list[str],
    textures_bank: dict[str, bytes],
    out_path: Path,
    min_body_clearance_m: float = 0.0018,
    underlayer_bvh_b: BVHTree | None = None,
    min_underlayer_gap_m: float = 0.0012,
    check_85_shoulder: bool = True,
    is_shoes: bool = False,
) -> GarmentExportResult:
    """GarmentBuilder 청크들을 채널별 프리미티브로 통합·검증·양자화 GLB 출력 및 풀 QA 실행."""
    part_slug = preset_id.split("/", 1)[1]
    prefix_map = {
        "top": "TS_Top",
        "inner": "TS_Inner",
        "outer": "TS_Outer",
        "bottom": "TS_Bottom",
        "legwear": "TS_Legwear",
        "shoes": "TS_Shoes",
        "accessory": "TS_Accessory",
    }
    role_key = layer if layer is not None else slot
    node_name = f"{prefix_map[role_key]}_{part_slug}"

    spec_by_ch = {s.channel_key: s for s in channel_specs}

    # 1) 모든 청크의 스킨 웨이트 계산 후 합쳐서 간격·85° 관통 일괄 보정
    all_pos_b: list[np.ndarray] = []
    all_joints: list[np.ndarray] = []
    all_weights: list[np.ndarray] = []
    all_uv1: list[np.ndarray] = []
    all_tags: list[str] = []
    all_zones: list[str] = []
    all_ch_of_chunk: list[str] = []
    chunk_slices: list[tuple[int, int, MeshChunk]] = []
    v_cursor = 0
    all_tris_local: list[np.ndarray] = []

    for ch in gb.chunks:
        j_c, w_c = compute_chunk_skin_weights(ctx, ch)
        nv = len(ch.positions)
        all_pos_b.append(ch.positions)
        all_joints.append(j_c)
        all_weights.append(w_c)
        all_uv1.append(ch.uv1)
        all_tags.extend([ch.part_tag] * nv)
        all_zones.extend([ch.skin_zone] * nv)
        all_ch_of_chunk.append(ch.channel)
        chunk_slices.append((v_cursor, v_cursor + nv, ch))
        t_c = _polys_to_tris_simple(ch.faces)
        if len(t_c):
            all_tris_local.append(t_c + v_cursor)
        v_cursor += nv

    merged_pos_b = np.concatenate(all_pos_b, axis=0)
    merged_joints = np.concatenate(all_joints, axis=0)
    merged_weights = np.concatenate(all_weights, axis=0)
    merged_uv1 = np.concatenate(all_uv1, axis=0)
    merged_tris = np.concatenate(all_tris_local, axis=0)

    # 레스트 간격 + 하위 레이어 간격 + 85° 어깨 거상 비관통 보정
    refined_pos_b, clearance_metrics = enforce_clearance_and_85_pose(
        ctx,
        merged_pos_b,
        merged_tris,
        merged_joints,
        merged_weights,
        min_body_clearance_m=min_body_clearance_m,
        is_shoes=is_shoes,
        underlayer_bvh_b=underlayer_bvh_b,
        min_underlayer_gap_m=min_underlayer_gap_m,
        check_85_shoulder=check_85_shoulder,
        zones=all_zones,
    )
    if is_shoes:
        # 신발 발바닥 정확히 Z = 0.000 접지 보정
        z_min_shoe = float(refined_pos_b[:, 2].min())
        if abs(z_min_shoe) > 1e-5:
            refined_pos_b[:, 2] -= z_min_shoe

    # 하위 레이어 BVH 반환용 (다음 outer 레이어 검증에 사용)
    final_bvh_b = BVHTree.FromPolygons(refined_pos_b.tolist(), merged_tris.tolist())

    # 2) 채널별 프리미티브 조립 (UV0 비중첩 전개 + UV1 보존 + 18 체형 morph + shape:* morph)
    writer = GarmentGlbWriterV2(generator=f"toonstudio character_kit v2 garment ({preset_id})")
    writer.add_skeleton(bb2.SKELETON_JOINTS, bb2.SKELETON_PARENTS, ctx.joints_g, root_name="Armature")

    mat_indices: dict[str, int] = {}
    used_tex_indices: dict[str, int] = {}
    mat_meta_list: list[dict[str, Any]] = []
    for mspec in channel_specs:
        if mspec.fabric_kind not in used_tex_indices:
            used_tex_indices[mspec.fabric_kind] = writer.add_texture(
                textures_bank[mspec.fabric_kind], "image/jpeg", name=f"ts_tex_{mspec.fabric_kind}"
            )
        mat_indices[mspec.channel_key] = writer.add_material(
            mspec.material_name,
            base_color_texture=used_tex_indices[mspec.fabric_kind],
            base_color_factor=srgb_hex_to_linear_rgba(mspec.default_hex),
            double_sided=False,
            metallic=mspec.metallic,
            roughness=mspec.roughness,
            extras={"channel": mspec.v2_channel, "fabricKind": mspec.fabric_kind, "defaultHex": mspec.default_hex},
        )
        mat_meta_list.append(
            {
                "name": mspec.material_name,
                "role": role_key,
                "channel": mspec.v2_channel,
                "defaultHex": mspec.default_hex,
                "metallic": mspec.metallic,
                "roughness": mspec.roughness,
            }
        )

    primitives: list[GarmentPrimitive] = []
    total_tris = 0
    total_verts = 0
    worst_uv0_ov = 0.0
    all_uv1_pos: list[np.ndarray] = []
    all_uv1_vals: list[np.ndarray] = []
    all_uv1_tris: list[np.ndarray] = []
    uv1_v_off = 0

    for mspec in channel_specs:
        ch_key = mspec.channel_key
        ch_pos_list: list[np.ndarray] = []
        ch_faces: list[tuple[int, ...]] = []
        ch_joints_list: list[np.ndarray] = []
        ch_weights_list: list[np.ndarray] = []
        ch_uv1_list: list[np.ndarray] = []
        ch_tags: list[str] = []
        off = 0
        for s_i, e_i, ch in chunk_slices:
            if ch.channel != ch_key:
                continue
            ch_pos_list.append(refined_pos_b[s_i:e_i])
            ch_joints_list.append(merged_joints[s_i:e_i])
            ch_weights_list.append(merged_weights[s_i:e_i])
            ch_uv1_list.append(merged_uv1[s_i:e_i])
            ch_tags.extend([ch.part_tag] * (e_i - s_i))
            for f in ch.faces:
                ch_faces.append(tuple(idx + off for idx in f))
            off += e_i - s_i
        if not ch_pos_list:
            continue

        c_pos_b = np.concatenate(ch_pos_list, axis=0)
        c_joints = np.concatenate(ch_joints_list, axis=0)
        c_weights = np.concatenate(ch_weights_list, axis=0)
        c_uv1 = np.concatenate(ch_uv1_list, axis=0)

        # 비중첩 UV0 전개 (마진 >= 0.015)
        origin_v, uv0_split, tris_split, ov_ratio = unwrap_uv0_clean_mixed(c_pos_b, ch_faces, margin=0.018)
        worst_uv0_ov = max(worst_uv0_ov, ov_ratio)

        p_b_s = c_pos_b[origin_v]
        p_g_s = b2g(p_b_s)
        n_g_s = vertex_normals(p_g_s, tris_split)
        j_s = c_joints[origin_v]
        w_s = c_weights[origin_v]
        uv1_s = c_uv1[origin_v].astype(np.float32)
        tags_s = [ch_tags[int(k)] for k in origin_v]

        all_uv1_pos.append(p_g_s)
        all_uv1_vals.append(uv1_s.astype(np.float64))
        all_uv1_tris.append(tris_split + uv1_v_off)
        uv1_v_off += len(p_g_s)

        # 계약 18 체형 morph (`param:*:±`) + 파츠 형태 morph (`shape:*:±`)
        targets: list[glbwriter.MorphTarget] = []
        for bkey in expr.BODY_PARAM_KEYS:
            delta_plus = expr.fade_small(ctx.body_fields.field(bkey, p_g_s))
            dp = expr.ensure_min_param_delta(delta_plus, f"param:{bkey}:+", p_g_s).astype(np.float32)
            dm = expr.ensure_min_param_delta(-delta_plus, f"param:{bkey}:-", p_g_s).astype(np.float32)
            targets.append(glbwriter.MorphTarget(name=f"param:{bkey}:+", position=dp))
            targets.append(glbwriter.MorphTarget(name=f"param:{bkey}:-", position=dm))

        for sname in shape_names:
            d_b = eval_shape_morph_delta_b(sname, p_b_s, tags_s, ctx)
            d_g = b2g(d_b)
            dp = expr.fade_small(d_g).astype(np.float32)
            dm = expr.fade_small(-d_g).astype(np.float32)
            targets.append(glbwriter.MorphTarget(name=f"shape:{sname}:+", position=dp))
            targets.append(glbwriter.MorphTarget(name=f"shape:{sname}:-", position=dm))

        primitives.append(
            GarmentPrimitive(
                positions=p_g_s.astype(np.float32),
                indices=tris_split.astype(np.uint32),
                normals=n_g_s.astype(np.float32),
                uvs=uv0_split,
                uv1s=uv1_s,
                joints=j_s,
                weights=w_s,
                material=mat_indices[ch_key],
                targets=targets,
            )
        )
        total_tris += len(tris_split)
        total_verts += len(p_g_s)

    writer.add_garment_mesh_node(
        node_name,
        primitives,
        skinned=True,
        extras={
            "presetId": preset_id,
            "genre": genre,
            "targetBase": ctx.archetype_id,
            "hides": list(hides),
            "uv1": {"purpose": "pattern", "cmPerUnit": UV1_CM_PER_UNIT},
        },
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    byte_size = writer.write(str(out_path))
    sha256 = hashlib.sha256(out_path.read_bytes()).hexdigest()

    uv1_density = measure_uv1_cm_density(
        np.concatenate(all_uv1_pos, axis=0),
        np.concatenate(all_uv1_vals, axis=0),
        np.concatenate(all_uv1_tris, axis=0),
    )

    # 3) 자동 하드 QA 게이트 (Blender 실임포트 bmesh + gltf-transform validate + 계약 검증)
    bmesh_audit, bmesh_errs = audit_garment_glb_blender(out_path, expect_grounded=is_shoes)
    val_rep, val_errs = qa.gate_gltf_transform_validate(out_path)
    contract_errs = audit_garment_glb_contract(out_path, expected_shapes=shape_names)

    errors: list[str] = [*bmesh_errs, *val_errs, *contract_errs]
    if clearance_metrics["restMinClearanceMm"] < (min_body_clearance_m * 1000.0 - 0.15):
        errors.append(
            f"레스트 바디 간격 부족: {clearance_metrics['restMinClearanceMm']}mm < {min_body_clearance_m*1000:.2f}mm"
        )
    if underlayer_bvh_b is not None and clearance_metrics["underlayerMinGapMm"] is not None and clearance_metrics["underlayerMinGapMm"] < 0.0:
        errors.append(f"하위 레이어 관통: {clearance_metrics['underlayerMinGapMm']}mm")
    for pname, pr in clearance_metrics["poses"].items():
        if pr["penetratingVerts"] > 0:
            errors.append(f"포즈 {pname} 관통 정점 {pr['penetratingVerts']}개 (min={pr['minSignedDistMm']}mm)")

    return GarmentExportResult(
        preset_id=preset_id,
        genre=genre,
        slot=slot,
        layer=layer,
        node_name=node_name,
        target_base=ctx.archetype_id,
        glb_path=out_path,
        bytes=byte_size,
        sha256=sha256,
        materials=mat_meta_list,
        hides=list(hides),
        shapes=list(shape_names),
        triangles=total_tris,
        vertices=total_verts,
        uv0_overlap=round(worst_uv0_ov, 5),
        uv1_density=uv1_density,
        clearance=clearance_metrics,
        bmesh_audit=bmesh_audit,
        gltf_validator=val_rep,
        passed=len(errors) == 0,
        errors=errors,
        final_bvh_b=final_bvh_b,
    )


def audit_garment_glb_blender(glb_path: Path, *, expect_grounded: bool = False) -> tuple[dict[str, Any], list[str]]:
    """Blender 5.3 실임포트 `bmesh` 0-결함 검증."""
    errors: list[str] = []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.ops.import_scene.gltf(filepath=str(glb_path))

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and not o.name.startswith("Icosphere")]
    if not meshes:
        return {}, ["임포트된 메시가 없습니다."]

    report: dict[str, Any] = {}
    min_z = math.inf
    for obj in meshes:
        if any(abs(s - 1.0) > 1e-4 for s in obj.scale):
            errors.append(f"{obj.name}: scale={tuple(round(v, 4) for v in obj.scale)} != (1,1,1)")
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        loose = sum(1 for v in bm.verts if len(v.link_edges) == 0)
        wire = sum(1 for e in bm.edges if len(e.link_faces) == 0)
        true_nm = sum(1 for e in bm.edges if len(e.link_faces) > 2 or (len(e.link_faces) == 2 and not e.is_contiguous))
        zero_a = sum(1 for f in bm.faces if f.calc_area() <= 1e-10)
        bm.free()
        report[obj.name] = {
            "verts": len(obj.data.vertices),
            "faces": len(obj.data.polygons),
            "trueNonManifold": true_nm,
            "looseVerts": loose,
            "wireEdges": wire,
            "zeroAreaFaces": zero_a,
        }
        if true_nm or loose or wire or zero_a:
            errors.append(f"{obj.name} bmesh 결함: nm={true_nm}, loose={loose}, wire={wire}, zeroA={zero_a}")
        pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        min_z = min(min_z, min(p.z for p in pts))

    if expect_grounded and abs(min_z) > 0.001:
        errors.append(f"신발 바닥 접지 이탈: min_z={min_z*1000:.2f}mm")

    return {"minZ": round(min_z, 5), "meshes": report}, errors


def audit_garment_glb_contract(glb_path: Path, *, expected_shapes: list[str]) -> list[str]:
    """GLB 코덱·68본·UV0 [0,1]·TEXCOORD_1·체형 18 morph + raw SHORT 바운드 검증."""
    errors: list[str] = []
    reader = qa.GlbReader(glb_path)
    doc = reader.doc

    exts = set(doc.get("extensionsUsed", [])) | set(doc.get("extensionsRequired", []))
    bad_ext = sorted(exts & FORBIDDEN_EXTENSIONS)
    if bad_ext:
        errors.append(f"금지 코덱 포함: {bad_ext}")
    if "KHR_mesh_quantization" not in exts:
        errors.append("KHR_mesh_quantization 누락")

    skins = doc.get("skins", [])
    if len(skins) != 1 or len(skins[0]["joints"]) != 68:
        errors.append(f"68본 스켈레톤 불일치: skins={len(skins)}")

    mats = doc.get("materials", [])
    if not (1 <= len(mats) <= 3):
        errors.append(f"재질 수 {len(mats)}개 (1~3 범위 이탈)")

    required_morphs = set(expr.BODY_MORPH_NAMES) | {f"shape:{s}:{sg}" for s in expected_shapes for sg in ("+", "-")}
    for mesh in doc.get("meshes", []):
        tnames = set(mesh.get("extras", {}).get("targetNames", []))
        miss = sorted(required_morphs - tnames)
        if miss:
            errors.append(f"{mesh['name']}: 누락 morph {miss[:4]}")
        for p_idx, prim in enumerate(mesh.get("primitives", [])):
            attrs = prim["attributes"]
            if "TEXCOORD_0" not in attrs or "TEXCOORD_1" not in attrs:
                errors.append(f"{mesh['name']}[{p_idx}]: TEXCOORD_0 또는 TEXCOORD_1 누락")
            else:
                uv0 = reader.read_accessor(attrs["TEXCOORD_0"])
                if float(uv0.min()) < -0.001 or float(uv0.max()) > 1.001:
                    errors.append(f"{mesh['name']}[{p_idx}]: UV0 범위 이탈 [{uv0.min():.4f}, {uv0.max():.4f}]")
            for t_idx, tgt in enumerate(prim.get("targets", [])):
                acc = doc["accessors"][tgt["POSITION"]]
                if acc.get("componentType") != 5122 or not acc.get("normalized"):
                    errors.append(f"{mesh['name']}[{p_idx}].target[{t_idx}]: normalized SHORT 아님")
                mn, mx = acc.get("min"), acc.get("max")
                if not isinstance(mn, list) or not isinstance(mx, list) or any(not isinstance(v, int) for v in mn + mx):
                    errors.append(f"{mesh['name']}[{p_idx}].target[{t_idx}]: raw int16 min/max 누락")
    return errors
