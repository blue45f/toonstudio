# Mixbox 의존성 진단과 자체 안료 기능 내재화 검증 — 2026-11-05

- 상태: **current(변경안의 소스·로컬 검증), migration(과거 브러시), target(통합 검증 보충)**
- 진단 기준: GitHub `main`의 `8d315c85d6fde4a3a30255612c756d3e299a95b0`
- 변경안: `codex/mixbox-distribution-audit-20261105` 작업트리. 2026-11-05 사용자 결정으로 최종 전체 검증은 클라우드 CI에서 수행한다. 로컬 대형 빌드를 추가로 시작하지 않으며, 최종 커밋 SHA와 CI 결과는 아래 원장에 보충한다.
- 운영 배포: **이 작업에서 실행하지 않음**. 2026-11-05 18:56 KST 공개 운영 청크에 원본 Mixbox 데이터·GLSL이 포함됨을 읽기 전용으로 확인했다. 운영 계정의 실제 혼색 실행과 배포 SHA는 미확인이다.

## 1. 결론과 확인 범위

기준 `main`에는 외부 `mixbox@2.0.0`의 정적 import와 실제 호출 코드가 있었다. 기본 권리
프로필 `permissive-only`는 재료 실행 계획에서 해당 제공자를 거부했으나, 안료 비교 패널은
프로필을 받지 않는 팔레트 함수를 직접 호출했다. 따라서 **기본 브러시 실행 계획의 차단**과
**패키지 코드가 호출될 수 없음**은 같은 사실이 아니었다.

기준 `main` 전체의 재현 빌드는 미확인이지만 공개 운영 자산을 별도로 확보했다.
2026-11-05 18:56 KST 제공된 material-engine 청크에서 원본 Mixbox 2.0.0의 대형 데이터 문자열과
GLSL 문자열이 각각 SHA-256으로 일치했다(2.1절). 따라서 운영 배포물 포함은 확인했다.
운영 계정의 실제 혼색 실행, 배포물과 특정 Git SHA의 대응은 별도 미확인이다.
변경 후 빌드의 외부 모듈 미포함 결과를 이미 배포된 사이트의 수정 완료로 해석하지 않는다.

사용자 요청은 최초의 배포 포함·실행 경로 감사에서 패키지 제거 요청을 거쳐, **기능을 단순히
삭제하지 않고 REA로 공개 동작을 관찰한 뒤 자체 혼색 기능, 특히 브러시 기능을 보존하는 방향**으로
구체화됐다. 변경안은 외부 패키지와 호출을 제거하고 기존 자체 잠재 안료 모델을 재사용한다.
레시피·입력 파라미터 보존과 원본 Mixbox의 픽셀 출력 동일성은 구분한다.

| 판정 대상 | 기준 `main`에서 확인한 사실 | 변경안의 처리 |
| --- | --- | --- |
| 정적 import | 안료 제공자 파일이 `mixbox`를 정적으로 import | 외부 패키지·import 제거 |
| 기본 실행 계획 | `permissive-only`가 `noncommercial` 제공자를 거부 | 자체 제공자는 `internal`, 다른 제공자의 기존 권리 검사는 유지 |
| 팔레트·혼색 직접 호출 | 공개 함수에 프로필 인자가 없고 등록 여부만 확인 | 해당 함수에서 외부 Mixbox 호출 제거, 자체 혼색 사용 |
| 비교 UI | 렌더링 시 모든 모드의 팔레트 계산, Mixbox 선택 버튼 노출 | 자체 안료 표시와 호환 노드로 정정 |
| 실제 배포 청크 포함 | 공개 운영 청크의 원본 데이터·GLSL SHA-256 일치로 확인 | app·Worker 빌드 모듈 경계와 감사 산출물 추가. 수정안 최종 CI 확인 대기, 운영 미배포 |
| 상업 이용 서면 합의 | 식별자·범위 미기재 | 기록 보존. 패키지 제거를 허가 증빙으로 해석하지 않음 |

## 2. 기준 `main`의 경로와 빠져 있던 경계

아래 경로·줄 번호는 변경 전 기준 SHA의 소스다.

