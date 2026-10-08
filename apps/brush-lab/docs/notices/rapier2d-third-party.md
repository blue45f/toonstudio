# Rapier 2D 내장 wasm 제3자 고지 (brush-lab)

- 상태: **현재(2026-10-08 확인)**. `bristle-rapier` 실험 레인이 쓰는 `@dimforge/rapier2d-compat@0.21.0`의 wasm에 정적으로 링크된 구성요소와 라이선스를 기록한다.
- 집행: `apps/brush-lab/src/license-policy.test.ts`의 `EMBEDDED_WASM` 원장이 이 문서와 설치본을 대조한다(설치 버전·래퍼 라이선스·wasm 바이트 sha256·내장 crate 집합·이 문서의 존재와 내용). 원장과 문서는 같이 고친다.
- 이 문서는 법률 자문이 아니라 엔지니어링 기록이다. 상용 배포 전 법무 검토 항목은 맨 아래 4절에 모았다.
- **이 문서의 crate 목록은 wasm 에 링크된 crate 전체가 아니다.** 3절은 wasm 바이트 안의 경로 문자열로 식별한 **부분집합**이고, 4.1절은 Cargo.toml 선언 기준으로 올렸으나 wasm 에서 확인하지 못한 의존이다.
  어느 쪽도 전체 의존 목록(`cargo-about` 등으로 생성)을 대신하지 못하므로 상용 승격 전에 4절의 절차로 이 문서를 대체한다.

## 1. 왜 따로 기록하는가

`@dimforge/rapier2d-compat`은 wasm(2,404,467 B)을 **JS 안에 base64로 내장**한다(`dist/rapier.mjs`·`dist/rapier.cjs`, 같은 바이트의 독립 파일 `dist/rapier_wasm2d_bg.wasm`도 패키지에 들어 있다).
그래서 저장소의 `.wasm` 파일 검사(`BINARY_COMPONENTS`)에 걸리지 않고, npm 메타데이터의 라이선스(`Apache-2.0`)는 **래퍼(JS 바인딩과 Rapier 본체)** 의 것이다.
wasm 안에는 Rust crate 들이 정적으로 링크돼 있고 각자의 라이선스·저작권 고지가 따라온다. 패키지는 이 고지를 동봉하지 않는다.

## 2. 패키지와 wasm

| 항목 | 값 | 확인 방식 |
| --- | --- | --- |
| 패키지 | `@dimforge/rapier2d-compat@0.21.0` | 설치본 `package.json` |
| 패키지 라이선스 | Apache-2.0 (Copyright 2020 Dimforge EURL) | 설치본 `LICENSE` 전문(sha256 `4c05555705e3efde601fb1252ae48f1d63992af8a8fb8947745b7fa834e8f519`)과 `package.json` |
| NOTICE 파일 | 없음 | 설치본에 없음. `dimforge/rapier`·`dimforge/rapier.js` 저장소 `master/NOTICE`는 원격 조회에서 404(2026-10-08) |
| 내장 wasm | 2,404,467 B, sha256 `322b00649f412e75e047c79741b6b89e6323f6f81034d114a9e8ab872bae7435` | 설치본 `dist/rapier.mjs`·`dist/rapier.cjs`에서 base64를 디코드해 계산, `dist/rapier_wasm2d_bg.wasm`과 바이트 동일 |
| 빌드 도구 | wasm-bindgen 0.2.129 (165586f85), walrus 0.27.2 | wasm `producers` 섹션(설치본 확인). walrus는 빌드 도구라 wasm 본문에 링크되지 않는다 |
| 컴파일러 | rustc 커밋 `48a229ceaefd4985c50990b14116b6d856af0985` | wasm 안 `/rustc/<해시>` 경로 문자열(설치본 확인) |
| Rapier 본체 | `rapier2d`(dimforge/rapier) — wasm 안 소스 경로 `crates/rapier2d/…`·`builds/rapier2d/…` | 설치본 확인. crate 버전 표기는 wasm 안에 없다 |

