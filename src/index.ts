import axios from 'axios';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

interface PlatformStatus {
  name: string;
  url: string;
  description: string;
  components?: {
    [key: string]: {
      name: string;
      status: string;
      description?: string;
    };
  };
}

interface StatusResponse {
  status: string;
  updated: string;
  components?: {
    [key: string]: {
      name: string;
      status: string;
      description?: string;
    };
  };
}

interface AtlassianStatusResponse {
  overall: string;
  lastUpdated: string;
  services: Array<{
    name: string;
    status: string;
    statusClass: string;
    url: string;
  }>;
  error?: string;
}

interface GCPStatusResponse {
  overall: string;
  lastUpdated: string;
  services: Array<{
    name: string;
    status: string;
    statusClass: string;
    regions?: {
      [key: string]: string;
    };
  }>;
  incidents?: Array<{
    title: string;
    products: string;
    locations: string;
    updates: string[];
  }>;
  error?: string;
}

interface LinkedInStatusResponse {
  overall: string;
  lastUpdated: string;
  services: Array<{
    name: string;
    status: string;
    statusClass: string;
    isChild?: boolean;
  }>;
  incidents?: Array<{
    date: string;
    message?: string;
    updates?: Array<{
      time: string;
      title: string;
      message: string;
    }>;
  }>;
  error?: string;
}

interface OpenAIStatusResponse {
  overall: string;
  lastUpdated: string;
  services: Array<{
    name: string;
    status: string;
    statusClass: string;
    components?: number;
    uptime?: number;
  }>;
  incidents?: Array<{
    title: string;
    description: string;
    status?: string;
    duration?: string;
    affects?: string;
    statusInfo?: string;
  }>;
  error?: string;
}

interface XStatusResponse {
  overall: string;
  lastUpdated: string;
  services: Array<{
    name: string;
    status: string;
    statusClass: string;
  }>;
  incidents?: Array<{
    date: string;
    title?: string;
    updates?: Array<{
      time: string;
      message: string;
    }>;
  }>;
  incidentsError?: string;
  error?: string;
  fallbackError?: string;
}

interface SupabaseStatusResponse {
  overall: string;
  lastUpdated: string;
  services: Array<{
    name: string;
    status: string;
    statusClass: string;
    isGroup?: boolean;
    uptime?: string;
    children?: Array<{
      name: string;
      status: string;
      statusClass: string;
    }>;
  }>;
  incidents?: Array<{
    date: string;
    message?: string;
    title?: string;
    impact?: string;
    updates?: Array<{
      status?: string;
      message?: string;
      time?: string;
    }>;
  }>;
  error?: string;
}

class StatusObserver {
  private platforms: Map<string, PlatformStatus>;
  private atlassianApiUrl: string;
  private linkedInApiUrl: string;
  private xApiUrl: string;
  private supabaseApiUrl: string;
  private openaiApiUrl: string;

  constructor() {
    this.platforms = new Map();
    this.atlassianApiUrl = 'https://status-observer-helpers.vercel.app/atlassian';
    this.linkedInApiUrl = 'https://status-observer-helpers.vercel.app/linkedin';
    this.xApiUrl = 'https://status-observer-helpers.vercel.app/x';
    this.supabaseApiUrl = 'https://status-observer-helpers.vercel.app/supabase';
    this.openaiApiUrl = 'https://status-observer-helpers.vercel.app/openai';
    this.initializePlatforms();
  }

