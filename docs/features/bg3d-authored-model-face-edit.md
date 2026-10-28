# BG3D 편집 모델의 원본 면 재편집

- 상태: `current` — 원본 mesh를 보관한 독립 단색 편집 모델의 재편집·저장·재열기를 집중 테스트와 실제 브라우저로 확인했다.
- 기준일: 2026-10-29.
- 전체 SketchUp 요구 SK33의 일부다. 일반 GLB·임의 재질·계층·외부 모델까지 편집하는 기능은 아니다.

## 사용자 경로

1. [기본 상자 원본 면 편집](bg3d-primitive-face-edit.md)에서 만든 모델을 하나 선택한다.
2. `보기 → 배경 건축 · 3D 도구 열기 → 배경 건축 · SketchUp`의 `선택한 편집 모델 면 편집`을 누른다.
3. 저장된 원본 mesh로 열린 면 편집기에서 실제 면을 선택하고 도구의 미리보기를 확인한다.
4. 도구의 `적용`으로 로컬 편집을 확정한 뒤 `배경 원본에 반영`을 누른다.
5. 검증·저장·렌더 admission을 통과하면 같은 오브젝트 ID가 새 모델 원본을 참조한다.
6. 배경 실행 취소 한 번으로 이전 모델을 복구하고, 다시 실행하면 새 모델을 복구한다.

현재 위치·회전·크기·지원하는 단색을 바꾼 모델도 다시 선택할 수 있다. 문서를 저장하고 새 편집기에
마운트한 뒤에도 참조한 GLB 원본이 저장소에 남아 있고 검증을 통과하면 같은 경로로 다시 편집한다.
장면 JSON의 attachment 참조만으로 외부 환경에 GLB 원본까지 자동 전달되는 것은 아니다.

면 도구의 미리보기·로컬 확정은 배경을 바꾸지 않는다. 원본 반영 대기 중에는 중복 반영·추가 편집·닫기를
막고, 상위 편집기가 사라지면 요청을 취소한다. 일반 실패에서는 로컬 편집 결과를 보존해 재시도할 수 있다.
최초 자산 등록 이전으로 로컬 Undo할 수 없으며 단축키는 바깥 배경의 Delete·Undo/Redo와 분리한다.

## 재편집 가능한 원본

- ToonStudio의 이 면 편집 경로가 기록한 v1 authoring 데이터를 가진 `box` 파생 모델 하나를 지원한다.
- 숨김·잠금·숨긴 태그, 부모·자식, 컴포넌트·연결 복제 관계가 없는 독립 모델이어야 한다.
- 같은 저장 모델과 캐시를 사용하는 별도 인스턴스가 있어도 선택한 노드만 새 원본으로 바꾼다.
  정의 공유 편집이나 모든 인스턴스 동시 갱신을 의미하지 않는다.
- 고정 단색 재질과 지원하는 단색 override만 받는다. 페인트·텍스처/UV·절차 재질·리그·애니메이션·
  morph·pose·constraints를 임의로 제거해 편집하지 않는다.
- 장면 전체의 노드·첨부·그림자 설정을 정본 변환에서 보존할 수 있어야 한다. 미사용 첨부나 지원하지 않는
  그림자 설정 등으로 기존 정보가 손실되는 경우에도 교체를 거부한다.
- 저장 record와 장면 attachment의 권리 정보가 일치하고 현재 편집 경로의 사용 조건을 충족해야 한다.
  파생본은 같은 권리와 attribution을 유지하며 `licensed`를 `owned`로 바꾸지 않는다.

기존 GLB에 원본 데이터가 없으면 재편집을 지원하지 않는다. 표식이 보인다는 이유만으로 허용하지 않으며,
Float32 렌더 정점에서 원래 double 좌표나 면 위상을 추측해 재구성하지 않는다. 다른 형식의 원본,
지원하지 않는 데이터 버전, 초과 용량·형상 개수, 불일치하는 캐시·재질은 명시적으로 거부한다.

## 원본 mesh와 GLB의 결합

GLB의 단일 `scenes[0].extras.toonstudioPrimitiveEditAuthoring`에 다음 v1 envelope를 저장한다.

| 항목 | 의미 |
| --- | --- |
| `format` / `version` | `toonstudio.bg3d-primitive-edit-authoring` / `1` |
| `coordinates` | object-local, meters, Y-up이며 TRS를 정점에 굽지 않음 |
| `source` | 자산 ID·revision·원본 mesh hash·`originPrimitiveKind: box` |
| `mesh` | double 좌표와 정점·면·corner ID/counter를 가진 정규 `StudioEditableMeshSnapshot` |
| `objectTransformAtExport` | 해당 GLB를 내보냈을 때의 정확한 TRS 기록 |
| `sourceMaterialAtExport` | `plain-box-v1`과 canonical 소문자 `#rrggbb` 단색 |

읽기는 bounded strict JSON 검증 → snapshot 복원 → serializable authority 검증 → 재직렬화·mesh hash 일치를
확인한다. getter/toJSON 실행, 순환·sparse array·지원하지 않는 prototype·독성/알 수 없는 키·비유한 수치와
바이트·정점·면·corner 한도 초과를 거부한다. 지원하는 정규 kernel 결과를 그대로 보관하며 parser가
위상이나 안정 ID를 새로 만들거나 재번호를 매기지 않는다.

검증한 mesh를 실제 exporter와 단색 writer로 다시 내보내고, 자신의 authoring Scene 키만 제외한 GLB 전체
JSON과 BIN을 비교한다. 다른 extras·재질·UV·텍스처·애니메이션을 제거해 일치시키지 않는다.
Float32 렌더 좌표가 같더라도 원본 double mesh와 provenance를 부분적으로 바꾼 파일은 거부한다.

