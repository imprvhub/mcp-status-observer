#!/usr/bin/env node
import axios from 'axios';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { pathToFileURL } from 'node:url';

const http = axios.create({
  timeout: 15000,
  headers: { 'User-Agent': 'mcp-status-observer (+https://github.com/imprvhub/mcp-status-observer)' },
});

/**
 * Every platform here is read straight from its vendor's own status API.
 * `statuspage` covers the Atlassian Statuspage v2 `summary.json` shape, which is
 * what the large majority of vendors publish; `slack` and `gcp` are the two
 * one-off shapes worth special-casing.
 */
type ApiKind = 'statuspage' | 'slack' | 'gcp';

interface Platform {
  id: string;
  name: string;
  description: string;
  kind: ApiKind;
  url: string;
  /** For gcp-backed entries: only report incidents touching these products. */
  productFilter?: RegExp;
}

const STATUSPAGE: Array<[string, string, string, string]> = [
  ['amplitude', 'Amplitude', 'Analytics platform', 'https://status.amplitude.com'],
  ['anthropic', 'Anthropic (Claude)', 'AI assistant provider', 'https://status.anthropic.com'],
  ['asana', 'Asana', 'Team workflow management', 'https://status.asana.com'],
  ['atlassian', 'Atlassian', 'Developer collaboration tools', 'https://status.atlassian.com'],
  ['cloudflare', 'Cloudflare', 'Web infrastructure and security', 'https://www.cloudflarestatus.com'],
  ['digitalocean', 'DigitalOcean', 'Cloud infrastructure', 'https://status.digitalocean.com'],
  ['discord', 'Discord', 'Messaging platform', 'https://discordstatus.com'],
  ['docker', 'Docker', 'Container platform and services', 'https://www.dockerstatus.com'],
  ['dropbox', 'Dropbox', 'File hosting', 'https://status.dropbox.com'],
  ['github', 'GitHub', 'Version control platform', 'https://www.githubstatus.com'],
  ['linkedin', 'LinkedIn', 'Professional network', 'https://www.linkedin-status.com'],
  ['netlify', 'Netlify', 'Web development platform', 'https://www.netlifystatus.com'],
  ['npm', 'npm', 'JavaScript package manager', 'https://status.npmjs.org'],
  ['openai', 'OpenAI', 'AI services provider', 'https://status.openai.com'],
  ['reddit', 'Reddit', 'Social news platform', 'https://www.redditstatus.com'],
  ['supabase', 'Supabase', 'Open source backend platform', 'https://status.supabase.com'],
  ['twilio', 'Twilio', 'Cloud communications', 'https://status.twilio.com'],
  ['vercel', 'Vercel', 'Frontend deployment platform', 'https://www.vercel-status.com'],
];

const GCP_INCIDENTS = 'https://status.cloud.google.com/incidents.json';

function buildPlatforms(): Map<string, Platform> {
  const map = new Map<string, Platform>();

  for (const [id, name, description, origin] of STATUSPAGE) {
    map.set(id, { id, name, description, kind: 'statuspage', url: `${origin}/api/v2/summary.json` });
  }

  map.set('slack', {
    id: 'slack',
    name: 'Slack',
    description: 'Business communication',
    kind: 'slack',
    url: 'https://status.slack.com/api/v2.0.0/current',
  });

  map.set('gcp', {
    id: 'gcp',
    name: 'Google Cloud Platform',
    description: 'Cloud computing services',
    kind: 'gcp',
    url: GCP_INCIDENTS,
  });

  map.set('gemini', {
    id: 'gemini',
    name: 'Gemini / Vertex AI',
    description: 'Google multimodal AI platform (reported through Google Cloud)',
    kind: 'gcp',
    url: GCP_INCIDENTS,
    productFilter: /gemini|vertex ai|generative ai/i,
  });

  return map;
}

function normalizeStatus(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('operational') || s.includes('normal') || s === 'good' || s === 'ok' || s === 'none') {
    return 'Operational ✅';
  }
  if (s.includes('degraded') || s.includes('partial') || s.includes('minor')) {
    return 'Degraded Performance ⚠️';
  }
  if (s.includes('major') || s.includes('outage') || s.includes('critical') || s.includes('down')) {
    return 'Major Outage 🔴';
  }
  if (s.includes('maintenance')) return 'Under Maintenance 🔧';
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
}

/** ISO 8601 UTC, so the answer does not depend on the host's locale. */
function formatTime(timestamp: string | undefined): string {
  if (!timestamp) return 'unknown';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString().replace('.000Z', 'Z');
}

interface StatuspageComponent {
  name: string;
  status: string;
  description?: string;
  group?: boolean;
}

interface StatuspageSummary {
  page?: { name?: string; updated_at?: string };
  status?: { indicator?: string; description?: string };
  components?: StatuspageComponent[];
  incidents?: Array<{
    name: string;
    impact?: string;
    status?: string;
    shortlink?: string;
    updated_at?: string;
    incident_updates?: Array<{ body?: string; created_at?: string }>;
  }>;
  scheduled_maintenances?: Array<{ name: string; scheduled_for?: string; status?: string }>;
}

