# Solace Queue Browser Utility - Packaging Guide

This document provides instructions for packaging and distributing the Solace Queue Browser Utility.

## Overview

The Solace Queue Browser Utility can be packaged in multiple ways to suit different deployment scenarios:

1. **Single File Distribution** - Complete application in one HTML file
2. **Development Package** - Separate files for development and debugging
3. **Docker Container** - Containerized web server with the application
4. **CDN Distribution** - Hosted version for direct linking

## Prerequisites

- Node.js 14+ (for build process)
- Git (for version control)
- Docker (optional, for containerized distribution)

## Quick Packaging

### 1. Production Build (Recommended)

Create a single-file distribution:

```bash
# Clean build
npm run clean
npm run build

# Output: dist/utility.html (single file with everything embedded)
```

### 2. Development Build

Create separate files for development:

```bash
npm run dev

# Output: 
# - dist/utility.html (production build)
# - dist/index.html (development entry point)
# - dist/base.css (stylesheet)
# - dist/helper.js (utility functions)
# - dist/solaceutil.js (main application)
```

## Distribution Methods

### Method 1: Single File Distribution

**Best for**: Simple deployment, email distribution, air-gapped environments

```bash
# Build production version
npm run build

# Package just the single file
cp dist/utility.html solace-queue-browser-v1.2.0.html
```

**Distribution package contains:**
- `solace-queue-browser-v1.2.0.html` - Complete application
- Instructions for downloading Solace JavaScript API

**Deployment:**
1. Download `solclient.js` from Solace
2. Place both files in same directory
3. Open HTML file in browser

### Method 2: Complete Package

**Best for**: Development teams, customization, enterprise deployment

```bash
# Create complete package
npm run build
npm run dev

# Package everything
tar -czf solace-queue-browser-v1.2.0-complete.tar.gz dist/ docs/ README.md LICENSE
```

**Distribution package contains:**
- `dist/utility.html` - Production single-file version
- `dist/index.html` - Development entry point
- `dist/base.css` - Stylesheet
- `dist/helper.js` - Utility functions  
- `dist/solaceutil.js` - Main application
- `dist/js/README.md` - Instructions for Solace API
- Documentation files

### Method 3: Docker Container

**Best for**: Microservices, cloud deployment, scalable hosting

```dockerfile
# Create Dockerfile
FROM nginx:alpine

# Copy built files
COPY dist/ /usr/share/nginx/html/

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1
```

```bash
# Build container
docker build -t solace-queue-browser:v1.2.0 .

# Run container
docker run -d -p 8080:80 solace-queue-browser:v1.2.0
```

### Method 4: ZIP Archive

**Best for**: GitHub releases, direct download

```bash
# Create release archive
npm run build
cd dist
zip -r ../solace-queue-browser-v1.2.0.zip .
cd ..
```

## Automated Packaging Scripts

### `package.sh` - Complete Packaging Script

```bash
#!/bin/bash

# Solace Queue Browser Utility - Packaging Script
# Usage: ./package.sh [version]

VERSION=${1:-"1.2.0"}
PACKAGE_NAME="solace-queue-browser-v${VERSION}"

echo "📦 Packaging Solace Queue Browser Utility v${VERSION}"

# Clean and build
echo "🧹 Cleaning..."
npm run clean

echo "🏗️ Building production version..."
npm run build

echo "🏗️ Building development version..."
npm run dev

# Create package directory
PACKAGE_DIR="packages/${PACKAGE_NAME}"
mkdir -p $PACKAGE_DIR

# Copy built files
echo "📁 Copying files..."
cp -r dist/* $PACKAGE_DIR/
cp README.md $PACKAGE_DIR/
cp PACKAGING.md $PACKAGE_DIR/
cp LICENSE $PACKAGE_DIR/
cp CLAUDE.md $PACKAGE_DIR/

# Create archives
echo "📦 Creating archives..."

# Single file package
cp dist/utility.html "packages/${PACKAGE_NAME}-single.html"

# Complete ZIP package
cd packages
zip -r "${PACKAGE_NAME}-complete.zip" "${PACKAGE_NAME}/"
tar -czf "${PACKAGE_NAME}-complete.tar.gz" "${PACKAGE_NAME}/"
cd ..

echo "✅ Packaging complete!"
echo "📦 Packages created:"
echo "   - packages/${PACKAGE_NAME}-single.html (single file)"
echo "   - packages/${PACKAGE_NAME}-complete.zip (complete package)"
echo "   - packages/${PACKAGE_NAME}-complete.tar.gz (complete package)"
```

### `release.sh` - GitHub Release Script

```bash
#!/bin/bash

# Create GitHub release with packages
VERSION=${1:-"1.2.0"}

# Package everything
./package.sh $VERSION

# Create GitHub release (requires gh CLI)
gh release create "v${VERSION}" \
  "packages/solace-queue-browser-v${VERSION}-single.html" \
  "packages/solace-queue-browser-v${VERSION}-complete.zip" \
  "packages/solace-queue-browser-v${VERSION}-complete.tar.gz" \
  --title "Solace Queue Browser Utility v${VERSION}" \
  --notes-file CHANGELOG.md
```

## Build Configuration

### Production Optimizations

The build process applies these optimizations for production:

1. **CSS Minification**
   - Removes comments and extra whitespace
   - Optimizes selectors and properties

