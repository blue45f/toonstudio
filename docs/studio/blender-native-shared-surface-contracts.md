# 자체 웹 모델링의 공통 표면 계약

상태: **migration**. 2026-10-29의 `codex/blender-native-shared-surface-20261029`에서
화면·선택·수정자 표시·GLB의 공통 표면 경로를 구현하고 있다.
기준은 `8e445a4b648e825afa35d6f5106505a6a47f71ba`이며 운영 제공 완료 기록은 아니다.
설치 없는 자체 웹 기능이라는 [모델링 방향](blender-native-modifier-contracts.md)을 유지한다.

## current — 확인한 표면 차이

기존 화면의 원본 fan과 GLB의 planar ear clipping은 같은 코너를 사용해도 다른 대각선을 만들었다.
단위 quad의 UV가 `[(0,0),(2,0),(1,1),(0,1)]`일 때 실제 버퍼의 점 `(0.6,0.3,0)`은
화면에서 V-up `(0.9,0.3)`, GLB에서 V-down `(1.2,0.7)`이었다.
V 방향을 통일한 GLB는 `(1.2,0.3)`이므로 U의 0.3 차이는 좌표계 차이가 아니다.
또한 warp `1e-7`을 planar epsilon 안으로 처리하는 GLB와 기존 화면의 삼각형별 flat normal이 달랐다.
같은 UV 코너 값이나 비슷한 법선만 비교해서는 표면 내부의 일치를 증명할 수 없다.

## migration — 순수 planner와 실제 소비자

[mesh-surface](../../apps/web/src/domains/creator/mesh-surface)의 planner는 원본 half-edge를 검증하고
삼각화·법선·UV와 원본 면·정점·코너 대응표를 함께 반환한다. UI·Three·worker·GLB 컨테이너에 의존하지 않는다.
삼각형 표의 `cornerHalfEdgeIds`는 각 half-edge의 origin인 `prev.vertex`를 가리킨다.
재질별 primitive 정렬 전 순서를 표준으로 사용하며, 실제 출력 adapter만 material grouping을 수행한다.

화면은 같은 표에서 정본 정점 인덱스, 각 삼각형 코너의 법선·V-up UV·Float64 재질 슬롯을 만든다.
GLB는 같은 기하의 `POSITION`·`NORMAL`과 V-down `TEXCOORD_0`을 쓴다.
flat 메시도 공통 코너 법선을 명시적으로 Three geometry에 전달한다.
오목 면, UV가 있는 collinear 코너 보존, UV 없는 collinear 코너 생략을 소비자마다 다르게 추론하지 않는다.
UV가 없어도 보존할 crease가 있으면 원본 collinear 코너를 유지하여 경계 속성을 잃지 않는다.

선택의 `faceIndex`도 실제 삼각형 표로 해석한다. 원본 polygon 경계와 표시 대각선을 구분하고,
화면 삼각형에서 생략된 collinear 정점도 원본 면의 화면 거리 선택 후보에 남긴다.
컴포넌트 변형은 같은 표면 규칙으로 새 자기 교차·삼각화 실패·Float32 표시 손실을 저널 기록 전에 거부한다.
무관한 legacy 미지원 면 때문에 정상 면 편집을 막지 않으며, legacy 오류가 새 오류를 숨기지도 않는다.

## migration — 표시 캐시와 수정자 속성

평가 캐시의 optional `surface` revision 1은 코너 법선·선택적 V-up UV·삼각형별 재질 슬롯을 가진다.
파생 메시 hash, position/index 내용 hash, 배열 크기·UV 존재 여부·실제 바이트를 별도 내용 hash로 결합한다.
속성 배열과 position/index는 projection에서 복사하므로 캐시 변경이 정본 projection을 오염시키지 않는다.
형식이 있는 payload가 손상되면 거부하며, 속성이 없는 legacy 캐시는 원본 편집 메시로 표시한다.
작업파일은 이 폐기 가능한 캐시를 정본으로 저장하지 않는다.

오브젝트 모드는 검증된 평가 캐시의 실제 슬롯·법선·UV를 표시하고, 컴포넌트 모드는 원본 cage를 표시한다.
재질 스타일이 같으면 draw material만 묶고, 서로 다른 스타일도 평가 캐시의 슬롯 대응으로 유지한다.
원본 UV를 평가 결과의 다른 코너 수에 맞춰 억지로 붙이지 않는다.

Array는 원본 polygon과 코너 대응을 복사하며 Simple Deform은 원본 위상·속성을 유지한 채 위치만 바꾼다.
Mirror의 winding 반전·절단 보간과 Solidify의 shell·rim은 명시적인 source triangle/corner receipt로
UV·재질 슬롯·smooth·원본 정점 및 경계 crease를 전파한다. 새 내부 대각선의 crease는 0이다.
기존 위치 계산을 유지해도 fan 대신 원본 polygon을 보존하는 Array 등의 위상·결과 hash는 의도적으로 달라진다.
모든 수정자의 속성 전달 또는 Blender 전체 알고리즘의 동등성을 뜻하지 않는다.

