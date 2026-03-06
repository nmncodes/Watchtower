'use client';

import { useState } from 'react';
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
import { createMonitorSchema, type CreateMonitorInput } from '@/lib/validations';

interface CreateMonitorDialogProps {
  onCreated: (monitor: any) => void;
}

export function CreateMonitorDialog({ onCreated }: CreateMonitorDialogProps) {
  const [open, setOpen] = useState(false);
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

    const result = createMonitorSchema.safeParse(raw);
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
      const res = await fetch('/api/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create monitor');
      }

      const monitor = await res.json();
      toast.success('Monitor created successfully');
      onCreated(monitor);
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
          <span className="hidden sm:inline">Add Monitor</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Monitor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="My API Server" />
            {errors.name && <p className="text-sm text-destructive mt-1">{errors.name}</p>}
          </div>

          <div>
            <Label htmlFor="url">URL</Label>
            <Input id="url" name="url" placeholder="https://example.com" />
            {errors.url && <p className="text-sm text-destructive mt-1">{errors.url}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="interval">Check Interval (seconds)</Label>
              <Input id="interval" name="interval" type="number" defaultValue={60} min={10} max={3600} />
              {errors.interval && <p className="text-sm text-destructive mt-1">{errors.interval}</p>}
            </div>

            <div>
              <Label htmlFor="region">Region</Label>
              <Select name="region" defaultValue="us-east-1">
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Monitor
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
