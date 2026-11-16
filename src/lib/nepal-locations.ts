import divisions from '../data/nepal/municipalities.json';

export const NEPAL_PROVINCES = [
  { code: '1', name: 'Koshi Province', nepali: 'कोशी प्रदेश' },
  { code: '2', name: 'Madhesh Province', nepali: 'मधेश प्रदेश' },
  { code: '3', name: 'Bagmati Province', nepali: 'बागमती प्रदेश' },
  { code: '4', name: 'Gandaki Province', nepali: 'गण्डकी प्रदेश' },
  { code: '5', name: 'Lumbini Province', nepali: 'लुम्बिनी प्रदेश' },
  { code: '6', name: 'Karnali Province', nepali: 'कर्णाली प्रदेश' },
  { code: '7', name: 'Sudurpashchim Province', nepali: 'सुदूरपश्चिम प्रदेश' },
] as const;

export interface NepalLocation {
  id: string;
  value: string;
  name: string;
  nepali: string;
  district: string;
  province: string;
  type: string;
}

export const normalizeLocationSearch = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const normalize = normalizeLocationSearch;
const provinceGroups = Object.values(divisions);
const localLevels = provinceGroups.flatMap(province => province.districts.flatMap(district => district.municipalities.map(location => ({
  province: `${province.province_name_english} Province`, district: district.district_name_english,
  name: location.municipality_name_english, nepali: location.municipality_name_nepali, type: location.type,
}))));
const localNameCounts = new Map<string, number>();
for (const location of localLevels) {
  const key = `${location.province}:${normalize(location.name)}`;
  localNameCounts.set(key, (localNameCounts.get(key) || 0) + 1);
}

const localOptions: NepalLocation[] = localLevels.map((location, index) => {
  const duplicate = (localNameCounts.get(`${location.province}:${normalize(location.name)}`) || 0) > 1;
  return { id: `local-${index}`, value: duplicate ? `${location.name} (${location.district})` : location.name,
    name: location.name, nepali: location.nepali, district: location.district, province: location.province, type: location.type };
});
const districtOptions: NepalLocation[] = provinceGroups.flatMap(province => province.districts.map(district => {
  const provinceName = `${province.province_name_english} Province`;
  const hasNamesake = localNameCounts.has(`${provinceName}:${normalize(district.district_name_english)}`);
  return { id: `district-${provinceName}-${district.district_name_english}`, value: hasNamesake ? `${district.district_name_english} (District)` : district.district_name_english,
    name: district.district_name_english, nepali: district.district_name_nepali, district: district.district_name_english, province: provinceName, type: 'District' };
}));

export const NEPAL_LOCATIONS: NepalLocation[] = [...localOptions, ...districtOptions];

export function provinceByName(value: string) {
  const query = normalize(value).replace(/\s+province$/, '');
  return NEPAL_PROVINCES.find(province => normalize(province.name).replace(/\s+province$/, '') === query);
}

export function locationsForProvince(province: string): NepalLocation[] {
  if (!province.trim()) return NEPAL_LOCATIONS;
  const matched = provinceByName(province);
  return matched ? NEPAL_LOCATIONS.filter(location => location.province === matched.name) : [];
}

export function filterLocationOptions<T extends { title: string; detail?: string; search: string }>(options: T[], search: string): T[] {
  const query = normalize(search);
  return options.filter(option => !query || normalize(option.search).includes(query))
    .sort((a, b) => Number(!normalize(a.title).startsWith(query)) - Number(!normalize(b.title).startsWith(query)) || a.title.localeCompare(b.title) || (a.detail || '').localeCompare(b.detail || ''));
}

export function cityMatchesProvince(city: string, province: string): boolean {
  return locationsForProvince(province).some(location => normalize(location.value) === normalize(city) || normalize(location.name) === normalize(city));
}
