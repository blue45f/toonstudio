# Vello CPU 0.4.0 기준선 개정 검증 — 2026-11-23

상태: **current — CPU corpus 검토 완료, Mac 텍스트와 실브라우저 검증은 별도 게이트**.

## 입력과 산출물

이 검토는 기존 main의 실제 커밋 WASM과 Linux에서 빌드한 새 WASM을 별도 Node 프로세스로
로드해 비교했다. 기존 WASM의 `adapterVersion()`은
`studio-engine-vello 0.1.0 (vello_cpu 0.3)`, 새 WASM은
`studio-engine-vello 0.1.0 (vello_cpu 0.4.0)`을 반환했다.

| 항목 | 고정 입력 |
| --- | --- |
| 대조군 main | `e4f07c147511293a347708119ae9a6af1fdcece2` |
| 진단 소스 | `9d8c84f7ffcdcfae69112d058d5c2ddbca1099e6` |
| 진단 소스 tree | `61b4c1e3e6fc0bb26af4ae66e1dfc062bca6ac36` |
| 기존 CPU WASM Git blob / 크기 | `5acd631cfee239a58d99eb70e06920afb2e58d70` / 4,850,716 B |
| 새 CPU WASM Git blob / 크기 | `1d68a44b8090cd7a99256d542c36091c25b0a873` / 4,679,769 B |
| 기존 CPU WASM SHA-256 | `a0cced9f3da8714c1e948b61900ab70d1a242fac4f7c8533067d1d412969e46d` |
| 새 CPU WASM SHA-256 | `8ccc427ced649f0a7d486183f973e20eb047d3b908044c7372a81c362be22782` |
| 원래 교차 비교 테스트 blob | `86126246284dd436c6e0581e4d11c62faeba0e11` |
| 진단 환경 | Linux, Node 24.22.3, pnpm 11.4.0, CanvasKit 0.42.0 |
| 새 바이너리 빌드 | [GitHub Actions 45206534520](https://github.com/blue45f/toonstudio/actions/runs/45206534520), Linux native job `137803666862` |
| 빌드 manifest | `786aa28d65b0da7b8ca0752b52b0354d4bbe3ce8` |

원래 교차 비교 테스트의 scene 생성, PNG decode, 대칭 3×3 fuzzy 비교와 수치 집계를 그대로
사용했다. 8개 JSON scene과 seed `0x7001`로 생성한 dense-lineart 1개를 대상으로,
각 WASM을 두 번 렌더하고 PNG encode/decode 후 원 RGBA와 다시 대조했다.
JS/WASM 인터페이스, 렌더 어댑터와 corpus 입력은 두 비교에서 동일하다.

전체 원시 결과는
[`vello-cpu-upgrade-2026-11-23.json`](../../tests/benchmarks/results/vello-cpu-upgrade-2026-11-23.json)에 있다.
이 JSON의 `diagnostic-only-no-golden-approval`은 자동 진단 자체의 범위이며,
아래의 별도 검토 결정과 구분한다. 역사적 `cross-renderer-diff.json`은 덮어쓰지 않았다.

## 전체 corpus 결과

| 장면 | 기존 대비 변경 픽셀 | 최대 채널 차이 | 새 출력의 CanvasKit fuzzy 불일치 |
| --- | ---: | ---: | ---: |
| 01-solid-shapes | 0 | 0 | 0% |
| 02-strokes | 0 | 0 | 0.006103515625% |
| 03-curves | 107 | 1 | 0.0732421875% |
| 04-linear-gradient | 0 | 0 | 0% |
| 05-radial-gradient | 0 | 0 | 0% |
| 06-blend-modes | 0 | 0 | 0% |
| 07-group-opacity | 0 | 0 | 0% |
| 08-dense-lineart | 24 | 1 | 0.34332275390625% |
| 09-sweep-gradient | 0 | 0 | 0% |

기존 WASM은 커밋된 golden **9개 모두**와 RGBA가 일치했다.
두 WASM 모두 전체 장면의 반복 렌더가 동일했다. 새 WASM은 기존의
채널 δ≤48·대칭 3×3·fuzzy 불일치 ≤0.5% 기준과 04~07·09 평탄 영역 0% 기준을
모두 통과했고, 장면별 fuzzy 값은 기존과 같았다.

`03-curves`는 RGB 변경 채널 수 10/1/5, alpha 변경 106픽셀이며 최대 변화가 모두 1이다.
기존 alpha 254의 106픽셀이 새 출력에서는 255가 되어, alpha 1 배경의 불투명성이 유지된다.
`08-dense-lineart`는 RGB 채널 수 18/14/20, 각 최대 변화 1이고 alpha 변화는 없다.
두 이미지의 원본·새 출력·8배 RGB 차분 및 alpha 차분을 검토했다. 형상 누락·위치 이동은 보이지 않았다.

## 기준 이미지 변경 결정

[상류 0.4.0 릴리스](https://github.com/linebender/vello/releases/tag/sparse-strips-v0.4.0)는
[u8 source-over의 불투명 목적지 alpha 보존 수정](https://github.com/linebender/vello/pull/2032)과
[곡선 평탄화 정밀도 수정](https://github.com/linebender/vello/pull/2039)을 포함한다.
관측한 alpha 복구는 첫 수정의 동작과 일치한다. 작은 RGB 차이에 대한 개별 상류 커밋의
기여는 따로 분리 빌드하지 않았으므로 특정 커밋 하나의 효과로 단정하지 않는다.

전체 비교와 시각 검토 후 **아래 golden 두 개만** 새 출력으로 변경했다.
나머지 7개 PNG, corpus 입력, 픽셀 동등성 단언, 허용 오차와 테스트 개수는 유지했다.
교차 비교 테스트의 재생성 보고서용 버전 문자열만 실제 0.42.0/0.4.0 핀으로 동기화했다.

| golden | 이전 SHA-256 | 새 SHA-256 |
| --- | --- | --- |
| `03-curves.vello-cpu.png` | `c33b09338a2b91a1a6ea070540e63d166649ac40048ae90f1fac3f2d00685836` | `6e300ef78039b8a9c48328e8054527b3f4596f0a30f74ddc7dbc460c06b7109e` |
| `08-dense-lineart.vello-cpu.png` | `b4cbd181f063aecc445d5ee87769af50c6b1f934e0f7a4a84dc8190148f005e0` | `2e8d6ab1639343f2881bde0bb4505fe9b14d3f4cc0144214d21826ea7773747c` |

적용 후 아래 원래 테스트는 **2파일 13개 PASS**였다.

```bash
corepack pnpm exec vitest run tests/visual/cross-renderer-diff.test.ts \
  packages/studio-engine-vello/src/__tests__/vello-adapter.test.ts --maxWorkers=1
```

## 별도 검증과 범위

Linux native job은 실제 Rust 1.97.1, cargo 1.97.1, wasm-pack 0.15.0,
Node 24.16.0, pnpm 11.4.0에서 rustfmt·clippy와 11개 native test binary의
58개 테스트, CPU/GPU release WASM 빌드, 라이선스·보안 검사를 통과했다.
GPU parity 8개 장면의 최대 fuzzy 불일치는 0.0366%였다.
이 job은 GPU adapter 신원을 출력하지 않았으므로 물리 GPU 검증이라고 부르지 않는다.

이 문서의 CPU 판정은 Mac 전용 폰트·기준 Chromium 158의 텍스트 결과,
ThorVG의 실제 브라우저 초기화·해제 주기, 최종 통합 PR의 Core/verify 통과를 대신하지 않는다.
각 검증은 해당 게이트의 실제 실행 결과로 별도 판정한다.

