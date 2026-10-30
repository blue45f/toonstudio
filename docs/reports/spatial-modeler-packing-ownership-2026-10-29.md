# 공간 모델러 표면 출력·품질 선택·실행 소유권 후속 구현

- 상태: `migration` — 초기 25파일 실행은 359통과·2실패였으며 fixture 보정 후 MR 6회귀는 통과했다. 환경 전용 TSC의 nullable 입력 2오류를 보정한 뒤 별도 TSC와 6파일 110회귀도 통과했다. 변경 ESLint는 남은 2오류에서 중단해 source를 보정했으며 정적 재검증과 Secretlint가 남았다. 전체 하네스·실제 GPU·main 통합은 미완료다.
- 날짜: 2026-10-29.
- 작업트리: `sketchup-primitive-edit/toonstudio`, 브랜치 `codex/sketchup-scene-export`.
- 기준 HEAD: `35307f655e0ce855cca0f363c9b98c448e4ea8f9` + 미커밋 변경.
- 전체 요구: [기능 내재화 원장](../features/sketchup-feature-coverage.md)의 SK01–SK33을 유지한다. 이 증분은 SK28 출력·SK32 수명/품질의 일부이며 전체 구현 완료가 아니다.
- 이전 [113회귀·scoped 타입 검사](spatial-modeler-quality-validation-2026-10-29.md)는 이전 입력 체크포인트에 한정한다. 새 구현을 그 성공에 합산하지 않는다.

## 별도 roughness·metalness의 개인 출력

기존 경로는 서로 다른 MR 이미지를 명시 거부했다. 후속 artifact는 `deferred-owned`를 지정하고 개인 graph의
UV 정규화·필요한 affine bake 뒤 raw 캡처를 준비한다. 직접 graph/UV helper의 기본 `shared-only` 거부는 유지한다.

두 원래 image의 크기·선형 색공간·UV channel/유효 행렬·sampler가 일치할 때 roughness G와 metalness B를 새
RGBA8로 복사한다. R/A와 없는 map의 채널은 255다. source의 alpha가 0/128이어도 데이터 채널을 Canvas 합성하지 않는다.
두 MR 슬롯은 같은 packed texture pointer로 연결해 stock exporter의 별도 이미지 합성을 피한다.
같은 ordered pair는 한 번만 packing하고 AO·base map이 원래 image를 공유했다면 그 별도 binding/PNG를 유지한다.
material roughness·metalness·AO scalar는 바꾸지 않는다.

원래 고유 texture의 raw 합계와 새 packed RGBA를 allocation 전에 예산에 반영한다. 현재 artifact는 원래 texture의
decoded bytes도 사전 검사한다. 이 장부를 PNG 압축·registry 복사·GPU·최종 BIN을 포함한 전체 프로세스 peak로
확대하지 않는다. 원본 해상도를 줄이거나 안전 한도를 넓혀 성공시키는 경로는 추가하지 않았다.

bridge는 모든 capture·packing·PNG 등록·입력 descriptor 재검사를 마친 뒤 binding을 설치한다. 실패 시 자신이
설치한 binding과 packed texture만 정리한다. 성공 후 artifact는 `parseAsync()`가 실제 종료된 뒤 binding 복원·packed
정리 → capture support의 비동기 정리 → PNG registry → 개인 graph 순서로 정리한다. 원본 cache/Source를 폐기하지 않는다.

서로 다른 recipe·크기·sampler, projective UV·channel 예산·사용 중 authored mip은 계속 명시 거부다.
범위는 base-level G/B exact이며 자동 mip 재생성·외부 renderer의 anisotropy 동등성은 별도다.

작성한 회귀는 순수 builder, 실제 graph/UV 경로 6개, 실제 bridge/PNG registry의 parameterized 31개를 포함한다.
실제 GLTFExporter의 texture 경로·WebGPU/실제 GPU 픽셀·Worker 왕복은 별도 검증해야 한다.

## 품질 선택과 canvas 복구

품질 패널의 close/unmount/GPU 오류에서 전역 메모리 모드를 자동으로 초기화하던 처리를 제거했다.
명시적 auto 선택은 유지한다. 실제 canvas의 typed 복구 상태와 지속 device unavailable은 checkpoint를 취소하고,
패널·renderer owner가 바뀐 뒤 늦은 저장 완료는 high를 발행하지 못한다. 다른 canvas의 오류는 무시한다.

canvas별 현재 snapshot과 lease를 WeakMap으로 관리한다. lost/failed/degraded 상태는 dispose 후에도 남기고 같은
canvas 재설치 시 snapshot·timestamp·손실 이력을 승계한다. 실제 restored/reset 성공 또는 failed 전용 retry가 필요하며,
이전 controller의 retry·상태 게시·예약 redraw·dispose가 새 lease를 변경하지 못한다.

검사 배정 전 읽기 검토에서 checkpoint를 시작하지 않아도 단독 통과할 수 있던 UI 회귀 두 건을 보강했다.
실제 저장 함수 호출 1회·저장 중 버튼·아직 auto인 상태를 먼저 확인한 뒤 generic disabled 또는 외부 모드 선택을
발생시킨다. 따라서 후속 부정 assertion이 실제 대기 중인 저장 작업의 완료를 다루도록 했다. 보강한 패널 회귀와
실제 CaptureBridge 회귀 4개는 아래 25파일 실행에서 통과했다. 실제 GPU의 복구·화질 검증과는 구분한다.

