import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageProps } from './types';
import { errorText, tr } from './ui';
import { useUnsavedChanges } from './workflow';

export function useDraft<T>(
  props: PageProps,
  kind: 'attendance' | 'assessment',
  context: string,
  initial: T,
  enabled: boolean,
) {
  const [body, setBody] = useState(initial);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const revision = useRef(0);
  const bodyRef = useRef(initial);
  const generation = useRef(0);
  const editVersion = useRef(0);
  const lock = useRef<Promise<number> | null>(null);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const allowLeave = useUnsavedChanges(dirty, props.lang, saving);
  const load = useCallback(async () => {
    const token = ++generation.current;
    setReady(false);
    setDirty(false);
    setError('');
    setSavedAt('');
    revision.current = 0;
    const baseline = structuredClone(initialRef.current);
    setBody(baseline);
    bodyRef.current = baseline;
    if (!enabled) return;
    try {
      const record = await props.api.rpc('get_work_draft', { p_kind: kind, p_context: context });
      if (token !== generation.current) return;
      if (record) {
        revision.current = record.revision;
        setBody(record.body);
        bodyRef.current = record.body;
        setSavedAt(record.updated_at);
      }
      setReady(true);
    } catch (cause) {
      if (token === generation.current) setError(errorText(cause, props.lang));
    }
  }, [props.api, kind, context, enabled]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const edit = (next: T | ((previous: T) => T)) => {
    if (!ready) return;
    const value = typeof next === 'function' ? (next as (previous: T) => T)(bodyRef.current) : next;
    bodyRef.current = value;
    setBody(value);
    editVersion.current++;
    setDirty(true);
    setError('');
  };
  const flush = useCallback(
    async function persist(): Promise<number> {
      if (lock.current) {
        await lock.current;
        return persist();
      }
      if (!ready)
        throw new Error(
          tr(props.lang, 'Wait for the draft to load.', 'Taslağın yüklenmesini bekleyin.'),
        );
      const token = generation.current;
      const version = editVersion.current;
      const request = props.api
        .rpc('save_work_draft', {
          p_kind: kind,
          p_context: context,
          p_body: bodyRef.current,
          p_revision: revision.current,
        })
        .then((record) => {
          if (token === generation.current) {
            revision.current = record.revision;
            setSavedAt(record.updated_at);
            if (version === editVersion.current) setDirty(false);
          }
          return record.revision as number;
        })
        .catch((cause) => {
          if (token === generation.current) setError(errorText(cause, props.lang));
          throw cause;
        })
        .finally(() => {
          lock.current = null;
          if (token === generation.current) setSaving(false);
        });
      lock.current = request;
      setSaving(true);
      return request;
    },
    [props.api, kind, context, ready, props.lang],
  );
  useEffect(() => {
    if (!dirty || error || !ready || saving) return;
    const timer = window.setTimeout(() => {
      void flush().catch(() => {});
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [body, dirty, error, ready, saving, flush]);
  const discard = async () => {
    if (
      !window.confirm(
        tr(
          props.lang,
          'Discard your draft and reload the submitted record?',
          'Taslağınızı silip gönderilmiş kaydı yüklemek istiyor musunuz?',
        ),
      )
    )
      return;
    try {
      await props.api.rpc('discard_work_draft', {
        p_kind: kind,
        p_context: context,
        p_revision: revision.current,
      });
      await props.refresh();
      window.setTimeout(() => void load(), 0);
    } catch (cause) {
      setError(errorText(cause, props.lang));
    }
  };
  return {
    body,
    edit,
    ready,
    dirty,
    saving,
    error,
    savedAt,
    flush,
    reload: load,
    discard,
    allowLeave,
    finalized: () => {
      setDirty(false);
      setSavedAt(new Date().toISOString());
    },
  };
}

export function DraftStatus({
  draft,
  lang,
}: {
  draft: Pick<
    ReturnType<typeof useDraft>,
    | 'ready'
    | 'dirty'
    | 'saving'
    | 'error'
    | 'savedAt'
    | 'reload'
    | 'discard'
    | 'allowLeave'
    | 'flush'
  >;
  lang: PageProps['lang'];
}) {
  return (
    <div
      className={`save-status ${draft.error ? 'notice-error' : ''}`}
      role={draft.error ? 'alert' : 'status'}
    >
      <span>
        {draft.error ||
          (draft.saving
            ? tr(lang, 'Saving draft…', 'Taslak kaydediliyor…')
            : !draft.ready
              ? tr(lang, 'Loading draft…', 'Taslak yükleniyor…')
              : draft.dirty
                ? tr(lang, 'Not saved yet', 'Henüz kaydedilmedi')
                : draft.savedAt
                  ? `${tr(lang, 'Draft saved', 'Taslak kaydedildi')} · ${new Date(draft.savedAt).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}`
                  : tr(lang, 'No changes yet', 'Henüz değişiklik yok'))}
      </span>
      {draft.error && (
        <>
          <button
            type="button"
            className="text-button"
            disabled={draft.saving}
            onClick={() => void draft.flush().catch(() => {})}
          >
            {tr(lang, 'Retry save', 'Tekrar kaydet')}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (draft.allowLeave()) void draft.reload();
            }}
          >
            {tr(lang, 'Reload latest draft', 'Son taslağı yükle')}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={draft.saving}
            onClick={() => void draft.discard()}
          >
            {tr(lang, 'Discard draft and start again', 'Taslağı sil ve yeniden başla')}
          </button>
        </>
      )}
    </div>
  );
}
