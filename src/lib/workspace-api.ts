import Constants from 'expo-constants';

export type WorkspaceNode = WorkspaceFolderNode | WorkspaceFileNode;

export type WorkspaceFolderNode = {
  id: string;
  type: 'folder';
  name: string;
  date?: string;
  color?: string;
  icon?: string;
  isDefaultFolder?: boolean;
  children?: WorkspaceNode[];
};

export type WorkspaceFileNode = {
  id: string;
  type: 'file';
  fileKind?: string;
  name: string;
  date?: string;
  color?: string;
  tag?: string;
  fileIcon?: string;
  attachments?: WorkspaceMaterialResource[];
  recordings?: WorkspaceRecordingResource[];
  weeks?: unknown[];
};

export type WorkspaceMaterialResource = {
  id?: string;
  materialId?: string;
  fileId?: string;
  name?: string;
  title?: string;
  fileName?: string;
  originalName?: string;
  storedName?: string;
  mimeType?: string;
  url?: string;
  fileUrl?: string;
  materialUrl?: string;
  size?: number;
  type?: string;
  [key: string]: unknown;
};

export type WorkspaceTranscriptSegment = {
  id?: string | number;
  start?: number;
  end?: number;
  time?: string;
  text?: string;
  speaker?: string | null;
  speakerName?: string | null;
  [key: string]: unknown;
};

export type WorkspaceTranscription = {
  id?: string | number;
  start?: number;
  end?: number;
  time?: string;
  text?: string;
  speaker?: string | null;
  speakerName?: string | null;
  segments?: WorkspaceTranscriptSegment[];
  [key: string]: unknown;
};

export type WorkspaceRecordingResource = {
  id?: string;
  recordingId?: string;
  name?: string;
  title?: string;
  duration?: number;
  durationText?: string;
  audioUrl?: string | null;
  createdAt?: string;
  transcriptions?: WorkspaceTranscription[];
  [key: string]: unknown;
};

export type WorkspaceSessionNode = WorkspaceFileNode & {
  attachments?: WorkspaceMaterialResource[];
  recordings?: WorkspaceRecordingResource[];
  resourcesLoaded?: boolean;
  summaryNotes?: unknown[];
};

export type CreateWorkspaceFolderPayload = {
  color?: string;
  icon?: string;
  parent_course_id?: string | null;
  title: string;
};

export type CreateWorkspaceFilePayload = {
  color?: string;
  course_id?: string | null;
  file_kind?: string;
  icon?: string;
  tag?: string;
  title: string;
};

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

export type WorkspaceWeekResourcePayload = {
  [key: string]: unknown;
  materials?: WorkspaceMaterialResource[];
  recordings?: WorkspaceRecordingResource[];
};

type ExpoRuntimeConstants = {
  expoConfig?: {
    hostUri?: string;
  };
  linkingUri?: string;
  manifest?: {
    debuggerHost?: string;
    hostUri?: string;
  };
  manifest2?: {
    extra?: {
      expoClient?: {
        hostUri?: string;
      };
    };
  };
};

const MAC_PROXY_PORT = 3000;
const FALLBACK_MAC_PROXY_URL = 'http://100.88.241.98:3000';

function normalizeBaseUrl(value?: string) {
  const url = value?.trim().replace(/\/$/, '');
  return url || undefined;
}

function extractHost(value?: string) {
  if (!value) return undefined;
  const withoutProtocol = value.replace(/^[a-z]+:\/\//i, '');
  const host = withoutProtocol.split('/')[0]?.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return undefined;
  return host;
}

function getDefaultApiBaseUrl() {
  const constants = Constants as ExpoRuntimeConstants;
  const host =
    extractHost(constants.expoConfig?.hostUri) ||
    extractHost(constants.manifest2?.extra?.expoClient?.hostUri) ||
    extractHost(constants.manifest?.hostUri) ||
    extractHost(constants.manifest?.debuggerHost) ||
    extractHost(constants.linkingUri);

  return host ? `http://${host}:${MAC_PROXY_PORT}` : FALLBACK_MAC_PROXY_URL;
}

const API_BASE_URL =
  normalizeBaseUrl(process.env.EXPO_PUBLIC_WORKSPACE_API_BASE_URL) || getDefaultApiBaseUrl();

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

async function requestWorkspaceJson(endpoint: string, options: RequestInit = {}, fallbackMessage: string) {
  const response = await fetch(`${API_BASE_URL}/workspace/${endpoint}`, options);
  return parseWorkspaceResponse(response, fallbackMessage);
}

function jsonRequestOptions(method: string, payload: unknown): RequestInit {
  return {
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    },
    method,
  };
}

