import {
  Controller,
  Post,
  Put,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { WorkflowsService } from './workflows.service';
import { AuditService } from '../audit/audit.service';
import { StartWorkflowDto, StepActionDto, CreateWorkflowDto, UpdateWorkflowDto, CreateVersionDto, CreateElementTemplateDto, UpdateElementTemplateDto, DeprecateElementTemplateDto } from './dto';

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
   * GET /workflows/my-pending-steps
   * v7: User-facing endpoint to retrieve pending workflow steps assigned to current user.
   * Returns steps that have not yet been acted upon.
   */
  @Get('my-pending-steps')
  async getMyPendingSteps(@Req() req: any) {
    const userId = req.user.id;
    return this.workflowsService.getMyPendingSteps(userId);
  }

  /**
   * GET /workflows/executions/:executionId/detail
   * v7: User-facing read-only endpoint to retrieve execution detail with step history.
   * Returns execution metadata and ordered step history.
   * No mutation from this endpoint.
   */
  @Get('executions/:executionId/detail')
  async getExecutionDetail(@Param('executionId') executionId: string) {
    return this.workflowsService.getExecutionDetail(executionId);
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
   * POST /workflows
   * Admin-only: Create a new workflow definition with steps (draft mode)
   * Creates workflow as version 1, inactive
   */
  @Post()
  @UseGuards(AdminGuard)
  async createWorkflow(@Body() dto: CreateWorkflowDto, @Req() req: any) {
    const userId = req.user.id;

    // Create workflow (returns workflow with steps)
    const workflow = await this.workflowsService.createWorkflow(dto, userId);

    // Audit log entry
    await this.auditService.log({
      userId,
      action: 'workflow.create',
      module: 'workflow',
      resourceType: 'workflow_definition',
      resourceId: workflow.id,
      details: {
        name: workflow.name,
        description: workflow.description,
        version: workflow.version,
        stepCount: workflow.steps.length,
        before: null, // No prior state - new workflow
        after: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          version: workflow.version,
          isActive: workflow.isActive,
          steps: workflow.steps.map((s) => ({
            stepOrder: s.stepOrder,
            stepType: s.stepType,
            name: s.name,
          })),
        },
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return workflow;
  }

  /**
   * PUT /workflows/:id
   * Admin-only: Update workflow definition and steps (draft mode)
   * Does NOT change version or activation status
   */
  @Put(':id')
  @UseGuards(AdminGuard)
  async updateWorkflow(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;

    // Capture state before update
    const workflowBefore = await this.workflowsService.getWorkflowById(id);

    // Update workflow
    const workflowAfter = await this.workflowsService.updateWorkflow(id, dto, userId);

    // Audit log entry with before/after snapshot
    await this.auditService.log({
      userId,
      action: 'workflow.update',
      module: 'workflow',
      resourceType: 'workflow_definition',
      resourceId: id,
      details: {
        before: {
          name: workflowBefore.name,
          description: workflowBefore.description,
          stepCount: workflowBefore.steps.length,
          steps: workflowBefore.steps.map((s) => ({
            stepOrder: s.stepOrder,
            stepType: s.stepType,
            name: s.name,
          })),
        },
        after: {
          name: workflowAfter.name,
          description: workflowAfter.description,
          stepCount: workflowAfter.steps.length,
          steps: workflowAfter.steps.map((s) => ({
            stepOrder: s.stepOrder,
            stepType: s.stepType,
            name: s.name,
          })),
        },
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return workflowAfter;
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

  /**
   * POST /workflows/versions
   * Admin-only: Create a new version by cloning an existing workflow
   */
  @Post('versions')
  @UseGuards(AdminGuard)
  async createVersion(@Body() dto: CreateVersionDto, @Req() req: any) {
    const userId = req.user.id;

    // Capture source workflow state before cloning
    const sourceWorkflow = await this.workflowsService.getWorkflowById(dto.sourceWorkflowId);

    // Create new version
    const newVersion = await this.workflowsService.createVersion(dto, userId);

    // Audit log entry
    await this.auditService.log({
      userId,
      action: 'workflow.create_version',
      module: 'workflow',
      resourceType: 'workflow_definition',
      resourceId: newVersion.id,
      details: {
        sourceWorkflowId: dto.sourceWorkflowId,
        sourceVersion: sourceWorkflow.version,
        newVersion: newVersion.version,
        workflowGroupId: newVersion.workflowGroupId,
        before: {
          sourceId: sourceWorkflow.id,
          sourceName: sourceWorkflow.name,
          sourceVersion: sourceWorkflow.version,
        },
        after: {
          id: newVersion.id,
          name: newVersion.name,
          version: newVersion.version,
          isActive: newVersion.isActive,
          workflowGroupId: newVersion.workflowGroupId,
          stepCount: newVersion.steps.length,
        },
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return newVersion;
  }

  /**
   * POST /workflows/:id/activate
   * Admin-only: Activate a workflow version (deactivates others in same group)
   */
  @Post(':id/activate')
  @UseGuards(AdminGuard)
  async activateWorkflow(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.id;

    // Capture state before activation
    const workflowBefore = await this.workflowsService.getWorkflowById(id);

    // Activate workflow (deactivates others)
    const workflowAfter = await this.workflowsService.activateWorkflow(id, userId);

    // Audit log entry
    await this.auditService.log({
      userId,
      action: 'workflow.activate',
      module: 'workflow',
      resourceType: 'workflow_definition',
      resourceId: id,
      details: {
        workflowGroupId: workflowAfter.workflowGroupId,
        version: workflowAfter.version,
        before: {
          isActive: workflowBefore.isActive,
        },
        after: {
          isActive: workflowAfter.isActive,
        },
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return workflowAfter;
  }

  /**
   * POST /workflows/:id/deactivate
   * Admin-only: Deactivate a workflow version
   */
  @Post(':id/deactivate')
  @UseGuards(AdminGuard)
  async deactivateWorkflow(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.id;

    // Capture state before deactivation
    const workflowBefore = await this.workflowsService.getWorkflowById(id);

    // Deactivate workflow
    const workflowAfter = await this.workflowsService.deactivateWorkflow(id, userId);

    // Audit log entry
    await this.auditService.log({
      userId,
      action: 'workflow.deactivate',
      module: 'workflow',
      resourceType: 'workflow_definition',
      resourceId: id,
      details: {
        workflowGroupId: workflowAfter.workflowGroupId,
        version: workflowAfter.version,
        before: {
          isActive: workflowBefore.isActive,
        },
        after: {
          isActive: workflowAfter.isActive,
        },
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return workflowAfter;
  }

  /**
   * GET /workflows/:id/versions
   * Admin-only: List all versions of a workflow group
   */
  @Get(':id/versions')
  @UseGuards(AdminGuard)
  async listWorkflowVersions(@Param('id') id: string) {
    // Get the workflow to determine its group
    const workflow = await this.workflowsService.getWorkflowById(id);
    const workflowGroupId = workflow.workflowGroupId || workflow.id;

    // Return all versions in the group
    return this.workflowsService.listWorkflowVersions(workflowGroupId);
  }

  /**
   * GET /workflows/elements/templates
   * Admin-only: List all element templates
   */
  @Get('elements/templates')
  @UseGuards(AdminGuard)
  async listElementTemplates() {
    return this.workflowsService.listElementTemplates();
  }

  /**
   * GET /workflows/elements/templates/:id
   * Admin-only: Get element template by ID
   */
  @Get('elements/templates/:id')
  @UseGuards(AdminGuard)
  async getElementTemplateById(@Param('id') id: string) {
    return this.workflowsService.getElementTemplateById(id);
  }

  /**
   * POST /workflows/elements/templates
   * Admin-only: Create a new element template
   */
  @Post('elements/templates')
  @UseGuards(AdminGuard)
  async createElementTemplate(@Body() dto: CreateElementTemplateDto, @Req() req: any) {
    const userId = req.user.id;

    // Create element template
    const template = await this.workflowsService.createElementTemplate(dto, userId);

    // Audit log entry
    await this.auditService.log({
      userId,
      action: 'workflow.element_template.create',
      module: 'workflow',
      resourceType: 'workflow_element_template',
      resourceId: template.id,
      details: {
        before: null,
        after: {
          id: template.id,
          elementType: template.elementType,
          displayLabel: template.displayLabel,
          stepType: template.stepType,
          templateVersion: template.templateVersion,
          templateGroupId: template.templateGroupId,
        },
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return template;
  }

  /**
   * POST /workflows/elements/templates/:id/version
   * Admin-only: Create a new version of an element template
   */
  @Post('elements/templates/:id/version')
  @UseGuards(AdminGuard)
  async createElementTemplateVersion(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.id;

    // Capture source template
    const sourceTemplate = await this.workflowsService.getElementTemplateById(id);

    // Create new version
    const newVersion = await this.workflowsService.createElementTemplateVersion(id, userId);

    // Audit log entry
    await this.auditService.log({
      userId,
      action: 'workflow.element_template.create_version',
      module: 'workflow',
      resourceType: 'workflow_element_template',
      resourceId: newVersion.id,
      details: {
        sourceTemplateId: id,
        sourceVersion: sourceTemplate.templateVersion,
        newVersion: newVersion.templateVersion,
        templateGroupId: newVersion.templateGroupId,
        before: {
          sourceId: sourceTemplate.id,
          sourceVersion: sourceTemplate.templateVersion,
        },
        after: {
          id: newVersion.id,
          templateVersion: newVersion.templateVersion,
          displayLabel: newVersion.displayLabel,
        },
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return newVersion;
  }

  /**
   * PUT /workflows/elements/templates/:id
   * Admin-only: Update element template (creates new version)
   */
  @Put('elements/templates/:id')
  @UseGuards(AdminGuard)
  async updateElementTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateElementTemplateDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;

    // Capture state before update
    const templateBefore = await this.workflowsService.getElementTemplateById(id);

    // Update template (creates new version)
    const templateAfter = await this.workflowsService.updateElementTemplate(id, dto, userId);

    // Audit log entry
    await this.auditService.log({
      userId,
      action: 'workflow.element_template.update',
      module: 'workflow',
      resourceType: 'workflow_element_template',
      resourceId: templateAfter.id,
      details: {
        sourceTemplateId: id,
        before: {
          displayLabel: templateBefore.displayLabel,
          stepType: templateBefore.stepType,
          templateVersion: templateBefore.templateVersion,
        },
        after: {
          id: templateAfter.id,
          displayLabel: templateAfter.displayLabel,
          stepType: templateAfter.stepType,
          templateVersion: templateAfter.templateVersion,
        },
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return templateAfter;
  }

  /**
   * POST /workflows/elements/templates/:id/deprecate
   * Admin-only: Deprecate an element template
   */
  @Post('elements/templates/:id/deprecate')
  @UseGuards(AdminGuard)
  async deprecateElementTemplate(
    @Param('id') id: string,
    @Body() dto: DeprecateElementTemplateDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;

    // Capture state before deprecation
    const templateBefore = await this.workflowsService.getElementTemplateById(id);

    // Deprecate template
    const templateAfter = await this.workflowsService.deprecateElementTemplate(id, dto, userId);

    // Audit log entry
    await this.auditService.log({
      userId,
      action: 'workflow.element_template.deprecate',
      module: 'workflow',
      resourceType: 'workflow_element_template',
      resourceId: id,
      details: {
        before: {
          isDeprecated: templateBefore.isDeprecated,
        },
        after: {
          isDeprecated: templateAfter.isDeprecated,
        },
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return templateAfter;
  }

  /**
   * GET /workflows/elements/templates/:id/versions
   * Admin-only: List all versions of an element template group
   */
  @Get('elements/templates/:id/versions')
  @UseGuards(AdminGuard)
  async listElementTemplateVersions(@Param('id') id: string) {
    // Get the template to determine its group
    const template = await this.workflowsService.getElementTemplateById(id);
    const templateGroupId = template.templateGroupId || template.id;

    // Return all versions in the group
    return this.workflowsService.listElementTemplateVersions(templateGroupId);
  }
}
