import { useCallback, useState } from "react";
import { STORAGE_KEYS } from "@/constants";
import { TOWN_SCENES, type TownScene } from "@/features/properties/townScenes";
import { storage } from "@/lib/storage";

function read(): TownScene {
  const saved = storage.get(STORAGE_KEYS.townScene);
  // City is the default surroundings; a choice made on this device wins.
  return (TOWN_SCENES as string[]).includes(saved ?? "") ? (saved as TownScene) : "city";
}

/** Surroundings of the property town (park, city, countryside …). Stored per device, like the theme. */
export function useTownScene() {
  const [scene, setSceneState] = useState<TownScene>(read);
  const setScene = useCallback((next: TownScene) => {
    storage.set(STORAGE_KEYS.townScene, next);
    setSceneState(next);
  }, []);
  return { scene, setScene };
}
