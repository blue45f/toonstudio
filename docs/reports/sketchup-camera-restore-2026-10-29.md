# SKP 평행 카메라 적용과 직교 높이 보존 검증

- 상태: `current` — 아래에 명시한 구현·회귀·브라우저 범위.
- 확인일: 2026-10-29.
- 전체 SketchUp 지원 상태는 [요구 원장](../features/sketchup-feature-coverage.md)의 `migration` 판정을 따른다.
- 사용 경로와 한계는 [SKP 가져오기](../features/skp-import.md)에 기록한다.

## 구현된 현재 경로

실제 SKP 파일 → 변환 Worker → 검증한 원본 sceneSource → 최종 GLB extras → 렌더 캐시 →
선택 모델 원본 정보 조회 → 평행 Page 선택 → 공식 카메라 history 명령으로 연결했다.

원본 Page의 eye·target·up과 인치 높이를 실제 단위/축 변환, 캐시 정규화, 선택 모델의 부모 포함
월드 변환에 맞춘다. 정본 카메라의 `orthographicHeight`는 zoom 전 세로 높이이며, 실제 절두체와
트랙 resize·샷·프레이밍·다각도 캡처·Scene3D 왕복에 전달한다. 기존 필드 없는 문서는 필드 부재와
픽셀 절두체 동작을 유지한다. Scene3D에서 정확한 원본 shot ID의 편집은 해당 shot과 활성 선택에 반영한다.

파서가 노출하지 않은 원근 FOV의 가로/세로 기준, Page 저장 플래그·스타일·숨김 태그·단면·애니메이션은
적용하지 않는다. 원본 정보가 파서 기본값을 포함할 수 있다는 진단도 유지한다. 비균일 배율·전단·반사나
기존 거리/범위 제한이 eye를 바꿀 요청은 조용히 보정하지 않고 명시적으로 거부한다.

## 실제 브라우저에서 확인한 결과

브라우저는 Chrome for Testing 156.0.8078.4, 실제 WebGL2/SwiftShader였다. 공개 `initialScene`과
실제 파일 입력·버튼·저장 콜백을 사용했다. React 상태나 renderer를 결과로 바꾸지 않았고,
R3F의 실제 카메라·controls·행렬을 읽기 전용으로 관측했다.

| 검증 | 실제 결과 |
| --- | --- |
| 명시 높이 최초 마운트 | H=8, zoom=2, 실제 세로 span=8, 가시 높이=4 |
| 창 크기 변경 | 1600→1200→900→1600에서 H 유지, 폭은 실제 트랙 종횡비와 일치 |
| UI 확대 | zoom=2.4390243902439024, 가시 높이=3.28, H=8 유지 |
| 실제 캡처 | PNG 3843×2160 생성, 2m 상자 픽셀 높이가 투영 예측과 약 1.1px 이내 일치 |
| 저장 후 새 마운트 | 목표점 `[0,1,0]`, H=8, zoom 보존 |
| 기존 직교 문서 | H 미지정 상태와 픽셀 절두체를 마운트·resize에서 유지 |
| 실제 VFF 가져오기 | 파일 입력·SKP/GLB Workers·모델 배치·선택·원본 정보 조회 통과 |
| 평행 Page 적용 | eye `[0,12.7,0]`, target `[0.254,0.762,-0.508]`, H=3.6576m, zoom=1과 독립 계산한 up 일치 |
| Undo/Redo | Undo는 H 미지정·manual false·기존 zoom 80으로 복귀, Redo는 원본 평행 값 복원 |
| Page 캡처·재열기 | PNG 생성·직렬화 후 새 마운트에서도 eye·target·up·H·zoom 보존 |

최종 Page 실행에서는 관측 wrapper를 제거한 새 컨텍스트를 사용했고 pageerror는 0이었다.
카메라 UI 상태 fixture는 실제 컴포넌트·파서·reader에 제어된 비동기 callback을 연결한 별도 검증이다.
390px·1600px × light·dark·contrast 6조합에서 axe WCAG2A/AA·21AA 위반과 incomplete는 0,
가로 넘침은 0, 조작 요소는 최소 68.76×44px이며 키보드 focus를 확인했다.
실패·재시도·중복 차단·동시 JSON 다운로드·선택 변경 뒤 이전 응답 숨김도 통과했다.

## 검증 중 발견하고 수정한 경계

1. 최초 viewport 크기 `null`에서 width 접근으로 발생한 크래시: nullable 초기 상태를 검증하고 실제 크기 준비 후 높이를 복원한다.
2. 새 OrbitControls 준비 전 복원 pending 소비와 기본 target 덮어쓰기: 현재 camera의 controls가 준비된 뒤 API를 발행한다.
3. R3F size와 DOM 트랙 크기의 불일치: 호출 시점의 실제 DOM rect로 framing/apply를 계산한다.
4. renderer만 재마운트될 때 live 구도 유실: 새 복원 의도가 없을 때만 직전 live view를 pending에 보관한다.
5. R3F가 최초 `onUpdate`를 유지하는 경계: 설치된 R3F의 reserved prop 처리와 실제 writer stack으로 확인했다.
   mount 당시 값을 닫아 두는 callback 대신 호출 시 최신 정본 카메라와 트랙을 읽는 typed updater를 사용한다.
6. canonical과 OrbitControls가 eye를 옮기는 가까운/먼 카메라: 실제 최소·최대 거리 계약으로 확정 전에 거부한다.

## 파일·렌더 왕복과 자동 검증

실제 VFF → OpenSKP → GLB → GLTFLoader → GLTFExporter → 재로드 → 캐시 정규화/인스턴스 역배율 →
부모 이동·회전·균일 배율 → drei의 three-stdlib OrbitControls probe에서도 inch/m override가 일치했다.
120프레임 후 위치 오차는 약 `6.5e-14m`, `3.2e-13m`였다. 이 관측은 지원하지 않는 전단·반사 등을 허용하는 근거로 쓰지 않는다.

- 관련 통합 Vitest: **50파일 664개 통과**, 종료 코드 0.
- core·Scene3D·적용 명령·실제 controller/mount 경계별 scoped strict TSC 통과.
- 변경 TS 파일 ESLint, 변경 파일 Secretlint, `pnpm harness:check`, `pnpm validate:architecture`, `git diff --check` 통과.
- 기존 초과 파일 줄 수 상한 유지, Studio eager BG3D 18/18 유지.
- 최신 전체 `pnpm harness:verify`와 production build는 다른 작업과 공유하는 대형 검사 큐의 후속 순서다.
  이 보고서의 좁은 검증으로 전체 타입 검사·배포 빌드·운영 스모크를 완료했다고 판정하지 않는다.

브라우저·이미지·writer trace·독립 행렬 계산 자료는 로컬 산출물 경로
`/Users/hjunkim/.codex/visualizations/2026/10/28/01a1825c-1cc5-7e92-bfa3-5b175f6d9fcb/skp-orthographic-camera-2026-10-29/`에 보존한다.
실제 변환·캐시·OrbitControls probe는 `/private/tmp/toonstudio-skp-camera-review-20261029/`에 보존한다.
원본 상용 바이너리·배포본 template·생성 PNG를 저장소에 포함하지 않는다.

커밋·PR·배포 상태는 실행 시점별로 별도 확인한다. 이 검증에서는 운영 배포를 수행하지 않았다.
