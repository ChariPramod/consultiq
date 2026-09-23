'use client';
import { useCallback, useEffect, useState } from 'react';
import { Users, UserPlus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { api, selectWorkspace } from '@/lib/api';
import type { WorkspaceData } from '@/lib/product';

type TeamData = {
  members: { user_id: string; role: string; created_at: string }[];
  invitations: {
    id: string;
    invitee_id: string;
    role: string;
    expires_at: string;
  }[];
};
export function Team({ data }: { data: WorkspaceData }) {
  const [team, setTeam] = useState<TeamData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [invitee, setInvitee] = useState('');
  const [role, setRole] = useState<'reviewer' | 'viewer'>('reviewer');
  const [issued, setIssued] = useState<{
    token: string;
    expires_at: string;
  } | null>(null);
  const [token, setToken] = useState('');
  const owner = data.access.role === 'owner';
  const reload = useCallback(
    async () => setTeam(await api<TeamData>('team')),
    [],
  );
  useEffect(() => {
    let active = true;
    void api<TeamData>('team').then(
      (value) => {
        if (active) setTeam(value);
      },
      (e) => {
        if (active)
          setError(e instanceof Error ? e.message : 'Could not load members.');
      },
    );
    return () => {
      active = false;
    };
  }, []);
  async function change(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Team change failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <Users className="text-sky-700" />
          <h2 className="text-xl font-semibold">Workspace access</h2>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Your role: <strong>{data.access.role}</strong>. Owners manage access
          and workspace settings. Reviewers can work on consultations. Viewers
          can read records.
        </p>
        <p className="mt-3 break-all text-sm text-slate-600">
          Your user ID: <code>{data.access.user_id}</code>
        </p>
        <div className="mt-4 flex gap-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <ShieldCheck className="shrink-0" size={18} />
          <p>
            This pilot requires every member to be included in the deployment
            owner’s allowed user IDs. A workspace invitation does not grant
            access to the deployment by itself.
          </p>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        {!team && !error && (
          <output className="block mt-4 text-sm">Loading members…</output>
        )}
        {team && (
          <ul className="mt-5 divide-y divide-slate-100">
            {team.members.map((member) => (
              <li
                key={member.user_id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm">
                    {member.user_id}
                  </p>
                  <p className="text-sm text-slate-500">{member.role}</p>
                </div>
                {owner && member.role !== 'owner' && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Remove this member’s access to this workspace?',
                        )
                      )
                        void change(async () => {
                          await api(
                            `team/members/${encodeURIComponent(member.user_id)}`,
                            'DELETE',
                          );
                          await reload();
                        });
                    }}
                  >
                    Remove member
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <Button
          className="mt-4"
          variant="outline"
          disabled={busy}
          onClick={() => void change(reload)}
        >
          Refresh members
        </Button>
      </section>
      {owner && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <UserPlus size={20} /> Invite a colleague
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Use their exact Clerk user ID. Share the invitation token privately
            with that person; only that signed-in user can accept it.
          </p>
          <form
            className="mt-5 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void change(async () => {
                setIssued(null);
                const result = await api<{ token: string; expires_at: string }>(
                  'team/invitations',
                  'POST',
                  { invitee_id: invitee.trim(), role },
                );
                setIssued(result);
                setInvitee('');
                await reload();
              });
            }}
          >
            <label
              htmlFor="team-invitee"
              className="grid gap-2 text-sm font-medium"
            >
              Clerk user ID
              <Input
                id="team-invitee"
                value={invitee}
                onChange={(e) => setInvitee(e.target.value)}
                placeholder="user_…"
                required
                maxLength={200}
              />
            </label>
            <label
              htmlFor="team-role"
              className="grid gap-2 text-sm font-medium"
            >
              Role
              <NativeSelect
                id="team-role"
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                <NativeSelectOption value="reviewer">
                  Reviewer
                </NativeSelectOption>
                <NativeSelectOption value="viewer">Viewer</NativeSelectOption>
              </NativeSelect>
            </label>
            <Button disabled={busy || !invitee.trim()} type="submit">
              Create invitation
            </Button>
          </form>
          {issued && (
            <output className="block mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-950">
              <p>
                Invitation created. Copy this token now; it is not shown again
                after leaving this page.
              </p>
              <textarea
                className="mt-3 w-full rounded border bg-white p-3 font-mono text-xs"
                aria-label="Invitation token"
                readOnly
                value={issued.token}
              />
              <p className="mt-2">
                Expires {new Date(issued.expires_at).toLocaleString()}.
              </p>
            </output>
          )}
          {!!team?.invitations.length && (
            <div className="mt-6">
              <h3 className="font-medium">Pending invitations</h3>
              <ul className="divide-y divide-slate-100">
                {team.invitations.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="min-w-0">
                      <p className="break-all font-mono text-sm">
                        {invitation.invitee_id}
                      </p>
                      <p className="text-sm text-slate-500">
                        {invitation.role} · expires{' '}
                        {new Date(invitation.expires_at).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void change(async () => {
                          await api(
                            `team/invitations/${invitation.id}`,
                            'DELETE',
                          );
                          await reload();
                        })
                      }
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Join another workspace</h2>
        <p className="mt-2 text-sm text-slate-600">
          Paste a token shared by its owner. Accepting switches your active
          workspace and clears open drafts.
        </p>
        <form
          className="mt-4 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void change(async () => {
              const result = await api<{ workspace_id: string }>(
                'team/accept',
                'POST',
                { token: token.trim() },
              );
              selectWorkspace(result.workspace_id);
            });
          }}
        >
          <label
            htmlFor="team-token"
            className="grid gap-2 text-sm font-medium"
          >
            Invitation token
            <Input
              id="team-token"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              maxLength={500}
            />
          </label>
          <Button disabled={busy || !token.trim()} type="submit">
            Accept invitation
          </Button>
        </form>
      </section>
    </div>
  );
}
