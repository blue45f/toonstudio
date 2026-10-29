# 로컬 실샘플 디렉터리 (커밋 금지)

이 디렉터리는 포맷 리더의 가정을 사용자가 소유한 실제 파일로 검증하기 위한 로컬 전용 공간이다.
`README.md`를 제외한 모든 파일은 Git이 무시한다.

| 확장자 | 검증 대상 | 설계 문서 |
| --- | --- | --- |
| `.clip`, `.lip` | `packages/studio-format-gateway/src/chunked-sqlite-container.ts`의 가정(헤더 필드 순서, 청크 레이아웃, 외부 블록 형태) | `docs/design/chunked-sqlite-container-parser-2026-10-29.md` |
| `.xcf` | `packages/studio-format-gateway/src/xcf.ts`의 구조·픽셀 디코드 | `docs/design/xcf-reader-public-spec-2026-10-29.md` |
| `.aseprite`, `.ase` | `packages/studio-format-gateway/src/aseprite-sprite.ts`의 구조·셀·타일셋 디코드 (`.ase` 중 Adobe Swatch Exchange는 서명으로 걸러 낸다) | `docs/design/aseprite-sprite-reader-public-spec-2026-10-29.md` |

## 규칙

- 본인이 만들었거나 사용 허락을 받은 파일만 둔다. 제3자 저작물이나 유료 소재가 든 파일은 두지 않는다.
- 이 디렉터리의 파일을 커밋하거나 공유하지 않는다. 공유가 필요하면 검사 도구의 구조 출력(JSON)만 공유한다.
- `.clip`/`.lip` 검사 도구는 구조 정보(청크 목록, SQLite 테이블·컬럼 이름, 행 수)만 출력하고 픽셀, 행 내용,
  사용자 텍스트는 출력하지 않는다. 파일은 SHA-256과 파일명(경로 제외)으로만 식별한다.

## `.clip`/`.lip` 구조 검사

```bash
pnpm exec tsx scripts/inspect-chunked-container.mts tests/corpus/formats/local-samples/<파일>.clip
```

옵션: `--json`(JSON 배열 출력), `--no-sqlite`(SQLite 스키마를 읽지 않고 헤더 판정만).

## 자동 검증

```bash
pnpm exec vitest run tests/format-gateway/local-samples-corpus.test.ts
```

- `.clip`/`.lip` 파일마다 설계 문서의 가정 H1–H4가 실제 파일과 맞는지 확인한다.
- `.xcf` 파일마다 레이어를 하나도 잃지 않았는지, 구조·타일 오류 진단이 없는지, 그룹 부모가 그룹 레이어인지
  확인한다. ImageMagick(`convert`)이 있으면 8비트 RGB·회색 파일은 모든 레이어를 ImageMagick 디코드와 바이트
  단위로 대조한다. ImageMagick 6.9는 인덱스드와 8비트 초과 정밀도를 거부하므로 그런 파일은 대조에서 빠진다.
- `.aseprite`/`.ase` 파일마다 잘림·구조 진단이 없는지, 모든 셀 픽셀과 타일셋 이미지가 선언 크기대로 해제되는지,
  링크 셀이 앞 프레임의 실제 셀로 이어지는지, 인덱스드 셀의 인덱스가 팔레트 안에 있는지 확인한다. 이 형식은
  독립 오라클이 없다(ImageMagick은 Aseprite를 읽지 않는다). 개발 중에는 별도의 독립 구현(표준 라이브러리만 쓰는
  Python 스크립트)과 셀·타일셋 해시를 대조했으며 그 결과는 설계 문서에 있다.
- 형식별로 샘플이 없으면 그 형식의 `describe`와 테스트는 등록되지 않고, 이 디렉터리가 Git에서 무시되는지만
  확인한다.