반복 WebGL loss 뒤 DPR에 0.75를 곱하던 별도 휴리스틱도 제거했다. 진단·renderer reset·invalidate·retry·cleanup은 유지한다.
메모리 모드의 high는 texture admission allowance이며 렌더 전체 품질 설정과 같지 않다. device profile의 자동 DPR/HDRI
선택과 safety profile 분리는 다음 범위로 남아 있다. 현재 변경은 물리 cap·문서 예산·기본 품질을 상향하지 않는다.

## SKP run의 UI 소유권

session별 마지막 run을 보존하고, stale run의 stage·새 질문·await 이후 결과 게시를 막는다. 현재 modal generation도
caller에서 전달한다. lazy 준비가 늦게 끝난 stale begin은 현재 run의 표지나 질문을 빼앗지 않는다.
이미 저장한 imported의 metadata와 AI 표기 결과는 UI 소유권과 분리해 원래 signal에 따라 기록한다.

complete는 Promise를 먼저 고정해 재호출·동기 listener 재진입에서도 중복 persist하지 않는다. 진행 표시는 자신의
마지막 activity object와 현재 snapshot이 정확히 같을 때만 회수해 외부/다음 run의 표시를 보존한다.
새 회귀 입력은 11개다. 실제 import/backend의 마지막 token guard는 담당 세션의 source 통합 시 함께 보존한다.

## 실제 검사와 실패 수정

2026-10-29 공유 릴리스 조정자가 배정한 300초 CPU 구간에서 아래 두 검사를 순차 실행했다.
HEAD는 위 `35307f6…`이며, 110개 변경·삭제·미추적 파일의 경로/내용 hash와 scoped 설정을 함께 기록한 입력 digest는
`f3404e7609ab9fe4fecbdca18472c420e4051d028f59cf807d5cea85b0b1215d`다.
실행 전후 receipt의 입력은 같았으며, 실패 후 소유 실행은 종료하고 검사 구간을 반환했다. 자동 재시도는 하지 않았다.

| 실제 실행 | 결과와 범위 |
| --- | --- |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc -p /private/tmp/toonstudio-spatial-modeler-packing-tsconfig.json --noEmit --incremental false` | exit 0. root strict 설정을 상속한 scoped 검사이며 전체 프로젝트 TSC 성공은 아니다. |
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec vitest run --maxWorkers=1 --no-file-parallelism` + 준비한 25개 파일 | exit 1. 24파일 통과·1파일 실패, 359개 통과·2개 실패/총 361개, 15.69초. |

실패한 파일은 `studio-bg3d-scene-glb-packing-path.test.ts`다. 공통 fixture의 실제 GLB writer는 POSITION/NORMAL만
출력하므로 loaded geometry에 UV가 없었다. 같은 shear 회귀는 UV 배열을 읽기 전에 실패했고, 5-recipe 예산 회귀는
예산 검사 전 실제 UV 누락을 올바르게 거부했다. 이 테스트 전용 current cache fixture에 nonconstant Float32 UV를
명시 생성하도록 수정했다. production 거부 조건과 기대 결과는 유지했다. 이 합성 UV를 실제 GLB UV 반입의 증거로
집계하지 않는다. 수정은 위 실행 이후이므로 수정한 파일의 재실행과 새 타입 검사가 필요하다.

통과한 24파일에는 raw MR builder·bridge/PNG registry의 31개 packing 입력, 기존 graph·UV·artifact·출력 경로,
SKP 소유권 11개와 importer/AI 표기, 품질 패널·복구 controller·CaptureBridge가 포함된다. 실패한 6-case 파일의
4개 통과를 새 fixture 수정의 성공 증거로 재사용하지 않는다.

로그는 `/private/tmp/toonstudio-packing-check-tsc.log`, `/private/tmp/toonstudio-packing-check-vitest.log`에 보존했다.
전후 receipt는 같은 접두사의 `input-before.json`, `input-after.json`이다. scoped 설정 SHA-256은
`cad78c4c12bb0044d7226aa35d70f6771c475e813db92a21d316ab7c14211151`이다.
이 설정은 이전 camera·restore·container 회귀도 유지해 직접 include/glob에 잡히는 테스트가 30파일이다.
새 ESLint·Secretlint·하네스는 실패 중단 순서에 따라 실행하지 않았다.

### 수정 후 두 번째 좁은 검사

2026-10-29 별도 120초 구간에서 기존 packing scoped TSC → 수정한 MR 파일 → 변경 ESLint를 순차 실행했다.
입력은 HEAD `35307f655e0ce855cca0f363c9b98c448e4ea8f9` + 122개 변경/삭제/미추적 파일이며, config를 함께 고정한
digest `afb90f72480a4e6c644274efe28444cd351b769d5d445d45b62379bcbcc59846`가 전후 같았다.