  private initializePlatforms() {
    this.addPlatform('amplitude', 'Amplitude', 'https://status.amplitude.com/api/v2/summary.json', 'Product analytics platform');
    this.addPlatform('asana', 'Asana', 'https://status.asana.com/api/v2/summary.json', 'Work management platform for teams');
    this.addPlatform('atlassian', 'Atlassian', this.atlassianApiUrl, 'Software development and collaboration tools provider');
    this.addPlatform('cloudflare', 'Cloudflare', 'https://www.cloudflarestatus.com/api/v2/summary.json', 'Web infrastructure and security company');
    this.addPlatform('digitalocean', 'DigitalOcean', 'https://status.digitalocean.com/api/v2/summary.json', 'Cloud infrastructure provider');
    this.addPlatform('discord', 'Discord', 'https://discordstatus.com/api/v2/summary.json', 'VoIP and instant messaging platform');
    this.addPlatform('dropbox', 'Dropbox', 'https://status.dropbox.com/api/v2/summary.json', 'File hosting service');
    this.addPlatform('gcp', 'Google Cloud Platform', 'https://status-observer-helpers.vercel.app/gcp', 'Cloud computing services and APIs');
    this.addPlatform('github', 'GitHub', 'https://www.githubstatus.com/api/v2/summary.json', 'Development platform for version control and collaboration');
    this.addPlatform('linkedin', 'LinkedIn', this.linkedInApiUrl, 'Business and employment-focused social media platform');
    this.addPlatform('netlify', 'Netlify', 'https://www.netlifystatus.com/api/v2/summary.json', 'Web development platform');
    this.addPlatform('npm', 'npm', 'https://status.npmjs.org/api/v2/summary.json', 'Package manager for JavaScript');
    this.addPlatform('openai', 'OpenAI', this.openaiApiUrl, 'AI platform and API provider');
    this.addPlatform('reddit', 'Reddit', 'https://www.redditstatus.com/api/v2/summary.json', 'Social news aggregation and discussion website');
    this.addPlatform('slack', 'Slack', 'https://status.slack.com/api/v2.0.0/current', 'Business communication platform');
    this.addPlatform('supabase', 'Supabase', this.supabaseApiUrl, 'Open source Firebase alternative');
    this.addPlatform('twilio', 'Twilio', 'https://status.twilio.com/api/v2/summary.json', 'Cloud communications platform');
    this.addPlatform('vercel', 'Vercel', 'https://www.vercel-status.com/api/v2/summary.json', 'Platform for frontend frameworks and static sites');
    this.addPlatform('x', 'X', this.xApiUrl, 'Social media platform');
  }

  private addPlatform(id: string, name: string, url: string, description: string) {
    this.platforms.set(id, {
      name,
      url,
      description,
      components: {}
    });
  }

  async getPlatformStatus(platformId: string): Promise<string> {
    const platform = this.platforms.get(platformId);
    if (!platform) {
      return `Platform '${platformId}' not found. Use 'status list' to see available platforms.`;
    }
  
    try {
      if (platformId === 'atlassian') {
        return await this.getAtlassianStatus(platform);
      }

      if (platformId === 'gcp') {
        return await this.getGCPStatus(platform);
      }

      if (platformId === 'linkedin') {
        return await this.getLinkedInStatus(platform);
      }

      if (platformId === 'openai') {
        return await this.getOpenAIStatus(platform);
      }

      if (platformId === 'supabase') {
        return await this.getSupabaseStatus(platform);
      }

      if (platformId === 'x') {
        return await this.getXStatus(platform);
      }
      
      const response = await axios.get(platform.url);
      const data = response.data;
      
      let statusOutput = `${platform.name} Status:\n`;
      statusOutput += `${this.formatOverallStatus(data, platformId)}\n\n`;
      
      if (data.components && Array.isArray(data.components)) {
        statusOutput += `Components:\n`;
        data.components.forEach((component: any) => {
          statusOutput += `- ${component.name}: ${this.normalizeStatus(component.status)}\n`;
          if (component.description) {
            statusOutput += `  Description: ${component.description}\n`;
          }
        });
      } else if (data.components && typeof data.components === 'object') {
        statusOutput += `Components:\n`;
        Object.keys(data.components).forEach(key => {
          const component = data.components[key];
          statusOutput += `- ${component.name}: ${this.normalizeStatus(component.status)}\n`;
          if (component.description) {
            statusOutput += `  Description: ${component.description}\n`;
          }
        });
      } else if (platformId === 'github') {
        this.processGitHubComponents(data, platform);
        statusOutput += this.getGitHubComponentsText(platform);
      }
      
      statusOutput += `\nLast Updated: ${this.formatUpdateTime(data.page?.updated_at || data.updated || new Date().toISOString())}`;
      
      return statusOutput;
    } catch (error) {
      console.error(`Error fetching status for ${platform.name}:`, error);
      
      return `Unable to fetch real-time status for ${platform.name}. The status API might be unavailable or the format has changed.`;
    }
  }
  
