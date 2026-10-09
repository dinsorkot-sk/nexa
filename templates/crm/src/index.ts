/** CRM template: accounts, contacts, and deal pipeline. Pure metadata. */
export const crmTemplate = {
  moduleId: 'crm',
  name: 'CRM',
  version: '1.0.0',
  description: 'Accounts, contacts, and deals',
  entities: [
    {
      id: 'account', name: 'account', label: 'Account', pluralLabel: 'Accounts', description: 'Companies', settings: {},
      fields: [
        { id: 'name', name: 'name', label: 'Name', type: 'text', options: { required: true, searchable: true }, position: 0 },
        { id: 'website', name: 'website', label: 'Website', type: 'url', options: {}, position: 1 },
      ],
    },
    {
      id: 'contact', name: 'contact', label: 'Contact', pluralLabel: 'Contacts', description: 'People', settings: {},
      fields: [
        { id: 'fullName', name: 'fullName', label: 'Full name', type: 'text', options: { required: true, searchable: true }, position: 0 },
        { id: 'email', name: 'email', label: 'Email', type: 'email', options: { unique: true }, position: 1 },
        { id: 'phone', name: 'phone', label: 'Phone', type: 'phone', options: {}, position: 2 },
      ],
    },
    {
      id: 'deal', name: 'deal', label: 'Deal', pluralLabel: 'Deals', description: 'Pipeline opportunities', settings: {},
      fields: [
        { id: 'title', name: 'title', label: 'Title', type: 'text', options: { required: true, searchable: true }, position: 0 },
        { id: 'amount', name: 'amount', label: 'Amount', type: 'currency', options: {}, position: 1 },
        { id: 'stage', name: 'stage', label: 'Stage', type: 'select', options: { choices: [{ value: 'lead', label: 'Lead' }, { value: 'qualified', label: 'Qualified' }, { value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }] }, position: 2 },
      ],
    },
  ],
  relations: [
    { id: 'account-contact', name: 'account-contact', sourceEntityId: 'account', targetEntityId: 'contact', type: 'manyToOne' },
    { id: 'account-deal', name: 'account-deal', sourceEntityId: 'account', targetEntityId: 'deal', type: 'manyToOne' },
  ],
} as const;
