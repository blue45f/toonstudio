# 구매 Plasticine 재질의 실제 제품 브라우저 검증

기본 `--scope core-3`는 실제 `/studio/bg3d`의 guest UI에서 다음 대표 3개를 순서대로 검사한다.

- `emaceart-plasticine-01-native-8k`
- `emaceart-plasticine-01-godot-2k`
- `emaceart-plasticine-11-godot-2k`

원본 선택만으로 PBR 요청이 추가되지 않는지, 적용 후 실제 채널·색 공간·반복·normal 설정과
자연스러운 제품 렌더 프레임·GPU 업로드·활성 shader sampler와 실제 표면 무늬를 확인한다.
제품 UI로 실행 취소·다시 실행, 내 템플릿 저장,
재질 해제, reload 후 빈 장면 확인, 저장한 템플릿 재적용과 원본 선택 복원까지 이어진다.
문서·세션·OPFS·재질·렌더러를 직접 주입하거나 제품의 추가 프레임을 요청하지 않는다.

## 실행 준비와 명령

구매 권한이 있는 원본 PNG 59개가 카탈로그 URL에 대응하는
`apps/web/public/assets/virtual-studio/purchased-materials-v1/plasticine/maps/`에 있어야 한다.
이 폴더의 원본 payload는 Git에 포함하지 않는다. 실행 전 카탈로그의 정확한 파일 집합,
크기와 SHA256을 스트리밍 대조한다. 현재 합계는 1,938,819,011바이트이며,
원본을 축소·변환·복제하거나 다른 해상도로 대체하지 않는다.

먼저 별도 터미널에서 소유한 loopback 서버를 시작한다. 저장소와 새 캐시 경로는 절대 경로다.

```sh
node apps/web/tools/browser-harnesses/plasticine-materials/source-server.mjs \
  <저장소의_절대_경로> 5199 <아직_없는_외부_캐시_절대_경로>
```

서버의 `ready` JSON을 확인한 다음 실행한다. 서버는 제품 Vite 설정을 사용하고 env 파일을
로드하지 않으며, loopback·strict port·HMR 비활성·의존성 사전 최적화 완료를 확인한다.
제품 모듈 alias나 API 성공 mock을 추가하지 않는다.
실제로 여는 route·정밀 편집·View·Templates와 관측기 entry를 변환하고, Vite 8.3.4의
실제 pre-transform 대기열이 비었는지 확인한 뒤 ready를 낸다. 이 dev 입력 준비는
cold 제품 로딩 성능을 측정하거나 보증하는 절차가 아니다.

```sh
node apps/web/tools/browser-harnesses/plasticine-materials/browser.mjs \
  --repo <저장소의_절대_경로> --expected-head <40자리_HEAD> \
  --base-url http://127.0.0.1:5199/ \
  --observer-url http://127.0.0.1:5199/tools/browser-harnesses/plasticine-materials/passive-entry.ts \
  --out <아직_없는_결과_폴더의_절대_경로> \
  --browser-binary <소유한_Chrome_for_Testing_바이너리의_절대_경로> \
  --scope core-3 --work-ms 800000
```

결과 폴더는 소스 밖의 새 디렉터리를 사용한다. ignored QA 결과 폴더나 저장소 밖의 경로를
권장한다. 드라이버가 만든 Chrome과 context는 드라이버가 종료하고, 소유 서버의 종료와
포트·잔여 프로세스 확인은 실행자가 맡는다. 실패 시 자동 재시도·재클릭은 하지 않는다.

DOM 대기는 15초, 원본 채널 로딩은 120초, 전체 작업은 800초, 정리 예비 시간은 60초다.
실제 Apple/Metal WebGL2·최대 texture 8K 이상을 요구하며 software renderer를 거부한다.
원본 8K를 포함한 실제 decode 크기·채널 URL·색 공간을 검사한다. 원래 PNG 판정인
변경 픽셀 100개 초과·최대 채널 차이 3 초과·색상 3개 초과를 유지한다.
각 필수 채널의 `source.dataReady`, 실제 GPU Texture 존재, 업로드 버전 일치와 활성 sampler를
추가로 요구한다. 실행 취소·해제에서는 채널뿐 아니라 shader sampler도 제거되어야 한다.

