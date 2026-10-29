const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// PowerSync ships separate SDKs for native and web. Each platform must never
// try to bundle the other one, so we stub it out with an empty module.
const NATIVE_ONLY = [
  '@powersync/react-native',
  '@op-engineering/op-sqlite',
  'react-native-prompt-android',
];
const WEB_ONLY = ['@powersync/web'];

config.resolver.unstable_conditionsByPlatform = {
  ...config.resolver.unstable_conditionsByPlatform,
  web: [...(config.resolver.unstable_conditionsByPlatform?.web ?? ['browser']), 'react-native-web'],
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const stubbed = platform === 'web' ? NATIVE_ONLY : WEB_ONLY;
  if (stubbed.includes(moduleName)) {
    return { type: 'empty' };
  }
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  return resolve(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './src/global.css' });
