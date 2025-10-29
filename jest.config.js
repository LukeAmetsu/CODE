module.exports = {
    testEnvironment: 'jsdom',
    transformIgnorePatterns: [
      'node_modules/(?!(jsdom|whatwg-url|webidl-conversions|tldts|data-urls|formdata-polyfill|p-from-each)/)',
    ],
  };
  