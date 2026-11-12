import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import { addRecentSearch, parseRecentSearches, recentSearchKey } from "./recent";

/** Recent searches kept on this device only. Storage failures leave the list empty rather than breaking search. */
export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(recentSearchKey)
      .then((raw) => {
        if (active) {
          setRecent(parseRecentSearches(raw));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback((next: string[]) => {
    setRecent(next);
    AsyncStorage.setItem(recentSearchKey, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const remember = useCallback(
    (term: string) => {
      setRecent((current) => {
        const next = addRecentSearch(current, term);
        AsyncStorage.setItem(recentSearchKey, JSON.stringify(next)).catch(() => undefined);
        return next;
      });
    },
    [],
  );

  return { recent, remember, clear: () => save([]) };
}
