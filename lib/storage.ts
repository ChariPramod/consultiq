export type StorageUsage = {
  measured_at: string;
  total_records: number;
  logical_text_bytes: number;
  tables: {
    table: string;
    domain: string;
    records: number;
    logical_text_bytes: number;
  }[];
};
export function formatLogicalBytes(bytes: number) {
  if (bytes < 1024) return `${bytes.toLocaleString()} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let size = bytes / 1024,
    index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  return `${size.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[index]}`;
}
