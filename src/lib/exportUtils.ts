/**
 * exportUtils.ts — Client-side export helpers
 * =============================================
 * Provides utilities for downloading data from the browser:
 *   • triggerCSVDownload  — converts a JSON array to CSV and saves it
 *   • downloadAuthBlob    — fetches a URL with the JWT and saves the response as a file
 *   • printPage          — opens the browser print dialog
 */

import { apiClient } from '@/lib/api';

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  // Wrap in quotes if the value contains comma, newline, or double-quote
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of plain objects to a CSV string.
 * Column order follows `headers` (uses the header string as both the
 * display label and the key name — pass `columnMap` for custom mapping).
 */
export function buildCSV(
  rows: Record<string, unknown>[],
  columns: { label: string; key: string }[],
): string {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(',');
  const body = rows.map((row) =>
    columns.map((c) => escapeCsvCell(row[c.key])).join(','),
  );
  return [header, ...body].join('\r\n');
}

/**
 * Trigger a browser download of the given CSV string as a .csv file.
 */
export function triggerCSVDownload(csv: string, filename: string): void {
  // utf-8-sig BOM so Excel opens it correctly
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Fetch a URL via the authenticated Axios client, receive the response as a
 * Blob, and save it to disk using the given filename.
 *
 * Used for the server-generated CSV export endpoint which requires a JWT.
 */
export async function downloadAuthBlob(
  url: string,
  filename: string,
): Promise<void> {
  const response = await apiClient.get(url, { responseType: 'blob' });
  const contentDisposition = response.headers['content-disposition'] as string | undefined;
  // Try to extract filename from Content-Disposition header if present
  const serverFilename = contentDisposition
    ? contentDisposition.match(/filename="?([^"]+)"?/)?.[1]
    : undefined;
  const blob = new Blob([response.data as BlobPart], { type: 'text/csv;charset=utf-8;' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = serverFilename ?? filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

// ---------------------------------------------------------------------------
// Print helper
// ---------------------------------------------------------------------------

/** Open the browser's native print dialog. Use CSS @media print to style. */
export function printPage(): void {
  window.print();
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function formatDateLabel(): string {
  return new Date().toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
