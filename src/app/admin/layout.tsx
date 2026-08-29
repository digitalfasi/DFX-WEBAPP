import React from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { ConditionalTopBar } from '@/components/layout/ConditionalTopBar';
import { MobileNavProvider } from '@/components/layout/MobileNavContext';
import { RequireAuth } from '@/components/shared/RequireAuth';
import { StaffAccessGuard } from '@/components/shared/StaffAccessGuard';
import { TenantProvider } from '@/providers/TenantProvider';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allow={['admin']}>
      <TenantProvider>
        <MobileNavProvider>
          <div className="flex h-screen overflow-hidden bg-[#F7F8FC]">
            <AdminSidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <ConditionalTopBar />
              <main className="flex-1 p-3 sm:p-6 overflow-y-auto overflow-x-hidden">
                <StaffAccessGuard>{children}</StaffAccessGuard>
              </main>
            </div>
          </div>
        </MobileNavProvider>
      </TenantProvider>
    </RequireAuth>
  );
}
