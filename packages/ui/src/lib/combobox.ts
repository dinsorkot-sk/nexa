export interface ComboboxOption { value: string; label: string }

export interface LoadOptionsContext {
  /** Never more than comboboxMaxLimit. Pass it to the server as the page size. */
  limit: number;
  /** Aborted when a newer search supersedes this one or the component unmounts. */
  signal: AbortSignal;
}

export type LoadOptions = (search: string, context: LoadOptionsContext) => Promise<ComboboxOption[]>;

/** The API caps list queries at 100 rows, so the picker never asks for or shows more. */
export const comboboxMaxLimit = 100;
