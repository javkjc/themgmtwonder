import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import {
  workflowDefinitions,
  workflowExecutions,
  workflowSteps,
  workflowStepExecutions,
  todos,
} from '../db/schema';
import { StartWorkflowDto, StepActionDto, CreateWorkflowDto, UpdateWorkflowDto, CreateVersionDto } from './dto';

@Injectable()
export class WorkflowsService {
  constructor(private readonly dbs: DbService) {}

  /**
   * List all workflow definitions with metadata
   * Admin-only read operation
   */
  async listWorkflows() {
    const workflows = await this.dbs.db
      .select({
        id: workflowDefinitions.id,
        name: workflowDefinitions.name,
        description: workflowDefinitions.description,
        version: workflowDefinitions.version,
        isActive: workflowDefinitions.isActive,
        workflowGroupId: workflowDefinitions.workflowGroupId,
        createdAt: workflowDefinitions.createdAt,
        updatedAt: workflowDefinitions.updatedAt,
      })
      .from(workflowDefinitions)
      .orderBy(desc(workflowDefinitions.updatedAt));

    return workflows;
  }

  /**
   * Get workflow definition by ID with all steps
   * Admin-only read operation
   */
  async getWorkflowById(id: string) {
    const [workflow] = await this.dbs.db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, id))
      .limit(1);

    if (!workflow) {
      throw new NotFoundException(`Workflow definition ${id} not found`);
    }

    const steps = await this.dbs.db
      .select()
      .from(workflowSteps)
      .where(eq(workflowSteps.workflowDefinitionId, id))
      .orderBy(workflowSteps.stepOrder);

    return {
      ...workflow,
      steps,
    };
  }

  /**
   * Create a new workflow definition with steps (draft mode)
   * Admin-only operation
   * Does NOT activate or version the workflow - creates as version 1, inactive
   */
  async createWorkflow(dto: CreateWorkflowDto, adminUserId: string) {
    // 1. Create workflow definition (version 1, inactive by default)
    const [workflow] = await this.dbs.db
      .insert(workflowDefinitions)
      .values({
        name: dto.name,
        description: dto.description || null,
        version: 1,
        isActive: false,
        // v6: Set workflowGroupId to self (starts its own version group)
        workflowGroupId: undefined, // Will be backfilled after insert
      })
      .returning();

    // 2. Backfill workflowGroupId to self (starts new version group)
    await this.dbs.db
      .update(workflowDefinitions)
      .set({ workflowGroupId: workflow.id })
      .where(eq(workflowDefinitions.id, workflow.id));

    // 3. Create workflow steps
    if (dto.steps && dto.steps.length > 0) {
      const stepValues = dto.steps.map((step) => ({
        workflowDefinitionId: workflow.id,
        stepOrder: step.stepOrder,
        stepType: step.stepType,
        name: step.name,
        description: step.description || null,
        assignedTo: step.assignedTo || null,
        conditions: step.conditions || null,
      }));

      await this.dbs.db.insert(workflowSteps).values(stepValues);
    }

    // 4. Return workflow with steps
    return this.getWorkflowById(workflow.id);
  }

  /**
   * Update an existing workflow definition and its steps (draft mode)
   * Admin-only operation
   * Replaces all steps with new step definitions
   * Does NOT change version or activation status
   */
  async updateWorkflow(id: string, dto: UpdateWorkflowDto, adminUserId: string) {
    // 1. Verify workflow exists
    const [existingWorkflow] = await this.dbs.db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, id))
      .limit(1);

    if (!existingWorkflow) {
      throw new NotFoundException(`Workflow definition ${id} not found`);
    }

    // 2. Update workflow definition metadata
    await this.dbs.db
      .update(workflowDefinitions)
      .set({
        name: dto.name,
        description: dto.description || null,
        updatedAt: new Date(),
      })
      .where(eq(workflowDefinitions.id, id));

    // 3. Delete existing steps
    await this.dbs.db
      .delete(workflowSteps)
      .where(eq(workflowSteps.workflowDefinitionId, id));

    // 4. Insert new steps
    if (dto.steps && dto.steps.length > 0) {
      const stepValues = dto.steps.map((step) => ({
        workflowDefinitionId: id,
        stepOrder: step.stepOrder,
        stepType: step.stepType,
        name: step.name,
        description: step.description || null,
        assignedTo: step.assignedTo || null,
        conditions: step.conditions || null,
      }));

      await this.dbs.db.insert(workflowSteps).values(stepValues);
    }

    // 5. Return updated workflow with steps
    return this.getWorkflowById(id);
  }

  /**
   * Start a workflow execution explicitly.
   * Validates workflow definition, resource ownership, and creates execution record.
   * Does NOT execute workflow steps - this is just the initialization.
   */
  async startWorkflow(
    workflowDefinitionId: string,
    userId: string,
    dto: StartWorkflowDto,
  ) {
    // 1. Validate workflow definition exists and is active
    const [workflowDef] = await this.dbs.db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, workflowDefinitionId))
      .limit(1);

    if (!workflowDef) {
      throw new NotFoundException(
        `Workflow definition ${workflowDefinitionId} not found`,
      );
    }

    if (!workflowDef.isActive) {
      throw new BadRequestException(
        `Workflow definition ${workflowDef.name} is not active`,
      );
    }

    // 2. Validate resource exists and user has ownership/permission
    await this.validateResourceOwnership(
      dto.resourceType,
      dto.resourceId,
      userId,
    );

    // 3. Create workflow execution record
    const [execution] = await this.dbs.db
      .insert(workflowExecutions)
      .values({
        workflowDefinitionId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        triggeredBy: userId,
        status: 'pending',
        inputs: dto.inputs ? JSON.stringify(dto.inputs) : null,
        startedAt: new Date(),
      })
      .returning();

    return execution;
  }

  /**
   * Validate that the user has permission to trigger workflow on the target resource.
   * Currently supports 'todo' resource type; can be extended for other types.
   */
  private async validateResourceOwnership(
    resourceType: string,
    resourceId: string,
    userId: string,
  ): Promise<void> {
    if (resourceType === 'todo') {
      const [todo] = await this.dbs.db
        .select()
        .from(todos)
        .where(eq(todos.id, resourceId))
        .limit(1);

      if (!todo) {
        throw new NotFoundException(`Todo ${resourceId} not found`);
      }

      if (todo.userId !== userId) {
        throw new ForbiddenException(
          'You do not have permission to trigger workflow on this todo',
        );
      }
    } else {
      // For other resource types, validation can be added here
      throw new BadRequestException(
        `Resource type ${resourceType} is not supported for workflow execution`,
      );
    }
  }

  /**
   * Get workflow execution by ID
   */
  async getExecution(executionId: string) {
    const [execution] = await this.dbs.db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, executionId))
      .limit(1);

    if (!execution) {
      throw new NotFoundException(`Workflow execution ${executionId} not found`);
    }

    return execution;
  }

  /**
   * Execute a step action (approve/reject/acknowledge).
   * Validates execution state, step state, and records the decision.
   * Implements stop-on-error semantics: if this step fails, no auto-progression.
   */
  async executeStepAction(
    executionId: string,
    stepId: string,
    userId: string,
    dto: StepActionDto,
  ) {
    // 1. Validate workflow execution exists and is in a valid state
    const execution = await this.getExecution(executionId);

    if (execution.status === 'completed') {
      throw new BadRequestException(
        'Cannot act on steps of a completed workflow execution',
      );
    }

    if (execution.status === 'failed') {
      throw new BadRequestException(
        'Cannot act on steps of a failed workflow execution',
      );
    }

    if (execution.status === 'cancelled') {
      throw new BadRequestException(
        'Cannot act on steps of a cancelled workflow execution',
      );
    }

    // 2. Validate workflow step exists and belongs to this execution's workflow definition
    const [step] = await this.dbs.db
      .select()
      .from(workflowSteps)
      .where(eq(workflowSteps.id, stepId))
      .limit(1);

    if (!step) {
      throw new NotFoundException(`Workflow step ${stepId} not found`);
    }

    if (step.workflowDefinitionId !== execution.workflowDefinitionId) {
      throw new BadRequestException(
        'Step does not belong to this workflow execution',
      );
    }

    // 3. Check if this step has already been executed
    const [existingStepExecution] = await this.dbs.db
      .select()
      .from(workflowStepExecutions)
      .where(
        and(
          eq(workflowStepExecutions.workflowExecutionId, executionId),
          eq(workflowStepExecutions.workflowStepId, stepId),
        ),
      )
      .limit(1);

    if (existingStepExecution && existingStepExecution.status === 'completed') {
      throw new BadRequestException(
        'This step has already been completed',
      );
    }

    // 4. Create or update step execution record
    const now = new Date();
    let stepExecution;

    if (existingStepExecution) {
      // Update existing step execution
      [stepExecution] = await this.dbs.db
        .update(workflowStepExecutions)
        .set({
          decision: dto.decision,
          remark: dto.remark,
          completedAt: now,
          status: 'completed',
        })
        .where(eq(workflowStepExecutions.id, existingStepExecution.id))
        .returning();
    } else {
      // Create new step execution
      [stepExecution] = await this.dbs.db
        .insert(workflowStepExecutions)
        .values({
          workflowExecutionId: executionId,
          workflowStepId: stepId,
          actorId: userId,
          decision: dto.decision,
          remark: dto.remark,
          startedAt: now,
          completedAt: now,
          status: 'completed',
        })
        .returning();
    }

    // 5. Update workflow execution status to in_progress if it was pending
    if (execution.status === 'pending') {
      await this.dbs.db
        .update(workflowExecutions)
        .set({
          status: 'in_progress',
          updatedAt: now,
        })
        .where(eq(workflowExecutions.id, executionId));
    }

    // 6. Stop-on-error semantics: if decision is 'reject', mark execution as failed
    if (dto.decision === 'reject') {
      await this.dbs.db
        .update(workflowExecutions)
        .set({
          status: 'failed',
          completedAt: now,
          errorDetails: `Step "${step.name}" was rejected by user`,
          updatedAt: now,
        })
        .where(eq(workflowExecutions.id, executionId));
    }

    return stepExecution;
  }

  /**
   * Create a new version of an existing workflow by cloning it.
   * v6: Explicit version creation - clones workflow definition + steps
   * Admin-only operation
   */
  async createVersion(dto: CreateVersionDto, adminUserId: string) {
    // 1. Load source workflow with steps
    const sourceWorkflow = await this.getWorkflowById(dto.sourceWorkflowId);

    // 2. Determine workflowGroupId and next version number
    const workflowGroupId = sourceWorkflow.workflowGroupId || sourceWorkflow.id;

    // Get highest version number in this group
    const groupWorkflows = await this.dbs.db
      .select({ version: workflowDefinitions.version })
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.workflowGroupId, workflowGroupId))
      .orderBy(desc(workflowDefinitions.version))
      .limit(1);

    const nextVersion = groupWorkflows.length > 0 ? groupWorkflows[0].version + 1 : 1;

    // 3. Create new workflow definition (inactive by default)
    const [newWorkflow] = await this.dbs.db
      .insert(workflowDefinitions)
      .values({
        name: sourceWorkflow.name,
        description: sourceWorkflow.description || null,
        version: nextVersion,
        isActive: false, // Always inactive on creation
        workflowGroupId: workflowGroupId,
      })
      .returning();

    // 4. Clone workflow steps
    if (sourceWorkflow.steps && sourceWorkflow.steps.length > 0) {
      const stepValues = sourceWorkflow.steps.map((step) => ({
        workflowDefinitionId: newWorkflow.id,
        stepOrder: step.stepOrder,
        stepType: step.stepType,
        name: step.name,
        description: step.description || null,
        assignedTo: step.assignedTo || null,
        conditions: step.conditions || null,
      }));

      await this.dbs.db.insert(workflowSteps).values(stepValues);
    }

    // 5. Return new workflow with steps
    return this.getWorkflowById(newWorkflow.id);
  }

  /**
   * Activate a workflow version.
   * v6: Enforces invariant - only ONE active version per workflow group.
   * Admin-only operation
   */
  async activateWorkflow(workflowId: string, adminUserId: string) {
    // 1. Verify workflow exists
    const workflow = await this.getWorkflowById(workflowId);

    if (workflow.isActive) {
      throw new BadRequestException('Workflow is already active');
    }

    const workflowGroupId = workflow.workflowGroupId || workflow.id;

    // 2. Deactivate all other versions in the same group (atomic operation)
    await this.dbs.db
      .update(workflowDefinitions)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflowDefinitions.workflowGroupId, workflowGroupId),
          eq(workflowDefinitions.isActive, true),
        ),
      );

    // 3. Activate target workflow
    await this.dbs.db
      .update(workflowDefinitions)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(workflowDefinitions.id, workflowId));

    // 4. Return updated workflow
    return this.getWorkflowById(workflowId);
  }

  /**
   * Deactivate a workflow version.
   * v6: Explicit deactivation - does NOT affect existing executions.
   * Admin-only operation
   */
  async deactivateWorkflow(workflowId: string, adminUserId: string) {
    // 1. Verify workflow exists
    const workflow = await this.getWorkflowById(workflowId);

    if (!workflow.isActive) {
      throw new BadRequestException('Workflow is already inactive');
    }

    // 2. Deactivate workflow
    await this.dbs.db
      .update(workflowDefinitions)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(workflowDefinitions.id, workflowId));

    // 3. Return updated workflow
    return this.getWorkflowById(workflowId);
  }

  /**
   * List all versions of a workflow group.
   * v6: Returns all workflow versions grouped together.
   * Admin-only operation
   */
  async listWorkflowVersions(workflowGroupId: string) {
    const versions = await this.dbs.db
      .select({
        id: workflowDefinitions.id,
        name: workflowDefinitions.name,
        description: workflowDefinitions.description,
        version: workflowDefinitions.version,
        isActive: workflowDefinitions.isActive,
        createdAt: workflowDefinitions.createdAt,
        updatedAt: workflowDefinitions.updatedAt,
        workflowGroupId: workflowDefinitions.workflowGroupId,
      })
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.workflowGroupId, workflowGroupId))
      .orderBy(desc(workflowDefinitions.version));

    return versions;
  }
}
