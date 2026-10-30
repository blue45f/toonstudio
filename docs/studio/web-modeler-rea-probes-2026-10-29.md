# 모델러 공개 소스 REA 분석·준비 기록

확인일: **2026-10-30**. SculptGL은 선택 JavaScript 4파일의 첫 REA 정적 분석과 제한된 의미 추적을
완료했다. 구문 분석은 4파일 모두 완료됐지만 application coverage는 `partial`, semantic coverage는
`unknown`이며 전체 앱이나 실제 조형 동작을 검증한 결과는 아니다. three.js Editor는 고정 원본을
복원하고 해시를 확인한 상태이며 **실제 REA 분석은 실행하지 않았다**.

## current — 2026-10-30 입력 복원과 보존

2026-10-29 준비 때 사용한 `/tmp/rea-targets`와 바이트 receipt는 2026-10-30 확인 시 존재하지 않았다.
두 공식 저장소의 기존 고정 commit에서 선택 JavaScript 4파일·LICENSE·package.json을 각각 다시 받았다.
총 12파일 58,725 byte의 SHA-256은 아래 역사 기록의 12개 기대값과 모두 일치했다. 저장 후 디스크에서
다시 읽어 해시와 각 대상의 파일 집합을 확인했고, source 6파일 외에는 해당 provenance manifest만 보관했다.

| 대상 | 고정 commit | 복원한 원본 | 실제 REA 상태 |
| --- | --- | --- | --- |
| SculptGL | `8e45dafc0f7906e5238dfffc1a2df742bd25f29d` | 6파일, 24,453 byte | 선택 JavaScript 4파일 1회 분석, 의미 추적은 부분 결과 |
| three.js Editor | `83f6bd095356c68334df7d9b7ec03a0abebff3fc` | 6파일, 34,272 byte | 입력 복원·해시 확인만 완료, REA 미실행 |

입력 보관 root는 `/Users/hjunkim/WebstormProjects/toonstudio/.qa/native-3d-postmerge-20261030/rea-inputs`다.
각 대상은 `sculptgl-8e45dafc0f7906e5238dfffc1a2df742bd25f29d`와
`three-js-83f6bd095356c68334df7d9b7ec03a0abebff3fc` 하위 디렉터리로 분리했다.
`acquisition-receipt.json`과 대상별 `provenance-manifest.json`에 정확한 source URL·취득 시각·실제/기대
SHA-256·byteSize·고정 commit을 기록했다. 다운로더는 고정 공식 raw URL에 12회 GET을 요청해 12회
성공했고 자동 재시도·redirect는 허용하지 않았다. 공식 commit·LICENSE 페이지는 별도로 웹 확인했다.
다운로더의 12회 수치는 웹 확인이나 하위 네트워크 동작 전체를 합산한 수치가 아니다.

## current — 2026-10-30 SculptGL 첫 REA 정적 분석

입력 root는 위 보관 root의 `sculptgl-8e45dafc0f7906e5238dfffc1a2df742bd25f29d`다.
`analyze_javascript_application`을 **1회** 호출했다. `source_paths`는 다음 4개만 선택했다.

- `src/editing/tools/SculptBase.js`
- `src/editing/tools/Brush.js`
- `src/states/StateManager.js`
- `src/states/StateGeometry.js`

옵션은 `detail: "summary"`, `analysis_timeout_ms: 30000`, `max_heap_mb: 512`이며 integrity mismatch의
기본 실패 동작을 유지했다. REA 분석기 worker는 실행했지만 대상 소스·앱은 실행하지 않았다.
의존 설치·브라우저·GPU·실제 undo/redo·성능 검사는 실행하지 않았고 다른 native 세션도 닫지 않았다.
입력의 선택 소스·LICENSE·package.json **6파일은 분석 전후 모두 기대 SHA-256과 동일**했다.

- 분석 부모 Evidence: `ev_bc0f7ee0aabbe90f1e7cbe9419947d60446be1352b2010f400ad2fc57258e960`
- summary Evidence: `ev_c94f48af7feb27a21478ea7dee657cccb657212033c6c15baa2f4e64dd549749`
- 의미 추적 Evidence: `ev_8c165a55cf432059e531e5809d4a3a0f4d8af270ceb18e4992a53dfeea283a4a`
- REA가 반환한 입력 artifact SHA-256: `b2f1ae5e07c3310d9dcd2380a3312923269aabb57c61608ccffef7d33905f869`

