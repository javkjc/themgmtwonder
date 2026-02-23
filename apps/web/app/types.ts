export type Me = {
  userId: string;
  email: string;
  mustChangePassword: boolean;
  role: string;
  isAdmin: boolean;
};

export type Todo = {
  id: string;
  userId: string;
  title: string;
  done: boolean;
  createdAt: string;
  startAt?: string | null;
  durationMin?: number | null;
  category?: string | null;
  stageKey?: string | null;
  isPinned?: boolean;
  parentId?: string | null;
  childCount?: number;
};

export type BaselineStatus = 'draft' | 'reviewed' | 'confirmed' | 'archived';

export type BaselineUtilizationType =
  | 'record_created'
  | 'process_committed'
  | 'data_exported'
  | null;

export interface AssignmentValidation {
  valid: boolean;
  error?: string;
  suggestedCorrection?: string;
}

export interface Assignment {
  id: string;
  fieldKey: string;
  assignedValue: string | null;
  normalizedValue: string | null;
  sourceSegmentId: string | null;
  assignedBy: string;
  assignedAt: string;
  correctedFrom: string | null;
  correctionReason: string | null;
  validation?: AssignmentValidation;
  suggestionConfidence?: number | null;
  suggestionAccepted?: boolean | null;
  modelVersionId?: string | null;
}

export interface Segment {
  id: string;
  text: string;
  confidence: string | null;
  boundingBox: any;
  pageNumber: number | null;
}

export interface Baseline {
  id: string;
  attachmentId: string;
  status: BaselineStatus;
  confirmedAt: string | null;
  confirmedBy: string | null;
  utilizedAt: string | null;
  utilizationType: BaselineUtilizationType;
  utilizationMetadata?: Record<string, any> | null;
  archivedAt: string | null;
  archivedBy: string | null;
  createdAt: string;
  assignments?: Assignment[];
  segments?: Segment[];
}