  private async getAtlassianStatus(platform: PlatformStatus): Promise<string> {
    try {
      const response = await axios.get<AtlassianStatusResponse>(platform.url);
      const data = response.data;
      
      let statusOutput = `${platform.name} Status:\n`;
      statusOutput += `Overall: ${this.normalizeStatus(data.overall)}\n\n`;
      
      if (data.services && data.services.length > 0) {
        statusOutput += `Components:\n`;
        data.services.forEach(service => {
          statusOutput += `- ${service.name}: ${this.normalizeStatus(service.status)}\n`;
        });
      } else {
        statusOutput += `No component information available.\n`;
      }
      
      statusOutput += `\nLast Updated: ${this.formatUpdateTime(data.lastUpdated || new Date().toISOString())}`;
      
      return statusOutput;
    } catch (error) {
      console.error(`Error fetching Atlassian status:`, error);
      return `Unable to fetch real-time status for Atlassian. The API might be unavailable.`;
    }
  }

  private async getGCPStatus(platform: PlatformStatus): Promise<string> {
    try {
      const response = await axios.get<GCPStatusResponse>(platform.url);
      const data = response.data;
      
      let statusOutput = `${platform.name} Status:\n`;
      statusOutput += `Overall: ${this.normalizeStatus(data.overall)}\n\n`;
      
      if (data.incidents && data.incidents.length > 0) {
        statusOutput += `Active Incidents:\n`;
        data.incidents.forEach(incident => {
          statusOutput += `- ${incident.title}\n`;
          statusOutput += `  Affected Products: ${incident.products}\n`;
          statusOutput += `  Affected Locations: ${incident.locations}\n`;
          if (incident.updates && incident.updates.length > 0) {
            statusOutput += `  Latest Update: ${incident.updates[0]}\n`;
          }
        });
        statusOutput += `\n`;
      }

      if (data.services && data.services.length > 0) {
        statusOutput += `Service Status by Region:\n\n`;
        
        const sortedServices = [...data.services].sort((a, b) => 
          a.name.localeCompare(b.name)
        );
        
        sortedServices.forEach(service => {
          if (service.regions && Object.keys(service.regions).length > 0) {
            statusOutput += `${service.name}:\n`;

            Object.entries(service.regions).forEach(([region, status]) => {
              if (status) {
                const regionName = this.formatRegionName(region);
                statusOutput += `  ${regionName}: ${status}\n`;
              }
            });
            
            statusOutput += `\n`;
          }
        });
      } else {
        statusOutput += `No detailed service information available.\n`;
      }
      
      statusOutput += `Last Updated: ${this.formatUpdateTime(data.lastUpdated || new Date().toISOString())}`;
      
      return statusOutput;
    } catch (error) {
      console.error(`Error fetching GCP status:`, error);
      return `Unable to fetch real-time status for Google Cloud Platform. The API might be unavailable.`;
    }
  }

  private formatRegionName(region: string): string {
    const nameMap: Record<string, string> = {
      americas: 'Americas',
      europe: 'Europe',
      asiaPacific: 'Asia Pacific',
      middleEast: 'Middle East',
      africa: 'Africa',
      multiRegions: 'Multi-regions',
      global: 'Global'
    };
    
    return nameMap[region] || region;
  }

  private async getLinkedInStatus(platform: PlatformStatus): Promise<string> {
    try {
      const response = await axios.get<LinkedInStatusResponse>(platform.url);
      const data = response.data;
      
      let statusOutput = `${platform.name} Status:\n`;
      statusOutput += `Overall: ${this.normalizeStatus(data.overall)}\n\n`;
      
      if (data.services && data.services.length > 0) {
        const mainServices = data.services.filter(service => !service.isChild);
        if (mainServices.length > 0) {
          statusOutput += `Components:\n`;
          mainServices.forEach(service => {
            statusOutput += `- ${service.name}: ${this.normalizeStatus(service.status)}\n`;
          });
        }

        const childServices = data.services.filter(service => service.isChild);
        if (childServices.length > 0) {
          statusOutput += `\nSubcomponents:\n`;
          childServices.forEach(service => {
            statusOutput += `  - ${service.name}: ${this.normalizeStatus(service.status)}\n`;
          });
        }
      } else {
        statusOutput += `No component information available.\n`;
      }
      
      statusOutput += `\nLast Updated: ${this.formatUpdateTime(data.lastUpdated || new Date().toISOString())}`;
      
      return statusOutput;
    } catch (error) {
      console.error(`Error fetching LinkedIn status:`, error);
      return `Unable to fetch real-time status for LinkedIn. The API might be unavailable.`;
    }
  }

