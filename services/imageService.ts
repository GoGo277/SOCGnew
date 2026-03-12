export const imageService = {
  saveImage: async (base64Data: string): Promise<string> => {
    const id = `img-${crypto.randomUUID().substring(0, 8)}`;
    localStorage.setItem(`image_${id}`, base64Data);
    return id;
  },
  getImage: async (id: string): Promise<string | null> => {
    return localStorage.getItem(`image_${id}`) || null;
  },
  deleteImage: async (id: string): Promise<void> => {
    localStorage.removeItem(`image_${id}`);
  }
};
