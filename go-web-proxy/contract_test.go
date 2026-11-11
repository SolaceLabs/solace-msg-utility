package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// The contract the demo's fake gateway (src/mock-broker/gateway/) is held to.
// testdata/contract/ holds a seed (users, connections, the settings the gateway
// starts with and the client address), request cases with the answers (the
// status, the body and, where a step lists them, headers; a step that reaches
// a broker scripts its answer and pins the URL the gateway asked for),
// validation vectors (with the glob vectors rbac_test.go runs) and the sign-in
// throttle vectors (throttle_test.go). These tests prove the real gateway
// gives exactly those answers; tests/mock-broker/gateway/contract.test.ts
// proves the fake gives the same ones from the same files. After a deliberate
// change to the gateway,
//
//	go test -run Contract -update .
//
// rewrites the answers in cases.json from the real gateway; the fake must then
// be brought in line.

var updateContract = flag.Bool("update", false, "rewrite testdata/contract/cases.json from the real gateway")

const contractDir = "testdata/contract"

// contractStores is the seed's users and connections as the store files hold
// them (plaintext passwords here; hashed before they are written).
type contractStores struct {
	Users       []userRec `yaml:"msg-utility-users"`
	Connections []connRec `yaml:"msg-utility-connections"`
}

// contractEnv is the rest of the seed.
type contractEnv struct {
	Settings json.RawMessage `json:"settings"`
	Client   string          `json:"client"`
}

// contractUpstream is the broker's side of a step that reaches one: what it
// answers (a status, headers and a body, or an error in place of an answer)
// and the URL the gateway asked it for.
type contractUpstream struct {
	URL     string            `json:"url"`
	Status  int               `json:"status,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body,omitempty"`
	Error   string            `json:"error,omitempty"`
}

// contractStep is one request and the answer. Headers lists response headers
// to compare, "" for one that must be absent.
type contractStep struct {
	As         string            `json:"as,omitempty"`
	MustChange bool              `json:"mustChange,omitempty"`
	Method     string            `json:"method"`
	Path       string            `json:"path"`
	Body       json.RawMessage   `json:"body,omitempty"`
	Raw        string            `json:"raw,omitempty"`
	Upstream   *contractUpstream `json:"upstream,omitempty"`
	Status     int               `json:"status"`
	Headers    map[string]string `json:"headers,omitempty"`
	Response   json.RawMessage   `json:"response"`
}

type contractCase struct {
	Name  string         `json:"name"`
	Steps []contractStep `json:"steps"`
}

type contractCases struct {
	Cases []contractCase `json:"cases"`
}

func readContract(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(contractDir, name))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// loadContractSeed reads seed.json twice: the stores through YAML (a JSON
// document is YAML, and the store structs carry the YAML names), the rest
// through JSON.
func loadContractSeed(t *testing.T) (contractStores, contractEnv) {
	t.Helper()
	data := readContract(t, "seed.json")
	var st contractStores
	if err := yaml.Unmarshal(data, &st); err != nil {
		t.Fatalf("seed.json: %v", err)
	}
	var env contractEnv
	if err := json.Unmarshal(data, &env); err != nil {
		t.Fatalf("seed.json: %v", err)
	}
	if len(st.Users) == 0 || len(st.Connections) == 0 || len(env.Settings) == 0 || env.Client == "" {
		t.Fatal("seed.json: users, connections, settings and client are all required")
	}
	return st, env
}

// scriptedUpstream is the broker behind the contract: the step being run
// says what it answers (next), and the URL the gateway asked for is kept for
// the step to check. A call no step scripted answers with an error, which the
// step's expected answer then does not match.
type scriptedUpstream struct {
	next *contractUpstream
	url  string
}

func (u *scriptedUpstream) RoundTrip(r *http.Request) (*http.Response, error) {
	u.url = r.URL.String()
	a := u.next
	switch {
	case a == nil:
		return nil, errors.New("contract: the step scripts no broker answer")
	case a.Error != "":
		return nil, errors.New(a.Error)
	}
	h := http.Header{}
	for k, v := range a.Headers {
		h.Set(k, v)
	}
	return &http.Response{StatusCode: a.Status, Header: h, Body: io.NopCloser(strings.NewReader(a.Body)), Request: r}, nil
}

