export type AssetName = 'logo' | 'mascot' | 'homeDesktop' | 'homeMobile' | 'materialsDesktop' | 'materialsMobile' | 'coursesDesktop' | 'questionnairesMobile';
export type Assets = Record<AssetName, HTMLImageElement>;
const sources: Record<AssetName, string> = {
  logo: 'logo-te-dark.jpeg', mascot: 'mascot-anderson.png', homeDesktop: 'screens/home-desktop.png', homeMobile: 'screens/home-mobile.png',
  materialsDesktop: 'screens/materials-desktop.png', materialsMobile: 'screens/materials-mobile.png', coursesDesktop: 'screens/courses-desktop.png', questionnairesMobile: 'screens/questionnaires-mobile.png',
};
export async function loadAssets(): Promise<Assets> {
  const entries = await Promise.all(Object.entries(sources).map(async ([key, file]) => {
    const img = new Image(); img.src = `${import.meta.env.BASE_URL}assets/${file}`;
    await img.decode(); return [key, img] as const;
  }));
  await Promise.all([500,600,700].map(weight => document.fonts.load(`${weight} 40px "DM Sans"`)));
  await document.fonts.load('600 40px "Playfair Display"');
  await document.fonts.ready;
  return Object.fromEntries(entries) as Assets;
}

