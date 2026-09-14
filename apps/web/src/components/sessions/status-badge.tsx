"use client";

import { Badge } from "@/components/ui/badge";
import type { SessionStatus } from "@kiss-icp-lidar-archive/shared";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const LABELS: Record<SessionStatus, string> = {
  ingesting: "Ingesting",
  ingested: "Ingested",
  running: "Running SLAM",
  complete: "Complete",
  failed: "Failed",
};

const VARIANTS: Record<SessionStatus, BadgeVariant> = {
  ingesting: "secondary",
  ingested: "outline",
  running: "secondary",
  complete: "default",
  failed: "destructive",
};

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const busy = status === "ingesting" || status === "running";
  return (
    <Badge variant={VARIANTS[status]} className="gap-1.5">
      {busy && (
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {LABELS[status]}
    </Badge>
  );
}
