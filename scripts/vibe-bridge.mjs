#!/usr/bin/env node
/**
 * Vibe bridge — lets the browser-based Freecut app use the local Vibe app for
 * transcription. The browser cannot spawn processes, so this small HTTP server
 * sits on 127.0.0.1, spawns `vibe serve`, forwards audio to its OpenAI-compatible
 * endpoint, and returns SRT back to the app.
 *
 * Run with: `npm run vibe-bridge` (env VIBE_BRIDGE_PORT to override the port).
 * The bridge exits itself after being idle (env VIBE_BRIDGE_IDLE_TIMEOUT_MINUTES,
 * default 10) so it doesn't linger when the app is a hosted website.
 */
import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const HOST = '127.0.0.1'
const PORT = Number(process.env.VIBE_BRIDGE_PORT ?? 8765)

const IDLE_TIMEOUT_MINUTES = Number(process.env.VIBE_BRIDGE_IDLE_TIMEOUT_MINUTES ?? 10)
const IDLE_TIMEOUT_MS =
  (Number.isFinite(IDLE_TIMEOUT_MINUTES) && IDLE_TIMEOUT_MINUTES > 0
    ? IDLE_TIMEOUT_MINUTES
    : 10) * 60_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Vibe-Path, X-Vibe-Model, X-Filename, X-Language',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

let sona = null // { proc, port }
let lastActivityAt = Date.now()
let activeRequests = 0

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, HOST, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

async function waitForReady(baseUrl, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`)
      if (res.ok) return
    } catch {
      // server still booting
    }
    await sleep(250)
  }
  throw new Error(`timed out waiting for the Vibe server to start (${timeoutMs}ms)`)
}

async function ensureSona(vibePath) {
  if (sona && sona.proc.exitCode === null) {
    return sona.port
  }

  if (sona?.proc) {
    try {
      sona.proc.kill()
    } catch {
      // already dead
    }
  }

  const port = await getFreePort()
  const proc = spawn(vibePath, ['serve', '--host', HOST, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let stderrTail = ''
  proc.stderr?.on('data', (chunk) => {
    stderrTail = `${stderrTail}${chunk.toString()}`.slice(-2000)
  })
  proc.on('exit', () => {
    if (sona?.proc === proc) {
      sona = null
    }
  })

  sona = { proc, port }
  try {
    await waitForReady(`http://${HOST}:${port}`)
  } catch (error) {
    try {
      proc.kill()
    } catch {
      // already dead
    }
    sona = null
    const detail = stderrTail.trim()
    throw new Error(
      `Failed to start the Vibe server from "${vibePath}": ${error.message}${detail ? ` (${detail})` : ''}`,
    )
  }

  return port
}

async function loadModel(port, modelPath) {
  const res = await fetch(`http://${HOST}:${port}/v1/models/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: modelPath, no_gpu: false }),
  })
  if (res.status === 404) {
    // Older API resolved the model via the transcription form field instead.
    return
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Failed to load the Vibe model "${modelPath}": ${detail || res.status}`)
  }
}

async function transcribeAudio(port, modelPath, audioPath, fileName, language) {
  const audio = readFileSync(audioPath)
  const form = new FormData()
  form.append('file', new Blob([audio], { type: 'application/octet-stream' }), fileName)
  form.append('model', modelPath)
  form.append('response_format', 'srt')
  if (language) {
    form.append('language', language)
  }

  const res = await fetch(`http://${HOST}:${port}/v1/audio/transcriptions`, {
    method: 'POST',
    body: form,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Vibe transcription failed (${res.status}): ${text.slice(0, 500)}`)
  }
  return text
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function handleTranscribe(req) {
  const vibePath = req.headers['x-vibe-path']
  const modelPath = req.headers['x-vibe-model']
  const rawFileName = req.headers['x-filename'] || 'audio.mp3'
  const language = req.headers['x-language'] || ''

  if (!vibePath) {
    throw new HttpError(400, 'Missing X-Vibe-Path header')
  }
  if (!modelPath) {
    throw new HttpError(400, 'Missing X-Vibe-Model header')
  }

  const buffer = await readBody(req)
  if (buffer.length === 0) {
    throw new HttpError(400, 'Empty request body')
  }

  const safeName = basename(String(rawFileName)).replace(/[^\w.\- ]/g, '_') || 'audio.mp3'
  const tempDir = mkdtempSync(join(tmpdir(), 'vibe-bridge-'))
  const audioPath = join(tempDir, safeName)
  writeFileSync(audioPath, buffer)

  try {
    const port = await ensureSona(vibePath)
    await loadModel(port, modelPath)
    return await transcribeAudio(port, modelPath, audioPath, safeName, language)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function writeJson(res, status, body) {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  lastActivityAt = Date.now()
  activeRequests += 1
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS)
      res.end()
      return
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      writeJson(res, 200, { status: 'ok' })
      return
    }

    if (req.method === 'POST' && url.pathname === '/transcribe') {
      const srt = await handleTranscribe(req)
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(srt)
      return
    }

    writeJson(res, 404, { error: 'not_found' })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    if (status >= 500) {
      console.error('[vibe-bridge]', error)
    }
    writeJson(res, status, { error: error?.message ?? String(error) })
  } finally {
    activeRequests -= 1
    lastActivityAt = Date.now()
  }
})

function shutdown(reason) {
  if (reason) {
    console.log(`[vibe-bridge] ${reason}`)
  }
  if (sona?.proc) {
    try {
      sona.proc.kill()
    } catch {
      // already dead
    }
  }
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}

process.on('SIGINT', () => shutdown('received SIGINT — shutting down'))
process.on('SIGTERM', () => shutdown('received SIGTERM — shutting down'))

const idleTimer = setInterval(() => {
  if (activeRequests > 0) return
  const idleForMs = Date.now() - lastActivityAt
  if (idleForMs < IDLE_TIMEOUT_MS) return
  shutdown(`No requests for ${Math.round(idleForMs / 60_000)} minutes — shutting down`)
}, 15_000)
idleTimer.unref()

server.listen(PORT, HOST, () => {
  console.log(`[vibe-bridge] listening on http://${HOST}:${PORT}`)
  console.log('[vibe-bridge] Start the app and set Settings → AI → Transcription engine → Vibe')
  console.log(
    `[vibe-bridge] Auto-exits after ${Math.round(IDLE_TIMEOUT_MS / 60_000)} min idle ` +
      `(VIBE_BRIDGE_IDLE_TIMEOUT_MINUTES to change)`,
  )
})
