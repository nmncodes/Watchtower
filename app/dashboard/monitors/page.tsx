'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, Eye } from 'lucide-react';
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

const uptime90Day = [
  { day: '1', uptime: 100 },
  { day: '2', uptime: 100 },
  { day: '3', uptime: 99.9 },
  { day: '4', uptime: 100 },
  { day: '5', uptime: 99.8 },
  { day: '6', uptime: 100 },
  { day: '7', uptime: 100 },
  { day: '8', uptime: 99.95 },
  { day: '9', uptime: 100 },
  { day: '10', uptime: 100 },
];

export default function MonitorsPage() {
  const [monitors, setMonitors] = useState([
    {
      id: 1,
      name: 'API Server',
      url: 'https://api.example.com',
      status: 'up',
      uptime90: 99.98,
      responseTime: 145,
      lastCheck: '2 min ago',
    },
    {
      id: 2,
      name: 'Web App',
      url: 'https://app.example.com',
      status: 'up',
      uptime90: 99.95,
      responseTime: 234,
      lastCheck: '1 min ago',
    },
    {
      id: 3,
      name: 'Database',
      url: 'https://db.example.com',
      status: 'up',
      uptime90: 99.92,
      responseTime: 89,
      lastCheck: '3 min ago',
    },
    {
      id: 4,
      name: 'CDN',
      url: 'https://cdn.example.com',
      status: 'up',
      uptime90: 100,
      responseTime: 45,
      lastCheck: 'now',
    },
  ]);

  const deleteMonitor = (id: number) => {
    setMonitors(monitors.filter((m) => m.id !== id));
  };

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

      {/* Monitors Grid */}
      <div className="space-y-4">
        {monitors.map((monitor) => (
          <Card key={monitor.id} className="p-6 hover:shadow-md transition">
            <div className="grid md:grid-cols-5 gap-6 items-start mb-6">
              {/* Monitor Info */}
              <div className="md:col-span-2">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${
                      monitor.status === 'up' ? 'bg-green-600' : 'bg-red-600'
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
                  <p className="text-xs text-muted-foreground mb-1">90-Day Uptime</p>
                  <p className="text-2xl font-bold">{monitor.uptime90}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Avg Response</p>
                  <p className="text-2xl font-bold">{monitor.responseTime}ms</p>
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

            {/* Chart */}
            <div className="pt-6 border-t border-border">
              <p className="text-sm font-medium mb-3">90-Day Uptime Trend</p>
              <ResponsiveContainer width="100%" height={120}>
                <ComposedChart data={uptime90Day}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis domain={[99, 100.1]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.5rem',
                    }}
                    formatter={(value) => `${value.toFixed(2)}%`}
                  />
                  <Bar dataKey="uptime" fill="var(--primary)" opacity={0.6} radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 text-xs text-muted-foreground">Last checked: {monitor.lastCheck}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
