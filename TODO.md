# ShieldTest — Roadmap

A prioritised roadmap for turning ShieldTest into a comprehensive firewall and network security benchmarking platform.

---

## Phase 1: Deeper Threat Coverage

**Goal:** Move beyond basic DNS blocklist testing to cover the full range of threats that enterprise firewalls claim to block.

### 1.1 Command & Control (C2) Detection
- [ ] Add [Feodo Tracker](https://feodotracker.abuse.ch/) connector — active C2 botnet domains and IPs
- [ ] Add [ThreatFox](https://threatfox.abuse.ch/) connector — IOCs from malware analysis (C2, payload delivery)
- [ ] New category: `c2` with dedicated scoring weight
- [ ] Test both DNS resolution and IP reachability for C2 infrastructure
- **Why:** C2 blocking is the most critical enterprise firewall capability. If malware phones home successfully, the breach is active.

### 1.2 Newly Registered Domain (NRD) Detection
- [ ] Add [CertStream](https://certstream.calidog.io/) or WHOIS-based feed for domains registered in the last 30 days
- [ ] New category: `nrd` — test if the firewall blocks brand-new domains
- [ ] Sample from domains 1–7 days old and 7–30 days old separately
- **Why:** Over 70% of malicious domains are used within 72 hours of registration. Enterprise firewalls like Palo Alto and FortiGate offer NRD blocking — this tests whether it actually works.

### 1.3 DGA Domain Detection
- [ ] Generate sample DGA (Domain Generation Algorithm) domains using known algorithms
- [ ] New category: `dga` — test if the firewall detects algorithmically generated domains
- [ ] Include samples from known malware families (Conficker, CryptoLocker, Necurs patterns)
- **Why:** DGA domains are a key indicator of botnet activity. Advanced firewalls use ML/heuristics to detect them.

### 1.4 Cryptomining & Cryptojacking
- [ ] Add known mining pool domain list (e.g. from [ZeroDot1/CoinBlockerLists](https://gitlab.com/ZeroDot1/CoinBlockerLists))
- [ ] New category: `cryptomining`
- **Why:** Cryptojacking is a common threat in enterprise environments, particularly on servers and workstations.

### 1.5 Better Clean Baseline
- [ ] Fix Tranco connector to handle ZIP download format
- [ ] Add [Cisco Umbrella](https://s3-us-west-1.amazonaws.com/umbrella-static/index.html) top 1M as alternative/supplementary clean list
- [ ] Weighted clean sampling: top-100 critical sites (banks, government, healthcare) tested separately
- **Why:** False positive testing is as important as threat blocking. A firewall that blocks Google or your bank is worse than useless.

---

## Phase 2: Beyond DNS — Protocol-Level Testing

**Goal:** Test firewall capabilities that go beyond simple DNS filtering.

### 2.1 HTTPS/TLS Inspection Testing
- [ ] Test if the probe can establish a TLS connection to known-bad domains (not just DNS resolve)
- [ ] Detect TLS interception (certificate replacement) — does the firewall do SSL inspection?
- [ ] New verdict: `BLOCKED_TLS` for connections terminated at TLS handshake
- [ ] Report whether the firewall is inspecting encrypted traffic or only blocking at DNS
- **Why:** DNS-only filtering is trivially bypassed. Enterprise firewalls that don't inspect TLS have a massive blind spot.

### 2.2 DNS-over-HTTPS (DoH) Bypass Testing
- [ ] Test if the probe can resolve domains via DoH providers (Cloudflare 1.1.1.1, Google 8.8.8.8, Quad9)
- [ ] New test category: `doh_bypass` — can users bypass DNS filtering entirely?
- [ ] Test DNS-over-TLS (DoT) on port 853 as well
- [ ] Report: "Your firewall's DNS filtering can be bypassed by any user installing Firefox (which uses DoH by default)"
- **Why:** This is the single most common way DNS filtering is bypassed in practice. Most organisations don't know they're vulnerable.

### 2.3 URL Path Filtering
- [ ] Test URLs with malicious paths on clean domains (e.g. `legitimate-cdn.com/malware/payload.exe`)
- [ ] Test known-bad URL patterns (`.exe` downloads, base64-encoded paths, double extensions)
- [ ] New category: `url_filtering` — tests HTTP-layer inspection, not just DNS
- **Why:** Sophisticated attacks use compromised legitimate domains. DNS filtering alone won't catch `drive.google.com/malicious-file`.

### 2.4 Non-Standard Port Testing
- [ ] Test outbound TCP connections on ports commonly used by malware: 4444, 8443, 8080, 1337, 9001
- [ ] Test against known C2 IPs on their actual ports
- [ ] Report which outbound ports are unrestricted
- **Why:** Enterprise firewalls should restrict outbound connections. An open port 4444 is a Metasploit default.

### 2.5 IP Reputation Testing
- [ ] Test connectivity to known-bad IP addresses (not just domains)
- [ ] Use [Emerging Threats](https://rules.emergingthreats.net/) compromised IP lists
- [ ] Test both DNS-resolved IPs and direct IP connections
- **Why:** Some malware uses hard-coded IPs, bypassing DNS entirely. IP reputation blocking is a critical firewall capability.

---

## Phase 3: Enterprise Features

**Goal:** Make ShieldTest useful for security teams, MSPs, and compliance audits.

### 3.1 Firewall Comparison Mode
- [ ] Side-by-side comparison view: run the same profile through two different networks
- [ ] Comparison report: "FortiGate 60F scored 87, Sophos XGS scored 72, Palo Alto PA-220 scored 91"
- [ ] Highlight where each firewall is stronger/weaker by category
- [ ] Visual comparison charts (radar chart overlay)
- **Why:** This is the killer feature for anyone evaluating firewall products or MSPs comparing offerings.

### 3.2 Compliance Mapping
- [ ] Map scoring categories to frameworks:
  - **NIST CSF** — PR.DS-5 (data leak prevention), DE.CM-1 (network monitoring)
  - **CIS Controls** — Control 9 (email/web browser protections), Control 7 (continuous vulnerability management)
  - **Essential Eight** — application control, restrict admin privileges
  - **ISO 27001** — A.13.1 (network security management)
- [ ] Compliance report view: "You meet X of Y controls related to DNS security"
- [ ] Exportable compliance evidence for auditors
- **Why:** Security teams need to justify firewall purchases and demonstrate compliance. A scored report mapped to frameworks is audit-ready evidence.

### 3.3 Scheduled Recurring Benchmarks
- [ ] Cron-style scheduling: run a benchmark weekly/monthly automatically
- [ ] Trend tracking: detect when protection degrades (subscription expired, policy misconfigured, feed update missed)
- [ ] Alert via webhook/email if score drops below a threshold
- **Why:** Firewall configs drift over time. Subscriptions expire silently. Regular testing catches regressions.

### 3.4 Multi-Probe Orchestration
- [ ] Start a benchmark that targets multiple probes simultaneously
- [ ] Test network segmentation: does the guest WiFi have the same filtering as the corporate LAN?
- [ ] VLAN-aware testing: probe identifies which VLAN/subnet it's on
- [ ] Aggregate report showing protection levels across network zones
- **Why:** Enterprise networks have multiple segments. A firewall might protect the corporate LAN but leave the IoT VLAN wide open.

### 3.5 PDF Report Generation
- [ ] Server-side PDF generation (Puppeteer or @react-pdf)
- [ ] Branded report template with logo, executive summary, and technical detail
- [ ] One-click export from any run detail page
- [ ] Include: overall score, category breakdown, methodology, recommendations
- **Why:** Management and auditors want printable reports, not dashboards. This is essential for enterprise sales and compliance evidence.

---

## Phase 4: Advanced Detection

**Goal:** Test sophisticated firewall capabilities that go beyond blocklist matching.

### 4.1 Data Exfiltration Detection
- [ ] Test DNS tunnelling: can the probe send data over DNS TXT records to an external server?
- [ ] Test HTTP-based exfiltration: can the probe POST data to a known external endpoint?
- [ ] New category: `exfiltration` — does the firewall detect data leaving the network?
- **Why:** Advanced attacks exfiltrate data via DNS tunnelling or HTTPS. Next-gen firewalls claim to detect this — this tests whether they actually do.

### 4.2 Tor and VPN Bypass Detection
- [ ] Test if the probe can reach Tor entry nodes and known VPN endpoints
- [ ] New category: `anonymisation_bypass`
- [ ] Report whether users can bypass all filtering by using Tor or a VPN
- **Why:** If users can trivially connect to Tor, all firewall filtering is academic.

### 4.3 Malware Download Simulation
- [ ] Test if the probe can download EICAR test files (industry-standard harmless test malware)
- [ ] Test downloads from known malware distribution URLs (HEAD request only — check if connection is blocked)
- [ ] New category: `download_prevention`
- **Why:** Tests the firewall's file-based threat prevention, not just domain blocking.

### 4.4 Phishing Page Detection (Beyond Domain)
- [ ] Test if the firewall blocks newly created phishing pages on compromised legitimate domains
- [ ] Test homograph attacks (domains using unicode characters that look like real brands)
- [ ] New category: `advanced_phishing`
- **Why:** Modern phishing doesn't use obvious `faceb00k-login.com` domains. It uses compromised WordPress sites and unicode tricks.

### 4.5 GeoIP Blocking Validation
- [ ] Test DNS resolution and reachability to domains hosted in specific countries
- [ ] Allow configuration of which countries should be blocked
- [ ] Report: "Your firewall blocks traffic to X of Y configured restricted countries"
- **Why:** Many organisations block traffic to/from specific countries as a policy. This validates that GeoIP blocking is working.

---

## Phase 5: Platform & Polish

**Goal:** Make ShieldTest production-grade for multi-tenant use and enterprise deployment.

### 5.1 Multi-Tenancy
- [ ] Organisations as top-level entity
- [ ] Each organisation has its own users, probes, runs, and data
- [ ] Admin portal for managing organisations
- **Why:** MSPs and security consultancies need to benchmark multiple clients.

### 5.2 User Management
- [ ] Role-based access: admin, analyst, viewer
- [ ] SSO integration (SAML, OIDC) for enterprise environments
- [ ] API key authentication for automation
- **Why:** Enterprise deployments need proper access control and SSO.

### 5.3 Probe as a Docker Container
- [ ] One-line probe deployment: `docker run -e PROBE_TOKEN=xxx shieldtest-probe`
- [ ] Pre-built images on Docker Hub or GitHub Container Registry
- [ ] ARM support for Raspberry Pi deployment
- **Why:** Not everyone has Node.js installed. Docker makes probe deployment trivial.

### 5.4 Probe as a Standalone Binary
- [ ] Compile probe to a single binary using `pkg` or Bun
- [ ] No Node.js dependency on the probe device
- [ ] Download from the web UI: "Download probe for macOS / Windows / Linux"
- **Why:** The ultimate ease of use. Download, configure, run.

### 5.5 Real-Time Progress
- [ ] Server-Sent Events (SSE) for live run progress updates
- [ ] Live updating dashboard during benchmark execution
- [ ] Progress bar on the runs page showing items tested in real time
- **Why:** Currently requires page refresh to see progress. SSE makes it feel alive.

### 5.6 Webhook Notifications
- [ ] Send results to Slack, Teams, or email when a benchmark completes
- [ ] Configurable alerts: "notify me if score drops below 70"
- [ ] Webhook URL for generic integrations
- **Why:** Security teams want alerts, not dashboards they have to check.

### 5.7 Prometheus Metrics
- [ ] `/metrics` endpoint for Prometheus scraping
- [ ] Expose: benchmark scores, indicator counts, sync health, probe status
- [ ] Grafana dashboard template
- **Why:** Enterprise teams already monitor with Prometheus/Grafana. ShieldTest should integrate with existing observability.

---

## Priority Order

For maximum impact with minimum effort:

1. **C2 detection** (Phase 1.1) — highest enterprise value, easy to implement
2. **DoH bypass testing** (Phase 2.2) — critical gap, unique differentiator
3. **Fix Tranco connector** (Phase 1.5) — needed for proper false positive testing
4. **Firewall comparison mode** (Phase 3.1) — the killer feature
5. **PDF reports** (Phase 3.5) — essential for enterprise adoption
6. **TLS inspection testing** (Phase 2.1) — tests what separates real firewalls from DNS filters
7. **Scheduled benchmarks** (Phase 3.3) — continuous monitoring
8. **Docker probe** (Phase 5.3) — ease of deployment
9. **NRD detection** (Phase 1.2) — tests advanced firewall features
10. **Compliance mapping** (Phase 3.2) — audit readiness

---

## Non-Goals (For Now)

Things ShieldTest deliberately does not do:

- **Penetration testing** — ShieldTest benchmarks filtering, it doesn't try to exploit vulnerabilities
- **IDS/IPS testing** — no payload-based detection testing (would require sending actual exploit traffic)
- **Performance/throughput testing** — ShieldTest measures filtering effectiveness, not gigabits per second
- **Wireless security testing** — no WiFi protocol analysis
- **Endpoint protection testing** — only tests network-level filtering, not antivirus

These could be added as separate modules later but are out of scope for the core benchmarking platform.
