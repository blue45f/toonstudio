# 작품·회차 AI 학습 허용 표기

- 상태: **현재** — 구현 기준 문서다. 병합·배포 여부는 이 문서가 아니라 PR과 배포 기록을 따른다.
- 최종 갱신: **2026-10-15**
- 범위: 창작 작품(creator work)과 회차 단위의 "AI 학습 허용 여부" 표기. 정산·결제·사용료는 범위 밖이다.

## 1. 이 표기는 무엇이고 무엇이 아닌가

작가가 자기 작품(회차)을 AI 학습에 쓰는 것에 대해 밝힌 **의사 표시**를 독자 화면에 알리는 표시다.

- 라이선스나 계약이 아니다. 이 문서와 화면은 법적 효력이 있다거나 없다고 단정하지 않는다.
- **별도 계약을 대체하지 않는다.** 작가와 사업자 사이에 따로 맺은 계약이 있으면 그 계약이 우선한다.
- ToonStudio는 외부 AI 사업자가 이 표시를 따르도록 **강제할 수 없다.** 표기만으로 외부의 수집과 학습을
  기술적으로 막을 수도 없다.
- 이미 공개되어 수집된 사본은 표기를 나중에 바꿔도 되돌릴 수 없다.
- 같은 한계 고지를 편집 화면과 작품 상세에 항상 눈에 보이게 둔다(`getCreatorAiTrainingLimitNotice`).

## 2. 값과 해석 규칙

| 값 | 뜻 | 화면 문구 |
| --- | --- | --- |
| `unspecified` (기본) | 작가가 허용 여부를 밝히지 않음. **허용으로 해석하지 않는다.** | 미지정 |
| `prohibited` | AI 학습에 쓰지 말아 달라는 뜻을 표시 | 불허 |
| `allowed` | AI 학습에 써도 좋다는 뜻을 표시 | 허용 |

계약은 `packages/contracts/src/creator-community-publication-contract.ts`에 있다.

- `CreatorCommunityMetadata.aiTraining?` — 선택 필드다. 메타데이터 `version`은 그대로 `1`이다.
- `trainingAllowed` — 기존 불리언을 **파생 값**으로 유지한다(`aiTraining === "allowed"`일 때만 `true`).
  이전 배포판 클라이언트가 읽어도 의미가 어긋나지 않게 하기 위해서다.
- `resolveCreatorCommunityAiTraining(metadata)` — 저장된 값을 읽는 유일한 규칙이다.
  1. 유효한 `aiTraining`이 있으면 그 값이 이긴다(레거시 불리언과 어긋나도).
  2. 없거나 알 수 없는 값이면 `trainingAllowed === true`일 때만 `allowed`다.
  3. 그 외는 모두 `unspecified`다.
- 레거시 `trainingAllowed: false`는 `prohibited`가 아니라 `unspecified`로 읽는다. 체크박스를 끈 것과 건드리지
  않은 것을 구분할 수 없고, 작가가 밝힌 적 없는 불허를 대신 표시하면 그것도 사실과 다르기 때문이다.
- 어떤 입력도 근거 없이 `allowed`가 되지 않는다.
- `withCreatorCommunityAiTraining(metadata, consent)` — 새 값을 적용하면서 `trainingAllowed`도 함께 맞춘다.

## 3. 저장 경로 — DB 스키마 변경 없음

새 컬럼·마이그레이션 없이 기존 JSONB 필드에 실린다.

| 위치 | 내용 |
| --- | --- |
| `creator_work.doc -> 'community'` | 작품 원본과 같은 revision에 저장된다. 리비전 복원은 그 시점의 표기로 되돌린다. |
| `creator_work_release.manifest -> 'community'` | 릴리스를 만들 때 `readCreatorCommunityMetadata(doc)`로 만든 불변 스냅샷이다. 새 릴리스에는 `aiTraining`이 자동으로 포함된다. |

API 경계(`apps/api`)는 코드 변경이 필요 없었고 다음 사실을 테스트로 고정했다
(`apps/api/src/modules/creator/creator-community-ai-training.test.ts`).

- 작품 생성·수정 DTO는 `doc`을 불투명 JSON(`z.record`)으로 받으므로 `doc.community.aiTraining`을 거부하거나
  지우지 않는다.
- 최상위 body는 `.strict()`다. 그래서 새 필드를 최상위 키로 만들지 않고 `doc` 안에만 둔다.
- 공개 doc 투영(`toPublicCreatorDoc`)은 `community`를 유지한다.
- 독자에게 나가는 `community`는 작성 중인 문서가 아니라 **게시된 릴리스의 manifest** 값이다
  (`projectCreatorWorkDetailWithRelease`). 이전 릴리스에는 `aiTraining`이 없으므로 클라이언트가 위 해석 규칙으로
  읽는다.