최초 적용·다시 실행·저장 후 재열기는 실제 포털 camera, geometry/normal/UV, mesh TRS,
색 공간·tone mapping·해상도와 재질 설정이 같은지 먼저 확인한다. 실제 투영 삼각형의 내부에서
경계 2 PNG 픽셀과 표시된 기즈모 geometry의 투영 경계를 제외한 영역을 비교한다.
같은 표면의 RGB 차이 3 초과 픽셀은 0개여야 하며, 비교 픽셀은 100개를 넘어야 한다.
첫 적용과 재열기는 각각 한 면 내부에 비회색 픽셀 100개 초과와 4단계 양자화 색상 8개 초과를
요구해 둘 다 회색인 경우도 실패시킨다. ROI는 PNG 색·차이·고정 좌표로 고르지 않는다.
실행 취소는 같은 조건에서 최초 무맵 표면으로 복원되는지도 비교한다.
프리셋 해제는 기존 제품 규칙대로 현재 도형 색을 유지하면서 맵·sampler를 제거하고,
roughness·metalness·불투명도·발광·wireframe의 기본값을 복원하는지 검사한다.
해제와 전체 재질 변경의 실행 취소는 서로 다른 명령이다.

`passive-entry.ts`는 같은 app Vite 그래프의 R3F store·실제 scene/interaction 객체를 읽는다.
별도 미러나 다른 R3F 사본을 사용하지 않는다. 변경 중 제품도 검증할 수 있도록 clean 상태를
강제하는 대신 HEAD, 관련 범위의 tracked 변경·신규 소스, 카탈로그, 공개 검증 소스의 SHA256을
실행 전후 대조한다. 검증 중 제품이나 검증 소스를 편집하면 실패한다.

## 증거와 한계

`receipt.json`, 대표별 JSON·PNG, `events.json`을 남긴다. 실패 시 원래 오류를 유지하면서
가능한 DOM·이미지 완료 상태·resource 완료 시각·미완료 재질 요청 진단을 추가한다.
진단 실패를 성공으로 바꾸거나 대기 시간을 늘리지 않는다.

로컬 원본 SHA256 사전 대조와 브라우저 HTTP 완료·200 상태·실제 decode 관측은 별도 증거다.
HTTP 응답 body의 SHA256을 검증했다는 주장은 하지 않는다. 사전 원본 59개 대조는
19개 재질 전체의 브라우저 검증을 의미하지 않는다. 라우팅으로 HTTP 캐시가 비활성화될 수 있다.
실제 API·계정·외부 공급자 요청과 WebSocket은 차단하며 성공 응답으로 대체하지 않는다.
해당 차단의 Chrome resource 오류와 Vite WebSocket 오류만 예상된 콘솔 기록으로 구분하며,
그 외 콘솔 오류와 페이지 예외는 실패로 판정한다.

2026-11-01의 기존 `materials-r1`·`materials-final-r2`는 구 버전 드라이버에서 종료 코드 0을
기록했으나, 독립 PNG 검토에서 최초 적용 3개가 회색이고 재열기만 무늬가 표시됨을 확인했다.
기존 기본색→회색 변화도 픽셀 변화 조건을 통과했으므로, 해당 기록을 최초 무늬 표시의
통과 증거로 사용하지 않는다. 원본 59개 무결성과 재열기 증거는 그대로 보존한다.
이후 v3는 GPU 업로드·shader와 같은 실제 표면의 왕복 동등성·독립 무늬 검사를 함께 요구한다.
강화된 도구의 새 실행 결과는 과거 종료 코드 0과 구분해 기록한다.

이 검증은 Safari·설치형 Chrome·WebGPU 성능·장시간 메모리 안정성·GLB 내보내기·운영 배포를
보증하지 않는다. 비공개 r5의 이전 실패 기록은 이 공개 사본의 통과 증거가 아니며,
공개 사본은 정확한 HEAD와 변경 소스가 봉인된 새 실제 실행으로 검증해야 한다.


## 별도 복수 객체 범위

`--scope core-3`는 기존 대표 3종·원본 해상도·판정 수치·800초 작업/60초 정리 상한을 유지한다. `--scope multi-object`는 별도 fresh guest context에서 Godot01/11만 사용하는 복수 객체 격리 사례 하나를 검사한다. 같은 인자 구조와 시간 상한을 사용하며 두 scope를 한 실행에서 이어 붙이지 않는다. scope별 결과는 실행 시의 receipt에 한정하며 전체19·Safari·WebGPU·GLB·운영 배포를 보증하지 않는다.

