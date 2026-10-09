# Sumi 래스터 커널 wasm 제3자 고지 (brush-lab)

- 상태: **현재(2026-10-08 확인)**. 자체 Rust 크레이트 `wasm/sumi-kernel`이 만든 wasm(`pkg/sumi_kernel.wasm`, 33,946 B)에 표준 라이브러리를 통해 링크된 제3자 코드를 기록한다.
- 집행: `apps/brush-lab/src/license-policy.test.ts`의 `EMBEDDED_WASM` 원장(`@toonstudio/brush-lab`, 라이선스 `original`)이 이 문서를 대조한다. 원장과 문서는 같이 고친다.
- 이 문서는 법률 자문이 아니라 엔지니어링 기록이다.

## 1. 왜 따로 기록하는가

커널 소스는 이 저장소의 자체 코드(`original`)지만, `wasm32-unknown-unknown` 타깃은 표준 라이브러리가 메모리 할당기 `dlmalloc`을 품는다.
산출물 wasm(sha256 `63a5d3d3c2124b86f212ff6d3abe77f379a654768624b13c520390b3274209dc`)과 그 base64 사본 `src/engine/wasm/kernel-embedded.ts`에는 이 제3자 코드의 바이트가 들어 있으므로 상용 배포 시 저작권·허가문 고지 대상이다.

## 2. 패키지와 wasm

| 항목 | 값 | 확인 방식 |
| --- | --- | --- |
| 패키지 | `@toonstudio/brush-lab` (workspace, 자체 소스) | 저장소 |
| 라이선스 | original (자체 소스) | 저장소 |
| wasm | 33,946 B, sha256 `63a5d3d3c2124b86f212ff6d3abe77f379a654768624b13c520390b3274209dc` | `pkg/sumi_kernel.wasm`과 `kernel-embedded.ts` 디코드 결과가 바이트 동일(원장 `sameBytesAs`) |

## 3. wasm 에서 경로로 식별한 Rust crate (부분집합 — 전체 의존 목록 아님)

wasm 바이트 안의 `/rust/deps/<이름>-<버전>/` 경로 문자열로 식별한 crate 만 담는다. 경로 문자열을 남기지 않는 코드는 식별되지 않는다(4절).
라이선스는 crates.io API 와 소스 아카이브(static.crates.io)의 `LICENSE-MIT`·`Cargo.toml` 로 확인했다(원격 조회, 2026-10-08).

| crate | 라이선스(SPDX) | wasm 확인 | 라이선스 확인 방식 | 저작권 표기 · 비고 |
| --- | --- | --- | --- | --- |
| `dlmalloc` 0.2.13 | MIT OR Apache-2.0 | 예(`/rust/deps/dlmalloc-0.2.13/src/dlmalloc.rs`) | 원격 조회(아카이브 sha256 `9f5b01c17f85ee988d832c40e549a64bd89ab2c9f8d8a613bdf5122ae507e294`) | Copyright (c) 2014 Alex Crichton (LICENSE-MIT). `Cargo.toml` 표기는 옛 구분자 `MIT/Apache-2.0`. NOTICE 파일 없음 |

## 4. 확인하지 못한 범위와 상용 승격 전 해야 할 일

- **확인하지 못한 범위**: 3절은 경로로 식별한 **부분집합**이다. 표준 라이브러리의 `compiler_builtins` 등 경로 문자열이 없는 코드는 열거하지 못했다.
- 상용 승격 전에는 `build.sh`(Rust 1.97.0 고정)로 커널을 빌드할 때 `cargo-about` 등으로 전체 의존 목록을 생성해 이 문서를 대체한다.
- 커널 자체 소스의 라이선스 표기(저장소 정책)는 이 문서 범위 밖이다.
