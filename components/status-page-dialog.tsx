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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Monitor {
  id: string;
  name: string;
}

interface StatusPageData {
  id?: string;
  title: string;
  slug: string;
  description?: string | null;
  monitorIds: string[];
  isPublic: boolean;
}

interface StatusPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  monitors: Monitor[];
  initial?: StatusPageData;
}

export function StatusPageDialog({
  open,
  onOpenChange,
  onSuccess,
  monitors,
  initial,
}: StatusPageDialogProps) {
  const isEdit = !!initial?.id;
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMonitors, setSelectedMonitors] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '');
      setSlug(initial?.slug ?? '');
      setDescription(initial?.description ?? '');
      setSelectedMonitors(initial?.monitorIds ?? []);
      setIsPublic(initial?.isPublic ?? true);
    }
  }, [open, initial]);

  // Auto-generate slug from title
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isEdit) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      );
    }
  };

  const toggleMonitor = (id: string) => {
    setSelectedMonitors((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim() || !slug.trim()) {
      toast.error('Title and slug are required');
      return;
    }

    setLoading(true);
    try {
      const url = isEdit ? `/api/status-pages/${initial!.id}` : '/api/status-pages';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          slug,
          description: description || undefined,
          monitorIds: selectedMonitors,
          isPublic,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      toast.success(isEdit ? 'Status page updated' : 'Status page created');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Status Page' : 'Create Status Page'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="sp-title">Title</Label>
            <Input
              id="sp-title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="My Service Status"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="sp-slug">Slug</Label>
            <Input
              id="sp-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-service"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Public URL: /status/{slug || '...'}
            </p>
          </div>

          <div>
            <Label htmlFor="sp-desc">Description (optional)</Label>
            <Textarea
              id="sp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Real-time status for our services"
              className="mt-1"
              rows={2}
            />
          </div>

          <div>
            <Label>Monitors to Display</Label>
            {monitors.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">
                No monitors yet. Create monitors first.
              </p>
            ) : (
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {monitors.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-3 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedMonitors.includes(m.id)}
                      onCheckedChange={() => toggleMonitor(m.id)}
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Public</Label>
              <p className="text-xs text-muted-foreground">
                Make this status page publicly accessible
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
