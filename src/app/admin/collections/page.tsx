"use client";

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { AlarmClock } from 'lucide-react';
import { collectionsService, CollectionItem } from '@/services/reportService';
import { ApiError } from '@/lib/apiClient';

export default function AdminCollectionsPage() {
  const [rows, setRows] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      setRows(await collectionsService.getCollections());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not load collections.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">Collections</h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Scheme installments 1–15 days overdue. Reminders are sent to the customer app; a paid installment stops them automatically.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} isLoading={loading}>Refresh</Button>
      </div>

      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && err && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{err}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={load}>Retry</Button>
        </Card>
      )}
      {!loading && !err && rows.length === 0 && (
        <EmptyState icon={<AlarmClock className="h-7 w-7 text-gold" />} title="No overdue collections"
          description="No scheme installment is currently 1–15 days overdue." />
      )}
      {!loading && !err && rows.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-4">Customer</th>
                  <th className="p-4">Scheme</th>
                  <th className="p-4 text-center">Due Date</th>
                  <th className="p-4 text-center">Overdue</th>
                  <th className="p-4 text-center">Reminders</th>
                  <th className="p-4">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {rows.map((r) => (
                  <tr key={r.enrollment_id} className="hover:bg-slate-50/80">
                    <td className="p-4 font-bold text-[#0B0E23]">{r.customer_name || '—'}
                      <span className="block text-[10px] text-slate-400 font-mono">{r.customer_code || r.enrollment_number}</span></td>
                    <td className="p-4">{r.scheme_name || '—'}</td>
                    <td className="p-4 text-center">{r.due_date ? new Date(r.due_date).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="p-4 text-center">
                      <Badge variant={(r.overdue_days ?? 0) >= 10 ? 'danger' : 'warn'}>{r.overdue_days} d</Badge>
                    </td>
                    <td className="p-4 text-center font-mono">{r.reminders_sent}</td>
                    <td className="p-4 text-[11px] text-slate-500">{r.customer_phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
