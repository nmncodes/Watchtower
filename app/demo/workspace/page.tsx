'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, Shield } from 'lucide-react';
import { CreateMonitorDialog } from '@/components/create-monitor-dialog';

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
  checks: CheckData[];
}

function computeUptime(checks?: CheckData[]): number {
  if (!Array.isArray(checks) || checks.length === 0) return 100;
  const upCount = checks.filter((c) => c.status === 'UP').length;
  return Math.round((upCount / checks.length) * 10000) / 100;
}

export default function DemoWorkspacePage() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);

  const prependMonitor = (monitor: Monitor) => {
    setMonitors((prev) => (prev.some((m) => m.id === monitor.id) ? prev : [monitor, ...prev]));
  };

  const fetchMonitors = () => {
    fetch('/api/monitors')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMonitors(data);
        } else {
          setMonitors([]);
        }
      })
      .catch(() => setMonitors([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMonitors();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border/70 bg-muted/30">
        <div className="max-w-5xl mx-auto p-3 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium">
            <Shield className="w-3.5 h-3.5" />
            Demo mode
          </div>
          <div className="text-xs text-muted-foreground">
            Full demo access enabled. Demo monitors auto-delete after 15 minutes.
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Demo Workspace</h1>
            <p className="text-muted-foreground">
              You can do anything here. Only rule: max 2 monitors, each expires after 15 minutes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {monitors.length < 2 ? (
              <CreateMonitorDialog onCreated={prependMonitor} />
            ) : (
              <Button disabled>
                Limit reached (2/2)
              </Button>
            )}
            <Link href="/auth/register">
              <Button variant="outline">Create account</Button>
            </Link>
          </div>
        </div>

        <Card className="p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            Demo limits: {monitors.length}/2 monitors used • 15-minute auto-delete
          </div>
          <Link href="/api/demo/exit?next=/">
            <Button variant="ghost" size="sm">Exit demo</Button>
          </Link>
        </Card>

        <p className="text-sm text-muted-foreground mb-4">
          Click any monitor to open full metrics, response charts, recent checks, and controls.
        </p>

        {monitors.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-muted-foreground mb-4">No demo monitors yet.</p>
            {monitors.length < 2 ? (
              <CreateMonitorDialog onCreated={prependMonitor} />
            ) : (
              <Button disabled>
                Limit reached (2/2)
              </Button>
            )}
          </Card>
        ) : (
          <div className="space-y-3">
            {monitors.map((monitor) => {
              const uptime = computeUptime(monitor.checks);
              return (
                <Link key={monitor.id} href={`/dashboard/monitors/${monitor.id}`}>
                  <Card className="p-5 hover:bg-muted/40 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{monitor.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{monitor.url}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{monitor.status}</p>
                        <p className="text-xs text-muted-foreground">{uptime}% uptime</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-sm text-muted-foreground">
          Want to keep monitors forever?
          <Link href="/auth/register" className="inline-flex items-center gap-1 ml-1 text-foreground hover:underline">
            Create an account <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