1. `apps/web/src/domains/creator/brush-lab/brush-studio-v6-pigment-provider.ts:1`은
   외부 패키지를 정적으로 가져온다. 같은 파일의 115~125행은 원본의 RGB↔잠재 변환을,
   184~191행은 `lerpFloat`를 호출한다.
2. `createBrushStudioV6PigmentPalette`와 `mixBrushStudioV6PigmentColors`는 등록된
   제공자와 유한한 입력을 확인하지만 권리 프로필을 받거나 검사하지 않는다.
3. `pigment/StudioPigmentComparison.tsx:48`의 `useMemo`는 모든 모드의 팔레트를
   계산한다. 12행의 Mixbox 모드도 포함되며 57행의 버튼에는 권리 프로필에 따른 비활성화가 없다.
   선택 이후 실행 계획에서 거부되더라도 비교 팔레트 계산은 이미 실행될 수 있다.
4. `StudioBrushV6Workbench.tsx`가 비교 패널과 재료 엔진을 가져오고,
   `StudioBrushLabPage`는 사용자 브러시 제작 경로에 연결돼 있다. route 진입의
   `lazyRetry(() => import(...))`는 다운로드 시점을 늦추지만 내부 정적 import의
   배포 제외를 보장하지 않는다.
5. `apps/web/vite.config.ts`와 `config/vite-manual-chunks.ts`의 청크 분할은
   패키지 권리 분리를 위한 별도 배포 프로필이 아니었다. 기준 SHA에 Mixbox를 제거하는
   빌드 경계가 있다는 근거는 확인되지 않았다. 최종 청크 이름·포함 바이트는 기준 빌드 미확보로 미확인이다.

기존 재료 분석·컴파일·저장 경로의 권리 검사는 삭제하거나 복제하지 않는다. 실제 누락은
그 검사 밖에서 실행되는 비교·직접 호출과, 런타임 권리 검사에 의존한 배포물 경계였다.

### 2.1 공개 운영 배포물 확인 — 2026-11-05 18:56 KST

공개 HTML·manifest·서비스 워커·해당 JavaScript만 HTTP GET으로 읽었다. 계정 로그인,
원고 변경, 배포·환경변수 작업은 하지 않았다.

