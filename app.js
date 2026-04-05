const KEY = "beer_counter_v13";

/** Default reference period (minutes): 2 cl pure allowed per this span (pace from first logged drink). */
const DEFAULT_REFERENCE_PERIOD_MINUTES = 90;

/** Picker range (minutes). Native `<select>` uses the iOS scroll wheel; desktop shows a dropdown. */
const REFERENCE_PERIOD_PICK_MIN = 30;
const REFERENCE_PERIOD_PICK_MAX = 120;
const REFERENCE_PERIOD_PICK_STEP = 5;

const REFERENCE_PERIOD_CHOICES = (() => {
  const a = [];
  for (let m = REFERENCE_PERIOD_PICK_MIN; m <= REFERENCE_PERIOD_PICK_MAX; m += REFERENCE_PERIOD_PICK_STEP) {
    a.push(m);
  }
  return a;
})();

/** Reference “beer” for equivalents: 40 cl @ 5,5% → pure alcohol (cl). */
const REF_BEER_CL = 40;
const REF_BEER_ABV = 5.5;
const REF_BEER_PURE_CL = REF_BEER_CL * (REF_BEER_ABV / 100);

/** Allowed starts at this much pure alcohol (one 5% · 40 cl), then grows with the reference period. */
const INITIAL_ALLOWANCE_BEER_CL = 40;
const INITIAL_ALLOWANCE_BEER_ABV = 5;
const INITIAL_ALLOWANCE_PURE_CL = INITIAL_ALLOWANCE_BEER_CL * (INITIAL_ALLOWANCE_BEER_ABV / 100);

function normalizeReferencePeriodMinutes(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const x = Math.round(n);
  if (x < 1 || x > 24 * 60) return null;
  return x;
}

