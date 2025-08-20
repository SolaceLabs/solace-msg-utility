#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Simple build script without external dependencies
class SimpleBuild {
  constructor() {
    this.srcDir = path.join(__dirname, 'src');
    this.distDir = path.join(__dirname, 'dist');
    this.isDev = process.argv.includes('--dev');
    this.isWatch = process.argv.includes('--watch');
  }

  // Ensure directory exists
  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Read file with error handling
  readFile(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error.message);
      return null;
    }
  }

  // Write file with error handling
  writeFile(filePath, content) {
    try {
      this.ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✓ Created: ${path.relative(__dirname, filePath)}`);
      return true;
    } catch (error) {
      console.error(`Error writing file ${filePath}:`, error.message);
      return false;
    }
  }

  // Simple minification (remove comments and extra whitespace)
  minifyJS(code) {
    // Minification disabled - return code as-is
    return code;
  }

  // Simple CSS minification
  minifyCSS(code) {
    // Minification disabled - return code as-is
    return code;
  }

  // Build the main utility HTML file
  buildUtility() {
    console.log('Building Solace Queue Browser Utility...');

    // Read source files
    const indexHtml = this.readFile(path.join(this.srcDir, 'index.html'));
    const baseCss = this.readFile(path.join(this.srcDir, 'base.css'));
    const helperJs = this.readFile(path.join(this.srcDir, 'helper.js'));
    const solaceUtilJs = this.readFile(path.join(this.srcDir, 'solaceutil.js'));

    if (!indexHtml || !baseCss || !helperJs || !solaceUtilJs) {
      console.error('Failed to read one or more source files');
      return false;
    }

    // Process CSS
    const processedCSS = this.minifyCSS(baseCss);

    // Process JavaScript
    const processedHelperJS = this.minifyJS(helperJs);
    const processedSolaceUtilJS = this.minifyJS(solaceUtilJs);

    // Combine JavaScript
    const combinedJS = `${processedHelperJS}\n\n${processedSolaceUtilJS}`;

    // Create the final HTML by replacing the external references
    let finalHtml = indexHtml
      // Replace CSS link with inline styles
      .replace(
        '<link rel="stylesheet" href="base.css">',
        `<style>\n${processedCSS}\n</style>`
      )
      // Replace script tags with inline scripts
      .replace(
        /<script src="helper\.js"><\/script>\s*<script src="solaceutil\.js"><\/script>/,
        `<script>\n${combinedJS}\n</script>`
      );

    // Add build info comment and meta tag
    const buildDate = new Date();
    const buildTimestamp = buildDate.toISOString();
    const buildLocalTime = buildDate.toLocaleString();
    const buildTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const buildInfo = `<!-- Built on ${buildTimestamp} (${buildLocalTime} ${buildTimezone}) -->`;
    const buildMeta = `<meta name="build-timestamp" content="${buildTimestamp}">
<meta name="build-local-time" content="${buildLocalTime}">
<meta name="build-timezone" content="${buildTimezone}">`;
    finalHtml = finalHtml.replace('</head>', `${buildMeta}\n${buildInfo}\n</head>`);

    // Write the output file
    const outputPath = path.join(this.distDir, 'utility.html');
    return this.writeFile(outputPath, finalHtml);
  }

  // Copy additional files
  copyFiles() {
    console.log('Copying additional files...');

    // Copy original source files for development
    if (this.isDev) {
      const files = ['index.html', 'base.css', 'helper.js', 'solaceutil.js'];
      
      files.forEach(file => {
        const srcPath = path.join(this.srcDir, file);
        const destPath = path.join(this.distDir, file);
        const content = this.readFile(srcPath);
        
        if (content) {
          this.writeFile(destPath, content);
        }
      });
    }

    // Copy README and other documentation
    const docFiles = [
      { src: 'README.md', dest: 'README-original.md' },
      { src: 'README-dev.md', dest: 'README-dev.md' },
      { src: 'PACKAGING.md', dest: 'PACKAGING.md' },
      { src: 'LICENSE', dest: 'LICENSE' }
    ];

    docFiles.forEach(({ src, dest }) => {
      const srcPath = path.join(__dirname, src);
      if (fs.existsSync(srcPath)) {
        const content = this.readFile(srcPath);
        if (content) {
          this.writeFile(path.join(this.distDir, dest), content);
        }
      }
    });

    // Copy Solace JavaScript API files if they exist
    const solaceFiles = [
      { src: 'solclient.js', dest: 'solclient.js' },
      { src: 'solclient.js', dest: 'js/solclient.js' }
    ];

    solaceFiles.forEach(({ src, dest }) => {
      const srcPath = path.join(__dirname, src);
      if (fs.existsSync(srcPath)) {
        const content = this.readFile(srcPath);
        if (content) {
          this.writeFile(path.join(this.distDir, dest), content);
        }
      }
    });

    return true;
  }

  // Create development server HTML
  createDevServer() {
    if (!this.isDev) return true;

    const devServerHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Solace Queue Browser - Development Server</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .links { display: flex; gap: 20px; }
        .link { padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 3px; }
        .link:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Solace Queue Browser - Development Build</h1>
        <p>Built on: ${new Date().toISOString()}</p>
    </div>
    
    <div class="links">
        <a href="utility.html" class="link">Production Build</a>
        <a href="index.html" class="link">Development Version</a>
    </div>
    
    <h2>Available Files:</h2>
    <ul>
        <li><strong>utility.html</strong> - Single-file production build</li>
        <li><strong>index.html</strong> - Development version with separate files</li>
        <li><strong>base.css</strong> - Stylesheet</li>
        <li><strong>helper.js</strong> - Utility functions</li>
        <li><strong>solaceutil.js</strong> - Main application logic</li>
    </ul>
    
    <h2>Notes:</h2>
    <ul>
        <li>Make sure to place <code>solclient.js</code> in the <code>js/</code> folder or same directory</li>
        <li>For development, use the separate files for easier debugging</li>
        <li>For production, use the single <code>utility.html</code> file</li>
    </ul>
</body>
</html>`;

    return this.writeFile(path.join(this.distDir, 'index.html'), devServerHtml);
  }

  // Create js folder and instructions
  createJsFolder() {
    const jsDir = path.join(this.distDir, 'js');
    this.ensureDir(jsDir);

    const readmeContent = `# Solace JavaScript API

This folder should contain the Solace JavaScript API file.

## Download Instructions

1. Go to [Solace Downloads](https://solace.com/downloads/?fwp_downloads_types=messaging-apis-and-protocols)
2. Download the **JavaScript (Browser)** API
3. Extract the downloaded file
4. Copy \`solclient.js\` to this folder

## Files needed:
- \`solclient.js\` - Main Solace API file

The application will automatically try to load:
1. \`js/solclient.js\` (recommended location)
2. \`solclient.js\` (alternative location in same directory as utility.html)

## Version Compatibility
This utility has been tested with Solace JavaScript API v10.18.2 and later.
`;

    return this.writeFile(path.join(jsDir, 'README.md'), readmeContent);
  }

  // Watch for file changes
  watchFiles() {
    if (!this.isWatch) return;

    console.log('Watching for file changes...');
    
    const filesToWatch = [
      path.join(this.srcDir, 'index.html'),
      path.join(this.srcDir, 'base.css'),
      path.join(this.srcDir, 'helper.js'),
      path.join(this.srcDir, 'solaceutil.js')
    ];

    // Simple file watching without external dependencies
    const watchedFiles = new Map();
    
    const checkFiles = () => {
      let hasChanges = false;
      
      filesToWatch.forEach(file => {
        try {
          const stats = fs.statSync(file);
          const lastModified = stats.mtime.getTime();
          
          if (!watchedFiles.has(file) || watchedFiles.get(file) !== lastModified) {
            watchedFiles.set(file, lastModified);
            hasChanges = true;
          }
        } catch (error) {
          // File doesn't exist or can't be accessed
        }
      });
      
      if (hasChanges) {
        console.log('\nFiles changed, rebuilding...');
        this.build();
      }
    };

    // Initial check
    checkFiles();
    
    // Check every 1 second
    setInterval(checkFiles, 1000);
  }

  // Main build function
  build() {
    console.log(`\n🚀 Starting ${this.isDev ? 'development' : 'production'} build...`);
    
    const startTime = Date.now();
    
    // Clean and create dist directory
    if (fs.existsSync(this.distDir)) {
      fs.rmSync(this.distDir, { recursive: true, force: true });
    }
    this.ensureDir(this.distDir);

    // Build steps
    const success = 
      this.buildUtility() &&
      this.copyFiles() &&
      this.createDevServer() &&
      this.createJsFolder();

    const buildTime = Date.now() - startTime;
    
    if (success) {
      console.log(`\n✅ Build completed successfully in ${buildTime}ms`);
      console.log(`📁 Output directory: ${path.relative(__dirname, this.distDir)}`);
      
      if (this.isDev) {
        console.log(`🌐 Development server: Run 'npm run serve' and open http://localhost:8080`);
      }
    } else {
      console.log('\n❌ Build failed');
      process.exit(1);
    }

    // Start watching if requested
    if (this.isWatch) {
      this.watchFiles();
    }
  }
}

// Run the build
const builder = new SimpleBuild();
builder.build();