"""`face_fields.py`(numpy 이식본)와 `face-fields.ts`(TS 원본)의 수치 일치 시험.

시드 고정 난수 점과 특수점(정중선·눈·입·귀·턱 관절·입꼬리·|x|=0.03/0.06 경계·좌우 거울쌍)을 만들어 TS 원본을
`dump_face_fields.mjs`(tsx)로 평가하고, 같은 입력의 파이썬 결과를 절대 오차 1e-9 이하로 비교한다. 상수(랜드마크·키·
FACS 유닛·스코프 이름·순서)와 턱 마스크, 그리고 "-" 방향(= "+"의 부호 반전)도 함께 비교한다.

모든 기준 점을 5개 스코프 전부로 평가한다. 첫 블록의 스코프는 `i % 5` 순환 배정이고, 나머지 4블록은 그 배정을 한 칸씩
밀어 같은 점이 다른 스코프에서도 평가되게 한다(치아·혀 followInner 분기, 안구 강체, 0 반환 조합을 점마다 확인).

실행(저장소 루트에서):
    <파이썬> -I tools/blender/character_kit/tests/test_face_fields_parity.py

종료 코드: 0 = 일치, 1 = 불일치(이름·스코프·점 인덱스·두 값을 출력), 2 = TS 덤프를 실행하지 못함.
`unittest discover`·pytest 탐색 실행도 래퍼 `FaceFieldsParityTest`로 같은 검사를 한다.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.dont_write_bytecode = True  # 저장소 트리에 __pycache__를 남기지 않는다
REPO_ROOT = Path(__file__).resolve().parents[4]
# -I(격리) 모드는 스크립트 폴더를 sys.path에 넣지 않으므로 `import character_kit`용으로 tools/blender를 직접 올린다.
sys.path.insert(0, str(REPO_ROOT / "tools" / "blender"))

from character_kit import face_fields as ff  # noqa: E402

SEED = 20261010
ATOL = 1e-9  # 파이썬 이식본과 TS 원본 사이에 허용하는 절대 오차
RANDOM_POINTS = 640  # 상자 균등 난수 점(≥ 600)
MIRRORED_POINTS = 100  # 위 난수 점 중 앞쪽 N개의 좌우 거울쌍
SHELL_POINTS = 160  # 머리 표면 근방(반경 0.85~1.05 구 껍질) 난수 점: 실제 정점이 놓이는 곳
SCOPE_COUNT = len(ff.SCOPE_NAMES)
DUMP_SCRIPT = Path("tools/blender/character_kit/tests/dump_face_fields.mjs")  # 저장소 루트 기준
TSX_TIMEOUT_SECONDS = 600
MAX_REPORTED_MISMATCHES = 20
SUBSET_ATOL = 1e-12  # 같은 점을 부분집합/전체로 따로 계산했을 때 허용하는 차이(SIMD 꼬리 처리 등)


# ---------------------------------------------------------------------------
# 입력 만들기
# ---------------------------------------------------------------------------


def build_special_points() -> np.ndarray:
    """특수점: 원점, 정중선 평면, 랜드마크와 TS 마스크 중심, 정중선 띠 경계, 입선 경계, 극단값. 좌우 거울쌍을 함께 넣는다."""
    lm = ff.HEAD_LANDMARKS
    mouth_y = lm["mouth"][1]
    points: list[tuple[float, float, float]] = []

    def add(x: float, y: float, z: float) -> None:
        points.append((float(x), float(y), float(z)))

    def add_pair(x: float, y: float, z: float) -> None:
        add(x, y, z)
        add(-x, y, z)

    add(0.0, 0.0, 0.0)  # 원점(radial 길이 0 대체)
    add(-0.0, 0.0, 0.0)  # 음의 0: sideSign·lateral의 부호 처리

    # x = 0 평면(정중선) 위 점
    for y in (-0.92, -0.6, -0.43, -0.12, 0.0, 0.1, 0.26, 0.33, 0.55):
        for z in (-0.3, 0.0, 0.6, 0.78, 0.98):
            add(0.0, y, z)

    # 랜드마크(좌우 거울쌍). 중심 x가 0인 것은 거울쌍이 같은 점이 된다.
    for name in ("eye", "brow", "noseTip", "noseBridge", "mouth", "chin", "jawCorner", "cheek", "forehead", "ear", "jawPivot"):
        add_pair(*lm[name])
    # TS 모듈 상수(마스크 중심)와 그 근방: 입꼬리, 위·아래 눈꺼풀, 눈썹 안·바깥, 볼 부풀림, 콧방울, 귀 마스크 중심
    for x, y, z in (
        (lm["mouthHalfWidth"], mouth_y, 0.76),
        (lm["eye"][0], 0.26, 0.78),
        (lm["eye"][0], -0.06, 0.78),
        (0.18, 0.33, 0.82),
        (0.5, 0.33, 0.68),
        (0.55, -0.35, 0.55),
        (0.16, -0.18, 0.88),
        (0.16, -0.15, 0.88),
        (lm["ear"][0] + 0.06, lm["ear"][1], lm["ear"][2]),
        (0.0, -0.05, 0.92),
    ):
        add_pair(x, y, z)

    # 정중선 띠 경계: blink의 |x| < 0.03 제외, eyeCenterFor의 0.06, lateral의 폭(0.05/0.06/0.08/0.15) 근방
    for boundary in (0.03, 0.05, 0.06, 0.08, 0.15):
        below = float(np.nextafter(boundary, 0.0))
        above = float(np.nextafter(boundary, 1.0))
        for x in (boundary, below, above, boundary - 1e-9, boundary + 1e-9):
            for y, z in ((0.26, 0.78), (0.1, 0.6), (-0.06, 0.78), (-0.43, 0.78), (0.0, 0.9)):
                add_pair(x, y, z)
    for x in (1e-12, 1e-6, 0.01, 0.029):  # 정중선에 아주 가까운 점
        for y, z in ((0.26, 0.78), (-0.43, 0.78)):
            add_pair(x, y, z)

    # 입선 경계: 치아 스코프의 `y < MOUTH_Y`는 엄격 부등호다.
    for y in (mouth_y, float(np.nextafter(mouth_y, -1.0)), float(np.nextafter(mouth_y, 1.0))):
        for x in (0.0, 0.1, 0.25, 0.4):
            for z in (0.78, 0.3):
                add_pair(x, y, z)

    # 극단값: 마스크 밖 먼 점, 원점 근방 극소 좌표(Math.hypot의 스케일링 경로)
    add(5.0, -7.0, 9.0)
    add(-3.0, 4.0, -2.0)
    add(1e-300, 0.0, 0.0)
    add(0.0, 0.0, 1e-200)
    return np.array(points, dtype=np.float64)


def build_base_points() -> np.ndarray:
    """기준 점 집합 (M,3): 상자 균등 난수 + 그 거울쌍 + 표면 근방 난수 + 특수점."""
    rng = np.random.default_rng(SEED)
    box = rng.uniform([-1.2, -1.2, -0.8], [1.2, 1.2, 1.2], size=(RANDOM_POINTS, 3))
    mirrored = box[:MIRRORED_POINTS] * np.array([-1.0, 1.0, 1.0])
    directions = rng.normal(size=(SHELL_POINTS, 3))
    directions /= np.linalg.norm(directions, axis=1, keepdims=True)
    shell = directions * rng.uniform(0.85, 1.05, size=(SHELL_POINTS, 1))
    return np.vstack([box, mirrored, shell, build_special_points()])


def build_samples(base: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(점, 스코프) 표본. 블록 0은 `i % 5` 순환 배정이고 블록 k는 k칸 민 배정이라 모든 점이 모든 스코프를 거친다."""
    index = np.arange(base.shape[0])
    points = np.tile(base, (SCOPE_COUNT, 1))
    scopes = np.concatenate([(index + shift) % SCOPE_COUNT for shift in range(SCOPE_COUNT)])
    return points, scopes