복수 객체는 두 상자를 UI로 만들고 이름·위치를 정한 뒤, 선택한 A만 재질 변경·해제·Undo/Redo하고 B의 원본 채널·실제 무늬가 보존되는지 본다. 첫 재질 적용 전에 기본 카메라에서 비가림·각 표면 >100px인 배치를 정하며, 재질 첫 표시 뒤 카메라 입력으로 실패를 살리지 않는다. 사용자 템플릿은 노드 추가와 ID 재발급 계약이다. 저장·reload의 빈 장면·템플릿 적용 뒤 원래 위치/geometry로 새 ID를 대응시켜 각 원본 무늬를 비교한다.

관측기는 WebGLTexture 객체를 observer 전용 WeakMap 숫자 토큰으로 읽는다. runner는 같은 observe 함수 참조를 JSHandle로 고정하고 교체되면 실패한다. 같은 세션 B의 토큰·UUID·업로드·alive·표면만 불변 요구하며, reload 후 새 epoch·토큰을 허용한다. 토큰은 드라이버 내부 물리 저장소 보존을 증명하지 않는다. JSHandle은 reload 전과 context 정리 때 해제한다.

receipt는 `plannedCaseIds/plannedVariantIds/notPlannedVariantIds`, `executedCaseIds/notExecutedCaseIds/passedCaseIds`, `uiRequestedVariantIds/naturalReadyVariantIds`로 계획·시작·요청·준비·통과를 구분한다. 복수 객체의 case ID를 단일 재질 실행 ID로 취급하지 않는다. `notExecutedIds`는 core-3의 기존 의미를 유지하며, multi-object에서는 해당 scope에 계획한 ID 중 UI 적용 요청을 하지 않은 ID이며, 계획에서 제외한 ID는 `notPlannedVariantIds`로 구분한다. 첫 8K 원본은 multi-object 범위에 포함되지 않는다. 새 `multi-object-scenario.mjs`도 변경 여부와 관계없이 항상 source pin에 포함한다.

## chair 가져온 모델 두 인스턴스 범위

`--scope imported-model --work-ms 800000`은 별도 fresh guest context의 `imported-model-same-source-material-isolation` 사례 하나만 계획한다. 기존 `core-3`와 primitive `multi-object` 범위는 독립 실행한다. 소스 채택과 실제 실행 통과는 구분하며, 실행한 SHA·소스 핀·receipt로만 결과를 판정한다.

입력은 기존 Kenney CC0 `assets/studio/cc0-20260906/assets/kenney-furniture/chair.glb` 원본 10,756바이트, SHA256 `c8a11eec93e89e31250ba91afc1b8d56c3bec7ae86640fd1239f595ff4180883` 하나다. 파일을 실제 모델 가져오기 UI에 한 번 전달하고 outliner의 일반 `복제` UI로 두 번째 인스턴스를 만든다. 별도 asset 재가져오기·연결 복제·DB/cache 쓰기는 사용하지 않는다. 원본 GLB를 수정하거나 무늬 이미지를 만들지 않는다. 실행 전후 GLB·LICENSE·manifest의 path/bytes/SHA를 별도 fixture receipt에 기록하고, 최초 검증한 원본 Buffer를 그대로 실제 파일 input에 전달한다.

두 인스턴스가 같은 geometry UUID와 서로 다른 mesh/material UUID를 가지는지 읽는다. 저장 완료 후 실제 표시된 유일한 카드의 현재 committed React owner props에서 canonical v3 UI 데이터를 읽어 최초 ID·이름으로 A/B를 찾고, 같은 attachmentId·원본 hash/bytes·MIME·local-library source를 별도로 판정한다. attached fiber는 HostRoot 발견에만 쓰며 current 트리의 membership과 lazy resolved owner를 확인한다. own data descriptor만 허용하며 getter·제품 callback·저장소 accessor·runtime API는 호출하지 않는다. 이 관측은 `committed-ui-render-state`이고 `durableStorageProofObserved:false`다. 내구성은 관측기 reader 해제 → reload → 빈 장면 → 저장한 정확한 UI 카드 적용 → 위치·geometry로 새 ID 대응 → 자연 렌더와 원본 표면 일치로 별도 판정한다. runtime modelId는 직접 관측하지 않는다. 재질 source를 새 ID 대응 키로 쓰지 않는다.