- 반영 시점: 명시적 게시 레코드가 없는 레거시 경로에서는 게시 중인 작품을 저장할 때 새 릴리스가 자동으로
  만들어져 곧바로 반영된다. 명시적 게시 레코드(`creator_work_publication`)가 있는 작품은 새 릴리스를 게시할
  때 반영된다. 화면은 이 차이를 "다음 게시(릴리스)부터 반영될 수 있습니다"라고 완곡하게 안내한다.
- 회차 단위: 시리즈의 각 회차는 별도의 창작 작품이므로 회차마다 값을 따로 저장한다. 시리즈 전체의 기본값은
  없다(저장할 컬럼이 필요하므로 이번 범위에서 제외했다).

## 4. 화면

| 화면 | 구성 요소 | 동작 |
| --- | --- | --- |
| 게시 센터 > 게시 설정 단계 | `StudioPublicationRightsControls` → `CreatorAiTrainingConsentField` | 미지정·불허·허용 라디오(보수적인 값 먼저, 기본 미지정). 변경 확인 문구. |
| 게시 센터 > 최종 확인 단계 | `CreatorAiTrainingBadgeFor` (`detail`) | 요약에 현재 표기와 한계 고지. 레거시 "AI 학습 허용/비허용" 불리언 표시를 대체. |
| 게시 완료 영수증 | `StudioPublishResultReceipt` | "AI 학습 표기" 행과 영수증 JSON(`details.community.aiTraining`). |
| 작품 관리(소유자) | `CreatorCommunityPublicationPanel` | 같은 필드. "작품 정보 저장"을 눌러야 서버에 쓰인다. |
| 게시 패키지 설정 | `StudioPublishPackageAiSection` | "AI 사용 공개" 아래 같은 필드(패키지 manifest에만 기록). |
| 독자 화면 | `PublishedWorkReader` | 읽기 방식·등급 배지 옆에 칩. 성인 확인 화면이 떠 있는 동안에도 표기는 보인다(본문만 가려진다). |
| 작품 상세(공유 상세) | `CreatorWorkRightsAside` | 칩 + 독자용 설명 + 한계 고지. |

**변경 확인 문구.** 값을 바꾸면 `role="status"` 영역(polite)이 새 값, 기록되는 곳, 그리고 표기가 해 줄 수 없는
일을 알린다(`getCreatorAiTrainingChangeNotice`). 예: 허용으로 바꾸면 "게시하면 독자 화면에 '허용 표기'가
보입니다. 나중에 바꿔도 이미 공개되어 수집된 사본은 되돌릴 수 없습니다." 이미 게시한 작품이면 반영 시점 단서가
붙고, 패키지 문맥이면 `manifest.json(rights.aiTraining)`에 기록된다고 알린다.

**접근성.** 네이티브 라디오 그룹(방향키·Tab 기본 동작), `fieldset`/`legend`, `aria-labelledby`로 이름을 짧게
유지하고 `aria-describedby`로 설명을 연결한다. 칩은 색만으로 구분하지 않고 아이콘과 문구를 함께 쓰며(미지정은
점선 테두리), 행 높이는 44px 이상이다. 색은 의미 토큰만 쓰고 전환은 `motion-reduce`를 따른다.

칩 글자는 본문색(`text-fg`)이고 의미 토큰 색(`cool`·`warn`)은 테두리·배경·아이콘에만 입힌다. `text-cool`
글자는 라이트·세피아 테마의 칩 배경 위에서 AA(4.5:1)에 못 미쳐(`colorjs.io`로 토큰 값을 계산한 3.6~4.3:1)
글자색에서 뺐다. 미지정 칩의 점선 경계는 3:1 이상이 되도록 `border-fg-3`를 쓴다.
`ai-training-consent/creator-ai-training-contrast.test.ts`가 `design-themes.css`의 디자인 테마 9종(라이트·다크
포함) 토큰으로 칩 글자·아이콘·점선 경계·독자용 설명·한계 고지·선택 행의 WCAG 대비를 계산해 글자 4.5:1,
아이콘·경계 3:1 이상을 검사한다. 이는 토큰 값에 대한 계산이며 브라우저 화면 검증을 대신하지 않는다.
`prefers-contrast: more` 보정은 대비를 높이는 방향이라 따로 계산하지 않았다.

**문구.** 한·영 이중언어(`creator-ai-training-copy.ts`). 법적 효력을 단정하는 표현은 쓰지 않으며
`creator-ai-training-copy.test.ts`가 이를 검사한다.

**소스 위치.** 표기 UI·카피·테스트는 `apps/web/src/domains/creator/ai-training-consent/`에, 게시 패키지의
표기 섹션과 `rights` 읽기 모듈은 `apps/web/src/domains/creator/publish/`에 둔다.
`domains/creator` 루트는 소스 배치 래칫(`config/architecture-source-ratchet.json`의 `creatorRootFiles`)이
직속 파일 수 증가를 막으므로 새 파일은 하위 폴더에 둔다.

## 5. 게시 매니페스트

