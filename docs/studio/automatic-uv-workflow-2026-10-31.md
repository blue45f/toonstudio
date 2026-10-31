# 자동 UV 작업 흐름 — 2026-10-31

상태: **migration — UI와 문서 발행 연결, 기준 입력의 관련 회귀·전체 하네스와 실제 Chrome 단일 작업 흐름 통과; 확장 검증은 남음**.

## 현재 기준

이 변경의 검증 기준 main은 `d4144662b97c8f8a02d6043d2bef7171cdd45573`이다. 조형 반경·toolbar 보정 #2594, UV 원본 대응 기반 #2596과 이후 병합된 공간 편집 #2598, 통합 #2601, 3D 원본 가져오기 #2602를 포함한다. 자동 UV 후속 16파일은 이 작업본의 변경이며, 이전에 병합된 PR의 구현으로 기록하지 않는다.

최초 범위 검사 기준은 `7976f79761b318be1d7bd39756c5df20d2c94e47`였다. 2026-10-31 현재 16파일을 원본 사본·별도 Git 참조에 보존한 뒤 해당 브랜치만 정상 fast-forward하고 자기 변경을 복원했다. 두 작업 모두 종료 0, 충돌 0이었다. 기존 사용자 stash와 다른 작업트리는 유지했다. 최신 main의 면 분할 연결과 자동 UV 전용 발행 prop이 뷰포트에 함께 남아 있다. 이후 실행한 범위 검사의 결과와 미완료 항목은 아래 검증 상태에 구분한다.

기존 UV 기반의 실제 기본 Worker 검사 `uv-native-d44a5045-r1`은 JS/WASM 로딩, 원본 정점 대응, 정본 코너 변환, 활성 pending 취소, dispose를 통과했다. 이 근거를 이번 새 UI·문서 발행·저장·재열기의 검증으로 대신하지 않는다. 기존 probe의 `actualUvBasis: unresolved`도 유지한다.

## 구현한 연결

- 재질 작업대의 UV 화면에 **자동 UV 펼치기**를 추가한다. 기본 해상도 4096, 픽셀 여백 4이며 사용자가 해상도·여백·회전을 바꿀 수 있다. provider의 지원 범위를 넘는 입력을 자동 축소하거나 다른 알고리즘으로 바꾸지 않는다.
- 사용자가 실행한 뒤 기본 Worker client와 provider를 동적으로 읽는다. UI에서 runtime·Worker factory·main-thread fallback을 주입하지 않는다.
- 계산 전의 문서·활성 자산·state hash·record revision·mesh hash와 정본 코너 계획을 포착한다. 적용 직전에 같은 원본인지 다시 확인한다. 변경 결과는 기존 `geometry.commit`과 workspace authority 동기화를 한 번 사용한다. 동일 UV는 원래 workspace를 반환한다.
- 계산·발행·완료를 구분한다. 계정·인증 세대·프로젝트·문서·오브젝트·workspace·도구 모드 변경과 unmount는 이전 작업의 abort/dispose와 guard 폐쇄로 이어진다. 이전 작업의 progress·result·finally가 새 작업을 해제하지 못한다.
- 부모의 편집 세대를 추가 확인해 React가 busy를 그리기 전에 시작된 다른 명령도 구분한다. 자기 발행으로 생기는 busy는 허용하되 부모 Promise와 실제 onCommitted 확인 전에는 새 작업을 시작하지 않는다. 계산·발행 중 명시 취소는 사용할 수 있다.
- 새 UV는 기존 UV를 교체한다. 원본 위치·면 구조와 이미지 파일은 재작성하지 않으며, 기존 텍스처의 배치는 달라질 수 있음을 안내한다. Undo·Redo와 저장은 별도 상태를 만들지 않고 기존 문서 경로를 사용한다.

## 숫자 UV와 이미지 원점의 구분

이번 자동 생성은 `createImage:false`이며 atlas 이미지가 아닌 새 숫자 parameterization을 반환한다. 호출부의 이름 있는 `STUDIO_UV_ATLAS_CANONICAL_BASIS = "v-up"` 상수는 이 숫자를 앱 정본 UV로 identity 해석하는 **애플리케이션 규약**이다. WASM 이미지 원점을 실측했다는 뜻이 아니다. interop의 필수 basis 인수, mapping·page·coverage 검증은 유지한다.

