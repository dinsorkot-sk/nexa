import { createSignal } from 'solid-js';
import { Button } from '@nexa/ui';
import { greet } from '@nexa/core';
import { MetaForm } from './components/Form';
import { MetaList } from './components/List';
import { SchemaDesigner } from './components/SchemaDesigner';
import type { MetaField } from '@nexa/types';

const sampleFields: MetaField[] = [
  { id: '1', entityId: 'e1', name: 'name', label: 'Name', logicalType: 'text', physicalName: 'name', nullable: false, unique: false, required: true, isSystem: false, scale: null, precision: null, length: 100, default: null, referenceEntity: null, formula: null, deletedAt: null, createdAt: '' },
  { id: '2', entityId: 'e1', name: 'age', label: 'Age', logicalType: 'integer', physicalName: 'age', nullable: true, unique: false, required: false, isSystem: false, scale: null, precision: null, length: null, default: null, referenceEntity: null, formula: null, deletedAt: null, createdAt: '' },
  { id: '3', entityId: 'e1', name: 'active', label: 'Active', logicalType: 'boolean', physicalName: 'active', nullable: true, unique: false, required: false, isSystem: false, scale: null, precision: null, length: null, default: null, referenceEntity: null, formula: null, deletedAt: null, createdAt: '' },
];

export function App() {
  const [rows, setRows] = createSignal<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = createSignal(false);
  const [showDesigner, setShowDesigner] = createSignal(false);
  const [entities] = createSignal([{ id: 'e1', name: 'Customer', tableName: 'customer', version: 1, status: 'published' as const, isSystem: false, createdAt: '', updatedAt: '' }]);

  const handleSubmit = (values: Record<string, unknown>) => {
    setRows((prev) => [...prev, { id: String(prev.length + 1), ...values }]);
    setShowForm(false);
  };

  return (
    <main style={{ padding: '24px' }}>
      <h1>Nexa Web</h1>
      <p>{greet({ id: '1', email: 'a@b.com', name: 'Nexa', passwordHash: '', createdAt: new Date().toISOString() })}</p>
      <Button onClick={() => setShowForm((s) => !s)}>{showForm() ? 'Cancel' : 'New'}</Button>
      <Button onClick={() => setShowDesigner((s) => !s)}>{showDesigner() ? 'Hide Designer' : 'Schema Designer'}</Button>
      {showForm() && <MetaForm fields={sampleFields} onSubmit={handleSubmit} />}
      {showDesigner() && (
        <div style={{ 'margin-top': '16px' }}>
          <SchemaDesigner
            entities={entities()}
            fieldsByEntity={{ e1: sampleFields }}
            versions={[{ version: 1, status: 'published' }]}
            onCreateEntity={(name, table) => console.log('create', name, table)}
            onAddField={(eid, f) => console.log('add field', eid, f.name)}
            onPublish={(eid) => console.log('publish', eid)}
            onRollback={(v) => console.log('rollback', v)}
          />
        </div>
      )}
      <div style={{ 'margin-top': '16px' }}>
        <MetaList fields={sampleFields} rows={rows()} />
      </div>
    </main>
  );
}