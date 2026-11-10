import { useEffect, useState } from 'react';

type SetValue<T> = T | ((previous: T) => T);

export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initialValue : (JSON.parse(stored) as T);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The app remains usable when browser storage is unavailable.
    }
  }, [key, value]);

  return [value, setValue as (next: SetValue<T>) => void] as const;
}