function snapReferencePeriodToPickerChoice(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_REFERENCE_PERIOD_MINUTES;
  const clamped = Math.min(REFERENCE_PERIOD_PICK_MAX, Math.max(REFERENCE_PERIOD_PICK_MIN, Math.round(n)));
  let best = REFERENCE_PERIOD_CHOICES[0];
  let bestD = Math.abs(best - clamped);
  for (const c of REFERENCE_PERIOD_CHOICES) {
    const d = Math.abs(c - clamped);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

function getReferencePeriodMinutes(data) {
  const n = normalizeReferencePeriodMinutes(data.referencePeriodMinutes);
  const raw = n ?? DEFAULT_REFERENCE_PERIOD_MINUTES;
  return snapReferencePeriodToPickerChoice(raw);
}

function getReferencePeriodMs(data) {
  return getReferencePeriodMinutes(data) * 60 * 1000;
}

/** Eligible accrual time after each drink: this many × reference period (e.g. 90 min → 180 min window). */
const ACCRUAL_WINDOW_REFERENCE_PERIODS = 2;

function getAccrualWindowSpanMs(data) {
  return getReferencePeriodMs(data) * ACCRUAL_WINDOW_REFERENCE_PERIODS;
}

function allowanceClPerMsFromData(data) {
  return 2 / getReferencePeriodMs(data);
}

/** Drank/allowed auto-refresh: ~2 cl/h → hundredths change ~every 18s; 15s is a good balance vs 1s (no visible change at 2 decimals). */
const SUMMARY_REFRESH_MS = 15 * 1000;

function formatAbvComma(abv) {
  return abv.toFixed(1).replace(".", ",");
}

/** Pure alcohol (cl) for calculations and search results. */
function pureAlcoholClFromServing(abv, cl) {
  return cl * (abv / 100);
}

/** Short label for default grid buttons and matching log lines. */
function defaultPresetDrinkLabel(abv, cl) {
  return `${formatAbvComma(abv)}% ${cl} cl`;
}

/** Yellow band: over allowed by at most this many cl pure (same as 5% · 40 cl head start). */
const PRESET_OVER_WARN_MAX_CL = 2;

const DEFAULT_DRINKS = {
  "3_16_5": { abv: 3.5, cl: 20, label: defaultPresetDrinkLabel(3.5, 20) },
  "3_33": { abv: 3.5, cl: 33, label: defaultPresetDrinkLabel(3.5, 33) },
  "3_40": { abv: 3.5, cl: 40, label: defaultPresetDrinkLabel(3.5, 40) },
  "3_50": { abv: 3.5, cl: 50, label: defaultPresetDrinkLabel(3.5, 50) },

  "4_16_5": { abv: 4.5, cl: 20, label: defaultPresetDrinkLabel(4.5, 20) },
  "4_33": { abv: 4.5, cl: 33, label: defaultPresetDrinkLabel(4.5, 33) },
  "4_40": { abv: 4.5, cl: 40, label: defaultPresetDrinkLabel(4.5, 40) },
  "4_50": { abv: 4.5, cl: 50, label: defaultPresetDrinkLabel(4.5, 50) },

  "5_16_5": { abv: 5.5, cl: 20, label: defaultPresetDrinkLabel(5.5, 20) },
  "5_33": { abv: 5.5, cl: 33, label: defaultPresetDrinkLabel(5.5, 33) },
  "5_40": { abv: 5.5, cl: 40, label: defaultPresetDrinkLabel(5.5, 40) },
  "5_50": { abv: 5.5, cl: 50, label: defaultPresetDrinkLabel(5.5, 50) }
};

// Curated beer list. ABVs are typical retail averages.
const BEER_DB = [
  { name: "Abbot Ale", abv: 5.0 },
  { name: "Achel Blond", abv: 8.0 },
  { name: "Achel Extra Bruin", abv: 9.5 },
  { name: "Adnams Broadside", abv: 6.3 },
  { name: "Adnams Ghost Ship", abv: 4.5 },
  { name: "Adnams Ghost Ship 0.5", abv: 0.5 },
  { name: "Affligem Blond", abv: 6.7 },
  { name: "Affligem Dubbel", abv: 6.8 },
  { name: "Affligem Tripel", abv: 9.5 },
  { name: "Alaskan Amber", abv: 5.3 },
  { name: "Alaskan Freeride IPA", abv: 7.0 },
  { name: "Alaskan Kolsch", abv: 5.3 },
  { name: "Alaskan Smoked Porter", abv: 6.5 },
  { name: "Alaskan Winter Ale", abv: 6.4 },
  { name: "Alhambra Reserva 1925", abv: 6.4 },
  { name: "Alken-Maes Cristal", abv: 5.0 },
  { name: "Alpha Hellenic Lager", abv: 5.0 },
  { name: "Amager Bryghus Hr. Frederiksen", abv: 10.0 },
  { name: "Ambar Export", abv: 5.2 },
  { name: "Amstel Lager", abv: 5.0 },
  { name: "Amstel Radler", abv: 2.0 },
  { name: "Anchor BigLeaf Maple Autumn Red", abv: 6.0 },
  { name: "Anchor Christmas Ale", abv: 5.5 },
  { name: "Anchor Go West! IPA", abv: 6.7 },
  { name: "Anchor Liberty Ale", abv: 6.3 },
  { name: "Anchor Old Foghorn", abv: 8.8 },
  { name: "Anchor Porter", abv: 5.6 },
  { name: "Anchor Steam Beer", abv: 4.9 },
  { name: "Andechs Bergbock Hell", abv: 6.9 },
  { name: "Andechs Doppelbock Dunkel", abv: 7.1 },
  { name: "Antarctica Original", abv: 5.0 },
  { name: "Antarctica Pilsen", abv: 5.0 },
  { name: "Arboga Mörk Lager", abv: 5.5 },
  { name: "Arboga Originalet", abv: 5.6 },
  { name: "Asahi Dry Black", abv: 5.5 },
  { name: "Asahi Super Dry", abv: 5.0 },
  { name: "Asahi Super Dry Black", abv: 5.5 },
  { name: "Augustijn Grand Cru", abv: 9.0 },
  { name: "Augustiner Edelstoff", abv: 5.6 },
  { name: "Augustiner Edelstoff Export", abv: 5.6 },
  { name: "Augustiner Lagerbier Hell", abv: 5.2 },
  { name: "Augustiner Maximator", abv: 7.5 },
  { name: "Ayinger  Jahrhundert", abv: 5.5 },
  { name: "Ayinger Bräu Weisse", abv: 5.1 },
  { name: "Ayinger Celebrator", abv: 6.7 },
  { name: "Ayinger Celebrator Doppelbock", abv: 6.7 },
  { name: "Ayinger Kellerbier", abv: 4.9 },
  { name: "Ayinger Lager Hell", abv: 4.9 },
  { name: "Banks's Mild", abv: 3.5 },
  { name: "Bass Pale Ale", abv: 4.4 },
  { name: "Beamish Stout", abv: 4.1 },
  { name: "Beavertown Bloody 'Ell", abv: 7.2 },
  { name: "Beavertown Gamma Ray", abv: 5.4 },
  { name: "Beavertown Lazer Crush", abv: 0.3 },
  { name: "Beavertown Lupulo", abv: 6.7 },
  { name: "Beavertown Neck Oil", abv: 4.3 },
  { name: "Beck's Pilsner", abv: 5.0 },
  { name: "Bedaro Bitter", abv: 4.5 },
  { name: "Belhaven Scottish Stout", abv: 7.0 },
  { name: "Belhaven Twisted Thistle IPA", abv: 5.6 },
  { name: "Bell's Amber Ale", abv: 5.8 },
  { name: "Bell's Expedition Stout", abv: 10.5 },
  { name: "Bell's Hopslam", abv: 10.0 },
  { name: "Bell's Kalamazoo Stout", abv: 6.0 },
  { name: "Bell's Oberon", abv: 5.8 },
  { name: "Bell's Third Coast Old Ale", abv: 10.2 },
  { name: "Bell's Two Hearted Ale", abv: 7.0 },
  { name: "Berliner Kindl Weisse", abv: 3.0 },
  { name: "Bernard Amber Lager", abv: 5.0 },
  { name: "Bernard Dark Lager", abv: 5.1 },
  { name: "Bernard Černý Ležák", abv: 5.1 },
  { name: "Bintang Pilsener", abv: 4.7 },
  { name: "Bitburger Kellerbier", abv: 5.3 },
  { name: "Bitburger Premium Pils", abv: 4.8 },
  { name: "Bitburger Radler", abv: 2.5 },
  { name: "Blue Moon Belgian White", abv: 5.4 },
  { name: "Boddingtons Pub Ale", abv: 4.7 },
  { name: "Bohemia Clásica", abv: 5.3 },
  { name: "Bohemia Weiss", abv: 4.7 },
  { name: "Boon Black Label", abv: 7.0 },
  { name: "Boon Kriek Mariage Parfait", abv: 8.0 },
  { name: "Boon Mariage Parfait Kriek", abv: 8.0 },
  { name: "Boon Oude Geuze", abv: 7.0 },
  { name: "Brahma Chopp", abv: 5.0 },
  { name: "Brahma Duplo Malte", abv: 5.3 },
  { name: "BrewDog Dead Pony Club", abv: 3.8 },
  { name: "BrewDog Elvis Juice", abv: 6.5 },
  { name: "BrewDog Hazy Jane", abv: 5.0 },
  { name: "BrewDog Hazy Jane Guava", abv: 5.0 },
  { name: "Brewdog Lost Lager", abv: 4.5 },
  { name: "BrewDog Paradox Smokehead", abv: 15.0 },
  { name: "BrewDog Punk IPA", abv: 5.6 },
  { name: "Brooklyn Black Chocolate Stout", abv: 10.0 },
  { name: "Brooklyn Brewery Defender IPA", abv: 5.5 },
  { name: "Brooklyn Brewery East IPA", abv: 6.9 },
  { name: "Brooklyn Brewery Lager", abv: 5.2 },
  { name: "Budvar Dark Lager", abv: 4.7 },
  { name: "Budvar Tankové", abv: 5.0 },
  { name: "Budweiser Budvar Original", abv: 5.0 },
  { name: "Busch Lager", abv: 4.3 },
  { name: "Caledonian Deuchars IPA", abv: 3.8 },
  { name: "Camden Off Menu IPA", abv: 6.2 },
  { name: "Camden Town Hells Lager", abv: 4.6 },
  { name: "Camden Town Pale Ale", abv: 4.0 },
  { name: "Cantillon Classic Gueuze", abv: 5.5 },
  { name: "Cantillon Kriek", abv: 5.0 },
  { name: "Cantillon Rosé de Gambrinus", abv: 5.0 },
  { name: "Carlsberg 1883", abv: 5.0 },
  { name: "Carlsberg Elephant", abv: 7.2 },
  { name: "Carlsberg Export", abv: 5.0 },
  { name: "Carlsberg Hof", abv: 4.2 },
  { name: "Carlsberg Nordic Gylden Bryg", abv: 5.0 },
  { name: "Carlsberg Sort Guld", abv: 5.5 },
  { name: "Carlton Draught Lager", abv: 4.6 },
  { name: "Carnegie Porter Original", abv: 5.5 },
  { name: "Cerveza Patagonia Amber Lager", abv: 4.6 },
  { name: "Chang Classic", abv: 5.0 },
  { name: "Chang Draught", abv: 5.0 },
  { name: "Chimay Blue Cap", abv: 9.0 },
  { name: "Chimay Dorée", abv: 4.8 },
  { name: "Chimay Red Cap", abv: 7.0 },
  { name: "Chimay White Cap", abv: 8.0 },
  { name: "Cigar City Florida Cracker", abv: 5.5 },
  { name: "Cigar City Guava Grove", abv: 8.0 },
  { name: "Cigar City Hunahpu's Imperial Stout", abv: 11.0 },
  { name: "Cigar City Jai Alai IPA", abv: 7.5 },
  { name: "Cigar City Jai Low IPA", abv: 4.0 },
  { name: "Cigar City Maduro Brown Ale", abv: 5.5 },
  { name: "Cigar City Marshal Zhukov", abv: 11.8 },
  { name: "Cloudwater DIPA V13", abv: 9.0 },
  { name: "Cloudwater Pale Ale", abv: 5.5 },
  { name: "Club Colombia Dorada", abv: 4.7 },
  { name: "Club Colombia Roja", abv: 4.7 },
  { name: "Colorado Indica IPA", abv: 7.0 },
  { name: "Coopers Best Extra Stout", abv: 6.3 },
  { name: "Coopers Pale Ale", abv: 4.5 },
  { name: "Coopers Sparkling Ale", abv: 5.8 },
  { name: "Coopers Stout", abv: 6.3 },
  { name: "Coopers Vintage Ale", abv: 7.5 },
  { name: "Coors Banquet", abv: 5.0 },
  { name: "Coors Light", abv: 4.2 },
  { name: "Coral Lager", abv: 5.1 },
  { name: "Corona Extra", abv: 4.5 },
  { name: "Corona Familiar", abv: 4.8 },
  { name: "Corona Premier", abv: 4.0 },
  { name: "Corona Sunbrew", abv: 4.5 },
  { name: "Corsendonk Agnus Tripel", abv: 7.5 },
  { name: "Corsendonk Pater Dubbel", abv: 6.5 },
  { name: "Courage Best Bitter", abv: 4.0 },
  { name: "Cruzcampo Pilsen", abv: 4.4 },
  { name: "Cusqueña Dorada", abv: 5.0 },
  { name: "Cusqueña Negra", abv: 5.6 },
  { name: "DAB Original", abv: 5.0 },
  { name: "De Koninck Bolleke", abv: 5.2 },
  { name: "Delirium Argentum", abv: 7.0 },
  { name: "Delirium Nocturnum", abv: 8.5 },
  { name: "Delirium Red", abv: 8.5 },
  { name: "Delirium Tremens Strong Golden", abv: 8.5 },
  { name: "Deschutes Black Butte Porter", abv: 5.2 },
  { name: "Deschutes Fresh Squeezed IPA", abv: 6.4 },
  { name: "Deschutes Jubelale", abv: 6.7 },
  { name: "Deschutes Mirror Pond Pale", abv: 5.0 },
  { name: "Deschutes The Abyss", abv: 11.0 },
  { name: "Deschutes The Dissident", abv: 10.5 },
  { name: "Deschutes The Stoic", abv: 11.0 },
  { name: "Desperados Lime", abv: 5.9 },
  { name: "Desperados Tequila Beer", abv: 5.9 },
  { name: "Deya Steady Rolling Man", abv: 5.2 },
  { name: "Dogfish Head 120 Minute IPA", abv: 15.0 },
  { name: "Dogfish Head 60 Minute IPA", abv: 6.0 },
  { name: "Dogfish Head 90 Minute IPA", abv: 9.0 },
  { name: "Dogfish Head Namaste", abv: 4.8 },
  { name: "Dogfish Head Punkin Ale", abv: 7.0 },
  { name: "Dogfish Head SeaQuench Ale", abv: 4.9 },
  { name: "Dogfish Head SeaQuench Session", abv: 4.9 },
  { name: "Dos Equis Ambar", abv: 4.7 },
  { name: "Dos Equis Lager Especial", abv: 4.7 },
  { name: "Dugges Calle IPA", abv: 6.5 },
  { name: "Dugges Mango Mango Mango", abv: 4.5 },
  { name: "Dugges Tropic Thunder", abv: 4.5 },
  { name: "Duvel Belgian Golden Ale", abv: 8.5 },
  { name: "Duvel Moortgat Vedett Extra White", abv: 4.7 },
  { name: "Duvel Single Fermented", abv: 6.2 },
  { name: "Duvel Triple Hop", abv: 9.5 },
  { name: "Efes Pilsener", abv: 5.0 },
  { name: "Egger  Märzen", abv: 5.3 },
  { name: "Eight Degrees Howling Gale Ale", abv: 5.0 },
  { name: "Erdinger Alkoholfrei", abv: 0.4 },
  { name: "Erdinger Dunkel", abv: 5.3 },
  { name: "Erdinger Pikantus", abv: 7.3 },
  { name: "Erdinger Pikantus Weizenbock", abv: 7.3 },
  { name: "Erdinger Weissbier", abv: 5.3 },
  { name: "Eriksberg Karaktär", abv: 5.4 },
  { name: "Eriksberg Mäster", abv: 5.0 },
  { name: "Eriksberg Pale Ale", abv: 5.6 },
  { name: "Estrella Damm Daura", abv: 5.4 },
  { name: "Estrella Damm Inedit", abv: 4.8 },
  { name: "Estrella Galicia 1906", abv: 6.5 },
  { name: "Estrella Galicia Especial", abv: 5.5 },
  { name: "Falcon Bayerskt", abv: 5.2 },
  { name: "Falcon Export", abv: 5.2 },
  { name: "Firestone Walker 805 Blonde", abv: 4.7 },
  { name: "Firestone Walker Parabola", abv: 13.0 },
  { name: "Firestone Walker Parabolita", abv: 13.7 },
  { name: "Firestone Walker Pivo Pils", abv: 5.3 },
  { name: "Firestone Walker Union Jack IPA", abv: 7.0 },
  { name: "Firestone Walker Velvet Merlin", abv: 5.5 },
  { name: "Firestone Walker XXV Anniversary", abv: 12.7 },
  { name: "Fix Hellas", abv: 5.0 },
  { name: "Forst Premium", abv: 5.0 },
  { name: "Forst Sixtus Doppelbock", abv: 6.5 },
  { name: "Foster's Lager", abv: 5.0 },
  { name: "Foster's Premium Ale", abv: 4.9 },
  { name: "Foster's Special Bitter", abv: 4.9 },
  { name: "Founders All Day IPA", abv: 4.7 },
  { name: "Founders Breakfast Stout", abv: 8.3 },
  { name: "Founders Centennial IPA", abv: 7.2 },
  { name: "Founders Dirty Bastard", abv: 8.5 },
  { name: "Founders KBS", abv: 11.3 },
  { name: "Founders KBS Maple Mackinac Fudge", abv: 11.6 },
  { name: "Founders Porter", abv: 6.5 },
  { name: "Franziskaner Hefe-Weissbier", abv: 5.0 },
  { name: "Fuller's ESB", abv: 5.5 },
  { name: "Fuller's Honey Dew", abv: 5.0 },
  { name: "Fuller's Imperial Stout", abv: 10.7 },
  { name: "Fuller's London Pride", abv: 4.1 },
  { name: "Fuller's Vintage Ale", abv: 8.5 },
  { name: "Galway Bay Of Foam and Fury", abv: 8.5 },
  { name: "Gambrinus Original 10°", abv: 4.3 },
  { name: "Garage Beer Soup IPA", abv: 8.0 },
  { name: "Genesee Cream Ale", abv: 5.1 },
  { name: "Goose Island 312 Urban Wheat", abv: 4.2 },
  { name: "Goose Island Bourbon County Classic", abv: 14.3 },
  { name: "Goose Island Bourbon County Stout", abv: 14.0 },
  { name: "Goose Island Bourbon County Wheatwine", abv: 14.6 },
  { name: "Goose Island Green Line", abv: 5.4 },
  { name: "Goose Island IPA", abv: 5.9 },
  { name: "Goose Island Matilda", abv: 7.0 },
  { name: "Gotlands Wisby IPA", abv: 5.9 },
  { name: "Great Divide Chocolate Oak Aged Yeti", abv: 9.5 },
  { name: "Great Divide Colette", abv: 7.3 },
  { name: "Great Divide Denver Pale Ale", abv: 5.5 },
  { name: "Great Divide Espresso Oak Aged Yeti", abv: 9.5 },
  { name: "Great Divide Hercules DIPA", abv: 10.0 },
  { name: "Great Divide Orabelle", abv: 8.3 },
  { name: "Great Divide Yeti Imperial Stout", abv: 9.5 },
  { name: "Greene King Abbot Ale", abv: 5.0 },
  { name: "Greene King IPA", abv: 3.6 },
  { name: "Grimbergen Blanche", abv: 6.0 },
  { name: "Grimbergen Blonde", abv: 6.7 },
  { name: "Grimbergen Double", abv: 6.5 },
  { name: "Grolsch Premium Lager", abv: 5.0 },
  { name: "Grolsch Radler", abv: 2.0 },
  { name: "Grolsch Weizen", abv: 5.3 },
  { name: "Guinness Draught", abv: 4.2 },
  { name: "Guinness Foreign Extra", abv: 7.5 },
  { name: "Guinness Foreign Extra Stout", abv: 7.5 },
  { name: "Guinness Nitro IPA", abv: 5.8 },
  { name: "Gulden Draak 9000 Quad", abv: 10.5 },
  { name: "Gulden Draak Quad", abv: 10.5 },
  { name: "Gösser Märzen", abv: 5.2 },
  { name: "Hacker-Pschorr Oktoberfest", abv: 5.8 },
  { name: "Hacker-Pschorr Weisse", abv: 5.5 },
  { name: "Harbin Lager", abv: 4.5 },
  { name: "Harp Lager", abv: 4.5 },
  { name: "Harvey's Sussex Best", abv: 4.0 },
  { name: "Heineken Extra Cold", abv: 5.0 },
  { name: "Heineken Lager", abv: 5.0 },
  { name: "Heineken Silver", abv: 4.0 },
  { name: "Helsinge Hantverkslager", abv: 5.2 },
  { name: "Hertog Jan Grand Prestige", abv: 6.5 },
  { name: "Hitachino Ginger Ale", abv: 7.0 },
  { name: "Hitachino Nest Espresso Stout", abv: 7.0 },
  { name: "Hitachino Nest Red Rice Ale", abv: 7.0 },
  { name: "Hitachino Nest White Ale", abv: 5.5 },
  { name: "Hoegaarden Grand Cru", abv: 8.5 },
  { name: "Hoegaarden Rosée", abv: 3.0 },
  { name: "Hoegaarden Witbier", abv: 4.9 },
  { name: "Holsten Pilsener", abv: 4.6 },
  { name: "Ichnusa Non Filtrata", abv: 5.0 },
  { name: "Innis & Gunn Original", abv: 6.6 },
  { name: "Innis & Gunn Rum Finish", abv: 7.4 },
  { name: "Itaipava Pilsen", abv: 4.5 },
  { name: "James Boag Premium Lager", abv: 5.0 },
  { name: "Jever Fun", abv: 2.5 },
  { name: "Jever Fun Lemon", abv: 2.5 },
  { name: "Jever Pilsener", abv: 4.9 },
  { name: "John Smith's Extra Smooth", abv: 3.6 },
  { name: "Jupiler Blue", abv: 5.2 },
  { name: "Jupiler Lager", abv: 5.2 },
  { name: "Jämtlands Hell", abv: 5.0 },
  { name: "Jämtlands Porter", abv: 5.2 },
  { name: "Kaiser Bier", abv: 5.0 },
  { name: "Kasteel Blond", abv: 7.0 },
  { name: "Kasteel Donker", abv: 11.0 },
  { name: "Kasteel Rouge", abv: 8.0 },
  { name: "Kilkenny Irish Cream Ale", abv: 4.3 },
  { name: "Kingfisher Premium", abv: 4.8 },
  { name: "Kirin Ichiban", abv: 5.0 },
  { name: "Kirin Ichiban Shibori", abv: 5.0 },
  { name: "Kirin Lager", abv: 5.0 },
  { name: "Kirin Light", abv: 3.3 },
  { name: "Kozel 11° Medium", abv: 4.6 },
  { name: "Kozel Dark", abv: 3.8 },
  { name: "Kozel Premium", abv: 4.6 },
  { name: "Kozel Černý", abv: 3.8 },
  { name: "Krombacher Dark", abv: 4.8 },
  { name: "Krombacher Pils", abv: 4.8 },
  { name: "Krombacher Weizen", abv: 5.3 },
  { name: "La Chouffe Blonde", abv: 8.0 },
  { name: "La Chouffe Houblon Dobbelen IPA Tripel", abv: 9.0 },
  { name: "La Chouffe Mc Chouffe", abv: 8.0 },
  { name: "La Chouffe Mc Chouffe Scotch", abv: 8.0 },
  { name: "La Trappe Isid'or", abv: 7.5 },
  { name: "La Trappe Isid'or Oak", abv: 8.0 },
  { name: "La Trappe Quadrupel", abv: 10.0 },
  { name: "La Trappe Tripel", abv: 8.0 },
  { name: "Lagunitas Brown Shugga", abv: 10.0 },
  { name: "Lagunitas DayTime IPA", abv: 4.0 },
  { name: "Lagunitas IPA", abv: 6.2 },
  { name: "Lagunitas Sucks", abv: 8.0 },
  { name: "Lagunitas Super Cluster", abv: 8.0 },
  { name: "Laoshan Beer", abv: 4.7 },
  { name: "Lech Pils", abv: 5.2 },
  { name: "Lech Premium", abv: 5.2 },
  { name: "Leffe Blonde", abv: 6.6 },
  { name: "Leffe Brune", abv: 6.5 },
  { name: "Leffe Rituel 9°", abv: 9.0 },
  { name: "Leffe Ruby", abv: 5.0 },
  { name: "Leffe Tripel", abv: 8.5 },
  { name: "Left Hand 400 Pound Monkey IPA", abv: 6.8 },
  { name: "Left Hand Milk Stout", abv: 6.0 },
  { name: "Left Hand Nitro Milk Stout", abv: 6.0 },
  { name: "Left Hand Sawtooth Ale", abv: 5.3 },
  { name: "Left Hand Wake Up Dead", abv: 10.2 },
  { name: "Lindemans Apple", abv: 3.5 },
  { name: "Lindemans Framboise", abv: 2.5 },
  { name: "Lindemans Gueuze", abv: 5.0 },
  { name: "Lindemans Kriek", abv: 4.0 },
  { name: "Lindemans Pêche", abv: 2.5 },
  { name: "Little Creatures Pale Ale", abv: 5.2 },
  { name: "Little Creatures Rogers", abv: 3.8 },
  { name: "London Fields Hackney Hopster", abv: 4.2 },
  { name: "London Pride Bottle", abv: 4.1 },
  { name: "Lone Star Beer", abv: 4.65 },
  { name: "Lonestar Lager", abv: 4.65 },
  { name: "Löwenbräu Oktoberfestbier", abv: 6.1 },
  { name: "Löwenbräu Original", abv: 5.4 },
  { name: "Maes Pils", abv: 5.2 },
  { name: "Mahou Cinco Estrellas", abv: 5.5 },
  { name: "Mahou Maestra", abv: 7.5 },
  { name: "Mahou Maestra Dunkel", abv: 7.5 },
  { name: "Mariestads Continental", abv: 4.2 },
  { name: "Mariestads Export", abv: 5.3 },
  { name: "Mariestads Old Ox", abv: 7.2 },
  { name: "Marston's Pedigree", abv: 4.5 },
  { name: "McEwan's Champion", abv: 7.3 },
  { name: "Meantime IPA", abv: 7.4 },
  { name: "Meantime London Lager", abv: 4.5 },
  { name: "Melleruds Utmärkta Pilsner", abv: 4.5 },
  { name: "Menabrea Ambrata", abv: 5.0 },
  { name: "Messina Birra", abv: 4.7 },
  { name: "Mikkeller Beer Geek Breakfast", abv: 7.5 },
  { name: "Mikkeller Henry & His Science", abv: 0.3 },
  { name: "Mikkeller Single Hop IPA", abv: 6.9 },
  { name: "Mikkeller Spontanale", abv: 7.7 },
  { name: "Mikkeller Spontanframboos", abv: 7.7 },
  { name: "Mikkeller Waves IPA", abv: 6.0 },
  { name: "Miller Genuine Draft", abv: 4.7 },
  { name: "Miller High Life", abv: 4.6 },
  { name: "Miller Lite", abv: 4.2 },
  { name: "Modelo Chelada", abv: 3.5 },
  { name: "Modelo Chelada Limón y Sal", abv: 3.5 },
  { name: "Modelo Doble Malta", abv: 5.5 },
  { name: "Modelo Especial", abv: 4.5 },
  { name: "Modelo Negra", abv: 5.4 },
  { name: "Moretti La Rossa", abv: 7.2 },
  { name: "Mort Subite Gueuze", abv: 4.5 },
  { name: "Mort Subite Kriek", abv: 4.5 },
  { name: "Murauer Märzen", abv: 5.2 },
  { name: "Murphy's Irish Stout", abv: 4.0 },
  { name: "Mythos Lager", abv: 5.0 },
  { name: "Narragansett Lager", abv: 5.0 },
  { name: "Natural Light Lager", abv: 4.2 },
  { name: "Negra Modelo Munich Dunkel", abv: 5.4 },
  { name: "New Belgium 1554", abv: 5.6 },
  { name: "New Belgium Fat Tire", abv: 5.2 },
  { name: "New Belgium Fat Tire Amber", abv: 5.2 },
  { name: "New Belgium Sunshine Wheat", abv: 4.8 },
  { name: "New Belgium Trippel", abv: 8.5 },
  { name: "New Belgium Voodoo Ranger IPA", abv: 7.0 },
  { name: "Newcastle Brown Ale", abv: 4.7 },
  { name: "Norrlands Guld Export", abv: 5.3 },
  { name: "Norrlands Guld Export 5.3", abv: 5.3 },
  { name: "Norrlands Guld Ljus", abv: 4.7 },
  { name: "Northern Monk Faith", abv: 5.4 },
  { name: "Northern Monk New World IPA", abv: 6.2 },
  { name: "Nya Carnegie IPA", abv: 6.5 },
  { name: "Nya Carnegie Lager", abv: 5.0 },
  { name: "O'Hara's Irish Red", abv: 4.3 },
  { name: "O'Hara's Leann Folláin", abv: 6.0 },
  { name: "Odell 5 Barrel Pale Ale", abv: 5.2 },
  { name: "Odell 90 Shilling", abv: 5.3 },
  { name: "Odell Cutthroat Porter", abv: 5.1 },
  { name: "Odell IPA", abv: 7.0 },
  { name: "Odell Myrcenary DIPA", abv: 9.3 },
  { name: "Okocim Mocne", abv: 7.0 },
  { name: "Old Speckled Hen Ale", abv: 5.0 },
  { name: "Omnipollo Aniara", abv: 6.0 },
  { name: "Omnipollo Bianca", abv: 6.0 },
  { name: "Omnipollo Fatamorgana", abv: 8.0 },
  { name: "Omnipollo Nebuchadnezzar", abv: 8.5 },
  { name: "Omnipollo Noa Pecan Mud Stout", abv: 11.0 },
  { name: "Omnipollo Yellow Belly", abv: 11.0 },
  { name: "Omnipollo Zodiak IPA", abv: 6.2 },
  { name: "Oppigårds Golden Ale", abv: 5.2 },
  { name: "Oppigårds Winter Ale", abv: 6.5 },
  { name: "Orval Trappist Ale", abv: 6.2 },
  { name: "Orval Vert", abv: 6.2 },
  { name: "Orval Verte", abv: 6.2 },
  { name: "Oskar Blues BA Ten FIDY", abv: 12.9 },
  { name: "Oskar Blues Dale's Pale Ale", abv: 6.5 },
  { name: "Oskar Blues G'Knight", abv: 8.7 },
  { name: "Oskar Blues IPA", abv: 6.43 },
  { name: "Oskar Blues Old Chub", abv: 8.0 },
  { name: "Oskar Blues Ten FIDY", abv: 10.5 },
  { name: "Ottakringer Helles", abv: 5.3 },
  { name: "Pabst Blue Ribbon Lager", abv: 4.74 },
  { name: "Pacifico Clara", abv: 4.5 },
  { name: "Pacifico Clara Light", abv: 4.0 },
  { name: "Pacifico Suave", abv: 4.5 },
  { name: "Palm Amber", abv: 5.4 },
  { name: "Paulaner Hefe-Weissbier", abv: 5.5 },
  { name: "Paulaner Oktoberfest", abv: 6.0 },
  { name: "Paulaner Oktoberfest Wiesn", abv: 6.0 },
  { name: "Paulaner Salvator", abv: 7.9 },
  { name: "Paulaner Salvator Doppelbock", abv: 7.9 },
  { name: "Paulaner Weissbier Dunkel", abv: 5.3 },
  { name: "Pauwel Kwak Amber", abv: 8.4 },
  { name: "Peroni Cruda", abv: 5.1 },
  { name: "Peroni Leggera", abv: 3.5 },
  { name: "Peroni Nastro Azzurro", abv: 5.1 },
  { name: "Peroni Original", abv: 4.7 },
  { name: "Pilsen Callao Lager", abv: 5.0 },
  { name: "Pilsner Urquell Nefiltrovaný", abv: 4.4 },
  { name: "Pilsner Urquell Original", abv: 4.4 },
  { name: "Pilsner Urquell Tanková", abv: 4.4 },
  { name: "Polly's Brew IPA", abv: 6.5 },
  { name: "Poppels Double IPA", abv: 8.0 },
  { name: "Poppels IPA", abv: 6.5 },
  { name: "Poppels NEIPA", abv: 6.5 },
  { name: "Poppels Pils", abv: 5.0 },
  { name: "Poppels Session IPA", abv: 4.5 },
  { name: "Poppels West Coast IPA", abv: 6.8 },
  { name: "Pripps Blå", abv: 5.0 },
  { name: "Pripps Blå Extra Stark", abv: 7.2 },
  { name: "Quilmes Cristal", abv: 4.9 },
  { name: "Quilmes Stout", abv: 4.9 },
  { name: "Radeberger Pilsner", abv: 4.8 },
  { name: "Red Horse Extra Strong", abv: 6.9 },
  { name: "Rince Cochon Blonde", abv: 8.5 },
  { name: "Rochefort 10", abv: 11.3 },
  { name: "Rochefort 6", abv: 7.5 },
  { name: "Rochefort 8", abv: 9.2 },
  { name: "Rochefort Triple", abv: 8.1 },
  { name: "Rochefort Triple Extra", abv: 8.1 },
  { name: "Rodenbach Caractère Rouge", abv: 7.0 },
  { name: "Rodenbach Grand Cru", abv: 6.0 },
  { name: "Rodenbach Original", abv: 5.2 },
  { name: "Rolling Rock Extra Pale", abv: 4.5 },
  { name: "Rothaus Pils", abv: 5.1 },
  { name: "Rothaus Tannenzäpfle", abv: 5.1 },
  { name: "Rothaus Weizen", abv: 5.4 },
  { name: "Ruddles County", abv: 4.3 },
  { name: "Sagres Original", abv: 5.0 },
  { name: "Sam Smith's Nut Brown Ale", abv: 5.0 },
  { name: "Sam Smith's Oatmeal Stout", abv: 5.0 },
  { name: "Sam Smith's Organic Lager", abv: 5.0 },
  { name: "Sam Smith's Taddy Porter", abv: 5.0 },
  { name: "Samuel Adams Boston Lager", abv: 5.0 },
  { name: "Samuel Adams Cold Snap", abv: 5.3 },
  { name: "Samuel Adams OctoberFest", abv: 5.3 },
  { name: "Samuel Adams Rebel IPA", abv: 6.5 },
  { name: "Samuel Adams Triple Bock", abv: 17.0 },
  { name: "Samuel Adams Utopias", abv: 28.0 },
  { name: "Samuel Adams Winter Lager", abv: 5.6 },
  { name: "San Miguel Cerveza Negra", abv: 5.0 },
  { name: "San Miguel Especial", abv: 5.4 },
  { name: "San Miguel Light", abv: 5.0 },
  { name: "San Miguel Negra", abv: 5.0 },
  { name: "San Miguel Pale Pilsen", abv: 5.0 },
  { name: "Sapporo Black Label", abv: 5.0 },
  { name: "Sapporo Premium", abv: 4.9 },
  { name: "Sapporo Premium Black", abv: 5.0 },
  { name: "Sapporo Yebisu", abv: 5.0 },
  { name: "Schneider Aventinus Eisbock", abv: 12.0 },
  { name: "Schneider Tap 5 Meine Hopfenweisse", abv: 8.2 },
  { name: "Schneider Weisse Tap 6 Aventinus", abv: 8.2 },
  { name: "Schneider Weisse Tap 7 Original", abv: 5.4 },
  { name: "Schöfferhofer Grapefruit", abv: 2.5 },
  { name: "1664 Blanc", abv: 5.0 },
  { name: "1664 Lager", abv: 5.0 },
  { name: "Kronenbourg 1664", abv: 5.0 },
  { name: "Meteor Blanche", abv: 5.0 },
  { name: "Staropramen", abv: 5.0 },
  { name: "Staropramen Granát", abv: 5.2 },
  { name: "Zlatopramen", abv: 5.0 },
  { name: "Zlatopramen Světlý ležák", abv: 5.0 },
];

const BEERS_SORTED = [...BEER_DB].sort((a, b) =>
  a.name.localeCompare(b.name, "sv", { sensitivity: "base" })
);

/** One search row per beer × serving (list pick adds that drink in one tap). */
const BEER_LIST_SERVING_SIZES_CL = [20, 33, 40, 50];

function expandBeerSearchRows(baseBeers) {
  const out = [];
  for (const b of baseBeers) {
    for (const cl of BEER_LIST_SERVING_SIZES_CL) {
      out.push({ name: b.name, abv: b.abv, cl });
    }
  }
  out.sort((a, b) => {
    const cmp = a.name.localeCompare(b.name, "sv", { sensitivity: "base" });
    if (cmp !== 0) return cmp;
    return a.cl - b.cl;
  });
  return out;
}

function formatBeerSearchResultLine(beer) {
  const pure = pureAlcoholClFromServing(beer.abv, beer.cl);
  const pureStr = pure.toFixed(2).replace(".", ",");
  return `${escapeHtml(beer.name)} · ${formatAbvComma(beer.abv)}% · ${beer.cl} cl (${pureStr} cl)`;
}

/** Same bands as preset grid / title: if you log this pure cl now, ok / ≤2 cl over / worse. */
function paceEmojiIfLoggedNow(drank, allowedEffective, pureCl) {
  const after = drank + pureCl;
  if (after <= allowedEffective + 0.001) return "\u{1F60E}"; /* SMILING FACE WITH SUNGLASSES */
  if (after - allowedEffective <= PRESET_OVER_WARN_MAX_CL + 0.001) return "\u{1F610}"; /* NEUTRAL FACE */
  return "\u{1F621}"; /* POUTING FACE */
}

/** Local calendar date (YYYY-MM-DD). Matches “today” for the user; avoids UTC midnight surprises from `toISOString()`. */
function today() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function parseStoredData(raw) {
  if (raw == null || raw === "") return null;
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

/** Prefer localStorage; fall back to sessionStorage (helps when sandboxes e.g. CodePen evict one store). */
function readPersistedData() {
  let data = parseStoredData(localStorage.getItem(KEY));
  if (data) return data;
  data = parseStoredData(sessionStorage.getItem(KEY));
  return data || {};
}

function isSyntheticLogEntry(e) {
  return Boolean(e && (e.kind === "start" || e.kind === "accrual_paused"));
}

function inferSessionDateFromLog(log) {
  let bestTs = -Infinity;
  let bestDate = null;
  for (const e of log) {
    if (!e || isSyntheticLogEntry(e)) continue;
    const ts = typeof e.ts === "number" && Number.isFinite(e.ts) ? e.ts : null;
    const d = e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null;
    if (ts != null && d && ts >= bestTs) {
      bestTs = ts;
      bestDate = d;
    }
  }
  return bestDate || today();
}

function nowTime() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function parseAtDateTime(dateYmd, hhmm) {
  if (!dateYmd || typeof dateYmd !== "string") return Date.now();
  if (!hhmm || typeof hhmm !== "string") return Date.now();
  const parts = hhmm.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Date.now();
  const [y, mo, d] = dateYmd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return Date.now();
  return new Date(y, mo - 1, d, h, m, 0, 0).getTime();
}

function migrateLogEntries(data) {
  const log = data.log;
  const sessionDay = data.date || today();
  let changed = false;
  for (const entry of log) {
    if (!entry.date || typeof entry.date !== "string") {
      entry.date = sessionDay;
      changed = true;
    }
    if (typeof entry.ts !== "number" || !Number.isFinite(entry.ts)) {
      entry.ts = parseAtDateTime(entry.date, entry.time);
      changed = true;
    }
  }
  return changed;
}

function sortLogByTsDesc(log) {
  log.sort((a, b) => {
    const ta = typeof a.ts === "number" && Number.isFinite(a.ts) ? a.ts : 0;
    const tb = typeof b.ts === "number" && Number.isFinite(b.ts) ? b.ts : 0;
    return tb - ta;
  });
}

/** Newest first by time; bump ts when tied so order is strict. Returns true if log order or any ts changed. */
function sortLogNewestFirst(log) {
  if (log.length === 0) return false;
  let changed = false;
  const tsOrderBefore = log.map((e) => e.ts);
  sortLogByTsDesc(log);
  const tsOrderAfter = log.map((e) => e.ts);
  if (
    tsOrderBefore.length !== tsOrderAfter.length ||
    tsOrderBefore.some((t, i) => t !== tsOrderAfter[i])
  ) {
    changed = true;
  }
  let bumped = true;
  while (bumped) {
    bumped = false;
    for (let i = 0; i < log.length - 1; i++) {
      if (log[i].ts <= log[i + 1].ts) {
        log[i].ts = log[i + 1].ts + 1;
        bumped = true;
        changed = true;
      }
    }
  }
  return changed;
}

function formatEntryWhenForDisplay(entry) {
  const d = entry.date || today();
  const t = normalizeTimeForTimeInput(entry.time || "") || String(entry.time || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return [d, t].filter(Boolean).join(" ");
  }
  return t ? `${d} ${t}` : d;
}

function isDateTimeStrictlyInFuture(dateYmd, hhmm) {
  return parseAtDateTime(dateYmd, hhmm) > Date.now();
}

/** Removes legacy synthetic “Start” rows. Allowed pace is measured from the first real drink timestamp. */
function syncSessionStartEntry(data) {
  const log = data.log;
  let changed = false;
  const startIndices = [];
  for (let i = 0; i < log.length; i++) {
    if (log[i].kind === "start") startIndices.push(i);
  }
  for (let k = startIndices.length - 1; k >= 0; k--) {
    log.splice(startIndices[k], 1);
    changed = true;
  }
  return changed;
}

function getFirstDrinkTimestamp(log) {
  if (!log.length) return null;
  let min = Infinity;
  for (const e of log) {
    if (isSyntheticLogEntry(e)) continue;
    if (typeof e.ts === "number" && Number.isFinite(e.ts)) min = Math.min(min, e.ts);
  }
  return min === Infinity ? null : min;
}

function tsToLocalDateAndTime(ms) {
  const d = new Date(ms);
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  };
}

/** Full [ts, ts + W] intervals for real drinks (merged for gap / pause detection); W = accrual window span. */
function getMergedRawAccrualIntervals(log, data) {
  const W = getAccrualWindowSpanMs(data);
  const intervals = [];
  for (const e of log) {
    if (isSyntheticLogEntry(e)) continue;
    if (typeof e.ts !== "number" || !Number.isFinite(e.ts)) continue;
    intervals.push([e.ts, e.ts + W]);
  }
  if (intervals.length === 0) return [];
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  let cs = intervals[0][0];
  let ce = intervals[0][1];
  for (let i = 1; i < intervals.length; i++) {
    const s = intervals[i][0];
    const e = intervals[i][1];
    if (s <= ce) ce = Math.max(ce, e);
    else {
      merged.push([cs, ce]);
      cs = s;
      ce = e;
    }
  }
  merged.push([cs, ce]);
  return merged;
}

/** If allowed is not accruing at nowMs, ms when the current pause began; else null. */
function getActiveAccrualPauseSinceMs(log, data, nowMs) {
  const merged = getMergedRawAccrualIntervals(log, data);
  if (!merged.length) return null;
  for (const [a, b] of merged) {
    if (nowMs >= a && nowMs <= b) return null;
  }
  let best = null;
  for (const [, b] of merged) {
    if (b < nowMs && (best === null || b > best)) best = b;
  }
  return best;
}

/** Appends one log line when accrual has stopped after the accrual window past the last active interval. */
function syncAccrualPauseLogEntry(data, nowMs = Date.now()) {
  if (getFirstDrinkTimestamp(data.log) == null) return false;
  const pauseSince = getActiveAccrualPauseSinceMs(data.log, data, nowMs);
  if (pauseSince === null) return false;
  if (data.log.some((e) => e.kind === "accrual_paused" && e.pauseSinceMs === pauseSince)) return false;
  const { date, time } = tsToLocalDateAndTime(pauseSince);
  data.log.push({
    kind: "accrual_paused",
    pauseSinceMs: pauseSince,
    date,
    time,
    ts: pauseSince,
    beerName: "",
    abv: 0,
    cl: 0,
    label: "Allowed pace paused — log a drink to continue"
  });
  return true;
}

/** Length of merged [ts, ts + W] ∩ (-∞, now] over all drinks; accrual only inside these windows. */
function getActiveAccrualWindowMs(log, data, nowMs) {
  const W = getAccrualWindowSpanMs(data);
  const intervals = [];
  for (const e of log) {
    if (isSyntheticLogEntry(e)) continue;
    if (typeof e.ts !== "number" || !Number.isFinite(e.ts)) continue;
    const end = Math.min(nowMs, e.ts + W);
    if (end <= e.ts) continue;
    intervals.push([e.ts, end]);
  }
  if (intervals.length === 0) return 0;
  intervals.sort((a, b) => a[0] - b[0]);
  let curL = intervals[0][0];
  let curR = intervals[0][1];
  let sum = 0;
  for (let i = 1; i < intervals.length; i++) {
    const L = intervals[i][0];
    const R = intervals[i][1];
    if (L <= curR) {
      curR = Math.max(curR, R);
    } else {
      sum += curR - curL;
      curL = L;
      curR = R;
    }
  }
  sum += curR - curL;
  return sum;
}

function getAllowedPureAlcoholCl(log, data, nowMs = Date.now()) {
  if (getFirstDrinkTimestamp(log) == null) return 0;
  const windowMs = getActiveAccrualWindowMs(log, data, nowMs);
  return INITIAL_ALLOWANCE_PURE_CL + windowMs * allowanceClPerMsFromData(data);
}

function defaultSelectedBeer() {
  return { name: "", abv: null };
}

function load() {
  let data = readPersistedData();

  if (!Array.isArray(data.log)) data.log = [];
  if (!data.selectedBeer) data.selectedBeer = defaultSelectedBeer();

  let dirty = false;
  if (!Array.isArray(data.missingBeers)) {
    data.missingBeers = [];
    dirty = true;
  }

  if (!data.date || typeof data.date !== "string") {
    data.date = data.log.length > 0 ? inferSessionDateFromLog(data.log) : today();
    dirty = true;
  }

  if (migrateLogEntries(data)) dirty = true;
  const refRaw =
    normalizeReferencePeriodMinutes(data.referencePeriodMinutes) ?? DEFAULT_REFERENCE_PERIOD_MINUTES;
  const refSnapped = snapReferencePeriodToPickerChoice(refRaw);
  if (data.referencePeriodMinutes !== refSnapped) {
    data.referencePeriodMinutes = refSnapped;
    dirty = true;
  }
  if (sortLogNewestFirst(data.log)) dirty = true;
  if (syncSessionStartEntry(data)) {
    dirty = true;
    sortLogNewestFirst(data.log);
  }
  if (syncAccrualPauseLogEntry(data)) {
    dirty = true;
    sortLogNewestFirst(data.log);
  }
  if (dirty) save(data);

  return data;
}

function save(data) {
  if (Array.isArray(data.log) && data.log.length > 0) {
    data.date = today();
  } else if (!data.date) {
    data.date = today();
  }
  const s = JSON.stringify(data);
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* quota / blocked */
  }
  try {
    sessionStorage.setItem(KEY, s);
  } catch {
    /* private mode / blocked */
  }
}

function tryRequestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  navigator.storage.persist().catch(() => {});
}

