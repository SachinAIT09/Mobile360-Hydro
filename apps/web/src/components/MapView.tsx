import { Suspense, lazy, useCallback, useState } from 'react';
import type { FeederStat, SubstationStat } from '@demo/shared';
import { SchematicMap } from './SchematicMap';
import { LoadingBlock } from './State';

// Leaflet (~150 kB) loads only when someone opens the Map view.
const RealMap = lazy(() => import('./RealMap'));

export interface MapViewProps {
  feeders: FeederStat[];
  selected: string | null;
  onSelect: (code: string) => void;
  substationCode: string;
  /** All substations: shown as context markers on the real map; clicking one selects it. */
  substations?: SubstationStat[];
  onSelectSubstation?: (code: string) => void;
}

function initiallyOnline(): boolean {
  try {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  } catch {
    return true;
  }
}

/**
 * Feeder map: a real basemap (OpenStreetMap tiles) with illustrative feeder routes. If tiles can't load
 * (offline demo, blocked network) it falls back to the schematic layout, with a way to retry.
 */
export function MapView(props: MapViewProps) {
  const [mode, setMode] = useState<'real' | 'schematic'>(() => (initiallyOnline() ? 'real' : 'schematic'));
  const [fellBack, setFellBack] = useState(!initiallyOnline());
  const onTilesFailed = useCallback(() => {
    setMode('schematic');
    setFellBack(true);
  }, []);

  if (mode === 'schematic') {
    return (
      <div className="stack gap8">
        {fellBack && (
          <div className="notice" role="status">
            Map tiles couldn't load (no internet?), so this shows the schematic layout.{' '}
            <button type="button" className="linkbtn" onClick={() => setMode('real')}>
              Try the map again
            </button>
          </div>
        )}
        <SchematicMap feeders={props.feeders} selected={props.selected} onSelect={props.onSelect} substationCode={props.substationCode} />
      </div>
    );
  }
  return (
    <Suspense fallback={<LoadingBlock rows={6} label="Loading map" />}>
      <RealMap {...props} onTilesFailed={onTilesFailed} />
    </Suspense>
  );
}
