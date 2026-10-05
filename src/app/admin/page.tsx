import { AdminDashboard, AdminDenied } from "@/components/AdminDashboard";
import { CloudUnavailable } from "@/components/CloudUnavailable";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  AdminRequiredError,
  cloudGetAdminOverview,
  isCloudSetupError,
} from "@/lib/supabase/repository";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!hasSupabaseConfig()) return <CloudUnavailable />;
  try {
    return <AdminDashboard overview={await cloudGetAdminOverview()} />;
  } catch (error) {
    if (error instanceof AdminRequiredError || (error && typeof error === "object" && "status" in error && error.status === 403))
      return <AdminDenied />;
    if (isCloudSetupError(error)) return <CloudUnavailable />;
    throw error;
  }
}
