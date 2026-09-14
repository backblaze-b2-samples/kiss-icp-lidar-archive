"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ApiError } from "@/lib/api-client";
import { useUpdateSession } from "@/lib/queries";
import type { Session } from "@kiss-icp-lidar-archive/shared";

const schema = z.object({
  session_name: z.string().min(1, "Required").max(100),
  robot_id: z.string().min(1, "Required").max(100),
});

type FormValues = z.infer<typeof schema>;

export function SessionEditDialog({
  session,
  open,
  onOpenChange,
}: {
  session: Session;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const update = useUpdateSession(session.session_id);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      session_name: session.session_name,
      robot_id: session.robot_id,
    },
  });

  // Re-seed the form whenever a different (or refreshed) session opens it.
  useEffect(() => {
    if (open) {
      form.reset({
        session_name: session.session_name,
        robot_id: session.robot_id,
      });
    }
  }, [open, session.session_name, session.robot_id, form]);

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      await update.mutateAsync(values);
      toast.success("Session updated");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update session");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit session</DialogTitle>
          <DialogDescription>
            Rename the session or its robot. Ingest-time choices (scene, frames,
            quality) are fixed once scans are archived.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="session_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="robot_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Robot ID</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
