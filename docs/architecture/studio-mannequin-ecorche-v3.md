# Studio 3D 데생 인형 v5 — 연속 몸통 스키닝·손발 접촉·사면도 픽킹·모바일 조작·접근성 아키텍처

## 1. 목적 및 배경

클립스튜디오 페인트(CLIP STUDIO PAINT)의 기본 3D 데생 인형은 원통·구 중심 표면과 고정된 쇄골 구조, EX 등급 한정 사면도 외에도 실제 작화 화면에서 다음 병목이 발생한다.

1. 몸통을 크게 비틀거나 숙일 때 골반·허리·흉곽 분절 경계가 갈라지거나 중복 면 외곽선이 겹쳐 선화 추출 품질이 저하된다.
2. 체형을 5등신 SD나 근육질 체형으로 바꾸면 기존 회전 프리셋만으로는 턱 괴기·골반 손얹기·바닥 3점 착지에서 손이 신체 내부를 파고들거나 허공에 뜬다.
3. 4분할 사면도에서 정면·측면·탑뷰 보조 창 위에서 직접 관절·IK 핸들을 집어 드래그하기 어렵고, 모바일 두 손가락 핀치 시 단일 관절 드래그가 먼저 발화하는 오동작이 생기기 쉽다.
4. 2D 핸드 패드나 3D 뷰포트가 포인터 전용으로만 구현되면 키보드·스크린리더 사용자의 정밀 각도 조작이 제한된다.

ToonStudio 3D 데생 인형 v5는 위 실사용 5대 축(자세·손발 접촉·스키닝 변형·모바일 조작·접근성)을 데생 인형 전용 범위 안에서 통합 해결하며 클립스튜디오 `.pep`/`.3dp` 양방향 호환을 유지한다.

## 2. 모듈 구성 및 책임 분리

모든 모듈은 파일 크기 상한(신규 파일 800줄 이하, 동결 기준선 이하)과 정적 번들 분리 규칙을 준수한다.

