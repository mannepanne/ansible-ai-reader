import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Mail,
  Users,
  MousePointerClick,
  Clock,
  LogOut,
  ArrowLeft,
  Trash2,
  Download,
  Globe,
  Eye,
  UserCheck,
  ArrowRightLeft,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

const ADMIN_EMAIL = "magnus.hultberg@gmail.com";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (email.toLowerCase() !== ADMIN_EMAIL) {
      setError("Access restricted.");
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (authError) {
      setError("Invalid credentials.");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <h1 className="font-serif text-2xl font-medium mb-2 text-center">
          Admin Access
        </h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Sign in to view analytics.
        </p>
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11"
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back to site
          </Link>
        </div>
      </div>
    </div>
  );
}

interface EmailCapture {
  id: string;
  email: string;
  source: string;
  created_at: string;
}

interface DemoSession {
  id: string;
  session_id: string;
  email: string | null;
  started_at: string;
  last_active_at: string;
  total_events: number;
}

interface EventCount {
  event_type: string;
  count: number;
}

interface PageEvent {
  id: string;
  visitor_id: string;
  session_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: string;
}

function formatDuration(startedAt: string, lastActiveAt: string): string {
  const ms =
    new Date(lastActiveAt).getTime() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60)
    return `${minutes}m ${remainingSeconds > 0 ? remainingSeconds + "s" : ""}`.trim();
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Dashboard() {
  const [emails, setEmails] = useState<EmailCapture[]>([]);
  const [sessions, setSessions] = useState<DemoSession[]>([]);
  const [eventCounts, setEventCounts] = useState<EventCount[]>([]);
  const [pageEvents, setPageEvents] = useState<PageEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    const [emailRes, sessionRes, eventRes, pageEventRes] = await Promise.all([
      supabase
        .from("email_captures")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("demo_sessions")
        .select("*")
        .order("started_at", { ascending: false }),
      supabase.from("demo_events").select("event_type"),
      supabase
        .from("page_events")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (emailRes.data) setEmails(emailRes.data);
    if (sessionRes.data) setSessions(sessionRes.data);
    if (pageEventRes.data) setPageEvents(pageEventRes.data);

    // Count events by type
    if (eventRes.data) {
      const counts: Record<string, number> = {};
      eventRes.data.forEach((e: { event_type: string }) => {
        counts[e.event_type] = (counts[e.event_type] || 0) + 1;
      });
      setEventCounts(
        Object.entries(counts)
          .map(([event_type, count]) => ({ event_type, count }))
          .sort((a, b) => b.count - a.count)
      );
    }

    setLoading(false);
  };

  const handleDeleteEmail = async (id: string, email: string) => {
    if (!window.confirm(`Delete all data for ${email}? This removes the email capture and any associated demo events.`)) return;
    await Promise.all([
      supabase.from("email_captures").delete().eq("id", id),
      supabase.from("demo_events").delete().eq("email", email),
      supabase.from("demo_sessions").delete().eq("email", email),
    ]);
    loadData();
  };

  const handleExportUser = async (email: string) => {
    const [emailRes, eventsRes, sessionsRes] = await Promise.all([
      supabase.from("email_captures").select("*").eq("email", email),
      supabase.from("demo_events").select("*").eq("email", email).order("created_at", { ascending: true }),
      supabase.from("demo_sessions").select("*").eq("email", email).order("started_at", { ascending: true }),
    ]);

    const lines: string[] = [];
    lines.push("SECTION,FIELD,VALUE");

    // Email capture data
    (emailRes.data || []).forEach((row) => {
      lines.push(`Email Capture,email,"${row.email}"`);
      lines.push(`Email Capture,source,"${row.source}"`);
      lines.push(`Email Capture,consented,"${row.consented}"`);
      lines.push(`Email Capture,consented_at,"${row.consented_at || ""}"`);
      lines.push(`Email Capture,created_at,"${row.created_at}"`);
    });

    // Session data
    (sessionsRes.data || []).forEach((row, i) => {
      const label = `Session ${i + 1}`;
      lines.push(`${label},session_id,"${row.session_id}"`);
      lines.push(`${label},started_at,"${row.started_at}"`);
      lines.push(`${label},last_active_at,"${row.last_active_at}"`);
      lines.push(`${label},total_events,"${row.total_events}"`);
    });

    // Event data
    if ((eventsRes.data || []).length > 0) {
      lines.push("");
      lines.push("EVENT_TYPE,EVENT_DATA,CREATED_AT,SESSION_ID");
      (eventsRes.data || []).forEach((row) => {
        const data = JSON.stringify(row.event_data || {}).replace(/"/g, '""');
        lines.push(`"${row.event_type}","${data}","${row.created_at}","${row.session_id}"`);
      });
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `user-data-${email.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const totalEvents = eventCounts.reduce((sum, e) => sum + e.count, 0);
  const avgEngagement =
    sessions.length > 0
      ? Math.round(
          sessions.reduce((sum, s) => {
            const ms =
              new Date(s.last_active_at).getTime() -
              new Date(s.started_at).getTime();
            return sum + ms;
          }, 0) /
            sessions.length /
            1000
        )
      : 0;

  const formatAvgTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s > 0 ? s + "s" : ""}`.trim();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-serif text-xl font-medium">
              Ansible Analytics
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={loadData}>
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="gap-1.5"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <Tabs defaultValue="landing" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="landing" className="gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Landing Page
            </TabsTrigger>
            <TabsTrigger value="demo" className="gap-1.5">
              <MousePointerClick className="h-3.5 w-3.5" /> Demo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="landing">
            <LandingAnalytics pageEvents={pageEvents} />
          </TabsContent>

          <TabsContent value="demo">
        {/* Stats overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={Mail}
            label="Email signups"
            value={emails.length}
          />
          <StatCard
            icon={Users}
            label="Demo sessions"
            value={sessions.length}
          />
          <StatCard
            icon={MousePointerClick}
            label="Total interactions"
            value={totalEvents}
          />
          <StatCard
            icon={Clock}
            label="Avg engagement"
            value={formatAvgTime(avgEngagement)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Email captures */}
          <div className="rounded-xl border bg-card p-6">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email Captures
            </h2>
            {emails.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No email signups yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {emails.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between text-sm py-2 border-b border-border/50 last:border-0 group"
                  >
                    <div>
                      <span className="font-medium">{e.email}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        via {e.source}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(e.created_at)}
                      </span>
                      <button
                        onClick={() => handleExportUser(e.email)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
                        title="Export this user's data"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEmail(e.id, e.email)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        title="Delete this user's data"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Event breakdown */}
          <div className="rounded-xl border bg-card p-6">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
              Engagement Breakdown
            </h2>
            {eventCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No engagement events yet.
              </p>
            ) : (
              <div className="space-y-3">
                {eventCounts.map((e) => {
                  const maxCount = eventCounts[0].count;
                  const pct = Math.round((e.count / maxCount) * 100);
                  return (
                    <div key={e.event_type}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="capitalize">
                          {e.event_type.replace(/_/g, " ")}
                        </span>
                        <span className="font-medium">{e.count}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sessions table */}
        <div className="rounded-xl border bg-card p-6 mt-6">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Demo Sessions
          </h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No demo sessions yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Started</th>
                    <th className="pb-3 font-medium">Duration</th>
                    <th className="pb-3 font-medium text-right">
                      Events
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-3">
                        {s.email || (
                          <span className="text-muted-foreground italic">
                            anonymous
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {formatDate(s.started_at)}
                      </td>
                      <td className="py-3">
                        {formatDuration(s.started_at, s.last_active_at)}
                      </td>
                      <td className="py-3 text-right font-medium">
                        {s.total_events}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function LandingAnalytics({ pageEvents }: { pageEvents: PageEvent[] }) {
  // Unique sessions (by session_id)
  const uniqueSessions = new Set(pageEvents.map((e) => e.session_id));

  // Landing page views
  const landingViews = pageEvents.filter((e) => e.event_type === "landing_page_view");
  const totalVisits = landingViews.length;
  const uniqueVisitCount = new Set(landingViews.map((e) => e.visitor_id)).size;

  // Privacy page views
  const privacyViews = pageEvents.filter((e) => e.event_type === "privacy_page_view").length;

  // Nav clicks breakdown
  const navClicks = pageEvents.filter((e) => e.event_type === "nav_click");
  const navBreakdown: Record<string, number> = {};
  navClicks.forEach((e) => {
    const target = (e.event_data?.target as string) || "unknown";
    navBreakdown[target] = (navBreakdown[target] || 0) + 1;
  });

  // Demo signups from page events
  const demoSignups = pageEvents.filter((e) => e.event_type === "demo_signup");
  const totalSignups = demoSignups.length;
  const uniqueSignupVisitors = new Set(demoSignups.map((e) => e.visitor_id)).size;

  // Signup source breakdown
  const signupsBySource: Record<string, number> = {};
  demoSignups.forEach((e) => {
    const source = (e.event_data?.source as string) || "unknown";
    signupsBySource[source] = (signupsBySource[source] || 0) + 1;
  });

  const navLabels: Record<string, string> = {
    features: "Features",
    "how-it-works": "How it works",
    "try-demo": "Try the demo (nav)",
  };

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Eye} label="Total visits" value={totalVisits} />
        <StatCard icon={UserCheck} label="Unique visitors" value={uniqueVisitCount} />
        <StatCard icon={Globe} label="Privacy page views" value={privacyViews} />
        <StatCard icon={Users} label="Total sessions" value={uniqueSessions.size} />
      </div>

      {/* Conversion stats */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          Conversion
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Total visits → demo signup</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{totalSignups}</span>
              <span className="text-sm text-muted-foreground">
                / {totalVisits} visits
                {totalVisits > 0 && ` (${Math.round((totalSignups / totalVisits) * 100)}%)`}
              </span>
            </div>
            {Object.keys(signupsBySource).length > 0 && (
              <div className="mt-2 space-y-1">
                {Object.entries(signupsBySource).map(([source, count]) => (
                  <p key={source} className="text-xs text-muted-foreground">
                    via {source}: {count}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Unique visitors → demo signup</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{uniqueSignupVisitors}</span>
              <span className="text-sm text-muted-foreground">
                / {uniqueVisitCount} visitors
                {uniqueVisitCount > 0 && ` (${Math.round((uniqueSignupVisitors / uniqueVisitCount) * 100)}%)`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Nav engagement */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          Navigation Clicks
        </h2>
        {Object.keys(navBreakdown).length === 0 ? (
          <p className="text-sm text-muted-foreground">No navigation clicks yet.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(navBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([target, count]) => {
                const maxCount = Math.max(...Object.values(navBreakdown));
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={target}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{navLabels[target] || target}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/70 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && user.email === ADMIN_EMAIL) {
        setUser(user);
      }
      setChecking(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      if (u && u.email === ADMIN_EMAIL) {
        setUser(u);
      } else {
        setUser(null);
      }
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Checking access...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return <Dashboard />;
}
