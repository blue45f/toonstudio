# 분기형(독자 선택) 컷툰 — 데이터 모델·검증기·최소 플레이어 (Labs 실험)

- 상태: **current**(기반과 Labs 화면) + **target**(아래 "목표 상태"). 두 상태를 섞어 쓰지 않는다. 소스와 테스트로 확인되는 것만 current 로 적었고, 사람이 실제 브라우저에서 조작해 본 결과는 아니다(→ "검증 범위").
- 확인일: 2026-10-22 (`apps/web/src/domains/creator/branching-cuttoon/model/`, `apps/web/src/domains/creator/branching-cuttoon/`)
- 범위: 독자가 장면 끝의 선택지를 눌러 다음 컷 묶음(장면)으로 가는 컷툰의 순수 데이터 계약(`BranchingCuttoonGraph` v1)과 결정적 검증기, JSON 내보내기·가져오기, 독자 읽기 진행 상태와 이 브라우저 안의 저장·복원, 최소 플레이어, 목록형 최소 제작 화면.
- 범위 밖(하지 않았다): 서버 저장, 독자 통계, 정산, 그래프 캔버스, 컷 이미지 연결, 게시된 작품 읽기 화면과의 연결(→ "목표 상태", "한계").
- 노출: Labs(`experimental` 성숙도, `labs` 계층) 경로 `/studio/branching-cuttoon` 하나뿐이다. 핵심 제작 여정과 같은 위계로 두지 않는다(PRODUCT.md: Labs 는 선택적으로 쓰는 실험·고급 도구).

## 한눈에 보기

| 영역 | 상태 | 근거 |
| --- | --- | --- |
| 그래프 모델 v1(장면·선택지·컷 표·시작 장면·한도) | current | `branching-cuttoon-types.ts` |
| 결정적이고 fail-closed 인 검증기(오류 21종·경고 4종) | current | `branching-cuttoon-validate.ts`, `branching-cuttoon-validate.test.ts` |
| 도달 가능성·결말 도달 가능성·되돌아가는 길·길 열거(상한 있음) | current | `branching-cuttoon-analysis.ts`, `branching-cuttoon-analysis.test.ts` |
| JSON 내보내기·가져오기(모양 검사) | current | `branching-cuttoon-json.ts`, `branching-cuttoon-json.test.ts` |
| 불변 편집 함수(한도를 넘기는 추가·시작 장면 삭제 거절) | current | `branching-cuttoon-edit.ts`, `branching-cuttoon-edit.test.ts` |
| 읽기 상태(현재 장면·방문 이력·되돌리기 스택)와 그래프 판 지문 | current | `branching-cuttoon-reader.ts`, `branching-cuttoon-version.ts` |
| 읽던 위치·초안의 이 브라우저 저장과 복원, 저장 실패 시에도 읽기 계속 | current | `branching-cuttoon-storage.ts`, `branching-cuttoon-storage.test.ts` |
| 최소 플레이어(컷 세로 나열, 선택지, 되돌아가기, 처음부터, 결말, 장면 전환 안내) | current | `BranchingCuttoonPlayer.tsx`, `BranchingCuttoonPlayer.test.tsx` |
| 최소 제작 화면(장면·컷·선택지 목록 편집, 점검 결과, 오류에서 장면으로 이동, 샘플) | current | `BranchingCuttoonLabPage.tsx`, `BranchingCuttoonLabPage.test.tsx` |
| Labs 경로 등록(라우트 권위·메타·사이트맵·공간 캠퍼스 분류·경로 이름 문구) | current | `site-route-authority.ts`, `site-route-metadata.ts`, `site-directory-data.ts`, `campus-bindings.ts`, `branching-cuttoon-route.test.ts` |
| 서버 저장·발행 연결 | **target** — 아직 없다 | "목표 상태" |
| 독자 통계·정산 | **target** — 아직 없다 | "목표 상태" |
| 컷 이미지·편집기 문서의 컷과 연결 | **target** — 아직 없다 | "목표 상태" |
| 그래프 캔버스(시각 편집) | **하지 않는다** — 목록으로만 편집한다 | "한계" |
| 실제 브라우저에서 사람이 조작한 검증 | 아직 안 함 | "검증 범위" |

## 원칙

