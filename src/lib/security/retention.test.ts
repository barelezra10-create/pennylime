import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  prisma: { retentionCase: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() }, application: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    adminMfaChallenge: { deleteMany: vi.fn() }, securityReview: { create: vi.fn() }, auditLog: { create: vi.fn() }, $transaction: vi.fn(), $queryRaw: vi.fn() }, remove: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: m.prisma }));
vi.mock('@/lib/encryption', () => ({ decrypt: () => 'test-token' }));
vi.mock('@/lib/plaid', () => ({ plaidClient: { itemRemove: m.remove } }));
import { runRetentionReview } from './retention';
const record = { id: 'r', applicationId: 'a', legalHold: false, plaidRevokedAt: null, relationshipEndedAt: new Date('2026-01-01') };
describe('retention execution', () => {
  beforeEach(() => {
    vi.resetAllMocks();vi.stubEnv('RETENTION_REVOKE_ENABLED','true');
    m.prisma.retentionCase.findMany.mockResolvedValue([record]);m.prisma.retentionCase.findUnique.mockResolvedValue(record);
    m.prisma.application.findUnique.mockResolvedValue({ id: 'a', email: 'test@example.com', status: 'PAID_OFF', plaidAccessToken: 'encrypted', plaidItemId: 'item' });
    m.prisma.application.count.mockResolvedValue(0);m.prisma.adminMfaChallenge.deleteMany.mockResolvedValue({ count: 2 });
    m.prisma.$transaction.mockImplementation(async f => f(m.prisma));m.remove.mockResolvedValue({});
  });
  it('does not revoke in report-only mode', async () => {
    vi.stubEnv('RETENTION_REVOKE_ENABLED','false');
    expect((await runRetentionReview()).eligible).toBe(1);expect(m.remove).not.toHaveBeenCalled();expect(m.prisma.application.update).not.toHaveBeenCalled();
  });
  it('rechecks a hold added after candidate selection', async () => {
    m.prisma.retentionCase.findUnique.mockResolvedValue({ ...record, legalHold:true });
    expect((await runRetentionReview()).skipped).toBe(1);expect(m.remove).not.toHaveBeenCalled();
  });
  it('does not disconnect an active related relationship', async () => {
    m.prisma.application.count.mockResolvedValue(1);
    expect((await runRetentionReview()).skipped).toBe(1);expect(m.remove).not.toHaveBeenCalled();
  });
  it('preserves retry information when Plaid fails', async () => {
    m.remove.mockRejectedValue(new Error('network'));
    expect((await runRetentionReview()).failed).toBe(1);expect(m.prisma.application.update).not.toHaveBeenCalled();
  });
  it('revokes first, clears tokens and records evidence without deleting financial records', async () => {
    expect((await runRetentionReview()).revoked).toBe(1);
    expect(m.prisma.application.update).toHaveBeenCalledWith({ where:{id:'a'},data:{plaidAccessToken:null,plaidUserToken:null,plaidLinkStale:true} });
    expect(m.prisma.auditLog.create).toHaveBeenCalled();expect(m.prisma.securityReview.create).toHaveBeenCalled();
  });
});
