import { create } from 'zustand';

/**
 * LayerStore - 레이어 표시 관련 상태 관리
 * - 웨이포인트/장애물/공역
 * - 기상 레이어
 * - 한국 공역/항로
 */

interface LayerState {
  // RKPU layers
  showWaypoints: boolean;
  showObstacles: boolean;
  showAirspace: boolean;

  // Weather layers
  showLightning: boolean;
  showSigmet: boolean;

  // Korea airspace
  showKoreaRoutes: boolean;
  showKoreaWaypoints: boolean;
  showKoreaNavaids: boolean;
  showKoreaAirspaces: boolean;
  showKoreaAirports: boolean;
  showKoreaHoldings: boolean;
  showKoreaTerminalWaypoints: boolean;

  // Korea procedures
  showKoreaSids: boolean;
  showKoreaStars: boolean;
  showKoreaIaps: boolean;
  selectedKoreaAirport: string;

  // Global data layers
  showGlobalAirports: boolean;
  showGlobalNavaids: boolean;
  showGlobalHeliports: boolean;
  showGlobalWaypoints: boolean;
  showGlobalAirways: boolean;
  showGlobalHoldings: boolean;
  showGlobalCtrlAirspace: boolean;
  showGlobalRestrAirspace: boolean;
  showGlobalFirUir: boolean;
}

interface LayerActions {
  // RKPU layers
  setShowWaypoints: (value: boolean) => void;
  setShowObstacles: (value: boolean) => void;
  setShowAirspace: (value: boolean) => void;

  // Weather layers
  setShowLightning: (value: boolean) => void;
  setShowSigmet: (value: boolean) => void;

  // Korea airspace
  setShowKoreaRoutes: (value: boolean) => void;
  setShowKoreaWaypoints: (value: boolean) => void;
  setShowKoreaNavaids: (value: boolean) => void;
  setShowKoreaAirspaces: (value: boolean) => void;
  setShowKoreaAirports: (value: boolean) => void;
  setShowKoreaHoldings: (value: boolean) => void;
  setShowKoreaTerminalWaypoints: (value: boolean) => void;

  // Korea procedures
  setShowKoreaSids: (value: boolean) => void;
  setShowKoreaStars: (value: boolean) => void;
  setShowKoreaIaps: (value: boolean) => void;
  setSelectedKoreaAirport: (value: string) => void;

  // Global data layers
  setShowGlobalAirports: (value: boolean) => void;
  setShowGlobalNavaids: (value: boolean) => void;
  setShowGlobalHeliports: (value: boolean) => void;
  setShowGlobalWaypoints: (value: boolean) => void;
  setShowGlobalAirways: (value: boolean) => void;
  setShowGlobalHoldings: (value: boolean) => void;
  setShowGlobalCtrlAirspace: (value: boolean) => void;
  setShowGlobalRestrAirspace: (value: boolean) => void;
  setShowGlobalFirUir: (value: boolean) => void;

  // Toggle helpers
  toggleWaypoints: () => void;
  toggleObstacles: () => void;
  toggleAirspace: () => void;
  toggleLightning: () => void;
  toggleSigmet: () => void;

  // Reset
  resetLayers: () => void;
}

export type LayerStore = LayerState & LayerActions;