## 3. wasm 에서 경로로 식별한 Rust crate (부분집합 — 전체 의존 목록 아님)

이 표는 **경로 문자열을 wasm 에 남기는 crate 만** 담는다. panic 위치 문자열 등을 남기지 않는 crate 는 식별되지 않으므로 실제로 링크된 crate 는 이보다 많을 수 있다(4.1절).
"wasm 확인"은 설치본 wasm 바이트에서 `registry/src/<인덱스>/<이름>-<버전>/` 경로 문자열로 이름·버전을 **직접 확인**했다는 뜻이다(테스트가 집합 일치를 검사한다).
"원격 조회"는 라이선스를 설치본이 아니라 crates.io API(`/api/v1/crates/<이름>/<버전>`)와 crate 소스 아카이브(`static.crates.io`)의 `Cargo.toml`·LICENSE 파일로 확인했다는 뜻이다(2026-10-08).
crate 소스 아카이브에는 NOTICE 파일이 없었다.

| crate | 라이선스(SPDX) | wasm 확인 | 라이선스 확인 방식 | 저작권 표기 · 비고 |
| --- | --- | --- | --- | --- |
| `nalgebra` 0.35.0 | Apache-2.0 | 예 | 원격 조회(아카이브 sha256 `adc43a60c217b0c6…`) | Copyright 2020 Sébastien Crozet. LICENSE 는 Apache-2.0 전문 |
| `parry2d` 0.31.1 | Apache-2.0 | 예 | 원격 조회(`fe1ba500175e957a…`) | `Cargo.toml` `license = "Apache-2.0"`, authors Sébastien Crozet. **아카이브에 LICENSE 파일이 들어 있지 않다** |
| `glam` 0.33.10 | MIT OR Apache-2.0 | 예 | 원격 조회(`928452f9c953e142…`) | LICENSE-MIT 에 저작권 보유자 줄이 없다 |
| `arrayvec` 0.7.8 | MIT OR Apache-2.0 | 예 | 원격 조회(`d3fb67a6e08acf24…`) | Copyright (c) Ulrik Sverdrup "bluss" 2015-2023 |
| `ena` 0.14.4 | MIT OR Apache-2.0 | 예 | 원격 조회(`eabffdaee24bd1bf…`) | Copyright (c) 2010 The Rust Project Developers |
| `hashbrown` 0.17.1 | MIT OR Apache-2.0 | 예 | 원격 조회(`ed5909b6e89a2db4…`) | Copyright (c) 2016 Amanieu d'Antras |
| `dlmalloc` 0.2.13 | MIT OR Apache-2.0 | 예(`/rust/deps/dlmalloc-0.2.13/` 경로) | 원격 조회(`9f5b01c17f85ee98…`) | Copyright (c) 2014 Alex Crichton (LICENSE-MIT). `Cargo.toml` 표기는 옛 구분자 `MIT/Apache-2.0`(SPDX 로는 `MIT OR Apache-2.0`). 표준 라이브러리가 품은 메모리 할당기 |
| `js-sys` 0.3.106 | MIT OR Apache-2.0 | 예 | 원격 조회(`7883d941dae510fb…`) | Copyright (c) 2014 Alex Crichton |
| `once_cell` 1.21.4 | MIT OR Apache-2.0 | 예 | 원격 조회(`9f7c3e4beb33f85d…`) | LICENSE-MIT 에 저작권 보유자 줄이 없다 |
| `robust` 1.2.0 | MIT OR Apache-2.0 | 예 | 원격 조회(`4e27ee8bb91ca0ad…`) | Copyright (c) 2017 The Spade Developers, (c) 2020 The GeoRust Project Developers |
| `smallvec` 1.16.2 | MIT OR Apache-2.0 | 예 | 원격 조회(`f9395f0f0eee849a…`) | Copyright (c) 2018 The Servo Project Developers |
| `spade` 2.15.1 | MIT OR Apache-2.0 | 예 | 원격 조회(`9699399fd9349b00…`) | Copyright (c) 2017 The Spade Developers |
| `web-time` 1.1.0 | MIT OR Apache-2.0 | 예 | 원격 조회(`5a6580f308b1fad9…`) | Copyright (c) 2023 dAxpeDDa |
| `wasm-bindgen` 0.2.129 | MIT OR Apache-2.0 | 아니오(producers 섹션과 글루 JS) | 원격 조회(`9bb54f33acc68fd4…`) | Copyright (c) 2014 Alex Crichton. 패키지의 글루 JS(`rapier_wasm2d.js`)는 이 도구가 생성한다 |
| `rapier2d` (wasm 안 버전 표기 없음) | Apache-2.0 | 아니오(소스 경로 문자열) | 설치본 `LICENSE`와 crates.io 최신 버전들의 `license` 필드(원격 조회) | wasm 에 링크된 정확한 crate 버전은 알 수 없다 |

