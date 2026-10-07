import { AdminProjectDetail } from "@/components/AdminProjectDetail";
export const dynamic = "force-dynamic";
export default async function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) { return <AdminProjectDetail id={(await params).id} />; }
