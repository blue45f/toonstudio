# 상용 이용·재배포 권리 감사 — 2026-11-05

후속 현재 상태·CI/PR 준비는 [최신 base 준비 기록](commercial-license-pr-readiness-2026-11-05.md)을 따른다. 이 문서의 이전 SHA 검증 기록은 당시 snapshot으로 보존한다.

상태: **current / wasm-vips의 실제 사용 기능 대체 및 의존성 제거, 다른 항목은 검토·대체 중**.
전체 의존성 제거 또는 상용 배포 승인 완료가 아니다. 아래 최초 감사 내용은 교체 전 기준이며,
최종 변경·검증 상태는 문서 끝의 **후속 구현과 통합 검증** 절을 따른다.

**후속 정정:** 사용자의 개인·1인 사용 전제로 Remotion은 유지하며 불필요한 수학 대체를 복구했다.
이 문서의 초기 Remotion 제거 계획은 철회됐다. 기존 LT 테스트 실패와 전체 타입 검사의 메모리
제약도 후속 작업에서 해결했다. 현재 검증·보존 상태는
`commercial-remediation-followup-2026-11-05.md`와 `remotion-retention-decision-2026-11-05.md`가 우선한다.

## 기준과 범위

- 저장소 HEAD: `8d315c85d6fde4a3a30255612c756d3e299a95b0`, 브랜치 `work`.
- 시작 시 `git status --short`는 비어 있었고 worktree는 `/workspace/toonstudio` 하나였다.
- 루트, `scripts`, `docs`, `apps/web`의 AGENTS.md와 ADR 0008을 확인했다.
- Mixbox는 사용자 지시에 따라 수정하지 않았다. 관련 의존성·어댑터·자산·테스트는 변경하지 않았다.
- 사용 가능한 도구 이름·설명을 조회했지만 Rea / reverse-engineer-anything MCP는 노출되지 않았다.
  Rea를 사용했다고 주장하지 않는다. 추후 네이티브 분석 시 저장소 지시대로 Ghidra가 필수다.
- 패키지는 공식 registry에서 lockfile에 고정된 resolution으로 설치했다. 실행 pnpm은 11.25.0,
  Node는 24.19.0이다. 초기 pnpm의 홈 디렉터리 생성 오류를 `/tmp` PNPM_HOME/XDG 경로로 해결했다.
  lockfile은 변경하지 않았다. 초기 설치는 `pnpm harness:check`의 pnpm 자동 설치로 실행되었다.
- 영구 권한 상승, 운영 서비스 접근, weight 다운로드, PR·push·merge·배포는 하지 않았다.

## 최초 감사 결과와 우선순위 — 교체 전 기준