Rust 표준 라이브러리(`std`·`core`·`alloc`)도 정적으로 링크된다. 컴파일러 커밋 `48a229ce…`의 `COPYRIGHT`(원격 조회: rust-lang/rust 해당 커밋)는 Rust 프로젝트가 Apache-2.0 또는 MIT 이중 라이선스라고 밝힌다(MIT OR Apache-2.0).
`hashbrown`은 표준 라이브러리 안의 복사본(`/rust/deps/hashbrown-0.17.1`)도 wasm 에 있고, 같은 `/rust/deps/` 경로로 `dlmalloc` 0.2.13 도 식별된다(2026-10-08 추가 — 이전 판은 이를 "식별 불가"로 적었다).

## 4. 확인하지 못한 범위와 상용 승격 전 해야 할 일

- **확인하지 못한 범위**: wasm 에 정적 링크된 표준 라이브러리 안의 나머지 제3자 코드(`compiler_builtins` 등 경로 문자열이 없는 것)와, panic 위치 문자열을 남기지 않아 경로로 식별되지 않는 crate 는 열거하지 못했다.
  3절 목록은 **경로로 식별한 부분집합**이며 링크된 crate 전체라는 보증이 아니다. 아래 4.1절의 Cargo.toml 선언 의존은 컴파일 단위에 링크됐을 수 있지만 wasm 에서 문자열 흔적을 찾지 못했다
  (`simba`·`num_traits`·`foldhash` 문자열은 wasm 에서 0건이었다 — 흔적이 없어도 필수 의존의 링크를 배제하지 못한다).
- 상용 승격 전에는 Rapier 를 소스에서 같은 설정으로 빌드하고 `cargo-about` 등으로 전체 의존 목록과 라이선스 전문을 생성해 이 문서를 대체한다(`Cargo.lock`을 가진 쪽에서 가능하며, npm 설치본에는 `Cargo.lock`이 없다).
- Apache-2.0(제4조): 배포물에 라이선스 사본을 동봉하고 수정 시 변경 고지를 남긴다. 위 조회에서 NOTICE 파일은 없었다. 이중 라이선스 crate 를 MIT 로 쓰는 경우 저작권 고지와 허가문을 복제본에 포함한다.
- `parry2d` 아카이브에 LICENSE 파일이 없다는 점은 법무가 확인할 항목이다(`Cargo.toml` 의 SPDX 표기는 Apache-2.0).
- 저장소 루트 `THIRD_PARTY_NOTICES.md`(`node scripts/generate-third-party-notices.mjs`가 생성)에는 Rapier 가 들어 있지 않다. brush-lab 은 운영 배포 대상이 아닌 실험 앱이라 이 문서가 그 역할을 대신한다. brush-lab 산출물을 재배포하게 되면 루트 고지에도 반영해야 한다.

### 4.1 Cargo.toml 선언 기준 · wasm 에서 미확인 의존 (원격 조회)

