
import React from 'react';
import { Server, Box, Monitor, Globe, Cpu, Cloud, Laptop, HardDrive, ShieldCheck } from 'lucide-react';
import { AssetType } from './types';

export const ASSET_TYPES: AssetType[] = ['Server', 'Virtual', 'Endpoint', 'Network', 'IoT', 'Cloud', 'Workstation', 'Storage', 'Security'];

export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  Server: 'text-blue-400',
  Virtual: 'text-purple-400',
  Endpoint: 'text-emerald-400',
  Network: 'text-orange-400',
  IoT: 'text-cyan-400',
  Cloud: 'text-sky-400',
  Workstation: 'text-pink-400',
  Storage: 'text-amber-400',
  Security: 'text-red-400',
};

export const ASSET_TYPE_ICONS: Record<AssetType, React.ReactNode> = {
  Server: <Server className="w-4 h-4" />,
  Virtual: <Box className="w-4 h-4" />,
  Endpoint: <Monitor className="w-4 h-4" />,
  Network: <Globe className="w-4 h-4" />,
  IoT: <Cpu className="w-4 h-4" />,
  Cloud: <Cloud className="w-4 h-4" />,
  Workstation: <Laptop className="w-4 h-4" />,
  Storage: <HardDrive className="w-4 h-4" />,
  Security: <ShieldCheck className="w-4 h-4" />,
};

export const INITIAL_ASSETS: any[] = [
  {
    id: '1',
    name: 'DC-PRIMARY-01',
    type: 'Server',
    identity: 'AD Domain Controller',
    ipv4: '10.0.1.10',
    ipv6: '2001:db8::10',
    rackNumber: 'A-12',
    location: 'DC-West-Hall-1',
    criticality: 'Critical',
    description: 'Primary Domain Controller for the HQ office.',
    notes: [
      {
        id: 'n1',
        analyst: 'System Admin',
        content: 'Critical asset. Managed by Infrastructure Team.',
        timestamp: new Date().toISOString()
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'FIREWALL-EDGE',
    type: 'Network',
    identity: 'Palo Alto Perimeter',
    ipv4: '192.168.1.1',
    ipv6: '2001:db8::1',
    rackNumber: 'F-01',
    location: 'Edge-Room-3',
    criticality: 'High',
    description: 'Main egress firewall for all corporate traffic.',
    notes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];
