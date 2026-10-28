# SketchUp REA 조사와 실제 장면 통합 재검증

- 날짜: 2026-10-28
- 상태: `current` — 이 작업트리의 조사·로컬 구현 기록. 운영 배포 완료 기록이 아니다.
- 기능: [배경 건축 도구](../features/sketchup-background-modeling.md).

## 조사 결과

이전의 [2026-10-26 보고서](../studio-rea-competitor-benchmark-2026-10-26.md)와
[동적 구성 요소 보고서](../studio-rea-sketchup-asset-dynamic-components-2026-10-26.md)는
수학 커널·패널·호환 파서 구현을 실제 사용자 장면 통합과 구분하지 않고 완전 내재화로 표현했다.
2026-10-28 소스 추적에서는 `AdvancedWorkbenchHub`의 도형이 내부 staging 배열에만 쌓이고,
실제 런처는 삽입 포트를 전달하지 않는 것을 확인했다. 배열·태양광·복원 콜백도 상태 문구만 바꿨다.
해당 기능 전체의 현재 지원 여부는 이 보고서와 source/tests를 우선한다.

## REA로 관측한 사실

REA 6.8.0 / reverse-engineer-anything 스킬 49로 로컬 `openskp@1.3.0`의 `dist/index.js`만
`analyze_javascript_application(detail=summary)`로 분석했다. 별도 MIT 선언 `.skp` 파서 패키지이며
SketchUp 실행 파일이 아니다. 네이티브 분석 provider는 사용하지 않았다. SketchUp 데스크톱 설치본은
확인한 `/Applications` 목록에 없었다.

| 항목 | 값 |
| --- | --- |
| 패키지 SHA-256 | `513f2eeaa30e1b5b0543b036125459340921a0dded17b281c523c6095e479c10` |
| 분석 파일 SHA-256 | `3b4a418e320920083aefa7551a924954b336e5addd0182971c7c66aeab575c2d` |
| 분석 파일 크기 | 427,935 bytes |
| 부모 Evidence | `ev_bea01be8a40d270d092faaed4a11ed356f17ffa5568c7553df3621815d1350db` |
| 파일 뷰 Evidence | `ev_985b3123e80ada8c28929f6a61c9bc9440b3b131ad0fa94770c60e244327d6ff` |
| 결과 | JS 1개, AST 노드 70,342개, findings 89개, parse failure 0개 |
| 한계 | 인벤토리 파일 4개 미분석, semantic unknown 15,916개, application unknown 4개, 관계 그래프 partial |

같은 파일의 일반 소스 읽기에서 동적 속성 사전, `parallel`/`orthoHeight` 카메라 정보,
`buildInstancedScene`, `toGLB`를 확인했다. 정적 분석은 실제 모델 편집 실행을 관측한 증거가 아니다.