`nalgebra` 0.35.0 과 `parry2d` 0.31.1 의 소스 아카이브(static.crates.io, 원격 조회 2026-10-08; sha256 은 3절 참고)에서 `Cargo.toml` 의 **필수(optional 아님) 의존**을 추출했다.
라이선스는 crates.io API(`/api/v1/crates/<이름>`)의 해당 요구 범위 최신 버전 `license` 필드로 확인했다(원격 조회). 모두 허용형(MIT·Apache-2.0·Zlib)이라 상용 이용 가능성에는 영향이 없지만,
**고지 대상 후보**이므로 `cargo-about` 전체 목록 생성 전까지 여기에 남긴다. 3절에 이미 있는 `arrayvec`·`glam`(parry2d 는 `glamx` 를 쓴다)·`hashbrown` 등은 반복하지 않는다.
`rapier2d` 자신의 Cargo.toml 선언은 wasm 안에 버전 표기가 없어 조회하지 못했다.

| crate | 요구 버전 → 조회 버전 | 라이선스(SPDX) | 선언한 crate | 종류 · 확인 방식 |
| --- | --- | --- | --- | --- |
| `approx` | 0.5 → 0.5.1 | Apache-2.0 | nalgebra 0.35.0 · parry2d 0.31.1 | 일반 의존 · 선언 기준, wasm 에서 미확인(원격 조회) |
| `num-complex` | 0.4 → 0.4.6 | MIT OR Apache-2.0 | nalgebra 0.35.0 | 일반 의존 · 선언 기준, wasm 에서 미확인(원격 조회) |
| `num-rational` | 0.4 → 0.4.2 | MIT OR Apache-2.0 | nalgebra 0.35.0 | 일반 의존 · 선언 기준, wasm 에서 미확인(원격 조회) |
| `num-traits` | 0.2 → 0.2.19 | MIT OR Apache-2.0 | nalgebra 0.35.0 · parry2d 0.31.1 | 일반 의존 · 선언 기준, wasm 에서 미확인(원격 조회) |
| `simba` | 0.10 → 0.10.2 | Apache-2.0 | nalgebra 0.35.0 · parry2d 0.31.1 | 일반 의존 · 선언 기준, wasm 에서 미확인(원격 조회) |
| `typenum` | 1.12 → 1.20.1 | MIT OR Apache-2.0 | nalgebra 0.35.0 | 일반 의존 · 선언 기준, wasm 에서 미확인(원격 조회) |
| `bitflags` | 2.3 → 2.13.2 | MIT OR Apache-2.0 | parry2d 0.31.1 | 일반 의존 · 선언 기준, wasm 에서 미확인(원격 조회) |
| `either` | 1 → 1.19.0 | MIT OR Apache-2.0 | parry2d 0.31.1 | 일반 의존 · 선언 기준, wasm 에서 미확인(원격 조회) |
| `foldhash` | 0.2 → 0.2.0 | Zlib | parry2d 0.31.1 | 일반 의존 · 선언 기준, wasm 에서 미확인(원격 조회) |
| `glamx` | 0.3 → 0.3.1 | MIT OR Apache-2.0 | parry2d 0.31.1 | 일반 의존 · 선언 기준, wasm 에서 미확인(원격 조회) |
| `log` | 0.4 → 0.4.34 | MIT OR Apache-2.0 | parry2d 0.31.1 | 일반 의존 · 선언 기준, wasm 에서 미확인(원격 조회) |
| `ordered-float` | 5 → 5.5.0 | MIT | parry2d 0.31.1 | 일반 의존 · 선언 기준, wasm 에서 미확인(원격 조회) |
| `num-derive` | 0.5 → 0.5.1 | MIT OR Apache-2.0 | parry2d 0.31.1 | proc-macro(빌드 시점) · 선언 기준, wasm 에서 미확인(원격 조회) |
| `thiserror` | 2 → 2.0.21 | MIT OR Apache-2.0 | parry2d 0.31.1 | proc-macro(빌드 시점) · 선언 기준, wasm 에서 미확인(원격 조회) |
