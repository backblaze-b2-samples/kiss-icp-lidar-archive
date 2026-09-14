import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LidarStatsCards } from "@/components/dashboard/lidar-stats-cards";
import { RecentSessionsTable } from "@/components/dashboard/recent-sessions-table";
import { SessionsChart } from "@/components/dashboard/sessions-chart";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            LiDAR SLAM archive on Backblaze B2 — sessions, scan frames, maps, and
            trajectory distance.
          </p>
        </div>
        <Button asChild size="sm" className="h-8">
          <Link href="/sessions">
            <Plus className="h-3.5 w-3.5" />
            New session
          </Link>
        </Button>
      </div>
      <LidarStatsCards />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="animate-fade-in-up stagger-3">
          <SessionsChart />
        </div>
        <div className="animate-fade-in-up stagger-4">
          <RecentSessionsTable />
        </div>
      </div>
    </div>
  );
}