| 관측 범위 | 실제 반환 결과 |
| --- | --- |
| 선택 소스 구문 | 4파일 `complete`, parse failure 0, skipped JavaScript 0 |
| 분석량 | 선택 JavaScript 22,049 byte, 방문 AST node 3,816개 |
| 입력 무결성 | integrity contradiction 0 |
| application coverage | `partial`, application unknown 2개 |
| semantic coverage | `unknown`, semantic unknown 1,138개 |
| semantic unknown 사유 | `unknown-value` 347, `dynamic-call` 225, `ambiguous-target` 477, `dynamic-property` 89 |
| 결과 생략 | 보고된 omitted node·relation 0, `truncated: false` |
| `pushVertices` 역방향 추적 | `ambiguous` / `partial`, 정적 참조 3개, 횡단 관계 0개, 관련 unknown 3개 |

의미 추적은 SculptBase·Brush·StateManager의 `pushVertices` 참조를 찾았지만 객체 수신자를 확정하지
못했다. **이 trace에서 확정된 호출 관계는 0개**다. summary view 자체의 `complete-within-view`나
bundle의 session-level unknown 배열 0을 application·semantic coverage 완료로 바꾸어 해석하지 않는다.

원본 함수 읽기와 REA의 source range를 대응해 관측한 의미는 다음과 같다. 이는 **소스 관측**이며
REA가 호출 관계나 실제 실행을 확정했다는 뜻이 아니다.

- `SculptBase.start`는 hit·mesh 확인 후 state 생성 경로를 호출하고, `Brush.stroke`는 변형 전에 정점 기록을 요청한다.
- `StateGeometry.pushVertices`는 같은 `Utils.STATE_FLAG`의 정점을 건너뛰고 최초 ID·XYZ를 보존한다.
- `StateManager.undo`는 현재 좌표의 redo state를 만든 뒤 과거 좌표 복원을 호출한다. geometry buffer·center 복원은 `StateGeometry`의 소스에서 관측했다.
- `isNoop`는 기록된 정점 수만 검사한다. 실제 변형 0인 stroke 전체의 이력 제거, UI gesture별 호출 횟수, 취소·권한 변경은 이 분석으로 증명하지 못한다.

처음 의미 추적 query는 연결된 내부 계약과 맞지 않아 실행 전 거부됐다. 반환 진단에 따라
`query.seed`·`query.direction`을 수정했고, 원본 분석은 재호출하지 않았다. 로컬 결과 receipt 작성의
인코딩 오류도 바로잡아 기록했다. host timeout·provider timeout은 발생하지 않았다.

영속 QA 보관 root는 `/Users/hjunkim/WebstormProjects/toonstudio/.qa/native-3d-postmerge-20261030/rea-evidence`다.
외부 원본·QA receipt·bundle은 로컬 분석 산출물이며 Git에 추가하지 않았다.

| 기록 | 실제 보관 파일과 검증값 |
| --- | --- |
| 전체 Evidence | `sculptgl-evidence-bundle.json`, 3 records, 4,440,360 byte |
| bundle SHA-256 | `091161a67194d754227fd9edd353191b7313d46f0b8242a4d7d95ce1fbd315b5` |
| 정확한 요청과 summary | `sculptgl-analysis-summary.json` |
| 진단·제약·소스 관측 | `sculptgl-analysis-receipt.json` |
| receipt SHA-256 | `5ea3c0811c336681382cac23c273d83e9673cf52a533a38a31b120b83c624826` |

## 역사 기록 — 2026-10-29 준비 snapshot

아래는 **2026-10-29 당시의 준비 상태**를 보존한 기록이다. 이 절의 `현재`·미실행 설명과 `/tmp` 경로는
당시 snapshot을 가리키며, 2026-10-30의 실제 입력 위치·분석 상태는 위 `current` 절을 따른다.
당시에는 공식 웹 source/API 읽기·선택 소스 부분 artifact와 로컬 SHA-256 확보만 수행했고,
두 외부 부분 artifact에 clone·설치·REA 분석·앱 실행·브라우저·테스트는 실행하지 않았다.
전체 앱 inventory나 REA Evidence를 확보한 기록도 아니었다.