function searchBeers(query) {
  const q = query.trim().toLowerCase();
  const base = !q ? BEERS_SORTED : BEERS_SORTED.filter((b) => b.name.toLowerCase().includes(q));
  return expandBeerSearchRows(base);
}

function renderResults(results) {
  const el = document.getElementById("searchResults");
  if (!results.length) {
    el.innerHTML = "";
    return;
  }

  const data = load();
  const drank = getPureAlcoholCl(data.log);
  const allowedEffective =
    getFirstDrinkTimestamp(data.log) == null ? Infinity : getAllowedPureAlcoholCl(data.log, data);

  el.innerHTML = results
    .map((beer, idx) => {
      const pure = pureAlcoholClFromServing(beer.abv, beer.cl);
      const face = paceEmojiIfLoggedNow(drank, allowedEffective, pure);
      return `<button type="button" class="result-item" data-index="${idx}"><span class="result-item-pace" aria-hidden="true">${face}</span> ${formatBeerSearchResultLine(beer)}</button>`;
    })
    .join("");

  Array.from(el.querySelectorAll(".result-item")).forEach((item, idx) => {
    item.addEventListener("mousedown", (e) => e.preventDefault());
    item.addEventListener("click", () => addBeerFromDatabaseChoice(results[idx]));
  });
}

