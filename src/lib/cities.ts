/// Famous Malaysian cities / towns, as [lng, lat] (WGS84), so they can be
/// projected through the same d3 projection as the state boundaries.
export interface City {
  name: string;
  lng: number;
  lat: number;
  /** importance bump for label size */
  major?: boolean;
}

export const CITIES: City[] = [
  { name: "Kuala Lumpur", lng: 101.6869, lat: 3.139, major: true },
  { name: "George Town", lng: 100.3327, lat: 5.4141, major: true },
  { name: "Johor Bahru", lng: 103.7578, lat: 1.4927, major: true },
  { name: "Ipoh", lng: 101.0901, lat: 4.5975 },
  { name: "Kuching", lng: 110.3592, lat: 1.5535, major: true },
  { name: "Kota Kinabalu", lng: 116.0744, lat: 5.9804, major: true },
  { name: "Malacca City", lng: 102.2414, lat: 2.1896 },
  { name: "Alor Setar", lng: 100.3666, lat: 6.124 },
  { name: "Kota Bharu", lng: 102.2386, lat: 6.1256 },
  { name: "Kuantan", lng: 103.326, lat: 3.8077 },
  { name: "Kuala Terengganu", lng: 103.1378, lat: 5.3378 },
  { name: "Miri", lng: 113.9919, lat: 4.4995 },
];