| 모듈 경로 | 계층 | 핵심 역할 |
| --- | --- | --- |
| [studio-mannequin-ecorche-anatomy.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-ecorche-anatomy.ts) | 순수 데이터·수학 | 에코르셰(`ecorche`)·아사로 다면체(`planar`)·클래식(`standard`) 모드, **골반→요추→흉곽 단일 9단면 연속 3본 스키닝 명세(`buildStudioMannequinSkinnedTorsoSpec`)**, 능동 근육 팽창, 2D 핸드 패드 및 손가락 벌림 |
| [studio-mannequin-pro-kinematics.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-pro-kinematics.ts) | 순수 키네마틱스 | 관절 잠금(`StudioMannequinJointLockMap`), 2:1 견갑상완 리듬, Winter 19분절 질량 기반 무게중심(CoM) 분석 및 원클릭 균형 보정, 루미스 두상·정중선·단축 등고선 폴리라인 |
| [studio-mannequin-gesture-dynamics.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-gesture-dynamics.ts) | 순수 동세·접촉 | 3D 동세선(`analyzeStudioMannequinGesture`), 상지 카운터밸런스·바닥 접지(`lowestY=0`) 통합 좌/우 콘트라포스토(`buildStudioMannequinContrappostoPose`), **체형 적응형 1인 손-신체·손-바닥 접촉 IK 솔버(`applyStudioMannequinHandContact`: 골반·턱·가슴·뒷머리·바닥 3점 착지)**, 시선 응시, 호흡 확장 |
| [studio-mannequin-quad-view.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-quad-view.ts) | Three.js 뷰포트 | 단일 WebGL 캔버스 온디맨드 2×2 4분할 사면도 렌더링, **서브뷰별 카메라·포인터 NDC 역투영(`resolveStudioMannequinQuadPointerNdc`)**, 서브뷰 종횡비 보정, 만화 원근 화각(15°~85°) |
| [studio-mannequin-pro-overlays.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-pro-overlays.ts) | Three.js 지오메트리 | `skinIndex`/`skinWeight` 버퍼를 내장한 연속 몸통 `BufferGeometry`(`buildStudioMannequinSkinnedTorsoGeometry`), 스무스/아사로 로프트 지오메트리, 작화 보조선 오버레이 |
| [studio-mannequin-scene-figure.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-scene-figure.ts) | Three.js 피규어 | 실시간 `THREE.Bone`(`pelvis`→`spine`→`chest`) 바인딩 `THREE.SkinnedMesh` 및 법선 팽창 스키닝 외곽선 마운트·해제, 능동 근육 스케일 동기화 |
| [studio-mannequin-scene.ts](../../apps/web/src/domains/creator/scene-3d/studio-mannequin-scene.ts) | Three.js 입력·렌더 | 4분할 사면도 전 영역(`main`/`front`/`side`/`top`) 직접 레이캐스트 픽킹·IK 드래그, **모바일 2손가락 멀티터치 핀치 가드(`activeTouchPointers`)**, 터치 포인터 IK 히트 반경 보정(`1.95×`) |
| [StudioMannequinFramingHud.tsx](../../apps/web/src/domains/creator/scene-3d/StudioMannequinFramingHud.tsx) | React UI | 카메라 앵글 프리셋, 4분할 사면도 토글, 만화 원근 화각(FOV) 슬라이더·프리셋, 모바일 44px 터치 타깃(`pointer-coarse:min-h-11`) 및 포커스 링 |
| [StudioMannequinProSections.tsx](../../apps/web/src/domains/creator/scene-3d/StudioMannequinProSections.tsx) | React UI | 체형·해부학·웹툰 원형·관절·콘트라포스토·손 신체/바닥 밀착 스냅·키보드 조작 지원 `role="slider"` 2D 핸드 패드 |
| [build-ecorche-mannequin-v3.py](../../scripts/blender/build-ecorche-mannequin-v3.py) | Blender 5.2 DCC | `ToonStudio_Ecorche_Scene` 격리 빌드 — **양손 30마디 본 헤드·테일과 손가락 로프트 조인트 0.000mm 1:1 피벗 일치(`compute_hand_digit_chains`)** 및 주요 관절 다중 본 페더링 웨이트 적용 후 [toonstudio_ecorche_mannequin_v3.glb](../../apps/web/public/models/mannequin/toonstudio_ecorche_mannequin_v3.glb) 익스포트 |

## 3. 핵심 설계 불변식

1. **연속 몸통 스키닝 및 무결성**: `buildStudioMannequinSkinnedTorsoGeometry`의 모든 정점 `skinWeight` 4성분 합은 `1.0`으로 정규화되며, `pelvis`·`spine`·`chest` 회전 시 허리·명치 경계 균열 없이 연속 변형되고 스키닝 외곽선이 법선 방향으로 균일하게 추적한다.
2. **체형 불변 표면 접촉 및 바닥 비관통**: `applyStudioMannequinHandContact`와 `buildStudioMannequinContrappostoPose`는 현재 `StudioMannequinSpec`의 실제 흉곽·골반·얼굴 치수에서 표면 법선 오프셋 목표점을 계산하고 2-패스 IK와 `groundStudioMannequinPoseForSupport`를 결합해 체형을 변경해도 침투·부유를 방지한다.
3. **사면도 전 영역 조작 및 모바일·접근성 보장**: 4분할 사면도 활성 시 어느 사분면에서 드래그하더라도 해당 사분면 카메라 기준으로 관절 회전·손발 IK가 동작하며, 두 번째 손가락 터치 감지 즉시 미이동 단일 드래그를 취소해 핀치 줌·팬 충돌을 차단한다. 모든 주요 조작 칩·토글은 `pointer-coarse:min-h-11`과 `focus-visible:outline` 계약을 충족한다.
