// ABOUT: Public marketing landing page for Ansible
// ABOUT: Email capture gate to demo, product preview, features, and footer with login link

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  captureEmail,
  setSessionEmail,
  getStoredEmail,
  usePageTracking,
} from '@/hooks/useTracking';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Zap,
  MessageSquareWarning,
  Search,
  ArrowRight,
  BookOpen,
  Filter,
  Clock,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Archive,
  StickyNote,
} from 'lucide-react';

// ============================================================================
// Noise field background animation
// ============================================================================

function NoiseField() {
  const particles = useMemo(() => {
    const items: {
      x: number;
      y: number;
      size: number;
      opacity: number;
      delay: number;
      duration: number;
    }[] = [];
    for (let i = 0; i < 500; i++) {
      const weightedY = Math.pow(Math.random(), 2.5);
      const opacity = 0.06 + (1 - weightedY) * 0.55;
      const size = 3 + Math.random() * 3.5;
      items.push({
        x: Math.random() * 100,
        y: weightedY * 100,
        size,
        opacity,
        delay: Math.random() * 3,
        duration: 3 + Math.random() * 4,
      });
    }
    return items;
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <style>{`
        @keyframes noiseDrift {
          0%, 100% { transform: translateY(0px); opacity: var(--p-opacity); }
          50% { transform: translateY(-14px); opacity: calc(var(--p-opacity) * 0.3); }
        }
      `}</style>
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-[1px] bg-blue-400"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            ['--p-opacity' as string]: p.opacity,
            opacity: p.opacity,
            animation: `noiseDrift ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-white to-transparent" />
    </div>
  );
}

// ============================================================================
// Navbar
// ============================================================================

function Navbar({
  trackPageEvent,
}: {
  trackPageEvent: (type: string, data?: Record<string, unknown>) => void;
}) {
  const router = useRouter();

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleTryDemo = () => {
    trackPageEvent('nav_click', { target: 'try-demo' });
    if (getStoredEmail()) {
      router.push('/demo');
    } else {
      scrollTo('cta');
    }
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <span className="font-serif text-2xl font-medium tracking-tight">
          Ansible
        </span>
        <div className="hidden sm:flex items-center gap-6">
          <button
            onClick={() => {
              scrollTo('features');
              trackPageEvent('nav_click', { target: 'features' });
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </button>
          <button
            onClick={() => {
              scrollTo('how-it-works');
              trackPageEvent('nav_click', { target: 'how-it-works' });
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            How it works
          </button>
          <button
            onClick={handleTryDemo}
            className="text-sm text-blue-600 font-medium px-5 py-2 border border-blue-200 rounded-full bg-blue-50/50 hover:bg-blue-100/50 transition-colors"
          >
            Try the demo
          </button>
        </div>
      </div>
    </nav>
  );
}

// ============================================================================
// Email hook — reads stored email from localStorage
// ============================================================================

function useVerifiedEmail() {
  const [hasSubmitted, setHasSubmitted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!getStoredEmail();
  });

  return [hasSubmitted, setHasSubmitted] as const;
}

// Basic email format check — accepts anything with @ and a dotted domain
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// ============================================================================
// Hero section with email capture
// ============================================================================

function HeroSection() {
  const [email, setEmail] = useState('');
  const [consented, setConsented] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useVerifiedEmail();
  const router = useRouter();
  const { trackPageEvent } = usePageTracking();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && consented && isValidEmail(email.trim())) {
      void captureEmail(email.trim(), 'hero', true);
      setSessionEmail(email.trim());
      trackPageEvent('demo_signup', { source: 'hero' });
      setHasSubmitted(true);
      router.push('/demo');
    }
  };

  return (
    <section className="pt-20 pb-24 sm:pt-28 sm:pb-32 px-6 relative">
      <NoiseField />
      <div className="max-w-3xl mx-auto text-center relative z-10">
        <p className="font-serif italic text-base sm:text-lg text-gray-400 mb-6 animate-fade-up">
          Depth-of-engagement triage
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-medium leading-[1.1] mb-6 animate-fade-up [animation-delay:100ms] opacity-0">
          Separate the signal
          <br />
          from the noise
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto mb-10 animate-fade-up [animation-delay:200ms] opacity-0">
          AI summaries and intellectual critique for everything in your Readwise
          Reader queue. Spend deep attention only where it matters.
        </p>
        {hasSubmitted ? (
          <div className="animate-fade-up [animation-delay:300ms] opacity-0">
            <Button
              size="lg"
              className="h-12 rounded-full px-8 text-base font-medium gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={() => router.push('/demo')}
            >
              See Ansible in action
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 justify-center items-center max-w-md mx-auto animate-fade-up [animation-delay:300ms] opacity-0"
          >
            <div className="flex flex-col sm:flex-row gap-3 w-full justify-center items-center">
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 px-5 rounded-full bg-white border-gray-200 text-base sm:w-64"
              />
              <Button
                type="submit"
                size="lg"
                disabled={!consented}
                className="h-12 rounded-full px-7 text-base font-medium gap-2 bg-blue-600 hover:bg-blue-700"
              >
                Try it yourself
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <label className="flex items-center gap-2 text-left max-w-sm cursor-pointer">
              <input
                type="checkbox"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-gray-300 accent-blue-600 cursor-pointer"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                Notify me when Ansible goes live, I accept the{' '}
                <Link
                  href="/privacy"
                  className="underline hover:text-foreground transition-colors"
                >
                  privacy policy
                </Link>
                .
              </span>
            </label>
          </form>
        )}
        <p className="text-xs text-muted-foreground mt-4 animate-fade-up [animation-delay:400ms] opacity-0">
          Free demo access. No credit card needed.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// Product preview (static interactive demo embedded in landing page)
// ============================================================================

interface PreviewArticle {
  id: string;
  title: string;
  author: string;
  readTime: string;
  summary: string;
  expandedSummary: string;
  commentary: string;
  tags: { label: string; color: string }[];
}

const previewArticles: PreviewArticle[] = [
  {
    id: '1',
    title: "The EU's AI Act Enforcement Begins — And Nobody Is Ready",
    author: 'The Brussels Signal',
    readTime: '6 min read',
    summary:
      'The first enforcement wave of the EU AI Act hits in Q2 2026, targeting high-risk systems in hiring, credit scoring, and law enforcement. Most companies surveyed admit they cannot yet classify their AI systems by risk tier, let alone comply with documentation and transparency requirements.',
    expandedSummary:
      "The first enforcement wave of the EU AI Act hits in Q2 2026, targeting high-risk systems in hiring, credit scoring, and law enforcement. Most companies surveyed admit they cannot yet classify their AI systems by risk tier, let alone comply with documentation and transparency requirements.\n\nA survey of 340 European enterprises found that 72% have not completed AI system inventories — a prerequisite for compliance. The regulation requires detailed technical documentation, human oversight mechanisms, and bias auditing for any system classified as \"high-risk.\"\n\nThe penalties are severe: up to 7% of global annual turnover for the most serious violations, exceeding even GDPR fines. However, enforcement capacity is uneven — France and Germany have established dedicated AI offices, while smaller member states are relying on existing data protection authorities with limited technical staff.",
    commentary:
      "The article presents the compliance gap as primarily a corporate readiness problem, but this framing obscures a more fundamental issue: the regulation itself contains classification ambiguities that make full compliance genuinely difficult, not just neglected.\n\nMethodological caveat: The 72% non-compliance figure comes from an industry lobby group survey with self-reported data and a likely response bias toward companies that want to signal regulatory burden.\n\nCompeting framework: Legal scholars at the Max Planck Institute argue that the AI Act's risk-tier approach is structurally flawed because risk emerges from deployment context, not from the system itself.",
    tags: [
      { label: 'AI regulation', color: 'blue' },
      { label: 'EU policy', color: 'green' },
      { label: 'compliance gap', color: 'orange' },
    ],
  },
  {
    id: '2',
    title: "Semiconductor Reshoring Hits a Wall: The Skilled Labor Crisis Nobody Planned For",
    author: 'Asia-Pacific Tech Review',
    readTime: '8 min read',
    summary:
      "The US CHIPS Act has disbursed $24 billion toward domestic chip fabrication, but new fabs in Arizona, Ohio, and Texas are all behind schedule — not due to construction delays, but because there aren't enough trained technicians to operate them.",
    expandedSummary:
      "The US CHIPS Act has disbursed $24 billion toward domestic chip fabrication, but new fabs in Arizona, Ohio, and Texas are all behind schedule — not due to construction delays, but because there aren't enough trained technicians to operate them. The US produces roughly 3,000 semiconductor engineering graduates per year; the industry needs 15,000.\n\nThe labor shortage extends beyond engineers. Advanced fabs require thousands of specialized maintenance technicians, chemical engineers, and cleanroom operators — roles that demand 12-18 months of training even for experienced manufacturing workers.",
    commentary:
      "The article builds a strong case around the labor bottleneck but treats it as an oversight in CHIPS Act planning. In fact, workforce development was explicitly included in the legislation — $200 million was allocated to training programs.\n\nCounter-evidence: South Korea faced a similar labor gap when expanding fab capacity in the 2010s and closed it within 4 years through aggressive industry-university partnerships and military service exemptions for semiconductor engineers.",
    tags: [
      { label: 'semiconductors', color: 'blue' },
      { label: 'CHIPS Act', color: 'green' },
      { label: 'labor shortage', color: 'red' },
    ],
  },
  {
    id: '3',
    title: 'Inside the Quiet Collapse of the Carbon Offset Market',
    author: 'Climate & Capital Weekly',
    readTime: '9 min read',
    summary:
      'The voluntary carbon offset market has contracted by 38% since its 2023 peak, as a cascade of investigative reporting and academic studies revealed that the majority of rainforest preservation credits represented "phantom reductions."',
    expandedSummary:
      'The voluntary carbon offset market has contracted by 38% since its 2023 peak, as a cascade of investigative reporting and academic studies revealed that the majority of rainforest preservation credits represented "phantom reductions" — paying to protect forests that were never at risk of being cut down.\n\nThe article traces the collapse through three phases. First, academic papers demonstrated that over 90% of REDD+ credits did not represent real emission reductions. Second, major corporate buyers quietly dropped offset claims from their sustainability reports. Third, the certification bodies split over reform proposals.',
    commentary:
      "The article's central narrative — that carbon offsets were largely a fiction — is well-supported by the evidence but risks throwing out genuine forest conservation finance along with fraudulent credits.\n\nCounter-evidence: While REDD+ credits overestimated their climate impact, many offset-funded projects delivered real biodiversity and community livelihood benefits that aren't captured in carbon accounting.",
    tags: [
      { label: 'carbon markets', color: 'green' },
      { label: 'climate', color: 'red' },
      { label: 'corporate ESG', color: 'blue' },
    ],
  },
];

const previewTagColors: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
};

function PreviewArticleCard({
  article,
  onArchive,
}: {
  article: PreviewArticle;
  onArchive: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [reaction, setReaction] = useState<'interesting' | 'not-interesting' | null>(null);
  const [showReaderPopup, setShowReaderPopup] = useState(false);

  const handleSaveNote = () => {
    if (noteInput.trim()) {
      setNote(noteInput.trim());
      setShowNoteForm(false);
      setNoteInput('');
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-blue-600 font-semibold text-base leading-snug mb-3">
        {article.title}
      </h3>

      <Tabs
        defaultValue="summary"
        className="flex flex-col"
        onValueChange={() => setExpanded(false)}
      >
        <TabsList className="bg-transparent border-b border-gray-100 rounded-none h-auto p-0 mb-3 justify-start">
          <TabsTrigger
            value="summary"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 mr-4 pb-2 text-xs font-medium"
          >
            Summary
          </TabsTrigger>
          <TabsTrigger
            value="commentary"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 pb-2 text-xs font-medium"
          >
            Commentary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-0">
          <div className="text-sm text-gray-600 leading-relaxed">
            {expanded ? (
              <div className="whitespace-pre-line">{article.expandedSummary}</div>
            ) : (
              <p>{article.summary}</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="commentary" className="mt-0">
          <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
            {expanded
              ? article.commentary
              : article.commentary.split('\n\n')[0] + '...'}
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-auto pt-4 flex items-center gap-2 text-xs text-gray-500">
        <button
          onClick={() => setExpanded(!expanded)}
          className="hover:text-blue-600 transition-colors flex items-center gap-0.5"
        >
          {expanded ? (
            <>Collapse <ChevronUp className="h-3 w-3" /></>
          ) : (
            <>Expand <ChevronDown className="h-3 w-3" /></>
          )}
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => {
            if (note) { setNote(null); setShowNoteForm(true); setNoteInput(''); }
            else { setShowNoteForm(!showNoteForm); }
          }}
          className="hover:text-blue-600 transition-colors flex items-center gap-0.5"
        >
          <StickyNote className="h-3 w-3" /> {note ? 'Edit note' : 'Add note'}
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => setReaction(reaction === 'interesting' ? null : 'interesting')}
          className={`text-base leading-none rounded-full w-7 h-7 flex items-center justify-center transition-colors ${
            reaction === 'interesting' ? 'bg-yellow-100' : 'hover:bg-gray-100'
          }`}
          title="Interesting"
        >
          💡
        </button>
        <button
          onClick={() => setReaction(reaction === 'not-interesting' ? null : 'not-interesting')}
          className={`text-base leading-none rounded-full w-7 h-7 flex items-center justify-center transition-colors ${
            reaction === 'not-interesting' ? 'bg-red-100' : 'hover:bg-gray-100'
          }`}
          title="Not interesting"
        >
          😐
        </button>
      </div>

      {showNoteForm && (
        <div className="mt-3 border border-blue-200 rounded-lg p-3 bg-blue-50/30">
          <textarea
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Add your thoughts about this article..."
            className="w-full text-sm border border-gray-200 rounded-md p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
            rows={3}
            maxLength={10000}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-gray-400">{noteInput.length} / 10,000</span>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowNoteForm(false); setNoteInput(''); }}
                className="text-xs border border-gray-300 text-gray-600 px-4 py-1.5 rounded-md hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNote}
                disabled={!noteInput.trim()}
                className="text-xs bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-4 py-1.5 rounded-md transition-colors font-medium"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {note && !showNoteForm && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <span>📝</span> Your note:
          </p>
          <div className="border border-amber-200 bg-amber-50/50 rounded-md px-3 py-2">
            <p className="text-sm text-gray-700">{note}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mt-3">
        {article.tags.map((tag) => (
          <Badge
            key={tag.label}
            variant="outline"
            className={`text-[11px] font-medium border ${previewTagColors[tag.color] || previewTagColors.blue}`}
          >
            {tag.label}
          </Badge>
        ))}
      </div>

      <div className="text-xs text-gray-400 mt-3">
        {article.author} &middot; {article.readTime}
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => onArchive(article.id)}
          className="flex-1 text-xs border border-gray-200 rounded-md py-2 text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
        >
          <Archive className="h-3.5 w-3.5" /> Archive
        </button>
        <div className="relative flex-1">
          <button
            onClick={() => setShowReaderPopup(!showReaderPopup)}
            className="w-full text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-md py-2 font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open in Reader
          </button>
          {showReaderPopup && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowReaderPopup(false)} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50">
                <p className="text-sm text-gray-700 leading-relaxed">
                  Piqued your interest? In the full app, this opens the article directly in
                  Readwise Reader — just one click to the complete text.
                </p>
                <p className="text-xs text-gray-400 mt-2">Separate Readwise Reader sign-up required.</p>
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-white border-b border-r border-gray-200 rotate-45" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductPreview() {
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [showSyncPopup, setShowSyncPopup] = useState(false);
  const visibleArticles = previewArticles.filter((a) => !archivedIds.has(a.id));

  return (
    <section className="pb-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden animate-fade-up [animation-delay:450ms] opacity-0">
          <div className="bg-[hsl(220,15%,18%)] px-5 py-3 flex items-center justify-between">
            <span className="text-white font-sans text-sm font-medium">Ansible AI Reader</span>
            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => { setArchivedIds(new Set()); setShowSyncPopup(!showSyncPopup); }}
                  className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-4 py-1.5 rounded font-medium transition-colors"
                >
                  Sync
                </button>
                {showSyncPopup && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSyncPopup(false)} />
                    <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50">
                      <p className="text-sm text-gray-700 leading-relaxed">
                        Unread items are synced and summarised regularly from your Readwise Reader
                        account, or manually at the click of a button.
                      </p>
                      <p className="text-xs text-gray-400 mt-2">Separate Readwise Reader sign-up required.</p>
                      <div className="absolute right-4 -top-1.5 w-3 h-3 bg-white border-t border-l border-gray-200 rotate-45" />
                    </div>
                  </>
                )}
              </div>
              <span className="text-gray-400 text-xs">Settings</span>
            </div>
          </div>
          <div className="p-5 bg-[hsl(220,14%,96%)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleArticles.map((article) => (
              <PreviewArticleCard
                key={article.id}
                article={article}
                onArchive={(id) => setArchivedIds((prev) => new Set(prev).add(id))}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Features section
// ============================================================================

function FeaturesSection() {
  const features = [
    {
      icon: Zap,
      title: 'Summary',
      description:
        'Get AI digests of every article and transcript. Scan the key take aways in seconds — before committing your time.',
      detail: 'Powered by AI analysis of the full article text',
    },
    {
      icon: MessageSquareWarning,
      title: 'Commentary',
      description:
        'A second AI analysis that tells you how well an article holds up — surfacing counter-arguments, competing frameworks, and significant caveats.',
      detail: 'Challenges the claims of the text',
    },
    {
      icon: Search,
      title: 'Web Search',
      description:
        "Perplexity-powered search locates substantive intellectual challenges to core claims, regardless of whether the article itself has generated discussion.",
      detail: "Finds what the author didn't mention",
    },
  ];

  return (
    <section id="features" className="py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="font-serif italic text-gray-400 mb-3">Three lenses on every article</p>
          <h2 className="font-serif text-3xl sm:text-4xl font-medium">
            Know what to read.
            <br />
            Know what to skip.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-white border border-gray-200 rounded-xl p-7 hover:shadow-md transition-shadow group"
            >
              <div className="w-11 h-11 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center mb-5 group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors">
                <feature.icon className="h-5 w-5 text-blue-500" />
              </div>
              <h3 className="font-sans font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {feature.description}
              </p>
              <p className="text-xs text-gray-400 font-medium flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                {feature.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// How it works section
// ============================================================================

function HowItWorksSection() {
  const steps = [
    {
      icon: BookOpen,
      step: '01',
      title: 'Save to Readwise Reader',
      description: 'Use Readwise Reader as you normally do. Save articles, newsletters, podcasts — anything you want to read later.',
    },
    {
      icon: Filter,
      step: '02',
      title: 'Ansible triages your queue',
      description: 'AI generates summaries and commentary for your unread items. Colored tags surface key topics at a glance.',
    },
    {
      icon: Clock,
      step: '03',
      title: 'Read what matters',
      description: 'Skim the summaries. Check the critique. Open only the pieces that deserve your full attention.',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 px-6 bg-gradient-to-b from-transparent to-gray-50">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="font-serif italic text-gray-400 mb-3">Simple workflow</p>
          <h2 className="font-serif text-3xl sm:text-4xl font-medium">How it works</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.step} className="text-center">
              <div className="font-serif text-3xl text-gray-300 mb-4">{step.step}</div>
              <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center mx-auto mb-4">
                <step.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="font-sans font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Quote section
// ============================================================================

function QuoteSection() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-2xl mx-auto text-center">
        <div className="w-px h-12 bg-gray-200 mx-auto mb-8" />
        <blockquote className="font-serif italic text-xl sm:text-2xl leading-relaxed text-gray-700 mb-6">
          &ldquo;The ansible is a device that will permit communication without
          any time interval between two points in space.&rdquo;
        </blockquote>
        <p className="text-sm text-gray-400 font-sans">
          Ursula K. Le Guin, <span className="italic">The Dispossessed</span>
        </p>
        <div className="w-px h-12 bg-gray-200 mx-auto mt-8" />
      </div>
    </section>
  );
}

// ============================================================================
// Final CTA section
// ============================================================================

function FinalCTA() {
  const [email, setEmail] = useState('');
  const [consented, setConsented] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useVerifiedEmail();
  const router = useRouter();
  const { trackPageEvent } = usePageTracking();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && consented && isValidEmail(email.trim())) {
      void captureEmail(email.trim(), 'cta', true);
      setSessionEmail(email.trim());
      trackPageEvent('demo_signup', { source: 'cta' });
      setHasSubmitted(true);
      router.push('/demo');
    }
  };

  return (
    <section id="cta" className="py-20 px-6 bg-gray-50 border-t border-gray-100">
      <div className="max-w-xl mx-auto text-center">
        <h2 className="font-serif text-3xl sm:text-4xl font-medium mb-4">
          Start reading smarter
        </h2>
        {hasSubmitted ? (
          <>
            <p className="text-muted-foreground mb-8">
              See how Ansible triages your reading queue with AI summaries and commentary.
            </p>
            <Button
              size="lg"
              className="h-12 rounded-full px-8 text-base font-medium gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={() => router.push('/demo')}
            >
              See Ansible in action
              <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground mb-8">
              Enter your email to access the interactive demo and see Ansible in action.
            </p>
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-3 justify-center items-center max-w-md mx-auto"
            >
              <div className="flex flex-col sm:flex-row gap-3 w-full justify-center items-center">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 px-5 rounded-full bg-white border-gray-200 text-base sm:flex-1"
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={!consented}
                  className="h-12 rounded-full px-7 text-base font-medium gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  Try it yourself
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <label className="flex items-center gap-2 text-left max-w-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={consented}
                  onChange={(e) => setConsented(e.target.checked)}
                  className="h-4 w-4 shrink-0 rounded border-gray-300 accent-blue-600 cursor-pointer"
                />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  Notify me when Ansible goes live, I accept the{' '}
                  <Link
                    href="/privacy"
                    className="underline hover:text-foreground transition-colors"
                  >
                    privacy policy
                  </Link>
                  .
                </span>
              </label>
            </form>
          </>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// Footer
// ============================================================================

function Footer() {
  return (
    <footer className="border-t border-gray-100 px-6 py-8">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="font-serif text-lg">Ansible</span>
        <div className="flex items-center gap-4">
          <p className="text-xs text-muted-foreground">
            Depth-of-engagement triage for voracious readers.
          </p>
          <Link
            href="/privacy"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Privacy
          </Link>
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Login
          </Link>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// Main export
// ============================================================================

export default function LandingPage() {
  const { trackPageEvent } = usePageTracking();

  useEffect(() => {
    trackPageEvent('landing_page_view');
  }, [trackPageEvent]);

  return (
    <div className="min-h-screen bg-white font-sans">
      <Navbar trackPageEvent={trackPageEvent} />
      <HeroSection />
      <ProductPreview />
      <FeaturesSection />
      <HowItWorksSection />
      <QuoteSection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