function hasCustomBeer(data) {
  return Boolean(data.selectedBeer.name && data.selectedBeer.abv !== null);
}

function beerSearchDisplayLine(name, abv) {
  return `${name} · ${abv.toFixed(1)}%`;
}

/** When the field shows the canonical selected line, treat filter query as empty (full list). */
function beerSearchQueryForFilter(raw) {
  const trimmed = raw.trim();
  const data = load();
  if (hasCustomBeer(data)) {
    const canonical = beerSearchDisplayLine(data.selectedBeer.name, data.selectedBeer.abv);
    if (trimmed === canonical) return "";
  }
  return trimmed;
}

function syncBeerSearchClearVisibility() {
  const clearBtn = document.getElementById("beerSearchClear");
  const addBtn = document.getElementById("beerSearchAdd");
  const searchEl = document.getElementById("beerSearch");
  if (!searchEl) return;
  const data = load();
  const hasText = searchEl.value.trim().length > 0;
  const show = hasText || hasCustomBeer(data);
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", !show);
    clearBtn.setAttribute("aria-hidden", String(!show));
  }
  if (addBtn) {
    addBtn.classList.toggle("hidden", !show);
    addBtn.setAttribute("aria-hidden", String(!show));
  }
}

function clearBeerSearchField() {
  const data = load();
  if (hasCustomBeer(data)) {
    clearSelectedBeer();
  } else {
    document.getElementById("beerSearch").value = "";
    renderResults([]);
    syncBeerSearchClearVisibility();
  }
}

