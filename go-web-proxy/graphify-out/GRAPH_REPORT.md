# Graph Report - go-web-proxy  (2026-05-18)

## Corpus Check
- 6 files · ~4,784 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 78 nodes · 154 edges · 9 communities
- Extraction: 67% EXTRACTED · 33% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]

## God Nodes (most connected - your core abstractions)
1. `quietLogger()` - 15 edges
2. `main()` - 9 edges
3. `loadOrGenerateServerCert()` - 8 edges
4. `loadConfig()` - 7 edges
5. `newPWAHandler()` - 7 edges
6. `newReverseProxy()` - 7 edges
7. `parseProxyPath()` - 6 edges
8. `generateSelfSigned()` - 6 edges
9. `buildTrustPool()` - 6 edges
10. `accessLog()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `TestLoadConfig_Defaults()` --calls--> `loadConfig()`  [INFERRED]
  main_test.go → main.go
- `TestLoadConfig_FromEnv()` --calls--> `loadConfig()`  [INFERRED]
  main_test.go → main.go
- `TestLoadConfig_HostedRequiresExactTrue()` --calls--> `loadConfig()`  [INFERRED]
  main_test.go → main.go
- `main()` --calls--> `loadOrGenerateServerCert()`  [INFERRED]
  main.go → tls.go
- `main()` --calls--> `buildTrustPool()`  [INFERRED]
  main.go → tls.go

## Communities (9 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.18
Nodes (15): joinHostPort(), newHostedHandler(), newPWAHandler(), parseProxyPath(), TestHostedHandler_Disabled(), TestHostedHandler_Enabled(), TestJoinHostPort(), TestParseProxyPath_BadInput() (+7 more)

### Community 1 - "Community 1"
Cohesion: 0.21
Nodes (11): contextWithTarget(), fileResolvable(), firstSegment(), hasExt(), isProxyPath(), serveIndex(), TestFirstSegment(), TestIsProxyPath() (+3 more)

### Community 2 - "Community 2"
Cohesion: 0.27
Nodes (10): config, envOr(), loadConfig(), main(), parseLogLevel(), TestEnvOr(), TestLoadConfig_Defaults(), TestLoadConfig_FromEnv() (+2 more)

### Community 3 - "Community 3"
Cohesion: 0.22
Nodes (6): hostedHandler, newReverseProxy(), TestReverseProxy_BadPathReturns400(), TestReverseProxy_HTTPRoundTrip(), TestReverseProxy_UpstreamDown_502(), recordingResponseWriter

### Community 4 - "Community 4"
Cohesion: 0.5
Nodes (7): buildTrustPool(), quietLogger(), TestBuildTrustPool_AddsCerts(), TestBuildTrustPool_NoDir(), TestBuildTrustPool_RejectsFile(), TestLoadOrGenerateServerCert_GeneratesWhenOnlyOneFilePresent(), TestLoadOrGenerateServerCert_RefusesToOverwriteCorruptKeypair()

### Community 5 - "Community 5"
Cohesion: 0.6
Nodes (4): appendPEMCerts(), generateSelfSigned(), TestAppendPEMCerts_CountsCertsSkipsNonCert(), writePEM()

### Community 6 - "Community 6"
Cohesion: 0.67
Nodes (4): accessLog(), newCapturingLogger(), TestAccessLog_RecordsStatusAndBytes(), TestAccessLog_SkipsHosted()

### Community 7 - "Community 7"
Cohesion: 0.5
Nodes (4): formatFingerprint(), loadOrGenerateServerCert(), TestFormatFingerprint(), TestLoadOrGenerateServerCert_LoadsExisting()

### Community 8 - "Community 8"
Cohesion: 0.67
Nodes (3): fileExists(), TestFileExists(), TestGenerateSelfSigned_CreatesValidKeypair()

## Knowledge Gaps
- **2 isolated node(s):** `config`, `targetURLKey`
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `Community 2` to `Community 0`, `Community 1`, `Community 3`, `Community 4`, `Community 6`, `Community 7`?**
  _High betweenness centrality (0.397) - this node is a cross-community bridge._
- **Why does `quietLogger()` connect `Community 4` to `Community 0`, `Community 3`, `Community 7`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `quietLogger()` (e.g. with `TestPWAHandler_MissingDir()` and `TestPWAHandler_EmptyDir()`) actually correct?**
  _`quietLogger()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `main()` (e.g. with `loadOrGenerateServerCert()` and `buildTrustPool()`) actually correct?**
  _`main()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `loadOrGenerateServerCert()` (e.g. with `main()` and `TestLoadOrGenerateServerCert_LoadsExisting()`) actually correct?**
  _`loadOrGenerateServerCert()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `loadConfig()` (e.g. with `TestLoadConfig_Defaults()` and `TestLoadConfig_FromEnv()`) actually correct?**
  _`loadConfig()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `newPWAHandler()` (e.g. with `main()` and `TestPWAHandler_MissingDir()`) actually correct?**
  _`newPWAHandler()` has 6 INFERRED edges - model-reasoned connections that need verification._