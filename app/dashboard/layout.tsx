'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Menu, X, Moon, Sun, LogOut, BarChart3, AlertCircle, Settings, Home, User } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  const isActive = (path: string) => pathname === path;

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: Home },
    { label: 'Monitors', path: '/dashboard/monitors', icon: BarChart3 },
    { label: 'Incidents', path: '/dashboard/incidents', icon: AlertCircle },
    { label: 'Settings', path: '/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
        {/* Top Navigation */}
        <nav className="fixed top-0 w-full bg-background/80 backdrop-blur-lg border-b border-border/60 z-40">
          <div className="h-14 px-4 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden p-2 hover:bg-accent rounded-lg transition"
              >
                {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
              <Link href="/dashboard" className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center">
                  <img
                    draggable={false}
                    src={isDark ? '/newtowerr.png' : '/watchtowerr.png'}
                    alt="Watchtower"
                  />
                </div>
                <span className="font-semibold text-base tracking-tight hidden sm:inline">Watchtower</span>
              </Link>
            </div>

            <div className="flex items-center gap-3">
              {session?.user && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {session.user.name || session.user.email}
                </span>
              )}
              <button
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className="p-2 hover:bg-accent rounded-lg transition"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => signOut({ callbackUrl: '/auth/login' })}
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">Sign Out</span>
              </Button>
            </div>
          </div>
        </nav>

        {/* Sidebar */}
        <aside
          className={`fixed left-0 top-14 h-[calc(100vh-56px)] w-56 bg-sidebar border-r border-sidebar-border transform transition-transform duration-200 z-30 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <nav className="p-3 space-y-1 mt-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.path} href={item.path}>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                      isActive(item.path)
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="pt-14 md:pl-56">
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 md:hidden z-20"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          {children}
        </main>
    </div>
  );
}