실제 원본은 1 Mesh·1 primitive·MeshStandard 경로·무텍스처·정적 GLB다. UV 230개는 finite이고 고유 좌표쌍 134개, 삼각형 170개 중 양수 UV 면적 162개·0면적 8개다. UV가 [0,1] 밖으로 넓게 펼쳐져 반복되므로 실제 가시 면의 무늬는 Chrome 판정이 필요하다. 이 한 대표가 전체 GLB/glTF·스킨·애니메이션·복수 mesh·복수 재질·다른 파일 형식 호환성을 증명하지 않는다.

A/B의 Godot01 첫 적용을 각각 추가 UI 없이 자연 GPU 준비와 실제 면 무늬로 남긴 뒤, A의 Godot11 교체·Undo/Redo·`원본 복원`·Undo/Redo·다시 Undo·템플릿 저장·reload·재열기를 검사한다. 원본 복원은 GLB 고유 linear 색 `[0.8962264,0.6015712,0.3931559]`와 roughness 1/metalness 0 및 초기 material 수치·보조맵 baseline을 정확 비교한다. 동일 세션에서 B의 Texture UUID·WebGLTexture 객체 토큰·업로드·alive·실제 표면을 매번 보존해야 한다. 재열기에는 새 토큰을 허용한다.

모델 자식에 R3F state가 없으면 가장 가까운 실제 R3F ancestor의 같은 renderer와 scene ancestry를 확인해 그 포털 camera를 읽는다. 기본 Canvas camera로 묵시 대체하지 않는다. 수치 위치 입력은 model owner의 position으로 확인하고, 투영에는 계속 실제 자식 meshMatrixWorld를 사용한다. 기본 camera에서 첫 재질 적용 전에만 배치를 정하며, 첫 자연 무늬 증거 전에 추가 선택·camera·렌더 요청을 넣지 않는다. 기존 800초 작업/60초 정리, 실제 Apple/Metal WebGL2, 면 >100px, 삼각형 안쪽 2 native px·실제 기즈모 제외, 비회색 픽셀 >100·색 >8, 차이 >3인 픽셀 0개 조건을 유지한다.

## Lettuce의 atlas 원본과 내 템플릿 왕복

`--scope lettuce-template`은 별도 새 guest context에서 Lettuce 사례를 실행한다.
공통 실행 인자에 다음 원본 경로를 명시한다.

```sh
  --scope lettuce-template --work-ms 800000 \
  --lettuce-file <Lettuce_C.owner-bound.glb의_절대_경로> \
  --lettuce-receipt <같은_정상화_작업_receipt.json의_절대_경로>
```

GLB는 563,256바이트/SHA256 `d0278329da4045e00515f0bad66925eccdf08985c9aed1f66d90a929a777f3a3`다.
정상화 receipt 4,854바이트와 RG Poly `cbv1-030-nature-megapack-extended` 권리 원장,
2026-10-28에 보관한 공식 페이지 발췌·증거 인덱스를 실행 전후 고정 대조한다.
보관 페이지는 CC0-1.0을 기록하며 현재 웹 페이지를 재조회한 증거로 취급하지 않는다.
사용자의 원본 절대 경로·구매 기록·GLB Buffer를 결과 JSON에 넣지 않는다.

원본은 mesh/material 하나, 정점 210개·index 282개이며 1024×1024 embedded baseColor atlas가 있다.
원본 색 `[1,1,1]`, roughness 1, metalness 0, double-sided와 실제 atlas decode·GPU 업로드를 확인한다.
실제 파일 UI 가져오기 한 번과 일반 복제로 두 모델을 만들고 A에는 Godot11, B에는 Godot01을 적용한다.
A 적용으로 B의 원본 atlas와 인스턴스 재질이 바뀌지 않는지, 첫 적용 무늬가 추가 선택·camera 입력 없이
표시되는지 검사한다. 이후 저장·reload·빈 장면·같은 카드 적용·새 ID 대응·두 원본 표면 일치까지
chair와 같은 기준으로 검사한다. Lettuce 범위는 Undo/원본 복원 사례를 반복하지 않는다.
그 근거는 chair 범위에 따로 남긴다.

