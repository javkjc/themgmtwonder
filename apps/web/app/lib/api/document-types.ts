import { apiFetchJson } from '../api';

export type DocumentType = {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
};

export type DocumentTypeField = {
    fieldKey: string;
    label: string;
    characterType: string;
    required: boolean;
    zoneHint: string | null;
    sortOrder: number;
};

export type CreateDocumentTypeDto = {
    name: string;
    description?: string;
};

export type UpdateDocumentTypeDto = {
    name?: string;
    description?: string;
};

export type AddDocumentTypeFieldDto = {
    fieldKey: string;
    required?: boolean;
    zoneHint?: string;
    sortOrder?: number;
};

export type UpdateDocumentTypeFieldDto = {
    required?: boolean;
    zoneHint?: string;
    sortOrder?: number;
};

export async function listDocumentTypes(): Promise<DocumentType[]> {
    return apiFetchJson('/document-types') as Promise<DocumentType[]>;
}

export async function createDocumentType(dto: CreateDocumentTypeDto): Promise<DocumentType> {
    return apiFetchJson('/document-types', {
        method: 'POST',
        body: JSON.stringify(dto),
    }) as Promise<DocumentType>;
}

export async function updateDocumentType(id: string, dto: UpdateDocumentTypeDto): Promise<DocumentType> {
    return apiFetchJson(`/document-types/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(dto),
    }) as Promise<DocumentType>;
}

export async function deleteDocumentType(id: string): Promise<{ deleted: true; id: string }> {
    return apiFetchJson(`/document-types/${id}`, {
        method: 'DELETE',
    }) as Promise<{ deleted: true; id: string }>;
}

export async function getDocumentTypeFields(id: string): Promise<DocumentTypeField[]> {
    return apiFetchJson(`/document-types/${id}/fields`) as Promise<DocumentTypeField[]>;
}

export async function addDocumentTypeField(id: string, dto: AddDocumentTypeFieldDto): Promise<any> {
    return apiFetchJson(`/document-types/${id}/fields`, {
        method: 'POST',
        body: JSON.stringify(dto),
    });
}

export async function updateDocumentTypeField(id: string, fieldKey: string, dto: UpdateDocumentTypeFieldDto): Promise<any> {
    return apiFetchJson(`/document-types/${id}/fields/${fieldKey}`, {
        method: 'PATCH',
        body: JSON.stringify(dto),
    });
}

export async function removeDocumentTypeField(id: string, fieldKey: string): Promise<{ deleted: true; id: string; fieldKey: string }> {
    return apiFetchJson(`/document-types/${id}/fields/${fieldKey}`, {
        method: 'DELETE',
    }) as Promise<{ deleted: true; id: string; fieldKey: string }>;
}

