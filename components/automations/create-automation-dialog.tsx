"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useAppStore } from "@/lib/stores/app-store";
import { automationTriggerMeta } from "@/lib/status-meta";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AutomationTriggerKind } from "@/lib/types";

const automationSchema = z.object({
  name: z.string().min(2, "Enter a name"),
  description: z.string().min(2, "Describe what this automation does"),
  trigger: z.string().min(1, "Select a trigger"),
});
type AutomationFormValues = z.infer<typeof automationSchema>;

const triggerOptions = Object.entries(automationTriggerMeta) as [AutomationTriggerKind, string][];

export function CreateAutomationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createAutomation = useAppStore((s) => s.createAutomation);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AutomationFormValues>({
    resolver: zodResolver(automationSchema),
    defaultValues: { name: "", description: "", trigger: triggerOptions[0][0] },
  });

  function onSubmit(values: AutomationFormValues) {
    const id = createAutomation({
      name: values.name,
      description: values.description,
      trigger: values.trigger as AutomationTriggerKind,
    });
    toast.success("Automation created", { description: values.name });
    onOpenChange(false);
    reset();
    router.push(`/automations/${id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New automation</DialogTitle>
          <DialogDescription>Define a trigger and give it a name — build out the workflow next.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="automation-name">Name</Label>
            <Input id="automation-name" placeholder="e.g. Trial Expiry Reminder" {...register("name")} />
            {errors.name && <p className="text-[11px] text-danger">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="automation-description">Description</Label>
            <Textarea id="automation-description" placeholder="What should this automation do?" {...register("description")} />
            {errors.description && <p className="text-[11px] text-danger">{errors.description.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Trigger</Label>
            <Select value={watch("trigger")} onValueChange={(v) => setValue("trigger", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {triggerOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.trigger && <p className="text-[11px] text-danger">{errors.trigger.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Create automation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
