"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessions } from "@/lib/queries";

const chartConfig = {
  frames: { label: "Scan frames", color: "var(--chart-1)" },
} satisfies ChartConfig;

function shortName(name: string): string {
  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}

export function SessionsChart() {
  const { data: sessions = [], isLoading, error, refetch } = useSessions();

  const data = useMemo(
    () =>
      [...sessions]
        .reverse()
        .slice(-8)
        .map((s) => ({
          name: shortName(s.session_name),
          frames: s.metrics.frame_count || s.scan_keys_count || 0,
        })),
    [sessions],
  );

  const hasData = data.some((d) => d.frames > 0);

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Scan frames per session</CardTitle>
        <CardDescription className="text-xs">Most recent sessions</CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !hasData ? (
          <EmptyState
            icon={BarChart3}
            title="No archived scans yet"
            description="Create a session to archive scan frames and see them here."
          />
        ) : (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={10} fontSize={11} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={6} fontSize={11} width={32} />
              <ChartTooltip cursor={{ fill: "var(--accent-subtle)" }} content={<ChartTooltipContent />} />
              <Bar dataKey="frames" fill="var(--color-frames)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