| 항목 | 정확한 버전/자산 | 판정 | 근거·실제 경로 | 확신 / 다음 조치 |
| --- | --- | --- | --- | --- |
| Tag2Pix | `tag2pix.onnx`, 79,269,994 bytes | **비상업 및 재배포 제한 확인**. 별도 허가 미확인 | upstream README는 코드 MIT와 release 가중치 제한을 구별. 로컬 고지가 두 제한 자산의 직접 변환을 명시 | 높음. 권리 확보 또는 독립 학습 모델의 기능·품질 동등성 검증이 필요 |
| AnimeGANv2 Paprika | `animegan2-paprika.onnx`, 8,702,673 bytes | **원본 비상업 조건과 하류 MIT 주장 충돌** | 원본 README License, PyTorch README Weight Conversion, 로컬 변환 기록 | 조건 충돌 높음 / 별도 허가 존재 미확인. 변환만으로 권리 해소 불가 |
| AnimeGAN Face Portrait v2 | `animegan2-face-paint-512-v2.onnx`, 8,702,673 bytes | **가중치·데이터 권리 미확인** | PyTorch README는 별도 학습 모델로 설명. Paprika 변환본이라고 일반화 불가 | 중간. 정확한 weight grant 및 학습 데이터 권리 확인 |
| Remotion | `remotion`, `@remotion/player` 4.0.536 | **자격에 따른 상용 라이선스 조건** | 설치 LICENSE.md, tour Player·공유 film·brand-film·생성 promo 프로젝트 | 높음. 개인·소규모 법인 등 무료 자격 또는 Company License 확인 필요. 보편적 상용 금지가 아님 |
| wasm-vips | 0.0.19; libvips 8.18.7 등 | **MIT 래퍼 내부 LGPLv3 등 배포 의무** | 실제 `THIRD-PARTY-NOTICES.md`, `versions.json`, export adapter의 dynamic import | 높음. 누락 고지 수집 수정. source/relink/교체 등 전체 의무 충족은 미완료 |
| OpenCascade | opencascade.js 1.1.1 | **LGPL-2.1-only 의무** | `docs/third-party/opencascade-lgpl.md`, lazy JS/WASM provider | 높음. 기존 고지는 최종 검토 대기 상태. 독립 자산 로딩만으로 모든 의무 충족을 단정하지 않음 |
| sharp 내장 libvips | @img/sharp-libvips-linux-x64 1.3.4 | **LGPL-3.0-or-later 의무** | 설치 production graph; 기존 static bundle 검사에는 native sharp 유출 차단 있음 | 높음. 서버/도구 이미지 배포와 browser 경로를 구분해 후속 확인 |
| p5 peer | p5 2.3.1, libtess 1.2.2 | LGPL-2.1 / SGI-B-2.0 고지 의무 | 실제 사용 p5.brush 2.2.1 standalone과 peer resolution은 별개 | 높음. resolved라는 이유로 browser 번들 포함이라고 단정하지 않음 |
| MPL 라이브러리 | @resvg/resvg-wasm 2.6.2, web-ifc 0.0.78, web-push 3.6.7 | **파일 단위 source·고지 의무** | 설치 production inventory 및 기존 생성기 | 높음. 상용 이용 금지로 분류하지 않음 |
| inkwash | `third_party/inkwash/README.md`의 research reference | **라이선스 미확인, reference-only** | README는 제품에 index.html 복사 금지 명시 | 중간. 이름이 같은 자체 wet-paper 기능만으로 원본 코드 포함을 단정하지 않음 |
| 폰트·구매 자산·생성 이미지 | tracked asset inventory | **개별 검토 미완료** | `docs/asset-provenance/ui-fonts-2026-11-03`, itch review/owner decision 등 기존 자료 존재 | 자산별 상이. 구매·소유자 진술만으로 원저작권자의 grant를 대체하지 않음 |
| Tarot 이미지 | `apps/web/public/images/tarot/provenance.json`의 25개 파일 | **생성 도구·계정 미기록 출처 공백** | consumer는 `domains/fortune/tarot-art.ts`, provenanceStatus는 first-party-generated-tool-unrecorded | 높음(공백 존재). 생성 도구 조건 확인 또는 독립 제작 자산의 화면 동등성 검증 후 교체 |

일반 MIT/ISC/BSD/Apache/CC0는 상용 이용이 가능하더라도 각 고지·NOTICE·특허 조건을 지켜야 한다.
MIT로 확인된 spectral.js 3.0.0, colormix 3.2.0 및 openskp 1.3.0을 이름 유사성만으로 제한 라이브러리로
분류하지 않았다. openskp는 설치 메타데이터의 정확한 upstream을 사용해야 한다.
폰트는 실제 `apps/web/public/fonts/{pretendard/v1.3.9,nanum-myeongjo/v31,space-grotesk/v22}/OFL.txt`
가 존재한다. 얕은 검색에서 보이지 않는다는 이유로 무라이선스로 분류하지 않았다.
나머지 로컬 모델 TEED·U2Netp·Real-ESRGAN은 각 LICENSE.md와 공개 upstream README를 조회했으나,
이번 검사에서 코드 외 정확한 checkpoint와 데이터 권리까지 최종 확인한 것으로 보지 않는다.
서버 inference profile은 exact lock이 아닌 범위 요구사항을 포함하므로 Python의 전체 transitive
runtime/image inventory와 외부 SDXL/ControlNet/Wan/TripoSR weight revision은 별도 미완료다.

