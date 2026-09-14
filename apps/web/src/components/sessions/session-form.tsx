"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ApiError } from "@/lib/api-client";
import { useCreateSession } from "@/lib/queries";
import type { Session } from "@kiss-icp-lidar-archive/shared";

const schema = z.object({
  session_name: z.string().min(1, "Required").max(100),
  robot_id: z.string().min(1, "Required").max(100),
  scan_source: z.enum(["synthetic", "upload"]),
  scene: z.enum(["warehouse", "corridor", "open-loop"]),
  num_frames: z.enum(["60", "120", "240"]),
  quality: z.enum(["fast", "balanced", "accurate"]),
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  session_name: "",
  robot_id: "",
  scan_source: "synthetic",
  scene: "warehouse",
  num_frames: "120",
  quality: "balanced",
};

export function SessionForm({ onCreated }: { onCreated: (session: Session) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const create = useCreateSession();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  const scanSource = useWatch({ control: form.control, name: "scan_source" });
  const isSynthetic = scanSource === "synthetic";

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const session = await create.mutateAsync({
        session_name: values.session_name,
        robot_id: values.robot_id,
        scan_source: values.scan_source,
        scene: values.scene,
        num_frames: Number(values.num_frames),
        quality: values.quality,
      });
      toast.success(`Session "${session.session_name}" created`, {
        description: isSynthetic
          ? "Generating synthetic scans and archiving them to B2…"
          : "Upload your scans, then run KISS-ICP.",
      });
      onCreated(session);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create session");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="session_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Session name</FormLabel>
              <FormControl>
                <Input placeholder="warehouse-loop-1" {...field} />
              </FormControl>
              <FormDescription>A label for this field run.</FormDescription>
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
                <Input placeholder="robot-01" {...field} />
              </FormControl>
              <FormDescription>
                Identifier of the vehicle/robot; scans are archived under it.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="scan_source"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Scan source</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  className="flex gap-6"
                >
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="synthetic" /> Synthetic
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="upload" /> Upload real scans
                  </label>
                </RadioGroup>
              </FormControl>
              <FormDescription>
                Synthetic generates overlapping LiDAR frames locally (no sensor
                needed). Upload lets you add your own scans afterwards.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="scene"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Scene</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={!isSynthetic}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="warehouse">Warehouse (closed loop)</SelectItem>
                  <SelectItem value="corridor">Corridor (straight)</SelectItem>
                  <SelectItem value="open-loop">Open loop (half turn)</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Shapes the synthetic trajectory. Only used for synthetic scans.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="num_frames"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Frames</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={!isSynthetic}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="60">60 (fastest demo)</SelectItem>
                  <SelectItem value="120">120 (default)</SelectItem>
                  <SelectItem value="240">240 (longest run)</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                More frames means a longer archive and a longer run.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="quality"
          render={({ field }) => (
            <FormItem>
              <FormLabel>SLAM quality</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="fast">Fast (coarse voxels)</SelectItem>
                  <SelectItem value="balanced">Balanced (default)</SelectItem>
                  <SelectItem value="accurate">Accurate (fine voxels)</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Maps to KISS-ICP voxel size and range. Finer is slower.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create session"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
