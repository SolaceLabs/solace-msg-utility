// App static info
const SolaceWebUtility = {
  debugMode: 0,
  version: "1.2.0",
  date: new Date(2025, 7, 1),
  solApiLoaded: false,
  isHosted: window.location.protocol.startsWith("http"),
  limits: {
    maxTotalMsgSize: 524288000,
    maxTotalMsges: 1000,
    maxDispMsgSize: 1048576,
  },
  deleteMessageBug: {
    exists: true,
    qbDisconnectTime: 10000,
  },
  determineDebugMode: function() {
    let debugParm = (new URLSearchParams(window.location.search)).get("debug");
    if (typeof debugParm === 'string' || debugParm instanceof String) debugParm = debugParm.toUpperCase();
    switch (debugParm) {
      case 1:
      case "1":
      case "CONSOLE":
        SolaceWebUtility.debugMode = 1;
        break;
      case 2:
      case "2":
      case "DISPLAY":
        SolaceWebUtility.debugMode = 2;
        break;
    };
  },
    
///////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////// Client Session related objects and functions. //////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
  clientSession: {
    session: null,
    queueBrowser: null,
    queuedMessages: {},
    queuedMessageSize: 0,
    lastSessionEvent: null,
    clientSessionConnected: false,
    createQueueBrowser: false,
    queueBrowserPaused: false,
    queueConsumable: false,
    queueBindingParameters: {
      connectAttempts: 1,
      connectTimeoutInMsecs: 10000,
      transportAcknowledgeThresholdPercentage: 1,
      transportAcknowledgeTimeoutInMsecs: 50,
      windowSize: 255, // 1-255
    },
    sessionConnectionParameters: {
      connectRetries: 0,
      connectRetriesPerHost: 0,
      includeSenderId: true,
      reconnectRetries: 0,
      reconnectRetryWaitInMsecs: 0,
    },
    
    // clientSession: Session Event Handler
    handleClientSessionEvent: async function(eventCode, passedObj) {
      if (SolaceWebUtility.debugMode)
        SolaceWebUtility.clientSession.lastSessionEvent = passedObj;
      switch(eventCode) {
        case solace.SessionEventCode.ACKNOWLEDGED_MESSAGE:
          SolaceWebUtility.log("Session Event", `ACK MSG (${eventCode}) : ${passedObj.infoStr}` );
          break;
        
        case solace.SessionEventCode.CONNECT_FAILED_ERROR:
          SolaceWebUtility.log("Session Event", `Connect Failed (${eventCode}) : ${passedObj}` );
          SolaceWebUtility.ui.showPopup(`${passedObj.infoStr}`, 1500, "error");
          SolaceWebUtility.clientSession.attemptDisconnectSession();
          break;
        
        case solace.SessionEventCode.DISCONNECTED:
          SolaceWebUtility.log("Session Event", "Disconnected.");
          SolaceWebUtility.clientSession.disconnected();
          SolaceWebUtility.ui.clientConnect.showDisconnected();
          break;
        
        case solace.SessionEventCode.DOWN_ERROR:
          SolaceWebUtility.log("Session Event", `Disconnected with error: ${passedObj}`);
          SolaceWebUtility.clientSession.disconnected();
          SolaceWebUtility.ui.clientConnect.showDisconnected();
          break;
        
        case solace.SessionEventCode.UP_NOTICE:
          SolaceWebUtility.log("Session Event", "Connected.");
          //SolaceWebUtility.clientSession.attemptDisconnectSession();
          if (SolaceWebUtility.clientSession.createQueueBrowser) {
            SolaceWebUtility.clientSession.attemptBindQueue();
          }
          break;
          
        default:
          SolaceWebUtility.log("Session Event", `UNHANDLED (${eventCode})`);
          break;
      }
    },
    
    // clientSession: Queue Browser Event Handler
    handleQueueBrowserEvent: function(eventName, passedObj) {
    // CONNECT_FAILED_ERROR DISPOSED DOWN DOWN_ERROR GM_DISABLED MESSAGE UP
      if (SolaceWebUtility.debugMode)
        SolaceWebUtility.clientSession.lastSessionEvent = passedObj;
      switch(eventName) {
        case solace.QueueBrowserEventName.CONNECT_FAILED_ERROR:
          SolaceWebUtility.log("QBrowser Event", `Unable to browse queue: ${passedObj}`);
          SolaceWebUtility.clientSession.attemptDisconnectSession();
          SolaceWebUtility.ui.showPopup(`${passedObj.message}`, 1500, "error");
          break;
        case solace.QueueBrowserEventName.DISPOSED:
          SolaceWebUtility.log("QBrowser Event", "Disposed.");
          SolaceWebUtility.clientSession.attemptDisconnectSession();
          break;
        case solace.QueueBrowserEventName.DOWN:
          SolaceWebUtility.log("QBrowser Event", "Queue disconnected.");
          SolaceWebUtility.clientSession.attemptDisconnectSession();
          break;
        case solace.QueueBrowserEventName.DOWN_ERROR:
          SolaceWebUtility.log("QBrowser Event", `Queue Disconnected remotely: ${passedObj}`);
          SolaceWebUtility.clientSession.attemptDisconnectSession();
          break;
        case solace.QueueBrowserEventName.GM_DISABLED:
          SolaceWebUtility.log("QBrowser Event", "Session cannot perform Guaranteed Messaging.");
          SolaceWebUtility.clientSession.attemptDisconnectSession();
          break;
        case solace.QueueBrowserEventName.UP:
          SolaceWebUtility.log("QBrowser Event", "Queue connected.");
          if (SolaceWebUtility.clientSession.queueBrowser._messageConsumer.permissions == solace.QueuePermissions.READ_ONLY) {
            SolaceWebUtility.ui.showPopup("Read-only queue. You cannot remove messages.", 3000, "warn");
            SolaceWebUtility.clientSession.queueConsumable = false;
          } else {
            SolaceWebUtility.clientSession.queueConsumable = true;
          }
          SolaceWebUtility.clientSession.connected();
          SolaceWebUtility.ui.clientConnect.showConnected();
          break;
        case solace.QueueBrowserEventName.MESSAGE:
          // add addition SWU specific fields for easier referencing
          passedObj.SWU = {
            gMsgId: passedObj.getGuaranteedMessageId().toString(),
            contentWithHtmlTags: false,
            isText: true,
            isLargeMsg: false,
            content: null,
            displayContent: null,
          };
          if (passedObj.getType() == 0) { // text content
            if (typeof passedObj.getXmlContent() !== "undefined")
              passedObj.SWU.content = passedObj.getXmlContent();
            else if (typeof passedObj.getBinaryAttachment() !== "undefined") {
              passedObj.SWU.content = passedObj.getBinaryAttachment();
              let firstChar = passedObj.SWU.content.charCodeAt(0);
              if (![9, 10, 13].includes(firstChar) && (firstChar < 32 || firstChar > 126)) {
                passedObj.SWU.isText = false;
              }
            }
            else
              passedObj.SWU.content = "-blank or undetermined-";
          } else if (passedObj.getType() == 3)
            passedObj.SWU.content = passedObj.getSdtContainer().getValue();
          else
            passedObj.SWU.content = "-blank or undetermined-";
          passedObj.SWU.estMsgSize = passedObj.SWU.content.length; // size based on text content
          try {
            passedObj.SWU.displayContent = SolaceWebUtility.commFuncs.prettyJSON(passedObj.SWU.content);
            passedObj.SWU.contentWithHtmlTags = true;
          } catch (err) {
            passedObj.SWU.displayContent = passedObj.SWU.content;
            if (passedObj.SWU.estMsgSize > SolaceWebUtility.limits.maxDispMsgSize) {
              passedObj.SWU.displayContent = "-Message is too large to be displayed-";
              passedObj.SWU.isLargeMsg = true;
            } else if (!passedObj.SWU.isText) {
              passedObj.SWU.displayContent = '-Unsupported binary non-text data-';
            }
          }
          SolaceWebUtility.clientSession.queuedMessages[passedObj.SWU.gMsgId] = passedObj; // store object in SWU object
          SolaceWebUtility.ui.updateDownloadedCount();
          SolaceWebUtility.clientSession.queuedMessageSize += passedObj.SWU.estMsgSize;
          SolaceWebUtility.ui.addMessage(passedObj);
          // condition to pause queue browsing
          if (SolaceWebUtility.clientSession.queuedMessageSize >= SolaceWebUtility.limits.maxTotalMsgSize || document.getElementById("msgCount").textContent >= SolaceWebUtility.limits.maxTotalMsges)
            SolaceWebUtility.clientSession.attemptPauseQueue();
          
          break;
        default:
          SolaceWebUtility.log("QBrowser Event", `UNHANDLED (${solace.QueueBrowserEventName.nameOf(eventName)})`);
          break;
      }
    },
    
    // clientSession: fire and forget create queue browser function. updates and handling are all inside event handler
    attemptBindQueue: function() {
      SolaceWebUtility.log("QBrowser Event", "Binding queue...");
      SolaceWebUtility.clientSession.createQueueBrowser = false;
      try {
        SolaceWebUtility.clientSession.queueBrowser = SolaceWebUtility.clientSession.session.createQueueBrowser({
          ...SolaceWebUtility.clientSession.queueBindingParameters,
          queueDescriptor: {
            name: document.getElementById("clientQueue").value,
            type: solace.QueueType.QUEUE,
          },
        });
        
        // map handleQueueBrowserEvent() to all Queue Browser Events
        for (let evt of solace.QueueBrowserEventName.values) {
          SolaceWebUtility.clientSession.queueBrowser.on(evt, (solObj) => { SolaceWebUtility.clientSession.handleQueueBrowserEvent(evt, solObj); });
        }
        
        // trying to bind
        SolaceWebUtility.clientSession.queueBrowser.connect();
      } catch (err) {
          SolaceWebUtility.log("QBrowser Event", err);
          SolaceWebUtility.clientSession.attemptDisconnectSession();
      }
    },
    
    // clientSession: fire and forget disconnect queue browser function. updates and handling are all inside event handler
    attemptUnbindQueue: function() {
      try {
        SolaceWebUtility.log("QBrowser Event", "Unbinding queue...");
        if (SolaceWebUtility.clientSession.queueBrowser != null) 
          SolaceWebUtility.clientSession.queueBrowser.disconnect();
      } catch (err) {
        SolaceWebUtility.log("QBrowser Event", "Already disconnected.");
      } finally {
        SolaceWebUtility.clientSession.attemptDisconnectSession();
      }
     },
    // clientSession: fire and forget connect function. updates and handling are all inside event handler
    attemptConnectSession: function() {
      SolaceWebUtility.log("Session Event", "Connecting...");
      try {
        SolaceWebUtility.clientSession.createQueueBrowser = true;
        let authType = document.getElementById("clientAuthType").value;
        if (solace.AuthenticationScheme[authType] == solace.AuthenticationScheme.BASIC) {
          SolaceWebUtility.clientSession.session = solace.SolclientFactory.createSession({
            url:		document.getElementById("clientHost").value,
            vpnName:	document.getElementById("clientVpn").value,
            userName:	document.getElementById("clientUser").value,
            password:	document.getElementById("clientPass").value,
            ...SolaceWebUtility.clientSession.sessionConnectionParameters,
          });
        } else if (solace.AuthenticationScheme[authType] == solace.AuthenticationScheme.OAUTH2) {
          SolaceWebUtility.clientSession.session = solace.SolclientFactory.createSession({
            authenticationScheme:   solace.AuthenticationScheme.OAUTH2,
            url:            		document.getElementById("clientHost").value,
            vpnName:	            document.getElementById("clientVpn").value,
            accessToken:	        document.getElementById("clientAccessToken").value,
            idToken:            	document.getElementById("clientIdentityToken").value,
            ...SolaceWebUtility.clientSession.sessionConnectionParameters,
          });
        }
        
        // map handleClientSessionEvent() to all Session Events
        for (let evt of solace.SessionEventCode.values) {
          SolaceWebUtility.clientSession.session.on(evt, (solObj) => { SolaceWebUtility.clientSession.handleClientSessionEvent(evt, solObj); });
        }
        
        // trying to connect
        SolaceWebUtility.clientSession.session.connect();
        
      } catch (err) {
        SolaceWebUtility.log("Session Event", err);
      }
    },

    // clientSession: fire and forget session disconnect function. updates and handling are all inside event handler
    attemptDisconnectSession: function() {
      SolaceWebUtility.log("Session Event", "Disconnecting...");
      try {
        if (SolaceWebUtility.clientSession.session != null)
          SolaceWebUtility.clientSession.session.disconnect();
      } catch (err) {
        SolaceWebUtility.log("Session Event", "Already disconnected.");
        SolaceWebUtility.log("Session Event", err);
      } finally {
        SolaceWebUtility.clientSession.attemptDisposeSession();
      }
    },
    
    // clientSession: session dispose function. cleans up everything.
    attemptDisposeSession: function() {
      if (SolaceWebUtility.clientSession.session != null) {
        SolaceWebUtility.log("Session Event", "Disposing...");
        SolaceWebUtility.clientSession.disconnected();
      } else {
        SolaceWebUtility.log("Session Event", "Session seems to be already disposed.");
      }
      SolaceWebUtility.ui.clientConnect.showDisconnected();
    },
    
    // clientSession: pause queue browsing
    attemptPauseQueue: function() {
      try {
        SolaceWebUtility.log("QBrowser Event", "Pausing queue due to configured resource limits");
        SolaceWebUtility.clientSession.queueBrowser.stop();
        SolaceWebUtility.clientSession.queueBrowserPaused = true;
        document.getElementById("clientConnectStatus").innerHTML = SolaceWebUtility.ui.svg.pausSVG;
      } catch (err) {
        SolaceWebUtility.log("QBrowser Event", "Session seems to be already disconnected");
      }
    },
    
    // clientSession: resume queue browsing
    attemptResumeQueue: function() {
      try {
        SolaceWebUtility.log("QBrowser Event", "Resuming queue...");
        SolaceWebUtility.clientSession.queueBrowser.start();
      } catch (err) {
        SolaceWebUtility.log("QBrowser Event", "Session seems to be already disconnected/disposed");
      }
    },
    
    // clientSession: function to perform after connected
    connected: function() {
      SolaceWebUtility.clientSession.clientSessionConnected = true;
      SolaceWebUtility.clientSession.queuedMessages = {};
      SolaceWebUtility.clientSession.queuedMessageSize = 0;
      SolaceWebUtility.clientSession.createQueueBrowser = false;
    },
    
    // clientSession: function to perform after disconnection/disposed
    disconnected: function() {
      if (SolaceWebUtility.clientSession.session != null)
        SolaceWebUtility.clientSession.session.dispose();
      SolaceWebUtility.clientSession.session = null;
      SolaceWebUtility.clientSession.queueBrowser = null;
      SolaceWebUtility.clientSession.queuedMessages = {};
      SolaceWebUtility.clientSession.queuedMessageSize = 0;
      SolaceWebUtility.clientSession.clientSessionConnected = false;
      SolaceWebUtility.clientSession.createQueueBrowser = false;
      SolaceWebUtility.clientSession.queueConsumable = false;
      
    },
    // clientSession: function to remove message from queue and also current stored session/objects
    removeMessage: function(solMsg) {
    /*
      NOTE: Solace JS API does NOT provide any ACKNOWLEDGEMENT to "QueueBrowser.removeMessageFromQueue" function - as of 23rd June 2025
            > If there is an update to the Solace JS API, the corresponding event handler should be updated to provide feedback to user action.
            
      IMPORTANT: There is a bug when executing removeMessageFromQueue() - it is observed that you will not be able to remove the message that is right before (in terms of sequence) the last message removed. For example, message id 10 cannot be removed after message id 11 is removed, but message id 9 would work.
      As a result, a new queue browser object is created to execute removeMessageFromQueue() in sequence every time a user wants to remove the message (single and bulk).
    */
      SolaceWebUtility.log("Remove Msg", `Removing ${solMsg.SWU.gMsgId}`);
      if (SolaceWebUtility.deleteMessageBug.exists) { // logic to work around removeMessageFromQueue bug where Solace API is unable to removeMessageFromQueue for the message that is immediately before the message that was removeMessageFromQueue before.
        let tmpQueueBrowser = null, tmpQueueBrowserTimer = null;
        tmpQueueBrowser = SolaceWebUtility.clientSession.session.createQueueBrowser({
          ...SolaceWebUtility.clientSession.queueBindingParameters,
          queueDescriptor: {
            name: document.getElementById("clientQueue").value,
            type: solace.QueueType.QUEUE,
          },        
        });
        tmpQueueBrowser.on(solace.QueueBrowserEventName.CONNECT_FAILED_ERROR, function(opErr) {
          SolaceWebUtility.ui.showPopup(`Unable to bind queue again to delete Message Id ${solMsg.SWU.gMsgId}.`, 3000, "error");
          //tmpQueueBrowser = null;
          SolaceWebUtility.log("QBrowser Event", opErr);
          throw new Error(`Unable to delete Message Id ${solMsg.SWU.gMsgId}.`);
        });
        tmpQueueBrowser.on(solace.QueueBrowserEventName.MESSAGE, function(msg) {
          if (msg.getGuaranteedMessageId().toString() == solMsg.SWU.gMsgId) {
            tmpQueueBrowser.removeMessageFromQueue(solMsg);
            if (typeof solMsg.SWU.domId !== "undefined")
              SolaceWebUtility.ui.removeMessage(solMsg.SWU.gMsgId);
            tmpQueueBrowser.disconnect();
            clearTimeout(tmpQueueBrowserTimer);
            SolaceWebUtility.clientSession.queuedMessageSize -= solMsg.SWU.estMsgSize;
            delete SolaceWebUtility.clientSession.queuedMessages[solMsg.SWU.gMsgId];
            SolaceWebUtility.ui.updateDownloadedCount();
          } else {
            clearTimeout(tmpQueueBrowserTimer);
            tmpQueueBrowserTimer = setTimeout(function() {
              SolaceWebUtility.ui.showPopup(`Message Id ${solMsg.SWU.gMsgId} might no longer be in the queue.`);
              tmpQueueBrowser.disconnect();
            }, SolaceWebUtility.deleteMessageBug.qbDisconnectTime);
          }
        });
        try {
          tmpQueueBrowser.connect();
        } catch (err) {
          // do nothing as GM unsupported scenario will never happen at this junction because queue is already connected
        }
      } else {
        SolaceWebUtility.clientSession.queueBrowser.removeMessageFromQueue(solMsg);
        if (typeof solMsg.SWU.domId !== "undefined")
          SolaceWebUtility.ui.removeMessage(solMsg.SWU.gMsgId);
        SolaceWebUtility.clientSession.queuedMessageSize -= solMsg.SWU.estMsgSize;
        delete SolaceWebUtility.clientSession.queuedMessages[solMsg.SWU.gMsgId];
        SolaceWebUtility.ui.updateDownloadedCount();
      }
    },
    
    /*
     clientSession: IFRAME Work around for client certificate authentication. Extracted this from Try Me!
     This is required when the Solace Broker VPN has client certificate authentication and SSL/TLS enabled.
     Chrome-based browsers are unable to prompt user to pick a certificate for authentication which then causes the session connection to fail.
    */
    clientCertWorkAround: async function() {
      const url = document.getElementById("clientHost").value.toLowerCase();
      if (
        /chrom(e|ium)/.test(navigator.userAgent.toLowerCase()) &&
        url.startsWith("wss://")
      ) {
        const iFrame = document.createElement("iframe");
        iFrame.src = url.replace("wss://", "https://");
        iFrame.style.display = "none";
        const loadProm = new Promise((resolve) => {
          iFrame.onload = resolve;
        });
        document.body.appendChild(iFrame);
        await loadProm;
        setTimeout(() => { iFrame.remove()}, 1000 );
      }
    },
  }
};
///////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////// UI related functions, variables, objects, etc //////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
SolaceWebUtility.ui = {

  svg: {
    connSVG: `<title>Connected</title><path fill="var(--sol-mid-green)" d="M1090,140 l-126,124 -40,-20 c-24,-13 -67,-23 -106,-26 -57,-4 -75,-1 -123,21 -31,15 -83,51 -115,81 l-58,56 -28,-30 c-43,-44 -95,-36 -95,15 0,28 507,535 536,535 50,0 58,-52 14,-95 l-30,-28 56,-58 c30,-32 66,-84 81,-115 22,-48 25,-66 21,-123 -3,-39 -14,-83 -26,-107 l-21,-41 115,-114 c64,-63 120,-122 125,-132 13,-22 -13,-67 -38,-67 -9,0 -73,56 -142,124z"/>  <path fill="var(--sol-mid-green)" d="M330,420 c-20,20 -13,53 18,83 l30,28 -56,58 c-30,32 -66,84 -81,115 -22,48 -25,66 -21,123 3,39 14,83 26,107 l21,41 -115,114 c-64,63 -120,122 -125,132 -13,22 13,67 38,67 9,0 73,-56 142,-124 l126,-124 40,20 c24,13 67,23 106,26 57,4 75,1 123,-21 31,-15 83,-51 115,-81 l58,-56 28,30 c43,44 95,36 95,-15 0,-28 -507,-535 -536,-535 -11,0 -25,5 -32,12z"/>`,
    dscnSVG: `<title>Disconnected</title><path fill="#D00000" d="M1140,100 l-53,50 -43,-21 c-107,-55 -226,-30 -332,70 l-62,58 -33,-29 c-49,-44 -92,-35 -92,21 0,18 18,43 60,85 l60,59 -85,86 c-86,86 -102,119 -73,148 25,25 53,10 140,-75 l89,-87 61,62 62,61 -87,89 c-48,49 -87,95 -87,101 0,28 22,51 48,51 21,0 47,-20 112,-85 l84,-84 67,64 c37,36 71,65 76,65 19,0 53,-32 53,-50 0,-11 -13,-34 -29,-52 l-29,-33 58,-62 c100,-106 125,-225 70,-332 l-21,-43 50,-53 c28,-30 51,-58 51,-62 0,-17 -32,-53 -46,-53 -8,0 -39,23 -69,51z"/>  <path fill="#D00000" d="M220,540 c-30,21 -28,47 7,86 l29,33 -58,62 c-100,106 -125,225 -70,332 l21,43 -50,53 c-28,30 -51,58 -51,62 0,17 32,53 46,53 8,0 39,-23 69,-51 l53,-50 43,21 c107,55 226,30 332,-70 l62,-58 33,29 c49,44 92,35 92,-21 0,-20 -54,-79 -258,-283 -142,-141 -262,-257 -268,-257 -5,0 -20,7 -32,16z"/>  `,
    conntng: `<title>Connecting</title><g fill="var(--sol-dark-green)"><rect x="550" y="1" width="200" height="350" opacity=".1"/><rect x="550" y="1" width="200" height="350" transform="rotate(45 650 650)" opacity=".25"/><rect x="550" y="1" width="200" height="350" transform="rotate(90 650 650)" opacity=".5"/><rect x="550" y="1" width="200" height="350" transform="rotate(135 650 650)" opacity=".75"/><rect x="550" y="1" width="200" height="350" transform="rotate(180 650 650)" opacity="1.00"/><animateTransform attributeName="transform" type="rotate" calcMode="discrete" dur="0.9s" values="0 650 650;45 650 650;90 650 650;135 650 650;180 650 650;225 650 650;270 650 650;315 650 650;360 650 650" repeatCount="indefinite"/></g>`,
    pausSVG: `<title>Connection Paused</title><rect x="25" y="75" rx="200" ry="200" height="1150" width="1250"  fill="#fff" stroke="var(--sol-dark-gray)" stroke-width="50px" /><line x1="450" y1="350" x2="450" y2="950" stroke="var(--sol-dark-green)" stroke-width="180px" /><line x1="850" y1="350" x2="850" y2="950" stroke="var(--sol-dark-green)" stroke-width="180px" />`,
    file_dl: `<path fill="#fff" stroke="#000" stroke-linecap="round" stroke-width="50px" d="M250,100 h600 l200,200 v900 h-800 v-1000 z" /><line stroke="var(--sol-mid-green)" stroke-width="100px" stroke-linecap="round" x1="650" y1="300" x2="650" y2="1000" /><line stroke="var(--sol-mid-green)" stroke-width="100px" stroke-linecap="round" x1="450" y1="750" x2="650" y2="1000" /><line stroke="var(--sol-mid-green)" stroke-width="100px" stroke-linecap="round" x1="850" y1="750" x2="650" y2="1000" />`,
    file_raw: `<path fill="#fff" stroke="#000" stroke-linecap="round" stroke-width="50px" d="M250,100 h600 l200,200 v900 h-800 v-1000 z" /><rect height="600px" width="1200px" fill="var(--sol-dark-gray)" x="50" y="450" rx="50" ry="50" /><text x="90" y="930" fill="#fff" font-size="410pt" font-family="Calibri" font-weight="bold">RAW</text>`,
    file_txt: `<path fill="#fff" stroke="#000" stroke-linecap="round" stroke-width="50px" d="M250,100 h600 l200,200 v900 h-800 v-1000 z" /><rect height="600px" width="1200px" fill="var(--sol-mid-green)" x="50" y="450" rx="50" ry="50" /><text x="120" y="970" fill="#fff" font-size="515pt" font-family="Calibri" font-weight="bold">TXT</text>`,
    filterActive: `<path fill="var(--sol-green)" d="M100,100 h1100 l-450,550 v500 l-200,-100 v-400 l-450-550 z" />`,
    filterInactive: `<path fill="var(--sol-mid-gray)" d="M100,100 h1100 l-450,550 v500 l-200,-100 v-400 l-450-550 z" />`,
    trash: `<g stroke="#000" fill="#000" stroke-width="50px" stroke-linecap="square"><line x1="550" y1="0" x2="550" y2="100" /><line x1="750" y1="0" x2="750" y2="100" /><line x1="550" y1="0" x2="750" y2="0" /><path fill="#000" d="M150,250 h1000 q-10,-150 -100,-150 h-800 q-90,0 -100,150 z" /><path fill="#000" d="M250,400 h800 l-40,800 q0,50, -50,50 h-600 q-50,0 -50,-50 l-40,-800 z" /></g><g stroke="#fff" stroke-width="100px" stroke-linecap="round"><line x1="500" y1="500" x2="520" y2="1100" /><line x1="800" y1="500" x2="780" y2="1100" /></g>`,
  },
  
  html: {
    disconnectedMessageList: `<tr id="disconnectedMsgListRow"><td colspan="100"><br>&nbsp; &nbsp; &nbsp;Please connect to broker to list messages</td></tr>`,
  },
  
  // TODO: placeholder for dom elements to provide glue instead of referencing dom ids in code directly
  dom: {
    clientConnectForm: {
      host: null,
      user: null,
      pass: null,
      cert: null,
      token: {
        access: null,
        identity: null,
      },
      vpn: null,
      queue: null,
      save: null,
      load: null,
      clear: null,
      connect: null,
    },
    sempConnectForm: {
      host: null,
      user: null,
      pass: null,
      cert: null,
      token: {
        access: null,
        identity: null,
      },
      save: null,
      load: null,
      clear: null,
      connect: null,
      vpn: null,
      queue: null,
    },
    messageList: {
      tableBody: null,
    },
    messageDetails: {
      textBody: null,
      binTextBody: null,
      rawTextBody: null,
    },
  },

  // ----------------------------------------------------------------------------------------------
  // UI: function to initialized UI (e.g. add event listeners)
  // ----------------------------------------------------------------------------------------------
  init: function() {
    SolaceWebUtility.ui.clientConnect.showDisconnected();
    // add "enter" action to all client connect text fields
    let clientConnectTextFields = document.querySelectorAll(".main-body .section-main .section-details .login-form input.login-field");
    for (let textField of clientConnectTextFields) {
      textField.addEventListener("keydown", function(event) {
        if (event.key === 'Enter')
          SolaceWebUtility.ui.clientConnect.toggleConnect();
      });
    };
    
    // add actions to client connect buttons
    document.getElementById("clientConnectSave").addEventListener("click", function() {
      SolaceWebUtility.ui.clientConnect.save();
      SolaceWebUtility.ui.showPopup("Saved", 300, "success");
    });
    document.getElementById("clientConnectLoad").addEventListener("click", function() {
      SolaceWebUtility.ui.clientConnect.load();
      SolaceWebUtility.ui.showPopup("Loaded", 300, "success");
    });
    document.getElementById("clientConnectClear").addEventListener("click", function() { 
      SolaceWebUtility.ui.clientConnect.clear();
      SolaceWebUtility.ui.showPopup("Cleared", 300, "success");
    });
    document.getElementById("clientConnect").addEventListener("click", function() { SolaceWebUtility.ui.clientConnect.toggleConnect(); });
    
    // TODO : maybe think about how to improve auth type header tabs
    // add actions to auth type tab headers
    document.getElementById("clientAuthTypeHdr-BASIC").onclick = function() { 
      SolaceWebUtility.ui.showTab(this);
      document.getElementById("clientAuthType").value = "BASIC";
    };
    document.getElementById("clientAuthTypeHdr-OAUTH2").onclick = function() {
      SolaceWebUtility.ui.showTab(this);
      document.getElementById("clientAuthType").value = "OAUTH2";
    };

    // default to show basic auth type
    document.getElementById("clientAuthTypeHdr-BASIC").click();
    
    // add actions to message details tab headers
    document.getElementById("msgTabHdrContent").onclick = function() { SolaceWebUtility.ui.showTab(this); };
    document.getElementById("msgTabHdrRaw").onclick = function() { SolaceWebUtility.ui.showTab(this); };
    
    // add actions to message list buttons (bulk)
    document.getElementById("filterMsgList").onclick = function() { SolaceWebUtility.ui.toggleMessageFilter(); };
    document.getElementById("deleteSelectedMsgs").onclick = function() { SolaceWebUtility.ui.confirmBulkDelMsges(); };
    
    // add actions to message filter buttons
    document.getElementById("msgFilterSet").onclick = function() {
      SolaceWebUtility.ui.setMessageFilter();
    };
    document.getElementById("msgFilterClear").onclick = function() {
      SolaceWebUtility.ui.clearMessageFilter();
      SolaceWebUtility.ui.showPopup("Filter Cleared", 1000, "info");
    };
    
    // add "enter" for message filter text box
    document.getElementById("filterTextBody").addEventListener("keydown", function(event) {
        if (event.key === 'Enter') {
          if (document.getElementById("filterTextBody").value.length == 0) {
            SolaceWebUtility.ui.clearMessageFilter();
            SolaceWebUtility.ui.showPopup("Filter Cleared", 1000, "info");
          } else {
            SolaceWebUtility.ui.setMessageFilter();
            SolaceWebUtility.ui.showPopup("Filter Applied", 1000, "info");
          }
        }
      });
    
    // add action to header checkbox
    document.getElementById("msgHdrCheckbox").onclick = function() { SolaceWebUtility.ui.toggleCheckboxes(this); };
    
    // disable all form submission
    let formDoms = document.getElementsByTagName("form");
    for (form of formDoms) {
      form.onsubmit = function() { return false; };
    }
    
    // hide beta elements
    if (SolaceWebUtility.debugMode == 0) {
      let betaDoms = document.getElementsByClassName("beta");
      for (let child of betaDoms)
        child.classList.add("hidden");
    }
  },
  // ----------------------------------------------------------------------------------------------
  // UI: clientConnect related variables and functions
  // ----------------------------------------------------------------------------------------------
  clientConnect: {
    fieldDOMs: [ "clientHost", "clientUser", "clientPass", "clientAccessToken", "clientIdentityToken", "clientVpn", "clientQueue", "clientAuthType"],
    buttonDOMs: [ "clientConnectLoad", "clientConnectClear" ],
    checkForm: function() {
      let errMsg = [];
      if (document.getElementById("clientHost").value == "")
        errMsg.push("Host URL");
      if (document.getElementById("clientVpn").value == "")
        errMsg.push("VPN");
      if (document.getElementById("clientQueue").value == "")
        errMsg.push("Queue");
      if (document.getElementById("clientAuthType").value == "BASIC") {
        if (document.getElementById("clientUser").value == "")
          errMsg.push("Username");
      } else if (document.getElementById("clientAuthType").value == "OAUTH2") {
        if ((document.getElementById("clientAccessToken").value.length + document.getElementById("clientIdentityToken").value.length) == 0)
          errMsg.push("Access/Identity Token");
      }
      return errMsg;
    },
    disableForm: function() {
      for (let id of [ ...SolaceWebUtility.ui.clientConnect.fieldDOMs, ...SolaceWebUtility.ui.clientConnect.buttonDOMs ])
        document.getElementById(id).disabled = true;
      document.getElementById("clientAuthTypeHdr-BASIC").classList.add("unresponsive");
      document.getElementById("clientAuthTypeHdr-OAUTH2").classList.add("unresponsive");
    },
    enableForm: function() {
      for (let id of [ ...SolaceWebUtility.ui.clientConnect.fieldDOMs, ...SolaceWebUtility.ui.clientConnect.buttonDOMs ])
        document.getElementById(id).disabled = false;
      document.getElementById("clientAuthTypeHdr-BASIC").classList.remove("unresponsive");
      document.getElementById("clientAuthTypeHdr-OAUTH2").classList.remove("unresponsive");
    },
    load: function() {
      for (let id of SolaceWebUtility.ui.clientConnect.fieldDOMs)
        document.getElementById(id).value = localStorage.getItem(id);
      if (document.getElementById("clientAuthType").value == "")
        document.getElementById("clientAuthType").value = "BASIC";
      SolaceWebUtility.ui.showTab(document.getElementById("clientAuthTypeHdr-" + document.getElementById("clientAuthType").value));
      SolaceWebUtility.log("Client Form", "Loaded stored Client Connection parameters. If form is empty, either the stored values are overwritten with blank values or they have been cleared.");
    },
    save: function() {
      for (let id of SolaceWebUtility.ui.clientConnect.fieldDOMs)
        localStorage.setItem(id, document.getElementById(id).value);
      localStorage.setItem("clientPass", "");
      SolaceWebUtility.log("Client Form", "Saved Client Connection parameters. Click 'Load' to test.");
    },
    clear: function() {
      let clientAuthType = document.getElementById("clientAuthType").value;
      for (let id of SolaceWebUtility.ui.clientConnect.fieldDOMs)
        document.getElementById(id).value = "";
      document.getElementById("clientAuthType").value = clientAuthType;
      SolaceWebUtility.log("Client Form", "Cleared Client Connection form.");
    },
    showConnected: function() {
      document.getElementById("clientConnect").textContent = "Disconnect";
      document.getElementById("clientConnect").classList.remove("connect");
      document.getElementById("clientConnect").classList.add("disconnect");
      SolaceWebUtility.ui.clientConnect.disableForm();
      document.getElementById("clientConnectStatus").innerHTML = SolaceWebUtility.ui.svg.connSVG;
      document.getElementById("clientConnectDetails").open = false;
      document.getElementById("msgHdrCheckbox").disabled = false;
      document.getElementById("msgListBulkActions").classList.remove("hidden");
      if (SolaceWebUtility.clientSession.queueConsumable)
        document.getElementById("deleteSelectedMsgs").classList.remove("hidden");
      else
        document.getElementById("deleteSelectedMsgs").classList.add("hidden");
    },
    showDisconnected: function() {
      document.getElementById("clientConnect").textContent = "Connect";
      document.getElementById("clientConnect").classList.remove("disconnect");
      document.getElementById("clientConnect").classList.add("connect");
      SolaceWebUtility.ui.clientConnect.enableForm();
      document.getElementById("clientConnectStatus").innerHTML = SolaceWebUtility.ui.svg.dscnSVG;
      document.getElementById("messageListBody").innerHTML = SolaceWebUtility.ui.html.disconnectedMessageList;
      document.getElementById("msgHdrCheckbox").disabled = true;
      document.getElementById("msgHdrCheckbox").checked = false;
      document.getElementById("filterMessageForm").classList.add("hidden");
      SolaceWebUtility.ui.clearMessageFilter();
      document.getElementById("msgListBulkActions").classList.add("hidden");
      SolaceWebUtility.ui.resetTabHeaders(document.getElementById("msgTabHdrContent").parentElement);
      SolaceWebUtility.ui.clearAllTabs(document.getElementById("msgTabBodyContent").parentElement);
      SolaceWebUtility.ui.updateDownloadedCount();
      SolaceWebUtility.ui.updateDisplayCount();
      SolaceWebUtility.ui.updateSelectedCount();
    },
    toggleConnect: async function() {
      // if client session is connected - attempt disconnect
      if (SolaceWebUtility.clientSession.clientSessionConnected) {
        document.getElementById("clientConnectStatus").innerHTML = SolaceWebUtility.ui.svg.conntng;
        SolaceWebUtility.clientSession.attemptDisconnectSession();
      }
      
      // if client session is not connected - attempt connect
      else {
        let err = SolaceWebUtility.ui.clientConnect.checkForm();
        if (err.length == 0) {
          SolaceWebUtility.ui.clientConnect.disableForm();
          document.getElementById("clientConnectStatus").innerHTML = SolaceWebUtility.ui.svg.conntng;
          await SolaceWebUtility.clientSession.clientCertWorkAround();
          SolaceWebUtility.clientSession.attemptConnectSession();
        } else {
          SolaceWebUtility.ui.showPopup("Please fill in all necessary fields: \n" + err.join(", "), 3000, "error");
          SolaceWebUtility.ui.clientConnect.enableForm();
        }
      }
    }
  },
  //-----------------------------------------------------------------------------------------------
  // UI: function related to tabs
  //-----------------------------------------------------------------------------------------------
  /*
  Explanation of how "Tabs" work.
  
  DOM elements for Tabs functionality:
    - Tab Header Container (THC)
      - Must be the parent DOM for Tab Headers
    - Tab Headers
      - Identified by class="tab-header"
    - Tab Body Container (TBC)
      - Must be the parent DOM for Tab Bodies
    - Tab Body
      - Requires id=<tab-id> where <tab-id> is a unique DOM id
      - Identified by class="tab-body"
    
  For tabs to work, all 4 DOM elements above (along with the appropriate class names) must be defined.
  The tab-related functions depends on the class names and the id of TBC to correct highlight, show,
  and hide the corresponding tab elements.
  
  */
  
  // unselected all tab headers
  resetTabHeaders: function(tabHeaderContainer) {
    // get all DOMs that have "tab-selected" class within the container
    const children = tabHeaderContainer.getElementsByClassName("tab-selected");
    for (child of children) {
      child.classList.remove("tab-selected");
    }
  },
  
  // hide all tab bodies
  hideAllTabs: function(tabBodyContainer) {
    // get all DOMs that have "tab-body" class within the Tab Body Container
    const children = tabBodyContainer.getElementsByClassName("tab-body");
    for (child of children) {
      child.classList.add("hidden");
    }
  },
  
  // clear all tab bodies' text content
  clearAllTabs: function(tabBodyContainer) {
    const children = tabBodyContainer.getElementsByClassName("tab-body");
    for (child of children) {
      child.innerHTML = "";
    }
    document.getElementById("viewMsgSummaryDetails").textContent = "";
  },
  
  // function when tab header is clicked
  showTab: function(tabHeader) {
    SolaceWebUtility.ui.resetTabHeaders(tabHeader.parentElement);
    const tabBodyContainer = document.getElementById(tabHeader.getAttribute("tab-target")).parentElement;
    SolaceWebUtility.ui.hideAllTabs(tabBodyContainer);
    tabHeader.classList.add("tab-selected");
    document.getElementById(tabHeader.getAttribute("tab-target")).classList.remove("hidden");
  },
  //-----------------------------------------------------------------------------------------------
  // UI: generic function to show notification
  //-----------------------------------------------------------------------------------------------
  showPopup: function(msg, duration = 1000, type = "info") {
    /*
     ENUMS are based on css classes: bgsuccess, bgwarn, bgerror
     hence enums are "success" "warn" "error", with "info" additionally as an exception:
     "info" will not have a progress bar animation at the bottome of the popup
    */
    type = type.toLowerCase();
    const popMsg = document.createElement("div");
    popMsg.classList.add("popup");
    popMsg.textContent = msg;
    const popBar = document.createElement("div");
    popBar.classList.add("progress-bar")
    popBar.classList.add("bg" +type); // valid types are error, info, success, warn
    popBar.style.transitionDuration = `${duration}ms`;
    
    if (type != "info")
      popMsg.appendChild(popBar);
    
    let popCtn = document.getElementById("popupContainer");
    if (popCtn == null) {
      popCtn = document.createElement("div");
      popCtn.id = "popupContainer";
      popCtn.classList.add("popup-container");
      document.body.appendChild(popCtn);
    }
    
    popCtn.insertBefore(popMsg, popCtn.firstChild);
    popMsg.style.opacity = "0.9";
    if (type != "info") {
      popBar.offsetWidth; // this line is required to ensure DOM is rendered before shrink-ed
      popBar.classList.add("shrink-progress-bar");
    }
    setTimeout(() => {
      popMsg.style.opacity = "0";
      setTimeout(() => {
        popMsg.remove();
        if (popCtn.children.length == 0)
          popCtn.remove();
      }, 300);
    }, duration);
  },
  //-----------------------------------------------------------------------------------------------
  // UI: Message List related
  //-----------------------------------------------------------------------------------------------
  
  // function to add to message list
  addMessage: function(solMsg) {
    if (document.getElementById("disconnectedMsgListRow") != null)
      document.getElementById("disconnectedMsgListRow").remove();
    let rowDom = document.createElement("tr");
    rowDom.classList.add("message-row");
    rowDom.classList.add("pointer");
    rowDom.id = "msgRow-" + solMsg.SWU.gMsgId;
    solMsg.SWU.domId = rowDom.id;
    let innerHTML = `
      <td class="message-cell" onclick="SolaceWebUtility.ui.updateSelectedCount(); SolaceWebUtility.ui.stopEventPropagation(event)"><input class="message-row-checkbox" type="checkbox" id="msgRowCheckBox-${solMsg.SWU.gMsgId}"></td>
      <td class="message-cell">${solMsg.SWU.gMsgId}</td>
      <td class="message-cell">` +solMsg.getReplicationGroupMessageId().toString()+ `</td>
      <td class="message-cell">` +solace.MessageType.nameOf(solMsg.getType())+ `</td>
      <td class="message-cell">` +SolaceWebUtility.commFuncs.formatBytes(solMsg.SWU.estMsgSize)+ `</td>
      <td class="message-cell" onclick="SolaceWebUtility.ui.stopEventPropagation(event)">
      <svg onclick="SolaceWebUtility.ui.downloadMessage('${solMsg.SWU.gMsgId}')" class="act-ico" version="1.0" xmlns="http://www.w3.org/2000/svg"  viewBox="0 0 1300 1300">${SolaceWebUtility.ui.svg.file_dl}</svg>
      `;
    if (SolaceWebUtility.clientSession.queueConsumable)
      innerHTML += `<svg onclick="SolaceWebUtility.ui.confirmDelMsg('${solMsg.SWU.gMsgId}')" class="act-ico" version="1.0" xmlns="http://www.w3.org/2000/svg"  viewBox="0 0 1300 1300"><title>Delete message from Queue</title>${SolaceWebUtility.ui.svg.trash}</svg>`;
    innerHTML += "</td>";
    rowDom.innerHTML = innerHTML;
    rowDom.onclick = function() {
      document.getElementById("viewMsgSummaryDetails").textContent = ` | ${solace.MessageType.nameOf(solMsg.getType())} | Message Id: ${solMsg.SWU.gMsgId}`;
      if (solMsg.SWU.contentWithHtmlTags)
        document.getElementById("msgTabBodyContent").innerHTML = solMsg.SWU.displayContent;
      else
        document.getElementById("msgTabBodyContent").textContent = solMsg.SWU.displayContent;
      if (typeof solMsg.SWU.dump === "undefined") {
        solMsg.SWU.dump = (solMsg.SWU.isLargeMsg) ? solMsg.dump().substr(0, 10240) + " ..." : solMsg.dump();
      }
      document.getElementById("msgTabBodyRaw").textContent = solMsg.SWU.dump;
      SolaceWebUtility.ui.showTab(document.getElementById("msgTabHdrContent"));
      SolaceWebUtility.ui.highlightMessageListRow(rowDom);
    };
    document.getElementById("messageListBody").appendChild(rowDom);
    SolaceWebUtility.ui.updateDisplayCount();
  },
  
  // UI: prompts user for message delete confirmation
  confirmDelMsg: function(gMsgId) {
    if (confirm(`Delete Message Id ${gMsgId} from queue?`)) {
      SolaceWebUtility.clientSession.removeMessage(SolaceWebUtility.clientSession.queuedMessages[gMsgId]);
    }
  },
  
  //UI: prompt user for bulk message delete confirmation
  confirmBulkDelMsges: async function(domOrIdArray = document.querySelectorAll("#messageListBody input.message-row-checkbox[type='checkbox']:checked")) {
    // if SWU UI is still empty, alert user
    if (domOrIdArray.length == 0) {
      alert("No messages selected!");
    } else { // prompt user for confirmation
      if (confirm(`Delete ${domOrIdArray.length} message(s)?`)) {
        for (let domOrId of domOrIdArray) {
          let gMsgId = null;
          // if array item is checkbox
          if (domOrId instanceof HTMLInputElement && domOrId.getAttribute("type").toLowerCase() == "checkbox") {
            gMsgId = domOrId.id.replace("msgRowCheckBox-", "");
          }
          // remove messages
          SolaceWebUtility.clientSession.removeMessage(SolaceWebUtility.clientSession.queuedMessages[gMsgId]);
        }
      }
    }
  },
  // UI: trigger message download TODO add more binary file type support in future to autp append file extension and set MIME in Blob
  downloadMessage: function(msgId) {
    let dataLen = SolaceWebUtility.clientSession.queuedMessages[msgId].SWU.content.length;
    let data = new Uint8Array(dataLen);
    for (let i=0; i<dataLen; i++)
      data[i] = SolaceWebUtility.clientSession.queuedMessages[msgId].SWU.content.charCodeAt(i);
    SolaceWebUtility.clientSession.download = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
    let dlDom = document.createElement("a");
    dlDom.href = SolaceWebUtility.clientSession.download;
    dlDom.download = "SolaceMessage-" + msgId;
    document.body.appendChild(dlDom);
    dlDom.click();
    dlDom.remove();
    URL.revokeObjectURL(SolaceWebUtility.clientSession.download);
  },
  
  // UI: highlight row
  highlightMessageListRow: function(msgRowDom) {
    let rows = document.getElementById("messageListBody").getElementsByClassName("message-row-selected");
    for (row of rows)
      row.classList.remove("message-row-selected");
    msgRowDom.classList.add("message-row-selected");
  },

  // UI: remove message row by guaranteed message id
  removeMessage: function(solMsgId) {
    document.getElementById(`msgRow-${solMsgId}`).remove();
    SolaceWebUtility.ui.updateDisplayCount();
    SolaceWebUtility.ui.updateSelectedCount();
  },
  
  // UI: show message list filter panel
  toggleMessageFilter: function() {
    if (document.getElementById("filterMessageForm").classList.contains("hidden")) {
      document.getElementById("filterMessageForm").classList.remove("hidden");
    } else {
      document.getElementById("filterMessageForm").classList.add("hidden");
    }
  },
  
  // UI: clear message filter function to reset all filter related elements
  clearMessageFilter: function() {
    document.getElementById("filterTextBody").value = "";
    document.getElementById("filterMsgList").innerHTML = SolaceWebUtility.ui.svg.filterInactive;
    let msgList = document.querySelectorAll("#messageListBody tr.message-row.hidden")
    for (let row of msgList)
      row.classList.remove("hidden");
    SolaceWebUtility.ui.updateDisplayCount();
  },
  
  // UI: set message filter active. filtering is referencing queuedMessages. TODO review if this should be in another namespace (or at least part of the function broken into different namespaces).
  setMessageFilter: function() {
    document.getElementById("filterMsgList").innerHTML = SolaceWebUtility.ui.svg.filterActive;
    for (let msgId of Object.keys(SolaceWebUtility.clientSession.queuedMessages)) {
      let msg = SolaceWebUtility.clientSession.queuedMessages[msgId];
      if (SolaceWebUtility.ui.filterMatch(msgId)) {
        document.getElementById(msg.SWU.domId).classList.remove("hidden");
      } else {
        document.getElementById(msg.SWU.domId).classList.add("hidden");
        document.getElementById("msgRowCheckBox-" + msgId).checked = false;
      }
    }
    SolaceWebUtility.ui.updateDisplayCount();
    if (document.getElementById("msgDisplayCount").textContent != "0")
      SolaceWebUtility.ui.toggleMessageFilter();
  },
  
  // UI: function to boolean results whether the message matches the filter TODO review along with setMessageFilter() if this should be in this namespace.
  filterMatch: function(msgId) {
    return SolaceWebUtility.clientSession.queuedMessages[msgId].SWU.isText && new RegExp(document.getElementById("filterTextBody").value).test(SolaceWebUtility.clientSession.queuedMessages[msgId].SWU.content);
  },
  
  /*
    UI: toggle all checkboxes
      Checkbox in header row has attribute "msg-table-target" which should point to the DOM ID of the <table> or <tbody> element.
      function will retrieve all elements with the class "message-row-checkbox"
  */
  toggleCheckboxes: function(headerCheckbox) {
    const tableBody = headerCheckbox.getAttribute("msg-table-target");
    if (document.getElementById(tableBody) != null) {
      let checkboxes = document.querySelectorAll("#messageListBody tr.message-row:not(.hidden) input.message-row-checkbox");
      for (let dom of checkboxes) {
        if (dom instanceof HTMLInputElement && dom.getAttribute("type").toLowerCase() == "checkbox") {
          dom.checked = headerCheckbox.checked;
        }
      }
    } else {
      SolaceWebUtility.log("DOM Action", `DOM Id=${tableBody} is not found.`)
    }
    SolaceWebUtility.ui.updateSelectedCount();
  },
    
  // function to update message downloaded count in ui
  updateDownloadedCount: function() {
    document.getElementById("msgCount").textContent = Object.keys(SolaceWebUtility.clientSession.queuedMessages).length;
  },

  // function to update message display count in ui
  updateDisplayCount: function() {
    document.getElementById("msgDisplayCount").textContent = document.querySelectorAll("#messageListBody tr.message-row:not(.hidden)").length;
  },
  
  // function to update selected message count in ui
  updateSelectedCount: function() {
    document.getElementById("msgSelectedCount").textContent = document.querySelectorAll("#messageListBody input.message-row-checkbox[type='checkbox']:checked").length;
  },

  // not exactly message list related but used in message list
  stopEventPropagation: function(evt) {
    evt.stopPropagation();
  },
}
///////////////////////////////////////////////////////////////////////////////////////////////////
////////// Dynamic Loading related functionality for loading scripts and css stylesheets //////////
///////////////////////////////////////////////////////////////////////////////////////////////////
SolaceWebUtility.dyLoad = {
  // dyLoad: list of files to load. this provides a way to provide multiple secondary/backup filepaths in case the first fails.
  filesToLoad: {
  
    // solace api urls - only first successful url will be loaded
    solaceAPI: [
      "js/solclient.js",
      "solclient.js"
    ],
    
    // other scripts / css files to be loaded should be placed here.
    others: [
/*      {
        name: "Solace CSS",
        type: "css",
        urls: [
          "css/solace.css"
        ]
      }*/
    ]
  },
  
  // dyLoad: basic function to load files, currently only supports js and css
  loadFile: function(type, url) {
    return new Promise((resolve, reject) => {
    if (type == "js") {
      const script = document.createElement('script');
      script.src = url;
      //script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    } else if (type == "css") {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => reject();
      document.head.appendChild(link);
    }
    });
  },
  // dyLoad: function to call loadFile and loop through all urls
  loadWithFallback: async function(name, type, urls) {
    for (let url of urls) {
      try {
        await SolaceWebUtility.dyLoad.loadFile(type, url);
        SolaceWebUtility.log("Script/CSS", `Loaded ${name} via ${url}`);
        return true;
      } catch (err) {
        // do nothing if fail to let loop continue
        SolaceWebUtility.log("Script/CSS", `Unable to load ${name} via ${url}`);
      }
    }
    SolaceWebUtility.log("Script/CSS", `Unable to load ${name}`);
    return false;
  },
  // dyLoad: function to load Solace Javascript API js files and only initilize SWU if loaded successfully
  loadSolApi: function() {
    SolaceWebUtility.dyLoad.loadWithFallback("Solace Javascript API", "js", SolaceWebUtility.dyLoad.filesToLoad.solaceAPI)
    .then(loaded => {
      SolaceWebUtility.solApiLoaded = loaded;
      if (SolaceWebUtility.solApiLoaded)
        SolaceWebUtility.init();
      else {
      document.write("<h2>Failed to load Solace API.</h2>");
      document.write("<p><code>solclient.js</code> or <code>solclient-full.js</code> is expected to be in <code>js</code> folder</p>");
      document.write("<p>Please go to <a href=\"https://solace.com/downloads/?fwp_downloads_types=messaging-apis-and-protocols\">Solace.com Downloads</a> and download <b>Javascript (Browser)</b> API.</p>");
      document.write(`<p>Alternatively replace the pathname with a full URL path to <code>solclient.js</code> in:<br>
        <li style="margin-left:20px;"><code>SolaceWebUtility.dyLoad.filesToLoad.solaceAPI</code></li>
        <quote style="margin-left:40px;color:#AAA">You can search for <code>SolaceWebUtility.dyLoad</code> in the file to locate the variable to update.</quote>
        </p>`);
      window.stop();
      throw new Error("Failed to load Solace API.");
      }
    })
    .catch(err => {
      // do nothing as loadWithFallback() doesn't throw errors
    });
  },
  // dyLoad: overall wrapper function to call loadWithFallback for every file in "SolaceWebUtility.dyLoad.filesToLoad.others" to load
  loadAllFiles: function() {
    for (let file of SolaceWebUtility.dyLoad.filesToLoad.others) {
      SolaceWebUtility.dyLoad.loadWithFallback(file.name, file.type, file.urls);
    }
  }
};

