export const dynamic = 'force-dynamic';

import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout';
import { getAdminMetaAction, getAuthenticatedUser } from '@/features/dashboard/actions';

export default async function ListLayout({ children }: { children: React.ReactNode }) {
  // Fetch adminMeta and user data server-side to avoid loading states
  const [adminMetaResponse, userResponse] = await Promise.all([
    getAdminMetaAction(),
    getAuthenticatedUser()
  ]);
  
  const adminMeta = adminMetaResponse.success ? adminMetaResponse.data : null;
  const user = userResponse.success && userResponse.data?.authenticatedItem
    ? {
        ...userResponse.data.authenticatedItem,
        menuItemsCount: userResponse.data.usersCount > 1 ? userResponse.data.usersCount : 0,
        // The sidebar names the community (or the operator, for several); it wraps, never truncates.
        workspaceName: userResponse.data.communitiesCount > 1 ? userResponse.data.operatorSettings?.displayName || null : userResponse.data.communities?.[0]?.name || userResponse.data.operatorSettings?.displayName || null,
      }
    : null;

  return (
    <DashboardLayout adminMeta={adminMeta} authenticatedItem={user}>
      {children}
    </DashboardLayout>
  );
}