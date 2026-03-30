import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface Profile { id: string; name: string; description: string | null; sampleSizePerCategory: number; recencyWindowDays: number; minConfidence: number; samplingMode: string; }

export default function Profiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', sampleSizePerCategory: 100, recencyWindowDays: 30, minConfidence: 50 });

  const load = () => api<{ data: Profile[] }>('/benchmark-profiles').then((r) => setProfiles(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const create = async () => {
    await api('/benchmark-profiles', { method: 'POST', body: form });
    setShowForm(false); setForm({ name: '', description: '', sampleSizePerCategory: 100, recencyWindowDays: 30, minConfidence: 50 }); load();
  };

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <div className="flex justify-between items-centre mb-6"><h2 className="text-2xl font-bold">Benchmark Profiles</h2><button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-accent-blue text-white rounded text-sm hover:bg-blue-600">{showForm ? 'Cancel' : 'New Profile'}</button></div>
      {showForm && (
        <div className="bg-surface-800 rounded-lg border border-surface-500 p-4 mb-6 grid grid-cols-2 gap-4">
          <label className="block"><span className="text-sm text-gray-300">Name</span><input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm" /></label>
          <label className="block"><span className="text-sm text-gray-300">Description</span><input value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm" /></label>
          <label className="block"><span className="text-sm text-gray-300">Sample Size/Category</span><input type="number" value={form.sampleSizePerCategory} onChange={(e) => setForm({...form, sampleSizePerCategory: +e.target.value})} className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm" /></label>
          <label className="block"><span className="text-sm text-gray-300">Min Confidence</span><input type="number" value={form.minConfidence} onChange={(e) => setForm({...form, minConfidence: +e.target.value})} className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm" /></label>
          <div className="col-span-2"><button onClick={create} className="px-4 py-2 bg-accent-blue text-white rounded text-sm hover:bg-blue-600">Create Profile</button></div>
        </div>
      )}
      <div className="space-y-3">{profiles.map((p) => (
        <div key={p.id} className="bg-surface-800 rounded-lg border border-surface-500 p-4">
          <h3 className="font-bold text-gray-100">{p.name}</h3>
          {p.description && <p className="text-sm text-gray-400 mt-1">{p.description}</p>}
          <div className="flex gap-4 mt-2 text-xs text-gray-400"><span>Sample: {p.sampleSizePerCategory}/cat</span><span>Recency: {p.recencyWindowDays}d</span><span>Min confidence: {p.minConfidence}</span><span>Mode: {p.samplingMode}</span></div>
        </div>
      ))}{profiles.length === 0 && <p className="text-gray-500">No profiles yet. Create one to start benchmarking.</p>}</div>
    </div>
  );
}
