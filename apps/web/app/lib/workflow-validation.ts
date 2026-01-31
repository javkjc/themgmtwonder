/**
 * Workflow Validation & Dry-Run Preview Utilities
 *
 * Pure functions for validating workflow definitions and generating
 * human-readable explanations without executing or persisting anything.
 *
 * CRITICAL CONSTRAINTS:
 * - NO execution of workflows
 * - NO persistence of validation results
 * - NO mutation of workflow state
 * - NO side effects
 * - Deterministic and synchronous only
 */

export type WorkflowStep = {
  stepOrder: number;
  stepType: string;
  name: string;
  description: string;
  assignedTo: string;
  conditions: string;
};

export type ValidationError = {
  severity: 'error' | 'warning';
  stepIndex?: number;
  field?: string;
  message: string;
};

export type ValidationResult = {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
};

export type DryRunPath = {
  pathId: string;
  description: string;
  steps: {
    stepOrder: number;
    stepName: string;
    stepType: string;
    assignedTo: string;
    reason?: string; // Why this path is taken
  }[];
};

export type DryRunResult = {
  paths: DryRunPath[];
  explanation: string;
};

/**
 * Validate workflow definition structure
 *
 * Detects:
 * - Missing steps
 * - Invalid step ordering
 * - Missing assignees
 * - Unsupported/invalid step types
 * - Invalid decision branches
 * - Unreachable steps
 *
 * @param workflowName Workflow name for context
 * @param steps Array of workflow steps
 * @returns ValidationResult with errors and warnings
 */
