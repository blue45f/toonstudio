# 1인 기업 상용화 라이선스 & 클린룸 안료 대체 마스터 감사 리포트

- **작성 기준일**: `2026-11-22`
- **감사 대상**: ToonStudio 모노레포 프로덕션 의존성 그래프 및 자체 클린룸 7밴드 분광 Kubelka-Munk WebGPU 엔진
- **적용 기준 기업 규모**: 1인 기업 및 소규모 스튜디오(**영리법인·개인사업자 직원 1~3인 기준**)
- **근거 자료**: [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md), [`scripts/generate-third-party-notices.mjs`](../../scripts/generate-third-party-notices.mjs), [`docs/third-party/opencascade-lgpl.md`](../third-party/opencascade-lgpl.md), [`docs/features/latent-pigment-mixing.md`](../features/latent-pigment-mixing.md), [`third_party/mixbox/README.md`](../../third_party/mixbox/README.md), 그리고 `2026-11-22` 실측 `pnpm run audit:licenses` 결과
- **법적 고지**: 이 문서는 엔지니어링 수준의 라이선스 인벤토리·격리 경계·자동 게이트 점검 결과이며 법률 전문가의 공식 법률 자문(legal opinion)을 대체하지 않는다.

---

## 1. 1인 기업(직원 1~3인) 상용화 종합 판정

- **상태(`current`)**: **조건부 상용화 가능 (자동 라이선스 감사 `pnpm run audit:licenses` 100% 통과)**
  - 실측 게이트 결과 (`2026-11-22`): `590 pnpm entries`, `90/147 Vello CPU/GPU crates`, `3 opaque WASM inventories`, `439 license texts`, `51 npm packages without a root license file` — 전 항목 통과.
  - 비상업 전용 패키지인 `mixbox@2.0.0`(CC BY-NC 4.0)은 `2026-11-05` 의존성과 호출 경로에서 완전히 제거되었고, `pnpm run audit:licenses`가 `mixbox` 재유입을 차단한다.
  - 본 변경에서 **100% 클린룸 7밴드 분광 Kubelka-Munk WebGPU Compute + CPU 동등 엔진**(`studio-webgpu-km7-spectral-core.ts`, `studio-webgpu-km7-compute-wgsl.ts`)과 상용 안전(`permissive-only`) 브러시 5종·안료 필터 4종을 통합해 상용 기본 권리 프로필에서 차단 없이 실행된다.
- **즉시 확인·유지해야 할 상용 출시 조건**:
  1. 배포 산출물에 자동 생성되는 `dist/legal/THIRD_PARTY_NOTICES.generated.md` 고지 문서를 사용자 접근 경로에 유지한다 (`current`).
  2. `remotion` / `@remotion/player`는 **직원 3인 이하** 무료 적격 조건을 충족할 때만 무료로 상용 배포한다. **직원 4인 이상 전환 시점**에는 Remotion Company License 구매 또는 Product Tour 런타임 교체가 필수다 (`target`).
  3. `opencascade.js@1.1.1`(LGPL-2.1-only)은 비수정·지연 로드 동적 WASM 경계로 분리되어 있으나, 상용 공개 배포 전 최종 법률 검토로 동적 교체 경계를 확인한다 (`current` 엔지니어링 완료 / `target` 법무 최종 확인).
  4. 구 `pigment-mixbox` 저장 호환 경로와 `toonstudio-latent-pigment-v1`의 다항식 잠재 구조에 대해서는 [`third_party/mixbox/LICENSE-GRANT.md`](../../third_party/mixbox/LICENSE-GRANT.md) 서면 합의 기록 또는 신규 클린룸 7밴드 분광 KM(`pigment-km7-spectral`) 전면 전환으로 권리 불확실성을 정리한다 (`legacy exception` → `target`).

---

## 2. 핵심 구성요소별 상용화 라이선스 마스터 매트릭스

