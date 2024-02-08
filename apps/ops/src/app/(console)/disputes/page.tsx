import { IssueList } from '@/components/IssueList';

export default async function Disputes({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  return <IssueList base="/disputes" kind="dispute" title="Disputes" status={(await searchParams).status} />;
}
