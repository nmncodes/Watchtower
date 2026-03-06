'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { CreateIncidentDialog } from '@/components/create-incident-dialog';

interface TimelineEntry {
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
  monitor: { id: string; name: string };
  timeline: TimelineEntry[];
}

interface MonitorOption {
  id: string;
  name: string;
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/incidents').then((r) => r.json()),
      fetch('/api/monitors').then((r) => r.json()),
    ])
      .then(([incidentData, monitorData]) => {
        setIncidents(incidentData);
        setMonitors(monitorData.map((m: any) => ({ id: m.id, name: m.name })));
      })
      .catch((err) => console.error('Failed to load data', err))
      .finally(() => setLoading(false));
  }, []);

  const severityFromStatus = (status: string) => {
    switch (status) {
      case 'INVESTIGATING':
        return 'critical';
      case 'IDENTIFIED':
        return 'high';
      case 'MONITORING':
        return 'medium';
      case 'RESOLVED':
        return 'low';
      default:
        return 'low';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50 dark:bg-red-950';
      case 'high':
        return 'text-orange-600 bg-orange-50 dark:bg-orange-950';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950';
      case 'low':
        return 'text-blue-600 bg-blue-50 dark:bg-blue-950';
      default:
        return 'text-gray-600 bg-gray-50';
    }
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
          <h1 className="text-3xl font-bold mb-2">Incidents</h1>
          <p className="text-muted-foreground">Track and manage service incidents</p>
        </div>
        <CreateIncidentDialog
          monitors={monitors}
          onCreated={(inc) => setIncidents((prev) => [inc, ...prev])}
        />
      </div>

      {incidents.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No incidents recorded yet.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {incidents.map((incident) => {
            const severity = severityFromStatus(incident.status);
            const isResolved = incident.status === 'RESOLVED';
            const duration =
              incident.resolvedAt
                ? formatDistanceToNow(new Date(incident.startedAt))
                : 'Ongoing';

            return (
              <Card key={incident.id} className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <AlertTriangle className="w-5 h-5" />
                      <h2 className="text-xl font-semibold">
                        {incident.summary ?? `Incident on ${incident.monitor.name}`}
                      </h2>
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${getSeverityColor(severity)}`}
                      >
                        {incident.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {format(new Date(incident.startedAt), 'yyyy-MM-dd HH:mm')}
                      </span>
                      {incident.resolvedAt && (
                        <>
                          <span>→</span>
                          <span>{format(new Date(incident.resolvedAt), 'yyyy-MM-dd HH:mm')}</span>
                        </>
                      )}
                      <span className="px-2 py-1 bg-muted rounded">{duration}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isResolved && (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-sm font-medium">Resolved</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Affected Services */}
                <div className="mb-4">
                  <p className="text-sm font-medium mb-2">Affected Service</p>
                  <span className="px-3 py-1 bg-destructive/10 text-destructive rounded-full text-xs">
                    {incident.monitor.name}
                  </span>
                </div>

                {/* Timeline */}
                {incident.timeline.length > 0 && (
                  <div className="border-t border-border pt-4">
                    <p className="text-sm font-medium mb-4">Incident Timeline</p>
                    <div className="space-y-3">
                      {incident.timeline.map((entry) => (
                        <div key={entry.id} className="flex gap-4">
                          <div className="text-xs text-muted-foreground whitespace-nowrap pt-1">
                            {format(new Date(entry.createdAt), 'HH:mm')}
                          </div>
                          <div className="flex-1">
                            <div className="w-2 h-2 rounded-full bg-primary mb-1" />
                            <p className="text-sm">{entry.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
