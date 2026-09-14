"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Progress } from "@/components/ui/progress";
import { SessionArchive } from "./session-archive";
import { SessionEditDialog } from "./session-edit-dialog";
import { SessionStatusBadge } from "./status-badge";
import { TrajectoryPlot } from "./trajectory-plot";
import { ApiError } from "@/lib/api-client";
import { useDeleteSession, useRunSession, useSession } from "@/lib/queries";
import type { Session } from "@kiss-icp-lidar-archive/shared";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="stat-value mt-1 text-xl">{value}</p>
    </div>
  );
}

function BusyProgress({ session }: { session: Session }) {
  // Determinate feedback for the two B2-I/O-bound long ops (ingest ~80-110s,
  // run ~40s): the backend now persists interim progress every few seconds
  // (see session_run.py's _progress_step), so this bar advances on the same
  // 2s poll instead of sitting behind just a spinner. Hidden once idle/complete.
  if (session.status !== "ingesting" && session.status !== "running") return null;
  const total = session.num_frames;
  const current =
    session.status === "ingesting"
      ? session.scan_keys_count
      : session.metrics.frame_count;
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  const label =
    session.status === "ingesting"
      ? `Ingesting scans — ${current} / ${total}`
      : `Running KISS-ICP — ${current} / ${total}`;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Progress value={pct} />
    </div>
  );
}

function MetricsGrid({ session }: { session: Session }) {
  const m = session.metrics;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Metric label="Frames" value={String(m.frame_count || session.scan_keys_count || 0)} />
      <Metric label="Scan data" value={formatBytes(m.scan_bytes)} />
      <Metric label="Map snapshots" value={String(m.map_snapshot_count)} />
      <Metric label="Map points" value={m.map_point_count.toLocaleString()} />
      <Metric
        label="Distance"
        value={m.trajectory_distance_m ? `${m.trajectory_distance_m.toFixed(1)} m` : "—"}
      />
      <Metric
        label="Drift (ATE)"
        value={m.ate_rmse_m !== null ? `${m.ate_rmse_m.toFixed(3)} m` : "—"}
      />
    </div>
  );
}

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { data: session, isLoading, error, refetch } = useSession(sessionId);
  const runMutation = useRunSession(sessionId);
  const deleteMutation = useDeleteSession();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState
            error={error}
            title="Couldn't load this session"
            onRetry={() => refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  const busy = session.status === "ingesting" || session.status === "running";
  const canRun = session.status === "ingested" || session.status === "complete" || session.status === "failed";

  function handleRun() {
    runMutation.mutate(undefined, {
      onSuccess: () => toast.success("KISS-ICP run started"),
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Could not start run"),
    });
  }

  function handleDelete() {
    deleteMutation.mutate(session!.session_id, {
      onSuccess: () => {
        toast.success("Session deleted");
        router.push("/sessions");
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Could not delete session"),
      onSettled: () => setConfirmDelete(false),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/sessions"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All sessions
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="page-title">{session.session_name}</h1>
              <SessionStatusBadge status={session.status} />
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {session.robot_id} · {session.scene} · {session.quality} · {session.scan_source}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleRun} disabled={!canRun || runMutation.isPending}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {session.status === "running"
                ? "Running…"
                : session.status === "ingesting"
                  ? "Ingesting…"
                  : session.status === "complete"
                    ? "Re-run SLAM"
                    : "Run SLAM"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {session.status === "failed" && session.error && (
        <Alert variant="destructive">
          <AlertTitle>This session failed</AlertTitle>
          <AlertDescription>{session.error}</AlertDescription>
        </Alert>
      )}

      <BusyProgress session={session} />

      <MetricsGrid session={session} />

      <div className="grid gap-6 lg:grid-cols-2">
        <TrajectoryPlot
          sessionId={session.session_id}
          enabled={session.status === "complete"}
        />
        <SessionArchive session={session} />
      </div>

      <SessionEditDialog session={session} open={editOpen} onOpenChange={setEditOpen} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every object under this session&apos;s
              prefixes in B2 — scans, odometry, maps, and the trajectory. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleDelete();
              }}
              disabled={deleteMutation.isPending}
              className={buttonVariants({ variant: "destructive" })}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
