import { WorkoutDetail } from '@/components/workout-detail';
export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkoutDetail id={id} />;
}
