import { AlertTriangle } from "lucide-react";
import { Component, useEffect, type ReactNode } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * 하이브리드 DCC 뷰포트의 장면 보조 조각 — 로컬 환경맵, 캔버스 오류 경계, 감소된 모션 선호,
 * 세그먼트 버튼. 뷰포트 코어 상태에 의존하지 않아 코어에서 분리했다.
 */

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function assignStudioHybridDccEnvironment(
  scene: THREE.Scene,
  environment: THREE.Texture | null,
): void {
  scene.environment = environment;
}

export function StudioHybridDccLocalEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const room = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(gl);
    generator.compileCubemapShader();
    const target = generator.fromScene(room, 0.04);
    const previousEnvironment = scene.environment;
    assignStudioHybridDccEnvironment(scene, target.texture);
    return () => {
      if (scene.environment === target.texture) {
        assignStudioHybridDccEnvironment(scene, previousEnvironment);
      }
      target.dispose();
      generator.dispose();
      room.dispose();
    };
  }, [gl, scene]);

  return null;
}

export class StudioHybridDccCanvasBoundary extends Component<
  { readonly children: ReactNode },
  { readonly error: Error | null }
> {
  state: { readonly error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { readonly error: Error } {
    return { error };
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 grid place-items-center bg-canvas px-5 text-center" role="alert">
          <div className="max-w-sm">
            <AlertTriangle className="mx-auto mb-3 text-bad" size={24} aria-hidden="true" />
            <p className="text-sm font-semibold text-fg">3D 뷰포트를 시작하지 못했습니다.</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-2">
              그래픽 가속을 확인한 뒤 뷰포트를 다시 열어 주세요.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SegmentedButton({
  active,
  children,
  disabled = false,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={classes(
        "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[0.7rem] font-semibold transition-colors motion-reduce:transition-none sm:pointer-fine:min-h-9",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-accent/55 bg-accent-soft text-accent"
          : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