## 원문·무결성 증거

증거 디렉터리: `docs/evidence/commercial-audit-2026-11-05/`.

- `production-npm-inventory.json`: 설치 production graph 596행, Mixbox 제외.
  패키지 이름·정확한 버전·license expression·설치 경로·upstream을 기록한다.
  버전 합산 그룹이므로 행 수는 단일 버전 패키지 수와 다르다. dev-only 전체 감사는 아니다.
- `lock-inventory.json`: 20개 importer와 1,820개 package resolution 및 snapshot graph.
  lockfile의 메타데이터 증거이며 모든 노드의 라이선스·배포 검토 완료를 뜻하지 않는다.
  원본 graph 보존을 위해 Mixbox의 기존 resolution도 읽기 증거에는 남아 있으나 수정하지 않았다.
- `tracked-assets.json`: tracked binary/image/font/model/archive 등 9,201개 경로·크기.
  모든 행을 `not-individually-reviewed`로 표시한다. 실제 bundle 포함 목록과는 다르다.
- `suspect-references.json`: 의심 항목과 외부 리소스 문자열이 있는 source/test/config의 2,097개
  경로·행 위치. 테스트·문서 예제도 포함되며 실제 call site와 동일하지 않다. 텍스트는 fixture의
  credential 모양 문자열을 포함하지 않도록 저장하지 않는다. 동적 URL 조합의 완전 목록은 아니다.
- 원본 README, 설치 Remotion license, wasm-vips 내장 고지·버전표를 사본으로 보존했다.
  `evidence-sha256.json`은 이 증거 파일들의 해시다. 변경 가능한 upstream URL의 2026-11-05 조회
  사본이며 upstream immutable commit provenance까지 확보한 것으로 주장하지 않는다.

권리 원문:

- Tag2Pix: <https://github.com/blandocs/Tag2Pix#license>
- AnimeGANv2: <https://github.com/TachibanaYoshino/AnimeGANv2#license>
- PyTorch 변환: <https://github.com/bryandlee/animegan2-pytorch#weight-conversion-from-the-original-repo-tensorflow>
- 별도 얼굴 모델: <https://github.com/bryandlee/animegan2-pytorch#additional-model-weights>
- Remotion: <https://www.remotion.dev/docs/license>, 정확한 설치 license 사본이 현재 버전의 판정 근거.
- wasm-vips: <https://github.com/kleisauke/wasm-vips/blob/v0.0.19/THIRD-PARTY-NOTICES.md>

로컬 모델 SHA-256을 실제 파일에서 재계산해 기존 기록과 일치함을 확인했다:

| 자산 | SHA-256 |
| --- | --- |
| Tag2Pix | `ae01698835b99a009533ebbcf840d416a32bee0c0f4c9be060c21ab2084491cc` |
| Paprika | `7cb5bf08d7778a8f4e25f1e654fdc24d56dc9b6cbb9c1db42e4f9d0425e7fe62` |
| Face Paint v2 | `54ce55c73dc974c24fa55cf1204577a6181c7e86d312a3a07f798bbbd99d4ee2` |

## 기능 계약과 교체 차단 사항

### Tag2Pix / AnimeGAN

현재 진입은 `ai/StudioOnnxAnimeStylePanel.tsx`, `studio-onnx-animegan.ts`,
`studio-onnx-tag2pix.ts`, 공통 로더 `studio-onnx-runtime-assets.ts`다.
모델 자산은 `?url` dynamic import로 제품 배포에 들어갈 수 있다. 원격 모델이라는 이유로
해결되는 상황이 아니다. 추가 참조 위치는 evidence reference index를 사용한다.

- Tag2Pix: `line` float32 `[1,1,512,512]` 0..1, `tags` `[1,115]` 다중핫,
  `color` `[1,3,512,512]` -1..1. 115개 태그 어휘, 원본 해상도 선화 합성, offline/BYOK 실패 fallback
  사용을 유지해야 한다. 태그 무시 또는 단순 색 필터로 대체하면 동등하지 않다.
