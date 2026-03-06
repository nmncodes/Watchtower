'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createIncidentSchema, incidentStatusEnum } from '@/lib/validations';

interface Monitor {
  id: string;
  name: string;
}

interface CreateIncidentDialogProps {
  monitors: Monitor[];
  onCreated: (incident: any) => void;
}

export function CreateIncidentDialog({ monitors, onCreated }: CreateIncidentDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    const formData = new FormData(e.currentTarget);
    const raw = {
      monitorId: formData.get('monitorId') as string,
      summary: formData.get('summary') as string,
      status: formData.get('status') as string,
    };

    const result = createIncidentSchema.safeParse(raw);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create incident');
      }

      const incident = await res.json();
      toast.success('Incident reported successfully');
      onCreated(incident);
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Report Incident</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report Incident</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label htmlFor="monitorId">Affected Monitor</Label>
            <Select name="monitorId">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a monitor" />
              </SelectTrigger>
              <SelectContent>
                {monitors.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.monitorId && <p className="text-sm text-destructive mt-1">{errors.monitorId}</p>}
          </div>

          <div>
            <Label htmlFor="summary">Summary</Label>
            <Input id="summary" name="summary" placeholder="Brief description of the incident" />
            {errors.summary && <p className="text-sm text-destructive mt-1">{errors.summary}</p>}
          </div>

          <div>
            <Label htmlFor="status">Initial Status</Label>
            <Select name="status" defaultValue="INVESTIGATING">
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INVESTIGATING">Investigating</SelectItem>
                <SelectItem value="IDENTIFIED">Identified</SelectItem>
                <SelectItem value="MONITORING">Monitoring</SelectItem>
              </SelectContent>
            </Select>
            {errors.status && <p className="text-sm text-destructive mt-1">{errors.status}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Report Incident
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
