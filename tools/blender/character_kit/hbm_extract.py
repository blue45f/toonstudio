"""Human Base Meshes 번들(.blend)에서 키트 빌드에 필요한 메시를 npz로 추출한다 (bpy 필요).

실행(저장소 루트, bpy가 설치된 venv의 파이썬):
    python -I tools/blender/character_kit/hbm_extract.py <human_base_meshes_bundle.blend> <출력 폴더>

신뢰할 수 없는 .blend이므로 파이썬 자동 실행을 끈 채로 읽기만 한다. 출력 좌표는 Blender 월드 좌표(Z 위, -Y 앞)
그대로이며 glTF 좌표(Y 위, +Z 앞)로의 변환은 `hbm.py`가 한다.

추출 대상(CC0, 번들 README·에셋 메타데이터 확인):
- `GEO-body_<sex>_realistic` : 멀티레스 레벨 1 평가 결과(전부 쿼드)와 `.sculpt_face_set`(해부학 분할 102개)
- `GEO-body_<sex>_realistic.eye.L/R` : 공막+각막 구(546 정점)
- `GEO-head_animation_realistic.iris.L/R`, `.sclera.L/R` : 홍채 원반(400 정점)과 그 기준 공막(홍채의 상대 위치 계산용)
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

BODY_OBJECTS = {"female": "GEO-body_female_realistic", "male": "GEO-body_male_realistic"}
HEAD_ASSET_PREFIX = "GEO-head_animation_realistic"
MULTIRES_LEVEL = 1


def _evaluated_mesh(bpy, obj, multires_level: int | None):
    """멀티레스 레벨을 지정해 평가된 메시를 (월드 좌표 정점, 루프 정점 인덱스, 면 시작, 면 크기, 면 속성 dict)로 돌려준다."""
    if multires_level is not None:
        for modifier in obj.modifiers:
            if modifier.type == "MULTIRES":
                modifier.levels = multires_level
                modifier.render_levels = multires_level
                modifier.sculpt_levels = multires_level
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        count = len(mesh.vertices)
        local = np.empty(count * 3, dtype=np.float64)
        mesh.vertices.foreach_get("co", local)
        local = local.reshape(-1, 3)
        matrix = np.array(obj.matrix_world, dtype=np.float64)
        world = local @ matrix[:3, :3].T + matrix[:3, 3]
        loops = np.empty(len(mesh.loops), dtype=np.int64)
        mesh.loops.foreach_get("vertex_index", loops)
        starts = np.empty(len(mesh.polygons), dtype=np.int64)
        mesh.polygons.foreach_get("loop_start", starts)
        sizes = np.empty(len(mesh.polygons), dtype=np.int64)
        mesh.polygons.foreach_get("loop_total", sizes)
        face_set = None
        attribute = mesh.attributes.get(".sculpt_face_set")
        if attribute is not None and attribute.domain == "FACE" and attribute.data_type == "INT":
            face_set = np.empty(len(mesh.polygons), dtype=np.int32)
            attribute.data.foreach_get("value", face_set)
        return world, loops, starts, sizes, face_set
    finally:
        evaluated.to_mesh_clear()


def _triangles(loops: np.ndarray, starts: np.ndarray, sizes: np.ndarray) -> np.ndarray:
    """볼록 다각형을 부채꼴로 삼각분할한다(눈·홍채 같은 소형 메시용)."""
    triangles: list[tuple[int, int, int]] = []
    for start, size in zip(starts.tolist(), sizes.tolist(), strict=True):
        ring = loops[start : start + size]
        for k in range(1, size - 1):
            triangles.append((int(ring[0]), int(ring[k]), int(ring[k + 1])))
    return np.asarray(triangles, dtype=np.int64)


def extract(blend_path: str | Path, out_dir: str | Path) -> dict[str, str]:
    """번들에서 성별별 npz를 만들고 {이름: 경로}를 돌려준다."""
    import bpy  # noqa: PLC0415 - bpy는 이 함수에서만 필요하다

    bpy.context.preferences.filepaths.use_scripts_auto_execute = False
    bpy.ops.wm.open_mainfile(filepath=str(blend_path), load_ui=False)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    head_asset: dict[str, np.ndarray] = {}
    for side in ("L", "R"):
        for part in ("iris", "sclera"):
            obj = bpy.data.objects[f"{HEAD_ASSET_PREFIX}.{part}.{side}"]
            world, loops, starts, sizes, _ = _evaluated_mesh(bpy, obj, None)
            head_asset[f"{part}{side}_positions"] = world
            head_asset[f"{part}{side}_triangles"] = _triangles(loops, starts, sizes)

    written: dict[str, str] = {}
    for sex, name in BODY_OBJECTS.items():
        obj = bpy.data.objects[name]
        world, loops, starts, sizes, face_set = _evaluated_mesh(bpy, obj, MULTIRES_LEVEL)
        if not (sizes == 4).all():
            raise RuntimeError(f"{name}: 쿼드가 아닌 면이 있습니다(레벨 {MULTIRES_LEVEL}).")
        if face_set is None:
            raise RuntimeError(f"{name}: .sculpt_face_set 속성이 없습니다.")
        faces = loops.reshape(-1, 4)
        arrays: dict[str, np.ndarray] = {
            "body_positions": world,
            "body_faces": faces,
            "body_face_set": face_set,
            **head_asset,
        }
        for side in ("L", "R"):
            eye = bpy.data.objects[f"{name}.eye.{side}"]
            eye_world, eye_loops, eye_starts, eye_sizes, _ = _evaluated_mesh(bpy, eye, None)
            arrays[f"eye{side}_positions"] = eye_world
            arrays[f"eye{side}_triangles"] = _triangles(eye_loops, eye_starts, eye_sizes)
        target = out / f"hbm_{sex}.npz"
        np.savez_compressed(target, **arrays)
        written[sex] = str(target)
    return written


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("사용법: python -I hbm_extract.py <bundle.blend> <출력 폴더>", file=sys.stderr)
        return 2
    for sex, path in extract(argv[0], argv[1]).items():
        print(f"{sex}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