1. **순수하고 결정적이다.** `apps/web/src/domains/creator/branching-cuttoon/model/` 의 모듈은 네트워크·시간·난수·브라우저 저장소·동적 import 에 기대지 않는다(`branching-cuttoon-purity.test.ts` 가 소스를 읽어 확인한다). 같은 그래프는 언제나 같은 순서의 같은 보고서를 낸다.
2. **fail-closed.** 오류가 하나라도 있는 그래프는 독자에게 보여 주지 않는다. 가져오기에서 모양이 틀린 파일은 일부만 받지 않고 통째로 거절한다. 저장된 읽기 기록이 하나라도 어긋나면 기록 전체를 버리고 처음부터 시작한다.
3. **저장이 실패해도 읽기는 계속된다.** 저장소가 막혔거나 가득 차도 읽기·편집 화면은 멈추지 않고, 저장하지 못했다고 다음 행동과 함께 알린다.
4. **경고는 읽기를 막지 않는다.** 되돌아가는 길처럼 의도일 수 있는 구조는 경고로 구분해 알리고, 판단은 작가에게 맡긴다.
5. **상한이 있다.** 크기 한도와 길 열거 상한이 있어, 어떤 입력에서도 작업량이 고정된다.

## 데이터 모델 (BranchingCuttoonGraph v1)

| 개념 | 필드 | 설명 |
| --- | --- | --- |
| 그래프 | `title`, `startNodeId`, `cuts`, `nodes` | 작품 제목, 시작 장면, 컷 표, 장면 목록 |
| 장면(노드) | `id`, `kind`, `title`, `cutIds`, `choices` | `kind` 는 `start`, `scene`, `ending` 중 하나. `cutIds` 는 컷 표의 컷을 읽는 순서대로 적은 컷 참조 목록 |
| 선택지 | `id`, `label`, `targetNodeId` | 독자가 장면 끝에서 누르는 단추. `id` 는 같은 장면 안에서만 유일하면 된다. `targetNodeId` 가 비어 있으면 아직 도착 장면을 고르지 않은 선택지다 |
| 컷 | `id`, `caption` | v1 의 컷은 **글 카드**다. 이미지 연결은 목표 상태다 |

- 시작 장면은 `startNodeId` 가 가리키는 장면이고 종류도 `start` 여야 하며 `start` 종류는 하나뿐이다.
- 결말(`ending`)은 독자에게 선택지를 보이지 않는다. 결말에 선택지가 남아 있으면 경고(`ending-has-choices`)로 알린다.
- 식별자는 영문·숫자로 시작하고 영문·숫자·밑줄·붙임표만 쓴다(48자까지).

### 크기 한도

글자 수는 UTF-16 코드 단위가 아니라 코드 포인트로 센다. 아래 값은 `BRANCHING_CUTTOON_LIMITS` 와 같아야 하고, `model/branching-cuttoon-docs.test.ts` 가 표와 코드를 대조한다.

| 한도 | 이름 | 값 |
| --- | --- | --- |
| 장면 수 | `nodes` | 200 |
| 장면당 선택지 | `choicesPerNode` | 6 |
| 장면당 컷 참조 | `cutsPerNode` | 30 |
| 컷 표의 전체 컷 | `cuts` | 1000 |
| 작품 제목 길이 | `graphTitleLength` | 80 |
| 장면 제목 길이 | `nodeTitleLength` | 80 |
| 선택지 라벨 길이 | `choiceLabelLength` | 80 |
| 컷 글 길이 | `captionLength` | 200 |
| 식별자 길이 | `idLength` | 48 |

한도를 넘으면 검증기는 `limit-exceeded` 오류를 내고, 편집 함수는 한도를 넘기는 추가를 거절한다(입력 칸은 `maxLength` 로 미리 막는다).

## 검증기

`validateBranchingCuttoon(graph)` 는 입력을 바꾸지 않고 `valid`, 오류·경고 수, 정렬된 항목 목록, 통계, 그래프 판 지문을 돌려준다. 항목은 오류가 먼저, 그다음 그래프 전체 → 장면 순서, 같은 장면 안에서는 코드 순서로 정렬한다. 화면은 코드로 문구를 고르므로 문구를 바꿔도 코드는 바뀌지 않는다.

