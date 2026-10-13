import { afterEach, describe, expect, it } from 'vitest';
import { mountWithI18n } from './helpers';
import MockShell from '../src/mockups/parts/MockShell.vue';
import MetaDetail from '../src/components/MetaDetail.vue';
import MetaForm from '../src/components/MetaForm.vue';
import { sampleAutomations, sampleWorkflows } from '../src/mockups/parts/data';
import { vehicleFields, vehicleForm, vehicleRows } from '../src/mockups/_fixtures';

afterEach(() => { document.body.innerHTML = ''; });

describe('mockup shell', () => {
  it('renders breadcrumbs without a trailing chevron after the last crumb', () => {
    const wrapper = mountWithI18n(MockShell, {
      props: { active: 'apps', title: 'กข-1234', crumbs: ['Apps', 'Fleet', 'Vehicles'] },
      slots: { default: '<p>body</p>' },
    });
    const nav = wrapper.get('nav[aria-label="Breadcrumb"]');
    // crumbs are static spans; the chevron svg sits between them
    expect(nav.findAll('span').filter((s) => ['Apps', 'Fleet', 'Vehicles'].includes(s.text()))).toHaveLength(3);
    // chevrons are rendered between crumbs only: n - 1
    expect(nav.findAll('svg')).toHaveLength(2);
    wrapper.unmount();
  });

  it('marks the active nav item with aria-current', () => {
    const wrapper = mountWithI18n(MockShell, { props: { active: 'modules', title: 'Modules' } });
    const current = wrapper.findAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.text()).toBe('Modules');
    wrapper.unmount();
  });
});

describe('records mockup content', () => {
  const existing = vehicleRows[0]!;

  it('renders the detail view from real MetaDetail with the vehicle fixture', () => {
    const wrapper = mountWithI18n(MetaDetail, {
      props: {
        record: existing,
        fields: vehicleFields,
        activity: { items: [], total: 0 },
        relations: [],
        currency: 'THB',
      },
    });
    expect(wrapper.text()).toContain('Toyota');
    wrapper.unmount();
  });

  it('renders the edit form pre-filled with the stored record and version', () => {
    const wrapper = mountWithI18n(MetaForm, {
      props: { form: vehicleForm, fields: vehicleFields, initialData: existing.data, version: existing.version },
    });
    const plate = wrapper.find('input[value="กข-1234"]');
    expect(plate.exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders the viewer read-only form without a submit button', () => {
    const wrapper = mountWithI18n(MetaForm, {
      props: { form: vehicleForm, fields: vehicleFields, initialData: existing.data, readonly: true },
    });
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('module detail sample data', () => {
  it('provides workflow and automation sample rows with failure counts', () => {
    expect(sampleWorkflows.length).toBeGreaterThan(0);
    expect(sampleAutomations.some((a) => a.failures > 0)).toBe(true);
  });
});
