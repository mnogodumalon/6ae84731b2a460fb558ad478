/**
 * Termin festlegen — 4-Schritt-Wizard.
 * Steps: 1) Offenes Treffen wählen → 2) Terminvorschläge mit Rückmeldungen ansehen
 *        → 3) Terminvorschlag auswählen → 4) Prüfen & Termin übernehmen (Status „Termin festgelegt“).
 * Reads: treffen, terminvorschlaege, rueckmeldungen. Writes: treffen (update festgelegter_termin + status via useTerminFestlegenFlow).
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { IconCheck, IconQuestionMark, IconX } from '@tabler/icons-react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldDate, fieldLookup, fieldRef, refFilter, optionsOf } from '@/lib/journey';
import type { JourneyRecord } from '@/lib/journey';
import { useTerminFestlegenFlow } from '@/lib/journey/flows/TerminFestlegen';
import { dateFnsLocale, tx } from '@/i18n';

interface Proposal {
  id: string;
  termin: string;
  anmerkung: string;
  answers: { name: string; antwort: string; kommentar: string }[];
}

export default function TerminFestlegenPage() {
  const [step, setStep] = useState(1);
  const flow = useTerminFestlegenFlow({
    steps: { treffen: 1, festgelegter_termin: 3 },
    items: {
      treffen: r => ({
        id: r.id,
        title: fieldText(r, 'titel'),
        subtitle: fieldText(r, 'ort') || undefined,
        status: fieldLookup(r, 'status') ?? undefined,
      }),
    },
  });

  const form = flow.forms.treffen;
  const treffenId = flow.pick('treffen').selectedId ?? null;
  const treffenRecord = treffenId ? flow.picks.treffen.recordOf(treffenId) : undefined;
  const isOpen = !treffenRecord || fieldLookup(treffenRecord, 'status')?.key === 'offen';

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const port = flow.port;
  useEffect(() => {
    if (!treffenId) { setProposals([]); return; }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const vorschlaege = await port.list('terminvorschlaege', {
          filter: refFilter('treffen', treffenId), orderby: ['r.v_termin asc'], limit: 200,
        });
        const ids = new Set(vorschlaege.map(v => v.id));
        const alle = await port.list('rueckmeldungen', { limit: 500 });
        const mine = alle.filter((r: JourneyRecord) => ids.has(fieldRef(r, 'terminvorschlag') ?? ''));
        if (cancelled) return;
        setProposals(vorschlaege.map(v => ({
          id: v.id,
          termin: fieldDate(v, 'termin') ?? '',
          anmerkung: fieldText(v, 'anmerkung'),
          answers: mine.filter(r => fieldRef(r, 'terminvorschlag') === v.id).map(r => ({
            name: `${fieldText(r, 'teilnehmer_vorname')} ${fieldText(r, 'teilnehmer_nachname')}`.trim(),
            antwort: fieldLookup(r, 'antwort')?.key ?? '',
            kommentar: fieldText(r, 'kommentar'),
          })),
        })));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [port, treffenId]);

  const statusLabel = useMemo(
    () => optionsOf('treffen', 'status').find(o => o.key === 'termin_festgelegt')?.label ?? '',
    [],
  );

  const fmt = (iso: string) => {
    if (!iso) return '—';
    try { return format(parseISO(iso), 'EEEE, dd.MM.yyyy · HH:mm', { locale: dateFnsLocale() }); } catch { return iso; }
  };
  const count = (p: Proposal, key: string) => p.answers.filter(a => a.antwort === key).length;
  const chosen = String(form.get('festgelegter_termin') ?? '');
  const chosenKey = chosen.slice(0, 16);

  const answerIcon = (key: string) =>
    key === 'kann' ? <IconCheck size={14} className="shrink-0 text-emerald-600" />
      : key === 'kann_evtl' ? <IconQuestionMark size={14} className="shrink-0 text-amber-600" />
        : <IconX size={14} className="shrink-0 text-red-600" />;

  const closedMessage = tx('Für dieses Treffen ist bereits ein Termin festgelegt oder es wurde abgesagt.');

  return (
    <IntentWizardShell
      title={tx('Termin festlegen')}
      currentStep={step} onStepChange={setStep}
      forms={flow.formList} draftKey={flow.draftKey}
      intro={{ description: tx('Wähle den besten Terminvorschlag und setze das Treffen fest.'), needs: [tx('Ein offenes Treffen')] }}
    >
      <WizardStep label={tx('Treffen')} description={tx('Für welches offene Treffen soll ein Termin feststehen?')}>
        <EntitySelectStep {...flow.picks.treffen.select} {...flow.pick('treffen')} create={false}
          searchPlaceholder={tx('Titel oder Ort …')} avatar="none" />
      </WizardStep>

      <WizardStep label={tx('Rückmeldungen')} needs={['treffen']}
        description={tx('So haben die Teilnehmer auf die Terminvorschläge geantwortet.')}>
        <div className="space-y-3">
          {!isOpen && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{closedMessage}</p>}
          {loading && <p className="text-sm text-muted-foreground">{tx('Rückmeldungen werden geladen …')}</p>}
          {loadError && <p className="text-sm text-destructive">{loadError}</p>}
          {!loading && !loadError && proposals.length === 0 && (
            <p className="rounded-xl bg-secondary p-3 text-sm text-muted-foreground">{tx('Für dieses Treffen gibt es noch keine Terminvorschläge.')}</p>
          )}
          {proposals.map(p => (
            <div key={p.id} className="overflow-hidden rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="min-w-0 font-medium">{fmt(p.termin)}</p>
                <p className="text-xs text-muted-foreground">
                  {tx`${count(p, 'kann')} können · ${count(p, 'kann_evtl')} vielleicht · ${count(p, 'kann_nicht')} nicht`}
                </p>
              </div>
              {p.anmerkung && <p className="mt-1 text-sm text-muted-foreground">{p.anmerkung}</p>}
              {p.answers.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{tx('Noch keine Rückmeldungen.')}</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {p.answers.map((a, i) => (
                    <li key={i} className="flex min-w-0 items-start gap-2 text-sm">
                      <span className="mt-1">{answerIcon(a.antwort)}</span>
                      <span className="min-w-0 break-words">
                        {a.name}{a.kommentar && <span className="text-muted-foreground"> — {a.kommentar}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <StepNav onBack={() => setStep(1)}
            onNext={() => (isOpen ? true : closedMessage)}
            nextDisabled={loading || proposals.length === 0}
            nextStepLabel={tx('Termin wählen')} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Termin')} needs={['treffen']}
        description={tx('Tippe auf den Terminvorschlag, der stattfinden soll.')}>
        <div className="space-y-3">
          <Field form={form} name="festgelegter_termin">
            <div className="grid gap-2 sm:grid-cols-2">
              {proposals.map(p => {
                const active = chosenKey !== '' && chosenKey === p.termin.slice(0, 16);
                return (
                  <button type="button" key={p.id}
                    onClick={() => form.set('festgelegter_termin', p.termin.slice(0, 16))}
                    aria-pressed={active}
                    className={`min-w-0 overflow-hidden rounded-2xl border p-4 text-left transition-colors ${active ? 'border-primary bg-primary/10' : 'bg-card hover:bg-secondary'}`}>
                    <p className="font-medium">{fmt(p.termin)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tx`${count(p, 'kann')} können · ${count(p, 'kann_evtl')} vielleicht · ${count(p, 'kann_nicht')} nicht`}
                    </p>
                  </button>
                );
              })}
            </div>
          </Field>
          <StepNav onBack={() => setStep(2)}
            onNext={() => (isOpen ? flow.validateStep(3) : closedMessage)}
            nextStepLabel={tx('Prüfen')} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep forms={flow.formList} submit={flow.submit}
            items={[{ key: 'status', label: tx('Neuer Status'), value: statusLabel }]}
            whatHappensNext={tx('Das Treffen bekommt den gewählten Termin und gilt als festgelegt.')} />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep result={flow.submit.result} submit={flow.submit}
          facts={[
            { label: tx('Festgelegter Termin'), value: fmt(chosen) },
            { label: tx('Status'), value: statusLabel },
          ]}
          actions={{ copy: false, print: false }}
          next={[
            { label: tx('Weiteres Treffen festlegen'), onClick: () => { setStep(1); } },
            { label: tx('Neues Treffen anlegen'), href: '#/intents/treffen-mit-terminen-anlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]} />
      )}
    </IntentWizardShell>
  );
}
