import { AdminCustomerDetail } from "@/components/AdminCustomerDetail";

export const dynamic = "force-dynamic";

export default async function AdminCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  return <AdminCustomerDetail id={(await params).id} />;
}
