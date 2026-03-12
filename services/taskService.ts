import { Task, TaskStatus } from '../types';

const STORAGE_KEY = 'tasks';

const getStoredTasks = (): any[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

const setStoredTasks = (data: any[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const taskService = {
  getTasks: async (): Promise<Task[]> => {
    const tasks = getStoredTasks();
    return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  saveTask: async (task: Omit<Task, 'id' | 'createdAt'> & { id?: string }): Promise<Task | null> => {
    const tasks = getStoredTasks();
    const now = new Date().toISOString();
    
    if (task.id) {
      const index = tasks.findIndex(t => t.id === task.id);
      if (index !== -1) {
        tasks[index] = { ...tasks[index], ...task };
        setStoredTasks(tasks);
        return tasks[index];
      }
      return null;
    }

    const newTask = { ...task, id: crypto.randomUUID(), createdAt: now };
    tasks.push(newTask);
    setStoredTasks(tasks);
    return newTask as Task;
  },
  updateTaskStatus: async (id: string, status: TaskStatus): Promise<void> => {
    const tasks = getStoredTasks();
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks[index].status = status;
      setStoredTasks(tasks);
    }
  },
  deleteTask: async (id: string): Promise<void> => {
    const tasks = getStoredTasks();
    setStoredTasks(tasks.filter(t => t.id !== id));
  }
};
