'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, Eye, Loader2 } from 'lucide-react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';

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

  useEffect(() => {
    fetch('/api/monitors')
      .then((res) => res.json())
      .then((data) => setMonitors(data))
      .catch((err) => console.error('Failed to load monitors', err))
      .finally(() => setLoading(false));
  }, []);

  const deleteMonitor = async (id: string) => {
    if (!confirm('Delete this monitor?')) return;
    try {
      const res = await fetch(`/api/monitors/${id}`, { method: 'DELETE' });
      if (res.ok) setMonitors((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Delete failed', err);
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
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Monitor</span>
        </Button>
      </div>

      {monitors.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground mb-4">No monitors yet. Add one to get started.</p>
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> Add Monitor
          </Button>
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
                        className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${
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
                    <Button variant="ghost" size="sm" className="gap-2">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive"
                      onClick={() => deleteMonitor(monitor.id)}
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
    </div>
  );
}
