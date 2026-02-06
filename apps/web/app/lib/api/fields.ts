import { apiFetchJson } from '../api';

export type FieldCharacterType = 'varchar' | 'int' | 'decimal' | 'date' | 'currency' | 'email' | 'phone' | 'url' | 'percentage' | 'boolean';
export type FieldStatus = 'active' | 'hidden' | 'archived';

export type Field = {
    id: string;
    fieldKey: string;
    label: string;
    characterType: FieldCharacterType;
    characterLimit: number | null;
    version: number;
    status: FieldStatus;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
};

export type CreateFieldDto = {
    fieldKey: string;
    label: string;
    characterType: FieldCharacterType;
    characterLimit?: number;
};

export type UpdateFieldDto = {
    label?: string;
    characterType?: FieldCharacterType;
    characterLimit?: number;
};

/**
 * List all fields with optional status filter
 */
export async function listFields(status?: FieldStatus): Promise<Field[]> {
    const url = status ? `/fields?status=${status}` : '/fields';
    return apiFetchJson(url) as Promise<Field[]>;
}

/**
 * Get a single field by field key
 */
export async function getField(fieldKey: string): Promise<Field> {
    return apiFetchJson(`/fields/${fieldKey}`) as Promise<Field>;
}

/**
 * Create a new field
 */
export async function createField(dto: CreateFieldDto): Promise<Field> {
    return apiFetchJson('/fields', {
        method: 'POST',
        body: JSON.stringify(dto),
    }) as Promise<Field>;
}

/**
 * Update an existing field
 */
export async function updateField(fieldKey: string, dto: UpdateFieldDto): Promise<Field> {
    return apiFetchJson(`/fields/${fieldKey}`, {
        method: 'PUT',
        body: JSON.stringify(dto),
    }) as Promise<Field>;
}

/**
 * Hide a field (sets status to 'hidden')
 */
export async function hideField(fieldKey: string): Promise<Field> {
    return apiFetchJson(`/fields/${fieldKey}/hide`, {
        method: 'PATCH',
        body: JSON.stringify({}),
    }) as Promise<Field>;
}

/**
 * Unhide a field (sets status to 'active')
 */
export async function unhideField(fieldKey: string): Promise<Field> {
    return apiFetchJson(`/fields/${fieldKey}/unhide`, {
        method: 'PATCH',
        body: JSON.stringify({}),
    }) as Promise<Field>;
}

/**
 * Archive a field (sets status to 'archived')
 */
export async function archiveField(fieldKey: string): Promise<Field> {
    return apiFetchJson(`/fields/${fieldKey}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({}),
    }) as Promise<Field>;
}
