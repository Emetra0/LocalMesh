import { FormEvent, useEffect, useState } from 'react';

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface HealthResponse {
  serverIp: string;
  dashboardPort: number;
  apiPort: number;
  installRoot: string;
  composeFile: string;
  integrations: {
    adguard: { configured: boolean; url: string };
    nginxProxyManager: { configured: boolean; url: string };
    updateAuthRequired: boolean;
  };
}

interface DnsRewrite {
  domain: string;
  answer: string;
}

interface ProxyHost {
  id: number;
  domain_names: string[];
  forward_scheme: string;
  forward_host: string;
  forward_port: number;
  ssl_forced: boolean;
  enabled: boolean;
  certificate_id: number;
}

interface UpdateCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

interface UpdateResponse {
  summary: {
    branch: string;
    localHash: string;
    remoteHash: string | null;
    isBehind: boolean;
    commits: UpdateCommit[];
  };
  runtime: {
    status: 'idle' | 'running' | 'completed' | 'failed';
    startedAt: string | null;
    finishedAt: string | null;
    output: string[];
    history: Array<{
      id: string;
      status: 'completed' | 'failed';
      startedAt: string;
      finishedAt: string;
      fromHash: string;
      targetHash: string | null;
      deployedHash: string;
      commits: UpdateCommit[];
      error?: string;
    }>;
  };
}

interface DomainFormState {
  domain: string;
  appIp: string;
  appPort: string;
  ssl: boolean;
}

const adminTokenStorageKey = 'localmesh-admin-token';
const initialDomainState: DomainFormState = { domain: '', appIp: '', appPort: '', ssl: true };

function formatHash(hash: string | null | undefined) {
  return hash ? hash.slice(0, 7) : 'n/a';
}

