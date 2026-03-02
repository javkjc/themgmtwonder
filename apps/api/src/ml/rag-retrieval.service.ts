import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';

export interface RagRetrievedExample {
  serializedText: string;
  confirmedFields: Record<string, string | null>;
}

interface BaselineEmbeddingRow {
  serialized_text: string;
  confirmed_fields: Record<string, string | null>;
}

@Injectable()
export class RagRetrievalService {
  private readonly logger = new Logger(RagRetrievalService.name);
  private readonly timeoutMs = 5000;
  private readonly ollamaEmbeddingsUrl = 'http://ollama:11434/api/embeddings';

  constructor(private readonly dbs: DbService) { }

  async retrieve(
    serializedText: string,
    documentTypeId: string | null,
  ): Promise<RagRetrievedExample[]> {
    try {
      const queryVector = await this.embedQuery(serializedText);
      if (queryVector.length === 0) {
        return [];
      }

      const vectorLiteral = `[${queryVector.join(',')}]`;

      // Without a document_type_id we cannot scope the retrieval to the right
      // document family, so we return nothing rather than inject examples from
      // an unrelated vendor / layout into the prompt.
      if (!documentTypeId) {
        return [];
      }

      const result = await this.dbs.db.execute(sql`
            SELECT serialized_text, confirmed_fields
            FROM baseline_embeddings
            WHERE document_type_id = ${documentTypeId}
            ORDER BY embedding <=> ${vectorLiteral}::vector
            LIMIT 3;
          `);

      const rows = (result.rows ?? []) as BaselineEmbeddingRow[];
      return rows.map((row) => ({
        serializedText: row.serialized_text,
        confirmedFields: row.confirmed_fields,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown retrieval error';
      this.logger.warn(`rag.retrieval.unavailable: ${message}`);
      return [];
    }
  }

  private async embedQuery(prompt: string): Promise<number[]> {
    const prefixedPrompt = 'search_query: ' + prompt;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.ollamaEmbeddingsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: prefixedPrompt,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`embedding http status ${response.status}`);
      }

      const payload = await response.json();
      const embedding = Array.isArray(payload?.embedding)
        ? payload.embedding
        : [];

      if (!Array.isArray(embedding)) {
        throw new Error('embedding payload malformed');
      }

      return embedding.filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
