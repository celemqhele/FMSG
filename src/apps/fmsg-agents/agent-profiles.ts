/**
 * FMSG Agents — Independent Agent Profiles & CV Management
 *
 * The agent's own profile system, deliberately separate from the website's
 * search_profiles. Backed by public.agent_profiles (migration 040, RLS:
 * auth.uid() = user_id) and the private `agent-cvs` storage bucket whose
 * owner-prefix path (<user_id>/<profile_id>/<uuid>.<ext>) makes cross-profile
 * CV leakage structurally impossible.
 *
 * Security invariants (do not weaken):
 * - CVs are never public. Signed URLs are never created here for the UI;
 *   the run pipeline downloads objects through the authenticated anon client.
 * - CV contents, storage paths and signed URLs are NEVER logged. Logging in
 *   this module carries actions/ids/outcomes only.
 * - A failed replacement never destroys the previous CV: upload to a NEW
 *   unique path first, update the row, then best-effort delete the old object.
 * - Uploads validated: PDF or DOCX, <= 10 MB.
 */

import * as crypto from 'crypto';
import {
  createAnonSupabaseClient,
  getActiveSessionAccessToken,
  getActiveSessionUser,
} from './session-manager';
import { logEvent } from './logger';

// Lazy requires keep the Electron main bundle free of the parsers until a CV
// is actually processed. Both packages are untyped, so they are required as
// `any` at the point of use (never at module load).
/* eslint-disable @typescript-eslint/no-var-requires */

const AGENT_CV_BUCKET = 'agent-cvs';
const MAX_CV_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CV_TEXT_CHARS = 6000;

export interface AgentProfile {
  id: string;
  user_id: string;
  name: string;
  target_job_title: string;
  cv_storage_path: string | null;
  cv_filename: string | null;
  cv_mime: string | null;
  cv_size_bytes: number | null;
  cv_uploaded_at: string | null;
  created_at: string;
  updated_at: string;
  // Presentation/compat shim — NOT database columns. Legacy renderer and
  // query-generation code reads job_titles/location; agent profiles carry a
  // single target title and no location, so expose an equivalent shape here.
  job_titles: string[];
  location: string;
  location_scope: string;
}

export interface AgentProfileRunContext {
  profile: AgentProfile;
  cvPath: string;
  cvFileName: string;
  cvMime: string;
  cvBuffer: Buffer;
  cvText: string;
}

function shimRow(row: any): AgentProfile {
  const target = (row?.target_job_title || '').trim();
  return {
    ...row,
    target_job_title: target,
    job_titles: target ? [target] : [],
    location: '',
    location_scope: '',
  };
}

function mimeOf(fileName: string): string {
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/pdf';
}

function extOf(mime: string): string {
  return mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ? 'docx'
    : 'pdf';
}

function requireSession(): { token: string; userId: string } {
  const token = getActiveSessionAccessToken();
  const user = getActiveSessionUser();
  if (!token || !user?.id) {
    throw new Error('Please sign in again before managing agent profiles.');
  }
  return { token, userId: user.id };
}

export async function extractCvText(buffer: Buffer, mime: string): Promise<string> {
  try {
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth: any = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return String(result?.value || '').slice(0, MAX_CV_TEXT_CHARS);
    }
    const pdfParseModule: any = require('pdf-parse/lib/pdf-parse.js');
    const fn =
      typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default;
    const result = await fn(buffer);
    return String(result?.text || '').slice(0, MAX_CV_TEXT_CHARS);
  } catch (err: any) {
    // Extraction must never take down a run: report and return what we have.
    logEvent('agent_cv_extract', 'failed', { error: err?.message || String(err) });
    return '';
  }
}

export async function listAgentProfiles(): Promise<AgentProfile[]> {
  const { token, userId } = requireSession();
  const supabase = createAnonSupabaseClient(token);
  const { data, error } = await supabase
    .from('agent_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at');
  if (error) {
    logEvent('agent_profiles', 'list_failed', { error: error.message });
    throw new Error(`Could not load agent profiles: ${error.message}`);
  }
  return (data || []).map(shimRow);
}

export async function createAgentProfile(input: {
  name: string;
  targetJobTitle: string;
}): Promise<AgentProfile> {
  const { token, userId } = requireSession();
  const name = (input.name || '').trim();
  const target = (input.targetJobTitle || '').trim();
  if (!name) throw new Error('Candidate name is required.');
  if (!target) throw new Error('Target job title is required.');

  const supabase = createAnonSupabaseClient(token);
  const { data, error } = await supabase
    .from('agent_profiles')
    .insert({ user_id: userId, name, target_job_title: target })
    .select('*')
    .single();
  if (error) {
    logEvent('agent_profiles', 'create_failed', { error: error.message });
    throw new Error(`Could not create the profile: ${error.message}`);
  }
  logEvent('agent_profiles', 'created', { id: data.id });
  return shimRow(data);
}

export async function updateAgentProfile(input: {
  id: string;
  name?: string;
  targetJobTitle?: string;
}): Promise<AgentProfile> {
  const { token } = requireSession();
  const patch: any = {};
  if (typeof input.name === 'string' && input.name.trim()) patch.name = input.name.trim();
  if (typeof input.targetJobTitle === 'string' && input.targetJobTitle.trim()) {
    patch.target_job_title = input.targetJobTitle.trim();
  }
  patch.updated_at = new Date().toISOString();

  const supabase = createAnonSupabaseClient(token);
  const { data, error } = await supabase
    .from('agent_profiles')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) {
    logEvent('agent_profiles', 'update_failed', { error: error.message });
    throw new Error(`Could not update the profile: ${error.message}`);
  }
  logEvent('agent_profiles', 'updated', { id: data.id });
  return shimRow(data);
}

