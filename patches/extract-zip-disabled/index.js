"use strict";

/**
 * extract-zip 의 보안 대체본. 실제 압축 해제를 수행하지 않고 항상 거부한다.
 * 이유와 제거 조건은 README.md 를 본다.
 */
const MESSAGE =
  "extract-zip 은 심볼릭 링크 경로 탈출 취약점(GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3)에 "
  + "수정 릴리스가 없어 이 저장소에서 비활성화되었습니다. 압축 해제가 필요한 도구는 안전한 대체 라이브러리로 "
  + "옮기거나, 업스트림이 수정 릴리스를 내면 pnpm-workspace.yaml 의 extract-zip 오버라이드와 "
  + "patches/extract-zip-disabled 를 지우세요.";

function extract() {
  return Promise.reject(new Error(MESSAGE));
}

module.exports = extract;
module.exports.default = extract;
module.exports.disabledReason = MESSAGE;
