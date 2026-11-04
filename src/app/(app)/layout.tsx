import { AppShell } from "@/components/layout/AppShell";
import { devUser } from "@/lib/dev-user";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell user={devUser}>{children}</AppShell>;
}
