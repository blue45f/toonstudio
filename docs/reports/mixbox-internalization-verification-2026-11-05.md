# Mixbox 의존성 진단과 자체 안료 기능 내재화 검증 — 2026-11-05

- 상태: **current(변경안의 소스·로컬 검증), migration(과거 브러시), target(통합 검증 보충)**
- 진단 기준: GitHub `main`의 `8d315c85d6fde4a3a30255612c756d3e299a95b0`
- 변경안: `codex/mixbox-distribution-audit-20261105` 작업트리. 2026-11-05 사용자 결정으로 최종 전체 검증은 클라우드 CI에서 수행한다. 로컬 대형 빌드를 추가로 시작하지 않으며, 최종 커밋 SHA와 CI 결과는 아래 원장에 보충한다.
- 운영 배포: **이 작업에서 실행하지 않음**. 2026-11-06 08:00 KST 재조회에서도 공개 운영 청크에 원본 Mixbox 데이터·GLSL이 포함됨을 읽기 전용으로 확인했다. 운영 계정의 실제 혼색 실행과 배포 SHA는 미확인이다.

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
레시피·입력 파라미터 보존과 원본 Mixbox의 픽셀 출력 동일성은 구분한다. 2026-11-06 사용자는
**원본 혼색 결과까지 재현**하는 것을 완료 기준으로 확정했다. 현재 자체 모델의 최대 채널
차이 55/255는 수용된 결과가 아니며, API 역할 구현·패키지 제거·자체 GPU 정합성을 이 기준의
완료로 처리하지 않는다. 이 결정 이후에도 제품 혼색 계수는 변경하지 않았다.

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

2026-11-06 08:00:45 KST(`2026-11-05T23:00:45.022Z`)에도 같은 공개 파일 네 개를
읽기 전용으로 재조회했다. HTML과 manifest의 진입 파일이 일치하고, 위 지연 경로·청크
SHA-256·원본 LUT/GLSL 지문 두 개·서비스 워커 참조가 그대로였다. 청크 구문 오류는 0개다.
원문·응답 정보·지문·구문 검사는 Git 제외 폴더
`.qa/mixbox-internalization/live-artifact-20261105230045022/`에 보존했다. 이 시점의 선택한
공개 청크 포함을 확인한 것이며 모든 지역·사용자 캐시·계정 실행이나 특정 배포 SHA를 증명하지 않는다.

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
배포 기준 `mixbox@2.0.0`의 CJS와 Vite가 읽는 `mixbox.esm.js`에 공개 호출을 재실행해,
CSS 색 이름·hex·RGB 객체 입력의 `lerp` 결과가 실제 숫자 배열임도 확인했다. 최신 README의
CSS 직접 대입 예제를 이 버전의 반환 계약으로 추측하지 않는다. 구현·LUT를 읽지 않은 관찰 자료는
로컬 전용 `rea-public-output-types.json`에 버전·entry·시각과 함께 남겼다.

## 5. 자체 기능과 브러시 보존 범위

### CPU와 GPU

`pigment/latent-pigment-api.ts`는 기존 자체 혼합기를 재사용해 CPU 공개 함수 9개와
`LATENT_SIZE = 7`을 제공한다. 8비트·float RGB/RGBA 배열·객체, CSS 색 이름·hex·함수 형식, 선형 RGB,
자체 packed7의 변환을 한 경계에서 검증한다. 입력 불변성, 유한값·범위 검사와 끝점 보존을 갖는다.
자체 packed7은 원본 Mixbox 잠재 배열과 교환할 수 없다.

