
const STORAGE_KEY = 'soc_media_vault';

export const imageService = {
  saveImage: (base64Data: string): string => {
    const id = `img-${crypto.randomUUID().substring(0, 8)}`;
    const vault = imageService.getAllImages();
    vault[id] = base64Data;
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
    } catch (e) {
      console.error('Media vault storage failed', e);
      throw new Error('QUOTA_EXCEEDED: Media vault is full. Please remove some old documents or images.');
    }
    
    return id;
  },

  getImage: (id: string): string | null => {
    const vault = imageService.getAllImages();
    return vault[id] || null;
  },

  getAllImages: (): Record<string, string> => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  },

  deleteImage: (id: string): void => {
    const vault = imageService.getAllImages();
    delete vault[id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
  }
};
