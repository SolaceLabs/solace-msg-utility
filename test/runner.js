#!/usr/bin/env node

// Simple test runner for Solace Queue Browser Utility
const fs = require('fs');
const path = require('path');

class SimpleTestRunner {
  constructor() {
    this.testDir = path.join(__dirname);
    this.srcDir = path.join(__dirname, '..', 'src');
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      total: 0
    };
  }

  // Load JavaScript files for testing (simple Node.js context)
  loadSources() {
    // Mock DOM environment for testing
    global.document = {
      getElementById: () => ({ value: '', textContent: '' }),
      getElementsByClassName: () => [],
      getElementsByTagName: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ classList: { add: () => {}, remove: () => {} } }),
      head: { appendChild: () => {} },
      body: { appendChild: () => {} }
    };

    global.window = {
      location: { protocol: 'http:', search: '' },
      addEventListener: () => {},
      SolaceUtilityHelpers: {}
    };

    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };

    // Load helper functions
    try {
      const helperContent = fs.readFileSync(path.join(this.srcDir, 'helper.js'), 'utf8');
      eval(helperContent);
    } catch (error) {
      console.error('Failed to load helper.js:', error.message);
    }
  }

  // Test helper functions
  testHelpers() {
    console.log('\n📋 Testing Helper Functions...');

    // Test string helpers
    this.test('String truncate', () => {
      const helpers = global.SolaceUtilityHelpers || window.SolaceUtilityHelpers;
      const result = helpers.strings.truncate('This is a long string', 10);
      return result === 'This is a ...';
    });

    this.test('String escape HTML', () => {
      const helpers = global.SolaceUtilityHelpers || window.SolaceUtilityHelpers;
      // Simple test without DOM
      return typeof helpers.strings.escapeHtml === 'function';
    });

    this.test('String random ID generation', () => {
      const helpers = global.SolaceUtilityHelpers || window.SolaceUtilityHelpers;
      const id1 = helpers.strings.generateRandomId(8);
      const id2 = helpers.strings.generateRandomId(8);
      return id1.length === 8 && id2.length === 8 && id1 !== id2;
    });

    // Test validation helpers
    this.test('Validation isEmpty', () => {
      const helpers = global.SolaceUtilityHelpers || window.SolaceUtilityHelpers;
      return helpers.validation.isEmpty('') === true &&
             helpers.validation.isEmpty('  ') === true &&
             helpers.validation.isEmpty('test') === false;
    });

    this.test('Validation URL check', () => {
      const helpers = global.SolaceUtilityHelpers || window.SolaceUtilityHelpers;
      return helpers.validation.isValidUrl('https://example.com') === true &&
             helpers.validation.isValidUrl('invalid-url') === false;
    });

    this.test('Validation WebSocket URL check', () => {
      const helpers = global.SolaceUtilityHelpers || window.SolaceUtilityHelpers;
      return helpers.validation.isValidWebSocketUrl('wss://example.com') === true &&
             helpers.validation.isValidWebSocketUrl('ws://example.com') === true &&
             helpers.validation.isValidWebSocketUrl('https://example.com') === false;
    });

    // Test array helpers
    this.test('Array isEmpty', () => {
      const helpers = global.SolaceUtilityHelpers || window.SolaceUtilityHelpers;
      return helpers.arrays.isEmpty([]) === true &&
             helpers.arrays.isEmpty([1, 2, 3]) === false &&
             helpers.arrays.isEmpty(null) === true;
    });

    this.test('Array unique', () => {
      const helpers = global.SolaceUtilityHelpers || window.SolaceUtilityHelpers;
      const result = helpers.arrays.unique([1, 2, 2, 3, 3, 3]);
      return JSON.stringify(result) === JSON.stringify([1, 2, 3]);
    });

    this.test('Array chunk', () => {
      const helpers = global.SolaceUtilityHelpers || window.SolaceUtilityHelpers;
      const result = helpers.arrays.chunk([1, 2, 3, 4, 5], 2);
      return result.length === 3 && result[0].length === 2 && result[2].length === 1;
    });

    // Test object helpers
    this.test('Object isEmpty', () => {
      const helpers = global.SolaceUtilityHelpers || window.SolaceUtilityHelpers;
      return helpers.objects.isEmpty({}) === true &&
             helpers.objects.isEmpty({ a: 1 }) === false;
    });

    this.test('Object get nested property', () => {
      const helpers = global.SolaceUtilityHelpers || window.SolaceUtilityHelpers;
      const obj = { a: { b: { c: 'value' } } };
      return helpers.objects.get(obj, 'a.b.c') === 'value' &&
             helpers.objects.get(obj, 'a.b.x', 'default') === 'default';
    });

    this.test('Object set nested property', () => {
      const helpers = global.SolaceUtilityHelpers || window.SolaceUtilityHelpers;
      const obj = {};
      helpers.objects.set(obj, 'a.b.c', 'value');
      return obj.a && obj.a.b && obj.a.b.c === 'value';
    });
  }

  // Test build output
  testBuildOutput() {
    console.log('\n🏗️  Testing Build Output...');

    const distDir = path.join(__dirname, '..', 'dist');

    this.test('Build directory exists', () => {
      return fs.existsSync(distDir);
    });

    this.test('Main utility.html exists', () => {
      return fs.existsSync(path.join(distDir, 'utility.html'));
    });

    this.test('JS folder exists', () => {
      return fs.existsSync(path.join(distDir, 'js'));
    });

    this.test('Documentation files exist', () => {
      const requiredFiles = ['README-original.md', 'README-dev.md', 'PACKAGING.md', 'LICENSE'];
      return requiredFiles.every(file => 
        fs.existsSync(path.join(distDir, file))
      );
    });

    this.test('utility.html contains inlined CSS and JS', () => {
      if (!fs.existsSync(path.join(distDir, 'utility.html'))) {
        return false;
      }

      const content = fs.readFileSync(path.join(distDir, 'utility.html'), 'utf8');
      return content.includes('<style>') && 
             content.includes('SolaceWebUtility') &&
             !content.includes('src="helper.js"') &&
             !content.includes('href="base.css"');
    });
  }

  // Test file structure
  testFileStructure() {
    console.log('\n📁 Testing File Structure...');

    const srcFiles = [
      'index.html',
      'base.css', 
      'helper.js',
      'solaceutil.js'
    ];

    srcFiles.forEach(file => {
      this.test(`Source file ${file} exists`, () => {
        return fs.existsSync(path.join(this.srcDir, file));
      });
    });

    this.test('Package.json exists', () => {
      return fs.existsSync(path.join(__dirname, '..', 'package.json'));
    });

    this.test('Build script exists', () => {
      return fs.existsSync(path.join(__dirname, '..', 'build.js'));
    });
  }

  // Individual test method
  test(name, testFn) {
    this.results.total++;
    
    try {
      const result = testFn();
      if (result === true) {
        console.log(`  ✅ ${name}`);
        this.results.passed++;
      } else {
        console.log(`  ❌ ${name} - returned: ${result}`);
        this.results.failed++;
      }
    } catch (error) {
      console.log(`  ❌ ${name} - error: ${error.message}`);
      this.results.failed++;
    }
  }

  // Run all tests
  async run() {
    console.log('🧪 Solace Queue Browser Utility - Test Suite');
    console.log('='.repeat(50));

    // Load sources for testing
    this.loadSources();

    // Run test suites
    this.testFileStructure();
    this.testHelpers();
    this.testBuildOutput();

    // Print results
    console.log('\n📊 Test Results:');
    console.log('='.repeat(30));
    console.log(`Total tests: ${this.results.total}`);
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    
    if (this.results.failed === 0) {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log(`\n💥 ${this.results.failed} test(s) failed!`);
      process.exit(1);
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const runner = new SimpleTestRunner();
  runner.run().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = SimpleTestRunner;