- AnimeGAN: `image` float32 `[1,3,512,512]` -1..1 → `anime` 동일 shape.
  Paprika 풍경·컷 변환과 Face Paint 인물 변환은 별도 기능이다.
- 기존 테스트는 descriptor/hash/입출력/실패·fallback 계약 증거다. 신경망의 이미지 품질 동등성이나
  학습 데이터 권리를 보증하지 않는다. 권리 확인된 데이터, 독립 학습 파이프라인·weights,
  스타일/태그 품질 회귀 corpus 및 실제 WASM/WebGPU 검증이 없는 상태에서 대체 완료를 주장할 수 없다.
- 따라서 이번 변경은 잘못된 상용 가능 고지·Tag2Pix 코드 주석을 정정하고 가중치·기능은 보존한다.
  제한이 해소된 것은 아니며 이 상태의 상용 배포가 승인된 것도 아니다.

### Remotion

실제 import: `ProductTourPlayer.tsx`, `ProductTourRemotionComposition.tsx`,
`product-tour-remotion-timeline.ts`, `packages/product-tour-film/src/ProductTourFilm.tsx`,
`tools/media/brand-film/src/`의 film 및 root. `creator/promo/promo-remotion.ts`는 Remotion을
사용하는 프로젝트 ZIP의 package/source를 생성한다. 기존 MP4 fallback만 남기면 전체 동등 대체가 아니다.

사용 계약은 frame clock/config, AbsoluteFill/Img/Html5Audio, interpolate/spring,
Sequence, Composition/registerRoot/staticFile 및 render 지연/재개다. Player는 재생·정지·seek,
음량·mute·fullscreen, waiting/resume/timeupdate/ended/error 이벤트, 버퍼 상태, 챕터·자막·두 오디오
트랙과 음량 ducking, 접근성 및 오류 시 MP4 전환을 사용한다.
독립 frame context·media scheduler·Player·오프라인 renderer·생성 ZIP 형식까지 검증한 다음 제거해야 한다.
이 전체 replacement는 이번 감사에서 구현·검증되지 않았다. 현재 법인의 무료 자격/계약도 미확인이다.

### wasm-vips / OCCT

wasm-vips의 `studio-vips-export.ts`는 factory, concurrency, Image.newFromMemory,
resize(hscale, vscale), writeToMemory, delete를 사용한다. 사용 기능은 downscale와 피라미드,
홀수 크기·alpha·결정적 결과·자원 해제다. 기존 실 WASM 테스트가 품질 수치를 포함한다.
독립 Lanczos3 구현만으로 임의 libvips resize와 픽셀 동등성을 가정하면 안 된다.
OCCT의 CAD 입출력·기하 연산을 단순 mesh placeholder로 대체해서도 안 된다.
두 계층 모두 현 기능을 유지하며, LGPL 의무 이행 검토 또는 동등 대체 검증이 남아 있다.

## 적용한 수정

`findRootLicenseFiles`를 독립 모듈로 추출하고 `THIRD-PARTY-NOTICES.md`,
`Third_Party_Licenses.txt` 형태를 수집하도록 확장했다. 기존 root LICENSE/COPYING/NOTICE,
정렬·일반 파일·2 MB 제한은 유지한다. 실제 wasm-vips 상류 고지가 생성 산출물에 포함되는 것을
확인했다. 이는 내장 목록 누락 수정이며 LGPL source/relink 의무의 완결 해결은 아니다.
회귀 테스트는 MIT 래퍼와 내장 고지 동시 수집, README/비고지 제외, 디렉터리·대형 파일 제외,
존재하지 않는 경로를 확인한다. 문제 라이브러리 제거는 **0개**다.

## 검증

상세 실행 결과는 후속 검증 기록 절을 따른다. 독립 replacement가 없으므로 replacement parity,
전체 runtime E2E, 모든 asset provenance 완료 판정은 실행하지 않았다.
고지 생성기의 통과는 이 보고서의 model weight 제한·권리 미확인을 해소하지 않는다.

