import { AssessmentCard } from '@/components/assessment';
import { recovery } from '@/repositories/seed';
import { HomeDashboard } from '@/components/home-dashboard';
export default function Home() {
  return (
    <HomeDashboard
      sampleAssessment={<AssessmentCard assessment={recovery} />}
    />
  );
}
