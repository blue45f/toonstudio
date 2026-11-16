import { Component, type ErrorInfo, type ReactNode } from "react";

import type { StudioBg3dEngineBackend } from "./studio-bg3d-engine-selection";

export interface StudioBg3dCanvasErrorBoundaryProps {
  readonly resetKey: string;
  readonly backend: StudioBg3dEngineBackend;
  readonly onRendererError: (backend: StudioBg3dEngineBackend, cause: string) => void;
  readonly children: ReactNode;
}

interface StudioBg3dCanvasErrorBoundaryState {
  readonly failedKey: string | null;
}

export class StudioBg3dCanvasErrorBoundary extends Component<
  StudioBg3dCanvasErrorBoundaryProps,
  StudioBg3dCanvasErrorBoundaryState
> {
  override state: StudioBg3dCanvasErrorBoundaryState = { failedKey: null };

  static getDerivedStateFromError(): Partial<StudioBg3dCanvasErrorBoundaryState> {
    return {};
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    const message = error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "3D 렌더러를 초기화하지 못했습니다.";
    this.setState({ failedKey: this.props.resetKey });
    this.props.onRendererError(this.props.backend, message);
  }

  override render(): ReactNode {
    if (this.state.failedKey === this.props.resetKey) {
      return null;
    }
    return this.props.children;
  }
}
