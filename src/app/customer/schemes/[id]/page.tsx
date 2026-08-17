"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import { ArrowLeft, Gem, CheckCircle2, Clock, ShieldAlert, XCircle } from 'lucide-react';
import { schemeService, CustomerScheme, SchemeRequest } from '@/services/schemeService';
import { enrollmentService, CustomerEnrollment } from '@/services/enrollmentService';
import { customerService } from '@/services/customerService';
import { ApiError } from '@/lib/apiClient';

export default function SchemeDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const schemeId = params.id as string;

  const [scheme, setScheme] = useState<CustomerScheme | null>(null);
  const [enrollment, setEnrollment] = useState<CustomerEnrollment | null>(null);
  const [latestRequest, setLatestRequest] = useState<SchemeRequest | null>(null);
  const [kycStatus, setKycStatus] = useState<string>('Pending');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [schemes, enrollments, requests, profile] = await Promise.all([
        schemeService.getCustomerSchemes(),
        enrollmentService.getMyEnrollments(),
        schemeService.getMyRequests(),
        customerService.getProfile(),
      ]);
      const found = schemes.find((s) => s.id === schemeId) ?? null;
      setScheme(found);
      setEnrollment(enrollments.find((e) => e.schemeId === schemeId && e.status === 'ACTIVE') ?? null);
      // getMyRequests is ordered newest-first by the backend, so the first
      // match for this scheme is the latest request.
      setLatestRequest(requests.find((r) => r.schemeId === schemeId) ?? null);
      setKycStatus(profile.kycStatus || 'Pending');
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load scheme details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeId]);

  const handleRequest = async () => {
    setRequestError('');
    setRequesting(true);
    try {
      const req = await schemeService.createRequest(schemeId);
      setLatestRequest(req);
      setToast({ message: 'Request submitted — awaiting store approval', type: 'success' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not submit request. Please try again.';
      setRequestError(message);
      setToast({ message: 'Request failed', type: 'error' });
    } finally {
      setRequesting(false);
    }
  };

  const kycVerified = kycStatus === 'Verified';
  const hasPending = latestRequest?.status === 'REQUESTED';
  const wasRejected = latestRequest?.status === 'REJECTED';

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/customer/schemes')}
            className="w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold"
          aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="font-display font-bold text-base text-ink">
            {scheme?.name || 'Scheme Details'}
          </h1>
        </div>
        {scheme && <Badge variant="success" dot>Active</Badge>}
      </div>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadData}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && !scheme && (
        <Card className="p-6 text-center border-slate-line">
          <p className="text-xs text-slate-muted">This scheme could not be found, or is no longer active.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => router.push('/customer/schemes')}>
            Back to Schemes
          </Button>
        </Card>
      )}

      {!loading && !loadError && scheme && (
        <>
          {/* Scheme Info Card */}
          <Card className="p-6 text-center bg-white border-slate-line shadow-card">
            <CardContent className="p-0 flex flex-col items-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-gold-dim text-[#1E4E8C] flex items-center justify-center">
                <Gem className="h-8 w-8" />
              </div>
              {scheme.description && (
                <p className="text-xs text-slate-muted leading-relaxed">{scheme.description}</p>
              )}
            </CardContent>
          </Card>

          {/* Metadata rows */}
          <Card className="p-4 border-slate-line">
            <CardContent className="p-0 divide-y divide-slate-line text-xs">
              <div className="flex justify-between py-2.5">
                <span className="text-slate-muted font-medium">Monthly Amount</span>
                <span className="font-bold text-ink font-mono">₹{scheme.monthlyAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-slate-muted font-medium">Duration</span>
                <span className="font-bold text-ink">{scheme.durationMonths} Months</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-slate-muted font-medium">Bonus</span>
                <span className="font-bold text-gold">{scheme.bonusDescription || 'None'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Enrollment status / action */}
          {enrollment ? (
            <Card dark className="p-5 space-y-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-gold-light" />
                <h2 className="font-display font-bold text-sm text-white">You&apos;re Enrolled</h2>
              </div>
              <div className="text-xs text-[#C7CDE8] space-y-1 pt-1">
                <p>Enrollment No: <span className="text-white font-mono">{enrollment.enrollmentNumber}</span></p>
                <p>Joined: <span className="text-white">{new Date(enrollment.joinedDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span></p>
                <p>Maturity Date: <span className="text-white">{new Date(enrollment.maturityDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span></p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2 bg-white/5 border-white/15 text-white hover:bg-white/10"
                onClick={() => router.push(`/customer/passbook/${enrollment.id}`)}
              >
                View Passbook
              </Button>
            </Card>
          ) : hasPending ? (
            <Card className="p-4 border-amber-200 bg-amber-50/60">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600" />
                <h2 className="font-display font-bold text-sm text-amber-800">Request Pending Approval</h2>
              </div>
              <p className="text-xs text-amber-700 mt-1.5">
                Your request to join this scheme has been sent to the store. You&apos;ll be enrolled once it&apos;s approved.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {requestError && (
                <div role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {requestError}
                </div>
              )}

              {wasRejected && (
                <div className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Your previous request was rejected{latestRequest?.rejectionReason ? `: ${latestRequest.rejectionReason}` : '.'} You can submit a new request below.
                  </span>
                </div>
              )}

              {!kycVerified ? (
                <>
                  {/* KYC step shown ONLY when the customer is not already verified. */}
                  <div className="text-xs font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      KYC verification is required before you can join a scheme. Current status:{' '}
                      <span className="font-bold">{kycStatus}</span>.
                    </span>
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => router.push('/customer/kyc')}
                  >
                    Complete KYC Verification
                  </Button>
                </>
              ) : (
                <Button className="w-full shadow-glow" isLoading={requesting} onClick={handleRequest}>
                  {requesting ? 'Submitting...' : 'Request to Join this Scheme'}
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
