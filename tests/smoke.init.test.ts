import { LIBS_VERSION } from '@apiscloud/libs';
import { MESSAGE_BUS_VERSION } from '@apiscloud/message-bus';
import { LAYER_CONFIG_VERSION } from '@apiscloud/layer-config';
import { PLUGIN_HOST_VERSION } from '@apiscloud/plugin-host';

describe('工程初始化冒烟测试', () => {
  it('libs 包可引用', () => {
    expect(LIBS_VERSION).toBe('0.1.0');
  });

  it('message-bus 包可引用', () => {
    expect(MESSAGE_BUS_VERSION).toBe('0.1.0');
  });

  it('layer-config 包可引用', () => {
    expect(LAYER_CONFIG_VERSION).toBe('0.1.0');
  });

  it('plugin-host 包可引用', () => {
    expect(PLUGIN_HOST_VERSION).toBe('0.1.0');
  });
});