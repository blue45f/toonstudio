# SketchUp 공식 Mac 배포본·공개 API의 REA 조사

- 기록일: `2026-10-29`
- 문서 상태: `current`
- 조사 범위 상태: `investigation partial`
- 목적: SketchUp의 웹툰 배경 제작 기능을 ToonStudio에서 독립적으로 구현할 때 필요한 기능·데이터·변환 계약과 후속 분석 대상을 확인한다.
- 완료 범위: 공식 Mac 원본 확보·해시, 읽기 전용 번들 조사, REA 리소스/디렉터리 인벤토리, 작은 기하 라이브러리와 SDK Camera 함수 8개의 Ghidra 정적 분석, 공개 API 기능 지도.
- 미완료 범위: 전체 SketchUp 기능의 내부 알고리즘, 편집 UI에서 커널까지의 호출 경로, 실제 SketchUp 실행·입출력 동등성, ToonStudio 전체 대체 구현.

이 기록은 조사 증거다. 개별 심볼·문서·계산 함수가 존재한다는 사실을 ToonStudio 사용자 기능의 구현 완료로 해석하지 않는다.

## 1. 공식 원본과 접근 경계

[공식 다운로드 안내](https://help.sketchup.com/en/downloading-sketchup)는 `2026-10-21` 수정본에서 SketchUp 2027을 현재 버전으로 명시하며 다음 Mac 링크를 제공한다.

- URL: `https://download.sketchup.com/SketchUp-2027-0-267-174.dmg`
- HTTP 결과: `200`, 최종 URL 동일.
- 다운로드 크기: `1,496,891,937 bytes`.
- DMG SHA-256: `271f99c04bedc9ccca397fc90da22f8fe6ef077c79db301d4698d075e078b193`.
- DMG 메타데이터: `UDBZ`, GUID 파티션·HFS+, 암호화되지 않음, 이미지 내 소프트웨어 동의 화면 없음.
- `hdiutil attach -readonly -nobrowse -noautoopen`으로 임시 경로에 연결했다. 설치, 앱 실행, 로그인, 구매, 시크릿 입력, 라이선스 우회는 수행하지 않았다.
- 조사 후 `hdiutil detach` 결과 `"disk5" ejected.`를 확인했다. 마운트 폴더가 비어 있는 것도 재확인했다.

원본과 선택한 분석용 사본은 `/private/tmp/toonstudio-sketchup-native-20261029/` 아래에만 보존한다. 원본 DMG, 바이너리, 리소스 원문, SDK 파일, 디컴파일 결과를 저장소에 추가하지 않았다.

공식 [C SDK 안내](https://developer.trimble.com/docs/sketchup/tools/sdk/)와 [Developer Center](https://developer.sketchup.com/)는 Desktop SDK 접근 신청을 안내한다. 비인증 상태에서 신청 목적지 `https://extensions.sketchup.com/sketchup-sdk`와 기존 C API 문서 URL은 HTTP 403이었다. 이는 SDK/API 부재나 제공 중단의 증거가 아니다. 접근 신청·로그인을 진행하지 않았다.

## 2. 번들에서 관측한 파일과 버전

REA `inspect_plist`로 `com.sketchup.SketchUp.2027`, short version `27.0`, build `27.0.267`, executable `SketchUp`을 확인했다. 같은 DMG에는 LayOut `27.0.267`도 포함되어 있다.

| 선택한 파일 | 크기(bytes) | SHA-256 | 관측 형식 |
| --- | ---: | --- | --- |
| `Contents/MacOS/SketchUp` | 45,525,424 | `2914ae56a7d2f78567b5ed487de165fad270bae80c706272fe840efaf24c48aa` | arm64 Mach-O executable |
| `Contents/Frameworks/SketchUpAPI.framework/Versions/A/SketchUpAPI` | 6,498,016 | `9f8add9967ed6564fe3661f2cc41af277807d483c62c0fddeccbde354419084d` | arm64 Mach-O dylib |
| `Contents/Frameworks/libcommon_geometry-shared.dylib` | 451,632 | `8a9aa81f3398ad15f651ae2b6a3d56f7b8b55941716ac861be59c06de4b45891` | arm64 Mach-O dylib |
| `Contents/Frameworks/libcommon_geoutils-shared.dylib` | 79,280 | `a2e91ccbbc5a935820958a1fd47ad6f661f0d304832ab3a261c11104f3bf97f1` | arm64 Mach-O dylib |
| `SketchUpAPI.framework/Versions/A/Libraries/libcommon_units-shared.dylib` | 214,112 | `d1082f384e92bf3e86ec48550e8c8d44a38e2ddf09951656fb60e96f4717f3aa` | arm64 Mach-O dylib |
| `Contents/Info.plist` | 5,194 | `ead8a9a839ec74b769c14caccf39d320cc5d054c2c840342f52e2ebdfaebcb47` | XML plist |

`codesign --display`는 TeamIdentifier `J8PVMCY7KL`과 코드서명 메타데이터를 표시했다. 이 명령은 전체 코드서명·인증서 체인·노터리 검증을 완료한 증거가 아니다.

일반 파일 조사에서 native 후보 176개를 목록화했다. `libTKBool`, `libTKOffset`, `libcollada`, Ruby 3.4.9, Qt, Chromium Embedded Framework 등의 파일명이 보였다. 이는 로드 여부나 특정 UI 기능의 구현 연결을 확정하지 않는다.

## 3. REA Evidence 원장

도구는 REA `6.8.0`, `reverse-engineer-anything` 스킬 `49`를 사용했다. 네이티브 분석 시 `open_binary`에 **`provider_id: "ghidra"`**를 명시했으며 Hopper를 호출하거나 설치하지 않았다.

| 조사 | Evidence ID | 실제 증거 범위 |
| --- | --- | --- |
| SketchUp 앱 디렉터리 인벤토리 부모 | `ev_2a8ffa46a19bbafb1ee3855c5396d4ff513456a83045a265cb5e9016fceec6ec` | 안정적으로 읽은 메타데이터·부분 읽기 범위 |
| 디렉터리 인벤토리 요약 | `ev_f30a4f76dc4bdfea889a0ce4b172f73cd184e0f65a6f19e9b4aa0115a2df0978` | 위 부모의 요약 투영 |
| `Info.plist` | `ev_4dc5cbb2a22e774c477101eb84a1a208bd3c2479e6136929968b5f2e50a96c72` | 버전·bundle ID·문서 형식 선언 |
| 기하 dylib Ghidra overview | `ev_4beddac67a9587d8080b3ac63b8842e6c6096a1e2aaea57215f292761776245c` | image base·segment·Ghidra 정의 인벤토리 |
| `PointInPolygon` dossier 부모 | `ev_eb9578ff943ada0c709db951e4b85ba280d441318492d6fe2d354523ce76d64e` | 단일 함수의 정적 역어셈블·의사코드·CFG·value flow |
| 함수 요약 | `ev_48c8e173f5392bff7ff00f19920200b8b06aa5ba86637bbf2efd1ed78297ada4` | 위 dossier의 요약 투영 |
| Mach-O inspection 부모 | `ev_5afbb0b9298222022681c48e9e469ecb818a547a376610bc8fb18b6a881dc74c` | native 도구의 header·dependency·symbol 관측 |

앱 디렉터리 인벤토리는 4,789개 항목을 검사하고 파일 4,099개에서 239,407 bytes를 읽었지만 **32MiB 메타데이터 표현 예산**에 도달해 `partial`로 끝났다. 디렉터리 digest `7c61f82a9260a458c6cfb80748a45aa7cbe91c949541eadd67f8a810ce4e6a4f`는 전체 파일 내용의 해시가 아니다. 파일별 전체 해시는 2절 표의 값을 사용한다.

Ghidra 바인딩은 버전 `12.1.4`, OpenJDK 21, `ephemeral-source-immutable`, 기본 자동 분석 완료 상태를 확인했다. 기하 dylib의 image base는 `0x0`이며 정의된 procedure 976개와 string 2,655개가 보고됐다. 이 수치는 모든 실제 함수·문자열을 발견했다는 뜻이 아니다.

## 4. 실제 native 함수에서 확인한 좁은 범위

분석 대상은 `libcommon_geometry-shared.dylib`의 주소 `0x6cd4`, `ClipperLib::PointInPolygon` 한 함수다. REA는 67개 assembly 항목, 18개 basic block, value-flow operation 105개를 보고했다. 의사코드 길이는 1,915 UTF-16 code units이며 value flow의 truncation은 없었다.

Ghidra가 복원한 정적 흐름에서는 정수 점·폴리곤 입력, 꼭짓점 수가 3 미만인 경우의 `0` 반환, 점/선분 경계 비교에서의 `-1` 반환, 교차 판정에 따른 `0/1` 상태 전환이 관측된다. 이것은 **디컴파일 기반 추론**이며 SketchUp에서 직접 실행한 경계값 테스트 결과가 아니다. 호출자 0개라는 현재 인벤토리만으로 미사용 함수라고 판단하지 않는다.

같은 dylib의 공개 심볼 목록에서 `ClipperOffset::AddPath`, `DoOffset`, `DoMiter`, `DoRound`, `CleanPolygon`, `SimplifyPolygon`, `CPolygonMesh::SetUVFront`, `SetUVBack`, `Transform` 등을 확인했다. 이 심볼은 오프셋·다각형 정리·메시·앞뒷면 UV에 대한 후속 분석 후보다. SketchUp Offset/Push-Pull UI가 해당 함수를 호출한다는 연결은 아직 증명하지 않았다.

SDK framework의 초기 인벤토리는 실행 없이 `nm -gU`로 조사했다. `SU` 접두의 T export 1,318개가 관측됐고, 이름 분류로 `SUCamera` 27개, `SUFace` 43개, `SUGeometryInput` 26개, `SUComponentDefinition` 36개, `SUComponentInstance` 24개, `SUSectionPlane` 15개, `SUModel` 108개를 확인했다. `SUModelCreateFromFile`, `SUModelSaveToFile`, `SUFaceCreate`, `SUFaceGetNumInnerLoops`, `SUGeometryInputAddFace`, `SUSectionPlaneSetPlane`가 포함된다. 이 목록은 SDK ABI 호출 계약·반환값·라이선스·전체 기능을 대신하지 않는다. 후속 Camera 정적 분석은 8절에 별도로 기록한다.

## 5. 공개 문서에서 확인한 기능 계약

| 기능군 | 확인한 계약과 구현 판단 기준 | 공식 출처 |
| --- | --- | --- |
| 면 편집·UV | `Face#pushpull(distance, copy=false)`의 거리는 면 법선 방향이다. `followme(edges)`, `loops`, `outer_loop`를 구분한다. 앞·뒷면 재질과 UV 투영/위치 고정을 별도 보존한다. | [Face](https://ruby.sketchup.com/Sketchup/Face.html) |
| 도형·교차·작도 | Entities는 drawing context다. `add_face`, `add_circle`, `add_arc`, `add_ngon`, `add_group`, `add_instance`, `intersect_with`, 보조선·치수·3D 문자 생성 API가 있다. 교차 연산은 입력과 결과 context의 변환을 별도로 받는다. | [Entities](https://ruby.sketchup.com/Sketchup/Entities.html) |
| 공유 컴포넌트 | 인스턴스는 `definition`과 `transformation`을 가진다. `make_unique`는 정의 공유를 끊고 `explode`는 분해한다. 외형만 링크하는 복제를 전체 컴포넌트 편집 지원으로 간주하지 않는다. | [ComponentInstance](https://ruby.sketchup.com/Sketchup/ComponentInstance.html) |
| 솔리드 | Group/ComponentInstance의 `union`, `subtract`, `trim`, `split`, `outer_shell`, `intersect`, `volume`는 결과·원본 유지·수밀성을 각각 검증할 기능이다. 이름만으로 임의 메시의 정확한 불리언을 보증하지 않는다. | [Group](https://ruby.sketchup.com/Sketchup/Group.html) |
| 카메라 | `eye`, `target`, `up`, `perspective?`, `height`, `fov`, `fov_is_height?`, `focal_length`, `center_2d`, `scale_2d`가 있다. 직교 높이, 화각의 수직/수평 기준, 초점거리 mm를 구분한다. | [Camera](https://ruby.sketchup.com/Sketchup/Camera.html) |
| Scene 저장 | UI Scene은 API Page다. 카메라 외에도 단면·가시성·태그·렌더링·그림자·스타일·환경과 각 상태의 저장 여부 플래그를 가진다. | [Page](https://ruby.sketchup.com/Sketchup/Page.html) |
| 단면 | `set_plane`, `get_plane`, `activate`, `active?`, `symbol`, `name`가 있다. 뷰포트 전역 clipping과 저장 가능한 단면 엔티티를 구분한다. | [SectionPlane](https://ruby.sketchup.com/Sketchup/SectionPlane.html) |
| 스타일 | `RenderMode`, `EdgeDisplayMode`, `EdgeColorMode`, `DrawBackEdges`, `SectionCutFilled`, `AmbientOcclusion` 등을 개별 상태와 렌더 소비 경로로 확인한다. | [RenderingOptions](https://ruby.sketchup.com/Sketchup/RenderingOptions.html) |
| 태양·그림자 | `Latitude`, `Longitude`, `NorthAngle`, `ShadowTime`와 계산된 `SunDirection`, `SunRise`, `SunSet`을 구분한다. 계산값 일부는 read-only다. | [ShadowInfo](https://ruby.sketchup.com/Sketchup/ShadowInfo.html) |
| 추론·도구·VCB | `InputPoint#pick`은 화면 hit-test에 추론을 더한다. `instance_path`, 추론 고정, Tool의 `onMouseMove`, `onUserText`, `enableVCB?`를 함께 확인해야 실제 편집 도구 동작을 판단할 수 있다. | [InputPoint](https://ruby.sketchup.com/Sketchup/InputPoint.html), [Tool](https://ruby.sketchup.com/Sketchup/Tool.html) |
| 단위·변환·Undo | Length 내부는 inches이고 사람용 지역화 문자열은 저장용이 아니다. 16원소 변환 행렬·피벗 회전과 Model의 `start_operation`/`commit_operation`/`abort_operation`을 자체 장면의 단위·명령 경계와 대조한다. | [Length](https://ruby.sketchup.com/Length.html), [Transformation](https://ruby.sketchup.com/Geom/Transformation.html), [Model](https://ruby.sketchup.com/Sketchup/Model.html) |

공개 HTML 14개에서 메서드 ID 383개를 추출해 로컬 인덱스에 기록했다. 이는 기능 수나 전체 제품 커버리지 비율이 아니다. 공개 문서는 이후 수정될 수 있으며 본 조사에서 받은 HTML별 해시는 로컬 증거 폴더에 있다.

영문 리소스에서는 `Localizable.strings` 1,326개 항목, `Styles.strings` 235개 항목, `Components.strings` 2,962개 항목을 일반 `plutil`로 읽었다. 단면 활성화·장면/카메라 처리·컴포넌트 정의의 유일성·동적 컴포넌트 관련 텍스트가 존재한다. 이것은 문자열 관측이며 기능의 실행 가능성·품질을 입증하지 않는다.

## 6. 보존·정리와 후속 범위

- 앱 리소스 조사 뒤 `rea-inventory-evidence.json`을 export했다: 3 records, 3,182,488 bytes.
- native 조사 뒤 `rea-geometry-evidence.json`을 export했다: 7 records, 254,474 bytes.
- `geometry-analysis-snapshot.json` 저장 후 `close_binary` 성공을 확인했다: snapshot 350,641 bytes.
- 마지막 `binary_session`은 `open: false`, `cleanup_pending: false`였다. 마운트 해제도 완료했다.
- 45MB SketchUp 본체와 SDK 전체 함수의 일괄 디컴파일은 수행하지 않았다. 초기 기하 세션에서는 공유 빌드 슬롯이 다시 점유된 뒤 캐시 조회·export·close만 수행했다. 이후 승인된 6.5MB SDK 사본 하나를 import해 Camera 함수만 조사한 결과는 8절에 기록한다.
- 새로운 native import는 공유 빌드 슬롯과 분석 목표를 먼저 확인한 뒤, 보존한 정확한 hash의 선택 사본에서 이어간다. 바이너리 이름만 보고 동일 빌드로 간주하지 않는다.
- 후속으로 면·구멍·오프셋의 퇴화 입력, 앞뒷면 UV, 공유 정의 수정, Scene의 선택적 상태 저장, 단면 엔티티의 저장/복원, 실제 `.skp` 입출력의 지원 범위를 독립적인 계약·테스트와 사용자 동선으로 확인해야 한다.

## 7. 검증 기록

실행 위치는 저장소 루트 `/Users/hjunkim/.codex/worktrees/4d86/toonstudio`다.

- `pnpm harness:check`: exit `0`, 에이전트 하네스 무결성 검사 통과.
- `pnpm exec secretlint docs/reports/sketchup-native-rea-2026-10-29.md`: exit `0`.
- `git diff --check -- docs/reports/sketchup-native-rea-2026-10-29.md`: exit `0`.

제품 소스 변경·새 빌드·전체 TSC·운영 배포는 이 native 조사에서 수행하지 않았다. 조사 담당자는 별도 커밋·PR·병합을 수행하지 않았다.

## 8. Camera 후속 분석: FOV 축과 단위의 보존 경계

목표는 OpenSKP Page의 단일 `fov` 값을 수직 화각으로 가정할 수 있는지 확인하는 것이다. 2절의 SDK 사본 `6,498,016 bytes`, SHA-256 `9f8add9967ed6564fe3661f2cc41af277807d483c62c0fddeccbde354419084d`를 다시 검증하고 `provider_id: "ghidra"`로 열었다. 첫 Camera 심볼 검색은 단일 import·기본 자동 분석이 완료된 뒤 반환했다. 같은 요청을 중복 시작하지 않았고 Ghidra `12.1.4`의 동일 세션에서 후속 조회를 진행했다. analysis run ID는 `578fd2d7-7b1d-4a1e-afe5-6f20fad66e25`다.

### 8.1 공식 문서 계약

공식 [Camera 문서](https://ruby.sketchup.com/Sketchup/Camera.html)는 `fov`를 원근 카메라의 도 단위 값으로 설명하고, `fov_is_height?`로 수직·수평 측정 기준을 별도로 확인하도록 한다. `aspect_ratio`의 `0`은 View의 비율을 따른다는 의미다. 직교 `height`는 인치 단위다. 이들은 Ruby API 계약이며 C SDK 함수의 모든 ABI·반환 코드 의미를 대신하지 않는다.

### 8.2 정적 본문과 호출 관계에서 관측한 것

`SUCamera` 검색 Evidence `ev_0834b6bffe4da00ae5e0deda7f0eb4c5ffa92b7511e93f44b064f54f780e9bf4`는 이 빌드의 정의된 Camera 함수 27개를 반환했다. 본문은 아래 8개 함수만 확인했다. 오프셋은 이 SHA의 Ghidra 관측이며 공개 구조체 레이아웃이나 다른 빌드의 ABI로 일반화하지 않는다.

| 함수·주소 | 관측한 정적 흐름 | 주요 Evidence |
| --- | --- | --- |
| `SUCameraGetPerspectiveFrustumFOV`, `0x932c` | 원근 상태 필드 `+0x68`을 검사한 뒤 `+0x70`의 8바이트 값을 복사한다. FOV 축 플래그를 읽거나 변환하지 않는다. | dossier `ev_93ac5869299a5b558e17db220237e5b0d9ac1e6137ba6a1308e837f2493e33e2` |
| `SUCameraGetFOVIsHeight`, `0x9528` | 별도 1바이트 필드 `+0x88`을 복사한다. | dossier `ev_ec695fc3f9e2fbc1bea86a23bfe6f5d05518c3aaf9e4766bba945fa16458938c` |
| `SUCameraSetFOVIsHeight`, `0x950c` | `+0x88`만 독립적으로 갱신한다. | `ev_7a10934debe8da2d22e7978355e054c7234aa8b3dd1fbdcc38edce9fb9a0da94` |
| `SUCameraSetPerspectiveFrustumFOV`, `0x92d0` | `CCamera::SetPerspective(true)`를 호출하고 `+0x70`을 저장하며 `+0x88`을 `1`로 설정한다. 이 setter의 동작이 기존 모든 Page의 화각 기준을 증명하지는 않는다. | `ev_e28c0aab4f6556f21ff5d7fcf5b0386ffbf2ec92ff091465ba292ce81072b7bb` |
| `SUCameraGetOrthographicFrustumHeight`, `0x93c0` | 원근 상태를 거른 뒤 `+0x78`의 8바이트 값을 복사한다. getter 자체에는 길이 단위 환산이 없다. | dossier `ev_3241bcf433b74325c5f3b1e230f83593a6c05c284ea50aef57b0a254aca84488` |
| `SUCameraSetOrthographicFrustumHeight`, `0x936c` | `CCamera::SetPerspective(false)` 호출 뒤 `+0x78`에 저장한다. | `ev_afbfd1a3b315b3db85a8c87abbaff50771936e97ac81606194e1fe73b696e9ab` |
| `SUCameraGetAspectRatio`, `0x9428` | `+0x80`을 읽는다. 값이 `1e-5` 미만인 경로에서는 출력에 `0`을 쓰고 반환 코드 `9`를 돌려준다. Ruby의 View 비율 계약과 C SDK 반환 코드를 동일시하지 않는다. | dossier `ev_30bc5c7452a12cca3d66345f33ebdadd89aeeae0f85739023efd9e3f719e0c98` |
| `CCamera::SetPerspective`, `0x886d8` | 저장된 FOV에 `0.5 × 0.0174532925199433`을 곱해 `tan`에 넘긴다. 원근→직교 분기에서는 그 결과의 두 배와 eye-target 거리로 높이 필드를 계산한다. | dossier `ev_be231590291f7ca14dbed870e7b636e854a14a43523330ebed3ea2ac3ecb0011` |

두 setter에서 `0x886d8`로 향하는 직접 호출은 각각 `ev_2d4e3778304950249b3e78befd5ad6cee3ea81b574aa0cc67bd09ec1e8fb9abd`, `ev_812585532a8fc7ade7116f045a47a1a75b2a9cb321c36b37b44264b772004a27`에 보존했다. 내부 함수 dossier는 67개 assembly 항목·6개 basic block·3개 resolved callee와 truncation 없는 value flow를 보고했다. 디컴파일의 레지스터 변수·추정 인자 순서는 원본 SDK 헤더가 아니므로 호출 서명으로 복사하지 않는다.

FOV 필드가 삼각함수 전에 π/180을 곱하는 값이라는 해석은 **정적 계산에 근거한 추론**이며, 공개 문서의 도 단위 계약과 일치한다. height getter의 raw 복사만으로 인치 단위가 증명되는 것은 아니다. 인치 계약은 위 공식 문서에서 확인했다. SketchUp 앱 실행, C SDK 호출, 실제 카메라 렌더·경계값 실험은 하지 않았다.

### 8.3 OpenSKP에서 소실된 정보와 가져오기 판단

설치된 OpenSKP `1.3.0`의 `dist/index.js` SHA-256은 `3b4a418e320920083aefa7551a924954b336e5addd0182971c7c66aeab575c2d`다. `parsePages`는 Camera TLV에서 eye·target·up, tag `13508`의 `fov`, tag `13506`의 원근/평행 값, tag `13507`의 직교 높이를 읽는다. 이후 Page 출력도 이 값들을 복사하지만 **FOV가 높이/너비 중 어느 기준인지와 Camera/View aspect ratio는 노출하지 않는다**. `fov`가 없는 경우 `35`를 보충하는 기본값도 원본 저장값과 구분할 수 없다.

따라서 native에서 별도 FOV 축 플래그의 존재를 확인했어도, 그것을 이미 파서가 축 정보를 버린 개별 Page에 되붙일 근거는 없다. 가져오기에서는 FOV scalar를 보존하고 측정 기준은 `not-exposed`로 남겨야 한다. 수직 화각으로 간주하거나, 현재 ToonStudio 화면 비율을 원본 View 비율이라고 기록하면 안 된다. eye/target·직교 높이의 길이 환산과 FOV 각도·up 방향의 처리는 각각 구분해야 한다.

### 8.4 후속 증거·정리

- `rea-camera-evidence.json`: 22 records, 286,641 bytes, SHA-256 `e6058e387235c11ccf1587db82a1ed4977f6fffe6cc8a70523c6d182451a27a9`.
- `camera-analysis-snapshot.json`: 471,160 bytes, SHA-256 `ec390f4cba5a81c4eec73da5df0e001b9e8a4137026d66ab72cb9a40d3f3980f`.
- 공개 Camera HTML 보존본 SHA-256: `354633300fd33375a58f498a42751fc71967da7632bd835386829f4595ea2989`.
- 원본 파일·디컴파일·원장은 계속 `/private/tmp/toonstudio-sketchup-native-20261029/`에만 보존한다. 저장소에는 이 조사 설명만 추가했다.
- export·snapshot 저장 뒤 `close_binary` 성공, 마지막 `binary_session`의 `open: false`, `cleanup_pending: false`를 확인했다. 45MB 본체·전체 함수 일괄 디컴파일·대상 실행은 수행하지 않았다.
- Camera 절 추가 후 `pnpm harness:check`, 이 문서의 Secretlint, `git diff --check`가 각각 exit `0`으로 통과했다.

## 9. Native C API golden fixture 준비 조사와 중단된 최소 읽기 실험

이 절의 상태는 **`investigation partial / native read unverified`**다. 공식 배포의 export·파일 배치와 공개 C API 계약은 확인했지만, 소유 Python subprocess의 `dlopen`이 제한 시간 안에 반환하지 않았다. SDK 초기화·template 읽기·native 카메라 값 확보에 성공한 기록이 아니다. 이 결과로 SDK 부재나 인증 문제를 판단하지 않는다.

### 9.1 읽기 전용 inventory에서 확인한 사실

같은 공식 DMG를 `readonly`, `nobrowse`, `noautoopen`으로 잠깐 연결해 파일 목록과 정적 Mach-O 정보를 읽었다. 원본 `SketchUpAPI` SHA-256은 2절의 분석용 사본과 일치한다. `file`·`nm -gU`·`otool -L`·`otool -l`은 arm64 `MH_DYLIB`, 최소 macOS `15.0`, SDK `26.2`와 다음 정의된 외부 export를 보여준다. 주소는 이 이미지의 상대 symbol address이며 다른 빌드의 ABI로 일반화하지 않는다.

| 요청한 C API | 주소 | 관측 |
| --- | --- | --- |
| `SUInitialize` | `0x45b1c` | export 존재 |
| `SUModelCreate` | `0x27b6c` | export 존재 |
| `SUModelCreateFromFile` | `0x27c70` | export 존재 |
| `SUModelSaveToFile` | `0x28498` | export 존재 |
| `SUModelAddScenes` | `0x2a104` | export 존재 |
| `SUSceneGetCamera` | `0x30598` | export 존재 |
| `SUCameraGetFOVIsHeight` | `0x9528` | export 존재 |

`SUTerminate`, Model·Scene·Camera의 release, Scene 열거, Camera orientation·projection·FOV·aspect·직교 높이의 getter/setter도 export되어 있다. 이 목록은 호출 성공을 증명하지 않는다.

API의 `LC_RPATH`는 `@loader_path/Libraries`이며 원래 framework에는 다음 private dylib 7개가 모두 arm64로 존재한다: `libSketchUpCommonPreferences`, `libcommon_geoutils-shared`, `libcommon_image-shared`, `libcommon_units-shared`, `libcommon_zip-shared`, `libcommon_geometry-shared`, `libcommon_utils-shared`. 조사한 private 전이 의존성은 이 집합 안에서 닫힌다. 나머지 정적 의존성에는 AppKit·Cocoa·CoreFoundation·Foundation·OpenGL·CoreGraphics·ImageIO·objc·libc++·libSystem이 있다. 실제 실험은 평탄화된 `targets/` 사본 대신 이 원본 framework 위치를 사용했다. 정적 링크 구조만으로 UI·인증·초기화 부작용이나 헤드리스 동작을 확정하지 않는다.

앱 내부에서 `.skp` 파일 371개를 확인했다. 14개 언어의 `Templates`에 각 21개, 합계 294개가 있고, `Resources/Components`에는 70개, 나머지 경로에는 7개가 있다. 예시는 `Resources/en-US/Templates/Temp01a - Simple.skp`, `Temp04a - AEC.skp`, `Resources/Tutorials/Tutorial01.skp`다. 파일 이름으로 단위·카메라 상태를 추정하지 않았으며, 공식 template를 golden 정답이나 재배포용 fixture로 사용하지 않았다.

### 9.2 공식 공개 문서에서 먼저 확인한 호출·수명 계약

공식 문서의 검색 응답으로 아래 signature와 수명 설명을 확인했다. 직접 페이지 열기는 HTTP `403`을 반환했으며, 로그인이나 인증 우회를 하지 않았다. 검색으로 받은 공식 문서 설명과 로컬 바이너리의 export 존재를 구분한다.

| 계약 | 확인한 signature·사용 조건 | 공식 출처 |
| --- | --- | --- |
| 초기화·종료 | `void SUInitialize()` → API 사용 → `void SUTerminate()`. standalone 사용의 main thread에서 호출한다. Live API에서는 이 초기화·종료 함수를 사용하지 않는다. | [initialize.h](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/initialize_8h.html), [C API 개요](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/index.html) |
| 파일 읽기·모델 해제 | `enum SUResult SUModelCreateFromFile(SUModelRef *model, const char *file_path)`; `enum SUResult SUModelRelease(SUModelRef *model)`. 생성된 모델은 반드시 해제하며 소유된 하위 객체를 별도로 해제하지 않는다. 파일 읽기의 deprecated 표기와 `WithStatus` 대체 API도 확인했다. | [SUModelRef](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/struct_s_u_model_ref.html) |
| Scene 열거 | `SUModelGetNumScenes(SUModelRef model, size_t *num_scenes)`; `SUModelGetScenes(SUModelRef model, size_t len, SUSceneRef scenes[], size_t *count)`. 모두 `enum SUResult`를 반환한다. | [SUModelRef](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/struct_s_u_model_ref.html) |
| Camera 읽기·소유권 | `SUSceneGetCamera(SUSceneRef scene, SUCameraRef *camera)`와 `SUModelGetCamera(SUModelRef model, SUCameraRef *camera)`는 내부 카메라 참조를 반환한다. 반환된 참조에 `SUCameraRelease`를 호출하지 않는다. | [SUSceneRef](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/struct_s_u_scene_ref.html), [SUModelRef](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/struct_s_u_model_ref.html) |
| Camera orientation | `SUCameraGetOrientation(SUCameraRef camera, struct SUPoint3D *position, struct SUPoint3D *target, struct SUVector3D *up_vector)`. `SUPoint3D`·`SUVector3D`는 x/y/z의 `double` 3개다. 위치 좌표는 inches다. | [SUCameraRef](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/struct_s_u_camera_ref.html), [SUPoint3D](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/struct_s_u_point3_d.html), [SUVector3D](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/struct_s_u_vector3_d.html) |
| Camera 조건부 값 | `SUCameraGetPerspective`·`SUCameraGetFOVIsHeight`는 `(SUCameraRef, bool *)`, `SUCameraGetPerspectiveFrustumFOV`·`SUCameraGetAspectRatio`·`SUCameraGetOrthographicFrustumHeight`는 `(SUCameraRef, double *)`다. 모두 `enum SUResult`를 반환한다. FOV 각도와 FOV 축 플래그는 따로 읽는다. | [SUCameraRef](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/struct_s_u_camera_ref.html) |

공식 공유 `SketchUpAPI/common.h`의 [`DEFINE_SU_TYPE`](https://extensions.sketchup.com/developers/layout_c_api/layout/_sketch_up_a_p_i_2common_8h_source.html)는 `void *ptr` 하나를 가진 참조 구조체다. 이 layout과 공개 scalar·geometry 계약을 명시적으로 바인딩했으며, 8절 디컴파일의 추정 인자 순서를 호출 signature로 사용하지 않았다. [SUResult 열거](https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/common_8h.html)에서 `0`은 `SU_ERROR_NONE`, `9`는 `SU_ERROR_NO_DATA`다. 화면 비율 사용·투영 종류 불일치 등 조건부 데이터 부재를 `SU_ERROR_UNSUPPORTED`나 성공 값으로 바꾸지 않는 방식으로 probe를 준비했다.

### 9.3 한 번의 소유 subprocess에서 실제 관측한 중단 지점

실험 파일과 원시 결과는 `/private/tmp/toonstudio-sketchup-native-20261029/`에만 기록했다. 제품 source와 SDK 바이너리는 변경하지 않았다.

- 실행 파일: Xcode 제공 `/Applications/Xcode.app/Contents/Developer/usr/bin/python3`의 별도 소유 subprocess.
- 실행 정책: `/usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network*)'`로 outbound network를 차단하고, 30초 제한·소유 process group 정리를 적용했다.
- 대상: 원본 framework의 `Versions/A/SketchUpAPI`와 영문 `Temp04a - AEC.skp` 한 파일. template SHA-256은 `854bd2ec83bbf7bf3012bc7f50b17724290404badaeaa60578d72abc95f36d98`다.
- 실제 마지막 checkpoint: **`before-dlopen`**. `ctypes.CDLL`이 반환했다는 `loaded` checkpoint는 기록되지 않았다.
- 30.005초 경과 뒤 소유 process group에 `SIGTERM`을 보내고 subprocess exit `-15`, `timedOut: true`를 확인했다. stderr는 비어 있었다.
- **자동 재시도는 0회**다. sandbox·의존성·라이선스 설정을 바꿔 같은 native 호출을 재실행하지 않았다.

따라서 `SUInitialize`, API version 조회, `SUModelCreateFromFile`, Scene 열거, Camera getter, `SUModelRelease`, `SUTerminate`는 모두 **미실행**이다. 라이브러리 constructor는 `dlopen` 도중 실행될 수 있으므로 native 코드가 전혀 실행되지 않았다고 단정하지 않지만, SDK 초기화나 template 메타데이터 읽기에 성공했다고 표현하지 않는다. 멈춘 원인이 의존성·인증·네트워크 정책·initializer 중 무엇인지는 현재 증거로 알 수 없다.

성공한 native 읽기를 전제로 허용된 같은 파일의 OpenSKP 비교와 local golden probe도 수행하지 않았다. SketchUp 앱 UI 실행 명령·로그인·설치·라이선스 우회·바이너리 패치·원본 template 재배포·SDK 제품 포함 변경은 하지 않았다. 새로운 Ghidra import나 전체 분석도 시작하지 않고 기존 Ghidra `12.1.4` Camera 증거를 재사용했다.

### 9.4 정리·남은 원인 조사·검증

소유 PID·process group `38337`의 잔존 프로세스가 없음을 확인했다. 첫 DMG detach는 `리소스 사용 중`을 반환했지만, 열린 파일 소유자가 관측되지 않은 뒤 정상 detach가 `"disk4" ejected.`로 끝났다. 이는 SDK 실험의 재시도가 아니라 읽기 전용 조사 볼륨 정리다. 강제 분리나 다른 프로세스 종료는 하지 않았다.

원시 증거는 `camera-golden-inventory.json`, `camera-native-read-process.json`, `camera-native-template-read.json`, `camera-native-read-final.json`과 소유 probe 파일에 있다. 특히 `camera-native-template-read.json`의 `running`은 종료 직전 마지막 checkpoint이고, 최종 판정은 `camera-native-read-final.json`의 `inconclusive-stopped`다.

다음 원인 조사는 별도 제어 실험으로 남긴다. 먼저 멈춘 `dlopen`의 소유 process stack·dyld/initializer 대기 지점을 제한된 시간 안에 관측하고, 그 증거로 필요한 의존성·호스트 환경을 판단해야 한다. 초기화 성공이 확인되기 전에는 native camera golden 값을 얻었다고 표시하거나 OpenSKP의 미노출 필드를 native 값으로 보충하지 않는다.

이 절 추가 후 `pnpm exec secretlint docs/reports/sketchup-native-rea-2026-10-29.md`, `pnpm harness:check`, `git diff --check -- docs/reports/sketchup-native-rea-2026-10-29.md`가 각각 exit `0`으로 통과했다. 전체 TSC·production build·커밋·배포는 이 후속 조사에서 수행하지 않았다.