| 코드 | 구분 | 뜻 |
| --- | --- | --- |
| `start-missing` | 오류 | 시작 장면이 없다(장면이 없거나 `startNodeId` 가 비었다) |
| `start-dangling` | 오류 | 시작 장면으로 지정한 장면이 없다 |
| `start-kind-mismatch` | 오류 | 시작으로 지정한 장면의 종류가 `start` 가 아니다 |
| `start-duplicate` | 오류 | 종류가 `start` 인 장면이 둘 이상이다 |
| `node-id-invalid` | 오류 | 장면 식별자 형식이 맞지 않는다 |
| `node-id-duplicate` | 오류 | 장면 식별자가 겹친다 |
| `choice-id-invalid` | 오류 | 선택지 식별자 형식이 맞지 않는다 |
| `choice-id-duplicate` | 오류 | 같은 장면 안에서 선택지 식별자가 겹친다 |
| `cut-id-invalid` | 오류 | 컷 식별자 형식이 맞지 않는다 |
| `cut-id-duplicate` | 오류 | 컷 식별자가 겹친다 |
| `choice-target-empty` | 오류 | 선택지의 도착 장면을 고르지 않았다 |
| `choice-target-dangling` | 오류 | 선택지가 없는 장면을 가리킨다(끊어진 참조) |
| `cut-ref-dangling` | 오류 | 장면이 컷 표에 없는 컷을 가리킨다(끊어진 참조) |
| `choice-label-empty` | 오류 | 선택지 라벨이 비었다(공백뿐인 경우 포함) |
| `choice-label-duplicate` | 오류 | 같은 장면 안에서 라벨이 겹친다(호환 정규화·소문자·공백 접기 기준) |
| `text-invalid-character` | 오류 | 제목·라벨·컷 글에 제어 문자·방향 제어·보이지 않는 폭 0 문자가 있거나, 한 줄 글에 줄바꿈이 있다 |
| `limit-exceeded` | 오류 | 크기 한도를 넘었다(어느 한도인지와 한도·실제 값을 함께 싣는다) |
| `node-unreachable` | 오류 | 시작 장면에서 선택지를 따라 닿을 수 없는 장면이다 |
| `dead-end` | 오류 | 결말이 아닌데 눌러서 갈 수 있는 선택지가 하나도 없다(막다른 길) |
| `ending-missing` | 오류 | 결말이 하나도 없다 |
| `ending-unreachable` | 오류 | 닿을 수 있는 결말이 아닌 장면인데, 거기서는 어떤 결말에도 갈 수 없다 |
| `loop-back` | 경고 | 지금 지나는 길 위의 앞선 장면으로 되돌아가는 선택지(순환) |
| `ending-has-choices` | 경고 | 결말에 선택지가 남아 있다(독자에게 보이지 않는다) |
| `node-title-empty` | 경고 | 장면 제목이 비었다 |
| `cut-ref-repeated` | 경고 | 한 장면이 같은 컷을 여러 번 가리킨다 |

통계(`stats`)는 장면·결말·선택지·컷 수, 시작에서 닿는 장면 수, 되돌아가는 길의 수, 가장 가까운 결말까지의 선택 횟수, 열거한 길의 수와 가장 긴 길을 알린다.

### 길 열거 상한

시작 장면에서 결말까지 가는 길(같은 장면을 두 번 지나지 않는 길)은 선언 순서대로 열거하고, 아래 세 상한 중 하나에 닿으면 멈춘다. 멈췄을 때 길의 수는 "N개 이상(일부만 셌어요)"으로 알리고 정확한 값처럼 보이지 않는다. 상한은 `BRANCHING_PATH_LIMITS` 와 같다.

| 상한 | 이름 | 값 |
| --- | --- | --- |
| 모을 길의 수 | `maxPaths` | 200 |
| 한 길이 지나는 장면 수 | `maxDepth` | 64 |
| 살펴볼 선택지(간선) 수 | `maxSteps` | 20000 |

도달 가능성·결말 도달 가능성·되돌아가는 길 찾기는 장면 수와 선택지 수에 비례하는 시간에 끝나고 길 열거와 무관하다.

## 막다른 길 검사가 보장하는 것과 보장하지 않는 것

오류가 하나도 없는(`valid = true`) 그래프가 보장하는 것:

