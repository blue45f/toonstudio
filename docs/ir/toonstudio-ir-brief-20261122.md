# ToonStudio IR · 제품 기술 현황 브리프 (2026-11-22)

- **문서 상태**: **current** (최신 기술·라이선스·인프라 보강 브리프)
- **작성 기준일**: `2026-11-22`
- **관계 안내**: 공개 IR 웹 페이지(`/ir`), 24씬 발표 플레이어(`/ir/present`), 정적 24장 검토본 PPTX/PDF([정적 IR 발표자료 재생성](../marketing/ir-static-deck.md), 문안 기준일 `2026-11-21`)의 해시 정합성을 유지하면서, `2026-11-22` 기준 최신 WebGPU·Wasm64·클린룸 엔진, 1인 기업 상용화 라이선스 감사, ₩0 베타 인프라 및 경쟁 비교(`/about/compare`) 근거를 통합한 기술 IR 정본이다.
- **정직성 원칙**: 모든 항목은 `현재 구현(current)`과 `향후 목표(target)`를 구분하며, 미검증 사용자 수·매출·임의 벤치마크를 실적처럼 적지 않는다.

---

## 1. 한눈에 보는 제품·투자 핵심 요약

웹툰 1화를 완성하려면 작가는 대본·콘티, 2D 드로잉(Clip Studio Paint · Procreate · Photoshop · Rebelle), 3D 배경(Blender · SketchUp · ACON3D), 식자·슬라이스, 협업·검수(Creco · 메신저 · 드라이브) 등 **4~6개 도구를 매주 왕복**해야 한다.

**ToonStudio**(`https://www.toonstudio.cloud`)는 이 파편화된 제작 공정을 **설치 없는 단일 브라우저 제작 OS**로 연결한다.

| 핵심 축 | 2026-11-22 현재 실측 상태 (`current`) | 향후 목표 (`target`) | 정본 근거 |
| --- | --- | --- | --- |
| **과금 · 베타 상태** | 베타 전 기능 **₩0** (결제 비활성, 사전 공지 후 유료 전환) | 베타 창작자 30명 · 직무별 인터뷰 10명+ · 3~6개월 WTP 검증 후 개인/팀 플랜 확정 | [`pricing-page.tsx`](../../apps/web/src/app/routes/pricing-page.tsx), [`ir-pitch-data.ts`](../../apps/web/src/domains/marketing/ir-pitch-data.ts) |
| **운영 인프라 고정비** | **월 ₩0** (Cloudflare Static + R2 + DO + D1 + 서울 onpod 무료 티어, 도메인 갱신비만 별도) | 유료 전환·트래픽 증가 구간에서 always-on API 및 스토리지 단계적 확장 | [`infrastructure-map.md`](../operations/infrastructure-map.md) |
| **1인 기업 상용 라이선스** | `pnpm run audit:licenses` **590개 의존성 통과**, `mixbox`(CC BY-NC) **0건**, Rapier **Apache-2.0** | OCCT LGPL 최종 법무 확인, `p5` peer 격리, 4인 이상 전환 시 Remotion 라이선스 대응 | [`solo-founder-commercial-license-audit-20261122.md`](../legal/solo-founder-commercial-license-audit-20261122.md) |
| **경쟁 도구 비교·호환** | 7종 경쟁 도구 5대 축 실측 비교 페이지(`/about/compare`) 구축 · PSD/GLB/VRM/SKP 호환 | 기존 도구 사용 팀의 단계적 파일 왕복 및 시범 회차 실증 확보 | [`CompetitorComparisonPage.tsx`](../../apps/web/src/domains/marketing/CompetitorComparisonPage.tsx) |

---

## 2. 1인 기업(직원 1~3인) 상용화 라이선스 안전성

1인 기업 및 초기 소규모 팀(직원 1~3인) 기준으로 상업 배포를 가로막는 라이선스 리스크를 자동 감사 게이트(`pnpm run audit:licenses`)와 클린룸 구현으로 격리했다([상용화 감사 리포트](../legal/solo-founder-commercial-license-audit-20261122.md)).

