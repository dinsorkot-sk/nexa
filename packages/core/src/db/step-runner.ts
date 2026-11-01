export interface StepStatus {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
}

export interface MigrationState {
  id: string;
  version: number;
  steps: StepStatus[];
}

export interface StepExecutor {
  (sql: string): Promise<void>;
}

export class StepRunner {
  private state: MigrationState;

  constructor(migrationId: string, version: number, stepIds: string[]) {
    this.state = {
      id: migrationId,
      version,
      steps: stepIds.map((id) => ({ id, status: 'pending' })),
    };
  }

  getState(): MigrationState {
    return this.state;
  }

  async run(steps: { id: string; sql: string }[], executor: StepExecutor): Promise<MigrationState> {
    for (const step of steps) {
      const status = this.state.steps.find((s) => s.id === step.id);
      if (!status) continue;
      if (status.status === 'completed') continue; // idempotent skip
      try {
        await executor(step.sql);
        status.status = 'completed';
      } catch (err) {
        status.status = 'failed';
        status.error = err instanceof Error ? err.message : String(err);
        throw err;
      }
    }
    return this.state;
  }

  /** Mark a step completed externally (e.g. after manual recovery). */
  markCompleted(stepId: string): void {
    const s = this.state.steps.find((x) => x.id === stepId);
    if (s) s.status = 'completed';
  }
}

/** Restore a runner from a persisted state. */
export function restoreRunner(state: MigrationState): StepRunner {
  const runner = new StepRunner(state.id, state.version, state.steps.map((s) => s.id));
  runner.getState().steps = state.steps.map((s) => ({ ...s }));
  return runner;
}