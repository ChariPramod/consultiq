import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function boundedJson(response) {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel();
    throw new Error('Unexpected content type');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512000) throw new Error('Response too large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/** Opt-in synthetic writes only; never discovers existing records for deletion. */
export async function verifyHostedWorkflow(
  env,
  { write = false, fetcher = fetch } = {},
) {
  const checks = [];
  const add = (name, status) => checks.push({ name, status });
  const base = new URL(
    env.HOSTED_BASE_URL ?? 'https://consultiq-ecru.vercel.app',
  );
  if (
    base.protocol !== 'https:' ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  )
    throw new Error('HTTPS origin required');
  const token = env.HOSTED_SESSION_TOKEN?.trim();
  const workspace = env.HOSTED_WORKSPACE_ID?.trim();
  if (!write || !token || !workspace) {
    add('write-authorization-and-configuration', 'not-verified');
    return { ok: false, exitCode: 2, checks, cleanup: 'not-needed' };
  }
  const request = async (
    path,
    method = 'GET',
    data,
    session = token,
    scoped = true,
  ) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetcher(new URL(path, base), {
        method,
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${session}`,
          Origin: base.origin,
          ...(scoped ? { 'X-Workspace-Id': workspace } : {}),
          ...(data ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      return { status: response.status, data: await boundedJson(response) };
    } finally {
      clearTimeout(timer);
    }
  };
  let id = null;
  let createAttempted = false;
  let cleanup = 'not-needed';
  let stage = 'owner-access';
  try {
    const access = await request(
      '/api/workspaces',
      'GET',
      undefined,
      token,
      false,
    );
    if (
      access.status !== 200 ||
      !access.data.workspaces?.some(
        (item) => item.id === workspace && item.role === 'owner',
      )
    )
      throw new Error('Owner access required for cleanup');
    add(stage, 'pass');
    stage = 'synthetic-create';
    const marker = `Synthetic operations check ${randomUUID()}`;
    createAttempted = true;
    const created = await request('/api/consultations', 'POST', {
      title: marker,
      coordinator: 'Synthetic operations check',
      source: 'synthetic',
      recorded_at: new Date().toISOString().slice(0, 10),
      transcript:
        'Coordinator: This is a synthetic persistence check.\nPatient: I understand this is not a real consultation.',
    });
    const valid = (record) =>
      record?.id === id &&
      record.workspace_id === workspace &&
      record.title === marker &&
      record.source === 'synthetic' &&
      Array.isArray(record.turns) &&
      record.turns.length === 2 &&
      record.turns[0]?.role === 'Coordinator' &&
      record.turns[0]?.text === 'This is a synthetic persistence check.' &&
      record.turns[1]?.role === 'Patient' &&
      record.turns[1]?.text === 'I understand this is not a real consultation.';
    if (
      created.status !== 201 ||
      !/^[0-9a-f-]{36}$/i.test(created.data.id ?? '') ||
      created.data.title !== marker ||
      created.data.workspace_id !== workspace ||
      created.data.source !== 'synthetic'
    )
      throw new Error('Unconfirmed create');
    id = created.data.id;
    add(stage, 'pass');
    stage = 'synthetic-reload';
    const loaded = await request(`/api/consultations/${id}`);
    if (
      loaded.status !== 200 ||
      !valid(loaded.data.call) ||
      loaded.data.call.outcome !== 'unknown'
    )
      throw new Error('Readback mismatch');
    add(stage, 'pass');
    stage = 'outcome-update-reload';
    const patched = await request(`/api/consultations/${id}`, 'PATCH', {
      outcome: 'follow_up',
    });
    const reloaded = await request(`/api/consultations/${id}`);
    if (
      patched.status !== 200 ||
      reloaded.status !== 200 ||
      !valid(reloaded.data.call) ||
      reloaded.data.call.outcome !== 'follow_up'
    )
      throw new Error('Update did not persist');
    add(stage, 'pass');
    stage = 'unrelated-user-isolation';
    const other = env.HOSTED_OTHER_SESSION_TOKEN?.trim();
    if (!other || other === token) add(stage, 'not-verified');
    else {
      // Verify the second identity can use the application; a globally blocked token proves nothing about workspace isolation.
      const otherAccess = await request(
        '/api/workspaces',
        'GET',
        undefined,
        other,
        false,
      );
      if (
        otherAccess.status !== 200 ||
        !Array.isArray(otherAccess.data.workspaces) ||
        otherAccess.data.workspaces.some((item) => item.id === workspace)
      )
        throw new Error('Second identity must be admitted and unrelated');
      const denied = await request(
        `/api/consultations/${id}`,
        'GET',
        undefined,
        other,
      );
      if (denied.status !== 403) throw new Error('Isolation failed');
      add(stage, 'pass');
    }
  } catch {
    add(stage, 'fail');
  } finally {
    if (id) {
      cleanup = 'uncertain';
      try {
        const removed = await request(`/api/consultations/${id}`, 'DELETE');
        const absent = await request(`/api/consultations/${id}`);
        if (
          removed.status === 200 &&
          removed.data.deleted === true &&
          absent.status === 404
        )
          cleanup = 'confirmed';
      } catch {
        /* Unknown deletion outcome requires operator review, never an automatic retry. */
      }
      add('synthetic-cleanup', cleanup === 'confirmed' ? 'pass' : 'fail');
    } else if (createAttempted) {
      cleanup = 'uncertain';
      add('synthetic-cleanup', 'not-verified');
    }
  }
  add('assessment-and-provider-workflow', 'not-verified');
  const failed =
    checks.some((check) => check.status === 'fail') || cleanup === 'uncertain';
  return {
    ok: !failed && checks.every((check) => check.status === 'pass'),
    exitCode: failed
      ? 1
      : checks.some((check) => check.status === 'not-verified')
        ? 2
        : 0,
    checks,
    cleanup,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await verifyHostedWorkflow(process.env, {
      write: process.argv.includes('--write'),
    });
    for (const check of result.checks)
      console.log(`${check.status.toUpperCase()} ${check.name}`);
    if (result.cleanup === 'uncertain')
      console.error(
        'Cleanup is uncertain. A synthetic operations-check record may remain. Review the selected workspace manually; no existing records were searched or deleted.',
      );
    console.log(
      'No AI calls or rubric creation were performed. Assessment quality and full end-to-end readiness are not verified.',
    );
    process.exitCode = result.exitCode;
  } catch {
    console.error(
      'Workflow verification failed. Check HTTPS origin and ignored environment configuration. No credentials or record contents are logged.',
    );
    process.exitCode = 1;
  }
}
