import { ExerciseDetail } from '@/components/exercise-detail';
export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExerciseDetail id={id} />;
}
