'use client';

import { Card } from '@/components/ui/card';
import { CheckCircle2, XCircle, AlertCircle, TrendingUp, Calendar } from 'lucide-react';

export default function StatusPage() {
  const monitors = [
    { name: 'API Server', status: 'up', uptime: 99.98, lastIncident: '25 days ago' },
    { name: 'Web App', status: 'up', uptime: 99.95, lastIncident: '18 days ago' },
    { name: 'Database', status: 'up', uptime: 99.92, lastIncident: '12 days ago' },
    { name: 'CDN', status: 'up', uptime: 100, lastIncident: 'Never' },
  ];

  const recentIncidents = [
    {
      title: 'Database Performance Degradation',
      status: 'resolved',
      startTime: '2024-02-28 14:30',
      endTime: '2024-02-28 14:55',
      duration: '25 minutes',
      affectedServices: ['Database'],
    },
    {
      title: 'API Server Restart',
      status: 'resolved',
      startTime: '2024-02-27 08:15',
      endTime: '2024-02-27 08:18',
      duration: '3 minutes',
      affectedServices: ['API Server'],
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      case 'degraded':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'up':
        return <CheckCircle2 className={`w-5 h-5 ${getStatusColor(status)}`} />;
      case 'down':
        return <XCircle className={`w-5 h-5 ${getStatusColor(status)}`} />;
      default:
        return <AlertCircle className={`w-5 h-5 ${getStatusColor(status)}`} />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold">P</span>
            </div>
            <h1 className="text-3xl font-bold">Watchtower Status</h1>
          </div>
          <p className="text-muted-foreground">Real-time status of all services</p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Overall Status */}
        <Card className="p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-4 h-4 rounded-full bg-green-600" />
            <div className="flex-1">
              <h2 className="text-2xl font-bold">All Systems Operational</h2>
              <p className="text-muted-foreground">As of 2 minutes ago</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-green-600">99.96%</p>
              <p className="text-xs text-muted-foreground">Uptime (30d)</p>
            </div>
          </div>
        </Card>

        {/* Monitors */}
        <div className="mb-8">
          <h3 className="font-semibold text-lg mb-4">Service Status</h3>
          <div className="space-y-3">
            {monitors.map((monitor) => (
              <Card key={monitor.name} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {getStatusIcon(monitor.status)}
                  <div>
                    <p className="font-medium">{monitor.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {monitor.status === 'up' ? 'Operational' : 'Offline'} • {monitor.uptime}% uptime
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Last incident: {monitor.lastIncident}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* 90-Day Stats */}
        <Card className="p-6 mb-8">
          <h3 className="font-semibold mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            90-Day Uptime Summary
          </h3>
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { name: 'API Server', uptime: 99.98 },
              { name: 'Web App', uptime: 99.95 },
              { name: 'Database', uptime: 99.92 },
              { name: 'CDN', uptime: 100 },
            ].map((item) => (
              <div key={item.name} className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-1">{item.name}</p>
                <p className="text-2xl font-bold">{item.uptime}%</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Incidents */}
        <div>
          <h3 className="font-semibold text-lg mb-4">Recent Incidents</h3>
          <div className="space-y-4">
            {recentIncidents.map((incident, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start gap-4">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium mb-1">{incident.title}</h4>
                    <p className="text-sm text-muted-foreground mb-2">{incident.duration} of downtime</p>
                    <div className="flex flex-wrap gap-2">
                      {incident.affectedServices.map((service) => (
                        <span key={service} className="text-xs px-2 py-1 bg-muted rounded">
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {incident.startTime}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Check for updates on <a href="#" className="text-primary hover:underline">Twitter</a> • 
            <a href="#" className="text-primary hover:underline"> Subscribe to updates</a>
          </p>
        </div>
      </div>
    </div>
  );
}
