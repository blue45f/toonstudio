/**
 * 내 이야기 AI 보강의 기본 호출자 — 기존 "무료 우선 클라우드 텍스트 AI" 경로를 그대로 감싼다.
 *
 * 새 AI 경로나 키 입력 UI를 만들지 않는다. 로그인 사용자의 자동 무료 AI → 개인 무료 키 순서,
 * 로그인 필요/무료 소진 코드는 `completeStudioServerText`가 이미 정한 계약을 그대로 따른다.
 * 순수 로직(my-story-ai)과 분리해 둔 이유는 네트워크 의존을 이 한 파일에만 가두기 위해서다.
 */

import { completeStudioServerText } from "../studio-server-ai-client";

import type { MyStoryTextCompleter } from "./my-story-ai";

export const completeMyStoryText: MyStoryTextCompleter = (request, signal) =>
  completeStudioServerText(
    {
      // 장면/줄거리 성격의 짧은 텍스트 작업과 같은 task로 보낸다(서버 한도·제공자 선택 정책 공유).
      task: "scenario",
      promptVersion: 1,
      system: request.system,
      user: request.user,
      operationId: request.operationId,
    },
    signal,
  );
