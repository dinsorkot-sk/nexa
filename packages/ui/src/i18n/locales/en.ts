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