1. 시작 장면이 하나 있고, 존재하며, 종류가 `start` 다.
2. 모든 선택지는 라벨이 있고(같은 장면 안에서 서로 다르다), 그래프에 있는 장면을 가리킨다. 끊어진 참조가 없다.
3. 모든 장면은 시작 장면에서 선택지를 따라 닿을 수 있다(`node-unreachable` 없음).
4. 결말이 아닌 모든 장면에는 눌러서 갈 수 있는 선택지가 적어도 하나 있다(`dead-end` 없음). 독자는 어떤 장면에서도 "눌러 볼 곳이 없는" 상태에 놓이지 않는다.
5. 시작에서 닿는 결말이 아닌 모든 장면에서, 선택지를 따라 어떤 결말에든 닿는 길이 적어도 하나 있다(`ending-unreachable` 없음). 결말로 빠져나올 수 없는 닫힌 고리는 오류다.
6. 모든 글이 길이 한도 안에 있고 읽거나 그리면 안 되는 문자가 없다.

보장하지 않는 것:

- **독자가 결말에 닿는다는 것.** 되돌아가는 길(순환)이 있으면 독자는 같은 장면들을 계속 오갈 수 있다. 결말로 가는 길이 "있다"는 것만 확인하며, 읽다가 끝에 이르도록 강제하지 않는다. 독자는 언제든 "한 걸음 되돌아가기"와 "처음부터"로 빠져나올 수 있다.
- **어느 순환이 경고로 잡히는가.** 같은 순환이라도 경고가 어느 선택지에 붙는지는 선언 순서대로 하는 깊이 우선 탐색에 달려 있다(같은 그래프는 언제나 같은 결과다).
- **길의 총수.** 길 열거는 상한에서 멈춘다. 선택지가 많은 그래프의 길 수는 "이상"으로만 알 수 있다.
- **이야기가 말이 되는지.** 선택지 글과 도착 장면의 내용이 맞는지, 선택이 균형 있는지, 개연성이 있는지는 보지 않는다.
- **같은 뜻의 다른 글.** 라벨 중복은 호환 정규화·소문자·공백 접기 뒤의 글이 같을 때만 잡는다. 뜻이 같은 서로 다른 문장은 잡지 못한다.
- **컷 내용.** 컷은 글 카드이고, 이미지나 원고와의 일치는 확인하지 않는다.
- **서버 신뢰.** 이 검증은 이 브라우저 안에서만 돈다. 서버에 올리는 기능이 생기면 서버가 같은 검증을 다시 해야 한다(지금은 서버 저장이 없다).

결말에 선택지가 남은 경우(`ending-has-choices`)와 되돌아가는 길(`loop-back`)은 경고라서 위 보장에 영향을 주지 않는다. 결말의 선택지는 간선으로 세지 않는다.

## JSON 내보내기·가져오기

형식은 `format = "toonstudio.branching-cuttoon"`, `schemaVersion = 1` 이고, 필드 순서가 고정되어 같은 그래프는 언제나 같은 글이 된다. 오류가 남은 초안도 내보낼 수 있다.

가져오기는 **모양만** 확인한다: JSON 문법, 형식 이름과 판 번호, 필드 형식, 자원 남용을 막는 큰 상한. 모양이 맞으면 내용이 잘못되어 있어도 그래프로 돌려주고, 내용의 옳고 그름은 검증기가 알린다. 그래서 작가는 가져온 뒤 오류를 눌러 가며 고칠 수 있다. 알 수 없는 필드는 읽지 않고 버리며 버린 개수만 알린다. 모양이 틀린 파일은 오류 위치(예: `nodes[2].choices[0].label`)와 함께 통째로 거절한다.

| 가져오기 상한 | 이름 | 값 |
| --- | --- | --- |
| 글 전체 길이(글자) | `maxTextLength` | 1048576 |
| 장면 수 | `maxNodes` | 2000 |
| 장면당 선택지 | `maxChoicesPerNode` | 100 |
| 장면당 컷 참조 | `maxCutIdsPerNode` | 500 |
| 컷 표의 전체 컷 | `maxCuts` | 5000 |
| 문자열 하나의 길이 | `maxStringLength` | 2000 |
| 보여 주는 오류 수 | `maxReportedErrors` | 20 |

가져오기 상한은 크기 한도보다 훨씬 커서, 한도를 넘는 파일도 읽어 들여 오류로 보여 줄 수 있다. 파일은 UTF-8 이라 글자 수 상한의 3배 바이트를 넘으면 읽기 전에 거절한다.

