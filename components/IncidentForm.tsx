import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Incident, Severity, IncidentStatus, Asset, Language } from '../types';
import { X, Save, Search, ChevronDown, Check } from 'lucide-react';
import { getTagColor } from '../App';
import { getTranslator } from '../translations';

interface IncidentFormProps {
  incident?: Incident | null;
  assets: Asset[];
  onSave: (incident: any) => void;
  onCancel: () => void;
  language: Language;
}

const SearchableAssetSelect: React.FC<{
  label: string;
  value: string;
  assets: Asset[];
  onSelect: (assetName: string) => void;
  placeholder?: string;
  manualText: string;
  noMatchingText: string;
}> = ({ label, value, assets, onSelect, placeholder, manualText, noMatchingText }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm(value);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  const filteredAssets = assets.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.ipv4.includes(searchTerm)
  );

  return (
    <div className="space-y-1 relative" ref={wrapperRef}>
      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</label>
      <div className="relative group">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-red-400 text-zinc-500">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder || "Search assets..."}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg py-3 pl-10 pr-10 text-sm text-white focus:ring-2 focus:ring-red-500/50 outline-none transition-all"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-600">
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-[70] w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
          <div 
            className="p-3 text-xs text-zinc-500 hover:bg-zinc-800 cursor-pointer flex items-center justify-between group"
            onClick={() => {
              onSelect("");
              setIsOpen(false);
            }}
          >
            <span>{manualText}</span>
            {value === "" && <Check className="w-3 h-3 text-red-500" />}
          </div>
          {filteredAssets.length > 0 ? filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className={`p-3 text-sm cursor-pointer flex items-center justify-between group border-l-2 transition-all ${
                value === asset.name ? 'bg-red-500/5 border-red-500 text-white' : 'hover:bg-zinc-800 border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
              onClick={() => {
                onSelect(asset.name);
                setIsOpen(false);
              }}
            >
              <div>
                <p className="font-bold">{asset.name}</p>
                <p className="text-[10px] font-mono text-zinc-500">{asset.ipv4}</p>
              </div>
              {value === asset.name && <Check className="w-4 h-4 text-red-500" />}
            </div>
          )) : (
            <div className="p-4 text-center text-xs text-zinc-600 italic">
              {noMatchingText}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const IncidentForm: React.FC<IncidentFormProps> = ({ incident, assets, onSave, onCancel, language }) => {
  const t = useMemo(() => getTranslator(language), [language]);
  const [formData, setFormData] = useState({
    eventName: '',
    sourceIp: '',
    destinationIp: '',
    sourceAssetName: '',
    destinationAssetName: '',
    description: '',
    response: '',
    severity: 'Medium' as Severity,
    status: 'New' as IncidentStatus,
    tags: [] as string[],
    tagInput: ''
  });

  useEffect(() => {
    if (incident) {
      setFormData({
        ...incident,
        tagInput: ''
      });
    }
  }, [incident]);

  const handleAssetSelect = (type: 'source' | 'destination', assetName: string) => {
    const foundAsset = assets.find(a => a.name === assetName);
    if (type === 'source') {
      setFormData(prev => ({
        ...prev,
        sourceAssetName: assetName,
        sourceIp: foundAsset ? foundAsset.ipv4 : prev.sourceIp
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        destinationAssetName: assetName,
        destinationIp: foundAsset ? foundAsset.ipv4 : prev.destinationIp
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { tagInput, ...data } = formData;
    onSave(incident ? { ...data, id: incident.id } : data);
  };

  const addTag = () => {
    if (formData.tagInput.trim() && !formData.tags.includes(formData.tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, prev.tagInput.trim()],
        tagInput: ''
      }));
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onCancel} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl animate-in slide-in-from-bottom-4 duration-300 flex flex-col max-h-[90vh]">
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-zinc-800">
            <h2 className="text-xl font-bold text-white">{incident ? t('edit_asset') : t('report_incident')}</h2>
            <button type="button" onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('event_name')}</label>
                <input required value={formData.eventName} onChange={e => setFormData(p => ({ ...p, eventName: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-red-500/50 outline-none" placeholder="e.g. Data Exfiltration Detected" />
              </div>
              
              <div className="col-span-2 md:col-span-1">
                <SearchableAssetSelect 
                  label={t('source_asset')}
                  value={formData.sourceAssetName}
                  assets={assets}
                  onSelect={(name) => handleAssetSelect('source', name)}
                  placeholder={t('search_assets')}
                  manualText={t('manual_entry')}
                  noMatchingText={t('no_matching_assets')}
                />
              </div>
              <div className="space-y-1 col-span-2 md:col-span-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('source_ip')}</label>
                <input required value={formData.sourceIp} onChange={e => setFormData(p => ({ ...p, sourceIp: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm font-mono text-white focus:ring-2 focus:ring-red-500/50 outline-none" placeholder="192.168.1.50" />
              </div>

              <div className="col-span-2 md:col-span-1">
                <SearchableAssetSelect 
                  label={t('dest_asset')}
                  value={formData.destinationAssetName}
                  assets={assets}
                  onSelect={(name) => handleAssetSelect('destination', name)}
                  placeholder={t('search_assets')}
                  manualText={t('manual_entry')}
                  noMatchingText={t('no_matching_assets')}
                />
              </div>
              <div className="space-y-1 col-span-2 md:col-span-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('dest_ip')}</label>
                <input required value={formData.destinationIp} onChange={e => setFormData(p => ({ ...p, destinationIp: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm font-mono text-white focus:ring-2 focus:ring-red-500/50 outline-none" placeholder="10.0.0.1" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('severity')}</label>
                <select value={formData.severity} onChange={e => setFormData(p => ({ ...p, severity: e.target.value as Severity }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-white outline-none">
                  <option value="Low">{t('low')}</option>
                  <option value="Medium">{t('medium')}</option>
                  <option value="High">{t('high')}</option>
                  <option value="Critical">{t('critical')}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('all_status')}</label>
                <select value={formData.status} onChange={e => setFormData(p => ({ ...p, status: e.target.value as IncidentStatus }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-white outline-none">
                  <option value="New">{t('new')}</option>
                  <option value="Active">{t('active')}</option>
                  <option value="Mitigated">{t('mitigated')}</option>
                  <option value="Resolved">{t('resolved')}</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('incident_desc')}</label>
              <textarea rows={3} value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-white outline-none resize-none" placeholder="Describe the threat signature or observed behavior..." />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('response_plan')}</label>
              <textarea rows={2} value={formData.response} onChange={e => setFormData(p => ({ ...p, response: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-white outline-none resize-none" placeholder="Steps taken to contain or remediate..." />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('forensic_tags')}</label>
              <div className="flex gap-2">
                <input value={formData.tagInput} onChange={e => setFormData(p => ({ ...p, tagInput: e.target.value }))} onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addTag())} className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-white outline-none" placeholder={t('add_tag')} />
                <button type="button" onClick={addTag} className="px-4 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs font-bold transition-colors">{t('add')}</button>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {formData.tags.map(tag => (
                  <span key={tag} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold border ${getTagColor(tag)}`}>
                    #{tag}
                    <X onClick={() => removeTag(tag)} className="w-3 h-3 cursor-pointer hover:text-red-400" />
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-zinc-800 flex items-center justify-end gap-3 bg-zinc-900/50">
            <button type="button" onClick={onCancel} className="px-6 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-sm font-medium text-zinc-400">{t('cancel')}</button>
            <button type="submit" className="px-6 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-red-600/20 active:scale-95 transition-all">
              <Save className="w-4 h-4" />
              {t('confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IncidentForm;
