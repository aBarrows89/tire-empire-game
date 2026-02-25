let Haptics = null;
let ImpactStyle = null;

try {
  const mod = await import('@capacitor/haptics');
  Haptics = mod.Haptics;
  ImpactStyle = mod.ImpactStyle;
} catch {
  // @capacitor/haptics not available — haptics will be no-ops
}

export async function hapticsLight() {
  try {
    if (Haptics && ImpactStyle) {
      await Haptics.impact({ style: ImpactStyle.Light });
    }
  } catch {}
}

export async function hapticsMedium() {
  try {
    if (Haptics && ImpactStyle) {
      await Haptics.impact({ style: ImpactStyle.Medium });
    }
  } catch {}
}

export async function hapticsHeavy() {
  try {
    if (Haptics && ImpactStyle) {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    }
  } catch {}
}