## 독자 읽기 진행의 저장과 복원

- 읽기 상태는 현재 장면, 방문 이력(처음 간 순서, 중복 없음), 되돌리기 스택이다. 되돌려도 방문 이력은 지워지지 않는다. 스택은 400단계까지이고, 넘으면 가장 오래된 단계부터 버린다.
- 저장 위치는 이 브라우저의 `localStorage` 뿐이다. 작품마다 기록이 하나다.

| 저장 키 | 내용 |
| --- | --- |
| `toonstudio.branching-cuttoon.draft.v1` | 제작 화면의 초안(내보내기와 같은 JSON) |
| `toonstudio.branching-cuttoon.progress.v1.<작품 식별자>` | 읽던 위치 기록. 이 화면의 작품 식별자는 `draft` 다 |

- 기록에는 **그래프 판 지문**이 들어 있다. 지문은 시작 장면, 장면(식별자·종류), 선택지(식별자·도착 장면)로 만든다. 제목·라벨·컷 글·순서는 넣지 않는다. 그래서 오타를 고치거나 문구를 다듬어도 읽던 위치가 유지되고, 장면·선택지의 연결이 바뀌면 처음부터 시작한다고 알린다. 지문은 암호학적 해시가 아니라 변경 감지용이다.
- 복원은 fail-closed 다. 지문이 다르거나, 없는 장면을 가리키거나, 지나온 선택이 이어지지 않거나, 결말에서 선택지를 눌렀다는 기록이면 전체를 버린다.
- 저장이 막혀 있거나(프라이빗 창·차단) 가득 차면 읽기는 계속하고 "저장하지 못했어요"를 알리며, 다음 선택 때 저장을 다시 시도한다. 읽기 기록이 깨져 있으면 처음부터 시작하고 알린다.

## 화면

경로: `/studio/branching-cuttoon`. 라우트 권위에 `maturity = "experimental"`, `tier = "labs"` 로 등록되어 있고, 메타 정책의 실험·Labs 목록에 들어 있으며, 사이트맵의 "AI·제작 도구·런타임" 묶음에서 찾을 수 있다. 주 내비게이션에는 올리지 않는다. 경로 이름 문구는 `route.branchingCuttoon` 이다.

- **만들기**: 장면 목록(종류와 오류·경고 수를 글자로 함께 표시), 선택한 장면의 양식(제목, 종류 ↔ 결말, 시작 장면 지정, 컷과 선택지 추가·순서 이동·빼기, 장면 지우기 확인), 점검 결과(요약·통계·오류와 경고 목록, 항목을 누르면 해당 장면과 입력 칸으로 이동), 샘플 불러오기(「빗속의 우산」: 시작 1·장면 4·결말 3, 되돌아가는 길 1), 새로 시작, JSON 내보내기·가져오기.
- **미리 읽기**: 장면의 컷을 위에서 아래로 보여 주고 끝에 선택지 단추를 둔다. "한 걸음 되돌아가기", "처음부터", 결말 안내, 지나온 선택 목록이 있다. 오류가 남은 이야기와 장면이 없는 이야기는 읽게 하지 않고 이유와 돌아갈 행동을 안내한다.
- 접근성: 선택지 묶음은 이름 붙은 `group`, 장면은 `article`, 장면이 바뀌면 새 장면 제목으로 초점이 옮겨 가고 정중한 live region 으로 알린다. 모션 감소 설정이면 부드러운 스크롤 대신 즉시 이동한다. 단추·입력은 44px 이상이고, 색만으로 전달하지 않는다. 기존 디자인 토큰만 쓴다.
- 비동기 상태: 파일 읽기는 읽는 중 안내, 실패 시 "다시 시도". 플레이어를 그리다 던지면 이 구역만 오류 안내와 "다시 시도"로 바뀌고 만들기 화면은 남는다.

## 현재 상태와 목표 상태

현재(current): 위 표의 current 항목 전부. 모든 데이터는 이 브라우저 안에만 있다.

목표(target, 아직 없다):

