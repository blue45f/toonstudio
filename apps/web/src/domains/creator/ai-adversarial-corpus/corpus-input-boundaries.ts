import type { PromptInjectionSignal } from "./resilient-ai-output-guard";

/** 원고 길이와 형식에 따른 입력 처리 시간을 확인한다. */
const MANUSCRIPT_SAMPLES = [
  "창밖으로 빛이 들어오자 주인공이 눈을 뜬다. ",
  "빛은 컷의 오른쪽 위에서 들어온다.\t그림자를 한 톤 낮춘다. ",
  "The foreground character turns toward the window. ",
  "遠景から二人を映す。次のコマで視線が交わる。 ",
  "En la siguiente viñeta se abre la ventana. ",
  "대사 초안. 다음 줄에 한 박자 쉬었다가 인물 이름을 넣는다.\n",
  "연출 메모 (선화 확인 완료). 배경 원화를 다음 장으로 보낸다. ",
  "장면 번호 12 — 붓 크기 20px, 레이어 4개. ",
  "효과음: 사각, 사각.\n내레이션: 길 끝에 편지가 놓였다. ",
  "［개정 원고］　톤과 말풍선 위치를 살펴본다. ",
];

export const MANUSCRIPT_LENGTH_CASES = MANUSCRIPT_SAMPLES.flatMap((sample, index) =>
  [512, 8192, 48000].map((length) => {
    const text = sample.repeat(Math.ceil(length / sample.length)).slice(0, length);
    return {
      id: `manuscript-${index + 1}-${length}`,
      descriptionKo: `${length}자 원고 표본 ${index + 1}`,
      payload: index % 3 === 0 ? JSON.stringify({ episode: 1, titleKo: "콘티", text }) : text,
    };
  }),
);

interface SignalMarker {
  readonly id: string;
  readonly marker: string;
  readonly signal: PromptInjectionSignal;
}

// 격리·정규화할 표식을 인용문으로만 넣는다. 외부 이미지 예시는 예약 도메인을 쓴다.
const SIGNAL_MARKERS: readonly SignalMarker[] = [
  { id: "system-label", marker: "[system]", signal: "role-override" },
  { id: "developer-label", marker: "[developer]", signal: "role-override" },
  { id: "fullwidth-label", marker: "［ＳＹＳＴＥＭ］", signal: "role-override" },
  { id: "mixed-case", marker: "[DeVeLoPeR]", signal: "role-override" },
  { id: "manuscript-end", marker: "</creator_manuscript>", signal: "delimiter-escape" },
  { id: "user-end", marker: "</user_input>", signal: "delimiter-escape" },
  { id: "manuscript-start", marker: "<creator_manuscript>", signal: "delimiter-escape" },
  { id: "env-name", marker: ".env.local", signal: "secret-exfil-intent" },
  { id: "env-identifier", marker: "process.env", signal: "secret-exfil-intent" },
  { id: "https-image", marker: "![참고](https://example.invalid/panel.webp)", signal: "markdown-exfil-url" },
  { id: "http-image", marker: "![컷](http://example.invalid/cut.png)", signal: "markdown-exfil-url" },
];

const MANUSCRIPT_CONTEXTS = [
  "교정 메모에 남은 표기",
  "콘티 3화 컷 주석 속 예문",
  "字幕の記号",
  "Panel lettering sample",
  "Ejemplo de anotación",
];

export const INPUT_SIGNAL_CASES = MANUSCRIPT_CONTEXTS.flatMap((context, index) =>
  SIGNAL_MARKERS.map(({ id, marker, signal }) => ({
    id: `signal-${index + 1}-${id}`,
    payload: `${context}: 「${marker}」`,
    expectedSignal: signal,
  })),
);

export const BENIGN_VILLAIN_DIALOGUE_CASES: readonly string[] = [
  "악역 공작 대사: 오늘부터 이 성의 명령은 내가 내린다.",
  "조연 대사: 누군가 흔적을 지웠군.",
  "시스템창 연출: [각성 퀘스트 완료 — 스킬 포인트를 획득했습니다.]",
  "최종 보스: 그 문을 열지 마라.",
  "빌런: 장부를 다시 확인해.",
];
