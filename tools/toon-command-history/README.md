# 툰스튜디오 패널 편집 Undo/Redo 명령 엔진 (`@toonstudio/toon-command-history`)

- **상태**: 독립 병렬 실제 구현 산출물 (2026-11-10)
- **산출물 경로**: `/Users/hjunkim/WebstormProjects/gemini-toon-command-history-20261110-849201`
- **기준 프로젝트**: `/Users/hjunkim/WebstormProjects/toonstudio` (원본 저장소 무수정 원칙 준수)

## 1. 개요 및 소유권 분리 경계

이 모듈은 툰스튜디오(ToonStudio)의 패널 편집 워크플로를 위한 **순수 가역(Reversible) Undo/Redo 명령 히스토리 엔진**입니다.

- **코드 소유권 분리**: 기존 12 UI 설계, 예약 코어, 프로젝트 JSON/manifest 검증기(`packages/studio-project-model`의 `ComicGraphIR`/JSON Patch manifest 검증기 등)와 코드 및 파일 소유권을 일절 공유하지 않으며, 완전히 분리된 **가상 패널 모델(`VirtualPanelBoardState`)**을 사용합니다.
- **표준 라이브러리 전용**: 외부 npm 패키지 다운로드나 네트워크 접근 없이 로컬에 설치된 Node.js(`v24.16.0`) 내장 TypeScript 실행기 및 `node:test`, `node:assert/strict` 표준 라이브러리만으로 즉시 동작합니다.

## 2. 디렉터리 구조

```text
gemini-toon-command-history-20261110-849201/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                    # 공개 API 배럴 엔트리
│   ├── virtual-panel-model.ts      # 가상 패널 도메인 모델 및 깊은 불변성(deepFreezeClone) 유틸리티
│   ├── panel-commands.ts           # 추가/삭제/재정렬/텍스트 수정 가역 명령 정의 및 순수 실행기
│   └── command-history-engine.ts   # 트랜잭션 그룹핑, Redo 초기화, 용량 제한, 방어 로직을 갖춘 히스토리 엔진
└── tests/
    └── toon-command-history.test.ts # 32개 자동화 단위·통합 검증 테스트
```

## 3. 핵심 기능 요약

1. **가역 패널 편집 명령 (`panel-commands.ts`)**
   - `panel.add`: 지정 인덱스(`0..n`) 또는 맨 끝에 가상 패널 삽입 (역명령: 해당 패널 삭제 및 `order` 재정규화)
   - `panel.remove`: 패널 삭제 시 원래 위치(`index`)와 전체 속성(`kind`, `text`, `characterTags`, `estimatedHeightPx`)을 역명령에 보존하여 무손실 복원
   - `panel.reorder`: 인덱스 이동(`mode: "move-index"`) 및 전체 ID 순열 재배치(`mode: "permutation"`) 양방향 가역 지원
   - `panel.edit-text`: 단일 필드(`title` | `dialogue` | `caption` | `notes`) 또는 다중 필드 `patch` 수정 및 수정 전 텍스트 역패치 복원
2. **트랜잭션 그룹핑 (`beginTransaction`, `commitTransaction`, `rollbackTransaction`, `runTransaction`)**
   - 다수의 패널 편집 명령을 하나의 원자적 Undo/Redo 단위로 그룹화합니다.
   - `runTransaction` 실행 중 예외가 발생하거나 `rollbackTransaction` 호출 시 트랜잭션 시작 전 상태로 즉시 롤백하며 기존 히스토리/Redo 스택을 오염시키지 않습니다.
3. **Redo 스택 초기화**
   - Undo 이후 새로운 유효 명령이 실행되거나 비어 있지 않은 트랜잭션이 커밋되면 기존 Redo 분기를 즉시 초기화합니다.
4. **히스토리 용량 제한 (`maxHistoryCapacity`)**
   - 지정된 최대 용량을 초과하면 가장 오래된 Undo 기록부터 FIFO 방식으로 퇴출하며 `getEvictedCount()`로 추적합니다.
5. **불변 원본 보장 (`deepFreezeClone`)**
   - 초기 시드 입력, 각 단계의 상태 스냅샷, 히스토리 조회 결과를 모두 재귀적으로 복제·동결(`Object.freeze`)하여 호출자의 외부 변조로부터 원본과 히스토리를 보호합니다.
6. **잘못된 명령 방어 (`ToonCommandHistoryError`)**
   - 중복/잘못된 패널 ID, 인덱스 범위 초과, 불완전한 재정렬 순열, 잘못된 텍스트 필드/타입, 중첩 트랜잭션 등 모든 비정상 입력을 상태 변경 전에 차단합니다.

## 4. 테스트 실행 방법

```bash
/Users/hjunkim/.nvm/versions/node/v24.16.0/bin/node --test /Users/hjunkim/WebstormProjects/gemini-toon-command-history-20261110-849201/tests/toon-command-history.test.ts
```

## 5. ToonStudio 본 저장소 통합 안내 (수동 연결 가이드)

원본 저장소(`/Users/hjunkim/WebstormProjects/toonstudio`)에는 어떠한 변경도 가하지 않았습니다. 추후 본 저장소에 통합할 때는 다음 절차로 연결할 수 있습니다.

1. **패키지 또는 도메인 배치**
   - 독립 패키지로 추가할 경우 `packages/studio-panel-command-history`로 복사하고 `pnpm-workspace.yaml`의 `packages/*` 규칙에 따라 인식시킵니다.
   - Creator 도메인 내부 모듈로 사용할 경우 `apps/web/src/domains/creator/panel-history/` 아래에 `src/*.ts` 파일을 배치합니다.
2. **기존 CommandRegistry 및 저널과의 결합**
   - `@toonstudio/studio-command-registry`의 `StudioCommand.execute` 핸들러 내부에서 `ToonPanelCommandHistoryEngine.execute()`를 호출하고, 반환된 `undo`/`redo` 전이를 `UndoEntry` 또는 `studio-history-journal.ts`와 어댑터로 연결합니다.
   - 프로젝트 저장/내보내기 시점에만 `engine.getCommittedState().panels`를 상위 스냅샷 또는 스토리보드 핸드오프 포맷으로 직렬화하여 manifest 검증기와 결합도를 분리된 상태로 유지합니다.