Subdivision은 기존 삼각 midpoint 4분할을 유지하며 parent 하나의 네 child에 면 속성을 전달한다.
공유 3D edge의 midpoint는 하나만 만들고 면별 UV midpoint는 따로 계산하여 seam을 보존한다.
원본 정점 crease와 분할된 경계 edge crease를 상속하고 신규 midpoint·내부 edge는 0으로 둔다.
`smooth`의 기존 이웃 평균 위치 계산을 유지하며 Blender Catmull-Clark나 crease 기반 위치 계산을 구현했다고 설명하지 않는다.

## migration — 예산·오류·호환성

선형 메시 검사, polygon pair, ear candidate/point 검사, 삼각형 수를 따로 계수한다.
기존 화면 한도를 유지하며 추가 ear 작업 상한은 자산당 2,000,000, 동시 표시 합계 3,000,000이다.
성공 plan은 불변 mesh identity와 crease·topology 정책으로 공유하고 소비자별 예산을 재검사한다.
작은 예산의 실패가 더 큰 예산 요청을 막지 않는다.

`topologyPolicy: "editable"`은 직렬화 가능한 기존 편집 메시의 표시를 위한 정책이다.
고립 정점·bow-tie·여러 면이 공유하는 edge를 GLB 전용 manifold 제한 때문에 가리지 않는다.
canonical 정본·참조·면 순환·좌표·표면·Float32 검사는 계속 수행한다.
기본 GLB 정책은 엄격하게 유지하며 성공 memo와 build의 정책 전환도 구분한다.
실제 export topology 예외가 있는 메시에서만 기존 twin 연결의 표시 법선을 사용한다.
일반 manifold의 법선은 GLB 규칙을 유지하며, 생략한 collinear 코너의 법선 기여를 새로 더하지 않는다.

GLB의 기존 `validate → UV 검증 → sourceHash 대조 → geometry build` 순서와 오류 우선순위를 유지한다.
원본에서는 유효해도 Float32에서 새 edge collapse·면적 소실·방향 반전이 생기면
`position-float32-collapse`로 거부한다. 원래 퇴화와 overflow의 오류는 구분한다.
이 검사는 exporter·표시·컴포넌트 commit에서 같은 helper를 사용한다.

표시·선택·속성 전파는 flat crease 메타데이터를 보존할 수 있다.
smooth+crease의 화면 제한과 GLB 기본 `crease-unsupported` 정책은 유지한다.
관측하지 않은 native crease 음영을 구현한 것처럼 설명하지 않는다.

## migration — 검증 증거와 남은 범위

기준 커밋 원문을 직접 실행한 기존 17개 입력과 overflow 1개의 GLB bytes·report·metrics가 완전히 같다.
[고정 corpus](../../tests/corpus/mesh-surface/glb-8e445.json)는 정상 출력과 오류 우선순위를 함께 기록한다.
새 공유 planner의 작은 회귀와 실제 Core→Three geometry→GLB accessor의 합성 회귀는 별도로 구분한다.
최종 집중 검증은 **32파일 328개가 exit 0**으로 통과했다. 같은 명령에서 공통 plan·Float32·topology 정책,
실제 화면/GLB 버퍼, 선택·변형, UV·수정자·Subdivision·Sculpt, 캐시·workspace·실제 Panel 배치,
기존 GLB binary·worker client·툰 출력·native GLB 가져오기 회귀를 실행했다.
변경 TS/TSX 59파일 ESLint, 변경 텍스트 63파일 Secretlint, 문서 검증·소스 크기 래칫·`pnpm harness:check`도 통과했다.

Sculpt도 공통 표면과 같은 삼각형·코너 입력을 사용한다. 실제 위치가 바뀌지 않은 스트로크는
원본 identity를 유지하고, 움직인 결과는 UV 유무와 관계없이 면·crease 속성을 전파한 뒤 다시 검증한다.
브러시 산식 자체를 유지해도 source fan을 earclip으로 바꾸면 smooth 이웃·일부 평균 법선과 위치 결과가 달라질 수 있다.

브라우저 셰이더·픽셀, 전체 타입·하네스·프로덕션 빌드·native 실행은 공유 검사 슬롯에서 후속 확인한다.
기존 버퍼 테스트나 이전 브랜치의 스크린샷으로 대신하지 않는다.
아직 receipt가 없는 다른 위상 수정자는 별도 남은 범위다. 후속 BG3D MToon·래스터 구현과
실제 GPU 증거는 [BG3D 소비 계약](blender-native-bg3d-toon-runtime-contracts.md)에 별도로 기록한다.
모든 Blender 기능을 웹으로 이식했다거나 사이트 운영 반영을 마쳤다고 선언하지 않는다.
