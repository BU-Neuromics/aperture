import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { HippoSource, WriteValues } from '../../data/hippoSource';
import type { CollectionModel, FormFieldModel } from '../../data/schemaModel';
import { RefPicker } from './RefPicker';
import { useCollectionUrlState } from './urlState';
import './collections.css';

/**
 * The Tier-0 generated form (W4.1–W4.5): fields derive from the mutation's
 * input type, widget per slot kind, `required` honored. Client pre-validation
 * gives fast feedback; the SERVER stays the validation authority — its
 * rejection is surfaced verbatim and attributed to fields where the message
 * names one (a heuristic seam until Hippo's structured ValidationResult
 * shape is confirmed over GraphQL). Updates are partial-merge: only touched,
 * non-empty fields travel (clearing a field is a later affordance).
 */
type Draft = Record<string, string | boolean>;

function initialDraft(fields: FormFieldModel[], entity?: Record<string, unknown>): Draft {
  const draft: Draft = {};
  for (const field of fields) {
    if (field.widget === 'checkbox') {
      draft[field.name] = entity ? Boolean(entity[field.name]) : false;
    } else if (entity && entity[field.name] != null) {
      const raw = entity[field.name];
      // Prefill refs from the resolved relationship's id.
      draft[field.name] =
        typeof raw === 'object'
          ? String((raw as Record<string, unknown>)['id'] ?? Object.values(raw as object)[0] ?? '')
          : String(raw);
    } else {
      draft[field.name] = '';
    }
  }
  return draft;
}

function toWriteValues(fields: FormFieldModel[], draft: Draft, touched?: Set<string>): WriteValues {
  const values: WriteValues = {};
  for (const field of fields) {
    if (touched && !touched.has(field.name)) continue;
    const raw = draft[field.name];
    if (field.widget === 'checkbox') {
      values[field.name] = Boolean(raw);
    } else {
      const text = String(raw ?? '').trim();
      if (text === '') continue; // optional + empty → omit (partial-merge)
      values[field.name] = field.widget === 'number' ? Number(text) : text;
    }
  }
  return values;
}

function clientValidate(fields: FormFieldModel[], draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.widget === 'checkbox') continue;
    const text = String(draft[field.name] ?? '').trim();
    if (field.required && text === '') errors[field.name] = 'Required.';
    else if (field.widget === 'number' && text !== '' && Number.isNaN(Number(text))) {
      errors[field.name] = 'Must be a number.';
    }
  }
  return errors;
}

export function EntityForm({
  source,
  collection,
  mode,
  entityId,
}: {
  source: HippoSource;
  collection: CollectionModel;
  mode: 'new' | 'edit';
  entityId?: string;
}) {
  const { closeForm, openEntity, openIn } = useCollectionUrlState();
  const write = mode === 'new' ? collection.write.create : collection.write.update;
  const fields = useMemo(() => write?.form.fields ?? [], [write]);

  const [draft, setDraft] = useState<Draft>(() => initialDraft(fields));
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'submitting'>(
    mode === 'edit' ? 'loading' : 'ready',
  );

  // Edit prefills from the entity along the detail path.
  useEffect(() => {
    if (mode !== 'edit' || !entityId) return;
    let cancelled = false;
    source
      .getEntity(collection.id, entityId)
      .then((entity) => {
        if (cancelled) return;
        setDraft(initialDraft(fields, entity ?? undefined));
        setPhase('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setServerError(error instanceof Error ? error.message : String(error));
        setPhase('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [source, collection.id, mode, entityId, fields]);

  if (!write) return null; // routing guards this; belt-and-braces

  const set = (name: string, value: string | boolean) => {
    setDraft((d) => ({ ...d, [name]: value }));
    setTouched((t) => new Set(t).add(name));
    setFieldErrors((errors) => {
      const next = { ...errors };
      delete next[name];
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const errors = clientValidate(fields, draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPhase('submitting');
    try {
      if (mode === 'new') {
        const newId = await source.createEntity(collection.id, toWriteValues(fields, draft));
        if (newId && collection.detail) openIn(collection.id, newId);
        else closeForm();
      } else {
        await source.updateEntity(collection.id, entityId!, toWriteValues(fields, draft, touched));
        openEntity(entityId!);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setServerError(message);
      // Field attribution heuristic: mark fields the server names.
      const attributed: Record<string, string> = {};
      for (const field of fields) {
        if (message.toLowerCase().includes(field.name.toLowerCase())) {
          attributed[field.name] = 'See server message above.';
        }
      }
      setFieldErrors(attributed);
      setPhase('ready');
    }
  };

  const title = mode === 'new' ? `New ${collection.typeName}` : `Edit ${entityId}`;

  return (
    <div className="detail-view">
      <div className="detail-header">
        <button type="button" className="detail-back" onClick={closeForm}>
          ← {mode === 'edit' && entityId ? entityId : collection.label}
        </button>
        <div className="detail-title-row">
          <span className="form-title">{title}</span>
          <span className="detail-type-chip">{collection.typeName}</span>
        </div>
      </div>

      {phase === 'loading' ? (
        <div className="main-panel" role="status">
          <p className="main-panel-detail">Loading record…</p>
        </div>
      ) : (
        <form className="entity-form" onSubmit={(e) => void submit(e)} noValidate>
          {serverError && (
            <div className="form-server-error" role="alert">
              <strong>The server rejected the submission.</strong> {serverError}
            </div>
          )}
          {fields.map((field) => (
            <div key={field.name} className="form-row">
              <label className="form-label" htmlFor={`field-${field.name}`}>
                {field.label}
                {field.required && (
                  <span className="form-required" aria-hidden="true">
                    *
                  </span>
                )}
              </label>
              <div className="form-control">
                <FieldWidget
                  field={field}
                  value={draft[field.name] ?? ''}
                  source={source}
                  onChange={(v) => set(field.name, v)}
                />
                {fieldErrors[field.name] && (
                  <div className="form-field-error">{fieldErrors[field.name]}</div>
                )}
              </div>
            </div>
          ))}
          <div className="form-actions">
            <button type="submit" className="form-submit" disabled={phase === 'submitting'}>
              {phase === 'submitting' ? 'Submitting…' : mode === 'new' ? 'Create' : 'Save changes'}
            </button>
            <button type="button" className="state-button" onClick={closeForm}>
              Cancel
            </button>
            <span className="form-footnote">
              The server validates authoritatively on submit.
            </span>
          </div>
        </form>
      )}
    </div>
  );
}

function FieldWidget({
  field,
  value,
  source,
  onChange,
}: {
  field: FormFieldModel;
  value: string | boolean;
  source: HippoSource;
  onChange: (value: string | boolean) => void;
}) {
  const id = `field-${field.name}`;
  switch (field.widget) {
    case 'checkbox':
      return (
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'select':
      return (
        <select
          id={id}
          className="form-input"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{field.required ? 'Select…' : '(none)'}</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case 'ref':
      return (
        <RefPicker
          inputId={id}
          source={source}
          targetType={field.targetType}
          value={String(value)}
          onChange={onChange}
        />
      );
    case 'number':
    case 'date':
    case 'text':
      return (
        <input
          id={id}
          type={field.widget === 'number' ? 'number' : field.widget === 'date' ? 'date' : 'text'}
          className="form-input"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
