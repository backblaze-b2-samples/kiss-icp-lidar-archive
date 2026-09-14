"use client";

import { useMemo } from "react";
import { Route } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrajectory } from "@/lib/queries";
import type { TrajectoryGeoJSON } from "@kiss-icp-lidar-archive/shared";

const SIZE = 320;
const PAD = 16;

interface PlotPath {
  name: string;
  label: string;
  points: string;
  color: string;
  dashed: boolean;
}

function buildPaths(data: TrajectoryGeoJSON | undefined): PlotPath[] {
  const features = data?.features ?? [];
  const coords = features.flatMap((f) => f.geometry.coordinates);
  if (coords.length === 0) return [];

  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    1e-6,
  );
  const scale = (SIZE - 2 * PAD) / span;
  const project = ([x, y]: [number, number]) =>
    `${(SIZE / 2 + (x - cx) * scale).toFixed(1)},${(SIZE / 2 - (y - cy) * scale).toFixed(1)}`;

  return features.map((feature) => {
    const isGroundTruth = feature.properties.name === "ground_truth";
    return {
      name: feature.properties.name,
      label: feature.properties.label,
      points: feature.geometry.coordinates.map(project).join(" "),
      color: isGroundTruth ? "var(--muted-foreground)" : "var(--chart-1)",
      dashed: isGroundTruth,
    };
  });
}

export function TrajectoryPlot({
  sessionId,
  enabled,
}: {
  sessionId: string;
  enabled: boolean;
}) {
  const { data, isLoading, error, refetch } = useTrajectory(sessionId, enabled);
  const paths = useMemo(() => buildPaths(data), [data]);

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Trajectory</CardTitle>
        <CardDescription className="text-xs">
          Top-down recovered path (metres, first-frame frame)
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {!enabled ? (
          <EmptyState
            icon={Route}
            title="No trajectory yet"
            description="Run KISS-ICP on this session to reconstruct and plot the path."
          />
        ) : isLoading ? (
          <Skeleton className="mx-auto h-[320px] w-[320px]" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : paths.length === 0 ? (
          <EmptyState icon={Route} title="Trajectory is empty" />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="h-[320px] w-[320px] rounded-md border border-border bg-muted/20"
              role="img"
              aria-label="Recovered LiDAR trajectory"
            >
              {paths.map((path) => (
                <polyline
                  key={path.name}
                  points={path.points}
                  fill="none"
                  stroke={path.color}
                  strokeWidth={2}
                  strokeDasharray={path.dashed ? "5 4" : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            </svg>
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              {paths.map((path) => (
                <span key={path.name} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-0.5 w-4"
                    style={{
                      backgroundColor: path.color,
                      borderTop: path.dashed
                        ? "2px dashed var(--muted-foreground)"
                        : undefined,
                    }}
                  />
                  {path.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