///////////////////////////////////////////////////////////////////////////////////////////////////
//////// Solace Web Utility initialization - Solace Javascript API needs to be initialized ////////
///////////////////////////////////////////////////////////////////////////////////////////////////
SolaceWebUtility.init = function() {
  SolaceWebUtility.log("Solace API", "Initializing " + solace.Version.summary);
  const factoryProps = new solace.SolclientFactoryProperties();
  factoryProps.profile = solace.SolclientFactoryProfiles.version10;
  solace.SolclientFactory.init(factoryProps);
  if (SolaceWebUtility.debugMode != 0) {
    solace.SolclientFactory.setLogLevel(solace.LogLevel.DEBUG);
    SolaceWebUtility.clientSession.sessionConnectionParameters.clientName = "SolaceWebUtility/" + crypto.randomUUID(),
    SolaceWebUtility.log("Client Session", `ClientName is "${SolaceWebUtility.clientSession.sessionConnectionParameters.clientName}"`);
  };
  
  /*
    TODO: should add glue to dom elements instead of referencing them directly by DOM IDs. need to think where to do this.
    e.g. 
       SolaceWebUtility.ui.dom.messageListBody = document.getElementById("messageListBody");
       ... then reference SolaceWebUtility.ui.dom.messageListBody in code instead
  */
}
///////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////// Generic Logging Function. ////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
SolaceWebUtility.log = function(hdr = " Sol Web Util ", txt) {
  hdr = hdr + " ".repeat(14 - hdr.length);
  if (SolaceWebUtility.debugMode == 1) {
    console.log("[" + SolaceWebUtility.commFuncs.nowDateString() + "] [" +hdr+ "] " +txt);
  } else if (SolaceWebUtility.debugMode == 2) {
    document.getElementById("swuLog").innerHTML = document.getElementById("swuLog").innerHTML + "[" + SolaceWebUtility.commFuncs.nowDateString() + "] [" +hdr+ "] " +txt+ "\n";
    document.getElementById("swuLog").scrollTop = document.getElementById("swuLog").scrollHeight;
  }
};

