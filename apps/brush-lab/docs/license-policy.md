# brush-lab 상용 이용 가능 라이선스 정책

brush-lab은 실험 랩이지만 **여기서 검증한 설계가 그대로 상용 제품으로 옮겨 갈 수 있어야** 한다. 그래서 어떤 라이브러리·알고리즘·에셋도
상용 배포가 가능하다는 근거가 없으면 들이지 않는다. 이 문서는 그 규칙과 집행 방법이다(법률 자문이 아니라 엔지니어링 게이트이며,
`review` 판정은 법무 검토 전 채택하지 않는다).

관련 문서: [ADR-0008 라이선스 격리 정책](../../../docs/adr/0008-license-isolation-policy.md) ·
[브러시 레퍼런스 라이선스 원장](../../../docs/engines/labs-brush-engine-references-2026-10-01.md).

## 1. 판정 기준

| 판정 | 라이선스 | 의미 |
| --- | --- | --- |
| `ok` (채택 가능) | MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Zlib, CC0-1.0, Unlicense, BSL-1.0 | 고지(Apache-2.0은 NOTICE 유지·특허 허여 포함)만 지키면 상용 배포 가능 |
| `review` (법무 검토 전 채택 금지) | MPL-2.0, LGPL 계열, 비표준 표기("Apache 2.0", "BSD"), `SEE LICENSE IN …`, 필드 없음, 바이너리 약관이 래퍼와 다른 경우 | 의무(소스 제공·교체 가능성·특허 조항)가 불명확하거나 파일 단위 카피레프트 |
| `reject` (거부) | GPL, AGPL, SSPL, BUSL, CC-BY-NC, CC-BY-SA, PolyForm(비상업), Prosperity, Commons Clause, Elastic, UNLICENSED | 상용 배포 불가 또는 전염성 |

SPDX 식은 `A OR B`이면 가장 나은 쪽, `A AND B`이면 가장 나쁜 쪽으로 판정한다(예: `MIT OR GPL-3.0-only` → `ok`,
`MIT AND GPL-3.0-only` → `reject`).

### 이름으로 막는 패키지

라이선스 필드가 허용형이어도 막는 것들(`license-policy.test.ts`의 `BANNED_PACKAGES`):
`mixbox`(CC BY-NC), `lygia`(Prosperity), `canvaskit-wasm`(원장 "개념만"), `@babylonjs/havok`(바이너리 약관 별도),
`p5`(LGPL-2.1), `taichi.js`·`ammo.js`(라이선스 필드 없음). 참고 코드는 **개념·수식만** 쓰고 코드·셰이더·에셋은 들이지 않는다.

## 2. 자동 집행

`src/license-policy.test.ts`가 `pnpm --filter @toonstudio/brush-lab test`와 루트 vitest에서 다음을 검사한다.

1. 프로덕션 의존 폐포(workspace 패키지를 따라 들어가는 전이 의존 포함)의 모든 외부 패키지가 `ok`인가.
2. 금지 패키지 이름이 폐포에 없는가.
3. 저장소의 모든 `.wasm`(brush-lab·studio-brush-platform·studio-hokusai-wasm)이 `BINARY_COMPONENTS` 원장에 출처·라이선스와 함께 올라 있고 원장 파일이 실제로 있는가.
4. 프로덕션 폐포 패키지가 **wasm 을 JS 등에 내장**했는가(`EMBEDDED_WASM` 원장, 5절)와 그 안의 Rust crate 부분집합·고지 문서.
5. SPDX 해석기와 탐지기가 표본으로 위반을 잡는가(자체 검증).

**내장 wasm 탐지기의 범위와 한계** (`containsInlineWasm`, 2026-10-08). 외부 패키지 파일(소스맵·문서·이미지·글꼴 같은 비실행 확장자 제외, 비코드 확장자 `.json`·`.bin`·`.node`·확장자 없음 포함, 파일당 16 MB 상한 — 넘으면 건너뛰지 않고 실패)에서 wasm 매직(`\0asm` + 버전 1)을 찾는다.
- 잡는 표기: base64·base64url(3바이트 정렬 오프셋 0/1/2 — wasm 앞에 다른 바이트가 붙어도), 데이터 URL, 숫자 배열(10/16/2/8진 혼합 포함), 16진 문자열, `\0asm\x01\0\0\0` 같은 문자열 이스케이프, 원시 바이트.
- **못 잡는 표기(한계, 수동 검토 항목)**: gzip·brotli·zlib 으로 압축한 뒤 인코딩한 wasm, 암호화·XOR 등 난독화, 여러 조각으로 쪼갰다가 런타임에 이어 붙이는 방식(매직 중간에서 줄이 나뉜 base64 포함), 런타임에 네트워크에서 내려받는 wasm. 이 경로로 들어온 wasm 은 이 게이트가 알지 못하므로 새 의존을 들일 때 3절 2항(전이 의존과 바이너리 출처 확인)을 사람이 지켜야 한다.
- 비용: 폐포 10개 패키지(workspace 포함) 약 1,100개 파일을 훑는 데 Node 22 단일 스레드에서 약 160~510 ms(3회 측정 157·185·508 ms, 첫 회는 파일 캐시가 차가운 값)이며 브라우저와 무관한 테스트 시간이다.