| 영역 / 패키지 | 확인된 버전 | 라이선스 | 현재 상태 구분 | 1~3인 상용화 판정 | 핵심 근거 및 조치·전환 포인트 |
| --- | --- | --- | --- | --- | --- |
| **물리 엔진 (`@dimforge/rapier`)** (`rapier3d-deterministic-compat`, `rapier2d-compat`, `rapier3d-compat`) | `0.21.0` / `0.12.0` | **Apache-2.0** | `current` | **완전 안전** | 상용·독점 배포·수정·재배포 전면 허용. 특허 실시 허락 조항 포함. 저작권·NOTICE 보존 외 추가 제약 없음. |
| **7밴드 분광 KM 엔진·브러시 5종·필터 4종** (`toonstudio-km7-spectral-v1`, `studio-webgpu-km7-*`) | `1.0` (1st-party) | **Project license (클린룸 자체 구현)** | `current` | **완전 안전** | `mixbox` 코드·LUT·제3자 측정표 0바이트. 공개 Kubelka-Munk·CIE/Oklab 수식과 1차 원리 7밴드 기저(`BR+BG+BB=1`, `M·B=I₃`)만 사용. `permissive-only` 기본 프로필에서 5종 브러시 전원 무차단 실행. |
| **`mixbox` (과거 외부 의존성)** | 제거 완료 (`2.0.0` 삭제) | **CC BY-NC 4.0** (비상업 전용) | `legacy exception` | **제거 완료 / 재유입 차단** | `2026-11-05` npm 의존성·정적 import 완전 제거. `scripts/generate-third-party-notices.mjs`가 `mixbox` 재유입 시 빌드 실패 처리. 과거 연구 기록만 `third_party/mixbox/`에 보존. (운영 기배포 청크 갱신 및 `LICENSE-GRANT.md` 미기재 사항은 별도 관리.) |
| **`remotion` & `@remotion/player`** | `4.0.543` (`THIRD_PARTY_NOTICES.md` 표기 `4.0.536`) | **Remotion License** (맞춤형 상용/무료 적격) | `current` (1~3인 무료) / `target` (4인+ 전환) | **1~3인 무료 가능 / 4인 이상 유료 전환점** | 개인·비영리·**직원 3인 이하 영리기업** 무료 적격. **4인 이상** 도달 시 즉시 Remotion Company License 구매 또는 제품 투어 영상 런타임 대체 필수. `acknowledgeRemotionLicense`는 기술 플래그일 뿐 법적 허가가 아님. SHA-256 해시 고정 검증 중. |
| **`opencascade.js` (OCCT WASM)** | `1.1.1` (OCCT `33d9a6fa...`) | **LGPL-2.1-only** | `current` (동적 분리 완료) / `target` (법무 확인) | **동적 교체 경계 준수 시 조건부 가능** | 비수정 업스트림 WASM(SHA-256 `6cc2f3fa...`)을 지연 로드 별도 자산으로 분리, 문서 포맷 비의존, 재빌드·교체 절차 문서화([`opencascade-lgpl.md`](../third-party/opencascade-lgpl.md)). 수정 배포 시 대응 소스 공개 필수. 상용 출시 전 법률 자문 최종 확인 권장. |
| **`p5` & `libtess` (`p5.brush` peer 해소)** | `p5@2.3.1`, `libtess@1.2.2` (`p5.brush@2.2.1` MIT) | **LGPL-2.1** (`p5`) / **SGI-B-2.0** (`libtess`) | `current` (미번들·인벤토리 잔류) / `target` (peer 격리) | **개선 권장 (peer 격리 포인트)** | 코드는 독립 실행형 `p5.brush/standalone`(MIT)만 import해 `p5` 앱 엔트리·`libtess`를 정적 번들하지 않으나, pnpm 자동 peer 해소로 프로덕션 인벤토리와 고지서에 잔류함. 향후 `p5` peer 격리 또는 클린룸 7밴드 KM 브러시로 대체 후 `p5.brush` 제거 권장. |
| **`inkwash` (Johno Whitaker)** | **미이식 (0줄)** | 공개 라이선스 없음 (구두 허락 진술만 존재) | `current` (미이식) | **현재 위험 없음 / 서면 증빙 전 이식 금지** | 저장소에 `inkwash` 코드 0줄. 수채 웻-엣지 블룸은 [`studio-wet-edge-bloom-v1.ts`](../../apps/web/src/domains/creator/brush/studio-wet-edge-bloom-v1.ts)와 본 7밴드 KM 엔진의 클린룸 독립 구현. 서면 증빙이 `THIRD_PARTY_NOTICES.md`에 기록되기 전까지 단 1줄도 이식 금지. |
| **MPL-2.0 모듈** (`@resvg/resvg-wasm`, `web-ifc`, `web-push`) | `2.6.2` / `0.0.79` / `3.6.7` | **MPL-2.0** | `current` | **무수정 사용 완전 안전** | 파일 단위 약한 카피레프트. 원본 무수정 사용 + 출처 URL 및 라이선스 고지 유지 시 독점·상용 서비스 결합 배포 완전 안전. 추후 MPL 파일 자체를 수정할 경우에만 수정된 해당 파일 소스 공개 의무 발생. |
| **기타 주요 2D/브러시/3D 엔진** (Vello, Hokusai, ThorVG, Google Ink, libmypaint, mypaint-brushes, spectral.js, open-km, dli/paint, croquis.js, Klecks, Sumi) | 고정 버전 (감사 인벤토리 참조) | **MIT / Apache-2.0 / ISC / CC0-1.0 / Unicode-3.0** | `current` | **완전 안전** | 전원 허용적(permissive) 라이선스. Vello(90/147 crates), Hokusai, Google Ink, libmypaint의 해시·체크섬과 439개 라이선스 원문을 자동 감사가 매 빌드 검증. |
| **네이티브 `sharp` / `libvips` (선택적 의존성)** | `@img/sharp-libvips-*@1.3.4` | **LGPL-3.0-or-later** | `current` (브라우저 미포함) | **브라우저 배포 영향 없음** | 설치 스크립트 차단 및 Studio 브라우저 런타임 미포함. `postbuild` 감사가 Vite 배포물 내 libvips/sharp 마커 혼입 시 실패 처리. 추후 서버·데스크톱 바이너리 배포 시 LGPL 고지·재링크 절차 별도 적용. |

