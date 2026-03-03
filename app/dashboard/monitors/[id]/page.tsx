'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const responseTimeData24h = [
  { time: '12:00', value: 145 },
  { time: '1:00', value: 152 },
  { time: '2:00', value: 148 },
  { time: '3:00', value: 156 },
  { time: '4:00', value: 143 },
  { time: '5:00', value: 150 },
  { time: '6:00', value: 147 },
  { time: '7:00', value: 154 },
  { time: '8:00', value: 149 },
  { time: '9:00', value: 152 },
  { time: '10:00', value: 146 },
  { time: '11:00', value: 151 },
];

const responseTimeData7d = [
  { day: 'Mon', value: 148 },
  { day: 'Tue', value: 152 },
  { day: 'Wed', value: 145 },
  { day: 'Thu', value: 156 },
  { day: 'Fri', value: 143 },
  { day: 'Sat', value: 150 },
  { day: 'Sun', value: 147 },
];

const responseTimeData30d = [
  { day: '1', value: 150 },
  { day: '5', value: 148 },
  { day: '10', value: 152 },
  { day: '15', value: 145 },
  { day: '20', value: 156 },
  { day: '25', value: 143 },
  { day: '30', value: 151 },
];

const uptimeCalendar = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  uptime: Math.random() > 0.02 ? 100 : 99.5,
}));

export default function MonitorDetailPage() {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');

  const getChartData = () => {
    switch (timeRange) {
      case '7d':
        return responseTimeData7d;
      case '30d':
        return responseTimeData30d;
      default:
        return responseTimeData24h;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <Link href="/dashboard/monitors">
          <Button variant="ghost" size="sm" className="gap-2 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Monitors
          </Button>
        </Link>
        <h1 className="text-3xl font-bold mb-2">API Server</h1>
        <p className="text-muted-foreground">https://api.example.com</p>
      </div>

      {/* Status Overview */}
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-1">Current Status</p>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-600" />
            <p className="text-2xl font-bold">Online</p>
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-1">Uptime (90d)</p>
          <p className="text-2xl font-bold">99.98%</p>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-1">Response Time</p>
          <p className="text-2xl font-bold">145ms</p>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-1">Last Check</p>
          <p className="text-2xl font-bold">2 min ago</p>
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
            <div className="flex gap-2">
              {(['24h', '7d', '30d'] as const).map((range) => (
                <Button
                  key={range}
                  variant={timeRange === range ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange(range)}
                >
                  {range}
                </Button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={getChartData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey={timeRange === '24h' ? 'time' : 'day'} stroke="var(--muted-foreground)" />
              <YAxis stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                }}
                labelStyle={{ color: 'var(--foreground)' }}
                formatter={(value) => `${value}ms`}
              />
              <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Uptime Calendar */}
        <Card className="p-6">
          <h2 className="font-semibold mb-6 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            30-Day Uptime Calendar
          </h2>
          <div className="grid grid-cols-10 gap-2">
            {uptimeCalendar.map((day) => (
              <div
                key={day.day}
                className={`aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition ${
                  day.uptime === 100
                    ? 'bg-green-500/20 text-green-600 hover:bg-green-500/30'
                    : 'bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/30'
                }`}
                title={`Day ${day.day}: ${day.uptime}%`}
              >
                {day.day}
              </div>
            ))}
          </div>
        </Card>

        {/* Events Log */}
        <Card className="p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Recent Events
          </h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3 pb-3 border-b border-border">
              <div className="w-2 h-2 rounded-full bg-green-600 mt-1.5" />
              <div className="flex-1">
                <p className="font-medium">Service is back online</p>
                <p className="text-sm text-muted-foreground">2 hours ago</p>
              </div>
            </div>
            <div className="flex items-start gap-3 pb-3 border-b border-border">
              <div className="w-2 h-2 rounded-full bg-red-600 mt-1.5" />
              <div className="flex-1">
                <p className="font-medium">Service went offline - Response timeout</p>
                <p className="text-sm text-muted-foreground">2 hours 15 min ago</p>
              </div>
            </div>
            <div className="flex items-start gap-3 pb-3 border-b border-border">
              <div className="w-2 h-2 rounded-full bg-yellow-600 mt-1.5" />
              <div className="flex-1">
                <p className="font-medium">High response time detected - 456ms</p>
                <p className="text-sm text-muted-foreground">5 hours ago</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-green-600 mt-1.5" />
              <div className="flex-1">
                <p className="font-medium">Service check started</p>
                <p className="text-sm text-muted-foreground">12 hours ago</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
