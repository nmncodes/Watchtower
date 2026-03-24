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
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

interface CheckData {
  status: string;
  responseTime: number;
  createdAt: string;
}

interface Monitor {
  id: string;
  name: string;
  url: string;
  status: string;
  interval: number;
  region: string;
  lastCheckAt: string | null;
  createdAt: string;
  checks: CheckData[];
}

function MiniSparkline({ data, color = 'var(--primary)' }: { data: number[]; color?: string }) {
  if (data.length < 2) return <span className="text-xs text-muted-foreground">No data</span>;
  const chartData = data.map((v, i) => ({ i, v }));
  const gradientId = `spark-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <ResponsiveContainer width={120} height={36}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${gradientId})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function computeUptime(checks?: CheckData[]): number {
  if (!Array.isArray(checks) || checks.length === 0) return 100;
  const upCount = checks.filter((c) => c.status === 'UP').length;
  return Math.round((upCount / checks.length) * 10000) / 100;
}

function computeAvg(checks?: CheckData[]): number {
  if (!Array.isArray(checks) || checks.length === 0) return 0;
  return Math.round(checks.reduce((a, c) => a + c.responseTime, 0) / checks.length);
}

export default function MonitorsPage() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit dialog state
  const [editMonitor, setEditMonitor] = useState<Monitor | null>(null);

  // Delete dialog state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchMonitors = () => {
    fetch('/api/monitors')
      .then((res) => res.json())
      .then((data) => setMonitors(data))
      .catch((err) => console.error('Failed to load monitors', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMonitors();
    const interval = setInterval(fetchMonitors, 15_000);
    return () => clearInterval(interval);
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

  const prependMonitor = (monitor: Monitor) => {
    setMonitors((prev) => (prev.some((m) => m.id === monitor.id) ? prev : [monitor, ...prev]));
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
          onCreated={prependMonitor}
        />
      </div>

      {monitors.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground mb-4">No monitors yet. Add one to get started.</p>
          <CreateMonitorDialog
            onCreated={prependMonitor}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {monitors.map((monitor) => {
            const checks = Array.isArray(monitor.checks) ? monitor.checks : [];
            const label = statusLabel(monitor.status);
            const uptime = computeUptime(checks);
            const avgRt = computeAvg(checks);
            const sparkData = checks
              .slice()
              .reverse()
              .map((c) => c.responseTime);
            const sparkColor = label === 'up' ? 'hsl(142, 71%, 45%)' : label === 'down' ? 'hsl(0, 72%, 51%)' : label === 'degraded' ? 'hsl(48, 96%, 53%)' : 'hsl(0, 0%, 60%)';
            return (
              <Card key={monitor.id} className="p-6 hover:shadow-md transition">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  {/* Monitor Info */}
                  <div className="flex items-start gap-3 md:w-70 shrink-0">
                    <div
                      className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${
                        label === 'up' ? 'bg-green-600' : label === 'down' ? 'bg-red-600' : label === 'degraded' ? 'bg-yellow-600' : 'bg-gray-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-lg truncate">{monitor.name}</h3>
                      <p className="text-sm text-muted-foreground break-all line-clamp-1">{monitor.url}</p>
                    </div>
                  </div>

                  {/* Sparkline */}
                  <div className="flex-1 flex items-center justify-center">
                    <MiniSparkline data={sparkData} color={sparkColor} />
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-4 shrink-0 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                      <p className="text-sm font-bold capitalize">{label}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Uptime</p>
                      <p className={`text-sm font-bold ${uptime >= 99 ? 'text-green-600' : uptime >= 95 ? 'text-yellow-600' : 'text-red-600'}`}>{uptime}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Avg</p>
                      <p className="text-sm font-bold">{avgRt}<span className="font-normal text-muted-foreground">ms</span></p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Interval</p>
                      <p className="text-sm font-bold">{monitor.interval}s</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    <Link href={`/dashboard/monitors/${monitor.id}`}>
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditMonitor(monitor)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteId(monitor.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
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
