'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle2, AlertCircle, TrendingUp, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const responseTimeData = [
  { time: '12:00', value: 145 },
  { time: '1:00', value: 152 },
  { time: '2:00', value: 148 },
  { time: '3:00', value: 156 },
  { time: '4:00', value: 143 },
  { time: '5:00', value: 150 },
  { time: '6:00', value: 147 },
  { time: '7:00', value: 154 },
];

export default function Dashboard() {
  const monitors = [
    { id: 1, name: 'API Server', status: 'up', uptime: 99.98, lastCheck: '2 min ago' },
    { id: 2, name: 'Web App', status: 'up', uptime: 99.95, lastCheck: '1 min ago' },
    { id: 3, name: 'Database', status: 'up', uptime: 99.92, lastCheck: '3 min ago' },
    { id: 4, name: 'CDN', status: 'up', uptime: 100, lastCheck: 'now' },
  ];

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
              <p className="text-3xl font-bold">4</p>
            </div>
            <Activity className="w-8 h-8 text-primary opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">All Up</p>
              <p className="text-3xl font-bold text-green-600">4/4</p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-green-600 opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Avg Uptime</p>
              <p className="text-3xl font-bold">99.96%</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-600 opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Incidents (30d)</p>
              <p className="text-3xl font-bold">0</p>
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
            <div className="space-y-3">
              {monitors.map((monitor) => (
                <div key={monitor.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${monitor.status === 'up' ? 'bg-green-600' : 'bg-red-600'}`} />
                    <div>
                      <p className="font-medium">{monitor.name}</p>
                      <p className="text-sm text-muted-foreground">{monitor.uptime}% uptime</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">{monitor.lastCheck}</p>
                  </div>
                </div>
              ))}
            </div>
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
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No incidents in the last 30 days</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { Plus, Bell, Share2 } from 'lucide-react';
