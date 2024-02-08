import { IssueList } from '@/components/IssueList';

export default async function Support({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  return <IssueList base="/support" kind="support_all" title="Support" status={(await searchParams).status} />;
}
