import { create } from 'zustand';

/**
 * UIStore - UI 상태 관리
 * - 패널 열림/닫힘
 * - 아코디언 확장 상태
 * - 팝업 상태
 * - 테마 (Day/Night)
 */

type AccordionName = 'layersExpanded' | 'aircraftExpanded' | 'sidExpanded' |
  'starExpanded' | 'apchExpanded' | 'chartExpanded' | 'koreaRoutesExpanded' | 'globalExpanded';

type AtcSection = 'ACC' | 'TMA' | 'CTR';

type DetailSection = 'flightStatus' | 'aircraftInfo' | 'schedule' | 'graph' | 'position';

export type Theme = 'day' | 'night' | 'auto';

interface UIState {
  // Theme
  theme: Theme;

  // Mobile panel
  isPanelOpen: boolean;

  // Accordion states
  layersExpanded: boolean;
  aircraftExpanded: boolean;
  sidExpanded: boolean;
  starExpanded: boolean;
  apchExpanded: boolean;
  chartExpanded: boolean;
  koreaRoutesExpanded: boolean;
  globalExpanded: boolean;

  // ATC panel
  showAtcPanel: boolean;
  atcExpanded: Record<AtcSection, boolean>;

  // Weather panel
  showWxPanel: boolean;
  wxPanelTab: string;
  wxLayersExpanded: boolean;

  // NOTAM panel
  showNotamPanel: boolean;

  // METAR/TAF popups
  showMetarPopup: boolean;
  showTafPopup: boolean;
  metarPinned: boolean;
  tafPinned: boolean;

  // Aircraft detail panel section expansion
  sectionExpanded: Record<DetailSection, boolean>;
}

interface UIActions {
  // Theme
  setTheme: (theme: Theme) => void;

  // Panel
  setIsPanelOpen: (value: boolean) => void;
  togglePanel: () => void;

  // Accordions
  setLayersExpanded: (value: boolean) => void;
  setAircraftExpanded: (value: boolean) => void;
  setSidExpanded: (value: boolean) => void;
  setStarExpanded: (value: boolean) => void;
  setApchExpanded: (value: boolean) => void;
  setChartExpanded: (value: boolean) => void;
  setKoreaRoutesExpanded: (value: boolean) => void;
  setGlobalExpanded: (value: boolean) => void;
  toggleAccordion: (name: AccordionName) => void;

  // ATC
  setShowAtcPanel: (value: boolean) => void;
  setAtcExpanded: (value: Record<AtcSection, boolean>) => void;
  toggleAtcSection: (section: AtcSection) => void;

  // Weather
  setShowWxPanel: (value: boolean) => void;
  setWxPanelTab: (value: string) => void;
  setWxLayersExpanded: (value: boolean) => void;

  // NOTAM
  setShowNotamPanel: (value: boolean) => void;
  toggleNotamPanel: () => void;

  // METAR/TAF
  setShowMetarPopup: (value: boolean) => void;
  setShowTafPopup: (value: boolean) => void;
  setMetarPinned: (value: boolean) => void;
  setTafPinned: (value: boolean) => void;

  // Section expansion
  setSectionExpanded: (value: Record<DetailSection, boolean>) => void;
  toggleSection: (section: DetailSection) => void;

  // Utility
  closeAllPanels: () => void;
}

export type UIStore = UIState & UIActions;

const useUIStore = create<UIStore>((set) => ({
  // Theme
  theme: 'day',

  // Mobile panel
  isPanelOpen: typeof window !== 'undefined' ? window.innerWidth > 768 : true,

  // Accordion states
  layersExpanded: true,
  aircraftExpanded: false,
  sidExpanded: false,
  starExpanded: false,
  apchExpanded: false,
  chartExpanded: false,
  koreaRoutesExpanded: false,
  globalExpanded: false,

  // ATC panel
  showAtcPanel: false,
  atcExpanded: { ACC: true, TMA: false, CTR: false },

  // Weather panel
  showWxPanel: false,
  wxPanelTab: 'sigmet',
  wxLayersExpanded: false,

  // NOTAM panel
  showNotamPanel: false,

  // METAR/TAF popups
  showMetarPopup: false,
  showTafPopup: false,
  metarPinned: false,
  tafPinned: false,

  // Aircraft detail panel section expansion
  sectionExpanded: {
    flightStatus: true,
    aircraftInfo: true,
    schedule: true,
    graph: true,
    position: true,
  },

  // Actions - Theme
  setTheme: (theme) => {
    set({ theme });
    // Apply theme to document root
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  },

  // Actions - Panel
  setIsPanelOpen: (value) => set({ isPanelOpen: value }),
  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  // Actions - Accordions
  setLayersExpanded: (value) => set({ layersExpanded: value }),
  setAircraftExpanded: (value) => set({ aircraftExpanded: value }),
  setSidExpanded: (value) => set({ sidExpanded: value }),
  setStarExpanded: (value) => set({ starExpanded: value }),
  setApchExpanded: (value) => set({ apchExpanded: value }),
  setChartExpanded: (value) => set({ chartExpanded: value }),
  setKoreaRoutesExpanded: (value) => set({ koreaRoutesExpanded: value }),
  setGlobalExpanded: (value) => set({ globalExpanded: value }),
  toggleAccordion: (name) => set((state) => ({ [name]: !state[name] })),

  // Actions - ATC
  setShowAtcPanel: (value) => set({ showAtcPanel: value }),
  setAtcExpanded: (value) => set({ atcExpanded: value }),
  toggleAtcSection: (section) => set((state) => ({
    atcExpanded: { ...state.atcExpanded, [section]: !state.atcExpanded[section] }
  })),

  // Actions - Weather
  setShowWxPanel: (value) => set({ showWxPanel: value }),
  setWxPanelTab: (value) => set({ wxPanelTab: value }),
  setWxLayersExpanded: (value) => set({ wxLayersExpanded: value }),

  // Actions - NOTAM
  setShowNotamPanel: (value) => set({ showNotamPanel: value }),
  toggleNotamPanel: () => set((state) => ({ showNotamPanel: !state.showNotamPanel })),

  // Actions - METAR/TAF
  setShowMetarPopup: (value) => set({ showMetarPopup: value }),
  setShowTafPopup: (value) => set({ showTafPopup: value }),
  setMetarPinned: (value) => set({ metarPinned: value }),
  setTafPinned: (value) => set({ tafPinned: value }),

  // Actions - Section expansion
  setSectionExpanded: (value) => set({ sectionExpanded: value }),
  toggleSection: (section) => set((state) => ({
    sectionExpanded: { ...state.sectionExpanded, [section]: !state.sectionExpanded[section] }
  })),

  // Close all panels
  closeAllPanels: () => set({
    showAtcPanel: false,
    showWxPanel: false,
    showNotamPanel: false,
    showMetarPopup: false,
    showTafPopup: false,
  }),
}));

export default useUIStore;