function addBeerFromDatabaseChoice(beer) {
  const data = load();
  const label = labelForSpecificBeer(beer.name, beer.abv, beer.cl);
  data.log.push({
    date: today(),
    time: nowTime(),
    ts: Date.now(),
    beerName: beer.name,
    abv: beer.abv,
    cl: beer.cl,
    label
  });
  data.selectedBeer = defaultSelectedBeer();
  syncSessionStartEntry(data);
  sortLogNewestFirst(data.log);
  save(data);
  document.getElementById("beerSearch").value = "";
  renderResults([]);
  updateModeUI();
  updateSelectedBeerUI();
  render();
}

function clearSelectedBeer() {
  const data = load();
  data.selectedBeer = defaultSelectedBeer();
  save(data);
  document.getElementById("beerSearch").value = "";
  renderResults([]);
  updateModeUI();
  updateSelectedBeerUI();
}

function updateModeUI() {
  const data = load();
  const custom = hasCustomBeer(data);
  document.getElementById("drinkMatrix").classList.toggle("hidden", custom);
  const panel = document.getElementById("volumePanel");
  panel.classList.toggle("hidden", !custom);
  panel.setAttribute("aria-hidden", String(!custom));
}

function updateSelectedBeerUI() {
  const data = load();
  const hint = document.getElementById("volumeHint");
  const search = document.getElementById("beerSearch");

  if (!data.selectedBeer.name) {
    if (hint) hint.textContent = "Tap a serving size to add";
  } else {
    search.value = beerSearchDisplayLine(data.selectedBeer.name, data.selectedBeer.abv);
    if (hint) {
      hint.textContent = `Add ${data.selectedBeer.name} — tap serving size`;
    }
  }
  syncBeerSearchClearVisibility();
}

