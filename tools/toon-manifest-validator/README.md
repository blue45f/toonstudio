# ToonStudio 프로젝트 JSON 검증기 및 안전한 내보내기 Manifest 생성기 (`gemini-toon-manifest-validator-20261110-01`)

외부 패키지 의존성 없이 순수 Node.js 내장 표준 라이브러리(`node:fs`, `node:path`, `node:crypto`, `node:test`, `node:assert`)만으로 동작하는 독립형 ToonStudio 프로젝트 JSON 검증기 및 결정론적 Export Manifest 생성기입니다.

## 1. 실제 ToonStudio 앱 스키마 읽기 확인 및 대응 근거

원본 저장소(`/Users/hjunkim/WebstormProjects/toonstudio`)의 파일·설정·브랜치·서버를 일절 수정하지 않고 읽기 전용으로만 확인하여 다음 실제 스키마 계약과 1:1로 호환되도록 구현했습니다.

1. **`packages/studio-project-model/src/graph/project-graph.ts` (`StudioProjectGraphV1`)**
   - `version: 1`, `projectId`, `title`, `nodes: StudioProjectNodeV1[]` (`kind`: `"series" | "season" | "episode" | "sequence" | "scene" | "panel" | "element"`), `assetUsages: StudioAssetUsageV1[]`
   - 엔티티 식별자 정규식: `STUDIO_SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u`
   - 부모 노드 참조(`parentId`) 존재 여부(`REF_NODE_PARENT_MISSING`) 및 프로젝트 ID 일치 검증(`REF_EPISODE_PROJECT_MISMATCH`)
2. **`packages/studio-project-model/src/graph/scope-ref.ts` (`StudioScopeRefV1`)**
   - `version: 1`, `projectId`, `episodeId`, `sequenceId`, `sceneId`, `panelId`, `elementId`
   - 계층 제약: `sequence`·`scene`·`panel` 범위는 반드시 상위 `episodeId`를 포함해야 함(`REF_SCOPE_HIERARCHY_INVALID`)
3. **`packages/studio-project-model/src/assets/asset-lockfile.ts` (`StudioAssetLockfileV1`)**
   - 콘텐츠 해시 포맷: `^sha256:[0-9a-f]{64}$` 및 순수 64자리 16진수 SHA-256 동시 지원
4. **`apps/web/src/domains/creator/studio-archive-manifest.ts` & `studio-publishing-package.ts` (`StudioArchiveManifest`)**
   - `schemaVersion: 1`, `applicationVersion`, `projectId`, `createdAt`, `rootDocumentPaths`, `files: StudioArchiveFile[]`, `dependencies: StudioArchiveDependency[]`
   - 안전한 상대경로 규칙: 선행 `/` 금지, `\` 금지, 빈 세그먼트·`.`·`..` 세그먼트 금지, `checksum: "sha256:<64hex>"`, `sizeBytes > 0`
5. **`apps/web/src/domains/creator/studio-export-preflight.ts` (`STUDIO_EXPORT_TARGET_PROFILES`)**
   - 타깃별 허용 포맷(`png`, `jpg`, `jpeg`, `webp`, `svg`, `gif`, `psd`, `ora`, `tif`, `tiff`, `mp3`, `wav`, `ogg`, `m4a`, `mp4`, `webm`, `ttf`, `otf`, `woff`, `woff2`, `json`, `txt`, `vtt`, `srt`, `pdf`, `epub`, `pptx`, `toonstudio`) 매핑

## 2. 실행 명령 (`gemini-toon-manifest-validator-20261110-01`)

```bash
# 1. 45개 자동 테스트 스위트 실행 (Node.js 내장 node:test)
/opt/homebrew/bin/node --test test/validator.test.mjs

# 2. 관계형 프로젝트 JSON 검증 및 Export Manifest 생성 (Exit Code: 0)
/opt/homebrew/bin/node ./bin/toon-validator.mjs \
  --project ./fixtures/valid-basic/project.json \
  --fixture-dir ./fixtures/valid-basic \
  --format both \
  --out-manifest ./reports/valid-manifest.json \
  --out-report-json ./reports/valid-report.json \
  --out-report-txt ./reports/valid-report.txt

# 3. ToonStudio 네이티브 StudioProjectGraphV1 JSON 검증 및 Manifest 생성 (Exit Code: 0)
/opt/homebrew/bin/node ./bin/toon-validator.mjs \
  --project ./fixtures/valid-basic/project-graph-v1.json \
  --fixture-dir ./fixtures/valid-basic \
  --format both \
  --out-manifest ./reports/graph-v1-manifest.json

# 4. 생성된 Export Manifest의 SHA-256 무결성 재검증 (Exit Code: 0)
/opt/homebrew/bin/node ./bin/toon-validator.mjs \
  --verify-manifest ./reports/valid-manifest.json \
  --fixture-dir ./fixtures/valid-basic

# 5. 오류 프로젝트 검증 및 리포트 생성 (Exit Code: 1)
/opt/homebrew/bin/node ./bin/toon-validator.mjs \
  --project ./fixtures/invalid-sample/project-invalid.json \
  --fixture-dir ./fixtures/valid-basic \
  --format both \
  --out-report-json ./reports/invalid-report.json \
  --out-report-txt ./reports/invalid-report.txt
```
