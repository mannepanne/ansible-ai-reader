import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTracking } from "@/hooks/useTracking";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  ExternalLink,
  Archive,
  ChevronDown,
  ChevronUp,
  StickyNote,
} from "lucide-react";

interface ArticleTag {
  label: string;
  color: string;
}

interface DemoArticle {
  id: string;
  title: string;
  author: string;
  readTime: string;
  summary: string;
  expandedSummary: string;
  commentary: string;
  tags: ArticleTag[];
}

const demoArticles: DemoArticle[] = [
  {
    id: "1",
    title: "The EU's AI Act Enforcement Begins — And Nobody Is Ready",
    author: "The Brussels Signal",
    readTime: "6 min read",
    summary:
      "The first enforcement wave of the EU AI Act hits in Q2 2026, targeting high-risk systems in hiring, credit scoring, and law enforcement. Most companies surveyed admit they cannot yet classify their AI systems by risk tier, let alone comply with documentation and transparency requirements.",
    expandedSummary:
      "The first enforcement wave of the EU AI Act hits in Q2 2026, targeting high-risk systems in hiring, credit scoring, and law enforcement. Most companies surveyed admit they cannot yet classify their AI systems by risk tier, let alone comply with documentation and transparency requirements.\n\nA survey of 340 European enterprises found that 72% have not completed AI system inventories — a prerequisite for compliance. The regulation requires detailed technical documentation, human oversight mechanisms, and bias auditing for any system classified as \"high-risk.\"\n\nThe penalties are severe: up to 7% of global annual turnover for the most serious violations, exceeding even GDPR fines. However, enforcement capacity is uneven — France and Germany have established dedicated AI offices, while smaller member states are relying on existing data protection authorities with limited technical staff.\n\nThe article argues the biggest impact may be indirect: US and Asian tech companies choosing to geo-fence AI features rather than adapt them for EU compliance, creating a \"regulation gap\" in AI capabilities available to European users.",
    commentary:
      "The article presents the compliance gap as primarily a corporate readiness problem, but this framing obscures a more fundamental issue: the regulation itself contains classification ambiguities that make full compliance genuinely difficult, not just neglected.\n\nMethodological caveat: The 72% non-compliance figure comes from an industry lobby group survey with self-reported data and a likely response bias toward companies that want to signal regulatory burden. Independent audits by national authorities show somewhat higher readiness in sectors like financial services where risk management infrastructure already exists.\n\nCompeting framework: Legal scholars at the Max Planck Institute argue that the AI Act's risk-tier approach is structurally flawed because risk emerges from deployment context, not from the system itself. The same language model poses different risks in a medical diagnosis tool versus a customer service chatbot, yet the regulation struggles to capture this distinction.\n\nNotably absent: any discussion of whether early enforcement actions will target symbolic high-profile cases or systematic small violations. GDPR enforcement followed the former pattern, which generated headlines but limited industry-wide compliance improvement for years.",
    tags: [
      { label: "AI regulation", color: "blue" },
      { label: "EU policy", color: "green" },
      { label: "compliance gap", color: "orange" },
      { label: "tech governance", color: "purple" },
    ],
  },
  {
    id: "2",
    title: "Semiconductor Reshoring Hits a Wall: The Skilled Labor Crisis Nobody Planned For",
    author: "Asia-Pacific Tech Review",
    readTime: "8 min read",
    summary:
      "The US CHIPS Act has disbursed $24 billion toward domestic chip fabrication, but new fabs in Arizona, Ohio, and Texas are all behind schedule — not due to construction delays, but because there aren't enough trained technicians to operate them. The US produces roughly 3,000 semiconductor engineering graduates per year; the industry needs 15,000.",
    expandedSummary:
      "The US CHIPS Act has disbursed $24 billion toward domestic chip fabrication, but new fabs in Arizona, Ohio, and Texas are all behind schedule — not due to construction delays, but because there aren't enough trained technicians to operate them. The US produces roughly 3,000 semiconductor engineering graduates per year; the industry needs 15,000.\n\nThe labor shortage extends beyond engineers. Advanced fabs require thousands of specialized maintenance technicians, chemical engineers, and cleanroom operators — roles that demand 12-18 months of training even for experienced manufacturing workers. Community college programs have launched in fab-adjacent regions, but their first cohorts won't graduate until late 2027.\n\nSeveral fab operators have quietly brought in hundreds of workers from Taiwan and South Korea on specialized visas, drawing political backlash that contradicts the reshoring narrative. The article traces this tension between industrial policy goals (domestic self-sufficiency) and operational reality (global talent dependence).\n\nMeanwhile, TSMC's latest Arizona fab is reportedly producing yields 20-30% below its Taiwanese facilities, a gap attributed partly to workforce experience differentials.",
    commentary:
      "The article builds a strong case around the labor bottleneck but treats it as an oversight in CHIPS Act planning. In fact, workforce development was explicitly included in the legislation — $200 million was allocated to training programs. The real question is whether the timeline was realistic, not whether the problem was anticipated.\n\nCounter-evidence: South Korea faced a similar labor gap when expanding fab capacity in the 2010s and closed it within 4 years through aggressive industry-university partnerships and military service exemptions for semiconductor engineers. The US approach of community college programs is structurally slower but may prove more sustainable. The article's framing of the gap as permanent underestimates institutional adaptation.\n\nSignificant caveat: The 20-30% yield gap at the Arizona facility is cited without context. New fabs universally underperform established ones in early production — TSMC's own Kumamoto facility in Japan showed similar initial gaps. Using early yield data to indict the reshoring effort conflates startup friction with structural capability deficits.\n\nBlind spot: The article ignores the parallel European Chips Act and its own labor challenges. Treating this as a uniquely American problem misses that the global semiconductor workforce is being stretched across simultaneous fab expansions in the US, EU, Japan, and India.",
    tags: [
      { label: "semiconductors", color: "blue" },
      { label: "CHIPS Act", color: "green" },
      { label: "labor shortage", color: "red" },
      { label: "industrial policy", color: "purple" },
      { label: "supply chain", color: "orange" },
    ],
  },
  {
    id: "3",
    title: "WHO Declares New Mpox Strain a Global Health Emergency",
    author: "Global Health Dispatch",
    readTime: "5 min read",
    summary:
      "A new mpox variant, clade IIc, has been detected in 14 countries across three continents, prompting the WHO to reinstate its Public Health Emergency of International Concern designation. The variant shows higher transmissibility than previous strains and partial resistance to the existing Jynneos vaccine.",
    expandedSummary:
      "A new mpox variant, clade IIc, has been detected in 14 countries across three continents, prompting the WHO to reinstate its Public Health Emergency of International Concern designation. The variant shows higher transmissibility than previous strains and partial resistance to the existing Jynneos vaccine.\n\nEpidemiological data from the Democratic Republic of Congo, where the variant was first identified, suggests a reproduction number (R0) of approximately 2.1, compared to 1.2-1.4 for earlier clades. Crucially, transmission patterns show sustained spread beyond the close-contact networks that characterized the 2022 outbreak, including documented airborne transmission in household settings.\n\nVaccine effectiveness against clade IIc appears reduced to approximately 60%, down from 85% against earlier strains. Modified vaccine candidates are in development but remain 8-12 months from emergency use authorization.\n\nThe article details the WHO's response framework, including recommended surveillance protocols and ring vaccination strategies, while noting that global mpox vaccine stockpiles were depleted during the 2022-2023 response and have not been fully replenished.",
    commentary:
      "The article accurately reports the WHO declaration and variant characteristics but amplifies urgency in ways that merit scrutiny.\n\nMethodological caveat: The R0 estimate of 2.1 comes from early-stage data in a specific epidemiological context (dense urban settings in DRC with limited healthcare infrastructure). Reproduction numbers from initial outbreak zones consistently overestimate sustained transmission potential in contexts with better surveillance and public health response. The 2022 mpox outbreak had initial R0 estimates above 2 that settled to well below 1 in most countries within months.\n\nCompeting framework: Several epidemiologists argue the PHEIC designation is being used as a diplomatic and funding tool rather than a pure risk assessment. The bar for declaration has shifted since COVID-19 — the WHO faces pressure to act earlier on potential pandemic threats, which may lead to over-classification of regional outbreaks. This isn't to say the variant isn't concerning, but the framing conflates \"warrants attention\" with \"imminent global crisis.\"\n\nNotably absent: any discussion of how the 2022 mpox response succeeded through targeted community engagement rather than population-wide measures. The article defaults to the pandemic-era frame of top-down emergency response without examining whether that template fits this pathogen's transmission dynamics.",
    tags: [
      { label: "global health", color: "red" },
      { label: "mpox variant", color: "orange" },
      { label: "WHO emergency", color: "purple" },
      { label: "vaccine resistance", color: "blue" },
    ],
  },
  {
    id: "4",
    title: "Inside the Quiet Collapse of the Carbon Offset Market",
    author: "Climate & Capital Weekly",
    readTime: "9 min read",
    summary:
      "The voluntary carbon offset market has contracted by 38% since its 2023 peak, as a cascade of investigative reporting and academic studies revealed that the majority of rainforest preservation credits represented \"phantom reductions\" — paying to protect forests that were never at risk of being cut down.",
    expandedSummary:
      "The voluntary carbon offset market has contracted by 38% since its 2023 peak, as a cascade of investigative reporting and academic studies revealed that the majority of rainforest preservation credits represented \"phantom reductions\" — paying to protect forests that were never at risk of being cut down.\n\nThe article traces the collapse through three phases. First, a series of academic papers demonstrated that over 90% of REDD+ credits from major certification bodies like Verra did not represent real emission reductions. Second, major corporate buyers — including airlines, tech companies, and consumer goods firms — quietly dropped offset claims from their sustainability reports. Third, the certification bodies themselves split over reform proposals, with Verra, Gold Standard, and the new Integrity Council for the Voluntary Carbon Market pursuing incompatible standards.\n\nThe market hasn't disappeared entirely. Credits tied to direct carbon removal (engineered solutions like direct air capture) are trading at 5-10x the price of avoided-deforestation credits and seeing growing demand. But these represent less than 3% of total offset volume.\n\nCorporate net-zero pledges now face a credibility gap: companies that relied heavily on cheap offset credits must either invest in expensive removal technologies, accelerate actual emission reductions, or quietly abandon their targets.",
    commentary:
      "The article's central narrative — that carbon offsets were largely a fiction — is well-supported by the evidence but risks throwing out genuine forest conservation finance along with fraudulent credits.\n\nCounter-evidence: While REDD+ credits overestimated their climate impact, many offset-funded projects delivered real biodiversity and community livelihood benefits that aren't captured in carbon accounting. A 2025 analysis by the Tropical Ecology Institute found that offset-funded forest concessions in Borneo maintained 40% higher biodiversity than unprotected areas, regardless of whether the carbon math was accurate. Dismissing the entire mechanism discards these co-benefits.\n\nCompeting framework: Some climate economists argue the offset market's collapse is actually healthy creative destruction. The market was functioning as a \"permission to pollute\" mechanism that delayed genuine decarbonization. Its contraction may force companies to pursue real emission reductions sooner, producing better long-term climate outcomes than a well-functioning offset market would have.\n\nBlind spot: The article treats carbon removal credits as the credible alternative without examining their own vulnerabilities. Direct air capture is extremely energy-intensive, and most facilities are powered by natural gas — meaning their net carbon benefit depends on contested lifecycle accounting. The market may be swapping one form of questionable accounting for another.",
    tags: [
      { label: "carbon markets", color: "green" },
      { label: "climate fraud", color: "red" },
      { label: "net-zero claims", color: "orange" },
      { label: "corporate ESG", color: "blue" },
      { label: "deforestation", color: "emerald" },
    ],
  },
  {
    id: "5",
    title: "Algorithm Transparency Laws Are Coming — But Can Anyone Actually Audit an LLM?",
    author: "The Digital Policy Forum",
    readTime: "6 min read",
    summary:
      "New York, California, and the EU now require algorithmic impact assessments for AI systems used in employment, housing, and lending decisions. But auditors report that large language models are fundamentally resistant to the kind of systematic bias testing the laws envision — the same prompt can produce different outputs each time.",
    expandedSummary:
      "New York, California, and the EU now require algorithmic impact assessments for AI systems used in employment, housing, and lending decisions. But auditors report that large language models are fundamentally resistant to the kind of systematic bias testing the laws envision — the same prompt can produce different outputs each time.\n\nThe article interviews three firms that have been hired to conduct algorithmic audits under the new regulations. All three describe a fundamental mismatch: the laws were designed for deterministic systems (traditional ML classifiers that produce consistent outputs from consistent inputs), but the market has moved to probabilistic foundation models where outputs vary with temperature settings, context windows, and even server load.\n\nOne auditing firm ran the same bias test suite against a hiring screening tool 50 times and got statistically significant different results on 23 of those runs. The question of whether the system \"passes\" depends on which run you count.\n\nProposed solutions include requiring companies to fix random seeds during audits, mandating minimum sample sizes for statistical significance, and shifting from point-in-time audits to continuous monitoring. But each approach adds compliance costs that smaller companies may not absorb, potentially concentrating AI deployment among large firms that can afford the overhead.",
    commentary:
      "The article correctly identifies a real gap between regulatory intent and technical reality, but overstates the novelty of the problem. Stochastic systems are common in regulated industries — financial risk models, clinical drug trials, and actuarial calculations all produce variable outputs and have established auditing methodologies.\n\nCounter-evidence: The \"50 runs, 23 different results\" example sounds alarming but lacks context. If the variation is between \"bias score of 0.12 and 0.14,\" the system is functionally consistent even if not deterministically identical. The article doesn't distinguish between meaningful variation (the system is sometimes biased and sometimes not) and noise (the system's bias level is stable but measurement is imprecise). This distinction matters enormously for regulatory design.\n\nCompeting framework: Researchers at the Partnership on AI argue that the focus on auditing individual model outputs misses the more important question of systemic outcomes. Rather than testing whether a hiring tool might produce biased results on any given run, regulators should examine whether the tool's aggregate hiring recommendations over thousands of candidates show demographic disparities. This population-level approach is already used in employment discrimination law and maps cleanly onto existing legal frameworks.\n\nSignificant caveat: The compliance cost argument — that auditing burdens will concentrate AI among large firms — assumes small companies are building custom AI systems. In practice, most small firms use AI through SaaS products built by larger companies. The audit burden falls on the platform provider, not the end user, making the concentration concern less acute than presented.",
    tags: [
      { label: "algorithm auditing", color: "purple" },
      { label: "AI transparency", color: "blue" },
      { label: "bias testing", color: "orange" },
      { label: "tech regulation", color: "green" },
      { label: "LLM governance", color: "red" },
    ],
  },
];

