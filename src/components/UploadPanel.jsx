import { useEffect, useRef, useState } from 'react'
import { prepareImage } from '../lib/prepareImage.js'
import { AlertIcon, CameraIcon, CloseIcon, LeafIcon, MicroscopeIcon, SunIcon, UploadCloudIcon } from './Icons.jsx'

const TIPS = [
  [CameraIcon, 'Close-up shot', 'Fill the frame with affected leaves'],
  [SunIcon, 'Good light', 'Daylight, no heavy shadow or flash'],
  [LeafIcon, 'One plant', 'A single crop per photo reads best'],
]

const STEPS = ['Uploading photo', 'Reading the leaf', 'Building treatment plan']

export default function UploadPanel({ onAnalyse, busy, error, onDismissError }) {
  const [selected, setSelected] = useState(null) // { file, previewUrl }
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState(null)
  const [step, setStep] = useState(0)
  const inputRef = useRef(null)

  // Object URLs are not garbage collected on their own.
  useEffect(() => {
    return () => {
      if (selected?.previewUrl) URL.revokeObjectURL(selected.previewUrl)
    }
  }, [selected])

  // The server does not stream progress, so the step list is a paced estimate
  // rather than a real measurement.
  useEffect(() => {
    if (!busy) {
      setStep(0)
      return undefined
    }
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4000)
    return () => clearInterval(timer)
  }, [busy])

  async function accept(file) {
    if (!file) return
    setLocalError(null)
    onDismissError?.()
    try {
      const prepared = await prepareImage(file)
      setSelected((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
        return prepared
      })
    } catch (err) {
      setLocalError(err.message)
    }
  }

  const clear = () => {
    setSelected((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
    if (inputRef.current) inputRef.current.value = ''
  }

  const shownError = localError ?? error

  if (busy) {
    return (
      <div className="panel animate-rise p-8 text-center">
        <div
          className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-2 border-b1"
          style={{ borderTopColor: 'var(--color-lime)' }}
        />
        <h2 className="text-lg font-bold text-ink">Analysing your crop…</h2>
        <p className="mt-1 text-sm text-t3">This usually takes a few seconds.</p>

        <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2">
          {STEPS.map((label, index) => (
            <div
              key={label}
              className="flex items-center gap-2 text-xs"
              style={{ color: index <= step ? 'var(--color-lime2)' : 'var(--color-t3)' }}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${index === step ? 'animate-pulse-dot' : ''}`}
                style={{
                  background: index <= step ? 'var(--color-lime)' : 'var(--color-t3)',
                }}
              />
              {label}
            </div>
          ))}
        </div>

        <div className="mx-auto mt-7 max-w-md space-y-2.5">
          <div className="skel h-3 w-3/4" />
          <div className="skel h-3" />
          <div className="skel h-3 w-5/6" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="mx-auto max-w-2xl animate-rise text-center">
        <h1 className="text-3xl font-black leading-[1.08] tracking-tight text-ink md:text-5xl">
          Detect. Protect.{' '}
          <span className="bg-gradient-to-r from-lime2 to-lime bg-clip-text text-transparent">
            Treat.
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[0.95rem] leading-relaxed text-t2">
          Upload a photo of your crop for an instant diagnosis, then keep asking questions. Every
          answer stays in one saved conversation you can reopen any time.
        </p>
      </section>

      {shownError && (
        <div
          role="alert"
          className="panel border-[rgba(232,160,32,0.24)] bg-[rgba(232,160,32,0.06)] p-5"
        >
          <div className="flex items-start gap-3">
            <AlertIcon className="mt-0.5 h-4 w-4 flex-none text-amber" aria-hidden="true" />
            <div>
              <p className="font-semibold text-amber">{shownError}</p>
              <ul className="mt-2 space-y-1 text-sm text-t2">
                <li>Check the network connection and try again.</li>
                <li>If the model is busy, wait 30 to 60 seconds.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {!selected ? (
        <div className="panel animate-rise p-5">
          <label
            htmlFor="crop-photo"
            className={`uzone${dragging ? ' drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              accept(e.dataTransfer.files?.[0])
            }}
          >
            <div
              className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl border border-b1 bg-bg3 text-lime2"
              aria-hidden="true"
            >
              <UploadCloudIcon className="h-5 w-5" />
            </div>
            <div className="text-lg font-bold text-ink">Drop a crop photo here</div>
            <div className="mt-1.5 text-sm text-t3">or click to browse · JPG · PNG · WEBP</div>
          </label>
          <input
            ref={inputRef}
            id="crop-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => accept(e.target.files?.[0])}
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {TIPS.map(([Icon, title, hint]) => (
              <div key={title} className="rounded-xl border border-b1 bg-bg3 p-3.5">
                <Icon className="h-4 w-4 text-lime2" aria-hidden="true" />
                <div className="mt-1.5 text-[0.8rem] font-bold text-ink">{title}</div>
                <div className="mt-0.5 text-[0.75rem] leading-snug text-t3">{hint}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="panel animate-rise overflow-hidden">
          <div className="relative">
            <img
              src={selected.previewUrl}
              alt="Selected crop"
              className="max-h-[21rem] w-full object-cover"
            />
            <button
              onClick={clear}
              title="Remove photo"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-b1 bg-black/60 text-ink backdrop-blur transition-colors hover:bg-red/90"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-b1 p-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{selected.file.name}</div>
              <div className="text-xs text-t3">
                {Math.round(selected.file.size / 1024)} KB · ready to analyse
              </div>
            </div>
            <button className="btn btn-ghost" onClick={clear}>
              Change photo
            </button>
            <button
              className="btn btn-primary inline-flex items-center gap-2"
              onClick={() => onAnalyse(selected.file)}
            >
              <MicroscopeIcon className="h-4 w-4" />
              Analyse crop
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
