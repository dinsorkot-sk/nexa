export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else {
          quoted = false;
          i += 1;
        }
      } else {
        cell += char;
        i += 1;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
      i += 1;
    } else if (char === ',') {
      pushCell();
      i += 1;
    } else if (char === '\r' && text[i + 1] === '\n') {
      pushRow();
      i += 2;
    } else if (char === '\n' || char === '\r') {
      pushRow();
      i += 1;
    } else {
      cell += char;
      i += 1;
    }
  }
  if (cell !== '' || row.length > 0 || quoted) pushRow();
  if (rows.length > 0 && rows[rows.length - 1]!.length === 1 && rows[rows.length - 1]![0] === '') rows.pop();
  return rows;
}

export function serializeCsv(headers: string[], rows: string[][]): string {
  const serializeCell = (value: string) => {
    if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
    return value;
  };
  return [headers, ...rows]
    .map((row) => row.map(serializeCell).join(','))
    .join('\r\n');
}
