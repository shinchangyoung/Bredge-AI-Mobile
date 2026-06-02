export type WorkspaceNode = WorkspaceFolderNode | WorkspaceFileNode;

export type WorkspaceFolderNode = {
  children?: WorkspaceNode[];
  color?: string;
  date?: string;
  id: string;
  isDefaultFolder?: boolean;
  name: string;
  type: 'folder';
};

export type WorkspaceRecordingResource = {
  audioUrl?: string | null;
  createdAt?: string;
  duration?: number;
  durationSeconds?: number;
  durationText?: string;
  endedAt?: string;
  id?: string;
  name?: string;
  originalName?: string;
  recordingId?: string;
  storedName?: string;
  startedAt?: string;
  title?: string;
  transcriptionError?: string | null;
  transcriptionStatus?: string;
  transcriptions?: WorkspaceTranscription[];
  url?: string | null;
  uploadedAt?: string;
  [key: string]: unknown;
};

export type WorkspaceTranscriptSegment = {
  end?: number;
  id?: string | number;
  speaker?: string | null;
  speakerId?: string | number | null;
  speakerName?: string | null;
  start?: number;
  startSeconds?: number;
  startTime?: number;
  text?: string;
  time?: string;
  [key: string]: unknown;
};

export type WorkspaceTranscription = {
  end?: number;
  id?: string | number;
  segments?: WorkspaceTranscriptSegment[];
  speaker?: string | null;
  speakerId?: string | number | null;
  speakerName?: string | null;
  start?: number;
  startSeconds?: number;
  startTime?: number;
  text?: string;
  time?: string;
  [key: string]: unknown;
};

export type WorkspaceMaterialResource = {
  fileId?: string;
  fileName?: string;
  id?: string;
  materialId?: string;
  mimeType?: string;
  name?: string;
  originalName?: string;
  size?: number;
  storedName?: string;
  title?: string;
  type?: string;
  [key: string]: unknown;
};

export type WorkspaceFileNode = {
  attachments?: WorkspaceMaterialResource[];
  color?: string;
  date?: string;
  fileKind?: string;
  id: string;
  name: string;
  recordings?: WorkspaceRecordingResource[];
  resourcesLoaded?: boolean;
  summaryNotes?: unknown[];
  tag?: string;
  type: 'file';
  weeks?: unknown[];
};

export type WorkspaceSessionNode = WorkspaceFileNode;

export type WorkspaceUploadFile = {
  mimeType?: string | null;
  name?: string | null;
  type?: string | null;
  uri: string;
};

export type UploadWorkspaceRecordingOptions = {
  durationSeconds?: number;
  title?: string;
};

const FALLBACK_WORKSPACE_API_BASE_URL = 'http://100.88.241.98:3000';

function normalizeBaseUrl(value?: string) {
  const url = value?.trim().replace(/\/$/, '');
  return url || undefined;
}

const API_BASE_URL =
  normalizeBaseUrl(process.env.EXPO_PUBLIC_WORKSPACE_API_BASE_URL) || FALLBACK_WORKSPACE_API_BASE_URL;

function getWebSocketBaseUrl() {
  return API_BASE_URL.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
}

async function parseWorkspaceResponse(response: Response, fallbackMessage: string) {
  const rawResult = await response.text();
  let result: Record<string, unknown> = {};

  try {
    result = rawResult ? JSON.parse(rawResult) : {};
  } catch {
    result = { error: rawResult };
  }

  if (!response.ok || result.ok === false) {
    const message =
      typeof result.error === 'string'
        ? result.error
        : typeof result.detail === 'string'
          ? result.detail
          : `${fallbackMessage} (${response.status})`;
    throw new Error(message);
  }

  return result;
}

