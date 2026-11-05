import { DutySchedule, User } from '../types';
import { ShiftId } from '../lib/shifts';
import { realtimeStore } from './realtimeStore';
import { auditService } from './auditService';

export const DUTY_COLLECTION = 'duty_schedules';

export const emptySchedule = (date: string): DutySchedule => ({
  id: date, date, morning: [], evening: [], night: [], updatedAt: '', updatedBy: '',
});

export const dutyService = {
  /** Real-time listener over all duty schedules, keyed by YYYY-MM-DD. */
  subscribe(listener: (byDate: Record<string, DutySchedule>) => void): () => void {
    return realtimeStore.subscribe<DutySchedule>(DUTY_COLLECTION, docs => {
      const map: Record<string, DutySchedule> = {};
      docs.forEach(d => { map[d.id] = { ...emptySchedule(d.id), ...d }; });
      listener(map);
    });
  },

  async saveDay(actor: User, schedule: DutySchedule, previous?: DutySchedule): Promise<void> {
    const next: DutySchedule = { ...schedule, id: schedule.date, updatedAt: new Date().toISOString(), updatedBy: actor.username };
    await realtimeStore.set(DUTY_COLLECTION, next);
    auditService.log(actor, 'DUTY_SCHEDULE_UPDATED', { id: schedule.date, name: `Roster ${schedule.date}` }, {
      before: previous ? { morning: previous.morning, evening: previous.evening, night: previous.night } : null,
      after: { morning: next.morning, evening: next.evening, night: next.night },
    });
  },

  /** Copy one day's roster onto a set of target dates (e.g. replicate a weekly pattern). */
  async copyDay(actor: User, source: DutySchedule, targetDates: string[]): Promise<void> {
    for (const date of targetDates) {
      await realtimeStore.set(DUTY_COLLECTION, {
        id: date, date,
        morning: [...source.morning], evening: [...source.evening], night: [...source.night],
        updatedAt: new Date().toISOString(), updatedBy: actor.username,
      });
    }
    auditService.log(actor, 'DUTY_SCHEDULE_UPDATED', { id: source.date, name: `Roster copy from ${source.date}` }, { targets: targetDates });
  },

  assigned(schedule: DutySchedule | undefined, shift: ShiftId): string[] {
    return schedule ? schedule[shift] || [] : [];
  },
};