interface GcpIncident {
  id: string;
  external_desc?: string;
  begin?: string;
  end?: string;
  modified?: string;
  status_impact?: string;
  currently_affected_locations?: Array<{ title?: string }>;
  affected_products?: Array<{ title?: string }>;
  most_recent_update?: { text?: string; when?: string };
}

class StatusObserver {
  private platforms = buildPlatforms();

  getPlatform(id: string): Platform | undefined {
    return this.platforms.get(id);
  }

  getPlatformsList(): string {
    const lines = ['Available platforms:', ''];
    for (const p of [...this.platforms.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      lines.push(`- ${p.id} — ${p.name}: ${p.description}`);
    }
    lines.push('');
    lines.push(`${this.platforms.size} platforms. Query one with 'status --github', or all of them with 'status --all'.`);
    return lines.join('\n');
  }

  async getPlatformStatus(platformId: string): Promise<string> {
    const platform = this.platforms.get(platformId);
    if (!platform) {
      return `Platform '${platformId}' not found. Use 'status list' to see available platforms.`;
    }
    try {
      switch (platform.kind) {
        case 'statuspage':
          return this.renderStatuspage(platform, (await http.get<StatuspageSummary>(platform.url)).data);
        case 'slack':
          return this.renderSlack(platform, (await http.get(platform.url)).data);
        case 'gcp':
          return this.renderGcp(platform, (await http.get<GcpIncident[]>(platform.url)).data);
      }
    } catch (error) {
      const detail = axios.isAxiosError(error) ? `HTTP ${error.response?.status ?? error.code}` : 'unexpected error';
      console.error(`Error fetching status for ${platform.name}:`, error);
      return `Unable to fetch status for ${platform.name} (${detail}). The vendor's status API may be temporarily unavailable.`;
    }
  }

  private renderStatuspage(platform: Platform, data: StatuspageSummary): string {
    const out = [`${platform.name} Status:`];
    out.push(`Overall: ${normalizeStatus(data.status?.description || data.status?.indicator || 'unknown')}`);

    // Statuspage pages range from ~10 to ~200 components. Listing every healthy one
    // buries the signal, so report the count and name only what is not operational.
    const components = (data.components || []).filter(c => !c.group);
    const degraded = components.filter(c => (c.status || '').toLowerCase() !== 'operational');
    if (components.length) {
      out.push('');
      if (degraded.length === 0) {
        out.push(`Components: all ${components.length} operational ✅`);
      } else {
        out.push(`Components: ${degraded.length} of ${components.length} not operational:`);
        for (const c of degraded) {
          out.push(`- ${c.name}: ${normalizeStatus(c.status)}`);
          if (c.description) out.push(`  ${c.description}`);
        }
      }
    }

    const incidents = data.incidents || [];
    if (incidents.length) {
      out.push('');
      out.push('Active incidents:');
      for (const incident of incidents.slice(0, 5)) {
        out.push(`- ${incident.name} [${normalizeStatus(incident.impact || 'unknown')}, ${incident.status || 'unknown'}]`);
        const latest = incident.incident_updates?.[0]?.body;
        if (latest) out.push(`  ${latest.replace(/\s+/g, ' ').slice(0, 400)}`);
        if (incident.shortlink) out.push(`  ${incident.shortlink}`);
      }
    } else {
      out.push('');
      out.push('Active incidents: none reported.');
    }

    const maintenances = data.scheduled_maintenances || [];
    if (maintenances.length) {
      out.push('');
      out.push('Scheduled maintenance:');
      for (const m of maintenances.slice(0, 5)) {
        out.push(`- ${m.name} (${m.status || 'scheduled'}) at ${formatTime(m.scheduled_for)}`);
      }
    }

    out.push('');
    out.push(`Last Updated: ${formatTime(data.page?.updated_at)}`);
    return out.join('\n');
  }

  private renderSlack(platform: Platform, data: any): string {
    const incidents: any[] = data?.active_incidents || [];
    const out = [`${platform.name} Status:`];
    out.push(`Overall: ${normalizeStatus(incidents.length ? 'degraded' : data?.status || 'ok')}`);
    out.push('');
    if (incidents.length) {
      out.push('Active incidents:');
      for (const incident of incidents.slice(0, 5)) {
        out.push(`- ${incident.title || 'Incident'} [${incident.type || 'unknown'}, ${incident.status || 'unknown'}]`);
        if (incident.services?.length) out.push(`  Services: ${incident.services.join(', ')}`);
      }
    } else {
      out.push('Active incidents: none reported.');
    }
    out.push('');
    out.push(`Last Updated: ${formatTime(data?.date_updated || data?.date_created)}`);
    return out.join('\n');
  }

  /**
   * Google publishes incidents, not a rolled-up status, so "operational" here means
   * "no incident is currently open" — an incident is open while it has no `end`.
   */
  private renderGcp(platform: Platform, incidents: GcpIncident[]): string {
    const matches = (incident: GcpIncident) =>
      !platform.productFilter ||
      (incident.affected_products || []).some(p => platform.productFilter!.test(p.title || ''));

    const relevant = (incidents || []).filter(matches);
    const open = relevant.filter(i => !i.end);

    const out = [`${platform.name} Status:`];
    out.push(`Overall: ${normalizeStatus(open.length ? open[0].status_impact || 'degraded' : 'operational')}`);
    out.push('');

    if (open.length) {
      out.push('Open incidents:');
      for (const incident of open.slice(0, 5)) {
        const products = (incident.affected_products || []).map(p => p.title).filter(Boolean).join(', ');
        out.push(`- ${incident.external_desc || 'Incident'} [${incident.status_impact || 'unknown'}]`);
        if (products) out.push(`  Products: ${products}`);
        const locations = (incident.currently_affected_locations || []).map(l => l.title).filter(Boolean);
        if (locations.length) out.push(`  Locations: ${locations.join(', ')}`);
        if (incident.most_recent_update?.text) {
          out.push(`  ${incident.most_recent_update.text.replace(/\s+/g, ' ').slice(0, 400)}`);
        }
        out.push(`  Began: ${formatTime(incident.begin)}`);
      }
    } else {
      out.push('Open incidents: none reported.');
      const [mostRecent] = relevant;
      if (mostRecent) {
        out.push('');
        out.push(`Most recent resolved incident: ${mostRecent.external_desc || 'Incident'} (ended ${formatTime(mostRecent.end)})`);
      }
    }

    out.push('');
    out.push(`Source: https://status.cloud.google.com`);
    return out.join('\n');
  }

  /** One line per platform, fetched concurrently — used by `status --all`. */
  async getAllPlatformsStatus(): Promise<string> {
    const ids = [...this.platforms.keys()].sort();
    const lines = await Promise.all(ids.map(id => this.getQuickPlatformStatus(id)));
    return ['Status for all platforms:', '', ...lines].join('\n');
  }

  private async getQuickPlatformStatus(platformId: string): Promise<string> {
    const platform = this.platforms.get(platformId)!;
    try {
      switch (platform.kind) {
        case 'statuspage': {
          const { data } = await http.get<StatuspageSummary>(platform.url);
          const incidents = data.incidents?.length ?? 0;
          const suffix = incidents ? ` (${incidents} active incident${incidents > 1 ? 's' : ''})` : '';
          return `- ${platform.name}: ${normalizeStatus(data.status?.description || data.status?.indicator || 'unknown')}${suffix}`;
        }
        case 'slack': {
          const { data } = await http.get(platform.url);
          const open = data?.active_incidents?.length ?? 0;
          return `- ${platform.name}: ${normalizeStatus(open ? 'degraded' : data?.status || 'ok')}${open ? ` (${open} active)` : ''}`;
        }
        case 'gcp': {
          const { data } = await http.get<GcpIncident[]>(platform.url);
          const open = (data || []).filter(
            i => !i.end && (!platform.productFilter || (i.affected_products || []).some(p => platform.productFilter!.test(p.title || '')))
          );
          return `- ${platform.name}: ${normalizeStatus(open.length ? open[0].status_impact || 'degraded' : 'operational')}${open.length ? ` (${open.length} open)` : ''}`;
        }
      }
    } catch {
      return `- ${platform.name}: status unavailable ❔`;
    }
  }
}

const statusObserver = new StatusObserver();

const server = new Server(
  { name: 'mcp-status-observer', version: '0.8.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'status',
      description:
        'Check the operational status of major digital platforms, read from each vendor\'s official status API. ' +
        'Covers AI providers (Anthropic, OpenAI, Gemini), clouds (GCP, Cloudflare, DigitalOcean, Vercel, Netlify, Supabase) ' +
        'and developer or workplace tools (GitHub, Docker, npm, Slack, Atlassian, Discord, Dropbox, Twilio, Asana, Reddit, LinkedIn, Amplitude).',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description:
              "'list' to see every supported platform, 'all' for a one-line summary of each, " +
              "or a platform id such as 'github', 'anthropic' or 'gcp'. A leading '--' is accepted too (e.g. '--github').",
          },
        },
        required: ['command'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name !== 'status') throw new Error(`Unknown tool: ${name}`);

  // The published interface used a `--platform` convention; bare ids are accepted
  // as well so the model does not have to remember the prefix.
  const raw = (typeof args?.command === 'string' ? args.command : '').trim().toLowerCase();
  const command = raw.replace(/^--/, '');

  if (!command || command === 'list' || command === 'help') {
    return { content: [{ type: 'text', text: statusObserver.getPlatformsList() }] };
  }
  if (command === 'all') {
    return { content: [{ type: 'text', text: await statusObserver.getAllPlatformsStatus() }] };
  }
  if (!statusObserver.getPlatform(command)) {
    return {
      content: [
        {
          type: 'text',
          text: `Platform '${command}' is not supported.\n\n${statusObserver.getPlatformsList()}`,
        },
      ],
    };
  }
  return { content: [{ type: 'text', text: await statusObserver.getPlatformStatus(command) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Status Observer server running on stdio');
}

// Only start the transport when run as a program; importing this module (tests) must not.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
  });
}

export { normalizeStatus, formatTime, StatusObserver };
