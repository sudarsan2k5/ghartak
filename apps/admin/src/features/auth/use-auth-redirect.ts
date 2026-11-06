"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { ApiFailure } from "@/lib/api/client";
import { redirectForFailure } from "@/lib/auth/session";
import { useSession } from "./session-provider";

export function useAuthRedirect() {
  const router = useRouter();
  const { refresh } = useSession();
  return useCallback(
    async (failure: ApiFailure) => {
      if (!redirectForFailure(failure)) {
        return false;
      }
      await refresh();
      router.replace("/login");
      return true;
    },
    [refresh, router],
  );
}