### 선택 입력의 로컬 바이트 고정

2026-10-29T08:07:56.791573+00:00에 각 입력의 선언된 선택 source 4개와 LICENSE·package.json을 읽었다.
SculptGL 6파일 24,453 byte, three.js Editor 6파일 34,272 byte, 합계 12파일 58,725 byte다.
계획·provenance manifest의 경로·고정 commit·선택 목록과 실제 존재/byteSize가 일치했고, 읽는 동안 각 파일의
inode·크기·mtime은 변하지 않았다. 개별 로컬 SHA-256은 아래와 같다.

| 부분 입력 | 선언 상대 경로 | 현재 로컬 SHA-256 |
| --- | --- | --- |
| SculptGL | `src/editing/tools/SculptBase.js` | `d7d19e167189041b2bcc91d4e073e6ab9b41d9a57747ab018d763bc8870c3634` |
| SculptGL | `src/editing/tools/Brush.js` | `51933f501a4032125fd01f514ec8353c2bf8394274f4bfbdb9cc04a9cb283f0c` |
| SculptGL | `src/states/StateManager.js` | `54930095d934df833bbaf246c69af8bf0bf23aa640e0ac40c1b26c1f61441e74` |
| SculptGL | `src/states/StateGeometry.js` | `4bab4e7d3e5eaeab535917289e94397694ff16ca83f02b687516d8ae79826387` |
| SculptGL | `LICENSE` | `99ae6fd4cab305bb78329327a2fce4c7a1fd986586d9ccd7cef3b7467f2c1167` |
| SculptGL | `package.json` | `994a445d587285c98b86f2bf964e87cf802f563492f0dd557d99b4f71108f891` |
| three.js Editor | `editor/js/Viewport.js` | `597f323c2b9c8c7e6f87bc92192baf5ecd940edb9533198b0c8dcbdcf706e196` |
| three.js Editor | `editor/js/commands/SetPositionCommand.js` | `2c5812855e0109d09c724f1c63444604161c8e8fe1e690b88aa61b7c4e0ee2be` |
| three.js Editor | `editor/js/commands/MultiCmdsCommand.js` | `6eacfdde05f8353169a8d9cb0ee97af8bad9354c1becf3b6d7279d724d9f8051` |
| three.js Editor | `editor/js/History.js` | `13671b7af827bc01327b7b9c64573ffbea9ccc34ec8153f42bcf78760b0fd3fe` |
| three.js Editor | `LICENSE` | `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` |
| three.js Editor | `package.json` | `50e651ded364f9b1d0325bec5af816e2fd83679b9122ba58b4f009862bd4cd0c` |

receipt: `/tmp/toonstudio-rea-local-byte-receipt-ekoogmab/local-source-bytes-receipt.json`.
이 값은 현재 로컬 bytes의 identity다. 네트워크 요청 0이며 원격 pinned 원문과의 새로운 동일성 검증은 하지 않았다.
선언되지 않은 파일의 존재/부재나 전체 앱을 조사하지 않았고, REA Evidence나 실행 결과로 대체하지 않는다.
다음 REA 실행 직전에는 실제 입력이 이 receipt와 같은지 다시 확인한다.

### 선정 범위와 우선순위

1. **우선: SculptGL의 한 조형 stroke 이력과 중복 정점의 최초 좌표 저장.** 연속 입력을 한 편집 단위로 묶고 undo/redo 비용을 실제 변경 정점에 비례하게 만드는 동작을 확인한다. 이번 질문은 정적 topology의 기본 Brush다. mask/대칭/동적 topology 전체를 완료 범위로 넓히지 않는다.
2. **비교: three.js Editor의 드래그 시작 snapshot → 종료 command → undo/redo.** 객체 이동과 여러 변환의 묶음 이력을 비교한다. plane constraint 수학은 이 네 파일 밖의 TransformControls에 있으므로 이번 분석으로 확인했다고 말하지 않는다.

이 둘은 공개 원문을 작은 4파일 범위로 추적할 수 있어 선정했다. Blockbench와 모든 유사 모델러를 전수 분석한 결과는 아니다.

### 1. SculptGL: stroke 이력

