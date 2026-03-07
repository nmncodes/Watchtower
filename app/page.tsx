'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowRight, Check, Moon, Sun } from 'lucide-react';

export default function Home() {
  const [isDark, setIsDark] = useState(false);

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-background text-foreground">
        {/* Navigation */}
        <nav className="fixed top-0 w-full bg-background/80 backdrop-blur-md border-b border-border z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">P</span>
              </div>
              <span className="font-bold text-xl">Watchtower</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm hover:text-primary transition">Features</a>
              <a href="#pricing" className="text-sm hover:text-primary transition">Pricing</a>
              <a href="#" className="text-sm hover:text-primary transition">Docs</a>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsDark(!isDark)}
                className="p-2 hover:bg-muted rounded-lg transition"
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <Link href="/dashboard">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block mb-4 px-4 py-2 bg-primary/10 rounded-full border border-primary/20">
              <span className="text-sm font-medium text-primary">Monitor your uptime in real-time</span>
            </div>
            <h1 className="text-5xl sm:text-6xl font-bold mb-6 text-balance">
              Never Miss a Downtime Again
            </h1>
            <p className="text-xl text-muted-foreground mb-8 text-balance max-w-2xl mx-auto">
              Watchtower monitors your services 24/7, sends instant alerts, and keeps your customers informed with beautiful status pages.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/dashboard">
                <Button size="lg" className="gap-2">
                  Start Monitoring <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Button size="lg" variant="outline">
                View Demo
              </Button>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold mb-4">Powerful Monitoring Features</h2>
              <p className="text-lg text-muted-foreground">Everything you need to keep your services online</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  title: 'Real-time Monitoring',
                  description: 'Check your endpoints every minute and get instant alerts when issues occur.',
                  icon: '📊',
                },
                {
                  title: 'Status Pages',
                  description: 'Beautiful, customizable status pages that build customer trust and reduce support tickets.',
                  icon: '📱',
                },
                {
                  title: 'Incident Management',
                  description: 'Track, manage, and communicate incidents with your team and customers in one place.',
                  icon: '🚨',
                },
                {
                  title: 'Response Time Tracking',
                  description: 'Monitor response times across different time periods to catch performance regressions.',
                  icon: '⏱️',
                },
                {
                  title: 'Uptime Visualization',
                  description: 'See 90-day uptime trends with beautiful charts and detailed analytics.',
                  icon: '📈',
                },
                {
                  title: 'Team Collaboration',
                  description: 'Invite team members, manage incidents together, and share status pages.',
                  icon: '👥',
                },
              ].map((feature, i) => (
                <Card key={i} className="p-6 hover:shadow-lg transition">
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
              <p className="text-lg text-muted-foreground">Start free, upgrade as you grow</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  name: 'Starter',
                  price: '₹0',
                  period: 'Forever',
                  description: 'Perfect for testing',
                  features: [
                    '5 monitors',
                    '5 minute check interval',
                    'Basic status page',
                    'Email notifications',
                    '7-day history',
                  ],
                  cta: 'Get Started',
                  highlighted: false,
                },
                {
                  name: 'Professional',
                  price: '₹100',
                  period: '/month',
                  description: 'For growing teams',
                  features: [
                    '50 monitors',
                    '1 minute check interval',
                    'Advanced status page',
                    'SMS & Slack notifications',
                    '90-day history',
                    'Incident management',
                    '5 team members',
                  ],
                  cta: 'Start Free Trial',
                  highlighted: true,
                },
                {
                  name: 'Enterprise',
                  price: '₹150',
                  period: '/month',
                  description: 'For large organizations',
                  features: [
                    'Unlimited monitors',
                    '30 second check interval',
                    'White-label status pages',
                    'All notifications',
                    'Unlimited history',
                    'Priority support',
                    'Custom integrations',
                  ],
                  cta: 'Contact Sales',
                  highlighted: false,
                },
              ].map((plan, i) => (
                <Card
                  key={i}
                  className={`p-8 relative transition ${
                    plan.highlighted ? 'ring-2 ring-primary shadow-lg' : ''
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                      <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                        MOST POPULAR
                      </span>
                    </div>
                  )}
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-muted-foreground text-sm mb-4">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">
                      {' '}
                      {plan.period}
                    </span>
                  </div>
                  <Button
                    className="w-full mb-8"
                    variant={plan.highlighted ? 'default' : 'outline'}
                  >
                    {plan.cta}
                  </Button>
                  <ul className="space-y-3">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-center gap-3 text-sm">
                        <Check className="w-4 h-4 text-green-600" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-primary text-primary-foreground">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold mb-4">Ready to get started?</h2>
            <p className="text-lg mb-8 opacity-90">
              Join hundreds of teams that trust Watchtower to monitor their services.
            </p>
            <Link href="/dashboard">
              <Button size="lg" variant="secondary">
                Start Your Free Trial <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">P</span>
              </div>
              <span className="font-semibold">Watchtower</span>
            </div>
            <p className="text-sm text-muted-foreground">© 2026 Watchtower. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
