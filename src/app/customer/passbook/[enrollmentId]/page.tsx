"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, Download, Share2, CheckCircle2, BookOpen } from 'lucide-react';
import { formatCurrency, formatWeight } from '@/lib/formatters';
import { passbookService, Passbook } from '@/services/passbookService';
import { ApiError } from '@/lib/apiClient';

const STATUS_VARIANT: Record<string, 'success' | 'gold' | 'danger' | 'warn' | 'neutral'> = {
  ACTIVE: 'success',
  COMPLETED: 'gold',
  CANCELLED: 'danger',
  CLOSED: 'warn',
  REDEEMED: 'neutral',
};

export default function PassbookPage() {
  const router = useRouter();
  const params = useParams();
  const enrollmentId = params.enrollmentId as string;

  const [passbook, setPassbook] = useState<Passbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadPassbook = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await passbookService.getMyPassbook(enrollmentId);
      setPassbook(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load passbook.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPassbook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentId]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/customer/enrollments')}
          className="w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-base text-ink">
              Digital Passbook
            </h1>
            {passbook && (
              <Badge variant={STATUS_VARIANT[passbook.enrollment.status] ?? 'neutral'}>
                {passbook.enrollment.status}
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-muted">{passbook?.scheme.name || 'Loading...'}</p>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      )}

      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadPassbook}>
            Retry
          </Button>
        </Card>
      )}

      {!loading && !loadError && passbook && (
        <>
          {/* Top Summary Banner */}
          <Card className="p-4 border-slate-line bg-white shadow-card">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="text-slate-muted block text-[10px] uppercase font-bold">
                  Total Paid
                </span>
                <span className="font-display font-bold text-base text-ink font-mono">
                  {formatCurrency(passbook.summary.totalAmountPaid)}
                </span>
              </div>

              <div className="text-right">
                <span className="text-slate-muted block text-[10px] uppercase font-bold">
                  Total Weight
                </span>
                <span className="font-display font-bold text-base text-gold font-mono">
                  {formatWeight(passbook.summary.totalGoldWeight)}
                </span>
              </div>
            </div>
          </Card>

          {/* Closure / balance summary — only for a non-active enrollment, or
            * whenever a derived balance is available. Sections render only when
            * their data exists, so an ACTIVE never-redeemed scheme shows nothing
            * extra here. */}
          {(passbook.enrollment.status !== 'ACTIVE' ||
            (passbook.balance && passbook.balance.totalRedeemed > 0)) && (
            <Card className="p-4 border-slate-line bg-white shadow-card">
              <CardContent className="p-0 divide-y divide-slate-line text-xs">
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-muted font-medium">Status</span>
                  <span className="font-bold text-ink">{passbook.enrollment.status}</span>
                </div>
                {passbook.enrollment.closureReason && (
                  <div className="flex justify-between py-2.5 gap-3">
                    <span className="text-slate-muted font-medium shrink-0">Closure Reason</span>
                    <span className="font-bold text-ink text-right">{passbook.enrollment.closureReason}</span>
                  </div>
                )}
                {passbook.balance && (
                  <>
                    <div className="flex justify-between py-2.5">
                      <span className="text-slate-muted font-medium">Redeemed</span>
                      <span className="font-bold text-ink font-mono">{formatCurrency(passbook.balance.totalRedeemed)}</span>
                    </div>
                    <div className="flex justify-between py-2.5">
                      <span className="text-slate-muted font-medium">Remaining Balance</span>
                      <span className="font-bold text-gold font-mono">{formatCurrency(passbook.balance.availableBalance)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Redemption history — one row per time scheme balance was applied to
            * a bill (or restored by a return, shown as a positive credit). */}
          {passbook.redemptions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase font-bold text-slate-muted px-1">Scheme Redemptions</p>
              {passbook.redemptions.map((r, i) => {
                const restored = r.amount < 0;
                return (
                  <Card key={`${r.invoiceNumber}-${i}`} className="p-3.5 border-slate-line bg-white">
                    <CardContent className="p-0 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-ink block">
                          {restored ? 'Credit Restored' : 'Redeemed for Purchase'}
                        </span>
                        <span className="text-[10px] text-slate-muted">
                          Invoice {r.invoiceNumber} · {new Date(r.redeemedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                        </span>
                      </div>
                      <span className={`font-bold font-mono ${restored ? 'text-success' : 'text-ink'}`}>
                        {restored ? '+' : '−'}{formatCurrency(Math.abs(r.amount))}
                      </span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Transaction History Entries */}
          {passbook.entries.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-7 w-7 text-gold" />}
              title="No entries yet"
              description="Your payment history will appear here once you make your first installment."
            />
          ) : (
            <div className="space-y-2.5">
              {passbook.entries.map((item) => (
                <Card key={item.id} className="p-3.5 border-slate-line bg-white">
                  <CardContent className="p-0 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        <div>
                          <span className="font-bold text-ink block">
                            {new Date(item.entryDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                          </span>
                          <span className="text-[10px] text-slate-muted">{item.description}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-ink block font-mono">
                          {formatCurrency(item.amount)}
                        </span>
                        <span className="text-[11px] font-mono text-gold font-bold">
                          {item.goldWeight.toFixed(3)} g
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Bottom Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              disabled
              variant="outline"
              size="sm"
              className="w-full"
              title="Statement download isn't available yet"
            >
              <Download className="h-4 w-4 mr-1 text-gold" /> Download (Soon)
            </Button>
            <Button
              disabled
              variant="outline"
              size="sm"
              className="w-full"
              title="Sharing isn't available yet"
            >
              <Share2 className="h-4 w-4 mr-1 text-gold" /> Share (Soon)
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