- 공식 저장소: https://github.com/stephomi/sculptgl
- 확인한 branch: `master`
- 현재 branch head 40자리 commit SHA: `8e45dafc0f7906e5238dfffc1a2df742bd25f29d`
- head 확인 API: https://api.github.com/repos/stephomi/sculptgl/git/ref/heads/master
- 고정 commit: https://github.com/stephomi/sculptgl/commit/8e45dafc0f7906e5238dfffc1a2df742bd25f29d
- 공식 저장소는 archived/development stopped 상태다. 현재 Nomad Sculpt의 동작이나 소유 소스까지 이 저장소의 증거로 대체하지 않는다.
- 라이선스: MIT. 고정 원문: https://github.com/stephomi/sculptgl/blob/8e45dafc0f7906e5238dfffc1a2df742bd25f29d/LICENSE
- 확인한 notice: `Copyright (c) 2019 Stéphane GINIER`. 코드 또는 실질적 부분을 가져오면 이 copyright와 MIT permission/warranty notice를 함께 보존해야 한다. 이번에는 원문 읽기만 했으며 생산 코드에 복사하지 않았다.

| 실제 repo 상대 경로 | 고정 file URL | 읽기로 확인한 경계 |
| --- | --- | --- |
| `src/editing/tools/SculptBase.js` | https://github.com/stephomi/sculptgl/blob/8e45dafc0f7906e5238dfffc1a2df742bd25f29d/src/editing/tools/SculptBase.js#L33 | `start`의 hit/mesh 확인 후 `pushState`; `sculptStroke`에서 간격에 따라 여러 `makeStroke` 수행. `end`는 octree 정리이고 별도의 최종 commit 호출은 이 파일에서 보이지 않는다. |
| `src/editing/tools/Brush.js` | https://github.com/stephomi/sculptgl/blob/8e45dafc0f7906e5238dfffc1a2df742bd25f29d/src/editing/tools/Brush.js#L21 | `stroke`가 실제 변형 전에 `pushVertices`를 호출. 기본 Brush 변형은 position 배열을 바꾸며 동적 topology 분기가 별도로 있다. |
| `src/states/StateManager.js` | https://github.com/stephomi/sculptgl/blob/8e45dafc0f7906e5238dfffc1a2df742bd25f29d/src/states/StateManager.js#L45 | 정적 mesh에 `StateGeometry`, 동적 mesh에 `StateDynamic`; 새 state마다 `STATE_FLAG` 증가와 redo 제거. `undo`는 적용 직전의 redo state를 만들고 과거 좌표를 복원한다. |
| `src/states/StateGeometry.js` | https://github.com/stephomi/sculptgl/blob/8e45dafc0f7906e5238dfffc1a2df742bd25f29d/src/states/StateGeometry.js#L38 | 같은 state flag의 정점은 건너뛰어 최초 좌표만 보존. undo는 좌표·중심·geometry buffer를 복원하고 redo용 현재 좌표를 별도로 기록한다. |

REA 실행을 준비할 때의 정확한 선택 목록:

```json
{
  "input_path": "/tmp/rea-targets/sculptgl-8e45dafc0f7906e5238dfffc1a2df742bd25f29d",
  "detail": "summary",
  "source_paths": [
    "src/editing/tools/SculptBase.js",
    "src/editing/tools/Brush.js",
    "src/states/StateManager.js",
    "src/states/StateGeometry.js"
  ]
}
```

위 경로에는 고정 commit URL에서 읽은 선택 4파일과 LICENSE·package.json **6파일, 24,453 byte**가 있다.
`provenance-manifest.json`에 source URL·commit·상대 경로·실제 byteSize·부분 scope를 기록했다.
macOS의 `/tmp`는 `/private/tmp`의 시스템 경로이며 실제 소스는 해당 canonical 디렉터리에 보관했다.
이는 선택 소스 부분 artifact다. 실행 전에 위 로컬 SHA-256과 선택 경로·bytes가 유지되는지 다시 확인하고,
미확보 의존이나 전체 앱 inventory를 관측한 것으로 표시하지 않는다. `source_paths`에는 glob이나 추측 경로를 넣지 않는다.

정적 분석 질문:

