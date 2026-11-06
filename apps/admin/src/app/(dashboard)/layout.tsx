import type { ReactNode } from "react";
import { RequireSession } from "@/features/auth/require-session";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <RequireSession>{children}</RequireSession>;
}