| 실제 실행 | 결과 |
| --- | --- |
| 기존 4096MiB packing scoped TSC | exit 0. 새 환경 전체 source/tests의 타입 성공으로 확대하지 않는다. |
| `studio-bg3d-scene-glb-packing-path.test.ts` 단일 worker 실행 | 1파일·6/6 통과, exit 0, 1.21초. 초기 실패 두 건의 수정 후 경로를 실제 확인했다. |
| 변경 TS/TSX ESLint | 103파일, exit 1, 오류 4건·경고 0건. |

37.438초에 첫 실패 중단했고 소유 process group 잔류는 0이었다. Secretlint와 새 환경 회귀·별도 환경 타입 검사는
실행하지 않았다. 초기 25파일 전체를 이번에 다시 실행하거나 과거 359통과와 합산한 새 전체 성공 수를 만들지 않는다.
로그/전후 receipt는 `/private/tmp/toonstudio-packing-recheck-n4lgd50f/`에 보존했다.

ESLint 오류는 PMREM의 읽지 않는 `target = null` 할당 1건, texture image bridge의 중복 import 2건과 aggregate 오류의
`cause` 누락 1건이다. 검사 뒤 불필요한 할당 제거·type import 합치기·원래 오류의 cause 연결로 보정했다.
이 보정과 아래 환경 증분의 후속 source는 해당 검사 체크포인트 뒤 입력이므로 새 검사 결과가 필요하다.

## 후속 환경 binding 세대 수정 — 실행 전

native 모델링 세션은 BG3D HDRI 두 파일을 이 세션이 맡아도 중복되지 않음을 확인했다.
해당 세션의 MToon hardware 관측은 HDRI/WebGPU PMREM 성공 근거로 재사용하지 않는다.
요청 세대·실제 renderer/backend·환경 resource identity가 같은 경우에만 exact 캡처를 허용하는 계약을 합의했으나,
typed readiness와 GPU pin·캡처 fence 연결은 아직 구현 전이다.

먼저 실제 source에서 확인한 작은 값 소실을 수정했다. `StudioBg3dHdriEnvironment.tsx`는 같은 밝기·회전 값으로
asset/tier·renderer·scene·배경 사용 여부만 바뀌면 새 binding에 기본값 1·0이 남을 수 있었다. setter effect를
mount generation에 맞췄다. `StudioBg3dScenePanorama.tsx`도 환경 owner·scene 변경 시 같은 회전을 다시 적용한다.
밝기·회전을 mount effect의 의존성에 추가하지 않아 슬라이더 변경으로 HDRI를 다시 decode하거나 파노라마를
다시 만들지 않는다.

새 `StudioBg3dEnvironmentGeneration.test.tsx`는 실제 두 component와 typed binding seam을 사용해 세대 변경·HDRI
재활성화·슬라이더의 binding 재사용을 다루는 10개 입력을 정의한다. 실제 수집/실행 결과가 아니며 별도 좁은 설정
`/private/tmp/toonstudio-spatial-modeler-environment-tsconfig.json`도 작성만 했다. 새 회귀 파일의 SHA-256은
`328f77798bdd3d841a5f13d0e5b29dbb006b7b3aa781e795614d44c2f8a05277`이다.
이는 최초 10입력 시점의 지문이다. 후속 `backgroundOwner` 변경 입력을 더해 현재 정의는 11개이며 최초 지문을
현재 파일의 내용으로 사용하지 않는다. MR fixture와 기존 packing scoped 설정은 알려진 SHA 그대로 유지한다.

### 공통 슬롯 소유권·backend별 PMREM — source 반영, 실행 전

HDRI와 파노라마는 `studio-bg3d-environment-slot-owner.ts`를 함께 소비한다. pending 요청은 기존 화면을 지우지 않고,
최신 opaque lease와 실제 scene pointer·색·세기·각도를 대조한 뒤 설치한다. cleanup은 살아 있는 이전 owner 또는
유효 baseline만 복원하고, 이미 해제한 이전 개인 texture를 다시 연결하지 않는다. helper 자체는 texture를 해제하지 않는다.
공개 속성 검사 사이 외부 writer가 완전히 같은 상태로 되돌린 ABA와 관찰 시작 전 dispose는 관측할 수 없는 한계다.

HDRI가 배경도 맡으면 파노라마는 배경 슬롯을 양보한다. 두 슬롯을 모두 양보한 파노라마는 사용하지 않을 texture를
만들지 않는다. 원래 환경·배경 intensity는 보존한다. 실제 SceneGraph 연결은 기존 줄 수를 늘리지 않고 반영했다.

`studio-bg3d-hdri-pmrem.ts`는 실제 renderer의 backend에 맞는 legacy WebGL 또는 lazy WebGPU PMREM을 사용한다.
WebGPU는 init·compile·conversion·queue 종료와 세대 검사를 거치며 다른 backend로 전환하지 않는다. 변환 중 오류가
나도 이미 제출한 작업을 기다린 뒤 자기 candidate를 정리하고 입력 HDR은 caller에 남긴다. binding은 factory가
settle하기 전에 입력을 해제하지 않는다. observer 오류는 commit 결과와 분리해 snapshot 진단으로 보관한다.
실제 GPU·shader·픽셀·성능 성공은 이 source만으로 확인하지 않았다.

