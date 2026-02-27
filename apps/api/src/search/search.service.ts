import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';

@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name);
    private readonly ollamaEmbeddingsUrl = process.env.OLLAMA_EMBEDDINGS_URL ?? 'http://ollama:11434/api/embeddings';

    constructor(private readonly dbs: DbService) { }

    async searchExtractions(
        q: string,
        documentTypeId?: string,
        dateFrom?: Date,
        dateTo?: Date,
        limit: number = 20
    ) {
        const queryVector = await this.embedQuery(q);
        if (!queryVector || queryVector.length === 0) {
            return { results: [] };
        }
        const vectorLiteral = `[${queryVector.join(',')}]`;

        const conditions: any[] = [];
        if (documentTypeId) {
            conditions.push(sql`be.document_type_id = ${documentTypeId}::uuid`);
        }
        if (dateFrom) {
            conditions.push(sql`COALESCE(eb.confirmed_at, be.created_at) >= ${dateFrom}`);
        }
        if (dateTo) {
            conditions.push(sql`COALESCE(eb.confirmed_at, be.created_at) <= ${dateTo}`);
        }

        let whereSql = sql`1=1`;
        if (conditions.length > 0) {
            whereSql = sql.join(conditions, sql` AND `);
        }

        const maxLimit = Math.min(limit, 100);

        const result = await this.dbs.db.execute(sql`
      SELECT 
        be.baseline_id as "baselineId",
        eb.attachment_id as "attachmentId",
        (1 - (be.embedding <=> ${vectorLiteral}::vector)) as "similarity",
        COALESCE(eb.confirmed_at, be.created_at) as "confirmedAt",
        be.document_type_id as "documentTypeId",
        be.confirmed_fields as "confirmedFields"
      FROM baseline_embeddings be
      LEFT JOIN extraction_baselines eb ON eb.id = be.baseline_id
      WHERE ${whereSql}
      ORDER BY be.embedding <=> ${vectorLiteral}::vector
      LIMIT ${maxLimit}
    `);

        const results = result.rows.map(row => {
            const confirmedFields = row.confirmedFields as Record<string, string | null>;
            const fieldPreview = Object.entries(confirmedFields || {})
                .filter(([_, value]) => value !== null && value !== '')
                .slice(0, 5)
                .map(([fieldKey, value]) => ({ fieldKey, value }));

            return {
                baselineId: row.baselineId,
                attachmentId: row.attachmentId,
                similarity: typeof row.similarity === 'number' ? row.similarity : parseFloat(row.similarity as string || '0'),
                confirmedAt: row.confirmedAt,
                documentTypeId: row.documentTypeId,
                fieldPreview,
            };
        });

        return { results };
    }

    private async embedQuery(prompt: string): Promise<number[]> {
        const prefixedPrompt = 'search_query: ' + prompt;
        try {
            const response = await fetch(this.ollamaEmbeddingsUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'nomic-embed-text',
                    prompt: prefixedPrompt,
                }),
            });
            if (!response.ok) {
                throw new Error(`embedding http status ${response.status}`);
            }
            const payload = await response.json();
            return payload.embedding;
        } catch (e) {
            this.logger.warn(`Failed to embed search query: ${e}`);
            return [];
        }
    }
}