// newContractEnv is the managed gateway over the seed's stores, its brokers
// the scripted one.
func newContractEnv(t *testing.T, st contractStores) (*managedEnv, *scriptedUpstream) {
	t.Helper()
	f := bootstrapFixture(t)
	if err := os.WriteFile(f.keyPath, []byte(testStoreKeyHex+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	users := slices.Clone(st.Users)
	for i := range users {
		users[i].Password = mustHash(t, f.h, users[i].Password)
	}
	u, err := yaml.Marshal(usersDoc{Users: users})
	if err != nil {
		t.Fatal(err)
	}
	c, err := yaml.Marshal(connsDoc{Connections: st.Connections})
	if err != nil {
		t.Fatal(err)
	}
	f.writeUsers(t, string(u))
	f.writeConns(t, string(c))
	up := &scriptedUpstream{}
	return newManagedEnvFrom(t, f, nil, up), up
}

// contractNormalize replaces what differs between runs: the store paths in
// a settings body are temporary directories here, a backup's next run
// follows the clock, and an export is sealed with a fresh salt and nonce.
func contractNormalize(v any) any {
	if m, ok := v.(map[string]any); ok {
		if s, ok := m["settings"].(map[string]any); ok {
			for _, k := range []string{"usersFile", "connectionsFile"} {
				if _, ok := s[k]; ok {
					s[k] = "<path>"
				}
			}
		}
		if _, ok := m["nextRun"].(string); ok {
			m["nextRun"] = "<time>"
		}
		for _, k := range []string{"filename", "content"} {
			if _, ok := m[k]; ok {
				m[k] = "<file>"
			}
		}
	}
	return v
}

func decodeAny(t *testing.T, data []byte) any {
	t.Helper()
	if len(bytes.TrimSpace(data)) == 0 {
		return nil
	}
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatalf("not JSON: %q", data)
	}
	return v
}

type contractSession struct {
	user       string
	mustChange bool
}

func (e *managedEnv) contractDo(s contractStep, client string, c *http.Cookie) *httptest.ResponseRecorder {
	var body io.Reader
	switch {
	case s.Raw != "":
		body = strings.NewReader(s.Raw)
	case len(s.Body) > 0:
		body = bytes.NewReader(s.Body)
	}
	req := httptest.NewRequest(s.Method, "https://gw.example"+s.Path, body)
	req.RemoteAddr = net.JoinHostPort(client, "5000")
	switch {
	case s.Raw != "":
		req.Header.Set("Content-Type", "application/xml")
	case len(s.Body) > 0:
		req.Header.Set("Content-Type", "application/json")
	}
	if c != nil {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	e.root.ServeHTTP(rec, req)
	return rec
}

// Each case runs on a fresh gateway over the seed. Every session a case names
// is opened before its first step, so a step after a revocation uses the
// cookie the user already held.
func TestContract_Cases(t *testing.T) {
	st, env := loadContractSeed(t)
	var cases contractCases
	dec := json.NewDecoder(bytes.NewReader(readContract(t, "cases.json")))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&cases); err != nil {
		t.Fatalf("cases.json: %v", err)
	}
	if len(cases.Cases) == 0 {
		t.Fatal("cases.json holds no case")
	}
	seen := map[string]bool{}
	for ci := range cases.Cases {
		cs := &cases.Cases[ci]
		if seen[cs.Name] || len(cs.Steps) == 0 {
			t.Fatalf("case %q: names are unique and every case has a step", cs.Name)
		}
		seen[cs.Name] = true
		t.Run(cs.Name, func(t *testing.T) {
			e, up := newContractEnv(t, st)
			cookies := map[contractSession]*http.Cookie{}
			for _, s := range cs.Steps {
				if k := (contractSession{s.As, s.MustChange}); s.As != "" && cookies[k] == nil {
					cookies[k] = e.cookie(s.As, s.MustChange)
				}
			}
			for si := range cs.Steps {
				s := &cs.Steps[si]
				up.next, up.url = s.Upstream, ""
				rec := e.contractDo(*s, env.Client, cookies[contractSession{s.As, s.MustChange}])
				got := contractNormalize(decodeAny(t, rec.Body.Bytes()))
				if *updateContract {
					s.Status = rec.Code
					s.Response, _ = json.Marshal(got) // nil marshals to null
					for k := range s.Headers {
						s.Headers[k] = rec.Header().Get(k)
					}
					if s.Upstream != nil {
						s.Upstream.URL = up.url
					}
					continue
				}
				want := decodeAny(t, s.Response)
				if rec.Code != s.Status || !reflect.DeepEqual(got, want) {
					t.Errorf("step %d, %s %s as %q: want %d %s, got %d %s",
						si+1, s.Method, s.Path, s.As, s.Status, s.Response, rec.Code, rec.Body.String())
				}
				for k, v := range s.Headers {
					if g := rec.Header().Get(k); g != v {
						t.Errorf("step %d, %s %s: header %s: want %q, got %q", si+1, s.Method, s.Path, k, v, g)
					}
				}
				if s.Upstream != nil && up.url != s.Upstream.URL {
					t.Errorf("step %d, %s %s: the broker was asked for %q, want %q", si+1, s.Method, s.Path, up.url, s.Upstream.URL)
				}
			}
		})
	}
	if *updateContract {
		out, err := json.MarshalIndent(cases, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(contractDir, "cases.json"), append(out, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

// The fake starts from seed.json's settings, so they must be the ones the
// gateway under test runs with.
func TestContract_SeedSettingsAreTheGateways(t *testing.T) {
	st, env := loadContractSeed(t)
	e, _ := newContractEnv(t, st)
	rec := e.contractDo(contractStep{Method: http.MethodGet, Path: "/managed/settings"}, env.Client, e.cookie("admin", false))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /managed/settings: %d %s", rec.Code, rec.Body.String())
	}
	got := contractNormalize(decodeAny(t, rec.Body.Bytes())).(map[string]any)["settings"]
	if want := decodeAny(t, env.Settings); !reflect.DeepEqual(got, want) {
		t.Fatalf("seed.json settings differ from the gateway's:\nwant %v\ngot  %v", want, got)
	}
}

// contractVectors is the checks the fake repeats before it answers 422, as
// vectors both sides run (validation.json), and the glob vectors the
// entitlement match is held to on both sides (rbac_test.go, and the app's
// src/core/rbac.ts through the fake).
type contractVectors struct {
	Username contractVectorList `json:"username"`
	Broker   contractVectorList `json:"broker"`
	Host     contractVectorList `json:"host"`
	Port     contractVectorList `json:"port"`
	Password contractVectorList `json:"password"`
	Scheme   struct {
		Semp   contractVectorList `json:"semp"`
		Client contractVectorList `json:"client"`
	} `json:"scheme"`
	Modules struct {
		Valid   [][]string `json:"valid"`
		Invalid [][]string `json:"invalid"`
	} `json:"modules"`
	// Glob rows are [pattern, value, expected].
	Glob [][3]any `json:"glob"`
}

type contractVectorList struct {
	Valid   []string `json:"valid"`
	Invalid []string `json:"invalid"`
}

func readContractVectors(t *testing.T) contractVectors {
	t.Helper()
	var v contractVectors
	dec := json.NewDecoder(bytes.NewReader(readContract(t, "validation.json")))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&v); err != nil {
		t.Fatalf("validation.json: %v", err)
	}
	return v
}

func TestContract_Validation(t *testing.T) {
	v := readContractVectors(t)
	type vectors = contractVectorList
	checks := []struct {
		name string
		vec  vectors
		ok   func(string) bool
	}{
		{"username", v.Username, func(s string) bool { return validName(usernamePattern, s) }},
		{"broker", v.Broker, func(s string) bool { return validName(brokerPattern, s) }},
		{"host", v.Host, validHost},
		{"port", v.Port, func(s string) bool { return validatePort(s) == nil }},
		{"password", v.Password, func(s string) bool { return checkPasswordPolicy(s) == nil }},
		{"scheme.semp", v.Scheme.Semp, func(s string) bool { return schemeOK(s, sempTLS, sempPlain) }},
		{"scheme.client", v.Scheme.Client, func(s string) bool { return schemeOK(s, clientTLS, clientPlain) }},
	}
	for _, c := range checks {
		if len(c.vec.Valid) == 0 || len(c.vec.Invalid) == 0 {
			t.Fatalf("%s: both lists need at least one vector", c.name)
		}
		for _, s := range c.vec.Valid {
			if !c.ok(s) {
				t.Errorf("%s %q: want valid", c.name, s)
			}
		}
		for _, s := range c.vec.Invalid {
			if c.ok(s) {
				t.Errorf("%s %q: want invalid", c.name, s)
			}
		}
	}
	if len(v.Modules.Valid) == 0 || len(v.Modules.Invalid) == 0 {
		t.Fatal("modules: both lists need at least one vector")
	}
	for _, ids := range v.Modules.Valid {
		if err := checkModuleIDs("modules", ids); err != nil {
			t.Errorf("modules %q: want valid, got %v", ids, err)
		}
	}
	for _, ids := range v.Modules.Invalid {
		if checkModuleIDs("modules", ids) == nil {
			t.Errorf("modules %q: want invalid", ids)
		}
	}
}
