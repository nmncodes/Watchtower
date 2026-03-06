'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit2, Trash2, Eye, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { CreateMonitorDialog } from '@/components/create-monitor-dialog';
import { EditMonitorDialog } from '@/components/edit-monitor-dialog';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';

interface Monitor {
  id: string;
  name: string;
  url: string;
  status: string;
  interval: number;
  region: string;
  lastCheckAt: string | null;
  createdAt: string;
}

export default function MonitorsPage() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit dialog state
  const [editMonitor, setEditMonitor] = useState<Monitor | null>(null);

  // Delete dialog state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetch('/api/monitors')
      .then((res) => res.json())
      .then((data) => setMonitors(data))
      .catch((err) => console.error('Failed to load monitors', err))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/monitors/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setMonitors((prev) => prev.filter((m) => m.id !== deleteId));
        toast.success('Monitor deleted');
      } else {
        toast.error('Failed to delete monitor');
      }
    } catch {
      toast.error('Failed to delete monitor');
    } finally {
      setDeleteLoading(false);
      setDeleteId(null);
    }
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { UP: 'up', DOWN: 'down', DEGRADED: 'degraded', PAUSED: 'paused' };
    return map[s] ?? s.toLowerCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Monitors</h1>
          <p className="text-muted-foreground">Manage and view all your monitored services</p>
        </div>
        <CreateMonitorDialog
          onCreated={(m) => setMonitors((prev) => [m, ...prev])}
        />
      </div>

      {monitors.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground mb-4">No monitors yet. Add one to get started.</p>
          <CreateMonitorDialog
            onCreated={(m) => setMonitors((prev) => [m, ...prev])}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {monitors.map((monitor) => {
            const label = statusLabel(monitor.status);
            return (
              <Card key={monitor.id} className="p-6 hover:shadow-md transition">
                <div className="grid md:grid-cols-5 gap-6 items-start mb-6">
                  {/* Monitor Info */}
                  <div className="md:col-span-2">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${
                          label === 'up' ? 'bg-green-600' : label === 'down' ? 'bg-red-600' : label === 'degraded' ? 'bg-yellow-600' : 'bg-gray-400'
                        }`}
                      />
                      <div>
                        <h3 className="font-semibold text-lg">{monitor.name}</h3>
                        <p className="text-sm text-muted-foreground break-all">{monitor.url}</p>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 md:col-span-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Status</p>
                      <p className="text-2xl font-bold capitalize">{label}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Check Interval</p>
                      <p className="text-2xl font-bold">{monitor.interval}s</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 justify-end">
                    <Link href={`/dashboard/monitors/${monitor.id}`}>
                      <Button variant="ghost" size="sm" className="gap-2">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      onClick={() => setEditMonitor(monitor)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive"
                      onClick={() => setDeleteId(monitor.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 text-xs text-muted-foreground">
                  Last checked: {monitor.lastCheckAt ? formatDistanceToNow(new Date(monitor.lastCheckAt), { addSuffix: true }) : 'Never'}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Monitor Dialog */}
      {editMonitor && (
        <EditMonitorDialog
          monitor={editMonitor}
          open={!!editMonitor}
          onOpenChange={(open) => { if (!open) setEditMonitor(null); }}
          onUpdated={(updated) =>
            setMonitors((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)))
          }
        />
      )}

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete Monitor"
        description="This will permanently delete this monitor and all its checks and incidents. This action cannot be undone."
        onConfirm={handleDelete}
        loading={deleteLoading}
      />
    </div>
  );
}
