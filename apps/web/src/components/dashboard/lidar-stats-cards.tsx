"use client";

import { Boxes, HardDrive, Radar, Route, ScanLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingNotice } from "@/components/common/loading-notice";
import { useSessionStats } from "@/lib/queries";

export function LidarStatsCards() {
  const { data: stats, isLoading, error, refetch } = useSessionStats();

  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const cards = [
    { title: "Sessions", value: stats?.total_sessions ?? 0, icon: Radar },
    { title: "Scan Frames", value: stats?.total_frames ?? 0, icon: ScanLine },
    { title: "Scan Data in B2", value: stats?.total_scan_bytes_human ?? "0 B", icon: HardDrive },
    { title: "Maps Built", value: stats?.maps_built ?? 0, icon: Boxes },
    {
      title: "Trajectory",
      value: `${(stats?.total_trajectory_distance_m ?? 0).toFixed(1)} m`,
      icon: Route,
    },
  ];

  return (
    <>
      {isLoading && <LoadingNotice className="mb-3" subject="session metrics" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card, i) => (
          <Card
            key={card.title}
            className={`card-hover animate-fade-in-up stagger-${i + 1}`}
          >
            <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className="stat-icon-wrap">
                <card.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="pb-5 px-4">
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="stat-value">{card.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
