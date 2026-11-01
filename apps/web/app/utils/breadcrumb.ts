import type { RouteLocationNormalized } from 'vue-router';
import type { ModuleMeta } from '../composables/useMetadata';

const SECTION_KEYS: Record<string, string> = {
  entities: 'nav.entities',
  relations: 'nav.relations',
  views: 'nav.viewsForms',
  forms: 'nav.viewsForms',
  workflows: 'nav.workflows',
  automations: 'nav.automations',
  reports: 'nav.reports',
  dashboards: 'nav.dashboardsNav',
  permissions: 'nav.permissions',
  versions: 'nav.packages',
  organization: 'nav.organization',
  members: 'nav.members',
  roles: 'nav.roles',
  audit: 'nav.audit',
  events: 'nav.events',
  operations: 'nav.operations',
  templates: 'nav.templates',
};

export interface BreadcrumbLink {
  label: string;
  to?: string;
}

export function buildBreadcrumb(route: RouteLocationNormalized, modules: ModuleMeta[]): BreadcrumbLink[] {
  const { t } = useI18n();
  const links: BreadcrumbLink[] = [];
  const seg = route.path.split('/').filter(Boolean);

  if (seg.length === 0) return [{ label: t('nav.home') }];

  const push = (label: string, to?: string) => links.push(to ? { label, to } : { label });

  if (seg[0] === 'm' && seg.length >= 3) {
    const moduleKey = seg[1];
    const entityName = seg[2];
    const mod = modules.find((m) => m.key === moduleKey);
    const entity = mod?.entities.find((e) => e.name === entityName);
    if (mod) push(mod.name, `/m/${moduleKey}/${entityName}`);
    if (entity) push(entity.label);
    const rest = seg.slice(3);
    if (rest.includes('new')) push(t('common.new'));
    else if (rest.includes('import')) push(t('records.import'));
    else if (rest[0] && !['new', 'import'].includes(rest[0])) push(rest[0]);
    return links;
  }

  if (seg[0] === 'dashboards') {
    push(t('nav.dashboards'));
    if (seg[1]) push(seg[1]);
    return links;
  }

  if (seg[0] === 'settings') {
    push(t('nav.settings'));
    return links;
  }

  if (seg[0] === 'builder') {
    push(t('nav.builder'));
    if (seg[1] === 'modules' && seg[2]) {
      push(t('nav.modules'), '/builder/modules');
      push(seg[2]);
      const section = seg[3];
      if (section) push(t(SECTION_KEYS[section] ?? 'nav.overview'));
    } else if (seg[1]) {
      push(t(SECTION_KEYS[seg[1]] ?? 'nav.modules'));
    }
    return links;
  }

  if (seg[0] === 'admin') {
    push(t('nav.administration'));
    if (seg[1]) push(t(SECTION_KEYS[seg[1]] ?? 'nav.organization'));
    return links;
  }

  return seg.map((s) => ({ label: s }));
}