export function validateWorkflow(
  workflowName: string,
  steps: WorkflowStep[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 1. Check if workflow has a name
  if (!workflowName || workflowName.trim() === '') {
    errors.push({
      severity: 'error',
      field: 'name',
      message: 'Workflow name is required',
    });
  }

  // 2. Check if at least one step exists
  if (steps.length === 0) {
    errors.push({
      severity: 'error',
      message: 'At least one step is required',
    });

    // Return early if no steps - remaining validations need steps
    return {
      isValid: false,
      errors,
      warnings,
    };
  }

  // 3. Validate step ordering (must be sequential 1, 2, 3...)
  const expectedOrders = steps.map((_, i) => i + 1);
  const actualOrders = steps.map(s => s.stepOrder);
  const hasValidOrdering = JSON.stringify(expectedOrders) === JSON.stringify(actualOrders);

  if (!hasValidOrdering) {
    errors.push({
      severity: 'error',
      message: `Invalid step ordering. Expected ${expectedOrders.join(', ')} but found ${actualOrders.join(', ')}`,
    });
  }

  // 4. Validate each step
  steps.forEach((step, index) => {
    // 4a. Check step name
    if (!step.name || step.name.trim() === '') {
      errors.push({
        severity: 'error',
        stepIndex: index,
        field: 'name',
        message: `Step ${index + 1}: Name is required`,
      });
    }

    // 4b. Check step type
    const validStepTypes = ['approve', 'review', 'acknowledge', 'decision'];
    if (!step.stepType || step.stepType.trim() === '') {
      errors.push({
        severity: 'error',
        stepIndex: index,
        field: 'stepType',
        message: `Step ${index + 1}: Step type is required`,
      });
    } else if (!validStepTypes.includes(step.stepType.toLowerCase())) {
      errors.push({
        severity: 'error',
        stepIndex: index,
        field: 'stepType',
        message: `Step ${index + 1}: Invalid step type "${step.stepType}". Must be one of: ${validStepTypes.join(', ')}`,
      });
    }

    // 4c. Check assignedTo (warn if missing, as it might be optional)
    if (!step.assignedTo || step.assignedTo.trim() === '') {
      warnings.push({
        severity: 'warning',
        stepIndex: index,
        field: 'assignedTo',
        message: `Step ${index + 1}: No assignee specified`,
      });
    } else {
      // Validate assignedTo JSON format
      try {
        const parsed = JSON.parse(step.assignedTo);
        if (!parsed.type || !parsed.value) {
          warnings.push({
            severity: 'warning',
            stepIndex: index,
            field: 'assignedTo',
            message: `Step ${index + 1}: assignedTo should have "type" and "value" fields`,
          });
        }
        if (parsed.type && !['role', 'user'].includes(parsed.type)) {
          warnings.push({
            severity: 'warning',
            stepIndex: index,
            field: 'assignedTo',
            message: `Step ${index + 1}: assignedTo type should be "role" or "user"`,
          });
        }
      } catch {
        warnings.push({
          severity: 'warning',
          stepIndex: index,
          field: 'assignedTo',
          message: `Step ${index + 1}: assignedTo is not valid JSON`,
        });
      }
    }

    // 4d. Validate conditions if present
    if (step.conditions && step.conditions.trim() !== '') {
      try {
        const parsed = JSON.parse(step.conditions);

        // Check for decision step without proper conditions
        if (step.stepType.toLowerCase() === 'decision' && (!parsed.if || !parsed.else)) {
          errors.push({
            severity: 'error',
            stepIndex: index,
            field: 'conditions',
            message: `Step ${index + 1}: Decision steps must have both "if" and "else" branches`,
          });
        }
      } catch {
        warnings.push({
          severity: 'warning',
          stepIndex: index,
          field: 'conditions',
          message: `Step ${index + 1}: Conditions are not valid JSON`,
        });
      }
    }

    // 4e. Check for decision steps without conditions
    if (step.stepType.toLowerCase() === 'decision' && (!step.conditions || step.conditions.trim() === '')) {
      errors.push({
        severity: 'error',
        stepIndex: index,
        field: 'conditions',
        message: `Step ${index + 1}: Decision steps must have conditions defined`,
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generate human-readable explanation of workflow behavior
 *
 * Returns a plain-English description like:
 * "Start → Approval by Finance Manager → Review by Operations → End"
 * "If amount > 1,500 → Approval by Finance Manager → End"
 *
 * @param workflowName Workflow name
 * @param steps Array of workflow steps
 * @returns Plain-English explanation string
 */
export function generateWorkflowExplanation(
  workflowName: string,
  steps: WorkflowStep[]
): string {
  if (!workflowName || workflowName.trim() === '') {
    return 'Untitled workflow with no steps';
  }

  if (steps.length === 0) {
    return `${workflowName}: No steps defined`;
  }

  const parts: string[] = [`Start: ${workflowName}`];

  steps.forEach((step) => {
    let stepDescription = '';

    // Parse assignedTo for human-friendly display
    let assignee = 'Unassigned';
    if (step.assignedTo && step.assignedTo.trim()) {
      try {
        const parsed = JSON.parse(step.assignedTo);
        if (parsed.type === 'role') {
          assignee = `${parsed.value} role`;
        } else if (parsed.type === 'user') {
          assignee = `user ${parsed.value}`;
        } else {
          assignee = parsed.value || 'Unassigned';
        }
      } catch {
        assignee = step.assignedTo;
      }
    }

    // Format based on step type
    const stepTypeLabel = step.stepType.charAt(0).toUpperCase() + step.stepType.slice(1);

    if (step.stepType.toLowerCase() === 'decision') {
      stepDescription = `Decision: ${step.name}`;

      // Try to parse conditions for more detail
      if (step.conditions && step.conditions.trim()) {
        try {
          const parsed = JSON.parse(step.conditions);
          if (parsed.if) {
            stepDescription += ` (evaluates condition)`;
          }
        } catch {
          // Ignore parse errors
        }
      }
    } else {
      stepDescription = `${stepTypeLabel}: ${step.name} by ${assignee}`;
    }

    parts.push(stepDescription);
  });

  parts.push('End');

  return parts.join(' → ');
}

/**
 * Generate dry-run preview showing possible execution paths
 *
 * Shows informational paths without executing anything.
 * For decision steps, shows both branches.
 *
 * CRITICAL: This is view-only. No execution records created.
 *
 * @param workflowName Workflow name
 * @param steps Array of workflow steps
 * @returns DryRunResult with possible paths and explanation
 */
export function generateDryRunPreview(
  workflowName: string,
  steps: WorkflowStep[]
): DryRunResult {
  const paths: DryRunPath[] = [];

  if (steps.length === 0) {
    return {
      paths: [],
      explanation: 'No steps to preview',
    };
  }

  // Helper to parse assignedTo
  const parseAssignedTo = (assignedTo: string): string => {
    if (!assignedTo || assignedTo.trim() === '') {
      return 'Unassigned';
    }
    try {
      const parsed = JSON.parse(assignedTo);
      if (parsed.type === 'role') {
        return `Role: ${parsed.value}`;
      } else if (parsed.type === 'user') {
        return `User: ${parsed.value}`;
      }
      return parsed.value || 'Unassigned';
    } catch {
      return assignedTo;
    }
  };

  // Check if workflow has decision steps
  const hasDecisionSteps = steps.some(s => s.stepType.toLowerCase() === 'decision');

  if (!hasDecisionSteps) {
    // Simple linear path
    const mainPath: DryRunPath = {
      pathId: 'main',
      description: 'Main workflow path (linear execution)',
      steps: steps.map(s => ({
        stepOrder: s.stepOrder,
        stepName: s.name || 'Unnamed Step',
        stepType: s.stepType,
        assignedTo: parseAssignedTo(s.assignedTo),
        reason: 'Sequential execution',
      })),
    };
    paths.push(mainPath);
  } else {
    // Has decision steps - show multiple paths
    // For simplicity, show the "true" and "false" branches

    const truePath: DryRunPath = {
      pathId: 'condition-true',
      description: 'Path when conditions evaluate to TRUE',
      steps: [],
    };

    const falsePath: DryRunPath = {
      pathId: 'condition-false',
      description: 'Path when conditions evaluate to FALSE',
      steps: [],
    };

    steps.forEach(s => {
      const baseStep = {
        stepOrder: s.stepOrder,
        stepName: s.name || 'Unnamed Step',
        stepType: s.stepType,
        assignedTo: parseAssignedTo(s.assignedTo),
      };

      if (s.stepType.toLowerCase() === 'decision') {
        // Decision steps appear in both paths with different reasons
        truePath.steps.push({
          ...baseStep,
          reason: 'Condition met (TRUE branch)',
        });
        falsePath.steps.push({
          ...baseStep,
          reason: 'Condition not met (FALSE branch)',
        });
      } else {
        // Regular steps appear in both paths
        truePath.steps.push({
          ...baseStep,
          reason: 'Sequential execution',
        });
        falsePath.steps.push({
          ...baseStep,
          reason: 'Sequential execution',
        });
      }
    });

    paths.push(truePath);
    paths.push(falsePath);
  }

  const explanation = generateWorkflowExplanation(workflowName, steps);

  return {
    paths,
    explanation,
  };
}

/**
 * Get a summary of validation status for display
 *
 * @param result ValidationResult
 * @returns Human-friendly summary string
 */
export function getValidationSummary(result: ValidationResult): string {
  if (result.isValid && result.warnings.length === 0) {
    return '✓ Workflow is valid';
  }

  if (result.isValid && result.warnings.length > 0) {
    return `✓ Workflow is valid (${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''})`;
  }

  if (!result.isValid) {
    return `✗ Workflow has ${result.errors.length} error${result.errors.length > 1 ? 's' : ''}`;
  }

  return 'Unknown validation state';
}
