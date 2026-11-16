/**
 * Client half: toy control panel with user-named presets.
 */
window.__ModuleLoader__.load({
  id: 'dsh-tf-bhpro',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const STORAGE_KEY = 'toy-presets'
    const DEFAULT_PRESETS = [
      { id: 'p1', name: '轻启', mode: 1, level: 3 },
      { id: 'p2', name: '匀速', mode: 2, level: 7 },
      { id: 'p3', name: '强力', mode: 4, level: 12 },
    ]

    const loadPresets = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw !== null) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed
        }
      } catch {
        // fall through to defaults
      }
      return DEFAULT_PRESETS
    }

    const savePresets = (list) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
      } catch {
        // storage may be unavailable
      }
    }

    function PanelIcon({ size = 20, active = false }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block', opacity: active ? 1 : 0.85 },
      },
        h('path', { d: 'M4 14c2-6 4-8 8-8s6 2 8 8', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
        h('circle', { cx: 12, cy: 15, r: 4, stroke: 'currentColor', strokeWidth: 1.6 }),
      )
    }

    const MODE_NAMES_KEY = 'toy-mode-names'

    const loadModeNames = () => {
      try {
        const raw = window.localStorage.getItem(MODE_NAMES_KEY)
        if (raw !== null) {
          const parsed = JSON.parse(raw)
          if (parsed !== null && typeof parsed === 'object') return parsed
        }
      } catch {
        // ignore
      }
      return {}
    }

    const KW_GROUPS = [
      ['start', '启动'],
      ['stop', '停止'],
      ['faster', '加速'],
      ['slower', '减速'],
      ['status', '查状态'],
      ['modeSwitch', '换模式（随机）'],
      ['nearFinish', '临界（加速）'],
    ]

    function KeywordEditor() {
      const [groups, setGroups] = React.useState(null)
      const [draft, setDraft] = React.useState({})
      const [note, setNote] = React.useState('')

      const load = async () => {
        try {
          const response = await fetch('/toy/api/keywords')
          const data = await response.json()
          if (data.ok === true) {
            setGroups(data.keywords)
            const next = {}
            for (const [key] of KW_GROUPS) next[key] = (data.keywords[key] ?? []).join(' / ')
            setDraft(next)
          }
        } catch {
          setNote('读取关键词失败')
        }
      }

      React.useEffect(() => {
        load()
      }, [])

      const save = async (group) => {
        setNote('')
        try {
          const response = await fetch('/toy/api/keywords', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ group, text: draft[group] ?? '' }),
          })
          const data = await response.json()
          if (data.ok !== true) throw new Error(data.error ?? '保存失败')
          setGroups((current) => ({ ...(current ?? {}), [group]: data.list }))
          setNote(`已保存「${group}」（${data.list.length} 个）`)
        } catch (failure) {
          setNote(failure instanceof Error ? failure.message : String(failure))
        }
      }

      const fieldStyle = {
        font: 'inherit',
        fontSize: 12,
        padding: '6px 8px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        lineHeight: 1.6,
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', { style: { fontSize: 13, fontWeight: 600 } }, '关键词（用 / 分隔，加一个词就写 /新词）'),
          h('button', {
            type: 'button',
            onClick: load,
            style: {
              marginLeft: 'auto', height: 26, padding: '0 12px', borderRadius: 6,
              border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
              color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 12, cursor: 'pointer',
            },
          }, '重新读取'),
        ),
        ...KW_GROUPS.map(([key, label]) => h('div', { key, style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', minWidth: 110 } }, label),
            h('button', {
              type: 'button',
              onClick: () => save(key),
              style: {
                marginLeft: 'auto', height: 24, padding: '0 10px', borderRadius: 6, border: 'none',
                background: '#2563eb', color: '#fff', font: 'inherit', fontSize: 12, cursor: 'pointer',
              },
            }, '保存'),
          ),
          h('textarea', {
            rows: 2,
            value: draft[key] ?? '',
            onChange: (event) => setDraft({ ...draft, [key]: event.target.value }),
            style: fieldStyle,
          }),
        )),
        note !== '' && h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, note),
      )
    }

    function Panel() {
      const [presets, setPresets] = React.useState(loadPresets)
      const [modeNames, setModeNames] = React.useState(loadModeNames)
      const [mode, setMode] = React.useState(1)
      const [level, setLevel] = React.useState(5)
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState('')
      const [draft, setDraft] = React.useState({ name: '', mode: 1, level: 5 })

      const renameMode = (value, name) => {
        const next = { ...modeNames, [value]: name }
        setModeNames(next)
        try {
          window.localStorage.setItem(MODE_NAMES_KEY, JSON.stringify(next))
        } catch {
          // ignore
        }
      }

      const request = async (payload, note) => {
        setBusy(true)
        setNote('')
        try {
          const response = await fetch('/toy/api/set', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const data = await response.json()
          if (data.ok !== true) throw new Error(data.error ?? '执行失败')
          setNote(note)
        } catch (failure) {
          setNote(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setBusy(false)
        }
      }

      const stop = () => request({ action: 'stop' }, '已停止')
      const start = (nextMode, nextLevel) => request(
        { action: 'start', mode: nextMode, level: nextLevel },
        `模式 ${nextMode} · 速度 ${nextLevel}`,
      )
      const applySpeed = (nextLevel) => request(
        { action: 'set', level: nextLevel },
        `速度 ${nextLevel}`,
      )

      const addPreset = () => {
        const name = draft.name.trim()
        if (name === '') {
          setNote('先给预设起个名字')
          return
        }
        const next = [...presets, { id: `p${Date.now()}`, name, mode: draft.mode, level: draft.level }]
        setPresets(next)
        savePresets(next)
        setDraft({ name: '', mode: 1, level: 5 })
        setNote(`已保存「${name}」`)
      }

      const removePreset = (id) => {
        const next = presets.filter((item) => item.id !== id)
        setPresets(next)
        savePresets(next)
      }

      const field = {
        font: 'inherit',
        fontSize: 12,
        padding: '4px 8px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
      }

      return h('div', {
        style: {
          height: '100%',
          boxSizing: 'border-box',
          overflow: 'auto',
          padding: '20px 24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        },
      },
        h(KeywordEditor),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
          h('span', { style: { fontSize: 13, color: 'var(--dsw-alias-label-secondary)' } }, note || '就绪'),
          h('button', {
            type: 'button',
            onClick: () => stop(),
            disabled: busy,
            style: {
              marginLeft: 'auto',
              height: 30,
              padding: '0 16px',
              borderRadius: 8,
              border: 'none',
              background: '#dc2626',
              color: '#fff',
              font: 'inherit',
              fontSize: 13,
              cursor: busy ? 'default' : 'pointer',
            },
          }, '停止'),
        ),

        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', width: 36 } }, '模式'),
          [1, 2, 3, 4].map((value) => h('button', {
            key: value,
            type: 'button',
            onClick: () => { setMode(value); setLevel(3); start(value, 3) },
            disabled: busy,
            title: `模式 ${value}`,
            style: {
              minWidth: 52,
              padding: '0 10px',
              height: 30,
              borderRadius: 8,
              border: '1px solid ' + (mode === value ? '#2563eb' : 'var(--dsw-alias-border-l1)'),
              background: mode === value ? 'rgba(37,99,235,0.14)' : 'transparent',
              color: mode === value ? '#6ea8ff' : 'var(--dsw-alias-label-secondary)',
              font: 'inherit',
              fontSize: 13,
              cursor: 'pointer',
            },
          }, modeNames[value] || `模式 ${value}`)),
        ),

        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', width: 36 } }, '命名'),
          [1, 2, 3, 4].map((value) => h('input', {
            key: value,
            placeholder: `模式 ${value}`,
            value: modeNames[value] || '',
            onChange: (event) => renameMode(value, event.target.value),
            style: {
              flex: 1,
              minWidth: 0,
              font: 'inherit',
              fontSize: 12,
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-layer-2)',
              color: 'var(--dsw-alias-label-primary)',
            },
          })),
        ),

        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', width: 36 } }, '速度'),
          [[1, '慢'], [7, '中'], [15, '快']].map(([raw, label]) => h('button', {
            key: raw,
            type: 'button',
            onClick: () => { setLevel(raw); applySpeed(raw) },
            disabled: busy,
            style: {
              flex: 1,
              height: 34,
              borderRadius: 8,
              border: '1px solid ' + (level === raw ? '#2563eb' : 'var(--dsw-alias-border-l1)'),
              background: level === raw ? 'rgba(37,99,235,0.14)' : 'transparent',
              color: level === raw ? '#6ea8ff' : 'var(--dsw-alias-label-primary)',
              font: 'inherit',
              fontSize: 13,
              cursor: 'pointer',
            },
          }, label)),
        ),

        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, '我的预设（点名字执行）'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
            presets.map((preset) => h('div', {
              key: preset.id,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--dsw-alias-border-l1)',
                background: 'var(--dsw-alias-bg-layer-1)',
              },
            },
              h('button', {
                type: 'button',
                onClick: () => { setMode(preset.mode); setLevel(preset.level); start(preset.mode, preset.level) },
                disabled: busy,
                style: {
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--dsw-alias-label-primary)',
                  font: 'inherit',
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: 0,
                },
              }, preset.name),
              h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } },
                `${preset.mode}·${preset.level}`),
              h('button', {
                type: 'button',
                onClick: () => removePreset(preset.id),
                style: {
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--dsw-alias-label-secondary)',
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: '0 2px',
                },
              }, '×'),
            )),
          ),
        ),

        h('div', {
          style: {
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            borderTop: '1px solid var(--dsw-alias-border-l1)',
            paddingTop: 12,
          },
        },
          h('input', {
            placeholder: '预设名称',
            value: draft.name,
            onChange: (event) => setDraft({ ...draft, name: event.target.value }),
            style: { ...field, width: 120 },
          }),
          h('select', {
            value: draft.mode,
            onChange: (event) => setDraft({ ...draft, mode: Number(event.target.value) }),
            style: field,
          }, [1, 2, 3, 4].map((value) => h('option', { key: value, value }, `模式 ${value}`))),
          h('select', {
            value: draft.level,
            onChange: (event) => setDraft({ ...draft, level: Number(event.target.value) }),
            style: field,
          }, [[1, '慢'], [7, '中'], [15, '快']].map(([raw, label]) => h('option', { key: raw, value: raw }, label))),
          h('button', {
            type: 'button',
            onClick: addPreset,
            style: {
              height: 28,
              padding: '0 12px',
              borderRadius: 6,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              font: 'inherit',
              fontSize: 12,
              cursor: 'pointer',
            },
          }, '添加'),
        ),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'toy-panel',
          order: 40,
          label: '外接躯体',
        }, PanelIcon))
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'toy-panel' }, Panel))
      },
    }
  },
})
