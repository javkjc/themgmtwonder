import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

type SeedFile = {
  documentType: string;
  serializedText: string;
  confirmedFields: Record<string, string | null>;
  isSynthetic: boolean;
  goldStandard: boolean;
};

const OLLAMA_EMBEDDINGS_URL =
  process.env.OLLAMA_EMBEDDINGS_URL ?? 'http://ollama:11434/api/embeddings';
const EMBEDDING_MODEL = 'nomic-embed-text';
const EXPECTED_DIMENSIONS = 768;

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is missing`);
  }
  return value;
}

function resolveSeedDir(): string {
  if (process.env.SEED_CORPUS_DIR) {
    return process.env.SEED_CORPUS_DIR;
  }
  // When run via ts-node inside the container, __dirname is /app/src/scripts.
  // The seed_corpus volume is mounted at /seed_corpus.
  return '/seed_corpus';
}

async function readSeedFiles(seedDir: string): Promise<Array<{ fileName: string; seed: SeedFile }>> {
  const dirEntries = await readdir(seedDir, { withFileTypes: true });
  const jsonFiles = dirEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (jsonFiles.length === 0) {
    throw new Error(`No seed JSON files found in ${seedDir}`);
  }

  const records: Array<{ fileName: string; seed: SeedFile }> = [];
  for (const fileName of jsonFiles) {
    const filePath = path.join(seedDir, fileName);
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SeedFile>;

    if (
      typeof parsed.documentType !== 'string' ||
      typeof parsed.serializedText !== 'string' ||
      parsed.confirmedFields == null ||
      typeof parsed.confirmedFields !== 'object'
    ) {
      throw new Error(`Invalid seed schema in ${fileName}`);
    }

    records.push({
      fileName,
      seed: {
        documentType: parsed.documentType,
        serializedText: parsed.serializedText,
        confirmedFields: parsed.confirmedFields as Record<string, string | null>,
        isSynthetic: parsed.isSynthetic === true,
        goldStandard: parsed.goldStandard === true,
      },
    });
  }

  return records;
}

async function embedWithOllama(serializedText: string): Promise<number[]> {
  const response = await fetch(OLLAMA_EMBEDDINGS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: `search_document: ${serializedText}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama embeddings request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { embedding?: unknown };
  if (!Array.isArray(payload.embedding)) {
    throw new Error('Ollama embeddings response did not include embedding[]');
  }

  const embedding = payload.embedding.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (embedding.length !== EXPECTED_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch: expected ${EXPECTED_DIMENSIONS}, got ${embedding.length}`,
    );
  }

  return embedding;
}

async function resolveDocumentTypeId(pool: Pool, documentTypeName: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    'SELECT id FROM document_types WHERE name = $1 LIMIT 1',
    [documentTypeName],
  );

  if (result.rows.length === 0) {
    throw new Error(`document_types row not found for documentType="${documentTypeName}"`);
  }

  return result.rows[0].id;
}

async function upsertSyntheticSeed(
  pool: Pool,
  documentTypeId: string,
  serializedText: string,
  confirmedFields: Record<string, string | null>,
  embedding: number[],
): Promise<'inserted' | 'updated'> {
  const existing = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM baseline_embeddings
      WHERE document_type_id = $1
        AND is_synthetic = TRUE
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [documentTypeId],
  );

  const embeddingLiteral = `[${embedding.join(',')}]`;
  const prefixedSerializedText = `search_document: ${serializedText}`;
  const confirmedFieldsJson = JSON.stringify(confirmedFields);

  if (existing.rows.length > 0) {
    await pool.query(
      `
        UPDATE baseline_embeddings
        SET embedding = $2::vector,
            serialized_text = $3,
            confirmed_fields = $4::jsonb,
            is_synthetic = TRUE,
            gold_standard = TRUE,
            quality_gate = 'admin'
        WHERE id = $1
      `,
      [existing.rows[0].id, embeddingLiteral, prefixedSerializedText, confirmedFieldsJson],
    );
    return 'updated';
  }

  await pool.query(
    `
      INSERT INTO baseline_embeddings (
        baseline_id,
        document_type_id,
        embedding,
        serialized_text,
        confirmed_fields,
        is_synthetic,
        gold_standard,
        quality_gate,
        created_at
      )
      VALUES (
        NULL,
        $1,
        $2::vector,
        $3,
        $4::jsonb,
        TRUE,
        TRUE,
        'admin',
        NOW()
      )
    `,
    [documentTypeId, embeddingLiteral, prefixedSerializedText, confirmedFieldsJson],
  );

  return 'inserted';
}

async function main(): Promise<void> {
  const databaseUrl = assertEnv('DATABASE_URL');
  const seedDir = resolveSeedDir();
  const seedRecords = await readSeedFiles(seedDir);

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    let inserted = 0;
    let updated = 0;

    for (const record of seedRecords) {
      const { fileName, seed } = record;
      const documentTypeId = await resolveDocumentTypeId(pool, seed.documentType);
      const embedding = await embedWithOllama(seed.serializedText);
      const outcome = await upsertSyntheticSeed(
        pool,
        documentTypeId,
        seed.serializedText,
        seed.confirmedFields,
        embedding,
      );

      if (outcome === 'inserted') {
        inserted += 1;
      } else {
        updated += 1;
      }

      // Keep output compact for first-deploy manual runs.
      console.log(
        `[seed-corpus] ${outcome} file=${fileName} documentType=${seed.documentType} documentTypeId=${documentTypeId}`,
      );
    }

    console.log(
      `[seed-corpus] complete files=${seedRecords.length} inserted=${inserted} updated=${updated}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed-corpus] failed: ${message}`);
  process.exit(1);
});