### 실행 결과 체크포인트

명령은 저장소 루트에서 실행했다. pnpm 명령은
`npm_config_manage_package_manager_versions=false PNPM_HOME=/tmp/toonstudio-pnpm XDG_DATA_HOME=/tmp/toonstudio-xdg`
환경을 사용했다. 초기 기본 홈 경로 오류 및 존재하지 않는 `--manage-package-manager-versions=false`
옵션 사용 실패는 환경 설정 후 해소했다. 자동 승인 거부는 없었다.

| 결과 | 명령 / 근거 |
| --- | --- |
| 통과 | `node scripts/agent-harness.mjs doctor`, `node scripts/agent-harness.mjs check` (초기 hooks 미설정 경고, 설치 후 prepare 실행) |
| 통과 | `node --test scripts/third-party-license-files.test.mjs` — 1개. 초기 테스트의 Array.map basename callback 인자 오류는 수정 후 재검증 |
| 통과 | `node node_modules/vitest/vitest.mjs run scripts/__tests__/generate-third-party-notices.test.mjs apps/web/src/domains/creator/studio-onnx-animegan.test.ts apps/web/src/domains/creator/export/studio-vips-export.test.ts` — 54개 |
| 통과 | `node node_modules/vitest/vitest.mjs run apps/web/src/domains/creator/studio-onnx-tag2pix.test.ts apps/web/src/domains/marketing/ProductTourPage.test.tsx` — 35개 |
| 통과 | `pnpm audit:licenses` — 598 pnpm 행, Vello CPU/GPU 86/142 crates, opaque WASM inventory 3개, license text 448개, root license file 누락 51개 보고 |
| 통과 | `pnpm audit:security` — known vulnerability 없음 |
| 통과 | `node scripts/generate-third-party-notices.mjs --output /tmp/toonstudio-third-party-notices.md` — 실제 생성물에 wasm-vips 내장 glib/libvips LGPLv3 고지 포함 확인 |
| 실패 후 수정 | `pnpm harness:verify` — checkout에 origin/main이 없어 bad revision. `--base=HEAD`로 실행 범위를 지정 |
| 실패 후 수정 | 첫 `pnpm harness:verify --base=HEAD` — reference index가 fixture의 BasicAuth 모양 문자열을 포함. raw text를 제거하고 경로·행 번호만 보존. 실 secret 노출로 확인한 것은 아님 |
| 일부 통과 / 실패 | 재실행 `pnpm harness:verify --base=HEAD` — 하네스 6 tests, lock importer, 변경 lint·Secretlint, architecture/source-size/eager graph 통과. 이후 typecheck에서 Killed, exit 137. API typecheck까지 완료되지 않음 |
| 실패 | `pnpm build` — TypeScript 단계에서 `Killed`, exit 137. bundle 단계 도달 못함. 메모리 부족 가능성이 있으나 로그만으로 원인을 확정하지 않음 |
| 통과 | `pnpm build:bundle` — Vite 15,517개 모듈 변환, postbuild 고지 생성 및 CSP 확인 완료. 마지막 AnimeGAN 주석 정정 직전 빌드이며 그 후 런타임 코드 변경은 없음 |
| 통과 | `node scripts/check-studio-bundle.mjs` — Studio 448 chunks, 8,369.9 KiB raw / 2,740.1 KiB gzip. 비차단 관찰 15건. 저장된 runtime 측정은 35일 전이므로 현재 runtime 보증으로 사용하지 않음 |
| 통과 | 변경 JS/TS 5개 ESLint, 변경 텍스트 Secretlint, `git diff --check`, 최종 `node scripts/agent-harness.mjs check` |
| 미실행 | 실제 브라우저 runtime E2E·WebGPU 모델 추론·전체 API typecheck·Python inference transitive image 검사·모든 자산의 권리 검토 |

