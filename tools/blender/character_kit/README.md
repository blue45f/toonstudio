# 캐릭터 키트 빌더 (character_kit)

상태: **작업 중 (2026-10-11) — 여성 베이스 GLB·홍채 파츠·`kit.json` 작성기는 만든다. 의상·헤어 필수 파츠 4종은 의상 리타깃이 `parts/female/<슬롯>/<이름>.glb`로 넣어야 키트가 완성된다(남성 베이스는 이번 빌드에서 만들지 않는다).** 구현된 단계와 남은 단계는 아래 표가 기준이다.
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
| `fields_body` | 체형 morph 9종(±) 위치 변위 필드와 관절 오프셋 | 완료, 단위 시험, 베이스에 적용 |
| `face_fields`, `fields_face` | `face-fields.ts` numpy 이식(TS 대비 1e-9)과 HBM 머리 정합, 얼굴 morph 46종 | 완료, 이음매 테이퍼 적용(입 벌림 가중치·눈 깜빡임은 HBM 머리에 맞춰 `base_assembly`·`eyes_mouth`가 다시 짬) |
| `uvtools` | `smart_project` 전개 + 직접 패킹 + 검증기 V12 동일 규칙 겹침 측정 | 완료(머리는 각도 55° 이하) |
| `surface` | mathutils BVH 최근접 표면점·무게중심 보간(파츠가 몸을 따라가게) | 완료 |
| `debug_render`, `contract` | 확인용 정사영 렌더러, 계약 JSON 래퍼 | 완료 |
| `base_assembly`, `eyes_mouth`, `base_textures`, `build_base` | 여성 베이스 조립: 몸·머리 분할·영역·`_REGION`, 속옷, 눈, 입 내부(치아·혀), 속눈썹, 눈썹, 텍스처, morph 전부(체형 18·얼굴 30·FACS 16), GLB(`KHR_mesh_quantization` + sparse, 12 MiB 안팎), 리타깃 npz | 완료(`bases/female.glb`, `base_model_female.npz`) |
| `webtoon_style` | 웹툰풍 얼굴·몸 스타일(`LookStyle`: 눈·입 높이 구성 워프, 눈 배율, 코·입·턱·뺨, 눈썹 얇게, 아이라인 속눈썹, 미소 굽기, 몸 체형 굽기). `webtoon-girl`·`webtoon-boy`. 설명: `apps/character-lab/docs/webtoon-style-guide.md` | 완료, 단위 시험 |
| `face_register` | 애니풍 얼굴 흉상(Hyper3D)의 모양으로 머리를 옮기는 변위 평활화 ICP | **실험**(미완성, 기본 스타일은 쓰지 않는다 — 실패 원인은 모듈 docstring) |
| `irises/round-large` (`build_irises`) | 홍채·하이라이트(스타일을 따라 크기·위치가 같이 바뀐다) | 완료(두 베이스) |
| `garment_presets`, `build_parts`, `clean_rodin_garment`, `decimate_garment`, `retarget_garment`, `garment_fit`, `garment_texture` | Hyper3D 생성물 → 파츠 GLB: 정리·축소·정렬(`icp`·`frame`·`anchor`·`head_ref`·`hair`·`shoes`·`head_prop`)·충돌 해소·스킨/morph 결합·상대색 텍스처(헤어는 정점 합침 + 원통 UV + 가닥 줄무늬 + 두피 덮개). 프리셋 21종, 베이스마다 빌드(`--base female|male`) | 완료 |
| `proxy_reference` | Rodin이 T-포즈를 따르지 않으므로 베이스 T-포즈 몸에 프록시 상의·바지를 입힌 정면 렌더를 참조 이미지로 만든다(셔츠·블레이저·후디·세일러) | 완료 |
| `kit_manifest`, `build_kit_json` | `kit.json`·`NOTICE.md` 작성: 어휘 32개 전부를 변형 또는 한글 `unavailable`로 선언(베이스별), `--extra-meta`로 남성 베이스까지, `deriveKitCapabilities`(TS) 사용, GLB 자동 검사, Hyper3D 파생 파츠 출처(`hyper3d_sources.json`) | 완료 |