  private async getOpenAIStatus(platform: PlatformStatus): Promise<string> {
    try {
      const response = await axios.get<OpenAIStatusResponse>(platform.url);
      const data = response.data;
      
      let statusOutput = `${platform.name} Status:\n`;
      statusOutput += `Overall: ${this.normalizeStatus(data.overall)}\n\n`;

      if (data.incidents && data.incidents.length > 0) {
        statusOutput += `Active Incidents:\n`;
        data.incidents.forEach(incident => {
          statusOutput += `- ${incident.title}\n`;
          if (incident.description) {
            statusOutput += `  Description: ${incident.description}\n`;
          }
          if (incident.affects) {
            statusOutput += `  Affects: ${incident.affects}\n`;
          }
          if (incident.duration) {
            statusOutput += `  Duration: ${incident.duration}\n`;
          }
          if (incident.status) {
            statusOutput += `  Status: ${incident.status}\n`;
          }
        });
        statusOutput += `\n`;
      }
      
      if (data.services && data.services.length > 0) {
        statusOutput += `Components:\n`;
        data.services.forEach(service => {
          let serviceInfo = `- ${service.name}: ${this.normalizeStatus(service.status)}`;
          if (service.uptime) {
            serviceInfo += ` (Uptime: ${service.uptime}%)`;
          }

          if (service.components) {
            serviceInfo += ` (${service.components} subcomponents)`;
          }
          
          statusOutput += `${serviceInfo}\n`;
        });
      } else {
        statusOutput += `No component information available.\n`;
      }
      
      statusOutput += `\nLast Updated: ${this.formatUpdateTime(data.lastUpdated || new Date().toISOString())}`;
      
      return statusOutput;
    } catch (error) {
      console.error(`Error fetching OpenAI status:`, error);
      return `Unable to fetch real-time status for OpenAI. The API might be unavailable.`;
    }
  }

  private async getXStatus(platform: PlatformStatus): Promise<string> {
    try {
      const response = await axios.get<XStatusResponse>(platform.url);
      const data = response.data;
      
      let statusOutput = `${platform.name} Status:\n`;
      statusOutput += `Overall: ${this.normalizeStatus(data.overall)}\n\n`;
      
      if (data.services && data.services.length > 0) {
        statusOutput += `Components:\n`;
        data.services.forEach(service => {
          statusOutput += `- ${service.name}: ${this.normalizeStatus(service.status)}\n`;
        });
      } else {
        statusOutput += `No component information available.\n`;
      }

      if (data.incidents && data.incidents.length > 0) {
        statusOutput += `\nRecent Incidents:\n`;
        data.incidents.slice(0, 3).forEach(incident => {
          statusOutput += `- ${incident.date}: ${incident.title || 'No title'}\n`;
          
          if (incident.updates && incident.updates.length > 0) {
            const latestUpdate = incident.updates[0];
            statusOutput += `  Latest update: ${latestUpdate.message || ''}\n`;
            if (latestUpdate.time) {
              statusOutput += `  Time: ${latestUpdate.time}\n`;
            }
          }
        });
      }
      
      statusOutput += `\nLast Updated: ${this.formatUpdateTime(data.lastUpdated || new Date().toISOString())}`;
      
      return statusOutput;
    } catch (error) {
      console.error(`Error fetching X status:`, error);
      return `Unable to fetch real-time status for X. The API might be unavailable.`;
    }
  }