---

## 3. 클린룸 안료 엔진 대체 현황 (`current` vs `legacy exception`)

1. **`mixbox` 완전 제거 (`current`)**:
   - `package.json` 및 `pnpm-lock.yaml`에 `mixbox` 패키지가 **0건**임을 `2026-11-22` 확인했다.
   - `scripts/generate-third-party-notices.mjs`의 `validateReviewedRestrictedProductionDependency`가 패키지명 `"mixbox"` 또는 미승인 `CC-BY-NC-4.0` 의존성 유입 시 즉시 예외를 던진다.
2. **신규 100% 클린룸 7밴드 분광 Kubelka-Munk WebGPU Compute 엔진 (`current`)**:
   - **코어 수학 (`studio-webgpu-km7-spectral-core.ts`)**: 7개 파장 밴드(`[420, 465, 505, 545, 585, 625, 670]nm`)에서 파티션 항등식(`BR + BG + BB = 1`)을 만족하는 자체 해석 반사율 기저와 가중 무어-펜로즈 의사역행렬(`M · B = I₃`)을 1차 원리로 구성했다.
   - **WebGPU Compute (`studio-webgpu-km7-compute-wgsl.ts`)**: 7밴드를 `vec4<f32>` 2개(`lo`, `hi`)로 패킹해 루프 없는 SIMD 연산으로 실행하며, 타일 비닝 CSR 버퍼(`tile_offsets`, `dab_indices`)와 `var<workgroup>` 공유 메모리 배치 로딩(`@workgroup_size(8, 8, 1)`)을 지원한다.
   - **브러시·필터 제품 통합 (`current`)**:
     - 브러시 5종(`km7-oil-impasto-bristle`, `km7-gouache-opaque-flat`, `km7-watercolor-wet-edge-bloom`, `km7-acrylic-soft-blend`, `km7-dry-pastel-chalk`)은 모두 `internal`/`permissive` 노드만 사용해 기본 `permissive-only` 권리 프로필에서 100% 실행된다.
     - 필터 4종(`color.km7-spectral-gradient-map`, `color.km7-pigment-temperature-shift`, `color.km7-traditional-glazing`, `color.km7-pigment-harmonizer`)은 필터 갤러리 지연 청크에 통합되어 WebGPU Compute와 동일 수학 CPU 폴백을 모두 제공한다.
