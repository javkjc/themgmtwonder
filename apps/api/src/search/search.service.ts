import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';

@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name);
    private readonly ollamaEmbeddingsUrl = process.env.OLLAMA_EMBEDDINGS_URL ?? 'http://ollama:11434/api/embeddings';

    constructor(private readonly dbs: DbService) { }

    async searchExtractions(
        userId: string,
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

        // keyword_boost: 1 if any confirmed_field value contains the query string (case-insensitive), else 0
        const result = await this.dbs.db.execute(sql`
      SELECT
        be.baseline_id as "baselineId",
        eb.attachment_id as "attachmentId",
        (1 - (be.embedding <=> ${vectorLiteral}::vector)) as "vectorSimilarity",
        CASE WHEN lower(be.confirmed_fields::text) LIKE lower(${'%' + q + '%'}) THEN 1 ELSE 0 END as "keywordMatch",
        COALESCE(eb.confirmed_at, be.created_at) as "confirmedAt",
        be.document_type_id as "documentTypeId",
        be.confirmed_fields as "confirmedFields"
      FROM baseline_embeddings be
      INNER JOIN extraction_baselines eb ON eb.id = be.baseline_id
      INNER JOIN attachments a ON a.id = eb.attachment_id
      INNER JOIN todos t ON t.id = a.todo_id
      WHERE t.user_id = ${userId}::uuid
        AND ${whereSql}
      ORDER BY
        -- keyword matches always rank above pure vector matches
        CASE WHEN lower(be.confirmed_fields::text) LIKE lower(${'%' + q + '%'}) THEN 1 ELSE 0 END DESC,
        be.embedding <=> ${vectorLiteral}::vector
      LIMIT ${maxLimit}
    `);

        const mapped = result.rows.map(row => {
            const confirmedFields = row.confirmedFields as Record<string, string | null>;
            const fieldPreview = Object.entries(confirmedFields || {})
                .filter(([_, value]) => value !== null && value !== '')
                .slice(0, 5)
                .map(([fieldKey, value]) => ({ fieldKey, value }));

            const vectorSim = typeof row.vectorSimilarity === 'number' ? row.vectorSimilarity : parseFloat(row.vectorSimilarity as string || '0');
            const keywordMatch = row.keywordMatch === 1 || row.keywordMatch === '1';
            // Blend: keyword match boosts to at least 0.85; otherwise use raw vector similarity
            const similarity = keywordMatch ? Math.max(vectorSim, 0.85) : vectorSim;

            return {
                baselineId: row.baselineId,
                attachmentId: row.attachmentId,
                similarity,
                confirmedAt: row.confirmedAt,
                documentTypeId: row.documentTypeId,
                fieldPreview,
            };
        });

        // If any result has a keyword match, keep only keyword-matched results.
        // Only fall back to pure vector results when nothing matches by keyword.
        const hasKeywordMatch = mapped.some(r => r.similarity >= 0.85);
        const results = hasKeywordMatch
            ? mapped.filter(r => r.similarity >= 0.85)
            : mapped.filter(r => r.similarity >= 0.3);

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
