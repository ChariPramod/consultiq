'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { SignInLink } from '../sign-in-link';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  LayoutDashboard,
  Layers3,
  Plus,
  Settings2,
  ShieldCheck,
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
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { api, ApiError } from '@/lib/api';
import {
  DIMENSIONS,
  OUTCOME_LABELS,
  csv,
  type WorkspaceData,
  type CallRecord,
} from '@/lib/product';
import { CallTable, Empty, SearchField, TranscriptDialog } from './components';
import Review from './review';
import { Knowledge, RubricEditor, WorkspaceSettings } from './settings';
import './product.css';
import { AnalysisActivity } from './activity';
type View =
  | 'activity'
  | 'overview'
  | 'consultations'
  | 'coordinators'
  | 'patterns'
  | 'knowledge'
  | 'rubric'
  | 'settings';
const navigation = [
  { id: 'activity', label: 'Analysis activity', icon: ClipboardCheck },
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'consultations', label: 'Consultations', icon: AudioLines },
  { id: 'coordinators', label: 'Coordinators', icon: Users },
  { id: 'patterns', label: 'Patterns', icon: ChartNoAxesCombined },
  { id: 'knowledge', label: 'Knowledge library', icon: BookOpen },
  { id: 'rubric', label: 'Review rubric', icon: Layers3 },
  { id: 'settings', label: 'Workspace settings', icon: Settings2 },
] as const;
function Navigation({
  view,
  data,
  onNavigate,
}: {
  view: View;
  data: WorkspaceData | null;
  onNavigate: (view: View) => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar className="product-sidebar">
      <SidebarHeader>
        <Link href="/" className="product-brand">
          <AudioLines size={25} />
          <span>
            Consult<span>IQ</span>
          </span>
        </Link>
        <div className="product-workspace-badge">
          <span>{(data?.workspace.name ?? 'W')[0]}</span>
          <div>
            <strong>{data?.workspace.name ?? 'Workspace'}</strong>
            <small>Private workspace</small>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <div className="product-nav-label">WORKSPACE</div>
        <SidebarMenu className="product-navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <SidebarMenuItem
              key={id}
              className={id === 'knowledge' ? 'nav-section-break' : ''}
            >
              <SidebarMenuButton
                isActive={view === id}
                className="product-nav-item"
                onClick={() => {
                  onNavigate(id);
                  setOpenMobile(false);
                }}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === 'consultations' && !!data?.total && (
                  <small>{data.total}</small>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <div className="product-sidebar-footer">
          <ShieldCheck size={17} />
          <div>
            <strong>Evidence-led reviews</strong>
            <span>Your records stay in your workspace.</span>
          </div>
        </div>
        <Link className="product-back-site" href="/">
          <ArrowLeft size={14} /> Back to ConsultIQ
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
export default function Workspace() {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState('');
  const [signedOut, setSignedOut] = useState(false);
  const search = useSyncExternalStore(
    subscribeLocation,
    () => location.search,
    () => '',
  );
  const params = new URLSearchParams(search);
  const rawView = params.get('view');
  const view: View = navigation.some((n) => n.id === rawView)
    ? (rawView as View)
    : 'overview';
  const selected = params.get('call');
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coordinator, setCoordinator] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const reload = useCallback(async () => {
    try {
      const result = await api<WorkspaceData>('workspace');
      setData(result);
      setSignedOut(false);
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setData(null);
      setSignedOut(e instanceof ApiError && e.status === 401);
      setError(
        e instanceof Error ? e.message : 'Unable to open the workspace.',
      );
      throw e;
    }
  }, []);
  useEffect(() => {
    let active = true;
    void api<WorkspaceData>('workspace').then(
      (result) => {
        if (active) setData(result);
      },
      (error: unknown) => {
        if (!active) return;
        setSignedOut(error instanceof ApiError && error.status === 401);
        setError(
          error instanceof Error
            ? error.message
            : 'Unable to open the workspace.',
        );
      },
    );
    return () => {
      active = false;
    };
  }, []);
  const navigate = (next: View, callId: string | null = null) => {
    setQuery('');
    setCoordinator('all');
    setOutcome('all');
    const url = new URL(location.href);
    url.searchParams.set('view', next);
    if (callId) url.searchParams.set('call', callId);
    else url.searchParams.delete('call');
    history.pushState({}, '', url);
    dispatchEvent(new Event('consultiq:navigate'));
    window.scrollTo({ top: 0 });
  };
  const calls = (data?.calls ?? []).filter(
    (c) =>
      (coordinator === 'all' || c.coordinator === coordinator) &&
      (outcome === 'all' || c.outcome === outcome) &&
      `${c.title} ${c.coordinator}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const title = selected
    ? 'Consultation review'
    : navigation.find((n) => n.id === view)!.label;
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '246px' } as React.CSSProperties}
      className="product"
    >
      <a className="skip-link" href="#workspace-content">
        Skip to content
      </a>
      <Navigation view={view} data={data} onNavigate={navigate} />
      <div className="product-main">
        <header className="product-topbar">
          <div>
            <SidebarTrigger className="product-menu-toggle" />
            <span>{data?.workspace.name ?? 'Workspace'}</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <span className="private-indicator">
            <LockIcon /> Private
          </span>
        </header>
        <main id="workspace-content" className="product-content">
          {error && (
            <div className="product-error" role="alert">
              <p>{error}</p>
              {signedOut ? (
                <SignInLink>Sign in again</SignInLink>
              ) : (
                <button onClick={() => void reload().catch(() => {})}>
                  Retry
                </button>
              )}
            </div>
          )}
          {!data && !error && (
            <output
              className="loading-workspace"
              aria-label="Loading workspace"
            >
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-80 w-full" />
            </output>
          )}
          {data && (
            <>
              <div className="product-page-heading">
                <div>
                  <div className="product-eyebrow">
                    {selected
                      ? 'EVIDENCE & ASSESSMENT'
                      : 'CONSULTATION INTELLIGENCE'}
                  </div>
                  <h1>{title}</h1>
                  <p>
                    {selected
                      ? 'A complete record of the conversation and its review.'
                      : view === 'activity'
                        ? 'Inspect recent runs and recover with a clear record of what happened.'
                        : view === 'overview'
                          ? 'Review conversations, track assessments, and identify the next coaching action.'
                          : view === 'consultations'
                            ? 'Your consultation records and their assessment history.'
                            : view === 'coordinators'
                              ? 'Compare supported assessments across your saved consultations.'
                              : view === 'patterns'
                                ? 'Explore the behaviors recorded in your reviewed conversations.'
                                : view === 'knowledge'
                                  ? 'Approved guidance for grounded consultation coaching.'
                                  : view === 'rubric'
                                    ? 'Define the standard used to assess each conversation.'
                                    : 'Manage your workspace and review integration readiness.'}
                  </p>
                </div>
                {!selected &&
                  [
                    'overview',
                    'consultations',
                    'coordinators',
                    'patterns',
                  ].includes(view) && (
                    <button
                      className="primary-button"
                      onClick={() => setImportOpen(true)}
                    >
                      <Plus size={17} /> Import transcript
                    </button>
                  )}
              </div>
              {selected ? (
                <Review
                  key={selected}
                  callId={selected}
                  data={data}
                  onChanged={reload}
                  onBack={() => navigate('consultations')}
                  onDeleted={async () => {
                    await reload();
                    navigate('consultations');
                  }}
                  onConfigure={() => navigate('rubric')}
                />
              ) : (
                <>
                  {view === 'activity' && (
                    <AnalysisActivity
                      data={data}
                      reload={reload}
                      openCall={(id) => navigate('consultations', id)}
                      openLibrary={() => navigate('knowledge')}
                    />
                  )}
                  {view === 'overview' && (
                    <Overview
                      data={data}
                      onImport={() => setImportOpen(true)}
                      navigate={navigate}
                    />
                  )}
                  {view === 'consultations' && (
                    <>
                      <div className="product-filters">
                        <SearchField value={query} onChange={setQuery} />
                        <NativeSelect
                          aria-label="Filter by coordinator"
                          value={coordinator}
                          onChange={(e) => setCoordinator(e.target.value)}
                        >
                          <NativeSelectOption value="all">
                            All coordinators
                          </NativeSelectOption>
                          {[...new Set(data.calls.map((c) => c.coordinator))]
                            .sort()
                            .map((name) => (
                              <NativeSelectOption key={name}>
                                {name}
                              </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        <NativeSelect
                          aria-label="Filter by outcome"
                          value={outcome}
                          onChange={(e) => setOutcome(e.target.value)}
                        >
                          <NativeSelectOption value="all">
                            All outcomes
                          </NativeSelectOption>
                          {Object.entries(OUTCOME_LABELS).map(
                            ([value, label]) => (
                              <NativeSelectOption key={value} value={value}>
                                {label}
                              </NativeSelectOption>
                            ),
                          )}
                        </NativeSelect>
                        <button
                          className="secondary-button export-button"
                          disabled={!calls.length}
                          onClick={() => {
                            const url = URL.createObjectURL(
                              new Blob([csv(calls)], {
                                type: 'text/csv;charset=utf-8',
                              }),
                            );
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'consultiq-consultations.csv';
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          <ArrowDownToLine size={16} /> Export
                        </button>
                      </div>
                      <section className="product-panel">
                        {calls.length ? (
                          <CallTable
                            calls={calls}
                            onOpen={(id) => navigate('consultations', id)}
                          />
                        ) : (
                          <Empty
                            title={
                              data.calls.length
                                ? 'No matching consultations'
                                : 'Your consultation history starts here'
                            }
                            description={
                              data.calls.length
                                ? 'Try different filters or search terms.'
                                : 'Import a speaker-labeled transcript to create a permanent record and begin a review.'
                            }
                            action={
                              <button
                                className="primary-button"
                                onClick={() =>
                                  data.calls.length
                                    ? (setQuery(''),
                                      setCoordinator('all'),
                                      setOutcome('all'))
                                    : setImportOpen(true)
                                }
                              >
                                {data.calls.length
                                  ? 'Clear filters'
                                  : 'Import transcript'}
                                <ArrowRight size={16} />
                              </button>
                            }
                          />
                        )}
                      </section>
                      <p className="list-caption">
                        Showing {calls.length} of {data.total} consultations
                        {data.total > 200
                          ? ' · Most recent records loaded'
                          : ''}
                        .
                      </p>
                    </>
                  )}
                  {view === 'coordinators' && (
                    <Coordinators
                      calls={data.calls}
                      onOpen={(name) => {
                        navigate('consultations');
                        setCoordinator(name);
                      }}
                    />
                  )}
                  {view === 'patterns' && <Patterns calls={data.calls} />}
                  {view === 'knowledge' && (
                    <Knowledge data={data} reload={reload} />
                  )}
                  {view === 'rubric' && (
                    <RubricEditor current={data.rubric} reload={reload} />
                  )}
                  {view === 'settings' && (
                    <WorkspaceSettings data={data} reload={reload} />
                  )}
                </>
              )}
              <TranscriptDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                onCreated={async (call) => {
                  await reload();
                  navigate('consultations', call.id);
                }}
              />
              <footer className="product-footer">
                <span>
                  <ShieldCheck size={14} /> Source-linked assessments. Preserved
                  review history.
                </span>
                <span>Synthetic and role-play pilot</span>
              </footer>
            </>
          )}
        </main>
      </div>
    </SidebarProvider>
  );
}
function LockIcon() {
  return <ShieldCheck size={14} />;
}
function Overview({
  data,
  onImport,
  navigate,
}: {
  data: WorkspaceData;
  onImport: () => void;
  navigate: (view: View, callId?: string) => void;
}) {
  const complete = data.calls.filter(
    (c) => c.latest?.content.supported_count === 8,
  );
  const unreviewed = data.calls.filter((c) => !c.latest);
  const supported = complete.length
    ? complete.reduce((sum, c) => sum + c.latest!.content.average!, 0) /
      complete.length
    : null;
  return (
    <>
      <section className="product-metrics">
        {[
          {
            label: 'Consultations',
            value: data.total,
            detail: 'Saved in your workspace',
            icon: AudioLines,
          },
          {
            label: 'Awaiting review',
            value: unreviewed.length,
            detail: 'No assessment recorded',
            icon: ClipboardCheck,
          },
          {
            label: 'Complete assessments',
            value: complete.length,
            detail: 'Evidence for every dimension',
            icon: FileCheck2,
          },
          {
            label: 'Average supported score',
            value: supported?.toFixed(1) ?? 'Not available',
            detail: 'Complete assessments only',
            icon: ChartNoAxesCombined,
          },
        ].map(({ label, value, detail, icon: Icon }) => (
          <article key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong
              className={
                typeof value === 'string' && value.length > 5
                  ? 'metric-text'
                  : ''
              }
            >
              {value}
            </strong>
            <p>{detail}</p>
          </article>
        ))}
      </section>
      {(!data.rubric || !data.calls.length || !data.documents.length) && (
        <section className="setup-panel">
          <div>
            <span className="product-eyebrow">BUILD YOUR REVIEW PRACTICE</span>
            <h2>A clear standard for every conversation.</h2>
            <p>Prepare the material and criteria your assessments will use.</p>
          </div>
          <div className="setup-checklist">
            {[
              {
                label: 'Publish your review rubric',
                done: !!data.rubric,
                action: () => navigate('rubric'),
              },
              {
                label: 'Import your first transcript',
                done: !!data.calls.length,
                action: onImport,
              },
              {
                label: 'Add approved coaching guidance',
                done: !!data.documents.length,
                action: () => navigate('knowledge'),
              },
            ].map((item) => (
              <button key={item.label} onClick={item.action}>
                <span className={item.done ? 'done' : ''}>
                  {item.done ? <Check size={13} /> : <ChevronRight size={13} />}
                </span>
                {item.label}
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="product-panel">
        <div className="product-panel-heading">
          <div>
            <h2>Recent consultations</h2>
            <p>Open a conversation to review the evidence.</p>
          </div>
          <button
            className="text-button"
            onClick={() => navigate('consultations')}
          >
            View all <ArrowRight size={16} />
          </button>
        </div>
        {data.calls.length ? (
          <CallTable
            calls={data.calls.slice(0, 6)}
            onOpen={(id) => navigate('consultations', id)}
          />
        ) : (
          <Empty
            icon={AudioLines}
            title="Begin with a conversation"
            description="Import a synthetic or role-play transcript. It will stay in your workspace, ready for review."
            action={
              <button className="primary-button" onClick={onImport}>
                <Plus size={17} /> Import transcript
              </button>
            }
          />
        )}
      </section>
    </>
  );
}
function Coordinators({
  calls,
  onOpen,
}: {
  calls: CallRecord[];
  onOpen: (name: string) => void;
}) {
  const names = [...new Set(calls.map((c) => c.coordinator))].sort();
  if (!names.length)
    return (
      <section className="product-panel">
        <Empty
          icon={Users}
          title="Coordinator profiles appear with your consultations"
          description="Import a transcript with a coordinator name to begin tracking their reviewed conversations."
        />
      </section>
    );
  return (
    <div className="product-coordinators">
      {names.map((name) => {
        const own = calls.filter((c) => c.coordinator === name);
        const reviewed = own.filter((c) => c.latest);
        return (
          <article className="product-panel coordinator-profile" key={name}>
            <div className="coordinator-profile-heading">
              <span className="coordinator-monogram">
                {name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div>
                <h2>{name}</h2>
                <p>
                  {own.length} consultations · {reviewed.length} reviewed
                </p>
              </div>
            </div>
            <div className="product-dimension-bars">
              {DIMENSIONS.map((d, i) => {
                const scores = reviewed
                  .map((c) => c.latest!.content.dimensions[i].score)
                  .filter((s): s is number => s !== null);
                const average = scores.length
                  ? scores.reduce((a, b) => a + b, 0) / scores.length
                  : null;
                return (
                  <div key={d}>
                    <span>{d}</span>
                    <div>
                      <Progress
                        value={(average ?? 0) * 20}
                        aria-label={`${d}: ${average?.toFixed(1) ?? 'not assessed'}`}
                      />
                      <strong>{average?.toFixed(1) ?? 'N/A'}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="text-button" onClick={() => onOpen(name)}>
              Review consultations <ArrowRight size={15} />
            </button>
          </article>
        );
      })}
    </div>
  );
}
function Patterns({ calls }: { calls: CallRecord[] }) {
  const reviewed = calls.filter((c) => c.latest);
  if (!reviewed.length)
    return (
      <section className="product-panel">
        <Empty
          icon={ChartNoAxesCombined}
          title="Patterns start with reviewed conversations"
          description="Record assessments with supporting evidence to compare rubric dimensions across your consultations."
        />
      </section>
    );
  return (
    <section className="product-panel pattern-report">
      <div className="product-panel-heading">
        <div>
          <h2>Rubric dimension overview</h2>
          <p>
            Supported scores across {reviewed.length} reviewed consultations.
          </p>
        </div>
      </div>
      <div className="product-pattern-bars">
        {DIMENSIONS.map((d, i) => {
          const values = reviewed
            .map((c) => c.latest!.content.dimensions[i].score)
            .filter((s): s is number => s !== null);
          const mean = values.length
            ? values.reduce((a, b) => a + b, 0) / values.length
            : null;
          return (
            <div key={d}>
              <span>{d}</span>
              <Progress
                value={(mean ?? 0) * 20}
                aria-label={`${d}: ${mean?.toFixed(1) ?? 'unavailable'}`}
              />
              <strong>{mean?.toFixed(1) ?? 'N/A'}</strong>
              <small>{values.length} supported</small>
            </div>
          );
        })}
      </div>
      <p className="product-notice">
        <ShieldCheck size={17} />
        These are descriptive averages of your assessments. They do not
        establish causation or predict patient outcomes.
      </p>
    </section>
  );
}

function subscribeLocation(callback: () => void) {
  addEventListener('popstate', callback);
  addEventListener('consultiq:navigate', callback);
  return () => {
    removeEventListener('popstate', callback);
    removeEventListener('consultiq:navigate', callback);
  };
}
