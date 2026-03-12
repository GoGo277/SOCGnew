
import React, { useState, useEffect, useMemo } from 'react';
import { Asset, AssetType, Severity, Language } from '../types';
import { ASSET_TYPES } from '../constants';
import { X, Save } from 'lucide-react';
import { getTranslator } from '../translations';

interface AssetFormProps {
  asset?: Asset | null;
  onSave: (asset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onCancel: () => void;
  language: Language;
}

const AssetForm: React.FC<AssetFormProps> = ({ asset, onSave, onCancel, language }) => {
  const t = useMemo(() => getTranslator(language), [language]);
  const [formData, setFormData] = useState<Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>>({
    name: '',
    type: 'Workstation' as AssetType,
    identity: '',
    ipv4: '',
    ipv6: '',
    rackNumber: '',
    location: '',
    description: '',
    criticality: 'Medium' as Severity,
    notes: []
  });

  useEffect(() => {
    if (asset) {
      setFormData({
        name: asset.name,
        type: asset.type,
        identity: asset.identity,
        ipv4: asset.ipv4,
        ipv6: asset.ipv6,
        rackNumber: asset.rackNumber || '',
        location: asset.location || '',
        description: asset.description,
        criticality: asset.criticality || 'Medium',
        notes: [...asset.notes]
      });
    }
  }, [asset]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(asset ? { ...formData, id: asset.id } : formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300" onClick={onCancel} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl animate-in slide-in-from-bottom-4 duration-300 flex flex-col max-h-[90vh]">
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-zinc-800 shrink-0">
            <h2 className="text-xl font-bold text-white">{asset ? t('edit_asset') : t('add_asset')}</h2>
            <button type="button" onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 transition-all hover:scale-110">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('hostname')}</label>
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. SRV-WEB-01"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 outline-none transition-all hover:border-zinc-600"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('classification')}</label>
                <select
                  value={formData.type}
                  onChange={e => setFormData(prev => ({ ...prev, type: e.target.value as AssetType }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 outline-none transition-all cursor-pointer hover:border-zinc-600"
                >
                  {ASSET_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('severity')}</label>
                  <select
                    value={formData.criticality}
                    onChange={e => setFormData(prev => ({ ...prev, criticality: e.target.value as Severity }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 outline-none transition-all cursor-pointer hover:border-zinc-600"
                  >
                    <option value="Low">{t('low')}</option>
                    <option value="Medium">{t('medium')}</option>
                    <option value="High">{t('high')}</option>
                    <option value="Critical">{t('critical')}</option>
                  </select>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('identity_id')}</label>
                  <input
                    required
                    value={formData.identity}
                    onChange={e => setFormData(prev => ({ ...prev, identity: e.target.value }))}
                    placeholder="Unique identifier"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 outline-none hover:border-zinc-600 transition-all"
                  />
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('network_ipv4')}</label>
                <input
                  required
                  pattern="^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$"
                  value={formData.ipv4}
                  onChange={e => setFormData(prev => ({ ...prev, ipv4: e.target.value }))}
                  placeholder="10.0.0.1"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm font-mono text-zinc-200 focus:ring-2 focus:ring-blue-500/50 outline-none hover:border-zinc-600 transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('network_ipv6')}</label>
                <input
                  value={formData.ipv6}
                  onChange={e => setFormData(prev => ({ ...prev, ipv6: e.target.value }))}
                  placeholder="::1"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm font-mono text-zinc-200 focus:ring-2 focus:ring-blue-500/50 outline-none hover:border-zinc-600 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('rack_number')}</label>
                <input
                  value={formData.rackNumber}
                  onChange={e => setFormData(prev => ({ ...prev, rackNumber: e.target.value }))}
                  placeholder="e.g. Rack-A4"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 outline-none hover:border-zinc-600 transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('location')}</label>
                <input
                  value={formData.location}
                  onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="e.g. Data Center West"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 outline-none hover:border-zinc-600 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('operational_details')}</label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Operational details..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:ring-2 focus:ring-blue-500/50 outline-none resize-none transition-all hover:border-zinc-600"
              />
            </div>
          </div>

          <div className="p-6 border-t border-zinc-800 flex items-center justify-end gap-3 bg-zinc-950/50 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-colors text-sm font-medium text-zinc-400 active:scale-95"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95"
            >
              <Save className="w-4 h-4" />
              {t('confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AssetForm;