## 시험

```text
<venv>/bin/python -I tools/blender/character_kit/tests/test_glbwriter.py
<venv>/bin/python -I tools/blender/character_kit/tests/test_geometry.py
<venv>/bin/python -I tools/blender/character_kit/tests/test_face_fields_parity.py   # 저장소 루트에서, pnpm/tsx 필요
<venv>/bin/python -I tools/blender/character_kit/tests/test_base_assembly.py        # 합성 입력: 양자화 작성기 왕복, 따라가기·이음매 척도, 바닥 델타 등
<venv>/bin/python -I tools/blender/character_kit/tests/test_base_textures.py
<venv>/bin/python -I tools/blender/character_kit/tests/test_base_eyes_mouth.py      # 홍채 덮개·캐치라이트·눈 깜빡임 모델
<venv>/bin/python -I tools/blender/character_kit/tests/test_garment_fit.py          # 의상 정렬·충돌·앞머리·가닥 텍스처·ARAP 분리 덩어리
<venv>/bin/python -I tools/blender/character_kit/tests/test_webtoon_style.py        # 스타일 표·구성 워프·눈썹 얇게
<venv>/bin/python -I tools/blender/character_kit/tests/test_kit_manifest.py         # kit.json 작성기·Hyper3D 출처 (계약 덤프 필요: 캐시 또는 pnpm/tsx)
<venv>/bin/python -I tools/blender/character_kit/tests/test_base_build.py           # HBM npz가 있어야 한다(없으면 skip), 약 15초
```

## 알아 둘 점

- bpy 5.x의 `uv.pack_islands`는 백그라운드에서 레이아웃을 키우지 못해 직접 패킹한다(`uvtools.pack_uv_islands`).
- `mathutils`는 `import bpy` 뒤에만 가져올 수 있다(`surface`).
- 라이선스: 계약이 허용하는 출처 값은 `CC0-1.0`, `original`, `hyper3d-rodin-output`(2026-10-11)이다. 마지막 값은 **법적 허용을 뜻하지 않으며** 반입 기록
  (`apps/character-lab/docs/hyper3d-terms-record.md`)과 생성 id가 있어야 한다. 파츠별 출처는 `hyper3d_sources.json`에 두고 `build_kit_json.py`가 키트에 **등록된**
  파츠만 `provenance.sources`·`summaryKo`·`NOTICE.md`에 적는다(원본 GLB는 저장소에 없다). HBM 번들의 License 텍스트 불일치(Rain Rig CC-BY 4.0 문구)는 `NOTICE.md`에 그대로 적는다.

## 베이스 인터페이스 (의상·헤어 리타깃 작업자용)

- **베이스 모델 npz**: `<out>/base_model_female.npz` — 배열 명세는 `base_assembly` 모듈 설명, 읽기는 `base_assembly.load_base_model(path)`(`BaseModel`). A-포즈·T-포즈 위치, 삼각형, UV,
  법선, `_REGION`, 스킨, morph(체형 18·얼굴·FACS)와 법선 델타, 영역 범위, 관절 오프셋, 속옷·눈·입·속눈썹·눈썹 메시(`mesh/<노드>/<프리미티브>/…`)가 최종 GLB와 같은 정점 순서로 들어 있다.
- **V9 "따라가기"의 척도**: 검증기 `checkFollow` → `verifyMorphFollow`(정점마다 기준 메시의 가장 가까운 정점, 반경 6 cm, 같은 이름 morph 변위 차의 최댓값, 경고 5 mm·오류 15 mm,
  기준 = 상의·하의·신발·속옷 `TS_Body`, 속눈썹·눈썹 `TS_Head`). 파이썬판은 `base_assembly.follow_deviation(...)`, 이음매는 `seam_mismatch(...)`.
