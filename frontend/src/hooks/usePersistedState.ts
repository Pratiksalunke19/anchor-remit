import { useEffect, useRef, useState } from "react";

function read<T>(key: string, initial: T): T {
  if (typeof window === "undefined") return initial;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return initial;
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
}

/**
 * useState that mirrors its value to localStorage so the value
 * survives unmount / route change / page reload.
 *
 * If `key` changes (e.g. user connects a different wallet), the stored
 * value for the new key is loaded, so different identities don't share
 * the same state.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(() => read(key, initial));

  // Re-load when the storage key changes (e.g. wallet address change).
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    setValue(read(key, initial));
    // we intentionally do not include `initial` in deps to avoid loops
    // when callers pass a fresh object literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist value under the current key.
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / serialization — ignore */
    }
  }, [key, value]);

  function clear() {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  return [value, setValue, clear];
}