3. **잔여 권리 정리 대상 (`legacy exception` / `target`)**:
   - 기존 저장 원고 호환용 `pigment-mixbox` 노드 식별자는 현재 자체 `toonstudio-latent-pigment-v1`으로 라우팅된다([`latent-pigment-mixing.md`](../features/latent-pigment-mixing.md)). 해당 4안료 3차 다항식 구조의 방법·특허 비침해 여부와 [`third_party/mixbox/LICENSE-GRANT.md`](../../third_party/mixbox/LICENSE-GRANT.md) 서면 합의 식별자는 미기재 상태다.
   - 신규 제작 브러시와 필터는 모두 독자 7밴드 분광 KM(`pigment-km7-spectral`) 또는 38밴드 KM(`@toonstudio/studio-brush-platform`)을 기본으로 사용해 과거 잠재 다항식 의존도를 점진적으로 축소한다(`target`).

---

## 4. 1인 기업 성장 단계별 체크리스트 및 개선 로드맵 (`target`)

| 단계 / 트리거 | 확인 항목 | 실행 명령 / 조치 |
| --- | --- | --- |
| **매 릴리스 전 (1인 기업 현재)** | 제3자 라이선스 인벤토리·해시·금지 패키지(`mixbox`) 감사 통과 및 고지서 생성 | `pnpm run audit:licenses` 및 `pnpm run build` (`dist/legal/THIRD_PARTY_NOTICES.generated.md` 배포 포함 확인) |
| **문서 정합성 정리 (단기)** | `THIRD_PARTY_NOTICES.md` 표의 `remotion`/`@remotion/player`(`4.0.536` → `4.0.543`), `web-ifc`(`0.0.77` → `0.0.79`) 표기 버전 동기화 | `THIRD_PARTY_NOTICES.md` 버전 표 갱신 후 `pnpm run audit:licenses` 재검증 |
| **LGPL/SGI 의존 그래프 축소 (중기)** | `p5.brush`의 `p5`(LGPL-2.1)·`libtess`(SGI-B-2.0) peer 의존 격리 또는 클린룸 7밴드 KM 브러시로 완전 대체 | `pnpm-lock.yaml`에서 `p5`/`libtess` 제거 후 `pnpm run audit:licenses` 재검증 |
| **상용 공개 출시 전 법무 확인** | `opencascade.js@1.1.1`(LGPL-2.1-only) 동적 WASM 교체 경계 및 `toonstudio-latent-pigment-v1` 권리 검토 | 법률 자문 확인서 보관(또는 미사용 시 OCCT 선택 기능 플래그 비활성화) |
| **팀 규모 4인 이상 전환 시점** | **Remotion License 무료 적격 종료** (영리기업 3인 이하 초과) | Remotion Company License 계약 체결 또는 Product Tour를 순수 HTML/WebCodecs/MP4 정적 자산으로 교체 |

---

## 5. 감사 검증 재현 명령

아래 명령은 저장소 루트에서 실행하며, 파일 시스템이나 운영 배포 상태를 변경하지 않는 읽기 전용 검사다.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.1/bin:$HOME/.local/share/pnpm:/opt/homebrew/bin:$PATH"
pnpm run audit:licenses
pnpm run validate:documentation
pnpm run harness:check
```

- **성공 기준**: 세 명령 모두 종료 코드 `0`, `License audit passed` 출력, 문서 링크·언어·권위 검사 위반 `0건`.
- **실패 시 조치**: 추가·갱신된 패키지의 SPDX 라이선스와 원문 파일 존재 여부를 확인하고, 미검토 제한 라이선스(`GPL`, `AGPL`, `CC-BY-NC-4.0`, 미승인 `Remotion` 버전 등)가 유입된 경우 즉시 의존성 추가를 되돌린다.
