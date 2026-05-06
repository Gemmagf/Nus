
import React, { useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  BarChart, Bar, Legend
} from 'recharts';
import { Activity, Thermometer, Footprints, AlertCircle, Info, User, ClipboardList, Settings } from 'lucide-react';

const DATA_NORMAL = [
  { day: 'Dl', activity: 4500, symmetry: 98, anomaly: 1 },
  { day: 'Dt', activity: 5200, symmetry: 97, anomaly: 1 },
  { day: 'Dc', activity: 4800, symmetry: 99, anomaly: 1 },
  { day: 'Dj', activity: 5100, symmetry: 98, anomaly: 2 },
  { day: 'Dv', activity: 4900, symmetry: 98, anomaly: 1 },
  { day: 'Ds', activity: 6500, symmetry: 97, anomaly: 2 },
  { day: 'Dg', activity: 4200, symmetry: 99, anomaly: 1 },
];

const DATA_ISSUE = [
  { day: 'Dl', activity: 4500, symmetry: 98, anomaly: 1 },
  { day: 'Dt', activity: 4200, symmetry: 92, anomaly: 3 },
  { day: 'Dc', activity: 3100, symmetry: 84, anomaly: 5 },
  { day: 'Dj', activity: 2200, symmetry: 78, anomaly: 7 },
  { day: 'Dv', activity: 1800, symmetry: 72, anomaly: 8 },
  { day: 'Ds', activity: 1500, symmetry: 68, anomaly: 9 },
  { day: 'Dg', activity: 1200, symmetry: 65, anomaly: 9 },
];

export const DashboardDemo: React.FC = () => {
  const [hasIssue, setHasIssue] = useState(false);
  const data = hasIssue ? DATA_ISSUE : DATA_NORMAL;

  return (
    <div className="w-full h-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-slate-900 text-slate-400 p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3 text-white">
          <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center">
            <Footprints size={18} className="text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">Ernest</span>
        </div>
        
        <nav className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase text-slate-600 mb-2 px-2">Monitorització</div>
          <button className="flex items-center gap-3 px-3 py-2 bg-slate-800 text-white rounded-lg transition-colors">
            <Activity size={18} />
            <span>Pacients Actius</span>
          </button>
          <button className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800 hover:text-white rounded-lg transition-colors">
            <ClipboardList size={18} />
            <span>Historial Clínic</span>
          </button>
          <button className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800 hover:text-white rounded-lg transition-colors">
            <User size={18} />
            <span>Propietaris</span>
          </button>
          <button className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800 hover:text-white rounded-lg transition-colors">
            <Settings size={18} />
            <span>Configuració</span>
          </button>
        </nav>

        <div className="mt-auto bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
          <div className="text-xs text-slate-500 mb-2">Simulador d'Escenaris</div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={hasIssue}
              onChange={() => setHasIssue(!hasIssue)} 
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
            <span className="ml-3 text-sm font-medium text-slate-300">{hasIssue ? 'Anomalia ON' : 'Anomalia OFF'}</span>
          </label>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 bg-slate-50 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <img 
              src="https://picsum.photos/id/237/100/100" 
              alt="Nus" 
              className="w-16 h-16 rounded-full border-2 border-white shadow-md object-cover" 
            />
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Nus</h2>
              <p className="text-slate-500 text-sm">Llaurador Retriever • 9 anys • Post-op Maluc</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <div className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm ${hasIssue ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-green-100 text-green-600'}`}>
              <AlertCircle size={16} />
              {hasIssue ? 'ALERTA: Coixesa Detectada' : 'Estat: Estable'}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-slate-500 text-xs font-bold uppercase mb-1">Activitat Diària</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">{data[data.length-1].activity}</span>
              <span className="text-sm text-slate-400">passes</span>
            </div>
            <div className={`mt-2 text-xs font-bold ${hasIssue ? 'text-red-500' : 'text-green-500'}`}>
              {hasIssue ? '↓ 42% vs setmana anterior' : '↑ 4% vs setmana anterior'}
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-slate-500 text-xs font-bold uppercase mb-1">Simetria de Marxa</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">{data[data.length-1].symmetry}%</span>
              <span className="text-sm text-slate-400">Index</span>
            </div>
            <div className={`mt-2 text-xs font-bold ${hasIssue ? 'text-red-500' : 'text-green-500'}`}>
              {hasIssue ? 'Desequilibri crític posterior' : 'Rang normal'}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-slate-500 text-xs font-bold uppercase mb-1">Índex d'Anomalia (IA)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">{(data[data.length-1].anomaly / 10).toFixed(1)}</span>
              <span className="text-sm text-slate-400">/ 1.0</span>
            </div>
            <div className={`mt-2 text-xs font-bold ${hasIssue ? 'text-red-500' : 'text-blue-500'}`}>
              {hasIssue ? 'Anomalia significativa detectada' : 'Dins del rang habitual'}
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-80">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-800">Evolució d'Activitat</h3>
              <div className="flex gap-2">
                <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">Últims 7 dies</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height="80%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={hasIssue ? "#ef4444" : "#0d9488"} stopOpacity={0.1}/>
                    <stop offset="95%" stopColor={hasIssue ? "#ef4444" : "#0d9488"} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 12}} dy={10} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="activity" 
                  stroke={hasIssue ? "#ef4444" : "#0d9488"} 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorActivity)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-80">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-800">Index de Simetria (Mobilitat)</h3>
              <Info size={16} className="text-slate-300" />
            </div>
            <ResponsiveContainer width="100%" height="80%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 12}} dy={10} />
                <YAxis domain={[0, 100]} hide />
                <Tooltip 
                   contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} 
                />
                <Line 
                  type="monotone" 
                  dataKey="symmetry" 
                  stroke="#6366f1" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#6366f1' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
