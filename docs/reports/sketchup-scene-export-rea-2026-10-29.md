# SketchUp 현재 모델 출력의 공식 계약과 GLTF writer 정적 분석

- 기록일: `2026-10-29`
- 문서 상태: `current`
- 조사 범위 상태: `investigation partial`
- 조사 대상: 공식 SketchUp `27.0.267` Mac 배포본의 `libSimLabGLTFWriter.dylib` arm64 사본.
- 목적: SK28 현재 장면 내보내기의 범위·선택·숨김·계층·단위·카메라 계약을 확인하고 ToonStudio의 독립 구현에 필요한 미확인 경계를 남긴다.
- 증거 종류: 공식 공개 문서와 Ghidra 정적 분석. SketchUp 호스트 실행이나 실제 native GLB 출력의 관측 결과는 아니다.

## 1. 공식 공개 계약

아래 내용은 `2026-10-29`에 확인한 공식 문서 기준이다. 형식별 옵션은 서로 전이하지 않는다. Ruby 문서는 잘못된 exporter 옵션을 조용히 무시한다고 명시한다.

| 항목 | GLB | DAE | OBJ |
| --- | --- | --- | --- |
| 출력 형식 | 도움말 UI는 `GLTF Binary File (*.glb)` | `.dae` | `.obj`와 `.mtl` |
| 선택 | 공개 GLB 옵션 없음. 실제 기본 선택 처리 미확인 | 선택 출력 옵션. 선택이 없거나 옵션을 끄면 전체 모델 | 선택 출력 옵션 |
| 단위·축 | 공개 단위·축 선택 옵션 없음 | 공개 단위·축 선택 옵션 없음 | 모델 단위가 기본값. 단위 선택과 Y/Z 교환 옵션 |
| 숨김 | 공개 옵션과 실제 기본 처리 미확인 | 숨긴 기하 포함 옵션 | 공개 숨김 옵션과 실제 기본 처리 미확인 |
| 계층 | 공개 보존 옵션 없음. 실제 결과 미검증 | 계층 보존 옵션. 끄면 평탄화하고 인스턴스를 개별 객체로 출력 | 평면적인 집합 구성으로 중첩 트리 계층은 보존하지 않음 |
| 기하 | 공개 제어 옵션 없음 | 삼각분할·양면·선 출력 옵션 | 삼각분할·양면·선 출력 옵션 |
| 카메라 | 공개 카메라 옵션 없음 | Ruby `camera_lookat`이 있으나 도움말은 Scenes를 손실 목록에 포함 | 공개 카메라 옵션 없음 |