1. **발행 연결.** 게시된 작품 읽기 화면(`PublishedWorkReader`)과 Cuts 플레이어에 분기형 컷툰을 싣는 일.
2. **컷 이미지·편집기 연결.** 컷 참조를 편집기 문서의 실제 컷과 잇는 일. 지금의 컷은 글 카드다.
3. **서버 저장.** 작품에 그래프를 저장하고 서버에서 같은 검증을 다시 하는 일.
4. **독자 통계·정산.** 선택지별 선택 수 같은 집계와 그에 따른 정산.
5. **시각 편집.** 그래프 캔버스.
6. **번역.** 새 문구는 ko/en 만 직접 작성했다. 나머지 로케일은 영문 폴백이며 번역은 기존 번역 파이프라인의 몫이다.

## 한계

- **서버 저장 없음.** 초안과 읽던 위치는 이 브라우저에만 있다. 브라우저 데이터를 지우면 사라지므로 JSON 으로 내보내 따로 보관해야 한다. 화면이 이 점을 먼저 알린다.
- **독자 통계 없음.** 누가 어떤 선택지를 눌렀는지 어디에도 보내지 않고 세지 않는다.
- **정산 없음.**
- **컷은 글 카드.** 이미지·말풍선·편집기 컷과 연결되지 않는다.
- **목록으로만 편집.** 장면 수가 많아지면 구조를 한눈에 보기 어렵다. 통계와 점검 결과가 대신한다.
- **기존 편집기 호스트를 건드리지 않았다.** 스튜디오 편집기 안에서 분기형 컷툰을 만드는 길은 없다.
- **막다른 길 검사의 한계**는 위 "보장하지 않는 것"에 적었다.

## 검증 범위

실행한 것(2026-10-22, jsdom 환경):

- 순수 모델 모듈 단위 시험: 검증 코드별 시나리오, 분석, 편집, JSON 왕복과 거절, 읽기 상태와 복원, 지문, 순수성(`apps/web/src/domains/creator/branching-cuttoon/model/*.test.ts`).
- 화면 시험: 플레이어 읽기 흐름·키보드·보조기기·저장 복원·읽을 수 없는 상태·오류 경계, 제작 화면 편집·점검 이동·가져오기, 내보내기·가져오기 패널, 문구 계약(사전과 소스가 쓰는 키 대조), 문구 어조 계약, 샘플 그래프 검증(`apps/web/src/domains/creator/branching-cuttoon/*.test.ts(x)`).
- 경로 계약 시험: 라우트 권위, 라우트 메타, 사이트맵, 내비게이션, 경로 이름 문구 완전성.

하지 않은 것: 실제 브라우저에서 사람이 조작한 검증(키보드만으로 끝까지 읽기, 스크린리더 낭독, 모바일·고대비·다크 확인)은 이 변경 안에서 하지 않았고 별도 단계의 몫이다.

## 코드 위치

| 역할 | 위치 |
| --- | --- |
| 모델·상수·검증 코드 | `apps/web/src/domains/creator/branching-cuttoon/model/branching-cuttoon-types.ts` |
| 검증기·분석·길 열거 | `branching-cuttoon-validate.ts`, `branching-cuttoon-analysis.ts` |
| 편집·JSON·읽기 상태·판 지문 | `branching-cuttoon-edit.ts`, `branching-cuttoon-json.ts`, `branching-cuttoon-reader.ts`, `branching-cuttoon-version.ts` |
| 모델의 공개 진입점 | `apps/web/src/domains/creator/branching-cuttoon/model/index.ts` (같은 도메인 안에서 `./model` 로 가져온다) |
| 화면과 저장 어댑터 | `apps/web/src/domains/creator/branching-cuttoon/` |
| 화면 문구 정본 | `apps/web/public/i18n/app/branchingCuttoon/{ko,en}.json` |
| 경로 등록 | `apps/web/src/app/routes/groups/creator.routes.tsx`, `apps/web/src/shared/lib/site-route-authority.ts` |

모델을 `packages/core` 가 아니라 이 도메인 안 `model/` 에 둔 이유: 소비자가 이 화면 하나뿐이고, `config/architecture-source-ratchet.json` 의 `packagesCoreFiles` 래칫이 상한에 닿아 있어 `packages/core` 에 파일을 더할 수 없다. 모델 모듈은 다른 폴더에서 가져오지 않는 순수 모듈이라(`branching-cuttoon-purity.test.ts` 가 확인) 서버 검증처럼 두 번째 소비자가 생기면 그대로 패키지로 승격할 수 있다.