초기 helper 회귀 18개·PMREM 경계 12개·binding 16개와 파노라마 추가 8개 입력을 작성했다. 이후 외부 표시값을
보존하며 자기 texture를 분리하는 retirement, 내부 변환 throw의 output 추적·renderer 상태 복원, observer 재진입,
복구 전 준비 보류와 복원 후 재생성 회귀를 더했다. 현재 정의는 helper 27개·PMREM 23개·binding 20개·component 20개이며
파노라마 추가 입력은 9개다. 이 수는 실제 수집·통과 수가 아니다. 준비한 환경 scoped 설정은 실제 SceneGraph와
관련 6개 테스트 파일, 기존 Vite/rbush/vendor ambient 선언을 포함한다.
GPU capture pin, 요청/실제 적용 환경의 host·tiled·receipt fence, 오류의 상위 UI 전달은 아직 후속 구현 범위다.
위 packing TSC와 MR 6회귀를 이 환경 전체 증분의 성공 증거로 사용하지 않는다.

WebGL 복구는 기존 실제 canvas snapshot을 사용한다. lost/failed/degraded 동안 새 요청·props 변경의 PMREM 준비를
보류하고 실제 restored/retry 성공 뒤 같은 요청·tier·밝기·회전으로 다시 준비한다. controller 알림과 DOM 이벤트는
같은 snapshot이면 중복 처리하지 않는다. 이는 실제 GPU 복구 성공이나 캡처 준비 완료를 입증하지 않는다.
HDR loader의 기본 UVMapping도 등거리 환경·배경 mapping으로 명시해 일반 2D 배경 해석을 피한다.

2026-10-29 최종 사용자 반영 지시는 **검증 후 main 병합까지만**이다. 앞선 운영 배포 요청과 조정 세션 지시의
충돌을 직접 확인한 답변으로 확정했다. 운영 배포는 하지 않으며 필수 검사·정상 hook·PR 보호 규칙을 우회하지 않는다.

### 환경 전용 첫 검사 — 테스트 타입 오류에서 중단

2026-10-29 직접 배정받은 120초 구간에서 `/private/tmp/toonstudio-spatial-environment-check.py`를 실행했다.
환경 scoped TSC는 **exit 2, 25.651초**에 테스트 파일의 TS2769 두 건을 보고했다. 실제 Three의
`DataTexture.image.data`는 `TypedArray | null`인데 `Array.from()`을 바로 호출한 것이 원인이다.
후속 6suite·ESLint·Secretlint는 첫 실패 중단 순서에 따라 실행하지 않았다.

입력은 HEAD `35307f655e0ce855cca0f363c9b98c448e4ea8f9` + 123개 변경/삭제/미추적 파일이며, 주·상속 config를
함께 고정한 digest `363ff0f5c03365c9400b7730aa1bff99bf0234df051c9e0ae9c4860e8d06c829`가 전후 같았다.
환경 config SHA-256은 `faaa93d3426ff74d2ee4b0e76d87abaf5c5eaf53dd89e99c0501cb50c730f9d3`다.
로그/receipt는 `/private/tmp/toonstudio-environment-check-55as68hd/`에 보존했다. 소유 process group 잔류 0으로
구간을 반환하고 같은 구간에서 자동 재시도하지 않았다.

검사 뒤 해당 회귀 한 곳에서 실제 RGBA8 입력을 `instanceof Uint8Array`로 확인하고 데이터 참조·바이트·version을
함께 비교하도록 보정했다. `any`·nonnull 단언으로 덮지 않았고 production 로직과 기대 결과는 바꾸지 않았다.
수정된 테스트의 SHA-256은 `27d9fc43996e4afe1b12563a1549e895939d5d4e5c42914ba9f297d13fe3bbc0`이다.
이는 첫 실패 입력 뒤 수정이므로 기존 TSC 로그를 보정 후 성공으로 재사용하지 않는다.

### 환경 재검사 — TSC·6파일 110회귀 통과, lint 중단

2026-10-29 다시 배정된 120초 구간에서 같은 환경 config와 보정한 회귀를 실행했다. HEAD는 위 `35307f6…`이며
입력 123파일과 주·상속 config digest `95e677d764bf530faa1c233c2eb20b2ced0281b274c5a96d1e6ce0f4f1a8c11a`가 전후 같았다.
환경 scoped TSC exit 0, 관련 **6파일·110/110 통과(exit 0, 5.31초)** 후 변경 TS/TSX 104파일의 ESLint가
2오류·경고 0으로 exit 1이 되어 중단했다. 총 43.663초, 소유 process group 잔류 0이며 Secretlint는 실행하지 않았다.
로그/receipt는 `/private/tmp/toonstudio-environment-check-eha3pv0q/`에 보존했다.

남은 오류는 factory의 쓰지 않는 초기 `target = null` 할당과 bridge 중첩 catch의 cause 규칙이다. source 보정은
초기 할당만 제거하고, cleanup 오류를 수집한 뒤 바깥 catch에서 원래 준비 오류를 cause로 연결하도록 정리했다.
원래 준비 오류·정리 오류·개인 binding 원상복원을 함께 확인하는 bridge 회귀 한 건도 추가했다.
따라서 위 110 green은 이전 입력 증거로 유지하며, 수정 후 관련 PMREM/bridge 회귀와 타입·정적 검사는 별도 실행한다.

### 최신 main 통합에서 보존할 추가 계약

