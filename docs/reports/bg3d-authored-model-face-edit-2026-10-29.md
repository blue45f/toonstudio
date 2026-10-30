# BG3D 편집 모델 반복 면 편집 검증 — 2026-10-29

- 상태: `current` — 구현·집중 검증·최종 고정 소스 브라우저 검증 통과. 전체 검사·운영 반영은 별도 대기.
- 작업 브랜치: `codex/sketchup-authoring-reedit`, 기반 `aa336ccb8c4c54999dd6e74d2c590da8ff851fb7`.
- [기능·지원 경계](../features/bg3d-authored-model-face-edit.md), [전체 요구 상태](../features/sketchup-feature-coverage.md).
- 이 기록은 SK33의 독립 단색 상자 파생 모델에 한정한다. 전체 SketchUp 기능 완료·운영 반영 기록이 아니다.

## 변경과 근거

첫 면 편집으로 만든 모델을 다시 선택해 실제 면 도구로 편집하도록 연결했다. 정확한 double mesh와 정규
위상·revision·hash·과거 TRS·고정 단색을 v1 authoring envelope로 GLB에 보관한다. 읽을 때 실제 exporter와
재질 writer로 재생성한 GLB의 JSON/BIN을 비교하며 Float32 렌더 좌표에서 원본을 추정하지 않는다.

현재 canonical 배치·지원하는 단색 override를 과거 내보내기 기록보다 우선한다. 원래 권리·attribution,
선택 노드 ID, 이름·tags를 보존하고 새 정규화 배율에 대응한다. 공유하는 다른 인스턴스와 이전 저장
GLB·캐시를 바꾸거나 삭제하지 않는다. 한 번의 배경 Undo/Redo가 이전·새 모델을 전환한다.

첫 변환의 마지막 저장 조회 직후 새 모델 B가 삭제되어도 장면/history가 만들어지는 경쟁을 실제 재현했다.
공통 orchestrator가 첫 변환은 `[B]`, 반복 편집은 `[A, B]`를 같은 읽기 snapshot에서 검증하고 동기 commit까지
lease를 유지하도록 보완했다. 원래 요청·operation signal을 감시하며 실제 unlock이 끝난 뒤 목록 갱신·보상한다.
같은 origin의 공개 V12 writer가 지키는 WebLock 범위이며 직접 DB/CAS 수정까지 보호한다고 주장하지 않는다.

## 실행한 집중 검증

| 검증 | 실제 결과 |
| --- | --- |
| 관련 Vitest, `--maxWorkers=2` | 20파일 **411/411 통과**, 12.19초 |
| 현재 root 소유 진입점과 전이 import의 strict scoped TSC, 4096 MiB 제한 | exit 0 |
| 변경 TS/TSX 34파일 ESLint | exit 0 |
| 변경 38파일 Secretlint | exit 0 |
| `pnpm harness:check` | exit 0 |
| `pnpm validate:architecture` | exit 0, BG3D 정적 도달 18/18·지연 무효화 0개 |
| `pnpm validate:documentation` | exit 0 |

411개에는 strict JSON·GLB·material, 현재 source/host/summary, workspace/export, 두 orchestration,
순수 교체, 실제 저장 권위·read lease, 기존·새 UI 회귀가 포함된다. Orchestration 테스트의 저장 Worker/OPFS와
lease는 typed seam이며 exporter·codec·strict validator·verified loader·admission·source·history는 실제 구현이다.
별도 lease 회귀는 실제 SQLite memory/CAS와 공개 V12 import/delete·공유 lock의 두 authority를 사용한다.
이것을 전체 저장소 테스트나 production build 통과로 확대하지 않는다.

## 최종 고정 소스 브라우저 검증

실제 `StudioBackground3D`와 face editor를 사용하는 로컬 개발 fixture에서 원본 클릭·면 도구·Worker 검증·
SQLite/OPFS 저장·캡처를 실행한다. 애플리케이션 상태나 명령은 주입하지 않고 DOM·R3F·저장 원본을 읽어 확인한다.
Chrome for Testing `156.0.8078.4`의 새 context에서 WebGL2/SwiftShader로 실행했다.
WebGPU adapter가 없어 실제 `WebGL2로 계속` 버튼을 눌렀다. WebGPU·전체 production CSP·타 플랫폼 검증은 아니다.

