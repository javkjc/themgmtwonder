import { test, expect } from '@playwright/test';
import { uniqueTitle, apiPost, apiPut } from '../_fixtures/test-utils';

test.describe('Workflows API', () => {
  test('can create, update, and drive workflow execution', async ({ context, testInfo }) => {
    test.skip(testInfo.project.name !== 'admin', 'Workflow API tests run under admin project');

    const workflowName = uniqueTitle('workflow-api');
    const createPayload = {
      name: workflowName,
      description: 'E2E coverage workflow',
      steps: [
        { stepOrder: 1, stepType: 'approval', name: 'Approve Request', description: 'Approve via API' },
      ],
    };

    const workflow = await apiPost(context, '/workflows', createPayload);
    expect(workflow).toHaveProperty('id');
    expect(Array.isArray(workflow.steps)).toBe(true);
    const stepId = workflow.steps[0]?.id;
    expect(stepId).toBeDefined();

    const updated = await apiPut(context, `/workflows/${workflow.id}`, {
      name: `${workflowName}-updated`,
      description: 'Updated via test',
      steps: [{ stepOrder: 1, stepType: 'approval', name: 'Approve Revised' }],
    });
    expect(updated.name).toContain('updated');

    await apiPost(context, `/workflows/${workflow.id}/activate`);

    const todoTitle = uniqueTitle('workflow-task');
    const todo = await apiPost(context, '/todos', { title: todoTitle });
    expect(todo).toHaveProperty('id');

    const execution = await apiPost(context, `/workflows/${workflow.id}/execute`, {
      resourceType: 'todo',
      resourceId: todo.id,
    });
    expect(execution).toHaveProperty('id');

    const action = await apiPost(
      context,
      `/workflows/executions/${execution.id}/steps/${stepId}/action`,
      {
        decision: 'approve',
        remark: 'Approving workflow entry',
      }
    );
    expect(action.decision).toBe('approve');
  });
});
