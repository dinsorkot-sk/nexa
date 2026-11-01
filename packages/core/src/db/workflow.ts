import type { MetaWorkflow } from '@nexa/types';

export interface WorkflowInstance {
  entity: string;
  recordId: string;
  state: string;
}

export class WorkflowEngine {
  constructor(private workflow: MetaWorkflow) {}

  currentState(instance: WorkflowInstance): string {
    return instance.state;
  }

  /** Returns allowed next states from current state. */
  availableTransitions(state: string): string[] {
    return this.workflow.transitions.filter((t) => t.from === state).map((t) => t.to);
  }

  /** Attempt a transition; throws if not allowed. */
  transition(instance: WorkflowInstance, to: string, guard?: () => boolean): WorkflowInstance {
    const t = this.workflow.transitions.find((tr) => tr.from === instance.state && tr.to === to);
    if (!t) throw new Error(`Transition ${instance.state} -> ${to} not allowed`);
    if (guard && !guard()) throw new Error(`Guard failed for ${instance.state} -> ${to}`);
    if (!this.workflow.states.includes(to)) throw new Error(`Unknown state: ${to}`);
    return { ...instance, state: to };
  }

  isTerminal(state: string): boolean {
    return this.availableTransitions(state).length === 0;
  }
}