근거: [Ruby Exporter Options](https://ruby.sketchup.com/file.exporter_options.html), [GLTF 안내](https://help.sketchup.com/en/sketchup/working-gltf-files), [COLLADA 안내](https://help.sketchup.com/en/sketchup/importing-and-exporting-collada-files), [OBJ 안내](https://help.sketchup.com/en/sketchup/exporting-obj-files). 도움말 세 문서의 수정일은 `2026-09-29`다.

GLB 도움말은 PNG/JPG/JPEG/JPE와 emission·occlusion·normal map, normal 부재 시 bump map, specular/glossiness·metallic/roughness 처리를 설명한다. 형식 소개의 애니메이션 언급을 SketchUp Scene 애니메이션 출력 보장으로 해석하지 않는다. `Preserve Drawing Origin`은 해당 문서에서 **가져오기** 옵션이다. DAE·OBJ의 양면 옵션은 앞·뒷면 재질을 보존하면서 폴리곤 수를 늘리며, 각각 텍스처 출력 옵션이 있다.

[Model#export](https://ruby.sketchup.com/Sketchup/Model.html#export-instance_method)는 확장자로 exporter를 고르며 SketchUp 2024+의 GLB·USDZ 추가를 기록한다. [C API 개요](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/index.html)의 SKP 읽기·쓰기 및 호스트 Importer/Exporter Interface와는 다른 경계다. 확보한 standalone SDK runtime에 내장 GLB/DAE/OBJ 변환을 직접 호출하는 API가 있다는 근거는 아직 없다. 일부 C API 상세 헤더 URL은 직접 접근 시 HTTP 403이었다.

## 2. 원본·분석용 사본의 식별

기존 [공식 Mac 배포본 REA 보고서](sketchup-native-rea-2026-10-29.md)의 원본을 재사용했다.

- 공식 URL: `https://download.sketchup.com/SketchUp-2027-0-267-174.dmg`
- 원본 DMG: `1,496,891,937 bytes`, SHA-256 `271f99c04bedc9ccca397fc90da22f8fe6ef077c79db301d4698d075e078b193`.
- 번들 버전: SketchUp `27.0.267`.
- 원래 member: `SketchUp 2027/SketchUp.app/Contents/Frameworks/extensions/libSimLabGLTFWriter.dylib`.
- universal 사본: `3,873,600 bytes`, x86_64/arm64, SHA-256 `75390e2fbe9836f590e446eafcae7af556277cfe421a1582199f2fda261a3646`.
- `lipo -thin arm64` 사본: `1,940,288 bytes`, SHA-256 `98e85aa98c036fa407b087bda3563c16b2d5a00c236329528c642a17dcbb9e36`.

원본 DMG를 임시 경로에 읽기 전용으로 연결하고 writer 한 파일만 복사했다. 분석 전 `disk4` 정상 분리와 mount 폴더가 빈 상태를 확인했다. 설치·SketchUp 호스트 실행·SDK 함수 실행·로그인·구매·라이선스 우회·원본 모델 업로드는 하지 않았다. 상용 바이너리와 디컴파일 원문은 저장소에 추가하지 않았다.

## 3. Ghidra 실행·근거 원장

REA `open_binary`에 `provider_id: "ghidra"`를 명시했다. 선택된 provider는 Ghidra `12.1.4`이며 run ID는 `3e60b4aa-4720-40c5-a9c9-76f9a3ee30c9`다. Hopper는 호출·설치하지 않았다. 전체 SketchUp 본체 대신 위 작은 arm64 writer만 한 번 초기 분석했다.

실제 Java 인수의 `-Xmx2G`, GC/컴파일러 스레드 각각 2개를 확인했다. 초기·분석 후 관측 RSS는 약 0.75/0.85 GiB였다. 이는 측정한 두 시점의 값이며 전체 실행 최대 RSS 측정치는 아니다. 기본 자동 분석 완료 후 같은 Program에서 함수와 참조를 조회했다. 도중 세션 재시작이나 동일 초기 분석 재시도는 없었다.

모든 주소는 **선택한 arm64 사본의 Ghidra 분석 주소**이며 universal 원본의 파일 offset이 아니다.

| 약칭 | 주소·작업 | Evidence ID |
| --- | --- | --- |
| P | 함수 심볼 검색 | `ev_bcb2cf54792ec58eed14c730ea7f3b7e811711d9aa7f8f6ee0ad5248883e3d3a` |
| S | 문자열 검색 | `ev_441c8306dbe467da3aad83bc443ab7b31d11d9524022b3bf506557eb96e71e3a` |
| F | `ListSupportedFormats`, `0x66b4` | `ev_c23c1f9e95690a791c99523e1cc92e085a2c8b5c599f6cf64931e9a708d2cc33` |
| E | `CSimLabGLTFExporter::Export`, `0x5fa8` | `ev_c966a2d08a7274d0df5ce38d44ab059c4661e1d187fc4b2495f0ff3d427390ea` |
| D | `exportDocument`, `0x7b44` | `ev_1afd931dc681a3bbc60141a77be1c5746b8b4c23a564d70f1e461918fe29d724` |
| N | `processNode`, `0x9a8c` | `ev_e09891b1a39fd0dd788ee2fec5ce73e46fadfd42c357e2c512fa304f7b64a600` |
| C | `processCamera`, `0xcd64` | `ev_ec1a60fd3a3c03a35c2ebdd482426d089d23b70acc86eb9f11623ec7fdbb6d58` |
| CA | 위 Camera의 ARM64 assembly | `ev_2288b9c617bae785954b029379d864396c901b616ff7e77afda08b79f62cf400` |
| O | `process3DObject`, `0xb418` | `ev_e3547333f33ad9483836991c4bf57b80a1ea7f53b86574adc657a90ade0ec924` |
| V | `processVec3Table`, `0xf240` | `ev_9ce31abb90ffd77f7d2b4e2e834cf535923b900c2e9bcc4c65149fa67c201e4c` |
| VN | `processVec3TableNoBuffer`, `0xce58` | `ev_d28429f9634a8b5ef71eb32efa641bb1a022a351129572cc4125c2cde77cfbdd` |

호출·참조 검증용 dossier도 보존했다. E의 부모는 `ev_6edd20ba1066966ff473136d9a60f48ef69f430957eb532dbc6de47bf61c0f1b`, D는 `ev_faf14cd86f5f5ea6289349d77f1213f368ae010e1a724ef0bdda0a6b65082aa7`, N은 `ev_57cefa6cd1cc8c084759f3fa189a99cbe4fb409b66cf3d903fe795baea9267e3`, C는 `ev_3359cfc5f947ac262e02602a8e47f2f1267dced2ebc659eb0558e84ab783c14c`다. D/N의 high-pcode value-flow는 각각 3,000 operation에서 잘렸으므로 완전한 값 흐름 증거로 취급하지 않는다. 의사코드·함수 body 참조와 value-flow의 범위를 구분한다.

## 4. 실제 정적 관측과 해석

### 4.1 형식 분기

**관측:** F는 `gltf`와 `glb` 두 형식을 각각 0/1 식별자로 등록한다. E는 설정 형식 값과 확장자 `glb`를 보고 bool을 만들고 D를 호출한다. D는 bool에 따라 `save_gltf`와 `save_binary_gltf`로 분기한다. D로 들어오는 call site `0x640c`도 확인했다.

**해석:** 이 라이브러리는 텍스트 glTF와 binary GLB를 쓰는 코드 경로를 포함한다. 공식 SketchUp UI 문서가 GLB만 안내한다는 사실과 양립한다. 이 라이브러리의 모든 형식이 SketchUp UI/Ruby에서 사용자에게 노출된다는 주장은 하지 않는다. 호스트가 실제로 어느 plugin 경로를 호출하는지는 미확인이다.

### 4.2 선택 범위

**관측:** D는 입력 `CSimLabDocument`의 `ListRootSceneNodes`를 얻어 삭제되지 않은 root마다 N을 호출한다. `ListAllSceneNodes` 결과 개수는 진행률 계산에 사용된다. 조사한 D/N의 해석 가능한 직접 호출에서 선택 집합을 읽어 root를 거르는 분기는 확인하지 못했다. 선택 관련 import 자체는 있으나 별도 참조가 있으므로 바이너리 전체의 선택 기능 부재로 해석하지 않는다.

**미확인:** SketchUp 호스트가 넘기는 document가 전체 모델인지 선택 범위로 미리 만들어진 문서인지, Ruby/UI가 선택 옵션을 별도로 처리하는지 알 수 없다. 따라서 이 결과만으로 GLB `선택만`을 지원한다고도, 선택을 무조건 무시한다고도 단정하지 않는다.

### 4.3 숨김·계층·변환

**관측:** N은 `Children`을 재귀 호출하고 반환된 자식 node ID를 부모의 자식 목록에 연결한다. `LocalMatrix`를 읽어 분해한 TRS와 비교하고, 맞지 않는 경우 행렬을 보존하는 분기가 있다. 기하·폴리곤이 있는 객체는 `IsHidden()`이 참이면 `process3DObject` 호출을 건너뛴다. 숨김 함수 thunk `0x113d9c`의 참조 `0xa380`도 확인했다.

**해석·경계:** 평탄화만 수행하는 writer는 아니며 입력 노드의 계층·로컬 변환을 다루는 경로가 있다. 숨김 검사는 자식 재귀 뒤의 기하 처리 부분에 있으므로 숨긴 부모의 하위 트리를 전부 제거한다고 해석하면 안 된다. 태그·상속 가시성을 `IsHidden`이 어떻게 계산하는지는 외부 `libSimLabCore`의 영역이다. SketchUp definition ID와 인스턴스 공유를 정확히 유지하는지, shear·음수 scale·정밀도를 실제 파일에서 보존하는지는 미검증이다.

### 4.4 축·단위

**관측:** D는 별도 glTF root node의 행렬에 `CreateRotaionAroundX(-1.57079632675)` 결과를 넣는다. O의 POSITION 경로는 V를 호출하며 V는 입력 X/Y/Z를 float로 바꿔 buffer에 넣는다. VN의 Draco 위치 경로도 같은 좌표 복사 형태다. 조사한 이 직렬화 부분에서는 inch→metre 계수 곱을 확인하지 못했다.

**추론:** X축 약 -90° root 회전은 Z-up→Y-up 변환과 일치하는 형태다. 다만 upstream SimLab 문서의 단위·축이 SketchUp 원본과 같은지는 미확인이다. 입력 좌표가 이미 미터로 바뀌었거나 상위 행렬에 배율이 들어갈 수 있으므로 `단위 변환 없음` 또는 `항상 inch`라고 단정하지 않는다. 공식 C API의 내부 inch 계약을 이 중간 문서의 단위로 그대로 옮기지 않는다.

### 4.5 카메라

**관측:** N의 `0xa3a4` 호출은 C의 반환값을 노드의 camera 참조 위치로 사용하는 형태다. C는 basic camera와 camera type을 읽고 객체를 구성하는 분기를 갖지만, glTF camera 배열에 완성된 항목을 추가하는 경로는 이 body에서 확인되지 않는다. 모든 정상 종료는 CA의 `0xce30`에서 32-bit `0xffffffff`를 반환한 뒤 `ret`로 끝난다. C의 caller 참조와 N의 저장을 함께 확인했다.

**해석·경계:** 이 함수 경로는 유효 camera ID를 반환하지 않는다는 정적 근거다. 함수명·camera type 처리 코드만 보고 카메라 출력 지원을 주장할 수 없다. FOV·직교 높이·near/far 직렬화 계약은 이 경로에서 입증되지 않았다. 다른 exporter나 SketchUp 호스트의 보충 경로까지 없다는 증거는 아니다.

D에는 별도 `processAnimation` 호출도 있다. 이 존재만으로 SketchUp Scenes가 glTF animation으로 변환된다고 해석하지 않는다. O는 material과 UV 처리 함수를 호출하지만 재질 전체 동등성이나 실제 출력 결과는 이번 thin slice에서 검증하지 않았다.

## 5. 판정과 다음 미확인 경계

| 질문 | 이번 증거로 답한 범위 | 남은 경계 |
| --- | --- | --- |
| GLB/glTF 두 writer가 있는가 | 내부 두 형식 등록과 실제 save 분기 확인 | SketchUp UI·Ruby 노출과 실제 plugin 호출 |
| 선택만 처리하는가 | 전달받은 문서 root를 순회 | 호스트의 선택 문서 생성·prefilter |
| 숨긴 기하를 처리하는가 | N에서 숨긴 객체의 기하 write를 건너뜀 | 태그·부모 상속·호스트가 보낸 문서 범위 |
| 계층·변환을 다루는가 | 자식 ID 재귀와 local TRS/행렬 경로 | SketchUp component identity와 실제 파일 정밀도 |
| 단위·축 변환은 무엇인가 | root X -90° 회전, buffer float 변환 | upstream 단위 권위·원본→최종 배율 |
| 카메라가 나오는가 | 조사한 C는 invalid ID를 반환 | 다른 출력 경로·호스트 보충 여부 |

자체 [native camera corpus](../../apps/web/tests/fixtures/skp/native-camera-golden.skp)는 SKP 저장·재읽기와 카메라 정답을 제공한다. [기존 corpus 검증](sketchup-native-camera-golden-2026-10-29.md)의 OpenSKP→ToonStudio/Three GLB 결과는 SketchUp 내장 exporter의 출력이 아니다. 후속 native 출력 검증에는 별도 실행 범위와 선택·숨김·중첩·재질 fixture가 필요하다. 이번 정적 분석은 실행 승인을 대신하지 않는다.

## 6. 재현 산출물·정리·검증

로컬 분석 산출물은 `/private/tmp/toonstudio-sketchup-scene-export-rea-20261029/` 아래에 있다.

- `writer-targets.json`: universal/arm64 전체 SHA와 크기.
- `writer-evidence.json`: 27 Evidence 기록, `5,526,276 bytes`, SHA-256 `3984a839b103826eecc42c7c85576547d71cbd9b85d9a74d35875ab2c0a48c6f`.
- `claim-evidence-index.json`: 주장·함수 주소·Evidence ID의 작은 대응표.
- `writer-analysis-snapshot.json`: close 시 보존한 분석 snapshot, `10,445,119 bytes`, SHA-256 `002655254b31471aef4e78e2beef22cd6822c0be9030f720285bfe46dbff7d95`. 캐시 재조회용이며 원본 바이너리·실행 결과를 대체하지 않는다.

완료 후 `close_binary`와 `binary_session`에서 `open:false`, `cleanup_pending:false`를 확인했다. 소유 Java PID `41730`과 decompiler PID `46253`, `51240`도 모두 부재했다. 대형 TSC·production build·앱/SDK 실행은 수행하지 않았다. 새 조사 문서 외 제품 파일과 기존 동결 보고서를 수정하지 않았다.

문서 범위의 `pnpm harness:check`, 변경 파일 Secretlint, `git diff --check`를 실행해 모두 통과했다. 작업 경로에는 다른 담당자의 진행 중 제품 변경이 있으며, 이 조사에서 소유·변경한 저장소 파일은 이 신규 보고서 한 개뿐이다. 커밋·PR·병합·배포는 수행하지 않았다.
