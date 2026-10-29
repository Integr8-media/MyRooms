module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    // Needed by PowerSync watched queries (async iterators) on React Native.
    plugins: ['@babel/plugin-transform-async-generator-functions'],
  };
};
