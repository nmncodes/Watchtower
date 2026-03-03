'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Lock, CreditCard, Trash2, Key, Bell, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export default function SettingsPage() {
  const [email, setEmail] = useState('user@example.com');
  const [notifications, setNotifications] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const apiKey = 'pk_live_1234567890abcdef';

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
              <label className="text-sm font-medium block mb-2">Email Address</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Account Created</label>
              <Input type="text" value="January 15, 2024" disabled />
            </div>
            <Button>Save Changes</Button>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notifications
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email Alerts</p>
                <p className="text-sm text-muted-foreground">Receive alerts when services go down</p>
              </div>
              <input
                type="checkbox"
                checked={notifications}
                onChange={(e) => setNotifications(e.target.checked)}
                className="w-5 h-5 accent-primary"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Slack Integration</p>
                <p className="text-sm text-muted-foreground">Send notifications to Slack</p>
              </div>
              <Button variant="outline" size="sm">
                Connect
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">SMS Alerts</p>
                <p className="text-sm text-muted-foreground">Get SMS for critical incidents</p>
              </div>
              <Button variant="outline" size="sm">
                Configure
              </Button>
            </div>
          </div>
        </Card>

        {/* API Keys */}
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Keys
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Manage API keys for programmatic access to Watchtower</p>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  readOnly
                  className="pr-12"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? 'Hide' : 'Show'}
              </Button>
              <Button variant="outline">Copy</Button>
            </div>
            <Button variant="outline" className="w-full">
              Generate New Key
            </Button>
          </div>
        </Card>

        {/* Team */}
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Team
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="font-medium">user@example.com</p>
                <p className="text-sm text-muted-foreground">Owner</p>
              </div>
            </div>
            <Button variant="outline" className="w-full">
              Invite Team Member
            </Button>
          </div>
        </Card>

        {/* Billing */}
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Billing
          </h2>
          <div className="space-y-4">
            <div>
              <p className="font-medium mb-2">Current Plan: Professional</p>
              <p className="text-sm text-muted-foreground mb-4">$29/month - Renews on March 15, 2024</p>
            </div>
            <Button variant="outline">Manage Subscription</Button>
            <Button variant="outline">Download Invoice</Button>
          </div>
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
            <Button variant="outline" className="w-full">
              Enable Two-Factor Authentication
            </Button>
            <Button variant="outline" className="w-full">
              View Active Sessions
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
    </div>
  );
}