읽기 감사의 고정 local main은 `4fbeadb9a16707efe94d64756d7a0a8cdda4af31`이며 후보 HEAD와 11 ahead/68 behind다.
최종 원격 상태·PR merge 증거는 아니다. 실제 겹치는 경로와 Hub/host port 보존 조건을 임시 통합 보고서로 정리했다.
Main의 MToon renderer별 로딩/variant 표지는 확인했지만 backend-variant cache helper의 production 연결은 확인하지 못했다.

Main bundle catalog의 `inServiceOnly:true / downloadable:false`는 commercialUse와 다른 파일 반출 계약이다.
현재 후보 GLB의 권리 동일성 검사만으로 이 정책을 보존했다고 볼 수 없으므로 정확한 visible asset provenance와
verified id/hash/bytes/current catalog를 묶는 preflight가 통합 시 필요하다. prefix fallback이나 catalog 로드 실패의
`null`을 비번들 허가로 해석하면 안 된다. Main의 inplace 파생 저장은 기존 rights만 복사하고 durable 원본 lineage와
다운로드 제한을 보관하지 않는 경로도 있으므로 local V12 존재만으로 허가하지 않는다. 이 경계는 관련 자산 세션과
소유 API를 조율하며 아직 구현·검증 전이다.

전체 하네스·build/bundle·새 브라우저·실제 GPU·STP·장기 장면 검사는 미완료다. 이전 GPU20/UI30 증거를 후속 source로 재사용하지 않는다.
커밋·PR·병합·배포는 없으며 동결된 `4d86/353` clean 후보는 수정하지 않았다.

### 출처 제한·파생 저장 후속 증분 — source 작성, 새 실행 전

아직 직접 GO를 받지 않았던 postlint 120초 요청은 철회했다. 해당 runner는 실행하지 않았으며 위 110 green은
기존 입력의 체크포인트로 유지한다. 이후 별도 source 증분을 작성했으므로 앞선 123파일 digest나 통과 수를
현재 후보의 검증으로 재사용하지 않는다. 공유 host의 새 TSC·테스트·lint·브라우저 실행은 아직 0회다.

새 optional `sourceRestriction` V1은 파일 출력 상태(`allowed/service-only/unknown`), 최초 origin ID/정규 SHA-256,
직전 parent ID/SHA-256을 구분한다. 파생 `record.contentHash`와 최초 SHA는 독립이다. strict parser는 추가 키·
getter·상속 필드·손상 값을 허가로 받지 않으며 레거시 필드 부재만 effective unknown으로 읽는다. 기존 raw record와
렌더 사용은 보존한다. 형식이 맞는 DTO를 출처 인증이라고 취급하지 않는다.

실제 source 조회는 배포 exact ID/current catalog 또는 local V12 snapshot/CAS 바이트를 확인한다. 새 파일 준비의
opaque receipt는 실제 resolver만 만들고, 현재 표시 모델만 먼저 확인한 뒤 artifact 준비·개인 자원 정리와 파일
인계 직전에도 exact record/CAS/catalog를 재조회한다. source map 변경·취소·제한 변경은 파일 인계를 막는다.
다른 모델·썸네일의 정상 revision 증가만으로 실패시키지 않으며 이 재조회를 전역 writer 잠금으로 과장하지 않는다.

파생 import는 caller의 허가 표기 대신 actual source ID/hash/제한 fingerprint를 재조회하고 같은 mutation 안에서
원본/CAS를 다시 확인하도록 연결 중이다. 동등한 명시 사용자/generated 신규 등록만 기존 root를 재사용하며, 다른
권리·제한·계보를 같은 hash로 조용히 합치지 않는다. 동일 bytes의 no-op은 parent_self를 추가하지 않는다.
모델 면 편집의 capture/replace/읽기 lease에도 제한 fingerprint를 포함해 실제 저장·캐시·commit 경계를 연결한다.

선택한 저장 모델의 처리 결과는 서비스 내 preview/apply를 유지하고 raw download 클릭 때 실제 출처를 확인한다.
project archive도 실제 허가 source만 bytes로 내보내며, 재가져오기는 같은 bytes/rights의 기존 durable 원본이
확인될 때 그 출처를 재사용한다. 다른 기기·원본 부재·legacy unknown archive에는 직렬화된 allowed 표기만으로
허가를 주지 않는 호환성 한계가 있다. 일반 import·렌더·서비스 내 가공과 raw 파일 인계의 판단을 구분한다.
Lift3D의 독립적인 사용자 원화 생성물에는 명시 generated ingress를 붙였고 사용자 권리 선언은 별도로 보존했다.

새 회귀는 순수 parser·메모리 manifest/CAS seam과 실제 SQLite/OPFS authority를 사용하는 source→파생→재열기·
읽기 lease를 구분해 작성 중이다. 작성된 사례 수는 실제 수집·통과 수가 아니다. strict catalog→실제 loader/direct
validator→record→현재 장면 preflight 회귀도 실제 Worker·GPU·브라우저 증거로 계산하지 않는다.

