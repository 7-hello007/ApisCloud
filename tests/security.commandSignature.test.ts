import { createCommandSignature, type SignableCommand } from '@apiscloud/libs';

describe('security.commandSignature', () => {
  const secret = 'command-signing-secret-for-testing-1234';
  let sig: ReturnType<typeof createCommandSignature>;

  beforeEach(() => {
    sig = createCommandSignature({ secret, ttlSec: 60 });
  });

  function makeCommand(overrides: Partial<SignableCommand> = {}): SignableCommand {
    return {
      command_id: 'cmd-1',
      vehicle_id: 'v-1',
      task_id: 'task-1',
      command_type: 'dispatch',
      payload: { lat: 31.2, lng: 121.4 },
      issued_at: Math.floor(Date.now() / 1000),
      ...overrides,
    };
  }

  it('签名和验证', () => {
    const signed = sig.sign(makeCommand());
    const result = sig.verify(signed);
    expect(result.ok).toBe(true);
  });

  it('篡改 payload 验证失败', () => {
    const signed = sig.sign(makeCommand());
    signed.command.payload = { lat: 0, lng: 0 };
    const result = sig.verify(signed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('签名校验失败');
  });

  it('过期指令验证失败', () => {
    const signed = sig.sign(makeCommand({ issued_at: Math.floor(Date.now() / 1000) - 120 }));
    const result = sig.verify(signed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('过期');
  });

  it('未来时间戳验证失败', () => {
    const signed = sig.sign(makeCommand({ issued_at: Math.floor(Date.now() / 1000) + 120 }));
    const result = sig.verify(signed);
    expect(result.ok).toBe(false);
  });

  it('不同 secret 签名不同', () => {
    const other = createCommandSignature({ secret: 'another-secret' });
    const signed = sig.sign(makeCommand());
    const result = other.verify(signed);
    expect(result.ok).toBe(false);
  });
});