async function deleteStorageObjects(token: string, prefix: string): Promise<void> {
  const supabase = createAnonSupabaseClient(token);
  const { data, error } = await supabase.storage
    .from(AGENT_CV_BUCKET)
    .list(prefix, { limit: 50 });
  if (error || !data) return;
  const paths = data.map((o: any) => `${prefix}/${o.name}`).filter(Boolean);
  if (paths.length) {
    await supabase.storage.from(AGENT_CV_BUCKET).remove(paths).catch(() => undefined);
  }
}

export async function deleteAgentProfile(id: string): Promise<void> {
  const { token, userId } = requireSession();
  const supabase = createAnonSupabaseClient(token);

  // Best-effort bucket cleanup under the owner prefix; row deletion is RLS-guarded.
  await deleteStorageObjects(token, `${userId}/${id}`).catch(() => undefined);

  const { error } = await supabase.from('agent_profiles').delete().eq('id', id);
  if (error) {
    logEvent('agent_profiles', 'delete_failed', { error: error.message });
    throw new Error(`Could not delete the profile: ${error.message}`);
  }
  logEvent('agent_profiles', 'deleted', { id });
}

export async function uploadAgentCv(input: {
  profileId: string;
  name: string;
  mime: string;
  data: ArrayBuffer;
}): Promise<AgentProfile> {
  const { token, userId } = requireSession();
  const supabase = createAnonSupabaseClient(token);

  const buffer = Buffer.from(input.data);
  if (!input.mime || (input.mime !== 'application/pdf' && !input.mime.includes('wordprocessingml'))) {
    throw new Error('Only PDF or DOCX CVs are supported.');
  }
  if (!buffer.length || buffer.length > MAX_CV_BYTES) {
    throw new Error('The CV must be under 10 MB.');
  }

  // The row must exist and belong to this user before any object is written.
  const { data: row, error: rowErr } = await supabase
    .from('agent_profiles')
    .select('*')
    .eq('id', input.profileId)
    .eq('user_id', userId)
    .maybeSingle();
  if (rowErr || !row) {
    throw new Error('That agent profile could not be found.');
  }

  // Upload to a NEW unique path; the old CV is only removed after success.
  const ext = extOf(input.mime);
  const newPath = `${userId}/${input.profileId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(AGENT_CV_BUCKET)
    .upload(newPath, buffer, { contentType: input.mime, upsert: false });
  if (upErr) {
    logEvent('agent_profiles', 'cv_upload_failed', { error: upErr.message });
    throw new Error(`Could not upload the CV: ${upErr.message}`);
  }

  const { data: updated, error: updateErr } = await supabase
    .from('agent_profiles')
    .update({
      cv_storage_path: newPath,
      cv_filename: (input.name || 'CV').slice(0, 200),
      cv_mime: input.mime,
      cv_size_bytes: buffer.length,
      cv_uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.profileId)
    .select('*')
    .single();
  if (updateErr) {
    logEvent('agent_profiles', 'cv_row_update_failed', { error: updateErr.message });
    throw new Error('The CV uploaded but the profile record could not be updated. Please try again.');
  }

  // Now safe to retire the previous file (best-effort; never blocks success).
  if (row.cv_storage_path && row.cv_storage_path !== newPath) {
    await supabase.storage
      .from(AGENT_CV_BUCKET)
      .remove([row.cv_storage_path])
      .catch(() => undefined);
  }

  logEvent('agent_profiles', 'cv_uploaded', { id: input.profileId, bytes: buffer.length });
  return shimRow(updated);
}

async function downloadCv(
  token: string,
  path: string
): Promise<Buffer> {
  const supabase = createAnonSupabaseClient(token);
  const { data, error } = await supabase.storage.from(AGENT_CV_BUCKET).download(path);
  if (error || !data) {
    throw new Error('The CV file could not be retrieved. Upload it again on the Profiles screen.');
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Loads everything a run needs about the selected agent profile, or throws a
 * plain-English error the UI can surface verbatim. Used as the run gate:
 * profile exists -> CV present -> CV retrievable -> format supported.
 */
export async function getAgentProfileForRun(
  profileId: string
): Promise<AgentProfileRunContext> {
  const { token } = requireSession();
  const supabase = createAnonSupabaseClient(token);

  const { data: row, error } = await supabase
    .from('agent_profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw new Error('That agent profile could not be loaded.');
  if (!row) {
    throw new Error('No agent profile is selected. Create one on the Profiles screen first.');
  }
  if (!row.cv_storage_path) {
    throw new Error(
      `"${row.name || 'This profile'}" has no CV on file. Upload one on the Profiles screen before starting a run.`
    );
  }
  if (
    row.cv_mime !== 'application/pdf' &&
    row.cv_mime !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    throw new Error('This CV is not a supported format (PDF or DOCX). Replace it on the Profiles screen.');
  }

  const buffer = await downloadCv(token, row.cv_storage_path);
  const text = await extractCvText(buffer, row.cv_mime);

  return {
    profile: shimRow(row),
    cvPath: row.cv_storage_path,
    cvFileName: row.cv_filename || `CV.${extOf(row.cv_mime)}`,
    cvMime: row.cv_mime,
    cvBuffer: buffer,
    cvText: text,
  };
}

export function cvMimeOf(fileName: string): string {
  return mimeOf(fileName);
}
