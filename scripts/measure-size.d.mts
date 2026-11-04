export interface SizedFile {
  /** Path inside dist/, with forward slashes. */
  file: string;
  bytes: number;
  gzipBytes: number;
}

export interface SizeReport {
  /** Largest first. */
  files: SizedFile[];
  totalBytes: number;
  totalGzipBytes: number;
}

/** Sizes of every JavaScript and CSS file under distDir. Throws if the folder is missing or has none. */
export function measureDist(distDir: string): Promise<SizeReport>;

/** A plain-text table of a report. */
export function formatReport(report: SizeReport): string;
