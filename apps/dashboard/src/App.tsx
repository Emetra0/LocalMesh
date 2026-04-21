import { FormEvent, useEffect, useState } from 'react';

interface HealthResponse {
  serverIp: string;
  dashboardPort: number;
  apiPort: number;
  installRoot: string;
  composeFile: string;
  integrations: {
    adguard: {
      configured: boolean;
      url: string;
    };
    nginxProxyManager: {
      configured: boolean;
      url: string;
    };
    updateAuthRequired: boolean;
  };
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
    error?: string;
  };
}

interface ProvisionResponse {
  domain: string;
  dns: {
    status: 'created' | 'updated' | 'unchanged';
    answer: string;
  };
  certificate: {
    status: 'created' | 'skipped';
    certificateId: number | null;
    certificatePath?: string;
    keyPath?: string;
  };
  proxy: {
    status: 'created' | 'updated';
    hostId: number;
  };
  notes: string[];
}

interface DomainFormState {
  domain: string;
  appIp: string;
  appPort: string;
  ssl: boolean;
}

const initialDomainState: DomainFormState = {
  domain: '',
  appIp: '',
  appPort: '',
  ssl: true,
};

const adminTokenStorageKey = 'localmesh-admin-token';

function formatHash(hash: string | null | undefined) {
  return hash ? hash.slice(0, 7) : 'n/a';
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [updateData, setUpdateData] = useState<UpdateResponse | null>(null);
  const [domainForm, setDomainForm] = useState<DomainFormState>(initialDomainState);
  const [provisionResult, setProvisionResult] = useState<ProvisionResponse | null>(null);
  const [provisionMessage, setProvisionMessage] = useState<string>('');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [lastUpdateMessage, setLastUpdateMessage] = useState<string>('');
  const [adminToken, setAdminToken] = useState<string>(() => window.localStorage.getItem(adminTokenStorageKey) ?? '');

  useEffect(() => {
    window.localStorage.setItem(adminTokenStorageKey, adminToken);
  }, [adminToken]);

  async function loadHealth() {
    const response = await fetch('/api/health');
    const payload = (await response.json()) as HealthResponse;
    setHealth(payload);
  }

  async function loadUpdateStatus() {
    const response = await fetch('/api/update/status');
    const payload = (await response.json()) as UpdateResponse;
    setUpdateData(payload);
  }

  useEffect(() => {
    void loadHealth();
    void loadUpdateStatus();

    const pollId = window.setInterval(() => {
      void loadUpdateStatus();
    }, 5000);

    return () => window.clearInterval(pollId);
  }, []);

  async function handleUpdateClick() {
    const response = await fetch('/api/update', {
      method: 'POST',
      headers: {
        'x-localmesh-admin-token': adminToken,
      },
    });
    const payload = (await response.json()) as { accepted: boolean; message: string };
    setLastUpdateMessage(payload.message);
    void loadUpdateStatus();
  }

  async function handleDomainSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProvisionMessage('');
    setProvisionResult(null);
    setIsProvisioning(true);

    try {
      const response = await fetch('/api/domains/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-localmesh-admin-token': adminToken,
        },
        body: JSON.stringify({
          domain: domainForm.domain,
          appIp: domainForm.appIp,
          appPort: Number(domainForm.appPort),
          ssl: domainForm.ssl,
        }),
      });

      const payload = (await response.json()) as ProvisionResponse | { error: string };
      if (!response.ok) {
        throw new Error('error' in payload ? payload.error : 'Provisioning failed');
      }

      setProvisionResult(payload as ProvisionResponse);
      setProvisionMessage(`Provisioned ${domainForm.domain} through AdGuard Home and Nginx Proxy Manager.`);
    } catch (error) {
      setProvisionMessage(error instanceof Error ? error.message : 'Provisioning failed');
    } finally {
      setIsProvisioning(false);
    }
  }

  const setupSteps = [
    `Dashboard -> DNS Entries -> Add ${domainForm.domain || '<domain>'} to ${health?.serverIp ?? '<server-ip>'}`,
    domainForm.ssl ? `Dashboard -> SSL Certs -> Generate certificate for ${domainForm.domain || '<domain>'}` : 'SSL disabled for this route',
    `Dashboard -> Proxy Routes -> Add ${domainForm.domain || '<domain>'} to ${domainForm.appIp || '<app-ip>'}:${domainForm.appPort || '<port>'}${domainForm.ssl ? ' with SSL enabled' : ''}`,
  ];

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">LocalMesh Administrator AI</p>
          <h1>Ubuntu-first local network control plane</h1>
          <p className="lede">
            Manage DNS, proxying, certificates, updates, and install automation for AdGuard Home,
            Nginx Proxy Manager, mkcert, and the LocalMesh dashboard.
          </p>
        </div>
        <div className="hero-card">
          <span>Dashboard</span>
          <strong>{health ? `http://${health.serverIp}:${health.dashboardPort}` : 'Loading'}</strong>
          <span>Install root: {health?.installRoot ?? '/opt/localmesh'}</span>
        </div>
      </header>

      <main className="grid">
        <section className="panel wide">
          <div className="panel-head">
            <div>
              <p className="section-tag">Quick Setup</p>
              <h2>Provision a new domain</h2>
            </div>
            <p>LocalMesh can now push the DNS rewrite, optional mkcert certificate, and proxy route directly.</p>
          </div>
          <form className="domain-form" onSubmit={handleDomainSubmit}>
            <label>
              Domain name
              <input required value={domainForm.domain} onChange={(event) => setDomainForm({ ...domainForm, domain: event.target.value })} placeholder="app.sky" />
            </label>
            <label>
              App local IP
              <input required value={domainForm.appIp} onChange={(event) => setDomainForm({ ...domainForm, appIp: event.target.value })} placeholder="10.0.0.50" />
            </label>
            <label>
              App port
              <input required value={domainForm.appPort} onChange={(event) => setDomainForm({ ...domainForm, appPort: event.target.value })} placeholder="3001" />
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={domainForm.ssl} onChange={(event) => setDomainForm({ ...domainForm, ssl: event.target.checked })} />
              Enable SSL for green padlock
            </label>
            <div className="action-row">
              <button className="primary-button" type="submit" disabled={isProvisioning || !adminToken}>
                {isProvisioning ? 'Provisioning...' : 'Provision domain'}
              </button>
              <span className="hint-text">This uses the same admin token as protected updates.</span>
            </div>
          </form>
          <ol className="steps">
            {setupSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="note subtle">{provisionMessage || 'Fill in the four required values, then LocalMesh will provision the route directly.'}</p>
          {provisionResult ? (
            <div className="result-grid">
              <div className="metric-card">
                <span>DNS rewrite</span>
                <strong>{provisionResult.dns.status}</strong>
              </div>
              <div className="metric-card">
                <span>Certificate</span>
                <strong>{provisionResult.certificate.status}</strong>
              </div>
              <div className="metric-card">
                <span>Proxy host</span>
                <strong>{provisionResult.proxy.status}</strong>
              </div>
              <div className="metric-card">
                <span>Server answer</span>
                <strong>{provisionResult.dns.answer}</strong>
              </div>
            </div>
          ) : null}
          {provisionResult?.notes.length ? (
            <ul className="service-list inline-list">
              {provisionResult.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="panel">
          <p className="section-tag">Services</p>
          <h2>Ports and entry points</h2>
          <ul className="service-list">
            <li>AdGuard Home: http://{health?.serverIp ?? 'SERVER_IP'}:3000</li>
            <li>Nginx Proxy Manager: http://{health?.serverIp ?? 'SERVER_IP'}:81</li>
            <li>LocalMesh Dashboard: http://{health?.serverIp ?? 'SERVER_IP'}:2690</li>
            <li>DNS: 53 TCP and UDP</li>
            <li>HTTP: 80</li>
            <li>HTTPS: 443</li>
          </ul>
          <div className="integration-stack">
            <p className="section-tag">Integration state</p>
            <span>AdGuard API: {health?.integrations.adguard.url ?? 'n/a'}</span>
            <span>NPM API: {health?.integrations.nginxProxyManager.url ?? 'n/a'}</span>
            <span>NPM credentials: {health?.integrations.nginxProxyManager.configured ? 'configured' : 'missing'}</span>
          </div>
        </section>

        <section className="panel">
          <p className="section-tag">Troubleshooting</p>
          <h2>First checks</h2>
          <ul className="service-list">
            <li>Domain issue: confirm DNS entry and proxy route exist.</li>
            <li>Service health: run localmesh status.</li>
            <li>Logs: localmesh logs adguard or localmesh logs nginx.</li>
            <li>SSL warning: install /opt/localmesh/ca/rootCA.pem on that device.</li>
            <li>Blocked port: sudo ufw allow PORT/tcp.</li>
          </ul>
        </section>

        <section className="panel wide">
          <div className="panel-head">
            <div>
              <p className="section-tag">Updates</p>
              <h2>Repo-driven update control</h2>
            </div>
            <button className="primary-button" onClick={handleUpdateClick} type="button" disabled={updateData?.runtime.status === 'running' || !adminToken}>
              {updateData?.runtime.status === 'running' ? 'Updating...' : 'Run update'}
            </button>
          </div>
          <div className="token-row">
            <label>
              Admin token
              <input
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                placeholder="Paste LOCALMESH_UPDATE_TOKEN"
              />
            </label>
            <p className="hint-text">
              {health?.integrations.updateAuthRequired
                ? 'Protected actions require the LocalMesh admin token from /opt/localmesh/.env.production.'
                : 'No update token is configured on this server.'}
            </p>
          </div>
          <div className="update-grid">
            <div className="metric-card">
              <span>Branch</span>
              <strong>{updateData?.summary.branch ?? 'unknown'}</strong>
            </div>
            <div className="metric-card">
              <span>Behind remote</span>
              <strong>{updateData?.summary.isBehind ? 'Yes' : 'No'}</strong>
            </div>
            <div className="metric-card">
              <span>Current</span>
              <strong>{formatHash(updateData?.summary.localHash)}</strong>
            </div>
            <div className="metric-card">
              <span>Latest</span>
              <strong>{formatHash(updateData?.summary.remoteHash)}</strong>
            </div>
          </div>
          <p className="note">{lastUpdateMessage || 'Upload your repo changes, then use this button to pull, rebuild, and restart LocalMesh.'}</p>
          <div className="log-panel">
            <div>
              <h3>Pending changes</h3>
              <ul className="commit-list">
                {(updateData?.summary.commits.length ? updateData.summary.commits : [{ hash: 'none', message: 'No remote commits detected', author: 'LocalMesh', date: '' }]).map((commit) => (
                  <li key={`${commit.hash}-${commit.message}`}>
                    <strong>{commit.message}</strong>
                    <span>{commit.author} {commit.date ? `- ${new Date(commit.date).toLocaleString()}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Update output</h3>
              <pre>{updateData?.runtime.output.join('\n') || 'No update run yet.'}</pre>
            </div>
          </div>
          <div className="history-panel">
            <h3>Deployment history</h3>
            <ul className="commit-list history-list">
              {(updateData?.runtime.history.length ? updateData.runtime.history : [{ id: 'none', status: 'completed', startedAt: '', finishedAt: '', fromHash: '', targetHash: '', deployedHash: '', commits: [], error: 'No deployment history yet.' }]).map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.error ? entry.error : `${entry.status} ${formatHash(entry.fromHash)} -> ${formatHash(entry.deployedHash)}`}</strong>
                  <span>
                    {entry.startedAt ? `${new Date(entry.startedAt).toLocaleString()} to ${new Date(entry.finishedAt).toLocaleString()}` : 'Run your first update to capture deployment history.'}
                  </span>
                  <span>{entry.commits.length ? `${entry.commits.length} remote commit(s) applied` : 'No remote commit metadata captured'}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
