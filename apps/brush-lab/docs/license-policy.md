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
4. SPDX 해석기와 탐지기가 표본으로 위반을 잡는가(자체 검증).

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

원장의 단일 출처는 `src/license-policy.test.ts`의 `BINARY_COMPONENTS`다. 표는 사람이 읽기 위한 사본이므로 둘이 어긋나면 테스트 쪽이 맞다.
