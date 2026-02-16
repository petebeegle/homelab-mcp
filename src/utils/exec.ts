import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export async function exec(command: string, args: string[], timeoutMs = 30000): Promise<ExecResult> {
  try {
    const result = await execFileAsync(command, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      env: { ...process.env },
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    if (error.killed) {
      throw new Error(`Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`);
    }
    // Some commands write to stderr even on success (e.g., kubectl)
    if (error.stdout) {
      return { stdout: error.stdout, stderr: error.stderr || "" };
    }
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${error.stderr || error.message}`);
  }
}

export async function execJson<T>(command: string, args: string[]): Promise<T> {
  const result = await exec(command, [...args, "-o", "json"]);
  return JSON.parse(result.stdout) as T;
}
