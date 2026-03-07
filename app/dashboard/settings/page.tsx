'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Lock, Trash2, Globe, Plus, Pencil, ExternalLink, Loader2, Bell, Webhook, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { StatusPageDialog } from '@/components/status-page-dialog';
import { NotificationChannelDialog } from '@/components/notification-channel-dialog';
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

interface NotificationChannel {
  id: string;
  name: string;
  type: 'EMAIL' | 'WEBHOOK';
  target: string;
  enabled: boolean;
  createdAt: string;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [statusPages, setStatusPages] = useState<StatusPageItem[]>([]);
  const [notifChannels, setNotifChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<StatusPageItem | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<StatusPageItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Notification channel dialog state
  const [notifDialogOpen, setNotifDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | undefined>();
  const [deleteNotifTarget, setDeleteNotifTarget] = useState<NotificationChannel | null>(null);
  const [deletingNotif, setDeletingNotif] = useState(false);
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [m, sp, nc] = await Promise.all([
        fetch('/api/monitors').then((r) => r.json()),
        fetch('/api/status-pages').then((r) => r.json()),
        fetch('/api/notification-channels').then((r) => r.json()),
      ]);
      setMonitors(Array.isArray(m) ? m : []);
      setStatusPages(Array.isArray(sp) ? sp : []);
      setNotifChannels(Array.isArray(nc) ? nc : []);
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

  const handleToggleChannel = async (channel: NotificationChannel) => {
    try {
      const res = await fetch(`/api/notification-channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !channel.enabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      fetchData();
    } catch {
      toast.error('Failed to toggle channel');
    }
  };

  const handleDeleteChannel = async () => {
    if (!deleteNotifTarget) return;
    setDeletingNotif(true);
    try {
      const res = await fetch(`/api/notification-channels/${deleteNotifTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Channel deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete channel');
    } finally {
      setDeletingNotif(false);
      setDeleteNotifTarget(null);
    }
  };

  const handleTestChannel = async (channel: NotificationChannel) => {
    setTestingChannelId(channel.id);
    try {
      const res = await fetch(`/api/notification-channels/${channel.id}/test`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send test');
      }
      toast.success('Test notification sent! Check your inbox.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTestingChannelId(null);
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

        {/* Notification Channels */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notification Channels
            </h2>
            <Button
              size="sm"
              onClick={() => {
                setEditingChannel(undefined);
                setNotifDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifChannels.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No notification channels configured. Add one to receive alerts when monitors go down or recover.
            </p>
          ) : (
            <div className="space-y-3">
              {notifChannels.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {ch.type === 'EMAIL' ? (
                        <Mail className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Webhook className="w-4 h-4 text-muted-foreground" />
                      )}
                      <p className="font-medium truncate">{ch.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground truncate ml-6">
                      {ch.target}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Send test notification"
                      disabled={testingChannelId === ch.id}
                      onClick={() => handleTestChannel(ch)}
                    >
                      {testingChannelId === ch.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                    <Switch
                      checked={ch.enabled}
                      onCheckedChange={() => handleToggleChannel(ch)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingChannel(ch);
                        setNotifDialogOpen(true);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteNotifTarget(ch)}
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

      {/* Notification Channel Dialog */}
      <NotificationChannelDialog
        open={notifDialogOpen}
        onOpenChange={setNotifDialogOpen}
        onSuccess={fetchData}
        initial={editingChannel}
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

      {/* Delete Channel Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteNotifTarget}
        onOpenChange={(open) => !open && setDeleteNotifTarget(null)}
        onConfirm={handleDeleteChannel}
        title="Delete Channel"
        description={`Are you sure you want to delete "${deleteNotifTarget?.name}"? You will stop receiving notifications through this channel.`}
        loading={deletingNotif}
      />
    </div>
  );
}
