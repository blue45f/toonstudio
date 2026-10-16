/** 여정 실행 순서와 로그인 요구. journeys.mjs(브라우저 코드)를 불러오지 않고도 계획을 세울 수 있게 분리했다. */

/** 실행 순서. 로그인 상태를 바꾸는 로그아웃 여정은 마지막에 둔다(다른 여정이 쓰는 로그인 상태를 건드리지 않게). */
export const JOURNEY_ORDER = Object.freeze([
  "new-work-to-editor",
  "open-example-project",
  "template-to-work",
  "settings-roundtrip",
  "error-recovery",
  "login-logout",
]);

/** 로그인된 컨텍스트(storageState)가 필요한 여정. */
export const AUTHENTICATED_JOURNEYS = Object.freeze(["new-work-to-editor", "open-example-project", "template-to-work", "settings-roundtrip"]);

/** 자격증명으로 직접 로그인하는 여정. */
export const CREDENTIAL_JOURNEYS = Object.freeze(["login-logout"]);

/** 시드 계정(자격증명)이 필요한 여정인지. */
export const journeyNeedsLogin = (id) => AUTHENTICATED_JOURNEYS.includes(id) || CREDENTIAL_JOURNEYS.includes(id);
