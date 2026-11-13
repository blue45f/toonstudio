import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

export function useTaskScreen<T extends string>({ ids, defaultScreen, param = "view" }: {
  readonly ids: readonly T[];
  readonly defaultScreen: T;
  readonly param?: string;
}) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const value = searchParams.get(param);
  const activeScreen = ids.find((id) => id === value) ?? defaultScreen;
  function navigateScreen(screen: T) {
    const next = new URLSearchParams(searchParams);
    if (screen === defaultScreen) next.delete(param);
    else next.set(param, screen);
    navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, { state: location.state });
  }
  return { activeScreen, navigateScreen };
}