REA `capture_browser_scenario`로 [SketchUp for Web](https://app.sketchup.com/app)을 새 Chrome 임시 프로필에서
열었다. [Trimble 로그인 화면](https://id.trimble.com/ui/sign_in.html)으로 이동했으며 접근성 트리에
Sign In, Email or username, 비활성 Next가 관측됐다. 로그인이나 모델 편집은 수행하지 않았다.

- 웹 Evidence: `ev_a40b679481b930079135df4f7c5a358d0dac5d95100d41eb7b3e5e81b05e6e38`
- DOM SHA-256: `95299c6cd2ee97c3ef401ac5ce85d9b3676f0586e67ab79593e13a31ee28ffbf`
- 접근성 SHA-256: `a9ea69a87b406369f1b253c766a4f69e4925f1f627862f282244e55124cd42ae`
- 네트워크 이벤트 123개 유지, 누락 0개. 브라우저 종료 `terminated-owned-process`, 최종 `close_binary` 성공.
- 최초 20초 launch deadline 실패 후 증거 export와 정리를 거쳐 권고된 60초 command deadline으로 1회 재시도했다.
- 전체 증거는 로컬 `/private/tmp/toonstudio-sketchup-rea-20261028/`에 보관했다.
  웹 원본의 임시 OAuth query와 외부 페이지 전체 내용은 저장소에 복사하지 않았다.

## 구현 판단과 미확정 영역

호환 파서와 기존 ToonStudio 생성기를 재사용할 수 있다는 것은 구현 판단이다.
원본 SketchUp 커널의 알고리즘·완성도·완전 호환을 입증하지 않는다. 이번 변경은 건축 요소의
치수·위치 편집과 실제 장면 삽입 연결에 한정한다. 로그인 뒤 모델러, 비공개 WebAssembly,
원본 데스크톱 내부와 전체 SKP 왕복 호환은 미확정이다.

## 로컬 검증

- 관련 Vitest 6개 파일의 고유 테스트 35개 통과: 건축 패널 10개, 작업대 허브·기존 SketchUp 패널 6개,
  삽입 명령 4개, 실제 씬 연산 호스트 14개, 런처 삽입 연결 1개.
- 실제 씬 연산 호스트 테스트에서 도형 추가·첫 선택·노드 한도 거부, runtime/document adapter의
  직렬화·parse·hydrate, 제품 debounce history adapter의 묶음 undo/redo를 검증했다.
- Chrome의 실제 프로덕션 건축 컴포넌트 + 삽입 bridge + 관측용 메모리 호스트에서
  치수·위치 적용, 2회 배치 16개 도형/16개 고유 ID, 잠금 거부, 빈 입력 차단을 확인했다.
- light/dark/contrast 테마의 데스크톱 화면과 390px 모바일 화면을 확인했다. 모바일 가로 넘침 없음,
  axe WCAG 2 A/AA·2.1 AA 위반 0개, page error 0개였다. 접근성 검사는 해당 컴포넌트 fixture 범위다.
- `pnpm harness:check`, 변경 파일 Secretlint, 아키텍처·문서·앱 경계·파일 크기·Studio eager graph 검사는 통과했다.
- 전체 `pnpm harness:verify`는 위 게이트를 통과한 뒤 루트 TypeScript 검사에서 15분 이상 종료되지 않아, 이번 작업에서 시작한 compiler 프로세스만 SIGTERM으로 중단했다. 전체 하네스 통과로 보고하지 않는다. 중단 시 타입 진단 출력은 없었으며 API typecheck는 실행되지 않았다. 다른 작업 세션의 검사는 변경하지 않았다.
- 전체 편집기의 실제 WebGL 장면과 브라우저 저장소 재개방, 운영 환경 스모크·배포는 수행하지 않았다.


## 2026-10-29 후속 구현 및 검증

- 실제 `triangularPrism`은 Y축 삼각기둥이므로 박공·한옥 지붕 본체를 X축 -90도로 눕히고,
  단면의 실제 범위에 맞춰 scale과 중심을 보정했다. 용마루는 수평 Z축을 따르고
  입력한 본체 폭·높이·깊이와 처마 기준 높이 2.4m를 보존한다.
- 실제 렌더 도형의 정점과 transform으로 치수·용마루를 검증하는 회귀 4개를 추가했다.
  기본 부품 기준 치수 안내와 종류별 미사용 입력 처리를 검증하는 패널 회귀 2개도 추가했다.
- 최종 관련 Vitest 7개 파일, 47개 테스트가 통과했다. 이전 35개 결과를 포함하는 검증이다.
- 실제 `StudioBackground3D`를 사용하는 [저장·복원 검증 화면](../../apps/web/tools/browser-harnesses/sketchup-background-editor.tsx)을 추가했다.
  제품 host·renderer·capture를 그대로 사용하고, `onInsert`가 반환한 문서만 실제 serializer로
  localStorage에 저장한다. 재열기는 실제 parser와 새 편집기 인스턴스의 restore 경로를 사용한다.
  이는 전체 Studio 캔버스·서버 저장 repository와는 구분되는 편집기 경계 검증이다.

- 실제 편집기 브라우저 검증은 Chrome SwiftShader WebGL2에서 통과했다. 박공 지붕과 계단
  9개 요소를 생성하고 Undo/Redo 조작 뒤 2733×1534 픽셀·3개 LT 레이어로 캡처했다.
  `onInsert.bg3dScene`을 localStorage에 저장하고 새 편집기 인스턴스로 재개방한 뒤 다시 캡처했으며,
  요소 수·ID·이름·좌표·회전·크기가 모두 보존됐다. 최종 page error는 0개다.
- 검증용 개발 서버는 실제 작업대의 PSD 모듈도 prebundle하여 CommonJS interop을 적용했다.
  엔트리 재평가 시 React root를 재사용하도록 검증 화면을 보강했다. 실제 제품 renderer·capture를 mock하지 않았다.
- 위 브라우저 증거는 로컬 시각 산출물 폴더의 `sketchup-real-editor-proof.json`,
  `sketchup-editor-generated.png`, `sketchup-editor-reopened.png`에 보관했다.
  물리 GPU 및 배포 빌드, 전체 Studio의 서버 저장 경로를 검증한 것으로 확대하지 않는다.