### 2.1 `current` — 해소·검증 완료 항목
- **비상업 `mixbox` 완전 제거 및 재유입 차단**: `CC BY-NC 4.0`인 `mixbox@2.0.0`을 `2026-11-05` 의존성 그래프와 정적 호출에서 완전 제거했다. `scripts/generate-third-party-notices.mjs`가 `mixbox` 또는 미승인 `CC-BY-NC` 패키지 유입 시 빌드를 즉시 실패 처리한다.
- **100% 클린룸 7밴드 분광 Kubelka-Munk WebGPU 엔진**: 외부 독점 코드·LUT 없이 7개 지각 파장 밴드(`420·465·505·545·585·625·670nm`, `BR + BG + BB = 1`, `M · B = I₃`)를 1차 원리로 구현해 `permissive-only` 상용 기본 프로필에서 브러시 5종·안료 필터 4종이 무차단 실행된다.
- **물리 엔진 전면 허용 라이선스**: `@dimforge/rapier3d-deterministic-compat@0.21.0`·`rapier2d-compat` 등 물리 엔진은 **Apache-2.0**(특허 실시 허락 포함)으로 상용 배포·독점 결합에 추가 제약이 없다.
- **핵심 2D/3D/WASM 엔진 허용 라이선스 + 체크섬 검증**: Vello(`90/147` crates), Hokusai Rust WASM(`Apache-2.0 OR MIT`), ThorVG, Google Ink(`Apache-2.0`), libmypaint(`ISC`), Three.js/three-vrm(`MIT`), `@resvg/resvg-wasm`·`web-ifc`(무수정 `MPL-2.0`) 등 `590 pnpm entries`와 `439 license texts`를 매 빌드 검증하고 `dist/legal/THIRD_PARTY_NOTICES.generated.md`를 산출한다.
- **미이식·브라우저 배제 경계**: 공개 라이선스가 없는 `inkwash`는 **0줄 미이식**, `sharp`/`libvips`(LGPL-3.0)는 브라우저 번들 유입 차단(`postbuild` 감사)을 유지한다.

### 2.2 `target` — 성장 단계별 법무·전환 관리 포인트
1. **팀 4인 이상 전환 트리거(`remotion` / `@remotion/player`)**: 직원 3인 이하 영리기업 무료 적격 범위를 넘는 시점에 Remotion Company License 계약 또는 제품 투어 영상 런타임 교체가 필요하다.
2. **동적 LGPL 경계 최종 확인(`opencascade.js@1.1.1`)**: 비수정 업스트림 WASM을 지연 로드 자산으로 분리하고 재빌드 절차를 문서화([`opencascade-lgpl.md`](../third-party/opencascade-lgpl.md))했으며, 정식 유료 공개 전 법률 자문 최종 확인을 권장한다.
3. **미사용 peer 정리(`p5` / `libtess`)**: 코드는 `p5.brush/standalone`(MIT)만 동적 호출하지만 pnpm 자동 peer 해소로 인벤토리에 남은 `p5@2.3.1`(LGPL-2.1)·`libtess@1.2.2`(SGI-B-2.0)를 후속 PR에서 peer 격리하거나 클린룸 7밴드 KM 브러시로 완전 대체한다.

> *고지*: 본 절은 엔지니어링 수준의 자동 라이선스 인벤토리·격리 경계 점검 결과이며 법률 전문가의 공식 법률 자문(legal opinion)을 대체하지 않는다.

---

## 3. 베타 운영 인프라 ₩0 하이브리드 아키텍처

초기 베타 검증 기간 동안 고정 현금 유출을 0원 수준으로 억제하기 위해 **엣지·대형 자산은 Cloudflare 무료 티어**, **Core API와 PostgreSQL 17 원장은 서울 리전 onpod 무료 티어**로 분리 배치했다(`2026-10-23` 컷오버 완료, 구 Render·Neon 퇴역 — [인프라 정본 지도](../operations/infrastructure-map.md)).

