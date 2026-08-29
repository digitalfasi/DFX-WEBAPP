"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/form-controls';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Toast } from '@/components/ui/toast';
import { formatCurrency } from '@/lib/formatters';
import {
  Search,
  Filter,
  Plus,
  Receipt,
  Eye,
} from 'lucide-react';
import {
  paymentService,
  AdminPayment,
  PaymentStatus,
} from '@/services/paymentService';
import { ApiError } from '@/lib/apiClient';
import RecordManualPaymentDialog from './_components/RecordManualPaymentDialog';

const STATUS_VARIANT: Record<PaymentStatus, 'success' | 'pending' | 'danger' | 'gold' | 'neutral'> = {
  SUCCESS: 'success',
  PENDING: 'pending',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'gold',
};

export default function AdminPaymentsPage() {
  const router = useRouter();

  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | PaymentStatus>('All');

  const [dialogOpen, setDialogOpen] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await paymentService.getAdminPayments();
      setPayments(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load payments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const filtered = payments.filter((p) => {
    const matchesSearch =
      p.paymentReference.toLowerCase().includes(search.toLowerCase()) ||
      p.customerName.toLowerCase().includes(search.toLowerCase()) ||
      p.enrollmentNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || p.paymentStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openRecordDialog = () => setDialogOpen(true);

  const handleRecorded = () => {
    setToast({ message: 'Payment recorded successfully', type: 'success' });
    loadPayments();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">
            Payments
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Internal payment records for your tenant. No payment gateway is connected yet — record manual payments (cash, bank transfer, cheque) here.
          </p>
        </div>

        <Button onClick={openRecordDialog} size="sm" className="bg-gold hover:bg-gold-dark text-white font-bold h-9">
          <Plus className="w-4 h-4 mr-1.5" /> Record Manual Payment
        </Button>
      </div>

      {/* FILTERS TOOLBAR */}
      <Card className="p-4 bg-white border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, customer, or enrollment no..."
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'All' | PaymentStatus)}
            className="w-40"
          >
            <option value="All">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUNDED">Refunded</option>
          </Select>
        </div>
      </Card>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadPayments}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && payments.length === 0 && (
        <EmptyState
          icon={<Receipt className="h-7 w-7 text-gold" />}
          title="No payments recorded yet"
          description="Record a manual payment for a customer's enrollment to see it here."
          actionLabel="Record Manual Payment"
          onAction={openRecordDialog}
        />
      )}

      {!loading && !loadError && payments.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-4">Reference No</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Scheme</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Method</th>
                  <th className="p-4 text-right">Amount</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-mono font-bold text-[#0B0E23]">{p.paymentReference}</td>
                    <td className="p-4 font-semibold">{p.customerName}</td>
                    <td className="p-4">{p.schemeName}</td>
                    <td className="p-4 text-slate-600">{new Date(p.paymentDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
                    <td className="p-4 font-semibold text-slate-700">{p.paymentMethod.replace('_', ' ')}</td>
                    <td className="p-4 text-right font-mono font-bold text-[#0B0E23]">{formatCurrency(p.amount)}</td>
                    <td className="p-4 text-center">
                      <Badge variant={STATUS_VARIANT[p.paymentStatus]} className="text-[10px]" dot>
                        {p.paymentStatus}
                      </Badge>
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => router.push(`/admin/payments/${p.id}`)}
                        className="p-1.5 text-slate-400 hover:text-gold hover:bg-gold/10 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <RecordManualPaymentDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onRecorded={handleRecorded}
      />

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
