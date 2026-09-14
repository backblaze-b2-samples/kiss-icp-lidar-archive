"use client";

import { useState } from "react";
import { Boxes, Download, FileJson, Loader2, Route, ScanLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getDownloadUrl } from "@/lib/api-client";
import { startBrowserDownload } from "@/lib/browser-download";
import { useFiles } from "@/lib/queries";
import type { Session } from "@kiss-icp-lidar-archive/shared";

function basename(key: string): string {
  return key.split("/").pop() ?? key;
}

function KeyRow({
  objectKey,
  pending,
  onDownload,
}: {
  objectKey: string;
  pending: string | null;
  onDownload: (key: string) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
      <span className="truncate font-mono text-xs text-muted-foreground" title={objectKey}>
        {basename(objectKey)}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 shrink-0 px-2 text-xs"
        disabled={pending === objectKey}
        onClick={() => onDownload(objectKey)}
        aria-label={`Download ${basename(objectKey)}`}
      >
        {pending === objectKey ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </Button>
    </li>
  );
}

function ArtifactGroup({
  icon: Icon,
  title,
  keys,
  scroll = false,
  pending,
  onDownload,
}: {
  icon: LucideIcon;
  title: string;
  keys: string[];
  scroll?: boolean;
  pending: string | null;
  onDownload: (key: string) => void;
}) {
  if (keys.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
        <span className="font-mono normal-case">({keys.length})</span>
      </p>
      <ul className={scroll ? "max-h-48 space-y-0.5 overflow-y-auto pr-1" : "space-y-0.5"}>
        {keys.map((key) => (
          <KeyRow key={key} objectKey={key} pending={pending} onDownload={onDownload} />
        ))}
      </ul>
    </div>
  );
}

export function SessionArchive({ session }: { session: Session }) {
  const [pending, setPending] = useState<string | null>(null);
  // Real scoped ListObjectsV2 against this session's scan prefix.
  const { data: scans = [], isLoading } = useFiles(session.scan_prefix, 1000);

  async function download(key: string) {
    setPending(key);
    const toastId = toast.loading(`Preparing ${basename(key)}…`);
    try {
      const { url } = await getDownloadUrl(key);
      if (startBrowserDownload(url, basename(key))) {
        toast.success(`Downloading ${basename(key)}`, { id: toastId });
      } else {
        toast.error("Couldn't start the download", { id: toastId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed", {
        id: toastId,
      });
    } finally {
      setPending(null);
    }
  }

  const trajectoryKeys = [
    session.trajectory_txt_key,
    session.trajectory_geojson_key,
  ].filter((k): k is string => Boolean(k));

  const nothingYet =
    !isLoading &&
    scans.length === 0 &&
    session.map_keys.length === 0 &&
    session.odometry_keys.length === 0 &&
    trajectoryKeys.length === 0;

  return (
    <Card>
      <CardHeader className="border-b border-border px-5 py-4">
        <CardTitle className="card-title">Session archive</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : nothingYet ? (
          <EmptyState
            icon={ScanLine}
            title="Nothing archived yet"
            description="Scans, maps, and the trajectory will appear here once ingest and the run complete."
          />
        ) : (
          <>
            <ArtifactGroup
              icon={ScanLine}
              title="Scans"
              keys={scans.map((f) => f.key)}
              scroll
              pending={pending}
              onDownload={download}
            />
            <ArtifactGroup
              icon={Boxes}
              title="Map snapshots"
              keys={session.map_keys}
              scroll
              pending={pending}
              onDownload={download}
            />
            <ArtifactGroup
              icon={FileJson}
              title="Odometry"
              keys={session.odometry_keys}
              scroll
              pending={pending}
              onDownload={download}
            />
            <ArtifactGroup
              icon={Route}
              title="Trajectory"
              keys={trajectoryKeys}
              pending={pending}
              onDownload={download}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