function addDrink(defaultKey) {
  const data = load();
  if (hasCustomBeer(data)) return;

  const base = DEFAULT_DRINKS[defaultKey];
  const label = base.label;

  data.log.push({
    date: today(),
    time: nowTime(),
    ts: Date.now(),
    beerName: "",
    abv: base.abv,
    cl: base.cl,
    label: label
  });

  syncSessionStartEntry(data);
  sortLogNewestFirst(data.log);
  save(data);
  render();
}

function addCustomDrink(cl) {
  const data = load();
  if (!hasCustomBeer(data)) return;

  const { name, abv } = data.selectedBeer;
  const label = labelForSpecificBeer(name, abv, cl);

  data.log.push({
    date: today(),
    time: nowTime(),
    ts: Date.now(),
    beerName: name,
    abv: abv,
    cl: cl,
    label: label
  });

  data.selectedBeer = defaultSelectedBeer();
  syncSessionStartEntry(data);
  sortLogNewestFirst(data.log);
  save(data);

  document.getElementById("beerSearch").value = "";
  renderResults([]);
  render();
}

function undoLast() {
  const data = load();
  if (data.log.length > 0) {
    data.log.shift();
    syncSessionStartEntry(data);
    sortLogNewestFirst(data.log);
    save(data);
    render();
  }
}

