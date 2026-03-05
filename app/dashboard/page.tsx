'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle2, AlertCircle, TrendingUp, ArrowRight, Plus, Bell, Share2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Monitor {
  id: string;
  name: string;
  url: string;
  status: string;
  lastCheckAt: string | null;
}

interface Incident {
  id: string;
  status: string;
  summary: string | null;
  startedAt: string;
  monitor: { id: string; name: string };
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
        <p className="text-muted-foreground">Welcome back! Here's your monitoring overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-4 gap-4 mb-8">
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
              <p className="text-sm text-muted-foreground mb-1">Open Incidents</p>
              <p className="text-3xl font-bold">{recentIncidents.length}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-600 opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Incidents</p>
              <p className="text-3xl font-bold">{incidents.length}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-muted-foreground opacity-20" />
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Response Time Chart */}
          <Card className="p-6">
            <h2 className="font-semibold mb-4">Response Time (24h)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={responseTimeData}>
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
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Monitors List */}
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
              <div className="space-y-3">
                {monitors.map((monitor) => (
                  <Link key={monitor.id} href={`/dashboard/monitors/${monitor.id}`}>
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${monitor.status === 'UP' ? 'bg-green-600' : monitor.status === 'DOWN' ? 'bg-red-600' : 'bg-gray-400'}`} />
                        <div>
                          <p className="font-medium">{monitor.name}</p>
                          <p className="text-sm text-muted-foreground capitalize">{monitor.status.toLowerCase()}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
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
              <Button variant="outline" className="w-full justify-start">
                <Bell className="w-4 h-4 mr-2" />
                Configure Alerts
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Share2 className="w-4 h-4 mr-2" />
                Share Status Page
              </Button>
            </div>
          </Card>

          {/* Recent Incidents */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Recent Incidents</h3>
            {recentIncidents.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">No open incidents</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentIncidents.map((inc) => (
                  <div key={inc.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">{inc.summary ?? inc.monitor.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{inc.status.toLowerCase()}</p>
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
