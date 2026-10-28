# SketchUp 공식 Mac 배포본·공개 API의 REA 조사

- 기록일: `2026-10-29`
- 문서 상태: `current`
- 조사 범위 상태: `investigation partial`
- 목적: SketchUp의 웹툰 배경 제작 기능을 ToonStudio에서 독립적으로 구현할 때 필요한 기능·데이터·변환 계약과 후속 분석 대상을 확인한다.
- 완료 범위: 공식 Mac 원본 확보·해시, 읽기 전용 번들 조사, REA 리소스/디렉터리 인벤토리, 작은 기하 라이브러리의 Ghidra 분석 1건, 공개 API 기능 지도.
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

SDK framework는 실행하거나 Ghidra로 전체 import하지 않고 `nm -gU`만 조사했다. `SU` 접두의 T export 1,318개가 관측됐고, 이름 분류로 `SUCamera` 27개, `SUFace` 43개, `SUGeometryInput` 26개, `SUComponentDefinition` 36개, `SUComponentInstance` 24개, `SUSectionPlane` 15개, `SUModel` 108개를 확인했다. `SUModelCreateFromFile`, `SUModelSaveToFile`, `SUFaceCreate`, `SUFaceGetNumInnerLoops`, `SUGeometryInputAddFace`, `SUSectionPlaneSetPlane`가 포함된다. 이 목록은 SDK ABI 호출 계약·반환값·라이선스·전체 기능을 대신하지 않는다.

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
- 전체 SketchUp 본체, 전체 SDK framework, 다른 라이브러리의 대규모 Ghidra 분석은 수행하지 않았다. 공유 빌드 슬롯이 다시 점유된 뒤에는 기존 완료 세션의 캐시 조회·export·close만 수행했다.
- 새로운 native import는 공유 빌드 슬롯과 분석 목표를 먼저 확인한 뒤, 보존한 정확한 hash의 선택 사본에서 이어간다. 바이너리 이름만 보고 동일 빌드로 간주하지 않는다.
- 후속으로 면·구멍·오프셋의 퇴화 입력, 앞뒷면 UV, 공유 정의 수정, Scene의 선택적 상태 저장, 단면 엔티티의 저장/복원, 실제 `.skp` 입출력의 지원 범위를 독립적인 계약·테스트와 사용자 동선으로 확인해야 한다.

## 7. 검증 기록

실행 위치는 저장소 루트 `/Users/hjunkim/.codex/worktrees/4d86/toonstudio`다.

- `pnpm harness:check`: exit `0`, 에이전트 하네스 무결성 검사 통과.
- `pnpm exec secretlint docs/reports/sketchup-native-rea-2026-10-29.md`: exit `0`.
- `git diff --check -- docs/reports/sketchup-native-rea-2026-10-29.md`: exit `0`.

제품 소스 변경·새 빌드·전체 TSC·운영 배포는 이 조사에서 수행하지 않았다. 이 문서는 작업트리에 추가된 상태이며 별도 커밋·PR·병합은 수행하지 않았다.