2. **JavaScript Minification**
   - Removes comments (preserving URLs)
   - Compresses whitespace
   - Optimizes operators

3. **Asset Inlining**
   - Embeds CSS directly in HTML
   - Embeds JavaScript directly in HTML
   - Eliminates external dependencies (except Solace API)

### Custom Build Configuration

Modify `build.js` to customize the build process:

```javascript
// Disable minification
const builder = new SimpleBuild();
builder.isDev = true; // Keep readable formatting

// Add custom files to copy
builder.copyFiles = function() {
  // Custom file copying logic
};
```

## Quality Assurance

### Pre-Package Testing

Always run tests before packaging:

```bash
# Run test suite
npm test

# Test both development and production builds
npm run dev
npm run build
npm run serve
# Manual testing in browser
```

### Cross-Browser Testing

Test packages in all supported browsers:
- Chrome 137+
- Firefox 137+
- Edge 137+
- Safari (latest)

### File Integrity

Verify package integrity:

```bash
# Check file sizes
ls -la dist/

# Verify HTML structure
grep -c "SolaceWebUtility" dist/utility.html

# Check for required components
grep -c "<!DOCTYPE html>" dist/utility.html
grep -c "<style>" dist/utility.html
grep -c "<script>" dist/utility.html
```

## Deployment Instructions

### For End Users

Include these instructions with packages:

1. **Download Solace JavaScript API**
   - Visit: https://solace.com/downloads/
   - Download "JavaScript (Browser)" API
   - Extract `solclient.js`

2. **Simple Deployment**
   - Place `utility.html` and `solclient.js` in same folder
   - Open `utility.html` in web browser

3. **Web Server Deployment**
   - Upload files to web server
   - Ensure MIME types are configured correctly
   - Access via HTTP/HTTPS URL

### For Developers

1. **Development Setup**
   - Extract complete package
   - Install Node.js dependencies: `npm install`
   - Run development server: `npm run serve`

2. **Customization**
   - Modify source files in `src/` directory
   - Rebuild: `npm run build`
   - Test changes: `npm test`

## Version Management

### Semantic Versioning

Follow semantic versioning (semver):
- `MAJOR.MINOR.PATCH`
- Major: Breaking changes
- Minor: New features, backward compatible
- Patch: Bug fixes, backward compatible

### Version Updates

Update version in multiple locations:

1. `package.json` - `version` field
2. `src/solaceutil.js` - `SolaceWebUtility.version`
3. `README.md` - Documentation references
4. Build output includes version in comments

### Change Management

Maintain changelog for releases:

```markdown
# Changelog

## [1.2.0] - 2025-01-20
### Added
- Modular file structure
- Helper utility functions
- Automated build process
- Test suite

### Changed
- Refactored monolithic structure
- Improved code organization

### Fixed
- Various bug fixes and improvements
```

## Distribution Channels

### GitHub Releases

1. Create release tags: `git tag v1.2.0`
2. Push tags: `git push --tags`
3. Create GitHub release with packages
4. Include release notes and installation instructions

### Direct Download

Host packages on web server:
- Single file: Direct download link
- Complete package: ZIP/TAR downloads
- Documentation: Online docs

### CDN Distribution

For public CDN hosting:

```html
<!-- Example CDN usage -->
<script src="https://cdn.example.com/solace-queue-browser/v1.2.0/utility.html"></script>
```

### Docker Hub

For containerized distribution:

```bash
# Build and tag
docker build -t username/solace-queue-browser:v1.2.0 .
docker tag username/solace-queue-browser:v1.2.0 username/solace-queue-browser:latest

# Push to registry
docker push username/solace-queue-browser:v1.2.0
docker push username/solace-queue-browser:latest
```

## Security Considerations

### Package Integrity

1. **Checksums**: Provide SHA256 checksums for packages
2. **Signatures**: Sign packages for verification
3. **Vulnerability Scanning**: Regular security scans

### Content Security

1. **No External Dependencies**: Except Solace API
2. **No CDN Dependencies**: Self-contained packages
3. **Local Storage**: Only connection parameters (no secrets)

### Distribution Security

1. **HTTPS Only**: Secure download channels
2. **Verification**: Provide verification instructions
3. **Source Code**: Always available for audit

## Troubleshooting Packaging Issues

### Common Build Problems

1. **Missing Source Files**
   ```bash
   # Verify all source files exist
   ls -la src/
   ```

2. **Permission Issues**
   ```bash
   # Fix permissions
   chmod +x build.js
   chmod +x package.sh
   ```

3. **Node.js Version**
   ```bash
   # Check Node.js version
   node --version  # Should be 14+
   ```

### Package Validation

1. **File Size Check**
   ```bash
   # Single file should be reasonable size
   ls -lh dist/utility.html
   ```

2. **Content Verification**
   ```bash
   # Check for required content
   grep -c "SolaceWebUtility" dist/utility.html
   ```

3. **Browser Testing**
   - Test in clean browser profile
   - Verify no console errors
   - Check all functionality works

## Automation

### CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Package and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  package:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: ./package.sh ${GITHUB_REF#refs/tags/v}
      
      - name: Create Release
        uses: actions/create-release@v1
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          draft: false
          prerelease: false
```

This packaging guide ensures consistent, reliable distribution of the Solace Queue Browser Utility across different deployment scenarios.