'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, TrendingUp, AlertCircle, Loader2, Play, Pause, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';

interface Check {
  id: string;
  status: string;
  responseTime: number;
  code: number | null;
  createdAt: string;
}

interface IncidentTimeline {
  id: string;
  status: string;
  message: string;
  createdAt: string;
}

interface Incident {
  id: string;
  status: string;
  summary: string | null;
  startedAt: string;
  resolvedAt: string | null;
  timeline: IncidentTimeline[];
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
  checks: Check[];
  incidents: Incident[];
}

export default function MonitorDetailPage() {
  const params = useParams<{ id: string }>();
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [checking, setChecking] = useState(false);

  const fetchMonitor = () => {
    fetch(`/api/monitors/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Monitor not found');
        return res.json();
      })
      .then((data) => setMonitor(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMonitor();
  }, [params.id]);

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/monitors/${params.id}/check`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Check failed');
      }
      toast.success('Check completed');
      fetchMonitor(); // refresh data
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setChecking(false);
    }
  };

  const handleTogglePause = async () => {
    if (!monitor) return;
    const newStatus = monitor.status === 'PAUSED' ? 'UP' : 'PAUSED';
    try {
      const res = await fetch(`/api/monitors/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      toast.success(newStatus === 'PAUSED' ? 'Monitor paused' : 'Monitor resumed');
      fetchMonitor();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !monitor) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive text-lg font-medium mb-4">{error ?? 'Monitor not found'}</p>
        <Link href="/dashboard/monitors">
          <Button variant="outline">Back to Monitors</Button>
        </Link>
      </div>
    );
  }

  const statusLabel = monitor.status.toLowerCase();
  const isUp = statusLabel === 'up';

  // Build chart data from real checks
  const chartData = monitor.checks
    .slice()
    .reverse()
    .map((c) => ({
      time: format(new Date(c.createdAt), 'HH:mm'),
      value: c.responseTime,
    }));

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <Link href="/dashboard/monitors">
          <Button variant="ghost" size="sm" className="gap-2 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Monitors
          </Button>
        </Link>
        <h1 className="text-3xl font-bold mb-2">{monitor.name}</h1>
        <div className="flex items-center gap-3">
          <p className="text-muted-foreground">{monitor.url}</p>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={handleCheckNow}
            disabled={checking || monitor.status === 'PAUSED'}
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Check Now
          </Button>
          <Button
            size="sm"
            variant={monitor.status === 'PAUSED' ? 'default' : 'outline'}
            className="gap-2"
            onClick={handleTogglePause}
          >
            {monitor.status === 'PAUSED' ? (
              <><Play className="w-4 h-4" /> Resume</>
            ) : (
              <><Pause className="w-4 h-4" /> Pause</>
            )}
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-1">Current Status</p>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isUp ? 'bg-green-600' : 'bg-red-600'}`} />
            <p className="text-2xl font-bold capitalize">{statusLabel}</p>
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-1">Region</p>
          <p className="text-2xl font-bold">{monitor.region}</p>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-1">Check Interval</p>
          <p className="text-2xl font-bold">{monitor.interval}s</p>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-1">Last Check</p>
          <p className="text-2xl font-bold">
            {monitor.lastCheckAt
              ? formatDistanceToNow(new Date(monitor.lastCheckAt), { addSuffix: true })
              : 'Never'}
          </p>
        </Card>
      </div>

      <div className="space-y-6">
        {/* Response Time Chart */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Response Time
            </h2>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="time" stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.5rem',
                  }}
                  labelStyle={{ color: 'var(--foreground)' }}
                  formatter={(value: number) => `${value}ms`}
                />
                <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No check data yet</p>
          )}
        </Card>

        {/* Incidents for this monitor */}
        <Card className="p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Recent Incidents
          </h2>
          {monitor.incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No incidents recorded</p>
          ) : (
            <div className="space-y-3">
              {monitor.incidents.map((incident) => (
                <div key={incident.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 ${
                      incident.status === 'RESOLVED' ? 'bg-green-600' : 'bg-red-600'
                    }`}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{incident.summary ?? `Incident ${incident.id.slice(0, 8)}`}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {incident.status.toLowerCase()} &middot;{' '}
                      {formatDistanceToNow(new Date(incident.startedAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
