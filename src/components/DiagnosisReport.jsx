import {
  LeafIcon,
  MicroscopeIcon,
  PillIcon,
  SearchIcon,
  ShieldIcon,
  SignalIcon,
  ZapIcon,
} from './Icons.jsx'

const QUICK_FACTS = [
  ['cause', MicroscopeIcon, 'Cause'],
  ['spread_risk', SignalIcon, 'Spread risk'],
  ['urgent_action', ZapIcon, 'Do this first'],
]

const PLANS = [
  ['protection', ShieldIcon, 'Protect surrounding crops', ''],
  ['treatment', PillIcon, 'Treatment plan', 'na'],
  ['organic_alternatives', LeafIcon, 'Organic and low-cost options', 'nb'],
]

export default function DiagnosisReport({ report, model }) {
  if (!report) return null

  const confidence = Math.max(0, Math.min(100, Number(report.confidence) || 0))
  const confidenceColor =
    confidence >= 75 ? 'var(--color-lime)' : confidence >= 50 ? 'var(--color-amber)' : 'var(--color-red)'

  const severity = String(report.severity ?? 'medium').toLowerCase()
  const severityClass =
    severity === 'none' ? 'sev-lime' : severity === 'high' ? 'sev-red' : 'sev-amber'

  return (
    <div className="space-y-3.5">
      <div className="panel flex flex-wrap items-center gap-5 p-5">
        <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-b1 bg-bg3 text-lime2">
          <MicroscopeIcon className="h-7 w-7" />
        </div>

        <div className="min-w-[13rem] flex-1">
          <h2 className="text-xl font-bold leading-tight text-ink">
            {report.disease_name || 'Unidentified condition'}
          </h2>
          {report.scientific_name && (
            <p className="mt-0.5 text-sm italic text-t3">{report.scientific_name}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className={`sev-pill ${severityClass}`}>{severity} severity</span>
            {model && <span className="text-xs text-t3">{model}</span>}
          </div>
        </div>

        <div className="w-full sm:w-44">
          <div className="flex items-baseline justify-between">
            <span className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-t3">
              Confidence
            </span>
            <span className="text-2xl font-black text-ink">{confidence}%</span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-bg3"
            role="meter"
            aria-valuenow={confidence}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Diagnosis confidence"
          >
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${confidence}%`, background: confidenceColor }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {QUICK_FACTS.map(([key, Icon, label]) => (
          <div key={key} className="qcard">
            <div className="qcard-icon">
              <Icon className="h-4 w-4" />
            </div>
            <div className="qcard-lbl">{label}</div>
            <div className="qcard-val">{report[key] || '—'}</div>
          </div>
        ))}
      </div>

      {report.about && (
        <section className="panel p-5">
          <h3 className="section-title">
            <SearchIcon className="h-4 w-4 text-t3" />
            About this disease
          </h3>
          <p className="text-sm leading-relaxed text-t2">{report.about}</p>
        </section>
      )}

      {PLANS.map(([key, Icon, title, tone]) => {
        const items = Array.isArray(report[key]) ? report[key] : []
        return (
          <section key={key} className="panel p-5">
            <h3 className="section-title">
              <Icon className="h-4 w-4 text-t3" />
              {title}
            </h3>
            <ul className="det-list">
              {items.length > 0 ? (
                items.map((item, index) => (
                  <li key={`${key}-${index}`}>
                    <span className={`num ${tone}`}>{index + 1}</span>
                    <span>{item}</span>
                  </li>
                ))
              ) : (
                <li className="text-t3">No steps provided.</li>
              )}
            </ul>
          </section>
        )
      })}

      <p className="rounded-2xl border border-[rgba(74,158,255,0.18)] bg-[rgba(74,158,255,0.06)] p-4 text-sm leading-relaxed text-t2">
        <strong className="text-blue">AI note:</strong>{' '}
        {report.ai_note || 'Confirm with a local agronomist before large-scale treatment.'}
      </p>
    </div>
  )
}