///////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////// Common Generic Functions. ////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

SolaceWebUtility.commFuncs = {
  // size format function
  formatBytes: function (bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
  },
  
  // return now date object
  nowDate: function () {
    return new Date();
  },
  
  // return now date as string
  nowDateString: function() {
    return new Date().toISOString();
  },
  
  // beautify and color code json string, throws error is not json string
  prettyJSON: function(objOrStr) {
    let jsonObj = null, jsonStr = null;
    if (typeof objOrStr === "string") {
      try {
        jsonObj = JSON.parse(objOrStr);
      } catch (err) {
        // error throwing is required to test if string is a valid JSON
        throw new Error("JSON Error: String is not a valid JSON");
      }
    } else {
      jsonObj = objOrStr;
    }
    jsonStr = JSON.stringify(jsonObj, null, 2);
    formatted = jsonStr
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*?"(\s*:)?|\b(true|false|null)\b|\d+)/g, match => {
        let cls = 'num';
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? 'key' : 'str';
        } else if (/true|false/.test(match)) {
          cls = 'boo';
        } else if (/null/.test(match)) {
          cls = 'nul';
        }
        return `<span class="code-highlight json-${cls}">${match}</span>`;
      });
    return formatted;
  },
  
  // converts variable to escaped hex strings, throws error is variable is not string
  strToHex: function(str) {
    if (typeof str === "string")
        return Array.from(str).map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    else
      throw new Error("Variable passed to function is not a string!");
  },
}
///////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////// web app startup sequence. ////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
window.addEventListener('DOMContentLoaded', async () => {

  // determine debug mode - must be executed in front of all other steps
  SolaceWebUtility.determineDebugMode();
  
  // add log container if debugMode = 2 - must be executed in front of all other steps
  if (SolaceWebUtility.debugMode == 2) {
    const mainBody = document.getElementById("mainBody");
    if (mainBody != null) {
      logSec = document.createElement("section");
      logSec.classList.add("section-main");
      logSec.classList.add("no-flex-item");
      logSec.innerHTML = `<div id="swuLog" class="log-style swu-log-height border"></div>`
      mainBody.appendChild(logSec);
    } else {
      console.log("[ Sol Web Util ] 'mainBody' container is not found. Reverting back to console log. Debug Mode 1");
      SolaceWebUtility.debugMode = 1;
    }
  };

  // call function to load scripts and css
  SolaceWebUtility.dyLoad.loadSolApi();
  SolaceWebUtility.dyLoad.loadAllFiles();
  
  // added web app info
  document.getElementById("suwInfo").innerHTML = `Solace Web Utility v${SolaceWebUtility.version}` + ((SolaceWebUtility.isHosted) ? "" : "<br>(Local Mode)");
  document.getElementById("suwInfo").onclick = function() {
    window.location = "https://github.com/SolacePSGSolutions/solace-queue-browser";
  };

  // ensure side navigation menu minimum height matches with the main sections
  window.onresize = function() {
    document.getElementById("mainNavi").style.minHeight = document.getElementById("mainBody").offsetHeight;
  }
  
  // init UI related actions
  SolaceWebUtility.ui.init();

  // load saved values
  SolaceWebUtility.ui.clientConnect.load()

});