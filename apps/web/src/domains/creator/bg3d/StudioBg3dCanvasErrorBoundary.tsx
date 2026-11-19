import { Component, type ErrorInfo, type ReactNode } from "react";

import type { StudioBg3dEngineBackend } from "./studio-bg3d-engine-selection";

export interface StudioBg3dCanvasErrorBoundaryProps {
  readonly resetKey: string;
  readonly backend: StudioBg3dEngineBackend;
  readonly onRendererError: (backend: StudioBg3dEngineBackend, cause: string) => void;
  readonly children: ReactNode;
}

interface StudioBg3dCanvasErrorBoundaryState {
  readonly key: string;
  readonly failed: boolean;
}

export class StudioBg3dCanvasErrorBoundary extends Component<
  StudioBg3dCanvasErrorBoundaryProps,
  StudioBg3dCanvasErrorBoundaryState
> {
  override state: StudioBg3dCanvasErrorBoundaryState = { key: this.props.resetKey, failed: false };

  static getDerivedStateFromProps(
    props: StudioBg3dCanvasErrorBoundaryProps,
    state: StudioBg3dCanvasErrorBoundaryState,
  ): StudioBg3dCanvasErrorBoundaryState | null {
    return state.key === props.resetKey ? null : { key: props.resetKey, failed: false };
  }

  static getDerivedStateFromError(): Partial<StudioBg3dCanvasErrorBoundaryState> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    const message = error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "3D 렌더러를 초기화하지 못했습니다.";
    this.props.onRendererError(this.props.backend, message);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return null;
    }
    return this.props.children;
  }
}
