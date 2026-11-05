import { ShiftReport } from '../types';
import { canonicalJson, sha256 } from './crypto';

/**
 * Canonical content sealed by a report's integrity hash.
 * Shared by the browser (local mode / verification) and the
 * `finalizeShiftReport` Cloud Function, so both produce identical hashes.
 */
export const sealedContent = (r: ShiftReport) => canonicalJson({
  id: r.id, date: r.date, shift: r.shift, title: r.title, events: r.events,
  summary: r.summary, handoverNotes: r.handoverNotes, contributors: r.contributors,
  createdBy: r.createdBy, createdAt: r.createdAt, finalizedAt: r.finalizedAt, finalizedBy: r.finalizedBy,
});

export const computeIntegrityHash = (r: ShiftReport) => sha256(sealedContent(r));

/** Audit entry hash: SHA-256 over the canonical entry without its `hash` field. */
export const auditEntryHash = (entry: Record<string, unknown>) => {
  const { hash, ...rest } = entry;
  return sha256(canonicalJson(rest));
};
