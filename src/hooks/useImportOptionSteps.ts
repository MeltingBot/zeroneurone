/** Options step shown before importing a FEC or a GeoJSON with properties (both import modals) */

import { useState, useCallback } from 'react';
import { importService } from '../services/importService';
import {
  isFECFormat,
  analyzeFEC,
  DEFAULT_FEC_OPTIONS,
  suggestMinLinkAmount,
  type FECAggregate,
  type FECImportOptions,
} from '../services/importFEC';
import type { PendingGeoJSON } from '../components/modals/GeoJSONOptionsPanel';

export interface PendingFEC {
  file: File;
  fileName: string;
  content: string;
  aggregate: FECAggregate;
}

export function useImportOptionSteps() {
  const [pendingFEC, setPendingFEC] = useState<PendingFEC | null>(null);
  const [fecOptions, setFecOptions] = useState<FECImportOptions>(DEFAULT_FEC_OPTIONS);
  const [pendingGeoJSON, setPendingGeoJSON] = useState<(PendingGeoJSON & { file: File }) | null>(null);
  const [geoJSONLabelField, setGeoJSONLabelField] = useState('');
  const [geoJSONFields, setGeoJSONFields] = useState<Set<string>>(new Set());
  const [geoJSONTag, setGeoJSONTag] = useState('');

  /** Opens the options step when `file` needs one; returns whether it did. */
  const openOptionStep = useCallback((file: File, content: string): boolean => {
    // FEC is detected by content: .txt is too generic
    if (/\.(txt|fec)$/i.test(file.name) && isFECFormat(content)) {
      const aggregate = analyzeFEC(content);
      setPendingFEC({ file, fileName: file.name, content, aggregate });
      const base = { ...DEFAULT_FEC_OPTIONS, dateFrom: aggregate.dateMin, dateTo: aggregate.dateMax };
      // Adaptive threshold: about 300 links whatever the size of the FEC
      setFecOptions({ ...base, minLinkAmount: suggestMinLinkAmount(aggregate, base) });
      return true;
    }
    // GeoJSON with properties: the analyst picks the label field and the fields kept
    if (/\.(geo)?json$/i.test(file.name)) {
      const analysis = importService.analyzeGeoJSONFields(content);
      if (analysis && analysis.fields.length > 0) {
        setPendingGeoJSON({ file, fileName: file.name, content, featureCount: analysis.featureCount, fields: analysis.fields });
        setGeoJSONLabelField(analysis.suggested ?? analysis.fields[0].key);
        setGeoJSONFields(new Set(analysis.fields.map((f) => f.key)));
        return true;
      }
    }
    return false;
  }, []);

  return {
    pendingFEC, setPendingFEC, fecOptions, setFecOptions,
    pendingGeoJSON, setPendingGeoJSON,
    geoJSONLabelField, setGeoJSONLabelField,
    geoJSONFields, setGeoJSONFields,
    geoJSONTag, setGeoJSONTag,
    openOptionStep,
  };
}
