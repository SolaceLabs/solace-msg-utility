# Solace Queue Browser Utility - Development

This is the refactored development version of the Solace Queue Browser Web Utility, broken down into modular JavaScript files for easier development and maintenance.

## Project Structure

```
.
├── src/                    # Source files
│   ├── index.html         # Main HTML structure
│   ├── base.css           # Application styles
│   ├── helper.js          # Utility functions and helpers
│   └── solaceutil.js      # Main application logic
├── dist/                  # Built output files
│   ├── utility.html       # Single-file production build
│   ├── js/               # Solace API files location
│   └── ...               # Development files and documentation
├── test/                  # Test files
│   └── runner.js         # Simple test runner
├── package.json          # Node.js dependencies and scripts
├── build.js              # Build script
└── README.md             # This file
```

## Quick Start

### Prerequisites

- Node.js 14+ (for build tools)
- Modern web browser (Chrome 137+, Firefox 137+, Edge 137+)
- Solace JavaScript API v10.18.2+

### Installation

1. **Clone/Download the project**
   ```bash
   cd solace-queue-browser-utility
   ```

2. **Install build dependencies** (optional - only for development)
   ```bash
   npm install
   ```

3. **Download Solace JavaScript API**
   - Go to [Solace Downloads](https://solace.com/downloads/)
   - Download "JavaScript (Browser)" API
   - Place `solclient.js` in `dist/js/` folder

### Development

#### Building the Application

**Production build** (single file):
```bash
npm run build
```

**Development build** (separate files for debugging):
```bash
npm run dev
```

**Watch mode** (rebuilds on file changes):
```bash
npm run watch
```

#### Serving the Application

**Development server with live reload** (recommended for development):
```bash
npm run dev:live
# Open http://localhost:8080
# Automatically rebuilds and reloads browser when source files change
```

**Simple HTTP server**:
```bash
npm run serve
# Open http://localhost:8080
```

**Using any web server**:
The built files in `dist/` can be served by any web server.

#### Testing

Run the test suite:
```bash
npm test
```

### File Breakdown

#### `src/index.html`
- Main HTML structure and layout
- References external CSS and JS files for development
- Contains all UI elements and SVG icons

#### `src/base.css`
- Complete application styling
- CSS custom properties for Solace branding
- Responsive layout and component styles

#### `src/helper.js`
- Utility functions for DOM manipulation
- Validation helpers
- Storage helpers (localStorage)
- Event handling utilities
- Performance helpers (debounce, throttle)

#### `src/solaceutil.js`
- Main `SolaceWebUtility` object
- Client session management
- UI event handlers and DOM manipulation
- Solace API integration
- Message processing and display logic

## Development Guidelines

### Code Organization

The codebase follows a modular structure:

1. **Helper Functions** (`helper.js`)
   - Generic utilities that can be reused
   - No dependencies on Solace API or application state
   - Pure functions where possible

2. **Main Application** (`solaceutil.js`)
   - Application-specific logic
   - Solace API integration
   - UI state management

3. **Styles** (`base.css`)
   - Component-based CSS organization
   - CSS custom properties for theming
   - Responsive design patterns

### Adding New Features

1. **UI Components**: Add HTML structure to `index.html`
2. **Styling**: Add styles to `base.css` following existing patterns
3. **Logic**: Add JavaScript to appropriate section in `solaceutil.js`
4. **Utilities**: Add reusable functions to `helper.js`

### Build Process

The build script (`build.js`) performs:

1. **File combination**: Merges all source files into single HTML
2. **Minification**: Removes comments and extra whitespace (production only)
3. **Inlining**: Embeds CSS and JavaScript directly in HTML
4. **Asset copying**: Copies documentation and creates necessary folders

### Testing

The test suite (`test/runner.js`) includes:

- **Helper function tests**: Validates utility functions
- **Build output validation**: Ensures proper file generation
- **File structure checks**: Verifies all required files exist

Add new tests by extending the test runner with additional test methods.

## API Integration

### Solace JavaScript API

The application expects the Solace JavaScript API file (`solclient.js`) to be available at:
1. `js/solclient.js` (recommended)
2. `solclient.js` (fallback in same directory)

### Dynamic Loading

The application uses a dynamic loading system (`SolaceWebUtility.dyLoad`) that:
- Attempts to load Solace API from multiple locations
- Provides fallback mechanisms
- Handles loading failures gracefully

## Browser Compatibility

### Supported Browsers
- Chrome/Chromium 137+
- Firefox 137+
- Edge 137+
- Safari (modern versions)

### Required Features
- ES6+ JavaScript features
- WebSocket support
- localStorage
- Modern CSS features (CSS Grid, Flexbox)

## Debugging

### Debug Modes

Enable debug mode via URL parameters:
- `?debug=1` or `?debug=console` - Console logging
- `?debug=2` or `?debug=display` - UI debug panel

### Development Tools

1. **Browser DevTools**: Use for debugging JavaScript and CSS
2. **Network Tab**: Monitor WebSocket connections and API calls
3. **Console**: Check for JavaScript errors and debug logs
4. **Application Tab**: Inspect localStorage for saved settings

### Common Issues

1. **Solace API not loading**
   - Verify `solclient.js` is in correct location
   - Check browser console for loading errors
   - Ensure file path in `dyLoad.filesToLoad.solaceAPI` is correct

2. **Connection failures**
   - Verify broker URL format (wss:// for secure connections)
   - Check broker certificate validity for SSL/TLS
   - Verify VPN name and credentials

3. **Build issues**
   - Ensure all source files exist
   - Check file permissions
   - Verify Node.js version compatibility

## Performance Considerations

### Message Limits
- Maximum 1000 messages or 500MB total size
- Pagination for large message sets
- Automatic browsing pause when limits reached

### Memory Management
- Messages stored in memory during session
- Automatic cleanup on disconnect
- Large message truncation for display

### Browser Limitations
- WebSocket connection limits
- localStorage size restrictions
- Certificate validation requirements

## Contributing

### Code Style
- Use existing code patterns and naming conventions
- Add comments for complex logic
- Follow JavaScript best practices
- Maintain CSS organization structure

### Before Submitting
1. Run tests: `npm test`
2. Build production version: `npm run build`
3. Test in multiple browsers
4. Verify no console errors

## Troubleshooting

### Build Problems
```bash
# Clean and rebuild
npm run clean
npm run build
```

### Test Failures
```bash
# Run tests with verbose output
node test/runner.js
```

### File Permissions
```bash
# Make build script executable
chmod +x build.js
```

## License

This project follows the same license as the original Solace Queue Browser Utility. See LICENSE file for details.

## Related Documentation

- [Original Utility README](solace-queue-browser-utility/README.md)
- [Solace JavaScript API Documentation](https://docs.solace.com/API/Messaging-APIs/JavaScript-API/js-home.htm)
- [Claude Code Integration](CLAUDE.md)