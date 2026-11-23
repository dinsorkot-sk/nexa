import { EngineError, type ModelDef, type ModuleManifest } from '../contracts/index.js';

export const MODULE_NAME_RE = /^[a-z][a-z0-9_]*$/;
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Parse an `x.y.z` version (throws on anything else). */
export function parseVersion(v: string): [number, number, number] {
  const m = VERSION_RE.exec(v);
  if (!m) throw new EngineError(`Invalid version '${v}' (expected x.y.z)`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Compare two `x.y.z` versions: negative, zero or positive. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * The set of available modules (code). Validates names, versions, dependencies and cycles, and
 * computes a deterministic topological order (dependencies first; ties broken by name).
 */
export class ModuleCatalog {
  private readonly byName = new Map<string, ModuleManifest>();
  /** all module names, dependencies first */
  readonly order: readonly string[];

  constructor(manifests: readonly ModuleManifest[]) {
    for (const m of manifests) {
      if (typeof m.name !== 'string' || !MODULE_NAME_RE.test(m.name)) throw new EngineError(`Invalid module name '${String(m.name)}'`);
      parseVersion(m.version);
      if (this.byName.has(m.name)) throw new EngineError(`Module '${m.name}' declared twice`);
      for (const [v] of Object.entries(m.hooks?.migrate ?? {})) parseVersion(v);
      // tag model definitions with their owning module
      const models: ModelDef[] = (m.models ?? []).map((d) => ({ ...d, origin: 'module', module: m.name }));
      this.byName.set(m.name, { ...m, depends: [...new Set(m.depends ?? [])], models });
    }
    for (const m of this.byName.values()) {
      for (const d of m.depends) {
        if (!this.byName.has(d)) throw new EngineError(`Module '${m.name}' depends on unknown module '${d}'`);
      }
    }
    this.order = this.topo();
    this.checkModelReferences();
  }

  /**
   * A module may only extend / reference models defined by itself or its transitive dependencies
   * (models no catalog module defines, e.g. legacy base models, are not checked here). Without this,
   * a new module version could make every tenant fail to build its registry at open.
   */
  private checkModelReferences(): void {
    const definedBy = new Map<string, string>();
    for (const n of this.order) {
      for (const d of this.get(n).models ?? []) if (!d.extends?.includes(d.name) && !definedBy.has(d.name)) definedBy.set(d.name, n);
    }
    for (const n of this.order) {
      const visible = new Set(this.withDependencies([n]));
      for (const d of this.get(n).models ?? []) {
        const targets = [...(d.extends ?? []), ...Object.keys(d.delegates ?? {}),
          ...Object.values(d.fields).map((f) => f.comodel).filter((c): c is string => !!c)];
        for (const t of targets) {
          const owner = definedBy.get(t);
          if (owner && !visible.has(owner)) {
            throw new EngineError(`Module '${n}' uses model '${t}' of module '${owner}' without depending on it`);
          }
        }
      }
    }
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  get(name: string): ModuleManifest {
    const m = this.byName.get(name);
    if (!m) throw new EngineError(`Unknown module '${name}'`);
    return m;
  }

  get manifests(): ModuleManifest[] {
    return this.order.map((n) => this.byName.get(n)!);
  }

  /** `names` plus all their (transitive) dependencies, in topological order. */
  withDependencies(names: Iterable<string>): string[] {
    const want = new Set<string>();
    const visit = (n: string): void => {
      if (want.has(n)) return;
      want.add(n);
      for (const d of this.get(n).depends) visit(d);
    };
    for (const n of names) visit(n);
    return this.sort(want);
  }

  /** `names` plus all modules (transitively) depending on them, in topological order. */
  withDependents(names: Iterable<string>): string[] {
    const want = new Set<string>();
    for (const n of names) { this.get(n); want.add(n); }
    for (const n of this.order) {
      if (this.get(n).depends.some((d) => want.has(d))) want.add(n);
    }
    return this.sort(want);
  }

  /** Order a subset of module names topologically. */
  sort(names: Iterable<string>): string[] {
    const s = new Set(names);
    return this.order.filter((n) => s.has(n));
  }

  private topo(): string[] {
    const indeg = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const m of this.byName.values()) {
      indeg.set(m.name, m.depends.length);
      for (const d of m.depends) {
        let l = dependents.get(d);
        if (!l) dependents.set(d, (l = []));
        l.push(m.name);
      }
    }
    const ready = [...indeg].filter(([, n]) => n === 0).map(([k]) => k).sort();
    const out: string[] = [];
    while (ready.length) {
      const n = ready.shift()!;
      out.push(n);
      for (const dep of dependents.get(n) ?? []) {
        const left = indeg.get(dep)! - 1;
        indeg.set(dep, left);
        if (left === 0) {
          ready.push(dep);
          ready.sort();
        }
      }
    }
    if (out.length !== this.byName.size) {
      const stuck = [...indeg].filter(([, n]) => n > 0).map(([k]) => k).sort();
      throw new EngineError(`Module dependency cycle among: ${stuck.join(', ')}`);
    }
    return out;
  }
}