| 계층 | 운영 자원 (`current`) | 위치 · 요금 | 아키텍처 역할 및 경계 |
| --- | --- | --- | --- |
| **웹 정적 · 엣지 게이트웨이** | Cloudflare Static Assets + Worker `toonspectrum-web` | 글로벌 엣지 · **₩0** | `https://www.toonstudio.cloud` 정적 셸, COOP/COEP 보안 헤더, `x-toonstudio-origin-secret` 출처 서명 |
| **대형 3D·캐릭터·미디어** | Cloudflare R2 `toonspectrum-public-assets` | 글로벌 객체 · **₩0** (무료 한도) | `2026-10-29` 조회 7,258개 · 3.56 GB · 청구 `$0.00`. Static Assets 25 MiB/20,000파일 한도 우회 |
| **실시간 협업 조정** | Cloudflare Worker + Durable Objects (`realtime.toonstudio.cloud`) | 엣지 상태 · **₩0** | 방 단위 단일 기록자 의미 보장(Yjs CRDT 세션 조정) |
| **트래픽 분석 · 리다이렉트** | Cloudflare Worker `toonspectrum-analytics`(D1) + apex redirect | 엣지 · **₩0** | Core API RPC 기록 · 운영 DB 부하 분리 |
| **Core API** | 서울 onpod `toonstudio-api` (`cpu_micro`, 단일 팟) | 서울 · **₩0** | `https://toonstudio-api.onpod.ai` · 30분 무요청 시 절전(첫 요청 시 자동 기상) |
| **PostgreSQL 17 원장** | 서울 onpod `toonstudio-db` (`dev` 플랜, 39 GB, PG 17.10) | 서울 · **₩0** | 내부 호스트 전용 접속, 자동 확장 상한 `dev` 고정으로 의도치 않은 유료 승급 차단. 저장소 원장 `0001`~`0133` 중 `0114`~`0133`(20건)은 운영 DB 적용 전 승인 대기 |
| **도메인** | `toonstudio.cloud` (Cloudflare DNS) | 연 갱신비만 발생 | 현재 유일한 고정 현금 비용 |

- **유료 전환 시점(`target`)**: 베타 실증 트래픽 증가 및 유료 플랜 개시 시 Core API `always-on` 전환과 R2·PostgreSQL 유료 구간으로 단계 확장한다.

---

## 4. WebGPU · Wasm64 · 클린룸 8대 기술 해자 (2026-11-22 코드 실측)

단순한 UI 래퍼가 아니라, 브라우저 안에서 데스크톱 전문 도구군에 근접하는 제작 경험을 구현하기 위해 8개 영역의 핵심 엔진을 자체 구현·통합했다.

