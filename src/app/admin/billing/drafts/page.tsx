"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Toast } from '@/components/ui/toast';
import { FileText, ArrowRight, Trash2 } from 'lucide-react';
import { billingService, BillDraftListItem } from '@/services/billingService';
import { ApiError } from '@/lib/apiClient';

/**
 * Unfinished Bills — every OPEN bill draft the current user may see (Admin: all
 * tenant drafts; Staff: only their own, enforced by the backend). A draft is
 * never a Sale and never appears in Sales History; it lives here until it is
 * continued (finalized into a Sale) or discarded.
 */
export default function UnfinishedBillsPage() {
  const [drafts, setDrafts] = useState<BillDraftListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [discarding, setDiscarding] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setDrafts(await billingService.listDrafts());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load unfinished bills.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const discard = async (id: string) => {
    setDiscarding(id);
    try {
      await billingService.discardDraft(id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      setToast({ message: 'Unfinished bill discarded', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof ApiError ? err.message : 'Could not discard', type: 'error' });
    } finally {
      setDiscarding(null);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-[#0B0E23]">Unfinished Bills</h1>
          <p className="text-xs text-slate-500 font-medium">
            Saved bills not yet finalized. Continue one to finish it, or discard it.
          </p>
        </div>
        <Link href="/admin/billing/sell">
          <Button variant="outline" size="sm">New Sale</Button>
        </Link>
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500 font-medium">Loading…</p>
      ) : drafts.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="h-8 w-8 mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-500">No unfinished bills.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {drafts.map((d) => (
            <li key={d.id}>
              <Card className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#0B0E23] truncate">
                    {d.productCode}
                    {d.customerName ? ` · ${d.customerName}` : ''}
                    {d.customerPhone ? ` · ${d.customerPhone}` : ''}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Saved {new Date(d.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · not yet billed
                    {d.note ? ` · ${d.note}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/admin/billing/sell?draft=${d.id}`}>
                    <Button size="sm">
                      Continue <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    isLoading={discarding === d.id}
                    onClick={() => discard(d.id)}
                    aria-label="Discard unfinished bill"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