AI 계획 문구는 공간 모델러의 실행 완료 주장과 외부 SketchUp Dynamic Components 참고를 구분하도록 보완하고,
가상 스튜디오 샘플의 사진 맞춤 작업 의미를 유지했다. 최신 main의 assist/Illustrated rename을 되돌리지 않고
문구 hunk만 결합할 계획이며, 실제 main 통합·정상 hook·PR/CI·main 병합은 아직 수행하지 않았다.

### 출처 증분 첫 실행 — 타입 세 오류에서 중단

2026-10-29 배정된 180초 구간에서 provenance runner를 한 번 실행했다. source 154파일과 config·root
tsconfig·lock·설치 dependency/PMREM source를 포함한 aggregate
`9fc9ba8262b526f8f7cc8e4926dda0876263fb8fdba123924b38a21fc37e2876`은 실행 전후 동일했다.
총 27.993초 뒤 scoped TSC exit 2로 중단했다. Vitest 21파일·ESLint·Secretlint는 실행하지 않았다.

오류는 authored replacement의 두 호출에서 실제 `RecordIdentity` 투영이 새 optional `sourceRestriction`을
누락한 TS2559 두 건과, 출처 회귀의 readonly `tags` 직접 대입 TS2540 한 건이다. 타입 보정은 정본
`StudioBg3dPrimitiveEditReplacementAsset`의 기존 `Pick<Bg3dVerifiedStoredRecord,…>`에 해당 필드만 추가했다.
회귀는 기존 모델을 변경하지 않고 `customModels`를 immutable map으로 교체하도록 보정했다. `any`·강제 cast·
readonly 완화로 우회하지 않았고 production 비교 의미와 거부 기대는 유지했다.

로그와 전후 receipt는 `/private/tmp/toonstudio-provenance-check-ohnrclx_/`에 보존했다. 실제 exec session
25338은 terminal exit 1이며 timeout·cleanup-needed는 false, 소유 잔류 group은 빈 배열이었다. 종료 뒤
자기 runner/config만 대상으로 한 process 대조도 0이었다. 당시 runner는 실제 child PGID를 receipt에 남기지
않는 한계가 있어 번호를 사후 추측하지 않는다. 다음 runner는 시작 시 PID/PGID와 최종 소유 group 목록을
명시하도록 별도 준비하며, 같은 창에서 재시도하지 않았다.

소스 freeze 회수 후 보정했으므로 이전 154파일 지문을 보정 후 성공 증거로 재사용하지 않는다. canonical
projection 타입 파일이 변경 범위에 추가되어 후속 roster는 155개다. 별도 재검사와 전체 하네스·최신 main 통합,
정상 hook·PR/CI·main 병합은 여전히 미완료이며 운영 배포는 하지 않는다.

### 타입 보정 후 실행 — scoped TSC 통과, fixture 공개 ID 회귀 중단

2026-10-29 새로운 180초 구간에서 `b15bec7bd0e249187c42c0b45b86cfbe5a8c8716a04d602bb5a5d396a5a3c3ea`
입력 155파일을 실행 전후 동일하게 확인했다. scoped TSC는 exit 0이다. 다음 Vitest는 bail 1에서
**7파일 통과·1파일 실패, 194사례 통과·1사례 실패**로 중단했다. 요청한 21파일 전체 완료가 아니며
CLI의 `(21)`/`(208)`을 전체 통과 수로 계산하지 않는다. ESLint·Secretlint는 미실행이다.

실패는 inplace-storage 회귀의 공개 attachment ID mock이 `attachment-${record.id}`를 사용해 내부 저장 ID
`storage-derived`를 일부러 포함시킨 데서 발생했다. 실제 factory는 `createOpaqueId("bg3d-attachment")`를
쓰므로 fixture를 독립 UUID로 바꿨다. 원래의 내부 ID 미노출 단언과 production guard는 그대로 유지했다.
이 보정 이후 production 코드·데이터 타입은 바꾸지 않았고, 다음에는 관련 21파일·정적 검사를 완료하는
범위로 요청한다. 최종 통합 후보의 전체 타입 검증은 정상 하네스·hook·CI에서 별도로 필요하다.

로그/receipt는 `/private/tmp/toonstudio-provenance-recheck-2h1vf21i/`에 보존했다. exec session 88422는
terminal exit 1, 총 35.722초다. runner PID/PGID는 56266, TSC는 56285, Vitest는 56547로 기록했다.
각 단계 timeout/cleanup-needed는 false, owned residual group은 빈 배열이며 독립 소유 process 확인도 0이었다.
이전 두 실패 원문을 덮지 않았고 동일 창 자동 재시도는 하지 않았다.

### fixture 보정 후 실행 — 21파일 438회귀 통과, import 순서 정리

2026-10-29 새 120초 구간에서 155파일 입력
`d45e478386c2cf5bebbb9247185afd07e09cf4e4772c98517944dba291c501d0`의 전후 동일성을 확인했다.
이 구간에서는 앞선 scoped TSC를 다시 실행하지 않았다. Vitest는 **21파일·438사례 전부 통과(exit 0,
25.50초)**했다. 이어 변경 TS/TSX 136파일의 ESLint가 모델 라이브러리 한 파일의 import 순서
6오류·경고 0으로 exit 1이 되어 중단했으며 Secretlint는 실행하지 않았다.

