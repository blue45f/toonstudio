# 가상스튜디오 3D 테마와 엔진 검토 — 2026-10-29

문서 상태: `migration`. 기준은 `95efbaa33c9994a0dbf05f067859047a7d3395ae`에서 분기한 `codex/virtual-studio-asset-themes-20261029`의 구현 소스다. main 병합·운영 배포·Chrome/STP 성능 통과를 뜻하지 않는다. 미검증 목표는 `target`으로 구분한다.

## current — 사용자 결정과 기존 자산

2026-10-29 사용자 결정은 최상의 품질·기능·성능을 우선하고 Chrome과 **macOS Safari Technology Preview(STP)**를 비교 기준으로 삼는 것이다. Windows/Mac/Android Chrome은 기기별로 확인한다. 정식 Safari와 iOS/iPadOS Safari는 별도 검증 대상으로 남기며 STP 기능의 정식 출시일을 확정하지 않는다.

현재 Three 3D canvas·GLB 장비·10개 캠퍼스 디오라마·VRM 캐릭터가 존재한다. Godot·Unity 운영 무대 제거와 Three 무대의 존재를 구분한다. [역사 PoC 측정 기록](../evidence/godot-3d-poc/2026-10-15/README.md)은 이번 소스·기기의 성능 증거가 아니다. “클래식 2D만 남는다”는 2026-10-23 시점의 역사 기록이며 현재는 선택형 Three 3D stage가 존재한다. Godot·Unity 운영 무대 제거 결정은 유지하며, 이번 보충은 새 엔진 채택이나 과거 PoC의 재측정 결정이 아니다. [PR #2539](https://github.com/blue45f/toonstudio/pull/2539)의 번들 통합은 병합됐지만 원격 전달·운영 배포는 별도 증거가 필요하다. 종전 allow 16 / hold 49 정책은 2026-10-29 구매자의 상업적 사용 확인과 최대 활용 지시에 따라 확장한다. 기존 CC0 증빙은 보존하고 구매 확인 경로는 `licensed`로 구분한다. [소유자 결정](itch-purchased-commercial-use-owner-decision-20261029.md), [번들 권리 검토](itch-bundle-license-review-20261028.md), [활용 기록](itch-bundle-utilization-20261028.md)

## migration — 2D·3D 경계

| 영역 | 2D | 3D |
| --- | --- | --- |
| 데이터 | 기존 테마·원화·장식 계약 | `VirtualThreeTheme`·PBR·조명·모델·배치 역할 |
| 저장 | 기존 key 유지 | `virtual-space-three-theme:v1:<scope>` 전용 key |
| 미리보기 | 실제 2D 화면 | 준비/실패/실제 commit 상태를 표시하는 3D 선택기 |
| 렌더링 | Office2D/비교용 Phaser | 선택 시에만 지연 로드하는 Three |

사용자·방·작업점·권한·채팅·presence·포털·이동 manifest는 공통 권위다. 공통 DTO를 Phaser 타입에서 분리하고 Three props에서 2D `spaceTheme`·원화·장식 저장값을 제거한다. 3D 저장값이 잘못되면 오류를 표시하며 2D 값을 자동 이관하거나 기본값을 강제 저장하지 않는다.

선택기는 요청한 ID, 실제 표시한 ID, 마지막 저장 성공값을 구분한다. 필수 모델·텍스처·배치·자원 검사와 실제 commit이 끝난 테마만 적용할 수 있다. quota 실패 시 마지막 저장 성공값을 보존하고 재시도한다. 준비 실패는 이전 무대·조명을 유지한다. 3D에서 효과가 없는 2D 원화·장식·환경·조명·품질 옵션은 표시하지 않는다.

## migration — 테마 구성과 원본 보존

| 선택 | 재사용 자산과 3D 구성 |
| --- | --- |
| 기존 크리에이터 캠퍼스 | 기존 건축·10개 디오라마·장비·생성 소품·작업대. HQ/개인 공간을 캠퍼스로 바꾸지 않음 |
| 식물 정원 | Cute Park 나무·꽃·벤치, 기존 생성 이젤 |
| 판타지 길드 | Cute Dungeon 탁자·의자·서가, 기존 생성 자료 선반 |
| SF 실험실 | SF Arena Blue 패널, 기존 생성 콘솔·자료 책상 |
| 고딕 서고 | Dungeon 서가·Graveyard 장식·독립 3D 부조 |
| 차량 차고 | 검증된 차량·Blue 패널·기존 생성 책상 |
| 카페 | Dungeon 탁자·의자·컵·그릇, 실제 상판 지지 교차점 |

`workstation` 역할은 표시 의도이며 새 권한·상호작용을 만들지 않는다. 기존 비보행 collider 내부의 여유 공간만 사용하고 스폰·포털·상호작용 반경·NPC와 작업대 접근/앵커/퇴장 구간·영속 장비를 보호한다. 부족하면 임의 축소·새 보행 장애물 추가 없이 미리보기를 거부한다. 원본 mesh·UV·skin은 변경하지 않고 표시 transform만 균일하게 적용한다. 기존 placeholder 재질은 공유될 수 있어 개별 dispose 대신 숨기고 stage 전체 수명에서 해제한다.

등록 참조는 승인된 번들 모델과 기존 generated metadata다. main 신규 Tripo 101개와 별도 검토 중인 원본/rig 165개는 다른 집합이다. 원본↔웹 파생·SHA·크기·재질·스킨·모션·권리 근거를 연결한 뒤 승격한다. 기존 Tripo/Varco 출처를 합쳐 새 CC0 판정을 만들지 않으며 새 유료 생성 요청도 실행하지 않는다.

2026-10-29 소유자 결정에 따른 원장 소스는 기존 CC0 16행과 구매 확인 `licensed` 38행을 합친 allow 54행, 기술 편입 대기 11행을 기록한다. 팩의 권리 행 수를 실제 모델 수로 사용하지 않는다. 별도 실제 편입 실행은 기존 8팩·1,764개를 보존하고 Cemetery Statues 50개·Small Props 115개를 추가해 현재 private 입력과 공개 descriptor를 10팩·1,929개·1,968,727,612바이트로 갱신했다. 공개 projection은 일반 팩 49행·crowd 5행·기술 대기 11행이며 모델이 없는 팩도 있어 행 수와 모델 수를 구분한다.

추가 편입 소스는 Cemetery Statues와 Small Props Pack의 자기완결 GLB를 대상으로 한다. additions recipe의 50개·115개는 기존 로컬 카탈로그 기록이며 새 실측값이 아니다. `append-creator-bundle-local-ingest.mjs`는 현재 원장·기존 projection SHA와 descriptor·원본 바이트를 대조한 뒤 새 private envelope의 `input/`에 복사한다. 원본·기존 입력·공개 디렉터리는 변경하지 않는다. 2026-10-29 실제 append→generator 1회 실행은 15.344초·exit 0·시간 초과 없이 끝났다. Cemetery Statues의 실제 50개는 6,424,372바이트, Small Props의 실제 115개는 68,879,660바이트였다. 기존 1,764개의 descriptor ID·path·bytes·SHA·tris와 기존 8개 재현 설정을 보존했다. 두 소유 process group은 종료했고 허용한 공개 metadata·재현 config·기존 genre packIndex 세 파일만 갱신했다. 원본·기존 private 입력·public raw 모델·운영 R2는 변경하지 않았다. 이 단계의 모바일 GLB 구조·해시 검사와 실제 브라우저 Worker·이미지 decode·렌더 검증은 별개이며 후자는 미완료다. 로컬 원문 증거는 `licensed-data-go5-20261029T0927Z/receipt.json`과 `completion.json`에 보존한다.

조명 레시피는 day/studio/night HDRI 준비와 별도로 실제 ambient/key/fill 광량·색온도·방위/고도를 적용한다. 기존 노출을 유지하기 위해 key 500 lux→intensity 1.42, ambient 120 lux→1.04, fill 200 lux→0.6의 명시 기준으로 정규화한다. 이는 디자인 레시피의 상대 광량 변환이며 실제 lux·색 정확도·노출의 광학적 캘리브레이션은 미완료다. baseline 복귀는 기존 preset과 광원 배치를 보존한다.

## migration — 로딩·수명·메모리

검증된 Blob만 GLTFParser에 전달한다. 번들은 현재 팩·권리·SHA·크기를 대조하고 기존 Worker 검증을 재사용한다. 같은 내용의 정상 재조회와 실제 발행 변경·A→B→A를 구분하는 publication revision으로 여러 소스의 최종 설치를 검사한다. GLTF decode·shader compile 뒤 설치 직전에도 출처를 다시 검사한다. 새 theme scene을 준비해 같은 동기 작업에서 교체하고 카메라·배우·presence를 재생성하지 않는다. 취소된 parse/compile 종료 후 다음 요청을 시작해 준비 작업 중복을 막는다.

commit 조명 callback 실패는 실제 HUD override를 포함한 이전 상태와 무대를 복원한다. 교체 완료 후 구 자원 해제만 실패한 경우에는 실제 표시된 새 무대를 유지하고 추가 준비를 차단해 자원 누적을 막는다. 이러한 실패 경로도 별도 회귀·브라우저 검증 대상이다.

clone은 geometry/material/texture를 공유하고 skeleton은 독립 소유한다. 원본 root·clone·늦은 모델·bitmap의 수명을 구분한다. peer 퇴장과 같은 peer의 avatarIndex 변경도 처리한다. 게임 판정은 매 프레임 유지하고 HUD는 의미 변경 시 발행한다. 1초 rAF 통계는 프레임 간격이며 CPU/GPU 실행 시간 측정이 아니다.

inventory는 실제 typed-array 바이트, 호출자가 제공한 검증 지표, GPU 보수 상한, 관측 불가능 영역의 정책 예약을 구분한다. 동일 실제 객체/버퍼만 중복 제거하며 같은 SHA의 별도 decode를 할인하지 않는다. 구·신 scene·Blob·parse buffer·decoded 이미지·skeleton/instance·환경광 맵·shadow·framebuffer·render target을 포함하고 미확인 자원 크기를 0으로 넣지 않는다.

초기 512 MiB 상한과 JS/WASM/driver 등의 예약 128 MiB는 **미캘리브레이션 설계 예산**이다. 기기 VRAM·물리 RAM·안전한 실제 heap 측정치나 프레임 성능 보장이 아니다. decode 전·compile 전후에 누적 peak를 검사한다. 초과 시 기존 테마를 유지하며 해상도·재질·모델·그림자 품질을 몰래 하향하지 않는다. 실제 기기별 peak와 장시간 검증 뒤 정책을 조정한다.

2026-10-30 실제 Chrome·Metal 호스트의 첫 정상 정원 전환에서 `VirtualThreeRendererCapacityError`를 확인했다. drawing buffer 3840×2160·MSAA4에서 전체 보수 합산은 1,753,553,900바이트였고 미확인 자원은 없었다. 그중 framebuffer 364,953,600바이트와 예약 134,217,728바이트, scene CPU buffer 31,480,100바이트, GPU geometry 37,797,888바이트만으로도 초기 512 MiB를 초과했다. 기본 self와 NPC 8명은 서로 다른 9종 VRM이므로 동일 actor URL의 반복 로드로 이 오류를 설명하지 않는다. 초기 baseline은 즉시 표시하지만 이후 전환은 baseline 전체까지 검사하는 계약과 초기 예산의 규모가 맞지 않았다. 이 값은 실제 물리 메모리 사용량이 아니다.

수정 소스는 기본 512 MiB 정책을 유지하고, 기존 고품질 Three canvas에서 `desktop-high-quality-v1` 후보 프로필을 명시적으로 주입한다. 후보의 고정 전체 예산은 3 GiB, 그 안의 JS/WASM/driver 예약은 기존 128 MiB다. 요청별 자동 증액이나 baseline 차감은 하지 않는다. 미확인 자원 거부, 기존·신규 scene의 동시 peak, source lease별 복사·decode, framebuffer와 환경광 자원을 계속 합산한다. 동일 실제 `Texture.source`와 Three 0.186.1의 GPU cache key가 같은 경우에만 GPU 할당을 공유 계산하며, 다른 Source 또는 별도 decode를 SHA가 같다는 이유로 합치지 않는다.

2026-10-30 실제 호스트에서 처리된 내부 예외마다 멈추는 디버거 관측을 끈 조건은 정원 표시·저장·reload를 통과했다. 해당 대조에서도 실제 capacity breakpoint와 uncaught pageerror 판정은 유지했다. 다음 판타지 테마의 decode 전 원장 16번째 값은 2,193,406,642바이트였고 2 GiB 후보를 45,922,994바이트 초과해 거절됐다. 예외 pause가 없는 조건의 재진입 성공을 제품 클릭 수정이나 보편적인 경합 해결로 표현하지 않는다.

후보 3 GiB는 이 원장과 등록 자원의 보수적 준비 계획을 검증하기 위한 유한 설계 범위다. 기존 Worker의 번들 12종 metrics와 현재 공급 GLB 생성 모델 4종의 헤더 계산은 각 레시피의 source CPU·pending GPU 예약을 재현한다. 관측된 판타지 원장에 다른 모델의 old/new 두 벌까지 중복 보수 예약한 참고 계획치는 3,100,316,770바이트다. 이 수치는 모든 architecture·14개 GPU cache-key 조합·정렬·parser 수명·아바타 전환을 증명한 완전 상한이나 실제 물리 메모리 측정이 아니다. 기본 512 MiB·128 MiB 예약·원장 산식은 그대로 두고 후보의 유한 ceiling만 명시적으로 조정했으며, 요청별 자동 증액을 하지 않는다.

같은 DPR·화질에서 테마 6종, 아바타 교체, baseline 복귀·reload와 2회 반복의 전체 peak·headroom·정리 후 원장을 실제 검증해야 한다. 이 3 GiB 후보의 전체 동선·장시간 안정성과 기기 지원 완료는 아직 미검증이다. 상한을 넘거나 자원 크기가 불명확하면 실패를 유지하며, 모델·재질·해상도를 낮추거나 원장 값을 임의 차감해 통과시키지 않는다.

WASM32의 4 GiB는 단일 선형 메모리 주소 범위이며 전체 브라우저·JS heap·GPU 공통 한도가 아니다. Memory64는 WASM32 빌드를 자동 전환하거나 GPU/물리 메모리를 늘리지 않는다. JS·GPU·선택형 WASM decoder와 Unity/Godot heap을 각각 측정한다. [V8 설명](https://v8.dev/blog/4gb-wasm-memory), [Unity 6.6 Memory64](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/develop/wasm-64bit-support)

STP 252 공식 노트에 Memory64와 multiple memories가 기록돼 있다. 2026-10-29 확인한 최신 STP는 255(2026-10-22)다. STP 기준에서 ‘Safari는 Memory64 미지원’이라고 일괄 판정하지 않는다. Unity의 Safari 26.5 제약을 모든 STP로 확대하지 않는다. [STP 252](https://webkit.org/blog/18304/release-notes-for-safari-technology-preview-252/), [STP 255](https://webkit.org/blog/18482/release-notes-for-safari-technology-preview-255/), [Apple 배포 목록](https://developer.apple.com/safari/resources/?filter=webkit), [Unity 전제 조건](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/develop/wasm-64bit-support/wasm-64bit-prereq)

초기 framebuffer 예약식은 표시용 단일 sample color 3개에도 MSAA 배율을 곱해 drawing buffer 3840×2160·4 samples 조건에서 약 506 MiB를 계산했다. 수정 소스는 표시용 color 3개와 별도 MSAA color/depth attachment를 분리해 같은 조건에서 약 348 MiB를 예약한다. 512 MiB 정책·DPR·sample·화질은 바꾸지 않았다. 이 값은 조건부 설계 산술이며 현재 기기의 실제 sample 수·상주량 측정이 아니다. 고해상도 실장면의 전체 peak·수명 검증이 끝나기 전 성능/지원 완료로 승격하지 않는다.

## target — 엔진 비교

아래는 2026-10-29 공식 자료 확인과 설계 추론이다. 같은 ToonStudio 장면의 실제 엔진 비교 벤치마크는 없다.

| 후보 | 확인한 특성과 이번 판단 |
| --- | --- |
| Three.js | GLB/PBR/VRM·기존 React 통합을 보존하는 기준 구현. WebGPURenderer는 WebGPU/WebGL2 경로를 제공하지만 최신 manual은 experimental로 분류하며 기존 ShaderMaterial/onBeforeCompile/EffectComposer를 그대로 옮길 수 없다. MIT. TSL·후처리·export 검증 전 단순 교체로 최속이라 선언하지 않는다. [manual](https://threejs.org/manual/pages/webgpurenderer), [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) |
| Babylon.js | WebGL/WebGPU·PBR·물리·navigation 도구. 엔진/desktop Editor Apache-2.0. Havok SIMD·navigation addon/worker 제약을 별도 확인한다. Shaper/격리 캡처 세션과 소유 경계를 보존해 비교한다. 구매 원본을 Editor의 외부 FBX 변환 서버에 임의 업로드하지 않는다. [사양](https://www.babylonjs.com/specifications/), [WebGPU](https://doc.babylonjs.com/setup/support/webGPU/), [navigation](https://doc.babylonjs.com/features/featuresDeepDive/crowdNavigation/v2Intro/) |
| PlayCanvas | Engine V2 WebGL2/WebGPU·React. 엔진과 Editor 프런트엔드 MIT. 앱 ZIP self-host와 협업 Editor 전체 백엔드 self-host는 다르다. 비공개/팀 서비스 조건을 구분한다. [브라우저](https://developer.playcanvas.com/user-manual/engine/supported-browsers/), [React](https://developer.playcanvas.com/user-manual/react/), [Editor 공개](https://blog.playcanvas.com/playcanvas-editor-frontend-is-now-open-source/) |
| Godot stable | WASM+Compatibility WebGL2. stable web에 WebGPU 없음. Godot4 C# web export 불가, 기본 single-thread. 엔진/Editor MIT. authoring 장점과 이번 WebGPU 우선 목표의 차이를 검토하며 WebGL2만으로 실제 성능 열세를 단정하지 않는다. [Web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html), [license](https://godotengine.org/license/) |
| Unity 6.3 LTS | WebGPU Experimental, WebGL2 기본. 공식 glTFast 런타임 로딩. 공식 모바일 web 지원 존재. WASM heap·다운로드·React bridge·재질/모션/출력 의미를 비교한다. [WebGPU](https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/webgl/develop/graphics/web-gpu/enable), [glTFast](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.19/manual/ImportRuntime.html) |
| Unity 6.6 Current | WebGPU가 experimental을 벗어난 production API. compute·indirect·GPU skinning·VFX 경로. WebGL2 기본/WebGPU opt-in. 동기 GPU readback 대신 AsyncGPUReadback 경로 필요. 비게임/Industry/SaaS/runtime 배포 grant를 확인하고 별도 근거로 채택한다. [6.6 변경](https://docs.unity.com/en-us/engine/6000.6/manual/whats-new/unity66), [기능](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/develop/graphics/web-gpu/features), [이용 조건](https://unity.com/legal/editor-terms-of-service/software) |
| Unreal Pixel Streaming | 서버 GPU→영상 인코딩→WebRTC로 브라우저 네이티브 GLB 렌더와 다르다. 입력 지연·선화/문자 압축·세션 비용을 별도 비교하며 새 유료 GPU 서버는 만들지 않는다. [공식 문서](https://dev.epicgames.com/documentation/unreal-engine/pixel-streaming-in-unreal-engine) |
| Phaser/Pixi/Cocos | Phaser/Pixi는 2D 보조 후보이며 2D WebGPU를 GLB 3D 지원으로 확대하지 않는다. Cocos runtime MIT와 proprietary Editor 및 비게임 제작 도구 계약은 구분한다. [Pixi renderer](https://pixijs.com/guides/components/renderers/), [Cocos 약관](https://download.cocos.com/CocosUdc/agreement/Cocos_User_Service_Agreement_en_20220901.html) |

엔진이 영속 데이터·권한 정본을 새로 소유하지 않는다. [ADR-0019](../adr/0019-renderer-role-ledger-single-authority.md), [ADR-0022](../adr/0022-studio-authority-identity-production-modes.md), [ADR-0026](../adr/0026-labs-experimental-apps-engine-selection-and-promotion.md)을 따른다.

## target — 검증과 승격

1. 정확한 branch/SHA의 단위 테스트·타입·harness·architecture·React Doctor·bundle 검증을 실행한다. 과거 SHA의 로그를 이번 통과로 쓰지 않는다.
2. Chrome Windows/Mac/Android와 macOS STP에서 같은 원본 SHA·viewport·DPR·카메라·개수·재질·조명·그림자·후처리를 고정한다. cold/warm 활성화와 첫 조작을 각각 측정한다.
3. CPU/GPU·rAF P50/P95/P99·입력 지연·draw/triangle·decode/clone/upload peak·반복 교체/peer 퇴장·30분 이상 자원 수명을 확인한다. SwiftShader는 실제 GPU 성능 증거가 아니다.
4. 미리보기·저장·새 탭/scope 복원·실패·동일 ID 재시도·응답 역전·context/device loss·오프라인 오류, 작업점 접근/앵커/퇴장·포털·NPC·협업 권한을 실제 UI에서 확인한다.
5. 동일 품질로 기준을 만족한 후보만 지원으로 승격한다. STP가 통과하지 못하면 Chrome 우선을 유지할 수 있다는 사용자 결정을 적용하되 기능 삭제·품질 하향으로 통과시키지 않는다.

검증 상태: 첫 관련 Vitest 검사를 단일 worker·270초 상한으로 1회 실행했다. HEAD는 `95efbaa33c9994a0dbf05f067859047a7d3395ae`, 입력은 변경·신규 64파일의 SHA `68239c4bc9dd4ddf951bbd508b10f532bc6d1cda1065b2b373586e590aa0dad6`이며 실행 전후 입력은 같았다. 실제 16.758초·exit 1·시간 초과 없음, 24개 파일 중 22개 통과/2개 실패, 수집된 223개 테스트 중 221개 통과/2개 실패다. 별도로 model-source 테스트 1개 파일은 누락된 함수 닫기 괄호 때문에 수집에 실패했다. 해당 파일의 사례를 통과 개수에 넣지 않는다.

첫 실패 후 누락 괄호와 두 surface fixture를 수정했다. texture loader의 optional signal 인자 계약을 반영하고, 낡은 캠퍼스 20개 고정값을 현재 공통 상호작용 전체의 ID·zone·point·radius 및 실제 ring 좌표·부모 연결 검사로 바꿨다. 원본 로그·입력 snapshot·receipt는 로컬 `/tmp/toonstudio-virtual-three-vitest-20261029T053553Z/`에 보존한다.

2026-10-29 07:25 UTC의 두 번째 관련 Vitest는 같은 HEAD에서 16.978초·exit 1·시간 초과 없이 종료했다. 고정한 변경·신규 85파일 SHA는 `d7adecc96e7b66eb6642c7b58eb4bdf6a7859a7482c8bb7c037b55571e0f0b3b`, 검증 설정 5개를 더한 90파일 입력 SHA는 `7ab952abe0f6f7017905668936ca10348418e45dca80ea56197c517491811542`다. 전후 입력은 동일했다. 25파일 중 24파일 통과, 302개 중 300개 통과/2개 실패이며, 이전 surface 두 사례와 model-source 수집 오류는 실제로 해결됐다. 출처 표기·캐시·4K framebuffer 회귀도 이 실행 범위에 포함됐다.

남은 두 사례는 model-source 취소 회귀다. 실제 catalog 재조회에 GLB `Response`를 공유한 fixture와, generated survivor 검사에서 실제 Worker client로 들어간 상태를 조사했다. 실제 shared-loader 사례를 별도 파일에 격리하고 URL별 응답 소유권과 취소·공유 단언을 유지하는 수정이 필요하다. 제품 취소 동작을 이 결과만으로 완화하지 않는다. 두 번째 원본 증거는 `/tmp/toonstudio-virtual-three-vitest-20261029T0727Z/`에 있다. 첫 실패에서 멈췄으므로 뒤따르는 Node 검사는 실행하지 않았다.

2026-10-29 08:10 UTC의 좁은 두 파일 재검사는 6.841초·exit 1·시간 초과 없이 31개 중 30개 통과/1개 실패로 끝났다. HEAD는 같고 검증 설정을 포함한 91파일 입력 SHA는 `42fb708d7df03c7da9203f4331405c8f3231feafd182eb5145ec9714b935b7e8`, 전후 동일이다. 새 실제 shared-loader 사례는 통과했고 generated survivor의 mock 연결만 실패로 남았다. Node 단계는 이 실행에서도 시작하지 않았다. 증거는 `/tmp/toonstudio-virtual-three-narrow-20261029T081010Z/`에 보존한다.

설치된 Vitest 4.1.12의 manual mock 구현은 공유 callstack을 사용하며 동시 `Promise.all(import(), import())` 제약을 주석으로 명시한다. 보정 소스는 테스트의 worker module을 autoSpy와 정적 export 포트로 연결한다. 최초 caller 취소·생존 caller 성공·독립 fetch 2회·worker 1회·생존 signal 단언은 유지한다. 제품 동시성·Worker 정책을 변경하지 않았다. 2026-10-29 08:50 UTC의 마지막 보정 재검사에서 두 Vitest 파일의 31개가 전부 통과했고, 이어 append/native-proof/rights-form 세 Node 파일의 45개가 전부 통과했다. 전체 6.088초·exit 0·skip 0·시간 초과 없음이며 소유 PG 38270·38289 잔류와 강제 정리는 0이었다. HEAD는 같고 91파일 입력 SHA는 `0f164d705a6612c265fee4376475b87d92b2c9d25efd3b6e8250532f606a7fbc`, 각 단계 전후 입력은 동일했다. 증거는 `/tmp/toonstudio-virtual-three-narrow-20261029T085052Z/summary.json` 및 각 단계 receipt다. 앞선 302개 전체를 이 실행에서 재실행한 것은 아니다.

타입 검사·harness·React Doctor·빌드·브라우저/GPU 검증·commit·push·PR·배포는 미완료다. STP 실행도 아직 수행하지 않았다. 편입 후 2026-10-29 09:52 UTC 검사는 실제 Node 12파일·206개와 Vitest 27파일·305개가 모두 통과했다. 총 27.565초·exit 0·skip 0·시간 초과 없음이며 source 91파일 SHA `b919c68fa80f078d8cad137b83a3cc0741898a8e412e67b91b327440dd17bdd1`, 설정을 포함한 96파일 입력 SHA `d431eaa31dc755d6f84c863180b00c196931f2db03f3854bf81489b860b4c0b2`가 각 단계 전후 동일했다. 없는 office2d stage-mode 개별 필터는 수집·통과로 계상하지 않았으며 실제 StageSurface의 2D/legacy 회귀와 구분했다. 원문은 `/tmp/toonstudio-virtual-three-full-related-go4-20261029T0940Z/completion.json`이다. 앞선 31·45개 결과를 중복 가산하지 않는다.

2026-10-29 07:00 UTC 전후 읽기 확인에서 원격 main `5de6edc086b2ebb66f6060fec8f2dee8e390f4b7`의 필수 검사도 녹색이 아니었다. [Actions run 40811392205](https://github.com/blue45f/toonstudio/actions/runs/40811392205)의 annotation은 계정 결제·사용 한도 문제로 작업이 시작되지 않았다고 반환했다. 이 상태를 코드 회귀 실패나 로컬 검증 통과로 바꿔 기록하지 않는다. 사용자 운영 배포 승인과 별개로 최종 배포 SHA의 필수 CI·산출물·롤백·사후 스모크를 확인해야 한다.

2026-10-29 10:05 UTC 첫 canonical 하네스는 lint 14오류·3경고에서 10.949초·exit 1로 중단했다. 뒤의 secret·architecture·전체 타입 검사는 실행하지 않았다. native 버튼의 키보드 경계, provider의 실제 의존성·테스트 effect, HUD의 비컴포넌트 함수 분리, 오류 cause·mip 종료 조건·동일 Unicode scope 검증을 최소 보정했다. 규칙·키보드·저장·권리·화질·해상도 정책은 완화하지 않았다.

2026-10-29 10:43 UTC에 종료한 보정 실행은 source 92파일 SHA `ef761e470dcaa510530d1c4a52dcb5ad35931fb51b40f6093929bb81870d82fa`에서 변경 lint 통과·관련 10파일 109개 회귀 통과 뒤 canonical을 실행했다. canonical의 lint·secret·architecture는 통과했고 정식 16 GiB Web TSC에서 7개 오류로 중단했다. canonical 547.981초·전체 572.041초·exit 2·시간 초과 없음, 모든 단계 97파일 입력 SHA `294a9bd64bb3c37ded95e3a64a3a8c91b0523c4e73df0d4044205a1b1cb66677` 및 설치 identity는 전후 같았다. API 타입 검사는 실행하지 않았다. root/helper/PG 잔류는 0이었다. 원문은 `/tmp/toonstudio-virtual-three-lint-recovery-20261029T1020Z/completion.json`이다.

위 7개 진단의 최소 보정 소스는 geometry fixture·import/upload 구분·구매 권리 null guard와 실제 nullable bone buffer·WebGL sample enum의 관측 구분이다. 실제 bone buffer를 확인하지 못하면 0바이트의 정상 관측으로 간주하지 않고 기존 unknown/admission 오류를 유지한다. 수정된 소스의 타입 통과는 아직 미확인이다. 알려진 진단의 관련 회귀·lint를 확인한 뒤 최신 main 통합 후보에서 전체 canonical과 정상 pre-push를 검증하며, 과거 95 base의 TSC를 그대로 반복 실행해 새 후보 통과로 사용하지 않는다.
