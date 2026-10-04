import { RoutineEditor } from '@/components/routine-editor';
export default async function RoutinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RoutineEditor id={id} />;
}
