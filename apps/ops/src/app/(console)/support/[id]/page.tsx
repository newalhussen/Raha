import { IssueDetail } from '@/components/IssueDetail';

export default async function SupportCase({ params }: { params: Promise<{ id: string }> }) {
  return <IssueDetail id={(await params).id} back="/support" />;
}