| # | 기술 해자 | 핵심 구현 내용 (`current` 실측) | 저장소 근거 파일 |
| --- | --- | --- | --- |
| **1** | **클린룸 7밴드 분광 KM WebGPU 안료 엔진** | 420–670nm 7밴드 반사율 기저(`vec4<f32>` 2레지스터 SIMD), CSR 타일 비닝 + `var<workgroup>` 공유 메모리, CPU 동등 폴백, 상용 브러시 5종 · 필터 4종 | [`studio-webgpu-km7-spectral-core.ts`](../../apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts), [`studio-webgpu-km7-compute-wgsl.ts`](../../apps/web/src/domains/creator/render/studio-webgpu-km7-compute-wgsl.ts) |
| **2** | **차세대 WebGPU 컴퓨트 파이프라인** | GPU 버퍼 풀 · 비동기 셰이더 프리웜업 · 10-bit HDR 디더링 · 서브픽셀 스타일러스 예측 · Lanczos3 컴퓨트 변형 · Mipmap 타일 컬링 · 제로카피 패킹 · 모아레 억제 컴퓨트 스크린톤 | [`gpu-buffer-pool-and-warmup.ts`](../../apps/web/src/domains/creator/render/gpu-next/gpu-buffer-pool-and-warmup.ts), [`gpu-hdr-dither-and-frame-budget.ts`](../../apps/web/src/domains/creator/render/gpu-next/gpu-hdr-dither-and-frame-budget.ts), [`studio-webgpu-transform-resample-wgsl.ts`](../../apps/web/src/domains/creator/render/studio-webgpu-transform-resample-wgsl.ts) |
| **3** | **Wasm64 동적 3D 메모리 거버너 & 로컬 1 GiB 임포트** | 기기 메모리·Wasm64·OPFS 감지 기반 4단계 동적 상한(GLB/VRM 128 MiB~1 GiB, OpenSKP `.skp` 최대 256 MiB, OPFS 16 GiB 누적)과 서버 12 MiB 보안 계약 분리 | [`studio-3d-upload-limit-policy.ts`](../../apps/web/src/domains/creator/import-safety/studio-3d-upload-limit-policy.ts), [`studio-wasm64-memory-governor.ts`](../../apps/web/src/domains/creator/studio-wasm64-memory-governor.ts) |
| **4** | **역할 분리형 멀티 2D·3D 렌더러 권위 구조** | Konva(입력/표시), Canvas2D(fail-visible 커밋), Skia WebGL2(retained 벡터), Hokusai Rust WASM(자연매체), Three.js+VRM(기본 3D) + Babylon.js(전문 패스 분리) + 3D→2D 조명 동기화 | [`renderer-roles.md`](../engines/renderer-roles.md), [`studio-bg3d-2d-character-light-sync.ts`](../../apps/web/src/domains/creator/bg3d/studio-bg3d-2d-character-light-sync.ts) |
| **5** | **클린룸 출판급 웹툰 식자 엔진** | 타원 현 공식 기반 Knuth-Plass 2D DP 최적 줄나눔(한국어 `keep-all` 어절·단독 조사 보호·광학 커닝) + 우→좌 세로쓰기(Tategaki)·세로중가로·PAVA `O(m)` 루비 비겹침 | [`studio-knuth-plass-balloon-typeset.ts`](../../apps/web/src/domains/creator/typesetting-pro/studio-knuth-plass-balloon-typeset.ts), [`studio-tategaki-ruby-layout.ts`](../../apps/web/src/domains/creator/typesetting-pro/studio-tategaki-ruby-layout.ts) |
| **6** | **Fail-Closed Rights BOM & 4대 플랫폼 안전 슬라이스** | 폰트·브러시·3D·효과·오디오 6종 상업 권한 검증(NC·만료·출처 누락 시 차단) + 네이버(690px)·카카오(720px)·레진(800px)·글로벌 말풍선 보호 절단 ZIP 번들 | [`rights-bom-validator.ts`](../../apps/web/src/domains/creator/delivery-pack/rights-bom-validator.ts), [`platform-delivery-specs.ts`](../../apps/web/src/domains/creator/delivery-pack/platform-delivery-specs.ts), [`safe-slice-planner.ts`](../../apps/web/src/domains/creator/delivery-pack/safe-slice-planner.ts) |
| **7** | **로컬-퍼스트 SQLite WASM + OPFS & 멱등 동기화 큐** | 네트워크 단절 중 OPFS 로컬 권위 저장, 재접속 시 인과 정렬·멱등 키 중복 제거·연속 패치 압축·삭제 후 수정 충돌 명시 반환 + 저장소 자가 복구 패널 | [`studio-offline-sync-queue-merger.ts`](../../apps/web/src/domains/creator/live/studio-offline-sync-queue-merger.ts), [`StudioOpfsSelfHealPanel.tsx`](../../apps/web/src/domains/creator/storage/StudioOpfsSelfHealPanel.tsx) |
| **8** | **캔버스 직결 웹툰 분업 프로덕션 OS** | 역할별 레이어 RBAC, 컷 분할 리스·자동 병합, 5주 다회차 공정 스케줄러, AD 레드라인·규제 QA, 범위 제한 외주 링크·비가시 LSB 포렌식 워터마크, 로열티 정산 원장 | [`StudioDivisionOsHub.tsx`](../../apps/web/src/domains/creator/production-hub/division-os/StudioDivisionOsHub.tsx) |

---

## 5. 경쟁 포지셔닝 요약 (`/about/compare` 연계)

ToonStudio는 기존 데스크톱 전문 도구를 무조건 부정하지 않는다. 각 도구의 핵심 강점을 인정하고 **PSD · GLB · VRM · SKP 파일 호환**으로 공존하면서, **웹툰 1화 완주까지의 도구 전환 손실과 구독·설치 장벽**을 해소하는 포지션을 취한다.

