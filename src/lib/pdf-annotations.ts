import {
  type WorkspaceMaterialResource,
  type WorkspaceSessionNode,
} from '@/lib/workspace-api';
import {
  clamp,
  createCurrentWeekResourceShell,
  getMaterialResourceId,
  getSessionWeeks,
  isObjectRecord,
  normalizeWeekResourceForSave,
} from '@/lib/workspace-resources';

export type DrawMode = 'pen' | 'eraser';
export type PenType = 'pen' | 'highlighter';

export type PdfAnnotationPoint = {
  x: number;
  y: number;
};

export type PdfAnnotationStroke = {
  color: string;
  createdAt?: string;
  id: string;
  mode: DrawMode;
  page: number;
  points: PdfAnnotationPoint[];
  type: PenType;
  width: number;
};

export type PdfAnnotationPayload = {
  strokes: PdfAnnotationStroke[];
  updatedAt?: string;
  version: 1;
};

export function getMaterialAnnotationPayload(material?: WorkspaceMaterialResource | null): PdfAnnotationPayload {
  if (!material) {
    return createEmptyAnnotationPayload();
  }

  const rawPayload = material.annotations ?? material.pdfAnnotations ?? material.inkAnnotations;
  const rawStrokes =
    Array.isArray(rawPayload)
      ? rawPayload
      : isObjectRecord(rawPayload) && Array.isArray(rawPayload.strokes)
        ? rawPayload.strokes
        : [];
  const strokes = rawStrokes
    .map((stroke) => normalizeAnnotationStroke(stroke))
    .filter((stroke): stroke is PdfAnnotationStroke => Boolean(stroke));

  return {
    strokes,
    updatedAt: isObjectRecord(rawPayload) && typeof rawPayload.updatedAt === 'string' ? rawPayload.updatedAt : undefined,
    version: 1,
  };
}

export function createEmptyAnnotationPayload(): PdfAnnotationPayload {
  return {
    strokes: [],
    version: 1,
  };
}

export function normalizeAnnotationStroke(stroke: unknown): PdfAnnotationStroke | null {
  if (!isObjectRecord(stroke)) return null;

  const id = typeof stroke.id === 'string' && stroke.id.trim() ? stroke.id : `stroke-${Date.now()}`;
  const mode = stroke.mode === 'eraser' ? 'eraser' : 'pen';
  const type = stroke.type === 'highlighter' ? 'highlighter' : 'pen';
  const page = Number(stroke.page);
  const width = Number(stroke.width);
  const rawPoints = Array.isArray(stroke.points) ? stroke.points : [];
  const points = rawPoints
    .filter((point): point is Record<string, unknown> => isObjectRecord(point))
    .map((point) => ({
      x: clamp(Number(point.x), 0, 1),
      y: clamp(Number(point.y), 0, 1),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (!Number.isFinite(page) || page < 1 || !points.length) {
    return null;
  }

  return {
    color: typeof stroke.color === 'string' ? stroke.color : '#1F78FF',
    createdAt: typeof stroke.createdAt === 'string' ? stroke.createdAt : undefined,
    id,
    mode,
    page: Math.floor(page),
    points,
    type,
    width: Number.isFinite(width) && width > 0 ? width : mode === 'eraser' ? 20 : type === 'highlighter' ? 14 : 4,
  };
}

export function appendMaterialAnnotationStroke(
  session: WorkspaceSessionNode,
  materialId: string,
  stroke: PdfAnnotationStroke,
) {
  const weeks = getSessionWeeks(session);
  const baseWeeks =
    weeks.length > 0
      ? weeks.map((week, index) => normalizeWeekResourceForSave(week, index))
      : [
          createCurrentWeekResourceShell({
            materials: session.attachments ?? [],
            recordings: session.recordings ?? [],
          }),
        ];
  let didUpdate = false;

  const updateMaterial = (material: WorkspaceMaterialResource, index: number) => {
    if (getMaterialResourceId(material, index) !== materialId) {
      return material;
    }

    const payload = getMaterialAnnotationPayload(material);
    const nextStrokes = [
      ...payload.strokes.filter((item) => item.id !== stroke.id),
      stroke,
    ];

    didUpdate = true;
    return {
      ...material,
      annotations: {
        strokes: nextStrokes,
        updatedAt: new Date().toISOString(),
        version: 1,
      },
    };
  };

  const nextWeeks = baseWeeks.map((week) => ({
    ...week,
    materials: (week.materials ?? []).map(updateMaterial),
    recordings: week.recordings ?? [],
  }));

  const nextAttachments = (session.attachments ?? []).map(updateMaterial);

  if (!didUpdate) {
    return session;
  }

  return {
    ...session,
    attachments: nextAttachments,
    weeks: nextWeeks,
  };
}

export function parseWebViewMessage(message: string): string | { type?: string; stroke?: unknown } | null {
  if (!message.startsWith('{')) {
    return message;
  }

  try {
    const parsed = JSON.parse(message);
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return message;
  }
}
