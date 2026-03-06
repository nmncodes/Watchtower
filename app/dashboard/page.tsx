'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle2, AlertCircle, TrendingUp, ArrowRight, Plus, Bell, Share2, Loader2, Clock, Percent } from 'lucide-react';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';

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
  lastCheckAt: string | null;
  checks: CheckData[];
}

interface Incident {
  id: string;
  status: string;
  summary: string | null;
  startedAt: string;
  monitor: { id: string; name: string };
}

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width={80} height={28}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke="var(--primary)" strokeWidth={1.5} fill="url(#sparkGrad)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function computeUptime(checks: CheckData[]): number {
  if (checks.length === 0) return 100;
  const upCount = checks.filter((c) => c.status === 'UP').length;
  return Math.round((upCount / checks.length) * 10000) / 100;
}

function computeAvgResponseTime(checks: CheckData[]): number {
  if (checks.length === 0) return 0;
  const sum = checks.reduce((acc, c) => acc + c.responseTime, 0);
  return Math.round(sum / checks.length);
}

export default function Dashboard() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/monitors').then((r) => r.json()),
      fetch('/api/incidents').then((r) => r.json()),
    ])
      .then(([m, i]) => {
        setMonitors(m);
        setIncidents(i);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const upCount = monitors.filter((m) => m.status === 'UP').length;
  const recentIncidents = incidents.filter((i) => i.status !== 'RESOLVED').slice(0, 5);

  // Aggregate uptime across all monitors
  const allChecks = useMemo(() => monitors.flatMap((m) => m.checks), [monitors]);
  const overallUptime = computeUptime(allChecks);
  const avgResponseTime = computeAvgResponseTime(allChecks);

  // Build aggregate chart: group checks by 5-minute buckets across all monitors
  const aggregateChartData = useMemo(() => {
    const checks = monitors.flatMap((m) => m.checks);
    if (checks.length === 0) return [];
    const buckets = new Map<number, { sum: number; count: number }>();
    const BUCKET_MS = 5 * 60 * 1000; // 5-minute buckets
    for (const c of checks) {
      const ts = Math.floor(new Date(c.createdAt).getTime() / BUCKET_MS) * BUCKET_MS;
      const b = buckets.get(ts);
      if (b) { b.sum += c.responseTime; b.count++; }
      else { buckets.set(ts, { sum: c.responseTime, count: 1 }); }
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, { sum, count }]) => ({
        time: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        avg: Math.round(sum / count),
      }));
  }, [monitors]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here&apos;s your monitoring overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Active Monitors</p>
              <p className="text-3xl font-bold">{monitors.length}</p>
            </div>
            <Activity className="w-8 h-8 text-primary opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">All Up</p>
              <p className="text-3xl font-bold text-green-600">
                {upCount}/{monitors.length}
              </p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-green-600 opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Uptime</p>
              <p className={`text-3xl font-bold ${overallUptime >= 99 ? 'text-green-600' : overallUptime >= 95 ? 'text-yellow-600' : 'text-red-600'}`}>
                {overallUptime}%
              </p>
            </div>
            <Percent className="w-8 h-8 text-green-600 opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Avg Response</p>
              <p className="text-3xl font-bold">{avgResponseTime}<span className="text-base font-normal text-muted-foreground">ms</span></p>
            </div>
            <Clock className="w-8 h-8 text-blue-600 opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Open Incidents</p>
              <p className="text-3xl font-bold">{recentIncidents.length}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-600 opacity-20" />
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Aggregate Response Time Chart */}
          <Card className="p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Response Time (All Monitors)
            </h2>
            {aggregateChartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={aggregateChartData}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `${v}ms`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                    }}
                    labelStyle={{ color: 'var(--foreground)' }}
                    formatter={(value: number) => [`${value}ms`, 'Avg Response']}
                  />
                  <Area type="monotone" dataKey="avg" stroke="var(--primary)" strokeWidth={2} fill="url(#areaGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">
                Run some checks to see response time trends
              </p>
            )}
          </Card>

          {/* Monitors List with Sparklines */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Monitors</h2>
              <Link href="/dashboard/monitors">
                <Button variant="ghost" size="sm" className="gap-2">
                  View All <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
            {monitors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No monitors yet</p>
            ) : (
              <div className="space-y-2">
                {monitors.map((monitor) => {
                  const uptime = computeUptime(monitor.checks);
                  const avgRt = computeAvgResponseTime(monitor.checks);
                  const sparkData = monitor.checks
                    .slice()
                    .reverse()
                    .map((c) => c.responseTime);
                  return (
                    <Link key={monitor.id} href={`/dashboard/monitors/${monitor.id}`}>
                      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-3 h-3 rounded-full shrink-0 ${monitor.status === 'UP' ? 'bg-green-600' : monitor.status === 'DOWN' ? 'bg-red-600' : monitor.status === 'DEGRADED' ? 'bg-yellow-600' : 'bg-gray-400'}`} />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{monitor.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{monitor.url}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <MiniSparkline data={sparkData} />
                          <div className="text-right">
                            <p className={`text-sm font-semibold ${uptime >= 99 ? 'text-green-600' : uptime >= 95 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {uptime}%
                            </p>
                            <p className="text-xs text-muted-foreground">{avgRt}ms</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Link href="/dashboard/monitors">
                <Button variant="outline" className="w-full justify-start">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Monitor
                </Button>
              </Link>
              <Link href="/dashboard/settings">
                <Button variant="outline" className="w-full justify-start">
                  <Bell className="w-4 h-4 mr-2" />
                  Configure Alerts
                </Button>
              </Link>
              <Link href="/dashboard/settings">
                <Button variant="outline" className="w-full justify-start">
                  <Share2 className="w-4 h-4 mr-2" />
                  Status Pages
                </Button>
              </Link>
            </div>
          </Card>

          {/* Recent Incidents */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Recent Incidents</h3>
              <Link href="/dashboard/incidents">
                <Button variant="ghost" size="sm" className="gap-2">
                  View All <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
            {recentIncidents.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">No open incidents</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentIncidents.map((inc) => (
                  <div key={inc.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{inc.summary ?? inc.monitor.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {inc.status.toLowerCase()} &middot; {formatDistanceToNow(new Date(inc.startedAt), { addSuffix: true })}
                      </p>
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
