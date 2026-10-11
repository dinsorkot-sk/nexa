const en = {
  common: {
    close: 'Close',
    loading: 'Loading',
    empty: '—',
    yes: 'Yes',
    no: 'No',
    select: 'Select',
    required: 'Required',
    noResults: 'No results',
  },
  combobox: {
    loading: 'Searching…',
    error: 'Could not load options',
    retry: 'Retry',
    toggle: 'Show options',
    remove: 'Remove {label}',
  },
  datepicker: {
    open: 'Open calendar',
    prev: 'Previous month',
    next: 'Next month',
  },
  link: {
    fileNote: 'Enter a link to the file. Uploading files is not supported yet.',
    imageNote: 'Enter a link to the image. Uploading images is not supported yet.',
    previewAlt: 'Image preview',
    invalid: 'Enter a link that starts with http:// or https://',
    previewFailed: 'The image could not be loaded from this link',
    open: 'Open link',
  },
  json: {
    invalid: 'Enter valid JSON: an object or an array',
  },
  field: {
    computed: 'Calculated automatically',
  },
  table: {
    sortBy: 'Sort by {field} — {direction}',
    sortAsc: 'ascending',
    sortDesc: 'descending',
    sortClear: 'clear sorting',
    emptyTitle: 'No records yet',
    emptyDescription: 'Records will appear here once they are created.',
    retry: 'Retry',
  },
  form: {
    save: 'Save',
    cancel: 'Cancel',
    readonly: 'Read-only: you can view but not change this record.',
    conflict: 'This record was changed by someone else. Reload and try again.',
    invalid: 'Some values are invalid. Check the highlighted fields.',
  },
  detail: {
    fields: 'Fields',
    relations: 'Related records',
    activity: 'Activity',
    noLinks: 'No linked records',
    noActivity: 'No activity yet',
  },
  pagination: {
    label: 'Pagination',
    range: '{from}–{to} of {total} (page {page} of {pages})',
    empty: 'No records',
    perPage: 'Rows per page',
    perPageOption: '{n} rows',
    prev: 'Previous page',
    next: 'Next page',
  },
  dialog: {
    close: 'Close dialog',
  },
  theme: {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
  locale: {
    th: 'ไทย',
    en: 'English',
  },
};

export type Messages = typeof en;
export default en;
