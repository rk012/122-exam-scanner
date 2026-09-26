/**
 * A1-notation helpers. Column indices are 0-based throughout the sheets
 * module (0 = A); sheet rows are 1-based, matching what Google shows.
 */

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function columnLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`column index must be a non-negative integer, got ${index}`);
  }
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** "A" -> 0, "Z" -> 25, "AA" -> 26. */
export function columnIndex(letters: string): number {
  if (!/^[A-Z]+$/i.test(letters)) {
    throw new RangeError(`not a column reference: ${JSON.stringify(letters)}`);
  }
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Quotes a tab name for A1 notation. Single quotes inside are doubled. */
export function quoteTab(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}

/** `'Tab'!C7:E` — open-ended column range starting at `fromRow`. */
export function columnRange(tab: string, firstCol: number, lastCol: number, fromRow: number): string {
  return `${quoteTab(tab)}!${columnLetter(firstCol)}${fromRow}:${columnLetter(lastCol)}`;
}

/** `'Tab'!1:6` — whole rows. */
export function rowRange(tab: string, firstRow: number, lastRow: number): string {
  return `${quoteTab(tab)}!${firstRow}:${lastRow}`;
}

/** `'Tab'!G12` — a single cell. */
export function cellRange(tab: string, col: number, row: number): string {
  return `${quoteTab(tab)}!${columnLetter(col)}${row}`;
}
