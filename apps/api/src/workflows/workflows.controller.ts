import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { WorkflowsService } from './workflows.service';
import { AuditService } from '../audit/audit.service';
import { StartWorkflowDto, StepActionDto } from './dto';

@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /workflows
   * Admin-only: List all workflow definitions
   */
  @Get()
  @UseGuards(AdminGuard)
  async listWorkflows() {
    return this.workflowsService.listWorkflows();
  }

  /**
   * GET /workflows/:id
   * Admin-only: Get workflow definition with steps
   */
  @Get(':id')
  @UseGuards(AdminGuard)
  async getWorkflowById(@Param('id') id: string) {
    return this.workflowsService.getWorkflowById(id);
  }

  /**
   * POST /workflows/:id/execute
   * Explicitly start a workflow execution.
   * Creates a WorkflowExecution record only - does not execute steps.
   */
  @Post(':id/execute')
  async startWorkflow(
    @Param('id') workflowDefinitionId: string,
    @Body() dto: StartWorkflowDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;

    // Start workflow execution (creates record only)
    const execution = await this.workflowsService.startWorkflow(
      workflowDefinitionId,
      userId,
      dto,
    );

    // Audit log entry with before/after snapshot
    await this.auditService.log({
      userId,
      action: 'workflow.start',
      module: 'workflow',
      resourceType: 'workflow_execution',
      resourceId: execution.id,
      details: {
        workflowDefinitionId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        status: execution.status,
        inputs: dto.inputs || null,
        before: null, // No prior state - new execution
        after: {
          id: execution.id,
          workflowDefinitionId: execution.workflowDefinitionId,
          resourceType: execution.resourceType,
          resourceId: execution.resourceId,
          status: execution.status,
          triggeredBy: execution.triggeredBy,
          startedAt: execution.startedAt,
        },
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return execution;
  }

  /**
   * POST /workflows/executions/:executionId/steps/:stepId/action
   * Explicitly act on a workflow step (approve/reject/acknowledge).
   * Requires mandatory remark and creates audit log entry.
   */
  @Post('executions/:executionId/steps/:stepId/action')
  async executeStepAction(
    @Param('executionId') executionId: string,
    @Param('stepId') stepId: string,
    @Body() dto: StepActionDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;

    // Capture state before action
    const executionBefore = await this.workflowsService.getExecution(executionId);

    // Execute step action
    const stepExecution = await this.workflowsService.executeStepAction(
      executionId,
      stepId,
      userId,
      dto,
    );

    // Capture state after action
    const executionAfter = await this.workflowsService.getExecution(executionId);

    // Audit log entry with before/after snapshot
    await this.auditService.log({
      userId,
      action: 'workflow.step_action',
      module: 'workflow',
      resourceType: 'workflow_step_execution',
      resourceId: stepExecution.id,
      details: {
        executionId,
        stepId,
        decision: dto.decision,
        remark: dto.remark,
        before: {
          executionStatus: executionBefore.status,
        },
        after: {
          executionStatus: executionAfter.status,
          stepExecutionId: stepExecution.id,
          stepStatus: stepExecution.status,
          decision: stepExecution.decision,
          completedAt: stepExecution.completedAt,
        },
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return stepExecution;
  }
}
