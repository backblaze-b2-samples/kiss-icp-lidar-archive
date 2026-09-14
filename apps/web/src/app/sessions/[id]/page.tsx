import { SessionDetail } from "@/components/sessions/session-detail";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="animate-fade-in">
      <SessionDetail sessionId={id} />
    </div>
  );
}
