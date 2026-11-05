import { ReportExportOptions, ReportTemplate, User } from '../types';
import { realtimeStore } from './realtimeStore';
import { auditService } from './auditService';

export const TEMPLATES_COLLECTION = 'report_templates';

export const templateService = {
  subscribe(listener: (t: ReportTemplate[]) => void): () => void {
    return realtimeStore.subscribe<ReportTemplate>(TEMPLATES_COLLECTION, docs =>
      listener([...docs].sort((a, b) => a.name.localeCompare(b.name))));
  },

  async save(actor: User, name: string, description: string, options: ReportExportOptions, existing?: ReportTemplate): Promise<ReportTemplate> {
    const clean = name.trim();
    if (!clean) throw new Error('Template name is required');
    const now = new Date().toISOString();
    // Templates never store a report-specific title.
    const tpl: ReportTemplate = {
      id: existing?.id ?? crypto.randomUUID(),
      name: clean,
      description: description.trim(),
      options: { ...options, title: '' },
      createdBy: existing?.createdBy ?? actor.username,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await realtimeStore.set(TEMPLATES_COLLECTION, tpl);
    auditService.log(actor, 'REPORT_TEMPLATE_SAVED', { id: tpl.id, name: tpl.name }, { classification: tpl.options.classification, sections: tpl.options.customSections.length });
    return tpl;
  },

  async remove(actor: User, tpl: ReportTemplate): Promise<void> {
    await realtimeStore.remove(TEMPLATES_COLLECTION, tpl.id);
    auditService.log(actor, 'REPORT_TEMPLATE_DELETED', { id: tpl.id, name: tpl.name });
  },

  /** Apply a template to the customizer state, keeping the user-facing title. */
  apply(tpl: ReportTemplate, current: ReportExportOptions): ReportExportOptions {
    return {
      ...JSON.parse(JSON.stringify(tpl.options)),
      title: current.title,
      preparedBy: current.preparedBy,
      customSections: tpl.options.customSections.map(s => ({ ...s, id: crypto.randomUUID() })),
    };
  },
};
