'use client';

import { useState } from 'react';
import apiClient from '../../lib/api-client';

interface PairAgentModalProps {
  onClose: () => void;
}

export function PairAgentModal({ onClose }: PairAgentModalProps) {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateToken = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.post<{ token: string; expiresAt: string }>(
        '/obd/agents/pair',
        {},
      );
      setToken(response.data.token);
      setExpiresAt(new Date(response.data.expiresAt));
    } catch (err: any) {
      setError(err.message || 'Failed to generate pairing token.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (token) {
      navigator.clipboard.writeText(token);
    }
  };

  const isExpired = expiresAt ? new Date() > expiresAt : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Pair Desktop Agent</h2>
          <button
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {!token ? (
          <div className="mt-4">
            <p className="text-sm text-slate-500">
              Generate a one-time pairing token for your Desktop Agent. The token
              expires in 5 minutes.
            </p>
            <button
              onClick={generateToken}
              disabled={isLoading}
              className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isLoading ? 'Generating…' : 'Generate Token'}
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Pairing Token
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded-md bg-white px-3 py-2 font-mono text-lg font-medium text-slate-900">
                  {token}
                </code>
                <button
                  onClick={copyToClipboard}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Copy
                </button>
              </div>
              {expiresAt && (
                <p className="mt-2 text-xs text-slate-500">
                  Expires at {expiresAt.toLocaleTimeString()}
                  {isExpired && (
                    <span className="ml-1 text-red-600 font-medium">(Expired)</span>
                  )}
                </p>
              )}
            </div>

            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>1. Open your Desktop Agent application.</p>
              <p>2. Choose “Pair with PrioraScan”.</p>
              <p>3. Paste the token above and confirm.</p>
            </div>

            <button
              onClick={generateToken}
              disabled={isLoading || !isExpired}
              className="mt-4 w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Generating…' : 'Regenerate Token'}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
