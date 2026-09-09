'use client';
import { useEffect, useState } from 'react';
import {
  CallReview,
  CoordinatorView,
  PatternView,
  RubricGuide,
} from './review';
import { ImportDialog } from './import-dialog';
import { flushSync } from 'react-dom';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Lightbulb,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  demoCalls,
  coordinators,
  averageScore,
  summarize,
  filterCalls,
  csvExport,
  type Consultation,
} from '@/lib/consultations';

type View =
  | 'Overview'
  | 'Consultations'
  | 'Coordinators'
  | 'Patterns'
  | 'Rubric guide';
const nav = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Consultations', icon: AudioLines },
  { name: 'Coordinators', icon: Users },
  { name: 'Patterns', icon: BarChart3 },
] as const;
function Navigation({
  view,
  onNavigate,
  count,
}: {
  view: View;
  onNavigate: (v: View) => void;
  count: number;
}) {
  const { setOpenMobile } = useSidebar();
  const go = (v: View) => {
    onNavigate(v);
    setOpenMobile(false);
  };
  return (
    <Sidebar className="app-sidebar" collapsible="offcanvas">
      <SidebarHeader className="brand">
        <div className="brand-mark">
          <AudioLines size={24} />
        </div>
        <span>
          Consult<span className="brand-iq">IQ</span>
        </span>
      </SidebarHeader>
      <SidebarContent>
        <div className="workspace-switch">
          <span className="practice-icon">B</span>
          <div>
            <strong>Bright Dental</strong>
            <span>Demo workspace</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <SidebarMenu className="navigation">
          {nav.map(({ name, icon: Icon }) => (
            <SidebarMenuItem key={name}>
              <SidebarMenuButton
                className="nav-item"
                isActive={view === name}
                onClick={() => go(name)}
              >
                <Icon size={19} />
                <span>{name}</span>
                {name === 'Consultations' && (
                  <span className="nav-count">{count}</span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <div className="nav-label resource-label">RESOURCES</div>
        <SidebarMenu className="navigation">
          <SidebarMenuItem>
            <SidebarMenuButton
              className="nav-item"
              isActive={view === 'Rubric guide'}
              onClick={() => go('Rubric guide')}
            >
              <BookOpen size={19} />
              <span>Rubric guide</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="sidebar-insight">
          <div className="small-icon">
            <Sparkles size={18} />
          </div>
          <strong>
            Better conversations.
            <br />
            Better care.
          </strong>
          <p>Turn every consultation into an opportunity to grow.</p>
          <button onClick={() => go('Patterns')}>
            Explore insights <ArrowRight size={15} />
          </button>
        </div>
      </SidebarContent>
      <SidebarFooter className="sidebar-footer">
        <div className="demo-status">
          <span /> Synthetic demo data
        </div>
        <div className="profile">
          <div className="avatar user-avatar">BD</div>
          <div>
            <strong>Bright Dental</strong>
            <span>Practice workspace</span>
          </div>
          <ShieldCheck size={18} />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
function Score({ value }: { value: number | null }) {
  return value === null ? (
    <span className="muted">Unscored</span>
  ) : (
    <span className={`score ${value < 3 ? 'score-low' : ''}`}>
      <span className="score-dot" />
      {value.toFixed(1)}
      <span>/ 5</span>
    </span>
  );
}
function OutcomeBadge({ outcome }: { outcome: Consultation['outcome'] }) {
  return (
    <span
      className={`status status-${outcome.toLowerCase().replaceAll(' ', '-')}`}
    >
      <span />
      {outcome}
    </span>
  );
}
function download(calls: Consultation[]) {
  const url = URL.createObjectURL(
    new Blob([csvExport(calls)], { type: 'text/csv;charset=utf-8;' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'consultiq-consultations.csv';
  a.click();
  URL.revokeObjectURL(url);
}
function CallsTable({
  calls,
  onOpen,
}: {
  calls: Consultation[];
  onOpen: (c: Consultation) => void;
}) {
  return (
    <Table className="calls-table">
      <TableHeader>
        <TableRow>
          <TableHead>Consultation</TableHead>
          <TableHead>Coordinator</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Rubric score</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead>
            <span className="sr-only">Open report</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {calls.map((c) => (
          <TableRow key={c.id}>
            <TableCell>
              <button className="call-link" onClick={() => onOpen(c)}>
                <span className="call-icon">
                  <AudioLines size={18} />
                </span>
                <span>
                  <strong>{c.title}</strong>
                  <small>
                    {c.id} <span>·</span>{' '}
                    {c.duration
                      ? `${Math.floor(c.duration / 60)}m ${c.duration % 60}s`
                      : 'Text transcript'}
                  </small>
                </span>
              </button>
            </TableCell>
            <TableCell>
              <div className="person">
                <span
                  className={`avatar avatar-${coordinators.indexOf(c.coordinator) % 4}`}
                >
                  {c.initials}
                </span>
                {c.coordinator}
              </div>
            </TableCell>
            <TableCell className="date-cell">
              {new Date(c.date + 'T12:00:00Z').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </TableCell>
            <TableCell>
              <Score value={averageScore(c)} />
            </TableCell>
            <TableCell>
              <OutcomeBadge outcome={c.outcome} />
            </TableCell>
            <TableCell>
              <button
                className="icon-button"
                aria-label={`Open ${c.id} report`}
                onClick={() => onOpen(c)}
              >
                <ArrowUpRight size={18} />
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
function PerformanceChart({ calls }: { calls: Consultation[] }) {
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const start = new Date(Date.UTC(2026, 7, 16 + i * 4))
      .toISOString()
      .slice(0, 10);
    const end = new Date(Date.UTC(2026, 7, 20 + i * 4))
      .toISOString()
      .slice(0, 10);
    const entries = calls.filter(
      (c) => c.source === 'Demo' && c.date >= start && c.date < end,
    );
    return {
      label: start.slice(5).replace('-', '/'),
      score: summarize(entries).score ?? 0,
    };
  });
  const points = buckets
    .map((b, i) => `${54 + i * 104},${207 - b.score * 31}`)
    .join(' ');
  return (
    <div className="performance-chart">
      <svg
        viewBox="0 0 620 237"
        aria-label={`Average rubric scores across chronological demo groups: ${buckets.map((b) => `${b.label}: ${b.score.toFixed(1)}`).join(', ')}`}
      >
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4369ed" stopOpacity=".17" />
            <stop offset="100%" stopColor="#4369ed" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[1, 2, 3, 4, 5].map((n) => (
          <g key={n}>
            <line
              x1="40"
              x2="594"
              y1={207 - n * 31}
              y2={207 - n * 31}
              stroke="#e9edf4"
              strokeDasharray="4 5"
            />
            <text x="13" y={211 - n * 31}>
              {n}.0
            </text>
          </g>
        ))}
        <polygon points={`54,192 ${points} 574,192`} fill="url(#chartFill)" />
        <polyline
          points={points}
          stroke="#4369ed"
          strokeWidth="3"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {buckets.map((b, i) => (
          <g key={i}>
            <circle
              cx={54 + i * 104}
              cy={207 - b.score * 31}
              r="4"
              fill="white"
              stroke="#4369ed"
              strokeWidth="2"
            />
            <text x={54 + i * 104} y="226" textAnchor="middle">
              {b.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
export default function Home() {
  const [importOpen, setImportOpen] = useState(false);
  const [view, setView] = useState<View>('Overview');
  const [calls, setCalls] = useState(demoCalls);
  const [query, setQuery] = useState('');
  const [coordinator, setCoordinator] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [selected, setSelected] = useState<Consultation | null>(null);
  const filtered = filterCalls(calls, query, coordinator, outcome);
  const stats = summarize(filtered);
  const navigate = (v: View) => {
    setView(v);
    setSelected(null);
    setQuery('');
    setCoordinator('all');
    setOutcome('all');
  };
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'open_demo_consultation',
            description:
              'Open a synthetic demo consultation report in the workspace. Use a demo call ID from CQ-1025 to CQ-1048.',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input: unknown) {
              if (
                !input ||
                typeof input !== 'object' ||
                !('id' in input) ||
                typeof input.id !== 'string' ||
                Object.keys(input).length !== 1
              )
                throw new Error('Expected a single string id.');
              const call = demoCalls.find((c) => c.id === input.id);
              if (!call) throw new Error('Demo consultation not found.');
              flushSync(() => {
                setView('Consultations');
                setSelected(call);
              });
              return {
                id: call.id,
                title: call.title,
                view: 'Call review',
                source: 'Demo',
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, []);
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '244px' } as React.CSSProperties}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Navigation view={view} onNavigate={navigate} count={calls.length} />
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger className="mobile-toggle" />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{selected ? 'Call review' : view}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span /> Demo environment
            </span>
            <span className="header-divider" />
            <span className="avatar user-avatar">BD</span>
          </div>
        </header>
        <main id="main" className="workspace">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR CONVERSATIONS, IN FOCUS</div>
              <h1>
                {selected
                  ? selected.title
                  : view === 'Overview'
                    ? 'A clearer picture. Better conversations.'
                    : view}
              </h1>
              <p>
                {selected
                  ? 'An evidence-led view of the conversation.'
                  : view === 'Overview'
                    ? 'See what’s working, find the opportunities, and help your team grow.'
                    : view === 'Coordinators'
                      ? 'Understand each coordinator’s strengths and where to focus next.'
                      : view === 'Patterns'
                        ? 'Look across conversations to find your next coaching opportunity.'
                        : view === 'Rubric guide'
                          ? 'A shared language for more thoughtful consultations.'
                          : 'Review the moments that shape each patient’s decision.'}
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => setImportOpen(true)}
            >
              <Plus size={18} /> New consultation
            </button>
          </div>
          {!selected && view !== 'Rubric guide' && (
            <div className="toolbar">
              <div className="toolbar-left">
                <span className="date-filter">
                  <CalendarDays size={16} /> Demo: Aug 16 – Sep 8, 2026
                </span>
                <NativeSelect
                  aria-label="Filter by coordinator"
                  value={coordinator}
                  onChange={(e) => setCoordinator(e.target.value)}
                >
                  <NativeSelectOption value="all">
                    All coordinators
                  </NativeSelectOption>
                  {coordinators.map((n) => (
                    <NativeSelectOption key={n} value={n}>
                      {n}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {view === 'Consultations' && (
                  <NativeSelect
                    aria-label="Filter by outcome"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                  >
                    <NativeSelectOption value="all">
                      All outcomes
                    </NativeSelectOption>
                    {['Accepted', 'Follow-up', 'Not accepted', 'Unscored'].map(
                      (o) => (
                        <NativeSelectOption key={o}>{o}</NativeSelectOption>
                      ),
                    )}
                  </NativeSelect>
                )}
              </div>
              <button
                className="quiet-button"
                onClick={() => download(filtered)}
              >
                <ArrowDownToLine size={16} /> Export report
              </button>
            </div>
          )}
          {!selected && view === 'Overview' && (
            <>
              <section className="metrics" aria-label="Workspace metrics">
                {[
                  {
                    label: 'Consultations reviewed',
                    value: stats.count,
                    detail: 'Across your selected coordinators',
                    icon: AudioLines,
                    tone: 'blue',
                  },
                  {
                    label: 'Average rubric score',
                    value: stats.score?.toFixed(1) ?? '—',
                    suffix: '/ 5',
                    detail: 'Across all eight dimensions',
                    icon: Activity,
                    tone: 'violet',
                  },
                  {
                    label: 'Case acceptance',
                    value:
                      stats.acceptance === null
                        ? '—'
                        : `${Math.round(stats.acceptance)}%`,
                    detail: 'Accepted / known outcomes',
                    icon: Target,
                    tone: 'green',
                  },
                  {
                    label: 'Coaching opportunities',
                    value: stats.needsReview,
                    detail: 'Calls with a dimension scored 2 or less',
                    icon: Lightbulb,
                    tone: 'amber',
                  },
                ].map(({ label, value, suffix, detail, icon: Icon, tone }) => (
                  <article className="metric-card" key={label}>
                    <div className="metric-label">
                      {label}
                      <span className={`metric-icon ${tone}`}>
                        <Icon size={18} />
                      </span>
                    </div>
                    <div className="metric-value">
                      {value}
                      <span>{suffix}</span>
                    </div>
                    <div className="metric-detail">{detail}</div>
                  </article>
                ))}
              </section>
              <section className="insights-grid">
                <article className="panel performance-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Conversation quality</h2>
                      <p>Average rubric score over the demo period</p>
                    </div>
                    <span className="chart-legend">
                      <i /> Rubric score
                    </span>
                  </div>
                  <PerformanceChart calls={filtered} />
                  <div className="chart-footer">
                    <ShieldCheck size={15} />
                    <span>
                      Illustrative scores. Select a consultation to inspect the
                      evidence.
                    </span>
                  </div>
                </article>
                <article className="focus-card">
                  <div className="focus-label">
                    <Sparkles size={16} /> COACHING SPOTLIGHT
                  </div>
                  <h2>
                    A good conversation
                    <br />
                    deserves a clear next step.
                  </h2>
                  <p>
                    Some demo calls end with “give us a call.” Turn an open
                    ending into a specific, shared commitment.
                  </p>
                  <div className="focus-dimension">
                    <span className="focus-icon">
                      <CalendarDays size={22} />
                    </span>
                    <div>
                      <strong>Follow-up commitment</strong>
                      <span>A small change with a clear action</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setView('Consultations');
                      setOutcome('Follow-up');
                    }}
                  >
                    Review follow-up calls <ArrowRight size={17} />
                  </button>
                </article>
              </section>
            </>
          )}
          {!selected && (view === 'Overview' || view === 'Consultations') && (
            <section className="panel recent-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    {view === 'Overview'
                      ? 'Recent consultations'
                      : 'Consultations'}{' '}
                    <span className="count-badge">{filtered.length}</span>
                  </h2>
                  <p>Every conversation has something to teach us.</p>
                </div>
                {view === 'Overview' ? (
                  <button
                    className="text-button"
                    onClick={() => navigate('Consultations')}
                  >
                    View all consultations <ArrowRight size={16} />
                  </button>
                ) : (
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search consultations…"
                      aria-label="Search consultations"
                    />
                  </label>
                )}
              </div>
              <CallsTable
                calls={view === 'Overview' ? filtered.slice(0, 5) : filtered}
                onOpen={(c) => {
                  setSelected(c);
                  setView('Consultations');
                }}
              />
              {filtered.length === 0 && (
                <div className="empty-state">
                  <Search />
                  <h3>No consultations found</h3>
                  <p>Try another name, treatment, or coordinator.</p>
                  <button
                    className="text-button"
                    onClick={() => navigate('Consultations')}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </section>
          )}
          {selected && (
            <CallReview
              key={selected.id}
              call={selected}
              onBack={() => setSelected(null)}
            />
          )}{' '}
          {!selected && view === 'Coordinators' && (
            <CoordinatorView
              calls={filtered}
              onReview={(name) => {
                setView('Consultations');
                setCoordinator(name);
              }}
            />
          )}
          {!selected && view === 'Patterns' && (
            <PatternView
              calls={filtered}
              onReview={() => {
                setView('Consultations');
                setOutcome('Follow-up');
              }}
            />
          )}
          {!selected && view === 'Rubric guide' && <RubricGuide />}
          <ImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            onImport={(call) => {
              setCalls((old) => [call, ...old]);
              setView('Consultations');
              setSelected(call);
              setQuery('');
              setCoordinator('all');
              setOutcome('all');
            }}
          />
          <footer className="workspace-footer">
            <span>
              <ShieldCheck size={14} /> Built around evidence. Designed for
              better care.
            </span>
            <span>Illustrative data · No real patient recordings</span>
          </footer>
        </main>
      </div>
    </SidebarProvider>
  );
}
