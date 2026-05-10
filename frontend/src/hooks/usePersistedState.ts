import { useEffect, useRef, useState } from "react";

/**
 * useState that mirrors its value to localStorage so the value
 * survives unmount / route change / page reload.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    try {
      window.localStorage.setItem(keyRef.current, JSON.stringify(value));
    } catch {
      /* quota / serialization — ignore */
    }
  }, [value]);

  function clear() {
    try {
      window.localStorage.removeItem(keyRef.current);
    } catch {
      /* ignore */
    }
  }

  return [value, setValue, clear];
}