- **게시 패키지 manifest** (`schema: "toonstudio.publish-package"`, 현재 `version: 1`). `rights: { aiTraining }`을
  추가했다. 버전은 올리지 않았다. `rights`가 없는 기존 v1 manifest와 알 수 없는 값은 `unspecified`로 읽고,
  `rights` 안의 알 수 없는 키와 최상위에 놓인 `aiTraining`은 버린다
  (`studio-publish-package-manifest-runtime.ts`의 `parseStudioPublishPackageManifest`).
  설정 값은 `StudioPublishPackageSettings.aiTraining`이며 작품 문서의 `publishPack.packageSettings`로 저장된다.
  표기는 내보내기 가능 여부나 검증 이슈를 바꾸지 않는다(차단 조건이 아니라 의사 표시).
  골든(`tests/corpus/publish-packages/*.json`)은 `rights` 블록과 `manifestSha256`만 바뀌었다.
- **게시 영수증** (`toonstudio.publish-receipt.v1`). `details.community.aiTraining`을 싣는다.
- **릴리스 manifest** (서버, `creator_work_release.manifest`). 3절 참조.
- 게시 패키지 설정의 표기는 해당 패키지 manifest에만 기록되고, ToonStudio에 게시한 작품의 표기와 자동으로
  동기화되지 않는다. 두 표기는 화면에서 별도 항목으로 안내한다.

## 6. 한계와 후속 과제

현재 구현이 **하지 않는 것**이다. 구현된 것처럼 읽히지 않도록 목록으로 남긴다.

1. 외부 크롤러나 AI 사업자가 읽는 기계 판독 신호(robots.txt, HTTP 헤더, 메타 태그, JSON-LD, C2PA 등)를
   만들지 않는다. 표기는 ToonStudio 화면과 manifest 안에서만 보인다.
2. 시리즈 단위 기본값이 없다(저장 컬럼 필요).
3. 갤러리·검색에서 표기별 필터나 정렬이 없다.
4. 자산 단위 권리(마켓 `aiTrainingAllowed`, 스튜디오 자산 권리 명세의 `aiTraining`)와의 일관성을 검사하지
   않는다. 작품이 "허용"이어도 포함된 자산은 학습을 허용하지 않을 수 있다.
5. 제작 허브 권리·동의 원장의 `ai-training-consent`(협업자 간 권리 항목)와 연동하지 않는다.
6. 통합 플랫폼 발행 센터(`/publish`)의 채널 패키지(`toonstudio.publish-package/1`, API Zod 스키마)는
   변경하지 않았다.
7. 이전 배포판 클라이언트가 `community`를 통째로 다시 쓰면 `prohibited`가 `unspecified`로 내려갈 수 있다.
   허용 쪽으로 올라가는 일은 없다(`trainingAllowed`가 함께 `false`로 남기 때문).
8. 표기를 바꿀 수 있는 사람은 화면에서만 소유자로 제한한다. 게시 센터는 공동 편집자의 표기 변경을 막고
   저장된 값을 보존하며(`ownerControlsPolicy`), 작품 관리 패널은 소유자 전용이다. 다만 공동 편집자가 문서
   전체를 저장하는 기존 경로에서 서버가 `doc.community` 중첩 필드의 작성 권한을 따로 검증하지는 않는다.
   `docs/studio-publishing-command-center.md`에 적힌 중첩 필드 권한 검증 후속 과제와 같은 범주다.

## 7. 검증

```sh
pnpm exec vitest run \
  packages/contracts/src/creator-community-ai-training.test.ts \
  apps/web/src/domains/creator/ai-training-consent \
  apps/web/src/domains/creator/studio-publish-package-rights.test.ts \
  apps/web/src/domains/creator/publish/StudioPublishPackageAiSection.test.tsx \
  apps/web/src/domains/creator/StudioPublicationRightsControls.test.tsx \
  apps/web/src/domains/creator/PublishedWorkReader.test.tsx \
  apps/web/src/domains/creator/StudioPublishResultReceipt.test.tsx \
  apps/web/src/domains/creator/studio-publish-receipt-data.test.ts \
  apps/web/src/domains/creator/studio-publish-package.test.ts \
  scripts/verify-studio-publish-package-goldens.test.ts \
  apps/api/src/modules/creator/creator-community-ai-training.test.ts
```

실행 위치는 저장소 루트이며 DB·네트워크가 필요 없다. 게시 패키지 골든을 의도적으로 바꿨다면
`pnpm exec tsx scripts/verify-studio-publish-package-goldens.mts --write`로 다시 만들고 diff를 검토한다.

## 8. 운영 메모

- DB 마이그레이션이 없다. 새 필드가 없는 기존 행과 릴리스는 그대로 읽힌다.
- 롤백: 새 필드를 모르는 이전 코드는 `trainingAllowed`만 읽는다. `allowed`는 `true`, 나머지는 `false`로
  남으므로 롤백해도 허용 쪽으로 잘못 읽히지 않는다.
- 이 변경은 배포 승인이 아니다. 운영 배포는 `DEPLOY.md`와 `AGENTS.md`의 별도 승인 절차를 따른다.
