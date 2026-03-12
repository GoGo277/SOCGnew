import { Asset } from '../types';

const STORAGE_KEY = 'assets';

const getStoredAssets = (): any[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

const setStoredAssets = (data: any[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const assetService = {
  getAssets: async (): Promise<Asset[]> => {
    const assets = getStoredAssets();
    return assets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  saveAsset: async (asset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Asset | null> => {
    const assets = getStoredAssets();
    const now = new Date().toISOString();
    
    if (asset.id) {
      const index = assets.findIndex(a => a.id === asset.id);
      if (index !== -1) {
        assets[index] = { ...assets[index], ...asset, updatedAt: now };
        setStoredAssets(assets);
        return assets[index];
      }
      return null;
    }

    const newAsset = { ...asset, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    assets.push(newAsset);
    setStoredAssets(assets);
    return newAsset as Asset;
  },
  deleteAsset: async (id: string): Promise<void> => {
    const assets = getStoredAssets();
    setStoredAssets(assets.filter(a => a.id !== id));
  },
  importAssets: async (newAssets: Asset[]): Promise<void> => {
    const assets = getStoredAssets();
    const now = new Date().toISOString();
    const toAdd = newAssets.map(a => ({ ...a, id: crypto.randomUUID(), createdAt: now, updatedAt: now }));
    setStoredAssets([...assets, ...toAdd]);
  },
  exportAssets: async (): Promise<string> => {
    const assets = getStoredAssets();
    return JSON.stringify(assets, null, 2);
  }
};