const useLayerStore = create<LayerStore>((set) => ({
  // RKPU layers
  showWaypoints: false,
  showObstacles: false,
  showAirspace: true,

  // Weather layers
  showLightning: false,
  showSigmet: false,

  // Korea airspace
  showKoreaRoutes: false,
  showKoreaWaypoints: false,
  showKoreaNavaids: false,
  showKoreaAirspaces: false,
  showKoreaAirports: false,
  showKoreaHoldings: false,
  showKoreaTerminalWaypoints: true,

  // Korea procedures
  showKoreaSids: false,
  showKoreaStars: false,
  showKoreaIaps: false,
  selectedKoreaAirport: '',

  // Global data layers
  showGlobalAirports: false,
  showGlobalNavaids: false,
  showGlobalHeliports: false,
  showGlobalWaypoints: false,
  showGlobalAirways: false,
  showGlobalHoldings: false,
  showGlobalCtrlAirspace: false,
  showGlobalRestrAirspace: false,
  showGlobalFirUir: false,

  // Actions - RKPU layers
  setShowWaypoints: (value) => set({ showWaypoints: value }),
  setShowObstacles: (value) => set({ showObstacles: value }),
  setShowAirspace: (value) => set({ showAirspace: value }),

  // Actions - Weather layers
  setShowLightning: (value) => set({ showLightning: value }),
  setShowSigmet: (value) => set({ showSigmet: value }),

  // Actions - Korea airspace
  setShowKoreaRoutes: (value) => set({ showKoreaRoutes: value }),
  setShowKoreaWaypoints: (value) => set({ showKoreaWaypoints: value }),
  setShowKoreaNavaids: (value) => set({ showKoreaNavaids: value }),
  setShowKoreaAirspaces: (value) => set({ showKoreaAirspaces: value }),
  setShowKoreaAirports: (value) => set({ showKoreaAirports: value }),
  setShowKoreaHoldings: (value) => set({ showKoreaHoldings: value }),
  setShowKoreaTerminalWaypoints: (value) => set({ showKoreaTerminalWaypoints: value }),

  // Actions - Korea procedures
  setShowKoreaSids: (value) => set({ showKoreaSids: value }),
  setShowKoreaStars: (value) => set({ showKoreaStars: value }),
  setShowKoreaIaps: (value) => set({ showKoreaIaps: value }),
  setSelectedKoreaAirport: (value) => set({ selectedKoreaAirport: value }),

  // Actions - Global data layers
  setShowGlobalAirports: (value) => set({ showGlobalAirports: value }),
  setShowGlobalNavaids: (value) => set({ showGlobalNavaids: value }),
  setShowGlobalHeliports: (value) => set({ showGlobalHeliports: value }),
  setShowGlobalWaypoints: (value) => set({ showGlobalWaypoints: value }),
  setShowGlobalAirways: (value) => set({ showGlobalAirways: value }),
  setShowGlobalHoldings: (value) => set({ showGlobalHoldings: value }),
  setShowGlobalCtrlAirspace: (value) => set({ showGlobalCtrlAirspace: value }),
  setShowGlobalRestrAirspace: (value) => set({ showGlobalRestrAirspace: value }),
  setShowGlobalFirUir: (value) => set({ showGlobalFirUir: value }),

  // Toggle helpers
  toggleWaypoints: () => set((state) => ({ showWaypoints: !state.showWaypoints })),
  toggleObstacles: () => set((state) => ({ showObstacles: !state.showObstacles })),
  toggleAirspace: () => set((state) => ({ showAirspace: !state.showAirspace })),
  toggleLightning: () => set((state) => ({ showLightning: !state.showLightning })),
  toggleSigmet: () => set((state) => ({ showSigmet: !state.showSigmet })),

  // Reset all layers
  resetLayers: () => set({
    showWaypoints: false,
    showObstacles: false,
    showAirspace: true,
    showLightning: false,
    showSigmet: false,
    showKoreaRoutes: false,
    showKoreaWaypoints: false,
    showKoreaNavaids: false,
    showKoreaAirspaces: false,
    showKoreaAirports: false,
    showKoreaHoldings: false,
    showKoreaTerminalWaypoints: true,
    showKoreaSids: false,
    showKoreaStars: false,
    showKoreaIaps: false,
    selectedKoreaAirport: '',
    showGlobalAirports: false,
    showGlobalNavaids: false,
    showGlobalHeliports: false,
    showGlobalWaypoints: false,
    showGlobalAirways: false,
    showGlobalHoldings: false,
    showGlobalCtrlAirspace: false,
    showGlobalRestrAirspace: false,
    showGlobalFirUir: false,
  }),
}));

export default useLayerStore;
