'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Monitor {
  id: string;
  name: string;
  url: string;
  status: string;
}

interface Incident {
  id: string;
  status: string;
  summary: string | null;
  startedAt: string;
  resolvedAt: string | null;
  monitor: { id: string; name: string };
}

interface PageData {
  title: string;
  description: string | null;
  slug: string;
  monitors: Monitor[];
  incidents: Incident[];
}

export default function PublicStatusPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/status-pages/public/${slug}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json();
          throw new Error(d.error || 'Not found');
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Status Page Not Found</h1>
          <p className="text-muted-foreground">{error || 'This page does not exist.'}</p>
        </div>
      </div>
    );
  }

  const allUp = data.monitors.length > 0 && data.monitors.every((m) => m.status === 'UP');

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold">{data.title}</h1>
          {data.description && (
            <p className="text-muted-foreground mt-2">{data.description}</p>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Overall Status */}
        <Card className="p-6 mb-8">
          <div className="flex items-center gap-4">
            <div
              className={`w-4 h-4 rounded-full ${allUp ? 'bg-green-600' : 'bg-red-600'}`}
            />
            <div className="flex-1">
              <h2 className="text-2xl font-bold">
                {data.monitors.length === 0
                  ? 'No Services Configured'
                  : allUp
                  ? 'All Systems Operational'
                  : 'Some Systems Affected'}
              </h2>
              <p className="text-muted-foreground">
                {data.monitors.length} service{data.monitors.length !== 1 ? 's' : ''} monitored
              </p>
            </div>
          </div>
        </Card>

        {/* Monitors */}
        {data.monitors.length > 0 && (
          <div className="mb-8">
            <h3 className="font-semibold text-lg mb-4">Service Status</h3>
            <div className="space-y-3">
              {data.monitors.map((monitor) => {
                const label = monitor.status.toLowerCase();
                return (
                  <Card key={monitor.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {label === 'up' ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : label === 'down' ? (
                        <XCircle className="w-5 h-5 text-red-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-yellow-600" />
                      )}
                      <div>
                        <p className="font-medium">{monitor.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {label === 'up' ? 'Operational' : label}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Incidents */}
        <div>
          <h3 className="font-semibold text-lg mb-4">Recent Incidents</h3>
          {data.incidents.length === 0 ? (
            <Card className="p-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No recent incidents</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {data.incidents.map((incident) => (
                <Card key={incident.id} className="p-4">
                  <div className="flex items-start gap-4">
                    {incident.status === 'RESOLVED' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">
                        {incident.summary ?? `Incident on ${incident.monitor.name}`}
                      </h4>
                      <p className="text-sm text-muted-foreground capitalize">
                        {incident.status.toLowerCase()} &middot; {incident.monitor.name}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(incident.startedAt).toLocaleDateString()}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">Powered by Watchtower</p>
        </div>
      </div>
    </div>
  );
}
