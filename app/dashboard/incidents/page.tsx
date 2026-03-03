'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle, Clock, CheckCircle2, X } from 'lucide-react';

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState([
    {
      id: 1,
      title: 'Database Performance Degradation',
      status: 'resolved',
      severity: 'medium',
      affectedServices: ['Database'],
      startTime: '2024-02-28 14:30',
      endTime: '2024-02-28 14:55',
      duration: '25 minutes',
      description: 'Database was experiencing slow queries, affecting API response times.',
      updates: [
        { time: '14:55', message: 'Issue resolved. Database performance back to normal.' },
        { time: '14:40', message: 'Root cause identified. Running optimization queries.' },
        { time: '14:30', message: 'Alert triggered for high database latency.' },
      ],
    },
    {
      id: 2,
      title: 'API Server Restart',
      status: 'resolved',
      severity: 'low',
      affectedServices: ['API Server'],
      startTime: '2024-02-27 08:15',
      endTime: '2024-02-27 08:18',
      duration: '3 minutes',
      description: 'Scheduled maintenance restart of API server.',
      updates: [
        { time: '08:18', message: 'Server is back online.' },
        { time: '08:15', message: 'Starting scheduled maintenance.' },
      ],
    },
  ]);

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

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Incidents</h1>
          <p className="text-muted-foreground">Track and manage service incidents</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Report Incident</span>
        </Button>
      </div>

      {/* Incidents List */}
      <div className="space-y-6">
        {incidents.map((incident) => (
          <Card key={incident.id} className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <AlertTriangle className="w-5 h-5" />
                  <h2 className="text-xl font-semibold">{incident.title}</h2>
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${getSeverityColor(incident.severity)}`}
                  >
                    {incident.severity.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {incident.startTime}
                  </span>
                  <span>→</span>
                  <span>{incident.endTime}</span>
                  <span className="px-2 py-1 bg-muted rounded">{incident.duration}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {incident.status === 'resolved' && (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-medium">Resolved</span>
                  </div>
                )}
              </div>
            </div>

            {/* Affected Services */}
            <div className="mb-4">
              <p className="text-sm font-medium mb-2">Affected Services</p>
              <div className="flex gap-2">
                {incident.affectedServices.map((service) => (
                  <span key={service} className="px-3 py-1 bg-destructive/10 text-destructive rounded-full text-xs">
                    {service}
                  </span>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="mb-4 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm">{incident.description}</p>
            </div>

            {/* Timeline */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium mb-4">Incident Timeline</p>
              <div className="space-y-3">
                {incident.updates.map((update, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="text-xs text-muted-foreground whitespace-nowrap pt-1">{update.time}</div>
                    <div className="flex-1">
                      <div className="w-2 h-2 rounded-full bg-primary mb-1" />
                      <p className="text-sm">{update.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