실행 중 새 API의 type re-export가 import 사이에 위치한 것이 원인이었다. 창 회수와 source freeze 해제 후
그 한 선언만 마지막 import 뒤로 옮겼다. 타입·실행 계약, privacy guard, 회귀 기대와 데이터 경로는 바꾸지
않았다. 위 438 통과는 이동 전 입력의 증거로 유지하고, 정리 후에는 변경 ESLint·Secretlint만 별도 요청한다.
최종 main 통합 후보의 전체 타입·하네스·정상 hook·CI와 새 UI/GPU 검증은 별도로 필요하다.

로그/receipt는 `/private/tmp/toonstudio-provenance-fixture-check-tf2ihd6r/`에 보존했다. exec session
43139는 terminal exit 1, 총 37.803초다. runner PID/PGID는 34732, Vitest는 34753, ESLint는 36581이다.
timeout·cleanup-needed는 false, owned residual group은 빈 배열이며 반환 시 독립 소유 process 대조도 0이었다.
HTMLCanvasElement getContext 미구현 경고는 그대로 기록했으며 단위 테스트를 실제 브라우저·GPU 증거로
계산하지 않았다. 동일 창 자동 재시도·설치·운영 배포는 하지 않았다.

### import 정리 후 정적 검사 통과와 캡처 경합 후속 보완

2026-10-29 별도 60초 구간에서 입력 155파일
`a86cb103a07f0eb38be17f1a9feb9630c55b327e486b251fdbe646c08947cbc9`의 전후 동일성을 확인했다.
변경 TS/TSX 136파일 ESLint와 텍스트 152파일 Secretlint가 모두 exit 0이다. 총 10.245초이며
scoped TSC·438회귀를 다시 실행하지 않았다. 로그/receipt는
`/private/tmp/toonstudio-provenance-import-lint-m94vvk_x/`에 보존했다. exec session 63606은 terminal
exit 0, runner PID/PGID 27662, ESLint 27967, Secretlint 28355다. timeout·cleanup-needed는 false이며
owned residual group과 종료 뒤 exact PID 대조는 모두 0이었다.

추가 source 감사에서는 HDRI 요청·적용 세대를 PNG/타일 캡처 권위가 대조하지 않는 경합을 확인했다.
새 HDR 로드·PMREM 준비 또는 context 복구 뒤 재준비 중에도 adapter/framebuffer 안정만 확인해
이전 환경으로 PNG를 인계하거나, 타일 사이 새 환경이 적용되어 혼합된 조명 결과를 인계할 수 있다.
이는 실제 GPU 오출력을 재현한 보고가 아니라 비동기 source 경계 확인이며, 환경 metadata만 보관하는
현재 장면 GLB의 경합으로 확대하지 않는다.

병합 전 scene/renderer의 요청·실제 적용 세대와 raster 시작·인계/타일 checkpoint를 연결하는 좁은
보완을 진행한다. 전역 GPU scheduler/pin까지 새로 구축하지 않는다. 새 source는 새 입력으로 검증하며
위 b15 타입·d45 단위·a86 정적 결과를 현재 후보 전체 green으로 합산하지 않는다. 최신 main 통합,
정상 hook·PR/CI·main 병합과 새 브라우저/GPU 검증은 아직 수행하지 않았다. 운영 배포는 하지 않는다.

### PNG·타일 환경 세대 보완 — 새 source 작성, 실행 대기

항상 마운트하는 환경 authority를 추가했다. 정규화된 문서 설정과 실제 렌더용 HDRI URL/tier·회전·세기·
배경 사용·파노라마 preset/회전·AR 표시 모드에서 fingerprint를 만들며, 실제 Scene 포인터로 기대값을
역추론하지 않는다. layout에서 새 요청을 즉시 게시하고 HDRI·파노라마가 맡은 각 슬롯의 실제 적용을
합성한다. 정상 blank/null과 install 실패를 구분하고, 현재 texture·scalar·Euler·owner를 다시 확인한다.
세기·회전 변경은 PMREM을 재생성하지 않고 새 capture 세대만 게시하며, context 복구는 같은 URL이어도
새 binding의 실제 준비를 기다린다. 같은 fingerprint의 ABA 교체도 이전 영수증을 무효화한다.

실제 CaptureBridge adapter identity를 유지한 private WeakMap에 acquire 권위를 결박했다. 제품 bridge의
권위 부재·폐기·준비 실패를 무검사 캡처로 바꾸지 않는다. 중앙 raster 함수는 준비 전 GPU를 호출하지 않고,
readback 전후 같은 등록 영수증과 동결 문서의 fingerprint를 확인한다. 새 객체/배열로 방어 복사한 raster에도
실제 opaque 영수증을 승계한다. 영수증이나 함수는 PNG·문서·Worker DTO에 직렬화하지 않는다.

타일은 원래 adapter에서 영수증 하나를 얻고 session 전체의 checkpoint와 마지막 Worker finish·PNG header
확인 뒤까지 같은 세대를 검사한다. 타일마다 새 세대를 기준으로 삼지 않는다. PNG 삽입·소재 저장·AI 참조는
인코딩 뒤 실제 handoff 직전에 검사한다. 현재 shot은 artifact에 영수증을 승계해 recovery commit의 비동기
권한 검사 뒤와 `isLocallyCurrent`에서도 확인한다. 다음 shot의 정상 환경 변경으로 이미 commit한 이전 shot을
다시 무효화하지 않는다.