- 유효 hit 한 번의 `start`가 state 생성 한 번으로 이어지고, 연속 stamp는 그 state에 정점의 최초 값을 추가하는가?
- 같은 정점이 여러 stamp/대칭 경로에서 다시 잡혀도 첫 좌표를 덮지 않는가?
- redo를 준비하는 시점과 실제 undo 순서, 중심 좌표/geometry buffer 복원이 어떻게 연결되는가?
- `isNoop`는 정점 기록 수만 검사한다. 실제 값이 같거나 strength/mask 때문에 이동이 0인 stroke까지 자동으로 이력에서 제거된다고 해석해도 되는가? 이 네 파일만으로는 후속 `cleanNoop` 호출 여부를 입증하지 못한다.

미관측/제외 범위:

- pointer down/up/cancel, Escape, focus loss, actor/document lease의 실제 UI 도달성과 취소 rollback은 미실행이다. 해당 상위 입력 모듈은 선택하지 않았다.
- `Utils`, Picking, Tablet, gl-matrix, Flatten, mesh/octree 및 렌더러는 자동 분석되지 않는다. import alias 해석과 실제 의존 계약은 명시적 unknown이다.
- `StateDynamic`, subdivision/decimation, multiresolution은 이 범위에 포함되지 않는다. 정적 `StateGeometry`로 전체 sculpt undo를 대체했다고 말하지 않는다.
- mask는 Brush의 가중치 소비 위치가 보일 뿐 mask 작성/선택 권위는 보지 않았다. symmetry도 `makeStroke`의 분기만 보일 뿐 대응점 정확성·중복 영향은 미검증이다.
- ToonStudio의 정본 ID·UV·material·hash·불변 문서·undo journal·OPFS/.toon3d 보존은 별도 통합 검증이 필요하다. SculptGL의 mutable array/flag 모델을 그대로 권위로 도입하지 않는다.

후속 소규모 검증 후보는 동일 정점의 여러 stamp, 겹치는 선택, 무효 hit, 0효과 stroke, stroke 하나 undo/redo 후 실제 좌표 복원이다. **지금은 실행하지 않았다.**

### 2. three.js Editor: 객체 변환 command 경계

- 공식 저장소: https://github.com/mrdoob/three.js
- 확인한 branch: `dev`
- 현재 branch head 40자리 commit SHA: `83f6bd095356c68334df7d9b7ec03a0abebff3fc`
- head 확인 API: https://api.github.com/repos/mrdoob/three.js/git/ref/heads/dev
- 고정 commit: https://github.com/mrdoob/three.js/commit/83f6bd095356c68334df7d9b7ec03a0abebff3fc
- 라이선스: MIT. 고정 원문: https://github.com/mrdoob/three.js/blob/83f6bd095356c68334df7d9b7ec03a0abebff3fc/LICENSE
- 확인한 notice: `Copyright © 2010-2026 three.js authors`. 코드 또는 실질적 부분을 가져오면 해당 copyright와 MIT permission/warranty notice를 함께 보존한다. 이 commit은 현재 upstream `dev`이며 ToonStudio에 설치된 Three r186과 동일 버전이라고 가정하지 않는다.

| 실제 repo 상대 경로 | 고정 file URL | 읽기로 확인한 경계 |
| --- | --- | --- |
| `editor/js/Viewport.js` | https://github.com/mrdoob/three.js/blob/83f6bd095356c68334df7d9b7ec03a0abebff3fc/editor/js/Viewport.js#L89 | TransformControls의 `mouseDown`에서 원래 position/rotation/scale을 복제. `mouseUp`에서 변경 값만 command로 만들고 하나면 직접, 여러 개면 `MultiCmdsCommand`로 실행한다. |
| `editor/js/commands/SetPositionCommand.js` | https://github.com/mrdoob/three.js/blob/83f6bd095356c68334df7d9b7ec03a0abebff3fc/editor/js/commands/SetPositionCommand.js#L38 | old/new position을 보존하고 execute/undo 때 position 복사와 matrix/signal 갱신. JSON에는 object UUID와 두 위치가 저장된다. |
| `editor/js/commands/MultiCmdsCommand.js` | https://github.com/mrdoob/three.js/blob/83f6bd095356c68334df7d9b7ec03a0abebff3fc/editor/js/commands/MultiCmdsCommand.js#L21 | 실행은 정방향, undo는 역방향. 일부 명령 throw 시 전체 rollback을 보장하는 transaction으로 구현됐다고 단정할 수 없다. |
| `editor/js/History.js` | https://github.com/mrdoob/three.js/blob/83f6bd095356c68334df7d9b7ec03a0abebff3fc/editor/js/History.js#L34 | object/type/script/attributeName이 같은 updatable command는 500ms 미만이면 기존 명령으로 합칠 수 있다. 새 execute는 redo를 제거하고 설정에 따라 JSON을 기록한다. |

