
import { Announcement } from '../types';

const STORAGE_KEY = 'soc_announcements';

const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann-1',
    title: 'Welcome to Guardian SOC v2.4',
    content: 'All analysts are required to update their profile information and review the new SOP standards.',
    authorId: 'u1',
    authorName: 'Admin',
    severity: 'Medium',
    createdAt: new Date().toISOString()
  }
];

export const announcementService = {
  getAnnouncements: (): Announcement[] => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : INITIAL_ANNOUNCEMENTS;
  },

  saveAnnouncement: (announcement: Omit<Announcement, 'id' | 'createdAt'>): Announcement => {
    const list = announcementService.getAnnouncements();
    const newItem: Announcement = {
      ...announcement,
      id: `ann-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString()
    };
    list.unshift(newItem);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return newItem;
  },

  deleteAnnouncement: (id: string): void => {
    const list = announcementService.getAnnouncements().filter(a => a.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
};