시작은 위치 `[0.4, 0.6, -0.5]`, 비균일 배율 `[1.8, 0.6, 2.2]`, 색 `#8d6378`인 실제 상자다.
면 도구의 로컬 확정·Undo/Redo가 반영 전 배경을 바꾸지 않고, 세 번 모두 같은 node ID를 교체했다.

| 회차 | 실제 Push/Pull 거리 | 저장한 원본 double 최대 Y | 실제 GLB |
| --- | --- | --- | --- |
| 1 | `0.12345678901234566` | `0.6234567890123457` | 5156 bytes |
| 2 | `0.2345678901234567` | `0.8580246791358024` | 5160 bytes |
| 3, 문서 저장·새 마운트 뒤 | `0.05` | `0.9080246791358024` | 5160 bytes |

첫 적용 뒤 실제 위치 X 입력을 `1.25`로 바꾸었다. 두 번째·세 번째 편집은 현재 위치를 유지하며 과거 `0.4`로
돌아가지 않았다. 회전·비균일 배율에 따른 배치, 고정 PBR 색·roughness 1·metalness 0·depth bias도 유지했다.
두 번째와 세 번째 적용을 각각 한 번의 배경 Undo/Redo로 이전/새 모델에 정확히 복원했다.
이전 A/B를 포함한 저장 record 3개가 남아 있으며 실제 바이트 SHA와 authoring mesh hash를 확인했다.

두 번째·세 번째 결과를 각각 실제 **2733×1534 PNG, 3개 레이어**로 캡처하고 정본 문서를 저장했다.
두 번의 새 마운트 모두 읽기 전용 observer의 node ID·TRS·world bounds·재질·authoring hash와 double 좌표가
직전 결과와 일치했다. 최종 **17개 확인 항목 전부 true**, page error 0·console error 0·HTTP 실패 0이다.

390/1600 px × light/dark/contrast 6조건의 axe-core `4.14.0` 결과는 자동 위반 0·가로 넘침 0이다.
데스크톱 incomplete는 0, 모바일은 설명 문단의 `Element midpoint exceeds the grid bounds`로 각 1개다.
실제 computed foreground/background RGB를 측정한 대비는 각각 **8.32:1, 8.27:1, 15.71:1**로 4.5:1 이상이다.
키보드 Tab/Shift+Tab의 modal 내부 focus 순환도 확인했다. 자동 판정 보류를 자동 통과로 표현하지 않는다.

산출물은 로컬 visualization의 `authoring-reedit-browser-2026-10-29/`에 보관했다. `flow-proof.json`의
SHA-256은 `d2a88f1229a494c0e0dc2b76b7d8f7cd79b699680cdd50e8d5a1dcae7075d99b`다.
실제 GLB 3개·정본 JSON·캡처·6개 UI 화면·재현 fixture/script·검증 로그와 변경 production 22파일의
`source-manifest.json`을 함께 보존했다. 최종 소스 hash 전부 일치, 소유 브라우저·서버 종료 exit 0을 확인했다.
공통 lease 보강 전 실행은 `pre-final-read-lease/`로 분리해 최종 증거와 섞지 않았다.

## 전체 검사·Git·운영 상태

전체 `pnpm harness:verify`, Web `pnpm build:bundle`, `pnpm check:studio-bundle`은 다른 ToonStudio 작업과
조정한 heavy 검사 순서의 명시 시작 신호를 기다린다. Scoped TSC와 411개 회귀로 이를 대체했다고 판정하지 않는다.
로컬 구현 브랜치이며 push·PR·병합·배포는 수행하지 않았다. 기존의 전체 검사 후보 작업트리는 별도로 보존했다.

일반 primitive·외부 GLB·구형 원본 없는 GLB·부모 계층·컴포넌트·페인트·텍스처·리그·애니메이션·임의 위상
직접 편집은 남아 있다. FOV 축·aspect가 노출되지 않는 native SKP 파서 경계 등 다른 요구의 미완료도 그대로다.
