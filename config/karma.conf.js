module.exports = function(config) {
  config.set({
    browsers: ['Chrome'],
    frameworks: ['jasmine'], //see also karma-phantomjs-launcher, karma-firefox-launcher, karma-ievms-launcher
    files: [
      'test/e2e/*.js'
    ]
  });
};