이 체크포인트는 커밋되지 않은 로컬 변경이다. 원본 가중치를 학습/증류 입력으로 사용해
권리 제한을 우회하는 replacement를 만들지 않았다. 모든 실제 call site의 실행 coverage,
학습·스타일 품질 equivalence, 전체 모델/폰트/미디어 provenance와 bundle/runtime 잔재 판정은 남아 있다.

최종 정적 산출물 확인: `bundle-model-residues.json`에 Tag2Pix·Paprika·Face Paint의 출력 경로,
크기·SHA-256을 기록했다. 세 파일 모두 기존 source weight와 해시가 같다.
**제한·미확인 모델이 여전히 제품 번들에 포함된다.** 별도 상용 배포를 진행하지 않았다.
`dist/legal/THIRD_PARTY_NOTICES.generated.md`에는 수정 후 wasm-vips 내부 LGPL 고지가 실제 포함된다.
라이브러리를 제거하지 않았으므로 잔재 없음이라는 결론은 내리지 않는다.
커밋·PR·push·merge·배포는 모두 미수행이며 HEAD는 시작 SHA 그대로다.

## 후속 구현과 통합 검증

### 제거 완료: wasm-vips 0.0.19

기존 사용면과 회귀 검증을 먼저 확보하고, 독립 구현이 통과한 뒤 `pnpm remove wasm-vips --lockfile-only`,
`pnpm install --frozen-lockfile` 순으로 제거했다. pnpm이 override 값을 root Vite specifier에 자동으로
옮긴 부수 변경은 원래 `^8.3.4`로 복구했다. 최종 lockfile diff는 wasm-vips importer/package/snapshot
9줄 제거뿐이다. `import.meta.resolve('wasm-vips')`는 ERR_MODULE_NOT_FOUND로 실패한다.
Mixbox 이름을 포함한 tracked 파일 11개의 바이트와 직접 의존성 버전이 그대로임을 별도 확인했다.

- 제품: `studio-native-lanczos.ts`의 독립 box prefilter + windowed sinc, premultiplied alpha 구현.
  `studio-native-resize-runtime.ts`가 기존 RGBA facade 계약을 제공한다. 기존 공개 함수·타입·오류 클래스,
  저장된 provider ID/route는 호환성을 위해 남긴다. 이름의 `vips`는 외부 라이브러리 실행을 뜻하지 않는다.
- 실제 기능: 정확한 크기의 축소, 홀수 크기·1차원 이미지, 독립 사본, 원본 보존, 피라미드·상한·실패 전파.
  전체 libvips의 format/codec/colour-management 기능을 구현했다고 주장하지 않는다.
- 벤치마크에만 있던 Gaussian도 독립 수식 구현으로 이전했다. 기존 측정 JSON은 보존하고 새 native 결과를
  별도 파일에 저장했다. 제품 candidate descriptor의 미구현 Gaussian·thumbnail 표기는 제거했다.
- 검토 중 발견한 비등방 축소의 큰 행 캐시는 제거했다. 수평 캐시는 최대 32MiB이고 세로 support는
  한 출력 행에 누적한다. 이 수치는 전체 메모리 상한이 아니다. 입력·출력·prefilter·계수·현재 행은 별도다.
- 기존 품질 하한 PSNR 26.5dB / SSIM 0.985는 낮추지 않았다. 최종 2048→512 측정은 27.26dB / 0.9887,
  resize p50 69.344ms / p95 135.979ms다. 과거 WASM p50 16.4ms보다 느리며 동일 환경 동시 비교는 아니다.
  실제 대형 경로 2048×16384→690×5520은 1173.33ms, 28.75dB / 0.9908이고 직접 kernel과 preset 경로의
  출력 해시가 일치한다. Gaussian 2048²는 p50 1106.588ms / p95 5285.787ms로 변동이 크다.
- user-facing 내보내기·라이선스 UI와 기술 문서를 실제 native 경로에 맞췄다. 과거 WASM 측정은 역사적
  근거로 표시했다. 이미 수정한 고지 수집기는 다른 패키지의 내장 고지에도 적용되므로 유지한다.

