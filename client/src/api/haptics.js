let Haptics = null;
let ImpactStyle = null;
let loaded = false;

async function loadHaptics() {
  if (loaded) return;
  loaded = true;
  try {
    const mod = await import('@capacitor/haptics');
    Haptics = mod.Haptics;
    ImpactStyle = mod.ImpactStyle;
  } catch {
    // @capacitor/haptics not available — haptics will be no-ops
  }
}

export async function hapticsLight() {
  try {
    if (!loaded) await loadHaptics();
    if (Haptics && ImpactStyle) {
      await Haptics.impact({ style: ImpactStyle.Light });
    }
  } catch {}
}

export async function hapticsMedium() {
  try {
    if (!loaded) await loadHaptics();
    if (Haptics && ImpactStyle) {
      await Haptics.impact({ style: ImpactStyle.Medium });
    }
  } catch {}
}

export async function hapticsHeavy() {
  try {
    if (!loaded) await loadHaptics();
    if (Haptics && ImpactStyle) {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    }
  } catch {}
}
