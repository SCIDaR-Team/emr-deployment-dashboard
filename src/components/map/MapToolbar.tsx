import { useState } from 'react';
import {
  Plus,
  Minus,
  Maximize2,
  Minimize2,
  Layers,
  Crosshair,
  Home,
  ImageDown,
  Loader2,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { MapLayerPanel } from './MapLayerPanel';
import { MapSearchPanel, type MapSearchResult } from './MapSearch';
import { useMapLayersModified, type MapLayerId } from '@/store/mapLayerStore';

/**
 * The map's own controls, in the corner every GIS puts them.
 *
 * Zoom in, zoom out and reset are the three a chart with a zoom needs, and they
 * are all this column used to carry. The rest are the ones a spatial tool
 * needs, and each is here because it does something no other control can:
 *
 * - **Zoom to selection** frames the thing the reader has picked. Panning to
 *   find a selected LGA by eye is the single most tedious thing about a map
 *   with a list beside it, and one button removes it.
 * - **Full extent** returns to the whole of the current level in one action,
 *   from any depth of zoom. Distinct from the breadcrumb, which changes *level*
 *   — this changes only the camera.
 * - **Full screen** gives the map the display. See `useFullscreen` for why that
 *   is not the same as zooming.
 * - **Find** resolves a name to a place and goes there. See `MapSearch` for
 *   why that is not the same control as the filter row's Search.
 * - **Layers** opens the stack. See `MapLayerPanel`.
 * - **Save image** captures the frame — legend, scale bar and attribution
 *   included, which is what a screenshot loses. See `useMapExport`.
 *
 * Every one of them is a real button rather than a gesture, because the
 * gestures — wheel, pinch, double-click, drag — are invisible, undiscoverable
 * and unreachable from a keyboard. The gestures are the fast path for people
 * who already know they exist; this column is how anyone finds out.
 */

export function MapToolbar({
  onZoomIn,
  onZoomOut,
  onReset,
  canReset,
  onFitSelection,
  fitLabel,
  isFullscreen,
  onToggleFullscreen,
  onExport,
  exporting,
  onSearch,
  layers,
  className,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  canReset: boolean;
  /** Absent when nothing is selected at this level — the button is then not
   *  rendered rather than rendered inert. */
  onFitSelection?: () => void;
  /** What the fit button will frame, named, e.g. "Zoom to Dala". */
  fitLabel?: string;
  /** Omitted where the browser refuses full screen — see `useFullscreen`. */
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** Save the map as an image. Omit to leave the button out. */
  onExport?: () => void;
  /** True while the capture runs — it takes a network round-trip for the
   *  dynamically imported rasteriser, so the button has to say it is working
   *  rather than appear to do nothing. */
  exporting?: boolean;
  /** Resolve a query to places the map can go to. Omit to leave the locator
   *  out — see `MapSearch`. */
  onSearch?: (query: string) => MapSearchResult[];
  /** Which layer toggles this level offers. Omit to leave the panel out. */
  layers?: MapLayerId[];
  className?: string;
}) {
  /**
   * At most one panel at a time.
   *
   * Both hang in the same slot to the left of the button column, so opening one
   * has to close the other — two overlapping panels would be a rendering fault,
   * and giving each its own slot would push one of them off a short map.
   */
  const [panel, setPanel] = useState<'layers' | 'search' | null>(null);
  const panelOpen = panel === 'layers';
  /** Layer choices persist across sessions, so a map can arrive already
   *  subtracted. The dot is how the reader finds out — see the note on
   *  `useMapLayersModified`. */
  const layersModified = useMapLayersModified();

  const button =
    'grid h-7 w-7 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';

  return (
    <div className={cn('absolute right-2 top-2 flex items-start gap-2', className)}>
      {/* The panel hangs to the *left* of the column rather than below it: the
          buttons are already against the right edge of the map, and a panel
          under them would run off the bottom on a short map. */}
      {onSearch && (
        <MapSearchPanel
          open={panel === 'search'}
          onClose={() => setPanel(null)}
          search={onSearch}
        />
      )}

      {layers && (
        <MapLayerPanel
          open={panelOpen}
          onClose={() => setPanel(null)}
          available={layers}
        />
      )}

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface/90 shadow-card backdrop-blur">
        <button type="button" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in" className={button}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
          className={button}
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>

        {onFitSelection && (
          <button
            type="button"
            onClick={onFitSelection}
            title={fitLabel ?? 'Zoom to selection'}
            aria-label={fitLabel ?? 'Zoom to selection'}
            className={button}
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          title="Full extent"
          aria-label="Zoom to full extent"
          className={button}
        >
          <Home className="h-3.5 w-3.5" aria-hidden />
        </button>

        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            aria-label={isFullscreen ? 'Exit full screen' : 'Full screen map'}
            className={button}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        )}

        {onSearch && (
          <button
            type="button"
            onClick={() => setPanel((p) => (p === 'search' ? null : 'search'))}
            title="Find a place"
            aria-label="Find a place on the map"
            aria-expanded={panel === 'search'}
            className={cn(button, panel === 'search' && 'bg-muted text-foreground')}
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        {onExport && (
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            title="Save map as image"
            aria-label="Save map as an image"
            className={button}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <ImageDown className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        )}

        {layers && (
          <button
            type="button"
            onClick={() => setPanel((p) => (p === 'layers' ? null : 'layers'))}
            title={layersModified ? 'Layers — some are hidden' : 'Layers'}
            aria-label={layersModified ? 'Map layers, some hidden' : 'Map layers'}
            aria-expanded={panelOpen}
            className={cn(button, 'relative', panelOpen && 'bg-muted text-foreground')}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden />
            {layersModified && (
              <span
                aria-hidden
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand-600 ring-1 ring-surface"
              />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
