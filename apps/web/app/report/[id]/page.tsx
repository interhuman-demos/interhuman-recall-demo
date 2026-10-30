import { notFound } from "next/navigation";
import { hasReportAccess } from "@/lib/server/access";
import { loadJob } from "@/lib/server/store";
import { ReportView } from "./_components/report-view";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const authorized = await hasReportAccess(id);
  if (!authorized) notFound();

  const record = await loadJob(id);
  if (!record) notFound();

  return <ReportView initial={record} />;
}