export function normalizeUploadFileName(name?: string | null, fallback = 'upload') {
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

function sanitizeSessionResources(weeks: WorkspaceWeekResourcePayload[]) {
  return weeks.map((week) => ({
    ...week,
    materials: Array.isArray(week.materials)
      ? week.materials.map(({ sourceFile: _sourceFile, ...material }) => material)
      : [],
    recordings: Array.isArray(week.recordings) ? week.recordings : [],
  }));
}

export async function getWorkspaceTree() {
  const result = await requestWorkspaceJson('tree', {}, '워크스페이스 목록을 불러오지 못했습니다.');
  if (!Array.isArray(result.tree)) {
    throw new Error('워크스페이스 목록을 불러오지 못했습니다.');
  }
  return result.tree as WorkspaceNode[];
}

export async function getWorkspaceSession(sessionId: string) {
  const result = await requestWorkspaceJson(
    `sessions/${encodeURIComponent(sessionId)}`,
    {},
    '세션 파일을 불러오지 못했습니다.',
  );

  if (!result.node || typeof result.node !== 'object') {
    throw new Error('세션 파일을 불러오지 못했습니다.');
  }

  return result.node as WorkspaceSessionNode;
}

export async function createWorkspaceFolder(payload: CreateWorkspaceFolderPayload) {
  const result = await requestWorkspaceJson(
    'courses',
    jsonRequestOptions('POST', payload),
    '워크스페이스 폴더 저장에 실패했습니다.',
  );

  if (!result.node || typeof result.node !== 'object') {
    throw new Error('워크스페이스 폴더 저장에 실패했습니다.');
  }

  return result.node as WorkspaceFolderNode;
}

export async function createWorkspaceFile(payload: CreateWorkspaceFilePayload) {
  const result = await requestWorkspaceJson(
    'sessions',
    jsonRequestOptions('POST', payload),
    '워크스페이스 파일 저장에 실패했습니다.',
  );

  if (!result.node || typeof result.node !== 'object') {
    throw new Error('워크스페이스 파일 저장에 실패했습니다.');
  }

  return result.node as WorkspaceFileNode;
}

export async function saveSessionResources(sessionId: string, weeks: WorkspaceWeekResourcePayload[]) {
  const result = await requestWorkspaceJson(
    `sessions/${encodeURIComponent(sessionId)}/resources`,
    jsonRequestOptions('PUT', { weeks: sanitizeSessionResources(weeks) }),
    '현재 파일 자료 저장에 실패했습니다.',
  );

  if (!result.node || typeof result.node !== 'object') {
    throw new Error('현재 파일 자료 저장에 실패했습니다.');
  }

  return result.node as WorkspaceSessionNode;
}

export async function uploadWorkspaceMaterial(sessionId: string, file: WorkspaceUploadFile) {
  const result = await requestWorkspaceJson(
    `sessions/${encodeURIComponent(sessionId)}/materials`,
    {
      body: createUploadFormData(file),
      method: 'POST',
    },
    '강의자료 파일 업로드에 실패했습니다.',
  );

  if (!result.material || typeof result.material !== 'object') {
    throw new Error('강의자료 파일 업로드에 실패했습니다.');
  }

  return result.material as WorkspaceMaterialResource;
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

  const result = await requestWorkspaceJson(
    `sessions/${encodeURIComponent(sessionId)}/recordings`,
    {
      body: formData,
      method: 'POST',
    },
    '음성파일 업로드에 실패했습니다.',
  );

  return result as {
    node?: WorkspaceSessionNode;
    ok: boolean;
    recording?: WorkspaceRecordingResource;
    sessionId?: string;
  };
}

export async function transcribeWorkspaceRecording(sessionId: string, recordingId: string) {
  return requestWorkspaceJson(
    `sessions/${encodeURIComponent(sessionId)}/recordings/${encodeURIComponent(recordingId)}/transcribe`,
    { method: 'POST' },
    '음성파일 전사에 실패했습니다.',
  );
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
