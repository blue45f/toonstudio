import { Component, type ReactNode } from "react";

import { playStatusText } from "../play-status-i18n";

export class PlayGameBoundary extends Component<{ children: ReactNode; onExit: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="play-empty" role="alert"><h2>{playStatusText("play.status.boundary.openFailedTitle", "이 콘텐츠를 열지 못했어요.")}</h2><p>{playStatusText("play.status.boundary.openFailedDescription", "연결이나 브라우저 상태를 확인해 주세요. 저장된 창작 초안은 삭제하지 않습니다.")}</p><button className="play-button" type="button" onClick={this.props.onExit}>놀이터로 돌아가기</button><p className="play-note">{playStatusText("play.status.boundary.openFailedNote", "처음 실행하는 콘텐츠는 화면 파일을 내려받을 인터넷 연결이 필요합니다.")}</p></section>;
  }
}