function resetDay() {
  const data = load();
  data.log = [];
  data.date = today();
  save(data);
  render();
}

function getPureAlcoholCl(log) {
  let total = 0;
  log.forEach((entry) => {
    if (isSyntheticLogEntry(entry)) return;
    total += entry.cl * (entry.abv / 100);
  });
  return total;
}

/** One 🍺 per 2 cl pure (half-up round): 0,9→0, 1→1, 2,75→1, 3→2. */
const BEER_EMOJI_PURE_CL_PER_UNIT = 2;
const BEER_EMOJI_TALLY_MAX_VISIBLE = 40;

function updateBeerEmojiTally(data) {
  const el = document.getElementById("beerEmojiTally");
  if (!el) return;
  const pure = getPureAlcoholCl(data.log);
  const n = Math.max(0, Math.round(pure / BEER_EMOJI_PURE_CL_PER_UNIT));
  if (n === 0) {
    el.textContent = "";
    return;
  }
  const show = Math.min(n, BEER_EMOJI_TALLY_MAX_VISIBLE);
  let s = "\u{1F37A}".repeat(show);
  if (n > BEER_EMOJI_TALLY_MAX_VISIBLE) {
    s += ` +${n - BEER_EMOJI_TALLY_MAX_VISIBLE}`;
  }
  el.textContent = s;
}

function labelForSpecificBeer(name, abv, cl) {
  return `${formatAbvComma(abv)}% - ${cl} cl - ${name}`;
}

function rebuildLogLabel(entry) {
  if (entry.beerName) {
    return labelForSpecificBeer(entry.beerName, entry.abv, entry.cl);
  }
  for (const key of Object.keys(DEFAULT_DRINKS)) {
    const d = DEFAULT_DRINKS[key];
    if (Math.abs(d.abv - entry.abv) < 1e-6 && Math.abs(d.cl - entry.cl) < 1e-6) {
      return d.label;
    }
  }
  const abvStr = entry.abv.toFixed(1).replace(".", ",");
  return `${abvStr}% · ${entry.cl} cl`;
}

