import { createSignal, For } from 'solid-js';
import type { MetaEntity, MetaField } from '@nexa/types';

export interface SchemaDesignerProps {
  entities: MetaEntity[];
  fieldsByEntity: Record<string, MetaField[]>;
  versions?: { version: number; status: string }[];
  onCreateEntity: (name: string, tableName: string) => void;
  onAddField: (entityId: string, field: Omit<MetaField, 'id' | 'createdAt'>) => void;
  onPublish: (entityId: string) => void;
  onRollback?: (version: number) => void;
}

export function SchemaDesigner(props: SchemaDesignerProps) {
  const [newEntityName, setNewEntityName] = createSignal('');
  const [newTableName, setNewTableName] = createSignal('');
  const [selectedEntity, setSelectedEntity] = createSignal<string | null>(null);
  const [newFieldName, setNewFieldName] = createSignal('');
  const [newFieldType, setNewFieldType] = createSignal<MetaField['logicalType']>('text');
  const [showDiff, setShowDiff] = createSignal(false);

  const selectedFields = () => {
    const id = selectedEntity();
    return id ? (props.fieldsByEntity[id] ?? []) : [];
  };

  const handleCreateEntity = () => {
    if (!newEntityName() || !newTableName()) return;
    props.onCreateEntity(newEntityName(), newTableName());
    setNewEntityName('');
    setNewTableName('');
  };

  const handleAddField = () => {
    const id = selectedEntity();
    if (!id || !newFieldName()) return;
    props.onAddField(id, {
      entityId: id,
      name: newFieldName(),
      label: newFieldName(),
      logicalType: newFieldType(),
      physicalName: newFieldName(),
      nullable: true,
      unique: false,
      required: false,
      isSystem: false,
      scale: null,
      precision: null,
      length: null,
      default: null,
      referenceEntity: null,
      formula: null,
      deletedAt: null,
    });
    setNewFieldName('');
  };

  return (
    <div class="flex gap-6">
      {/* Entity list */}
      <div class="w-1/3 rounded-md border p-4">
        <h2 class="mb-3 text-lg font-semibold">Entities</h2>
        <For each={props.entities}>
          {(e) => (
            <div
              class={`cursor-pointer rounded px-2 py-1 ${selectedEntity() === e.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
              onClick={() => setSelectedEntity(e.id)}
            >
              {e.name} <span class="text-xs text-gray-500">({e.status})</span>
            </div>
          )}
        </For>
        <div class="mt-4 flex flex-col gap-2">
          <input
            class="rounded border px-2 py-1 text-sm"
            placeholder="Entity name"
            value={newEntityName()}
            onInput={(e) => setNewEntityName(e.currentTarget.value)}
          />
          <input
            class="rounded border px-2 py-1 text-sm"
            placeholder="Table name"
            value={newTableName()}
            onInput={(e) => setNewTableName(e.currentTarget.value)}
          />
          <button
            class="rounded bg-black px-3 py-1 text-sm text-white"
            onClick={handleCreateEntity}
          >
            Create Entity
          </button>
        </div>
      </div>

      {/* Field editor */}
      <div class="w-2/3 rounded-md border p-4">
        <h2 class="mb-3 text-lg font-semibold">Fields</h2>
        {selectedEntity() ? (
          <>
            <For each={selectedFields()}>
              {(f) => (
                <div class="mb-2 rounded border px-3 py-2 text-sm">
                  <span class="font-medium">{f.name}</span>
                  <span class="ml-2 text-gray-500">{f.logicalType}</span>
                  {f.isSystem && <span class="ml-2 text-xs text-blue-500">(system)</span>}
                  {f.deletedAt && <span class="ml-2 text-xs text-red-500">(deleted)</span>}
                </div>
              )}
            </For>
            <div class="mt-4 flex gap-2">
              <input
                class="rounded border px-2 py-1 text-sm"
                placeholder="Field name"
                value={newFieldName()}
                onInput={(e) => setNewFieldName(e.currentTarget.value)}
              />
              <select
                class="rounded border px-2 py-1 text-sm"
                value={newFieldType()}
                onChange={(e) => setNewFieldType(e.currentTarget.value as MetaField['logicalType'])}
              >
                <option value="text">text</option>
                <option value="integer">integer</option>
                <option value="boolean">boolean</option>
                <option value="decimal">decimal</option>
                <option value="datetime">datetime</option>
                <option value="json">json</option>
                <option value="uuid">uuid</option>
              </select>
              <button
                class="rounded bg-black px-3 py-1 text-sm text-white"
                onClick={handleAddField}
              >
                Add Field
              </button>
            </div>

            <div class="mt-6 flex gap-2">
              <button
                class="rounded border px-3 py-1 text-sm"
                onClick={() => setShowDiff((s) => !s)}
              >
                {showDiff() ? 'Hide' : 'Preview'} Diff
              </button>
              <button
                class="rounded bg-green-600 px-3 py-1 text-sm text-white"
                onClick={() => { const id = selectedEntity(); if (id) props.onPublish(id); }}
              >
                Publish
              </button>
            </div>

            {showDiff() && (
              <div class="mt-4 rounded border bg-gray-50 p-3 text-xs font-mono">
                <p class="font-semibold">Diff preview (DDL):</p>
                <p>CREATE TABLE {props.entities.find((e) => e.id === selectedEntity())?.tableName} (...)</p>
                <p class="text-gray-500">-- {selectedFields().length} fields</p>
              </div>
            )}

            {props.versions && props.versions.length > 0 && (
              <div class="mt-4 rounded border p-3">
                <p class="mb-2 text-sm font-semibold">Version history</p>
                <For each={props.versions}>
                  {(v) => (
                    <div class="flex items-center justify-between py-1 text-xs">
                      <span>v{v.version} — {v.status}</span>
                      {props.onRollback && (
                        <button
                          class="text-blue-600 hover:underline"
                          onClick={() => props.onRollback!(v.version)}
                        >
                          Rollback
                        </button>
                      )}
                    </div>
                  )}
                </For>
              </div>
            )}
          </>
        ) : (
          <p class="text-gray-500">Select an entity to edit</p>
        )}
      </div>
    </div>
  );
}