새 의존성을 `package.json`에 추가하면 이 테스트가 곧바로 판정한다. `review`가 나오면 LICENSE 원문을 직접 읽고 검토한 뒤
`REVIEWED`에 `이름@버전`과 사유를 올리거나, 채택을 포기한다.

## 3. 새 라이브러리를 들이는 절차

1. **샌드박스 스파이크**: 저장소 밖에서 `npm install --ignore-scripts`로 설치해 동작·결정성·비용을 측정한다(설치 스크립트 실행 금지).
2. **라이선스 원문 확인**: 설치된 패키지의 LICENSE 파일과 package.json을 읽는다. 전이 의존과 wasm·바이너리의 출처(원 소스 저장소)도 확인한다. README의 홍보 문구는 근거가 아니다.
3. **채택 결정**: 정식 레인 / 입력 단계 / 엔진 모듈 / 실험 전용 / 거부 중 하나로 기록한다. 외부 패키지는 `engine/**`에 두지 않는다(엔진은 외부 의존 0) — `lanes/**`의 어댑터에서만 import한다.
4. **의존 추가(리드)**: `pnpm add`는 리드만 한다. 무거운 라이브러리는 동적 import(`init()` 시점)로 분리해 기본 번들에 넣지 않는다.
5. **원장 갱신**: 레퍼런스 원장에 행을 추가하고, 바이너리는 `BINARY_COMPONENTS`에, Apache-2.0 NOTICE가 있으면 NOTICE 모음에 올린다.
6. **실험 표시**: 검증이 덜 된 레인은 레지스트리에서 `experimental`로 표시하고 인증 판정(PASS/FAIL)에서 제외한다.

## 4. 알고리즘·에셋 규칙

- 공개 논문·교과서 알고리즘은 쓸 수 있지만 **상용 소프트웨어의 코드·셰이더·프리셋·브러시 에셋(.abr/.brush/.sut 등)은 복제하지 않는다**.
  문서 문구도 복제하지 않고 파라미터 의미만 참고한다.
- 브러시 설정 데이터는 CC0(`mypaint-brushes`의 `.myb`)만 입력으로 쓴다. 미리보기 이미지(`_prev.png`)는 쓰지 않는다.
- 블루노이즈·종이 그레인·팁은 빌드 스크립트로 직접 생성한다(외부 텍스처 에셋 금지).
- 특허: Apache-2.0은 특허 허여 조항이 있어 유리하지만, 알고리즘 특허 자체는 어떤 라이선스로도 해소되지 않는다.
  특허 우려가 알려진 기법(예: 특정 필기 안정화·예측 방식의 상용 특허)은 실험 레인에서만 다루고, 상용 승격 전에 법무 검토 항목으로 올린다.

## 5. 바이너리 구성요소 원장 (현재)

