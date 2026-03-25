
import { Message, ChatRoom, User } from '../types';

const MESSAGES_KEY = 'soc_chat_messages';
const ROOMS_KEY = 'soc_chat_rooms';

const DEFAULT_ROOMS: ChatRoom[] = [
  {
    id: 'room-general',
    name: 'General SOC Channel',
    type: 'general',
    participants: [],
    lastMessage: 'Channel opened.',
    createdAt: new Date().toISOString()
  }
];

export const chatService = {
  getRooms: (): ChatRoom[] => {
    const data = localStorage.getItem(ROOMS_KEY);
    return data ? JSON.parse(data) : DEFAULT_ROOMS;
  },

  getMessages: (roomId: string): Message[] => {
    const data = localStorage.getItem(MESSAGES_KEY);
    const allMessages: Record<string, Message[]> = data ? JSON.parse(data) : {};
    return allMessages[roomId] || [];
  },

  sendMessage: (roomId: string, message: Omit<Message, 'id' | 'timestamp'>): Message => {
    const data = localStorage.getItem(MESSAGES_KEY);
    const allMessages: Record<string, Message[]> = data ? JSON.parse(data) : {};
    
    const newMessage: Message = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    };

    if (!allMessages[roomId]) allMessages[roomId] = [];
    allMessages[roomId].push(newMessage);
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));

    const rooms = chatService.getRooms();
    const roomIdx = rooms.findIndex(r => r.id === roomId);
    if (roomIdx !== -1) {
      rooms[roomIdx].lastMessage = newMessage.content.substring(0, 50);
      localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
    }

    return newMessage;
  },

  createRoom: (name: string, type: ChatRoom['type'], participants: string[]): ChatRoom => {
    const rooms = chatService.getRooms();
    
    // For direct messages, check if room already exists
    if (type === 'direct' && participants.length === 2) {
      const existing = rooms.find(r => 
        r.type === 'direct' && 
        r.participants.includes(participants[0]) && 
        r.participants.includes(participants[1])
      );
      if (existing) return existing;
    }

    const newRoom: ChatRoom = {
      id: `room-${crypto.randomUUID()}`,
      name,
      type,
      participants,
      createdAt: new Date().toISOString()
    };
    rooms.push(newRoom);
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
    return newRoom;
  }
};