- **V9 비영 규칙의 바닥 델타**: 모든 `param:*` 타깃은 최대 델타 ≥ 1e-5 m이고 `+` ≠ `−`여야 한다. 필드가 그 위치에서 정확히 0이면(예: 발·신발의 `shoulderWidth`·`chestDepth`·`waist`·`hip`·
  `armLength`·`headSize`·`neckLength`) 검증기 오류이므로 `base_assembly.ensure_min_delta`(0.03 mm, **한 정점에만**, 좌우 방향·±는 반대 부호 — 전 정점에 더하면 sparse accessor가 조밀해져 파츠 GLB가 1.5 MiB 한도로 커진다)와 같은 바닥을 더해야 한다.
- **`hides` 규약**: 몸에서 숨길 영역(`bodyRegions`의 id, `KIT_HIDEABLE_REGION_IDS` 15개)을 그 영역을 **전부** 덮을 때만 선언한다. GLB에서 알 수 없는 값이라 키트 폴더 **밖** JSON으로 준다:
  `build_kit_json.py --parts-json hides.json`, `{"top/tee": {"female": {"hides": ["neck"]}}}`(헤어·홍채는 숨길 수 없다).
- **GLB 규칙**: `skin.skeleton`은 생략하거나 루트 joint여야 한다(`glbwriter`가 그렇게 쓴다). 베이스는 morph를 정규화 SHORT(`KHR_mesh_quantization`)로 쓰므로 로더가 그 확장을 등록해야 한다.

## 재현 (저장소 루트)

```text
pnpm exec tsx scripts/blender/dump-kit-contract.mjs --out ~/.cache/toonstudio-kit/out/contract.json
# 두 베이스(웹툰풍 미소녀·미소년)와 홍채. 원본 HBM npz는 ~/.cache/toonstudio-kit/hbm-npz/ 에 있어야 한다(미소년은 hbm_female 몸에서 시작).
<venv>/bin/python -I tools/blender/character_kit/build_base.py   --base female --style webtoon-girl --kit-dir <키트> --out-dir <출력> --contract <contract.json>
<venv>/bin/python -I tools/blender/character_kit/build_irises.py --base female --style webtoon-girl --kit-dir <키트> --contract <contract.json>
<venv>/bin/python -I tools/blender/character_kit/build_base.py   --base male   --style webtoon-boy  --kit-dir <키트> --out-dir <출력> --contract <contract.json>
<venv>/bin/python -I tools/blender/character_kit/build_irises.py --base male   --style webtoon-boy  --kit-dir <키트> --contract <contract.json>
# 파츠: 베이스마다 한 번(원본 GLB는 ~/.cache/toonstudio-kit/hyper3d-raw/, 항목은 hyper3d_generations.json)
<venv>/bin/python -I tools/blender/character_kit/build_parts.py --base female --base-model <출력>/base_model_female.npz --kit-dir <키트> --work <작업>/female --jobs 4
<venv>/bin/python -I tools/blender/character_kit/build_parts.py --base male   --base-model <출력>/base_model_male.npz   --kit-dir <키트> --work <작업>/male   --jobs 4
# 두 베이스의 숨김 표(<작업>/<베이스>/parts-registry.json)를 합쳐 kit.json을 만든다
<venv>/bin/python -I tools/blender/character_kit/build_kit_json.py --kit-dir <키트> --meta <출력>/base_meta_female.json --extra-meta <출력>/base_meta_male.json --contract <contract.json> --parts-json <합친 표>
pnpm exec tsx scripts/verify-character-kit.mjs --root <키트> --base all
```

T-포즈 상의 참조 이미지(프록시) 만들기: `<venv>/bin/python -I tools/blender/character_kit/proxy_reference.py -- --base-model <출력>/base_model_female.npz --kind shirt|blazer|hoodie|sailor --out <png>`
→ `mcp__hyper3d__rodin_create_uploads` + presigned PUT → `rodin_generate`(프롬프트 + `reference_upload_ids`) → `rodin_generate_bang`으로 의상·바지·피부 분리.
