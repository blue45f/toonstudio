import { createRequire } from "node:module";
import { redactSensitiveText } from "./ecosystem-v2-catalog.mjs";

// 독립 배포 시 공용 모듈이 빠져도 로컬 입력의 개수·길이만으로 검토할 수 있다.
let redactCreatorText;
try {
  ({ redactCreatorSensitiveText: redactCreatorText } = createRequire(import.meta.url)("@toonstudio/contracts/studio-pii-redactor"));
} catch {
  redactCreatorText = null;
}

export function sanitizeManuscript(text) {
  if (!redactCreatorText) return null;
  const withoutKeyBlocks = text.replace(/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----|$)/gu, "[비밀값 마스킹됨]");
  return redactSensitiveText(redactCreatorText(withoutKeyBlocks).sanitizedText);
}

const REVIEW_STEP = {
  "idea-remix": "첫 장면을 목격자 시점과 당사자 시점으로 각각 한 컷씩 적고, 두 버전에서 가장 먼저 보이는 단서를 비교하세요.",
  "script-to-cuts": "인물의 목적이나 장소가 바뀌는 줄 앞에 컷 경계를 표시하고, 말없이 보여 줄 동작 하나를 고르세요.",
  "dialogue-polish": "가장 긴 대사를 소리 내어 읽고 숨을 쉬는 위치에 줄바꿈을 넣으세요. 화자와 높임말은 유지하세요.",
  "export-preflight-coach": "첫 줄을 소개글 후보로 읽어 스포일러가 있는지 표시하고, 내보낸 파일을 휴대전화 폭으로 열어 식자를 확인하세요.",
  "character-bible-forge": "등장 인물별로 목표 한 줄과 그 근거가 된 대사를 짝지어 적고, 원고에서 알 수 없는 설정은 비워 두세요.",
  "continuity-plot-audit": "첫 줄과 마지막 줄의 장소·시간·소지품을 적고, 달라진 항목마다 변화가 나타난 중간 컷을 연결하세요.",
  "bg3d-camera-blocking": "첫 장면을 인물·배경·소품으로 나누고 카메라 방향을 정하세요. 다음 컷에서 인물의 시선 축을 대조하세요.",
  "color-mood-director": "첫 장면과 끝 장면의 감정을 한 단어씩 적고 밝기를 두 단계로 나누세요. 대사가 있는 영역은 별도로 대비를 확인하세요.",
  "sfx-onomatopoeia-lab": "소리가 나는 동작 하나에 효과음을 붙이고 음원 가까이에 배치하세요. 대사 읽는 순서를 가리면 위치를 옮기세요.",
  "photoshop-fx-recipe": "원본 위에 조정 레이어를 하나 만들고 초점 대상을 마스크로 분리하세요. 효과를 켜고 끄며 시선이 유지되는지 비교하세요.",
  "scroll-pacing-auditor": "마지막 줄 바로 전의 행동과 반응을 두 컷으로 분리하고 휴대전화 한 화면씩 내려 반응이 먼저 드러나는지 확인하세요.",
  "thumbnail-hook-optimizer": "첫 줄의 중심 인물과 마지막 줄의 갈등을 각각 썸네일 후보로 스케치한 뒤 작은 크기로 줄여 식별성을 비교하세요.",
  "localization-glossary-check": "호칭·고유명사·효과음을 표시해 원문, 번역 후보, 등장 줄 번호를 한 행씩 적으세요. 같은 표현의 다른 번역을 찾아 통일하세요.",
  "mcp-workflow-macro": "원고에서 필요한 작업 하나를 골라 tools/list에서 도구 이름과 입력을 확인하고, 실제 적용 전 테스트 캔버스에서 한 단계만 실행하세요.",
};

function excerpt(line) {
  const chars = Array.from(line);
  return chars.length > 60 ? `${chars.slice(0, 59).join("")}…` : line;
}

export function reviewLocalManuscript(mode, text, canvas, includeExcerpts) {
  const lines = text.split(/\r\n|\r|\n/u).map((line) => line.trim()).filter(Boolean);
  if (!includeExcerpts) {
    return [`원고에 유효 줄이 ${lines.length}개이며 전체 길이는 ${Array.from(text).length}자입니다.`, REVIEW_STEP[mode]];
  }
  const first = excerpt(lines[0]);
  const last = excerpt(lines.at(-1));
  let observation = `첫 줄 “${first}”`;
  if (mode === "dialogue-polish" || mode === "localization-glossary-check") {
    const longest = lines.reduce((a, b) => Array.from(a).length >= Array.from(b).length ? a : b);
    observation = `가장 긴 줄은 ${lines.indexOf(longest) + 1}번째 유효 줄이며 ${Array.from(longest).length}자입니다. “${excerpt(longest)}”`;
  } else if (mode === "export-preflight-coach" || mode === "photoshop-fx-recipe" || mode === "bg3d-camera-blocking") {
    observation = `“${first}” 장면을 확인할 캔버스는 ${canvas.width}×${canvas.height}px이며 레이어가 ${canvas.layers.length}개입니다.`;
  } else if (lines.length > 1) {
    observation = `${lines.length}개 유효 줄의 시작은 “${first}”, 끝은 “${last}”입니다.`;
  }
  return [observation, REVIEW_STEP[mode]];
}

export async function requestCreativeAssist(apiUrl, payload, fetchImpl) {
  let validate;
  try {
    // 로컬 도구만 복사한 환경에서도 오프라인 원고 검토는 동작한다.
    ({ validateAssistModeStructuredOutput: validate } = await import("@toonstudio/contracts/studio-openai-assist-result"));
  } catch {
    return { status: "contract-unavailable" };
  }
  try {
    const response = await fetchImpl(`${apiUrl}/api/studio/ai/creative-assist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { status: "http-error", httpStatus: response.status };
    const reply = JSON.parse(await response.text(), (_key, value) => typeof value === "string" ? sanitizeManuscript(value) : value);
    const result = reply?.result?.mode === payload.mode && validate(payload.mode, reply.result.data);
    if (!result || typeof reply.provider !== "string" || !reply.provider.trim()
      || reply.paidBillingBlocked !== true || reply.costGuaranteedZeroUsd !== 0) {
      return { status: "invalid-response" };
    }
    return { status: "completed", provider: reply.provider, result };
  } catch {
    return { status: "unavailable" };
  }
}