상세: `native-lanczos-replacement-2026-11-05.md`, `native-filter-bench-2026-11-05.md` 및
`docs/evidence/native-filters-2026-11-05/`. 독립 검토에서 48개 seeded RGBA 사례 3,072바이트를
별도 직접 2D sinc 수식과 비교해 최대 차이 0 LSB를 확인했다. 메모리 수정 후 별도 비등방 사례도 확인했다.

### 일부 실제 소비자 전환: Remotion 영상 수학

독립 `filmInterpolate`와 감쇠 조화 진동자 기반 `filmEntranceSpring`을 구현하고 웹 BGM timeline,
공유 ProductTourFilm, 브랜드·기술 영상의 실제 수학 import를 전환했다.
558초 전체 16,741 frame의 gain·한영 자막과 실제 spring 설정 3종의 각 301 frame 출력 digest를 보존했다.
비교는 9자리 소수 기준이며 모든 Float64 비트 또는 영상 픽셀 동일성의 주장은 아니다.
Player·context·image/audio readiness·offline CLI·생성 promo ZIP은 여전히 Remotion이 필요하다.
별도 brand-film 도구는 4.0.514이며 웹의 4.0.536과 별도 inventory다.
전체 Remotion 제거·기업 라이선스 조건 해소는 미완료다. 상세는
`remotion-independent-animation-2026-11-05.md`를 따른다.

### 모델 대체 조사와 명시적 차단 사항

`commercial-model-replacement-candidates-2026-11-05.md`와 pinned metadata·license·README 증거를 추가했다.
Cobra, PaintsTensorFlow, CartoonGAN light checkpoint 등을 검토했지만 정확한 weight grant·학습 자료·
115개 semantic tag·브라우저 offline·스타일 품질 계약을 모두 충족한 후보는 아직 없다.
MangaNinja 등 공식 비상업 조건 후보는 제외했다. 기존 제한 가중치로 학습·추출·증류하지 않았다.
따라서 Tag2Pix/Paprika/Face Paint의 동작·자산은 보존한다. 라이선스 UI도 제한/미확인으로 정정했다.

`pnpm audit:restricted-models`를 추가했다. 배포 디렉터리의 ONNX 바이트 해시로 알려진 세 모델을 찾아
제한·미확인 상태를 구별하고 exit 1로 보고한다. 파일 이름을 바꿔도 감지한다. 이 검사는 전체 권리
감사나 자동 release workflow 연결을 뜻하지 않으며, 다른 모델의 권리를 보증하지 않는다.
현재 배포물의 검사 실패는 해결되지 않은 권리 문제를 올바르게 보고하는 **예상 결과**다.

### 메모리 한계와 안전한 검증 경로

cgroup memory.max는 17,179,869,184 bytes(16GiB), 기존 oom_kill 기록은 2다. 최초 병렬 build/typecheck의
exit 137은 이 상황과 부합하지만 PID별 kernel log는 확보하지 않았다. 이후 다른 무거운 작업 없이
11GiB V8 heap으로 전체 tsc를 순차 실행했지만 약 11,220MiB live heap에서 V8 OOM, exit 134가 발생했다.
웹 TS/TSX 파일만 16,674개이며, 전체 타입 검사가 통과했다고 보고하지 않는다.

안전한 검증은 원래 strict 옵션을 상속한 변경 파일·ambient 선언의 focused program과 별도 benchmark
program으로 나눴다. 테스트의 Node API 타입은 명시적으로 node를 포함했다. 체크한 정확한 목록과
compiler 설정은 `focused-typecheck-config.json`, `focused-benchmark-typecheck-config.json`에 보존했다.
이는 전체 프로그램 검증을 대신하는 완전 보증이 아니다. 전체 tsc에는 더 큰 환경 또는 별도 승인된
프로젝트 분할 검증이 필요하다. 빌드는 typecheck와 분리해 한 번에 하나만 실행한다.

### 최종 검증 기록

