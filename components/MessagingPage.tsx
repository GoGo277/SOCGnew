
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Message, ChatRoom, User, Language } from '../types';
import { chatService } from '../services/chatService';
import { settingsService } from '../services/settingsService';
import { 
  Send, Plus, Search, Hash, Paperclip, 
  MessageSquare, UserPlus, Shield, Clock, CalendarDays,
  User as UserIcon, X
} from 'lucide-react';
import { getTranslator } from '../translations';

interface MessagingPageProps {
  currentUser: User;
  language: Language;
}

const MessagingPage: React.FC<MessagingPageProps> = ({ currentUser, language }) => {
  const t = useMemo(() => getTranslator(language), [language]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [showNewRoomModal, setShowNewRoomModal] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = () => {
    const data = chatService.getRooms();
    setRooms(data);
    setUsers(settingsService.getUsers().filter(u => u.id !== currentUser.id));
    if (data.length > 0 && !activeRoomId) setActiveRoomId(data[0].id);
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (activeRoomId) {
      const loadMessages = () => setMessages(chatService.getMessages(activeRoomId));
      loadMessages();
      const interval = setInterval(loadMessages, 3000);
      return () => clearInterval(interval);
    }
  }, [activeRoomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e?: React.FormEvent, mediaUrl?: string) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !mediaUrl) return;
    if (!activeRoomId) return;

    chatService.sendMessage(activeRoomId, {
      senderId: currentUser.id,
      senderName: currentUser.username,
      content: inputText,
      mediaUrl,
      mediaType: mediaUrl ? 'image' : undefined
    });
    setInputText('');
  };

  const handleStartDM = (targetUser: User) => {
    const room = chatService.createRoom(
      targetUser.username, 
      'direct', 
      [currentUser.id, targetUser.id]
    );
    setActiveRoomId(room.id);
    setShowNewRoomModal(false);
    loadData();
  };

  const activeRoom = rooms.find(r => r.id === activeRoomId);

  const groupedMessages = useMemo(() => {
    const groups: Record<string, Message[]> = {};
    messages.forEach(msg => {
      const date = new Date(msg.timestamp).toLocaleDateString(language, { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(msg);
    });
    return Object.entries(groups);
  }, [messages, language]);

  return (
    <div className="flex h-[calc(100vh-160px)] gap-6 animate-in fade-in duration-500">
      <aside className="w-80 flex flex-col bg-zinc-900/50 border border-zinc-800 rounded-[2rem] overflow-hidden shadow-xl">
        <div className="p-6 border-b border-zinc-800 bg-zinc-950/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-500" /> {t('messaging')}
            </h3>
            <button onClick={() => setShowNewRoomModal(true)} className="p-2 bg-zinc-800 hover:bg-blue-600 text-white rounded-xl transition-all active:scale-90"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
          {rooms.map(room => {
            const isDM = room.type === 'direct';
            return (
              <button
                key={room.id}
                onClick={() => setActiveRoomId(room.id)}
                className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-3 ${activeRoomId === room.id ? 'bg-blue-600/10 border border-blue-500/30 text-blue-400' : 'text-zinc-500 hover:bg-zinc-800/50 border border-transparent'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeRoomId === room.id ? 'bg-blue-600/20' : 'bg-zinc-950 border border-zinc-800'}`}>
                  {isDM ? <UserIcon className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{room.name}</p>
                  <p className="text-[10px] opacity-40 truncate mt-0.5">{room.lastMessage || t('zero_signals')}</p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-2xl relative">
        {activeRoom ? (
          <>
            <header className="p-5 border-b border-zinc-800 bg-zinc-950/30 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20">
                  {activeRoom.type === 'direct' ? <UserIcon className="w-5 h-5 text-blue-500" /> : <Hash className="w-5 h-5 text-blue-500" />}
                </div>
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-widest">{activeRoom.name}</h4>
                  <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {t('system_online')}
                  </p>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              {groupedMessages.map(([date, msgs]) => (
                <div key={date} className="space-y-6">
                  <div className="flex items-center justify-center gap-4 opacity-30">
                    <div className="h-px flex-1 bg-zinc-700" />
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                       <CalendarDays className="w-3 h-3" /> {date}
                    </span>
                    <div className="h-px flex-1 bg-zinc-700" />
                  </div>

                  {msgs.map((msg) => {
                    const isMe = msg.senderId === currentUser.id;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} gap-1 animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        <div className="flex items-center gap-2 mb-1 px-1">
                           {!isMe && <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">{msg.senderName}</span>}
                           <span className="text-[8px] font-mono text-zinc-700 flex items-center gap-1">
                             <Clock className="w-2.5 h-2.5" /> 
                             {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                           </span>
                           {isMe && <span className="text-[10px] font-black text-blue-500 uppercase tracking-wider">Me</span>}
                        </div>
                        <div className={`max-w-[70%] p-4 rounded-[1.5rem] border shadow-lg ${isMe ? 'bg-blue-600/10 border-blue-500/30 text-zinc-100 rounded-tr-none' : 'bg-zinc-800 border-zinc-700 text-zinc-200 rounded-tl-none'}`}>
                          <p className="text-sm font-medium leading-relaxed select-text">{msg.content}</p>
                          {msg.mediaUrl && <img src={msg.mediaUrl} className="mt-3 rounded-xl max-h-80 border border-white/5" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <footer className="p-6 border-t border-zinc-800 bg-zinc-950/30">
              <form onSubmit={handleSendMessage} className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-2 pl-4 focus-within:border-blue-500/50 transition-all">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-zinc-500 hover:text-white transition-colors"><Paperclip className="w-5 h-5" /></button>
                <input type="file" ref={fileInputRef} onChange={(e) => {
                   const f = e.target.files?.[0];
                   if (f) {
                     const r = new FileReader();
                     r.onloadend = () => handleSendMessage(undefined, r.result as string);
                     r.readAsDataURL(f);
                   }
                }} accept="image/*" className="hidden" />
                <input 
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder={t('transmit_encrypted')}
                  className="flex-1 bg-transparent border-none outline-none text-sm text-white py-2"
                />
                <button type="submit" className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg active:scale-90 transition-all"><Send className="w-4 h-4" /></button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-6">
            <div className="w-20 h-20 rounded-[2rem] bg-zinc-950 border border-zinc-800 flex items-center justify-center animate-pulse"><MessageSquare className="w-8 h-8 text-zinc-800" /></div>
            <h5 className="text-xl font-black text-zinc-400">{t('zero_signals')}</h5>
          </div>
        )}
      </div>

      {showNewRoomModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowNewRoomModal(false)} />
           <div className="relative bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-md shadow-2xl modal-entrance overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-6 border-b border-zinc-800 bg-zinc-950/30 flex items-center justify-between">
                <h4 className="text-xs font-black text-white uppercase tracking-[0.2em]">New Direct Message</h4>
                <button onClick={() => setShowNewRoomModal(false)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5"/></button>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-4">Select User</p>
                  {users.map(u => (
                    <button key={u.id} onClick={() => handleStartDM(u)} className="w-full flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 rounded-2xl transition-all group">
                        <div className="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center border border-zinc-800 group-hover:border-blue-500/50">
                          <UserIcon className="w-4 h-4 text-zinc-500 group-hover:text-blue-400" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-white">{u.username}</p>
                          <p className="text-[10px] font-black text-zinc-600 uppercase">{u.role}</p>
                        </div>
                    </button>
                  ))}
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default MessagingPage;
