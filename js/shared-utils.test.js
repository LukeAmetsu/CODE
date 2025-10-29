/**
 * @jest-environment jsdom
 */
const { TextEncoder, TextDecoder } = require('util');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock the dependencies
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Load the HTML file
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

// Create a mock DOM environment
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  referrer: 'http://localhost/',
  contentType: 'text/html',
  includeNodeLocations: true,
  storageQuota: 10000000,
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

// Load the script
const script = fs.readFileSync(path.resolve(__dirname, './shared-utils.js'), 'utf8');
const scriptElement = document.createElement('script');
scriptElement.textContent = script;
document.head.appendChild(scriptElement);

// Mock the dependencies
const {
  updateThemeIcons,
  toggleTheme,
  initializeThemeToggle,
  applyThemeFromLocalStorage,
  highlightRequiredFields,
  initializeSharedUI,
  initializeUiToggles,
  createDOMElement,
  initializeBackToTopButton,
  safeCalculation,
  debounce,
  setLoadingState,
  interpolate,
  validateInputs,
  renderValidationResults,
  sanitizeHTML,
  showFeedback,
  getAllCssStyles,
  convertSvgToPng,
  createWordCompatibleHTML,
  convertElementToPlainText,
  handleCopy,
  handleDownloadPdf,
  convertReportToCsv,
  handleDownloadCsv,
  gatherInputsFromIds,
  saveInputsToFile,
  initiateLoadInputsFromFile,
  createSaveInputsHandler,
  applyInputsToDOM,
  createLoadInputsHandler,
  saveInputsToLocalStorage,
  loadInputsFromLocalStorage,
  clearLocalStorageAndResetUI,
  initializeApp,
  ReportBuilder,
  attachReportEventListeners,
  createCalculationHandler,
  sendToCombos,
  populateMaterialDropdowns,
  populateBoltGradeDropdowns,
  populateBoltDiameterDropdowns,
  autoLoadPageScript,
  populateShapeDropdown,
} = window;

describe('Engineering Calculator Hub', () => {
  describe('Theme', () => {
    it('should toggle the theme', () => {
      // Set the initial theme to light
      document.documentElement.classList.remove('dark');
      localStorage.setItem('color-theme', 'light');

      // Toggle the theme
      toggleTheme();

      // Check if the theme is now dark
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem('color-theme')).toBe('dark');

      // Toggle the theme again
      toggleTheme();

      // Check if the theme is now light
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(localStorage.getItem('color-theme')).toBe('light');
    });

    it('should apply the theme from local storage', () => {
      // Set the theme to dark
      localStorage.setItem('color-theme', 'dark');

      // Apply the theme
      applyThemeFromLocalStorage();

      // Check if the theme is dark
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // Set the theme to light
      localStorage.setItem('color-theme', 'light');

      // Apply the theme
      applyThemeFromLocalStorage();

      // Check if the theme is light
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('DOM', () => {
    it('should create a DOM element', () => {
      const el = createDOMElement(
        'div',
        {
          className: 'test-class',
          id: 'test-id',
          dataset: {
            test: 'test',
          },
        },
        ['test']
      );

      expect(el.tagName).toBe('DIV');
      expect(el.className).toBe('test-class');
      expect(el.id).toBe('test-id');
      expect(el.dataset.test).toBe('test');
      expect(el.textContent).toBe('test');
    });
  });

  describe('Utils', () => {
    it('should sanitize HTML', () => {
      const sanitized = sanitizeHTML('<script>alert("xss")</script>');
      expect(sanitized).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
  });
});