- HTML은 `assets/index-DaQT4Bg2.js`를 불러온다.
- 공개 [`manifest.json`](https://www.toonstudio.cloud/.vite/manifest.json)의 SHA-256은
  `53eadc146a5370c743e1759679becbfe97adabbed0b129fa9ab8a1c4a6439bb4`다.
- manifest의 경로는 `index.html` → **dynamicImports** →
  `src/domains/creator/brush-lab/StudioBrushLabPage.tsx` → **imports** →
  `_brush-studio-v6-material-engine-JSWVCaJi.js`다. 앱 진입점의 정적 imports만으로는 도달하지 않는다.
- 공개 [material-engine 청크](https://www.toonstudio.cloud/assets/brush-studio-v6-material-engine-JSWVCaJi.js)는
  HTTP 200, 244,406바이트, SHA-256
  `1a96de5f4848ac29cd1eb9d248a8b69fcc2fd1e1efe5af698e8e3f990c920eb3`였다.
- 설치된 `mixbox@2.0.0` ESM의 141,700자 대형 문자열과 청크의 해당 문자열이
  SHA-256 `69daa03ad0e4ecf028812d754e3077850d245b43fd361c4ca5bfbd8042f3d91d`로 일치한다.
- 원본 공개 함수 `glsl()`의 3,774자 결과와 청크의 GLSL 문자열도
  SHA-256 `44468b8d497c2b4e3351ff7e66c04b940666d7b932539cd8f042a8a0651421bb`로 일치한다.
- `LATENT_SIZE`, `floatRgbToLatent`, `latentToFloatRgb`, `lerpFloat`,
  `lerpLinearFloat`, `lutTexture`, `mixbox-js-v2` 식별자도 같은 청크에서 관찰했다.

이는 단순히 “Mixbox” 단어가 들어 있다는 추론이 아니라 원본 데이터·셰이더의 바이트 동등성
증거다. 값 자체는 문서·제품·시험 기대값으로 복사하지 않았다. 원시 응답과 요약은 Git에서 제외된
`.qa/mixbox-internalization/live-artifact/`에 보존했다. `retrieval.json`과
`mixbox-fingerprint.json`이 URL·시각·응답·해시·정적/지연 경로를 기록한다.

## 3. 문서와 라이선스 감사의 불일치

- `docs/studio/production-toolchain.md`의 research-only·비실행 설명은
  `config/studio-production-toolchain.json`의 로컬 툴체인 작업에 대응했다.
  별도 Brush Studio V6 안료 제공자가 정적으로 패키지를 가져오는 것을 막지는 않았다.
- `docs/technology/engineering-libraries.md`는 Mixbox를 운영 경로로 표시하면서
  기본 프로필을 `noncommercial-full`로 적었다. 실제 기본값은 `permissive-only`였다.
- `third_party/mixbox/README.md`와 일부 공개 기술 설명은 프로필 거부가 빌드 제외를
  보장하는 것처럼 설명했다. 실행 계획·모듈 포함·운영 배포 상태를 각각 기록하도록 수정한다.
- `scripts/generate-third-party-notices.mjs`는 Mixbox 2.0.0의 CC-BY-NC-4.0을
  restricted production 예외로 허용했다. `pnpm licenses list --prod`와 설치 그래프에
  기초한 고지 인벤토리이며 실제 브라우저 청크의 포함 목록과는 다르다.
- 기존 `validateBrowserDistribution()`은 sharp/libvips를 검사했으며 Mixbox 제거를
  확인하는 검사는 아니었다. 라이선스 감사 통과를 Mixbox 미포함 증거로 해석하지 않는다.

공식 [Mixbox LICENSE](https://github.com/scrtwpns/mixbox/blob/master/LICENSE)는
비상업 조건과 별도 상업 라이선스 경로를 명시한다. 저장소의
[`LICENSE-GRANT.md`](../../third_party/mixbox/LICENSE-GRANT.md)는 합의 식별자·허용 범위가
미기재다. 과거 소유자의 독립 구현 분석 허락 진술과 원본 패키지의 상업 이용 허가는 구분한다.

## 4. REA 관찰과 독립 구현의 경계

REA로 공개 패키지의 자산·진입점과 공개 함수 동작을 관찰했다. 관찰을 맡은 경로와 자체 구현을
맡은 경로를 분리했고, 자체 구현 담당자는 원본 구현·LUT·계수·안료 상수를 열거나 복사하지 않았다.
기존 자체 모델의 입력은 프로젝트의 합성 반사율 곡선과 Kubelka–Munk 계산 결과다.

| 증거 | 식별자·범위 |
| --- | --- |
| REA 부모 증거 | `ev_f08fe927dfaf76a325d3143f95ac76a5de796e5c51f8fa983087a5f56ae02b0e` |
| 분석 대상 루트 artifact SHA-256 | `c68dbce0f12dc7ddb504c1a2df25df5516d7d729c16588b4b520380b1d2b23c1` |
| 공개 호출 관찰 증거 | `ev_16d6775e8d9f7687fb485fcec4e9855c7bfecdf3fde310868fdac031fb4f7c91` |
| 추가 공개 호출 관찰 증거 | `ev_10392221f996e8286e0b16c9bc8e1836dd7c6b4e80d91fc7d4c9524b20e4130a` |
| 정적 분석 범위 | `analyze_javascript_application`에서 선택된 ESM·package metadata 2개. 선택하지 않은 CJS 자산의 상태는 unknown으로 유지 |
| 원시 관찰 자료 | `.qa/mixbox-internalization/rea-evidence.json` — 로컬 전용, Git 제외. 원본 구현을 제품·문서로 복제하지 않음 |

공개 관찰 표면은 `LATENT_SIZE`, `lerp`, `lerpFloat`, `lerpLinearFloat`,
`rgbToLatent`, `latentToRgb`, `floatRgbToLatent`, `latentToFloatRgb`,
`linearFloatRgbToLatent`, `latentToLinearFloatRgb`, `glsl()`, `lutTexture(gl)`의
12개였다. 이 목록에 대응하는 역할을 자체 CPU·셰이더·텍스처 경계로 제공한다.
원본의 내부 계수, 텍스처 배치나 잠재 데이터와 호환되는 복제 구현을 뜻하지 않는다.

원본 공개 동작 관찰에서는 RGB/RGBA 배열·객체, CSS 색 이름·hex·`rgb()/rgba()`, float·linear,
7채널 왕복을 확인했다. 알파는 RGB와 독립 선형 보간이므로 투명색의 RGB도 혼색에 참여했다.
자체 CPU API는 이 알파 계약을 명시하며, 기존 자체 GPU의 coverage 가중 혼색과 차이를 숨기지 않는다.

## 5. 자체 기능과 브러시 보존 범위

### CPU와 GPU

`pigment/latent-pigment-api.ts`는 기존 자체 혼합기를 재사용해 CPU 공개 함수 9개와
`LATENT_SIZE = 7`을 제공한다. 8비트·float RGB/RGBA 배열·객체, CSS 색 이름·hex·함수 형식, 선형 RGB,
자체 packed7의 변환을 한 경계에서 검증한다. 입력 불변성, 유한값·범위 검사와 끝점 보존을 갖는다.
자체 packed7은 원본 Mixbox 잠재 배열과 교환할 수 없다.

GPU 역할은 `latent-pigment-shaders.ts`, `latent-pigment-table.ts`,
`latent-pigment-webgl.ts`가 담당한다. 자체 계산으로 표를 생성하며 GLSL 100/WebGL1의
2D atlas와 `OES_texture_float`, GLSL 300/WebGL2의 3D·2D atlas 및 WGSL을 구분한다.
텍스처 업로드 자원은 해제 경계를 제공한다. API 생성·모의 검증·실제 브라우저 shader/pixel
검증은 별도 단계이며 실제 GPU 검증 결과는 아래 통합 검증 원장에 보충한다.

### 브러시·저장 호환

- 기존 23개 레시피의 stable ID, 슬롯, 팁·질감·압력·pickup 등 tuning을 보존한다.
  표시명과 설명은 자체 혼색임을 밝힌다.
- 저장 노드 `pigment-mixbox`는 legacy alias로 보존하고 실제 제공자는
  `toonstudio-latent-pigment-v1/internal`을 사용한다. 외부 `mixbox-js-v2` 매니페스트는 제거한다.
- 과거 외부 binding이 담긴 재료·authoring은 명시 이주 API를 사용한다. 원본과 신규 receipt를
  분리하고, Mixbox 안료 binding 외의 제공자·설정 변경은 허용하지 않는다. UI는 원본 다운로드와
  자체 안료로 가져오기를 제공하며 사용자 선택 전까지 현재 브러시를 유지한다.
- 다른 노드의 권리 검사는 유지한다. 변경안의 23개 레시피 중 실행 가능한 수는
  `permissive-only` 5개, `source-available` 16개, `noncommercial-full` 23개다.
  이는 다른 copyleft·private-grant 노드의 제한이 남아 있기 때문이며 전체를 permissive로 바꾸지 않는다.

**보존하지 못했다고 명시할 사항:** 원본 Mixbox와 동일한 혼색·시각·성능은 증명하지 않았다.
과거 raw stroke를 자체 엔진으로 다시 렌더링했을 때 픽셀이 같다는 것은 보장하지 않는다.
저장 V1의 Mixbox 노드와 V2 외부 binding은 일반 별칭 재생을 차단하고 원고에 확인 필요 표시를 한다.
사용자가 확인하면 자체 혼색 사본이 기존 ID·그룹·순서를 이어받아 클리핑·애니메이션 참조를 유지한다.
이전 획 데이터는 새 보관 ID로 분리한다. 페이지는 별도 숨김·잠금 그룹에 보관하고 그룹 모델이
없는 마스터는 숨긴 개체로 보관한다. 출처에는 이전 ID·그룹·순서·숨김 상태를 기록한다.
유효한 보관본은 기존 UI 잠금 판정에서도 보호하지만 원본의 `locked` 값은 바꾸지 않는다.
이 출처는 라이선스나 변경 권한을 부여하지 않는다. 보관 출처나 기존 PSD·채색 마스크·3D 보정
연결 필드가 있는 획만 협업 v7·프로젝트 v6로 저장하고 일반 v6 획의 규약은 유지한다.
새 버전은 보관본뿐 아니라 활성 사본의 해당 연결 필드도 보존한다. 보관본의 생략된 센서 채널과
`kind/mode`는 새 기본값으로 채우지 않고 실제 Y 문서·재접속·파일 왕복에서 보존한다.
기존 v6 획이 자동으로 채우던 채널과 생략하던 필드는 서버의 기존 baseline과 정확한 정규 표현을
비교하므로 원본 자체를 바꾸는 근거로 사용하지 않는다.
REST 작품 불러오기는 파일 버전을 그대로 쓰지 않는 경로도 있어 파일 버전만으로 보호한다고
주장하지 않는다. 기존 `readerCapabilities`의 `legacy-pigment-preservation.v1`을 재사용해
보관본이 있는 작품의 구버전 전체 저장을 같은 트랜잭션 안에서 거부한다. 새 권한 체계는 만들지 않는다.
같은 보관 ID의 출처·본문 변경은 막되, 현재 보관 그룹 이동과 명시 ID·페이지 삭제는 기존
권한·CAS 흐름에 맡긴다. 서버가 읽은 같은 작품의 revision 복원도 기존 계약을 유지한다.
일반 페이지는 기존 commit/undo 경계를 사용하고, 마스터 편집은 기존 계약상 undo 이력 밖임을 표시한다.
페이지·계정·접근 권한·문서 세대·잠금을 전환 직전에 다시 확인한다. PNG·PSD·타임랩스·SVG·클립보드·타일 출력도
전환 전의 보이는 외부 혼색 획을 조용히 대체하지 않는다. 과거 원본 픽셀이 들어 있는 래스터 프록시는
확인되지 않아 원본 모습을 표시한다고 주장하지 않는다.

## 6. 패키지와 빌드 경계

- `package.json`과 `pnpm-lock.yaml`에서 외부 Mixbox 의존성을 제거한다. lockfile은
  pnpm으로 재생성했으며 이 과정에서 peer metadata 3곳도 재계산됐다. 수동 편집하지 않았다.
- 고지 생성기에서 Mixbox production 예외·핀을 제거하고, `mixbox` 이름의 재유입을
  라이선스 라벨 변경과 관계없이 거부한다. 과거 연구·권리 문서는 보존한다.
- `apps/web/config/vite-pigment-license-boundary.ts`를 app·Worker 빌드에 연결한다.
  정적·동적 import의 패키지 이름과 직접 npm 경로를 확인하고, 최종 `output.modules`도 검사한다.
  문서·legacy ID의 “Mixbox” 문자열을 일괄 금지하는 검사가 아니다.
- app은 `legal/pigment-bundle-audit.json`, Worker는 개별
  `legal/pigment-worker-audit-*.json`을 생성한다. 보고서는 검사한 청크·모듈 수와 자체 안료
  청크를 기록한다. 해당 파일의 생성과 실제 배포 완료는 별개다.
- 공개 기술 라이선스 목록의 기존 수기 snapshot은 117개에서 Mixbox 1개를 제거한
  116개다. 실제 설치 그래프 수집 124개와 같다고 주장하지 않는다. 나머지 차이를 이 작업의
  Mixbox 제거로 전부 해결한 것으로 보고하지 않는다.
- 저장 호환 경계를 추가한 최종 초기 그래프는 기존 상한 안에 유지한다. 사용하지 않는 선택형
  WGSL 생성기의 registry 재공개를 `./wgsl-variants` 전용 경로로 분리했으며, 실제 생성기와
  기존 WESL 호출은 유지한다. 그래프 기준선·허용치·권한 검사를 완화하지 않는다.

## 7. 검증 원장

아래 결과는 해당 작업트리의 로컬 실행이다. 미실행·미확인 결과를 성공으로 적지 않는다.

| 검증 | 현재 기록 |
| --- | --- |
| CPU 공개 API 속성 테스트 | `latent-pigment-api.test.ts` 43/43 통과. CSS 색 이름·RGB 객체 포함 |
| 고지 생성기 테스트 | `generate-third-party-notices.test.mjs` 18/18 통과. 패키지 제거 전 4개 실패는 제거 후 해소 |
| 새 CPU API·테스트의 ESLint | 통과 |
| 새 CPU API·테스트 isolated strict TypeScript | 통과. 저장소 전체 타입 검사와 구분 |
| 문서 하네스 구조 검사 | `pnpm harness:check` 통과 |
| 변경 문서·CPU 파일 Secretlint | 통과. 최종 보고서 포함 재검사 결과는 보충 |
| 공백·충돌 표시 검사 | `git diff --check` 통과 |
| 관련 브러시·UI·이주·권리 통합 테스트 | 로컬 중간 전체 56파일 1,355개 통과. 이후 raw 설정·초안·wrapper 4파일 96개, 저장 획·화면·출력 6파일 46개 후속 회귀 통과. 중복을 합산하지 않으며 최종 전체는 CI 대기 |
| 보관 출처·파일·협업·출력 후속 검증 | 보관본·활성 사본·센서 생략·PSD·채색 마스크·3D 연결, 실제 Y 재접속, JSON/envelope/ZIP·자동복구, 구버전 REST·서버 revision·undo 경계 회귀를 추가. 최종 합본의 CI 기록은 별도 보충 |
| GLSL/WGSL·실제 GPU 브라우저 픽셀 | Chromium 156 / SwiftShader 소프트웨어 장치, 표 33. WebGL1 atlas·WebGL2 atlas/3D의 96픽셀 오차 최대 1/255, 공개 독립 알파 6픽셀 오차 0. WGSL compute 32표본 오차 최대 2.2510080166515678e-7. dirty unpack/PBO 복원, 23종 실제 Canvas와 합성 pen 입력 통과. 실물 GPU·전체 앱·운영 스모크와 구분 |
| `pnpm harness:verify`, 영역 검증 | **최종 통합 결과 보충 대기** |
| 의존성 보안·라이선스 감사 | `pnpm audit:security` 알려진 취약점 없음, `pnpm audit:licenses` 통과(597 pnpm 항목), lockfile 20 importer 무결성 통과 |
| 변경안 프로덕션 빌드와 app·Worker 감사 JSON | 후속 저장 획 보호 전의 중간 로컬 빌드·postbuild·정적 bundle 검사 통과. app 2,659청크/12,861모듈, Worker 보고서 65개/121청크/1,847모듈에서 외부 Mixbox 모듈 0. 이 수치는 최종 코드의 빌드 증거를 대신하지 않으며 최종 CI 결과 대기 |
| 기준 `main` 프로덕션 빌드 | 미확인. 별도 pristine 8d315c85 체크아웃·frozen/offline 설치·prebuild까지만 성공했고, 디스크 조율 및 사용자 클라우드 CI 선택에 따라 전체 빌드는 시작하지 않음 |
| 현재 운영 배포 산출물 | 원본 데이터·GLSL 포함 확인(2.1절). 운영 혼색 실행·배포 SHA·수정안 반영은 미확인. 이 작업에서 운영 배포하지 않음 |
| 최종 변경 커밋 SHA·PR·병합 | **보충 대기** |

## 8. 남은 권리·품질 확인

자체 모델의 코드·데이터 출처와 상업 이용·방법 특허의 적격성은 별개다.
[`잠재 안료 기능 문서`](../features/latent-pigment-mixing.md)의 10장처럼 구조를 참고한
이력과 특허·서면 합의 미확인을 유지한다. 패키지 미포함 검증도 이 권리를 대신하지 않는다.

상업 라이선스 구매·외부 계약·운영 배포는 이 변경안의 완료 조건에 포함하지 않았으며 실행하지
않는다. 기능·설정 보존을 확인한 뒤에도 원본 대비 색·성능을 동등하다고 말하려면 별도의
품질 기준과 실제 기기·원고 코퍼스 검증이 필요하다.