인계 뒤의 cross-domain 저장 port/public DTO는 확장하지 않았다. 정합적으로 동결해 넘긴 독립 PNG를 이후
modal 종료·환경 해제에 종속시키지 않으며, 기존 입력 불변·비동기 저장 권위는 유지한다. 이 source는 GPU
target을 전역 pin하는 구현이 아니며 실제 GPU 픽셀·성능이나 브라우저 성공 증거가 아니다.

준비 실패·취소·복구·늦은 ready·같은 binding scalar 변경·타일 간 세대 교체·인코딩 중 무효화·최종 artifact
인계 거부의 focused 회귀를 작성했다. 새 scoped 타입 설정과 관련 41파일 검사를 준비 중이며, 작성된 테스트는
실제 수집·통과 수가 아니다. 이 증분 뒤 Node·Python·TSC·Vitest·lint·브라우저·GPU·Git 쓰기는 아직 0회다.
이전 b15 타입·d45 단위 438·a86 정적 결과를 이 새 source의 성공으로 재사용하지 않는다.

### 환경 세대 첫 실행 — scoped TSC 통과, byte 비교 fixture 보정

2026-10-29 별도 180초 구간에서 176파일 입력
`3194e0d5899951b6bb21d5366383ae9db5dc1bcfe303172a7e68bc616f63c0ba`와 config·deps의 전후 동일성을
확인했다. 새 설정이 포함한 관련 41파일에 대한 scoped TSC는 exit 0이다. 이어 Vitest는 **37파일·715사례
통과 후 새 회귀 1사례 실패(exit 1)**로 bail 1 중단했다. 요청한 41파일 전체 완료가 아니며 CLI의 `(41)`과
`(720)`을 전체 통과 수로 계산하지 않는다. ESLint·Secretlint는 실행하지 않았다.

실패는 실제 raster 경계가 만든 `Uint8ClampedArray`와 원본 `Uint8Array`를 서로 다른 constructor인 채
deep equality로 비교한 새 fixture의 기대 오류다. 이 두 타입은 기존 captured raster 계약이 허용한다.
freeze 해제 후 양쪽의 byte 내용을 `Array.from`으로 비교하도록 한 줄만 보정했다. 원본·사본 객체와 배열의
독립성, pending 중 GPU 호출 0, 실제 opaque receipt·같은 fingerprint의 ABA 거부 단언은 유지했다.
production source·타입·권한 guard는 바꾸지 않았으므로 다음 창은 관련 41파일과 정적 검사만 요청한다.
최종 main 통합 후보의 전체 타입·하네스·정상 hook·CI 검증은 여전히 필요하다.

로그/receipt는 `/private/tmp/toonstudio-capture-environment-check-cwh30t7b/`에 보존했다. exec session
90024는 terminal exit 1, 총 54.544초다. runner PID/PGID는 80168, TSC는 80187, Vitest는 81531이다.
timeout·cleanup-needed는 false, owned residual group은 빈 배열이며 종료 뒤 exact PID 대조도 0이었다.
기존 경고와 첫 실패 로그는 그대로 두고 동일 창 재시도·설치·실제 GPU·Git·운영 작업은 하지 않았다.

### byte 비교 보정 후 실행 — 41파일 741회귀 통과, 정적 검사 두 곳 정리

2026-10-29 별도 90초 구간에서 176파일 입력
`49ef0abf92550e0eaa9dead8e3e4b4e6ed5c13d524519803d94b3077a7318ca5`와 config·deps의 전후 동일성을
확인했다. 관련 **41파일·741사례가 모두 통과(exit 0, 30.79초)**했다. 이 구간에서 TSC는 재실행하지
않았다. 이어 변경 TS/TSX 157파일 ESLint가 2오류·경고 0으로 exit 1이 되어 중단했으며 Secretlint는
실행하지 않았다. 앞선 3194 scoped TSC는 이전 입력의 증거로 유지한다.

정적 오류는 component 파일의 hook 혼합 export와 한 번만 대입한 timer의 `prefer-const`다. 창 회수 후
context·타입·hook을 작은 비컴포넌트 모듈로 옮기고 Authority/HDRI/Panorama의 import만 맞췄다. 같은
context 객체를 공유하며 요청·실제 적용·guard 계약은 유지했다. timer는 abort listener를 등록하기 전에
`const`로 초기화해 취소 시 cleanup이 준비된 timer를 정리하도록 했다. 품질 선택·반출 권한·기대 결과는
바꾸지 않았다. 이후 실제 module 연결과 timer 수명을 확인하는 집중 환경 회귀 및 정적 검사만 별도 요청한다.

로그/receipt는 `/private/tmp/toonstudio-capture-fixture-check-8slmo_u1/`에 보존했다. exec session 11442는
terminal exit 1, 총 41.996초다. runner PID/PGID는 25169, Vitest는 25202, ESLint는 25601이다.
timeout·cleanup-needed는 false, owned residual group과 종료 뒤 exact PID 대조는 모두 0이었다.
이전 원문·성공 입력을 덮지 않았고 동일 창 재시도·새 설치·브라우저·GPU·Git·운영 작업도 하지 않았다.