const tagColorMap: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  red: "bg-red-100 text-red-700 border-red-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  rose: "bg-rose-100 text-rose-700 border-rose-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

function DemoArticleCard({
  article,
  onArchive,
  trackEvent,
}: {
  article: DemoArticle;
  onArchive: (id: string) => void;
  trackEvent: (type: string, data?: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [reaction, setReaction] = useState<"interesting" | "not-interesting" | null>(null);
  const [showReaderPopup, setShowReaderPopup] = useState(false);

  const handleSaveNote = () => {
    if (noteInput.trim()) {
      setNote(noteInput.trim());
      setShowNoteForm(false);
      setNoteInput("");
      trackEvent("add_note", { article_id: article.id });
    }
  };

  const handleCancelNote = () => {
    setShowNoteForm(false);
    setNoteInput("");
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-blue-600 font-semibold text-base leading-snug mb-3 hover:text-blue-700 cursor-pointer">
        {article.title}
      </h3>

      <Tabs
        defaultValue="summary"
        className="flex-1 flex flex-col"
        onValueChange={(tab) => {
          setExpanded(false);
          trackEvent("tab_switch", { article_id: article.id, tab });
        }}
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

        <TabsContent value="summary" className="flex-1 mt-0">
          <div className="text-sm text-gray-600 leading-relaxed">
            {expanded ? (
              <div className="whitespace-pre-line">
                {article.expandedSummary}
              </div>
            ) : (
              <p>{article.summary}</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="commentary" className="flex-1 mt-0">
          <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
            {expanded
              ? article.commentary
              : article.commentary.split("\n\n")[0] + "..."}
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
        <button
          onClick={() => {
            trackEvent(expanded ? "collapse" : "expand", { article_id: article.id });
            setExpanded(!expanded);
          }}
          className="hover:text-blue-600 transition-colors flex items-center gap-0.5"
        >
          {expanded ? (
            <>
              Collapse <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Expand <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => {
            if (note) {
              setNote(null);
              setShowNoteForm(true);
              setNoteInput("");
            } else {
              setShowNoteForm(!showNoteForm);
            }
          }}
          className="hover:text-blue-600 transition-colors flex items-center gap-0.5"
        >
          <StickyNote className="h-3 w-3" /> {note ? "Edit note" : "Add note"}
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => {
            const next = reaction === "interesting" ? null : "interesting";
            setReaction(next);
            if (next) trackEvent("reaction", { article_id: article.id, reaction: next });
          }}
          className={`text-base leading-none rounded-full w-7 h-7 flex items-center justify-center transition-colors ${
            reaction === "interesting"
              ? "bg-yellow-100"
              : "hover:bg-gray-100"
          }`}
          title="Interesting"
        >
          💡
        </button>
        <button
          onClick={() => {
            const next = reaction === "not-interesting" ? null : "not-interesting";
            setReaction(next);
            if (next) trackEvent("reaction", { article_id: article.id, reaction: next });
          }}
          className={`text-base leading-none rounded-full w-7 h-7 flex items-center justify-center transition-colors ${
            reaction === "not-interesting"
              ? "bg-red-100"
              : "hover:bg-gray-100"
          }`}
          title="Not interesting"
        >
          😐
        </button>
      </div>

      {/* Note entry form */}
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
            <span className="text-[11px] text-gray-400">
              {noteInput.length} / 10,000 characters
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleCancelNote}
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

      {/* Saved note display */}
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
            className={`text-[11px] font-medium border ${tagColorMap[tag.color] || tagColorMap.blue}`}
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
          onClick={() => {
            trackEvent("archive", { article_id: article.id });
            onArchive(article.id);
          }}
          className="flex-1 text-xs border border-gray-200 rounded-md py-2 text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
        >
          <Archive className="h-3.5 w-3.5" />
          Archive
        </button>
        <div className="relative flex-1">
          <button
            onClick={() => {
              if (!showReaderPopup) trackEvent("open_reader", { article_id: article.id });
              setShowReaderPopup(!showReaderPopup);
            }}
            className="w-full text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-md py-2 font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Reader
          </button>
          {showReaderPopup && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowReaderPopup(false)}
              />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50">
                <p className="text-sm text-gray-700 leading-relaxed">
                  Piqued your interest? In the full app, this opens the
                  article directly in Readwise Reader — just one click
                  to the complete text.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Separate Readwise Reader sign-up required.
                </p>
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-white border-b border-r border-gray-200 rotate-45" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DemoPage() {
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [showSyncPopup, setShowSyncPopup] = useState(false);
  const { trackEvent } = useTracking();

  useEffect(() => {
    trackEvent("page_view", { page: "demo" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleArticles = demoArticles.filter(
    (a) => !archivedIds.has(a.id)
  );

  const handleArchive = (id: string) => {
    setArchivedIds((prev) => new Set(prev).add(id));
  };

  return (
    <div className="min-h-screen bg-[hsl(220,14%,96%)] font-sans">
      {/* Demo app header */}
      <header className="bg-[hsl(220,15%,18%)] text-white px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-gray-400 hover:text-white transition-colors flex items-center gap-1 text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back to home</span>
          </Link>
          <span className="text-sm font-medium">Ansible AI Reader</span>
          <Badge
            variant="outline"
            className="text-[10px] border-amber-500/50 text-amber-400 bg-amber-500/10"
          >
            DEMO
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => {
                setArchivedIds(new Set());
                setShowSyncPopup(!showSyncPopup);
                trackEvent("sync");
              }}
              className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-4 py-1.5 rounded font-medium transition-colors"
            >
              Sync
            </button>
            {showSyncPopup && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSyncPopup(false)}
                />
                <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Unread items are synced and summarised regularly from
                    your Readwise Reader account, or manually at the
                    click of a button.
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Separate Readwise Reader sign-up required.
                  </p>
                  <div className="absolute right-4 -top-1.5 w-3 h-3 bg-white border-t border-l border-gray-200 rotate-45" />
                </div>
              </>
            )}
          </div>
          <span className="text-gray-400 text-xs hidden sm:inline">
            demo@ansible.app
          </span>
        </div>
      </header>

      {/* Demo banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-3 text-center">
        <p className="text-sm text-amber-800">
          You&apos;re viewing a read-only demo with pre-generated summaries and
          commentary.{" "}
          <span className="font-medium">
            Expand cards and switch tabs to explore.
          </span>
        </p>
      </div>

      {/* Cards grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visibleArticles.map((article) => (
            <DemoArticleCard
              key={article.id}
              article={article}
              onArchive={handleArchive}
              trackEvent={trackEvent}
            />
          ))}
        </div>
      </main>

      {/* Demo footer */}
      <footer className="border-t border-gray-200 bg-white px-4 sm:px-6 py-8 mt-8">
        <div className="max-w-4xl mx-auto text-center">
          <p className="font-serif text-xl mb-2">
            Like what you see?
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Ansible is currently in early access. You are on the waitlist to be
            notified when we launch.{" "}
            <Link
              to="/privacy"
              className="underline hover:text-gray-700 transition-colors"
            >
              Privacy policy
            </Link>
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </footer>
    </div>
  );
}
