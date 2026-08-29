"use client";

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_NAV_ITEMS } from '@/constants';
import { hasStaffModule } from '@/services/staffService';
import { Button } from '@/components/ui/button';

/**
 * Frontend companion to the backend's require_admin_or_staff_module — the
 * real enforcement is the 401/403 every gated API call already returns
 * (see app/permissions/dependencies.py), this only stops a Staff account
 * from landing on a page it has no permission for via direct URL/back-
 * button navigation, so they see an honest "not granted" state instead of
 * a page full of failed requests.
 */
export const StaffAccessGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  if (user?.backendRole !== 'Staff') {
    return <>{children}</>;
  }

  const matchedItem = ADMIN_NAV_ITEMS
    .filter((item) => (item.path === '/admin' ? pathname === '/admin' : pathname.startsWith(item.path)))
    .sort((a, b) => b.path.length - a.path.length)[0];

  // Dashboard has no single owning module — any granted permission is
  // enough to view it, since it's just a summary of what the staff member
  // can already otherwise see.
  const allowed =
    !matchedItem ||
    (matchedItem.path === '/admin' ? user.permissions.length > 0 : hasStaffModule(user.permissions, matchedItem.staffModule));

  if (allowed) {
    return <>{children}</>;
  }

  const firstPermitted = ADMIN_NAV_ITEMS.find((item) => hasStaffModule(user.permissions, item.staffModule));

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center">
        <ShieldAlert className="w-7 h-7" />
      </div>
      <div>
        <h2 className="font-display font-bold text-lg text-[#0B0E23]">Access not granted</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          {user.permissions.length > 0
            ? "Your account doesn't have permission for this section. Ask your Admin to grant access from Staff Users."
            : 'Your account has no modules granted yet. Ask your Admin to grant access from Staff Users.'}
        </p>
      </div>
      {firstPermitted && (
        <Button variant="outline" size="sm" onClick={() => router.push(firstPermitted.path)}>
          Go to {firstPermitted.label}
        </Button>
      )}
    </div>
  );
};
