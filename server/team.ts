import { createHash, randomBytes } from 'node:crypto';
import {
  AppError,
  Repository,
  requiredText,
  type Database,
} from './repository.ts';
export type Role = 'owner' | 'reviewer' | 'viewer';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const denied = () =>
  new AppError(
    403,
    'access_denied',
    'You do not have permission for this workspace action.',
  );
export async function workspaceAccess(
  db: Database,
  userId: string,
  workspaceId?: string | null,
) {
  if (!workspaceId) {
    const repo = await Repository.forUser(db, userId);
    return { repo, role: 'owner' as Role };
  }
  const row = await db
    .prepare(
      `SELECT CASE WHEN w.owner_id=? THEN 'owner' ELSE m.role END AS role FROM workspaces w LEFT JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=? WHERE w.id=? AND (w.owner_id=? OR m.user_id=?)`,
    )
    .bind(userId, userId, workspaceId, userId, userId)
    .first<{ role: Role }>();
  if (!row || !['owner', 'reviewer', 'viewer'].includes(row.role))
    throw denied();
  return { repo: new Repository(db, workspaceId, userId), role: row.role };
}
export async function listWorkspaces(db: Database, userId: string) {
  await Repository.forUser(db, userId);
  return (
    await db
      .prepare(
        `SELECT w.id,w.name,CASE WHEN w.owner_id=? THEN 'owner' ELSE m.role END AS role FROM workspaces w LEFT JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=? WHERE w.owner_id=? OR m.user_id=? ORDER BY w.created_at,w.id`,
      )
      .bind(userId, userId, userId, userId)
      .all()
  ).results;
}
export function authorize(role: Role, method: string, path: string) {
  if (method === 'GET' || method === 'HEAD') return;
  if (role === 'viewer') throw denied();
  if (
    role !== 'owner' &&
    (method === 'DELETE' ||
      path === '/api/workspace' ||
      path.startsWith('/api/team') ||
      path === '/api/rubrics' ||
      path.startsWith('/api/library'))
  )
    throw denied();
}
export class Team {
  readonly repo: Repository;
  readonly actor: string;
  readonly role: Role;
  constructor(repo: Repository, actor: string, role: Role) {
    this.repo = repo;
    this.actor = actor;
    this.role = role;
  }
  async read() {
    const owner = await this.repo
      .statement(
        'SELECT owner_id AS user_id,created_at FROM workspaces WHERE id=?',
        this.repo.workspaceId,
      )
      .first();
    const members = await this.repo
      .statement(
        'SELECT user_id,role,created_at FROM workspace_members WHERE workspace_id=? ORDER BY created_at,id',
        this.repo.workspaceId,
      )
      .all();
    const invitations =
      this.role === 'owner'
        ? (
            await this.repo
              .statement(
                'SELECT id,invitee_id,role,expires_at FROM workspace_invitations WHERE workspace_id=? AND expires_at>? ORDER BY created_at,id',
                this.repo.workspaceId,
                new Date().toISOString(),
              )
              .all()
          ).results
        : [];
    return {
      members: [{ ...owner, role: 'owner' }, ...members.results],
      invitations,
    };
  }
  async invite(input: unknown) {
    if (this.role !== 'owner') throw denied();
    const data = input as { invitee_id?: unknown; role?: unknown };
    const user = requiredText(data?.invitee_id, 'Clerk user ID', 200);
    if (
      !/^user_[a-zA-Z0-9]+$/.test(user) ||
      !['reviewer', 'viewer'].includes(String(data?.role))
    )
      throw new AppError(
        422,
        'invalid_input',
        'Specify a Clerk user ID and reviewer or viewer role.',
      );
    if (user === this.actor)
      throw new AppError(
        409,
        'already_member',
        'The owner already has access.',
      );
    const token = randomBytes(32).toString('base64url');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 7 * 86400000).toISOString();
    const [saved] = await this.repo.db.batch([
      this.repo.statement(
        `INSERT INTO workspace_invitations(id,workspace_id,invitee_id,role,token_hash,expires_at,created_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=?) ON CONFLICT(workspace_id,invitee_id) DO UPDATE SET id=excluded.id,role=excluded.role,token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_at=excluded.created_at`,
        id,
        this.repo.workspaceId,
        user,
        data.role,
        hash(token),
        expires,
        now,
        this.repo.workspaceId,
        user,
      ),
      this.repo.statement(
        "INSERT INTO audit_events(id,workspace_id,action,entity_id,created_at,actor_id) SELECT ?,?,'invitation_created',?,?,? WHERE changes()>0",
        crypto.randomUUID(),
        this.repo.workspaceId,
        id,
        now,
        this.actor,
      ),
    ]);
    if (!saved.meta.changes)
      throw new AppError(
        409,
        'already_member',
        'This user is already a member.',
      );
    return { token, expires_at: expires };
  }
  async revokeInvitation(id: string) {
    if (this.role !== 'owner') throw denied();
    await this.repo.db.batch([
      this.repo.statement(
        'DELETE FROM workspace_invitations WHERE workspace_id=? AND id=?',
        this.repo.workspaceId,
        id,
      ),
      this.repo.statement(
        "INSERT INTO audit_events(id,workspace_id,action,entity_id,created_at,actor_id) SELECT ?,?,'invitation_revoked',?,?,? WHERE changes()>0",
        crypto.randomUUID(),
        this.repo.workspaceId,
        id,
        new Date().toISOString(),
        this.actor,
      ),
    ]);
    return { deleted: true };
  }
  async remove(userId: string) {
    if (this.role !== 'owner' || this.actor === userId) throw denied();
    const now = new Date().toISOString();
    await this.repo.db.batch([
      this.repo.statement(
        'DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?',
        this.repo.workspaceId,
        userId,
      ),
      this.repo.statement(
        "INSERT INTO audit_events(id,workspace_id,action,entity_id,created_at,actor_id) SELECT ?,?,'member_removed',?,?,? WHERE changes()>0",
        crypto.randomUUID(),
        this.repo.workspaceId,
        userId,
        now,
        this.actor,
      ),
      this.repo.statement(
        'DELETE FROM workspace_invitations WHERE workspace_id=? AND invitee_id=?',
        this.repo.workspaceId,
        userId,
      ),
      this.repo.statement(
        "UPDATE analysis_jobs SET status='cancelled',error_code='access_revoked',finished_at=? WHERE workspace_id=? AND requested_by=? AND status IN ('queued','running')",
        now,
        this.repo.workspaceId,
        userId,
      ),
    ]);
    return { deleted: true };
  }
}
export async function acceptInvitation(
  db: Database,
  userId: string,
  input: unknown,
) {
  const token = requiredText(
    (input as { token?: unknown })?.token,
    'invitation token',
    200,
  );
  if (!/^[a-zA-Z0-9_-]{43}$/.test(token))
    throw new AppError(
      422,
      'invalid_invitation',
      'The invitation is invalid or expired.',
    );
  // The token and verified invitee jointly authorize discovery of the target workspace.
  const invitation = await db
    .prepare(
      'SELECT id,workspace_id FROM workspace_invitations WHERE token_hash=? AND invitee_id=? AND expires_at>?',
    )
    .bind(hash(token), userId, new Date().toISOString())
    .first<{ id: string; workspace_id: string }>();
  if (!invitation)
    throw new AppError(
      404,
      'invalid_invitation',
      'The invitation is invalid or expired.',
    );
  const now = new Date().toISOString();
  const repo = new Repository(db, invitation.workspace_id, userId);
  const [saved] = await db.batch([
    repo.statement(
      "INSERT OR IGNORE INTO workspace_members(id,workspace_id,user_id,role,created_at) SELECT ?,workspace_id,invitee_id,role,? FROM workspace_invitations WHERE id=? AND workspace_id=? AND token_hash=? AND invitee_id=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')",
      crypto.randomUUID(),
      now,
      invitation.id,
      invitation.workspace_id,
      hash(token),
      userId,
    ),
    repo.statement(
      "INSERT INTO audit_events(id,workspace_id,action,entity_id,created_at,actor_id) SELECT ?,?,'member_joined',?,?,? WHERE changes()>0",
      crypto.randomUUID(),
      repo.workspaceId,
      userId,
      now,
      userId,
    ),
    repo.statement(
      'DELETE FROM workspace_invitations WHERE id=? AND workspace_id=? AND EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=?)',
      invitation.id,
      repo.workspaceId,
      repo.workspaceId,
      userId,
    ),
  ]);
  if (!saved.meta.changes)
    throw new AppError(
      409,
      'invitation_changed',
      'The invitation has changed. Refresh your workspace list before trying again.',
    );
  return { workspace_id: repo.workspaceId };
}
