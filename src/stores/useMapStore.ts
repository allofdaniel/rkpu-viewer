import { create } from 'zustand';

/**
 * MapStore - 지도 뷰 관련 상태 관리
 * - 3D/2D 뷰
 * - 다크모드/위성
 * - 지형/건물 표시
 */

interface MapState {
  // View mode
  is3DView: boolean;
  isDarkMode: boolean;
  showSatellite: boolean;

  // 3D features
  showBuildings: boolean;
  showTerrain: boolean;
  show3DAltitude: boolean;
}

interface MapActions {
  // Setters
  setIs3DView: (value: boolean) => void;
  setIsDarkMode: (value: boolean) => void;
  setShowSatellite: (value: boolean) => void;
  setShowBuildings: (value: boolean) => void;
  setShowTerrain: (value: boolean) => void;
  setShow3DAltitude: (value: boolean) => void;

  // Toggles
  toggle3DView: () => void;
  toggleDarkMode: () => void;
  toggleSatellite: () => void;

  // Reset
  resetViewSettings: () => void;
}

export type MapStore = MapState & MapActions;

const useMapStore = create<MapStore>((set) => ({
  // View mode
  is3DView: false,
  isDarkMode: true,
  showSatellite: false,

  // 3D features
  showBuildings: true,
  showTerrain: true,
  show3DAltitude: true,

  // Actions
  setIs3DView: (value) => set({ is3DView: value }),
  setIsDarkMode: (value) => set({ isDarkMode: value }),
  setShowSatellite: (value) => set({ showSatellite: value }),
  setShowBuildings: (value) => set({ showBuildings: value }),
  setShowTerrain: (value) => set({ showTerrain: value }),
  setShow3DAltitude: (value) => set({ show3DAltitude: value }),

  // Toggle helpers
  toggle3DView: () => set((state) => ({ is3DView: !state.is3DView })),
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
  toggleSatellite: () => set((state) => ({ showSatellite: !state.showSatellite })),

  // Reset to defaults
  resetViewSettings: () => set({
    is3DView: false,
    isDarkMode: true,
    showSatellite: false,
    showBuildings: true,
    showTerrain: true,
    show3DAltitude: true,
  }),
}));

export default useMapStore;
