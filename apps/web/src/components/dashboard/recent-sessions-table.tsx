"use client";

import Link from "next/link";
import { ArrowRight, Radar } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { SessionStatusBadge } from "@/components/sessions/status-badge";
import { useSessions } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export function RecentSessionsTable() {
  const { data: sessions = [], isLoading, error, refetch } = useSessions();
  const recent = sessions.slice(0, 6);

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Recent Sessions</CardTitle>
        <CardAction className="self-center">
          <Link
            href="/sessions"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={Radar}
            title="No sessions yet"
            description="Head to Sessions to create your first LiDAR run."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Session
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((session) => (
                <TableRow key={session.session_id} className="table-row-hover">
                  <TableCell className="font-medium">
                    <Link
                      href={`/sessions/${session.session_id}`}
                      className="block truncate rounded-sm underline-offset-4 hover:underline"
                    >
                      {session.session_name}
                    </Link>
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
