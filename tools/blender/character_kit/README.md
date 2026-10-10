# 캐릭터 키트 빌더 (character_kit)

상태: **작업 중 (2026-10-10) — 키트 에셋을 아직 만들지 못한다.** 구현된 단계와 남은 단계는 아래 표가 기준이다.
계약 정본은 `apps/character-lab/docs/authored-kit-spec.md`, 검증기는 `scripts/verify-character-kit.mjs`다.
Hyper3D 진행 상황과 대기 중인 생성 요청은 `apps/character-lab/docs/hyper3d-intake-review.md` 10절에 있다.

기존 `tools/blender/toonstudio_blender_kit`(헤어·얼굴 shape key·품질 보고서용 Blender 확장)과는 별개이며, 이 패키지는
**모듈식 키트 에셋**(베이스 바디 GLB + 파츠 GLB + `kit.json`)을 만든다.

## 실행 환경

Python 3.13 + `bpy==5.2.2` + `numpy` + `pillow` (pip). `tools/blender`를 `sys.path`에 올려 `import character_kit`으로 쓴다.
신뢰할 수 없는 `.blend`는 `python -I`로 읽고 자동 실행을 끈다(`hbm_extract.py`가 그렇게 한다).

```text
python -m venv <venv> && <venv>/bin/pip install bpy==5.2.2 numpy pillow
```

계약 상수는 파이썬에 복제하지 않고 덤프해서 읽는다.

```text
pnpm exec tsx scripts/blender/dump-kit-contract.mjs --out <contract.json>   # 덤프
```

원천 데이터(Human Base Meshes 번들 v1.4.1, CC0)는 저장소에 없다. 내려받아 SHA-256을 확인한 뒤 추출한다.

```text
<venv>/bin/python -I tools/blender/character_kit/hbm_extract.py <human_base_meshes_bundle.blend> <출력 폴더>
```

## 모듈과 상태

| 모듈 | 하는 일 | 상태 |
| --- | --- | --- |
| `hbm_extract`, `hbm` | 번들에서 몸(L1 멀티레스)·눈·홍채를 npz로 추출하고 glTF 좌표(Y 위, +Z 앞)로 읽기. 해부학 분할 번호 상수 | 완료 |
| `landmarks` | 분할 경계 루프 중심으로 68 joint 위치(A-포즈) 산출 | 완료 |
| `rig` | A→T 포즈 회전(쇄골 12° 상승, 팔·손 프레임 정렬) | 완료 |
| `skin`, `arap` | 분할 기반 조화 보간 웨이트(정점당 ≤4), DQS, 어깨 전이 영역 ARAP | 완료(어깨 윗선 돌기 개선 여지) |
| `glbwriter` | 키트 계약용 GLB 작성기(sparse morph, `_REGION`, 임베드 텍스처) | 완료, 왕복 시험 |
| `fields_body` | 체형 morph 9종(±) 위치 변위 필드와 관절 오프셋 | 구현, 단위 시험, 베이스에 아직 적용 안 함 |
| `face_fields`, `fields_face` | `face-fields.ts` numpy 이식(TS 대비 1e-9)과 HBM 머리 정합, 얼굴 morph 46종 | 구현, 이음매 테이퍼 적용 필요 |
| `uvtools` | `smart_project` 전개 + 직접 패킹 + 검증기 V12 동일 규칙 겹침 측정 | 완료(머리는 각도 55° 이하) |
| `surface` | mathutils BVH 최근접 표면점·무게중심 보간(파츠가 몸을 따라가게) | 완료 |
| `debug_render`, `contract` | 확인용 정사영 렌더러, 계약 JSON 래퍼 | 완료 |
| 베이스 조립 | 영역·`_REGION`, 속옷, 눈, 입 내부, 속눈썹, 눈썹, 텍스처, GLB 출력 | **미구현** |
| 필수 파츠 5종 | `hair/soft-bob`, `top/tee`, `bottom/jeans`, `shoes/sneakers`, `irises/round-large` | **미구현** |
| `kit.json` 작성기 | 어휘 32개 전부를 변형 또는 한글 `unavailable`로 선언, `deriveKitCapabilities` 사용 | **미구현** |
| 의상 리타깃 | 외부 GLB(Hyper3D 생성물)를 베이스에 맞춰 파츠 GLB로 | **미구현** |

## 시험

```text
<venv>/bin/python -I tools/blender/character_kit/tests/test_glbwriter.py
<venv>/bin/python -I tools/blender/character_kit/tests/test_geometry.py
<venv>/bin/python -I tools/blender/character_kit/tests/test_face_fields_parity.py   # 저장소 루트에서, pnpm/tsx 필요
```

## 알아 둘 점

- bpy 5.x의 `uv.pack_islands`는 백그라운드에서 레이아웃을 키우지 못해 직접 패킹한다(`uvtools.pack_uv_islands`).
- `mathutils`는 `import bpy` 뒤에만 가져올 수 있다(`surface`).
- 라이선스: 원천은 CC0(`provenance.license = CC0-1.0`)와 `original`만 계약이 허용한다. Hyper3D 생성물 반입은 계약 V4 변경이 필요하다.
