'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface NotificationChannelData {
  id?: string;
  name: string;
  type: 'EMAIL' | 'WEBHOOK';
  target: string;
  enabled: boolean;
}

interface NotificationChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initial?: NotificationChannelData;
}

export function NotificationChannelDialog({
  open,
  onOpenChange,
  onSuccess,
  initial,
}: NotificationChannelDialogProps) {
  const isEdit = !!initial?.id;
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState<'EMAIL' | 'WEBHOOK'>('EMAIL');
  const [target, setTarget] = useState('');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setType(initial?.type ?? 'EMAIL');
      setTarget(initial?.target ?? '');
    }
  }, [open, initial]);

  const handleSubmit = async () => {
    if (!name.trim() || !target.trim()) {
      toast.error('Name and target are required');
      return;
    }

    setLoading(true);
    try {
      const url = isEdit
        ? `/api/notification-channels/${initial!.id}`
        : '/api/notification-channels';

      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, target, enabled: true }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Request failed');
      }

      toast.success(isEdit ? 'Channel updated' : 'Channel created');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Notification Channel' : 'Add Notification Channel'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="nc-name">Name</Label>
            <Input
              id="nc-name"
              placeholder="e.g. My Email Alert"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as 'EMAIL' | 'WEBHOOK')}
              disabled={isEdit}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="WEBHOOK">Webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="nc-target">
              {type === 'EMAIL' ? 'Email Address' : 'Webhook URL'}
            </Label>
            <Input
              id="nc-target"
              placeholder={
                type === 'EMAIL'
                  ? 'alerts@example.com'
                  : 'https://hooks.slack.com/...'
              }
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            {type === 'WEBHOOK' && (
              <p className="text-xs text-muted-foreground mt-1">
                Receives a POST with JSON body containing event, monitor, and details.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
