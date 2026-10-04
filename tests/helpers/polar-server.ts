import { config, connection } from './integrations';
import { polarScopes } from '../../src/domain/polar';
export const polarConfig = {
  ...config,
  secretKey: 'sb_secret_synthetic',
  polarClientId: 'synthetic-polar-client',
  polarClientSecret: 'synthetic-polar-secret',
};
export const polarConnection = {
  ...connection,
  athleteId: 'owner',
  scopes: [...polarScopes],
};
