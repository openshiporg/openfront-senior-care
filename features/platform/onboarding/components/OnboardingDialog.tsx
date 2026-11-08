'use client'

import React, { useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2 } from 'lucide-react'
import { GraphQLClient } from 'graphql-request'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { completeOnboarding, startOnboarding } from '../actions/onboarding'
import { SETUP_SECTIONS } from '../config/sections'

type Step = 'review' | 'running' | 'done'

const errorText = (e: any) => e?.response?.errors?.map((x: any) => x.message).join('\n') || e?.message || 'Setup did not finish.'

const OnboardingDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<Step>('review')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Record<string, number> | null>(null)
  const [progress, setProgress] = useState<{ title: string; done: number; total: number } | null>(null)
  // One key per dialog: a retry after a dropped connection replays instead of running twice.
  const key = useRef(`setup-${crypto.randomUUID()}`)
  const running = useRef(false)

  if (!isOpen) return null

  const run = async () => {
    if (running.current) return
    running.current = true
    setError(null)
    setStep('running')
    try {
      const started = await startOnboarding()
      if (!started.success) throw new Error(started.error || 'Could not record setup progress')
      const client = new GraphQLClient(`${window.location.origin}/api/graphql`, { headers: { 'Content-Type': 'application/json' } })
      for (const section of SETUP_SECTIONS) {
        // A resumable section returns `finished: false` until its last piece is loaded.
        for (let piece = 0; ; piece += 1) {
          // A piece that times out may still have committed; asking again replays it, so retry a few times.
          let result: any
          for (let attempt = 0; ; attempt += 1) {
            try { result = await client.request(section.mutation, { idempotencyKey: `${key.current}:${section.id}:${piece}` }); break }
            catch (err) { if (attempt >= 2) throw err; await new Promise(r => setTimeout(r, 1500)) }
          }
          const payload = result?.[section.field]
          if (!payload?.created) throw new Error(`${section.title} did not return a result`)
          setCreated(prev => {
            const next = { ...(prev ?? {}) }
            for (const [name, n] of Object.entries(payload.created as Record<string, number>)) next[name] = (next[name] ?? 0) + n
            return next
          })
          if (payload.total) setProgress({ title: section.title, done: payload.done, total: payload.total })
          if (payload.finished !== false) break
          if (piece > 400) throw new Error(`${section.title} did not finish`)
        }
        setProgress(null)
      }
      const completed = await completeOnboarding()
      if (!completed.success) throw new Error(completed.error || 'Could not complete setup')
      setStep('done')
    } catch (e) {
      setError(errorText(e))
      setStep('review')
    } finally {
      running.current = false
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle>Community setup</DialogTitle>
          <DialogDescription>Loads Ridgeline Senior Communities and Maple Ridge Senior Living in Columbus, Ohio: the operator, the campus, its staff and a year of census history. Every record is marked synthetic. Existing records are kept; loading again changes nothing.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {SETUP_SECTIONS.map(section => (
            <div key={section.id} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.title}</p>
              <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                {section.items.map(item => (
                  <li key={item} className="flex min-w-0 items-center gap-2">
                    {step === 'done' ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : step === 'running' ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />}
                    <span className="truncate">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {step === 'running' && progress ? (
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">{progress.title}: {progress.done} of {progress.total} steps</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} /></div>
            </div>
          ) : null}
          {step === 'done' && created ? (
            <p className="text-sm text-muted-foreground">
              Created {Object.entries(created).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`).join(', ') || 'nothing new (already loaded)'}.
            </p>
          ) : null}
          {step === 'done' ? (
            <div className="flex flex-wrap gap-4 text-sm">
              <Link href="/dashboard/platform/census" className="font-medium underline underline-offset-4" onClick={onClose}>Census</Link>
              <Link href="/dashboard/platform/approvals" className="font-medium underline underline-offset-4" onClick={onClose}>Approvals</Link>
              <Link href="/dashboard/AuditEvents" className="font-medium underline underline-offset-4" onClick={onClose}>Audit log</Link>
            </div>
          ) : null}
        </div>
        {error ? <p className="break-words border-t px-4 py-3 text-sm text-red-600 sm:px-6">{error} Saved records are reused when you retry.</p> : null}
        <div className="flex shrink-0 gap-2 border-t p-4">
          {step === 'done' ? (
            <DialogClose asChild><Button className="flex-1">Close</Button></DialogClose>
          ) : (
            <>
              <DialogClose asChild><Button variant="ghost" disabled={step === 'running'} className="flex-1">Cancel</Button></DialogClose>
              {step === 'running' ? <Button disabled className="flex-1"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading</Button> : <Button onClick={run} className="flex-1">{error ? 'Retry setup' : 'Load Maple Ridge'}</Button>}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default OnboardingDialog
