import { For } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import type { MetaField } from '@nexa/types';

export interface MetaListProps {
  fields: MetaField[];
  rows: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
}

export function MetaList(props: MetaListProps) {
  const columns = () => props.fields.filter((f) => !f.deletedAt).map((f) => f.name);

  let parentRef: HTMLDivElement | undefined;
  const virtualizer = createVirtualizer({
    get count() { return props.rows.length; },
    getScrollElement: () => parentRef ?? null,
    estimateSize: () => 40,
    overscan: 5,
  });

  return (
    <div ref={parentRef} class="h-[400px] overflow-auto rounded-md border">
      <table class="w-full text-sm">
        <thead class="sticky top-0 bg-gray-100">
          <tr>
            <For each={columns()}>
              {(col) => <th class="px-3 py-2 text-left font-medium">{col}</th>}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={virtualizer.getVirtualItems()}>
            {(item) => {
              const row = props.rows[item.index];
              return (
                <tr
                  class="border-t hover:bg-gray-50 cursor-pointer"
                  style={{ height: `${item.size}px` }}
                  onClick={() => props.onRowClick?.(row)}
                >
                  <For each={columns()}>
                    {(col) => <td class="px-3 py-2">{String(row[col] ?? '')}</td>}
                  </For>
                </tr>
              );
            }}
          </For>
        </tbody>
      </table>
    </div>
  );
}