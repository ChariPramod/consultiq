'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { SignInLink } from '../sign-in-link';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
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
import { api, ApiError, selectWorkspace, selectedWorkspace } from '@/lib/api';
import type { WorkspaceData } from '@/lib/product';
import { TranscriptDialog } from './components';
import Review from './review';
import { Knowledge, RubricEditor, WorkspaceSettings } from './settings';
import './product.css';
import { AnalysisActivity } from './activity';
import { Team } from './team';
import { ConsultationQueue } from './consultation-queue';
import { BulkImportDialog } from './bulk-import';
import { Insights } from './insights';
import { PracticeInbox } from './practice-inbox';
import { ReviewWorklist } from './review-worklist';
type View =
  | 'team'
  | 'activity'
  | 'overview'
  | 'consultations'
  | 'assignments'
  | 'practice'
  | 'knowledge'
  | 'rubric'
  | 'settings';
const navigation = [
  { id: 'overview', label: 'Workspace insights', icon: LayoutDashboard },
  { id: 'assignments', label: 'Assigned reviews', icon: ClipboardCheck },
  { id: 'practice', label: 'Practice inbox', icon: BookOpen },
  { id: 'consultations', label: 'Consultations', icon: AudioLines },
  { id: 'knowledge', label: 'Knowledge library', icon: BookOpen },
  { id: 'rubric', label: 'Review rubric', icon: Layers3 },
  { id: 'activity', label: 'Analysis activity', icon: ClipboardCheck },
  { id: 'team', label: 'Team access', icon: Users },
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
                aria-current={view === id ? 'page' : undefined}
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
  const [workspaces, setWorkspaces] = useState<
    { id: string; name: string; role: string }[]
  >([]);
  const [pollPaused, setPollPaused] = useState(false);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState('');
  const [signedOut, setSignedOut] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [queueVersion, setQueueVersion] = useState(0);
  const [coordinator, setCoordinator] = useState('');
  const reload = useCallback(async () => {
    try {
      const result = await api<WorkspaceData>('workspace');
      setData(result);
      setSignedOut(false);
      setAccessDenied(false);
      setError('');
    } catch (e) {
      if (e instanceof ApiError && [401, 403, 404].includes(e.status))
        setData(null);
      setAccessDenied(e instanceof ApiError && [403, 404].includes(e.status));
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
        setAccessDenied(
          error instanceof ApiError && [403, 404].includes(error.status),
        );
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
  useEffect(() => {
    let active = true;
    void api<{ workspaces: typeof workspaces }>('workspaces').then(
      (result) => {
        if (active) setWorkspaces(result.workspaces);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, []);
  const pending = !!data?.jobs.some(
    (job) => job.status === 'queued' || job.status === 'running',
  );
  useEffect(() => {
    if (!pending) return;
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!active) return;
      if (attempts === 0) setPollPaused(false);
      if (document.visibilityState === 'visible') {
        attempts++;
        try {
          await reload();
        } catch {
          /* Keep loaded records and show the refresh error. */
        }
      }
      if (!active) return;
      if (attempts < 24) timer = setTimeout(poll, 5000);
      else setPollPaused(true);
    };
    timer = setTimeout(poll, 5000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pending, reload]);
  const navigate = (
    next: View,
    callId: string | null = null,
    tab?: 'practice' | 'assessment',
  ) => {
    setCoordinator('');
    const url = new URL(location.href);
    url.searchParams.set('view', next);
    if (tab) url.searchParams.set('tab', tab);
    else url.searchParams.delete('tab');
    if (callId) url.searchParams.set('call', callId);
    else url.searchParams.delete('call');
    history.pushState({}, '', url);
    dispatchEvent(new Event('consultiq:navigate'));
    window.scrollTo({ top: 0 });
  };
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
          <div className="flex items-center gap-3">
            {!!workspaces.length && (
              <NativeSelect
                aria-label="Active workspace; switching clears drafts"
                value={
                  data?.workspace.id ?? selectedWorkspace() ?? workspaces[0].id
                }
                onChange={(event) => {
                  if (
                    window.confirm(
                      'Switch workspace? Any unsaved drafts will be discarded.',
                    )
                  )
                    try {
                      selectWorkspace(event.target.value);
                    } catch {
                      setError(
                        'Your browser blocked workspace selection. Enable session storage and try again.',
                      );
                    }
                }}
              >
                {workspaces.map((workspace) => (
                  <NativeSelectOption key={workspace.id} value={workspace.id}>
                    {workspace.name} · {workspace.role}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            <span className="private-indicator">
              <LockIcon /> Private
            </span>
          </div>
        </header>
        <main id="workspace-content" className="product-content">
          {pending && (
            <output className="block mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
              Analysis is queued or running.{' '}
              {pollPaused
                ? 'Automatic refresh paused. Open Analysis activity and refresh to check results.'
                : 'This view checks for updates while the tab is visible.'}
            </output>
          )}
          {data?.access.role === 'viewer' && (
            <p className="mb-4 rounded-lg bg-slate-100 p-3 text-sm">
              Viewer access: you can inspect records. Editing requires a
              reviewer or owner role.
            </p>
          )}
          {error && (
            <div className="product-error" role="alert">
              <p>{error}</p>
              {accessDenied && (
                <button
                  onClick={() => {
                    try {
                      selectWorkspace('');
                    } catch {
                      setError(
                        'Enable browser session storage to return to your personal workspace.',
                      );
                    }
                  }}
                >
                  Return to personal workspace
                </button>
              )}
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
                            : view === 'assignments'
                              ? 'Clear ownership, due dates, and human-reviewed completion.'
                              : view === 'practice'
                                ? 'Follow through on practice across every conversation in your workspace.'
                                : view === 'knowledge'
                                  ? 'Approved guidance for grounded consultation coaching.'
                                  : view === 'rubric'
                                    ? 'Define the standard used to assess each conversation.'
                                    : view === 'team'
                                      ? 'Manage membership and join shared review workspaces.'
                                      : 'Manage your workspace and review integration readiness.'}
                  </p>
                </div>
                {!selected &&
                  data.access.role !== 'viewer' &&
                  ['overview', 'consultations', 'assignments'].includes(
                    view,
                  ) && (
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
                  key={`${data.workspace.id}:${selected}:${params.get('tab')}`}
                  initialTab={
                    params.get('tab') === 'practice'
                      ? 'practice'
                      : params.get('tab') === 'assessment'
                        ? 'assessment'
                        : 'transcript'
                  }
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
                      onImport={() => {
                        if (data.access.role !== 'viewer') setImportOpen(true);
                      }}
                      navigate={navigate}
                      onOpenCoordinator={(name) => {
                        navigate('consultations');
                        setCoordinator(name);
                      }}
                    />
                  )}
                  {view === 'consultations' && (
                    <ConsultationQueue
                      key={`${queueVersion}:${coordinator}`}
                      coordinator={coordinator}
                      readOnly={data.access.role === 'viewer'}
                      onOpen={(id) => navigate('consultations', id)}
                      onImport={() => setImportOpen(true)}
                      onBulkImport={() => setBulkOpen(true)}
                    />
                  )}
                  {view === 'practice' && (
                    <PracticeInbox
                      onOpen={(id) => navigate('consultations', id, 'practice')}
                    />
                  )}
                  {view === 'assignments' && (
                    <ReviewWorklist
                      onOpen={(id) =>
                        navigate('consultations', id, 'assessment')
                      }
                    />
                  )}
                  {view === 'knowledge' && (
                    <Knowledge data={data} reload={reload} />
                  )}
                  {view === 'team' && <Team data={data} />}
                  {view === 'rubric' && data.access.role === 'owner' && (
                    <RubricEditor current={data.rubric} reload={reload} />
                  )}
                  {(view === 'rubric' || view === 'settings') &&
                    data.access.role !== 'owner' && (
                      <p className="product-notice">
                        Only the workspace owner can change these settings.
                      </p>
                    )}
                  {view === 'settings' && data.access.role === 'owner' && (
                    <WorkspaceSettings data={data} reload={reload} />
                  )}
                </>
              )}
              {data.access.role !== 'viewer' && (
                <BulkImportDialog
                  open={bulkOpen}
                  onOpenChange={setBulkOpen}
                  onImported={async () => {
                    try {
                      await reload();
                    } finally {
                      setQueueVersion((v) => v + 1);
                    }
                  }}
                />
              )}
              <TranscriptDialog
                open={importOpen}
                onOpenChange={setImportOpen}
                onInspect={() => {
                  // An uncertain import may have committed after this queue loaded.
                  setQueueVersion((version) => version + 1);
                  navigate('consultations');
                }}
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
  onOpenCoordinator,
}: {
  data: WorkspaceData;
  onImport: () => void;
  navigate: (view: View, callId?: string) => void;
  onOpenCoordinator: (name: string) => void;
}) {
  return (
    <div className="space-y-6">
      {(!data.rubric || !data.total || !data.documents.length) && (
        <section className="setup-panel">
          <div>
            <span className="product-eyebrow">YOUR FIRST REVIEW SESSION</span>
            <h2>Build a shared review standard.</h2>
            <p>
              Manual reviews work without a model account. Coaching uses your
              approved reference material.
            </p>
          </div>
          <div className="setup-checklist">
            {[
              {
                label: 'Publish your approved rubric',
                done: !!data.rubric,
                enabled: data.access.role === 'owner',
                action: () => navigate('rubric'),
              },
              {
                label: 'Import a role-play transcript',
                done: !!data.total,
                enabled: data.access.role !== 'viewer',
                action: onImport,
              },
              {
                label: 'Add approved coaching guidance',
                done: !!data.documents.length,
                enabled: data.access.role === 'owner',
                action: () => navigate('knowledge'),
              },
            ].map((item) => (
              <button
                key={item.label}
                disabled={!item.enabled}
                onClick={item.action}
              >
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
      <Insights
        onOpenCoordinator={onOpenCoordinator}
        onOpenQueue={() => navigate('consultations')}
        onImport={data.access.role === 'viewer' ? undefined : onImport}
      />
    </div>
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
