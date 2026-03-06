'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface StatusPageInfo {
  id: string;
  slug: string;
  title: string;
  description: string | null;
}

export default function StatusIndex() {
  const [pages, setPages] = useState<StatusPageInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/status-pages')
      .then((r) => (r.ok ? r.json() : []))
      .then(setPages)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold">W</span>
            </div>
            <h1 className="text-3xl font-bold">Watchtower Status</h1>
          </div>
          <p className="text-muted-foreground">Public status pages</p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {pages.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No public status pages available.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {pages.map((p) => (
              <Link key={p.id} href={`/status/${p.slug}`}>
                <Card className="p-5 hover:bg-muted/50 transition cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{p.title}</h3>
                      {p.description && (
                        <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">/status/{p.slug}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">Powered by Watchtower</p>
        </div>
      </div>
    </div>
  );
}
