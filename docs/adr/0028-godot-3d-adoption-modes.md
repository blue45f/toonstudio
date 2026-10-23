# ADR-0028: Godot 3D 적용 모드(브라우저 섬·빌드 도구·데스크톱 동반·서버 렌더)의 판정과 채택 조건

- 상태: Superseded — 2026-10-21 소유자 결정(PR #2354)으로 이 ADR이 전제한 운영 Godot 섬이 제거됐다. 대체 ADR은 없다. 모드 B~D는 채택하지 않고 보류한다(아래 정정 기록).
- 날짜: 2026-10-15 (상태 정정 2026-10-23)
- 범위: Studio 3D(편집·캡처·출력)에 Godot를 쓰는 네 가지 방식의 판정·조건·롤백, 실험 도구 `tools/godot-3d-poc`의 지위, 기존 Godot 섬(가상스튜디오 `godot-space`, `/play`, `/cuts`)의
  운영 보완 항목(라이선스 고지, 엔진 중복 전송, 소스 편입). 이 ADR은 `apps/*`, `packages/*`, 배포 설정, `STUDIO_RENDERER_ROLE_LEDGER`를 바꾸지 않는다.
- 관련: [ADR-0003](0003-one-primary-surface-owner.md)(Surface/Island당 주 소유자 1개), [ADR-0008](0008-license-isolation-policy.md)(라이선스 격리),
  [ADR-0018](0018-no-automatic-engine-fallback-vello-primary.md)(자동 엔진 폴백 금지), [ADR-0019](0019-renderer-role-ledger-single-authority.md)(렌더러 역할 원장),
  [ADR-0026](0026-labs-experimental-apps-engine-selection-and-promotion.md)(실험 위치·라이선스·승격), [평가 보고서](../reports/godot-3d-evaluation-2026-10-15.md),
  [PoC README](../../tools/godot-3d-poc/README.md), [측정 증거](../evidence/godot-3d-poc/2026-10-15/README.md),
  [전문 런타임 토폴로지(2026-07-18)](../studio-3d-engine-specialist-topology-2026-07-18.md)의 채택 게이트, [3D 차세대 구조(2026-09-10)](../studio/studio-3d-next-platform-architecture-2026-09-10.md) §3.4
- 문서 상태: 맥락의 "현재 상태"는 `current`, 결정은 `target`(제안)이다. 이 문서는 **제안만** 한다. 수용되기 전에는 아래 결정이 코드·배포·원장 어디에도 반영되지 않는다.

> **2026-10-23 상태 정정 (문서만 — 아래 본문과 결정 내용은 바꾸지 않았다)**
>
> - 2026-10-20 PR #2346 이 가상스튜디오 3D 무대를 Godot→Unity 로 바꿨고, 2026-10-21 PR #2354 가 소유자 결정("Unity 전환 취소 + Godot 버전도 제거")으로
>   Unity·Godot 3D 무대를 모두 걷어냈다: `public/godot-space`·`cuts-godot`·`play-godot` wasm 임베드, `tools/cuts-godot`·`tools/play-godot` 빌드 파이프라인, 엣지 워커의 무대 규칙.
>   가상스튜디오 무대는 클래식 2D(Phaser)만 남는다. 아래 "현재 상태"의 세 섬(godot-space·`/play`·`/cuts`)과 4.4.1 wasm 서술은 **2026-10-15 시점 기록**이며 더는 현재가 아니다.
> - 모드 A(브라우저 섬)의 운영 보완 항목(라이선스 고지·엔진 중복 전송·소스 편입)은 대상이 없어져 무효다. 모드 B~D(빌드타임 도구·데스크톱 동반·서버 렌더)는 채택하지 않고 **보류**한다.
>   Rejected 판정은 소유자 확인 뒤에 한다.
> - `tools/godot-3d-poc` 와 `docs/evidence/godot-3d-poc/` 측정 기록은 역사 자료로 남긴다. DB 테이블 `studio_godot_space_layout`·`studio_godot_space_background` 와
>   마이그레이션 0106·0107 은 PR #2354 가 의도적으로 dormant 상태로 남겼다.

## 맥락

요청(2026-10-15)은 "3D 기능이 Godot 없이는 한계를 보이니 Godot 적용을 적극 검토하라"였다. 결론을 정해 두지 않고 (1) 한계를 저장소 증거로 진단하고 (2) 적용 방식 네 가지가 각 한계를 푸는지를
공식 문서와 PoC 측정으로 확인했다. 자세한 근거와 수치는 [평가 보고서](../reports/godot-3d-evaluation-2026-10-15.md)에 있고 여기에는 결정에 필요한 만큼만 옮긴다.

현재 상태(`current`):

- Studio 3D의 대화형 편집은 Three/R3F가 단독 소유하고 Babylon이 격리된 캡처 전문 런타임이다. 영속 상태는 엔진 객체가 아니라 `StudioBg3dSceneDocument`다.
  두 번째 엔진은 채택 게이트 7항을 통과해야 한다(토폴로지 문서). Godot Web은 이미 "내장 편집 런타임 부적합"으로 기록되어 있다(차세대 구조 §3.4).
- Godot는 가상스튜디오 `godot-space`, `/play`, `/cuts` 세 게임형 섬에서 이미 운영 중이다. 같은 공식 4.4.1 `web_nothreads_release` wasm(43,699,190 B)을 세 URL에 싣고,
  프로젝트 소스는 저장소 밖에 있다. Godot는 렌더러 역할 원장에 등재되어 있지 않다.
- 이전 평가(`docs/reports/studio-3d-engine-evaluation-2026-09-12.md:104`)는 게임 엔진 PoC의 전제를 "웹 경로로 충족할 수 없는 필수 품질이 재현될 때"로 두었다.

이번 조사에서 확인한 것(자세한 표는 보고서 §4, §7):

1. 진단한 13개 한계 중 현 스택이 못 풀면서 Godot가 푸는 것을 찾지 못했다. 2점 투시·선화·톤 패스·카메라 roll/near clip/샷 연출은 동등하고, 압축 GLB 입력·활성화 번들·WebGPU 기능·격리 헤더·웹의 DOF 블러는 Godot가 더 나쁘고,
   모델링·천 물리는 Godot도 못 풀며, IK·대형 장면·실기기/모바일 메모리는 근거가 없다(빌드 재현성은 도입과 무관하게 운영 섬 쪽이 풀어야 할 문제다).
2. 공식 4.4.1 웹 템플릿의 wasm은 gzip 9.48 MB, brotli 7.28 MB다. 에디터 활성화 예산 260,000 B의 36.5배다. 4.5.1·4.6·4.7에서도 전송 크기는 줄지 않았다(4.7은 gzip +7.1%). 캐시가 적중하는 재방문에서도 첫 프레임까지 약 2.7~3.4초가 걸려 캐시는 전송만 없앤다.
3. Godot `GLTFDocument`는 `EXT_meshopt_compression`, `KHR_mesh_quantization`, `KHR_draco_mesh_compression`이 required인 GLB를 거절한다(4.4.1과 4.7 모두). Three는 모두 열었다.
4. `Camera3D` `PROJECTION_FRUSTUM`의 `frustum_offset`은 저장소의 2점 투시 공식과 같은 결과를 낸다. Godot의 차별점이 아니다.
5. 스레드 빌드는 교차 출처 격리가 필수이고, COEP 부모 안에 임베드하려면 자식도 COEP를 보내야 하며, `require-corp`는 CORP 없는 교차 출처 이미지를 막는다.
6. 소프트웨어 렌더링의 상대 비교에서 Godot가 Three보다 빠르다는 증거는 없다. 실GPU·모바일 측정은 하지 못했다.
7. PoC가 가능함은 보였다: GLB 런타임 로드, 툰 3단 + 뒤집은 껍질 외곽선, 궤도 카메라, 2점 투시, 선화·톤·깊이·법선 패스 PNG 반환, MultiMesh, JSON/`Uint8Array` 브리지.
   그러나 같은 기능이 현 스택에 이미 있으므로 가능하다는 사실만으로는 채택 사유가 되지 않는다.
8. 브리지에는 숨은 마찰이 9건 있었다(보고서 §6.2). 특히 iframe 안의 엔진은 부모 창이 만든 `ArrayBuffer`를 교차 realm 때문에 거부하고(0 B 수신), `Uint8Array` 뷰만 받는다.
9. 빌드타임 도구(모드 B)로 쓰려면 `--headless`로는 이미지를 만들 수 없다. `--headless`는 프레임을 그리지 않았고(`framesDrawn 0`), Xvfb + Mesa 소프트웨어 GL에서는 패스 PNG 캡처가 동작했다.

## 결정(제안)

### 1. 한 줄 판단

**Studio 3D 편집·캡처·출력 경로에는 Godot를 도입하지 않는다.** 기존 세 Godot 섬은 현상 유지하되 아래 정비를 별도 변경으로 진행한다. 데스크톱 동반(모드 C)과 빌드 도구(모드 B)는 필요가 입증될 때까지 보류하고,
서버 렌더(모드 D)는 비용 정책 때문에 평가에서 제외한다. 이 판단은 웹 export의 한계와 이 저장소의 예산·입력 형식에 대한 것이며 Godot 엔진 자체의 품질 평가가 아니다.

### 2. 모드별 판정·조건·롤백

| 모드 | 판정 | 채택·재평가 조건 | 롤백 |
| --- | --- | --- | --- |
| A. 브라우저 섬(iframe + JSON·`Uint8Array` 브리지, godot-space 브리지 계약 재사용) | 편집·캡처·출력 경로는 **미채택**. 기존 세 섬은 **현상 유지, 확장 없음**. 새 게임형 섬은 아래 조건을 모두 충족할 때 별도 ADR로 | (1) 사용자가 명시적으로 진입하는 화면에서만 지연 로드하고 도구 열기 경로에 넣지 않는다. (2) 섬 전용 활성화 예산을 정해 토폴로지 카탈로그 기준과 함께 기록한다. (3) 입력은 검증된 GLB 바이트와 SceneDocument 파생 DTO뿐이고 출력은 PNG·메트릭 DTO뿐이다. (4) 렌더러 역할 원장에 항목을 추가한다(ADR-0019). (5) 공유 엔진 URL, MIT 고지, 프로젝트 소스 편입을 먼저 끝낸다. (6) 캡처 어댑터 계약의 엔진 ID 목록(`StudioBg3dCaptureEngineId`, `studio-bg3d-capture-adapter.ts`)에 Godot를 추가해야 하는지 함께 결정한다. (7) 실기기(중급 안드로이드, 데스크톱 1종, iOS Safari)에서 채택 게이트 1·2·4·5·6항을 통과한다 | 호스트 쪽 기능 플래그를 끄고 iframe을 제거한다. 엔진은 정본 데이터를 소유하지 않으므로 SceneDocument·undo에 영향이 없다. 정적 자산과 원장 항목을 되돌린다 |
| B. 빌드타임·헤드리스 도구 | **보류** | (1) 구체적인 배치 작업이 정의되고 gltf-transform·gltfpack·Blender·Playwright 캡처로 해결되지 않음이 입증된다. (2) 로컬 러너(`batchCompute: local-m2-runner`)에서만 실행한다. (3) 엔진 바이너리는 공식 SHA512로 고정하고 저장소에 커밋하지 않는다. (4) 산출물 해시를 기록한다. (5) 이미지를 만드는 도구는 `--headless`가 아니라 GL이 있는 환경(Xvfb + Mesa 또는 GPU 러너)을 전제로 한다(`native/probe-render.sh`로 먼저 확인) | 스크립트를 제거한다. 산출물은 재생성 가능하다 |
| C. 데스크톱 동반 앱(`apps/desktop-sync` 연계) | **보류**(거부 아님) | (1) 웹 경로로 못 만드는 필수 품질이 재현되고 실기기 측정이 있다. (2) Forward+/Mobile 기능(웹에 없는 DOF 블러·SSR·SSIL·SDFGI·VoxelGI·컴퓨트 등)이 그 품질을 푼다는 PoC가 있다. (3) 정본 교환 계약(SceneDocument 정본은 웹, 로컬 앱은 파생물만)과 충돌 해결을 정의한다. (4) 서명·공증·업데이트 비용을 승인받고 ADR-0026의 웹 우선 근거("설치형이면 SHAPER 대비 장점이 없다")를 다시 검토한다 | 앱 배포를 중단한다. 동기화 폴더에는 PNG·메타 같은 파생물만 있으므로 데이터 손실이 없다 |
| D. 서버 렌더 | **제외** | 비용 정책(`config/free-infrastructure-policy.json`의 `free-strict`, `docs/operations/minimum-cost-deployment-policy.md`의 유료 승격 금지)이 개정되기 전에는 평가하지 않는다 | 해당 없음(미도입) |

### 3. 무엇을 / 어느 모드로 / 언제

| 무엇을 | 어느 모드 | 언제 |
| --- | --- | --- |
| Studio 3D 편집·캡처·출력 | 현행 Three/R3F + Babylon. Godot 아님 | 상시 |
| 가상스튜디오·`/play`·`/cuts` 같은 게임형 상호작용 | 모드 A 현상 유지(확장 없음) | 지금. 아래 4절의 정비를 먼저 |
| 새 게임형·퍼블리시드 3D 체험 | 모드 A(별도 섬, 지연 로드) | 제품 수요와 섬 전용 예산이 정해진 뒤, 별도 ADR |
| GLB 최적화·검증·LOD | 모드 B가 아니라 gltf-transform·gltfpack·Blender | 지금 그대로 |
| 웹에서 불가능한 렌더 품질(GI·DOF 블러 등) | 모드 C 후보 | 필수 품질이 재현되고 실기기 측정이 있을 때 |
| 서버 GPU 렌더 | 모드 D 제외 | 비용 정책 개정 전에는 하지 않음 |
| IK·손/소품(Godot 4.6+ IK 프레임워크) | 해당 없음(모름) | 웹에서 4.6+ 동작과 크기 대비 효과를 확인하는 별도 PoC 뒤 |

### 4. 기존 Godot 섬 정비 (도입 여부와 무관, 별도 변경으로)

1. **라이선스 고지**: Godot 엔진은 MIT다. 공식 문서는 라이선스 전문을 사용자가 볼 수 있게 해야 한다고 요구하고, ADR-0008 결정 1도 permissive 직접 번들에 고지·라이선스 사본을 앱 라이선스 페이지와 패키지에 동봉하라고 정한다.
   확인한 범위(`THIRD_PARTY_NOTICES.md`, 앱 안 라이선스 인벤토리 `engineering-license-inventory.ts`, 고지 생성기 `scripts/generate-third-party-notices.mjs`의 `OPAQUE_WASM_POLICIES`)에서 Godot 항목이 없다.
   Godot 엔진 라이선스와 번들된 서드파티 라이브러리 고지를 같은 방식으로 추가한다.
2. **엔진 중복 전송**: 세 섬이 같은 wasm을 세 URL에 둔다. 공유 URL로 합칠 수 있는지(`Engine` 설정의 `executable`·`mainPack`) 검증한다. 검증 전에는 합치지 않는다.
3. **프로젝트 소스 편입과 출처 봉인**: 섬의 Godot 프로젝트를 저장소로 옮겨 pck를 재현 가능하게 한다. 커밋된 wasm은 공식 `web_nothreads_release` 템플릿의 `godot.wasm`과 sha256이 같다(이 PoC가 공식 SHA512로 검증한 템플릿과 대조했다).
   ADR-0026 D절 21항의 관례처럼 출처와 해시를 한 파일에 봉인한다.
4. **`KHR_texture_basisu` 금지 목록 재검증**: 저장소 검증기(`studio-godot-background-glb.ts:31`)는 이 확장을 "실패 확정"으로 금지하지만, PoC는 KTX2 세 모드(UASTC + zstd, UASTC 무압축, ETC1S)와 선언만 한 파일을
   4.4.1·4.7 웹 템플릿과 네이티브 `--headless`·Xvfb에서 모두 열었다. 저장소 쪽 실측 파일·로그는 찾지 못했고 PoC의 시험은 128x128 합성 텍스처 하나다. 저장소 파이프라인이 만든 실제 파일로 `native/probe-ext.sh`를
   돌려 재현을 확인하기 전에는 목록을 바꾸지 않는다. 바꾸더라도 네이티브 프로브에서 디코드된 이미지가 `RGBA8`이었다는 점(GPU 압축 포맷 아님)을 메모리 영향으로 함께 검토한다.

### 5. 라이선스

- Godot Engine: MIT. 상용 이용과 배포가 가능하고, 라이선스 전문을 사용자가 볼 수 있는 곳에 두어야 한다. 엔진은 서드파티 라이브러리를 포함하므로 그 고지도 함께 필요하다
  (공식 "Complying with licenses", 2026-10-15 확인). ADR-0008의 4단 구분에서 직접 번들(permissive)에 해당한다.
- 이 PoC는 배포하지 않고 저장소에 엔진 코드도 넣지 않는다. 다만 사용자 정의 HTML 셸은 공식 4.4.1 `godot.html` 템플릿(MIT, Godot Engine contributors)을 바탕으로 한 파생 파일이라,
  파일 머리에 출처를 적고 Godot 4.4.1-stable `LICENSE.txt` 원문을 `tools/godot-3d-poc/LICENSE-godot-engine.txt`로 함께 두었다(영어 원문 그대로).
- GPL/AGPL 소스는 열람하지 않았다. 참조한 외부 자료는 Godot 공식 문서·릴리스 노트와, 공식 웹 템플릿이 내보낸 엔진 JS(MIT)뿐이다(ADR-0026 D절 17항 준수).

### 6. 공급망

- 바이너리는 공식 릴리스(<https://github.com/godotengine/godot/releases/tag/4.4.1-stable>)에서만 받는다. 신뢰 앵커는 같은 릴리스의 `SHA512-SUMS.txt`에서 해당 두 줄을 그대로 옮긴 `tools/godot-3d-poc/checksums/`다.
  `fetch-engine.sh`는 다운로드 직후 `sha512sum -c`로 검증하고 실패하면 추출하지 않는다. 웹 템플릿만 풀고 아카이브는 지운다.
- 엔진 바이너리, wasm, pck, 템플릿 아카이브는 저장소에 커밋하지 않는다(`.gitignore`). 커밋하는 것은 프로젝트·GDScript·셰이더·스크립트·측정 하네스·체크섬·결과 JSON이다.
- 재현성: 완전히 빈 캐시에서 `fetch-engine.sh`(SHA512 검증 포함, 17초) -> `build.sh`(44초)를 다시 실행해 6개 산출물(단일·스레드 변형의 wasm·js·pck)의 sha256이 측정에 쓴 빌드와 모두 같음을 확인했다(`docs/evidence/godot-3d-poc/2026-10-15/reproducibility-4.4.1.json`).
- 한계: 4.5.1·4.6 템플릿 크기는 멤버 CRC32만 검증했다. 운영에 쓰는 4.4.1만 전체 아카이브를 SHA512로 검증했다(4.7도 전체 검증).

### 7. 번들·배포 영향

- 미채택이므로 현재 번들·배포는 바뀌지 않는다. 새 섬을 채택할 경우의 영향: 섬 경로마다 wasm 43.7 MB(gzip 9.48 MB, brotli 7.28 MB)가 추가되고 Static Assets 개별 파일 한도 25 MiB를 넘으므로
  `prepare:cloudflare-static-assets` 대상 목록과 sidecar·R2 정책에 새 경로를 등록해야 한다(`deploy/cloudflare-static/README.md:99`). 공유 엔진 URL로 중복을 피한다.
- 헤더: 단일 스레드 섬은 격리 헤더 없이 동작한다. 부모가 COEP를 쓰는 경로에 임베드하면 섬 문서도 COEP를 보내야 하고(운영은 `credentialless`), CSP에는 `'wasm-unsafe-eval'`이 필요하다.
  PoC가 권장하는 이진 입력 경로(`is_js_buffer`)는 `'unsafe-eval'`이 필요 없다.
- 번들 예산: Godot 항목은 런타임 카탈로그에 없다. 도구 열기 경로의 예산(260,000 B)에는 넣을 수 없고 섬 전용 예산이 필요하다.
- 4.5 이후 템플릿으로 올려도 전송 크기는 줄지 않는다(보고서 §7.1).
- 재방문: 압축 전송에서 HTTP 캐시가 적중해도(wasm `transferSize` 0) 첫 프레임까지 약 2.7~3.4초(loadavg 11~14, 소프트웨어 렌더링)가 걸렸다(보고서 §7.2). 캐시는 전송(7.28 MB)만 없애고 압축 해제·wasm 컴파일·엔진 초기화는 방문마다 반복되므로,
  섬 전용 예산은 전송 크기와 활성화 시간을 함께 정해야 한다. 압축하지 않은 응답은 캐시에 들어가지 않았다(같은 보고서 `warm` 스위트).

### 8. Studio 문서 권위와의 정합

- 엔진은 정본 데이터를 소유하지 않는다(차세대 구조 `:245`). PoC 브리지는 이 원칙을 지키도록 설계했다: 호스트 -> Godot는 카메라·툰 파라미터와 검증된 GLB 바이트, Godot -> 호스트는 PNG와 메트릭뿐이며
  Godot 씬은 저장하지 않는다. 실제 연결 시 DTO는 SceneDocument에서 파생해야 하고 Godot 쪽 상태를 문서로 되돌리는 경로는 만들지 않는다.
- ADR-0003 결정 3(hot path readback 금지, readback은 final/export 경계에서만)과 정합한다: PoC의 GPU readback + PNG 인코딩은 `capture` 명령이 요청된 경계에서만 일어나고 편집 중 프레임 루프에는 없다.
- 단일 소유자 원칙(ADR-0003, 토폴로지 문서)상 같은 Canvas를 두 엔진이 소유할 수 없다. 모드 A는 별도 iframe의 격리 전문 런타임이어야 하고 대화형 포즈 편집을 Godot로 옮기면 이 원칙을 깬다.
- 엔진 교체는 Island 재컴파일로만 하고 장애 시 자동 폴백하지 않는다(ADR-0018). 섬 실패는 `unavailable`/`failed`로 노출하고 다른 엔진으로 넘기지 않는다.
- 렌더러 역할 원장(ADR-0019)에 Godot 항목이 없다. 기존 섬을 정식 provider로 올리든 새 섬을 추가하든 원장 항목(role, evidence 경로, ADR 번호)을 추가하는 변경이 먼저다. 이 ADR은 원장을 바꾸지 않는다.

## 대안(검토 후 기각)

| 대안 | 기각 사유 |
| --- | --- |
| Godot를 Studio 3D의 대화형 편집 런타임으로 교체 | 단일 소유자·SceneDocument 원칙과 충돌, 활성화 예산 36.5배, 압축 GLB 비호환, WebGPU 불가(보고서 L1·L8·L9) |
| Godot를 캡처 전문 런타임(Babylon 자리)에 추가 | Babylon이 지금 거부하는 입력(압축 확장)을 Godot는 더 넓게 거부하고 이점이 측정되지 않았다 |
| 4.6/4.7로 올려 L8을 푼다 | 4.5.1·4.6·4.7의 gzip/brotli는 4.4.1과 같거나 크다 |
| 맞춤 템플릿으로 wasm을 줄인다 | 공식 문서가 방법을 안내하지만 효과가 측정되지 않았고 엔진 소스를 빌드·보증해야 하는 별도 공급망 부담이 생긴다 |
| 지금 데스크톱 동반 앱을 만든다 | 필요한 품질 결핍이 입증되지 않았고 웹 우선 근거와 충돌한다 |

## 결과와 트레이드오프

- **Godot가 이기는 곳**: 게임형 상호작용 콘텐츠(이미 운영), 엔진 내장 최적화 도구(메시 LOD 자동 생성, 오클루전 컬링, MultiMesh), 4.6+ IK 프레임워크(웹 동작 미검증),
  프로젝트·체크섬·스크립트로 재현되는 단일 빌드(현 운영 섬보다 재현성이 좋다).
- **Godot가 지는 곳**: 활성화 번들, 압축 GLB 입력, WebGPU 기능, 격리 헤더 부담, 브리지 마찰(보고서 §6.2의 9건), 소프트웨어 렌더링 상대 성능, 단일 소유자 원칙과의 충돌, 웹의 DOF 블러 부재.
- **모르는 곳**: 실GPU·모바일 성능과 메모리, 맞춤 템플릿 크기, 4.5 이후의 웹 동작(SIMD, Compatibility SSAO, IK), VRM 휴머노이드 round-trip, `KHR_texture_basisu` 상충(원인 미규명), GPU 없는 실제 CI 러너에서의 캡처.
  이 중 하나라도 뒤집히면 모드 A·C의 판정을 다시 한다. 특히 실기기 측정은 어느 쪽 주장에도 필요하다.
- 소프트웨어 렌더링 결과는 성능 증거가 아니다(ADR-0026 §E 23항). 이 ADR이 근거로 쓴 수치는 크기, 호환성, 정확도(2점 투시), 브리지 CPU 비용, 같은 조건 상대 비교이며
  "Godot가 실기기에서 느리다"는 주장은 하지 않는다.

## 검증

- `pnpm harness:check`와 변경 파일 Secretlint(문서·PoC 하네스 변경). 문서 링크 검증(`scripts/validate-documentation.mjs`).
- PoC 재현: `tools/godot-3d-poc/README.md`의 재현 순서. 결과 JSON은 `docs/evidence/godot-3d-poc/2026-10-15/`.
- 운영 코드(`apps/web/src`, `apps/api`, `packages`)는 이 변경에서 수정하지 않았다.

## 후속 조치

- 이 ADR이 수용되면 4절의 정비 네 건을 각각 별도 변경으로 진행한다(고지 -> 소스 편입 -> 공유 URL 검증 -> basisu 재검증 순서 권장).
- 실기기 측정 계획: 같은 하네스의 `compare`·`bench` 스위트를 중급 안드로이드, 데스크톱 1종, iOS Safari에서 실행하고 입력 지연과 메모리 압력 시나리오를 추가한다.
  결과가 나오면 이 ADR의 "모르는 곳"을 갱신한다.
- 모드 C 재평가 트리거(웹 경로로 못 만드는 필수 품질)가 생기면 데스크톱 Forward+ 빌드와 `apps/desktop-sync` 연계를 별도 PoC로 다룬다.
- 수용 시 [렌더러 역할 원장](../engines/renderer-roles.md)의 생성 원장(`packages/studio-engine-registry/src/renderer-roles.ts`)에 Godot 항목을 추가할지 별도 결정한다.
