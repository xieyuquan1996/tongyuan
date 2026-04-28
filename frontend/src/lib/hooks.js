import { useEffect, useRef, useState, useCallback } from "react";

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [tick, setTick] = useState(0);
  const isReload = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (!isReload.current) {
      setState((s) => ({ ...s, loading: true, error: null }));
    }
    isReload.current = false;
    fn()
      .then((data) => mounted.current && setState({ loading: false, data, error: null }))
      .catch((error) => mounted.current && setState({ loading: false, data: null, error }));
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => { isReload.current = true; setTick((t) => t + 1); }, []);
  return { ...state, reload };
}

export function fmtRelative(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 0) return "刚刚";
  if (diff < 60_000) return Math.max(1, Math.floor(diff / 1000)) + " 秒前";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + " 分钟前";
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + " 小时前";
  return Math.floor(diff / 86_400_000) + " 天前";
}
