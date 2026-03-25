
import { Asset } from '../types';
import { INITIAL_ASSETS } from '../constants';

const STORAGE_KEY = 'soc_assets_data';

export const assetService = {
  getAssets: (): Asset[] => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_ASSETS));
      return INITIAL_ASSETS;
    }
    return JSON.parse(data);
  },

  saveAsset: (asset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Asset => {
    const assets = assetService.getAssets();
    const now = new Date().toISOString();
    
    if (asset.id) {
      const index = assets.findIndex(a => a.id === asset.id);
      if (index !== -1) {
        const updatedAsset: Asset = {
          ...assets[index],
          ...asset,
          id: asset.id,
          updatedAt: now
        };
        assets[index] = updatedAsset;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
        return updatedAsset;
      }
    }

    const newAsset: Asset = {
      ...asset,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as Asset;

    assets.push(newAsset);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
    return newAsset;
  },

  deleteAsset: (id: string): void => {
    const assets = assetService.getAssets();
    const filtered = assets.filter(a => a.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  },

  importAssets: (newAssets: Asset[]): void => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newAssets));
  },

  exportAssets: (): string => {
    const assets = assetService.getAssets();
    return JSON.stringify(assets, null, 2);
  }
};