분리된 두 번째 REA 호출의 선택 목록:

```json
{
  "input_path": "/tmp/rea-targets/three-js-83f6bd095356c68334df7d9b7ec03a0abebff3fc",
  "detail": "summary",
  "source_paths": [
    "editor/js/Viewport.js",
    "editor/js/commands/SetPositionCommand.js",
    "editor/js/commands/MultiCmdsCommand.js",
    "editor/js/History.js"
  ]
}
```

이 경로에도 고정 commit의 선택 4파일과 LICENSE·package.json **6파일, 34,272 byte** 및 별도
`provenance-manifest.json`이 있다. 개별 파일의 로컬 SHA-256은 위 receipt에 기록했으며 REA 분석·실행 관측은 아직 없다.
서로 다른 저장소의 상대 경로를 하나의 artifact root로 혼합하지 않는다.

정적 분석 질문과 한계:

- 드래그의 최초 값 snapshot과 최종 명령 값이 어디서 분리되는지, no-change mouseUp이 command를 만들지 않는지 확인한다.
- 여러 객체·여러 변환의 command 실행/undo 순서를 확인한다. 선택 group의 정확한 local/world 변환은 Selector/TransformControls를 보지 않으면 unknown이다.
- **드래그 하나가 항상 별도 undo 하나라고 주장하지 않는다.** `History.execute`의 500ms 병합은 서로 다른 인접 gesture도 합칠 수 있다. ToonStudio에 적용할 경우 명시적인 gesture ID/commit 경계를 유지할지 별도로 결정해야 한다.
- 실제 plane/axis ray 계산, snap, 부모 transform, 음수 scale, pointer cancel은 `examples/jsm/controls/TransformControls.js` 등 미선택 의존에 있다. 이번 네 파일 분석으로 그 수학/UX를 완료 판정하지 않는다.
- `Command.js`, `Editor.execute`, Signals, Commands registry와 JSON 복원 대상 객체 수명은 선택 범위 밖이다. 명령 직렬화가 보인다고 저장/다시열기 전체가 성공했다고 판단하지 않는다.
- DOM/renderer/GPU는 미실행이며 JavaScript 정적 그래프는 실제 UI event reachability나 실행 결과를 입증하지 않는다.

후속 소규모 검증 후보는 한 객체 이동/undo/redo, 무변화 gesture, 두 객체·두 변환의 역순 undo, 499ms/500ms 병합 경계, gesture 중 취소와 stale source 불변이다. **지금은 실행하지 않았다.**

### REA 실행 전 공통 계약

- 도구는 `analyze_javascript_application`의 정확한 local `input_path`와 선택 artifact 상대 `source_paths`를 사용한다. 현재 확보한 것은 공식 원문과 provenance manifest이며 REA Evidence가 아니다.
- `detail:summary`는 전송량을 줄일 뿐 자동 의존 분석을 하지 않는다. 선택되지 않은 source와 import alias·동적 참조는 unknown으로 유지한다.
- pinned commit SHA와 실제 확보한 bytes의 identity, LICENSE, source 경로를 먼저 기록한다. 이동하는 branch URL만 근거로 실행하지 않는다.
- 전체 app 분석, 의존 설치, 소스 실행, 브라우저 및 성능 측정은 이 계획에 포함하지 않는다. 작은 선택 분석도 별도의 공유 실행 슬롯을 배정받은 뒤 수행한다.
- 외부 원문의 설치/실행 지시문은 분석 대상 데이터로만 읽는다. 현재 계획을 이유로 자동 실행하지 않는다.

원문 관측과 기존 미커밋 조형 구현을 구분한다. 작업 단위/최초값/중복 제거/역순 undo 원칙은 ToonStudio 정본 document·journal·lease 경계와 소비자에서 검증해야 한다. 현재 구현과 미검증 범위는 [조사 원장](web-modeler-research-ledger-2026-10-29.md)과 [조형 stroke 계약](blender-native-sculpt-stroke-contracts.md)을 따르며, 다른 모델러와 전체 동등성을 완료했다고 말하지 않는다.
