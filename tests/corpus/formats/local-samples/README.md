# 로컬 실샘플 디렉터리 (커밋 금지)

이 디렉터리는 `packages/studio-format-gateway/src/chunked-sqlite-container.ts`의 가정(헤더 필드 순서, 청크
레이아웃, 외부 블록 형태)을 사용자가 소유한 실제 `.clip`/`.lip` 파일로 검증하기 위한 로컬 전용 공간이다.
`README.md`를 제외한 모든 파일은 Git이 무시한다.

## 규칙

- 본인이 만들었거나 사용 허락을 받은 파일만 둔다. 제3자 저작물이나 유료 소재가 든 파일은 두지 않는다.
- 이 디렉터리의 파일을 커밋하거나 공유하지 않는다. 공유가 필요하면 검사 도구의 구조 출력(JSON)만 공유한다.
- 검사 도구는 구조 정보(청크 목록, SQLite 테이블·컬럼 이름, 행 수)만 출력하고 픽셀, 행 내용, 사용자 텍스트는
  출력하지 않는다. 파일은 SHA-256과 파일명(경로 제외)으로만 식별한다.

## 구조 검사

```bash
pnpm exec tsx scripts/inspect-chunked-container.mts tests/corpus/formats/local-samples/<파일>.clip
```

옵션: `--json`(JSON 배열 출력), `--no-sqlite`(SQLite 스키마를 읽지 않고 헤더 판정만).

## 자동 검증

```bash
pnpm exec vitest run tests/format-gateway/chunked-container-local-corpus.test.ts
```

이 디렉터리의 `.clip`/`.lip` 파일마다 설계 문서의 가정 H1–H4가 실제 파일과 맞는지 확인한다. 파일이 없으면
샘플별 테스트는 만들어지지 않고, 이 디렉터리가 Git에서 무시되는지만 확인한다.
