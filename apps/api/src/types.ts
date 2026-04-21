export interface UpdateSummary {
  branch: string;
  localHash: string;
  remoteHash: string | null;
  isBehind: boolean;
  commits: Array<{
    hash: string;
    message: string;
    author: string;
    date: string;
  }>;
}

export interface DeploymentRecord {
  id: string;
  status: 'completed' | 'failed';
  startedAt: string;
  finishedAt: string;
  fromHash: string;
  targetHash: string | null;
  deployedHash: string;
  commits: UpdateSummary['commits'];
  error?: string;
}

export interface RuntimeUpdateState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  currentRunId?: string | null;
  output: string[];
  history: DeploymentRecord[];
  error?: string;
}

export interface ServiceIntegrationStatus {
  adguard: {
    configured: boolean;
    url: string;
  };
  nginxProxyManager: {
    configured: boolean;
    url: string;
  };
  updateAuthRequired: boolean;
}

export interface DomainProvisionRequest {
  domain: string;
  appIp: string;
  appPort: number;
  ssl: boolean;
}

export interface DomainProvisionResult {
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
