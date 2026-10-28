# BG3D 기본 상자 원본 면 편집 검증

- 상태: `current` — 한정된 실제 원본 편집 경로와 검증 기록.
- 기준일: 2026-10-29.
- 작업 브랜치: `codex/sketchup-primitive-edit`.
- 전체 목표: [SketchUp 요구 원장](../features/sketchup-feature-coverage.md)의 SK33은 `부분`이며 전체 완료가 아니다.

## 구현한 사용자 동작

[기능 문서](../features/bg3d-primitive-face-edit.md)의 경로에서 선택한 독립 단색 상자를 실제 editable mesh로 전달하고,
면 도구의 preview·확정·로컬 Undo/Redo 뒤 명시적 반영으로 같은 ID의 GLB 모델을 교체한다.
기존 전역 DCC 작업공간과 복구 저장소에는 쓰지 않는다. 상자 원본의 24개 렌더 정점·12개 삼각형을
8개 안정 ID 정점·6개 사각 면과 대응시킨다. 원본 위치·회전·비균일 배율·단색·기본 PBR·depth bias를 보존한다.

원본 선택·정본 노드 지문·모달 세션·실제 저장 hash/bytes·캐시 소유권·현재 품질 정책이 달라지면 교체하지 않는다.
Worker 검증과 atomic 저장 뒤 독립 cache에서 admission하고 실제 scene mutation FIFO에서 정본/history를 한 번 반영한다.
이번 호출이 새로 만든 receipt와 cache만 정리하며, 다른 작업이 채택한 자산·불확실한 부분 commit 자산은 보존하고 안내한다.
목록 갱신 실패는 완료한 원본 교체를 되돌리지 않는다.

## 실제 브라우저 증거

Chrome for Testing `156.0.8078.4`, WebGL2/SwiftShader와 실제 BG3D 편집기를 사용했다.
임시 검증 문서의 카메라·상자만 입력했으며, 선택·면 클릭·도구 입력·반영·배경 Undo/Redo·캡처·다시 열기는 실제 UI로 실행했다.
R3F의 렌더 객체·재질·bounds를 읽는 관측기는 장면 명령이나 React 상태를 변경하지 않는다.

- 원본 위치 `[0.4, 0.6, -0.5]`, 비균일 배율 `[1.8, 0.6, 2.2]`, 단색 `#8d6378`인 상자의 윗면을 로컬 `0.25`만큼 밀었다.
- preview·도구 확정·로컬 Undo/Redo 동안 바깥 배경 원본은 동일했다.
- 실제 Worker 검증·SQLite OPFS 저장을 거친 파생 GLB는 **3,832 bytes**이며 SHA-256은
  `fb7ec34c66d06c35d3e9f8fe626648edd3c28b68369efacae4d4aa959f4aba29`다.
- 같은 객체 ID의 `primitive → model` 교체 뒤 위치·회전을 유지했고, cache 배율 `k=1.6`에 대해
  인스턴스 배율 `[1.125, 0.375, 1.375]`로 원래 월드 배율을 유지했다. 부동소수점 수치 오차는 JSON 증거에 그대로 남겼다.
- 배경 Undo 한 번은 원래 상자, Redo는 편집 모델을 복원했다. 로컬 Undo는 최초 자산 등록 이전으로 진행하지 않았다.
- 실제 line-art 미리보기에서는 흰색 `MeshBasicMaterial`, 원래 표시로 돌아오면 단색·roughness 1·metalness 0·depth bias가 복원됐다.
- 실제 PNG **2,731 × 1,535**, 3개 레이어를 캡처하고 정본 문서를 직렬화했다. 새 편집기 mount에서 OPFS의 같은 모델·bounds·색·배치를 복원했다.
- 최종 경로에서 page error와 TransformControls 오류는 재발하지 않았다. WebGPU 어댑터 부재 안내 뒤 사용자가 WebGL2를 선택했다.

로컬 증거 디렉터리는 `primitive-edit-browser-2026-10-29`이며 `flow-proof.json`, `actual-edited-box.glb`,
`actual-saved-document.json`, `09-actual-capture.png`, 테마/반응형 스크린샷과 SHA manifest로 구분한다.
이는 개발용 실제 편집기 검증이며 production 배포·전체 CSP·WebGPU·물리 기기의 검증으로 확대하지 않는다.

## 확인하고 보완한 회귀

- 준비 대기 중 선택이 바뀌면 늦은 이전 원본의 편집기를 열지 않는다.
- 중첩 편집기의 Delete·Backspace·Undo/Redo가 바깥 배경을 변경하던 경로를 실제 UI로 재현하고 단축키 경계를 적용했다.
- 같은 ID의 primitive/model이 바뀔 때 scene에서 제거된 객체를 TransformControls가 읽던 한 프레임을 실제 Three 수명 이벤트로 차단했다.
- strict canonical→hydrate에서 선택/무관 노드의 false shadow flags와 미사용 attachment가 runtime 변환에서 사라지는 것을 재현했다.
  해당 정보를 보존할 수 없는 source는 capture·재검증에서 명시적으로 거부하며 저장·history를 발행하지 않는다.
- 상자 외 도형·부모/자식·연결/컴포넌트·표면 페인트·재질 조정은 현재 지원 범위를 벗어난다.

## 검증 상태

- 관련 통합 회귀: **15파일·237개 통과**, exit 0. 실제 geometry·면 도구·kernel·exporter·strict validator·verified loader·admission·교체/history를 사용한다.
- unit orchestrator의 영구 저장·Worker 실행은 seam이며, 위 실제 UI 경로에서 별도로 실제 실행을 확인했다.
- 영역별 strict scoped TypeScript, 변경 TS/TSX ESLint, 변경 파일 Secretlint, 하네스 구조, architecture/eager graph와 source-size 검사를 실행했다.
- Studio eager graph의 BG3D 정적 도달은 **18/18**을 유지했다. 기존 초과 파일의 줄 수를 늘리지 않았다.
- 반응형·테마 검증은 390/1600px × light/dark/contrast의 실제 화면에서 자동 위반 0건을 확인했다.
  1600px는 incomplete 0건이다. 390px는 axe-core의 grid bounds 계산 예외로 안내 문단 1개씩 수동 검토가 남았고,
  실제 색상을 측정한 대비는 light 8.32:1·dark 8.27:1·contrast 15.71:1로 4.5:1 기준을 통과했다.
  Tab/Shift+Tab의 마지막 반영 버튼↔첫 닫기 버튼 순환도 실제 화면에서 확인했다. 자동 판정과 수동 보완을 분리한다.
- 최신 전체 `pnpm harness:verify`와 production Web build·bundle 검사는 다른 작업과 합의한 CPU 순서를 기다리고 있다.
  이 부분을 scoped TypeScript·단위 테스트 통과로 대신 완료 처리하지 않는다.
- 로컬 커밋·푸시·PR·병합·배포는 각각 별도 상태이며 운영 배포는 수행하지 않았다.

## 남은 범위

현재 파생 GLB는 렌더 좌표가 Float32이고 provenance는 원본 위치의 완전한 snapshot이 아니다.
정확한 double 좌표·topology·과거 TRS를 버전이 있는 authoring payload에 보관하고 실제 GLB 형상과 대조한 뒤,
재선택·프로젝트 재열기 후 반복 면 편집하는 경로가 다음 목표다. 일반 도형·계층·페인트·컴포넌트·외부 모델도 별도 검증이 필요하다.
