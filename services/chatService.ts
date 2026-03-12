import { Message, ChatRoom, User } from '../types';

const ROOMS_KEY = 'chat_rooms';
const MESSAGES_KEY = 'chat_messages';

const getStoredRooms = (): any[] => {
  const data = localStorage.getItem(ROOMS_KEY);
  return data ? JSON.parse(data) : [];
};

const setStoredRooms = (data: any[]) => {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(data));
};

const getStoredMessages = (): any[] => {
  const data = localStorage.getItem(MESSAGES_KEY);
  return data ? JSON.parse(data) : [];
};

const setStoredMessages = (data: any[]) => {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(data));
};

export const chatService = {
  getRooms: async (): Promise<ChatRoom[]> => {
    const rooms = getStoredRooms();
    return rooms.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  getMessages: async (roomId: string): Promise<Message[]> => {
    const messages = getStoredMessages();
    return messages.filter(m => m.roomId === roomId).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  },
  sendMessage: async (roomId: string, message: Omit<Message, 'id' | 'timestamp'>): Promise<Message | null> => {
    const messages = getStoredMessages();
    const now = new Date().toISOString();
    const newMessage = { ...message, roomId, id: crypto.randomUUID(), timestamp: now };
    messages.push(newMessage);
    setStoredMessages(messages);

    const rooms = getStoredRooms();
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex !== -1) {
      rooms[roomIndex].lastMessage = message.content.substring(0, 50);
      setStoredRooms(rooms);
    }

    return newMessage as Message;
  },
  createRoom: async (name: string, type: ChatRoom['type'], participants: string[]): Promise<ChatRoom | null> => {
    const rooms = getStoredRooms();
    if (type === 'direct' && participants.length === 2) {
      const existing = rooms.find(r => r.type === 'direct' && r.participants.includes(participants[0]) && r.participants.includes(participants[1]));
      if (existing) return existing;
    }

    const now = new Date().toISOString();
    const newRoom = { id: crypto.randomUUID(), name, type, participants, createdAt: now };
    rooms.push(newRoom);
    setStoredRooms(rooms);
    return newRoom as ChatRoom;
  }
};
