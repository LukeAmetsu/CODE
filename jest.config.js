module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(jsdom|parse5|whatwg-url|webidl-conversions|data-urls))',
  ],
};