  private async getSupabaseStatus(platform: PlatformStatus): Promise<string> {
    try {
      const response = await axios.get<SupabaseStatusResponse>(platform.url);
      const data = response.data;
      
      let statusOutput = `${platform.name} Status:\n`;
      statusOutput += `Overall: ${this.normalizeStatus(data.overall)}\n\n`;
      
      if (data.services && data.services.length > 0) {
        statusOutput += `Components:\n`;
        data.services.forEach(service => {
          if (service.isGroup) {
            statusOutput += `- ${service.name}: ${this.normalizeStatus(service.status)}\n`;
            if (service.children && service.children.length > 0) {
              service.children.forEach(child => {
                statusOutput += `  - ${child.name}: ${this.normalizeStatus(child.status)}\n`;
              });
            }
          } else {
            statusOutput += `- ${service.name}: ${this.normalizeStatus(service.status)}`;
            if (service.uptime) {
              statusOutput += ` (Uptime: ${service.uptime})`;
            }
            
            statusOutput += `\n`;
          }
        });
      } else {
        statusOutput += `No component information available.\n`;
      }

      if (data.incidents && data.incidents.length > 0) {
        const incidentsWithImpact = data.incidents.filter(inc => inc.impact && inc.impact !== 'none');
        
        if (incidentsWithImpact.length > 0) {
          statusOutput += `\nRecent Incidents:\n`;
          incidentsWithImpact.slice(0, 3).forEach(incident => {
            statusOutput += `- ${incident.date}: ${incident.title || 'No title'}\n`;
            statusOutput += `  Impact: ${incident.impact}\n`;
            
            if (incident.updates && incident.updates.length > 0) {
              const latestUpdate = incident.updates[0];
              statusOutput += `  Latest update: ${latestUpdate.status || ''} ${latestUpdate.message || ''}\n`;
              if (latestUpdate.time) {
                statusOutput += `  Time: ${latestUpdate.time}\n`;
              }
            }
          });
        }
      }
      
      statusOutput += `\nLast Updated: ${this.formatUpdateTime(data.lastUpdated || new Date().toISOString())}`;
      
      return statusOutput;
    } catch (error) {
      console.error(`Error fetching Supabase status:`, error);
      return `Unable to fetch real-time status for Supabase. The API might be unavailable.`;
    }
  }

  private processGitHubComponents(data: any, platform: PlatformStatus) {
    if (data.components && Array.isArray(data.components)) {
      platform.components = {};
      data.components.forEach((component: any) => {
        platform.components[component.id] = {
          name: component.name,
          status: this.normalizeStatus(component.status),
          description: component.description
        };
      });
    }
  }

  private getGitHubComponentsText(platform: PlatformStatus): string {
    let text = 'Components:\n';
    
    const githubComponents = [
      { id: 'api', name: 'API Requests', description: 'Status for GitHub APIs' },
      { id: 'actions', name: 'Actions', description: 'Status of workflows and orchestration for GitHub Actions' },
      { id: 'codespaces', name: 'Codespaces', description: 'Status of orchestration and compute for GitHub Codespaces' },
      { id: 'copilot', name: 'Copilot', description: 'Status of AI-powered code completion service' },
      { id: 'git', name: 'Git Operations', description: 'Performance of git operations (clones, pulls, pushes)' },
      { id: 'issues', name: 'Issues', description: 'Status of requests for Issues on GitHub.com' },
      { id: 'packages', name: 'Packages', description: 'Status of API requests and webhook delivery for GitHub Packages' },
      { id: 'pages', name: 'Pages', description: 'Status of frontend app servers and API for Pages builds' },
      { id: 'pulls', name: 'Pull Requests', description: 'Status of requests for Pull Requests on GitHub.com' },
      { id: 'webhooks', name: 'Webhooks', description: 'Status of real-time HTTP callbacks' }
    ];
    
    githubComponents.forEach(component => {
      const status = platform.components && platform.components[component.id] 
        ? platform.components[component.id].status 
        : 'Unknown';
      
      text += `- ${component.name}: ${status}\n`;
      text += `  ${component.description}\n`;
    });
    
    return text;
  }

  private formatOverallStatus(data: any, platformId: string): string {
    let status = data.status?.description || data.status || 'Unknown';
    
    if (platformId === 'github') {
      status = data.status?.description || (data.status?.indicator === 'none' ? 'operational' : data.status?.indicator) || 'Unknown';
    }
    
    return `Overall: ${this.normalizeStatus(status)}`;
  }

  private normalizeStatus(status: string): string {
    const lowerStatus = status.toLowerCase();
    
    if (lowerStatus.includes('operational') || lowerStatus.includes('normal') || lowerStatus === 'good' || lowerStatus === 'ok') {
      return 'Operational ✅';
    } else if (lowerStatus.includes('degraded') || lowerStatus.includes('partial') || lowerStatus.includes('minor')) {
      return 'Degraded Performance ⚠️';
    } else if (lowerStatus.includes('major') || lowerStatus.includes('outage') || lowerStatus.includes('down')) {
      return 'Major Outage 🔴';
    } else if (lowerStatus.includes('maintenance')) {
      return 'Under Maintenance 🔧';
    } else {
      return status.charAt(0).toUpperCase() + status.slice(1);
    }
  }

  private formatUpdateTime(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch (e) {
      return timestamp;
    }
  }

