import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadGatewayException,
  BadRequestException,
} from '@nestjs/common';
import { desc, eq, and, ne } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { mlModelVersions } from '../db/schema';
import { CreateMlModelDto } from './dto/create-ml-model.dto';
import { MlService } from './ml.service';
import { MlPerformanceService } from './ml-performance.service';

@Injectable()
export class MlModelsService {
  constructor(
    private readonly dbs: DbService,
    private readonly mlService: MlService,
    private readonly performanceService: MlPerformanceService,
  ) {}

  async createModel(dto: CreateMlModelDto, createdBy: string) {
    const [record] = await this.dbs.db
      .insert(mlModelVersions)
      .values({
        modelName: dto.modelName,
        version: dto.version,
        filePath: dto.filePath,
        metrics: dto.metrics ?? null,
        isActive: false,
        createdBy,
      })
      .onConflictDoNothing()
      .returning();

    if (!record) {
      throw new ConflictException(
        `Model version '${dto.version}' for '${dto.modelName}' already exists.`,
      );
    }

    return record;
  }

  async listModels() {
    return this.dbs.db
      .select()
      .from(mlModelVersions)
      .orderBy(desc(mlModelVersions.trainedAt));
  }

  async activateModel(version: string): Promise<{
    ok: boolean;
    activeVersion: string;
    previousVersion: string | null;
  }> {
    // 1. Resolve model record by version
    const [target] = await this.dbs.db
      .select()
      .from(mlModelVersions)
      .where(eq(mlModelVersions.version, version))
      .limit(1);

    if (!target) {
      throw new NotFoundException(`Model version '${version}' not found.`);
    }

    // 2. Find current active model (same modelName, different version)
    const [previousActive] = await this.dbs.db
      .select()
      .from(mlModelVersions)
      .where(
        and(
          eq(mlModelVersions.modelName, target.modelName),
          eq(mlModelVersions.isActive, true),
          ne(mlModelVersions.version, version),
        ),
      )
      .limit(1);

    const previousVersion = previousActive?.version ?? null;

    // 3. D5 gate check — block activation if online gate not met
    const gate = await this.performanceService.getGateStatus(target.id);
    if (!gate.onlineGateMet) {
      throw new BadRequestException(
        `Activation blocked: online gate not met. ` +
          `Acceptance delta ${(gate.onlineDelta * 100).toFixed(2)}% (requires ≥5%). ` +
          `Suggestions served: ${gate.onlineSuggestionCount} (requires ≥1000).`,
      );
    }

    // 4. Call ML service to hot-swap
    const mlResult = await this.mlService.activateModel({
      version: target.version,
      filePath: target.filePath,
    });

    if (!mlResult.ok) {
      throw new BadGatewayException(
        mlResult.error?.message ?? 'ML service activation failed.',
      );
    }

    // 5. Transactionally: deactivate previous, activate target
    await this.dbs.db.transaction(async (tx) => {
      if (previousActive) {
        await tx
          .update(mlModelVersions)
          .set({ isActive: false })
          .where(eq(mlModelVersions.id, previousActive.id));
      }
      await tx
        .update(mlModelVersions)
        .set({ isActive: true })
        .where(eq(mlModelVersions.id, target.id));
    });

    return { ok: true, activeVersion: version, previousVersion };
  }
}
