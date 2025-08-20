#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

class DevServer {
  constructor() {
    this.port = process.env.PORT || 8080;
    this.distDir = path.join(__dirname, 'dist');
    this.srcDir = path.join(__dirname, 'src');
    this.clients = new Set();
    this.watchedFiles = new Map();
    this.server = null;
    this.wss = null;
  }

  // Simple MIME type detection
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    return types[ext] || 'text/plain';
  }

  // Inject live reload script into HTML files
  injectLiveReload(html) {
    const liveReloadScript = `
<script>
  (function() {
    const ws = new WebSocket('ws://localhost:${this.port}/ws');
    ws.onopen = function() {
      console.log('[Live Reload] Connected');
    };
    ws.onmessage = function(event) {
      if (event.data === 'reload') {
        console.log('[Live Reload] Reloading page...');
        location.reload();
      }
    };
    ws.onclose = function() {
      console.log('[Live Reload] Disconnected, attempting to reconnect...');
      setTimeout(function() {
        location.reload();
      }, 1000);
    };
  })();
</script>`;

    // Inject before closing body tag, or before closing html tag if no body
    if (html.includes('</body>')) {
      return html.replace('</body>', `${liveReloadScript}\n</body>`);
    } else if (html.includes('</html>')) {
      return html.replace('</html>', `${liveReloadScript}\n</html>`);
    } else {
      return html + liveReloadScript;
    }
  }

  // Handle HTTP requests
  handleRequest(req, res) {
    let filePath = req.url === '/' ? '/dev-index.html' : req.url;
    
    // Remove query parameters
    filePath = filePath.split('?')[0];
    
    // Route handling
    if (filePath === '/dev' || filePath === '/development') {
      filePath = '/dev-index.html';
    } else if (filePath === '/prod' || filePath === '/production') {
      filePath = '/utility.html';
    }
    
    const fullPath = path.join(this.distDir, filePath);
    
    // Security check - prevent directory traversal
    if (!fullPath.startsWith(this.distDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    fs.readFile(fullPath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // Handle missing files with appropriate warnings
          if (filePath === '/utility.html') {
            this.serveProductionWarning(res);
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
          }
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal server error');
        }
        return;
      }

      const mimeType = this.getMimeType(fullPath);
      let content = data;

      // Inject live reload script into HTML files (only for development version)
      if (mimeType === 'text/html' && filePath === '/dev-index.html') {
        content = this.injectLiveReload(data.toString());
      }

      res.writeHead(200, { 
        'Content-Type': mimeType,
        'Cache-Control': filePath === '/utility.html' ? 'public, max-age=3600' : 'no-cache, no-store, must-revalidate'
      });
      res.end(content);
    });
  }

  // Serve warning when production build doesn't exist
  serveProductionWarning(res) {
    const warningHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Production Build Not Available</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .warning { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; border-left: 4px solid #dc3545; }
        .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 3px; margin: 10px 5px; }
        .button:hover { background: #0056b3; }
        .command { background: #f8f9fa; padding: 10px; border-radius: 3px; font-family: monospace; margin: 10px 0; border-left: 3px solid #007bff; }
    </style>
</head>
<body>
    <div class="header">
        <h1>WARNING: Production Build Not Available</h1>
        <p>The production build (utility.html) has not been created yet.</p>
    </div>
    
    <div class="warning">
        <h3>How to create a production build:</h3>
        <div class="command">npm run build</div>
        <p>This will create a single-file production build at <code>dist/utility.html</code></p>
    </div>
    
    <h3>Available options:</h3>
    <a href="/dev" class="button">🔧 Development Version (Live Reload)</a>
    <a href="/" class="button">🏠 Server Home</a>
    
    <h3>Build Commands:</h3>
    <ul>
        <li><strong>npm run build</strong> - Create production build</li>
        <li><strong>npm run dev</strong> - Create development build</li>
        <li><strong>npm run dev:live</strong> - Start this live reload server</li>
    </ul>
</body>
</html>`;

    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(warningHtml);
  }

  // Handle WebSocket connections
  setupWebSocket() {
    this.wss = new WebSocketServer({ 
      server: this.server,
      path: '/ws'
    });

    this.wss.on('connection', (ws) => {
      console.log('[LIVE RELOAD] Client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('[LIVE RELOAD] Client disconnected');
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }

  // Notify all clients to reload
  notifyReload() {
    console.log(`[LIVE RELOAD] Notifying ${this.clients.size} client(s) to reload`);
    this.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send('reload');
        } catch (error) {
          console.error('Error sending reload message:', error);
          this.clients.delete(client);
        }
      }
    });
  }

  // Watch source files for changes
  watchFiles() {
    const filesToWatch = [
      path.join(this.srcDir, 'index.html'),
      path.join(this.srcDir, 'base.css'),
      path.join(this.srcDir, 'helper.js'),
      path.join(this.srcDir, 'solaceutil.js')
    ];

    console.log('[WATCH] Monitoring source files for changes...');
    
    // Initialize file timestamps without triggering rebuild
    filesToWatch.forEach(file => {
      try {
        const stats = fs.statSync(file);
        this.watchedFiles.set(file, stats.mtime.getTime());
      } catch (error) {
        // File doesn't exist or can't be accessed
      }
    });
    
    const checkFiles = () => {
      let hasChanges = false;
      
      filesToWatch.forEach(file => {
        try {
          const stats = fs.statSync(file);
          const lastModified = stats.mtime.getTime();
          
          if (this.watchedFiles.has(file) && this.watchedFiles.get(file) !== lastModified) {
            this.watchedFiles.set(file, lastModified);
            hasChanges = true;
            console.log(`[WATCH] File changed: ${path.relative(__dirname, file)}`);
          }
        } catch (error) {
          // File doesn't exist or can't be accessed
        }
      });
      
      if (hasChanges) {
        this.rebuild();
      }
    };
    
    // Check every 500ms for better responsiveness
    setInterval(checkFiles, 500);
  }

  // Rebuild and notify clients
  async rebuild() {
    console.log('\n[BUILD] Rebuilding...');
    
    try {
      // Create development version directly in dev server
      await this.createDevVersion();
      
      // Small delay to ensure files are written
      setTimeout(() => {
        this.notifyReload();
      }, 100);
      
    } catch (error) {
      console.error('[BUILD] Build error:', error);
    }
  }

  // Create development version with separate files
  async createDevVersion() {
    try {
      // Ensure dist directory exists
      if (!fs.existsSync(this.distDir)) {
        fs.mkdirSync(this.distDir, { recursive: true });
      }

      // Copy source files to dist for development
      const sourceFiles = ['index.html', 'base.css', 'helper.js', 'solaceutil.js'];
      
      for (const file of sourceFiles) {
        const srcPath = path.join(this.srcDir, file);
        const destPath = path.join(this.distDir, file);
        
        if (fs.existsSync(srcPath)) {
          const content = fs.readFileSync(srcPath, 'utf8');
          fs.writeFileSync(destPath, content);
        }
      }

      // Create dev-index.html that's the same as index.html but with proper script/css references
      const indexPath = path.join(this.srcDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, 'utf8');
        
        // Update paths to work in the dist directory
        const devIndexContent = indexContent
          .replace('href="base.css"', 'href="base.css"')
          .replace('src="helper.js"', 'src="helper.js"')
          .replace('src="solaceutil.js"', 'src="solaceutil.js"');
        
        fs.writeFileSync(path.join(this.distDir, 'dev-index.html'), devIndexContent);
      }

      // Copy solclient.js if it exists
      const solclientPath = path.join(__dirname, 'solclient.js');
      if (fs.existsSync(solclientPath)) {
        const solclientContent = fs.readFileSync(solclientPath);
        
        // Create js directory
        const jsDir = path.join(this.distDir, 'js');
        if (!fs.existsSync(jsDir)) {
          fs.mkdirSync(jsDir, { recursive: true });
        }
        
        fs.writeFileSync(path.join(this.distDir, 'solclient.js'), solclientContent);
        fs.writeFileSync(path.join(jsDir, 'solclient.js'), solclientContent);
      }

      // Create server index page
      await this.createServerIndex();
      
      console.log('[BUILD] Development build completed');
      
    } catch (error) {
      console.error('[BUILD] Development build failed:', error);
      throw error;
    }
  }

  // Create the server index page
  async createServerIndex() {
    const hasProduction = fs.existsSync(path.join(this.distDir, 'utility.html'));
    const productionWarning = hasProduction ? '' : 
      '<div style="background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 15px; border-radius: 5px; margin: 10px 0;"><strong>WARNING:</strong> Production build not available. Run <code>npm run build</code> to create it.</div>';

    const serverIndexHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Solace Queue Browser - Development Server</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f8f9fa; }
        .header { background: #ffffff; padding: 30px; border-radius: 8px; margin-bottom: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #007bff; }
        .links { display: flex; gap: 20px; margin: 20px 0; }
        .link { padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; transition: all 0.3s; }
        .link.dev { background: #28a745; color: white; }
        .link.dev:hover { background: #218838; transform: translateY(-2px); }
        .link.prod { background: #007bff; color: white; }
        .link.prod:hover { background: #0056b3; transform: translateY(-2px); }
        .link.disabled { background: #6c757d; color: #adb5bd; cursor: not-allowed; }
        .status { margin: 20px 0; }
        .status.available { color: #28a745; }
        .status.unavailable { color: #dc3545; }
        .info { background: #ffffff; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .command { background: #f8f9fa; padding: 10px; border-radius: 3px; font-family: monospace; margin: 10px 0; border-left: 3px solid #007bff; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Solace Queue Browser - Development Server</h1>
        <p><strong>Live Reload Active</strong> - Edit source files to see changes instantly</p>
        <p>Server started: ${new Date().toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})</p>
    </div>
    
    ${productionWarning}
    
    <div class="links">
        <a href="/dev" class="link dev">Development Version (Live Reload)</a>
        <a href="${hasProduction ? '/prod' : '#'}" class="link ${hasProduction ? 'prod' : 'disabled'}">Production Build${hasProduction ? '' : ' (Not Available)'}</a>
    </div>
    
    <div class="info">
        <h3>Version Status:</h3>
        <div class="status available">[OK] <strong>Development Version:</strong> Ready with live reload</div>
        <div class="status ${hasProduction ? 'available' : 'unavailable'}">[${hasProduction ? 'OK' : 'MISSING'}] <strong>Production Build:</strong> ${hasProduction ? 'Available' : 'Not created yet'}</div>
        
        <h3>Available Files:</h3>
        <ul>
            <li><strong>dev-index.html</strong> - Development version with live reload</li>
            <li><strong>base.css, helper.js, solaceutil.js</strong> - Source files (live)</li>
            ${hasProduction ? '<li><strong>utility.html</strong> - Single-file production build</li>' : ''}
            <li><strong>solclient.js</strong> - Solace API files${fs.existsSync(path.join(this.distDir, 'solclient.js')) ? ' [OK]' : ' [MISSING]'}</li>
        </ul>
        
        <h3>Build Commands:</h3>
        <div class="command">npm run dev:live</div>
        <p><strong>Currently running</strong> - Development server with live reload</p>
        
        <div class="command">npm run build</div>
        <p>Create production build (single utility.html file)</p>
        
        <div class="command">npm run dev</div>
        <p>Create development build (separate files, no live reload)</p>
    </div>
    
    <div class="info">
        <h3>Development Features:</h3>
        <ul>
            <li><strong>Live Reload:</strong> Automatic browser refresh on file changes</li>
            <li><strong>File Watching:</strong> Monitors src/ directory every 500ms</li>
            <li><strong>WebSocket Connection:</strong> Real-time communication with browser</li>
            <li><strong>Development Build:</strong> Readable, unminified code</li>
        </ul>
    </div>
</body>
</html>`;

    fs.writeFileSync(path.join(this.distDir, 'index.html'), serverIndexHtml);
  }

  // Start the development server
  async start() {
    // Initial build
    console.log('[SERVER] Starting development server with live reload...');
    
    // Ensure dist directory exists first
    if (!fs.existsSync(this.distDir)) {
      fs.mkdirSync(this.distDir, { recursive: true });
    }
    
    await this.rebuild();

    // Create HTTP server
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    // Setup WebSocket for live reload
    this.setupWebSocket();

    // Start file watching
    this.watchFiles();

    // Start server
    this.server.listen(this.port, () => {
      console.log(`\n[SERVER] Development server running at:`);
      console.log(`   Local:   http://localhost:${this.port}`);
      console.log(`   Network: http://127.0.0.1:${this.port}`);
      console.log('\n[LIVE RELOAD] Enabled - edit source files to see changes automatically');
      console.log('[WATCH] Monitoring: src/index.html, src/base.css, src/helper.js, src/solaceutil.js');
      console.log('\n[SERVER] Press Ctrl+C to stop');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n[SERVER] Shutting down development server...');
      
      let shutdownComplete = false;
      
      // Force exit after 2 seconds if graceful shutdown fails
      setTimeout(() => {
        if (!shutdownComplete) {
          console.log('[SERVER] Force stopping...');
          process.exit(1);
        }
      }, 2000);
      
      try {
        // Close WebSocket server
        if (this.wss) {
          this.wss.close(() => {
            console.log('[SERVER] WebSocket server closed');
          });
        }
        
        // Close HTTP server
        if (this.server) {
          this.server.close(() => {
            console.log('[SERVER] HTTP server closed');
            shutdownComplete = true;
            process.exit(0);
          });
        } else {
          shutdownComplete = true;
          process.exit(0);
        }
      } catch (error) {
        console.error('[SERVER] Error during shutdown:', error);
        process.exit(1);
      }
    });
  }
}

// Start the server if this script is run directly
if (require.main === module) {
  const server = new DevServer();
  server.start().catch(error => {
    console.error('Failed to start development server:', error);
    process.exit(1);
  });
}

module.exports = DevServer;