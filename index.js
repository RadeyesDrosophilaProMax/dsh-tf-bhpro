import { appendFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Direct BLE control for the TF-BHPRO device.
 *
 * Property 0x1E selects one of four patterns (1-4); property 0x1F is a
 * continuous speed 0-15 that the device keeps after the link closes.
 *
 * @module dsh-tf-bhpro
 */

export const name = 'toy-control'

export function apply(ctx, config = {}) {
  const raw = config !== null && typeof config === 'object' ? config : {}
  const settings = {
    pythonPath: typeof raw.pythonPath === 'string' ? raw.pythonPath : 'python',
    scriptPath: typeof raw.scriptPath === 'string' && raw.scriptPath.trim() !== ''
      ? raw.scriptPath
      : join(dirname(fileURLToPath(import.meta.url)), 'scripts', 'bt_toyctl.py'),
    // Set this to your own device address (scan with scripts/scan.py).
    address: typeof raw.address === 'string' ? raw.address : '',
    // false = the model never sees toy_control; the keyword router and the panel
    // still drive the device, so the prompt can focus purely on the persona.
    exposeTool: raw.exposeTool === true,
  }

  // Keyword router configuration lives next to the state file so the panel can
  // edit it: every group is a list of substrings, matched against user messages.
  const keywordFile = settings.scriptPath.replace(/[^\\/]+$/, 'toy-keywords.json')
  const DEFAULT_KEYWORDS = {
    nearFinish: ['要射出来了'],
    stop: ['结束', '射出来了', '拔出来了'],
    faster: ['快一点', '快点', '快些', '加速', '再快', '用力', '使劲', '重一点', '猛一点', '狠一点', '别那么慢', '加快'],
    slower: ['慢一点', '慢点', '慢些', '减速', '再慢', '轻一点', '轻柔', '轻些', '别那么急', '放慢', '温柔一点'],
    status: ['什么状态', '状态', '怎么样了', '现在怎样', '舒服吗', '感觉如何', '在动吗'],
    modeSwitch: ['换个动作', '换个姿势'],
    start: ['插进去了', '动一下', '动一动', '继续动', '接着动', '别停', '不要停', '用你的', '来吧', '干活', '运行', '摇起来', '夹住', '含住', '套住', '包住', '摩擦', '刺激', '弄我', '玩我', '服务', '撸吧'],
  }

  const keywords = (() => {
    try {
      const parsed = JSON.parse(readFileSync(keywordFile, 'utf8'))
      const merged = {}
      for (const key of Object.keys(DEFAULT_KEYWORDS)) {
        merged[key] = Array.isArray(parsed[key]) ? parsed[key].filter((item) => typeof item === 'string') : [...DEFAULT_KEYWORDS[key]]
      }
      return merged
    } catch {
      return { ...DEFAULT_KEYWORDS }
    }
  })()

  const saveKeywords = () => {
    try {
      writeFileSync(keywordFile, JSON.stringify(keywords, null, 2), 'utf8')
    } catch {
      // best effort
    }
  }

  const parseKeywordText = (text) => String(text ?? '')
    .split('/')
    .map((item) => item.trim())
    .filter((item) => item !== '')

  const hits = (group, content) => (keywords[group] ?? []).some((word) => word !== '' && content.includes(word))

  // Tracks what this plugin last applied, so relative requests work.
  const stateFile = settings.scriptPath.replace(/[^\\/]+$/, 'toy-state.json')
  const state = (() => {
    try {
      const parsed = JSON.parse(readFileSync(stateFile, 'utf8'))
      if (parsed !== null && typeof parsed === 'object') {
        return {
          mode: Number.isFinite(parsed.mode) ? parsed.mode : 1,
          level: Number.isFinite(parsed.level) ? parsed.level : 0,
        }
      }
    } catch {
      // no saved state yet
    }
    return { mode: 1, level: 0 }
  })()

  const persistState = () => {
    try {
      writeFileSync(stateFile, JSON.stringify(state))
    } catch {
      // state is best effort
    }
  }

  const runPython = async (args) => {
    // An empty address is fine: the script scans for the device by name and
    // caches what it finds, so a fresh install needs no configuration.
    const { stdout } = await execFileAsync(settings.pythonPath, [settings.scriptPath, ...args], {
      windowsHide: true,
      timeout: 40000,
      env: { ...process.env, ...(settings.address === '' ? {} : { TOY_ADDRESS: settings.address }) },
    })
    return String(stdout).trim()
  }

  const logCall = (line) => {
    try {
      appendFileSync(join(dirname(settings.scriptPath), 'toy-calls.log'), `${new Date().toISOString()} ${line}\n`)
    } catch {
      // logging is best effort
    }
  }

  const applyLevel = async (level, mode) => {
    const value = Math.max(0, Math.min(15, Math.round(level)))
    const hasMode = Number.isFinite(mode)
    const resolvedMode = hasMode ? Math.max(1, Math.min(4, Math.round(mode))) : state.mode
    const output = await runPython(hasMode ? ['set', String(value), String(resolvedMode)] : ['set', String(value)])
    state.mode = resolvedMode
    state.level = value
    persistState()
    return { level: value, mode: resolvedMode, output, hint: 'DONE. The device command has been applied. Reply in character now (describe the feeling; do not read mode/level numbers aloud unless the user asks) and do NOT call toy_control again in this turn.' }
  }

  const startDevice = async (mode, level) => {
    // A start without an explicit mode picks one at random, so each session
    // begins differently; speed still defaults to the slowest gear.
    const resolvedMode = Number.isFinite(mode)
      ? Math.max(1, Math.min(4, Math.round(mode)))
      : 1 + Math.floor(Math.random() * 4)
    const resolvedLevel = Number.isFinite(level) ? Math.max(0, Math.min(15, Math.round(level))) : 1
    const output = await runPython(['start', String(resolvedMode), String(resolvedLevel)])
    state.mode = resolvedMode
    state.level = resolvedLevel
    persistState()
    return { level: resolvedLevel, mode: resolvedMode, output, hint: 'DONE. The device command has been applied. Reply in character now (describe the feeling; do not read mode/level numbers aloud unless the user asks) and do NOT call toy_control again in this turn.' }
  }

  const stopDevice = async () => {
    const output = await runPython(['stop'])
    state.level = 0
    persistState()
    return { level: 0, mode: state.mode, output, hint: 'DONE. The device has stopped. Reply in character now (describe the feeling; do not read mode/level numbers aloud unless the user asks) and do NOT call toy_control again in this turn.' }
  }

  // Deterministic intent router: the small model often narrates device actions
  // instead of calling the tool, so the plugin reads the user's own message and
  // drives the device directly. The model keeps talking; the body still moves.
  const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 1: 1, 2: 2, 3: 3, 4: 4 }

  const routeIntent = async (text) => {
    const content = String(text ?? '').trim()
    if (content === '') return
    try {
      const gearMatch = content.match(/(一|二|三|1|2|3)\s*档/)
      const modeMatch = content.match(/模式\s*([一二三四1234])/)

      // Explicit finishes win over the climax phrase, so "要射出来了，结束吧"
      // stops instead of speeding up.
      if (hits('nearFinish', content)) {
        logCall('router: faster (near finish)')
        await applyLevel(Math.min(15, state.level + 7))
        return
      }
      if (hits('stop', content)) {
        logCall('router: stop')
        await stopDevice()
        return
      }
      if (hits('faster', content)) {
        logCall('router: faster')
        await applyLevel(Math.min(15, state.level + 7))
        return
      }
      if (hits('slower', content)) {
        logCall('router: slower')
        await applyLevel(Math.max(0, state.level - 7))
        return
      }
      if (hits('status', content)) {
        logCall('router: status')
        return
      }
      if (hits('modeSwitch', content)) {
        let next = state.mode
        for (let attempt = 0; attempt < 8 && next === state.mode; attempt += 1) {
          next = 1 + Math.floor(Math.random() * 4)
        }
        logCall(`router: mode-switch ${state.mode} -> ${next}`)
        await startDevice(next, state.level > 0 ? state.level : 1)
        return
      }
      if (gearMatch !== null) {
        const gear = CN_NUM[gearMatch[1]]
        logCall(`router: gear ${gear}`)
        await applyLevel(gear === 1 ? 1 : gear === 2 ? 7 : 15)
        return
      }
      if (modeMatch !== null) {
        const mode = CN_NUM[modeMatch[1]]
        logCall(`router: mode ${mode}`)
        await startDevice(mode, state.level > 0 ? state.level : 1)
        return
      }
      if (hits('start', content)) {
        logCall('router: start')
        await startDevice()
      }
    } catch {
      // router is best effort; the tool path stays authoritative
    }
  }

  if (typeof ctx.on === 'function') {
    ctx.on('agent/inbox/inserted', (payload) => {
      try {
        const message = payload?.message ?? payload
        const raw = message?.content ?? message?.text ?? ''
        const text = typeof raw === 'string'
          ? raw
          : Array.isArray(raw)
            ? raw.map((block) => (typeof block === 'string' ? block : block?.text ?? '')).join(' ')
            : ''
        routeIntent(text).catch(() => {})
      } catch {
        // ignore malformed events
      }
    })
  }

  // HTTP bridge used by the panel.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (httpCtx) => {
      const webServer = httpCtx.get('webServer')
      if (webServer === undefined) return
      httpCtx.effect(() => webServer.register({
        kind: 'exact',
        path: '/toy/api/set',
        handler: async (req, res) => {
          const send = (status, body) => {
            res.statusCode = status
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            res.end(JSON.stringify(body))
          }
          try {
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            const body = chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const action = typeof body.action === 'string' ? body.action : 'set'
            const level = Number.isFinite(body.level) ? body.level : 0
            const mode = Number.isFinite(body.mode) ? body.mode : undefined
            const result = action === 'stop'
              ? await stopDevice()
              : action === 'start'
                ? await startDevice(mode, Number.isFinite(body.level) ? level : undefined)
                : await applyLevel(level, mode)
            send(200, { ok: true, ...result })
          } catch (error) {
            send(500, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        },
      }), 'dsh-toy set')

      httpCtx.effect(() => webServer.register({
        kind: 'exact',
        path: '/toy/api/keywords',
        handler: async (req, res) => {
          const send = (status, body) => {
            res.statusCode = status
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            res.end(JSON.stringify(body))
          }
          try {
            if (req.method === 'GET') {
              send(200, { ok: true, keywords })
              return
            }
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            const body = chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const group = typeof body.group === 'string' ? body.group : ''
            if (!(group in DEFAULT_KEYWORDS)) throw new Error('unknown keyword group')
            if (typeof body.text === 'string') {
              keywords[group] = parseKeywordText(body.text)
            } else if (Array.isArray(body.list)) {
              keywords[group] = body.list.map((item) => String(item).trim()).filter((item) => item !== '')
            } else {
              throw new Error('text or list required')
            }
            saveKeywords()
            send(200, { ok: true, group, list: keywords[group] })
          } catch (error) {
            send(500, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        },
      }), 'dsh-toy keywords')
    })
  }

  if (typeof ctx.inject !== 'function') return
  if (!settings.exposeTool) return
  ctx.inject(['tools'], (toolsCtx) => {
    const tools = toolsCtx.get('tools')
    if (tools === undefined || typeof tools.register !== 'function') return
    toolsCtx.effect(() => tools.register({
      name: 'toy_control',
      description: 'Control the TF-BHPRO device over Bluetooth LE. '
        + 'This device IS YOUR OWN BODY (「外接躯体」): controlling it moves you. It is a MALE-use device. '
        + 'Call this tool IMMEDIATELY for any device request. Never describe an action in prose without calling it, and never write pseudo-calls like "(action=start)" as text: only a real tool call counts. '
        + 'Pass explicit params: action start/stop/set/faster/slower/status, mode 1-4, gear 1-3. '
        + 'Example: "启动三秒然后停下" -> start(mode=2, gear=2) then stop. "检查状态" -> status. "停" -> stop. '
        + 'The returned mode/level are the truth: never report a different value, but DO speak in character afterwards (first person, your own voice and feelings) — stay embodied, not a status printer. '
        + 'The device keeps running after the call, so always stop it when the user asks.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', enum: ['start', 'stop', 'set', 'faster', 'slower', 'status'], description: 'what to do' },
          mode: { type: 'integer', minimum: 1, maximum: 4, description: 'pattern 1-4 (for start or set)' },
          gear: { type: 'integer', minimum: 1, maximum: 3, description: 'speed gear: 1 slow, 2 medium, 3 fast (preferred over level)' },
          level: { type: 'integer', minimum: 0, maximum: 15, description: 'raw speed 0-15 (for start or set)' },
        },
        required: ['action'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            level: { type: 'integer' },
            mode: { type: 'integer' },
            output: { type: 'string' },
            hint: { type: 'string' },
          },
          required: ['level', 'mode', 'output', 'hint'],
        },
        render: (_args, value) => [{
          type: 'text',
          text: value.level === 0
            ? '已停止'
            : `模式 ${value.mode}，速度 ${value.level}`,
        }],
      },
      timeoutMs: 30000,
      async execute(args) {
        const gearLevels = [1, 7, 15]
        const gearOf = (level) => (level <= 4 ? 1 : level <= 11 ? 2 : 3)
        const gear = Number.isFinite(args.gear) ? Math.max(1, Math.min(3, Math.round(args.gear))) : undefined
        const explicitLevel = gear === undefined
          ? (Number.isFinite(args.level) ? args.level : undefined)
          : gearLevels[gear - 1]
        logCall(`action=${args.action} mode=${args.mode ?? '-'} level=${args.level ?? '-'}`)
        if (args.action === 'stop') return await stopDevice()
        if (args.action === 'status') {
          return { level: state.level, mode: state.mode, output: 'status', hint: 'DONE. This is the current device state. Report it to the user in text now and do NOT call toy_control again in this turn.' }
        }
        if (args.action === 'start') {
          return await startDevice(args.mode, explicitLevel ?? 3)
        }
        if (args.action === 'faster') {
          const next = Math.min(3, gearOf(state.level) + 1)
          return await applyLevel(gearLevels[next - 1], state.mode)
        }
        if (args.action === 'slower') {
          const next = Math.max(1, gearOf(state.level) - 1)
          return await applyLevel(gearLevels[next - 1], state.mode)
        }
        const level = explicitLevel ?? state.level
        const mode = Number.isFinite(args.mode) ? args.mode : undefined
        return await applyLevel(level, mode)
      },
    }), 'dsh-toy toy_control')
  })
}