동일 hash의 번들 asset이 503인 경우 local-library 첨부를 우선하는 계약은 제품 단위 테스트의 근거다.
이 브라우저 범위는 실제 정상 UI 카드 적용을 검사하며 503을 주입하지 않는다.
`unavailableBundleTested:false`를 유지하고 단위 테스트와 실제 Chrome 결과를 합쳐 쓰지 않는다.

## 실행 자원과 최종 판정

각 사례는 새 포트·새 runKey와 소유 PID/PG를 정한 유한한 단독 구간에서 실행한다.
슬롯 계획 1,200초 안에서 준비 120초 + 작업 800초 + 브라우저 정리 60초 + driver/server/guard 정리와
사전·최종 IO 여유를 확보한다. 이 문서는 예약 자체가 아니며 외부 guard의 실제 상한을 기록한다.
원본 runner·patch·archive·C8 dist와 공개 재질 PNG 59개는 덮어쓰지 않는다.
제품 소스가 달라졌으면 기존 dist 대신 고정된 새 Vite 소스를 사용한다.

외부 실행 감독은 `/usr/bin/memory_pressure -Q`의 같은 System-wide free percentage를 시작 전과
15초 간격으로 확인한다. 40% 미만 또는 측정 실패 시 자기 소유 작업만 중단하고 실패와 정리 결과를
보존한다. 다른 프로세스를 종료하거나 품질·원본 해상도·판정 기준을 낮추지 않으며 자동 재시도하지 않는다.
이 감독은 browser driver에 내장되어 있지 않으므로 실행 receipt에서 실제 사용 여부를 별도로 증명한다.

실행한 Chrome 바이너리·버전·프로세스와 보안 원점, 제품 소유 Canvas의 실제 WebGL2 renderer/vendor,
context-lost 이벤트·페이지·콘솔·원본 네트워크 오류를 기록한다. 별도 WebGPU adapter probe를
실행하지 않는다. 명시 WebGL2 결과는 기본 WebGPU·adapter/device·FPS·다른 장치 성능 증거가 아니다.
브라우저 통과뿐 아니라 소유 서버 정상 종료, guard 자연 종료, 강제 정리 없음·소유 잔여 없음,
기한 준수와 최종 소스·원본 핀 일치가 확인된 뒤 완료로 판정한다. 운영 배포는 범위 밖이다.


## chair의 남은 템플릿 왕복 범위 — 2026-11-02

`--scope imported-template --work-ms 800000`은 별도
`imported-model-template-material-roundtrip` 사례다. 기존 `imported-model`의 전체 검사 기본값은 유지한다.
정확한 boolean `templateOnly` 옵션으로 기존 Lettuce와 공통 템플릿 분기를 사용한다.
새 guest context에서 chair 원본 파일 한 번·일반 복제·기본 배치를 준비하고 A11/B01의 자연 무늬를 확인한 뒤,
저장·reader 해제·reload·빈 장면·정확한 카드 적용·위치/geometry에 따른 새 ID 대응·원본 표면 일치를 검사한다.
원본 shader·fixture/권리·GPU·오류·원본 해상도·800초 작업/60초 정리 기준을 유지하며
이 범위의 `historyTested`는 `false`다. 템플릿 분기의 PNG 이름은 `template-*`로 중립 표기한다.

r4 실제 실행은 chair의 최초 적용·B 격리·변경 Undo/Redo·원본 복원과 그 Undo/Redo의 표면 비교를 완료한 뒤,
템플릿 패널의 lazy 로딩 직후 유일성 검사에서 실패했다. 해당 원본 failed receipt와 PNG를 그대로 보존한다.
남은 범위는 패널/카드의 실제 표시를 기존 15초 안에서 기다린 뒤 템플릿 왕복만 별도로 실행한다.
전체 평가는 r4의 확인된 부분과 새 제한 왕복 결과를 결합하되, r4 전체 사례를 통과로 바꾸거나
새 범위에서 history가 다시 검증됐다고 표시하지 않는다. 실제 새 결과가 나오기 전에는 이 왕복도 미완료다.
