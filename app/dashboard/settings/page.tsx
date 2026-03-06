'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Lock, Trash2, Globe, Plus, Pencil, ExternalLink, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { StatusPageDialog } from '@/components/status-page-dialog';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
import { toast } from 'sonner';
import Link from 'next/link';

interface Monitor {
  id: string;
  name: string;
}

interface StatusPageItem {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  monitorIds: string[];
  isPublic: boolean;
  createdAt: string;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [statusPages, setStatusPages] = useState<StatusPageItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<StatusPageItem | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<StatusPageItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [m, sp] = await Promise.all([
        fetch('/api/monitors').then((r) => r.json()),
        fetch('/api/status-pages').then((r) => r.json()),
      ]);
      setMonitors(Array.isArray(m) ? m : []);
      setStatusPages(Array.isArray(sp) ? sp : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = () => {
    setEditingPage(undefined);
    setDialogOpen(true);
  };

  const handleEdit = (page: StatusPageItem) => {
    setEditingPage(page);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/status-pages/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Status page deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete status page');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <div className="space-y-8">
        {/* Profile Section */}
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Profile
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">Name</label>
              <Input type="text" value={session?.user?.name ?? ''} disabled />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Email Address</label>
              <Input type="email" value={session?.user?.email ?? ''} disabled />
            </div>
          </div>
        </Card>

        {/* Status Pages */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Status Pages
            </h2>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : statusPages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No status pages yet. Create one to share your service status publicly.
            </p>
          ) : (
            <div className="space-y-3">
              {statusPages.map((page) => (
                <div
                  key={page.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{page.title}</p>
                    <p className="text-xs text-muted-foreground">
                      /status/{page.slug} &middot;{' '}
                      {page.isPublic ? 'Public' : 'Private'} &middot;{' '}
                      {page.monitorIds.length} monitor{page.monitorIds.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Link href={`/status/${page.slug}`} target="_blank">
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(page)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(page)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Security */}
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Security
          </h2>
          <div className="space-y-4">
            <Button variant="outline" className="w-full">
              Change Password
            </Button>
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="p-6 border-destructive">
          <h2 className="font-semibold text-lg mb-4 text-destructive flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Danger Zone
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              These actions are irreversible. Please be careful.
            </p>
            <Button variant="destructive" className="w-full">
              Delete Account
            </Button>
          </div>
        </Card>
      </div>

      {/* Status Page Dialog */}
      <StatusPageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchData}
        monitors={monitors}
        initial={editingPage}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Status Page"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? This cannot be undone.`}
        loading={deleting}
      />
    </div>
  );
}