function normalizeTimeForTimeInput(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return "";
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMissingBeersList() {
  const ul = document.getElementById("missingBeersList");
  if (!ul) return;
  const data = load();
  const items = Array.isArray(data.missingBeers) ? data.missingBeers : [];
  if (items.length === 0) {
    ul.innerHTML = `<li class="missing-beers-empty">No entries yet.</li>`;
    return;
  }
  ul.innerHTML = items.map((name) => `<li>${escapeHtml(name)}</li>`).join("");
}

let beerSearchMissingFeedbackTimer = null;

function showBeerSearchMissingFeedback(msg) {
  const el = document.getElementById("beerSearchMissingFeedback");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  if (beerSearchMissingFeedbackTimer) clearTimeout(beerSearchMissingFeedbackTimer);
  beerSearchMissingFeedbackTimer = setTimeout(() => {
    el.classList.add("hidden");
    el.textContent = "";
    beerSearchMissingFeedbackTimer = null;
  }, 4000);
}

function addMissingBeerFromSearchField() {
  const search = document.getElementById("beerSearch");
  const raw = (search && search.value.trim()) || "";
  if (!raw) {
    showBeerSearchMissingFeedback("Type a beer name in the search field, then tap +.");
    search?.focus();
    return;
  }
  const data = load();
  if (!Array.isArray(data.missingBeers)) data.missingBeers = [];
  data.missingBeers.push(raw);
  save(data);
  renderMissingBeersList();
  if (search) search.value = "";
  renderResults([]);
  syncBeerSearchClearVisibility();
  showBeerSearchMissingFeedback("Added to missing list.");
}

function clearMissingBeersList() {
  const data = load();
  data.missingBeers = [];
  save(data);
  renderMissingBeersList();
}

let logEditIndex = null;
let logEditDrinkKey = null;

function findDefaultDrinkKeyForEntry(entry) {
  if (isSyntheticLogEntry(entry)) return null;
  for (const key of Object.keys(DEFAULT_DRINKS)) {
    const d = DEFAULT_DRINKS[key];
    if (Math.abs(d.abv - entry.abv) < 1e-6 && Math.abs(d.cl - entry.cl) < 1e-6) {
      return key;
    }
  }
  return null;
}

function syncLogEditMatrixSelection() {
  const matrix = document.getElementById("logEditMatrix");
  if (!matrix) return;
  matrix.querySelectorAll("button[data-drink]").forEach((b) => {
    b.classList.toggle("log-edit-matrix-btn--selected", b.getAttribute("data-drink") === logEditDrinkKey);
  });
}

function syncPresetMatrixButtonLabels(data) {
  const d = data ?? load();
  const drank = getPureAlcoholCl(d.log);
  const allowedEffective =
    getFirstDrinkTimestamp(d.log) == null ? Infinity : getAllowedPureAlcoholCl(d.log, d);

  document.querySelectorAll("button[data-drink]").forEach((btn) => {
    const key = btn.getAttribute("data-drink");
    const preset = DEFAULT_DRINKS[key];
    if (!preset) return;
    const span = btn.querySelector("span");
    if (span) span.textContent = defaultPresetDrinkLabel(preset.abv, preset.cl);

    const pure = pureAlcoholClFromServing(preset.abv, preset.cl);
    const after = drank + pure;
    btn.classList.remove("preset-pace--ok", "preset-pace--warn", "preset-pace--bad");
    if (after <= allowedEffective + 0.001) {
      btn.classList.add("preset-pace--ok");
    } else if (after - allowedEffective <= PRESET_OVER_WARN_MAX_CL + 0.001) {
      btn.classList.add("preset-pace--warn");
    } else {
      btn.classList.add("preset-pace--bad");
    }
  });
}

function setLogEditError(msg) {
  const el = document.getElementById("logEditError");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
}

function openLogEditor(index) {
  const data = load();
  const entry = data.log[index];
  if (!entry || isSyntheticLogEntry(entry)) return;

  logEditIndex = index;
  logEditDrinkKey = findDefaultDrinkKeyForEntry(entry);
  setLogEditError("");

  const dateEl = document.getElementById("logEditDate");
  const sessionDay = data.date || today();
  dateEl.value = entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date : sessionDay;
  dateEl.max = today();
  const past = new Date();
  past.setDate(past.getDate() - 60);
  dateEl.min = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}-${String(past.getDate()).padStart(2, "0")}`;

  const timeEl = document.getElementById("logEditTime");
  timeEl.value = normalizeTimeForTimeInput(entry.time);
  syncLogEditMatrixSelection();

  const backdrop = document.getElementById("logEditBackdrop");
  backdrop.classList.remove("hidden");
  backdrop.setAttribute("aria-hidden", "false");
  timeEl.focus();
}

function closeLogEditor() {
  logEditIndex = null;
  logEditDrinkKey = null;
  syncLogEditMatrixSelection();
  setLogEditError("");
  const backdrop = document.getElementById("logEditBackdrop");
  backdrop.classList.add("hidden");
  backdrop.setAttribute("aria-hidden", "true");
}

function saveLogEdit() {
  if (logEditIndex === null) return;
  const data = load();
  const entry = data.log[logEditIndex];
  if (!entry) {
    closeLogEditor();
    return;
  }
  if (isSyntheticLogEntry(entry)) {
    closeLogEditor();
    return;
  }

  const dateVal = document.getElementById("logEditDate").value.trim();
  const timeVal = document.getElementById("logEditTime").value.trim();
  if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    setLogEditError("Set a valid date.");
    return;
  }
  if (!timeVal) {
    setLogEditError("Set a valid time.");
    return;
  }

  if (dateVal > today()) {
    setLogEditError("Date cannot be in the future.");
    return;
  }

  if (isDateTimeStrictlyInFuture(dateVal, timeVal)) {
    setLogEditError("That time is still in the future today.");
    return;
  }

  if (!logEditDrinkKey || !DEFAULT_DRINKS[logEditDrinkKey]) {
    setLogEditError("Choose strength and serving size (same grid as the main counter).");
    return;
  }

  const base = DEFAULT_DRINKS[logEditDrinkKey];
  entry.date = dateVal;
  entry.time = timeVal;
  entry.abv = base.abv;
  entry.cl = base.cl;
  entry.ts = parseAtDateTime(dateVal, timeVal);
  entry.label = rebuildLogLabel(entry);

  sortLogNewestFirst(data.log);
  syncSessionStartEntry(data);
  sortLogNewestFirst(data.log);
  save(data);
  closeLogEditor();
  render();
}

function updateSummary(data) {
  const d = data ?? load();
  if (syncAccrualPauseLogEntry(d)) {
    save(d);
    render();
    return;
  }

  const drank = getPureAlcoholCl(d.log);
  const allowed = getAllowedPureAlcoholCl(d.log, d);
  const diff = drank - allowed;
  let paceClass = "summary--pace-ok";
  let paceFace = "\u{1F60E}"; /* SMILING FACE WITH SUNGLASSES */
  if (diff > REF_BEER_PURE_CL + 0.001) {
    paceClass = "summary--pace-bad";
    paceFace = "\u{1F621}"; /* POUTING FACE */
  } else if (diff > 0.001) {
    paceClass = "summary--pace-warn";
    paceFace = "\u{1F610}"; /* NEUTRAL FACE */
  }

  const headroomCl = allowed - drank;
  let headroomParen;
  if (headroomCl >= -0.005) {
    const h = Math.max(0, headroomCl);
    headroomParen = `(+${h.toFixed(2).replace(".", ",")} cl left)`;
  } else {
    headroomParen = `(${headroomCl.toFixed(2).replace(".", ",")} cl over)`;
  }

  const beersD = drank / REF_BEER_PURE_CL;
  const beersA = allowed / REF_BEER_PURE_CL;
  const headroomBeers = headroomCl / REF_BEER_PURE_CL;
  let headroomBeersParen;
  if (headroomBeers >= -0.005) {
    const b = Math.max(0, headroomBeers);
    headroomBeersParen = `(+${b.toFixed(2).replace(".", ",")} beers left)`;
  } else {
    headroomBeersParen = `(${headroomBeers.toFixed(2).replace(".", ",")} beers over)`;
  }

  const el = document.getElementById("summary");
  if (!el) return;
  el.classList.remove("summary--pace-ok", "summary--pace-warn", "summary--pace-bad");
  el.classList.add(paceClass);
  el.innerHTML = `
    <div class="summary-label">Drank / allowed</div>
    <div class="summary-value summary-value--dark">${drank.toFixed(2).replace(".", ",")} / ${allowed.toFixed(2).replace(".", ",")} cl ${headroomParen}</div>
    <div class="summary-beer-equiv summary-value--dark">≈ ${beersD.toFixed(2).replace(".", ",")} / ${beersA.toFixed(2).replace(".", ",")} beers ${headroomBeersParen}</div>
  `;
  const titleEmoji = document.getElementById("titlePaceEmoji");
  if (titleEmoji) titleEmoji.textContent = paceFace;
  syncPresetMatrixButtonLabels(d);
}

function ensureReferencePeriodSelectOptions() {
  const sel = document.getElementById("referencePeriodInput");
  if (!sel || sel.dataset.optionsBuilt === "1") return;
  sel.dataset.optionsBuilt = "1";
  sel.innerHTML = "";
  for (const m of REFERENCE_PERIOD_CHOICES) {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = `${m} min`;
    sel.appendChild(opt);
  }
}

function applyReferencePeriodFromInput() {
  const input = document.getElementById("referencePeriodInput");
  if (!input) return;
  const v = parseInt(input.value, 10);
  const data = load();
  if (!REFERENCE_PERIOD_CHOICES.includes(v)) {
    input.value = String(getReferencePeriodMinutes(data));
    return;
  }
  data.referencePeriodMinutes = v;
  let dirty = false;
  if (syncSessionStartEntry(data)) {
    dirty = true;
    sortLogNewestFirst(data.log);
  }
  save(data);
  updateSummary(data);
  if (dirty) render();
}

function render() {
  const data = load();
  updateSummary(data);
  updateBeerEmojiTally(data);

  let logHtml = "";
  if (data.log.length === 0) {
    logHtml += `<div class="log-empty">No entries yet.</div>`;
  } else {
    data.log.forEach((entry, idx) => {
      const line = `${escapeHtml(formatEntryWhenForDisplay(entry))} - ${escapeHtml(entry.label)}`;
      if (entry.kind === "start") {
        logHtml += `<div class="log-entry log-entry--start">${line}</div>`;
      } else if (entry.kind === "accrual_paused") {
        logHtml += `<div class="log-entry log-entry--pause">${line}</div>`;
      } else {
        logHtml += `<button type="button" class="log-entry" data-log-index="${idx}">${line}</button>`;
      }
    });
  }

  document.getElementById("log").innerHTML = logHtml;
  const refInput = document.getElementById("referencePeriodInput");
  if (refInput) refInput.value = String(getReferencePeriodMinutes(data));
  syncPresetMatrixButtonLabels(data);
  renderMissingBeersList();
  updateModeUI();
  updateSelectedBeerUI();
}

const beerSearchEl = document.getElementById("beerSearch");
const topbarEl = document.querySelector(".topbar");

function openBeerResults() {
  renderResults(searchBeers(beerSearchQueryForFilter(beerSearchEl.value)));
  syncBeerSearchClearVisibility();
}

beerSearchEl.addEventListener("input", (e) => {
  renderResults(searchBeers(beerSearchQueryForFilter(e.target.value)));
  syncBeerSearchClearVisibility();
});

beerSearchEl.addEventListener("focus", openBeerResults);
beerSearchEl.addEventListener("click", openBeerResults);

document.getElementById("beerSearchAdd").addEventListener("mousedown", (e) => e.preventDefault());
document.getElementById("beerSearchAdd").addEventListener("click", () => {
  addMissingBeerFromSearchField();
});

document.getElementById("beerSearchClear").addEventListener("mousedown", (e) => e.preventDefault());
document.getElementById("beerSearchClear").addEventListener("click", () => {
  clearBeerSearchField();
});

document.addEventListener("pointerdown", (e) => {
  if (topbarEl.contains(e.target)) return;
  renderResults([]);
});

document.getElementById("clearBeerBtn").addEventListener("click", clearSelectedBeer);

document.getElementById("drinkMatrix").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-drink]");
  if (!btn) return;
  addDrink(btn.getAttribute("data-drink"));
});

document.getElementById("volumePanel").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-custom-cl]");
  if (!btn) return;
  const cl = parseFloat(btn.getAttribute("data-custom-cl"), 10);
  if (Number.isFinite(cl)) addCustomDrink(cl);
});

document.getElementById("undoBtn").addEventListener("click", undoLast);
document.getElementById("resetBtn").addEventListener("click", resetDay);

const referencePeriodInput = document.getElementById("referencePeriodInput");
if (referencePeriodInput) {
  referencePeriodInput.addEventListener("change", applyReferencePeriodFromInput);
}

document.getElementById("log").addEventListener("click", (e) => {
  const btn = e.target.closest("button.log-entry[data-log-index]");
  if (!btn) return;
  const idx = parseInt(btn.getAttribute("data-log-index"), 10);
  if (Number.isFinite(idx)) openLogEditor(idx);
});

document.getElementById("logEditBackdrop").addEventListener("click", (e) => {
  if (e.target.id === "logEditBackdrop") closeLogEditor();
});

document.getElementById("logEditCancel").addEventListener("click", closeLogEditor);
document.getElementById("logEditSave").addEventListener("click", saveLogEdit);

document.getElementById("logEditMatrix").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-drink]");
  if (!btn) return;
  logEditDrinkKey = btn.getAttribute("data-drink");
  syncLogEditMatrixSelection();
});

document.getElementById("missingBeersClearBtn").addEventListener("click", clearMissingBeersList);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const backdrop = document.getElementById("logEditBackdrop");
  if (backdrop && !backdrop.classList.contains("hidden")) closeLogEditor();
});

setInterval(() => {
  if (document.visibilityState !== "visible") return;
  updateSummary();
  const sr = document.getElementById("searchResults");
  if (sr && sr.innerHTML.trim() !== "") {
    const inp = document.getElementById("beerSearch");
    if (inp) renderResults(searchBeers(beerSearchQueryForFilter(inp.value)));
  }
}, SUMMARY_REFRESH_MS);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") updateSummary();
});

document.addEventListener("pageshow", (e) => {
  if (e.persisted) render();
});

ensureReferencePeriodSelectOptions();
tryRequestPersistentStorage();
render();
