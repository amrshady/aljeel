import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok status', () => {
    const controller = new HealthController();
    const result = controller.getHealth();
    expect(result.status).toBe('ok');
    expect(result.version).toBeDefined();
    expect(result.timestamp).toBeDefined();
  });
});
