'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, TrendingUp, AlertCircle, Loader2, Play, Pause, RefreshCw,
  Clock, Percent, ArrowDown, ArrowUp, Minus,
} from 'lucide-react';
import Link from 'next/link';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';

interface Check {
  id: string;
  status: string;
  responseTime: number;
  code: number | null;
  createdAt: string;
  regionResults?: RegionResult[];
}

interface RegionResult {
  region: string;
  status: string;
  responseTime: number;
  code: number | null;
  errorType?: string;
  createdAt?: string;
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

type TimeRange = '24h' | '7d' | '30d';

function computeUptime(checks: Check[]): number {
  if (checks.length === 0) return 100;
  const upCount = checks.filter((c) => c.status === 'UP').length;
  return Math.round((upCount / checks.length) * 10000) / 100;
}

function computeStats(checks: Check[]) {
  if (checks.length === 0) return { avg: 0, min: 0, max: 0, p95: 0 };
  const times = checks.map((c) => c.responseTime).sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const p95idx = Math.floor(times.length * 0.95);
  return {
    avg: Math.round(sum / times.length),
    min: times[0],
    max: times[times.length - 1],
    p95: times[Math.min(p95idx, times.length - 1)],
  };
}

export default function MonitorDetailPage() {
  const params = useParams<{ id: string }>();
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [checking, setChecking] = useState(false);

  const fetchMonitor = useCallback((range: TimeRange) => {
    fetch(`/api/monitors/${params.id}?range=${range}`)
      .then((res) => {
        if (!res.ok) throw new Error('Monitor not found');
        return res.json();
      })
      .then((data) => setMonitor(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    fetchMonitor(timeRange);

    // Auto-refresh based on monitor interval (or every 15s as fallback)
    const pollMs = monitor?.interval ? Math.max(monitor.interval * 1000, 10_000) : 15_000;
    const interval = setInterval(() => fetchMonitor(timeRange), pollMs);
    return () => clearInterval(interval);
  }, [params.id, timeRange, fetchMonitor, monitor?.interval]);

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/monitors/${params.id}/check`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Check failed');
      }
      toast.success('Check completed');
      fetchMonitor(timeRange);
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
      fetchMonitor(timeRange);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const stats = useMemo(() => (monitor ? computeStats(monitor.checks) : { avg: 0, min: 0, max: 0, p95: 0 }), [monitor]);
  const uptime = useMemo(() => (monitor ? computeUptime(monitor.checks) : 100), [monitor]);
  const latestRegionResults = useMemo(
    () => monitor?.checks?.[0]?.regionResults ?? [],
    [monitor]
  );

  // Build chart data — reversed to chronological order
  const chartData = useMemo(() => {
    if (!monitor) return [];
    const fmt = timeRange === '24h' ? 'HH:mm' : timeRange === '7d' ? 'EEE HH:mm' : 'MMM dd';
    return monitor.checks
      .slice()
      .reverse()
      .map((c) => ({
        time: format(new Date(c.createdAt), fmt),
        value: c.responseTime,
        status: c.status,
      }));
  }, [monitor, timeRange]);

  // Uptime bar data: last 30 time slots
  const uptimeBar = useMemo(() => {
    if (!monitor || monitor.checks.length === 0) return [];
    const checks = monitor.checks.slice().reverse();
    const slotSize = Math.max(1, Math.floor(checks.length / 30));
    const slots: { status: 'up' | 'down' | 'degraded' }[] = [];
    for (let i = 0; i < checks.length; i += slotSize) {
      const slice = checks.slice(i, i + slotSize);
      const hasDown = slice.some((c) => c.status === 'DOWN');
      const hasDegraded = slice.some((c) => c.status === 'DEGRADED');
      slots.push({ status: hasDown ? 'down' : hasDegraded ? 'degraded' : 'up' });
    }
    return slots.slice(0, 30);
  }, [monitor]);

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
  const statusColor = statusLabel === 'up' ? 'bg-green-600' : statusLabel === 'down' ? 'bg-red-600' : statusLabel === 'degraded' ? 'bg-yellow-600' : 'bg-gray-400';

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <Link href="/dashboard/monitors">
          <Button variant="ghost" size="sm" className="gap-2 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Monitors
          </Button>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className={`w-3 h-3 rounded-full ${statusColor}`} />
              <h1 className="text-3xl font-bold">{monitor.name}</h1>
            </div>
            <p className="text-muted-foreground">{monitor.url}</p>
          </div>
          <div className="flex gap-2">
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
      </div>

      {/* Uptime Bar */}
      {uptimeBar.length > 0 && (
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground">Uptime</h2>
            <span className={`text-2xl font-bold ${uptime >= 99 ? 'text-green-600' : uptime >= 95 ? 'text-yellow-600' : 'text-red-600'}`}>
              {uptime}%
            </span>
          </div>
          <div className="flex gap-0.5">
            {uptimeBar.map((slot, i) => (
              <div
                key={i}
                className={`flex-1 h-8 rounded-sm ${
                  slot.status === 'up' ? 'bg-green-500' : slot.status === 'down' ? 'bg-red-500' : 'bg-yellow-500'
                }`}
                title={slot.status}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted-foreground">
              {timeRange === '24h' ? '24 hours ago' : timeRange === '7d' ? '7 days ago' : '30 days ago'}
            </span>
            <span className="text-xs text-muted-foreground">Now</span>
          </div>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Status</p>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
            <p className="text-lg font-bold capitalize">{statusLabel}</p>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Avg Response</p>
          <p className="text-lg font-bold">{stats.avg}<span className="text-sm font-normal text-muted-foreground">ms</span></p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Min / Max</p>
          <p className="text-lg font-bold">
            <span className="text-green-600">{stats.min}</span>
            <span className="text-muted-foreground font-normal mx-1">/</span>
            <span className="text-red-600">{stats.max}</span>
            <span className="text-sm font-normal text-muted-foreground">ms</span>
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">P95</p>
          <p className="text-lg font-bold">{stats.p95}<span className="text-sm font-normal text-muted-foreground">ms</span></p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Probe Regions</p>
          <p className="text-lg font-bold">{latestRegionResults.length || 1}</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Last Check</p>
          <p className="text-sm font-bold">
            {monitor.lastCheckAt
              ? formatDistanceToNow(new Date(monitor.lastCheckAt), { addSuffix: true })
              : 'Never'}
          </p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Response Time Chart */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Response Time
              </h2>
              <div className="flex gap-1">
                {(['24h', '7d', '30d'] as TimeRange[]).map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant={timeRange === r ? 'default' : 'ghost'}
                    onClick={() => { setLoading(true); setTimeRange(r); }}
                    className="text-xs px-3"
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="responseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={11} interval="preserveStartEnd" />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${v}ms`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                    }}
                    labelStyle={{ color: 'var(--foreground)' }}
                    formatter={(value: number) => [`${value}ms`, 'Response Time']}
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="url(#responseGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">
                {chartData.length === 1 ? 'Need at least 2 checks to draw a chart' : 'No check data in this time range'}
              </p>
            )}
          </Card>

          {/* Recent Checks Table */}
          {monitor.checks.length > 0 && (
            <Card className="p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Recent Checks
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2 font-medium">Time</th>
                      <th className="text-left py-2 font-medium">Status</th>
                      <th className="text-right py-2 font-medium">Response</th>
                      <th className="text-right py-2 font-medium">HTTP Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitor.checks.slice(0, 20).map((check) => (
                      <tr key={check.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2">{format(new Date(check.createdAt), 'MMM dd, HH:mm:ss')}</td>
                        <td className="py-2">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                            check.status === 'UP' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                            check.status === 'DOWN' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}>
                            {check.status === 'UP' ? <ArrowUp className="w-3 h-3" /> : check.status === 'DOWN' ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                            {check.status}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono">{check.responseTime}ms</td>
                        <td className="py-2 text-right font-mono text-muted-foreground">{check.code ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {monitor.checks.length > 20 && (
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Showing 20 of {monitor.checks.length} checks
                </p>
              )}
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Monitor Info */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Monitor Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Check Interval</span>
                <span className="font-medium">{monitor.interval}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Checks</span>
                <span className="font-medium">{monitor.checks.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">{format(new Date(monitor.createdAt), 'MMM dd, yyyy')}</span>
              </div>
            </div>
          </Card>

          {latestRegionResults.length > 0 && (
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Regional Results (Latest Check)</h3>
              <div className="space-y-2">
                {latestRegionResults.map((result) => {
                  const label = result.status.toLowerCase();
                  const tone =
                    label === 'up'
                      ? 'text-green-600'
                      : label === 'down'
                        ? 'text-red-600'
                        : 'text-yellow-600';

                  return (
                    <div
                      key={`${result.region}-${result.createdAt ?? ''}`}
                      className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{result.region}</p>
                        <p className="text-xs text-muted-foreground">
                          {result.responseTime}ms {result.code ? `• HTTP ${result.code}` : ''}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold uppercase ${tone}`}>
                        {result.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Incidents */}
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
                  <div key={incident.id} className="pb-3 border-b border-border last:border-0">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          incident.status === 'RESOLVED' ? 'bg-green-600' : 'bg-red-600'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{incident.summary ?? `Incident ${incident.id.slice(0, 8)}`}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {incident.status.toLowerCase()} &middot;{' '}
                          {formatDistanceToNow(new Date(incident.startedAt), { addSuffix: true })}
                        </p>
                        {incident.resolvedAt && (
                          <p className="text-xs text-green-600 mt-0.5">
                            Resolved {formatDistanceToNow(new Date(incident.resolvedAt), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