| 파일 | 출처 | 라이선스 |
| --- | --- | --- |
| `apps/brush-lab/wasm/sumi-kernel/pkg/sumi_kernel.wasm` | Sumi 래스터 커널(자체 Rust 크레이트, CI가 재현 빌드를 검증) | 자체 |
| `packages/studio-brush-platform/src/ink-mesh/ink_mesh.wasm` | ink-mesh(자체 Rust 크레이트) | 자체 |
| `packages/studio-brush-platform/src/libmypaint/mypaint-wasm.wasm` | libmypaint v1.6.1 | ISC |
| `packages/studio-brush-platform/src/ink-modeler/ink_stroke_modeler.wasm` | google/ink-stroke-modeler | Apache-2.0 (NOTICE 유지) |
| `packages/studio-hokusai-wasm/pkg/studio_hokusai_wasm_bg.wasm` | Hokusai 0.3.0 | Apache-2.0 OR MIT |
| `@dimforge/rapier2d-compat@0.21.0`의 `dist/rapier.mjs`·`dist/rapier.cjs`(wasm 2,404,467 B를 base64로 **JS에 내장**, sha256 `322b0064…7435`)와 같은 바이트의 `dist/rapier_wasm2d_bg.wasm` | Rapier 2D(dimforge/rapier) 바인딩 — `bristle-rapier` 실험 레인이 `init()`에서 동적 import. 내장 Rust crate는 **경로로 식별한 부분집합 15항목**(wasm 경로 문자열 `registry/src`·`/rust/deps`로 13종 직접 확인 + 빌드 도구·본체 2종)이며 **전체 의존 목록이 아니다**. nalgebra·parry2d 의 Cargo.toml 선언 필수 의존 14종은 "선언 기준·wasm 에서 미확인"으로 고지 문서 4.1절에 별도 기재했다. 라이선스는 모두 crates.io 원격 조회 | Apache-2.0 (식별한 crate: nalgebra·parry2d Apache-2.0, 나머지 MIT OR Apache-2.0. 선언 기준 의존: Apache-2.0 / MIT OR Apache-2.0 / MIT / Zlib). 고지: [rapier2d-third-party.md](notices/rapier2d-third-party.md) |
| `apps/brush-lab/src/engine/wasm/kernel-embedded.ts`(위 Sumi 커널 `.wasm`의 base64 사본, 33,946 B) | 자체 Rust 크레이트(`wasm/sumi-kernel/build.sh`가 생성, `pkg/sumi_kernel.wasm`과 바이트 동일). 표준 라이브러리 할당기 `dlmalloc` 0.2.13(MIT OR Apache-2.0)을 품는다(`/rust/deps/` 경로로 식별) | 자체 + dlmalloc MIT OR Apache-2.0. 고지: [sumi-kernel-third-party.md](notices/sumi-kernel-third-party.md) |

원장의 단일 출처는 `src/license-policy.test.ts`의 `BINARY_COMPONENTS`다. 표는 사람이 읽기 위한 사본이므로 둘이 어긋나면 테스트 쪽이 맞다.

**번들 내장 wasm(`EMBEDDED_WASM`)**: 패키지가 wasm 을 JS 에 base64 로 내장하면 위 `.wasm` 파일 검사에 걸리지 않고 npm 라이선스 필드는 래퍼의 것일 뿐이다.
그래서 테스트는 프로덕션 폐포의 패키지 파일에서 wasm 매직(2절의 표기들 — base64 오프셋 3종·바이트 배열·16진 문자열·이스케이프·원시 바이트)과 독립 `.wasm`(외부 패키지)을 찾고, 찾은 패키지·파일이 `EMBEDDED_WASM` 원장과 정확히 일치하지 않으면 실패한다
(테스트 파일은 탐색에서 제외, 압축·난독화한 wasm 은 못 찾는다 — 2절 한계). 원장 항목은 설치 버전·래퍼 라이선스·내장 wasm 의 바이트 수와 sha256·wasm 안 경로(`registry/src/…/이름-버전/`·`/rust/deps/이름-버전/`)로 **식별한 Rust crate 부분집합**·증거 문자열·고지 문서를 함께 고정한다.
이 crate 집합은 링크된 crate 전체가 아니다. 경로 문자열을 남기지 않는 의존(Cargo.toml 선언은 있으나 wasm 에서 확인하지 못한 것)은 `declaredUnconfirmed`(선언 기준·wasm 에서 미확인)로 라이선스와 함께 따로 올린다.
탐색 비용은 2절 참고. 새 내장 wasm 이 생기면 크레이트 목록·라이선스를 확인해 `EMBEDDED_WASM`과 고지 문서에 올리고, 상용 승격 전에는 `cargo-about` 로 전체 의존 목록을 만든다.

## 6. 파생 데이터

외부 패키지를 들이지 않아도 **외부 데이터에서 파생한 표**는 라이선스 의무가 따라온다. 이 절은 그런 파생 데이터의 원장이다(2026-10-08 기준).

### 6.1 spectral.js 3.0.0 파생 표 (혼색 엔진)

