import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api('/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-900">
      <div className="w-full max-w-sm p-8 bg-surface-800 rounded-lg border border-surface-500">
        <h1 className="text-2xl font-bold text-center text-accent-blue mb-2">ShieldTest</h1>
        <p className="text-sm text-gray-400 text-center mb-6">DNS Filtering Benchmark Platform</p>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="block mb-4">
            <span className="text-sm text-gray-300">Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm focus:outline-none focus:border-accent-blue"
              required
              autoFocus
            />
          </label>

          <label className="block mb-6">
            <span className="text-sm text-gray-300">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm focus:outline-none focus:border-accent-blue"
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-accent-blue text-white rounded text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-500 text-center">
          Safe benchmarking for defensive security testing only
        </p>
      </div>
    </div>
  );
}