// â”€â”€ App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [updateData, setUpdateData] = useState<UpdateResponse | null>(null);
  const [dnsRewrites, setDnsRewrites] = useState<DnsRewrite[]>([]);
  const [proxyHosts, setProxyHosts] = useState<ProxyHost[]>([]);
  const [domainForm, setDomainForm] = useState<DomainFormState>(initialDomainState);
  const [provisionMsg, setProvisionMsg] = useState('');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');
  const [adminToken, setAdminToken] = useState<string>(
    () => window.localStorage.getItem(adminTokenStorageKey) ?? '',
  );

  useEffect(() => {
    window.localStorage.setItem(adminTokenStorageKey, adminToken);
  }, [adminToken]);

  async function loadHealth() {
    try {
      const res = await fetch('/api/health');
      setHealth((await res.json()) as HealthResponse);
    } catch { /* starting up */ }
  }

  async function loadUpdateStatus() {
    try {
      const res = await fetch('/api/update/status');
      const payload = (await res.json()) as UpdateResponse;
      if (payload.summary && payload.runtime) setUpdateData(payload);
    } catch { /* starting up */ }
  }

  async function loadDnsRewrites() {
    try {
      const res = await fetch('/api/dns/rewrites');
      if (res.ok) setDnsRewrites((await res.json()) as DnsRewrite[]);
    } catch { /* adguard not ready yet */ }
  }

  async function loadProxyHosts() {
    try {
      const res = await fetch('/api/proxy/hosts');
      if (res.ok) setProxyHosts((await res.json()) as ProxyHost[]);
    } catch { /* npm not ready yet */ }
  }

  function authHeaders() {
    return { 'x-localmesh-admin-token': adminToken };
  }

  useEffect(() => {
    void loadHealth();
    void loadUpdateStatus();
    void loadDnsRewrites();
    void loadProxyHosts();
    const id = window.setInterval(() => {
      void loadUpdateStatus();
      void loadDnsRewrites();
      void loadProxyHosts();
    }, 8000);
    return () => window.clearInterval(id);
  }, []);

  async function handleDeleteDns(domain: string, answer: string) {
    await fetch('/api/dns/rewrites', {
      method: 'DELETE',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, answer }),
    });
    void loadDnsRewrites();
  }

  async function handleDeleteProxy(id: number) {
    await fetch(`/api/proxy/hosts/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    void loadProxyHosts();
  }

  async function handleDomainSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProvisionMsg('');
    setIsProvisioning(true);
    try {
      const res = await fetch('/api/domains/provision', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domainForm.domain,
          appIp: domainForm.appIp,
          appPort: Number(domainForm.appPort),
          ssl: domainForm.ssl,
        }),
      });
      const payload = await res.json() as { error?: string; domain?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Provisioning failed');
      setProvisionMsg(`Provisioned ${payload.domain ?? domainForm.domain} â€” DNS + proxy route created.`);
      setDomainForm(initialDomainState);
      void loadDnsRewrites();
      void loadProxyHosts();
    } catch (err) {
      setProvisionMsg(err instanceof Error ? err.message : 'Provisioning failed');
    } finally {
      setIsProvisioning(false);
    }
  }

  async function handleUpdateClick() {
    const res = await fetch('/api/update', { method: 'POST', headers: authHeaders() });
    const payload = await res.json() as { message: string };
    setUpdateMsg(payload.message);
    void loadUpdateStatus();
  }

  const isRunning = updateData?.runtime?.status === 'running';

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">LocalMesh Control Plane</p>
          <h1>Network admin dashboard</h1>
          <p className="lede">
            One interface to manage DNS (AdGuard), reverse proxy (Nginx Proxy Manager),
            TLS certificates (mkcert), and LocalMesh updates â€” all without touching
            the individual service UIs.
          </p>
        </div>
        <div className="hero-card">
          <span>Dashboard</span>
          <strong>http://{health?.serverIp ?? 'â€¦'}:2690</strong>
          <span>DNS: {health?.serverIp ?? 'â€¦'}:53</span>
          <span>Proxy: {health?.serverIp ?? 'â€¦'}:80 / 443</span>
          <span className={health?.integrations.adguard.configured ? 'ok' : 'warn'}>
            AdGuard: {health?.integrations.adguard.configured ? 'configured' : 'credentials missing'}
          </span>
          <span className={health?.integrations.nginxProxyManager.configured ? 'ok' : 'warn'}>
            NPM: {health?.integrations.nginxProxyManager.configured ? 'configured' : 'credentials missing'}
          </span>
        </div>
      </header>

      {/* Admin token */}
      <div className="token-banner">
        <label>
          Admin token
          <input
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="Paste LOCALMESH_UPDATE_TOKEN from /opt/localmesh/.env.production"
          />
        </label>
        <p className="hint-text">
          {health?.integrations.updateAuthRequired
            ? 'Required for provisioning and updates.'
            : 'No token configured on this server â€” all actions are open.'}
        </p>
      </div>

      <main className="grid">

        {/* â”€â”€ Provision new domain â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="panel wide">
          <div className="panel-head">
            <div>
              <p className="section-tag">Add domain</p>
              <h2>Provision a new route</h2>
            </div>
            <p>Creates DNS rewrite in AdGuard, optional mkcert TLS cert, and proxy host in NPM â€” in one click.</p>
          </div>
          <form className="domain-form" onSubmit={handleDomainSubmit}>
            <label>
              Domain name
              <input required value={domainForm.domain}
                onChange={(e) => setDomainForm({ ...domainForm, domain: e.target.value })}
                placeholder="myapp.local" />
            </label>
            <label>
              App IP
              <input required value={domainForm.appIp}
                onChange={(e) => setDomainForm({ ...domainForm, appIp: e.target.value })}
                placeholder="10.0.0.50" />
            </label>
            <label>
              App port
              <input required value={domainForm.appPort}
                onChange={(e) => setDomainForm({ ...domainForm, appPort: e.target.value })}
                placeholder="8080" />
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={domainForm.ssl}
                onChange={(e) => setDomainForm({ ...domainForm, ssl: e.target.checked })} />
              Enable SSL (mkcert certificate)
            </label>
            <div className="action-row">
              <button className="primary-button" type="submit"
                disabled={isProvisioning || !adminToken}>
                {isProvisioning ? 'Provisioningâ€¦' : 'Provision domain'}
              </button>
            </div>
          </form>
          {provisionMsg && <p className="note">{provisionMsg}</p>}
        </section>

        {/* â”€â”€ DNS rewrites â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="panel wide">
          <div className="panel-head">
            <div>
              <p className="section-tag">AdGuard Home â€” DNS</p>
              <h2>Active DNS rewrites</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => void loadDnsRewrites()}>
              Refresh
            </button>
          </div>
          {dnsRewrites.length === 0 ? (
            <p className="note subtle">No DNS rewrites yet. Use the form above to add one, or check AdGuard credentials in .env.production.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Domain</th><th>Resolves to</th><th></th></tr>
              </thead>
              <tbody>
                {dnsRewrites.map((r) => (
                  <tr key={`${r.domain}-${r.answer}`}>
                    <td>{r.domain}</td>
                    <td>{r.answer}</td>
                    <td>
                      <button className="danger-button" type="button"
                        disabled={!adminToken}
                        onClick={() => void handleDeleteDns(r.domain, r.answer)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* â”€â”€ Proxy hosts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="panel wide">
          <div className="panel-head">
            <div>
              <p className="section-tag">Nginx Proxy Manager â€” Routes</p>
              <h2>Active proxy hosts</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => void loadProxyHosts()}>
              Refresh
            </button>
          </div>
          {proxyHosts.length === 0 ? (
            <p className="note subtle">No proxy hosts yet. Use the form above to add one, or check NPM credentials in .env.production.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Domain</th><th>Forwards to</th><th>SSL</th><th></th></tr>
              </thead>
              <tbody>
                {proxyHosts.map((h) => (
                  <tr key={h.id}>
                    <td>{h.domain_names.join(', ')}</td>
                    <td>{h.forward_scheme}://{h.forward_host}:{h.forward_port}</td>
                    <td>{h.ssl_forced ? 'Yes' : 'No'}</td>
                    <td>
                      <button className="danger-button" type="button"
                        disabled={!adminToken}
                        onClick={() => void handleDeleteProxy(h.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* â”€â”€ Updates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="panel wide">
          <div className="panel-head">
            <div>
              <p className="section-tag">LocalMesh â€” Self update</p>
              <h2>Repo-driven update</h2>
            </div>
            <button className="primary-button" type="button"
              onClick={() => void handleUpdateClick()}
              disabled={isRunning || !adminToken}>
              {isRunning ? 'Updatingâ€¦' : 'Run update'}
            </button>
          </div>
          <div className="update-grid">
            <div className="metric-card">
              <span>Branch</span>
              <strong>{updateData?.summary?.branch ?? 'unknown'}</strong>
            </div>
            <div className="metric-card">
              <span>Behind remote</span>
              <strong>{updateData?.summary?.isBehind ? 'Yes' : 'No'}</strong>
            </div>
            <div className="metric-card">
              <span>Current</span>
              <strong>{formatHash(updateData?.summary?.localHash)}</strong>
            </div>
            <div className="metric-card">
              <span>Latest</span>
              <strong>{formatHash(updateData?.summary?.remoteHash)}</strong>
            </div>
          </div>
          {updateMsg && <p className="note">{updateMsg}</p>}
          <div className="log-panel">
            <div>
              <h3>Update output</h3>
              <pre>{updateData?.runtime?.output?.join('\n') || 'No update run yet.'}</pre>
            </div>
            <div>
              <h3>Pending commits</h3>
              <ul className="commit-list">
                {(updateData?.summary?.commits?.length
                  ? updateData.summary.commits
                  : [{ hash: 'none', message: 'No pending commits', author: '', date: '' }]
                ).map((c) => (
                  <li key={`${c.hash}-${c.message}`}>
                    <strong>{c.message}</strong>
                    <span>{c.author}{c.date ? ` â€” ${new Date(c.date).toLocaleString()}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {(updateData?.runtime?.history?.length ?? 0) > 0 && (
            <div className="history-panel">
              <h3>Deployment history</h3>
              <ul className="commit-list history-list">
                {updateData!.runtime.history.map((entry) => (
                  <li key={entry.id}>
                    <strong>
                      {entry.error
                        ? `Failed: ${entry.error}`
                        : `${entry.status} â€” ${formatHash(entry.fromHash)} â†’ ${formatHash(entry.deployedHash)}`}
                    </strong>
                    <span>{entry.startedAt ? new Date(entry.startedAt).toLocaleString() : ''}</span>
                    <span>{entry.commits.length} commit(s) applied</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
