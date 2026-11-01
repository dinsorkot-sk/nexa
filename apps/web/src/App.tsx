import { createSignal } from 'solid-js';
import { Button } from '@nexa/ui';
import { greet } from '@nexa/core';
import { MetaForm } from './components/Form';
import { MetaList } from './components/List';
import type { MetaField } from '@nexa/types';

const sampleFields: MetaField[] = [
  { id: '1', entityId: 'e1', name: 'name', label: 'Name', logicalType: 'text', physicalName: 'name', nullable: false, unique: false, required: true, isSystem: false, scale: null, precision: null, length: 100, default: null, referenceEntity: null, formula: null, deletedAt: null, createdAt: '' },
  { id: '2', entityId: 'e1', name: 'age', label: 'Age', logicalType: 'integer', physicalName: 'age', nullable: true, unique: false, required: false, isSystem: false, scale: null, precision: null, length: null, default: null, referenceEntity: null, formula: null, deletedAt: null, createdAt: '' },
  { id: '3', entityId: 'e1', name: 'active', label: 'Active', logicalType: 'boolean', physicalName: 'active', nullable: true, unique: false, required: false, isSystem: false, scale: null, precision: null, length: null, default: null, referenceEntity: null, formula: null, deletedAt: null, createdAt: '' },
];

export function App() {
  const [rows, setRows] = createSignal<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = createSignal(false);

  const handleSubmit = (values: Record<string, unknown>) => {
    setRows((prev) => [...prev, { id: String(prev.length + 1), ...values }]);
    setShowForm(false);
  };

  return (
    <main style={{ padding: '24px' }}>
      <h1>Nexa Web</h1>
      <p>{greet({ id: '1', email: 'a@b.com', name: 'Nexa', passwordHash: '', createdAt: new Date().toISOString() })}</p>
      <Button onClick={() => setShowForm((s) => !s)}>{showForm() ? 'Cancel' : 'New'}</Button>
      {showForm() && <MetaForm fields={sampleFields} onSubmit={handleSubmit} />}
      <div style={{ 'margin-top': '16px' }}>
        <MetaList fields={sampleFields} rows={rows()} />
      </div>
    </main>
  );
}