| 항목 | 내용 |
| --- | --- |
| 원본 | spectral.js 3.0.0 — MIT, Copyright (c) 2025 Ronald van Wijnen. 저장소 루트 `package.json` 의존으로 설치돼 있고(`node_modules/.pnpm/spectral.js@3.0.0/node_modules/spectral.js`) **런타임에는 쓰지 않는다**(표 생성·테스트 기대값 산출 전용) |
| 파생물 | `src/engine/pigment/km-tables.ts` — 7기저 반사율 스펙트럼(흰·시안·마젠타·노랑·빨강·초록·파랑)을 8밴드·6밴드로 줄인 표와 반사율 → 선형 sRGB 복원 행렬. 소비 코드는 `src/engine/pigment/km-mix.ts` |
| 파생물 2 | `src/engine/pigment/km-mix.test.ts`의 `GOLDEN` 블록 — spectral.js 3.0.0이 낸 혼합 결과를 기대값 상수로 내장(런타임 의존 0) |
| 생성 방법 | `node apps/brush-lab/scripts/gen-km-tables.mjs <spectral.js 설치 경로>`. spectral.js 공개 API(`new Color([r,g,b]).R`, `mix`)로 기저를 읽고, 38밴드(380~750nm, 10nm 간격) 중 등간격 n개를 고른다. 복원 행렬은 시드 20261008 고정 LCG의 무작위 색쌍 400개를 spectral.js로 혼합한 결과에 최소제곱으로 적합한다 |
| 재현성 검증 | `node apps/brush-lab/scripts/gen-km-tables.mjs --check <spectral.js 설치 경로>` — 재생성 결과가 커밋된 `km-tables.ts`·`GOLDEN` 블록과 **바이트 동일**한지 확인한다(표를 손으로 고친 흔적이 있으면 실패). 생성기는 spectral.js 버전(3.0.0)·파일 sha256·`LICENSE` 원문이 고정값과 다르면 거부한다 |
| 고지 위치 | `km-tables.ts` 파일 상단 헤더에 MIT 라이선스 **전문과 저작권 고지**, 생성 스크립트, 원본 파일 sha256, 표 본문 sha256을 둔다. `km-mix.test.ts`가 헤더의 고지 문구·해시 일치·본문 sha256 고정을 검사한다. 이 표를 포함해 번들·재배포할 때는 이 고지를 유지한다(MIT에는 NOTICE 파일 의무는 없고 저작권·허가문 동봉 의무가 있다). 이 파일은 자동 생성물이라 직접 수정하지 않는다 |
| 판정 | `ok` (MIT). 단 아래 6.2의 데이터 출처 메모는 법무 확인 항목으로 남긴다 |

### 6.2 데이터 출처 메모 (법무 확인 항목)

spectral.js 3.0.0의 `README.md`(Acknowledgments)는 스펙트럼 데이터가 Scott Allen Burns의 LHTSS 방법(공개 논문·웹 게시)의 변형으로 만들어졌다고 적는다. 패키지는 MIT로 배포되지만 **수치 데이터의 원 방법 저자 쪽 권리 관계는 패키지에 명시돼 있지 않다.** [브러시 레퍼런스 라이선스 원장](../../../docs/engines/labs-brush-engine-references-2026-10-01.md)은 Burns의 MATLAB 코드를 "미확인 코드(수식만)"로 분류하므로 상용 승격 전에 법무가 이 점을 확인한다. 이 문서는 법률 자문이 아니다.

### 6.3 금지 패키지 데이터를 쓰지 않았다는 확인 방법

금지 패키지(`mixbox` CC BY-NC, `lygia` Prosperity)의 계수·LUT·코드가 표나 소스에 섞이지 않았음을 다음 세 가지로 확인했다. 어느 것도 "금지 패키지의 수치와 직접 대조"한 것이 **아니다**(금지 패키지는 설치하지 않으며 저장소에 들일 수 없다). 출처 추적과 정적 검사로 갈음한다.

1. **출처 단일화**: 표의 모든 수치는 생성기가 spectral.js 3.0.0 설치본에서만 읽은 값이다(생성기는 다른 파일·네트워크를 읽지 않는다). `--check`가 커밋된 표와 재생성 결과의 바이트 동일을 보장하므로 사람이 다른 곳의 수치를 끼워 넣을 수 없다.
2. **원본에 해당 데이터가 없음**: spectral.js 3.0.0 설치본(`spectral.js`, `spectral.min.js`, `package.json`, `LICENSE`)에서 `grep -ci mixbox`·`grep -ci lygia`가 모두 0이다. `README.md`에 `mixbox`가 1회 나오지만 영감을 받았다는 감사 문구(Acknowledgments)이며 데이터·코드를 가져왔다는 주장이 아니다. 금지 패키지류 LUT는 큰 인코딩 덩어리로 배포되는 것이 일반적인데, `spectral.js` 소스의 최대 줄 길이는 181자이고 1,000자를 넘는 줄은 0개다(`spectral.min.js`는 압축본이라 긴 줄이 있다).
3. **저장소 자동 검사**: `src/boundary.test.ts`가 `src/**` 소스(주석 제외)에서 금지 이름 문자열을 거부하고 `src/license-policy.test.ts`가 의존 폐포의 금지 패키지를 거부한다. `km-mix.ts`·`km-tables.ts`·`km-mix.test.ts`·`gen-km-tables.mjs`에는 금지 이름이 없다(`grep -niE "mixbox|lygia"` 0건).

이 절의 내용이 바뀌면(원본 버전 변경, 표 재생성, 새 파생 데이터 추가) 6.1의 원장을 갱신하고 `--check`를 다시 통과시킨다.
