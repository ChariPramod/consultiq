import type { WorkspaceInsights } from '../lib/insights.ts';
import { AppError, type Repository } from './repository.ts';

/**
 * One statement supplies a consistent all-time snapshot without returning a
 * transcript, quote, rationale, historical revision or cross-rubric score mean.
 * The latest-assessment ordering matches the review queue and repository.
 */
export async function workspaceInsights(
  repo: Repository,
): Promise<WorkspaceInsights> {
  const row = await repo
    .statement(
      `WITH
    scope AS (SELECT ? AS workspace_id),
    latest AS (
      SELECT c.id,c.coordinator,c.outcome,a.id AS assessment_id,a.kind,a.rubric_id,
        a.content,json_extract(a.content,'$.supported_count') AS supported
      FROM consultations c JOIN scope s ON c.workspace_id=s.workspace_id
      LEFT JOIN assessments a ON a.workspace_id=s.workspace_id AND a.call_id=c.id
        AND a.id=(SELECT b.id FROM assessments b
          WHERE b.workspace_id=s.workspace_id AND b.call_id=c.id
          ORDER BY b.created_at DESC,b.rowid DESC LIMIT 1)
    ),
    current_rubric AS (
      SELECT r.id,r.title FROM rubrics r JOIN scope s ON r.workspace_id=s.workspace_id
      ORDER BY r.created_at DESC,r.rowid DESC LIMIT 1
    ),
    human_cohort AS (
      SELECT l.content FROM latest l JOIN current_rubric r ON l.rubric_id=r.id
      WHERE l.kind='human'
    ),
    dimension_ids(dimension) AS (VALUES (0),(1),(2),(3),(4),(5),(6),(7)),
    dimension_values AS (
      SELECT json_extract(d.value,'$.dimension') AS dimension,
        CASE WHEN json_type(d.value,'$.score')='integer'
          AND json_extract(d.value,'$.score') BETWEEN 1 AND 5
          AND json_array_length(d.value,'$.evidence')>0
          AND json_extract(d.value,'$.unsupported')=0
        THEN json_extract(d.value,'$.score') ELSE NULL END AS score
      FROM human_cohort h,json_each(h.content,'$.dimensions') d
    ),
    rubric_groups AS (
      SELECT r.id,r.title,r.created_at,COUNT(*) AS calls,
        SUM(l.kind='human') AS latest_human,SUM(l.kind='ai') AS latest_ai,
        SUM(l.supported=8) AS fully_supported,
        SUM(l.supported BETWEEN 1 AND 7) AS partially_supported,
        SUM(l.supported=0) AS unscored
      FROM latest l JOIN rubrics r ON r.id=l.rubric_id
        JOIN scope s ON r.workspace_id=s.workspace_id
      GROUP BY r.id,r.title,r.created_at
    ),
    coordinator_groups AS (
      SELECT coordinator AS name,COUNT(*) AS calls,
        SUM(assessment_id IS NULL) AS unreviewed,
        SUM(CASE WHEN kind='human' THEN 1 ELSE 0 END) AS latest_human,
        SUM(CASE WHEN kind='ai' THEN 1 ELSE 0 END) AS latest_ai,
        SUM(CASE WHEN supported=8 THEN 1 ELSE 0 END) AS fully_supported,
        SUM(CASE WHEN supported BETWEEN 1 AND 7 THEN 1 ELSE 0 END) AS partially_supported,
        SUM(CASE WHEN supported=0 THEN 1 ELSE 0 END) AS unscored
      FROM latest GROUP BY coordinator
    ),
    practice_counts AS (
      SELECT COUNT(*) AS total,COUNT(c.id) AS completed
      FROM practice_assignments a JOIN scope s ON a.workspace_id=s.workspace_id
      LEFT JOIN practice_completions c ON c.workspace_id=s.workspace_id AND c.assignment_id=a.id
    ),
    scoped_jobs AS (
      SELECT j.status FROM analysis_jobs j JOIN scope s ON j.workspace_id=s.workspace_id
    )
    SELECT json_object(
      'scope','all_time','generated_at',strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      'totals',(SELECT json_object(
        'calls',COUNT(*),'unreviewed',COALESCE(SUM(assessment_id IS NULL),0),
        'latest_human',COALESCE(SUM(kind='human'),0),'latest_ai',COALESCE(SUM(kind='ai'),0),
        'fully_supported',COALESCE(SUM(supported=8),0),
        'partially_supported',COALESCE(SUM(supported BETWEEN 1 AND 7),0),
        'unscored',COALESCE(SUM(supported=0),0)) FROM latest),
      'outcomes',(SELECT json_object(
        'unknown',COALESCE(SUM(outcome='unknown'),0),
        'accepted',COALESCE(SUM(outcome='accepted'),0),
        'not_accepted',COALESCE(SUM(outcome='not_accepted'),0),
        'follow_up',COALESCE(SUM(outcome='follow_up'),0)) FROM latest),
      'rubric_groups',json_object(
        'total',(SELECT COUNT(*) FROM rubric_groups),
        'has_more',json(CASE WHEN (SELECT COUNT(*) FROM rubric_groups)>50 THEN 'true' ELSE 'false' END),
        'items',(SELECT json_group_array(json_object(
          'id',id,'title',title,'created_at',created_at,'calls',calls,
          'latest_human',latest_human,'latest_ai',latest_ai,'fully_supported',fully_supported,
          'partially_supported',partially_supported,'unscored',unscored))
          FROM (SELECT * FROM rubric_groups ORDER BY created_at DESC,id DESC LIMIT 50))),
      'current_rubric',(SELECT json_object('id',r.id,'title',r.title,
        'human_calls',(SELECT COUNT(*) FROM human_cohort),
        'dimensions',(SELECT json_group_array(json_object(
          'dimension',dimension,'supported',supported,'unscored',unscored,'mean',mean))
          FROM (SELECT d.dimension,COUNT(v.score) AS supported,
            (SELECT COUNT(*) FROM human_cohort)-COUNT(v.score) AS unscored,
            AVG(v.score) AS mean
            FROM dimension_ids d LEFT JOIN dimension_values v ON v.dimension=d.dimension
            GROUP BY d.dimension ORDER BY d.dimension))) FROM current_rubric r),
      'coordinators',json_object(
        'total',(SELECT COUNT(*) FROM coordinator_groups),
        'has_more',json(CASE WHEN (SELECT COUNT(*) FROM coordinator_groups)>20 THEN 'true' ELSE 'false' END),
        'items',(SELECT json_group_array(json_object(
          'name',name,'calls',calls,'unreviewed',unreviewed,
          'latest_human',latest_human,'latest_ai',latest_ai,'fully_supported',fully_supported,
          'partially_supported',partially_supported,'unscored',unscored))
          FROM (SELECT * FROM coordinator_groups ORDER BY calls DESC,name ASC LIMIT 20))),
      'practice',(SELECT json_object('pending',total-completed,'completed',completed) FROM practice_counts),
      'jobs',(SELECT json_object(
        'queued',COALESCE(SUM(status='queued'),0),'running',COALESCE(SUM(status='running'),0),
        'completed',COALESCE(SUM(status='completed'),0),'failed',COALESCE(SUM(status='failed'),0),
        'cancelled',COALESCE(SUM(status='cancelled'),0)) FROM scoped_jobs)
    ) AS snapshot`,
      repo.workspaceId,
    )
    .first<{ snapshot: string }>();
  if (!row)
    throw new AppError(
      503,
      'storage_unavailable',
      'Insights could not be loaded. Refresh to try again.',
    );
  return JSON.parse(row.snapshot) as WorkspaceInsights;
}
