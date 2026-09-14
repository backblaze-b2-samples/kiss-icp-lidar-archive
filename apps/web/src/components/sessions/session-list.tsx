"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Radar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SessionForm } from "./session-form";
import { SessionStatusBadge } from "./status-badge";
import { useSessions } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import type { Session } from "@kiss-icp-lidar-archive/shared";

export function SessionList() {
  const router = useRouter();
  const { data: sessions = [], isLoading, error, refetch } = useSessions();
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleCreated(session: Session) {
    setDialogOpen(false);
    router.push(`/sessions/${session.session_id}`);
  }

  const newSessionButton = (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 shrink-0">
          <Plus className="h-3.5 w-3.5" />
          New session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New LiDAR session</DialogTitle>
          <DialogDescription>
            Generate synthetic scans (or plan to upload real ones), then run
            KISS-ICP to build odometry, a map, and a trajectory in B2.
          </DialogDescription>
        </DialogHeader>
        <SessionForm onCreated={handleCreated} />
      </DialogContent>
    </Dialog>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 space-y-0">
        <CardTitle className="card-title">Sessions</CardTitle>
        {newSessionButton}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={Radar}
            title="No sessions yet"
            description="Create a session to ingest LiDAR scans and run SLAM."
            action={newSessionButton}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Session
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Scene
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Frames
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Distance
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.session_id} className="table-row-hover">
                  <TableCell className="font-medium">
                    <Link
                      href={`/sessions/${session.session_id}`}
                      className="block rounded-sm underline-offset-4 hover:underline"
                    >
                      {session.session_name}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {session.robot_id}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    {session.scene}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {session.metrics.frame_count || session.scan_keys_count || session.num_frames}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {session.metrics.trajectory_distance_m
                      ? `${session.metrics.trajectory_distance_m.toFixed(1)} m`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <SessionStatusBadge status={session.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(session.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
