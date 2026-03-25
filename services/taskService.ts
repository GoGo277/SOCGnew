
import { Task, TaskStatus } from '../types';

const STORAGE_KEY = 'soc_tasks_data';

export const taskService = {
  getTasks: (): Task[] => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveTask: (task: Omit<Task, 'id' | 'createdAt' | 'status'> & { id?: string, status?: TaskStatus }): Task => {
    const tasks = taskService.getTasks();
    const now = new Date().toISOString();
    
    if (task.id) {
      const index = tasks.findIndex(t => t.id === task.id);
      if (index !== -1) {
        const updatedTask: Task = {
          ...tasks[index],
          ...task,
          id: task.id,
        };
        tasks[index] = updatedTask;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        return updatedTask;
      }
    }

    const newTask: Task = {
      ...task,
      id: `task-${crypto.randomUUID()}`,
      status: task.status || 'Todo',
      createdAt: now,
    } as Task;

    tasks.push(newTask);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return newTask;
  },

  updateTaskStatus: (id: string, status: TaskStatus): void => {
    const tasks = taskService.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      tasks[index].status = status;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }
  },

  deleteTask: (id: string): void => {
    const tasks = taskService.getTasks();
    const filtered = tasks.filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }
};
