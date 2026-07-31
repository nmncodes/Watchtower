'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ArrowRight, Check, Moon, Sun, Activity, Bell, BarChart3, Clock, TrendingUp, Users } from 'lucide-react';

export default function Home() {
  const { resolvedTheme, setTheme } = useTheme();
  const { status } = useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  const features = [
    { title: 'Real-time Monitoring', description: 'Check your endpoints every minute and get instant alerts when issues occur.', icon: Activity },
    { title: 'Incident Management', description: 'Track, manage, and communicate incidents with your team and customers in one place.', icon: Bell },
    { title: 'Uptime Visualization', description: 'See 90-day uptime trends with beautiful charts and detailed analytics.', icon: TrendingUp },

  ];

  const FAQs = [
    {question : "How quickly can I get started?" , answer:"Add an endpoint, choose an alert channel, and Watchtower starts monitoring immediately"  } ,
    { question: "What happens when my monitor goes down?" , answer: "When a monitor goes down, Watchtower automatically creates an incident and sends notifications to all your configured channels(email, SMS) with details about the downtime. "} , 
    {question : "Which alert channels are supported?" , answer: "Watchtower supports email and webhooks notifications."  } ,
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">

      <nav className="fixed top-0 w-full bg-background/80 backdrop-blur-lg border-b border-border/60 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                <img draggable={false} src={isDark ? '/newtowerr.png' : '/watchtowerr.png'} alt="Watchtower" />
              </div>
              <span className="font-semibold text-lg tracking-tight">Watchtower</span>
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition">Features</a>
            <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition">FAQs</a>

          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="p-2 rounded-lg hover:bg-accent transition"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {status === 'authenticated' ? (
              <Button
                variant="link"
                size="sm"
                onClick={() => signOut({ callbackUrl: '/' })}
              >
                Log out
              </Button>
            ) : (
              <Link href="/auth/login">
                <Button variant="link" size="sm">Sign in</Button>
              </Link>
            )}
            <Link href="/dashboard">
              <Button  variant={'link'} size='sm' className='text-bold' >Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>


      <section className="pt-36 pb-24 px-6">
        <div className="max-w-3xl mx-auto">

          <h1 className="text-5xl sm:text-6xl lg:text-7xl  tracking-tight leading-[1.08] mb-6">
            Know when
            <br />
            things{' '}
            <span className="font-bold text-minor break-trigger cursor-default">
              <span className="word-break-effect" aria-label="break">
                <span className="word-break-core">break</span>
                <span className="word-break-fragment-top" aria-hidden="true">
                  break
                </span>
                <span className="word-break-fragment-bottom" aria-hidden="true">
                  break
                </span>
              </span>
              .
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-xl mb-10">
            Watchtower monitors your services around the clock, sends instant alerts, and keeps your customers informed with public status pages.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard">
              <Button  variant={'link'} size="lg" className="gap-2 h-12 px-6">
                Start Monitoring <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="#features">
              <Button size="lg" variant={'link'} className="h-12 px-6">
                Features 
              </Button>
            </Link>
          </div>
        </div>
      </section>


      <section id="features" className="py-24 px-6 border-t border-border/40">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-16">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Everything you need to stay online
            </h2>
            <p className="text-muted-foreground text-lg">
              From endpoint checks to incident management, Watchtower handles the hard parts so you can focus on building.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <Card key={i} className="p-6 hover:shadow-md transition-shadow group">
                  <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>
      

      <section id="faq" className="py-24 px-6 border-t border-border/40 bg-accent/5">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground text-lg">
              Everything you need to know about Watchtower.
            </p>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {FAQs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left font-medium py-4">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-4">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>





      <section className="py-24 px-6 border-t border-border/40">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Ready to get started?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join teams that trust Watchtower to keep their services running.
          </p>
          <Link href="/dashboard">
            <Button size="lg" className="h-12 px-8 gap-2">
              Dashboard  <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>


      <footer className="py-8 px-6 border-t border-border/40">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded flex items-center justify-center">
              <img draggable={false} src={isDark ? '/newtowerr.png' : '/watchtowerr.png'} alt="Watchtower" />
            </div>
            <span className="font-medium text-sm">Watchtower</span>
          </div>
          <p className="text-xs text-muted-foreground">&copy; <small>(obviously not copyrighted, havent filled my form XIV yet)</small> 2026 Watchtower. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
