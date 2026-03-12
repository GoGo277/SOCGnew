import { Announcement } from '../types';

const STORAGE_KEY = 'announcements';

const getStoredAnnouncements = (): any[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

const setStoredAnnouncements = (data: any[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const announcementService = {
  getAnnouncements: async (): Promise<Announcement[]> => {
    const announcements = getStoredAnnouncements();
    return announcements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  saveAnnouncement: async (announcement: Omit<Announcement, 'id' | 'createdAt'>): Promise<Announcement | null> => {
    const announcements = getStoredAnnouncements();
    const now = new Date().toISOString();
    
    const newAnnouncement = { ...announcement, id: crypto.randomUUID(), createdAt: now };
    announcements.push(newAnnouncement);
    setStoredAnnouncements(announcements);
    return newAnnouncement as Announcement;
  },
  deleteAnnouncement: async (id: string): Promise<void> => {
    const announcements = getStoredAnnouncements();
    setStoredAnnouncements(announcements.filter(a => a.id !== id));
  }
};