이 envelope와 hash는 전자서명이나 출처·소유권 인증이 아니다. 외부에서 mesh·provenance·GLB·hash를 모두
일관되게 다시 만들 수 있다는 사실은 그 파일이 원래 자산임을 증명하지 않는다. 실제 편집 시작과 반영은
저장 Blob의 실제 SHA-256, 검증된 record의 크기·MIME·권리, attachment 연결, 현재 source snapshot과
캐시 identity에 묶는다. 내부 일관성이 있는 임의 외부 파일을 기존 자산으로 인증하는 경로는 없다.

## 현재 배치·색과 과거 기록의 구분

렌더 캐시는 가장 긴 변을 2 m로 맞춘 균일 정규화 배율 `k`를 가진다. 현재 모델의 위치·회전은 canonical
노드에서 읽으며 편집 좌표의 배율은 현재 인스턴스 배율과 `k`로 대응시킨다. 새 GLB의 정규화가 `kB`라면
교체 인스턴스는 `편집 좌표의 배율 / kB`를 사용해 배치를 보존한다. 비균일 양의 배율도 검증 범위 안에서 유지한다.
canonical·DCC 범위를 벗어나면 값을 잘라 교체하지 않는다.

`objectTransformAtExport`는 과거 기록이다. 그 기록으로 계산한 장면 변환이 현재 canonical 변환과 정확히
같은 경우에만 과거 exact TRS를 재사용한다. 이동·회전·크기 변경으로 다르면 현재 canonical TRS와 `k`로
계산한 값을 사용한다. 곱셈·나눗셈으로 계산한 값이 과거 double 값과 bit 단위로 같다고 주장하지 않는다.

현재의 지원하는 단색 override가 있으면 그 색을 사용하고, neutral override이면 GLB에 보관한 단색을
사용한다. 새 GLB와 교체 노드에는 고정 PBR의 roughness 1·metalness 0·depth bias를 유지한다.
다른 노드의 재질이나 공유 캐시의 원래 색은 바꾸지 않는다.

## 반영·잠금·실패와 복구

저장은 기존 Worker 검증·atomic import·verified loader·렌더 admission을 거치며 같은 모달 세션의
장면 반영 명령을 FIFO로 처리한다. 새 캐시와 연결은 독립 staging 상태에서 준비한다. 선택·canonical 지문·
현재 품질/예산·권리·원본 Blob·캐시·attachment 양방향 연결을 읽기 전후와 반영 직전에 다시 확인한다.

저장 권위의 같은 snapshot과 WebLock 안에서 필요한 저장 원본을 함께 검증한다. primitive 최초 반영은
새 모델 `[B]`, 모델 재편집은 이전·새 모델 `[A, B]`를 대상으로 ID·hash·바이트·MIME·권리를 확인한다.
요청과 operation lease의 원래 AbortSignal 두 개를 수명 전체 감시하고, 동기 교체까지 read lease를 유지한다.
같은 권위의 다른 탭 삭제·쓰기도 이 잠금과 직렬화한다. 해당 기능이나 Web Locks가 없으면 비원자 읽기로
대체하지 않고 거부한다. 이 권위를 우회하는 임의 DB/CAS 직접 수정까지 보호하는 잠금은 아니다.

최신 source와 lease가 유효할 때만 같은 node ID의 정본 교체와 즉시 history를 한 번 발행한다.
다른 노드·장면 설정을 보존하고 이전 GLB·library record·캐시를 삭제하지 않는다. 이전 attachment는
다른 노드가 참조하면 유지하며, 참조하지 않을 때만 새 문서 후보에서 제외한다. Undo의 이전 문서는 그대로 남는다.

장면 반영 또는 실패 뒤에는 실제 lock 반환까지 기다린 다음 목록 갱신이나 보상을 시작한다. 목록 갱신만
실패하면 이미 반영한 문서를 되돌리지 않고 안내를 남긴다. 반영 전 실패는 history를 만들지 않고 해당 호출의
생성 receipt와 소유 자원만 정리한다. 중복 저장으로 재사용한 자산은 삭제하지 않는다. 다른 세션·캐시 소유자가
채택했거나 canonical actor의 부분 반영 가능성이 있으면 추정 삭제하지 않고 파생본을 보관하며 결과를 안내한다.

## 확인한 범위와 남은 검증

source/tests에는 JSON·GLB의 엄격한 왕복, 실제 kernel 결과의 double 좌표, 현재 인스턴스 변환·단색·권리,
공유 원본 보존, 한 번의 Undo/Redo, stale source·취소·lease 실패와 보상의 회귀가 있다. 저장 권위·read lease
회귀와 별도로 orchestration 회귀는 저장 Worker/OPFS와 read lease를 typed seam으로 대체하고 실제 exporter·
authoring codec·strict validator·verified loader·admission·source·replacement·history를 통합한다.

마지막 저장 읽기와 반영 사이의 삭제 경합을 막는 공통 lease 보강 이후 새 브라우저 context에서
세 번의 면 편집·현재 배치 변경·Undo/Redo·두 번의 PNG 캡처·문서 저장·새 마운트 복원을 확인했다.
집중 테스트 411개와 최종 브라우저 17개 확인 항목이 통과했다. 수치·산출물·검사 범위는
[재편집 검증 기록](../reports/bg3d-authored-model-face-edit-2026-10-29.md)에 기록한다.

이 결과는 SK33의 제한된 재편집 경로에 대한 증거다. 일반 primitive·계층·컴포넌트·페인트·외부 모델의
직접 편집, 구형 GLB의 원본 복구, 임의 위상의 무손실 수용, 전체 SketchUp 기능 완료를 의미하지 않는다.
최신 전체 하네스·production build·운영 배포는 이 문서의 기능 검증과 별도로 판정한다.