  async getAllPlatformsStatus(): Promise<string> {
    let result = 'Status for All Platforms:\n\n';
    const platformPromises: Promise<string>[] = [];
    
    this.platforms.forEach((_, id) => {
      platformPromises.push(this.getQuickPlatformStatus(id));
    });
    
    const platformStatuses = await Promise.all(platformPromises);
    result += platformStatuses.join('\n\n');
    
    return result;
  }

  async getQuickPlatformStatus(platformId: string): Promise<string> {
    const platform = this.platforms.get(platformId);
    if (!platform) {
      return `Platform '${platformId}' not found.`;
    }

    try {
      if (platformId === 'atlassian') {
        const response = await axios.get<AtlassianStatusResponse>(platform.url);
        const data = response.data;
        return `${platform.name}: ${this.normalizeStatus(data.overall)}`;
      }

      if (platformId === 'gcp') {
        const response = await axios.get<GCPStatusResponse>(platform.url);
        const data = response.data;
        return `${platform.name}: ${this.normalizeStatus(data.overall)}`;
      }
      
      if (platformId === 'linkedin') {
        const response = await axios.get<LinkedInStatusResponse>(platform.url);
        const data = response.data;
        return `${platform.name}: ${this.normalizeStatus(data.overall)}`;
      }

      if (platformId === 'openai') {
        const response = await axios.get<OpenAIStatusResponse>(platform.url);
        const data = response.data;
        return `${platform.name}: ${this.normalizeStatus(data.overall)}`;
      }

      if (platformId === 'supabase') {
        const response = await axios.get<SupabaseStatusResponse>(platform.url);
        const data = response.data;
        return `${platform.name}: ${this.normalizeStatus(data.overall)}`;
      }

      if (platformId === 'x') {
        const response = await axios.get<XStatusResponse>(platform.url);
        const data = response.data;
        return `${platform.name}: ${this.normalizeStatus(data.overall)}`;
      }

      const response = await axios.get(platform.url);
      const data = response.data;
      
      let status = data.status?.description || data.status || 'Unknown';
      if (platformId === 'github') {
        status = data.status?.description || (data.status?.indicator === 'none' ? 'operational' : data.status?.indicator) || 'Unknown';
      }
      
      return `${platform.name}: ${this.normalizeStatus(status)}`;
    } catch (error) {
      console.error(`Error fetching quick status for ${platform.name}:`, error);
      return `${platform.name}: Unable to fetch status`;
    }
  }

  getPlatformsList(): string {
    let result = 'Available Platforms:\n\n';
    
    this.platforms.forEach((platform, id) => {
      result += `- ${platform.name} (use: status --${id})\n`;
      result += `  ${platform.description}\n`;
    });
    
    return result;
  }
}

const statusObserver = new StatusObserver();

const server = new Server(
  {
    name: "mcp-status-observer",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {
        status: {
          description: "Check operational status of major digital platforms",
          schema: {
            type: "object",
            properties: {
              command: {
                type: "string",
                description: "Command to execute (list, --all, or platform with -- prefix like --github)"
              }
            },
            required: ["command"]
          }
        }
      },
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "status",
        description: "Check operational status of major digital platforms",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "Command to execute (list, --all, or platform with -- prefix like --github)"
            }
          },
          required: ["command"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    if (name === "status") {
      const command = (typeof args?.command === 'string' ? args.command : '').toLowerCase() || '';
      
      if (command === 'list') {
        return {
          content: [
            {
              type: "text",
              text: statusObserver.getPlatformsList()
            }
          ]
        };
      } else if (command === '--all') {
        return {
          content: [
            {
              type: "text",
              text: await statusObserver.getAllPlatformsStatus()
            }
          ]
        };
      } else if (command.startsWith('--')) {
        const platformId = command.slice(2);
        return {
          content: [
            {
              type: "text",
              text: await statusObserver.getPlatformStatus(platformId)
            }
          ]
        };
      } else {
        throw new Error(`Unknown command: ${command}. Available commands: list, --all, or platform with -- prefix like --github`);
      }
    }
    
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    console.error(`Error handling request:`, error);
    throw error;
  }
});

async function main() {
  const transport = new StdioServerTransport();
  
  try {
    await server.connect(transport);
    console.error("MCP Status Observer server running on stdio");
  } catch (error) {
    console.error("Error connecting to transport:", error);
    throw error;
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});