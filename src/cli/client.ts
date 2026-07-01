import { AuthConfig, loadAuth } from "./config";

export class LightLatexClient {
  private token: string;
  private baseUrl: string;

  constructor(auth?: AuthConfig) {
    const a = auth || loadAuth();
    if (!a) throw new Error("Not logged in. Run 'lightlatex login <url>' first.");
    this.token = a.token;
    this.baseUrl = a.server_url.replace(/\/+$/, "");
  }

  async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}/api${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
    };
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status} ${err}`);
    }

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async getProjects() {
    return this.request("GET", "/projects");
  }

  async createProject(name: string, compiler?: string) {
    return this.request("POST", "/projects", { name, compiler: compiler || "pdflatex" });
  }

  async getProject(id: string) {
    return this.request("GET", `/projects/${id}`);
  }

  async getFiles(id: string) {
    return this.request("GET", `/projects/${id}/files`);
  }

  async getFileContent(id: string, filePath: string): Promise<string> {
    const url = `${this.baseUrl}/api/projects/${id}/files/${filePath}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch ${filePath}: ${res.status}`);
    return res.text();
  }

  async getFilesWithHashes(id: string) {
    return this.request("GET", `/projects/${id}/files-with-hashes`);
  }

  async createFile(id: string, filePath: string, content: string) {
    return this.request("POST", `/projects/${id}/files`, { path: filePath, content });
  }

  async updateFile(id: string, filePath: string, content: string) {
    return this.request("PUT", `/projects/${id}/files/${filePath}`, { content });
  }

  async deleteFile(id: string, filePath: string) {
    return this.request("DELETE", `/projects/${id}/files/${filePath}`);
  }

  async sync(id: string, files: Array<{ path: string; content: string; hash: string }>) {
    return this.request("POST", `/projects/${id}/sync`, files);
  }

  async download(id: string): Promise<Buffer> {
    const url = `${this.baseUrl}/api/projects/${id}/download`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