# ---------------------------------------------------------------------------
# TS 원본 덤프
# ---------------------------------------------------------------------------


def run_dump(points: np.ndarray, scopes: np.ndarray, workdir: Path) -> dict:
    pnpm = shutil.which("pnpm")
    if pnpm is None:
        print("pnpm을 찾지 못했습니다. Node와 pnpm을 설치하고 저장소 루트에서 `pnpm install`을 실행하세요.", file=sys.stderr)
        sys.exit(2)
    input_path = workdir / "input.json"
    output_path = workdir / "output.json"
    input_path.write_text(json.dumps({"points": points.tolist(), "scopes": scopes.tolist()}), encoding="utf-8")
    command = [pnpm, "exec", "tsx", DUMP_SCRIPT.as_posix(), str(input_path), str(output_path)]
    try:
        result = subprocess.run(
            command,
            cwd=REPO_ROOT,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=TSX_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        print(f"TS 덤프가 {TSX_TIMEOUT_SECONDS}초 안에 끝나지 않았습니다: {' '.join(command)}", file=sys.stderr)
        sys.exit(2)
    if result.returncode != 0 or not output_path.exists():
        print(f"TS 덤프 실행 실패(종료 코드 {result.returncode}): {' '.join(command)}", file=sys.stderr)
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(2)
    return json.loads(output_path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# 비교
# ---------------------------------------------------------------------------


def fmt(vector: np.ndarray) -> str:
    return "(" + ", ".join(f"{value:.17g}" for value in vector) + ")"


def check_constants(dump: dict) -> list[str]:
    """TS가 쓴 상수·순서와 파이썬 상수의 일치."""
    failures: list[str] = []
    if tuple(dump["scopeNames"]) != ff.SCOPE_NAMES:
        failures.append(f"스코프 이름 불일치: ts={dump['scopeNames']} python={list(ff.SCOPE_NAMES)}")
    codes = (ff.SCOPE_SURFACE, ff.SCOPE_EYE_LEFT, ff.SCOPE_EYE_RIGHT, ff.SCOPE_TEETH, ff.SCOPE_TONGUE)
    if codes != tuple(range(SCOPE_COUNT)):
        failures.append(f"스코프 코드 불일치: {codes} (기대 0..4 순서)")
    if tuple(dump["faceParamKeys"]) != ff.FACE_PARAM_KEYS:
        failures.append(f"FACE_PARAM_KEYS 불일치: ts={dump['faceParamKeys']} python={list(ff.FACE_PARAM_KEYS)}")
    if tuple(dump["facsUnits"]) != ff.FACS_UNITS:
        failures.append(f"FACS_UNITS 불일치: ts={dump['facsUnits']} python={list(ff.FACS_UNITS)}")
    expected_names = [f"param:{key}:+" for key in ff.FACE_PARAM_KEYS] + [f"facs:{unit}" for unit in ff.FACS_UNITS]
    if dump["names"] != expected_names:
        failures.append(f"덤프 이름 목록 불일치: ts={dump['names']}")
    ts_landmarks = dump["landmarks"]
    if set(ts_landmarks) != set(ff.HEAD_LANDMARKS):
        failures.append(f"HEAD_LANDMARKS 키 불일치: ts={sorted(ts_landmarks)} python={sorted(ff.HEAD_LANDMARKS)}")
    for key, py_value in ff.HEAD_LANDMARKS.items():
        ts_value = ts_landmarks.get(key)
        py_list = list(py_value) if isinstance(py_value, tuple) else py_value
        if ts_value != py_list:  # 소수 리터럴이라 정확히 같아야 한다
            failures.append(f"HEAD_LANDMARKS[{key!r}] 불일치: ts={ts_value} python={py_list}")
    return failures


def diff_failures(label: str, py: np.ndarray, ts: np.ndarray, points: np.ndarray, scopes: np.ndarray) -> tuple[list[str], float]:
    """두 (N,3) 결과를 비교해 불일치 목록과 최대 절대 오차를 돌려준다. NaN은 불일치로 센다."""
    if py.shape != ts.shape:
        return [f"{label}: 모양 불일치 python={py.shape} ts={ts.shape}"], float("inf")
    diff = np.abs(py - ts)
    bad_points = np.flatnonzero(~(diff <= ATOL).all(axis=1))
    lines = [
        f"{label} scope={int(scopes[i])}({ff.SCOPE_NAMES[int(scopes[i])]}) 점#{i} p={fmt(points[i])} "
        f"python={fmt(py[i])} ts={fmt(ts[i])} |차|={np.max(diff[i]):.3e}"
        for i in bad_points
    ]
    return lines, float(np.max(diff)) if diff.size else 0.0


def compare_deltas(dump: dict, points: np.ndarray, scopes: np.ndarray) -> tuple[list[str], float, str]:
    failures: list[str] = []
    max_error = 0.0
    worst_label = ""
    for name in dump["names"]:
        ts = np.asarray(dump["deltas"][name], dtype=np.float64)
        comparisons = [(name, ff.morph_delta(name, points, scopes), ts)]
        if name.startswith("param:"):  # "-"는 "+"의 부호 반전
            minus = name[:-1] + "-"
            comparisons.append((minus, ff.morph_delta(minus, points, scopes), -ts))
        for label, py, expected in comparisons:
            lines, error = diff_failures(label, py, expected, points, scopes)
            failures.extend(lines)
            if error > max_error:
                max_error, worst_label = error, label
    return failures, max_error, worst_label


def compare_jaw_mask(dump: dict, points: np.ndarray) -> list[str]:
    ts = np.asarray(dump["jawMask"], dtype=np.float64)
    py = ff.jaw_mask_local(points)
    diff = np.abs(py - ts)
    return [
        f"jawMaskLocal 점#{i} p={fmt(points[i])} python={py[i]:.17g} ts={ts[i]:.17g}" for i in np.flatnonzero(~(diff <= ATOL))
    ]


# ---------------------------------------------------------------------------
# 파이썬 API 계약 (TS 비교로는 잡히지 않는 약속)
# ---------------------------------------------------------------------------


def check_api_contract(base: np.ndarray, names: list[str]) -> list[str]:
    failures: list[str] = []
    points = base.copy()
    before = points.copy()
    count = points.shape[0]
    cyclic = np.arange(count) % SCOPE_COUNT

    for name in names:
        result = ff.morph_delta(name, points, cyclic)
        if result.shape != (count, 3) or result.dtype != np.float64:
            failures.append(f"{name}: 반환 모양/타입이 (N,3) float64가 아닙니다: {result.shape} {result.dtype}")
        for scope in range(SCOPE_COUNT):
            by_array = ff.morph_delta(name, points, np.full(count, scope))
            if not np.array_equal(ff.morph_delta(name, points, scope), by_array):
                failures.append(f"{name}: 정수 스코프 {scope}와 같은 값의 배열 스코프 결과가 다릅니다.")
            chosen = cyclic == scope  # 점마다 스코프: 부분집합을 따로 계산한 결과와 같아야 한다(점 사이에 섞이지 않는다)
            alone = ff.morph_delta(name, points[chosen], scope)
            if np.abs(result[chosen] - alone).max() > SUBSET_ATOL:
                failures.append(f"{name}: 스코프 {scope} 점을 따로 계산한 결과가 점별 스코프 결과와 다릅니다.")

    for key in ff.FACE_PARAM_KEYS:  # "-"는 "+"의 부호 반전이며 -0.0을 만들지 않는다
        plus = ff.morph_delta(f"param:{key}:+", points, cyclic)
        minus = ff.morph_delta(f"param:{key}:-", points, cyclic)
        if not np.array_equal(minus, -plus) or (np.signbit(minus) & (minus == 0.0)).any():
            failures.append(f"param:{key}:-가 +의 부호 반전(음의 0 없음)이 아닙니다.")

    if not np.array_equal(points, before):
        failures.append("입력 points가 함수 호출로 바뀌었습니다.")
    if ff.morph_delta("facs:jawOpen", np.zeros((0, 3)), 0).shape != (0, 3):
        failures.append("빈 입력 (0,3)이 (0,3)을 돌려주지 않습니다.")
    if ff.jaw_mask_local(points).shape != (count,):
        failures.append("jaw_mask_local은 (N,) 배열을 돌려줘야 합니다.")

    nan_points = points.copy()
    nan_points[0, 0] = np.nan
    rejected = {
        "알 수 없는 FACS 유닛": lambda: ff.morph_delta("facs:nope", points, 0),
        "체형 파라미터": lambda: ff.morph_delta("param:height:+", points, 0),
        "잘못된 부호": lambda: ff.morph_delta("param:eyeSize:*", points, 0),
        "형식 오류": lambda: ff.morph_delta("eyeSize", points, 0),
        "points 모양": lambda: ff.morph_delta("facs:jawOpen", points[:, :2], 0),
        "points NaN": lambda: ff.morph_delta("facs:jawOpen", nan_points, 0),
        "스코프 범위": lambda: ff.morph_delta("facs:jawOpen", points, SCOPE_COUNT),
        "스코프 타입": lambda: ff.morph_delta("facs:jawOpen", points, 0.0),
        "스코프 모양": lambda: ff.morph_delta("facs:jawOpen", points, np.zeros(count + 1, dtype=np.int64)),
    }
    for label, call in rejected.items():
        try:
            call()
        except ValueError:
            continue
        failures.append(f"잘못된 입력({label})이 ValueError를 일으키지 않았습니다.")
    return failures


# ---------------------------------------------------------------------------
# 실행
# ---------------------------------------------------------------------------


def main() -> int:
    base = build_base_points()
    points, scopes = build_samples(base)
    with tempfile.TemporaryDirectory(prefix="face-fields-parity-") as workdir:
        dump = run_dump(points, scopes, Path(workdir))

    failures = check_constants(dump)
    delta_failures, max_error, worst_label = compare_deltas(dump, points, scopes)
    failures += delta_failures
    failures += compare_jaw_mask(dump, points)
    failures += check_api_contract(base, dump["names"])

    if failures:
        header = f"불일치 {len(failures)}건 (허용 오차 {ATOL:g}, 점 {len(points)}개 × 이름 {len(dump['names'])}개)"  # noqa: RUF001
        print(header, file=sys.stderr)
        for line in failures[:MAX_REPORTED_MISMATCHES]:
            print(f"  {line}", file=sys.stderr)
        if len(failures) > MAX_REPORTED_MISMATCHES:
            print(f"  ... 외 {len(failures) - MAX_REPORTED_MISMATCHES}건", file=sys.stderr)
        return 1

    summary = f"일치: {len(points)}점(기준 {base.shape[0]}점 × 스코프 {SCOPE_COUNT}종) × {len(dump['names'])}이름"  # noqa: RUF001
    print(
        f"{summary} (+ '-' 방향 {len(ff.FACE_PARAM_KEYS)}종, 턱 마스크, 상수·API 계약),"
        f" 최대 절대 오차 {max_error:.3e}({worst_label or '-'}) <= {ATOL:g}"
    )
    return 0


class FaceFieldsParityTest(unittest.TestCase):
    """`unittest`·pytest 탐색용 래퍼. 스크립트 실행과 같은 검사를 하며 이것이 없으면 탐색 실행이 이 시험을 조용히 건너뛴다."""

    def test_python_port_matches_typescript(self) -> None:
        self.assertEqual(main(), 0)


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(errors="backslashreplace")  # 로케일이 한글을 못 쓰는 환경에서도 출력이 죽지 않게 한다
    sys.exit(main())
