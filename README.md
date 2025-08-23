# Solace Queue Browser Web Utility

## Overview

> [!TIP]
> Enterprise support is available through Solace Professional Services. Talk to your Solace consultant or sales contact to find out more!

> [!IMPORTANT]
> This is an open-source tool that is not officially supported under Solace Customer Support policy.

The application is intended to be able to run **without a backend application (e.g. web server)**.

Future versions and enhancements will include additional optional features that might require a web server to work.

This version, as compared to other Solace Queue Browsers available, does not require SEMP credentials to work.

Users are expected to know the connection parameters / details.

![Screenshot](images/screenshot.png)

## Pre-requisite

1. Modern Browser (only browsers tested with are listed below)
   - Edge 137+
   - Chrome 137+
   - Firefox 137+
   - Chromium 137+
   - Thorium 130+
2. Solace Javascript API (Browser) v10.18.2

## Installation / Running the App

1. You only need `www/utility.html` from the repository - you can choose to clone the entire repository or only download the `utility.html` file.
2. Download Solace Javascript (Browser) API from [Solace Downloads](https://solace.com/downloads/) or [Solace Products](https://products.solace.com/) (login required).
   - Place `solclient.js` in the same folder as `utility.html` or,
   - Place `solclient.js` in `js` folder which is of the same directory as `utility.html`.
3. Open `utility.html` with a modern browser and you are ready to go.

## Features

1. List messages in Queue
2. View message content
3. Download message content
4. Delete message(s) from Queue
5. Supports Basic and OAuth2 login
6. Supports saving/loading login credentials from local browser storage (excluding password)
7. Limits browsing to 500MB or 1000 messages (whichever hits first) - pagination features will be available in the future.
8. Search / Filter by Message Content

> [!NOTE]
> When connecting to secured (SSL/TLS) endpoints, please ensure the broker server certificate is valid (i.e. CN, SAN, Dates etc. all are correct). Due to limitations of how a browser work, you might not be able to connect to invalid/unvalidated secured endpoints.

## References
- https://docs.solace.com/API/Messaging-APIs/JavaScript-API/js-home.htm
- https://tutorials.solace.dev/javascript/
- https://docs.solace.com/API-Developer-Online-Ref-Documentation/js/index.html
- https://github.com/SolaceSamples/solace-samples-javascript

## Similar tools

| Name | GUI | Backend | Authentication Supported | Features | Comments |
| - | - | - | - | - | - |
| Solace Queue Browser Utility | Browser | None | Basic, Oauth | View, Delete, Filter, Download, Text vs Binary Detection, JSON Pretty Print, Debug mode | - |
| [JMSToolBox](https://docs.solace.com/API/JMSToolBox.htm) | Win Desktop App | None | Basic | View, Delete, Filter, Download, Republish | Requires SEMP Credential |
| [Solace Queue Browser](https://github.com/solacecommunity/solace-queue-browser) | Browser | .Net (Container) | Basic, OAuth, Client Certiticate | View, Filter, Download | - |
| [Chrome Extension](https://github.com/solacecommunity/solace-queue-browser-extension) | Browser | None | Basic | View | Requires SEMP Credentials |
| [Solace Queue Browser GUI](https://github.com/SolaceServices/SolaceQueueBrowserGui) | Java Desktop App | None | Basic | View, Delete, Copy, Move (Drag & Drop) | Requires SEMP |
| [Solace Message Viewer](https://github.com/richard-lawrence/Solace-Message-Viewer) | Browser | None | Basic | View | - |