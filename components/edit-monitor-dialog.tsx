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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { updateMonitorSchema } from '@/lib/validations';

interface Monitor {
  id: string;
  name: string;
  url: string;
  interval: number;
  region: string;
}

interface EditMonitorDialogProps {
  monitor: Monitor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (monitor: any) => void;
}

export function EditMonitorDialog({ monitor, open, onOpenChange, onUpdated }: EditMonitorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    const formData = new FormData(e.currentTarget);
    const raw = {
      name: formData.get('name') as string,
      url: formData.get('url') as string,
      interval: Number(formData.get('interval')),
      region: formData.get('region') as string,
    };

    const result = updateMonitorSchema.safeParse(raw);
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
      const res = await fetch(`/api/monitors/${monitor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update monitor');
      }

      const updated = await res.json();
      toast.success('Monitor updated successfully');
      onUpdated(updated);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Monitor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" name="name" defaultValue={monitor.name} />
            {errors.name && <p className="text-sm text-destructive mt-1">{errors.name}</p>}
          </div>

          <div>
            <Label htmlFor="edit-url">URL</Label>
            <Input id="edit-url" name="url" defaultValue={monitor.url} />
            {errors.url && <p className="text-sm text-destructive mt-1">{errors.url}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-interval">Check Interval (seconds)</Label>
              <Input id="edit-interval" name="interval" type="number" defaultValue={monitor.interval} min={30} max={3600} />
              {errors.interval && <p className="text-sm text-destructive mt-1">{errors.interval}</p>}
            </div>

            <div>
              <Label htmlFor="edit-region">Region</Label>
              <Select name="region" defaultValue={monitor.region}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us-east-1">US East</SelectItem>
                  <SelectItem value="us-west-2">US West</SelectItem>
                  <SelectItem value="eu-west-1">EU West</SelectItem>
                  <SelectItem value="ap-south-1">AP South</SelectItem>
                </SelectContent>
              </Select>
              {errors.region && <p className="text-sm text-destructive mt-1">{errors.region}</p>}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
