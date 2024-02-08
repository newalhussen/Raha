import { IssueDetail } from '@/components/IssueDetail';

export default async function DisputeCase({ params }: { params: Promise<{ id: string }> }) {
  return <IssueDetail id={(await params).id} back="/disputes" />;
}