GPU 역할은 `latent-pigment-shaders.ts`, `latent-pigment-table.ts`,
`latent-pigment-webgl.ts`가 담당한다. 자체 계산으로 표를 생성하며 GLSL 100/WebGL1,
GLSL 300/WebGL2의 3D·2D atlas 및 WGSL을 구분한다. WebGL1에서 float 확장이 없거나
자동 선택한 float atlas의 폭이 장치 한도를 넘으면 같은 Float32 값의 비트를 RGBA8 atlas로
저장하고 셰이더에서 복호화한다. 농도를 8비트 값으로 양자화하거나 격자 크기를 낮추지 않는다.
기본 33³ 표의 byte atlas는 380×379이며, 지원 장치의 direct resource는 기존 float 경로를 쓴다.
공개 `glsl()`·`lutTexture()`의 기본값은 모두 `packed-float32`로 맞추고, 명시적 3D는 기존
`float32` 계약을 유지한다. 반환 resource는 실제 인코딩·배치·크기에 맞는 shader를 함께 제공한다.
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
기존 writer가 저장하던 `sketch`가 API 입장 허용 목록과 공유 역투영에서 빠진 경계도 고쳤다.
이 필드에는 기존 JSON 크기·깊이 검사를 그대로 적용하며, 보관본·활성 사본의 실제 Y 재접속과
웹·서버 투영에서 스타일이 유지되는지 확인한다.
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
| Float32 byte atlas·WebGL 보완 | codec·shader·table·WebGL 4파일 47개 통과. 바이트 왕복, 확장 부재·폭 초과 자동 전환, 명시 float·3D 계약을 확인. 보완 후 브라우저 7경로도 아래와 같이 통과 |
| 문서 하네스 구조 검사 | `pnpm harness:check` 통과 |
| 변경 문서·CPU 파일 Secretlint | 통과. 최종 보고서 포함 재검사 결과는 보충 |
| 공백·충돌 표시 검사 | `git diff --check` 통과 |
| 관련 브러시·UI·이주·권리 통합 테스트 | 로컬 중간 전체 56파일 1,355개 통과. 이후 raw 설정·초안·wrapper 4파일 96개, 저장 획·화면·출력 6파일 46개 후속 회귀 통과. 중복을 합산하지 않으며 최종 전체는 CI 대기 |
| 보관 출처·파일·협업·출력 후속 검증 | 보관본·활성 사본·센서 생략·PSD·채색 마스크·3D 연결, 실제 Y 재접속, JSON/envelope/ZIP·자동복구, 구버전 REST·서버 revision·undo 경계 회귀를 추가. 최종 합본의 CI 기록은 별도 보충 |
| GLSL/WGSL·브라우저 셰이더 픽셀 | 보완 후 Chromium 156 / SwiftShader 소프트웨어 장치, 표 33. float 3경로·확장 비활성 WebGL1·명시 packed WebGL2·공개 기본 함수 쌍 WebGL1/2의 7경로 통과. 혼색 224픽셀 오차 최대 1/255, 독립 알파 14픽셀 오차 0, 행 경계·마지막 값의 원시 texel 25개 오차 0. WGSL compute 32표본 오차 최대 2.2510080166515678e-7. dirty unpack/PBO 복원, CPU 색 이름·객체, 23종 Canvas와 합성 pen 입력 통과. 실행 중 소스·검증기 해시 변화 없음. 실물 GPU·전체 앱·운영 스모크와 구분 |
| `pnpm harness:verify`, 영역 검증 | **최종 통합 결과 보충 대기** |
| 의존성 보안·라이선스 감사 | `pnpm audit:security` 알려진 취약점 없음, `pnpm audit:licenses` 통과(597 pnpm 항목), lockfile 20 importer 무결성 통과 |
| 변경안 프로덕션 빌드와 app·Worker 감사 JSON | 후속 저장 획 보호 전의 중간 로컬 빌드·postbuild·정적 bundle 검사 통과. app 2,659청크/12,861모듈, Worker 보고서 65개/121청크/1,847모듈에서 외부 Mixbox 모듈 0. 이 수치는 최종 코드의 빌드 증거를 대신하지 않으며 최종 CI 결과 대기 |
| 기준 `main` 프로덕션 빌드 | 미확인. 별도 pristine 8d315c85 체크아웃·frozen/offline 설치·prebuild까지만 성공했고, 디스크 조율 및 사용자 클라우드 CI 선택에 따라 전체 빌드는 시작하지 않음 |
| 현재 운영 배포 산출물 | 원본 데이터·GLSL 포함 확인(2.1절). 운영 혼색 실행·배포 SHA·수정안 반영은 미확인. 이 작업에서 운영 배포하지 않음 |
| 클라우드 최초 실행 | [run 42015816613](https://github.com/blue45f/toonstudio/actions/runs/42015816613), 후보 `7d1ef53c01d2eb76777b72d14534434ff91491c0`. 2026-11-05 20:58 KST 최종 failure. API·웹 빌드와 66개 감사 원장은 성공(app 2,660청크/12,851모듈·Worker 보고서 65개, 외부 Mixbox 0). 브라우저·DB·3D·제품·캐릭터도 성공했으나 타입·편집·기초 기능·직렬 성능·import 검사 실패로 core/verify가 차단됨. GPU 확장 부재·sketch·통합 보완 전 후보이므로 최종 코드의 CI 결과와 구분 |
| 최초 CI 실패 보완 | 타입 9건의 정확한 parser·키·오류 매핑·제공자 ID를 보완. 이전 V1 fixture와 현재 자체 안료의 어댑터 비교를 분리하고 원본 재생 차단 테스트를 추가(관련 84개 통과). 구 갈필 경로는 main `63dcf937` 통합 후 같은 성능 기준으로 통과. 문서 16개만 CI에 복원하고 reader 광고 기대를 동기화. 버전 계약은 타입으로 공유 키를 확인하며 런타임 import를 제거. 브라우저 전용 모듈 URL을 명시 인자로 전달해 `quality:imports` 통과. 검사·성능 기준·원본 보호를 완화하지 않음 |
| 최종 변경 커밋 SHA·PR·병합 | **보충 대기** |

### 7.1 두 번째 클라우드 후보와 main 통합 상태

2026-11-05 21:48 KST 기준 [run 42023747993](https://github.com/blue45f/toonstudio/actions/runs/42023747993)은
`a7d87b1c2954fb87460612c4446fe9047cbb3cca`를 검사했다. 최신 main 전체의 검증으로 확대하지 않는다.

- 빌드, 편집·제품·3D·캐릭터 회귀, 직렬 성능, DB, lint, 접근성·브라우저 개별 작업은 성공했다.
  타입 작업은 컴파일러 실행 전 문서 입력 개수 계약에서 실패했고, 기초 기능 작업은 배경 PNG가
  sparse checkout에서 빠져 16,429개 중 1개 실패했다. 따라서 전체 CI 성공으로 보고하지 않는다.
- 빌드 산출물의 `commit.txt`와 후보 SHA, GitHub artifact ZIP SHA-256을 대조했다.
  app 2,664청크/12,857모듈 및 Worker 보고서 65개를 합친 감사 원장 66개에서 금지 모듈은 0개다.
  자체 안료 청크 2개는 앱 첫 진입의 정적 58청크에 없고 Studio adapter 경로에 있다.
- 브라우저 산출물의 검사기·1차 소스 56개 해시, 실행 중 변경 없음, 산출물 무결성을 확인했다.
  GL 7경로, WGSL 32표본, 23종 Canvas 브러시, 합성 pen 입력을 통과했다.
  이 56개 소스와 검사기는 아래 main 통합 후보와도 바이트가 같다. 소스 부분의 증거를 연결할 수
  있으나 다른 파일까지 같은 CI를 통과한 것으로 해석하지 않는다. 실제 GPU는 미검증이다.
- 기본 내재화는 [PR #2722](https://github.com/blue45f/toonstudio/pull/2722)로 main
  `5165e4faf796cebe255460ab38d1c13fde8972c4`에 병합됐다. 병합 시 대기·취소된 검사가 있어
  병합을 전체 CI 성공이나 배포 증거로 쓰지 않는다.
- 후속 소스는 이 main을 보존한 로컬 `4bf8327cbfae0192073f5f786af81b6955ad6a31`이며,
  원격 후보 `430b47a776ea0ee0c88d6efa19d4a070dc1a9ea4`와 트리
  `3eac4091a2534e45e194eb308526733c1fba46a1`이 같다. 이 후보의 전체 클라우드 검증은 대기다.
  main 통합 후 브러시 2파일 84개, 필수 Node 계약 158개, 아키텍처 검증은 로컬에서 통과했다.
  Chemy V1 관련 18파일의 Git blob도 main과 동일하며 렌더러·설정·opacity 경로를 바꾸지 않았다.

위 두 실패 중 정확한 문서 16개의 입력 계약은 후속 후보에서 고쳤다. 배경 이미지 14개의 입력
복원과 다른 공통 CI 보완은 별도 담당 작업과 중복하지 않는다. 새 대형 로컬 빌드·전체 타입
검사는 시작하지 않으며, 공통 변경 통합 후 고정 SHA의 최종 클라우드 결과를 보충해야 한다.

### 7.2 추가 확인된 구 reader 호환성 공백 — 21:48 후보의 상태

상태는 **migration / 보완 필요**다. archive 출처가 없어도 기존 PSD·채색 마스크·3D 보정
7필드 중 하나가 있는 활성 획은 v7을 사용한다. 현재 서버 join·sync, 요구 capability 산출과
broadcast, 웹 local peer·P2P의 기존 fence는 BG3D만 보고, REST gate는 보관 출처만 확인한다.
새 capability를 광고하는 것만으로 이 활성 v7의 요구가 강제되지는 않는다.

`63dcf937`의 reader는 미지원 v7 payload를 `null`로 읽고 획 목록에서 제외한다. baseline에
없는 새 ID는 미표시되고 같은 ID의 옛 baseline 객체는 이전 모습으로 남을 수 있다.
이 소스 분석은 raw Y 바이트나 서버 영속 데이터의 실제 삭제를 입증한 것은 아니다.
프로젝트 파일 버전 fence도 REST snapshot 저장 경로의 대체 보호가 아니다.

이 공백은 기존 reader fence 안에서 보완해야 한다. archive뿐 아니라 활성 v7·보존 이력과
7필드가 있는 권위 문서를 감지하고, 기존 transaction의 최신 before/probe 및 첫 v7 도입 후
문서에서 요구를 산출해야 한다. 전송은 요구 capability 전체를 만족하는 peer에 한정해야 하므로
BG3D 전용 방에 새 capability 이름만 추가하는 것으로는 충분하지 않다. 기존 ACL·CAS,
지원 reader의 명시 삭제·revision 복원과 일반 v6 동작은 유지한다.

이 보완과 구 peer의 join·sync·이미 연결된 수신·로컬·P2P·동시 REST 저장 회귀가 확인되기
전에는 협업 보존 경계의 검증이 끝났다고 보고하지 않는다. 구현은 공통 CI 담당 작업과 중복하지
않고 후속 통합 결과를 확인한다.

### 7.3 공통 호환성 보완의 후속 통합 — 검증 중

공통 담당자의 `e103af54e`와 `e5a531e5a99c7846f8a522a7597cafe18de5666d`까지를
자체 안료 후보에 통합했다. archive 없는 활성 7필드와 삭제 기록 감지, 같은 transaction의
baseline·candidate·최신 Y 문서 검사, 첫 v7 도입 후 요구 산출, 모든 요구 capability의 교집합
방과 REST·웹 local fence를 기존 보호 안에서 연결한 변경이다. 7.2절의 초기 서버·REST 공백과
아래 남은 전송 조건을 구분하며, 전체 완료로 판정하지 않는다.

합본의 필수 Node 계약 159개, 안료·capability·추가 보관 왕복·프로젝트 버전 4파일 55개,
API reader·전송·보관 입장 검사 3파일 53개, 아키텍처 검사, 순수 프로젝트 버전 isolated
TypeScript가 통과했다. CI 입력은 기존 111개에
정확한 문서 16개와 배경 PNG 14개를 더한 141개 선언을 보존하며, 각 shard의 실제 sparse
복원도 검증한다. 전체 타입 검사와 프로덕션 빌드는 이 합본에서 아직 실행하지 않았다.

별도 작은 재현에서는 WIP fence가 부모보다 먼저 온 v7 delta를 pending 상태로 수용하고
요구 메타 없이 peer full sync로 반환하는 경계를 확인했다. 실제 Yjs·writer·fence·shared
detector·sync 함수를 사용했고, 관련 소스 4개 해시가 실행 중 같았다. 결함 재현 단언 2개 성공은
수정 완료가 아니며, 구 UI·운영 DB 손실 검사는 아니다. 후속 parent를 fence 밖에서 직접 적용하면
v7과 `colorizeMaskEnabled:false`가 복원된다. 일반 좌표 7의 완전한 v6 대조도 정상 적용된다.

공통 담당자가 pending 원문의 보존·재전송을 추가 보완 중이다. 역순으로 온 정상 v1~v6와
좌표 7의 대조도 필요하며, 무차별 pending 거절이나 숫자 7 탐지로 대신하지 않는다. P2P 송신의
실제 요구 전체 검사와 미전달 ACK 처리도 동결 시점에 확인해야 한다. 해당 생산 소스와 최종
PR·push는 단일 담당자가 유지하고, 이 작업은 자체 보완과 재현 근거를 로컬 커밋·patch로 보존한다.

### 7.4 공개 기능 완료 감사와 색상·성능 관찰 — 2026-11-06

자체 후보 `d8099f00740364539982bb6831a83ae3e3c53795`에서 공개 역할 12개는 실제 계산으로
구현되어 있고 누락 API는 발견하지 못했다. CPU 9개는 자체 다항식·역해법·잔차를 사용하고,
GLSL/LUT는 실제 shader 생성·texture 업로드·인코딩 정합을 제공한다. 제품의 23개 브러시는
동일 설정과 CPU 제공자에 연결된다. 공개 GPU 함수의 standalone 실행과 제품 GPU 연결은
별개이며, 현재 제품 GPU 렌더러의 소비는 확인되지 않았다.

원본 npm 2.0.0은 보존된 패키지의 공개 CPU 함수만 호출해 비교했다. 8개 색쌍과 5개 비율의
40표본에서 평균 최대 채널 차이는 12.075/255, 전체 최대는 55/255였다. 청색/황색 절반 혼합은
원본 `#4ba949`, 자체 `#277258`이었다. 양쪽 모두 해당 표본의 끝점·순서 대칭·byte/float
반올림·독립 alpha 대조를 통과했으나, 이것이 원본과 같은 색·기존 브러시 외형의 증거는 아니다.
이 관찰값을 계수 학습·제품 golden·자동 보정에 사용하지 않았다.

같은 Node v24.22.1/V8 13.6, Apple M2 Max arm64 프로세스에서 제한된 공개 CPU 성능도
관찰했다. warm 256표본·5 batch의 중앙값은 고정 색쌍 lerpFloat가 원본 0.685µs/자체 3.127µs,
고정 시드 색쌍이 0.449µs/3.344µs, 사전 계산 latent의 보간·복원이 0.381µs/1.487µs였다.
엔진별 최초 lerpFloat 1회는 0.245ms/2.430ms이며 모듈 import·disk cold는 포함하지 않는다.
캐시·JIT·다른 프로세스 부하가 있는 단일 장치 관측으로, uncached 전체 색역 처리량이나 제품
브러시 렌더 속도·메모리·원본 대비 성능 동등성으로 일반화하지 않는다. 원본 latent는 불투명
중간 변수로만 소비했고 값·배열은 수집하지 않았다.

현재 증거로 완료를 주장할 수 있는 범위는 독립 기능 구현·설정 보존·명시 전환 연결이다.
원본 혼색 결과와의 차이는 사용자에게 색상 비교표로 제시하고 완료 기준을 확인 중이다.
제품 전체의 선택→그리기→저장→재열기→내보내기와 legacy 명시 전환, 최종 SHA의 전체
클라우드 검증은 남아 있다. 물리 GPU·실제 펜·원본과 같은 품질·성능까지 완료됐다고 보고하지 않는다.

### 7.5 P2P 송신의 원본 보존 요구 누락 보완 — 2026-11-06

자체 작업 브랜치의 P2P 송신 경계는 기존 `supportsStudioCrdtReaders`에 메시지의 요구 목록
전체를 넘기도록 보완했다. 새 권한 검사나 별도 capability 체계를 만들지 않았다. 기존 target
선택·origin 차단·전송 완료·ACK 처리는 유지한다. 공통 PR의 소스·push를 대신 변경하지 않았다.

실제 v6/v7 writer와 memory RTC의 공개 publish·수신·ACK로 새 회귀 6개를 검사했다. 수정 전에는
원본 보존 요구를 no-cap 상대에게, 결합 요구를 3D-only 상대에게 보내는 2개 대조가 실패했고
나머지 정상 전송 4개는 통과했다. 수정 뒤에는 6개 모두 통과했으며, 미지원 상대의 전송·수신은
0건이고 기존 v6·요구를 전부 지원하는 v7은 각각 1건과 성공 ACK였다. 기존 overlay 32개도
함께 통과했다. 이 결과는 P2P 송신의 해당 요구 검사에 한정하며 전체 제품 UI·실제 네트워크·
운영 DB 보존·최종 클라우드 CI 완료의 증거로 확대하지 않는다.

변경 파일 lint·Secretlint, 하네스 구조·자체 시험·lockfile 무결성과 아키텍처 검사는 통과했다.
`pnpm harness:verify --staged`가 다음 전체 로컬 typecheck를 자동 시작해 해당 프로세스만
중단했다. 전체 검증을 클라우드에서 수행하기로 한 사용자 선택을 따르며, 이 실행을
`harness:verify` 완료로 기록하지 않는다.

### 7.6 실제 제품 UI의 클라우드 검증 연결 — 첫 실행 실패

`e2e/studio-pigment-product-workflow.spec.ts`와 전용 Playwright 설정을 기존 CI 접근성 lane에
연결했다. 기존 게스트·오프라인 fixture, 실제 Vite 앱, 기존 SQLite/OPFS reader·writer,
기존 메뉴·파일 다운로드를 재사용한다. 새 권한·저장소·렌더러 구현은 추가하지 않았다.

대상은 자체 브러시의 기본 프로필 선택→실제 브러시 저장→다시 열기→제품 pointer 입력→
내구 저장→재진입→JSON/PNG/SVG 출력과, V1/V2 합성 원고의 원본 다운로드→내보내기 차단→
명시 전환→원본·순서·설정 보존→undo/redo→재진입→파일 출력 3개다. 원본 Mixbox 색상이나
실물 펜·GPU, 서버 저장·계정 ACL·협업 전체를 이 시험의 합격 기준으로 주장하지 않는다.

로컬에서는 Vite·브라우저를 시작하지 않고 3개 시험 수집만 확인했다. 실제 UI selector,
콜드 Vite, SQLite/OPFS 초기화와 파일 출력의 첫 클라우드 결과는 7.7·7.9절에 기록한다. 표준 Ubuntu
runner와 기존 20분 job 제한을 유지하며 시험 전체는 9분, 개별 case는 3분, CI step은 10분,
재시도는 0회다. 실패 trace·스크린샷·다운로드·JSON 결과는 별도 artifact로 보존한다.
CI 실행이나 3개 수집 성공을 제품 E2E 통과로 기록하지 않는다.

### 7.7 후속 클라우드 후보의 실제 결과 — 2026-11-06

CI [42059558146](https://github.com/blue45f/toonstudio/actions/runs/42059558146)의 후보는
`957a7d11c1d291580458e82c9fd28699b71b1d28`이며 로컬 `1b8f0b6d0`과 tree
`934d4cbc8db4f76388ab06ed9fdf6b5ac6f0d959`가 같다. 전체 application·API·realtime
worker 컴파일과 typecheck lane, 직렬·product 회귀, 독립 안료·브러시·GPU 검증,
프로덕션 빌드가 실제로 성공했다. 최종 작업 13개 중 실질 검사 10개가 성공했고 제품 UI를
포함한 접근성 작업과 필수 집계 `core`·`verify`는 실패했다. 이후 소스의 통과를 뜻하지 않는다.

빌드 artifact `13435017069`를 내려받아 GitHub digest와 ZIP SHA-256
`284a177e2bda53bbb03760325a176bb91784b4d2dbd44c77a690e2248c107c9a`를 대조했다.
`commit.txt`의 후보도 일치하며 app 원장은 2,664개 청크·12,857개 모듈에서 금지 Mixbox
모듈 0개를 기록한다. worker 원장 65개도 모두 금지 모듈 0개이며, app 포함 66개를 대조했다.
manifest의 실제 경로는 `index.html`의 `dynamicImports`→`StudioBrushLabPage`의
`imports`→재료 엔진 청크로 이어진다.
이 artifact의 내용은 manifest·원장·
빌드 로그이며, 실제 JS 청크 전체를 담은 archive는 아니다. 후속 보존 범위를 구분한다.

실제 제품 UI step 15는 **실패**했다. 실패 trace·화면·다운로드가 있는 artifact
`13433718909`의 보존은 성공했으며 분석 결과는 7.9절과 같다. 따라서 제품의 선택→저장→입력→
재열기→전환→내보내기까지 통과했다고 보고하지 않는다. 독립 실행 성공이나 번들 원장의
Mixbox 0개로 이 실패를 대신하지 않는다.

### 7.8 낮은 정밀도 가정에서의 GPU 표 주소 보완 — 검증 중

기존 packed GLSL은 큰 scalar 주소에 component를 더한다. fraction16·significand17의
RN ties-to-even 가정에서는 131072+1이 구분되지 않는 반례가 나왔다. 공식 ESSL은 최소
상대 정밀도를 정의하며 특정 RN 형식을 강제하지 않는다. 아래 결과는 실물 GPU 실패나
모든 conforming 구현의 판정이 아닌, 명시한 주소 산술 모형의 근거다.
[ESSL 1.00](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf),
[GLES 2.0.25](https://registry.khronos.org/OpenGL/specs/es/2.0/es_full_spec_2.0.pdf#page=142).

atlas·Float32 저장 바이트·격자 크기·공개 API를 유지하고 quotient/remainder carry를
전달하도록 자체 후보를 보완했다. 실제 생성 함수의 AST를 texture load 직전까지 실행한
회귀에서 기본 N33의 143,748개 전체 주소와 N2…65 결정적 표본을 정수 oracle과 대조한다.
수정 전 N33은 6,338개, 전체 241,364개 표본은 30,651개 주소가 달랐고 보완안은 0개였다.
raw·반올림 중간값은 모두 2**17 미만이며 fraction23의 주소 digest도 일치한다.

새 회귀는 수정 전 예상 실패 3개·통과 1개였고 수정 후 4개가 통과했다. 기존 shader·WebGL·
Float32 atlas의 3파일 30개도 통과했다. 이 근거는 주소 subset과 RN 모형에 한정하며
texture sampling·decode 이후 산술·색·실물 GPU·최종 새 shader의 클라우드 실행을 대신하지
않는다. 7.7절 CI957의 GPU 성공은 이 후속 주소 변경 전 소스의 결과다. CPU 혼색 모델과
안료 계수는 바꾸지 않았다.

수동 클라우드 검증의 studio-editing lane에는 실제 `pnpm harness:verify`도 연결했다.
변경 비교에 필요한 Git 이력과 문서 입력을 복원하고 main 포함 여부를 확인하며, 기존 PR·
main 검사와 job 제한은 유지한다. 해당 CI 설정 한 파일의 로컬 하네스 검사는 통과했지만
JS/TS 후속 변경의 전체 하네스 완료는 다음 클라우드 실행 결과로 확인한다.

### 7.9 실제 제품 실패 구분과 후속 진단 — 2026-11-06

상태는 `migration`이며 PNG 실패는 아직 해결되지 않았다. 제품 실패 artifact ZIP의
SHA-256 `8145d7cdb6a48a04c3cc8fa02aa3e3a2838e4659f4eb044b349f642893f2e9be`를
GitHub digest와 대조하고 trace·화면·다운로드를 분석했다.

- 첫 브러시 case는 `permissive-only`에서 허용되지 않는 knife 레시피를 성공 대상으로
  선택했다. 현재 보호 조건이 올바르게 저장을 막은 결과다. 해당 차단과 정확한 진단 문구는
  부정 사례로 유지하고, 허용되는 자체 안료 스프레이로 저장·실행 경로를 검사하도록 고쳤다.
  실제 레시피 계획 결과는 permissive 5개, source-available 16개, full 23개이며 이를 늘리지 않았다.
- V1·V2 전환 case는 원본과 JSON 다운로드까지 진행했지만 PNG·SVG 완료 증거는 없다.
  V1은 PNG 선택 약 11.5초 뒤 Skia export 모듈 HTTP 200을 받았다. 기존 호출 순서상
  readiness를 통과했으나 import 평가·캡처·호환 캡처·인코딩 중 정지 위치는 미확인이다.
  V2는 렌더 준비 timeout 문구를 표시했고 해당 모듈 요청이 없다. stage·문서 commit·
  fonts·assets·raster 중 어느 준비 조건에서 멈췄는지는 기존 trace만으로 판정할 수 없다.
  `setIsExporting(true)` 누락이나 네트워크 실패를 원인으로 단정하지 않는다.

후속 후보에는 DEV 전용 UserTiming 관측을 추가했다. 준비·캡처·인코딩·다운로드 호출 단계와
기존 평가에서 얻은 숫자·불리언만 최대 64개 기록한다. 원고 식별자·내용·URL·오류 원문을
수집하지 않으며 관측 실패는 캡처 결과에 영향을 주지 않는다. 기존 getter 평가 순서·단락
조건·8초 제한·렌더러 선택·권한과 레거시 guard는 유지한다. PNG 검사도 실제 다운로드나
기존 timeout 안내를 기다리며 실패를 통과로 바꾸지 않는다.

사용자의 클라우드 검증 선택에 따라 수동 non-main 실행에만 `pigment_diagnostics=true`
옵션을 추가했다. 이 모드는 독립 GPU·브러시와 실제 제품 UI 작업만 실행한다. 기본값 false,
PR·push·merge group·main의 전체 검사, 필수 집계는 유지한다. 부분 진단은 생략된 작업 때문에
`core`·`verify`가 실패하도록 검사하며, 전체 하네스·빌드·필수 CI의 성공을 대신하지 않는다.

별도로 기존 빌드 원장과 manifest를 읽어 자체 혼색 JS와 재료 엔진의 정적 import closure를
보존하는 스크립트를 연결했다. app·보고된 worker 안료 청크만 대상으로 최대 20MiB·512파일,
해시·경로·symlink·기존 목적지 검사를 적용하며 라이선스 판정을 중복하지 않는다.
기존 7.7절 메타데이터에서 23개 경로를 선정했으나 실제 JS는 이전 artifact에 없어 복사·
바이트 지문 검증은 다음 전체 빌드에서 확인해야 한다. 동적 import 전체나 worker의 전체
의존성 보존을 주장하지 않는다.

후속 로컬 소규모 검증은 준비·캡처·관측 3파일 34개, CI·원장 보존 등을 포함한 Node
174개, 변경 파일 ESLint가 통과했다. 원장 보존 12개·부분 진단 정책 3개는 174개에 포함된다.
전체 로컬 빌드·typecheck·브라우저는 실행하지 않았다. 이 단위 검사와 관측 추가는 실제
제품 PNG의 성공 증거가 아니다.

후속 후보는 main `d23160182887b66baa3540f5c47430cc287fdcc4`를 통합한다. main의 원본
보존·pending reader 구분·의존성 및 냉간 제작 보완과 이 후보의 P2P 요구 검사·GPU 보완을
함께 유지했다. 충돌 해결 후 reader·파일 보존 5파일 86개, 브러시 1파일 26개,
CI 계약 4파일 41개가 통과했다. 기존 회귀와 범위가 겹치므로 앞선 수치에 합산하지 않는다.
소규모 Vitest 실행 전 pnpm이 캐시 패키지 5개 추가·1개 제거를 자동 동기화했으며
package·lockfile에 추가 변경은 없었다. 이후에는 기존 실행 파일을 직접 호출한다.

### 7.10 공개 배포물 재확인과 현재 후보의 구분 — 2026-11-06

2026-11-06 03:41:53 KST(`2026-11-05T18:41:53.827Z`)에 공개 HTML·manifest·재료 엔진·
service worker를 다시 읽었다. 로그인·코드 실행·배포는 하지 않았다. HTML의 실제 entry와
[공개 manifest](https://www.toonstudio.cloud/.vite/manifest.json)의 `index.html` entry가
일치한다. `index-DaQT4Bg2.js`의 `dynamicImports` → `StudioBrushLabPage-B_apIRfj.js`의
`imports` → `brush-studio-v6-material-engine-JSWVCaJi.js` 경로를 재확인했다.
초기 정적 import만으로 닿는 경로는 없고 지연 로딩 경로에는 포함된다.

[현재 재료 엔진 청크](https://www.toonstudio.cloud/assets/brush-studio-v6-material-engine-JSWVCaJi.js)의
SHA-256은 2.1절의 `1a96de5f…c920eb3`과 같았다. JavaScript 구문 진단 0개를 확인하고
문자열 값을 메모리에서 해시로만 대조했으며, 141,700자 원본 LUT와 3,774자 원본 GLSL이
각각 2.1절의 원본 지문과 일치했다. 현재 service worker도 같은 청크를 참조한다.
따라서 이 시각에 반환된 공개 배포물에는 여전히 원본 Mixbox가 포함되어 있다. 사용자 계정의
선택·실행 가능 여부, 모든 지역·기존 캐시, 운영 SHA·배포 ID까지 확인한 결과는 아니다.

후속 소스 검증 후보는 `e4e37f26bf18551d54d041f5687761f3ef1c89da`이며 로컬
`2546310a9248044dd4a6551501fcb6f978299c01`과 tree
`427167a6342ae9ea7cd02e321e05e95cc3c5a700`가 같다. [수동 진단 CI
42082399626](https://github.com/blue45f/toonstudio/actions/runs/42082399626)은 표준
`ubuntu-24.04` 작업 `127438582359`의 실행 환경 배정을 기다리고 있었다. 이 부분 진단의
등록·대기를 새 소스의 검증 통과나 운영 반영 완료로 보고하지 않는다. 전체 필수 CI·하네스·
실제 빌드 JS 보존과 제품 PNG 확인은 남아 있고, 이 작업에서 운영 배포는 수행하지 않았다.

### 7.11 새 GPU 경로의 실제 성공과 제품 프레임 대기 실패 — 2026-11-06

7.10절 후보의 브라우저 작업은 실행 환경을 배정받아 수행됐고, 독립 안료·23종 브러시·GPU
step 12는 성공했다. artifact `13444961188` ZIP의 SHA-256
`a6caf9d5fb17f439d7c491df1146ce22f75dba4f4879baf715a8924c51ae188d`를 GitHub digest와
대조했다. 결과의 source는 `e4e37f26…`이며 result·verifier 해시, 실행 중 소스 불변을 확인했다.
WebGL 7경로, WGSL 32표본, 브러시 23종과 합성 pointer 검사는 모두 통과했다. WebGL의
RGBA8 출력 최대 채널 차이는 1이고 조사한 raw texel 표본 차이는 0, WebGPU 최대 오차는
약 `3.31e-7`이었다. Chromium 156·SwiftShader의 독립 fixture 결과이며 실물 GPU·원본
중간색·제품 GPU 렌더러·최종 프로덕션 JS 전체의 검증은 아니다. 새 packed 주소 보완은
이 실행에 포함됐지만 fraction16 모형 자체를 실물 장치에서 실행한 것은 아니다.

실제 제품 UI step 15는 **3개 모두 실패**했다. artifact `13445720411` ZIP의 SHA-256
`06599ae9b410468dc736a04d9c0ba9e89942273e779b2626d19b57601e55bdcc`를 대조하고
JSON attachment와 trace를 분석했다.

- 첫 case는 라이선스 차단을 확인한 뒤 이미 닫힌 레시피 검색을 기다렸다. 제품의 레시피
  선택은 재료 영역으로 이동하므로 실제 `시작 레시피` 탐색 버튼으로 목록을 다시 여는
  동작을 시험에 추가했다. 저장 차단·정확한 진단과 이후 실제 저장·파일·픽셀 단언은 유지한다.
- V1은 약 3,686ms에 Stage와 page/history/page 객체 일치를 확인했고 fonts/assets도
  준비됐지만 `paint-wait`에서 8,000.710ms에 실패했다. 완료한 RAF는 2개였다.
- V2는 8초 동안 RAF를 한 번도 완료하지 못했다. 실패 때 plain ref는 exporting=true,
  masterEditMode=false와 page/history/page 객체 일치를 기록했다. 두 경우 모두 Skia
  import 단계 이전이며, 누락된 모드·폰트·자산이나 Skia import 실패를 원인으로 단정하지 않는다.

근처 screencast의 메타데이터 기준 수신 지연은 V1 최대 약 13.6초, V2 약 45.9초였다.
이는 GPU 명령이나 원인 함수의 직접 측정이 아니다. 관측 비용을 분리하기 위해 pigment 전용
설정에서 trace의 연속 screenshots만 끄고 DOM snapshots·source·실패 screenshot을
유지하는 비교를 준비한다. 실제 PNG 다운로드·픽셀·SVG 검사, 8초 준비 예산, pending ink·
exact commit·stale·raster presentation·최종 RAF fence와 renderer는 그대로다.

이 비교는 제품 런타임·기본 Playwright 설정을 7.10절 후보와 동일하게 고정한다. 새 main
`8498d0bc09f083fcbbfcd759bb153f674f539012`의 다른 변경은 비교에 섞지 않고 최종 전체
검증 전에 통합·재검토한다. 별도 수동 진단 브랜치를 사용하며, 부분 진단의 필수 집계는
계속 실제 전체 success를 요구한다. 앞선 제품 작업은 실패로 종료됐고 집계 대기 때문에
제품 작업을 재시도하지 않는다. 비교의 성공 여부·원인 확정·수정 완료는 아직 주장하지 않는다.

### 7.12 고정 비교 후보와 새 main의 로컬 통합 — 2026-11-06

화면 녹화 비교는 별도 브랜치 `codex/mixbox-capture-trace-diagnostic-20261106`의
`26b79f6f8bc71bd86da5b6aebd3a08030ae68c79`로 게시했다. 직접 parent는 7.10절의
`e4e37f26…`, tree는 `41e7a7c921458cfbb853aaedb2d9ef3105a83ff5`이며 로컬 비교 후보
`9d0e2d6ec18f8c11c2734816ad8c468ca1b38957`와 같다. [비교 CI
42092924846](https://github.com/blue45f/toonstudio/actions/runs/42092924846)을 한 번 등록했고
실제 작업 handle을 확인했다. 아래 7.13절에 종료 결과를 기록한다.

비교 후보는 문서 2개·시험 1개·pigment 설정 1개만 앞선 후보와 다르다. 첫 사례의 정상
레시피 탐색 3줄을 제외하면 제품 시험 전체가 byte 단위로 동일하다. 설치된 Playwright의
기본 trace 옵션도 확인해 DOM snapshots·source 보존이 종전과 같고 screenshots만 달라짐을
확인했다. 엄격한 설정 파일 ESLint·시험 3개 수집은 통과했으며 실제 E2E 통과를 뜻하지 않는다.

그 원격 비교를 고정한 뒤 로컬 후속 작업에서는 main `8498d0bc…`를 통합했다. 큰 scalar
주소를 만들지 않는 packed carry 보완과 추가 회귀, P2P의 전체 reader 요구 검사를 유지했고,
main의 pending 관측자 예외 보호·tracked 문서 입력 helper·절대 fixture URL 및 검증 결과
출력 경로 지원도 보존했다. 자동 병합으로 중복된 reader 두 사례는 동일 원문이 남아 있음을
확인하고 각 한 번씩 유지했다. 원격 비교 브랜치·제품 모델 v1·계수·원본 색 관찰값은 바꾸지 않았다.

충돌 해결 후 GPU 주소·자원·원고 계약 4파일 47개, P2P·reader 2파일 28개, 브라우저 검증기
계약 1파일 3개, CI 계약 5파일 62개가 통과했다. 서로 겹치는 기존 시험이므로 과거 수치에
합산하지 않는다. 소스 크기와 정적 진입 그래프 검사도 통과했다. 이 로컬 통합은 원격 비교의
결과나 새 main의 전체 하네스·필수 CI·프로덕션 빌드 성공 증거가 아니다.

### 7.13 화면 녹화 비교의 실제 결과와 다음 관측 범위 — 2026-11-06

7.12절 비교 CI의 제품 시험은 3개 모두 실패로 종료됐다. artifact `13447960759` ZIP의
SHA-256 `85ab9c31b63c4ca78523222c0cf404d7c77601a14e7b544420c22bea15c937d6`를
GitHub digest와 대조한 뒤 첨부 JSON·trace·실제 다운로드 파일을 조사했다.

첫 사례는 자체 브러시의 실제 저장·설정 변경·재열기·원고 pointer 입력·내구 저장·reload와
JSON 검사를 통과했고, 1440×2160 PNG 두 개를 내려받아 그리기 전후 픽셀 변화도 확인했다.
후속 PNG는 157,243 bytes, SHA-256
`caead0352c732bfe67ca2f804931184bb652a3f58ae63b169b89e439c776b79b`다.
준비 단계는 약 223ms·5 RAF에 완료됐고, 지원하지 않는 Skia 문서 경로에서는 기존 Konva
호환 경로로 이어져 PNG 다운로드가 성공했다. 마지막 실패는 닫힌 교환 형식 `<details>`
안의 SVG 버튼을 시험이 기다린 것이었다. 정상 summary로 메뉴를 열도록 시험을 수정한다.
이 결과는 첫 사례의 PNG 성공이며 3개 제품 시험 전체나 원본 중간색 재현 성공은 아니다.

V1은 첫 RAF가 약 6,315ms에 완료됐으나 8,000.56ms에 `paint-wait`가 실패했고,
V2는 첫 RAF 약 23,577.62ms, 실패 timer 약 23,618.82ms·2 RAF를 기록했다.
page/history/page 객체 일치·Stage·폰트·자산 준비는 확인됐고 두 사례 모두 Skia import
이전이었다. 연속 screenshots를 끈 비교에서도 실패했으므로 화면 녹화만을 원인으로
확정하거나, 설정 변경으로 PNG 문제가 해결됐다고 말하지 않는다. 최종 PNG 클릭 뒤
trace에는 추가 document 요청·navigation·Vite 재연결·context destruction·최적화 의존성
404/504가 없었다. 다른 실행의 Vite reload 문제를 이 실패의 원인으로 가져오지 않는다.

동일 fixture의 순수 CPU 관찰에서는 V1/V2가 각각 1,575개·2,775개 mark를 만들었고,
첫 계획은 약 5.2/5.6ms였다. 실제 Canvas raster 비용은 측정하지 않았으므로 이 값으로
렌더 성능을 보증하지 않는다. 현재 근거로 혼색 수학이나 원본 색을 임의 근사하지 않는다.
중첩 clip/blend cache는 material Shape의 실제 페인트 bounds와 cache 갱신 전파를
추가 확인해야 한다. 순수 Konva bounds 재현은 0×0 또는 원점 주변 hit bounds를 보였지만
실제 브라우저의 cache 상태·최종 픽셀·지연 원인까지 입증한 결과는 아니다.

다음 부분 진단에는 DEV에서만 clip/blend 재캐시의 이유·유한한 rect·isCached·동기 CPU
소요시간을 최대 64개 marks로 수집한다. 기존 node 호출·4개 timer·실패 처리·반환값은
유지한다. 별도 `profile_capture_cpu` 입력은 비 main 수동 `pigment_diagnostics` 실행에서
명시 선택한 경우에만 PNG 구간의 CDP CPU 표본을 첨부한다. 수집 실패·지연은 PNG 작업을
재실행하거나 결과·오류를 가리지 않으며, 외부 URL·query·개인 파일 경로는 제거한다.
CPU profiler 자체의 관측 비용이 있으므로 기본 실행의 속도나 GPU 완료 시간을 뜻하지 않는다.
부분 진단은 계속 전체 필수 job의 실제 success 조건을 만족하지 못한다.

클리핑을 보존하는 V1/V2 fixture는 `clipBelow:true`를 유지한다. 기존 벡터 SVG serializer와
UI는 클리핑 손실을 이유로 저장을 거부하므로, 시험도 실제 경고와 다운로드 거부를 확인한 뒤
사용자가 별도로 선택하는 **외관 보존 SVG**를 검사하도록 고친다. 이 형식은 PNG를 담으며
벡터 편집 가능 형식이 아니다. 같은 배율·배경·보정 조건의 PNG와 내장 이미지의 실제 RGBA
일치를 요구한다. 클리핑이 없는 첫 사례의 편집 가능한 벡터 SVG 검사는 유지한다.
새 SVG 단언과 CPU/cache 관측의 실제 클라우드 결과는 아직 확인하지 않았다.
두 출력이 같은 capture를 쓰므로 서로 일치하더라도 양쪽이 동시에 클리핑을 잃는 회귀를
배제하지는 못한다. clip 영역 안팎의 예상 픽셀 또는 unclipped 대조는 추가 확인 항목이다.

관측 코드는 독립 검토 뒤 늦게 생성되는 CDP 연결의 회수와 Vite `/@fs/` 개인 경로 제거를
보완했다. CPU 관측·cache 관측·기존 이미지 cache 갱신 3파일 58개, CI 부분 진단·CPU 선택
조건 4개가 통과했다. 시험 3개 수집, 변경 ESLint, 하네스 구조·소스 크기·정적 진입 그래프도
통과했다. 대형 로컬 빌드·설치·전체 타입 검사는 실행하지 않았으며 전체 검증은 클라우드에 남아 있다.

### 7.14 실제 제품 첫 사례 통과와 CPU·cache 관측 결과 — 2026-11-06

7.13절 후속은 main `8498d0bc…`를 포함하는 로컬 `1d2ca675f534d92b243e191f3fc5514ba7263f8a`와
같은 tree `10a9f601d6149c201cc642e86c4b856f2d523424`를 원격
`4874d00fbd4e3d5c5d38d9b6f25490c207783519`로 게시했다. [부분 진단 CI
42103887424](https://github.com/blue45f/toonstudio/actions/runs/42103887424)는 표준
`ubuntu-24.04`에서 한 번 실행됐고, 제품 단계에 CPU 수집 입력 `1`이 반영됐음을 확인했다.

**첫 제품 사례는 114,362ms에 통과했다.** 기본 권리 차단, 자체 안료 선택·SQLite 저장·설정
변경·재열기, 실제 pointer 입력·내구 저장·reload·JSON 보존, PNG 다운로드·그리기 전후 픽셀
변화와 벡터 SVG까지 같은 실제 앱 경로에서 확인했다. V1/V2 사례는 각각 76,741ms와
89,772ms에 PNG `render-timeout`으로 실패했다. 외관 보존 SVG 단계에는 도달하지 않았다.
이 부분 진단의 `core/verify`도 실패했으며 전체 검증 성공이나 운영 반영은 아니다.

제품 artifact `13452650237` ZIP은 12,542,128 bytes, SHA-256
`be934d239ebc245fd6c29d6f063daaa805c5e7b1f128b5dfe0afa865b6fe42c2`다. GitHub digest와
대조했고 report·첨부 원문과 해당 source의 관측 코드 bytes도 확인했다. CPU profile 네 개는
모두 수집에 성공했고 sample/timeDeltas·노드 참조·가중 합 무결성 문제가 없었다.

- V1의 관측창 12,792.748ms 중 idle 표본 가중 시간은 9,291.213ms(72.63%), V2의
  22,511.145ms 중 18,370.696ms(81.61%)였다. 첫 `(program)` sample의 큰 interval과
  관측 시작 비용을 앱 함수 CPU 시간으로 귀속하지 않는다. idle만으로 GPU·Worker·compositor·
  OS 대기 중 하나를 원인으로 확정할 수도 없다.
- 실제 material renderer inclusive 표본은 V1 약 14.674ms, V2 약 19.138ms였다. 자체
  latent inverse 함수의 표본이 없다는 사실을 비용 0이나 전체 성능 보증으로 해석하지 않는다.
- 각 legacy 사례의 cache는 24 marks·12 interval 전부 `rect:0×0`, `isCached:false`,
  `failed:false`였다. 동기 구간 합은 V1 1.145ms, V2 1.330ms이며 최장 0.185/0.285ms였다.
  PNG 전과 실패 후 snapshot이 같아 해당 관측 중 새 recache는 없었다. 반복 대형 cache
  rebuild 가설은 지지되지 않으며, 뒤의 layer draw/GPU 시간은 이 수치에 포함하지 않는다.
- V1은 첫 RAF 약 6,353.72ms 뒤 page·history·폰트·자산 준비를 확인했으나 8,000.60ms에
  1 RAF로 실패했다. V2는 8,000.58ms 동안 RAF가 없었고 plain commit ref만 일치했다.
  두 사례 모두 Skia import·PNG 인코딩 이전이다.

독립 브라우저 artifact `13452151277`의 ZIP SHA-256은
`4c8073a283cd5e941460c573988aa1cb581b84ad206bba291cf6db228a41c756`이며 result·verifier·
manifest와 source bytes를 대조했다. repository 모듈 56개는 source `4874d00…`, 의존성
131개는 현재 로컬 설치 bytes와 각각 일치했다. WebGL 7경로·WGSL 32표본·23종 브러시·합성
pointer가 통과했고 금지 모듈·drift·console error는 0이었다. SwiftShader 소프트웨어 결과이며
실물 GPU·제품 Canvas2D 합성 지연·원본 중간색 동등성의 증거는 아니다.

현재 확인된 별도 품질 경계는 실제 material Shape의 zero bounds다. 클리핑 의미 검증과
화면 프레임 지연의 원인 판정은 분리한다. 이 관측만으로 bounds·timer·색 모델·8초 fence를
바꾸지 않았으며, 실제 원인을 확인하기 위한 다음 진단을 준비한다.

### 7.15 V2 PNG 한 번의 브라우저 프레임 진단 준비 — 2026-11-06

상태는 **준비 / 실제 수집 미확인**이다. 7.14절 CPU 표본은 주 스레드 함수 귀속 시간이며
GPU·compositor의 진행이나 page performance marks와 같은 clock의 연결을 직접 보여 주지
않는다. 다음에는 V2의 기존 `v2-converted.png` 요청 한 번만 browser CDP native trace로
감싼다. `devtools.timeline`, `blink.user_timing`, `cc`, `viz`의 기존 이벤트와 capture marks로
rAF 요청·실행과 BeginFrame·Draw 진행을 같은 trace clock에서 조사한다.

`trace_capture_frames`는 기본 false이며 비 main 수동 부분 진단에서 명시 선택했을 때만
제품 시험에 반영한다. CPU 관측·실제 PNG 작업 본문·기본 Playwright 설정·renderer·모델·
준비 예산·기존 cache timer는 유지한다. screenshot·강제 BeginFrame·추가 rAF를 요청하지
않는다. standalone GPU verifier와 필수 `core/verify` 조건도 바꾸지 않는다.

trace는 응답·정리 시간과 16MiB·이벤트 수에 상한을 두고, URL·개인 경로·임의 문자열을
버린 시간·수치·프레임 관계와 허용 timing detail만 첨부한다. 표준 Chrome process/thread
이름도 고정 허용 목록만 남긴다. 관측 실패는 원래 PNG의 단일 실행·성공·오류를 보존한다.
시간 제한 뒤 trace 시작·종료가 확정되지 않거나 late stream 정리를 보장할 수 없는 경우는
`incomplete/cleanupIncomplete` 이력으로 남긴다. 수집 성공이나 원인 규명을 미리 주장하지 않는다.

독립 검토에서 발견한 flow ID 형식을 `0x`와 16자리 hex(uint64)로 보완하고 관계 보존 회귀를
추가했다. 새 helper 단위 시험 21개, CI 계약 5파일 55개, 제품 시험 3개 수집, 변경 lint·
Secretlint·하네스 구조·소스 크기·diff 검사가 통과했다. 실제 Chromium trace·viewer import·
전체 하네스·프로덕션 빌드 검증은 아직 수행되지 않았다.

### 7.16 같은 소스의 전체 CI와 실제 프로덕션 JS 확인 — 2026-11-06

로컬 `e14286d2f3c57b0be2cdb8dba5fa6a47a39e566c`의 tree
`9936963ecdc048edbad11c16d617c51c3f25b2b3`를 진단 후보 `56c247c3ed39b17aa7234982687520d830950036`와
전체 후보 `9ed0c55934f6ebe277c29209077b39f6d5f8c109`에 각각 보존했다. [전체 CI
42110218442](https://github.com/blue45f/toonstudio/actions/runs/42110218442)는 세 진단 입력을
모두 false로 한 단일 실행이다. 프로덕션 build 작업 `127535495606`은 성공했다.

실제 build artifact `13454916477` ZIP 1,193,328 bytes의 SHA-256
`935e16b263553c6f5e60789fcf1c65392b72f36d1c0ca1a87125ff31f192bdd6`를 GitHub digest와
대조했다. 추출 파일 92개의 bytes·SHA, source tree, 보존 도구와 plugin의 source blob도
확인했다. 이전의 모듈 원장만 있던 결과와 달리 이번에는 선택한 실제 JS bytes가 있다.

| 실제 검사 범위 | 결과 |
| --- | --- |
| Vite app 원장 | 2,664 chunks·12,860 modules, 외부 Mixbox 보고 0 |
| app·Worker 원장 | 65개(app 1·Worker 64), 전부 외부 Mixbox 보고 0 |
| 보존된 실제 JS | 23개·2,996,896 bytes, 선정 계약·파일 SHA·app 정적 closure 일치 |
| JS 구문 검사 | 23개 모두 진단 0 |
| 원본 exact literal 지문 | 141,700자 LUT·3,774자 GLSL 각각 일치 0 |

원장 수가 과거 66개에서 65개로 줄어든 이유는 main에 포함된 `7c5ed4db…`의 wasm-vips
대체 변경이다. 과거 vips worker 원장 하나만 제외됐고 현재 manifest와 build log도 일치했다.
기대 수치 66의 첫 실패를 보존하고 이 근거를 확인한 뒤 실제 65개로 대조했다.

이는 **제공된 전체 모듈 원장의 보고와 보존한 JS의 지문 검사**다. 원장 파일명은 Worker
entry를 뜻하지 않으며 Worker 유래 shared chunk의 전체 전이 코드까지 보존하지 않았다.
범위 밖 참조 47회(고유 edge 32·대상 30)와 계산식 dynamic import 1개를 따로 기록했다.
전체 dist·모든 dynamic chunk·모든 Worker JS를 스캔했거나 변형된 원본까지 검출한 결과는
아니다. 원본 중간색·성능·방법의 권리·운영 배포에 대한 판정도 대신하지 않는다.

같은 전체 후보에서 기본 관측 입력 0인 제품 시험은 첫 native 사례가 PNG·벡터 SVG까지
통과했고 V1/V2는 다시 PNG 준비 제한시간으로 실패했다. 일반 접근성 16개와 제작 흐름 15개는
통과했다. 아래의 CI 구조·인증 범위 실패도 있어 전체 CI 성공으로 보고하지 않는다.

### 7.17 V2의 같은 clock 프레임 관측 — 2026-11-06

[프레임 진단 CI 42109849864](https://github.com/blue45f/toonstudio/actions/runs/42109849864)의
source는 `56c247c3…`다. 제품 artifact `13454456430` ZIP 13,306,674 bytes의 SHA-256
`f834e47f9238cfddae21718d6d7d56a8754ac0b1798b29d1ab5b89abf6eb0526`를 대조했다.
첫 native 사례는 통과했고 V1/V2는 PNG 제한시간으로 실패했다.

V2 native trace는 입력 18,818개에서 허용 이벤트 16,600개를 보존했다. capture detail
누락·stream 읽기 초과·data loss는 없었으나 시작 응답이 2초를 넘어 **전체 관측 상태는
incomplete**다. 늦게 확인된 trace는 회수됐고 정리 불확실성은 보고되지 않았다. 그 상태와
별도로 native clock에 readiness 시작·실패 mark가 모두 있어 관심 구간 8,002.210ms를
식별할 수 있었다.

그 구간에는 rAF 요청 3개와 이전 요청 취소 2개가 있었지만 FireAnimationFrame·
BeginImplFrame·BeginMainFrame·DrawAndSwap의 새 진행 기록은 없었다. 시작 약 1.087ms
뒤 요청된 id 130도 창 안에서 실행·취소되지 않았다. callback의 capture 소유권은 직접
증명하지 않았으므로 시간상 인접한 요청이라는 범위로 해석한다.

반면 같은 renderer main thread는 timer 77개·FunctionCall 237개·idle callback 100개를
처리했다. 관측된 가장 긴 FunctionCall은 약 235ms였다. 제한한 category의 이 자료는 8초
하나의 동기 JS 작업이 멈췄다는 가설을 지지하지 않으며, GPU·compositor·스케줄러 중 원인을
확정하지도 않는다. 기본 시험 브라우저 모드와 실제 Chrome에 가까운 실행 모드의 비교를
검토하되 현재 renderer·혼색 모델·기존 rAF·8초 예산은 바꾸지 않았다.

### 7.18 전체 CI에서 발견한 구조·인증 범위 보완 — 2026-11-06

전체 후보의 editing 작업은 `creatorRootFiles 2508/2506`, product 작업은 문서 읽기 토큰
환경변수 선언이 2곳이라는 기존 검사에서 실패했다. 캡처 진단 도우미·시험을 `render/`로
옮겨 기존 2506 상한을 유지하고 import·필수 시험 경로만 갱신했다. 도우미 구현 bytes는
동일하며 색·캐시·렌더·준비 동작은 바꾸지 않았다.

인증은 기존 문서 복원 단계 한 곳을 product와 수동 editing에서 재사용하도록 정리했다.
필요한 filtered history fetch와 문서 복원은 그 단계에서 끝내고 전체 하네스 단계에는
토큰·credential 환경변수를 제공하지 않는다. 기존 GitHub HTTPS get 전용 helper와 토큰
선언 정확히 1개 조건을 유지했다. 새 인증 구현이나 보호 검사 완화는 없다.

로컬 보완 뒤 캡처 관련 5파일 64개, CI·구조 계약 7파일 68개가 통과했다. 소스 배치
2506/2506과 기존 정적 진입 그래프도 통과했다. 이 수정은 위 원격 후보의 산출물과 결과에
포함되지 않는다. 수정 후 전체 하네스·원격 필수 CI의 성공은 아직 확인하지 않았다.

### 7.19 전체 타입 검사 종료와 시험 브라우저 모드 비교 준비 — 2026-11-06

전체 CI의 타입 작업은 Web 26,284/26,284개 의미 검사를 마친 뒤 시험 도우미
`latent-pigment-address-model.test-helper.mts`의 bigint 리터럴 문법 6곳에서 실패했다.
API와 realtime의 후속 타입 명령은 선행 실패로 실행되지 않았다. 기존 정수 oracle과
ties-to-even 연산을 유지한 `BigInt(1)`, `BigInt(2)`, `BigInt(4)` 모듈 상수로 고쳤으며 ES 타겟·검사 대상·ignore·
허용오차는 바꾸지 않았다. 기존 실제 생성 GLSL 주소 회귀 4개가 통과했고 N33의 143,748개
성분 주소, N2…65 표본과 fraction16/23 digest도 유지됐다. 구문 AST의 BigIntLiteral은 0개다.
이 구문 확인은 수정 후 전체 타입 검사 통과를 뜻하지 않는다.

전체 CI `42110218442`는 실질 작업 7개 성공·4개 실패, 필수 `core/verify`도 실패로 종료됐다.
실패는 위 타입 문법, 7.18절의 구조·인증 범위, 기존 V1/V2 PNG 준비 경계다. 성공한 build와
보존 JS 검증을 전체 검증 완료로 확대하지 않는다.

다음 비교는 제품 단계에만 기본 false인 `capture_new_headless`를 추가한다. 비 main의
수동 안료 부분 진단에서 명시 선택할 때만 기존 `PLAYWRIGHT_CHANNEL`을 `chromium`으로
설정하며, 그 외는 빈 문자열 그대로다. 채널을 지정하지 않은 headless shell과 `chromium`
채널의 새 headless 구현은 [Playwright 공식 문서](https://playwright.dev/docs/browsers#chromium-new-headless-mode)에
구분돼 있다. 이것이 현재 실패 원인이라는 뜻은 아니며 실제 차등 결과를 확인한다.

root·pigment Playwright config, 기존 launch args, standalone GPU verifier, 실제 PNG 작업과
8초 준비 예산은 바꾸지 않았다. CPU·native trace 선택도 독립적이다. 세 입력의 조건을
각 648조합으로 검사했고 main·PR·push·merge_group 및 false·미입력에서는 기존 값이
유지됨을 확인했다. 이 비교의 실제 실행·성공 여부는 아직 확인하지 않았다.

### 7.20 새 headless에서도 재현된 경계와 DOM 관측 분리 준비 — 2026-11-06

새 채널 비교 [CI 42117372889](https://github.com/blue45f/toonstudio/actions/runs/42117372889)의
source는 `9d307dfd4b2944bd2f552f6332a3419f69f04722`, tree는 로컬 `af950e50…`와 같은
`a076d507f9ff8169f143cc39e58f6f926db63188`다. 실제 제품 단계에 `PLAYWRIGHT_CHANNEL:chromium`과
CPU·native 수집 입력 1이 반영됐다. native 사례는 PNG·벡터 SVG까지 통과했고 V1/V2는
여전히 PNG 준비에서 실패했다. 제품 artifact `13457553071` ZIP 12,819,062 bytes의 SHA-256
`8933de11ef9c885e381fe2a46a46b01f5cbd1edff2a4abc75516960df932dacf`를 대조했다.

이번 native collector는 timeout·정리·읽기·data loss 오류 없이 종료됐다. 관심 8,000.711ms에
rAF 요청 6개·ScheduleAnimation 7개, timer 74개·FunctionCall 102개가 있지만 새 Fire·
BeginImpl/MainFrame·DrawAndSwap는 없었다. 수집 시작 ACK 지연만으로 앞선 현상을
설명할 수 없고 새 채널 요청만으로 해결되지도 않았다. 이 비교는 소스 경로·CI 보완도 포함한
별도 후보의 역사적 대조이며 동일 SHA의 엄격한 A/B로 표현하지 않는다.

보존된 GPU B 이벤트 중 대응 E가 없는 구간은 원인 증거로 쓰지 않는다. 현재 sanitizer가
이름 없는 E를 제외했을 가능성을 배제할 수 없어 GPU thread의 장시간 정지를 확정할 수 없다.
V2 CPU profile도 음수 timeDelta 처리상 정밀 가중 귀속이 제한된다. 이 한계는 native의
named frame 이벤트 부재와 분리한다.

설치 Playwright 1.64.1 소스를 확인했을 때 DOM Snapshotter는 DOM·CSS를 순회하고 Canvas의
위치·크기를 읽지만 Canvas 픽셀 readback이나 추가 rAF를 직접 요청하지 않았다. CSS prototype
wrapper·MutationObserver·직렬화의 간접 비용은 미측정이다. `snapshots:false`는 DOM 관측과
HAR 수집을 함께 제외하며, `sources:true`와 API trace를 남길 수 있다. 열린 context에서
tracing.stop만 부르면 주입 wrapper가 되돌아가지 않으므로 context 생성 전 설정한다.

후속 `capture_without_dom_snapshots`는 기본 false이며 기존 비 main 수동 부분 진단 조건을
모두 만족한 제품 단계에서만 적용한다. 직전 비교와 같은 채널·CPU·native 선택을 유지하고
DOM snapshot/HAR 관측만 분리한다. 원래 세 시험, 실제 PNG·픽셀·SVG·실패 화면·sources,
8초 fence·renderer·권리 guard는 유지한다. 네 옵션의 조건·독립성 7,776조합, config의 다섯
환경변수 상태와 두 모드의 시험 3개 수집을 확인했다. 실제 차등 실행과 원인 규명은 아직 남아 있다.

### 7.21 DOM 관측 제외 결과와 클리핑 입력 대조 준비 — 2026-11-06

[CI 42123232188](https://github.com/blue45f/toonstudio/actions/runs/42123232188)는 source
`c59cf60470ee04ed4a971efdbd4113104036daef`, tree
`f3cafe7d8ea85059e8e8a524e215f4c88e946e8c`로 실행했다. 로컬 `33882c8e…`와 같은 트리이며,
직전 비교의 `apps`·`packages`·`e2e` 및 CPU/native helper bytes는 동일하다. 제품 단계 로그에서
Chromium 채널·CPU·native 관측과 DOM snapshot/HAR 제외 입력이 모두 반영됐음을 확인했다.
native 사례의 PNG·벡터 SVG는 통과했으나 V1/V2 사례는 같은 PNG render-timeout으로 실패했다.
따라서 이 관측을 제외한 설정을 기본값으로 채택하지 않는다. 결과는 1개 통과·2개 실패다.

실제 제품 artifact `13459763900`의 ZIP 2,105,923 bytes와 SHA-256
`336b15e0782abd8c28e49d25b341b789faee69655b91581c88ff435bdcadf19e`가 GitHub digest·receipt와
일치했다. 실패 trace ZIP 두 개의 frame/resource snapshot·network/HAR·screencast도 모두 0개여서
설정의 실제 반영을 확인했다. 관심 8,000.809ms에 rAF 요청 4개와 Fire·BeginImpl/MainFrame·DrawAndSwap 0개,
준비 frame 0이 남았다. 이번 native 수집기는 시작 ACK timeout으로 전역 incomplete이며,
관심 구간 양 끝 마크와 상세값은 보존됐다. 이 구간 관측을 수집 전체의 완전성으로 확대하지 않는다.

앞선 source `9d307dfd…`의 독립 browser artifact도 실제 파일·모듈·verifier 지문과 저장된
actual/expected 값으로 재검사했다. GL 7경로·WGSL 32표본·브러시 23종이 허용오차 내이며,
원본 LUT/GLSL exact literal 지문은 각각 0개다. 호환 API 이름과 레거시 식별자는 남아 있고,
현재 로컬 dependency bytes 대조·소프트웨어 GPU 결과를 과거 설치 환경이나 실물 GPU 보증으로
해석하지 않는다. 위 제품 PNG 실패를 이 독립 시험의 성공으로 덮지 않는다.

다음 대조는 별도의 합성 V2 원고에서 활성 획의 `clipBelow`만 false/true로 바꾼 두 사례다.
원래 세 시험의 fixture와 기본 선택은 유지하며, 비 main의 수동 부분 진단에서만 추가 대조를
선택한다. 실제 원본 보관·전환·undo/redo·내구 저장·재열기·PNG 경계를 사용하고 기존 8초
제한을 유지한다. 두 대조의 PNG 결과는 아직 없으며 클리핑을 원인으로 확정하지 않는다.
기존 원고나 제품 renderer·캐시 bounds·합성 연산을 변경하는 구현은 포함하지 않는다.

대조 준비의 소형 검증은 Node 3파일 16개·하네스 무결성·ESLint·Secretlint가 통과했다.
기본 수집 3개, 선택 등록 5개, 대조 필터 적용 2개의 정확한 제목을 실제 `--list`로 확인했다.
기존 spec 30,930 bytes의 prefix와 SHA-256은 동일하며 독립 검토에서도 같은 경계를 확인했다.
CPU/native 관측은 이번 대조에서 끄고 Chromium 채널과 기본 DOM 관측은 두 사례에 같게 적용한다.
관측 입력을 별도로 켜는 경우의 기존 native selector도 true 대조의 파일명에서 유지한다.

수정한 구조·인증 범위·bigint 문법의 전체 검증은 별도
[CI 42123433905](https://github.com/blue45f/toonstudio/actions/runs/42123433905)의 source
`e1a48ecb2ea38ceb919231590e85077037a70647`에서 진행 중이다. 위 `f3cafe7d…`와 같은 트리이며
관측 입력은 모두 false다. 후속 대조 시험·이 절의 추가분은 그 후보에 포함되지 않는다.
전체 필수 검사 성공이나 운영 배포로 기록하지 않는다.

### 7.22 수정 후보의 실제 빌드와 전체 CI 실행 예산 — 2026-11-06

전체 후보 `e1a48ecb2ea38ceb919231590e85077037a70647`의 build 작업은 성공했다.
실제 artifact `13461118130`은 1,193,396 bytes이며 SHA-256
`b25e7b2084e1e472ea227b126d11ff7b6b8395b79372cc58eaaca1dc04a022a9`가 GitHub digest·로컬
receipt와 일치한다. 추출 92개 파일을 모두 대조했고 app 1개·worker 64개 원장의 외부 Mixbox
보고는 모두 0이다. 보존 JS 23개·2,996,896 bytes의 AST·정적 closure·원본 exact LUT/GLSL
지문 검사가 통과했다. 이전 전체 후보의 실제 파일과도 보존 payload 90개가 같고
`commit.txt`, `build.log`만 달랐다. 미보존 47회 참조·30개 대상 및 계산식 import 한 개는
그대로 남아 있어 전체 dist 전수 검사나 운영 반영을 주장하지 않는다.

같은 후보의 타입 명령은 Web 26,284개 진단 0, API의 세 tsc, realtime의 두 tsc를 모두
완료했다. 후속 `type-coverage --at-least 95`가 실행된 지 약 56초에 job의 25분 한도에
도달해 중단됐다. GitHub annotation의 원문은
`The job has exceeded the maximum execution time of 25m0s`다. 타입 명령 단계 성공과
필수 job 전체 성공을 구분하며 coverage 점수·최종 성공은 미확인으로 남긴다.

편집 shard도 setup·semantic 검사 약 6분 뒤 전체 `pnpm harness:verify`를 실행했다.
이 명령은 별도 type job의 완료와 무관하게 Web·API 타입 검사를 다시 수행하며, 이번에는
의미 검사 15,385/26,283개 뒤의 다음 shard 실행 중 25분 job 한도로 중단됐다. 그전에
semantic shard와 하네스 구조·문서 복원·lint 검사는 통과했다. 별도 타입 명령의 완료를
이 하네스 전체 완료로 대체하지 않는다.

브라우저 job도 일반 접근성 16개·제작 흐름 15개·기본 native PNG/SVG 사례를 통과한 뒤
20분 job 한도로 중단됐다. 공식 annotation에 20분 초과가 기록됐고, 이 실행의 V1/V2
제품 사례는 완료되지 않았다. 전체 후보의 실질 작업은 8개 성공·3개 시간 초과이며
`core/verify`는 실패로 종료됐다. 앞선 별도 원고 PNG 실패와 이 실행 제한을 구분한다.

실제 측정에 따라 수동 비 main type job은 35분, `studio-editing` job은 40분,
브라우저 job은 35분으로만 예산을 분리했다. PR·push·merge_group·main 및 다른 job은
기존 예산을 유지한다. 명령·95 기준·core/verify·런너·앱 8초·시험 180초/540초는 바꾸지
않는다. 실제 YAML을 읽는 조건 8개·40개·8개와 Node 3파일 19개, 구문·lint·Secretlint를
확인했다. 기존 checkout의 20분 고정 단언도 정확한 조건식 단언과 기본 20분·지정 35분
조건 검사로 유지했다. 새 예산에서 전체 CI가 완료됐다는 뜻은 아니며 같은 source의 자동
재실행도 하지 않는다.

클리핑 입력 대조는 [CI 42127595880](https://github.com/blue45f/toonstudio/actions/runs/42127595880),
source `9ac8e200ea4950633101f5f51832cb69335199c0`, tree
`6dcc434d6676523436c30d6b704a016804dce8a4`로 요청했다. CPU/native 수집은 false, Chromium은
true, DOM snapshot 제외는 false다. 원래 세 시험은 기본 실행에 그대로 남고 별도 V2 대조
두 개만 부분 진단으로 선택했다. `clipBelow=false`는 원본 보관·전환·undo/redo·재열기·실제 PNG를
122,314ms에 통과했고, true는 PNG render-timeout으로 111,600ms에 실패했다. 브라우저 job은
1개 통과·1개 실패이며 부분 진단의 `core/verify`도 실패다. 새 시간 예산 변경은 이 실행에
포함되지 않는다.

실제 product ZIP은 8,125,453 bytes, SHA-256
`4785d4a5b4f6f7972e249897c71f81ef1cc586d3c31ed03481dc90685e36b22e`로 GitHub digest·receipt와
일치했다. 추출 8개 파일과 실패 trace의 실행 spec bytes를 source Git blob에 연결했다.
두 원본 JSON의 차이는 활성 획의 `clipBelow` 한 leaf뿐이다. 전환 프로젝트의 차이 8개는
활성·보관본 clip 값 2개, 보관 UUID 연결 3개, 시각 3개이며 나머지 render data는 같다.
두 arm 모두 underlay에 압력 등 기본 센서 배열 6개가 추가되는 단계 간 정규화도 기록했으며
전후 문서 전체가 같다고 처리하지 않았다.

off PNG는 1440×1280 RGBA·104,537 bytes이며 SHA-256은
`1bee30ec98491eeaea6eb91d001acfecf3c94c20072f4ed8765ba58b9d41e055`다. 전체 디코딩이 통과했고
흰 배경·회색 underlay만으로 설명할 수 없는 비회색 paint 9,833 pixels를 확인했다.
on의 준비 실패는 8,000.615ms·frame 0이며, 관측된 cache 12쌍은 모두 0×0·uncached였다.
cache 동기 합계는 4.675ms이고 준비 창 안의 추가 cache는 없었다. 이 값은 앱 counter·
제한된 관측이며 native rAF 소유권이나 GPU 정지의 증거가 아니다.

이는 off→on 고정 순서의 V2 한 쌍이며 부하·cold/warm 차이, SwiftShader와 DOM 관측의 한계가
남는다. on PNG는 없으므로 clipping 픽셀 정확성이나 모든 원고의 원인·해결을 확정하지 않는다.
자체 material bounds 연결을 검토하더라도 새 양수 cache의 내용 갱신과 출력 밀도를 함께
보존해야 한다. 제품 변경은 적용하지 않았으며 기존 브러시 표시·출력에 영향을 줄 구체 변경안은
사용자 승인 전에 별도 검토한다.

색 비교 그림도 원본 SDK를 다시 실행하지 않고 현재 자체 CPU 네 모듈만 대조했다.
과거 40표본의 자체 출력과 현재 출력 200개 배열이 일치하며 그림의 색상 칸 80개도 저장값과
맞았다. 평균 최대 채널 차이 12.075/255에는 끝점 16개가 포함된다. 이 자료는 과거 공개 CPU
관찰의 제한된 색 차이 예시이며 원본·브러시 전체의 현재 동등성 자료로 사용하지 않는다.

### 7.23 제품 적용 전 교차 픽셀 기준 시험 준비 — 2026-11-06

제품 4파일의 cache 후보는 사용자 승인 응답을 기다리며 미적용 상태를 유지한다. 별도로
승인에 의존하지 않는 시험 코드·선택 조건만 추가했다. `apps`·`packages`의 전체 source는
앞서 실제 빌드를 확인한 `e1a48ecb…`와 동일하다. 기존 spec 전체 36,516 bytes를 import까지
보존하고, 네 QA draft에서 B(underlay-only)·U(unclipped)·C(clipped)의 2×·4× PNG 여섯 장을
비교하는 선택 시험을 추가했다. 기본 세 시험은 유지하며 별도 부분 진단은 이 새 시험 하나만
선택한다. 실제 수집 확인은 기본 3개·옵션 전체 6개·교차 필터 1개다.

4× 고정 버튼은 없다. 기존 인쇄 UI에서 trim 287.9×255.9mm·DPI254·bleed0을 지정하면
정본 planner의 권장 배율은 정확 4×, 출력은 2880×2560이다. 288×256mm는 부동소수점
올림으로 4.01×가 되어 사용하지 않는다. 권장 배율을 적용한 뒤 기존 webtoon72 인쇄 preset으로
메타데이터만 복원하고 배율 4×가 유지되는지 확인하도록 시험했다. 숨은 state·handler 호출이나
새 UI는 추가하지 않았다. 이 경로의 source·정본 계산·시험 수집은 확인했으나 실제 UI·PNG 실행은
아직 확인하지 않았다.

고정 ROI와 채널 차이 1을 유지하고 최소 변화는 2×에서 32 pixels 초과, 4×에서 128 pixels
초과를 요구한다. 새 복합 시험은 360초, 전체 540초·기존 180초·제품 8초 제한은 유지한다.
관련 Node 19개, ESLint·Secretlint·하네스 무결성·source layout 2506/2506을 확인했다.
전체 하네스와 실제 픽셀은 클라우드에서 검증해야 한다. 이 제품 미변경 기준 시험은 기존
클리핑 실패를 숨기지 않으며, 일부 PNG만 생성돼도 여섯 장의 의미 검증 통과로 처리하지 않는다.

공개 12개 역할 audit에서는 새로 발견한 명시 함수 누락은 없었다. GPU linear 실행도 기존
실제 자료에 있었다. 기존 GPU 결과 중 공개 계약과 맞는 고유 18개 입력·126개 기록을 현재
자체 exact CPU API로 재대조했을 때 RGB byte 차이는 최대 1/255, alpha byte 차이는 0이었다.
coverage alpha 112개 기록은 계약이 달라 이 비교에서 제외했다. 새 GPU 실행·새 LUT 생성·
원본 SDK 실행·피팅은 하지 않았다. 이 한정된 일치를 전체 색역·원본 Mixbox 색 동등성이나
legacy clipping·전체 CI 완료로 확대하지 않는다.

### 7.24 교차 기준 실행의 실제 4 PNG와 시간 예산 한계 — 2026-11-06

[CI 42141188876](https://github.com/blue45f/toonstudio/actions/runs/42141188876)는 source
`218f3762c01781d4c72fbf46d855d05aebd6da5a`, tree
`b7495b5f9cbdc2894e1dbfced0d0b2811588889c`의 제품 미변경 부분 진단이다. 실행 spec
57,334 bytes의 SHA-256 `7259f77e10425d17b8f961635eb0d987993efd352a0d4838b628c99a1fadfa98`를
trace의 실제 source와 대조했다. CPU/native 관측은 0, Chromium은 1이며 같은 source를
재실행하지 않았다. 자체 안료·23종 브러시·GPU 공개 기능 검사는 통과했지만, 제품 교차 시험은
360초 한도로 `restoreIfPrompted → seedClipSemanticDraft`에서 실패했다. 실패 화면은
clipped draft의 편집기 로딩 중이었다. C의 PNG 버튼을 누르기 전이며, 이 실패를 기존
8초 PNG render-timeout이나 clipping 픽셀 실패로 분류하지 않는다.

product ZIP은 12,944,832 bytes, SHA-256
`8d63fe4631f0a7a4f796f49b1e8ea91b1f3e25afe311a35fd2af1b7f7f9ce8e7`이며 추출 12파일을
receipt의 bytes·hash와 모두 대조했다. B와 U의 실제 PNG 네 장은 RGBA 전체 디코딩이
통과했다. 각각 2× 1440×1280, 4× 2880×2560으로 공개 UI의 정확 4× 경로도 확인됐다.

| 배율 | 내부 U−B 변화 pixels | 바깥 위 U−B | 바깥 아래 U−B | 기존 최소 기준 |
| --- | ---: | ---: | ---: | --- |
| 2× | 1,409 | 2,012 | 3,042 | 32 초과 |
| 4× | 5,543 | 7,762 | 11,636 | 128 초과 |

기존 고정 ROI와 채널 차이 1 기준을 적용했다. B의 바깥 두 ROI는 2×에서 각각 6,000,
4×에서 각각 24,000 pixels 전부 불투명 흰색이다. 따라서 교차 입력의 B/U 전제는 실제
출력에서 성립한다. C2·C4는 없으며 누락 비교는 null, 전체 판정은 `incomplete`,
`fullPixelPass=false`다. 실패 screenshot을 C 대조로 대체하지 않았다. 저장된 B/U 페이지는
source 대비 각각 활성 획의 hidden, clipBelow 한 leaf만 다르며 보관 획에서 원본 material
획을 정확히 복원했다. source·archive 전체와 다른 모든 원고를 보편 보증하는 결과는 아니다.

browser ZIP 1,054,165 bytes의 SHA-256은
`ed030b4ad0eb03bbe9f258b730a8e0d8679d96ad93e7125a7d079ac4bb019f21`이며 추출 9파일과
실제 fixture에 포함된 저장소 source 56개의 hash를 확인했다. 금지 모듈은 0개다. 이것은
한정된 fixture·SwiftShader·합성 PointerEvent 검사이며 전체 dist·실물 GPU·물리 펜·전체
제품 원고 검증을 대신하지 않는다. 일반 접근성·제작 보드·생산 빌드·타입 검사는 부분 실행에서
제외됐으므로 전체 CI 통과 근거가 아니다.

trace에서 마지막 clipped draft 재진입은 최초 source 진입 약 356초 뒤였다. 네 draft의
초기 로딩과 여섯 capture를 포함한 360초 복합 예산이 부족했으므로 새 의미 시험만 480초로
조정했다. 기본 3시험 180초·global 540초·제품 readiness 8초·retry0·worker1과 픽셀 기준은
유지한다. 480초에서 실제 완료됐다는 근거는 아직 없으며 이 예산만 바꿔 같은 제품을 다시
실행하지 않는다. 제품 cache 후보 4파일은 계속 사용자 승인 전 QA 사본으로 남는다.

### 7.25 사용자 승인에 따른 제품 cache 후보 적용 — 2026-11-06

사용자가 비동기 승인에서 **적용 후 클라우드 검증**을 선택했다. 승인 범위는 QA v26의
제품 4파일 패치와 공용 cache 회귀 검증이며 운영 배포는 포함하지 않는다. 적용 전 깨끗한
`0f39dc58dd05b22532633fdc62ccc68062a12be1`에서 승인 patch 13,559 bytes의 SHA-256
`b8a9e04acccb561f5abc2cf8993a3cf7a7e56670302a90f5ac9a29b47576a516`과 네 기준 source hash를
확인하고 적용했다. 최초 적용 bytes는 네 proposed 사본과 모두 같았다.

제품 변경은 `c8bb5a53f86d95fce61849988e7f71b2f2da1c1c`에 기록했다. 재료 Shape가 기존
정본 bounds를 공개 `selfRectFunc`로 제공하고, Clip/Blend owner가 기존 capture registry를
통해 요청 밀도를 준비·복원하며, immutable 요소·관련 draft revision으로 내용 갱신을 반영한다.
프로그램 계수·seed·브러시 설정·원고 schema·보관본·기존 권리 guard는 바꾸지 않았다.

`apps/web/AGENTS.md`는 기존 초과 파일의 줄 증가를 금지하므로 DocumentLayer의 세 cache-key
배열은 값과 순서를 유지한 채 줄 묶음만 조정했다. 실제 TSX parser의 node kind·leaf text·
child order가 승인 사본과 같고 parse 오류는 0이다. 파일은 기존 922줄을 유지하며 승인 초안의
930줄보다 줄었다. 나머지 제품 3파일은 승인 사본 bytes 그대로다. 처음 시도한 transpile 원문
일치와 문맥 재스캔 없는 scanner 비교는 동일성 근거로 사용하지 않았다.

원격 main `1781fd59c76cd9c2066cf2124d6b4e35daa1d33c`도 통합했다. 네 제품 대상에는 upstream
변경이 없었고, CI type job 예산 충돌은 최신 main의 모든 이벤트 35분을 유지하도록 해결했다.
95 coverage 기준·필수 gate·런너·기존 부분 진단 조건은 보존했다. 관련 CI Node 21개와
하네스 무결성·source 크기 ratchet·제품 4파일 ESLint/Secretlint를 확인했다. 전체 하네스·
프로덕션 빌드·실제 제품 PNG는 승인 후의 새 정확한 source에서 클라우드 검증할 항목이다.

기존 cache diagnostics 시험은 실제 registry를 유지하도록 importOriginal을 사용하며,
2×·4× 준비와 기본 DPR 복원·출력 중 timer/presentation·cleanup·직접 오류의 원인 보존을
포함해 단일 파일 21개가 통과했다. blend 경계의 기존 네 시험도 새 옵션·revision 계약으로
갱신해 통과했다. 이것은 ref/effect/Konva node 모형과 source 경계 검사이며 실제 React Canvas
mount·클리핑 픽셀·다른 이미지의 출력 통과를 대신하지 않는다. 같은 source의 자동 재실행이나
운영 배포는 하지 않는다.

필수 Vitest 정본 `ci-required-vitest-targets.txt`에는 기존 registry·image presentation·
image density·image node 경계·blend 경계의 누락 5개만 추가했다. runner와 impl의 분배
알고리즘은 수정하지 않았다. 실제 `--list`의 전체 선택은 896→901, foundation은 509→514이며
삭제·중복은 0, 다른 shard와 명령은 같다. 관련 Node 21개와 정본 Secretlint를 확인했다.
이 선택 확인은 추가된 다섯 Vitest가 실제 클라우드에서 통과했다는 뜻이 아니다.

실제 교차 fixture에는 안료 ROI 밖 `(400,200)·64×64`의 단색 SVG와 왼쪽 절반만 불투명한
SVG 마스크를 추가했다. 기존 B/U/C의 여섯 PNG마다 고정 두 ROI에서 내부 RGBA
`[30,120,200,255]`, 외부 `[255,255,255,255]`와 채널 차이 1 이내·불일치 0을 요구한다.
각 PNG 직후 attachment를 남기며 이미지의 원본·전환·재열기·control·출력 뒤 값도 보존
단언한다. 기본 spec prefix 36,516 bytes·기존 교차 ROI·tolerance·최소 변화·여섯 capture는
같고 실제 수집은 기본 3·옵션 6·교차 필터 1이다. 이 이미지 픽셀은 아직 실행하지 않았으며,
단일 fixture가 모든 이미지·편집 변경·실물 GPU 회귀를 보편 증명하지는 않는다.

### 7.26 승인한 cache 적용 뒤 실제 여섯 PNG와 빌드 — 2026-11-06

게시 당시 main `f682fb0f7bc88b58a7c33b4e3d9a3fc379c7e7ee`를 포함한 로컬 후보
`a1a6a1d015b8d802fc595754db5787a724cf9fd0`, tree
`df01a908ddb01a327774dc4b03cac11ed9638bc6`를 두 검증 브랜치에 같은 파일 구성으로 게시했다.
부분 진단은 source `e33d006fa8c74a6043b931c3fecff1928d0b6b30`의
[run 42147265272](https://github.com/blue45f/toonstudio/actions/runs/42147265272), 전체 CI는
source `4ad3d5c4194833f209f5f675e1ce8d22bd6bd50d`의
[run 42147265532](https://github.com/blue45f/toonstudio/actions/runs/42147265532)다. 두 source의
전체 파일 차이는 0이며 부분 진단 입력과 필수 전체 실행을 구분한다. 동일 SHA를 중복 요청하지 않았다.

부분 진단에서는 자체 안료·23종 브러시·GPU 검사를 통과했고 B/U/C의 실제 여섯 PNG를
289,105ms의 사례 실행 안에 모두 생성했다. 실행 spec 61,869 bytes의 SHA-256
`bfa0c8ddeed80ef338e59f24275e0f1f4b3173549b28279819b79ecd09e471b5`를 trace의 실행 source와
대조했다. product ZIP 15,253,852 bytes의 SHA-256은
`69e55d5c24f7971576b272215694bd2b241a26167e55f9b9c87a4dd2902fd9dc`이며 추출 15파일이
receipt와 모두 일치했다. 네 전환 페이지의 차이는 B의 hidden 한 leaf, U의 clipBelow 한 leaf,
C의 차이 0이다. 보관본에서 원본 material 획을 정확히 복원했고 이미지도 네 페이지에 보존됐다.

모든 PNG는 정확한 2×·4× 크기와 RGBA 전체 디코딩이 확인됐다. 이미지의 내부 색·외부 흰색
두 ROI는 여섯 장 모두 불일치 0이다. 클리핑 밖 C−B 차이도 두 배율의 두 ROI에서 모두 0이며,
안쪽의 C−B/U−B 변화 수는 각각 2× 1,409, 4× 5,543으로 같다. 다만 C−U의 내부 차이는
기존 채널 차이 1 기준에서 실패했다.

| 내부 C−U 차이 | 2× | 4× |
| --- | ---: | ---: |
| 차이 1을 넘는 pixels / 전체 | 66 / 1,600 | 165 / 6,400 |
| 최대 절대 차이 RGBA | [3,2,2,0] | [3,2,3,0] |
| 채널별 평균 절대 차이 RGBA | [0.37375,0.39375,0.38125,0] | [0.33484375,0.35515625,0.33203125,0] |

클라우드 사례는 2× assertion에서 실패했고 4× 같은 실패는 보존 PNG의 독립 오프라인
검사에서 확인했다. `fullPixelPass=false`를 유지하며 허용오차를 바꾸지 않았다. 이는 480초
사례 한도나 8초 준비 제한 실패와 다르다. source상 C는 투명 inner bitmap에 안료를 누적해
mask의 source-in을 거쳐 underlay에 합성하고, U는 underlay에 직접 누적한다. 중간 RGBA8
반올림의 영향은 추가 확인 대상이며 현재 차이의 원인을 확정하지 않는다.

전체 CI의 production build는 성공했다. build ZIP 1,193,294 bytes의 SHA-256은
`7ac21f72fa580c28137fc0ee478001091a8550f91139124f202d5bf1360e54c1`이며 추출 92파일을 모두
확인했다. app 1·worker 64의 원장 65개가 금지 모듈 0을 보고했고 app 범위는 2,664 chunks·
12,860 modules다. 보존 JS 23개·2,996,896 bytes의 hash·AST 확인과 원본 LUT/GLSL의 exact
literal 지문 0을 확인했다. 미보존 참조 47개와 computed dynamic import 1개가 남으므로 전체
dist 모든 코드·압축·분할 변형·운영 배포의 부재를 증명하는 결과로 확대하지 않는다.

편집 semantic 회귀 353파일·4,932시험은 통과했다. 이후 전체 하네스 시작 직전의
`origin/main` ancestor 검사에서 main이 `6affe05b…`로 전진한 것이 확인돼 작업이 실패했다.
따라서 이 실행의 `pnpm harness:verify`는 미실행이며 전체 CI 통과로 처리하지 않는다.
새 main의 변경은 브러시 회귀 두 파일이고 로컬 `8cabe901…`에 통합했다. 제품 4파일은 실제
빌드 source와 동일하다. 남은 전체 작업의 결과와 추가 합성 참조를 확인한 뒤 새 정확한
source를 검증해야 하며 기존 gate를 완화하거나 같은 SHA를 자동 재실행하지 않는다.

### 7.27 기본 제품 시험 통과와 보조 alpha 참조 준비 — 2026-11-06

전체 source `4ad3d5c4…`의 브라우저 job `127661670390`은 일반 접근성 16개·제작 흐름
15개·기본 안료 제품 시험 3개를 모두 통과했다. native는 선택·SQLite 저장·재열기·새 입력·
내구 저장·PNG/SVG를, V1/V2는 원본 다운로드·명시 전환·undo/redo·재열기·내보내기를
실행했다. 제품 artifact `13471304684`는 568,831 bytes, SHA-256
`c86c2b7f1f4ea1be2176458553389574b63d0f9941693821c9889d4a80cf019f`이며 ZIP/추출 13파일을
receipt와 대조했다. V1/V2의 보관본은 provenance 필드를 복원하면 다운로드 원본과 같고,
활성 획은 프로그램 전환 외 필드·clipBelow=true를 보존한다. 각 외관 보존 SVG의 내장 PNG는
해당 변환 PNG와 byte 단위로 같다. native SVG는 별도 벡터 산출물이며 image0개다. 이 SVG를
다시 rasterize해 native PNG와 비교한 것으로 표현하지 않는다.

기반 job `127661670423`도 1,108파일·16,573시험을 통과했다. 새 필수 선택 5개와 cache
diagnostics 21개가 실제 로그에 실행·통과한 것을 확인했다. type job도 종료해 웹 26,286개
의미 검사·API·실시간 워커와 type coverage 99.68%(1,078,538/1,081,905)가 통과했다.
실질 작업은 10개 성공·editing 1개 실패로 끝났고 core/verify는 실패다. editing의 전체
하네스는 앞 절의 main 전진으로 미실행이다. 따라서 필수 전체 gate 통과나 운영 배포 완료로
처리하지 않는다.

RGBA8의 작은 계산 모형에서는 배경 [32,32,32,255] 위의 premul [1,0,0,1] 24회가 직접
누적 시 [56,32,32,255], 투명 group→불투명 source-in→배경 시 [53,29,29,255]가 된다.
반면 정확한 유리수 계산에서는 두 경로가 같다. 이는 중간 반올림만으로 차이3이 가능한
존재 반례이며 실제 Chrome의 정밀도나 이번 출력 차이의 원인을 재현·확정한 것은 아니다.

같은 material의 별도 P draft에서 base·이미지만 숨기고 clipBelow=false로 하여 공개 UI의
투명 PNG 2×·4×를 추가 관측하도록 시험만 보완했다. B/U/C의 여섯 PNG와 기존 strict C−U
검사·실패 목록·최종 assertion은 유지한다. 먼저 두 배율의 strict 결과를 첨부하고, P 두 PNG와
별도 P-over-B 참조까지 첨부한 뒤 같은 strict assertion을 실행한다. 참조는 내부에서
`round((P.rgb×P.a+B.rgb×(255−P.a))/255)`, 외부에서 B를 쓰며 채널 차이1·불일치0을 검사한다.
P의 빈 영역 alpha0, B의 고정 불투명 mask 전제와 UI 투명 설정 false 복원도 확인한다.

P는 현재 brush의 grouped 관측으로 독립 alpha 산술을 보조하며 원본 SDK·brush 자체의
독립 oracle은 아니다. PNG의 straight↔premul 양자화와 cache grid 전제가 남는다. 아직
실제 P PNG나 참조 일치는 검증하지 않았으며 기존 C−U 실패를 통과로 바꾸지 않는다.
5draft·8capture·사례480초·전체540초·제품8초와 기본3/pair2 등록을 유지했다. 최신 main의
`5d416b22…`도 통합했으며 제품4파일은 실제 검증 source와 같다. 추가 시험의 ESLint·
Secretlint와 최신 Core 영수증 정책을 포함한 Node 45개는 통과했다. 전체·추가 PNG 실행은
새 정확한 source에서 클라우드로 검증해야 한다.

### 7.28 원본 혼색 재현을 완료 기준으로 확정 — 2026-11-06

사용자는 원본과 다른 색을 수용하는 대신 **원본 혼색 결과까지 재현**하는 것을 선택했다.
이후 기존 합의 기록을 요청한 데에는 판단을 맡기고 계속 진행하라고 답했다. 이는 독립 구현을
계속할 작업 지시로 기록하며, 제작사의 상업 이용·데이터 재사용·특허 허락을 확인한 것으로
해석하지 않는다. 저장소의 허가 기록은 미기재다. 연결된 Drive의 Mixbox 검색과 제작사
도메인 송수신 메일 검색에서도 합의서를 찾지 못했지만, 이 제한된 검색은 합의의 부재 증명이
아니다. 계약·구매·외부 연락·배포는 수행하지 않았다.

이미 보존된 원본 공개 I/O만 현재 자체 함수에 연결했다. 새 원본 SDK 호출·대량 관측·계수
적합·원본 LUT나 수치 상수의 제품 채택은 하지 않았다. 자체 함수의 작은 Node 실행만
수행했으며 원본의 코드·AST·LUT·GLSL을 제외한 공개 I/O 추출본을 따로 사용했다.

| 검증 층 | 보존 자료와 현재 구현의 대조 | 판정 |
| --- | --- | --- |
| 8비트 RGB | 40표본 중 끝점 16개 일치, 중간 혼색 24개 불일치. 최대 채널 차이 55/255 | 원본 재현 미달 |
| float sRGB | 같은 40표본에서 최대 채널 차이 0.21855603366913123 | 원본 재현 미달 |
| linear RGB | 같은 40표본에서 최대 채널 차이 0.23130111025592784 | 원본 재현 미달 |
| 독립 알파 RGBA | 색 채널은 위 차이를 유지하며 alpha 차이 0 | 알파 계약 일치가 RGB 동등성을 대신하지 않음 |
| CSS·hex 입력 | 입력이 명시된 기존 추가 관측에서 반환 자료형은 맞지만 적색/청색 RGB 최대 차이 26/255 | 입력 지원과 혼색 재현을 구분 |
| 원본 7채널 latent 교환 | 보존 공개 자료에는 길이 7만 있고 비교 가능한 원본 벡터가 없음 | 미검증·호환 주장 없음 |
| 실제 GPU 출력 | 저장된 자체 GPU 126행은 현재 자체 CPU 대비 최대 1byte·alpha 차이 0. 같은 입력의 원본 GPU 참조는 0행 | 원본 GPU 동등성 미검증 |
| 제품 브러시 | CPU로 만든 기본 33단계 1D 팔레트의 `round(resolvedMix×32)` 색 선택 뒤 mark opacity·합성이 적용됨 | 공개 lerp 일치만으로 최종 브러시 동등성을 보장할 수 없음 |

원본과 자체 모델은 농도 4개·잔차 3개라는 형식을 공유해도 농도 선택과 순방향 함수가 다르다.
잔차를 정의하면 서로 다른 모델도 자기 RGB 왕복과 끝점 일치를 만들 수 있으므로 왕복·대칭·
배열 길이는 중간 혼색 곡선의 동등성을 증명하지 않는다. 현재 GPU의 자체 33³ 농도 표와
제품의 33단계 1D 팔레트도 서로 다른 근사 경계다. 40표본을 맞추는 계수만 찾는 방식으로
전체 색역·raw latent·GPU·브러시 동등성을 선언하지 않는다.

다음 구현 선택지는 다음처럼 구분한다.

| 선택지 | 변경과 영향 | 원본 재현·권리 한계 |
| --- | --- | --- |
| 현재 자체 모델 유지 | 패키지 제거와 현재 기능을 유지하며 색 계수 변경 없음 | 원본 재현 기준을 충족하지 않아 최종 완료안으로 채택하지 않음 |
| 독립적인 동등 혼색 지도 구현 | 원본과 동등한 입력→농도·잔차→출력 함수를 별도 구현하고 역할별 참조로 검증 | 원본 바이트를 복사하는 것만이 수학적 경로는 아니지만, 동등 mapping과 충분한 검증 자료·사용 권리 근거가 필요함. 현재 동등 모델은 아직 없음 |
| 원본 수치 데이터 재사용 | 패키지 없이도 원본 LUT·계수로 같은 계산을 만들 가능성 | 패키지 제거가 데이터의 조건을 제거하지 않음. 별도 허용 범위 미확인 상태에서 제품에 적용하지 않음 |

현재 판단은 패키지 제거·독립 구현 경계를 유지하고 두 번째 선택지의 가능성을 검증하는 것이다.
새 혼색 모델을 만들더라도 현재 제공자 버전의 계수를 조용히 바꿔 기존 저장 획을 다시
해석하지 않는다. 버전·원본 보관·명시적 전환 receipt와 색·브러시 비교가 필요한 변경이며,
현재 소스에는 그러한 모델 교체를 적용하지 않았다.

근거는 Git 제외 QA의 `product/original-fidelity-prerequisites-v37/`와
`product/original-sdk-fidelity-inventory-20261106/safe-public-io.json`이다. 원본과 현재의
역할별 불일치는 정확한 제한 표본의 반례이며 전체 입력공간의 오차 상한 측정은 아니다.
원본 SDK를 열람한 분석 경로는 새 모델의 원본 소스 비노출 구현 담당으로 재사용하지 않는다.

### 7.29 실제 여덟 PNG와 별도 alpha 합성 대조 — 2026-11-06

추가 진단 [run 42152696547](https://github.com/blue45f/toonstudio/actions/runs/42152696547)의
source는 `874bd76d8188d2afd79636f2491f69cb37dacc9c`다. product artifact `13473363814`는
18,690,130 bytes, SHA-256
`f847489c2e1f5bb720d275fc126378df8e811b860158dffda7ef3cc3d5e95a81`다. GitHub digest·추출
18파일·trace의 실제 시험 소스 SHA-256
`999910d510bcf30a5267ee5c209a0a0f25d75d9d50b281c9a8d8b9e49bad79d3`를 확인했다.
여덟 PNG를 모두 완전 디코딩했다. B/U/C 여섯 장은 앞의 run 42147265272와 SHA-256도 같다.

| 실제 PNG 대조 | 2× | 4× |
| --- | ---: | ---: |
| 기존 strict C−U 내부 차이1 초과 pixels | 66/1,600 | 165/6,400 |
| 기존 strict C−U 최대 RGBA 차이 | [3,2,2,0] | [3,2,3,0] |
| C와 P-over-B 내부 차이1 초과 pixels | 0/1,600 | 0/6,400 |
| C와 P-over-B 내부 최대 RGBA 차이 | [1,1,1,0] | [1,1,1,0] |
| mask 외부 C−B 차이 | 0 | 0 |
| P의 빈 이미지 두 ROI의 nonzero alpha | 0 | 0 |
| U와 같은 P-over-B 식의 내부 불일치 pixels | 80/1,600 | 210/6,400 |

브라우저 첨부와 저장 PNG를 읽은 독립 Pillow 계산이 pass/fail·최대 차이·alpha 수·고정
mask 전제에서 일치했다. PNG의 straight RGBA와 bitmap→Canvas 재표현은 내부 MAE가
조금 달라 이 둘의 byte 동일성을 주장하지 않는다. 원고 대조는 B 숨김 한 곳·U clip 한 곳·
C 변경 없음·P 숨김 두 곳과 clip 한 곳뿐이고, 원본 보관본·활성 획의 나머지 필드·이미지는
보존됐다. 투명 PNG 두 장과 투명 설정 false 복원도 실제 trace에서 확인했다.

시험은 **480초 시간 초과와 기존 strict assertion 실패**로 끝났다. P 캡처·설정 복원·2×
참조가 기록됐고, After Hooks 시작 뒤 4× 참조 첨부와 strict assertion까지 남았다. 모든
PNG가 존재한다는 사실을 정해진 시간 안에 시험이 끝났다는 주장으로 바꾸지 않는다.
성공한 다운로드 뒤에도 오류 문구를 기다리는 `Promise.race`의 패자 관측자가 남는 수명
문제도 확인했지만, 이것이 전체 시간 초과의 주원인이라는 인과관계는 확인하지 못했다.

source는 material stamp들을 투명 bitmap에 평탄화하고 content에 `source-in`을 한 번
적용하도록 명시한다. 밑색에 stamp를 직접 누적한 U가 격리 합성한 C와 항상 채널 차이1
이내여야 한다는 전제는 source 계약에서 나오지 않는다. 독립 리뷰에서도 C−U를 원본
Mixbox나 clipping의 exact oracle로 쓰기 어렵다고 판단했다. 위 실패·수치는 그대로 보존한다.

올바른 범위의 다음 시험안은 C−U의 차이를 진단 수치로 계속 남기면서 P-over-B의 합성,
mask 외부 C=B, 내부 C−B·U−B의 충분한 그림, 외부 U−B의 충분한 그림, 이미지 마스크,
P의 빈 alpha0, B의 고정 mask 전제·저장·보관을 명시적인 통과 조건으로 유지하는 것이다.
단순한 허용오차 증가나 전체 strict 실패 목록 삭제로 대체하지 않는다. P는 같은 자체 엔진의
격리 출력이며 원본 SDK의 독립 oracle·반투명 mask·AA 경계·실물 GPU 검증은 아니다.

전체 기록은 Git 제외 QA의 `product/p-alpha-artifact-v37/README.md`,
`summary-v2.json`(SHA-256
`dd6c875bbb073ba754c21792176f6c473f99e27efc7ea37ae7ea8a29df5462d3`)과
`trace-timeline-v2.json`에 있다. 이 결과 이후 제품 4파일이나 혼색 계수를 추가로 바꾸지 않았다.

## 8. 남은 권리·품질 확인

자체 모델의 코드·데이터 출처와 상업 이용·방법 특허의 적격성은 별개다.
[`잠재 안료 기능 문서`](../features/latent-pigment-mixing.md)의 10장처럼 구조를 참고한
이력과 특허·서면 합의 미확인을 유지한다. 패키지 미포함 검증도 이 권리를 대신하지 않는다.

상업 라이선스 구매·외부 계약·운영 배포는 이 변경안의 완료 조건에 포함하지 않았으며 실행하지
않는다. 기능·설정 보존을 확인한 뒤에도 원본 대비 색·성능을 동등하다고 말하려면 별도의
품질 기준과 실제 기기·원고 코퍼스 검증이 필요하다.

RGBA8 바이트 저장의 보존은 모든 WebGL1 장치의 같은 산술 정밀도를 뜻하지 않는다.
ESSL100의 `highp` 최소 상대 정밀도는 16비트이며, packed 주소와 Float32 복호화의 실제 장치
결과는 별도 확인이 필요하다. 현재 확인은 SwiftShader에 한정되고 최소 정밀도 실물 GPU의
깨짐을 재현한 것은 아니다. [Khronos ES 2.0 정밀도 표](https://www.khronos.org/files/opengles20-reference-card.pdf),
[WebGL 1.0 규격](https://registry.khronos.org/webgl/specs/latest/1.0/)을 근거로 미검증 범위를 남긴다.
