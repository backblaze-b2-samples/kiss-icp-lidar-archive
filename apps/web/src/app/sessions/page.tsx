import { SessionList } from "@/components/sessions/session-list";

export default function SessionsPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Sessions</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
          LiDAR SLAM field runs. Create a session to ingest scans and run
          KISS-ICP; each session archives its scans, odometry, map snapshots, and
          trajectory to Backblaze B2.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <SessionList />
      </div>
    </div>
  );
}
