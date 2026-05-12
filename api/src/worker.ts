import { spawn } from 'node:child_process'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ModSpec } from './modspec.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export function templateRoot(): string {
  return resolve(__dirname, '../../templates/fabric-1.21-minimal')
}

function safeGradlePropertyValue(s: string): string {
  return s.replace(/[\r\n]/g, ' ').replace(/\\/g, '').replace(/[$]/g, '')
}

function patchModProject(workDir: string, spec: ModSpec): void {
  const modId = spec.modId
  const display = safeGradlePropertyValue(spec.displayName)

  const gradlePropsPath = join(workDir, 'gradle.properties')
  let gradleProps = readFileSync(gradlePropsPath, 'utf8')
  gradleProps = gradleProps.replace(/^mod_id=.*$/m, `mod_id=${modId}`)
  gradleProps = gradleProps.replace(/^mod_name=.*$/m, `mod_name=${display}`)
  writeFileSync(gradlePropsPath, gradleProps, 'utf8')

  const settingsPath = join(workDir, 'settings.gradle')
  let settings = readFileSync(settingsPath, 'utf8')
  settings = settings.replace(/rootProject\.name\s*=\s*'[^']*'/, `rootProject.name = '${modId}'`)
  writeFileSync(settingsPath, settings, 'utf8')

  const javaPath = join(workDir, 'src/main/java/fi/benkku/mod/BenkkuMod.java')
  let javaSrc = readFileSync(javaPath, 'utf8')
  javaSrc = javaSrc.replace(
    /public static final String MOD_ID = "[^"]*";/,
    `public static final String MOD_ID = "${modId}";`,
  )
  writeFileSync(javaPath, javaSrc, 'utf8')
}

function findRemappedJar(workDir: string): string | null {
  const libs = join(workDir, 'build', 'libs')
  const files = readdirSync(libs).filter((f: string) => f.endsWith('.jar') && !f.endsWith('-sources.jar'))
  if (files.length === 0) return null
  return join(libs, files[0])
}

export async function runFabricBuild(
  spec: ModSpec,
): Promise<{ jarBytes: Buffer; fileName: string; log: string }> {
  const template = templateRoot()
  const workDir = mkdtempSync(join(tmpdir(), 'benkku-mod-'))
  let log = ''

  try {
    cpSync(template, workDir, { recursive: true })
    patchModProject(workDir, spec)

    log += `[benkku] workdir ${workDir}\n`

    await new Promise<void>((resolvePromise, reject) => {
      const proc = spawn('./gradlew', ['build', '--no-daemon'], {
        cwd: workDir,
        env: { ...process.env, CI: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      proc.stdout?.on('data', (c: Buffer) => {
        log += c.toString()
      })
      proc.stderr?.on('data', (c: Buffer) => {
        log += c.toString()
      })
      proc.on('error', reject)
      proc.on('close', (code: number | null) => {
        if (code === 0) resolvePromise()
        else reject(new Error(`Gradle exited with code ${code}`))
      })
    })

    const jarPath = findRemappedJar(workDir)
    if (!jarPath) {
      throw new Error('build/libs/*.jar not found after build')
    }

    const jarBytes = readFileSync(jarPath)
    const base = jarPath.split(/[/\\]/).pop() || `${spec.modId}.jar`

    return { jarBytes, fileName: base, log }
  } catch (e) {
    log += `\n[benkku] ERROR: ${e instanceof Error ? e.message : String(e)}\n`
    throw Object.assign(new Error('Build failed'), { log })
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}