| 비교 도구 | 타사 핵심 강점 | ToonStudio의 차별점 및 공존 전략 |
| --- | --- | --- |
| **Clip Studio Paint** | 10년+ 검증된 필압·`.sut` ASSETS 생태계·EX LT 변환 | 설치·기기 인증 없이 3초 브라우저 진입 + 타원 DP 식자 + Rights BOM + 분업 OS 직결 (PSD·ABR 호환) |
| **Procreate** | iPad 120Hz Apple Pencil 필기감 · 최소 크롬 · 1회 구매 | OS 제약 없는 데스크톱·태블릿·모바일 웹 + 3D 배경 + 벡터 선화 + 4대 플랫폼 슬라이스 (PSD/PNG 인계) |
| **Adobe Photoshop** | 16/32bit 색보정 · CMYK 인쇄 · 에이전시 PSD 표준 | 웹툰 전용 컷·말풍선·3D·분업·납품 흐름과 베타 ₩0 진입 (`ag-psd` PSD 왕복) |
| **Rebelle** | 중력 물 번짐 · 종이 섬유질 · 임파스토 물리 최상위 | 상업 안전 클린룸 7밴드 KM 분광 안료를 웹툰 원고·3D·식자 공정과 한 캔버스에 결합 |
| **Blender** | 풀 폴리곤 모델링 · 스컬프팅 · 리깅 · Cycles/EEVEE | 모델링은 Blender에 맡기고 GLB 최대 1 GiB 로컬 임포트 → 컷 카메라·3D→2D 조명 동기화로 왕복 단축 |
| **Creco** | 현업 제작사 검증된 웹툰 공정·일정·보안 검수 운영 | 검수·일정·외주 워터마크·정산을 실제 드로잉 캔버스·컷 리스와 단일 앱에 결합(소규모 팀 ₩0 베타 시작) |
| **ACON3D** | 한국형 웹툰 장르별 방대한 상용 3D 배경 카탈로그 | 구매한 `.skp`(최대 256 MiB)을 OpenSKP 워커로 브라우저 직접 변환 + Rights BOM 영수증 자동 관리 |

상세 5대 축 20개 항목 비교와 코드 실측 근거는 공개 웹 페이지 `/about/compare`에서 확인할 수 있다.

---

## 6. 현재 구현(`current`) vs 향후 목표(`target`) 및 사업 검증 로드맵

| 구분 | 현재 구현 완료 (`current`, 2026-11-22) | 향후 목표 및 미검증 과제 (`target`) |
| --- | --- | --- |
| **렌더링 · UI** | WebGPU 7밴드 KM·컴퓨트 변형/스크린톤/HDR 모듈 구현, 집중/심플/프로 3단계 밀도·인체공학 3종 동작 | WebGPU 브러시 런타임의 기본 `primary` 커밋 승격, UI/UX v2 단일 44px 바 · 7대 메뉴 · 82%+ 캔버스 전수 수렴([`DESIGN.md`](../../DESIGN.md), [`PRODUCT.md`](../../PRODUCT.md)) |
| **제품 · 고객 검증** | 공개 베타(`toonstudio.cloud`) 가동, 24씬 IR 발표 및 9분 18초 제품 투어 공개 | 무료 베타 창작자 **30명** 모집 · 직무별 심층 인터뷰 **10명+** · **3~6개월** 유료 전환 의사(WTP) 실증 확보 *(아직 달성 실적이 아닌 검증 목표)* |
| **수익 모델** | 베타 전 기능 ₩0(결제 비활성), 멤버십 등급 한도 정책 구조 구현 | 개인 Pro(월 19,900원 예시·미확정), Team/Education(미결정), 향후 소재 마켓 거래 수수료 모델은 실증 후 단계 도입 |
| **거버넌스 · 운영** | `audit:licenses` 590건 자동 통과, `validate:architecture` · `harness:check` CI 상시 가드, ₩0 하이브리드 인프라 운영 | 운영 DB 미적용 마이그레이션 20건(`0114`~`0133`) 승인 후 반영, OCCT LGPL 법무 검토, 4인 이상 전환 시 Remotion 라이선스 대응 |

---

## 7. 참고 정본 문서

- 제품 체계 및 UI/UX v2 경계: [`PRODUCT.md`](../../PRODUCT.md) · [`DESIGN.md`](../../DESIGN.md)
- 정적 IR 24장 발표자료 생성·검증 계약: [`docs/marketing/ir-static-deck.md`](../marketing/ir-static-deck.md)
- 1인 기업 상용화 라이선스 감사: [`docs/legal/solo-founder-commercial-license-audit-20261122.md`](../legal/solo-founder-commercial-license-audit-20261122.md)
- 운영 인프라 정본 지도: [`docs/operations/infrastructure-map.md`](../operations/infrastructure-map.md)
- Studio 렌더러·엔진 권위 원장: [`docs/engines/renderer-roles.md`](../engines/renderer-roles.md)
