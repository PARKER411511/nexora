import { WorkspaceShell } from "@/components/WorkspaceShell";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { cloudIsAdmin } from "@/lib/supabase/repository";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let isAdmin = false;
  if (hasSupabaseConfig()) {
    try {
      isAdmin = await cloudIsAdmin();
    } catch {
      // A missing account migration should leave the regular workspace usable.
    }
  }
  return <WorkspaceShell isAdmin={isAdmin}>{children}</WorkspaceShell>;
}