공식 xatlas.js README가 안내하는 같은 작성자의 xatlas-three 연동도 생성 `coords1`을 V 반전 없이 Three.js UV 속성에 연결한다. [xatlas.js 고정 README](https://github.com/repalash/xatlas.js/blob/517dae99cc547213a76ce7cbc1334df12db67c11/README.md#L27-L29), [xatlas-three 고정 연결 코드](https://github.com/repalash/xatlas-three/blob/8ae9119546b5bcdf48ecd049456ca3781c3bc69c/src/UVUnwrapper.ts#L182-L186).

앱의 UV 화면은 `y=-v`, GLB 내보내기·가져오기는 각각 `1-v` 경계를 사용한다. glTF 이미지의 원점 규약은 [Khronos 명세](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#_images)를 따른다. 외부 atlas 이미지 생성·재사용은 이번 구현에 포함하지 않으며, 해당 기능에는 UV와 독립된 비대칭 이미지 쌍의 방향 교정이 필요하다.

## 검증 상태와 남은 확인

다음 테스트를 정의하고 2026-10-31 첫 범위 검사를 실행했다.

- 순수 adapter의 위치·법선·topology 보존, 동일 UV no-op, 한 명령·Undo/Redo, 새 문서로 저장·재열기, GLB POSITION/NORMAL 보존과 TEXCOORD 변화
- stale 원본·변조된 provenance·잘못된 mapping·page·방향 거부 시 원본과 이력 보존
- 비동기 hook의 취소·늦은 결과·인증 세대·문서·자산·도구 전환·unmount·중복 실행·자기 publishing busy·ack·이전 finally 격리
- 실제 Panel·modifier cache 대기에서 단일 확정, 취소·계정 변경 후 늦은 발행 차단, Undo/Redo·저장 재진입
- UI의 입력·진행 상태·취소·오류·재시도와 기존 테마 토큰·접근성 설명

격리 작업본의 고정 lockfile 오프라인 설치와 `pnpm harness:doctor`는 종료 0이었다. 정확히 7파일을 지정한 단일 worker·첫 실패 중단 검사에서 49개 통과·1개 실패, 종료 1을 확인했다. 수집 총계는 65개였으며, 첫 실패로 실행을 중단했으므로 전체 실행 성공으로 기록하지 않는다. ESLint는 이 중단 뒤 실행하지 않았다.

실패는 hook 단위 대역이 부모 Promise를 완료한 뒤에도 `editingDisabled:true`를 계속 전달하면서 잠금 해제를 기대한 단언이었다. 실제 Panel은 `finally`에서 잠금을 해제한다. 교정한 시험은 Promise 완료 뒤 `idle`과 외부 잠금 유지를 확인하고, 부모의 새 workspace와 `editingDisabled:false`를 재렌더한 뒤 잠금 해제·성공 안내 보존을 확인한다. 제품의 외부 잠금 보호는 유지했다.

현재 main으로 동기화한 입력의 두 번째 범위 검사(`focused-synced-r3.json`)는 종료 1이었다. hook 29개·UI 11개·순수 adapter 17개·기존 UV 편집기 19개, 총 76개가 통과했다. 실제 Panel의 한 번 확정과 원본 정점 보존·Undo stack 증가를 확인한 뒤 저장·재열기 시험에서 1개가 실패했다. 첫 실패 중단으로 같은 시험 파일의 나머지 2개와 요청한 host·pack 시험 파일은 실행하지 않았으며, ESLint도 실행하지 않았다.

두 번째 실패는 jsdom의 `TextEncoder` 출력과 현재 `Uint8Array` 생성자의 실행 영역 차이였다. decoder는 잘못된 바이트 타입과 크기 초과를 같은 오류 코드로 거부한다. 같은 jsdom 환경의 기존 UV 편집기·Panel 시험처럼 `Uint8Array.from(encodeStudioHybridDccWorkfile(...))`로 바이트 값을 그대로 복사해 현재 실행 영역의 파일 입력을 만든다. 저장 한도·decoder·단일 명령·Undo/Redo·저장 재열기 단언은 바꾸지 않았다.

2026-10-31 해당 입력 교정 뒤 `focused-workfile-fixture-r4.json`의 **7파일·91개 시험이 모두 통과**, 실제 실행은 종료 0이었다. 누락·pending 사례는 없었다. 이어 변경한 TS/TSX 15파일의 ESLint(`--max-warnings=0`)도 종료 0이었다. 기준 HEAD는 `d4144662b97c8f8a02d6043d2bef7171cdd45573`이며 해당 실행 전후 소스·도구·의존성 입력이 같고, 알려진 실행 그룹과 로그 쓰기 프로세스가 남지 않은 것을 확인했다. 이전 실패 결과를 삭제하거나 성공으로 바꾸지 않았다.

이 회귀는 실제 Panel의 발행·취소·계정 전환·Undo/Redo·작업파일 저장과 재열기를 포함하되 Canvas와 Worker 계산은 제어 대역이다. 기본 WASM Worker와 실제 GPU·파일 선택기를 사용한 브라우저 성공으로 해석하지 않는다. 전체 하네스·정상 커밋·푸시는 이 범위 검사와 구분해 후속 결과를 기록한다.

이후 전체 타입 검사 전 정적 검토에서 hook 시험 대역의 타입 불일치 한 곳을 확인했다. 실제 Worker client의 `execute`는 `unknown` 입력을 받는데, 시험 대역은 이를 요청 객체 타입 필드에 바로 대입하고 있었다. 시험이 실제 계약대로 `unknown` 값을 기록하고, 같은 해상도·여백·회전 옵션을 중첩 객체 단언으로 검증하도록 보정했다. 제품 코드·입력 값·시험 사례·보호 조건은 바꾸지 않았으며 cast·ignore도 추가하지 않았다. 이 후속 입력은 `hook-type-contract-r5.json`에서 hook 29개 모두 통과, 종료 0을 확인했다. 앞선 91개와 이번 29개는 중복되므로 합산하지 않는다.

첫 전체 하네스는 변경 파일 lint·Secretlint·문서·구조 검증을 통과한 뒤 웹 전체 타입 검사에서 종료 2였다. UI와 Panel 통합 시험의 `getByRole` 두 곳이 `ByRoleOptions`에 없는 `exact:true`를 전달한 `TS2769`였다. 설치된 Testing Library의 역할 query는 이 옵션을 읽지 않고, 문자열 `name`은 접근성 이름의 전체 문자열과 `===`로 비교한다. 따라서 두 옵션만 제거해도 기존 선택과 단언의 의미는 유지된다. 제품 코드·버튼 이름·시험 사례·단언은 바꾸지 않았다. 첫 실패 뒤 커밋·푸시는 실행하지 않았다.

교정 입력의 `uv-role-contract-r6.json`은 UI 11개·실제 Panel 통합 3개, 총 2파일·14개 모두 통과했으며 종료 0이었다. 이어 `pnpm harness:verify --base=d4144662b97c8f8a02d6043d2bef7171cdd45573`는 변경 TS/TSX 15파일 lint·텍스트 16파일 Secretlint·문서·구조·소스 크기·Studio 진입 그래프와 웹·API 전체 타입 검사를 모두 통과하고 종료 0이었다. 실행 전후 다른 소스 입력은 유지했다. 이미 통과한 hook 29개를 반복 실행하거나 기존 91개와 중복 합산하지 않았다. 정상 커밋·푸시 결과는 PR의 게시 기록과 구분한다.

### 실제 Chrome 단일 작업 흐름 — 2026-10-31

HEAD `b2b4d477859a031b108ddf9cd3607d69029de3f7`에 config SHA-256 `e8756a029cb0b4f8aaac158f15d22ff847e7ec2e982ed388cd0cec244d6a78df`, spec SHA-256 `75a5bb263ea07251fda2805bd05688a8fada6f8ec2bf8f4427712a5178571825`를 적용한 입력에서 실제 Chrome 검증 **session 16100·종료 0·1사례 통과·53.08초**를 확인했다. 실패·건너뜀·flaky는 0이었다. Chrome for Testing 156.0.8078.4와 Apple M2 Max ANGLE Metal WebGL2를 사용했다. 이 결과는 해당 입력과 단일 사례에 귀속되며 이후 main 전체의 검증으로 확대하지 않는다.

Vite의 실제 제품 화면에서 큐브 추가 → 자동 UV 버튼 → 기본 dedicated Worker와 실제 WASM 로딩 → 정본의 단일 `geometry.commit` → Undo·Redo → `.toon3d` 다운로드 → 실제 파일 선택기와 교체 확인 대화상자를 통한 재열기를 연결했다. 원본 geometry 보존, 편집 이력 한 단계 증가, 다시 연 정본 메시의 일치를 확인했다. 이 1사례를 기존 91개·29개 등 단위 시험 수와 합산하지 않는다.

원본 영수증은 ignored QA의 `.qa/native-3d-postmerge-20261030/uv-workflow-followup-20261031/runtime-browser-20261031-r4/cleanup-return-r1.json`과 같은 폴더의 `report.json`이다. SHA-256은 각각 `f8df9fb45db5a66889c4a734541ae2e19ffe63c634f403d51e2ee51fb986a925`, `487a4ac80804a5c34714112ae5adb66d856a27b5c4c8559d850b2a3e99eb764b`이다. 실행 전후 입력 핀이 같고 소유 프로세스·로그 writer·5359 포트 잔류가 없음을 확인했다.

`actualUvBasis: unresolved`는 유지한다. 비대칭 텍스처의 실제 GPU 소비와 방향 교정·독립 GLB loader·큰 메시의 응답성·메모리 검증은 남아 있다. 아래 새 production bundle의 빌드·정적 CSP 검사는 통과했지만, 해당 번들에서 자동 UV Worker·WASM이 로드되고 CSP 아래에서 실제 UV 작업이 완료되는 runtime 검증은 별도로 남아 있다. 이 Vite 단일 사례와 production bundle의 정적 검사 결과는 각각의 입력과 범위에 귀속한다.

### 정본 main의 production bundle·정적 CSP — 2026-10-31

정본 main `2d54336c67e5c902e044ea4aec5201bccb9db5f6`, source tree `c35c90a6478896215c6ef13112e6a222daf2a832`의 로컬 빌드는 **session 35483·종료 0**이었다. `VITE_CATALOG_SOURCE=static` 입력의 `pnpm run build:bundle`과 `pnpm run check:studio-bundle`이 각각 종료 0이었고, postbuild의 `verify-static-csp.mjs dist/index.html`도 provider-neutral CSP와 inline data block hash 1개를 확인했다. bundle 검사는 정적 구조 검사이며, 기존 startup runtime 수치를 새로 측정한 결과로 해석하지 않는다. 운영 배포는 실행하지 않았다.

새 산출물의 SHA-256은 `dist/index.html`이 `f2fd5f4451595954c2eff44b9a74666be6b56abfdafa019c6a4df3060a25a230`, `dist/.vite/manifest.json`이 `a8d1436ad25cc626d4b23964ac959a9306f57d7d1fe717181aacedadf926bc91`이다. 빌드는 격리한 index로 실행했으며, 실행 후 정본의 stage 41,170항목·작업파일 실제 내용·생성 파일 14개의 SHA가 유지되고 소유 실행 그룹이 모두 종료된 것을 확인했다. 앞선 session 30870은 raw index 보존 검사 실패로 남기며 이번 성공으로 바꾸거나 합산하지 않는다.

원본 완료 영수증은 공통 Git의 `.git/cleanup-evidence-20261030/bg3d-retained-authority-20261031/runs/cpu-r1-main2d54-build-isolated-r2/completion.json`이며 SHA-256은 `41f6261f7f0bb961c38c77b77067d418f30de8d4f0a7fb69f0129bdbde8df61b`이다. 실제 session과 정본 보존 확인은 공통 Git의 `.git/cleanup-evidence-20261030/bg3d-retained-authority-20261031/index-isolation-main2d54-r2/actual-return.json`에 남겼다. 이 빌드·정적 CSP 통과를 새 번들의 자동 UV runtime·비대칭 텍스처 방향·독립 GLB·큰 메시 검증 통과로 확대하지 않는다.
