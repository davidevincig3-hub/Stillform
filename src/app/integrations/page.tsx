import { StravaConnection } from '@/components/strava-connection';
import { PolarConnection } from '@/components/polar-connection';
export default function Integrations() {
  return (
    <>
      <PolarConnection />
      <StravaConnection />
    </>
  );
}
