"use client";

import React, { useEffect, useState } from 'react';
import {
  schemeService,
  SchemeRequest,
  SchemeRequestStatus,
} from '@/services/schemeService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Toast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ClipboardList, Check, X, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';

type FilterKey = 'ALL' | SchemeRequestStatus;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'REQUESTED', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
];

function statusBadge(status: SchemeRequestStatus) {
  if (status === 'APPROVED') return <Badge variant="success" dot>Approved</Badge>;
  if (status === 'REJECTED') return <Badge variant="danger" dot>Rejected</Badge>;
  return <Badge variant="warn" dot>Pending</Badge>;
}

export default function AdminSchemeRequestsPage() {
  const [filter, setFilter] = useState<FilterKey>('REQUESTED');
  const [requests, setRequests] = useState<SchemeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [rejectTarget, setRejectTarget] = useState<SchemeRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await schemeService.getAdminRequests(
        filter === 'ALL' ? undefined : filter,
      );
      setRequests(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load scheme requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleApprove = async (req: SchemeRequest) => {
    setActingId(req.id);
    try {
      await schemeService.approveRequest(req.id);
      setToast({ message: 'Request approved — enrollment created', type: 'success' });
      await load();
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Could not approve request',
        type: 'error',
      });
    } finally {
      setActingId(null);
    }
  };

  const openReject = (req: SchemeRequest) => {
    setRejectTarget(req);
    setRejectReason('');
    setRejectError('');
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 3) {
      setRejectError('A rejection reason is required (min 3 characters).');
      return;
    }
    setRejecting(true);
    setRejectError('');
    try {
      await schemeService.rejectRequest(rejectTarget.id, rejectReason.trim());
      setToast({ message: 'Request rejected', type: 'success' });
      setRejectTarget(null);
      await load();
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : 'Could not reject request.');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-body">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#0B0E23]">Scheme Requests</h1>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Review join requests. KYC must be verified before a request can be approved.
          </p>
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ' +
                (filter === f.key
                  ? 'bg-[#0B0E23] text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200')
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={load}>Retry</Button>
        </Card>
      )}

      {!loading && !loadError && requests.length === 0 && (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7 text-gold" />}
          title="No scheme requests"
          description="There are no requests matching this filter."
        />
      )}

      {!loading && !loadError && requests.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-4">Customer</th>
                  <th className="p-4">Scheme</th>
                  <th className="p-4 text-center">KYC</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4">Outcome</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {requests.map((r) => {
                  const verified = r.kycStatusCurrent === 'Verified';
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-[#0B0E23]">{r.customerName || '—'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{r.customerCode || r.customerId}</div>
                      </td>
                      <td className="p-4 font-semibold text-[#0B0E23]">{r.schemeName || r.schemeId}</td>
                      <td className="p-4 text-center">
                        {verified ? (
                          <Badge variant="success"><ShieldCheck className="w-3 h-3 mr-1" />Verified</Badge>
                        ) : (
                          <Badge variant="danger"><ShieldAlert className="w-3 h-3 mr-1" />{r.kycStatusCurrent || 'Pending'}</Badge>
                        )}
                      </td>
                      <td className="p-4 text-center">{statusBadge(r.status)}</td>
                      <td className="p-4">
                        {r.status === 'APPROVED' && (
                          <span className="text-[11px] text-slate-600">
                            Enrollment <span className="font-mono font-bold text-[#0B0E23]">{r.enrollmentNumber}</span>
                          </span>
                        )}
                        {r.status === 'REJECTED' && (
                          <span className="text-[11px] text-red-600">{r.rejectionReason}</span>
                        )}
                        {r.status === 'REQUESTED' && <span className="text-[11px] text-slate-400">—</span>}
                      </td>
                      <td className="p-4 text-center">
                        {r.status === 'REQUESTED' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              size="sm"
                              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={!verified || actingId === r.id}
                              isLoading={actingId === r.id}
                              onClick={() => handleApprove(r)}
                              title={verified ? 'Approve & create enrollment' : 'KYC not verified — cannot approve'}
                            >
                              <Check className="w-3.5 h-3.5 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-red-200 text-red-600 hover:bg-red-50"
                              disabled={actingId === r.id}
                              onClick={() => openReject(r)}
                            >
                              <X className="w-3.5 h-3.5 mr-1" /> Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* REJECT DIALOG */}
      <Dialog
        isOpen={!!rejectTarget}
        onClose={() => !rejecting && setRejectTarget(null)}
        title="Reject Scheme Request"
      >
        <div className="space-y-3 text-xs">
          <p className="text-slate-600">
            Rejecting <span className="font-bold">{rejectTarget?.customerName}</span>&apos;s request for{' '}
            <span className="font-bold">{rejectTarget?.schemeName}</span>. This is permanent; the customer must file a new request to try again.
          </p>
          {rejectError && (
            <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {rejectError}
            </div>
          )}
          <div className="space-y-1">
            <label className="font-bold text-slate-500 uppercase text-[10px]">Reason *</label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. KYC document unclear"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setRejectTarget(null)} disabled={rejecting}>
            Cancel
          </Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" isLoading={rejecting} onClick={handleReject}>
            Reject Request
          </Button>
        </DialogFooter>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
