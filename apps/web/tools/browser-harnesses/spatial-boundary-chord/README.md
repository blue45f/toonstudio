# 공간 모델러 면 나누기·공유 모서리 치유 브라우저 검증

- 상태: `current` — 고정한 두 cube 문서의 전체 시나리오를 실제 제품 UI로 검증한 수동 실행 도구다.
- 기록일: 2026-11-01.
- 제품 구현은 [PR #2598](https://github.com/blue45f/toonstudio/pull/2598)과 [PR #2604](https://github.com/blue45f/toonstudio/pull/2604)로 main에 병합됐다.
- 이 폴더는 기존 로컬 검증 후보를 검토할 수 있도록 게시한 사본이다. 제품 기능 완료나 운영 배포를 뜻하지 않는다.

## 실제 연결과 시나리오

`spatial-boundary-chord-proof.tsx`는 실제 `StudioHybridDccPanel`을 `initialWorkspace`와
`onWorkspaceChange`로 마운트한다. 기본 cube 문서와 별도의 affine UV 문서를 공개 geometry 계약으로
초기 준비하며, 이후 선택·경계점 입력·미리보기·적용·취소·Undo/Redo·저장·재열기는 제품 UI를 사용한다.
Worker·렌더러·선택·문서 확정 함수를 mock하거나 브라우저 driver에서 대신 호출하지 않는다.

카메라 안정화 구간은 해당 Canvas의 공개 `state.invalidate()`로 정상 demand 프레임을 한 번씩 요청한다.
공개 `addAfterEffect`의 렌더 순회 후 표본에서 실제 renderer의 `info.render.frame` 진행과 카메라의 exact 동일성을 확인한다.
카운터 증가량을 독립 표본 수로 세지 않으며, offscreen render·GPU 완료·화면 표시 완료를 같은 것으로 취급하지 않는다.
이 구간은 단순 읽기와 다른 능동 QA 전제이며, 자연 demand 루프가 스스로 완전히 감쇠했다는 증거가 아니다.
카메라·조작기·기하 값을 직접 바꾸지 않고, 한 번 정한 15초와 전체 180초 안에 안정화되지 않으면 실패한다.
이후 실제 PNG·동일 카메라·Worker·이력·저장 판정 기준을 그대로 적용한다.

`browser.mjs`는 실행자가 소유한 Chrome의 CDP endpoint에 Playwright로 연결한다.
실제 마우스·키보드·파일 입력으로 면 분할 2회, 공유 모서리 치유의 준비 후 취소·적용 2회를 검증하도록 작성했다.
모델링 계산 Worker는 정확히 4개로 판정하고, 페이지 수명의 로컬 DB Worker는 별도로 추적한다.
결과 문서의 f64 위치·UV·crease·material·원본 TRS·단일 history와 저장 후 재열기를 비교한다.
2026-11-01 로컬 Chrome/Metal 실행에서 전체 시나리오가 통과했다. 범위와 한계는 아래 기록을 따른다.

실제 R3F store와 표시 geometry·재질·행렬은 읽기 관측에 사용한다. 기본 cube의
`MeshPhysicalMaterial`과 현재 표시 구조에 한정된 관측이며 임의 모델이나 renderer로 일반화하지 않는다.
첫 경계 클릭의 trusted native 이벤트와 기존 OrbitControls 이벤트는 최대 48개만 보존한다.
관측용 독립 ray는 `clientX/Y`와 Canvas 사각형을 사용한다. 제품 R3F가 사용하는 native `offsetX/Y`와
좌표계가 다르므로 독립 ray hit를 제품 callback 도달이나 실제 선택 성공으로 해석하지 않는다.

## 실행 전제와 명령

저장소 루트에서 기존 lockfile에 맞춘 정상 설치와 정확한 HEAD를 확인한다.
Vite·Chrome·driver를 소유한 실행자가 유한 실행 시간, 메모리, 프로세스 그룹, 포트와 정리를 관리해야 한다.
driver의 180초는 cooperative 한도이며 OS 프로세스를 강제로 종료하는 상한이 아니다.
이 도구는 Chrome을 만들거나 다른 프로세스를 종료하지 않는다. 새 결과 폴더의 부모만 미리 만들고
`--out`에 지정한 결과 폴더 자체는 만들지 않는다. 기존 결과를 덮어쓰지 않는다.

아래 명령은 저장소 루트에서 실행한다. `<...>`는 해당 실행의 실제 값으로 바꾼다.

```sh
node apps/web/tools/browser-harnesses/spatial-boundary-chord/server.mjs \
  <저장소의_절대_경로> 5198 <새_캐시의_절대_경로>
```

서버는 정상 `apps/web/vite.config.ts`를 재사용하고 문서 URL 하나만 연결한다.
`three-stdlib`를 사전 최적화 목록에 넣고, optimizer 초기화·scan·대상 processing을 기다린 뒤
현재 optimized record·비어 있지 않은 `fileHash`·실제 출력 파일·미처리 discovered 0을 확인한다.
포트가 열린 상태만으로 driver를 시작하지 않는다. 해당 서버의 실제 JSON `event: "ready"`와
`prebundle.id: "three-stdlib"`, `fileExists: true`, `discovered: 0`을 확인한 뒤 진행한다.
`fileHash`는 Vite 메타데이터이며 출력 파일 내용의 SHA가 아니다.
이 조건은 알려진 초기 의존성의 commit 확인으로, 모든 후속 동적 import의 성공을 보장하지 않는다.
검증 HTML·entry의 변환과 뒤늦게 발견된 실제 pre-transform 대기열도 준비한 뒤 ready를 낸다.
Vite 8.3.4의 `_pendingRequests` 계약을 확인하며, 계약이 다르면 중단한다.
서버는 env 파일을 읽지 않는다. 이 준비는 dev 검증 입력의 준비이며 cold 제품 로딩 성능의 증거가 아니다.

실행자가 별도로 소유한 Chrome을 loopback CDP로 준비한 뒤 다음 driver를 한 번 실행한다.

```sh
node apps/web/tools/browser-harnesses/spatial-boundary-chord/browser.mjs \
  --root <저장소의_절대_경로> --expected-head <40자리_HEAD> \
  --origin http://127.0.0.1:5198 --cdp http://127.0.0.1:<소유_CDP_포트> \
  --gpu-lane metal-webgl --out <아직_없는_결과_폴더의_절대_경로>
```

기본 `metal-webgl` lane은 실제 제품 Canvas의 WebGL2·Metal renderer·draw call을 검사하고
SwiftShader·software·unknown renderer를 거부한다. 명시적인 `swiftshader-webgl` lane은
소프트웨어 렌더링 결과로만 취급하며 Metal 성능 증거로 사용하지 않는다. 어느 lane도 자동으로 전환하지 않는다.
PNG는 Chrome의 native decoder로 읽고 실제 Canvas의 빈 이미지·marker·wire 변화를 검사하도록 작성했다.
2D PNG 디코딩 자체는 GPU 실행 증거가 아니다.

첫 실패에서 중단하고 자동 재시도·재클릭·임의 지연으로 통과시키지 않는다.
실행자는 실제 종료 코드와 소유 프로세스·포트·로그 writer 정리를 별도로 확인해야 한다.
입력 HEAD·변경 파일·선택 의존성의 실행 전후 비교는 전체 node_modules의 불변을 보장하지 않는다.

## 실행 기록과 한계

| 입력 | 실제 결과 | 판정 범위 |
| --- | --- | --- |
| 과거 r8 후보 | Metal Canvas 진입·실제 면 선택 후 첫 경계점 입력 대기 15초에서 실패 | 분할·치유·저장 왕복 통과 아님. 새 클릭의 제품 callback 도달 원인은 미확정 |
| 과거 r9 후보 | 초기 준비 15초에서 실패. `three-stdlib`의 늦은 최적화가 기존 chunk를 무효화하며 HTTP 504 발생 | 모델링 계산 Worker·단계·PNG·pointer trace 모두 0. 제품 geometry 또는 GPU 실패로 단정하지 않음 |
| 2026-10-31 r17 | 동일 카메라 검사는 통과했지만 분할선 대비 표본이 2개로 기존 기준 3개에 미달 | 전체 치유·저장 왕복은 미실행 |
| 2026-11-01 `c4-fixed-r9` | 전체 driver exit 0, 페이지·콘솔 오류 0, PNG 16개 | 두 분할·치유 취소/적용·Undo/Redo·작업파일 저장 및 새로고침 뒤 재열기 통과 |

2026-11-01 실행은 Chrome for Testing 156.0.8078.4 / Apple M2 Max Metal WebGL2에서 수행했다.
분할선·치유선의 원래 PNG 판정은 각각 5/5/6/6/6/6개 표본에서 통과했다. 계산 Worker 4개
(분할 2·치유 2), 문서 수명별 DB Worker 3개가 모두 종료됐고 입력 소스의 전후 SHA가 일치했다.
저장한 `.toon3d`는 39,128바이트이며 재열기 뒤 f64 위치·UV·TRS·문서 이력이 일치했다.
기존 클릭·좌표·15초 단계·전체 180초·Worker 4개·fixture·픽셀 기준은 유지한다.
접힌 선택 작업대는 실제 버튼으로 펼친 뒤 선택 해제를 누른다. 실패한 wire 표본은 assert 이전에 기록한다.
원본 실패 기록은 보존하며 과거 실패를 이번 성공으로 덮어쓰지 않는다.

모바일·touch·전체 접근성·대형 모델 성능·4K·WebGPU·다른 게임 엔진 비교·전체 모델링 도구 동등성은
이 검증 범위에 포함하지 않는다. 전체 기능 원장의 완료 상태도 변경하지 않는다.