| 결과 | 검증 |
| --- | --- |
| 통과 | 6GiB heap의 focused strict tsc: 변경 앱·도구·패키지 TS/TSX 및 ambient 선언 |
| 통과 | 별도 focused strict tsc: 변경 benchmark 5파일 및 그 의존성 |
| 통과 / 기존 실패 1개 | 통합 Vitest 16 suites: **230개 통과, 기존 LT 문서 대조 1개 실패**. 정확한 목록은 `focused-test-files.json` |
| 통과 | Node 고지·모델 해시 검사 회귀 2개 |
| 통과 | 제거 후 audit:licenses: 597 pnpm 행, Vello 86/142 crates, opaque WASM 3종, license text 446개 |
| 통과 | 제거 후 audit:security: 알려진 취약점 없음 |
| 통과 | Chromium 156 실제 source export 경로: odd resize, 원본·상수 RGBA·독립 사본, 반복 바이트·피라미드·확대 거부; 외부 vips WASM 요청 없음 |
| 통과 | frozen install, lock importer 검사, 변경 lint·Secretlint, diff 검사, 하네스 구조 검사 |
| 통과 | 최종 native 전환 후 `pnpm build:bundle`: 15,519 modules, postbuild 고지·CSP 완료 |
| 통과 | 최종 `check-studio-bundle`: Studio 448 chunks, 8370.0KiB raw / 2740.1KiB gzip. 이전 startup 관찰은 오래된 측정이므로 현 runtime 보증에 사용하지 않음 |
| 통과 | 배포 manifest의 외부 wasm-vips 경로 0개, 제거한 WASM 4개 해시와 일치하는 출력 0개. 다른 필요한 WASM은 정상 보존 |
| 통과 | 전체 `pnpm validate:architecture`: 문서·layout·app boundary·source size·eager graph 포함 |
| 예상 실패 | 최종 restricted-models 검사 exit 1: Tag2Pix/Paprika/Face Paint 3개가 여전히 배포에 포함됨. 해결 완료 또는 상용 출시 승인으로 간주하지 않음 |

LT 실패는 `engineering-seminar-prep.test.ts`가 옛 4-role literal을 요구하지만 원본 LT planner는 이미
shadow/depth를 포함한 6-role 상태이기 때문이다. source와 test 모두 HEAD와 바이트 동일함을
`known-baseline-test-failure.json`에 확인했다. 테스트를 삭제·skip하거나 기대치를 낮추지 않았다.
별도로 dependency guide의 잘못된 override 개수는 실제 61로 정정해 기존 수치 검증 9개를 통과했다.
Chromium 검사는 격리된 source 내보내기 경로이며 전체 Studio 사용자 E2E나 모델 GPU 추론은 아니다.
브라우저는 고정된 Playwright의 공식 headless shell을 `/tmp`에 받아 개발 검증에만 사용했고 배포하지 않는다.

시작 시 main은 HEAD와 같았으나 최종 read-only fetch에서
`2c626df4000fcfc32318faa793a61bea3ef0901b`로 전진했다. 기술 문서 6개가 겹치며 실제 3방향 충돌은
다음 3개 파일의 4구간이다:

- `engineering-atlas-open-data-oss.ts`
- `engineering-library-guide-areas-b-build.ts`
- `engineering-map-open-source-rows-more.ts`

원격의 정확한 개수·대표 fork·openskp/minimatch·LT 설명 수정과 이번 native/권리 고지를 함께 보존한
미리보기를 `/tmp/toonstudio-main-resolution/`에 만들었다. 작업 트리·HEAD·실제 index는 바꾸지 않았다.
검토용 `latest-main-tracked-integration.patch`는 정확한 위 main의 임시 index에 대해
`git apply --check --cached` exit 0이다. 이는 tracked 38개 변경만 담으므로 새 구현·테스트·증거 파일은
현재 checkout의 untracked 파일을 함께 포함해야 한다. 이 후보의 실제 merge와 최신 main 전체에 대한
재빌드·테스트는 수행하지 않았다. 충돌 판정·선택 근거·적용성은 evidence의 `latest-main-*` 파일에 보존했다.
Mixbox 문구를 임의로 바꾸지 않았다. commit·merge·push·PR·배포는 모두 미수행이다.