async function requestWorkspaceJson(endpoint: string, fallbackMessage: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}/workspace/${endpoint}`, init);
  return parseWorkspaceResponse(response, fallbackMessage);
}

function normalizeUploadFileName(name?: string | null, fallback = 'upload') {
  const rawName = String(name ?? '').trim();
  if (!rawName) {
    return fallback;
  }

  try {
    return decodeURIComponent(rawName).normalize('NFC').trim() || fallback;
  } catch {
    return rawName.normalize('NFC').trim() || fallback;
  }
}

function createUploadFormData(file: WorkspaceUploadFile) {
  const formData = new FormData();
  formData.append('file', {
    name: normalizeUploadFileName(file.name),
    type: file.mimeType || file.type || 'application/octet-stream',
    uri: file.uri,
  } as unknown as Blob);

  return formData;
}

export async function getWorkspaceTree() {
  const result = await requestWorkspaceJson('tree', '워크스페이스 목록을 불러오지 못했습니다.');
  if (!Array.isArray(result.tree)) {
    throw new Error('워크스페이스 목록을 불러오지 못했습니다.');
  }

  return result.tree as WorkspaceNode[];
}

export async function getWorkspaceSession(sessionId: string) {
  const result = await requestWorkspaceJson(
    `sessions/${encodeURIComponent(sessionId)}`,
    '세션 파일을 불러오지 못했습니다.',
  );

  if (!result.node || typeof result.node !== 'object') {
    throw new Error('세션 파일을 불러오지 못했습니다.');
  }

  return result.node as WorkspaceSessionNode;
}

export async function transcribeWorkspaceRecording(sessionId: string, recordingId: string) {
  return requestWorkspaceJson(
    `sessions/${encodeURIComponent(sessionId)}/recordings/${encodeURIComponent(recordingId)}/transcribe`,
    '음성파일 전사에 실패했습니다.',
    { method: 'POST' },
  );
}

export async function uploadWorkspaceRecording(
  sessionId: string,
  file: WorkspaceUploadFile,
  options: UploadWorkspaceRecordingOptions = {},
) {
  const formData = createUploadFormData(file);
  if (options.title) formData.append('title', options.title);
  if (Number.isFinite(options.durationSeconds)) {
    formData.append('duration_seconds', String(options.durationSeconds));
  }

  return requestWorkspaceJson(
    `sessions/${encodeURIComponent(sessionId)}/recordings`,
    '음성파일 업로드에 실패했습니다.',
    {
      body: formData,
      method: 'POST',
    },
  ) as Promise<{
    node?: WorkspaceSessionNode;
    ok: boolean;
    recording?: WorkspaceRecordingResource;
    sessionId?: string;
  }>;
}

export async function deleteWorkspaceRecordingData(sessionId: string, recordingId: string) {
  return requestWorkspaceJson(
    `sessions/${encodeURIComponent(sessionId)}/recordings/${encodeURIComponent(recordingId)}`,
    '녹음본 관련 데이터 삭제에 실패했습니다.',
    { method: 'DELETE' },
  ) as Promise<{
    node?: WorkspaceSessionNode;
    ok: boolean;
    recordingId?: string;
    sessionId?: string;
  }>;
}

export function getWorkspaceAssetUrl(path?: string | null) {
  if (!path) return undefined;
  if (/^(file|blob):/i.test(path)) return path;
  const workspacePathMatch = path.match(/^https?:\/\/[^/]+(\/workspace\/.*)$/i);
  if (workspacePathMatch?.[1]) {
    return `${API_BASE_URL}${workspacePathMatch[1]}`;
  }
  if (/^https?:\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function getWorkspaceApiBaseUrl() {
  return API_BASE_URL;
}

export function getWorkspaceWebSocketBaseUrl() {
  return getWebSocketBaseUrl();
}

export function getWorkspaceRealtimeWebSocketUrl(options: {
  diarizationEnabled?: boolean;
  recordingId?: string | null;
  sessionId?: string | null;
} = {}) {
  const params = new URLSearchParams();
  if (options.sessionId) params.set('session_id', options.sessionId);
  if (options.recordingId) params.set('recording_id', options.recordingId);
  params.set('diarize', options.diarizationEnabled ? 'true' : 'false');

  const query = params.toString();
  return `${getWebSocketBaseUrl()}/ws${query ? `?${query}` : ''}`;
}
